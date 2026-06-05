'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Wifi,
  WifiOff,
  QrCode,
  MessageSquare,
  Send,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Smartphone,
  Zap,
  Clock,
  ToggleLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Copy,
  Check,
  Info,
  Star,
  Package,
  ShoppingBag,
  Truck,
  Settings2,
  Save,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import QRCode from 'qrcode'
import { supabase } from '../../../lib/supabase'
// import { authManager } from '../../../lib/authManager'
import { authManager } from '../../../lib/authManager'
import themeManager from '../../../lib/themeManager'
import { notify } from '../../../components/ui/NotificationSystem'
import ProtectedPage from '../../../components/ProtectedPage'

// ─── Template variable chips ─────────────────────────────────────────────────
const TEMPLATE_VARS = [
  { label: '{customer_name}',      desc: 'Customer full name' },
  { label: '{order_number}',       desc: 'Order #' },
  { label: '{total_amount}',       desc: 'Total bill amount' },
  { label: '{subtotal}',           desc: 'Subtotal before discount/delivery' },
  { label: '{discount_amount}',    desc: 'Discount applied' },
  { label: '{delivery_charges}',   desc: 'Delivery fee' },
  { label: '{order_type}',         desc: 'walkin / takeaway / delivery' },
  { label: '{order_date}',         desc: 'Date of order' },
  { label: '{business_name}',      desc: 'Your business name' },
  { label: '{review_link}',        desc: 'Customer review URL (Completed only)' },
  { label: '{item_list}',          desc: 'Bulleted list of items ordered' },
  { label: '{table_number}',       desc: 'Table name/number (Dine-In)' },
  { label: '{payment_method}',     desc: 'How customer paid' },
  { label: '{cashier_name}',       desc: 'Name of cashier who processed order' },
  { label: '{delivery_address}',   desc: 'Customer delivery address' },
  { label: '{takeaway_time}',      desc: 'Estimated takeaway pickup time' },
  { label: '{delivery_time}',      desc: 'Estimated delivery time' },
  { label: '{order_instructions}', desc: 'Special instructions from customer' },
]

const ORDER_TYPES = [
  { key: 'walkin', label: 'Dine-In', icon: Package, color: 'from-blue-500 to-cyan-500' },
  { key: 'takeaway', label: 'Takeaway', icon: ShoppingBag, color: 'from-purple-500 to-indigo-500' },
  { key: 'delivery', label: 'Delivery', icon: Truck, color: 'from-orange-500 to-red-500' },
]

const DEFAULT_SETTINGS = {
  auto_reconnect: true,
  // Completed triggers
  auto_send_on_complete: true,
  auto_send_walkin: true,
  auto_send_takeaway: true,
  auto_send_delivery: true,
  // Preparing triggers
  auto_send_on_preparing: false,
  auto_send_walkin_preparing: true,
  auto_send_takeaway_preparing: true,
  auto_send_delivery_preparing: true,
  // Dispatched triggers (master key kept as auto_send_on_ready for backward compat)
  auto_send_on_ready: false,
  auto_send_walkin_dispatched: true,
  auto_send_takeaway_dispatched: true,
  auto_send_delivery_dispatched: true,
  // Ready triggers
  auto_send_on_ready_status: false,
  auto_send_walkin_ready: false,
  auto_send_takeaway_ready: true,
  auto_send_delivery_ready: true,
  // Review link
  include_review_link: true,
  // Campaign
  campaign_send_delay_min: 3,
  campaign_send_delay_max: 8,
  // Templates — Completed
  walkin_template: `Thank you {customer_name} for dining with us! 🍽️\n\nYour order #{order_number} of Rs.{total_amount} has been completed.\n\nWe hope you enjoyed your meal! Please take a moment to rate your experience:\n{review_link}\n\n— {business_name}`,
  takeaway_template: `Thank you {customer_name}! 🎉\n\nYour takeaway order #{order_number} of Rs.{total_amount} has been completed.\n\nWe appreciate your business! Share your feedback:\n{review_link}\n\n— {business_name}`,
  delivery_template: `Thank you {customer_name}! 🚀\n\nYour delivery order #{order_number} of Rs.{total_amount} has been delivered.\n\nEnjoy your meal! We'd love your review:\n{review_link}\n\n— {business_name}`,
  // Templates — Preparing
  walkin_preparing_template: `Hi {customer_name}! 👨‍🍳 Your order #{order_number} is now being prepared. We'll notify you when it's ready!\n\n— {business_name}`,
  takeaway_preparing_template: `Hi {customer_name}! 👨‍🍳 Your takeaway order #{order_number} is being prepared. We'll notify you when it's ready for pickup!\n\n— {business_name}`,
  delivery_preparing_template: `Hi {customer_name}! 👨‍🍳 Your delivery order #{order_number} is being prepared. Your rider will be assigned soon!\n\n— {business_name}`,
  // Templates — Dispatched
  walkin_dispatched_template: `Hi {customer_name}! 🍽️ Your order #{order_number} is on its way to your table. Enjoy your meal!\n\n— {business_name}`,
  takeaway_dispatched_template: `Hi {customer_name}! 📦 Your takeaway order #{order_number} is packed and ready. Please come collect it!\n\n— {business_name}`,
  delivery_dispatched_template: `Hi {customer_name}! 🛵 Your delivery order #{order_number} is on the way! Our rider is heading to you now.\n\n— {business_name}`,
  // Templates — Ready
  walkin_ready_template: `Your order is ready to be served, {customer_name}! 🍽️\n\nOrder #{order_number}\n— {business_name}`,
  takeaway_ready_template: `Great news, {customer_name}! 🎉\n\nYour takeaway order #{order_number} is ready for pickup!\n\nPlease come collect your order at your earliest convenience.\n— {business_name}`,
  delivery_ready_template: `Hi {customer_name}! 🚀\n\nYour delivery order #{order_number} is on the way!\n\nOur rider is heading to your location. Please be available to receive it.\n— {business_name}`,
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange, disabled = false, isDark = true }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? 'bg-green-500' : isDark ? 'bg-gray-600' : 'bg-gray-300'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
)

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status, isDark = true }) => {
  const configs = {
    connected: { label: 'Connected', color: isDark ? 'bg-green-500/20 text-green-400 border-green-500/30' : 'bg-green-50 text-green-600 border-green-200', dot: 'bg-green-400' },
    connecting: { label: 'Connecting...', color: isDark ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-yellow-50 text-yellow-600 border-yellow-200', dot: isDark ? 'bg-yellow-400 animate-pulse' : 'bg-yellow-500 animate-pulse' },
    qr_ready: { label: 'Scan QR Code', color: isDark ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' : 'bg-blue-50 text-blue-600 border-blue-200', dot: isDark ? 'bg-blue-400 animate-pulse' : 'bg-blue-500 animate-pulse' },
    disconnected: { label: 'Not Connected', color: isDark ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-400' },
    failed: { label: 'Connection Failed', color: isDark ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-200', dot: 'bg-red-400' },
  }
  const cfg = configs[status] || configs.disconnected
  return (
    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  )
}

// ─── Embeddable Panel (used inside settings sidebar) ─────────────────────────
export function WhatsAppPanel() {
  const isDark = themeManager.isDark()
  const classes = themeManager.getClasses()

  // Theme-aware class helpers
  const cardBg = isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white shadow-sm'
  const inputBg = isDark ? 'bg-gray-900/60 border-gray-600/40 text-white placeholder-gray-500' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'
  const tp = isDark ? 'text-white' : 'text-gray-900' // text primary
  const ts = isDark ? 'text-gray-400' : 'text-gray-500' // text secondary
  const tt = isDark ? 'text-gray-500' : 'text-gray-400' // text tertiary
  const tb = isDark ? 'text-gray-300' : 'text-gray-600' // text body

  const [activeTab, setActiveTab] = useState('connection') // connection | templates | auto-send | advanced
  const [activeTemplateType, setActiveTemplateType] = useState('walkin')
  const [waStatus, setWaStatus] = useState('disconnected')
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)
  const [isSaving, setIsSaving] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [previewVisible, setPreviewVisible] = useState(false)
  const [copiedVar, setCopiedVar] = useState(null)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [activeTemplateStatus, setActiveTemplateStatus] = useState('completed') // 'completed' | 'ready'
  const textareaRef = useRef(null)

  const userId = authManager.getCurrentUser()?.id
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp

  // ── Load settings from Supabase ───────────────────────────
  useEffect(() => {
    loadSettings()
  }, [])

  // ── Listen to Electron WhatsApp events ───────────────────
  useEffect(() => {
    if (!isElectron) return
    const wa = window.electronAPI?.whatsapp
    if (!wa) return

    wa.onStatus(({ status }) => setWaStatus(status))
    wa.onQR(async ({ qr }) => {
      try {
        const url = await QRCode.toDataURL(qr, { width: 280, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
        setQrDataUrl(url)
      } catch (e) {
        console.error('QR gen error:', e)
      }
    })
    wa.onReady(() => {
      setQrDataUrl(null)
      setIsConnecting(false)
      notify.success('WhatsApp connected successfully!')
    })
    wa.onDisconnected(() => {
      setQrDataUrl(null)
      setIsConnecting(false)
    })
    wa.onError(({ message }) => {
      setIsConnecting(false)
      notify.error(message || 'WhatsApp error')
    })

    // Get current status on mount
    wa.getStatus()
      .then(({ status }) => setWaStatus(status))
      .catch(e => console.error('Failed to get WA status:', e))

    return () => wa.removeListeners()
  }, [isElectron])

  async function loadSettings() {
    if (!userId) return
    try {
      const { data, error } = await supabase
        .from('whatsapp_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      if (data && !error) {
        setSettings({ ...DEFAULT_SETTINGS, ...data })
      }
    } catch (e) {
      // No settings yet — use defaults
    } finally {
      setSettingsLoaded(true)
    }
  }

  async function saveSettings() {
    if (!userId) return
    setIsSaving(true)
    try {
      const { review_base_url, ...rest } = settings
      const payload = { ...rest, user_id: userId, updated_at: new Date().toISOString() }
      const { error } = await supabase
        .from('whatsapp_settings')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error
      notify.success('Settings saved!')
    } catch (e) {
      notify.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleConnect() {
    if (!isElectron) return notify.error('WhatsApp only works in the desktop app')
    setIsConnecting(true)
    setWaStatus('connecting')
    try {
      await window.electronAPI.whatsapp.connect()
    } catch (e) {
      console.error('WhatsApp connect error:', e)
      setIsConnecting(false)
      setWaStatus('failed')
      notify.error('Failed to start WhatsApp connection')
    }
  }

  async function handleDisconnect() {
    if (!isElectron) return
    await window.electronAPI.whatsapp.disconnect()
    setQrDataUrl(null)
    setWaStatus('disconnected')
    notify.success('WhatsApp disconnected')
  }

  function insertVariable(variable) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const key = activeTemplateKey()
    const current = settings[key] || ''
    const newValue = current.slice(0, start) + variable + current.slice(end)
    setSettings(prev => ({ ...prev, [key]: newValue }))
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 10)
  }

  function copyVar(v) {
    navigator.clipboard.writeText(v)
    setCopiedVar(v)
    setTimeout(() => setCopiedVar(null), 1500)
  }

  function activeTemplateKey() {
    if (activeTemplateStatus === 'completed') return `${activeTemplateType}_template`
    return `${activeTemplateType}_${activeTemplateStatus}_template`
  }

  function getPreview() {
    const typeLabel = activeTemplateType === 'walkin' ? 'Dine-In' : activeTemplateType === 'takeaway' ? 'Takeaway' : 'Delivery'
    return (settings[activeTemplateKey()] || '')
      .replace(/\{customer_name\}/g,      'Ahmed Khan')
      .replace(/\{order_number\}/g,       'ORD-0042')
      .replace(/\{total_amount\}/g,       '1,250')
      .replace(/\{subtotal\}/g,           '1,100')
      .replace(/\{discount_amount\}/g,    '100')
      .replace(/\{delivery_charges\}/g,   '150')
      .replace(/\{order_type\}/g,         typeLabel)
      .replace(/\{order_date\}/g,         '07 Apr 2026')
      .replace(/\{business_name\}/g,      'BizPOS Restaurant')
      .replace(/\{review_link\}/g,        activeTemplateStatus === 'completed' ? 'https://reviews.bizpos.app/r/abc123' : '')
      .replace(/\{item_list\}/g,          '• Chicken Burger × 2  Rs. 600\n• Fries — Large × 1  Rs. 250\n• Soft Drink × 2  Rs. 200')
      .replace(/\{table_number\}/g,       activeTemplateType === 'walkin' ? 'T-04' : '')
      .replace(/\{payment_method\}/g,     'Cash')
      .replace(/\{cashier_name\}/g,       'Usman Ali')
      .replace(/\{delivery_address\}/g,   activeTemplateType === 'delivery' ? 'House 5, Block B, Gulberg III' : '')
      .replace(/\{takeaway_time\}/g,      activeTemplateType === 'takeaway' ? '1:30 PM' : '')
      .replace(/\{delivery_time\}/g,      activeTemplateType === 'delivery' ? '2:00 PM' : '')
      .replace(/\{order_instructions\}/g, 'No onions please')
  }

  const tabs = [
    { key: 'connection', label: 'Connection', icon: Wifi },
    { key: 'templates', label: 'Templates', icon: MessageSquare },
    { key: 'auto-send', label: 'Auto-Send', icon: Zap },
    { key: 'advanced', label: 'Advanced', icon: Settings2 },
  ]

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* ── Status + Save row ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center shadow-lg shadow-green-500/20">
            <MessageSquare size={18} className="text-white" />
          </div>
          <StatusBadge status={waStatus} isDark={isDark} />
        </div>
        <button
          onClick={saveSettings}
          disabled={isSaving || !settingsLoaded}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-green-500/25 transition-all disabled:opacity-60"
        >
          {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
          Save Settings
        </button>
      </div>

      <div>
        {/* ── Tabs ── */}
        <div className={`flex items-center gap-1 p-1 rounded-2xl border mb-6 ${isDark ? 'bg-gray-800/60 border-gray-700/50' : 'bg-gray-100 border-gray-200'}`}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20'
                  : isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-white'
              }`}
            >
              <tab.icon size={15} />
              {tab.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ══════════════════════════════════════════════════════
              TAB: CONNECTION
          ══════════════════════════════════════════════════════ */}
          {activeTab === 'connection' && (
            <motion.div
              key="connection"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* WhatsApp Connection Card */}
              <div className={`relative overflow-hidden rounded-2xl border backdrop-blur-sm ${cardBg}`}>
                {/* Gradient glow */}
                <div className={`absolute inset-0 opacity-10 bg-gradient-to-br ${
                  waStatus === 'connected' ? 'from-green-500 to-emerald-600' :
                  waStatus === 'qr_ready' || waStatus === 'connecting' ? 'from-blue-500 to-cyan-600' :
                  'from-gray-500 to-gray-600'
                }`} />

                <div className="relative p-6">
                  <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl ${
                        waStatus === 'connected' ? 'bg-gradient-to-br from-green-500 to-emerald-600' :
                        isDark ? 'bg-gray-700' : 'bg-gray-200'
                      }`}>
                        {waStatus === 'connecting' || waStatus === 'qr_ready'
                          ? <Loader2 size={26} className="text-white animate-spin" />
                          : waStatus === 'connected'
                          ? <CheckCircle size={26} className="text-white" />
                          : <WifiOff size={26} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                        }
                      </div>
                      <div>
                        <h2 className={`${tp} font-bold text-lg`}>WhatsApp</h2>
                        <StatusBadge status={waStatus} isDark={isDark} />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {waStatus === 'connected' ? (
                        <button
                          onClick={handleDisconnect}
                          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all ${isDark ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' : 'border-red-300 text-red-500 hover:bg-red-50'}`}
                        >
                          <XCircle size={15} />
                          Disconnect
                        </button>
                      ) : (
                        <button
                          onClick={handleConnect}
                          disabled={isConnecting || waStatus === 'connecting'}
                          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-green-500/30 transition-all disabled:opacity-60"
                        >
                          {isConnecting || waStatus === 'connecting'
                            ? <><Loader2 size={15} className="animate-spin" /> Connecting...</>
                            : <><QrCode size={15} /> Connect</>
                          }
                        </button>
                      )}
                    </div>
                  </div>

                  {/* QR Code Area */}
                  <AnimatePresence>
                    {(waStatus === 'qr_ready' || qrDataUrl) && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="flex flex-col items-center py-4"
                      >
                        <div className={`p-4 rounded-2xl shadow-2xl mb-4 ${isDark ? 'bg-white shadow-black/40' : 'bg-white shadow-gray-300/60 border border-gray-200'}`}>
                          {qrDataUrl
                            ? <img src={qrDataUrl} alt="WhatsApp QR" className="w-56 h-56" />
                            : (
                              <div className="w-56 h-56 flex flex-col items-center justify-center gap-3">
                                <Loader2 size={32} className="text-gray-400 animate-spin" />
                                <p className="text-gray-400 text-sm">Generating QR...</p>
                              </div>
                            )
                          }
                        </div>
                        <div className="text-center">
                          <p className={`${tp} font-semibold text-sm mb-1`}>Scan with WhatsApp</p>
                          <p className={`${ts} text-xs`}>Open WhatsApp → Linked Devices → Link a Device</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Connected State */}
                  {waStatus === 'connected' && (
                    <div className={`flex items-center gap-3 p-4 rounded-xl border ${isDark ? 'bg-green-500/10 border-green-500/20' : 'bg-green-50 border-green-200'}`}>
                      <CheckCircle size={18} className={isDark ? 'text-green-400' : 'text-green-500'} />
                      <div>
                        <p className={`${isDark ? 'text-green-400' : 'text-green-600'} font-semibold text-sm`}>WhatsApp is connected and ready</p>
                        <p className={`${isDark ? 'text-green-400/60' : 'text-green-500/70'} text-xs`}>Auto thank-you messages and campaigns are active</p>
                      </div>
                    </div>
                  )}

                  {/* Disconnected hint */}
                  {(waStatus === 'disconnected' || waStatus === 'failed') && !isConnecting && (
                    <div className={`flex items-start gap-3 p-4 rounded-xl border ${isDark ? 'bg-gray-700/40 border-gray-600/30' : 'bg-gray-50 border-gray-200'}`}>
                      <Info size={16} className={`${ts} flex-shrink-0 mt-0.5`} />
                      <p className={`${ts} text-xs leading-relaxed`}>
                        Click <strong className={tp}>Connect</strong> to scan a QR code with your WhatsApp. The session is saved — you won't need to scan again after app restarts.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-reconnect setting */}
              <div className={`rounded-2xl border p-5 flex items-center justify-between ${cardBg}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
                    <RefreshCw size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className={`${tp} font-semibold text-sm`}>Auto-Reconnect</p>
                    <p className={`${ts} text-xs`}>Automatically reconnect if WhatsApp disconnects</p>
                  </div>
                </div>
                <Toggle
                  checked={settings.auto_reconnect}
                  onChange={() => setSettings(p => ({ ...p, auto_reconnect: !p.auto_reconnect }))}
                  isDark={isDark}
                />
              </div>

              {/* How to steps */}
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <h3 className={`${tp} font-semibold text-sm mb-4 flex items-center gap-2`}>
                  <Smartphone size={15} className="text-green-400" /> Setup Guide
                </h3>
                <div className="space-y-3">
                  {[
                    { step: '1', text: 'Click Connect button above' },
                    { step: '2', text: 'Open WhatsApp on your phone' },
                    { step: '3', text: 'Go to Settings → Linked Devices → Link a Device' },
                    { step: '4', text: 'Scan the QR code shown above' },
                    { step: '5', text: 'Session is saved — no need to scan again!' },
                  ].map(s => (
                    <div key={s.step} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-50 text-green-600'}`}>
                        {s.step}
                      </span>
                      <p className={`${tb} text-sm`}>{s.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: TEMPLATES
          ══════════════════════════════════════════════════════ */}
          {activeTab === 'templates' && (
            <motion.div
              key="templates"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* Order type selector */}
              <div className="grid grid-cols-3 gap-3">
                {ORDER_TYPES.map(t => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTemplateType(t.key)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-2xl border transition-all ${
                      activeTemplateType === t.key
                        ? `border-transparent bg-gradient-to-br ${t.color} shadow-lg`
                        : isDark ? 'border-gray-700/50 bg-gray-800/60 hover:bg-gray-700/50' : 'border-gray-200 bg-white hover:bg-gray-50 shadow-sm'
                    }`}
                  >
                    <t.icon size={20} className={activeTemplateType === t.key ? 'text-white' : ts} />
                    <span className={`text-sm font-semibold ${activeTemplateType === t.key ? 'text-white' : tb}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Variable chips */}
              <div className={`rounded-2xl border p-4 ${cardBg}`}>
                <p className={`${ts} text-xs font-semibold mb-3 uppercase tracking-wider`}>
                  Click to insert variable at cursor
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARS.map(v => (
                    <button
                      key={v.label}
                      onClick={() => insertVariable(v.label)}
                      title={v.desc}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all group ${isDark ? 'bg-purple-500/15 border border-purple-500/25 text-purple-300 hover:bg-purple-500/25 hover:border-purple-500/40' : 'bg-purple-50 border border-purple-200 text-purple-600 hover:bg-purple-100 hover:border-purple-300'}`}
                    >
                      {v.label}
                      <button
                        onClick={e => { e.stopPropagation(); copyVar(v.label) }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        {copiedVar === v.label
                          ? <Check size={11} className="text-green-400" />
                          : <Copy size={11} />
                        }
                      </button>
                    </button>
                  ))}
                </div>
              </div>

              {/* Status sub-tabs — 4 options */}
              <div className={`grid grid-cols-4 gap-1 p-1 rounded-xl border ${isDark ? 'bg-gray-900/40 border-gray-700/40' : 'bg-gray-100 border-gray-200'}`}>
                {[
                  { key: 'completed',  label: 'Completed',  icon: CheckCircle, activeCls: isDark ? 'bg-green-500/20 border border-green-500/30 text-green-400' : 'bg-green-50 border border-green-200 text-green-600' },
                  { key: 'preparing',  label: 'Preparing',  icon: Clock,       activeCls: isDark ? 'bg-orange-500/20 border border-orange-500/30 text-orange-400' : 'bg-orange-50 border border-orange-200 text-orange-600' },
                  { key: 'dispatched', label: 'Dispatched', icon: Truck,       activeCls: isDark ? 'bg-blue-500/20 border border-blue-500/30 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600' },
                  { key: 'ready',      label: 'Ready',      icon: Zap,         activeCls: isDark ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400' : 'bg-amber-50 border border-amber-200 text-amber-600' },
                ].map(s => {
                  const SIcon = s.icon
                  return (
                    <button
                      key={s.key}
                      onClick={() => { setActiveTemplateStatus(s.key); setPreviewVisible(false) }}
                      className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                        activeTemplateStatus === s.key
                          ? s.activeCls
                          : isDark ? 'text-gray-400 hover:text-gray-300' : 'text-gray-500 hover:text-gray-700'
                      }`}
                    >
                      <SIcon size={13} />
                      {s.label}
                    </button>
                  )
                })}
              </div>

              {/* Context hint */}
              {(() => {
                const hints = {
                  completed:  { cls: isDark ? 'bg-green-500/8 border border-green-500/15 text-green-400' : 'bg-green-50 border border-green-200 text-green-600',   text: 'Sent when order is marked Completed. Use {review_link} to include the review URL.' },
                  preparing:  { cls: isDark ? 'bg-orange-500/8 border border-orange-500/15 text-orange-400' : 'bg-orange-50 border border-orange-200 text-orange-600', text: 'Sent when order status changes to Preparing — notifies customer their order has started.' },
                  dispatched: { cls: isDark ? 'bg-blue-500/8 border border-blue-500/15 text-blue-400' : 'bg-blue-50 border border-blue-200 text-blue-600',     text: activeTemplateType === 'walkin' ? 'Sent when order is Dispatched — food is on its way to the table.' : activeTemplateType === 'takeaway' ? 'Sent when order is Dispatched — order is packed, customer can collect.' : 'Sent when order is Dispatched — rider is heading to the customer.' },
                  ready:      { cls: isDark ? 'bg-amber-500/8 border border-amber-500/15 text-amber-400' : 'bg-amber-50 border border-amber-200 text-amber-600',   text: activeTemplateType === 'walkin' ? 'Sent when order is Ready — table is being served.' : activeTemplateType === 'takeaway' ? 'Sent when order is Ready — notifies customer to come collect.' : 'Sent when order is Ready — rider is on the way.' },
                }
                const h = hints[activeTemplateStatus] || hints.completed
                return <div className={`rounded-xl px-4 py-2.5 text-xs ${h.cls}`}>{h.text}</div>
              })()}

              {/* Template editor */}
              <div className={`rounded-2xl border p-4 ${cardBg}`}>
                <div className="flex items-center justify-between mb-3">
                  <p className={`${tp} font-semibold text-sm capitalize`}>
                    {ORDER_TYPES.find(t => t.key === activeTemplateType)?.label}
                    {' — '}{activeTemplateStatus} Template
                  </p>
                  <button
                    onClick={() => setPreviewVisible(p => !p)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-all ${isDark ? 'bg-gray-700/50 text-gray-300 hover:bg-gray-600/50' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {previewVisible ? <EyeOff size={13} /> : <Eye size={13} />}
                    {previewVisible ? 'Editor' : 'Preview'}
                  </button>
                </div>

                {!previewVisible ? (
                  <textarea
                    ref={textareaRef}
                    value={settings[activeTemplateKey()] || ''}
                    onChange={e => setSettings(p => ({ ...p, [activeTemplateKey()]: e.target.value }))}
                    rows={8}
                    placeholder="Type your message template here..."
                    className={`w-full rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20 resize-none font-mono leading-relaxed ${inputBg}`}
                  />
                ) : (
                  <div className={`rounded-xl p-4 min-h-[180px] ${isDark ? 'bg-gray-900/60 border border-gray-600/40' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex justify-end">
                      <div className="max-w-xs bg-[#dcf8c6] rounded-2xl rounded-tr-sm px-4 py-3 shadow-md">
                        <p className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed">
                          {getPreview()}
                        </p>
                        <p className="text-gray-500 text-[10px] text-right mt-1">12:00 PM ✓✓</p>
                      </div>
                    </div>
                  </div>
                )}
                <p className={`${tt} text-xs mt-2`}>
                  {(settings[activeTemplateKey()] || '').length} characters
                </p>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: AUTO-SEND
          ══════════════════════════════════════════════════════ */}
          {activeTab === 'auto-send' && (
            <motion.div
              key="auto-send"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {[
                {
                  masterKey: 'auto_send_on_complete',
                  perTypeKey: k => `auto_send_${k}`,
                  label: 'Order Completed',
                  desc: 'Send when order status →',
                  statusLabel: 'Completed',
                  icon: CheckCircle,
                  onColor: isDark ? 'border-green-500/30 bg-green-500/5' : 'border-green-200 bg-green-50',
                  iconOnCls: isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-500',
                  statusCls: isDark ? 'text-green-400' : 'text-green-600',
                  footerCls: isDark ? 'text-green-400/70' : 'text-green-600/70',
                  perTypes: ORDER_TYPES.map(t => ({ ...t, note: '' })),
                },
                {
                  masterKey: 'auto_send_on_preparing',
                  perTypeKey: k => `auto_send_${k}_preparing`,
                  label: 'Order Preparing',
                  desc: 'Send when order status →',
                  statusLabel: 'Preparing',
                  icon: Clock,
                  onColor: isDark ? 'border-orange-500/30 bg-orange-500/5' : 'border-orange-200 bg-orange-50',
                  iconOnCls: isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-500',
                  statusCls: isDark ? 'text-orange-400' : 'text-orange-600',
                  footerCls: isDark ? 'text-orange-400/70' : 'text-orange-600/70',
                  perTypes: ORDER_TYPES.map(t => ({ ...t, note: '' })),
                },
                {
                  masterKey: 'auto_send_on_ready',
                  perTypeKey: k => `auto_send_${k}_dispatched`,
                  label: 'Order Dispatched',
                  desc: 'Send when order status →',
                  statusLabel: 'Dispatched',
                  icon: Truck,
                  onColor: isDark ? 'border-blue-500/30 bg-blue-500/5' : 'border-blue-200 bg-blue-50',
                  iconOnCls: isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-500',
                  statusCls: isDark ? 'text-blue-400' : 'text-blue-600',
                  footerCls: isDark ? 'text-blue-400/70' : 'text-blue-600/70',
                  perTypes: ORDER_TYPES.map(t => ({ ...t, note: '' })),
                },
                {
                  masterKey: 'auto_send_on_ready_status',
                  perTypeKey: k => `auto_send_${k}_ready`,
                  label: 'Order Ready',
                  desc: 'Send when order status →',
                  statusLabel: 'Ready',
                  icon: Zap,
                  onColor: isDark ? 'border-amber-500/30 bg-amber-500/5' : 'border-amber-200 bg-amber-50',
                  iconOnCls: isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-500',
                  statusCls: isDark ? 'text-amber-400' : 'text-amber-600',
                  footerCls: isDark ? 'text-amber-400/70' : 'text-amber-600/70',
                  perTypes: [
                    { key: 'walkin',   label: 'Dine-In',  icon: Package,    color: 'from-blue-500 to-cyan-500',     note: 'Table is served' },
                    { key: 'takeaway', label: 'Takeaway', icon: ShoppingBag, color: 'from-purple-500 to-indigo-500', note: 'Ready for pickup' },
                    { key: 'delivery', label: 'Delivery', icon: Truck,       color: 'from-orange-500 to-red-500',    note: 'Rider on the way' },
                  ],
                },
              ].map(section => {
                const isOn = settings[section.masterKey]
                const SIcon = section.icon
                return (
                  <div key={section.masterKey} className={`rounded-2xl border overflow-hidden ${isOn ? section.onColor : cardBg}`}>
                    {/* Header */}
                    <div className="flex items-center justify-between p-5">
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOn ? section.iconOnCls : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-400'}`}>
                          <SIcon size={18} />
                        </div>
                        <div>
                          <p className={`${tp} font-bold text-sm`}>{section.label}</p>
                          <p className={`${ts} text-xs`}>
                            {section.desc} <span className={`font-semibold ${section.statusCls}`}>{section.statusLabel}</span>
                          </p>
                        </div>
                      </div>
                      <Toggle
                        checked={isOn}
                        onChange={() => setSettings(p => ({ ...p, [section.masterKey]: !p[section.masterKey] }))}
                        isDark={isDark}
                      />
                    </div>
                    {/* Per order type */}
                    <div className={`border-t px-5 pb-4 pt-3 ${isDark ? 'border-gray-700/40' : 'border-gray-200'}`}>
                      <p className={`${ts} text-xs font-semibold uppercase tracking-wider mb-3`}>Enable per order type</p>
                      <div className="space-y-2">
                        {section.perTypes.map(t => (
                          <div key={t.key} className="flex items-center justify-between py-1.5">
                            <div className="flex items-center gap-3">
                              <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                                <t.icon size={13} className="text-white" />
                              </div>
                              <div>
                                <p className={`${tp} text-sm`}>{t.label}</p>
                                {t.note ? <p className={`${tt} text-xs`}>{t.note}</p> : null}
                              </div>
                            </div>
                            <Toggle
                              checked={!!settings[section.perTypeKey(t.key)]}
                              onChange={() => setSettings(p => ({ ...p, [section.perTypeKey(t.key)]: !p[section.perTypeKey(t.key)] }))}
                              disabled={!isOn}
                              isDark={isDark}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Footer */}
                    <div className={`border-t px-5 py-2.5 flex items-center gap-2 ${isDark ? 'border-gray-700/40' : 'border-gray-200'}`}>
                      <Info size={12} className={`flex-shrink-0 ${section.footerCls}`} />
                      <p className={`text-xs ${section.footerCls}`}>
                        Template: <span className="font-semibold">{section.label}</span> — edit under Templates tab
                      </p>
                    </div>
                  </div>
                )
              })}

              {/* Review link */}
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-yellow-500/10' : 'bg-yellow-50'}`}>
                      <Star size={16} className="text-yellow-400" />
                    </div>
                    <div>
                      <p className={`${tp} font-semibold text-sm`}>Include Review Link</p>
                      <p className={`${ts} text-xs`}>Add {'{review_link}'} to thank-you messages</p>
                    </div>
                  </div>
                  <Toggle
                    checked={settings.include_review_link}
                    onChange={() => setSettings(p => ({ ...p, include_review_link: !p.include_review_link }))}
                    isDark={isDark}
                  />
                </div>
              </div>

              {/* Skip logic info */}
              <div className={`rounded-2xl border p-4 ${isDark ? 'border-gray-700/30 bg-gray-800/40' : 'border-gray-200 bg-gray-50'}`}>
                <p className={`${ts} text-xs font-semibold mb-3 flex items-center gap-2`}>
                  <Info size={13} /> Skip rules (auto-applied)
                </p>
                <div className="space-y-2">
                  {[
                    'Order has no customer linked → skip',
                    'Customer has no phone number → skip',
                    'Customer is blocked in Contacts → skip',
                    'Message already sent for this order → skip (no duplicates)',
                    'WhatsApp is disconnected → skip + log as failed',
                    'Order type is disabled above → skip',
                  ].map((rule, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <XCircle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
                      <p className={`${ts} text-xs`}>{rule}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {/* ══════════════════════════════════════════════════════
              TAB: ADVANCED
          ══════════════════════════════════════════════════════ */}
          {activeTab === 'advanced' && (
            <motion.div
              key="advanced"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="space-y-4"
            >
              {/* Campaign send delay */}
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-orange-500/10' : 'bg-orange-50'}`}>
                    <Clock size={16} className="text-orange-400" />
                  </div>
                  <div>
                    <p className={`${tp} font-semibold text-sm`}>Campaign Send Delay</p>
                    <p className={`${ts} text-xs`}>Random delay between bulk messages to avoid WhatsApp ban</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block ${ts} text-xs mb-2`}>Minimum delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={settings.campaign_send_delay_min}
                      onChange={e => setSettings(p => ({ ...p, campaign_send_delay_min: parseInt(e.target.value) || 3 }))}
                      className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 ${inputBg}`}
                    />
                  </div>
                  <div>
                    <label className={`block ${ts} text-xs mb-2`}>Maximum delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.campaign_send_delay_max}
                      onChange={e => setSettings(p => ({ ...p, campaign_send_delay_max: parseInt(e.target.value) || 8 }))}
                      className={`w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-orange-500/60 ${inputBg}`}
                    />
                  </div>
                </div>

                <div className={`mt-3 p-3 rounded-xl ${isDark ? 'bg-orange-500/10 border border-orange-500/20' : 'bg-orange-50 border border-orange-200'}`}>
                  <p className={`${isDark ? 'text-orange-400' : 'text-orange-600'} text-xs`}>
                    Current: random {settings.campaign_send_delay_min}–{settings.campaign_send_delay_max}s between each message.
                    Recommended: 3–8s minimum to avoid WhatsApp restrictions.
                  </p>
                </div>
              </div>

              {/* Session info */}
              <div className={`rounded-2xl border p-5 ${cardBg}`}>
                <h3 className={`${tp} font-semibold text-sm mb-4 flex items-center gap-2`}>
                  <Smartphone size={14} className={ts} /> Session Info
                </h3>
                <div className="space-y-3 text-sm">
                  <div className={`flex items-center justify-between py-2 border-b ${isDark ? 'border-gray-700/40' : 'border-gray-200'}`}>
                    <span className={ts}>Session storage</span>
                    <span className={`${tb} font-mono text-xs`}>%AppData%/BizPOS/whatsapp-baileys-auth</span>
                  </div>
                  <div className={`flex items-center justify-between py-2 border-b ${isDark ? 'border-gray-700/40' : 'border-gray-200'}`}>
                    <span className={ts}>Auto-reconnect delay</span>
                    <span className={`${tp} font-semibold`}>5 seconds</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className={ts}>Session persistence</span>
                    <span className={`${isDark ? 'text-green-400' : 'text-green-600'} font-semibold`}>Survives app restart</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className={`rounded-2xl border p-4 flex items-start gap-3 ${isDark ? 'border-yellow-500/20 bg-yellow-500/5' : 'border-yellow-200 bg-yellow-50'}`}>
                <AlertCircle size={16} className={`${isDark ? 'text-yellow-400' : 'text-yellow-500'} flex-shrink-0 mt-0.5`} />
                <div>
                  <p className={`${isDark ? 'text-yellow-400' : 'text-yellow-600'} font-semibold text-sm mb-1`}>Important Notes</p>
                  <ul className="space-y-1">
                    {[
                      'Keep your phone connected to internet while the app is running',
                      'WhatsApp may occasionally require re-scanning the QR',
                      'Do not use your WhatsApp account on too many devices',
                      'Sending too many messages too fast can result in a temporary ban',
                    ].map((n, i) => (
                      <li key={i} className={`${isDark ? 'text-yellow-400/70' : 'text-yellow-600/80'} text-xs flex items-start gap-2`}>
                        <span className={`mt-1 w-1 h-1 rounded-full flex-shrink-0 ${isDark ? 'bg-yellow-400/60' : 'bg-yellow-500/60'}`} />
                        {n}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Standalone Page (navigated to directly via /settings/whatsapp) ──────────
function WhatsAppSettingsStandalone() {
  const router = useRouter()
  const isDark = themeManager.isDark()
  return (
    <div className={`min-h-screen ${isDark ? 'bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900' : 'bg-gray-50'}`}>
      <div className={`sticky top-0 z-10 backdrop-blur-md border-b ${isDark ? 'bg-gray-900/80 border-gray-700/50' : 'bg-white/80 border-gray-200'}`}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className={`p-2 rounded-xl transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
          >
            <ArrowLeft size={18} />
          </button>
          <span className={`${isDark ? 'text-white' : 'text-gray-900'} font-semibold text-sm`}>WhatsApp Settings</span>
        </div>
      </div>
      <div className="max-w-5xl mx-auto px-6 py-6">
        <WhatsAppPanel />
      </div>
    </div>
  )
}

export default function WhatsAppSettings() {
  return (
    <ProtectedPage permissionKey="WHATSAPP_SETTINGS" pageName="WhatsApp Settings">
      <WhatsAppSettingsStandalone />
    </ProtectedPage>
  )
}
