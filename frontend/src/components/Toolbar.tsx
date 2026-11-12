import React from 'react'
import { useStore } from '../store'

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
        <button className={`tb-btn ${mode === 'demo' ? 'tb-active' : ''}`} onClick={() => setMode('demo')} title="Simulated fleet">
          ◐ Demo
        </button>
        <button className={`tb-btn ${mode === 'live' ? 'tb-active' : ''}`} onClick={() => setMode('live')} title="Real devices via backend">
          ● Live
        </button>
      </div>
      <div className="toolbar-group">
        <button className="tb-btn" onClick={() => setShowConnect(true)} title="Connect to a telemetry backend">
          ⌁ Backend{conn === 'connected' ? ' ✓' : ''}
        </button>
        <button className="tb-btn" onClick={() => setShowAdd(true)} title="Add a device (requires backend)">
          ＋ Add Device
        </button>
      </div>
      <div className="toolbar-hint">
        drag to move · scroll to zoom · click for detail
        {mode === 'live' && !backendUrl && <span className="tb-warn"> · set a backend URL</span>}
      </div>
    </div>
  )
}
