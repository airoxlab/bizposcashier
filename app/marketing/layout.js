'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Megaphone,
  Send,
  History,
  MessageSquare,
  Users,
  Zap,
  Wifi,
  WifiOff,
  Lock,
} from 'lucide-react'
import { permissionManager } from '../../lib/permissionManager'
import { authManager } from '../../lib/authManager'

const NAV_ITEMS = [
  {
    href: '/marketing/campaign',
    label: 'Campaign',
    icon: Megaphone,
    desc: 'Create & send bulk messages',
    permissionKey: 'MARKETING_CAMPAIGN',
  },
  {
    href: '/marketing/campaign-log',
    label: 'Campaign Log',
    icon: History,
    desc: 'All campaign history',
    permissionKey: 'MARKETING_CAMPAIGN_LOG',
  },
  {
    href: '/marketing/auto-send-log',
    label: 'Auto-Send Log',
    icon: Zap,
    desc: 'Order completion messages',
    permissionKey: 'MARKETING_AUTO_SEND_LOG',
  },
  {
    href: '/marketing/contacts',
    label: 'Contacts',
    icon: Users,
    desc: 'Manage & Opt Out customers',
    permissionKey: 'MARKETING_CONTACTS',
  },
]

export default function MarketingLayout({ children }) {
  const pathname = usePathname()
  const router = useRouter()
  const [waStatus, setWaStatus] = useState('disconnected')

  useEffect(() => {
    const wa = window.electronAPI?.whatsapp
    if (!wa) return
    wa.getStatus().then(({ status }) => setWaStatus(status))
    wa.onStatus(({ status }) => setWaStatus(status))
    return () => wa.removeListeners?.()
  }, [])

  const isConnected = waStatus === 'connected'
  const isAdmin = authManager.getRole() === 'admin'

  const visibleNavItems = NAV_ITEMS.filter(item =>
    isAdmin || permissionManager.hasPermission(item.permissionKey)
  )

  return (
    <div className="h-screen bg-gray-900 flex overflow-hidden">
      {/* ── Sidebar ── */}
      <div className="w-56 flex-shrink-0 bg-gray-900 border-r border-white/[0.06] flex flex-col h-full">

        {/* Back button */}
        <div className="p-3 pt-4">
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-gray-400 hover:text-white hover:bg-white/[0.06] transition-all w-full text-sm"
          >
            <ArrowLeft size={15} />
            <span>Dashboard</span>
          </button>
        </div>

        {/* Logo + title */}
        <div className="px-4 pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20 flex-shrink-0">
              <MessageSquare size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-white font-bold text-sm leading-tight">Marketing</h1>
              <p className="text-gray-500 text-[11px]">WhatsApp Campaigns</p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <div className="flex-1 p-2 pt-3 overflow-hidden">
          <p className="text-gray-600 text-[10px] font-semibold uppercase tracking-wider px-2 mb-2">Pages</p>
          <nav className="space-y-0.5">
            {visibleNavItems.map(item => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                    active
                      ? 'bg-purple-600/20 border border-purple-500/30'
                      : 'hover:bg-white/[0.04] border border-transparent'
                  }`}
                >
                  <item.icon
                    size={15}
                    className={active ? 'text-purple-400 flex-shrink-0' : 'text-gray-500 flex-shrink-0'}
                  />
                  <div className="min-w-0">
                    <p className={`text-xs font-semibold ${active ? 'text-white' : 'text-gray-300'}`}>
                      {item.label}
                    </p>
                    <p className="text-gray-500 text-[10px] truncate">{item.desc}</p>
                  </div>
                </button>
              )
            })}
          </nav>
        </div>

        {/* WhatsApp status footer */}
        <div className="p-3 border-t border-white/[0.06]">
          <button
            onClick={() => router.push('/settings/whatsapp')}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-all ${
              isConnected
                ? 'bg-green-500/10 border border-green-500/20 hover:bg-green-500/15'
                : 'bg-red-500/10 border border-red-500/20 hover:bg-red-500/15'
            }`}
          >
            {isConnected
              ? <Wifi size={14} className="text-green-400 flex-shrink-0" />
              : <WifiOff size={14} className="text-red-400 flex-shrink-0" />
            }
            <div className="min-w-0 text-left">
              <p className={`text-xs font-semibold ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isConnected ? 'WhatsApp Connected' : 'Not Connected'}
              </p>
              <p className="text-gray-500 text-[10px]">
                {isConnected ? 'Ready to send' : 'Tap to connect'}
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 bg-gray-900 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
