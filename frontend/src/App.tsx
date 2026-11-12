import React, { useEffect } from 'react'
import { Scene } from './components/Scene'
import { FleetBar } from './components/FleetBar'
import { DevicePanel } from './components/DevicePanel'
import { Toolbar } from './components/Toolbar'
import { FleetDeck } from './components/FleetDeck'
import { SettingsPanel } from './components/SettingsPanel'
import { ConnectModal, AddDeviceModal } from './components/Modals'
import { useStore, bootStore } from './store'
import { resumeAudio, setSoundEnabled } from './audio'

export default function App() {
  const devices = useStore(s => s.devices)
  const mode = useStore(s => s.mode)
  const theme = useStore(s => s.viz.theme)
  const sound = useStore(s => s.sound)
  const isDemo = mode === 'demo' || (devices.length > 0 && devices.every(d => d.demo))
  const liveEmpty = mode === 'live' && devices.length === 0
  useEffect(() => { bootStore() }, [])
  // Keep the audio module's mute flag in sync without creating a context early.
  useEffect(() => { setSoundEnabled(sound) }, [sound])
  // Unlock audio on the first user gesture (browser autoplay policy).
  useEffect(() => {
    const unlock = () => resumeAudio()
    window.addEventListener('pointerdown', unlock, { once: true })
    return () => window.removeEventListener('pointerdown', unlock)
  }, [])
  return (
    <div className="app" data-theme={theme}>
      <Scene />
      <FleetBar />
      <DevicePanel />
      <FleetDeck />
      <SettingsPanel />
      <Toolbar />
      <ConnectModal />
      <AddDeviceModal />
      {isDemo && <div className="demo-banner">SIMULATED FLEET — connect a backend for live telemetry</div>}
      {liveEmpty && <div className="live-banner">LIVE · NO DEVICES CONFIGURED — connect a backend</div>}
      <div className="scanlines" />
    </div>
  )
}
