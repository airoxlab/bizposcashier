'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SlidersHorizontal, Save, RefreshCw, Printer, ReceiptText, Check,
  Bell, BellOff, UserCheck, DollarSign, Truck, Wallet, Wifi, WifiOff,
  MonitorPlay, ImageIcon, QrCode, Upload, X,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { cacheManager } from '../../../lib/cacheManager'
import { profileManager } from '../../../lib/profileManager'
import { supabase } from '../../../lib/supabase'
import { notify } from '../../../components/ui/NotificationSystem'

// Sub-sections shown in the in-panel mini sidebar.
const SUBS = [
  { id: 'order-behavior', name: 'Order Behavior', desc: 'Confirmation popup',        icon: Check },
  { id: 'auto-print',     name: 'Auto-Print',     desc: 'Kitchen token & receipt',   icon: Printer },
  { id: 'order-rules',    name: 'Order Rules',    desc: 'Customer & order taker',     icon: UserCheck },
  { id: 'charges',        name: 'Charges',        desc: 'Service & delivery',         icon: DollarSign },
  { id: 'kds',            name: 'KDS Alerts',     desc: 'Sounds & timeout',           icon: MonitorPlay },
  { id: 'notifications',  name: 'Notifications',  desc: 'POS toast popups',           icon: Bell },
  { id: 'branding',       name: 'Receipt Branding', desc: 'Logo, footer & toggles',  icon: ReceiptText },
  { id: 'drawer',         name: 'Cashier Drawer', desc: 'Per-shift till',             icon: Wallet },
]

const COLORS = {
  purple: 'bg-gradient-to-r from-purple-500 to-purple-600',
  teal: 'bg-teal-600', amber: 'bg-amber-600', green: 'bg-green-600',
  blue: 'bg-blue-600', orange: 'bg-orange-500', pink: 'bg-pink-600',
  red: 'bg-red-500', emerald: 'bg-emerald-600', rose: 'bg-rose-500',
  indigo: 'bg-indigo-500', violet: 'bg-violet-500',
}

// Compact toggle switch.
function Toggle({ checked, onChange, color = 'purple', disabled = false }) {
  const isDark = themeManager.isDark()
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? (COLORS[color] || COLORS.purple) : isDark ? 'bg-gray-700' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// Compact labelled toggle row.
function Row({ checked, onChange, label, description, color = 'purple', icon = null, disabled = false }) {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  return (
    <div className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
      checked
        ? (isDark ? 'bg-purple-900/15 border-purple-800/60' : 'bg-purple-50 border-purple-200')
        : (isDark ? 'bg-gray-800/40 border-gray-700' : 'bg-gray-50 border-gray-200')
    }`}>
      <div className="flex-1 mr-3">
        <p className={`font-semibold text-sm ${classes.textPrimary} flex items-center gap-1.5`}>{icon}{label}</p>
        {description && <p className={`text-xs mt-0.5 ${classes.textSecondary}`}>{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} color={color} disabled={disabled} />
    </div>
  )
}

export function PosSettingsPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const logoInputRef = useRef(null)
  const qrInputRef = useRef(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingBranding, setSavingBranding] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true)
  const [activeSub, setActiveSub] = useState('order-behavior')

  // Order behavior
  const [showOrderConfirmation, setShowOrderConfirmation] = useState(true)
  const [autoPrintTokenWalkin, setAutoPrintTokenWalkin] = useState(false)
  const [autoPrintTokenTakeaway, setAutoPrintTokenTakeaway] = useState(false)
  const [autoPrintTokenDelivery, setAutoPrintTokenDelivery] = useState(false)
  const [autoPrintReceiptWalkin, setAutoPrintReceiptWalkin] = useState(false)
  const [autoPrintReceiptTakeaway, setAutoPrintReceiptTakeaway] = useState(false)
  const [autoPrintReceiptDelivery, setAutoPrintReceiptDelivery] = useState(false)

  // POS notifications
  const [toastsEnabled, setToastsEnabled] = useState(true)

  // Customer requirement + order taker
  const [requireCustomerWalkin, setRequireCustomerWalkin] = useState(false)
  const [requireCustomerTakeaway, setRequireCustomerTakeaway] = useState(false)
  const [requireCustomerDelivery, setRequireCustomerDelivery] = useState(true)
  const [requireOrderTaker, setRequireOrderTaker] = useState(false)

  // Default charges
  const [defaultSCType, setDefaultSCType] = useState('percentage')
  const [defaultSCValue, setDefaultSCValue] = useState('')
  const [defaultDCType, setDefaultDCType] = useState('fixed')
  const [defaultDCValue, setDefaultDCValue] = useState('')

  // KDS alerts
  const [kdsNewOrderSound, setKdsNewOrderSound] = useState(false)
  const [kdsOrderTimeoutMinutes, setKdsOrderTimeoutMinutes] = useState('')
  const [kdsTimeoutSoundEnabled, setKdsTimeoutSoundEnabled] = useState(false)

  // Cashier drawer
  const [useDrawer, setUseDrawer] = useState(false)

  // Receipt branding (loaded via profileManager so we keep the full profile intact)
  const [branding, setBranding] = useState(null)
  const [tempLogo, setTempLogo] = useState(null)
  const [tempQr, setTempQr] = useState(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [qrPreview, setQrPreview] = useState('')

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    loadAll()
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const applyOperational = (d) => {
    setShowOrderConfirmation(d.show_order_confirmation !== false)
    setAutoPrintTokenWalkin(d.auto_print_token_walkin != null ? !!d.auto_print_token_walkin : !!d.auto_print_kitchen_token)
    setAutoPrintTokenTakeaway(d.auto_print_token_takeaway != null ? !!d.auto_print_token_takeaway : !!d.auto_print_kitchen_token)
    setAutoPrintTokenDelivery(d.auto_print_token_delivery != null ? !!d.auto_print_token_delivery : !!d.auto_print_kitchen_token)
    setAutoPrintReceiptWalkin(d.auto_print_receipt_walkin != null ? !!d.auto_print_receipt_walkin : !!d.auto_print_customer_receipt)
    setAutoPrintReceiptTakeaway(d.auto_print_receipt_takeaway != null ? !!d.auto_print_receipt_takeaway : !!d.auto_print_customer_receipt)
    setAutoPrintReceiptDelivery(d.auto_print_receipt_delivery != null ? !!d.auto_print_receipt_delivery : !!d.auto_print_customer_receipt)
    setToastsEnabled(d.toast_notifications_enabled !== false)
    setRequireCustomerWalkin(!!d.require_customer_walkin)
    setRequireCustomerTakeaway(!!d.require_customer_takeaway)
    setRequireCustomerDelivery(d.require_customer_delivery !== false)
    setRequireOrderTaker(!!d.require_order_taker)
    setDefaultSCType(d.default_service_charge_type || 'percentage')
    setDefaultSCValue(d.default_service_charge_value > 0 ? String(d.default_service_charge_value) : '')
    setDefaultDCType(d.default_delivery_charge_type || 'fixed')
    setDefaultDCValue(d.default_delivery_charge_value > 0 ? String(d.default_delivery_charge_value) : '')
    setKdsNewOrderSound(!!d.kds_new_order_sound)
    setKdsOrderTimeoutMinutes(d.kds_order_timeout_minutes != null ? String(d.kds_order_timeout_minutes) : '')
    setKdsTimeoutSoundEnabled(!!d.kds_timeout_sound_enabled)
    setUseDrawer(!!d.use_cashier_drawer)
  }

  const loadAll = async () => {
    const user = authManager.getCurrentUser()
    if (!user?.id) { setLoading(false); return }
    try {
      const [settingsRes, profile] = await Promise.all([
        supabase
          .from('users')
          .select('show_order_confirmation, auto_print_kitchen_token, auto_print_customer_receipt, auto_print_token_walkin, auto_print_token_takeaway, auto_print_token_delivery, auto_print_receipt_walkin, auto_print_receipt_takeaway, auto_print_receipt_delivery, toast_notifications_enabled, require_customer_walkin, require_customer_takeaway, require_customer_delivery, require_order_taker, default_service_charge_type, default_service_charge_value, default_delivery_charge_type, default_delivery_charge_value, kds_new_order_sound, kds_order_timeout_minutes, kds_timeout_sound_enabled, use_cashier_drawer')
          .eq('id', user.id)
          .single(),
        profileManager.fetchProfileFromDatabase().catch(() => profileManager.getLocalProfile()),
      ])
      if (!settingsRes.error && settingsRes.data) applyOperational(settingsRes.data)
      const p = profile || profileManager.getLocalProfile() || {}
      setBranding(p)
      setLogoPreview(p.store_logo || '')
      setQrPreview(p.qr_code || '')
    } catch (e) {
      console.warn('Failed to load POS settings:', e?.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    const id = notify.loading('Refreshing settings...')
    await loadAll()
    notify.remove(id)
    notify.success('Settings refreshed')
  }

  const handleSaveOperational = async () => {
    const user = authManager.getCurrentUser()
    if (!user?.id) { notify.error('Not logged in'); return }
    if (!navigator.onLine) { notify.error('You are offline. Reconnect to save settings.'); return }

    const scValue = parseFloat(defaultSCValue) || 0
    if (scValue < 0) { notify.error('Service charge cannot be negative'); return }
    if (defaultSCType === 'percentage' && scValue > 100) { notify.error('Service charge % cannot exceed 100'); return }
    const dcValue = parseFloat(defaultDCValue) || 0
    if (dcValue < 0) { notify.error('Delivery charge cannot be negative'); return }
    if (defaultDCType === 'percentage' && dcValue > 100) { notify.error('Delivery charge % cannot exceed 100'); return }

    const timeoutVal = kdsOrderTimeoutMinutes.trim() ? parseInt(kdsOrderTimeoutMinutes) : null
    if (timeoutVal !== null && (isNaN(timeoutVal) || timeoutVal < 1)) {
      notify.error('KDS timeout must be a positive number of minutes'); return
    }

    setSaving(true)
    const toastId = notify.loading('Saving settings...')
    try {
      const payload = {
        show_order_confirmation: showOrderConfirmation,
        auto_print_token_walkin: autoPrintTokenWalkin,
        auto_print_token_takeaway: autoPrintTokenTakeaway,
        auto_print_token_delivery: autoPrintTokenDelivery,
        auto_print_receipt_walkin: autoPrintReceiptWalkin,
        auto_print_receipt_takeaway: autoPrintReceiptTakeaway,
        auto_print_receipt_delivery: autoPrintReceiptDelivery,
        toast_notifications_enabled: toastsEnabled,
        require_customer_walkin: requireCustomerWalkin,
        require_customer_takeaway: requireCustomerTakeaway,
        require_customer_delivery: requireCustomerDelivery,
        require_order_taker: requireOrderTaker,
        default_service_charge_type: defaultSCType,
        default_service_charge_value: scValue,
        default_delivery_charge_type: defaultDCType,
        default_delivery_charge_value: dcValue,
        kds_new_order_sound: kdsNewOrderSound,
        kds_order_timeout_minutes: timeoutVal,
        kds_timeout_sound_enabled: kdsTimeoutSoundEnabled,
        use_cashier_drawer: useDrawer,
      }

      const { error } = await supabase.from('users').update(payload).eq('id', user.id)
      if (error) throw error

      // Re-derive every pos_* localStorage key from the DB so open POS screens sync.
      try {
        cacheManager.setUserId(user.id)
        await cacheManager.refreshOrderTakerSettings()
      } catch (e) {
        console.warn('refreshOrderTakerSettings failed (non-blocking):', e?.message)
      }
      // KDS reads its alert config from the cached auth user.
      authManager.updateUser(payload)

      notify.remove(toastId)
      notify.success('Settings saved and applied')
    } catch (e) {
      notify.remove(toastId)
      notify.error('Failed to save: ' + (e?.message || 'unknown error'))
    } finally {
      setSaving(false)
    }
  }

  // ---- Receipt branding ----
  const setBrandingField = (field, value) => setBranding(prev => ({ ...(prev || {}), [field]: value }))

  const handleLogoSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const { isValid, errors } = await profileManager.validateImageFile(file)
    if (!isValid) { notify.error(errors[0]); return }
    setTempLogo(file)
    const reader = new FileReader()
    reader.onload = ev => setLogoPreview(ev.target.result)
    reader.readAsDataURL(file)
    notify.success('Logo selected. Click Save Branding to upload.')
  }

  const handleQrSelect = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const { isValid, errors } = await profileManager.validateImageFile(file)
    if (!isValid) { notify.error(errors[0]); return }
    setTempQr(file)
    const reader = new FileReader()
    reader.onload = ev => setQrPreview(ev.target.result)
    reader.readAsDataURL(file)
    notify.success('QR code selected. Click Save Branding to upload.')
  }

  const handleSaveBranding = async () => {
    if (!navigator.onLine) { notify.error('You are offline. Reconnect to save branding.'); return }
    setSavingBranding(true)
    const toastId = notify.loading('Saving branding...')
    try {
      // Pass the FULL profile so phone / address / business hours are preserved.
      const result = await profileManager.updateProfile(branding || {}, tempLogo, tempQr)
      notify.remove(toastId)
      if (result?.success) {
        const d = result.data
        setBranding(d)
        setLogoPreview(d.store_logo || '')
        setQrPreview(d.qr_code || '')
        setTempLogo(null); setTempQr(null)
        // Keep the cached auth user fresh for anything reading branding from it.
        authManager.updateUser({
          store_logo: d.store_logo, qr_code: d.qr_code,
          show_logo_on_receipt: d.show_logo_on_receipt,
          show_business_name_on_receipt: d.show_business_name_on_receipt,
          show_footer_section: d.show_footer_section,
          show_powered_by_airoxlab: d.show_powered_by_airoxlab,
          hashtag1: d.hashtag1, hashtag2: d.hashtag2,
          receipt_review_message: d.receipt_review_message,
          receipt_footer_message: d.receipt_footer_message,
        })
        notify.success('Receipt branding saved')
      } else {
        notify.error('Failed to save branding: ' + (result?.error || 'unknown error'))
      }
    } catch (e) {
      notify.remove(toastId)
      notify.error('Failed to save branding: ' + (e?.message || 'unknown error'))
    } finally {
      setSavingBranding(false)
    }
  }

  // ---- shared bits ----
  const card = `${classes.card} ${classes.shadow} ${classes.border} rounded-xl p-4`
  const head = (Icon, title, sub) => (
    <div className="flex items-center gap-2.5 mb-4">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center shadow">
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 className={`text-base font-bold ${classes.textPrimary} leading-tight`}>{title}</h3>
        <p className={`text-xs ${classes.textSecondary}`}>{sub}</p>
      </div>
    </div>
  )

  const OperationalSaveBar = () => (
    <div className="flex justify-end pt-1">
      <motion.button
        whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
        onClick={handleSaveOperational}
        disabled={saving}
        className={`px-6 py-2.5 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold text-sm rounded-lg shadow-md transition-all flex items-center gap-2 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {saving ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save Changes</span></>}
      </motion.button>
    </div>
  )

  const printMatrix = [
    { key: 'walkin', label: 'Walk-in', tokenValue: autoPrintTokenWalkin, tokenSetter: setAutoPrintTokenWalkin, receiptValue: autoPrintReceiptWalkin, receiptSetter: setAutoPrintReceiptWalkin },
    { key: 'takeaway', label: 'Take Away', tokenValue: autoPrintTokenTakeaway, tokenSetter: setAutoPrintTokenTakeaway, receiptValue: autoPrintReceiptTakeaway, receiptSetter: setAutoPrintReceiptTakeaway },
    { key: 'delivery', label: 'Delivery', tokenValue: autoPrintTokenDelivery, tokenSetter: setAutoPrintTokenDelivery, receiptValue: autoPrintReceiptDelivery, receiptSetter: setAutoPrintReceiptDelivery },
  ]

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    )
  }

  const b = branding || {}

  return (
    <motion.div
      key="pos-settings"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      {/* Compact header */}
      <div className={`${card} mb-4`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 flex items-center justify-center shadow-lg">
              <SlidersHorizontal className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className={`text-lg font-bold ${classes.textPrimary} leading-tight`}>POS &amp; Order Settings</h2>
              <p className={`${classes.textSecondary} text-xs`}>Store-wide — shared with the admin panel. No need to ask the admin.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className={`p-1.5 rounded-lg ${classes.button} transition-all`} title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${classes.textSecondary}`} />
            </button>
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
          </div>
        </div>
      </div>

      <div className="flex gap-4 items-start">
        {/* Mini sidebar */}
        <div className="w-48 flex-shrink-0 space-y-1">
          {SUBS.map((s) => {
            const Icon = s.icon
            const active = activeSub === s.id
            return (
              <button
                key={s.id}
                onClick={() => setActiveSub(s.id)}
                className={`w-full text-left p-2 rounded-lg border transition-all ${
                  active
                    ? (isDark ? 'bg-purple-900/25 border-purple-700/50' : 'bg-purple-100 border-purple-200')
                    : (isDark ? 'bg-gray-800/40 border-transparent hover:bg-gray-800' : 'bg-gray-50 border-transparent hover:bg-gray-100')
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 ${
                    active ? (isDark ? 'bg-purple-800/50' : 'bg-purple-200') : (isDark ? 'bg-gray-700/60' : 'bg-white')
                  }`}>
                    <Icon className={`w-3.5 h-3.5 ${isDark ? 'text-purple-300' : 'text-purple-600'}`} />
                  </div>
                  <div className="min-w-0">
                    <div className={`text-xs font-semibold truncate ${classes.textPrimary}`}>{s.name}</div>
                    <div className={`text-[10px] truncate ${classes.textSecondary}`}>{s.desc}</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeSub}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.18 }}
              className="space-y-4"
            >
              {/* ORDER BEHAVIOR */}
              {activeSub === 'order-behavior' && (
                <div className={card}>
                  {head(Check, 'Order Behavior', 'Confirmation screen after each order')}
                  <Row
                    checked={showOrderConfirmation}
                    onChange={() => setShowOrderConfirmation(v => !v)}
                    color="teal"
                    icon={<Check className="w-3.5 h-3.5" />}
                    label="Order Confirmation Popup"
                    description={showOrderConfirmation
                      ? 'Cashier sees a confirmation screen with order details after each order'
                      : 'Confirmation is skipped — cashier returns straight to the order page'}
                  />
                  <p className={`text-xs mt-2 ${classes.textSecondary}`}>Default is ON. Turning it off auto-redirects after order completion.</p>
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* AUTO-PRINT */}
              {activeSub === 'auto-print' && (
                <div className={card}>
                  {head(Printer, 'Auto-Print by Order Type', 'Print kitchen token & receipt automatically')}
                  <div className={`rounded-lg border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <div className={`flex items-center px-3 py-2 text-xs font-medium ${classes.textSecondary} border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
                      <div className="flex-1">Order Type</div>
                      <div className="w-20 flex items-center justify-center gap-1 text-orange-500"><Printer className="w-3.5 h-3.5" /> Token</div>
                      <div className="w-20 flex items-center justify-center gap-1 text-purple-500"><ReceiptText className="w-3.5 h-3.5" /> Receipt</div>
                    </div>
                    {printMatrix.map((row) => (
                      <div key={row.key} className={`flex items-center px-3 py-2.5 border-b last:border-b-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
                        <div className={`flex-1 text-sm font-medium ${classes.textPrimary}`}>{row.label}</div>
                        <div className="w-20 flex justify-center"><Toggle checked={row.tokenValue} onChange={() => row.tokenSetter(v => !v)} color="orange" /></div>
                        <div className="w-20 flex justify-center"><Toggle checked={row.receiptValue} onChange={() => row.receiptSetter(v => !v)} color="purple" /></div>
                      </div>
                    ))}
                  </div>
                  <p className={`text-xs mt-2 ${classes.textSecondary}`}>Requires a printer configured in Printer settings.</p>
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* ORDER RULES */}
              {activeSub === 'order-rules' && (
                <div className={card}>
                  {head(UserCheck, 'Order Rules', 'Require a customer or order taker before placing an order')}
                  <div className="space-y-2.5">
                    <Row checked={requireCustomerWalkin} onChange={() => setRequireCustomerWalkin(v => !v)} color="emerald"
                      label="Require customer — Walk-in"
                      description={requireCustomerWalkin ? 'Must select a customer for walk-in orders' : 'Customer optional for walk-in orders'} />
                    <Row checked={requireCustomerTakeaway} onChange={() => setRequireCustomerTakeaway(v => !v)} color="blue"
                      label="Require customer — Takeaway"
                      description={requireCustomerTakeaway ? 'Must select a customer for takeaway orders' : 'Customer optional for takeaway orders'} />
                    <Row checked={requireCustomerDelivery} onChange={() => setRequireCustomerDelivery(v => !v)} color="orange"
                      label="Require customer — Delivery"
                      description={requireCustomerDelivery ? 'Must select a customer for delivery orders' : 'Customer optional for delivery orders'} />
                    <Row checked={requireOrderTaker} onChange={() => setRequireOrderTaker(v => !v)} color="indigo"
                      label="Require order taker — Walk-in"
                      description={requireOrderTaker ? 'Must select an order taker for walk-in orders' : 'Order taker optional for walk-in orders'} />
                  </div>
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* CHARGES */}
              {activeSub === 'charges' && (
                <div className={card}>
                  {head(DollarSign, 'Default Charges', 'Pre-filled on the payment screen — cashier can still change per order')}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                    <div>
                      <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-1.5`}><DollarSign className="w-4 h-4" /> Service Charge</p>
                      <div className="flex gap-2 mb-2">
                        {['percentage', 'fixed'].map(t => (
                          <button key={t} onClick={() => setDefaultSCType(t)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${defaultSCType === t ? 'bg-orange-500 text-white border-orange-500' : `${classes.card} ${classes.textSecondary} ${classes.border}`}`}>
                            {t === 'percentage' ? 'Percentage (%)' : 'Fixed (Rs)'}
                          </button>
                        ))}
                      </div>
                      <input type="number" min="0" step="0.01" value={defaultSCValue} onChange={(e) => setDefaultSCValue(e.target.value)}
                        placeholder={defaultSCType === 'percentage' ? 'e.g. 5 for 5%' : 'e.g. 50 for Rs 50'}
                        className={`w-full px-3 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                    <div>
                      <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-1.5`}><Truck className="w-4 h-4" /> Delivery Charge</p>
                      <div className="flex gap-2 mb-2">
                        {['fixed', 'percentage'].map(t => (
                          <button key={t} onClick={() => setDefaultDCType(t)}
                            className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${defaultDCType === t ? 'bg-blue-500 text-white border-blue-500' : `${classes.card} ${classes.textSecondary} ${classes.border}`}`}>
                            {t === 'fixed' ? 'Fixed (Rs)' : 'Percentage (%)'}
                          </button>
                        ))}
                      </div>
                      <input type="number" min="0" step="0.01" value={defaultDCValue} onChange={(e) => setDefaultDCValue(e.target.value)}
                        placeholder={defaultDCType === 'percentage' ? 'e.g. 5 for 5%' : 'e.g. 100 for Rs 100'}
                        className={`w-full px-3 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                  </div>
                  <p className={`text-xs mt-2 ${classes.textSecondary}`}>Set a value to 0 or leave blank to disable a default.</p>
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* KDS ALERTS */}
              {activeSub === 'kds' && (
                <div className={card}>
                  {head(MonitorPlay, 'KDS Alerts', 'Sounds and timeout alerts for the Kitchen Display')}
                  <Row checked={kdsNewOrderSound} onChange={() => setKdsNewOrderSound(v => !v)} color="green"
                    label="New Order Sound"
                    description={kdsNewOrderSound ? 'Plays a sound when a new Pending order arrives on KDS' : 'No sound when a new order arrives'} />
                  <div className="mt-3">
                    <label className={`block text-sm font-semibold ${classes.textPrimary} mb-1`}>Order Timeout (minutes)</label>
                    <p className={`text-xs mb-2 ${classes.textSecondary}`}>Cards turn red past this age. Leave empty to disable.</p>
                    <input type="number" min="1" value={kdsOrderTimeoutMinutes} onChange={(e) => setKdsOrderTimeoutMinutes(e.target.value)}
                      placeholder="e.g. 10  (leave empty to disable)"
                      className={`w-full px-3 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm`} />
                  </div>
                  {kdsOrderTimeoutMinutes.trim() !== '' && (
                    <div className="mt-3">
                      <Row checked={kdsTimeoutSoundEnabled} onChange={() => setKdsTimeoutSoundEnabled(v => !v)} color="red"
                        label="Timeout Alert Sound"
                        description={kdsTimeoutSoundEnabled ? 'Plays once when an order first turns red' : 'No sound — visual indicator only'} />
                    </div>
                  )}
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* NOTIFICATIONS */}
              {activeSub === 'notifications' && (
                <div className={card}>
                  {head(Bell, 'POS Notifications', 'Popup toasts shown across the cashier app')}
                  <Row checked={toastsEnabled} onChange={() => setToastsEnabled(v => !v)} color="amber"
                    icon={toastsEnabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                    label="Show success / info toasts"
                    description={toastsEnabled ? 'Cashiers see popup notifications for every action' : 'Success / info toasts hidden to reduce noise'} />
                  <p className={`text-xs mt-2 ${classes.textSecondary}`}>Errors and warnings (blocked actions) always display regardless of this toggle.</p>
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* CASHIER DRAWER */}
              {activeSub === 'drawer' && (
                <div className={card}>
                  {head(Wallet, 'Cashier Drawer System', 'Per-shift cash till tracking')}
                  <Row checked={useDrawer} onChange={() => setUseDrawer(v => !v)} color="indigo"
                    label="Enable Cashier Drawer System"
                    description={useDrawer ? 'Cash payments prompt for drawer selection and track per shift' : 'Cash drawer tracking is disabled'} />
                  <div className="mt-4"><OperationalSaveBar /></div>
                </div>
              )}

              {/* RECEIPT BRANDING */}
              {activeSub === 'branding' && (
                <div className={card}>
                  {head(ReceiptText, 'Receipt Branding', 'What appears on printed receipts')}

                  {/* Logo + QR uploads */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Logo */}
                    <div>
                      <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-1.5`}><ImageIcon className="w-4 h-4" /> Receipt Logo</p>
                      <div className="flex items-start gap-3">
                        <div className={`w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-300 bg-gray-50'}`}>
                          {logoPreview ? <img src={logoPreview} alt="Logo" className="w-full h-full object-contain p-1" /> : <ImageIcon className={`w-7 h-7 ${classes.textSecondary}`} />}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className={`text-xs ${classes.textSecondary}`}>PNG, JPG, WebP or SVG — max 5 MB.</p>
                          <input ref={logoInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/svg+xml" className="hidden" onChange={handleLogoSelect} />
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => logoInputRef.current?.click()} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${classes.border} ${classes.button}`}>
                              <Upload className="w-3.5 h-3.5" /> {logoPreview ? 'Replace' : 'Upload'}
                            </button>
                            {logoPreview && (
                              <button onClick={() => { setLogoPreview(''); setTempLogo(null); setBrandingField('store_logo', ''); if (logoInputRef.current) logoInputRef.current.value = '' }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-xs font-medium text-red-600 dark:text-red-400">
                                <X className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* QR */}
                    <div>
                      <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-1.5`}><QrCode className="w-4 h-4" /> Receipt QR Code</p>
                      <div className="flex items-start gap-3">
                        <div className={`w-20 h-20 rounded-lg border-2 border-dashed flex items-center justify-center overflow-hidden flex-shrink-0 ${isDark ? 'border-gray-600 bg-gray-800/50' : 'border-gray-300 bg-gray-50'}`}>
                          {qrPreview ? <img src={qrPreview} alt="QR" className="w-full h-full object-contain p-1" /> : <QrCode className={`w-7 h-7 ${classes.textSecondary}`} />}
                        </div>
                        <div className="flex-1 space-y-2">
                          <p className={`text-xs ${classes.textSecondary}`}>Google review / menu link. PNG or JPG — max 5 MB.</p>
                          <input ref={qrInputRef} type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleQrSelect} />
                          <div className="flex flex-wrap gap-2">
                            <button onClick={() => qrInputRef.current?.click()} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium ${classes.border} ${classes.button}`}>
                              <Upload className="w-3.5 h-3.5" /> {qrPreview ? 'Replace' : 'Upload'}
                            </button>
                            {qrPreview && (
                              <button onClick={() => { setQrPreview(''); setTempQr(null); setBrandingField('qr_code', ''); if (qrInputRef.current) qrInputRef.current.value = '' }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-700 text-xs font-medium text-red-600 dark:text-red-400">
                                <X className="w-3.5 h-3.5" /> Remove
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toggles */}
                  <div className="mt-4 space-y-2.5">
                    <Row checked={b.show_logo_on_receipt !== false} onChange={() => setBrandingField('show_logo_on_receipt', !(b.show_logo_on_receipt !== false))} color="rose"
                      label="Show Logo on Receipt" description="Print your store logo at the top of each receipt" />
                    <Row checked={b.show_business_name_on_receipt !== false} onChange={() => setBrandingField('show_business_name_on_receipt', !(b.show_business_name_on_receipt !== false))} color="violet"
                      label="Print Business Name" description="Store name printed as a bold header" />
                    <Row checked={b.show_footer_section !== false} onChange={() => setBrandingField('show_footer_section', !(b.show_footer_section !== false))} color="teal"
                      label="Show Footer Section" description="QR code, review message and hashtags at the bottom" />
                    <Row checked={b.show_powered_by_airoxlab !== false} onChange={() => setBrandingField('show_powered_by_airoxlab', !(b.show_powered_by_airoxlab !== false))} color="indigo"
                      label='Show "Powered by airoxlab.com"' description="Small branding line at the very bottom" />
                  </div>

                  {/* Hashtags + messages */}
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div>
                      <label className={`block text-xs font-semibold ${classes.textPrimary} mb-1`}>Hashtag 1</label>
                      <input type="text" maxLength={30} value={b.hashtag1 || ''} onChange={e => setBrandingField('hashtag1', e.target.value)} placeholder="#YourBrand"
                        className={`w-full px-3 py-2 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold ${classes.textPrimary} mb-1`}>Hashtag 2</label>
                      <input type="text" maxLength={30} value={b.hashtag2 || ''} onChange={e => setBrandingField('hashtag2', e.target.value)} placeholder="#YourCity"
                        className={`w-full px-3 py-2 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                  </div>
                  <div className="mt-3 space-y-3">
                    <div>
                      <label className={`block text-xs font-semibold ${classes.textPrimary} mb-1`}>Review Message <span className={`font-normal ${classes.textSecondary}`}>(footer)</span></label>
                      <input type="text" maxLength={100} value={b.receipt_review_message || ''} onChange={e => setBrandingField('receipt_review_message', e.target.value)} placeholder="e.g. Your feedback = our glow up"
                        className={`w-full px-3 py-2 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold ${classes.textPrimary} mb-1`}>Thank-you Message <span className={`font-normal ${classes.textSecondary}`}>(before powered-by line)</span></label>
                      <input type="text" maxLength={100} value={b.receipt_footer_message || ''} onChange={e => setBrandingField('receipt_footer_message', e.target.value)} placeholder="e.g. Thanks for visiting! See you soon!"
                        className={`w-full px-3 py-2 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-sm`} />
                    </div>
                  </div>

                  <div className="flex justify-end pt-4">
                    <motion.button
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                      onClick={handleSaveBranding}
                      disabled={savingBranding}
                      className={`px-6 py-2.5 bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-700 hover:to-rose-800 text-white font-bold text-sm rounded-lg shadow-md transition-all flex items-center gap-2 ${savingBranding ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {savingBranding ? <><RefreshCw className="w-4 h-4 animate-spin" /><span>Saving...</span></> : <><Save className="w-4 h-4" /><span>Save Branding</span></>}
                    </motion.button>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
