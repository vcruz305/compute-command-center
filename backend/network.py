"""Network context for the constellation core.

Determines the network the fleet is reached through (Tailscale mesh vs internal
LAN) and the host's internal + external IPs. These are REAL measurements; anything
unavailable stays None (rendered N/A downstream). Results are cached and refreshed
on a slow loop so we never hammer `tailscale` or a public-IP service per frame.
"""
import asyncio, json, socket, time, urllib.request

# Public-IP echo services (real, task-appropriate; tried in order). The external
# IP changes rarely, so cache it for a few minutes.
_EXT_SERVICES = (
    "https://api.ipify.org?format=json",
    "https://ifconfig.me/ip",
    "https://icanhazip.com",
)
_ext_cache = {"ts": 0.0, "ip": None}
_EXT_TTL = 300.0


def _lan_ip():
    """Primary outbound-interface IPv4 (no packet is actually sent)."""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.settimeout(1.0)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return None


async def _tailscale():
    try:
        proc = await asyncio.create_subprocess_exec(
            "tailscale", "status", "--json",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=6)
        data = json.loads(stdout.decode())
        self_ = data.get("Self") or {}
        return {
            "available": bool(self_.get("TailscaleIPs")),
            "ip": (self_.get("TailscaleIPs") or [None])[0],
            "tailnet": (data.get("MagicDNSSuffix") or "").rstrip("."),
        }
    except Exception:
        return {"available": False, "ip": None, "tailnet": None}


def _external_ip():
    now = time.time()
    if _ext_cache["ip"] and now - _ext_cache["ts"] < _EXT_TTL:
        return _ext_cache["ip"]
    for url in _EXT_SERVICES:
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "constellation"})
            with urllib.request.urlopen(req, timeout=4) as r:
                body = r.read(300).decode("utf-8", "replace").strip()
            ip = json.loads(body).get("ip") if url.endswith("json") else body
            if ip and ":" not in ip:  # IPv4 only for the core readout
                _ext_cache.update(ts=now, ip=ip)
                return ip
        except Exception:
            continue
    return _ext_cache["ip"]  # last known, or None


async def detect():
    ts = await _tailscale()
    lan = _lan_ip()
    loop = asyncio.get_event_loop()
    ext = await loop.run_in_executor(None, _external_ip)
    if ts["available"] and ts["ip"]:
        typ, internal, name = "tailscale", ts["ip"], (ts["tailnet"] or "Tailscale")
    else:
        typ, internal, name = "internal", lan, "Internal LAN"
    return {
        "type": typ, "name": name,
        "internal_ip": internal, "external_ip": ext,
        "tailscale_ip": ts["ip"], "lan_ip": lan,
    }