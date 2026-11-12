import React from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useStore } from '../store'
import type { Device } from '../types'
import { fmt, fmtBytesMB, fmtInt, fmtRate, fmtUptime, apiEndpoint } from '../types'
import { KIND_COLOR } from './DeviceModel'

const ENGINE_LABEL: Record<string, string> = {
  sglang: 'SGLang', vllm: 'vLLM', ollama: 'Ollama', llamacpp: 'llama.cpp',
  mlx: 'MLX', exl3: 'EXL3', rexl3: 'REXL3', openai: 'OpenAI-compatible',
}
const KIND_LABEL: Record<string, string> = {
  'dgx-spark': 'NVIDIA DGX Spark', 'mac-mini': 'Mac Mini', 'mac-studio': 'Mac Studio',
  'gpu-server': 'GPU Server', generic: 'Compute Node',
}

function Row({ k, v, accent, wrap }: { k: string; v: string; accent?: string; wrap?: boolean }) {
  return <div className={`dp-row ${wrap ? 'dp-wrap' : ''}`}><span className="dp-k">{k}</span><span className="dp-v" title={wrap ? v : undefined} style={accent ? { color: accent } : undefined}>{v}</span></div>
}

function Chart({ data, dataKey, color, unit }: { data: any[]; dataKey: string; color: string; unit: string }) {
  return (
    <div className="dp-chart">
      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`g-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.5} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#0e3a4a" strokeDasharray="2 4" vertical={false} />
          <XAxis dataKey="t" hide />
          <YAxis hide domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ background: '#041018', border: '1px solid #155e75', borderRadius: 4, fontSize: 11 }}
            labelStyle={{ display: 'none' }}
            formatter={(v: any) => [`${Number(v).toFixed(1)} ${unit}`, '']}
          />
          <Area type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} fill={`url(#g-${dataKey})`} isAnimationActive={false} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}

export function DevicePanel() {
  const selectedId = useStore(s => s.selectedId)
  const devices = useStore(s => s.devices)
  const select = useStore(s => s.select)
  const device = devices.find(d => d.id === selectedId)
  if (!device) return null
  const color = KIND_COLOR[device.kind] || '#22d3ee'
  const gpu = device.metrics.gpus?.[0]
  const hist = device.history.map(h => ({ ...h, t: h.t }))
  return (
    <aside className="device-panel" style={{ '--hud-color': color } as React.CSSProperties}>
      <div className="dp-head">
        <div>
          <div className="dp-title">{device.name}</div>
          <div className="dp-kind">{KIND_LABEL[device.kind]} · {device.specs.os || '—'}</div>
        </div>
        <button className="dp-close" onClick={() => select(null)}>✕</button>
      </div>
      <div className="dp-status">
        <span className={`dp-status-dot st-${device.status}`} />
        <span>{device.status.toUpperCase()}</span>
        {device.demo && <span className="hud-sim">SIMULATED</span>}
        {device.last_error && <span className="dp-err">{device.last_error}</span>}
      </div>

      <div className="dp-scroll">
        <section className="dp-section">
          <h4>Hardware</h4>
          <Row k="CPU" v={`${device.specs.cpu_model || '—'} · ${fmtInt(device.specs.cpu_cores)} cores`} />
          <Row k="CPU load" v={fmt(device.metrics.cpu_util_pct, '%')} />
          <Row k="RAM" v={`${fmtBytesMB(device.metrics.ram_used_mb)} / ${fmtBytesMB(device.metrics.ram_total_mb)}`} />
          <Row k="Uptime" v={fmtUptime(device.metrics.uptime_s)} />
          {device.metrics.gpus.map((g, i) => (
            <React.Fragment key={i}>
              <Row k={`GPU ${i}`} v={g.name} accent={color} />
              <Row k="  Util / Temp" v={`${fmt(g.util_pct, '%', 0)} · ${fmt(g.temp_c, '°C', 0)}`} />
              <Row k="  VRAM" v={`${fmtBytesMB(g.vram_used_mb)} / ${fmtBytesMB(g.vram_total_mb)}`} />
              <Row k="  Power" v={`${fmt(g.power_w, ' W', 0)}${g.power_limit_w ? ` / ${fmt(g.power_limit_w, ' W', 0)}` : ''}`} />
            </React.Fragment>
          ))}
        </section>

        {device.inference.length > 0 ? device.inference.map((inf, i) => {
          const m = inf.metrics
          return (
            <section className="dp-section" key={i}>
              <h4>Inference · {ENGINE_LABEL[inf.engine] || inf.engine}</h4>
              <Row k="Model" v={inf.models.join(', ') || '—'} accent={color} />
              <Row k="API Endpoint" v={apiEndpoint(device, inf) || 'N/A'} wrap />
              <Row k="Context" v={fmtInt(inf.max_context, ' tok')} />
              <div className="dp-tps-note">per-request vs aggregate</div>
              <Row k="Decode / request" v={fmt(m.decode_tps_per_request, ' tok/s')} accent="#fbbf24" />
              <Row k="Decode aggregate" v={fmt(m.decode_tps_aggregate, ' tok/s')} accent="#fbbf24" />
              <Row k="Prefill" v={fmt(m.prefill_tps, ' tok/s')} />
              <Row k="TTFT" v={fmt(m.ttft_ms, ' ms', 0)} />
              <Row k="Active / queued" v={`${fmtInt(m.active_requests)} / ${fmtInt(m.queued_requests)}`} />
              <Row k="KV cache" v={fmt(m.kv_cache_pct, '%')} />
              <Row k="Prefix cache hit" v={fmt(m.cache_hit_pct, '%')} />
            </section>
          )
        }) : (
          <section className="dp-section"><h4>Inference</h4><div className="dp-empty">No inference server detected</div></section>
        )}

        <section className="dp-section">
          <h4>Network</h4>
          <Row k="Host" v={device.addresses.host || '—'} />
          <Row k="Tailscale" v={device.addresses.tailscale || '—'} />
          <Row k="RX / TX" v={`${fmtRate(device.metrics.net_rx_bps)} / ${fmtRate(device.metrics.net_tx_bps)}`} />
          <Row k="Ports" v={device.addresses.ports.join(', ') || '—'} />
        </section>

        <section className="dp-section">
          <h4>Throughput</h4>
          <Chart data={hist} dataKey="throughput" color="#fbbf24" unit="tok/s" />
          <h4>GPU utilization</h4>
          <Chart data={hist} dataKey="gpu" color={color} unit="%" />
          <h4>Temperature</h4>
          <Chart data={hist} dataKey="temp" color="#f87171" unit="°C" />
        </section>

        {device.processes.length > 0 && (
          <section className="dp-section">
            <h4>Top processes</h4>
            {device.processes.slice(0, 6).map(p => (
              <Row key={p.pid} k={p.name} v={`${fmt(p.cpu_pct, '%')} CPU`} />
            ))}
          </section>
        )}
      </div>
    </aside>
  )
}
