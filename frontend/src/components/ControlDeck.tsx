import React from 'react'
import { useStore, DEFAULT_VIZ, type Quality } from '../store'
import { THEMES } from '../themes'
import { blip } from '../audio'

function Slider({ label, value, min, max, step, onChange, display }: {
  label: string; value: number; min: number; max: number; step: number
  onChange: (v: number) => void; display: string
}) {
  return (
    <div className="cd-item cd-slider">
      <div className="cd-item-top">
        <span className="cd-label">{label}</span>
        <span className="cd-value">{display}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        onPointerUp={() => blip('tick')}
        aria-label={label}
      />
    </div>
  )
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`cd-item cd-toggle ${value ? 'on' : ''}`}
      onClick={() => { onChange(!value); blip('toggle') }}
      aria-pressed={value}
    >
      <span className="cd-label">{label}</span>
      <span className="cd-switch"><span className="cd-knob" /></span>
    </button>
  )
}

function exportScreenshot() {
  const canvas = document.querySelector('.scene-wrap canvas') as HTMLCanvasElement | null
  if (!canvas) return
  try {
    const url = canvas.toDataURL('image/png')
    const a = document.createElement('a')
    a.href = url
    a.download = `constellation-fleet-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    blip('export')
  } catch { /* capture unsupported */ }
}

export function ControlDeck() {
  const viz = useStore(s => s.viz)
  const setViz = useStore(s => s.setViz)
  const resetCamera = useStore(s => s.resetCamera)
  const shuffleLayout = useStore(s => s.shuffleLayout)

  return (
    <aside className="control-deck" aria-label="Visualization controls">
      <div className="cd-head">
        <span className="cd-head-dot" /> CONTROL DECK
      </div>
      <div className="cd-body">
        <div className="cd-section">Render</div>
        <Slider label="Glow" value={viz.bloom} min={0} max={3} step={0.05}
          display={viz.bloom.toFixed(2)} onChange={v => setViz({ bloom: v })} />
        <div className="cd-item cd-select">
          <span className="cd-label">Quality</span>
          <select value={viz.quality} aria-label="Quality"
            onChange={e => { setViz({ quality: e.target.value as Quality }); blip('toggle') }}>
            <option value="low">Low</option>
            <option value="med">Med</option>
            <option value="high">High</option>
          </select>
        </div>
        <Toggle label="Hologram" value={viz.hologram} onChange={v => setViz({ hologram: v })} />
        <Toggle label="Grid" value={viz.grid} onChange={v => setViz({ grid: v })} />

        <div className="cd-section">Motion</div>
        <Toggle label="Auto-orbit" value={viz.autoOrbit} onChange={v => setViz({ autoOrbit: v })} />
        <Slider label="Orbit speed" value={viz.orbitSpeed} min={0} max={2} step={0.05}
          display={viz.orbitSpeed.toFixed(2)} onChange={v => setViz({ orbitSpeed: v })} />
        <Slider label="Flow speed" value={viz.flowSpeed} min={0} max={3} step={0.05}
          display={viz.flowSpeed.toFixed(2)} onChange={v => setViz({ flowSpeed: v })} />
        <Slider label="Particles" value={viz.particles} min={0} max={1} step={0.01}
          display={`${Math.round(viz.particles * 100)}%`} onChange={v => setViz({ particles: v })} />

        <div className="cd-section">Scene</div>
        <Toggle label="Links" value={viz.links} onChange={v => setViz({ links: v })} />
        <div className="cd-item cd-themes">
          <span className="cd-label">Theme</span>
          <div className="cd-swatches">
            {THEMES.map(t => (
              <button key={t.id} type="button" title={t.label} aria-label={`${t.label} theme`}
                className={`cd-swatch ${viz.theme === t.id ? 'active' : ''}`}
                style={{ background: t.swatch }}
                onClick={() => { setViz({ theme: t.id }); blip('toggle') }} />
            ))}
          </div>
        </div>
        <div className="cd-item cd-actions">
          <button type="button" onClick={() => { resetCamera(); blip('mode') }} title="Reset camera">⟲ Cam</button>
          <button type="button" onClick={() => { shuffleLayout(); blip('mode') }} title="Shuffle layout">⚄ Shuffle</button>
          <button type="button" onClick={exportScreenshot} title="Export PNG">⤓ PNG</button>
        </div>
        <div className="cd-item cd-reset">
          <button type="button" onClick={() => { setViz({ ...DEFAULT_VIZ }); blip('mode') }}>Reset all</button>
        </div>
      </div>
    </aside>
  )
}
