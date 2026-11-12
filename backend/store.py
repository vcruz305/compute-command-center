"""Server-side device config + credential store. Persisted to a 0600 JSON file.
Secrets (key paths / passwords) NEVER leave the backend; the browser only sees
non-sensitive connection metadata. Key material is referenced by path, not copied.
"""
import json, os, threading, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
STORE_PATH = os.path.join(HERE, "devices.json")
_lock = threading.Lock()

def _load():
    if not os.path.exists(STORE_PATH):
        return []
    try:
        return json.load(open(STORE_PATH))
    except Exception:
        return []

def _save(devices):
    tmp = STORE_PATH + ".tmp"
    with open(tmp, "w") as f:
        json.dump(devices, f, indent=2)
    os.chmod(tmp, 0o600)
    os.replace(tmp, STORE_PATH)

def list_devices():
    with _lock:
        return _load()

def public_view(d):
    """Strip sensitive credential fields before anything reaches the browser."""
    c = dict(d.get("connection", {}))
    c.pop("password", None)
    # key_path is a server-side reference; expose only whether a key is set
    c["has_key"] = bool(c.pop("key_path", None))
    out = dict(d)
    out["connection"] = c
    return out

def add_device(payload):
    with _lock:
        devices = _load()
        d = {
            "id": payload.get("id") or uuid.uuid4().hex[:12],
            "name": payload.get("name") or payload.get("connection", {}).get("host", "device"),
            "kind": payload.get("kind", "auto"),
            "connection": payload.get("connection", {}),
            "enabled": payload.get("enabled", True),
        }
        devices.append(d)
        _save(devices)
        return d

def update_device(dev_id, payload):
    with _lock:
        devices = _load()
        for d in devices:
            if d["id"] == dev_id:
                for k in ("name", "kind", "enabled"):
                    if k in payload: d[k] = payload[k]
                if "connection" in payload:
                    merged = dict(d.get("connection", {}))
                    merged.update(payload["connection"])
                    # keep existing key/password if not re-supplied
                    d["connection"] = merged
                _save(devices)
                return d
    return None

def remove_device(dev_id):
    with _lock:
        devices = _load()
        n = len(devices)
        devices = [d for d in devices if d["id"] != dev_id]
        _save(devices)
        return len(devices) < n
