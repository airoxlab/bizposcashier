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
  Link2,
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
  { label: '{customer_name}', desc: 'Customer full name' },
  { label: '{order_number}', desc: 'Order #' },
  { label: '{total_amount}', desc: 'Total bill amount' },
  { label: '{order_type}', desc: 'walkin / takeaway / delivery' },
  { label: '{order_date}', desc: 'Date of order' },
  { label: '{business_name}', desc: 'Your business name' },
  { label: '{review_link}', desc: 'Customer review URL' },
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
  // Dispatch triggers (Ready/On-the-Way)
  auto_send_on_ready: true,
  auto_send_walkin_ready: false,
  auto_send_takeaway_ready: true,
  auto_send_delivery_ready: true,
  // Ready status trigger (mutually exclusive with dispatch for delivery)
  auto_send_on_ready_status: false,
  // Review link
  include_review_link: true,
  review_base_url: '',
  // Campaign
  campaign_send_delay_min: 3,
  campaign_send_delay_max: 8,
  // Completed templates
  walkin_template: `Thank you {customer_name} for dining with us! 🍽️\n\nYour order #{order_number} of Rs.{total_amount} has been completed.\n\nWe hope you enjoyed your meal! Please take a moment to rate your experience:\n{review_link}\n\n— {business_name}`,
  takeaway_template: `Thank you {customer_name}! 🎉\n\nYour takeaway order #{order_number} of Rs.{total_amount} has been completed.\n\nWe appreciate your business! Share your feedback:\n{review_link}\n\n— {business_name}`,
  delivery_template: `Thank you {customer_name}! 🚀\n\nYour delivery order #{order_number} of Rs.{total_amount} has been delivered.\n\nEnjoy your meal! We'd love your review:\n{review_link}\n\n— {business_name}`,
  // Ready templates
  walkin_ready_template: `Your order is ready to be served, {customer_name}! 🍽️\n\nOrder #{order_number}\n— {business_name}`,
  takeaway_ready_template: `Great news, {customer_name}! 🎉\n\nYour takeaway order #{order_number} is ready for pickup!\n\nPlease come collect your order at your earliest convenience.\n— {business_name}`,
  delivery_ready_template: `Hi {customer_name}! 🚀\n\nYour delivery order #{order_number} is on the way!\n\nOur rider is heading to your location. Please be available to receive it.\n— {business_name}`,
}

// ─── Toggle Switch ────────────────────────────────────────────────────────────
const Toggle = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? 'bg-green-500' : 'bg-gray-600'
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
const StatusBadge = ({ status }) => {
  const configs = {
    connected: { label: 'Connected', color: 'bg-green-500/20 text-green-400 border-green-500/30', dot: 'bg-green-400' },
    connecting: { label: 'Connecting...', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', dot: 'bg-yellow-400 animate-pulse' },
    qr_ready: { label: 'Scan QR Code', color: 'bg-blue-500/20 text-blue-400 border-blue-500/30', dot: 'bg-blue-400 animate-pulse' },
    disconnected: { label: 'Not Connected', color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
    failed: { label: 'Connection Failed', color: 'bg-red-500/20 text-red-400 border-red-500/30', dot: 'bg-red-400' },
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
    const wa = window.electronAPI.whatsapp

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
    wa.getStatus().then(({ status }) => setWaStatus(status))

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
      const payload = { ...settings, user_id: userId, updated_at: new Date().toISOString() }
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
    await window.electronAPI.whatsapp.connect()
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
    return activeTemplateStatus === 'ready'
      ? `${activeTemplateType}_ready_template`
      : `${activeTemplateType}_template`
  }

  function getPreview() {
    return (settings[activeTemplateKey()] || '')
      .replace(/\{customer_name\}/g, 'Ahmed Khan')
      .replace(/\{order_number\}/g, 'ORD-0042')
      .replace(/\{total_amount\}/g, '1,250')
      .replace(/\{order_type\}/g, activeTemplateType)
      .replace(/\{order_date\}/g, '07 Apr 2026')
      .replace(/\{business_name\}/g, 'BizPOS Restaurant')
      .replace(/\{review_link\}/g, activeTemplateStatus === 'completed' ? 'https://reviews.bizpos.app/r/abc123' : '')
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
          <StatusBadge status={waStatus} />
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
        <div className="flex items-center gap-1 p-1 bg-gray-800/60 rounded-2xl border border-gray-700/50 mb-6">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                activeTab === tab.key
                  ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white shadow-lg shadow-green-500/20'
                  : 'text-gray-400 hover:text-white hover:bg-gray-700/50'
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
              <div className="relative overflow-hidden rounded-2xl border border-gray-700/50 bg-gray-800/60 backdrop-blur-sm">
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
                        'bg-gray-700'
                      }`}>
                        {waStatus === 'connecting' || waStatus === 'qr_ready'
                          ? <Loader2 size={26} className="text-white animate-spin" />
                          : waStatus === 'connected'
                          ? <CheckCircle size={26} className="text-white" />
                          : <WifiOff size={26} className="text-gray-400" />
                        }
                      </div>
                      <div>
                        <h2 className="text-white font-bold text-lg">WhatsApp</h2>
                        <StatusBadge status={waStatus} />
                      </div>
                    </div>

                    <div className="flex gap-2">
                      {waStatus === 'connected' ? (
                        <button
                          onClick={handleDisconnect}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10 text-sm font-semibold transition-all"
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
                        <div className="bg-white p-4 rounded-2xl shadow-2xl shadow-black/40 mb-4">
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
                          <p className="text-white font-semibold text-sm mb-1">Scan with WhatsApp</p>
                          <p className="text-gray-400 text-xs">Open WhatsApp → Linked Devices → Link a Device</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Connected State */}
                  {waStatus === 'connected' && (
                    <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-xl border border-green-500/20">
                      <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
                      <div>
                        <p className="text-green-400 font-semibold text-sm">WhatsApp is connected and ready</p>
                        <p className="text-green-400/60 text-xs">Auto thank-you messages and campaigns are active</p>
                      </div>
                    </div>
                  )}

                  {/* Disconnected hint */}
                  {(waStatus === 'disconnected' || waStatus === 'failed') && !isConnecting && (
                    <div className="flex items-start gap-3 p-4 bg-gray-700/40 rounded-xl border border-gray-600/30">
                      <Info size={16} className="text-gray-400 flex-shrink-0 mt-0.5" />
                      <p className="text-gray-400 text-xs leading-relaxed">
                        Click <strong className="text-white">Connect</strong> to scan a QR code with your WhatsApp. The session is saved — you won't need to scan again after app restarts.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto-reconnect setting */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center">
                    <RefreshCw size={16} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Auto-Reconnect</p>
                    <p className="text-gray-400 text-xs">Automatically reconnect if WhatsApp disconnects</p>
                  </div>
                </div>
                <Toggle
                  checked={settings.auto_reconnect}
                  onChange={() => setSettings(p => ({ ...p, auto_reconnect: !p.auto_reconnect }))}
                />
              </div>

              {/* How to steps */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5">
                <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
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
                      <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 text-xs font-bold flex items-center justify-center flex-shrink-0">
                        {s.step}
                      </span>
                      <p className="text-gray-300 text-sm">{s.text}</p>
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
                        : 'border-gray-700/50 bg-gray-800/60 hover:bg-gray-700/50'
                    }`}
                  >
                    <t.icon size={20} className={activeTemplateType === t.key ? 'text-white' : 'text-gray-400'} />
                    <span className={`text-sm font-semibold ${activeTemplateType === t.key ? 'text-white' : 'text-gray-300'}`}>
                      {t.label}
                    </span>
                  </button>
                ))}
              </div>

              {/* Variable chips */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4">
                <p className="text-gray-400 text-xs font-semibold mb-3 uppercase tracking-wider">
                  Click to insert variable at cursor
                </p>
                <div className="flex flex-wrap gap-2">
                  {TEMPLATE_VARS.map(v => (
                    <button
                      key={v.label}
                      onClick={() => insertVariable(v.label)}
                      title={v.desc}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-300 text-xs font-mono hover:bg-purple-500/25 hover:border-purple-500/40 transition-all group"
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

              {/* Completed / Ready sub-tabs */}
              <div className="flex gap-2 p-1 bg-gray-900/40 rounded-xl border border-gray-700/40">
                <button
                  onClick={() => { setActiveTemplateStatus('completed'); setPreviewVisible(false) }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTemplateStatus === 'completed'
                      ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <CheckCircle size={14} />
                  Order Completed
                </button>
                <button
                  onClick={() => { setActiveTemplateStatus('ready'); setPreviewVisible(false) }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTemplateStatus === 'ready'
                      ? 'bg-blue-500/20 border border-blue-500/30 text-blue-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  <Zap size={14} />
                  Ready / On the Way
                </button>
              </div>

              {/* Context hint */}
              <div className={`rounded-xl px-4 py-2.5 text-xs ${
                activeTemplateStatus === 'completed'
                  ? 'bg-green-500/8 border border-green-500/15 text-green-400'
                  : 'bg-blue-500/8 border border-blue-500/15 text-blue-400'
              }`}>
                {activeTemplateStatus === 'completed'
                  ? `Sent when order is marked Completed. Use {review_link} to include the review URL.`
                  : activeTemplateType === 'walkin'
                    ? `Sent when Dine-In order is marked Ready (food served). Review link is not included.`
                    : activeTemplateType === 'takeaway'
                      ? `Sent when Takeaway order is marked Ready — notifies customer to come collect.`
                      : `Sent when Delivery order is marked Ready — notifies customer rider is on the way.`
                }
              </div>

              {/* Template editor */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-white font-semibold text-sm">
                    {ORDER_TYPES.find(t => t.key === activeTemplateType)?.label}
                    {' '}{activeTemplateStatus === 'completed' ? 'Completed' : 'Ready'} Template
                  </p>
                  <button
                    onClick={() => setPreviewVisible(p => !p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-gray-700/50 text-gray-300 text-xs hover:bg-gray-600/50 transition-all"
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
                    className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-green-500/60 focus:ring-1 focus:ring-green-500/20 resize-none font-mono leading-relaxed"
                  />
                ) : (
                  <div className="bg-gray-900/60 border border-gray-600/40 rounded-xl p-4 min-h-[180px]">
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
                <p className="text-gray-500 text-xs mt-2">
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
              {/* Master toggle */}
              <div className={`rounded-2xl border p-5 flex items-center justify-between ${
                settings.auto_send_on_complete
                  ? 'border-green-500/30 bg-green-500/5'
                  : 'border-gray-700/50 bg-gray-800/60'
              }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    settings.auto_send_on_complete ? 'bg-green-500/20' : 'bg-gray-700'
                  }`}>
                    <Zap size={18} className={settings.auto_send_on_complete ? 'text-green-400' : 'text-gray-400'} />
                  </div>
                  <div>
                    <p className="text-white font-bold text-sm">Auto Thank-You Message</p>
                    <p className="text-gray-400 text-xs">Send automatically when order status → Completed</p>
                  </div>
                </div>
                <Toggle
                  checked={settings.auto_send_on_complete}
                  onChange={() => setSettings(p => ({ ...p, auto_send_on_complete: !p.auto_send_on_complete }))}
                />
              </div>

              {/* Per order type */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-4">
                  Enable per order type
                </h3>
                <div className="space-y-3">
                  {ORDER_TYPES.map(t => (
                    <div key={t.key} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                          <t.icon size={14} className="text-white" />
                        </div>
                        <p className="text-white font-medium text-sm">{t.label}</p>
                      </div>
                      <Toggle
                        checked={settings[`auto_send_${t.key}`]}
                        onChange={() => setSettings(p => ({ ...p, [`auto_send_${t.key}`]: !p[`auto_send_${t.key}`] }))}
                        disabled={!settings.auto_send_on_complete}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Dispatched & Ready Toggles (side by side, mutually exclusive) ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* Dispatched / On-the-Way */}
                <div className={`rounded-2xl border p-5 flex flex-col justify-between ${
                  settings.auto_send_on_ready
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-gray-700/50 bg-gray-800/60'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      settings.auto_send_on_ready ? 'bg-blue-500/20' : 'bg-gray-700'
                    }`}>
                      <Zap size={18} className={settings.auto_send_on_ready ? 'text-blue-400' : 'text-gray-400'} />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Dispatched Notification</p>
                      <p className="text-gray-400 text-xs">Send when order status → Dispatched</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Toggle
                      checked={settings.auto_send_on_ready}
                      onChange={() => setSettings(p => ({ ...p, auto_send_on_ready: !p.auto_send_on_ready, ...(p.auto_send_on_ready ? {} : { auto_send_on_ready_status: false }) }))}
                    />
                  </div>
                </div>

                {/* Ready Notification */}
                <div className={`rounded-2xl border p-5 flex flex-col justify-between ${
                  settings.auto_send_on_ready_status
                    ? 'border-amber-500/30 bg-amber-500/5'
                    : 'border-gray-700/50 bg-gray-800/60'
                }`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      settings.auto_send_on_ready_status ? 'bg-amber-500/20' : 'bg-gray-700'
                    }`}>
                      <Zap size={18} className={settings.auto_send_on_ready_status ? 'text-amber-400' : 'text-gray-400'} />
                    </div>
                    <div>
                      <p className="text-white font-bold text-sm">Ready Notification</p>
                      <p className="text-gray-400 text-xs">Send when order status → Ready</p>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Toggle
                      checked={settings.auto_send_on_ready_status}
                      onChange={() => setSettings(p => ({ ...p, auto_send_on_ready_status: !p.auto_send_on_ready_status, ...(!p.auto_send_on_ready_status ? { auto_send_on_ready: false } : {}) }))}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5">
                <h3 className="text-gray-400 text-xs font-semibold uppercase tracking-wider mb-1">
                  Enable per order type
                </h3>
                <p className="text-gray-500 text-xs mb-4">Edit templates under Templates → Ready / On the Way</p>
                <div className="space-y-3">
                  {[
                    { key: 'walkin',   label: 'Dine-In',   icon: Package,    color: 'from-blue-500 to-cyan-500',     note: 'Table is served' },
                    { key: 'takeaway', label: 'Takeaway',  icon: ShoppingBag, color: 'from-purple-500 to-indigo-500', note: 'Ready for pickup' },
                    { key: 'delivery', label: 'Delivery',  icon: Truck,       color: 'from-orange-500 to-red-500',    note: 'Rider on the way' },
                  ].map(t => (
                    <div key={t.key} className="flex items-center justify-between py-2">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${t.color} flex items-center justify-center`}>
                          <t.icon size={14} className="text-white" />
                        </div>
                        <div>
                          <p className="text-white font-medium text-sm">{t.label}</p>
                          <p className="text-gray-500 text-xs">{t.note}</p>
                        </div>
                      </div>
                      <Toggle
                        checked={settings[`auto_send_${t.key}_ready`]}
                        onChange={() => setSettings(p => ({ ...p, [`auto_send_${t.key}_ready`]: !p[`auto_send_${t.key}_ready`] }))}
                        disabled={!settings.auto_send_on_ready && !settings.auto_send_on_ready_status}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Review link */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-yellow-500/10 flex items-center justify-center">
                      <Star size={16} className="text-yellow-400" />
                    </div>
                    <div>
                      <p className="text-white font-semibold text-sm">Include Review Link</p>
                      <p className="text-gray-400 text-xs">Add {'{review_link}'} to thank-you messages</p>
                    </div>
                  </div>
                  <Toggle
                    checked={settings.include_review_link}
                    onChange={() => setSettings(p => ({ ...p, include_review_link: !p.include_review_link }))}
                  />
                </div>

                <AnimatePresence>
                  {settings.include_review_link && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                    >
                      <label className="block text-gray-400 text-xs mb-1.5">Review App Base URL</label>
                      <div className="flex items-center gap-2 bg-gray-900/60 border border-gray-600/40 rounded-xl px-3 py-2.5">
                        <Link2 size={14} className="text-gray-500 flex-shrink-0" />
                        <input
                          type="url"
                          value={settings.review_base_url}
                          onChange={e => setSettings(p => ({ ...p, review_base_url: e.target.value }))}
                          placeholder="https://reviews.yourdomain.com"
                          className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
                        />
                      </div>
                      <p className="text-gray-500 text-xs mt-1">Link will be: {settings.review_base_url || 'https://...'}/r/{'<token>'}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Skip logic info */}
              <div className="rounded-2xl border border-gray-700/30 bg-gray-800/40 p-4">
                <p className="text-gray-400 text-xs font-semibold mb-3 flex items-center gap-2">
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
                      <p className="text-gray-400 text-xs">{rule}</p>
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
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5">
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-orange-500/10 flex items-center justify-center">
                    <Clock size={16} className="text-orange-400" />
                  </div>
                  <div>
                    <p className="text-white font-semibold text-sm">Campaign Send Delay</p>
                    <p className="text-gray-400 text-xs">Random delay between bulk messages to avoid WhatsApp ban</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Minimum delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={30}
                      value={settings.campaign_send_delay_min}
                      onChange={e => setSettings(p => ({ ...p, campaign_send_delay_min: parseInt(e.target.value) || 3 }))}
                      className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-400 text-xs mb-2">Maximum delay (seconds)</label>
                    <input
                      type="number"
                      min={1}
                      max={60}
                      value={settings.campaign_send_delay_max}
                      onChange={e => setSettings(p => ({ ...p, campaign_send_delay_max: parseInt(e.target.value) || 8 }))}
                      className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-orange-500/60"
                    />
                  </div>
                </div>

                <div className="mt-3 p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl">
                  <p className="text-orange-400 text-xs">
                    Current: random {settings.campaign_send_delay_min}–{settings.campaign_send_delay_max}s between each message.
                    Recommended: 3–8s minimum to avoid WhatsApp restrictions.
                  </p>
                </div>
              </div>

              {/* Session info */}
              <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-5">
                <h3 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                  <Smartphone size={14} className="text-gray-400" /> Session Info
                </h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between py-2 border-b border-gray-700/40">
                    <span className="text-gray-400">Session storage</span>
                    <span className="text-gray-300 font-mono text-xs">%AppData%/BizPOS/whatsapp-session</span>
                  </div>
                  <div className="flex items-center justify-between py-2 border-b border-gray-700/40">
                    <span className="text-gray-400">Auto-reconnect delay</span>
                    <span className="text-white font-semibold">15 seconds</span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-gray-400">Session persistence</span>
                    <span className="text-green-400 font-semibold">Survives app restart</span>
                  </div>
                </div>
              </div>

              {/* Warning */}
              <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
                <AlertCircle size={16} className="text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-semibold text-sm mb-1">Important Notes</p>
                  <ul className="space-y-1">
                    {[
                      'Keep your phone connected to internet while the app is running',
                      'WhatsApp may occasionally require re-scanning the QR',
                      'Do not use your WhatsApp account on too many devices',
                      'Sending too many messages too fast can result in a temporary ban',
                    ].map((n, i) => (
                      <li key={i} className="text-yellow-400/70 text-xs flex items-start gap-2">
                        <span className="mt-1 w-1 h-1 rounded-full bg-yellow-400/60 flex-shrink-0" />
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
  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-gray-900">
      <div className="sticky top-0 z-10 bg-gray-900/80 backdrop-blur-md border-b border-gray-700/50">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="p-2 rounded-xl text-gray-400 hover:text-white hover:bg-gray-700/50 transition-all"
          >
            <ArrowLeft size={18} />
          </button>
          <span className="text-white font-semibold text-sm">WhatsApp Settings</span>
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
