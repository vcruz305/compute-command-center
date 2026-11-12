import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Stars, Html } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { themeById } from '../themes'
import type { Device } from '../types'
import { DeviceModel, KIND_COLOR } from './DeviceModel'
import { DeviceHUD } from './DeviceHUD'

function Core() {
  const theme = themeById(useStore(s => s.viz.theme))
  const network = useStore(s => s.network)
  const ref = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.4
      ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.2
    }
    if (ring.current) ring.current.rotation.z = -clock.elapsedTime * 0.6
  })
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 640
  const hasNet = !!network
  const isTs = network?.type === 'tailscale'
  const typeLabel = !hasNet ? 'LINKING' : isTs ? 'TAILSCALE' : network?.type === 'internal' ? 'INTERNAL LAN' : 'NETWORK'
  const ip = (v: string | null | undefined) => (hasNet ? (v || 'N/A') : '…')
  return (
    <group position={[0, 1.6, 0]}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshBasicMaterial color={theme.accent} wireframe transparent opacity={0.9} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshBasicMaterial color={theme.particle} transparent opacity={0.6} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.02, 8, 64]} />
        <meshBasicMaterial color={theme.accent} transparent opacity={0.7} />
      </mesh>
      <pointLight color={theme.accent} intensity={8} distance={20} />
      <Html position={[0, 2.1, 0]} center distanceFactor={isMobile ? undefined : 12} zIndexRange={[8, 0]}>
        <div className={`net-core ${isTs ? 'net-ts' : 'net-lan'}`} style={{ '--net-color': theme.accent } as React.CSSProperties}>
          <div className="net-head">
            <span className="net-ico">{isTs ? '⬡' : '⌗'}</span>
            <span className="net-title">NETWORK CORE</span>
            <span className="net-type">{typeLabel}</span>
          </div>
          {hasNet && network?.name && <div className="net-name">{network.name}</div>}
          <div className="net-ips">
            <div className="net-ip"><span className="net-ip-k">INTERNAL</span><span className="net-ip-v">{ip(network?.internal_ip)}</span></div>
            <div className="net-ip"><span className="net-ip-k">EXTERNAL</span><span className="net-ip-v">{ip(network?.external_ip)}</span></div>
          </div>
        </div>
      </Html>
    </group>
  )
}

function Connection({ from, to, color, active }: {
  from: [number, number, number]; to: [number, number, number]; color: string; active: boolean
}) {
  const flowSpeed = useStore(s => s.viz.flowSpeed)
  const pulses = useRef<(THREE.Mesh | null)[]>([])
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const mid = a.clone().lerp(b, 0.5); mid.y += 2.2
    return new THREE.QuadraticBezierCurve3(a, mid, b)
  }, [from, to])
  const points = useMemo(() => curve.getPoints(40), [curve])
  const speed = useMemo(() => 0.25 + Math.random() * 0.3, [])
  useFrame(({ clock }) => {
    for (let i = 0; i < 3; i++) {
      const m = pulses.current[i]
      if (!m) continue
      const t = (clock.elapsedTime * speed * flowSpeed + i / 3) % 1
      m.position.copy(curve.getPoint(t))
      const mat = m.material as THREE.MeshBasicMaterial
      mat.opacity = flowSpeed < 0.02 ? 0 : active ? 0.95 : 0.22
    }
  })
  return (
    <group>
      <Line points={points} color={color} transparent opacity={active ? 0.5 : 0.15} lineWidth={1.2} />
      {[0, 1, 2].map(i => (
        <mesh key={i} ref={el => { pulses.current[i] = el }}>
          <sphereGeometry args={[i === 0 ? 0.1 : 0.07, 12, 12]} />
          <meshBasicMaterial color={color} transparent opacity={0.9} />
        </mesh>
      ))}
    </group>
  )
}

// Slow-drifting atmosphere motes; density + color are live controls.
function Particles() {
  const viz = useStore(s => s.viz)
  const theme = themeById(viz.theme)
  const max = viz.quality === 'low' ? 220 : viz.quality === 'med' ? 460 : 820
  const geo = useMemo(() => {
    const n = 820
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 70
      pos[i * 3 + 1] = Math.random() * 18
      pos[i * 3 + 2] = (Math.random() - 0.5) * 70
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [])
  useEffect(() => () => geo.dispose(), [geo])
  const count = Math.floor(max * viz.particles)
  useEffect(() => { geo.setDrawRange(0, count) }, [count, geo])
  const ref = useRef<THREE.Points>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.02
      ref.current.position.y = Math.sin(clock.elapsedTime * 0.15) * 0.4
    }
  })
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial color={theme.particle} size={0.07} sizeAttenuation transparent opacity={0.55} depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  )
}

function DeviceNode({ device, dragId, setDragId, controls, index }: {
  device: Device; dragId: string | null
  setDragId: (id: string | null) => void; controls: React.MutableRefObject<any>; index: number
}) {
  const positions = useStore(s => s.positions)
  const selectedId = useStore(s => s.selectedId)
  const select = useStore(s => s.select)
  const [x, z] = positions[device.id] || [0, 0]
  const selected = selectedId === device.id
  const downPos = useRef<[number, number] | null>(null)
  // Larger machines on phones so the fleet reads as substantial, not tiny.
  const boost = typeof window !== 'undefined' && window.innerWidth < 640 ? 1.45 : 1

  const onDown = useCallback((e: any) => {
    e.stopPropagation()
    select(device.id)
    downPos.current = [e.clientX, e.clientY]
    setDragId(device.id)
    if (controls.current) controls.current.enabled = false
    try { e.target.setPointerCapture(e.pointerId) } catch {}
  }, [device.id, select, setDragId, controls])

  return (
    <group
      position={[x, 0, z]}
      onPointerDown={onDown}
      onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'grab' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      <group scale={boost}>
        <DeviceModel device={device} selected={selected} hovered={false} />
      </group>
      <DeviceHUD device={device} selected={selected} onSelect={() => select(device.id)} lift={0} />
    </group>
  )
}

function DragPlane({ dragId, setDragId, controls }: {
  dragId: string | null; setDragId: (id: string | null) => void; controls: React.MutableRefObject<any>
}) {
  const setPosition = useStore(s => s.setPosition)
  if (!dragId) return null
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0.01, 0]}
      onPointerMove={(e) => { if (dragId) setPosition(dragId, e.point.x, e.point.z) }}
      onPointerUp={() => {
        setDragId(null)
        if (controls.current) controls.current.enabled = true
        document.body.style.cursor = 'auto'
      }}
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function SceneContent() {
  const devices = useStore(s => s.devices)
  const positions = useStore(s => s.positions)
  const viz = useStore(s => s.viz)
  const resetNonce = useStore(s => s.resetCamNonce)
  const theme = themeById(viz.theme)
  const [dragId, setDragId] = useState<string | null>(null)
  const controls = useRef<any>(null)
  const { size, camera } = useThree()

  useEffect(() => {
    const up = () => {
      setDragId(null)
      if (controls.current) controls.current.enabled = true
      document.body.style.cursor = 'auto'
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  // Camera reset (Control Deck "⟲ Cam"): restore the framing for this viewport.
  useEffect(() => {
    if (resetNonce === 0) return
    const portrait = size.width / Math.max(size.height, 1) < 0.85
    const p = portrait ? [0, 23, 42] : [0, 14, 20]
    camera.position.set(p[0], p[1], p[2])
    if (controls.current) { controls.current.target.set(0, 1, 0); controls.current.update() }
  }, [resetNonce, size.width, size.height, camera])

  return (
    <>
      <color attach="background" args={['#02040a']} />
      <fog attach="fog" args={['#02040a', 30, 72]} />
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 15, 10]} intensity={1.2} color={theme.accent2} />
      <pointLight position={[-12, 8, -10]} intensity={0.6} color={theme.accent} />
      <Stars radius={80} depth={40} count={size.width < 700 ? 1300 : 2500} factor={3} saturation={0} fade speed={0.5} />
      {viz.grid && (
        <Grid
          position={[0, 0, 0]}
          args={[80, 80]}
          cellSize={1}
          cellThickness={0.6}
          cellColor={theme.gridCell}
          sectionSize={5}
          sectionThickness={1.2}
          sectionColor={theme.grid}
          fadeDistance={55}
          fadeStrength={2}
          followCamera={false}
          infiniteGrid
        />
      )}
      <Particles />
      <Core />
      {viz.links && devices.map(d => {
        const [x, z] = positions[d.id] || [0, 0]
        const color = d.status === 'offline' ? '#f87171' : (KIND_COLOR[d.kind] || theme.accent)
        return (
          <Connection
            key={'c-' + d.id}
            from={[x, 1.2, z]}
            to={[0, 1.6, 0]}
            color={color}
            active={d.status === 'online'}
          />
        )
      })}
      {devices.map((d, i) => (
        <DeviceNode key={d.id} device={d} dragId={dragId} setDragId={setDragId} controls={controls} index={i} />
      ))}
      <DragPlane dragId={dragId} setDragId={setDragId} controls={controls} />
      <OrbitControls
        ref={controls}
        enableDamping
        dampingFactor={0.08}
        autoRotate={viz.autoOrbit}
        autoRotateSpeed={viz.orbitSpeed}
        minDistance={5}
        maxDistance={size.width < 700 ? 80 : 45}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1, 0]}
      />
      {viz.quality !== 'low' && (
        <EffectComposer>
          <Bloom intensity={viz.bloom} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
          <Vignette eskil={false} offset={0.2} darkness={0.85} />
        </EffectComposer>
      )}
    </>
  )
}

export function Scene() {
  // Give the canvas container explicit pixel dimensions so R3F measures a real
  // size on mount. Track window resizes / orientation changes ourselves.
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
  const viz = useStore(s => s.viz)
  useEffect(() => {
    const full = () => setSize({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', full)
    window.addEventListener('orientationchange', full)
    return () => { window.removeEventListener('resize', full); window.removeEventListener('orientationchange', full) }
  }, [])
  const aspect = size.w / Math.max(size.h, 1)
  const portrait = aspect < 0.85
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  const small = size.w < 700
  const camera = useMemo(() => portrait
    ? { position: [0, 23, 42] as [number, number, number], fov: 58 }
    : { position: [0, 14, 20] as [number, number, number], fov: 50 }, [portrait])
  const deviceCap = coarse || small ? 1.5 : 1.75
  const qualCap = viz.quality === 'low' ? 1 : viz.quality === 'med' ? 1.5 : 2
  const dprMax = Math.min(deviceCap, qualCap)
  return (
    <div className="scene-wrap" style={{ width: size.w, height: size.h }}>
      <Canvas
        camera={camera}
        dpr={[1, dprMax]}
        gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
        onPointerMissed={() => useStore.getState().select(null)}
      >
        <SceneContent />
      </Canvas>
    </div>
  )
}
