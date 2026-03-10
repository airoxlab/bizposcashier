'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function ElectronProvider({ children }) {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Check if running in Electron
    if (typeof window !== 'undefined' && window.electronAPI) {
      console.log('Running in Electron environment')

      // Auto-redirect to dashboard if on login page and already logged in
      const userData = localStorage.getItem('user')
      if (userData && pathname === '/') {
        console.log('User already logged in, redirecting to dashboard')
        router.push('/dashboard/')
        return
      }

      // Initialize asset manager to download logo and QR code
      if (userData) {
        const user = JSON.parse(userData)
        if (user.id) {
          console.log('🚀 [ElectronProvider] Initializing asset cache...')
          assetManager.initialize(user.id).then(success => {
            if (success) {
              console.log('✅ [ElectronProvider] Asset cache initialized')
            } else {
              console.log('⚠️ [ElectronProvider] Asset cache initialization had issues')
            }
          }).catch(error => {
            console.error('❌ [ElectronProvider] Asset cache initialization failed:', error)
          })
        }
      }
      
      // Listen for navigation events from main process
      const handleNavigation = (event, route) => {
        router.push(route)
      }

      window.electronAPI.onNavigate(handleNavigation)

      // Enhanced printing for Electron
      window.electronPrint = (content) => {
        if (window.electronAPI && window.electronAPI.printReceipt) {
          window.electronAPI.printReceipt(content)
        } else {
          // Fallback to browser print
          const printWindow = window.open('', '_blank')
          printWindow.document.write(content)
          printWindow.document.close()
          printWindow.print()
        }
      }

      // Add keyboard shortcuts
      const handleKeyDown = (e) => {
        // Alt key to toggle menu
        if (e.altKey && !e.ctrlKey && !e.shiftKey) {
          e.preventDefault()
          // Menu will be toggled by Electron
        }
        // F12 for DevTools
        else if (e.key === 'F12') {
          e.preventDefault()
          // DevTools will be toggled by Electron
        }
        // Ctrl+R for reload
        else if (e.ctrlKey && e.key === 'r') {
          e.preventDefault()
          window.location.reload()
        }
        // Ctrl+D - Dashboard
        else if (e.ctrlKey && e.key === 'd') {
          e.preventDefault()
          router.push('/dashboard/')
        }
        // Ctrl+1 - Walk-in
        else if (e.ctrlKey && e.key === '1') {
          e.preventDefault()
          router.push('/walkin')
        }
        // Ctrl+2 - Takeaway
        else if (e.ctrlKey && e.key === '2') {
          e.preventDefault()
          router.push('/takeaway')
        }
        // Ctrl+3 - Delivery
        else if (e.ctrlKey && e.key === '3') {
          e.preventDefault()
      router.push('/delivery')
        }
      }

      document.addEventListener('keydown', handleKeyDown)

      // Cleanup
      return () => {
        if (window.electronAPI) {
          window.electronAPI.removeNavigateListener(handleNavigation)
        }
        document.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [router, pathname])

  return (
    <>
      {children}
      {/* Add Electron-specific styles */}
      <style jsx global>{`
        .electron-app {
          user-select: none;
          -webkit-user-select: none;
        }
        
        .electron-app input,
        .electron-app textarea {
          user-select: text;
          -webkit-user-select: text;
        }

        /* Hide scrollbars in Electron for cleaner look */
        .electron-app ::-webkit-scrollbar {
          width: 6px;
        }
        
        .electron-app ::-webkit-scrollbar-track {
          background: transparent;
        }
        
        .electron-app ::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.2);
          border-radius: 3px;
        }

        /* Prevent text selection on UI elements */
        .electron-app button,
        .electron-app .no-select {
          user-select: none;
          -webkit-user-select: none;
        }
      `}</style>
    </>
  )
}