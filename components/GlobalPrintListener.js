'use client'

import { useEffect, useRef } from 'react'
import { networkPrintListener } from '../lib/networkPrintListener'
import { authManager } from '../lib/authManager'
import { profileManager } from '../lib/profileManager'
import { supabase } from '../lib/supabase'

export default function GlobalPrintListener() {
  const lastSyncedIp = useRef(null)

  useEffect(() => {
    // Publishes this PC's LAN IP to users.print_server_ip whenever it changes —
    // but only when this terminal is the print server. Runs on app load and on
    // an interval, so a network / DHCP change is picked up automatically from
    // ANY page. The mobile app reads this column to find the print server, so
    // it must always reflect the PC's current address.
    const syncServerIp = async () => {
      try {
        if (!authManager.isLoggedIn()) return
        if (localStorage.getItem('is_print_server') !== 'true') return
        if (typeof window === 'undefined' || !window.electronAPI?.getLocalIP) return

        const userData = authManager.getCurrentUser()
        if (!userData?.id) return

        const detectedIp = await window.electronAPI.getLocalIP()
        if (!detectedIp || detectedIp === '127.0.0.1') return
        // Skip the DB round-trip when the IP hasn't moved since the last check.
        if (detectedIp === lastSyncedIp.current) return

        const { data: current } = await supabase
          .from('users')
          .select('print_server_ip')
          .eq('id', userData.id)
          .single()

        if (current && current.print_server_ip !== detectedIp) {
          await supabase
            .from('users')
            .update({ print_server_ip: detectedIp })
            .eq('id', userData.id)
          console.log(`🖨️ [GlobalPrintListener] Print server IP synced: ${current.print_server_ip || 'none'} → ${detectedIp}`)
        }
        lastSyncedIp.current = detectedIp
      } catch (error) {
        console.warn('⚠️ [GlobalPrintListener] IP sync failed:', error.message)
      }
    }

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
    syncServerIp()
    // Re-check every 30s so an IP change on any page reaches the database
    // without the user ever opening the Printer page.
    const ipTimer = setInterval(syncServerIp, 30000)

    return () => {
      clearInterval(ipTimer)
      // Keep print listener alive across page navigations
    }
  }, [])

  return null
}
