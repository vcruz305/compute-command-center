import React, { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { TailnetNode } from '../types'

export function ConnectModal() {
  const show = useStore(s => s.showConnect)
  const setShow = useStore(s => s.setShowConnect)
  const backendUrl = useStore(s => s.backendUrl)
  const connect = useStore(s => s.connect)
  const conn = useStore(s => s.conn)
  const [url, setUrl] = useState(backendUrl)
  const [test, setTest] = useState<string | null>(null)
  useEffect(() => { if (show) { setUrl(backendUrl); setTest(null) } }, [show, backendUrl])
  if (!show) return null
  const doTest = async () => {
    if (!url.trim()) { setTest('Enter a backend URL first.'); return }
    setTest('testing…')
    try {
      const r = await fetch(url.replace(/\/+$/, '') + '/api/health', { signal: AbortSignal.timeout(6000) })
      const d = await r.json()
      setTest(d.ok ? `✓ reachable · mode ${d.mode} · ${d.devices} device(s)` : 'unexpected response')
    } catch (e: any) { setTest('✗ ' + (e?.message || 'unreachable')) }
  }
  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h3>Connect Telemetry Backend</h3>
        <p className="modal-note">The 3D frontend is static. Real metrics stream from a small FastAPI backend that collects them over SSH and broadcasts them over WebSocket. To go live:</p>
        <ol className="modal-steps">
          <li><b>Run the backend</b> on a machine that can SSH into your devices (<code>backend/run.sh</code>).</li>
          <li><b>Expose it over HTTPS</b> — e.g. <code>tailscale funnel 8090</code>. Browsers block plain-HTTP backends.</li>
          <li><b>Paste its HTTPS URL</b> below and press Connect. Devices registered on the backend appear within seconds.</li>
        </ol>
        <label className="modal-label">Backend URL</label>
        <input className="modal-input" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://your-host.tailnet.ts.net" />
        <div className="modal-actions">
          <button className="tb-btn" onClick={doTest}>Test</button>
          <button className="tb-btn tb-primary" onClick={() => { if (!url.trim()) { setTest('Enter a backend URL first.'); return } connect(url, true); setShow(false) }}>Connect</button>
        </div>
        <a className="modal-link" href="https://github.com/vcruz305/constellation#run-it" target="_blank" rel="noreferrer">Full setup guide (repo README) ↗</a>
        <p className="modal-note">SSH keys and credentials stay on the backend server — they are never sent to the browser.</p>
        {test && <div className="modal-test">{test}</div>}
        {conn === 'connected' && <div className="modal-test ok">Currently linked.</div>}
      </div>
    </div>
  )
}

export function AddDeviceModal() {
  const show = useStore(s => s.showAdd)
  const setShow = useStore(s => s.setShowAdd)
  const backendUrl = useStore(s => s.backendUrl)
  const conn = useStore(s => s.conn)
  const [name, setName] = useState('')
  const [kind, setKind] = useState('auto')
  const [ctype, setCtype] = useState('ssh')
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [port, setPort] = useState('22')
  const [keyPath, setKeyPath] = useState('')
  const [nodes, setNodes] = useState<TailnetNode[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (show && backendUrl && conn === 'connected') {
      fetch(backendUrl + '/api/tailscale').then(r => r.json()).then(d => setNodes(d.nodes || [])).catch(() => setNodes([]))
    }
  }, [show, backendUrl, conn])

  if (!show) return null
  const pickNode = (n: TailnetNode) => {
    setName(n.hostname); setHost(n.tailscale_ip || n.dns); setCtype('ssh')
    if (!user) setUser(n.os === 'macos' ? 'admin' : '')
  }
  const submit = async () => {
    if (!backendUrl || conn !== 'connected') { setMsg('Connect a backend first (⌁ Backend).'); return }
    if (!host) { setMsg('Host is required.'); return }
    setBusy(true); setMsg(null)
    try {
      const r = await fetch(backendUrl + '/api/devices', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name || host, kind, connection: { type: ctype, host, user, port: parseInt(port) || 22, key_path: keyPath || undefined, tailscale_name: name || undefined } }),
      })
      const d = await r.json()
      setMsg(d.id ? `✓ Added ${d.name}. It will appear within a few seconds.` : 'Failed to add.')
      if (d.id) setTimeout(() => setShow(false), 900)
    } catch (e: any) { setMsg('✗ ' + (e?.message || 'error')) }
    setBusy(false)
  }
  return (
    <div className="modal-backdrop" onClick={() => setShow(false)}>
      <div className="modal modal-wide" onClick={e => e.stopPropagation()}>
        <h3>Add Device</h3>
        {nodes.length > 0 && (
          <div className="ts-nodes">
            <div className="modal-label">Tailscale nodes ({nodes.length}) — click to fill</div>
            <div className="ts-node-list">
              {nodes.filter(n => !n.self).map(n => (
                <button key={n.id} className={`ts-node ${n.online ? '' : 'ts-off'}`} onClick={() => pickNode(n)}>
                  <span className={`ts-dot ${n.online ? 'on' : ''}`} />{n.hostname} <span className="ts-ip">{n.tailscale_ip}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="modal-grid">
          <div><label className="modal-label">Name</label><input className="modal-input" value={name} onChange={e => setName(e.target.value)} placeholder="gpu-node-01" /></div>
          <div><label className="modal-label">Type</label>
            <select className="modal-input" value={kind} onChange={e => setKind(e.target.value)}>
              <option value="auto">Auto-detect</option><option value="dgx-spark">DGX Spark</option>
              <option value="mac-mini">Mac Mini</option><option value="mac-studio">Mac Studio</option>
              <option value="gpu-server">GPU Server</option><option value="generic">Generic</option>
            </select></div>
          <div><label className="modal-label">Connection</label>
            <select className="modal-input" value={ctype} onChange={e => setCtype(e.target.value)}>
              <option value="ssh">SSH</option><option value="local">Local</option>
            </select></div>
          <div><label className="modal-label">Host / IP / Tailscale</label><input className="modal-input" value={host} onChange={e => setHost(e.target.value)} placeholder="100.64.0.5 or alias" /></div>
          <div><label className="modal-label">SSH user</label><input className="modal-input" value={user} onChange={e => setUser(e.target.value)} placeholder="(default)" /></div>
          <div><label className="modal-label">Port</label><input className="modal-input" value={port} onChange={e => setPort(e.target.value)} /></div>
          <div className="modal-span"><label className="modal-label">SSH key path (server-side)</label><input className="modal-input" value={keyPath} onChange={e => setKeyPath(e.target.value)} placeholder="~/.ssh/id_ed25519 (optional)" /></div>
        </div>
        <div className="modal-actions">
          <button className="tb-btn" onClick={() => setShow(false)}>Cancel</button>
          <button className="tb-btn tb-primary" onClick={submit} disabled={busy}>{busy ? 'Adding…' : 'Add Device'}</button>
        </div>
        {msg && <div className="modal-test">{msg}</div>}
        <p className="modal-note">Credentials are stored server-side only and never sent to the browser. The backend must already have SSH access (key/agent) to the device.</p>
      </div>
    </div>
  )
}
