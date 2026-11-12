import React from 'react'
import { Html } from '@react-three/drei'
import type { Device } from '../types'
import { fmt, fmtBytesMB, fmtInt } from '../types'
import { KIND_COLOR } from './DeviceModel'
import { blip } from '../audio'

const ENGINE_LABEL: Record<string, string> = {
  sglang: 'SGLang', vllm: 'vLLM', ollama: 'Ollama', llamacpp: 'llama.cpp',
  mlx: 'MLX', exl3: 'EXL3', rexl3: 'REXL3', openai: 'OpenAI-API',
}

export function DeviceHUD({ device, selected, onSelect, lift = 0 }: {
  device: Device; selected: boolean; onSelect: () => void; lift?: number
}) {
  const color = device.status === 'offline' ? '#f87171' : (KIND_COLOR[device.kind] || '#22d3ee')
  const gpu = device.metrics?.gpus?.[0]
  const inf = device.inference?.[0]
  const m = inf?.metrics
  const offline = device.status === 'offline'
  // On phones the camera sits further back; distance-scaled HUDs become tiny.
  // Render a fixed-size name tag instead (full metrics live in the tap-through
  // bottom sheet). `lift` staggers alternate tags so they don't collide.
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640

  const head = (
    <div className="hud-head">
      <span className="hud-dot" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
      <span className="hud-name">{device.name}</span>
      {device.demo && !isMobile && <span className="hud-sim">SIM</span>}
      {isMobile && !offline && <span className="hud-tag-gpu">{fmt(gpu?.util_pct, '%', 0)}</span>}
    </div>
  )

  return (
    <Html position={[0, 3.4 + (isMobile ? lift : 0), 0]} center distanceFactor={isMobile ? undefined : 11} zIndexRange={[10, 0]}>
      <div
        className={`hud ${isMobile ? 'hud-compact' : ''} ${selected ? 'hud-selected' : ''} ${offline ? 'hud-offline' : ''}`}
        style={{ '--hud-color': color } as React.CSSProperties}
        onClick={(e) => { e.stopPropagation(); onSelect(); blip('select') }}
      >
        {head}
        {offline ? (
          <div className="hud-offline-msg">OFFLINE · {device.last_error || 'unreachable'}</div>
        ) : isMobile ? null : (
          <>
            {inf ? (
              <div className="hud-model">
                <span className="hud-engine" style={{ color }}>{ENGINE_LABEL[inf.engine] || inf.engine}</span>
                <span className="hud-modelname">{inf.models[0] || '—'}</span>
              </div>
            ) : (
              <div className="hud-model"><span className="hud-noengine">no inference server</span></div>
            )}
            <div className="hud-grid">
              <div className="hud-cell"><span className="hud-label">DECODE</span><span className="hud-val">{fmt(m?.decode_tps_per_request, ' t/s')}</span></div>
              <div className="hud-cell"><span className="hud-label">GPU</span><span className="hud-val">{fmt(gpu?.util_pct, '%', 0)}</span></div>
              <div className="hud-cell"><span className="hud-label">VRAM</span><span className="hud-val">{fmtBytesMB(gpu?.vram_used_mb)}</span></div>
              <div className="hud-cell"><span className="hud-label">TEMP</span><span className="hud-val">{fmt(gpu?.temp_c, '°C', 0)}</span></div>
              <div className="hud-cell"><span className="hud-label">PWR</span><span className="hud-val">{fmt(gpu?.power_w, 'W', 0)}</span></div>
              <div className="hud-cell"><span className="hud-label">REQ</span><span className="hud-val">{fmtInt(m?.active_requests)}</span></div>
            </div>
          </>
        )}
        <div className="hud-tail" />
      </div>
    </Html>
  )
}
