import { create } from 'zustand'
import type { Device, Aggregate } from './types'
import { demoFrame } from './demo'

export type Mode = 'demo' | 'live'
export type Conn = 'disconnected' | 'connecting' | 'connected' | 'error'
export type Quality = 'low' | 'med' | 'high'

export interface Viz {
  bloom: number
  quality: Quality
  hologram: boolean
  grid: boolean
  autoOrbit: boolean
  orbitSpeed: number
  flowSpeed: number
  particles: number
  links: boolean
  theme: string
}

export const DEFAULT_VIZ: Viz = {
  bloom: 1.15, quality: 'high', hologram: false, grid: true,
  autoOrbit: true, orbitSpeed: 0.5, flowSpeed: 1.0, particles: 0.55,
  links: true, theme: 'cyan',
}

interface Positions { [id: string]: [number, number] }

interface State {
  mode: Mode
  backendUrl: string
  conn: Conn
  connError: string | null
  devices: Device[]
  aggregate: Aggregate | null
  ts: number
  selectedId: string | null
  positions: Positions
  showAdd: boolean
  showConnect: boolean
  showSettings: boolean
  followSelected: boolean
  viz: Viz
  sound: boolean
  resetCamNonce: number
  // actions
  setMode: (m: Mode) => void
  connect: (url: string, fresh?: boolean) => void
  disconnect: () => void
  select: (id: string | null) => void
  setPosition: (id: string, x: number, z: number) => void
  setShowAdd: (v: boolean) => void
  setShowConnect: (v: boolean) => void
  setShowSettings: (v: boolean) => void
  setFollow: (v: boolean) => void
  setViz: (patch: Partial<Viz>) => void
  setSound: (v: boolean) => void
  resetCamera: () => void
  shuffleLayout: () => void
  applyFrame: (devices: Device[], aggregate: Aggregate | null, ts: number, mode: Mode) => void
}

let demoTimer: ReturnType<typeof setInterval> | null = null
let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null

// Default telemetry backend. Self-hosted / same-origin builds (the backend
// serving the frontend) use their own origin and auto-link. Public static
// hosting (GitHub Pages) never prefills or auto-dials a private backend — it
// stays in demo until the visitor connects their own.
export const IS_PUBLIC =
  typeof location !== 'undefined' && location.hostname.endsWith('github.io')
export const DEFAULT_BACKEND =
  IS_PUBLIC ? '' : (typeof location !== 'undefined' ? location.origin : '')

const load = (k: string, fallback: string) => {
  try { return localStorage.getItem(k) ?? fallback } catch { return fallback }
}
const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }

function loadViz(): Viz {
  try {
    const raw = localStorage.getItem('occ.viz')
    if (!raw) return { ...DEFAULT_VIZ }
    return { ...DEFAULT_VIZ, ...JSON.parse(raw) }
  } catch { return { ...DEFAULT_VIZ } }
}

function defaultPositions(devices: Device[], existing: Positions): Positions {
  const out = { ...existing }
  const n = devices.length
  // Portrait phones use a 2-row formation (spreads devices down the tall
  // screen); desktop uses a ring around the command core.
  const mobile = typeof window !== 'undefined' && window.innerWidth < 640
  devices.forEach((d, i) => {
    if (!out[d.id]) {
      if (mobile && n > 1) {
        const cols = Math.min(2, n)
        const rows = Math.ceil(n / cols)
        const row = Math.floor(i / cols), col = i % cols
        const inRow = Math.min(cols, n - row * cols)
        out[d.id] = [(col - (inRow - 1) / 2) * 10.5, (row - (rows - 1) / 2) * 7.0]
      } else {
        const angle = (i / Math.max(n, 1)) * Math.PI * 2 - Math.PI / 2
        const radius = n <= 1 ? 0 : 8.5
        out[d.id] = [Math.cos(angle) * radius, Math.sin(angle) * radius]
      }
    }
  })
  return out
}

export const useStore = create<State>((set, get) => ({
  mode: (IS_PUBLIC ? 'demo' : load('occ.mode', 'demo')) as Mode,
  backendUrl: IS_PUBLIC ? '' : load('occ.backendUrl', DEFAULT_BACKEND),
  conn: 'disconnected',
  connError: null,
  devices: [],
  aggregate: null,
  ts: 0,
  selectedId: null,
  positions: JSON.parse(load('occ.positions', '{}')),
  showAdd: false,
  showConnect: false,
  showSettings: false,
  followSelected: false,
  viz: loadViz(),
  sound: load('occ.sound', '1') === '1',
  resetCamNonce: 0,

  applyFrame: (devices, aggregate, ts, mode) => {
    const positions = defaultPositions(devices, get().positions)
    set({ devices, aggregate, ts, mode, positions })
  },

  setMode: (m) => {
    save('occ.mode', m)
    if (m === 'demo') {
      get().disconnect()
      set({ mode: 'demo', conn: 'disconnected' })
      startDemo(set, get)
    } else {
      stopDemo()
      // Entering Live clears the simulated fleet so an unconfigured/unreachable
      // backend shows "no devices configured" instead of stale demo data.
      set({ mode: 'live', devices: [], aggregate: null, ts: 0, selectedId: null })
      const url = get().backendUrl
      if (url) get().connect(url)
      else set({ conn: 'disconnected', connError: null })
    }
  },

  connect: (url, fresh) => {
    stopDemo()
    if (!url) { set({ conn: 'disconnected', connError: null }); return }
    if (fresh) set({ devices: [], aggregate: null, ts: 0, selectedId: null })
    if (ws) { try { ws.close() } catch {} ws = null }
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    const clean = url.replace(/\/+$/, '')
    save('occ.backendUrl', clean)
    set({ backendUrl: clean, mode: 'live', conn: 'connecting', connError: null })
    save('occ.mode', 'live')
    const wsUrl = clean.replace(/^http/, 'ws') + '/ws'
    try {
      ws = new WebSocket(wsUrl)
    } catch (e: any) {
      set({ conn: 'error', connError: String(e?.message || e) })
      return
    }
    ws.onopen = () => set({ conn: 'connected', connError: null })
    ws.onmessage = (ev) => {
      try {
        const frame = JSON.parse(ev.data)
        if (frame.type === 'fleet' || frame.devices) {
          get().applyFrame(frame.devices, frame.aggregate, frame.ts, frame.mode || 'live')
        }
      } catch {}
    }
    ws.onerror = () => set({ conn: 'error', connError: 'WebSocket error' })
    ws.onclose = () => {
      if (get().mode === 'live' && get().backendUrl) {
        set({ conn: 'disconnected' })
        reconnectTimer = setTimeout(() => { if (get().mode === 'live') get().connect(get().backendUrl) }, 4000)
      }
    }
  },

  disconnect: () => {
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) { try { ws.onclose = null; ws.close() } catch {} ws = null }
    set({ conn: 'disconnected' })
  },

  select: (id) => set({ selectedId: id }),
  setPosition: (id, x, z) => {
    const positions = { ...get().positions, [id]: [x, z] as [number, number] }
    save('occ.positions', JSON.stringify(positions))
    set({ positions })
  },
  setShowAdd: (v) => set({ showAdd: v }),
  setShowConnect: (v) => set({ showConnect: v }),
  setShowSettings: (v) => set({ showSettings: v }),
  setFollow: (v) => set({ followSelected: v }),
  setViz: (patch) => {
    const viz = { ...get().viz, ...patch }
    save('occ.viz', JSON.stringify(viz))
    set({ viz })
  },
  setSound: (v) => { save('occ.sound', v ? '1' : '0'); set({ sound: v }) },
  resetCamera: () => set({ resetCamNonce: get().resetCamNonce + 1 }),
  shuffleLayout: () => {
    const devices = get().devices
    const mobile = typeof window !== 'undefined' && window.innerWidth < 640
    const positions: Positions = {}
    devices.forEach(d => {
      if (mobile) {
        positions[d.id] = [(Math.random() - 0.5) * 11, (Math.random() - 0.5) * 15]
      } else {
        const a = Math.random() * Math.PI * 2
        const r = 6 + Math.random() * 5.5
        positions[d.id] = [Math.cos(a) * r, Math.sin(a) * r]
      }
    })
    save('occ.positions', JSON.stringify(positions))
    set({ positions })
  },
}))

function startDemo(set: any, get: any) {
  stopDemo()
  const tick = () => {
    const f = demoFrame()
    get().applyFrame(f.devices, f.aggregate, f.ts, 'demo')
  }
  tick()
  demoTimer = setInterval(tick, 2500)
}
function stopDemo() {
  if (demoTimer) { clearInterval(demoTimer); demoTimer = null }
}

// boot
export function bootStore() {
  const s = useStore.getState()
  // Always show the simulated fleet immediately.
  startDemo(null, useStore.getState)
  // The public static site never auto-dials a backend; it stays in demo until
  // the visitor explicitly connects their own. Self-hosted builds auto-link.
  if (IS_PUBLIC) return
  const savedMode = load('occ.mode', '')
  if (savedMode !== 'demo' && s.backendUrl) {
    fetch(s.backendUrl + '/api/health', { signal: AbortSignal.timeout(6000) })
      .then(r => r.json())
      .then(d => { if (d.ok) useStore.getState().connect(s.backendUrl) })
      .catch(() => { /* backend unreachable: remain in demo */ })
  }
}
