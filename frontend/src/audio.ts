// Subtle control-room audio, fully synthesized (no assets). A very quiet,
// slowly-breathing ambient pad plus short soft blips tied to visible actions.
// The context is created lazily and only resumes after a user gesture.
let ctx: AudioContext | null = null
let master: GainNode | null = null
let ambientGain: GainNode | null = null
let ambientNodes: OscillatorNode[] = []
let enabled = true

function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || (window as any).webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = enabled ? 1 : 0
    master.connect(ctx.destination)
  }
  return ctx
}

function startAmbient() {
  const c = ensure()
  if (!c || !master || ambientGain) return
  ambientGain = c.createGain()
  ambientGain.gain.value = 0
  const filter = c.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 240
  filter.Q.value = 0.6
  ambientGain.connect(filter)
  filter.connect(master)
  const freqs = [55, 55.6, 110.4]
  freqs.forEach((f, i) => {
    const o = c.createOscillator()
    o.type = i === 2 ? 'sine' : 'triangle'
    o.frequency.value = f
    const g = c.createGain()
    g.gain.value = i === 2 ? 0.1 : 0.2
    o.connect(g)
    g.connect(ambientGain!)
    o.start()
    ambientNodes.push(o)
  })
  // Slow breathing LFO on the pad level.
  const lfo = c.createOscillator()
  lfo.frequency.value = 0.07
  const lfoGain = c.createGain()
  lfoGain.gain.value = 0.012
  lfo.connect(lfoGain)
  lfoGain.connect(ambientGain.gain)
  lfo.start()
  ambientNodes.push(lfo)
  ambientGain.gain.setTargetAtTime(0.05, c.currentTime, 2.5)
}

function stopAmbient() {
  if (!ctx || !ambientGain) return
  ambientGain.gain.setTargetAtTime(0, ctx.currentTime, 0.4)
  const nodes = ambientNodes
  const g = ambientGain
  ambientNodes = []
  ambientGain = null
  setTimeout(() => { nodes.forEach(n => { try { n.stop() } catch {} }); try { g.disconnect() } catch {} }, 1200)
}

export function setSoundEnabled(v: boolean) {
  enabled = v
  if (!ctx || !master) return // don't create a context before a user gesture
  master.gain.setTargetAtTime(v ? 1 : 0, ctx.currentTime, 0.15)
  if (v) { if (ctx.state === 'running') startAmbient() } else stopAmbient()
}

// Call from a user gesture to unlock audio and (re)start the pad if enabled.
export function resumeAudio() {
  const c = ensure()
  if (!c) return
  if (c.state === 'suspended') c.resume().catch(() => {})
  if (enabled && c.state === 'running') startAmbient()
}

export type BlipKind = 'select' | 'toggle' | 'mode' | 'tick' | 'export'
export function blip(kind: BlipKind = 'toggle') {
  if (!enabled) return
  const c = ensure()
  if (!c || !master || c.state !== 'running') return
  const t = c.currentTime
  const o = c.createOscillator()
  const g = c.createGain()
  o.type = 'sine'
  const f = kind === 'select' ? 740 : kind === 'mode' ? 520 : kind === 'export' ? 980 : kind === 'tick' ? 1240 : 620
  o.frequency.setValueAtTime(f, t)
  o.frequency.exponentialRampToValueAtTime(Math.max(80, f * 0.6), t + 0.09)
  const peak = kind === 'tick' ? 0.02 : 0.05
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(peak, t + 0.012)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
  o.connect(g)
  g.connect(master)
  o.start(t)
  o.stop(t + 0.16)
}
