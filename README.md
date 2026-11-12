# CONSTELLATION // AI Compute Command Center

*Every device a star — linked into one constellation.*

A futuristic, TRON-inspired **3D observability dashboard** for GPU infrastructure. Real
devices are collected over SSH/Tailscale and streamed live into holographic machine models
with floating HUDs, an aggregated fleet dashboard, and per-device charts.

**Live demo (simulated):** https://vcruz305.github.io/constellation/
**Self-hosted live app:** serve the frontend from the backend (same origin) or expose it over HTTPS — see [Run it](#run-it).

---

## What it does

- **3D holographic fleet** — translucent, glowing models of NVIDIA DGX Sparks, Mac Minis,
  Mac Studios, and custom GPU servers on a TRON grid, with a central command core and
  animated telemetry links. Orbit / zoom / **drag-and-drop** positioning; click a device for
  a detailed inspector with live charts.
- **Real connectivity** — add unlimited devices over SSH / local IP / Tailscale. Automatic
  Tailscale node discovery. Detects hardware, GPUs, OS, processes, and inference servers.
  Supports Linux, macOS, NVIDIA CUDA, and Apple Silicon.
- **Live inference monitoring** — auto-detects **vLLM, SGLang, llama.cpp, Ollama, MLX, and
  OpenAI-compatible servers (EXL3 / REXL3 / custom)** via real `/v1/models` and Prometheus
  `/metrics` endpoints. Extensible adapter layer.
- **Per-device HUD** — model + engine + endpoint, decode TPS (per-request **and** aggregate),
  prefill TPS, TTFT, active/queued requests, context, KV-cache, GPU/CPU util, VRAM, RAM,
  temperature, power, IP/Tailscale address, ports, uptime, online status.
- **Fleet dashboard** — aggregated GPUs/VRAM, combined throughput, active models, requests,
  power, network traffic, and device health.
- **2–5 s refresh** over WebSocket. **Never fabricates measurements** — unavailable metrics
  render `N/A`. A clearly-labeled **Demo mode** provides a simulated fleet when no backend
  is reachable.

## Architecture

```
frontend/   React + Three.js (react-three-fiber) + postprocessing bloom, Zustand, Recharts
backend/    Python FastAPI + WebSocket, async SSH collectors, modular inference adapters
```

- The **frontend** is a static site (GitHub Pages). The public demo runs a built-in
  **simulated fleet** and never auto-connects to anyone's backend. Self-hosted builds
  (the backend serving the frontend) auto-link to their own origin.
- The **backend** runs on a host with SSH access to your devices. It executes a lightweight
  remote probe (`remote_probe.py`) on each device, parses real system/GPU/inference
  telemetry, computes rates, and broadcasts a fleet frame every 3 s over `/ws`.
- **Credentials stay server-side** (`devices.json`, mode `0600`); the browser only ever sees
  non-sensitive connection metadata. Key material is referenced by path, never copied.

### Data honesty
- Real metrics come only from `nvidia-smi`, `/proc`, `system_profiler`, and live inference
  endpoints. Anything unavailable is `null` → rendered **N/A**.
- Demo devices are flagged `demo: true` and badged **SIMULATED** everywhere.
- Per-request decode TPS is shown separately from aggregate throughput.

## Run it

### Backend
```bash
cd backend
python3 -m venv .venv && . .venv/bin/activate
pip install fastapi "uvicorn[standard]" websockets
./run.sh                      # serves API + WS + built frontend on :8090
```
Add a device (SSH key/agent access must already work from this host):
```bash
curl -X POST localhost:8090/api/devices -H 'Content-Type: application/json' \
  -d '{"name":"gpu-node-01","kind":"auto","connection":{"type":"ssh","host":"gpu-node-01"}}'
```
Or use the in-app **＋ Add Device** dialog (with Tailscale discovery).

### Frontend (dev)
```bash
cd frontend && npm install && npm run dev
```

### Expose over HTTPS (Tailscale)
```bash
tailscale serve --bg 8090     # tailnet-only HTTPS at https://<host>.<tailnet>.ts.net
```
The app is then served same-origin at that URL. For public internet access, enable
Tailscale **Funnel** in the tailnet admin console and `tailscale funnel --bg 8090`.

> GitHub Pages is HTTPS, so the browser blocks a plain `http://<ip>` backend (mixed
> content). Use Tailscale Serve/Funnel (valid certificates) or another HTTPS host.

### Connect the hosted frontend to your backend
The public demo deliberately starts with **no backend prefilled** and shows the simulated
fleet. To monitor your own machines:
1. Run the backend (above) and add your devices server-side.
2. Expose it over HTTPS (Serve/Funnel).
3. In the app, press **⌁ Backend**, paste the HTTPS URL, and **Connect** — or press
   **● Live**, then **Connect Backend** from the empty fleet.

Switching to **Live** with no backend configured shows **"No devices configured"**; it
never presents the simulated fleet as if it were real. SSH keys/credentials stay on the
backend server and are never sent to the browser.

## Deploy to GitHub Pages
```bash
cd frontend && npm run deploy   # builds + pushes dist to gh-pages
```

## Notes
- GB10 / Apple Silicon use **unified memory**, so discrete VRAM is reported `N/A` (honest).
- Inference metrics appear only while a server is actually running; the adapter reads them
  live (e.g. SGLang `gen_throughput`, `num_running_reqs`, KV-cache usage).
