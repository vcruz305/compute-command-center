import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, RoundedBox } from '@react-three/drei'
import * as THREE from 'three'
import type { Device } from '../types'
import { useStore } from '../store'

const CYAN = '#22d3ee'
const GOLD = '#fbbf24'

export const KIND_COLOR: Record<string, string> = {
  'dgx-spark': GOLD,
  'mac-mini': '#7dd3fc',
  'mac-studio': '#a5b4fc',
  'gpu-server': CYAN,
  generic: '#5eead4',
}

function statusColor(d: Device) {
  if (d.status === 'offline') return '#f87171'
  if (d.status === 'connecting') return '#fbbf24'
  return KIND_COLOR[d.kind] || CYAN
}

/* ---------- logo / emblem textures (drawn once, cached) ---------- */
const APPLE_PATH =
  'M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z'

const texCache: Record<string, THREE.CanvasTexture> = {}
function logoTexture(kind: 'apple' | 'nvidia'): THREE.CanvasTexture {
  if (texCache[kind]) return texCache[kind]
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')!
  g.clearRect(0, 0, 256, 256)
  if (kind === 'apple') {
    const p = new Path2D(APPLE_PATH)
    g.save()
    g.translate(128 - (384 * 0.34) / 2, 128 - (512 * 0.34) / 2)
    g.scale(0.34, 0.34)
    g.shadowColor = 'rgba(255,255,255,0.9)'
    g.shadowBlur = 14
    g.fillStyle = 'rgba(235,242,248,0.95)'
    g.fill(p)
    g.restore()
  } else {
    g.font = '700 44px Orbitron, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.shadowColor = 'rgba(251,191,36,0.9)'
    g.shadowBlur = 16
    g.fillStyle = 'rgba(255,235,180,0.95)'
    g.fillText('NVIDIA', 128, 118)
    g.font = '500 20px Rajdhani, sans-serif'
    g.fillStyle = 'rgba(255,235,180,0.6)'
    g.fillText('DGX SPARK', 128, 160)
  }
  const t = new THREE.CanvasTexture(c)
  t.anisotropy = 4
  texCache[kind] = t
  return t
}

function Logo({ kind, size, y }: { kind: 'apple' | 'nvidia'; size: number; y: number }) {
  const tex = useMemo(() => logoTexture(kind), [kind])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]}>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.95} />
    </mesh>
  )
}

/* ---------- semi-solid metallic body with glowing edges ---------- */
function Body({ size, radius = 0.1, color, finish, opacity = 0.72, emissive = 0.3 }: {
  size: [number, number, number]; radius?: number; color: string; finish: string
  opacity?: number; emissive?: number
}) {
  const mat = useRef<THREE.MeshPhysicalMaterial>(null)
  const hologram = useStore(s => s.viz.hologram)
  useFrame(({ clock }) => {
    if (mat.current) mat.current.emissiveIntensity = (hologram ? emissive + 0.6 : emissive) + Math.sin(clock.elapsedTime * 2.0) * 0.1
  })
  return (
    <RoundedBox args={size} radius={radius} smoothness={4} creaseAngle={0.4}>
      <meshPhysicalMaterial
        ref={mat}
        color={finish}
        emissive={color}
        emissiveIntensity={emissive}
        transparent
        opacity={hologram ? 0.16 : opacity}
        wireframe={hologram}
        roughness={0.28}
        metalness={0.9}
        clearcoat={0.6}
        clearcoatRoughness={0.25}
      />
      <Edges scale={1.002} threshold={28} color={color} />
    </RoundedBox>
  )
}

/* Radial ground glow (replaces the old cone beam). */
let glowTex: THREE.CanvasTexture | null = null
function groundGlowTexture(): THREE.CanvasTexture {
  if (glowTex) return glowTex
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64)
  grad.addColorStop(0, 'rgba(255,255,255,0.9)')
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)')
  grad.addColorStop(1, 'rgba(255,255,255,0)')
  g.fillStyle = grad
  g.fillRect(0, 0, 128, 128)
  glowTex = new THREE.CanvasTexture(c)
  return glowTex
}
function GroundGlow({ color, radius }: { color: string; radius: number }) {
  const tex = useMemo(() => groundGlowTexture(), [])
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
      <planeGeometry args={[radius * 2.6, radius * 2.6]} />
      <meshBasicMaterial map={tex} color={color} transparent opacity={0.4} depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  )
}

function BaseRing({ color, radius }: { color: string; radius: number }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => { if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.5 })
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.05, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.75} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 0.16, radius + 0.2, 48, 1, 0, Math.PI * 1.4]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/* ---------- accurate device meshes ---------- */
// Real proportions (mm): DGX Spark 150x150x50.5 (gold), Mac mini M4 127x127x50,
// Mac Studio 197x197x95 (silver). Scale: 150mm -> 2.0 scene units.
function SparkModel({ color }: { color: string }) {
  const w = 2.0, h = 0.67, d = 2.0
  return (
    <group>
      <Body size={[w, h, d]} radius={0.12} color={color} finish="#c9973b" opacity={0.8} emissive={0.34} />
      {/* recessed top panel */}
      <mesh position={[0, h / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w * 0.82, d * 0.82]} />
        <meshBasicMaterial color="#8a6a24" transparent opacity={0.35} depthWrite={false} />
      </mesh>
      <Logo kind="nvidia" size={1.15} y={h / 2 + 0.012} />
      {/* front status LED + vent line */}
      <mesh position={[0, -h * 0.1, d / 2 + 0.004]}>
        <boxGeometry args={[w * 0.6, 0.02, 0.006]} />
        <meshBasicMaterial color={CYAN} transparent opacity={0.8} />
      </mesh>
      <mesh position={[w * 0.36, -h * 0.1, d / 2 + 0.006]}>
        <sphereGeometry args={[0.025, 12, 12]} />
        <meshBasicMaterial color="#4ade80" />
      </mesh>
    </group>
  )
}

function MacMiniModel({ color }: { color: string }) {
  const w = 1.69, h = 0.67, d = 1.69
  return (
    <group>
      <Body size={[w, h, d]} radius={0.16} color={color} finish="#c3cad2" opacity={0.78} emissive={0.24} />
      <Logo kind="apple" size={0.62} y={h / 2 + 0.012} />
      {/* front power LED */}
      <mesh position={[w * 0.3, -h * 0.18, d / 2 + 0.005]}>
        <sphereGeometry args={[0.02, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
    </group>
  )
}

function MacStudioModel({ color }: { color: string }) {
  const w = 2.63, h = 1.27, d = 2.63
  return (
    <group>
      <Body size={[w, h, d]} radius={0.2} color={color} finish="#c3cad2" opacity={0.78} emissive={0.24} />
      <Logo kind="apple" size={0.85} y={h / 2 + 0.014} />
      {/* front SD slot + LED */}
      <mesh position={[-w * 0.22, -h * 0.3, d / 2 + 0.004]}>
        <boxGeometry args={[0.34, 0.03, 0.006]} />
        <meshBasicMaterial color="#3a4652" transparent opacity={0.9} />
      </mesh>
      <mesh position={[w * 0.3, -h * 0.3, d / 2 + 0.006]}>
        <sphereGeometry args={[0.022, 10, 10]} />
        <meshBasicMaterial color="#ffffff" />
      </mesh>
      {/* base vent shadow line */}
      <mesh position={[0, -h / 2 + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[w * 0.42, w * 0.46, 40]} />
        <meshBasicMaterial color={color} transparent opacity={0.3} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

function GpuServerModel({ color }: { color: string }) {
  // 4U rack chassis: wide, deep, with front drive bays, vents and status LEDs.
  const w = 3.4, h = 1.05, d = 2.2
  const bays = useMemo(() => {
    const arr: { x: number; y: number }[] = []
    for (let r = 0; r < 2; r++) for (let c = 0; c < 5; c++)
      arr.push({ x: -1.15 + c * 0.47, y: 0.16 - r * 0.34 })
    return arr
  }, [])
  return (
    <group>
      <Body size={[w, h, d]} radius={0.04} color={color} finish="#131c26" opacity={0.82} emissive={0.26} />
      {/* rack mounting ears */}
      {[-1, 1].map(s => (
        <mesh key={s} position={[s * (w / 2 + 0.06), 0, d * 0.18]}>
          <boxGeometry args={[0.12, h * 0.94, 0.1]} />
          <meshPhysicalMaterial color="#0c131b" metalness={0.8} roughness={0.4} transparent opacity={0.9} emissive={color} emissiveIntensity={0.15} />
        </mesh>
      ))}
      {/* front drive bays */}
      {bays.map((b, i) => (
        <group key={i} position={[b.x, b.y, d / 2 + 0.012]}>
          <mesh>
            <boxGeometry args={[0.4, 0.26, 0.02]} />
            <meshPhysicalMaterial color="#0a1118" metalness={0.7} roughness={0.5} transparent opacity={0.95} emissive={color} emissiveIntensity={0.12} />
          </mesh>
          <mesh position={[0.14, 0, 0.014]}>
            <sphereGeometry args={[0.02, 8, 8]} />
            <meshBasicMaterial color={i % 3 === 0 ? '#4ade80' : CYAN} />
          </mesh>
        </group>
      ))}
      {/* vent slots on the right of the front */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} position={[1.35, 0.3 - i * 0.16, d / 2 + 0.012]}>
          <boxGeometry args={[0.5, 0.05, 0.01]} />
          <meshBasicMaterial color={color} transparent opacity={0.35} />
        </mesh>
      ))}
      {/* glowing trim across the front */}
      <mesh position={[0, -h / 2 + 0.06, d / 2 + 0.014]}>
        <boxGeometry args={[w * 0.94, 0.025, 0.006]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      {/* internal GPU glow */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[w * 0.7, h * 0.4, d * 0.5]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  )
}

function GenericModel({ color }: { color: string }) {
  return (
    <group>
      <Body size={[1.8, 0.8, 1.8]} radius={0.12} color={color} finish="#1c2a36" opacity={0.75} emissive={0.3} />
      <mesh position={[0, 0.41, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.3, 0.36, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </group>
  )
}

export function DeviceModel({ device, selected }: { device: Device; selected: boolean; hovered?: boolean }) {
  const color = statusColor(device)
  const group = useRef<THREE.Group>(null)
  const activity = device.metrics?.gpus?.[0]?.util_pct ?? 0
  useFrame(({ clock }) => {
    if (group.current) group.current.position.y = 1.0 + Math.sin(clock.elapsedTime * 1.2 + device.id.length) * 0.06
  })
  const Model = device.kind === 'dgx-spark' ? SparkModel
    : device.kind === 'mac-mini' ? MacMiniModel
    : device.kind === 'mac-studio' ? MacStudioModel
    : device.kind === 'gpu-server' ? GpuServerModel : GenericModel
  const ringRadius = device.kind === 'gpu-server' ? 2.2 : device.kind === 'mac-studio' ? 1.8 : 1.45
  return (
    <group>
      <GroundGlow color={color} radius={ringRadius} />
      <BaseRing color={color} radius={ringRadius} />
      <group ref={group}>
        <Model color={color} />
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.95, 0]}>
            <ringGeometry args={[ringRadius + 0.28, ringRadius + 0.4, 48]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  )
}
