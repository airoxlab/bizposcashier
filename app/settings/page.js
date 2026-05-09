'use client'

import { useState, useEffect, Suspense } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Settings, User, Users, Palette, Download,
  Smartphone, Monitor, HardDrive, MessageSquare, CreditCard,
  Zap, Wifi, WifiOff,
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import themeManager from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'

import { PersonalPanel } from './personal/page'
import { AppearancePanel } from './appearance/page'
import { ThemesPanel } from './themes/page'
import { CustomersPanel } from './customers/page'
import { WhatsAppPanel } from './whatsapp/page'
import { CustomerAccountPanel } from './customer-account/page'
import { MobilePanel } from './mobile/page'
import { UpdatesPanel } from './updates/page'
import { BackupPanel } from './backup/page'
import { PlanPanel } from './plan/page'

const SIDEBAR_ITEMS = [
  { id: 'personal',          name: 'Personal Profile',   icon: User,          description: 'Manage your account details' },
  { id: 'appearance',        name: 'Appearance',          icon: Palette,       description: 'Customize your interface' },
  { id: 'themes',            name: 'Themes',              icon: Monitor,       description: 'Switch between layout styles' },
  { id: 'customers',         name: 'Customers',           icon: Users,         description: 'Manage customer profiles' },
  { id: 'whatsapp',          name: 'WhatsApp',            icon: MessageSquare, description: 'Messaging & automation' },
  { id: 'customer-account',  name: 'Customer Account',    icon: CreditCard,    description: 'Account alerts & receipts' },
  { id: 'mobile',            name: 'Mobile App',          icon: Smartphone,    description: 'Mobile app integration' },
  { id: 'updates',           name: 'Updates',             icon: Download,      description: 'Check for app updates' },
  { id: 'backup',            name: 'Backup & Recovery',   icon: HardDrive,     description: 'Backup offline data & recover orders' },
  { id: 'plan',              name: 'Plan & Billing',      icon: Zap,           description: 'Subscription & features' },
]

const PANEL_TITLES = {
  personal:         { title: 'Personal Profile',      sub: 'Manage your account information and store details' },
  appearance:       { title: 'Appearance Settings',   sub: 'Customize your interface theme and appearance' },
  themes:           { title: 'Themes',                sub: 'Choose a layout style for your POS interface' },
  customers:        { title: 'Customers',             sub: 'View and manage all customer profiles' },
  whatsapp:         { title: 'WhatsApp',              sub: 'Messaging, auto-send notifications & campaign settings' },
  'customer-account': { title: 'Customer Account',   sub: 'Account payment alerts, receipt images & WhatsApp notifications' },
  mobile:           { title: 'Mobile App',            sub: 'Mobile app integration coming soon' },
  updates:          { title: 'App Updates',           sub: 'Check and install the latest app updates' },
  backup:           { title: 'Backup & Recovery',     sub: 'Backup offline data and recover lost orders' },
  plan:             { title: 'Plan & Billing',        sub: 'Your subscription details and available plans' },
}

function SettingsContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [activeTab, setActiveTab] = useState(() => searchParams?.get('tab') || 'personal')
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true)

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  useEffect(() => {
    if (!authManager.isLoggedIn()) { router.push('/'); return }
    themeManager.applyTheme()
    const tab = searchParams?.get('tab')
    if (tab) setActiveTab(tab)
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    setIsOnline(navigator.onLine)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [router, searchParams])

  const { title, sub } = PANEL_TITLES[activeTab] || PANEL_TITLES.personal

  return (
    <ProtectedPage permissionKey="SETTINGS" pageName="Settings">
      <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>

        {/* Sidebar */}
        <div className={`w-60 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-r flex flex-col`}>
          {/* Sidebar Header */}
          <div className={`p-3 ${classes.border} border-b ${classes.card}`}>
            <motion.button
              whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/dashboard')}
              className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors mb-2 group`}
            >
              <ArrowLeft className="w-4 h-4 mr-1.5 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-sm font-medium">Back to Dashboard</span>
            </motion.button>
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <div className="w-7 h-7 bg-gradient-to-br from-purple-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <Settings className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h2 className={`text-sm font-bold ${classes.textPrimary}`}>Settings</h2>
                  <p className={`text-[10px] ${classes.textSecondary}`}>Customize your POS</p>
                </div>
              </div>
              {isOnline
                ? <Wifi className="w-3.5 h-3.5 text-green-500" />
                : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex-1 overflow-y-auto p-2.5">
            <h3 className={`text-[10px] font-semibold ${classes.textSecondary} uppercase tracking-wider mb-2`}>Categories</h3>
            <div className="space-y-1">
              {SIDEBAR_ITEMS.map((item) => {
                const IconComponent = item.icon
                const isActive = activeTab === item.id
                return (
                  <motion.button
                    key={item.id}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full text-left p-2 rounded-lg transition-all duration-300 group ${
                      isActive
                        ? `${isDark ? 'bg-purple-900/20 border-purple-700/30' : 'bg-purple-100 border-purple-200'} border`
                        : `${isDark ? 'bg-gray-700/50 hover:bg-purple-900/10' : 'bg-gray-50 hover:bg-purple-50'}`
                    }`}
                  >
                    <div className="flex items-center">
                      <div className={`w-8 h-8 rounded-lg overflow-hidden mr-2.5 flex items-center justify-center ${
                        isActive ? (isDark ? 'bg-purple-900/30' : 'bg-purple-200') : (isDark ? 'bg-purple-900/20' : 'bg-purple-100')
                      }`}>
                        <IconComponent className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-semibold truncate text-xs ${classes.textPrimary}`}>{item.name}</div>
                        <div className={`text-[10px] ${classes.textSecondary}`}>{item.description}</div>
                      </div>
                    </div>
                  </motion.button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
          {/* Content Header */}
          <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b p-3`}>
            <h1 className={`text-xl font-bold ${classes.textPrimary}`}>{title}</h1>
            <p className={`${classes.textSecondary} text-xs`}>{sub}</p>
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait">
              {activeTab === 'personal'         && <PersonalPanel key="personal" />}
              {activeTab === 'appearance'        && <AppearancePanel key="appearance" />}
              {activeTab === 'themes'            && <ThemesPanel key="themes" />}
              {activeTab === 'customers'         && <CustomersPanel key="customers" />}
              {activeTab === 'whatsapp'          && (
                <motion.div key="whatsapp" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-5xl mx-auto">
                  <WhatsAppPanel />
                </motion.div>
              )}
              {activeTab === 'customer-account' && (
                <motion.div key="customer-account" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} transition={{ duration: 0.3 }} className="max-w-5xl mx-auto">
                  <CustomerAccountPanel />
                </motion.div>
              )}
              {activeTab === 'mobile'            && <MobilePanel key="mobile" />}
              {activeTab === 'updates'           && <UpdatesPanel key="updates" />}
              {activeTab === 'backup'            && <BackupPanel key="backup" />}
              {activeTab === 'plan'              && <PlanPanel key="plan" />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </ProtectedPage>
  )
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="h-screen w-screen flex items-center justify-center"><div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" /></div>}>
      <SettingsContent />
    </Suspense>
  )
}
