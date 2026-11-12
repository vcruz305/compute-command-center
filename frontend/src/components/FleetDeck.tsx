import React, { useEffect, useRef } from 'react'
import { useStore } from '../store'
import type { Device } from '../types'
import { fmt, fmtInt, fmtBytesMB } from '../types'
import { KIND_COLOR } from './DeviceModel'
import { blip } from '../audio'

const ENGINE_LABEL: Record<string, string> = {
  sglang: 'SGLang', vllm: 'vLLM', ollama: 'Ollama', llamacpp: 'llama.cpp',
  mlx: 'MLX', exl3: 'EXL3', rexl3: 'REXL3', openai: 'OpenAI',
}
const KIND_SHORT: Record<string, string> = {
  'dgx-spark': 'DGX Spark', 'mac-mini': 'Mac Mini', 'mac-studio': 'Mac Studio',
  'gpu-server': 'GPU Server', generic: 'Node',
}
const STATUS_ORDER: Record<string, number> = { online: 0, connecting: 1, offline: 2 }

function summary(d: Device) {
  const g = d.metrics.gpus?.[0]
  const powers = (d.metrics.gpus || []).map(x => x.power_w).filter((v): v is number => v != null)
  const power = powers.length ? powers.reduce((a, b) => a + b, 0) : null
  let tps: number | null = null
  let active = 0
  let engine = ''
  let model = ''
  for (const inf of d.inference) {
    const m = inf.metrics
    const t = m.decode_tps_aggregate ?? m.decode_tps_per_request
    if (t != null) tps = (tps ?? 0) + t
    active += m.active_requests ?? 0
    if (!engine) { engine = ENGINE_LABEL[inf.engine] || inf.engine; model = inf.models[0] || '' }
  }
  return {
    tps, active, engine, model,
    gpuUtil: g?.util_pct ?? null,
    vramUsed: g?.vram_used_mb ?? null,
    temp: g?.temp_c ?? null,
    power,
  }
}

function Card({ d }: { d: Device }) {
  const selectedId = useStore(s => s.selectedId)
  const select = useStore(s => s.select)
  const s = summary(d)
  const color = KIND_COLOR[d.kind] || '#22d3ee'
  const selected = selectedId === d.id
  return (
    <button
      type="button"
      data-id={d.id}
      className={`fd-card ${selected ? 'fd-selected' : ''} ${d.status === 'offline' ? 'fd-offline' : ''}`}
      style={{ '--fd-color': color } as React.CSSProperties}
      onClick={() => { select(selected ? null : d.id); blip('select') }}
      aria-pressed={selected}
      title={`${d.name} — open details`}
    >
      <div className="fd-top">
        <span className={`fd-dot st-${d.status}`} />
        <span className="fd-name">{d.name}</span>
        {d.demo && <span className="fd-sim">SIM</span>}
        {s.active > 0 && <span className="fd-req">{s.active}▶</span>}
      </div>
      <div className="fd-sub">{KIND_SHORT[d.kind] || d.kind}{s.engine ? ` · ${s.engine}` : ''}</div>
      <div className="fd-model">{s.model || (d.inference.length ? '—' : 'no engine')}</div>
      <div className="fd-bar" aria-hidden="true">
        <span style={{ width: `${Math.min(100, s.gpuUtil ?? 0)}%` }} />
      </div>
      <div className="fd-metrics">
        <span className="fd-m"><span className="fd-mk">TPS</span><span className="fd-mv fd-tps">{fmt(s.tps, '', 1)}</span></span>
        <span className="fd-m"><span className="fd-mk">GPU</span><span className="fd-mv">{fmtInt(s.gpuUtil, '%')}</span></span>
        <span className="fd-m"><span className="fd-mk">TMP</span><span className="fd-mv">{fmt(s.temp, '°', 0)}</span></span>
      </div>
      <div className="fd-metrics fd-metrics2">
        <span className="fd-m"><span className="fd-mk">VRAM</span><span className="fd-mv">{fmtBytesMB(s.vramUsed)}</span></span>
        <span className="fd-m"><span className="fd-mk">PWR</span><span className="fd-mv">{fmt(s.power, 'W', 0)}</span></span>
      </div>
    </button>
  )
}

export function FleetDeck() {
  const devices = useStore(s => s.devices)
  const selectedId = useStore(s => s.selectedId)
  const setShowSettings = useStore(s => s.setShowSettings)
  const mode = useStore(s => s.mode)
  const conn = useStore(s => s.conn)
  const backendUrl = useStore(s => s.backendUrl)
  const setShowConnect = useStore(s => s.setShowConnect)
  const setShowAdd = useStore(s => s.setShowAdd)
  const setMode = useStore(s => s.setMode)
  const bodyRef = useRef<HTMLDivElement>(null)
  const online = devices.filter(d => d.status === 'online').length
  // Bring the selected device's card into view (e.g. when picked via its 3D tag).
  useEffect(() => {
    if (!selectedId || !bodyRef.current) return
    const el = bodyRef.current.querySelector(`[data-id="${selectedId}"]`) as HTMLElement | null
    el?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
  }, [selectedId])
  const sorted = [...devices].sort((a, b) =>
    (STATUS_ORDER[a.status] - STATUS_ORDER[b.status]) || a.name.localeCompare(b.name))
  const openSettings = () => { setShowSettings(true); blip('mode') }

  return (
    <aside className="fleet-deck" aria-label="Fleet roster">
      <div className="fd-head">
        <span className="fd-head-dot" /> FLEET
        <span className="fd-count">{online}/{devices.length} ONLINE</span>
        <button type="button" className="fd-gear" onClick={openSettings}
          title="Scene settings" aria-label="Open scene settings">⚙</button>
      </div>
      <div className="fd-body" ref={bodyRef}>
        <button type="button" className="fd-gear-tile" onClick={openSettings} aria-label="Open scene settings">
          <span className="fd-gear-ico">⚙</span>
          <span className="fd-gear-count">{online}/{devices.length}</span>
          <span className="fd-gear-label">FLEET</span>
        </button>
        {sorted.map(d => <Card key={d.id} d={d} />)}
        {devices.length === 0 && (
          <div className="fd-empty-state">
            <div className="fd-empty-ico">{mode === 'live' ? '⌁' : '◐'}</div>
            <div className="fd-empty-title">
              {mode !== 'live' ? 'No devices'
                : conn === 'connecting' ? 'Linking to backend…'
                : 'No devices configured'}
            </div>
            <div className="fd-empty-sub">
              {mode !== 'live' ? 'Add a device to get started.'
                : conn === 'connecting' ? 'Waiting for the first telemetry frame.'
                : conn === 'connected' ? 'Backend linked, but no devices are registered yet. Add one to see it here.'
                : backendUrl ? 'Backend unreachable. Check the URL and that it is running.'
                : 'Connect a telemetry backend to stream live metrics from your own fleet.'}
            </div>
            {mode === 'live' && (
              <div className="fd-empty-actions">
                {conn === 'connected'
                  ? <button type="button" className="tb-btn tb-primary" onClick={() => setShowAdd(true)}>＋ Add Device</button>
                  : <button type="button" className="tb-btn tb-primary" onClick={() => setShowConnect(true)}>⌁ Connect Backend</button>}
                <button type="button" className="tb-btn" onClick={() => setMode('demo')}>◐ Try Demo</button>
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}