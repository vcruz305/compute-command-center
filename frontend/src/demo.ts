import type { Device, FleetFrame, Aggregate, DeviceKind, Engine } from './types'

// Client-side DEMO fleet (clearly simulated). Runs in the browser when not
// connected to a live backend, so the GitHub Pages site is fully interactive.
const wave = (t: number, period: number, phase = 0, lo = 0, hi = 1) =>
  lo + (hi - lo) * (0.5 + 0.5 * Math.sin((2 * Math.PI * t) / period + phase))

interface Def {
  id: string; name: string; kind: DeviceKind; gpu: string; vram: number
  cores: number; ram: number; os: string; engine: Engine; model: string
  ctx: number; baseTps: number; phase: number
}
const DEFS: Def[] = [
  { id: 'demo-spark-a', name: 'Spark-Alpha', kind: 'dgx-spark', gpu: 'NVIDIA GB10', vram: 128000, cores: 20, ram: 128000, os: 'Ubuntu 24.04 (DGX OS)', engine: 'sglang', model: 'Qwen3-Next-80B-A3B', ctx: 32768, baseTps: 46, phase: 0.0 },
  { id: 'demo-spark-b', name: 'Spark-Beta', kind: 'dgx-spark', gpu: 'NVIDIA GB10', vram: 128000, cores: 20, ram: 128000, os: 'Ubuntu 24.04 (DGX OS)', engine: 'rexl3', model: 'GLM-4.6-EXL3', ctx: 16384, baseTps: 38, phase: 1.7 },
  { id: 'demo-rtx6000', name: 'RTX 6000', kind: 'gpu-server', gpu: 'NVIDIA RTX PRO 6000 Blackwell', vram: 96000, cores: 64, ram: 256000, os: 'Ubuntu 24.04', engine: 'vllm', model: 'DeepSeek-V3.1', ctx: 65536, baseTps: 62, phase: 3.1 },
  { id: 'demo-studio', name: 'Mac-Studio-01', kind: 'mac-studio', gpu: 'Apple M3 Ultra (80-core GPU)', vram: 256000, cores: 32, ram: 256000, os: 'macOS 15.5', engine: 'mlx', model: 'Llama-3.3-70B-MLX', ctx: 32768, baseTps: 24, phase: 4.4 },
  { id: 'demo-mini', name: 'Mac-Mini-02', kind: 'mac-mini', gpu: 'Apple M4 Pro (20-core GPU)', vram: 48000, cores: 14, ram: 48000, os: 'macOS 15.5', engine: 'ollama', model: 'qwen2.5:14b', ctx: 8192, baseTps: 31, phase: 5.6 },
  { id: 'demo-b200', name: 'B200-Cluster', kind: 'gpu-server', gpu: '8x NVIDIA B200', vram: 1440000, cores: 208, ram: 2048000, os: 'Ubuntu 24.04', engine: 'sglang', model: 'Kimi-K2', ctx: 131072, baseTps: 120, phase: 2.3 },
]

const history: Record<string, Device['history']> = {}

export function demoFrame(): FleetFrame {
  const t = Date.now() / 1000
  const devices: Device[] = DEFS.map((d, idx) => {
    const ph = d.phase
    const load = wave(t, 23, ph, 0.15, 0.95)
    const gpuUtil = +(wave(t, 17, ph, 8, 97) * load + 3).toFixed(1)
    const running = Math.round(wave(t, 13, ph, 0, 6))
    const aggTps = running ? +(d.baseTps * running * wave(t, 11, ph, 0.7, 1.2)).toFixed(1) : 0
    const perReq = running ? +(aggTps / running).toFixed(1) : null
    const prefill = running ? +(d.baseTps * 8 * wave(t, 19, ph, 0.2, 1)).toFixed(1) : 0
    const kv = +(wave(t, 29, ph, 5, 88) * (0.4 + 0.6 * load)).toFixed(1)
    const temp = +wave(t, 31, ph, 36, 83).toFixed(1)
    const power = +(wave(t, 31, ph, 0.12, 0.95) * (d.kind === 'gpu-server' ? 300 : 60)).toFixed(1)
    const vramUsed = Math.round(d.vram * (0.55 + 0.3 * load))
    const cpu = +wave(t, 15, ph + 1, 4, 72).toFixed(1)
    const ramUsed = Math.round(d.ram * (0.2 + 0.4 * load))
    const rx = Math.round(wave(t, 9, ph, 1e5, 9e6))
    const tx = Math.round(wave(t, 9, ph + 2, 1e5, 9e6))
    const hist = history[d.id] || (history[d.id] = [])
    hist.push({ t, cpu, gpu: gpuUtil, ram_used: ramUsed, throughput: aggTps || null, power, temp })
    if (hist.length > 150) history[d.id] = hist.slice(-150)
    const gpu = { name: d.gpu, util_pct: gpuUtil, vram_used_mb: vramUsed, vram_total_mb: d.vram, temp_c: temp, power_w: power, power_limit_w: d.kind === 'gpu-server' ? 300 : 70, vendor: d.kind.startsWith('mac') ? 'apple' : 'nvidia' }
    return {
      id: d.id, name: d.name, kind: d.kind, status: 'online', last_error: null, last_seen: t, demo: true,
      specs: { hostname: d.name.toLowerCase().replace(/\s+/g, '-'), os: d.os, arch: d.kind.startsWith('mac') || d.kind === 'dgx-spark' ? 'arm64' : 'x86_64', cpu_cores: d.cores, cpu_model: d.gpu, ram_total_mb: d.ram, gpus: [gpu] },
      metrics: { cpu_util_pct: cpu, ram_used_mb: ramUsed, ram_total_mb: d.ram, load_avg: [+(cpu / 12).toFixed(2)], uptime_s: 360000 + (Math.floor(t) % 86400), net_rx_bps: rx, net_tx_bps: tx, gpus: [gpu] },
      inference: [{ engine: d.engine, port: 8000, models: [d.model], max_context: d.ctx, metrics: { decode_tps_per_request: perReq, decode_tps_aggregate: aggTps, prefill_tps: prefill, ttft_ms: running ? +wave(t, 7, ph, 40, 320).toFixed(1) : null, active_requests: running, queued_requests: Math.round(wave(t, 5, ph, 0, 3)), concurrency: 16, kv_cache_pct: kv, cache_hit_pct: +wave(t, 37, ph, 20, 90).toFixed(1) } }],
      processes: [{ pid: 1000 + idx, name: d.engine, cpu_pct: +(cpu / 3).toFixed(1), mem_pct: +(20 * load).toFixed(1) }],
      gpu_processes: [{ pid: 1000, name: d.engine, gpu_mem_mb: vramUsed }],
      addresses: { host: `100.64.0.${10 + idx}`, tailscale: `${d.name.toLowerCase().replace(/\s+/g, '-')}.demo.ts.net`, ports: [8000, 22] },
      history: hist,
    }
  })
  return { ts: t, mode: 'demo', devices, aggregate: aggregate(devices) }
}

export function aggregate(devices: Device[]): Aggregate {
  const online = devices.filter(d => d.status === 'online')
  const gpus = online.flatMap(d => d.metrics.gpus || [])
  const inf = online.flatMap(d => d.inference || [])
  const models = [...new Set(inf.flatMap(e => e.models))]
  const sum = (fn: (x: any) => number | null | undefined, src: any[]) => {
    const vals = src.map(fn).filter((v): v is number => v !== null && v !== undefined)
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null
  }
  return {
    total_devices: devices.length, online_devices: online.length, offline_devices: devices.length - online.length,
    total_gpus: gpus.length,
    total_vram_mb: sum(g => g.vram_total_mb, gpus), used_vram_mb: sum(g => g.vram_used_mb, gpus),
    aggregate_throughput_tps: sum(e => e.metrics.decode_tps_aggregate, inf),
    total_active_requests: sum(e => e.metrics.active_requests, inf),
    active_models: models, model_count: models.length,
    avg_gpu_util: gpus.length ? +(gpus.reduce((a, g) => a + (g.util_pct || 0), 0) / gpus.length).toFixed(1) : null,
    total_power_w: sum(g => g.power_w, gpus),
    net_rx_bps: sum(d => d.metrics.net_rx_bps, online), net_tx_bps: sum(d => d.metrics.net_tx_bps, online),
    engine_count: inf.length,
  }
}
