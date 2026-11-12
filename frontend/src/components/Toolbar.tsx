import React from 'react'
import { useStore } from '../store'
import { blip } from '../audio'

export function Toolbar() {
  const mode = useStore(s => s.mode)
  const setMode = useStore(s => s.setMode)
  const setShowAdd = useStore(s => s.setShowAdd)
  const setShowConnect = useStore(s => s.setShowConnect)
  const conn = useStore(s => s.conn)
  const backendUrl = useStore(s => s.backendUrl)
  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <button className={`tb-btn ${mode === 'demo' ? 'tb-active' : ''}`} onClick={() => { setMode('demo'); blip('mode') }} title="Simulated fleet">
          ◐<span className="tb-label"> Demo</span>
        </button>
        <button className={`tb-btn ${mode === 'live' ? 'tb-active' : ''}`} onClick={() => { setMode('live'); blip('mode') }} title="Real devices via backend">
          ●<span className="tb-label"> Live</span>
        </button>
      </div>
      <div className="toolbar-group">
        <button className="tb-btn" onClick={() => setShowConnect(true)} title="Connect to a telemetry backend">
          ⌁<span className="tb-label"> Backend</span>{conn === 'connected' ? ' ✓' : ''}
        </button>
        <button className="tb-btn" onClick={() => setShowAdd(true)} title="Add a device (requires backend)">
          ＋<span className="tb-label tb-full"> Add Device</span><span className="tb-label tb-short"> Add</span>
        </button>
      </div>
      <div className="toolbar-hint hint-desktop">
        drag to move · scroll to zoom · click for detail
        {mode === 'live' && !backendUrl && <span className="tb-warn"> · set a backend URL</span>}
      </div>
      <div className="toolbar-hint hint-touch">tap a device · pinch to zoom · drag to move</div>
    </div>
  )
}
