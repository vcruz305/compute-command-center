"""Tailscale node discovery via `tailscale status --json`."""
import asyncio, json

async def discover():
    try:
        proc = await asyncio.create_subprocess_exec(
            "tailscale", "status", "--json",
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=10)
        data = json.loads(stdout.decode())
    except Exception:
        return {"available": False, "nodes": []}
    nodes = []
    self_ = data.get("Self") or {}
    def row(k, v, is_self=False):
        return {
            "id": k, "hostname": v.get("HostName") or v.get("DNSName", "").split(".")[0],
            "dns": v.get("DNSName", "").rstrip("."),
            "tailscale_ip": (v.get("TailscaleIPs") or [None])[0],
            "os": v.get("OS"), "online": v.get("Online", False),
            "self": is_self, "tags": v.get("Tags") or [],
        }
    if self_:
        nodes.append(row("self", self_, True))
    for k, v in (data.get("Peer") or {}).items():
        nodes.append(row(k, v))
    return {"available": True, "tailnet": data.get("MagicDNSSuffix", ""), "nodes": nodes}
