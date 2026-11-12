"""Device collectors. Runs remote_probe.py on each device (SSH or local),
parses REAL telemetry, merges inference adapters, keeps a history ring buffer.
Credentials stay server-side; nothing secret is sent to the browser.
"""
import asyncio, json, os, time
from adapters import RateTracker, parse_inference

HERE = os.path.dirname(os.path.abspath(__file__))
PROBE = open(os.path.join(HERE, "remote_probe.py")).read()
HISTORY_LEN = 150

def detect_kind(probe, configured=None):
    if configured and configured != "auto":
        return configured
    gpus = probe.get("gpus") or []
    names = " ".join(g.get("name", "") for g in gpus).lower()
    if "gb10" in names or "dgx spark" in names:
        return "dgx-spark"
    if probe.get("os") == "Darwin":
        model = (probe.get("cpu_model") or "").lower()
        if "studio" in model: return "mac-studio"
        if "mini" in model: return "mac-mini"
        return "mac-studio"
    if any(g.get("vendor") == "nvidia" for g in gpus):
        return "gpu-server"
    return "generic"

class DeviceRuntime:
    def __init__(self, config):
        self.config = config
        self.id = config["id"]
        self.status = "connecting"
        self.last_error = None
        self.last_seen = None
        self.probe = None
        self.inference = []
        self.kind = config.get("kind", "auto")
        self.rates = RateTracker()
        self.history = []
        self.fail_count = 0

    def ssh_target(self):
        c = self.config.get("connection", {})
        host = c.get("host", "")
        user = c.get("user")
        port = c.get("port", 22)
        key = c.get("key_path")
        args = ["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8",
                "-o", "StrictHostKeyChecking=accept-new", "-o", "ServerAliveInterval=5"]
        if key:
            args += ["-i", os.path.expanduser(key)]
        if port and int(port) != 22:
            args += ["-p", str(port)]
        target = f"{user}@{host}" if user else host
        args += [target, "python3 -"]
        return args

    async def collect(self):
        c = self.config.get("connection", {})
        ctype = c.get("type", "ssh")
        ts = time.time()
        try:
            if ctype == "local":
                proc = await asyncio.create_subprocess_exec(
                    "python3", "-c", PROBE,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            else:
                args = self.ssh_target()
                proc = await asyncio.create_subprocess_exec(
                    *args, stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
            try:
                stdout, stderr = await asyncio.wait_for(
                    proc.communicate(PROBE.encode() if ctype != "local" else None), timeout=25)
            except asyncio.TimeoutError:
                proc.kill()
                raise RuntimeError("collection timed out")
            if proc.returncode != 0:
                raise RuntimeError((stderr.decode()[:200] or f"exit {proc.returncode}").strip())
            probe = json.loads(stdout.decode())
        except Exception as e:
            self.fail_count += 1
            self.status = "offline"
            self.last_error = str(e)[:200]
            return self.snapshot()

        self.fail_count = 0
        self.status = "online"
        self.last_error = None
        self.last_seen = ts
        self.probe = probe
        self.kind = detect_kind(probe, self.config.get("kind"))
        self.inference = parse_inference(probe.get("inference_endpoints"), self.rates, ts)
        self._push_history(ts)
        return self.snapshot()

    def _push_history(self, ts):
        p = self.probe or {}
        gpus = p.get("gpus") or []
        gpu_util = max([g.get("util_pct") or 0 for g in gpus], default=None)
        agg = sum([e["metrics"].get("decode_tps_aggregate") or 0 for e in self.inference]) or None
        self.history.append({
            "t": ts, "cpu": p.get("cpu_util_pct"), "gpu": gpu_util,
            "ram_used": p.get("ram_used_mb"), "throughput": agg,
            "power": sum([g.get("power_w") or 0 for g in gpus]) or None,
            "temp": max([g.get("temp_c") or 0 for g in gpus], default=None),
        })
        if len(self.history) > HISTORY_LEN:
            self.history = self.history[-HISTORY_LEN:]

    def snapshot(self):
        p = self.probe or {}
        c = self.config.get("connection", {})
        gpus = p.get("gpus") or []
        return {
            "id": self.id,
            "name": self.config.get("name") or p.get("hostname") or self.id,
            "kind": self.kind,
            "status": self.status,
            "last_error": self.last_error,
            "last_seen": self.last_seen,
            "demo": False,
            "specs": {
                "hostname": p.get("hostname"), "os": p.get("os_name"),
                "arch": p.get("arch"), "cpu_cores": p.get("cpu_cores"),
                "cpu_model": p.get("cpu_model"),
                "ram_total_mb": p.get("ram_total_mb"),
                "gpus": gpus,
            },
            "metrics": {
                "cpu_util_pct": p.get("cpu_util_pct"),
                "ram_used_mb": p.get("ram_used_mb"),
                "ram_total_mb": p.get("ram_total_mb"),
                "load_avg": p.get("load_avg"),
                "uptime_s": p.get("uptime_s"),
                "net_rx_bps": p.get("net_rx_bps"),
                "net_tx_bps": p.get("net_tx_bps"),
                "gpus": gpus,
            },
            "inference": self.inference,
            "processes": p.get("processes") or [],
            "gpu_processes": p.get("gpu_processes") or [],
            "addresses": {
                "host": c.get("host"), "tailscale": c.get("tailscale_name"),
                "ports": p.get("listening_ports") or [],
            },
            "history": self.history,
        }

class CollectorPool:
    def __init__(self):
        self.devices = {}   # id -> DeviceRuntime
    def sync(self, configs):
        ids = {c["id"] for c in configs}
        for rid in list(self.devices):
            if rid not in ids:
                del self.devices[rid]
        for c in configs:
            if c["id"] not in self.devices:
                self.devices[c["id"]] = DeviceRuntime(c)
            else:
                self.devices[c["id"]].config = c
    async def collect_all(self):
        if not self.devices:
            return []
        results = await asyncio.gather(*[d.collect() for d in self.devices.values()])
        return list(results)
