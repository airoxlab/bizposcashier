'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  SlidersHorizontal, Save, RefreshCw, Printer, ReceiptText, Check,
  Bell, BellOff, UserCheck, DollarSign, Truck, Wallet, Wifi, WifiOff, MonitorPlay,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { cacheManager } from '../../../lib/cacheManager'
import { supabase } from '../../../lib/supabase'
import { notify } from '../../../components/ui/NotificationSystem'

// Standalone toggle used throughout this panel — matches the Personal panel style.
function Toggle({ checked, onChange, color = 'purple', disabled = false }) {
  const isDark = themeManager.isDark()
  const onColor = {
    purple: 'bg-gradient-to-r from-purple-500 to-purple-600',
    teal: 'bg-teal-600',
    amber: 'bg-amber-600',
    green: 'bg-green-600',
    blue: 'bg-blue-600',
    orange: 'bg-orange-500',
    pink: 'bg-pink-600',
    red: 'bg-red-500',
    emerald: 'bg-emerald-600',
  }[color] || 'bg-purple-600'
  return (
    <button
      type="button"
      onClick={onChange}
      disabled={disabled}
      className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? onColor : isDark ? 'bg-gray-700' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg transition-transform duration-200 ${checked ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  )
}

// A labelled toggle row inside a card.
function ToggleRow({ checked, onChange, label, description, color = 'purple', icon = null, activeClass = '', disabled = false }) {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  return (
    <div className={`flex items-start justify-between p-4 rounded-xl border transition-colors ${
      checked
        ? (activeClass || (isDark ? 'bg-purple-900/20 border-purple-800' : 'bg-purple-50 border-purple-200'))
        : (isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200')
    }`}>
      <div className="flex-1 mr-4">
        <p className={`font-semibold text-sm ${classes.textPrimary} flex items-center gap-2`}>
          {icon}{label}
        </p>
        {description && <p className={`text-xs mt-0.5 ${classes.textSecondary}`}>{description}</p>}
      </div>
      <Toggle checked={checked} onChange={onChange} color={color} disabled={disabled} />
    </div>
  )
}

export function PosSettingsPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true)

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

  // Customer requirement
  const [requireCustomerWalkin, setRequireCustomerWalkin] = useState(false)
  const [requireCustomerTakeaway, setRequireCustomerTakeaway] = useState(false)
  const [requireCustomerDelivery, setRequireCustomerDelivery] = useState(true)

  // Order taker
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

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    loadSettings()
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const applyRow = (d) => {
    setShowOrderConfirmation(d.show_order_confirmation !== false)
    // Per-order-type auto-print. Fall back to the legacy global flags so a row
    // that hasn't been migrated yet still reflects the old behavior.
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

  const loadSettings = async () => {
    const user = authManager.getCurrentUser()
    if (!user?.id) { setLoading(false); return }
    try {
      const { data, error } = await supabase
        .from('users')
        .select('show_order_confirmation, auto_print_kitchen_token, auto_print_customer_receipt, auto_print_token_walkin, auto_print_token_takeaway, auto_print_token_delivery, auto_print_receipt_walkin, auto_print_receipt_takeaway, auto_print_receipt_delivery, toast_notifications_enabled, require_customer_walkin, require_customer_takeaway, require_customer_delivery, require_order_taker, default_service_charge_type, default_service_charge_value, default_delivery_charge_type, default_delivery_charge_value, kds_new_order_sound, kds_order_timeout_minutes, kds_timeout_sound_enabled, use_cashier_drawer')
        .eq('id', user.id)
        .single()
      if (!error && data) applyRow(data)
    } catch (e) {
      console.warn('Failed to load POS settings:', e?.message)
    } finally {
      setLoading(false)
    }
  }

  const handleRefresh = async () => {
    const id = notify.loading('Refreshing settings...')
    await loadSettings()
    notify.remove(id)
    notify.success('Settings refreshed')
  }

  const handleSave = async () => {
    const user = authManager.getCurrentUser()
    if (!user?.id) { notify.error('Not logged in'); return }
    if (!navigator.onLine) { notify.error('You are offline. Reconnect to save settings.'); return }

    // Validate charges
    const scValue = parseFloat(defaultSCValue) || 0
    if (scValue < 0) { notify.error('Service charge cannot be negative'); return }
    if (defaultSCType === 'percentage' && scValue > 100) { notify.error('Service charge % cannot exceed 100'); return }
    const dcValue = parseFloat(defaultDCValue) || 0
    if (dcValue < 0) { notify.error('Delivery charge cannot be negative'); return }
    if (defaultDCType === 'percentage' && dcValue > 100) { notify.error('Delivery charge % cannot exceed 100'); return }

    // Validate KDS timeout
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

      // Re-derive all POS localStorage keys from the DB (single source of truth):
      // pos_show_order_confirmation, pos_auto_print_*, pos_require_customer,
      // pos_require_order_taker, pos_toast_enabled, pos_cashier_drawer_enabled,
      // pos_default_service/delivery_charge. Keeps every open POS screen in sync.
      try {
        cacheManager.setUserId(user.id)
        await cacheManager.refreshOrderTakerSettings()
      } catch (e) {
        console.warn('refreshOrderTakerSettings failed (non-blocking):', e?.message)
      }

      // KDS reads its alert config from the cached auth user, so keep it fresh too.
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

  const printMatrix = [
    { key: 'walkin', label: 'Walk-in', tokenValue: autoPrintTokenWalkin, tokenSetter: setAutoPrintTokenWalkin, receiptValue: autoPrintReceiptWalkin, receiptSetter: setAutoPrintReceiptWalkin },
    { key: 'takeaway', label: 'Take Away', tokenValue: autoPrintTokenTakeaway, tokenSetter: setAutoPrintTokenTakeaway, receiptValue: autoPrintReceiptTakeaway, receiptSetter: setAutoPrintReceiptTakeaway },
    { key: 'delivery', label: 'Delivery', tokenValue: autoPrintTokenDelivery, tokenSetter: setAutoPrintTokenDelivery, receiptValue: autoPrintReceiptDelivery, receiptSetter: setAutoPrintReceiptDelivery },
  ]

  const customerRows = [
    { key: 'walkin', label: 'Walk-in', value: requireCustomerWalkin, setter: setRequireCustomerWalkin, color: 'emerald' },
    { key: 'takeaway', label: 'Takeaway', value: requireCustomerTakeaway, setter: setRequireCustomerTakeaway, color: 'blue' },
    { key: 'delivery', label: 'Delivery', value: requireCustomerDelivery, setter: setRequireCustomerDelivery, color: 'orange' },
  ]

  const card = `${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`
  const sectionHead = (Icon, gradient, title, sub) => (
    <div className="flex items-center space-x-3 mb-6">
      <div className={`w-12 h-12 bg-gradient-to-br ${gradient} rounded-xl flex items-center justify-center shadow-lg`}>
        <Icon className="w-6 h-6 text-white" />
      </div>
      <div>
        <h3 className={`text-lg font-bold ${classes.textPrimary}`}>{title}</h3>
        <p className={`text-sm ${classes.textSecondary}`}>{sub}</p>
      </div>
    </div>
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <RefreshCw className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    )
  }

  return (
    <motion.div
      key="pos-settings"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-4xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className={card}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg">
              <SlidersHorizontal className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className={`text-2xl font-bold ${classes.textPrimary}`}>POS &amp; Order Settings</h2>
              <p className={`${classes.textSecondary} text-sm mt-1`}>Control order behavior, printing, charges and alerts — no need to ask the admin</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} className={`p-1.5 rounded-lg ${classes.button} transition-all`} title="Refresh">
              <RefreshCw className={`w-3.5 h-3.5 ${classes.textSecondary}`} />
            </button>
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
          </div>
        </div>
        <div className={`mt-4 rounded-xl p-3 border ${isDark ? 'bg-indigo-900/20 border-indigo-800' : 'bg-indigo-50 border-indigo-200'}`}>
          <p className={`text-xs ${isDark ? 'text-indigo-300' : 'text-indigo-700'}`}>
            These settings apply to the whole store (all cashiers &amp; POS machines) and are shared with the admin panel. Changes take effect immediately after saving.
          </p>
        </div>
      </div>

      {/* Order Behavior */}
      <div className={card}>
        {sectionHead(Printer, 'from-teal-500 to-emerald-500', 'Order Behavior', 'Confirmation popup and automatic printing after each order')}

        <ToggleRow
          checked={showOrderConfirmation}
          onChange={() => setShowOrderConfirmation(v => !v)}
          color="teal"
          icon={<Check className="w-4 h-4" />}
          label="Order Confirmation Popup"
          description={showOrderConfirmation
            ? 'After each order, the cashier sees a confirmation screen with order details'
            : 'Confirmation screen is skipped — cashier returns directly to the order page'}
          activeClass={isDark ? 'bg-teal-900/20 border-teal-800' : 'bg-teal-50 border-teal-200'}
        />

        {/* Auto-print matrix */}
        <div className={`mt-4 rounded-xl border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className={`p-4 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-200 bg-gray-50'}`}>
            <p className={`font-semibold text-sm ${classes.textPrimary} flex items-center gap-2`}>
              <Printer className="w-4 h-4" /> Auto-Print by Order Type
            </p>
            <p className={`text-xs mt-0.5 ${classes.textSecondary}`}>
              For each order type, choose whether the kitchen token and customer receipt print automatically once the order is punched.
            </p>
            <p className={`text-xs mt-1 italic ${classes.textSecondary}`}>Requires a printer configured in Printer settings.</p>
          </div>

          <div className={`flex items-center px-4 py-2 text-xs font-medium ${classes.textSecondary} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex-1">Order Type</div>
            <div className="w-24 flex items-center justify-center gap-1 text-orange-500"><Printer className="w-3.5 h-3.5" /> Token</div>
            <div className="w-24 flex items-center justify-center gap-1 text-purple-500"><ReceiptText className="w-3.5 h-3.5" /> Receipt</div>
          </div>

          {printMatrix.map((row) => (
            <div key={row.key} className={`flex items-center px-4 py-3 border-b last:border-b-0 ${isDark ? 'border-gray-800' : 'border-gray-100'}`}>
              <div className={`flex-1 text-sm font-medium ${classes.textPrimary}`}>{row.label}</div>
              <div className="w-24 flex justify-center">
                <Toggle checked={row.tokenValue} onChange={() => row.tokenSetter(v => !v)} color="orange" />
              </div>
              <div className="w-24 flex justify-center">
                <Toggle checked={row.receiptValue} onChange={() => row.receiptSetter(v => !v)} color="purple" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* POS Notifications */}
      <div className={card}>
        {sectionHead(Bell, 'from-amber-500 to-yellow-500', 'POS Notifications', 'Popup toasts shown across the cashier app')}
        <ToggleRow
          checked={toastsEnabled}
          onChange={() => setToastsEnabled(v => !v)}
          color="amber"
          icon={toastsEnabled ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
          label="Show success / info toasts"
          description={toastsEnabled
            ? 'Cashiers see popup notifications for every action'
            : 'Success / info toasts are hidden to reduce noise during service'}
          activeClass={isDark ? 'bg-amber-900/20 border-amber-800' : 'bg-amber-50 border-amber-200'}
        />
        <p className={`text-xs mt-2 ${classes.textSecondary}`}>
          Errors and warnings (e.g. &quot;Customer required&quot;, &quot;Failed to place order&quot;) always display, so cashiers never miss a blocked action.
        </p>
      </div>

      {/* Customer Requirement */}
      <div className={card}>
        {sectionHead(UserCheck, 'from-pink-500 to-rose-500', 'Customer Requirement', 'Make selecting a customer mandatory per order type')}
        <div className="space-y-3">
          {customerRows.map((row) => (
            <ToggleRow
              key={row.key}
              checked={row.value}
              onChange={() => row.setter(v => !v)}
              color={row.color}
              label={`Require customer on ${row.label.toLowerCase()} orders`}
              description={row.value
                ? `Staff must select a customer before placing a ${row.label.toLowerCase()} order`
                : `Customer selection is optional for ${row.label.toLowerCase()} orders`}
            />
          ))}
        </div>
      </div>

      {/* Order Taker */}
      <div className={card}>
        {sectionHead(UserCheck, 'from-blue-500 to-cyan-500', 'Order Taker', 'Order taker selection on walk-in orders')}
        <ToggleRow
          checked={requireOrderTaker}
          onChange={() => setRequireOrderTaker(v => !v)}
          color="blue"
          label="Require order taker on walk-in orders"
          description={requireOrderTaker
            ? 'Staff must select an order taker before placing a walk-in order'
            : 'Order taker selection is optional for walk-in orders'}
        />
      </div>

      {/* Default Charges */}
      <div className={card}>
        {sectionHead(DollarSign, 'from-orange-500 to-amber-500', 'Default Charges', 'Pre-filled service & delivery charges on the payment screen')}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Service charge */}
          <div>
            <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-2`}><DollarSign className="w-4 h-4" /> Service Charge</p>
            <div className="flex gap-2 mb-3">
              {['percentage', 'fixed'].map(t => (
                <button
                  key={t}
                  onClick={() => setDefaultSCType(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    defaultSCType === t ? 'bg-orange-500 text-white border-orange-500' : `${classes.card} ${classes.textSecondary} ${classes.border}`
                  }`}
                >
                  {t === 'percentage' ? 'Percentage (%)' : 'Fixed (Rs)'}
                </button>
              ))}
            </div>
            <input
              type="number" min="0" step="0.01" value={defaultSCValue}
              onChange={(e) => setDefaultSCValue(e.target.value)}
              placeholder={defaultSCType === 'percentage' ? 'e.g. 5 for 5%' : 'e.g. 50 for Rs 50'}
              className={`w-full px-4 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-orange-500 focus:border-transparent outline-none`}
            />
          </div>
          {/* Delivery charge */}
          <div>
            <p className={`text-sm font-semibold ${classes.textPrimary} mb-2 flex items-center gap-2`}><Truck className="w-4 h-4" /> Delivery Charge</p>
            <div className="flex gap-2 mb-3">
              {['fixed', 'percentage'].map(t => (
                <button
                  key={t}
                  onClick={() => setDefaultDCType(t)}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    defaultDCType === t ? 'bg-blue-500 text-white border-blue-500' : `${classes.card} ${classes.textSecondary} ${classes.border}`
                  }`}
                >
                  {t === 'fixed' ? 'Fixed (Rs)' : 'Percentage (%)'}
                </button>
              ))}
            </div>
            <input
              type="number" min="0" step="0.01" value={defaultDCValue}
              onChange={(e) => setDefaultDCValue(e.target.value)}
              placeholder={defaultDCType === 'percentage' ? 'e.g. 5 for 5%' : 'e.g. 100 for Rs 100'}
              className={`w-full px-4 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none`}
            />
          </div>
        </div>
        <p className={`text-xs mt-3 ${classes.textSecondary}`}>Set a value to 0 or leave blank to disable a default. Cashiers can still change it per order.</p>
      </div>

      {/* KDS Alerts */}
      <div className={card}>
        {sectionHead(MonitorPlay, 'from-green-500 to-teal-500', 'KDS Alerts', 'Sounds and timeout alerts for the Kitchen Display screen')}
        <ToggleRow
          checked={kdsNewOrderSound}
          onChange={() => setKdsNewOrderSound(v => !v)}
          color="green"
          label="New Order Sound"
          description={kdsNewOrderSound
            ? 'A sound plays on the KDS screen whenever a new Pending order arrives'
            : 'No sound plays when a new order arrives on KDS'}
        />
        <div className="mt-4">
          <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Order Timeout (minutes)</label>
          <p className={`text-xs mb-2 ${classes.textSecondary}`}>If a Pending order stays on KDS longer than this, its card turns red. Leave empty to disable.</p>
          <input
            type="number" min="1" value={kdsOrderTimeoutMinutes}
            onChange={(e) => setKdsOrderTimeoutMinutes(e.target.value)}
            placeholder="e.g. 10  (leave empty to disable)"
            className={`w-full px-4 py-2.5 ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none`}
          />
        </div>
        {kdsOrderTimeoutMinutes.trim() !== '' && (
          <div className="mt-4">
            <ToggleRow
              checked={kdsTimeoutSoundEnabled}
              onChange={() => setKdsTimeoutSoundEnabled(v => !v)}
              color="red"
              label="Timeout Alert Sound"
              description={kdsTimeoutSoundEnabled
                ? 'A sound plays once when an order first turns red on KDS'
                : 'No sound when an order turns red — visual indicator only'}
              activeClass={isDark ? 'bg-red-900/20 border-red-800' : 'bg-red-50 border-red-200'}
            />
          </div>
        )}
      </div>

      {/* Cashier Drawer */}
      <div className={card}>
        {sectionHead(Wallet, 'from-indigo-500 to-purple-500', 'Cashier Drawer System', 'Track cash in/out with a per-shift cash drawer')}
        <ToggleRow
          checked={useDrawer}
          onChange={() => setUseDrawer(v => !v)}
          color="purple"
          label="Enable Cashier Drawer System"
          description={useDrawer
            ? 'Cash payments prompt for drawer selection and are tracked per shift'
            : 'Cash drawer tracking is disabled'}
        />
      </div>

      {/* Save */}
      <div className="flex justify-end pb-4">
        <motion.button
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          onClick={handleSave}
          disabled={saving}
          className={`px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-3 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {saving ? <><RefreshCw className="w-5 h-5 animate-spin" /><span>Saving...</span></> : <><Save className="w-5 h-5" /><span>Save Changes</span></>}
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
