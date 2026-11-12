import React from 'react'
import { useStore } from '../store'
import { fmt, fmtBytesMB, fmtInt, fmtRate } from '../types'
import { blip, resumeAudio, setSoundEnabled } from '../audio'

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div className="fleet-stat">
      <span className="fleet-stat-label">{label}</span>
      <span className="fleet-stat-value" style={accent ? { color: accent } : undefined}>{value}</span>
    </div>
  )
}

export function FleetBar() {
  const aggregate = useStore(s => s.aggregate)
  const mode = useStore(s => s.mode)
  const conn = useStore(s => s.conn)
  const devices = useStore(s => s.devices)
  const sound = useStore(s => s.sound)
  const setSound = useStore(s => s.setSound)
  const a = aggregate
  const isDemo = mode === 'demo' || (devices.length > 0 && devices.every(d => d.demo))
  return (
    <header className="fleetbar">
      <div className="fleet-brand">
        <div className="fleet-logo">✦</div>
        <div>
          <div className="fleet-title">CONSTELLATION</div>
          <div className="fleet-sub">AI COMPUTE COMMAND</div>
        </div>
      </div>
      <div className="fleet-stats">
        <Stat label="DEVICES" value={a ? `${fmtInt(a.online_devices)}/${fmtInt(a.total_devices)}` : '0/0'} accent="#22d3ee" />
        <Stat label="GPUs" value={fmtInt(a?.total_gpus)} />
        <Stat label="VRAM" value={a?.used_vram_mb != null && a?.total_vram_mb ? `${fmtBytesMB(a.used_vram_mb)} / ${fmtBytesMB(a.total_vram_mb)}` : 'N/A'} />
        <Stat label="THROUGHPUT" value={fmt(a?.aggregate_throughput_tps, ' tok/s', 0)} accent="#fbbf24" />
        <Stat label="MODELS" value={fmtInt(a?.model_count)} />
        <Stat label="REQUESTS" value={fmtInt(a?.total_active_requests)} />
        <Stat label="POWER" value={fmt(a?.total_power_w, ' W', 0)} />
        <Stat label="NET ↓/↑" value={`${fmtRate(a?.net_rx_bps)} / ${fmtRate(a?.net_tx_bps)}`} />
      </div>
      <div className="fleet-mode">
        <span className={`mode-badge ${isDemo ? 'mode-demo' : 'mode-live'}`}>
          {isDemo ? '◐ SIMULATED' : '● LIVE'}
        </span>
        {!isDemo && (
          <span className={`conn-badge conn-${conn}`}>
            {conn === 'connected' ? 'LINKED' : conn === 'connecting' ? 'LINKING…' : conn === 'error' ? 'LINK ERR' : 'OFFLINE'}
          </span>
        )}
        <button
          type="button"
          className={`sound-btn ${sound ? 'on' : ''}`}
          aria-pressed={sound}
          title={sound ? 'Mute sound' : 'Unmute sound'}
          onClick={() => { const next = !sound; setSound(next); setSoundEnabled(next); if (next) resumeAudio(); blip('toggle') }}
        >
          {sound ? '🔊' : '🔇'}
        </button>
      </div>
    </header>
  )
}
