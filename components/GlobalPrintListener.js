'use client'

import { useEffect } from 'react'
import { networkPrintListener } from '../lib/networkPrintListener'
import { authManager } from '../lib/authManager'
import { profileManager } from '../lib/profileManager'

export default function GlobalPrintListener() {
  useEffect(() => {
    const initialize = async () => {
      try {
        if (!authManager.isLoggedIn()) return

        const userData = authManager.getCurrentUser()
        if (!userData?.id) return

        // Refresh profile from DB into cache on every app load so receipts
        // always reflect the latest settings without the user visiting Settings.
        profileManager.fetchProfileFromDatabase().catch(() => {})

        // Wire up network print server if this terminal is configured as one
        networkPrintListener.setUserId(userData.id)
        const isServer = localStorage.getItem('is_print_server') === 'true'
        if (isServer) {
          networkPrintListener.setIsServer(true)
          await networkPrintListener.startListening()
        }
      } catch (error) {
        console.error('❌ Error initializing global listener:', error)
      }
    }

    initialize()

    return () => {
      // Keep print listener alive across page navigations
    }
  }, [])

  return null
}
