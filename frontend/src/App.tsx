import React, { useEffect } from 'react'
import { Scene } from './components/Scene'
import { FleetBar } from './components/FleetBar'
import { DevicePanel } from './components/DevicePanel'
import { Toolbar } from './components/Toolbar'
import { ConnectModal, AddDeviceModal } from './components/Modals'
import { useStore, bootStore } from './store'

export default function App() {
  const devices = useStore(s => s.devices)
  const mode = useStore(s => s.mode)
  const isDemo = mode === 'demo' || (devices.length > 0 && devices.every(d => d.demo))
  useEffect(() => { bootStore() }, [])
  return (
    <div className="app">
      <Scene />
      <FleetBar />
      <DevicePanel />
      <Toolbar />
      <ConnectModal />
      <AddDeviceModal />
      {isDemo && <div className="demo-banner">SIMULATED FLEET — connect a backend for live telemetry</div>}
      <div className="scanlines" />
    </div>
  )
}
