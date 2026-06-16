'use client'

import { useEffect, useState } from 'react'
import { Fingerprint } from 'lucide-react'

/**
 * Fingerprint reader connection indicator.
 * Shows a green fingerprint icon with a pulsing dot when the reader is live.
 * Renders nothing when disconnected or when not running inside Electron.
 *
 * Connection state is driven by CustomEvents (`fp:device-status`) dispatched
 * by GlobalFingerprintListener whenever the device connects or disconnects.
 */
export default function FingerprintStatusBadge({ iconClassName = 'w-5 h-5', className = '' }) {
  const [connected, setConnected] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
    // Sync with state that GlobalFingerprintListener may have already set.
    setConnected(!!window.__fpDeviceConnected)

    const onStatus = (e) => setConnected(!!e.detail?.connected)
    window.addEventListener('fp:device-status', onStatus)
    return () => window.removeEventListener('fp:device-status', onStatus)
  }, [])

  // SSR guard — render nothing until we're on the client.
  if (!mounted) return null
  // Only visible inside Electron (fingerprint IPC present).
  if (!window.electronAPI?.identifyFingerprint) return null
  // Nothing when disconnected (user-visible only when reader is live).
  if (!connected) return null

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      title="Fingerprint reader connected"
    >
      <Fingerprint className={`${iconClassName} text-green-500`} />
      <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-green-500 ring-2 ring-white dark:ring-gray-900 animate-pulse" />
    </div>
  )
}
