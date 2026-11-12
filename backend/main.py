"""CONSTELLATION Command Center backend — FastAPI + WebSocket live telemetry.
Streams REAL device metrics collected over SSH/Tailscale. Demo mode is separate
and clearly labeled. Credentials stay server-side.
"""
import asyncio, json, time
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

import store, tailscale, network
from collectors import CollectorPool
from demo import DemoFleet, DEMO_NETWORK

INTERVAL = 3.0            # seconds between collections (2-5s requirement)
pool = CollectorPool()
demo = DemoFleet()
STATE = {"mode": "live", "fleet": {"devices": [], "aggregate": {}, "network": None}, "ts": 0, "network": None}
clients = set()

def aggregate(devices):
    online = [d for d in devices if d["status"] == "online"]
    gpus = [g for d in online for g in d["metrics"].get("gpus", [])]
    inf = [e for d in online for e in d.get("inference", [])]
    models = sorted({m for e in inf for m in e.get("models", [])})
    def s(fn, src):
        vals = [fn(x) for x in src if fn(x) is not None]
        return sum(vals) if vals else None
    return {
        "total_devices": len(devices), "online_devices": len(online),
        "offline_devices": len(devices) - len(online),
        "total_gpus": len(gpus),
        "total_vram_mb": s(lambda g: g.get("vram_total_mb"), gpus),
        "used_vram_mb": s(lambda g: g.get("vram_used_mb"), gpus),
        "aggregate_throughput_tps": s(lambda e: e["metrics"].get("decode_tps_aggregate"), inf),
        "total_active_requests": s(lambda e: e["metrics"].get("active_requests"), inf),
        "active_models": models, "model_count": len(models),
        "avg_gpu_util": round(sum(g.get("util_pct") or 0 for g in gpus) / len(gpus), 1) if gpus else None,
        "total_power_w": s(lambda g: g.get("power_w"), gpus),
        "net_rx_bps": s(lambda d: d["metrics"].get("net_rx_bps"), online),
        "net_tx_bps": s(lambda d: d["metrics"].get("net_tx_bps"), online),
        "engine_count": len(inf),
    }

async def collect_loop():
    while True:
        try:
            if STATE["mode"] == "demo":
                devices = demo.snapshot()
            else:
                configs = [d for d in store.list_devices() if d.get("enabled", True)]
                pool.sync(configs)
                devices = await pool.collect_all()
            STATE["fleet"] = {"devices": devices, "aggregate": aggregate(devices),
                              "mode": STATE["mode"],
                              "network": DEMO_NETWORK if STATE["mode"] == "demo" else STATE.get("network")}
            STATE["ts"] = time.time()
            await broadcast()
        except Exception as e:
            STATE["last_error"] = str(e)[:200]
        await asyncio.sleep(INTERVAL)

async def network_loop():
    # Refresh the core network context (type + internal/external IPs) on a slow
    # loop; the per-frame broadcast just reads the cached result.
    while True:
        try:
            STATE["network"] = await network.detect()
        except Exception:
            pass
        await asyncio.sleep(45)

async def broadcast():
    if not clients:
        return
    msg = json.dumps({"type": "fleet", "ts": STATE["ts"], **STATE["fleet"]})
    dead = []
    for ws in list(clients):
        try:
            await ws.send_text(msg)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

@asynccontextmanager
async def lifespan(app):
    task = asyncio.create_task(collect_loop())
    net_task = asyncio.create_task(network_loop())
    yield
    task.cancel()
    net_task.cancel()

app = FastAPI(title="CONSTELLATION Command Center", lifespan=lifespan)
# allow_private_network: the GitHub Pages (public) origin reaches this backend
# over a private tailnet IP; Chrome's Private Network Access requires opt-in.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://vcruz305.github.io"],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)

@app.get("/api/health")
def health():
    return {"ok": True, "service": "constellation", "mode": STATE["mode"],
            "interval_s": INTERVAL, "devices": len(STATE["fleet"]["devices"]), "ts": STATE["ts"]}

@app.get("/api/fleet")
def fleet():
    return {"ts": STATE["ts"], **STATE["fleet"]}

@app.get("/api/devices")
def devices():
    return [store.public_view(d) for d in store.list_devices()]

class DevicePayload(BaseModel):
    name: Optional[str] = None
    kind: Optional[str] = "auto"
    connection: dict
    enabled: Optional[bool] = True

@app.post("/api/devices")
def add_device(p: DevicePayload):
    d = store.add_device(p.model_dump())
    return store.public_view(d)

@app.patch("/api/devices/{dev_id}")
def update_device(dev_id: str, p: dict):
    d = store.update_device(dev_id, p)
    return store.public_view(d) if d else {"error": "not found"}

@app.delete("/api/devices/{dev_id}")
def delete_device(dev_id: str):
    return {"removed": store.remove_device(dev_id)}

@app.get("/api/tailscale")
async def ts():
    return await tailscale.discover()

class ModePayload(BaseModel):
    mode: str

@app.post("/api/mode")
def set_mode(p: ModePayload):
    if p.mode in ("live", "demo"):
        STATE["mode"] = p.mode
    return {"mode": STATE["mode"]}

@app.websocket("/ws")
async def ws(websocket: WebSocket):
    await websocket.accept()
    clients.add(websocket)
    try:
        await websocket.send_text(json.dumps({"type": "fleet", "ts": STATE["ts"], **STATE["fleet"]}))
        while True:
            # client may send mode toggles / pings
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
                if msg.get("type") == "mode" and msg.get("mode") in ("live", "demo"):
                    STATE["mode"] = msg["mode"]
            except Exception:
                pass
    except WebSocketDisconnect:
        pass
    finally:
        clients.discard(websocket)

# Serve the built frontend same-origin (so the Tailscale HTTPS URL delivers the
# whole app with no CORS / mixed-content issues). Registered after API + WS.
import os
from fastapi.staticfiles import StaticFiles
_DIST = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
if os.path.isdir(_DIST):
    app.mount("/", StaticFiles(directory=_DIST, html=True), name="frontend")
