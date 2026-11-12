import React, { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges } from '@react-three/drei'
import * as THREE from 'three'
import type { Device } from '../types'

const CYAN = '#22d3ee'
const BLUE = '#3b82f6'
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

// Translucent holographic body with glowing edges.
function HoloBody({ size, color, opacity = 0.16, emissive = 0.55 }: {
  size: [number, number, number]; color: string; opacity?: number; emissive?: number
}) {
  const mat = useRef<THREE.MeshPhysicalMaterial>(null)
  useFrame(({ clock }) => {
    if (mat.current) {
      mat.current.emissiveIntensity = emissive + Math.sin(clock.elapsedTime * 2.2) * 0.18
    }
  })
  return (
    <mesh>
      <boxGeometry args={size} />
      <meshPhysicalMaterial
        ref={mat}
        color={color}
        emissive={color}
        emissiveIntensity={emissive}
        transparent
        opacity={opacity}
        roughness={0.15}
        metalness={0.6}
        side={THREE.DoubleSide}
        depthWrite={false}
      />
      <Edges scale={1.001} threshold={15} color={color} />
    </mesh>
  )
}

function CircuitLines({ w, h, d, color }: { w: number; h: number; d: number; color: string }) {
  const lines = useMemo(() => {
    const arr: { pos: [number, number, number]; size: [number, number, number] }[] = []
    for (let i = 0; i < 4; i++) {
      arr.push({ pos: [0, -h / 2 + (h / 5) * (i + 1), d / 2 + 0.001], size: [w * 0.8, 0.02, 0.001] })
    }
    return arr
  }, [w, h, d])
  return (
    <group>
      {lines.map((l, i) => (
        <mesh key={i} position={l.pos}>
          <boxGeometry args={l.size} />
          <meshBasicMaterial color={color} transparent opacity={0.7} />
        </mesh>
      ))}
    </group>
  )
}

function BaseRing({ color, radius }: { color: string; radius: number }) {
  const ring = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (ring.current) ring.current.rotation.z = clock.elapsedTime * 0.5
  })
  return (
    <group position={[0, 0.02, 0]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius, radius + 0.06, 48]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} side={THREE.DoubleSide} />
      </mesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[radius + 0.18, radius + 0.22, 48, 1, 0, Math.PI * 1.4]} />
        <meshBasicMaterial color={color} transparent opacity={0.5} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function SparkModel({ color }: { color: string }) {
  // DGX Spark: compact desktop unit, gold accent
  return (
    <group>
      <HoloBody size={[1.9, 1.0, 1.9]} color={color} opacity={0.2} />
      <HoloBody size={[1.5, 0.28, 1.5]} color={GOLD} opacity={0.3} emissive={0.8} />
      <CircuitLines w={1.9} h={1.0} d={1.9} color={CYAN} />
      <mesh position={[0, 0.52, 0]}>
        <boxGeometry args={[0.6, 0.04, 0.6]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.9} />
      </mesh>
    </group>
  )
}
function MacMiniModel({ color }: { color: string }) {
  return (
    <group>
      <HoloBody size={[2.0, 0.5, 2.0]} color={color} opacity={0.2} />
      <CircuitLines w={2.0} h={0.5} d={2.0} color={CYAN} />
      <mesh position={[0, 0.26, 0]}>
        <cylinderGeometry args={[0.35, 0.35, 0.02, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.7} />
      </mesh>
    </group>
  )
}
function MacStudioModel({ color }: { color: string }) {
  return (
    <group>
      <HoloBody size={[1.8, 1.3, 1.8]} color={color} opacity={0.2} />
      <CircuitLines w={1.8} h={1.3} d={1.8} color={CYAN} />
      <mesh position={[0, 0, 0.91]}>
        <boxGeometry args={[1.2, 0.8, 0.01]} />
        <meshBasicMaterial color={color} transparent opacity={0.35} />
      </mesh>
    </group>
  )
}
function GpuServerModel({ color }: { color: string }) {
  // rack server: wide, stacked units with drive bays
  return (
    <group>
      <HoloBody size={[3.0, 1.5, 1.6]} color={color} opacity={0.16} />
      {[-0.45, 0, 0.45].map((y, i) => (
        <group key={i} position={[0, y, 0]}>
          <HoloBody size={[2.8, 0.34, 1.4]} color={color} opacity={0.22} emissive={0.7} />
          {[-1.0, -0.5, 0, 0.5, 1.0].map((x, j) => (
            <mesh key={j} position={[x, 0, 0.71]}>
              <boxGeometry args={[0.32, 0.2, 0.01]} />
              <meshBasicMaterial color={j % 2 ? GOLD : CYAN} transparent opacity={0.7} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  )
}

export function DeviceModel({ device, selected, hovered }: {
  device: Device; selected: boolean; hovered: boolean
}) {
  const color = statusColor(device)
  const group = useRef<THREE.Group>(null)
  const beam = useRef<THREE.Mesh>(null)
  const activity = device.metrics?.gpus?.[0]?.util_pct ?? 0
  useFrame(({ clock }) => {
    if (group.current) {
      group.current.position.y = 0.9 + Math.sin(clock.elapsedTime * 1.2 + device.id.length) * 0.06
    }
    if (beam.current) {
      const m = beam.current.material as THREE.MeshBasicMaterial
      m.opacity = 0.12 + (activity / 100) * 0.25 + Math.sin(clock.elapsedTime * 3) * 0.04
    }
  })
  const Model = device.kind === 'dgx-spark' ? SparkModel
    : device.kind === 'mac-mini' ? MacMiniModel
    : device.kind === 'mac-studio' ? MacStudioModel
    : device.kind === 'gpu-server' ? GpuServerModel : SparkModel
  const ringRadius = device.kind === 'gpu-server' ? 2.1 : 1.5
  return (
    <group>
      <BaseRing color={color} radius={ringRadius} />
      {/* holographic projection beam */}
      <mesh ref={beam} position={[0, 1.6, 0]}>
        <cylinderGeometry args={[ringRadius * 0.7, ringRadius * 0.95, 3.2, 32, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
      <group ref={group}>
        <Model color={color} />
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.85, 0]}>
            <ringGeometry args={[ringRadius + 0.3, ringRadius + 0.42, 48]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>
        )}
      </group>
    </group>
  )
}
