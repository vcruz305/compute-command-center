import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Grid, Line, Stars } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import type { Device } from '../types'
import { DeviceModel, KIND_COLOR } from './DeviceModel'
import { DeviceHUD } from './DeviceHUD'

function Core() {
  const ref = useRef<THREE.Mesh>(null)
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.4
      ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.3) * 0.2
    }
    if (ring.current) ring.current.rotation.z = -clock.elapsedTime * 0.6
  })
  return (
    <group position={[0, 1.6, 0]}>
      <mesh ref={ref}>
        <icosahedronGeometry args={[0.7, 1]} />
        <meshBasicMaterial color="#22d3ee" wireframe transparent opacity={0.9} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.45, 0]} />
        <meshBasicMaterial color="#67e8f9" transparent opacity={0.6} />
      </mesh>
      <mesh ref={ring} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[1.2, 0.02, 8, 64]} />
        <meshBasicMaterial color="#22d3ee" transparent opacity={0.7} />
      </mesh>
      <pointLight color="#22d3ee" intensity={8} distance={20} />
    </group>
  )
}

function Connection({ from, to, color, active }: {
  from: [number, number, number]; to: [number, number, number]; color: string; active: boolean
}) {
  const pulse = useRef<THREE.Mesh>(null)
  const curve = useMemo(() => {
    const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to)
    const mid = a.clone().lerp(b, 0.5); mid.y += 2.2
    return new THREE.QuadraticBezierCurve3(a, mid, b)
  }, [from, to])
  const points = useMemo(() => curve.getPoints(40), [curve])
  const speed = useMemo(() => 0.25 + Math.random() * 0.3, [])
  useFrame(({ clock }) => {
    if (pulse.current) {
      const t = (clock.elapsedTime * speed) % 1
      const p = curve.getPoint(t)
      pulse.current.position.copy(p)
      const m = pulse.current.material as THREE.MeshBasicMaterial
      m.opacity = active ? 0.95 : 0.25
    }
  })
  return (
    <group>
      <Line points={points} color={color} transparent opacity={active ? 0.5 : 0.15} lineWidth={1.2} />
      <mesh ref={pulse}>
        <sphereGeometry args={[0.09, 12, 12]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}

function DeviceNode({ device, dragId, setDragId, controls, index }: {
  device: Device; dragId: string | null
  setDragId: (id: string | null) => void; controls: React.MutableRefObject<any>; index: number
}) {
  const positions = useStore(s => s.positions)
  const selectedId = useStore(s => s.selectedId)
  const select = useStore(s => s.select)
  const setPosition = useStore(s => s.setPosition)
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
      onPointerMove={(e) => {
        if (dragId) setPosition(dragId, e.point.x, e.point.z)
      }}
      onPointerUp={(e) => {
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
  const selectedId = useStore(s => s.selectedId)
  const [dragId, setDragId] = useState<string | null>(null)
  const controls = useRef<any>(null)
  const { size } = useThree()

  useEffect(() => {
    const up = () => {
      setDragId(null)
      if (controls.current) controls.current.enabled = true
      document.body.style.cursor = 'auto'
    }
    window.addEventListener('pointerup', up)
    return () => window.removeEventListener('pointerup', up)
  }, [])

  const online = devices.filter(d => d.status === 'online')
  return (
    <>
      <color attach="background" args={['#02040a']} />
      <fog attach="fog" args={['#02040a', 30, 70]} />
      <ambientLight intensity={0.3} />
      <pointLight position={[10, 15, 10]} intensity={1.2} color="#3b82f6" />
      <Stars radius={80} depth={40} count={size.width < 700 ? 1300 : 2500} factor={3} saturation={0} fade speed={0.5} />
      <Grid
        position={[0, 0, 0]}
        args={[80, 80]}
        cellSize={1}
        cellThickness={0.6}
        cellColor="#0e3a4a"
        sectionSize={5}
        sectionThickness={1.2}
        sectionColor="#155e75"
        fadeDistance={55}
        fadeStrength={2}
        followCamera={false}
        infiniteGrid
      />
      <Core />
      {devices.map(d => {
        const [x, z] = positions[d.id] || [0, 0]
        const color = d.status === 'offline' ? '#f87171' : (KIND_COLOR[d.kind] || '#22d3ee')
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
        minDistance={5}
        maxDistance={size.width < 700 ? 80 : 45}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, 1, 0]}
      />
      <EffectComposer>
        <Bloom intensity={1.1} luminanceThreshold={0.2} luminanceSmoothing={0.9} mipmapBlur />
        <Vignette eskil={false} offset={0.2} darkness={0.85} />
      </EffectComposer>
    </>
  )
}

export function Scene() {
  // Give the canvas container explicit pixel dimensions so R3F measures a real
  // size on mount (its resize observer can miss the initial layout in some
  // environments). Track window resizes / orientation changes ourselves.
  const [size, setSize] = useState({ w: window.innerWidth, h: window.innerHeight })
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
  // Pull the camera back and widen FOV on portrait phones so the whole fleet
  // ring stays in frame; cap pixel ratio on touch/small screens for fluid orbit.
  const camera = useMemo(() => portrait
    ? { position: [0, 23, 42] as [number, number, number], fov: 58 }
    : { position: [0, 14, 20] as [number, number, number], fov: 50 }, [portrait])
  const dprMax = coarse || small ? 1.5 : 1.75
  return (
    <div className="scene-wrap" style={{ width: size.w, height: size.h }}>
      <Canvas
        camera={camera}
        dpr={[1, dprMax]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
        onPointerMissed={() => useStore.getState().select(null)}
      >
        <SceneContent />
      </Canvas>
    </div>
  )
}
