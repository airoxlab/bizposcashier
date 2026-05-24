'use client'
import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { themeManager } from '../lib/themeManager'

export default function NavigationLoader() {
  const pathname = usePathname()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const show = () => setVisible(true)
    window.addEventListener('page-navigating', show)
    return () => window.removeEventListener('page-navigating', show)
  }, [])

  // Hide as soon as the new page's pathname becomes active
  useEffect(() => {
    setVisible(false)
  }, [pathname])

  if (!visible) return null

  const classes = themeManager.getClasses()

  return (
    <div className={`fixed inset-0 z-[9999] flex items-center justify-center ${classes.background}`}>
      <div className="flex flex-col items-center gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
        <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading...</p>
      </div>
    </div>
  )
}
