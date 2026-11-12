"""Inference-engine telemetry adapters. Parse REAL endpoint payloads into a
uniform schema. Unavailable metrics stay None (rendered N/A). Never fabricates.

Supported: sglang, vLLM, Ollama, llama.cpp, and generic OpenAI-compatible
servers (which covers MLX, EXL3/TabbyAPI, REXL3 and custom servers).
"""
import json, re, time

def _prom(text):
    """Parse Prometheus exposition text -> {name: [(labels_str, value), ...]}."""
    out = {}
    if not text:
        return out
    for ln in text.splitlines():
        ln = ln.strip()
        if not ln or ln.startswith("#"):
            continue
        m = re.match(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+([^\s]+)", ln)
        if not m:
            continue
        name, labels, val = m.group(1), m.group(2) or "", m.group(3)
        try:
            v = float(val)
        except ValueError:
            continue
        out.setdefault(name, []).append((labels, v))
    return out

def _g(prom, name, label_filter=None):
    """First gauge value for a metric (optionally matching a label substring)."""
    for labels, v in prom.get(name, []):
        if label_filter is None or label_filter in labels:
            return v
    return None

def _sum(prom, name):
    vals = [v for _, v in prom.get(name, [])]
    return sum(vals) if vals else None

def _models_from_json(raw):
    try:
        d = json.loads(raw)
    except Exception:
        return None, None
    if not isinstance(d, dict):
        return None, None
    data = d.get("data")
    if not isinstance(data, list):
        return None, None
    ids = [m.get("id") for m in data if isinstance(m, dict) and m.get("id")]
    owned = next((m.get("owned_by") for m in data if isinstance(m, dict) and m.get("owned_by")), None)
    ctx = next((m.get("max_model_len") or m.get("context_length") for m in data
                if isinstance(m, dict) and (m.get("max_model_len") or m.get("context_length"))), None)
    return ids, {"owned_by": owned, "max_context": ctx}

def _is_json(raw):
    if not raw:
        return False
    s = raw.lstrip()
    return s.startswith("{") or s.startswith("[")

def detect_engine(ep):
    """Return engine key based on real payload signatures."""
    models_raw = ep.get("models_raw")
    metrics_raw = ep.get("metrics_raw") or ""
    if ep.get("ollama_raw") and _is_json(ep["ollama_raw"]):
        return "ollama"
    if metrics_raw.startswith("# HELP sglang:") or "sglang:" in metrics_raw[:400]:
        return "sglang"
    if "vllm:" in metrics_raw[:600]:
        return "vllm"
    if ep.get("sglang_raw") and _is_json(ep["sglang_raw"]):
        return "sglang"
    if _is_json(models_raw):
        _, meta = _models_from_json(models_raw)
        owned = (meta or {}).get("owned_by", "") or ""
        if "sglang" in owned: return "sglang"
        if "vllm" in owned: return "vllm"
        props = ep.get("props_raw") or ""
        if "llama.cpp" in props or '"llama.cpp"' in props:
            return "llamacpp"
        return "openai"   # generic OpenAI-compatible: MLX / EXL3 / REXL3 / custom
    if metrics_raw and not _is_json(models_raw):
        # metrics-only server
        if "vllm:" in metrics_raw: return "vllm"
        if "sglang:" in metrics_raw: return "sglang"
    return None

class RateTracker:
    """Computes per-second rates from monotonic counters across polls."""
    def __init__(self):
        self.prev = {}   # key -> (ts, value)
    def rate(self, key, value, ts):
        if value is None:
            return None
        p = self.prev.get(key)
        self.prev[key] = (ts, value)
        if not p:
            return None
        dt = ts - p[0]
        dv = value - p[1]
        if dt <= 0 or dv < 0:
            return None
        return dv / dt

def parse_endpoint(ep, engine, rates: RateTracker, ts):
    """Build a uniform inference record from a detected endpoint."""
    port = ep["port"]
    models, meta = _models_from_json(ep.get("models_raw")) if _is_json(ep.get("models_raw")) else (None, None)
    models = models or []
    max_context = (meta or {}).get("max_context")
    prom = _prom(ep.get("metrics_raw"))
    m = {
        "decode_tps_per_request": None, "decode_tps_aggregate": None,
        "prefill_tps": None, "ttft_ms": None,
        "active_requests": None, "queued_requests": None, "concurrency": None,
        "kv_cache_pct": None, "cache_hit_pct": None,
    }
    key = f"{engine}:{port}"

    if engine == "sglang":
        gen = _g(prom, "sglang:gen_throughput")
        running = _g(prom, "sglang:num_running_reqs")
        m["decode_tps_aggregate"] = gen
        m["decode_tps_per_request"] = (gen / running) if (gen is not None and running) else (0.0 if gen == 0 else None)
        m["active_requests"] = int(running) if running is not None else None
        q = _g(prom, "sglang:num_queue_reqs")
        m["queued_requests"] = int(q) if q is not None else None
        ctx = _g(prom, "sglang:context_len")
        if ctx: max_context = int(ctx)
        used = _g(prom, "sglang:kv_used_tokens"); tot = _g(prom, "sglang:max_total_num_tokens")
        if used is not None and tot: m["kv_cache_pct"] = round(100.0 * used / tot, 1)
        hit = _g(prom, "sglang:cache_hit_rate")
        if hit is not None: m["cache_hit_pct"] = round(hit * 100 if hit <= 1 else hit, 1)
        pre = _sum(prom, "sglang:prefill_effective_tokens_total")
        m["prefill_tps"] = rates.rate(key + ":prefill", pre, ts)
        # TTFT: derive from per-stage prefill latency if present, else N/A
        m["concurrency"] = int(tot) if tot else None  # token capacity, labeled separately

    elif engine == "vllm":
        gen = _sum(prom, "vllm:generation_tokens_total")
        pre = _sum(prom, "vllm:prompt_tokens_total")
        agg = rates.rate(key + ":gen", gen, ts)
        m["decode_tps_aggregate"] = agg
        m["prefill_tps"] = rates.rate(key + ":prompt", pre, ts)
        running = _g(prom, "vllm:num_requests_running")
        m["active_requests"] = int(running) if running is not None else None
        wait = _g(prom, "vllm:num_requests_waiting")
        m["queued_requests"] = int(wait) if wait is not None else None
        m["decode_tps_per_request"] = (agg / running) if (agg is not None and running) else None
        kv = _g(prom, "vllm:gpu_cache_usage_perc")
        if kv is not None: m["kv_cache_pct"] = round(kv * 100 if kv <= 1 else kv, 1)
        # TTFT histogram mean
        tt_sum = _sum(prom, "vllm:time_to_first_token_seconds_sum")
        tt_cnt = _sum(prom, "vllm:time_to_first_token_seconds_count")
        if tt_sum is not None and tt_cnt: m["ttft_ms"] = round(1000 * tt_sum / tt_cnt, 1)

    elif engine == "ollama":
        try:
            d = json.loads(ep.get("ollama_raw") or "{}")
            models = [x.get("name") for x in d.get("models", []) if x.get("name")]
        except Exception:
            pass
        # Ollama exposes no live TPS via /api/tags; per-request stats come from
        # /api/generate responses. Leave throughput N/A (honest) unless provided.

    elif engine == "llamacpp":
        # llama.cpp /props may expose slot info; /metrics (if built) has counters.
        tp = _g(prom, "llamacpp:tokens_predicted_total") or _sum(prom, "llamacpp:tokens_predicted_total")
        m["decode_tps_aggregate"] = rates.rate(key + ":gen", tp, ts)
        pp = _sum(prom, "llamacpp:prompt_tokens_total")
        m["prefill_tps"] = rates.rate(key + ":prompt", pp, ts)
        nproc = _g(prom, "llamacpp:requests_processing")
        m["active_requests"] = int(nproc) if nproc is not None else None

    # generic openai (MLX / EXL3 / REXL3 / custom): models only unless /metrics exists
    if engine == "openai" and prom:
        gen = _sum(prom, "vllm:generation_tokens_total")
        if gen is not None:
            m["decode_tps_aggregate"] = rates.rate(key + ":gen", gen, ts)

    return {
        "engine": engine, "port": port, "models": models,
        "max_context": int(max_context) if max_context else None,
        "metrics": m,
    }

def parse_inference(endpoints, rates: RateTracker, ts):
    """Detect + parse all real inference endpoints from a probe."""
    results = []
    for ep in endpoints or []:
        # skip non-API responses (e.g. the DGX Dashboard HTML on :11000)
        if not _is_json(ep.get("models_raw")) and not (ep.get("metrics_raw") or "").lstrip().startswith("#"):
            if not _is_json(ep.get("ollama_raw")):
                continue
        engine = detect_engine(ep)
        if not engine:
            continue
        results.append(parse_endpoint(ep, engine, rates, ts))
    return results
