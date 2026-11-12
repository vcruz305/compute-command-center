export type DeviceKind = 'dgx-spark' | 'mac-mini' | 'mac-studio' | 'gpu-server' | 'generic'
export type Engine = 'sglang' | 'vllm' | 'ollama' | 'llamacpp' | 'mlx' | 'exl3' | 'rexl3' | 'openai'

export interface GpuMetric {
  name: string
  util_pct: number | null
  vram_used_mb: number | null
  vram_total_mb: number | null
  temp_c: number | null
  power_w: number | null
  power_limit_w?: number | null
  driver?: string | null
  vendor?: string
}

export interface InferenceMetrics {
  decode_tps_per_request: number | null
  decode_tps_aggregate: number | null
  prefill_tps: number | null
  ttft_ms: number | null
  active_requests: number | null
  queued_requests: number | null
  concurrency: number | null
  kv_cache_pct: number | null
  cache_hit_pct: number | null
}

export interface InferenceEngine {
  engine: Engine
  port: number
  models: string[]
  max_context: number | null
  metrics: InferenceMetrics
}

export interface HistoryPoint {
  t: number
  cpu: number | null
  gpu: number | null
  ram_used: number | null
  throughput: number | null
  power: number | null
  temp: number | null
}

export interface Device {
  id: string
  name: string
  kind: DeviceKind
  status: 'online' | 'offline' | 'connecting'
  last_error: string | null
  last_seen: number | null
  demo: boolean
  specs: {
    hostname?: string | null
    os?: string | null
    arch?: string | null
    cpu_cores?: number | null
    cpu_model?: string | null
    ram_total_mb?: number | null
    gpus: GpuMetric[]
  }
  metrics: {
    cpu_util_pct: number | null
    ram_used_mb: number | null
    ram_total_mb: number | null
    load_avg?: number[] | null
    uptime_s?: number | null
    net_rx_bps?: number | null
    net_tx_bps?: number | null
    gpus: GpuMetric[]
  }
  inference: InferenceEngine[]
  processes: { pid: number; name: string; cpu_pct: number | null; mem_pct: number | null }[]
  gpu_processes: { pid: number; name: string; gpu_mem_mb: number | null }[]
  addresses: { host?: string | null; tailscale?: string | null; ports: number[] }
  history: HistoryPoint[]
}

export interface Aggregate {
  total_devices: number
  online_devices: number
  offline_devices: number
  total_gpus: number
  total_vram_mb: number | null
  used_vram_mb: number | null
  aggregate_throughput_tps: number | null
  total_active_requests: number | null
  active_models: string[]
  model_count: number
  avg_gpu_util: number | null
  total_power_w: number | null
  net_rx_bps: number | null
  net_tx_bps: number | null
  engine_count: number
}

export interface FleetFrame {
  type?: string
  ts: number
  mode: 'live' | 'demo'
  devices: Device[]
  aggregate: Aggregate
  network?: NetworkInfo | null
}

export interface NetworkInfo {
  type: 'tailscale' | 'internal' | 'unknown'
  name: string | null
  internal_ip: string | null
  external_ip: string | null
  tailscale_ip: string | null
  lan_ip: string | null
}

export interface TailnetNode {
  id: string
  hostname: string
  dns: string
  tailscale_ip: string | null
  os: string | null
  online: boolean
  self: boolean
}

export const fmt = (v: number | null | undefined, unit = '', digits = 1): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return 'N/A'
  return `${v.toFixed(digits)}${unit}`
}
export const fmtInt = (v: number | null | undefined, unit = ''): string =>
  v === null || v === undefined ? 'N/A' : `${Math.round(v)}${unit}`
export const fmtBytesMB = (mb: number | null | undefined): string => {
  if (mb === null || mb === undefined) return 'N/A'
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`
  return `${Math.round(mb)} MB`
}
export const fmtRate = (bps: number | null | undefined): string => {
  if (bps === null || bps === undefined) return 'N/A'
  if (bps >= 1e9) return `${(bps / 1e9).toFixed(2)} GB/s`
  if (bps >= 1e6) return `${(bps / 1e6).toFixed(2)} MB/s`
  if (bps >= 1e3) return `${(bps / 1e3).toFixed(1)} KB/s`
  return `${Math.round(bps)} B/s`
}
export const fmtUptime = (s: number | null | undefined): string => {
  if (!s) return 'N/A'
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60)
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`
}

// The OpenAI-compatible API endpoint of a running engine, built from the
// device's reachable host + the engine port. Null when either is unknown.
export const apiEndpoint = (d: Device, inf: InferenceEngine | null | undefined): string | null => {
  if (!inf || !inf.port) return null
  const host = d.addresses?.host || d.addresses?.tailscale
  if (!host) return null
  return `http://${host}:${inf.port}/v1`
}
