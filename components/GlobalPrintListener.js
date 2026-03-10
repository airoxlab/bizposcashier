'use client'

import { useEffect } from 'react'
import { networkPrintListener } from '../lib/networkPrintListener'
import { authManager } from '../lib/authManager'

/**
 * Global Print Listener Component
 * Runs on all pages to listen for network print jobs if this is a print server
 */
export default function GlobalPrintListener() {
  useEffect(() => {
    const initializePrintListener = async () => {
      try {
        // Check if user is logged in
        if (!authManager.isLoggedIn()) {
          return
        }

        const userData = authManager.getCurrentUser()
        if (!userData?.id) {
          return
        }

        // Set user ID in listener
        networkPrintListener.setUserId(userData.id)

        // Check if this terminal is configured as a print server
        const isServerStr = localStorage.getItem('is_print_server')
        const isServer = isServerStr === 'true'

        if (isServer) {
          console.log('🌐 Global Print Listener: Starting on all pages (Server Mode ON)')
          networkPrintListener.setIsServer(true)
          await networkPrintListener.startListening()
        } else {
          console.log('📴 Global Print Listener: Not a server (Server Mode OFF)')
        }
      } catch (error) {
        console.error('❌ Error initializing global print listener:', error)
      }
    }

    // Initialize listener when component mounts
    initializePrintListener()

    // Cleanup on unmount
    return () => {
      // Don't stop listening on page navigation - keep it running globally
      console.log('🔄 Page changed, but keeping print listener active')
    }
  }, [])

  // This component renders nothing - it's just for side effects
  return null
}
