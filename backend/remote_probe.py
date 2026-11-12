#!/usr/bin/env python3
"""CONSTELLATION remote probe. Runs ON the target device (via `ssh host python3 -`).
Emits a single JSON object of REAL measurements. Anything unavailable is null.
Never fabricates values. Designed to finish in ~3-4s. Works on Linux + macOS.
"""
import json, os, platform, re, socket, subprocess, sys, time

def sh(cmd, timeout=4):
    try:
        p = subprocess.run(cmd, shell=isinstance(cmd, str), capture_output=True, text=True, timeout=timeout)
        return p.stdout.strip()
    except Exception:
        return ""

def num(x, default=None):
    try:
        f = float(x)
        return f
    except Exception:
        return default

out = {"probe_version": 1, "ts": time.time()}

# ---- identity / OS ----
out["hostname"] = socket.gethostname()
out["os"] = platform.system()
out["arch"] = platform.machine()
try:
    if platform.system() == "Linux":
        txt = open("/etc/os-release").read()
        m = re.search(r'PRETTY_NAME="([^"]+)"', txt)
        out["os_name"] = m.group(1) if m else "Linux"
    elif platform.system() == "Darwin":
        out["os_name"] = "macOS " + sh(["sw_vers", "-productVersion"])
    else:
        out["os_name"] = platform.system()
except Exception:
    out["os_name"] = platform.system()

# uptime
try:
    if platform.system() == "Linux":
        out["uptime_s"] = float(open("/proc/uptime").read().split()[0])
    else:
        o = sh(["sysctl", "-n", "kern.boottime"])
        m = re.search(r"sec\s*=\s*(\d+)", o)
        out["uptime_s"] = (time.time() - int(m.group(1))) if m else None
except Exception:
    out["uptime_s"] = None

# ---- CPU ----
out["cpu_cores"] = os.cpu_count()
out["cpu_model"] = ""
try:
    if platform.system() == "Linux":
        for ln in open("/proc/cpuinfo"):
            if ln.lower().startswith(("model name", "hardware", "cpu part")):
                out["cpu_model"] = ln.split(":", 1)[1].strip(); break
        out["load_avg"] = [float(x) for x in open("/proc/loadavg").read().split()[:3]]
    else:
        out["cpu_model"] = sh(["sysctl", "-n", "machdep.cpu.brand_string"]) or sh(["sysctl", "-n", "hw.model"])
        o = sh(["sysctl", "-n", "vm.loadavg"])
        out["load_avg"] = [float(x) for x in re.findall(r"[\d.]+", o)[:3]] or None
except Exception:
    out["load_avg"] = None

# CPU utilization via two /proc/stat samples (Linux) or top (macOS)
def cpu_util():
    try:
        if platform.system() == "Linux":
            def snap():
                p = open("/proc/stat").readline().split()[1:]
                v = [int(x) for x in p]
                idle = v[3] + (v[4] if len(v) > 4 else 0)
                return sum(v), idle
            t1, i1 = snap(); time.sleep(0.5); t2, i2 = snap()
            dt = t2 - t1
            return round(100.0 * (1 - (i2 - i1) / dt), 1) if dt > 0 else None
        else:
            o = sh(["top", "-l", "2", "-n", "0", "-s", "1"], timeout=6)
            m = re.findall(r"CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys", o)
            if m:
                u, s = map(float, m[-1]); return round(u + s, 1)
    except Exception:
        return None
out["cpu_util_pct"] = cpu_util()

# ---- RAM ----
try:
    if platform.system() == "Linux":
        mi = {}
        for ln in open("/proc/meminfo"):
            k, v = ln.split(":", 1); mi[k] = int(v.strip().split()[0])  # kB
        tot = mi.get("MemTotal"); avail = mi.get("MemAvailable")
        out["ram_total_mb"] = round(tot / 1024) if tot else None
        out["ram_used_mb"] = round((tot - avail) / 1024) if tot and avail is not None else None
    else:
        tot = num(sh(["sysctl", "-n", "hw.memsize"]))
        out["ram_total_mb"] = round(tot / 1048576) if tot else None
        o = sh(["vm_stat"])
        ps = num(re.search(r"page size of (\d+)", o).group(1)) if re.search(r"page size of (\d+)", o) else 4096
        free = num(re.search(r"Pages free:\s+(\d+)", o).group(1)) if re.search(r"Pages free:\s+(\d+)", o) else None
        spec = num(re.search(r"Pages speculative:\s+(\d+)", o).group(1)) if re.search(r"Pages speculative:\s+(\d+)", o) else 0
        if tot and free is not None:
            out["ram_used_mb"] = round((tot - (free + (spec or 0)) * ps) / 1048576)
        else:
            out["ram_used_mb"] = None
except Exception:
    out["ram_total_mb"] = out["ram_used_mb"] = None

# ---- GPU ----
gpus = []
def nvidia_gpus():
    q = "name,utilization.gpu,memory.used,memory.total,temperature.gpu,power.draw,power.limit,driver_version"
    o = sh(["nvidia-smi", f"--query-gpu={q}", "--format=csv,noheader,nounits"], timeout=5)
    for ln in o.splitlines():
        p = [x.strip() for x in ln.split(",")]
        if len(p) < 8: continue
        g = {"name": p[0], "util_pct": num(p[1]), "vram_used_mb": num(p[2]),
             "vram_total_mb": num(p[3]), "temp_c": num(p[4]), "power_w": num(p[5]),
             "power_limit_w": num(p[6]), "driver": p[7], "vendor": "nvidia"}
        gpus.append(g)
def apple_gpus():
    o = sh(["system_profiler", "SPDisplaysDataType"], timeout=6)
    chip = sh(["sysctl", "-n", "machdep.cpu.brand_string"])
    name = chip or "Apple Silicon GPU"
    g = {"name": name, "util_pct": None, "vram_used_mb": None,
         "vram_total_mb": out.get("ram_total_mb"), "temp_c": None,
         "power_w": None, "power_limit_w": None, "driver": None, "vendor": "apple"}
    m = re.search(r"Total Number of Cores:\s*(\d+)", o)
    if m: g["gpu_cores"] = int(m.group(1))
    gpus.append(g)
try:
    if sh(["bash", "-c", "command -v nvidia-smi"], timeout=3):
        nvidia_gpus()
    if not gpus and platform.system() == "Darwin":
        apple_gpus()
    if not gpus and platform.system() == "Linux" and os.path.exists("/proc/device-tree/model"):
        # Tegra / Jetson / GB10 fallback already covered by nvidia-smi if present
        pass
except Exception:
    pass
out["gpus"] = gpus

# ---- network rate (two samples) ----
def net_rate():
    try:
        if platform.system() != "Linux": return None, None
        def snap():
            rx = tx = 0
            for ln in open("/proc/net/dev").readlines()[2:]:
                iface, rest = ln.split(":", 1)
                if iface.strip() == "lo": continue
                f = rest.split(); rx += int(f[0]); tx += int(f[8])
            return rx, tx
        r1, t1 = snap(); time.sleep(0.5); r2, t2 = snap()
        return round((r2 - r1) / 0.5), round((t2 - t1) / 0.5)
    except Exception:
        return None, None
out["net_rx_bps"], out["net_tx_bps"] = net_rate()

# ---- listening TCP ports ----
ports = set()
try:
    if platform.system() == "Linux":
        for f in ("/proc/net/tcp", "/proc/net/tcp6"):
            try:
                for ln in open(f).readlines()[1:]:
                    p = ln.split()
                    if len(p) > 3 and p[3] == "0A":
                        ports.add(int(p[1].split(":")[1], 16))
            except Exception: pass
    else:
        o = sh(["netstat", "-an", "-p", "tcp"], timeout=4)
        for m in re.finditer(r"\.(\d+)\s+.*LISTEN", o):
            ports.add(int(m.group(1)))
except Exception: pass
out["listening_ports"] = sorted(ports)

# ---- top processes ----
procs = []
try:
    if platform.system() == "Linux":
        o = sh(["bash", "-c", "ps -eo pid,comm,pcpu,pmem --sort=-pcpu | head -8"], timeout=4)
        for ln in o.splitlines()[1:]:
            p = ln.split(None, 3)
            if len(p) >= 4:
                procs.append({"pid": int(p[0]), "name": p[1], "cpu_pct": num(p[2]), "mem_pct": num(p[3])})
    else:
        o = sh(["bash", "-c", "ps -eo pid,comm,pcpu,pmem -r | head -8"], timeout=4)
        for ln in o.splitlines()[1:]:
            p = ln.split(None, 3)
            if len(p) >= 4:
                procs.append({"pid": int(p[0]), "name": p[1], "cpu_pct": num(p[2]), "mem_pct": num(p[3])})
except Exception: pass
out["processes"] = procs

# ---- GPU compute processes ----
gpu_procs = []
try:
    o = sh(["nvidia-smi", "--query-compute-apps=pid,process_name,used_memory", "--format=csv,noheader,nounits"], timeout=4)
    for ln in o.splitlines():
        p = [x.strip() for x in ln.split(",")]
        if len(p) >= 3:
            gpu_procs.append({"pid": num(p[0]), "name": p[1], "gpu_mem_mb": num(p[2])})
except Exception: pass
out["gpu_processes"] = gpu_procs

# ---- inference endpoint probes (localhost on the device) ----
import urllib.request
def http_get(url, timeout=1.5):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "constellation-probe"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read(200000).decode("utf-8", "replace")
    except Exception:
        return None

candidates = sorted(set(list(ports) + [8000, 8080, 8081, 11434, 5000, 8888, 8889, 30000, 1234, 8001]))
# only probe plausible HTTP ports, cap count
candidates = [p for p in candidates if p not in (22, 53, 631, 111)][:14]
endpoints = []
for port in candidates:
    base = f"http://127.0.0.1:{port}"
    models = http_get(base + "/v1/models")
    metrics = None; ollama = None; props = None; sglang = None
    if models is not None:
        metrics = http_get(base + "/metrics")
        props = http_get(base + "/props")
        sglang = http_get(base + "/get_model_info")
    else:
        ollama = http_get(base + "/api/tags")
        if ollama is None:
            # some servers only expose /metrics or /health
            metrics = http_get(base + "/metrics")
            if metrics is None: continue
    endpoints.append({"port": port, "models_raw": models, "metrics_raw": metrics,
                      "ollama_raw": ollama, "props_raw": props, "sglang_raw": sglang})
out["inference_endpoints"] = endpoints

print(json.dumps(out))
