"""DEMO MODE — a fully simulated fleet, clearly labeled. Used when no backend
devices are configured or the user toggles Demo. Values are synthetic and are
never presented as real measurements (every snapshot carries demo=True).
"""
import math, time, random

def _wave(t, period, phase=0.0, lo=0.0, hi=1.0):
    return lo + (hi - lo) * (0.5 + 0.5 * math.sin(2 * math.pi * (t / period) + phase))

DEMO_DEFS = [
    {"id": "demo-spark-a", "name": "Spark-Alpha", "kind": "dgx-spark",
     "gpu": "NVIDIA GB10", "vram": 128000, "cores": 20, "ram": 128000, "os": "Ubuntu 24.04 (DGX OS)",
     "engine": "sglang", "model": "Qwen3-Next-80B-A3B", "ctx": 32768, "base_tps": 46, "phase": 0.0},
    {"id": "demo-spark-b", "name": "Spark-Beta", "kind": "dgx-spark",
     "gpu": "NVIDIA GB10", "vram": 128000, "cores": 20, "ram": 128000, "os": "Ubuntu 24.04 (DGX OS)",
     "engine": "rexl3", "model": "GLM-4.6-EXL3", "ctx": 16384, "base_tps": 38, "phase": 1.7},
    {"id": "demo-rtx6000", "name": "RTX 6000", "kind": "gpu-server",
     "gpu": "NVIDIA RTX PRO 6000 Blackwell", "vram": 96000, "cores": 64, "ram": 256000, "os": "Ubuntu 24.04",
     "engine": "vllm", "model": "DeepSeek-V3.1", "ctx": 65536, "base_tps": 62, "phase": 3.1},
    {"id": "demo-studio", "name": "Mac-Studio-01", "kind": "mac-studio",
     "gpu": "Apple M3 Ultra (80-core GPU)", "vram": 256000, "cores": 32, "ram": 256000, "os": "macOS 15.5",
     "engine": "mlx", "model": "Llama-3.3-70B-MLX", "ctx": 32768, "base_tps": 24, "phase": 4.4},
    {"id": "demo-mini", "name": "Mac-Mini-02", "kind": "mac-mini",
     "gpu": "Apple M4 Pro (20-core GPU)", "vram": 48000, "cores": 14, "ram": 48000, "os": "macOS 15.5",
     "engine": "ollama", "model": "qwen2.5:14b", "ctx": 8192, "base_tps": 31, "phase": 5.6},
    {"id": "demo-b200", "name": "B200-Cluster", "kind": "gpu-server",
     "gpu": "8x NVIDIA B200", "vram": 1440000, "cores": 208, "ram": 2048000, "os": "Ubuntu 24.04",
     "engine": "sglang", "model": "Kimi-K2", "ctx": 131072, "base_tps": 120, "phase": 2.3},
]

class DemoFleet:
    def __init__(self):
        self.history = {d["id"]: [] for d in DEMO_DEFS}
        self._rng = random.Random(42)

    def snapshot(self):
        t = time.time()
        out = []
        for d in DEMO_DEFS:
            ph = d["phase"]
            load = _wave(t, 23, ph, 0.15, 0.95)             # 0..1 activity
            gpu_util = round(_wave(t, 17, ph, 8, 97) * load + 3, 1)
            running = int(round(_wave(t, 13, ph, 0, 6)))
            agg_tps = round(d["base_tps"] * running * _wave(t, 11, ph, 0.7, 1.2), 1) if running else 0.0
            per_req = round(agg_tps / running, 1) if running else None
            prefill = round(d["base_tps"] * 8 * _wave(t, 19, ph, 0.2, 1.0), 1) if running else 0.0
            kv = round(_wave(t, 29, ph, 5, 88) * (0.4 + 0.6 * load), 1)
            temp = round(_wave(t, 31, ph, 36, 83), 1)
            power = round(_wave(t, 31, ph, 0.12, 0.95) * (300 if d["kind"] == "gpu-server" else 60), 1)
            vram_used = round(d["vram"] * (0.55 + 0.3 * load))
            cpu = round(_wave(t, 15, ph + 1, 4, 72), 1)
            ram_used = round(d["ram"] * (0.2 + 0.4 * load))
            rx = round(_wave(t, 9, ph, 1e5, 9e6)); tx = round(_wave(t, 9, ph + 2, 1e5, 9e6))
            hist = self.history[d["id"]]
            hist.append({"t": t, "cpu": cpu, "gpu": gpu_util, "ram_used": ram_used,
                         "throughput": agg_tps or None, "power": power, "temp": temp})
            if len(hist) > 150: self.history[d["id"]] = hist[-150:]
            out.append({
                "id": d["id"], "name": d["name"], "kind": d["kind"],
                "status": "online", "last_error": None, "last_seen": t, "demo": True,
                "specs": {"hostname": d["name"].lower().replace(" ", "-"), "os": d["os"], "arch": "aarch64" if d["kind"].startswith(("dgx", "mac")) else "x86_64",
                          "cpu_cores": d["cores"], "cpu_model": d["gpu"], "ram_total_mb": d["ram"],
                          "gpus": [{"name": d["gpu"], "util_pct": gpu_util, "vram_used_mb": vram_used,
                                    "vram_total_mb": d["vram"], "temp_c": temp, "power_w": power,
                                    "power_limit_w": 300 if d["kind"] == "gpu-server" else 70,
                                    "driver": "demo", "vendor": "apple" if d["kind"].startswith("mac") else "nvidia"}]},
                "metrics": {"cpu_util_pct": cpu, "ram_used_mb": ram_used, "ram_total_mb": d["ram"],
                            "load_avg": [round(cpu / 12, 2)] * 3, "uptime_s": 360000 + int(t) % 86400,
                            "net_rx_bps": rx, "net_tx_bps": tx,
                            "gpus": [{"name": d["gpu"], "util_pct": gpu_util, "vram_used_mb": vram_used,
                                      "vram_total_mb": d["vram"], "temp_c": temp, "power_w": power}]},
                "inference": [{"engine": d["engine"], "port": 8000, "models": [d["model"]],
                               "max_context": d["ctx"],
                               "metrics": {"decode_tps_per_request": per_req, "decode_tps_aggregate": agg_tps,
                                           "prefill_tps": prefill, "ttft_ms": round(_wave(t, 7, ph, 40, 320), 1) if running else None,
                                           "active_requests": running, "queued_requests": int(_wave(t, 5, ph, 0, 3)),
                                           "concurrency": 16, "kv_cache_pct": kv, "cache_hit_pct": round(_wave(t, 37, ph, 20, 90), 1)}}],
                "processes": [{"pid": 1000 + i, "name": d["engine"], "cpu_pct": round(cpu / 3, 1), "mem_pct": round(20 * load, 1)}],
                "gpu_processes": [{"pid": 1000, "name": d["engine"], "gpu_mem_mb": vram_used}],
                "addresses": {"host": f"100.64.0.{10 + DEMO_DEFS.index(d)}", "tailscale": d["name"].lower().replace(" ", "-") + ".demo.ts.net",
                              "ports": [8000, 22]},
                "history": hist,
            })
        return out
