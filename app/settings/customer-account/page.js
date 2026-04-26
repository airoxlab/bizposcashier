'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CreditCard,
  FileText,
  Send,
  Clock,
  Save,
  Loader2,
  Copy,
  Check,
  Eye,
  EyeOff,
  Info,
  MessageSquare,
  Search,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertCircle,
  AlertTriangle,
  Power,
  ShieldAlert,
  RefreshCw,
  X,
  Users,
  Square,
  CheckSquare,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import { permissionManager } from '../../../lib/permissionManager'
import themeManager from '../../../lib/themeManager'
import { notify } from '../../../components/ui/NotificationSystem'

// ─── Template variable chips for account messages ─────────────────────────────
const TEMPLATE_VARS = [
  { label: '{customer_name}', desc: 'Customer full name' },
  { label: '{phone}', desc: 'Customer phone' },
  { label: '{order_number}', desc: 'Order #' },
  { label: '{order_total}', desc: 'Current order total' },
  { label: '{subtotal}', desc: 'Order subtotal before charges' },
  { label: '{order_items}', desc: 'List of items ordered' },
  { label: '{discount}', desc: 'Discount amount' },
  { label: '{service_charge}', desc: 'Service charges' },
  { label: '{loyalty_points}', desc: 'Loyalty points earned' },
  { label: '{previous_balance}', desc: 'Balance before this order' },
  { label: '{new_balance}', desc: 'Balance after this order' },
  { label: '{order_date}', desc: 'Date of order' },
  { label: '{business_name}', desc: 'Your business name' },
]

// Variables available in manual send (customer context, no order context)
const MANUAL_SEND_VARS = [
  { label: '{customer_name}', desc: 'Customer full name' },
  { label: '{phone}', desc: 'Customer phone' },
  { label: '{balance}', desc: 'Outstanding balance' },
  { label: '{business_name}', desc: 'Your business name' },
]

// Variables available in bulk send
const BULK_SEND_VARS = [
  { label: '{customer_name}', desc: 'Customer full name' },
  { label: '{phone}', desc: 'Customer phone' },
  { label: '{balance}', desc: 'Outstanding balance' },
  { label: '{business_name}', desc: 'Your business name' },
]

const DEFAULT_TEMPLATE = `Dear {customer_name},

Your order #{order_number} has been placed on your account.

{order_items}

Order Total: Rs.{order_total}
Previous Balance: Rs.{previous_balance}
New Balance: Rs.{new_balance}

Date: {order_date}

Thank you for your business!
— {business_name}`

// ─── Toggle Switch (matching WhatsApp panel) ──────────────────────────────────
const Toggle = ({ checked, onChange, disabled = false }) => (
  <button
    type="button"
    onClick={onChange}
    disabled={disabled}
    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
      checked ? 'bg-purple-500' : 'bg-gray-600'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    <span
      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition-transform duration-200 ${
        checked ? 'translate-x-5' : 'translate-x-0'
      }`}
    />
  </button>
)

// ─── Status Badge for logs ────────────────────────────────────────────────────
const LogStatusBadge = ({ status }) => {
  const configs = {
    sent: { label: 'Sent', color: 'bg-green-500/20 text-green-400 border-green-500/30', icon: CheckCircle },
    failed: { label: 'Failed', color: 'bg-red-500/20 text-red-400 border-red-500/30', icon: XCircle },
    pending: { label: 'Pending', color: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', icon: Clock },
  }
  const cfg = configs[status] || configs.pending
  const Icon = cfg.icon
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <Icon size={12} />
      {cfg.label}
    </span>
  )
}

// ─── Embeddable Panel (used inside settings sidebar) ─────────────────────────
export function CustomerAccountPanel() {
  const isDark = themeManager.isDark()
  const classes = themeManager.getClasses()

  const [activeTab, setActiveTab] = useState('templates')
  const [isSaving, setIsSaving] = useState(false)
  const [settingsLoaded, setSettingsLoaded] = useState(false)
  const [copiedVar, setCopiedVar] = useState(null)
  const [previewVisible, setPreviewVisible] = useState(false)
  const textareaRef = useRef(null)

  // Role detection
  const isAdmin = authManager.getRole() === 'admin'
  const isCashier = !isAdmin

  // Settings state
  const [settings, setSettings] = useState({
    service_enabled: false,
    auto_send_on_account_payment: false,
    send_receipt_image: false,
    include_logo_on_images: true,
    account_template: DEFAULT_TEMPLATE,
  })

  // Templates list state
  const [templates, setTemplates] = useState([])

  // Manual send state
  const [manualPhone, setManualPhone] = useState('')
  const [manualMessage, setManualMessage] = useState('Dear {customer_name},\n\nThis is a reminder that your current outstanding balance is Rs.{balance}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\n— {business_name}')
  const [manualImage, setManualImage] = useState(null)
  const [manualSendReceiptImage, setManualSendReceiptImage] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [searchingCustomers, setSearchingCustomers] = useState(false)
  const customerSearchRef = useRef(null)
  const searchTimeoutRef = useRef(null)
  const manualTextareaRef = useRef(null)

  // Bulk send state
  const [bulkCustomers, setBulkCustomers] = useState([])
  const [bulkSelected, setBulkSelected] = useState(new Set())
  const [bulkLoading, setBulkLoading] = useState(false)
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ sent: 0, failed: 0, total: 0 })
  const [bulkSearch, setBulkSearch] = useState('')
  const [bulkMessage, setBulkMessage] = useState('Dear {customer_name},\n\nThis is a reminder that your current outstanding balance is Rs.{balance}.\n\nPlease arrange payment at your earliest convenience.\n\nThank you!\n— {business_name}')
  const [bulkSendReceiptImage, setBulkSendReceiptImage] = useState(false)
  const bulkTextareaRef = useRef(null)

  // Logs state
  const [logs, setLogs] = useState([])
  const [logsLoading, setLogsLoading] = useState(false)
  const [logsPage, setLogsPage] = useState(1)
  const [logsSearch, setLogsSearch] = useState('')
  const [expandedLog, setExpandedLog] = useState(null)
  const [resendingLog, setResendingLog] = useState(null)
  const LOGS_PER_PAGE = 15

  const currentUser = authManager.getCurrentUser()
  const userId = currentUser?.id
  console.log('🔑 [CustomerAccount] userId:', userId, 'role:', currentUser?.cashier_id ? 'cashier' : 'admin')

  // ── Load settings & templates ────────────────────────────
  useEffect(() => {
    if (userId) {
      loadSettings()
      loadTemplates()
    } else {
      console.warn('⚠️ [CustomerAccount] No userId — authManager may not be initialized yet')
    }
  }, [userId])

  // ── Load logs when tab switches ──────────────────────────
  useEffect(() => {
    if (activeTab === 'logs' && userId) {
      loadLogs()
    }
  }, [activeTab, userId, logsPage])

  // ── Load bulk customers when tab switches ──────────────────
  useEffect(() => {
    if (activeTab === 'bulk' && userId) {
      loadBulkCustomers()
    }
  }, [activeTab, userId])


  // ── Close customer dropdown on outside click ──────────────
  useEffect(() => {
    function handleClickOutside(e) {
      if (customerSearchRef.current && !customerSearchRef.current.contains(e.target)) {
        setShowCustomerDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadSettings() {
    console.log('📋 [CustomerAccount] loadSettings with userId:', userId)
    try {
      const { data, error } = await supabase
        .from('customer_account_settings')
        .select('*')
        .eq('user_id', userId)
        .single()

      console.log('📋 [CustomerAccount] loadSettings result:', { data, error: error?.message })
      if (data && !error) {
        setSettings(prev => ({ ...prev, ...data }))
      }
    } catch (e) {
      console.log('📋 [CustomerAccount] No settings yet — using defaults')
    } finally {
      setSettingsLoaded(true)
    }
  }

  async function loadTemplates() {
    try {
      const { data, error } = await supabase
        .from('customer_account_templates')
        .select('*')
        .eq('user_id', userId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: true })

      if (data && !error) {
        setTemplates(data)
        // If no templates exist, we'll create a default one on first save
      }
    } catch (e) {
      console.error('Error loading templates:', e)
    }
  }

  async function loadLogs() {
    setLogsLoading(true)
    try {
      let query = supabase
        .from('customer_account_send_logs')
        .select('*', { count: 'exact' })
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range((logsPage - 1) * LOGS_PER_PAGE, logsPage * LOGS_PER_PAGE - 1)

      if (logsSearch.trim()) {
        query = query.or(`customer_name.ilike.%${logsSearch}%,phone.ilike.%${logsSearch}%,order_number.ilike.%${logsSearch}%`)
      }

      const { data, error, count } = await query
      console.log('📋 [CustomerAccount] loadLogs result:', { count, rows: data?.length, error: error?.message })

      if (error) {
        console.error('❌ [CustomerAccount] loadLogs error:', error)
      }
      setLogs(data || [])
    } catch (e) {
      console.error('❌ [CustomerAccount] loadLogs exception:', e)
    } finally {
      setLogsLoading(false)
    }
  }

  async function loadBulkCustomers() {
    setBulkLoading(true)
    try {
      // Get all customers with positive balance (they owe money)
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, account_balance')
        .eq('user_id', userId)
        .gt('account_balance', 0)
        .order('account_balance', { ascending: false })

      if (!error && data) {
        setBulkCustomers(data)
        // Auto-select all by default
        setBulkSelected(new Set(data.map(c => c.id)))
      }
    } catch (e) {
      console.error('Error loading bulk customers:', e)
      notify.error('Failed to load customers with balance')
    } finally {
      setBulkLoading(false)
    }
  }

  function toggleBulkSelect(customerId) {
    setBulkSelected(prev => {
      const next = new Set(prev)
      if (next.has(customerId)) next.delete(customerId)
      else next.add(customerId)
      return next
    })
  }

  function toggleBulkSelectAll() {
    const filtered = filteredBulkCustomers
    if (bulkSelected.size === filtered.length) {
      setBulkSelected(new Set())
    } else {
      setBulkSelected(new Set(filtered.map(c => c.id)))
    }
  }

  const filteredBulkCustomers = bulkCustomers.filter(c =>
    !bulkSearch.trim() ||
    c.full_name?.toLowerCase().includes(bulkSearch.toLowerCase()) ||
    c.phone?.includes(bulkSearch)
  )

  const bulkTotalBalance = filteredBulkCustomers
    .filter(c => bulkSelected.has(c.id))
    .reduce((sum, c) => sum + Number(c.account_balance || 0), 0)

  async function handleBulkSend() {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) {
      notify.error('WhatsApp only works in the desktop app')
      return
    }

    const selectedCustomers = filteredBulkCustomers.filter(c => bulkSelected.has(c.id) && c.phone)
    if (selectedCustomers.length === 0) {
      notify.error('No customers with phone numbers selected')
      return
    }

    setBulkSending(true)
    setBulkProgress({ sent: 0, failed: 0, total: selectedCustomers.length })

    // Load business name for template
    let businessName = 'Our Business'
    let storeLogo = null
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('store_name, store_logo')
        .eq('id', userId)
        .single()
      if (profile?.store_name) businessName = profile.store_name
      if (profile?.store_logo && settings.include_logo_on_images) storeLogo = profile.store_logo
    } catch (_) {}

    for (let i = 0; i < selectedCustomers.length; i++) {
      const customer = selectedCustomers[i]
      let message = bulkMessage

      try {
        // Format phone
        let phone = (customer.phone || '').trim().replace(/[\s\-\.\(\)]/g, '')
        if (phone.startsWith('+')) phone = phone.slice(1)
        if (phone.startsWith('00')) phone = phone.slice(2)
        if (phone.startsWith('0') && phone.length === 11) phone = '92' + phone.slice(1)

        if (!phone || phone.length < 10) {
          throw new Error('Invalid phone number')
        }

        // Build message from template
        message = bulkMessage
          .replace(/\{customer_name\}/g, customer.full_name || 'Customer')
          .replace(/\{phone\}/g, customer.phone || '')
          .replace(/\{balance\}/g, Number(customer.account_balance || 0).toLocaleString('en-PK'))
          .replace(/\{business_name\}/g, businessName)

        let result
        if (bulkSendReceiptImage && window.electronAPI?.whatsapp?.sendBalanceImage) {
          result = await window.electronAPI.whatsapp.sendBalanceImage({
            phone,
            message,
            balanceData: {
              businessName,
              logoUrl: storeLogo,
              customerName: customer.full_name || 'Customer',
              customerPhone: customer.phone || '',
              balance: Number(customer.account_balance || 0),
              date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
            }
          })
        } else {
          result = await window.electronAPI.whatsapp.sendOrderMessage({ phone, message })
        }

        if (result?.success === false) throw new Error(result?.error || 'Send failed')

        // Log success
        await supabase.from('customer_account_send_logs').insert({
          user_id: userId,
          phone,
          customer_name: customer.full_name,
          message_type: bulkSendReceiptImage ? 'balance_image' : 'text',
          message_preview: message.substring(0, 200),
          status: 'sent',
          trigger: 'bulk',
        })

        setBulkProgress(prev => ({ ...prev, sent: prev.sent + 1 }))
      } catch (e) {
        console.error(`Failed to send to ${customer.full_name}:`, e)

        // Log failure
        await supabase.from('customer_account_send_logs').insert({
          user_id: userId,
          phone: customer.phone,
          customer_name: customer.full_name,
          message_type: 'text',
          message_preview: message.substring(0, 200),
          status: 'failed',
          trigger: 'bulk',
          error_message: e.message,
        })

        setBulkProgress(prev => ({ ...prev, failed: prev.failed + 1 }))
      }

      // Delay between messages (3-6 seconds) to avoid WhatsApp rate limiting
      if (i < selectedCustomers.length - 1) {
        const delay = 3000 + Math.random() * 3000
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    setBulkSending(false)
    const { sent, failed } = bulkProgress
    notify.success(`Bulk send complete! ${bulkProgress.sent + 1} sent, ${bulkProgress.failed} failed`)
    // Refresh customer list to reflect any changes
    loadBulkCustomers()
  }

  async function searchCustomers(term) {
    if (!term || term.length < 2 || !userId) {
      setCustomerResults([])
      setShowCustomerDropdown(false)
      return
    }
    setSearchingCustomers(true)
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, account_balance')
        .eq('user_id', userId)
        .or(`full_name.ilike.%${term}%,phone.ilike.%${term}%`)
        .order('full_name', { ascending: true })
        .limit(10)

      if (!error && data) {
        setCustomerResults(data)
        setShowCustomerDropdown(data.length > 0)
      }
    } catch (e) {
      console.error('Error searching customers:', e)
    } finally {
      setSearchingCustomers(false)
    }
  }

  function handleCustomerSearchChange(value) {
    setCustomerSearch(value)
    if (selectedCustomer) {
      setSelectedCustomer(null)
      setManualPhone('')
    }
    // Debounce search
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => searchCustomers(value), 300)
  }

  function handleSelectCustomer(customer) {
    setSelectedCustomer(customer)
    setCustomerSearch(customer.full_name)
    setManualPhone(customer.phone || '')
    setShowCustomerDropdown(false)
    setCustomerResults([])
  }

  function handleClearCustomer() {
    setSelectedCustomer(null)
    setCustomerSearch('')
    setManualPhone('')
    setShowCustomerDropdown(false)
    setCustomerResults([])
  }

  async function saveSettings() {
    if (!userId) return
    setIsSaving(true)
    try {
      const payload = {
        user_id: userId,
        service_enabled: settings.service_enabled,
        auto_send_on_account_payment: settings.auto_send_on_account_payment,
        send_receipt_image: settings.send_receipt_image,
        include_logo_on_images: settings.include_logo_on_images,
        account_template: settings.account_template,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('customer_account_settings')
        .upsert(payload, { onConflict: 'user_id' })

      if (error) throw error

      // Ensure default template exists
      if (templates.length === 0) {
        const { error: tplError } = await supabase
          .from('customer_account_templates')
          .insert({
            user_id: userId,
            name: 'Default Account Receipt',
            body: settings.account_template,
            is_default: true,
          })

        if (!tplError) {
          loadTemplates()
        }
      }

      notify.success('Settings saved!')
    } catch (e) {
      notify.error('Failed to save settings')
    } finally {
      setIsSaving(false)
    }
  }

  async function handleManualSend() {
    if (!manualPhone.trim()) {
      notify.error('Phone number is required')
      return
    }
    if (!manualMessage.trim() && !manualImage) {
      notify.error('Please enter a message or select an image')
      return
    }

    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) {
      notify.error('WhatsApp only works in the desktop app')
      return
    }

    setIsSending(true)
    let resolvedMessage = manualMessage
    try {
      // Format the phone number
      let phone = manualPhone.trim().replace(/[\s\-\.\(\)]/g, '')
      if (phone.startsWith('+')) phone = phone.slice(1)
      if (phone.startsWith('00')) phone = phone.slice(2)
      if (phone.startsWith('0') && phone.length === 11) phone = '92' + phone.slice(1)

      // Resolve template variables in message
      let businessName = ''
      let storeLogo = null
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('store_name, store_logo')
          .eq('id', userId)
          .single()
        if (profile?.store_name) businessName = profile.store_name
        if (profile?.store_logo && settings.include_logo_on_images) storeLogo = profile.store_logo
      } catch (_) {}

      resolvedMessage = manualMessage
        .replace(/\{customer_name\}/g, selectedCustomer?.full_name || 'Customer')
        .replace(/\{phone\}/g, selectedCustomer?.phone || manualPhone || '')
        .replace(/\{balance\}/g, Number(selectedCustomer?.account_balance || 0).toLocaleString('en-PK'))
        .replace(/\{business_name\}/g, businessName)

      let result
      if (manualImage) {
        result = await window.electronAPI.whatsapp.sendCampaignMessage({ phone, message: resolvedMessage || '', mediaPath: null })
      } else if (manualSendReceiptImage && window.electronAPI?.whatsapp?.sendBalanceImage) {
        // Send balance statement image with message as caption
        result = await window.electronAPI.whatsapp.sendBalanceImage({
          phone,
          message: resolvedMessage,
          balanceData: {
            businessName,
            logoUrl: storeLogo,
            customerName: selectedCustomer?.full_name || 'Customer',
            customerPhone: selectedCustomer?.phone || manualPhone || '',
            balance: Number(selectedCustomer?.account_balance || 0),
            date: new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }),
          }
        })
      } else {
        result = await window.electronAPI.whatsapp.sendOrderMessage({ phone, message: resolvedMessage })
      }

      if (result?.success !== false) {
        // Log the manual send
        await supabase.from('customer_account_send_logs').insert({
          user_id: userId,
          phone: phone,
          customer_name: selectedCustomer?.full_name || 'Manual Send',
          message_type: manualImage ? 'image' : manualSendReceiptImage ? 'balance_image' : 'text',
          message_preview: resolvedMessage?.substring(0, 200) || '(Image)',
          status: 'sent',
          trigger: 'manual',
        })

        notify.success('Message sent successfully!')
        handleClearCustomer()
        setManualImage(null)
      } else {
        throw new Error(result?.error || 'Failed to send')
      }
    } catch (e) {
      notify.error(`Failed to send: ${e.message}`)

      // Log the failure
      await supabase.from('customer_account_send_logs').insert({
        user_id: userId,
        phone: manualPhone,
        customer_name: selectedCustomer?.full_name || 'Manual Send',
        message_type: manualImage ? 'image' : manualSendReceiptImage ? 'balance_image' : 'text',
        message_preview: resolvedMessage?.substring(0, 200) || '(Image)',
        status: 'failed',
        trigger: 'manual',
        error_message: e.message,
      })
    } finally {
      setIsSending(false)
    }
  }

  function insertVariableInto(textarea, currentValue, setValue, variable) {
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newValue = currentValue.slice(0, start) + variable + currentValue.slice(end)
    setValue(newValue)
    setTimeout(() => {
      textarea.focus()
      textarea.setSelectionRange(start + variable.length, start + variable.length)
    }, 10)
  }

  function insertVariable(variable) {
    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const current = settings.account_template || ''
    const newValue = current.slice(0, start) + variable + current.slice(end)
    setSettings(prev => ({ ...prev, account_template: newValue }))
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

  function getPreview() {
    return (settings.account_template || '')
      .replace(/\{customer_name\}/g, 'Ahmed Khan')
      .replace(/\{phone\}/g, '03001234567')
      .replace(/\{order_number\}/g, 'ORD-0042')
      .replace(/\{order_total\}/g, '1,250')
      .replace(/\{order_items\}/g, '1x Chicken Biryani - Rs.450\n2x Cold Drink - Rs.200\n1x Raita - Rs.100')
      .replace(/\{previous_balance\}/g, '3,500')
      .replace(/\{new_balance\}/g, '4,750')
      .replace(/\{order_date\}/g, '09 Apr 2026')
      .replace(/\{business_name\}/g, 'BizPOS Restaurant')
  }

  async function handleResend(log) {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) {
      notify.error('WhatsApp only works in the desktop app')
      return
    }
    if (!log.phone) {
      notify.error('No phone number stored in this log')
      return
    }

    setResendingLog(log.id)
    let resolvedResendMessage = log.message_preview || ''
    try {
      // Fetch business name for variable resolution
      let businessName = ''
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('store_name')
          .eq('id', userId)
          .single()
        if (profile?.store_name) businessName = profile.store_name
      } catch (_) {}

      // Fetch customer by last 10 digits of stored phone (handles any formatting differences)
      let customerName = log.customer_name || 'Customer'
      let customerBalance = 0
      try {
        const last10 = log.phone.replace(/\D/g, '').slice(-10)
        const { data: customers } = await supabase
          .from('customers')
          .select('full_name, account_balance')
          .eq('user_id', userId)
          .ilike('phone', `%${last10}`)
          .limit(1)
        if (customers?.[0]) {
          customerName = customers[0].full_name || customerName
          customerBalance = Number(customers[0].account_balance || 0)
        }
      } catch (_) {}

      // Resolve any template variables still present in the stored preview
      resolvedResendMessage = (log.message_preview || '')
        .replace(/\{customer_name\}/g, customerName)
        .replace(/\{phone\}/g, log.phone || '')
        .replace(/\{balance\}/g, customerBalance.toLocaleString('en-PK'))
        .replace(/\{business_name\}/g, businessName)

      const result = await window.electronAPI.whatsapp.sendOrderMessage({
        phone: log.phone,
        message: resolvedResendMessage,
      })

      if (result?.success === false) throw new Error(result?.error || 'Send failed')

      await supabase.from('customer_account_send_logs').insert({
        user_id: userId,
        phone: log.phone,
        customer_name: customerName,
        message_type: 'text',
        message_preview: resolvedResendMessage.substring(0, 200),
        status: 'sent',
        trigger: 'manual',
        order_number: log.order_number,
      })

      notify.success('Message resent successfully!')
      loadLogs()
    } catch (e) {
      notify.error(`Resend failed: ${e.message}`)
      await supabase.from('customer_account_send_logs').insert({
        user_id: userId,
        phone: log.phone,
        customer_name: log.customer_name,
        message_type: 'text',
        message_preview: resolvedResendMessage.substring(0, 200),
        status: 'failed',
        trigger: 'manual',
        order_number: log.order_number,
        error_message: e.message,
      })
    } finally {
      setResendingLog(null)
    }
  }

  function formatDate(dateStr) {
    if (!dateStr) return ''
    const d = new Date(dateStr)
    return d.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const allTabs = [
    { key: 'templates', label: 'Templates', icon: FileText },
    { key: 'send', label: 'Manual Send', icon: Send },
    { key: 'bulk', label: 'Bulk Send', icon: Users },
    { key: 'logs', label: 'Send Logs', icon: Clock },
  ]
  const tabs = allTabs.filter(t => !t.adminOnly || isAdmin)

  return (
    <div className="rounded-2xl overflow-hidden">
      {/* ── Header + Save row ── */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
            <CreditCard size={18} className="text-white" />
          </div>
          <div>
            <h3 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Customer Account Notifications</h3>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Auto-send receipts when orders are placed on account</p>
          </div>
        </div>
        {isAdmin && (
          <button
            onClick={saveSettings}
            disabled={isSaving || !settingsLoaded}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-semibold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-60"
          >
            {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Save Settings
          </button>
        )}
      </div>

      {/* ── Cashier: Service disabled banner ── */}
      {isCashier && !settings.service_enabled && (
        <div className={`flex items-start gap-3 p-4 rounded-2xl border mb-6 ${
          isDark ? 'bg-red-500/10 border-red-500/30' : 'bg-red-50 border-red-200'
        }`}>
          <ShieldAlert size={18} className="text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-red-400' : 'text-red-700'}`}>
              Customer Account Notifications are disabled
            </p>
            <p className={`text-xs mt-1 ${isDark ? 'text-red-400/70' : 'text-red-600'}`}>
              Your admin has turned off this service. "Send Bill" buttons and auto-send are inactive. Contact your admin to re-enable.
            </p>
          </div>
        </div>
      )}

      {/* ── Admin: Master service toggle ── */}
      {isAdmin && (
        <div className={`rounded-2xl border p-4 mb-4 flex items-center justify-between ${
          settings.service_enabled
            ? isDark ? 'border-indigo-500/30 bg-indigo-500/10' : 'border-indigo-200 bg-indigo-50'
            : isDark ? 'border-red-500/30 bg-red-500/10' : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-center gap-3">
            <Power size={18} className={settings.service_enabled ? 'text-indigo-400' : 'text-red-500'} />
            <div>
              <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Use Customer Account Notifications</p>
              <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                Master toggle — when OFF, all bill sending and auto-send are disabled for all cashiers
              </p>
            </div>
          </div>
          <Toggle
            checked={settings.service_enabled}
            onChange={() => setSettings(prev => ({ ...prev, service_enabled: !prev.service_enabled }))}
          />
        </div>
      )}

      {/* ── Global toggles ── */}
      <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} p-4 mb-6 space-y-3 ${
        !settings.service_enabled && isAdmin ? 'opacity-50 pointer-events-none' : ''
      }`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Auto-send on Account Payment</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Automatically send WhatsApp message when a customer pays via account</p>
          </div>
          {isAdmin ? (
            <Toggle
              checked={settings.auto_send_on_account_payment}
              onChange={() => setSettings(prev => ({ ...prev, auto_send_on_account_payment: !prev.auto_send_on_account_payment }))}
              disabled={!settings.service_enabled}
            />
          ) : (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              settings.auto_send_on_account_payment
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
              {settings.auto_send_on_account_payment ? 'ON' : 'OFF'}
            </span>
          )}
        </div>
        <div className={`border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`} />
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Include Receipt Image</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Attach a thermal-style receipt image with the message</p>
          </div>
          {isAdmin ? (
            <Toggle
              checked={settings.send_receipt_image}
              onChange={() => setSettings(prev => ({ ...prev, send_receipt_image: !prev.send_receipt_image }))}
              disabled={!settings.service_enabled}
            />
          ) : (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              settings.send_receipt_image
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
              {settings.send_receipt_image ? 'ON' : 'OFF'}
            </span>
          )}
        </div>
        <div className={`border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`} />
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Include Logo on Images</p>
            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Show your store logo on receipt and balance images</p>
          </div>
          {isAdmin ? (
            <Toggle
              checked={settings.include_logo_on_images}
              onChange={() => setSettings(prev => ({ ...prev, include_logo_on_images: !prev.include_logo_on_images }))}
              disabled={!settings.service_enabled}
            />
          ) : (
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
              settings.include_logo_on_images
                ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                : 'bg-gray-500/20 text-gray-400 border border-gray-500/30'
            }`}>
              {settings.include_logo_on_images ? 'ON' : 'OFF'}
            </span>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className={`flex items-center gap-1 p-1 ${isDark ? 'bg-gray-800/60 border-gray-700/50' : 'bg-gray-100 border-gray-200'} rounded-2xl border mb-6`}>
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              activeTab === tab.key
                ? 'bg-gradient-to-r from-purple-500 to-indigo-600 text-white shadow-lg shadow-purple-500/20'
                : isDark
                  ? 'text-gray-400 hover:text-white hover:bg-gray-700/50'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200/50'
            }`}
          >
            <tab.icon size={15} />
            {tab.label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
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
            {/* Default Template Editor */}
            <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
              <div className={`px-5 py-4 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <FileText size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Default Account Template</h4>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">ACTIVE</span>
                </div>
                <button
                  onClick={() => setPreviewVisible(!previewVisible)}
                  className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all ${
                    isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {previewVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                  {previewVisible ? 'Hide' : 'Preview'}
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Variable Chips — hidden for cashier (read-only) */}
                {isAdmin && (
                  <div>
                    <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      Click to insert variable, or click copy icon:
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {TEMPLATE_VARS.map(v => (
                        <div
                          key={v.label}
                          className={`group flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                            isDark
                              ? 'bg-gray-700/60 text-purple-300 hover:bg-purple-900/30 border border-gray-600/50'
                              : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                          }`}
                          onClick={() => insertVariable(v.label)}
                          title={v.desc}
                        >
                          {v.label}
                          <button
                            onClick={(e) => { e.stopPropagation(); copyVar(v.label) }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            {copiedVar === v.label ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template Textarea — read-only for cashier */}
                <textarea
                  ref={textareaRef}
                  value={settings.account_template}
                  onChange={(e) => isAdmin && setSettings(prev => ({ ...prev, account_template: e.target.value }))}
                  readOnly={isCashier}
                  rows={10}
                  className={`w-full rounded-xl px-4 py-3 text-sm font-mono resize-y transition-all border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                    isDark
                      ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                      : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                  } ${isCashier ? 'cursor-default opacity-75' : ''}`}
                  placeholder="Type your account notification template here..."
                />

                {/* Preview */}
                <AnimatePresence>
                  {previewVisible && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-900/60 border border-gray-700/50' : 'bg-gray-50 border border-gray-200'}`}>
                        <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Preview:</p>
                        <div className={`whitespace-pre-wrap text-sm ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          {getPreview()}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: MANUAL SEND
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'send' && (
          <motion.div
            key="send"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
              <div className={`px-5 py-4 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <Send size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Send Message</h4>
                </div>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Send a message or image to any WhatsApp number</p>
              </div>

              <div className="p-5 space-y-4">
                {/* Customer Search */}
                <div className="relative" ref={customerSearchRef}>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Customer *</label>

                  {selectedCustomer ? (
                    // Selected customer chip
                    <div className={`flex items-center justify-between rounded-xl px-4 py-2.5 border ${
                      isDark ? 'bg-purple-900/20 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                          <CreditCard size={14} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                        </div>
                        <div>
                          <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>{selectedCustomer.full_name}</p>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {selectedCustomer.phone}
                            {selectedCustomer.account_balance > 0 && (
                              <span className="text-red-400 ml-2">Balance: Rs {Number(selectedCustomer.account_balance).toLocaleString()}</span>
                            )}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={handleClearCustomer}
                        className={`p-1.5 rounded-lg transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : (
                    // Search input
                    <div className="relative">
                      <Search size={14} className={`absolute left-3.5 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                      <input
                        type="text"
                        value={customerSearch}
                        onChange={(e) => handleCustomerSearchChange(e.target.value)}
                        onFocus={() => { if (customerResults.length > 0) setShowCustomerDropdown(true) }}
                        placeholder="Search customer by name or phone..."
                        className={`w-full rounded-xl pl-10 pr-4 py-2.5 text-sm border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                          isDark
                            ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                            : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                        }`}
                      />
                      {searchingCustomers && (
                        <Loader2 size={14} className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-purple-400" />
                      )}
                    </div>
                  )}

                  {/* Dropdown results */}
                  <AnimatePresence>
                    {showCustomerDropdown && !selectedCustomer && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className={`absolute z-50 w-full mt-1 rounded-xl border shadow-xl overflow-hidden ${
                          isDark ? 'bg-gray-800 border-gray-700/50' : 'bg-white border-gray-200'
                        }`}
                      >
                        <div className="max-h-60 overflow-y-auto">
                          {customerResults.map((c) => (
                            <button
                              key={c.id}
                              onClick={() => handleSelectCustomer(c)}
                              className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition-all ${
                                isDark ? 'hover:bg-gray-700/60' : 'hover:bg-gray-50'
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <CreditCard size={14} className={isDark ? 'text-gray-400' : 'text-gray-500'} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.full_name}</p>
                                <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {c.phone || 'No phone'}
                                  {c.account_balance > 0 && (
                                    <span className="text-red-400 ml-2">Bal: Rs {Number(c.account_balance).toLocaleString()}</span>
                                  )}
                                </p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Attach Receipt Image Toggle */}
                <div className={`flex items-center justify-between rounded-xl p-3 border ${isDark ? 'border-gray-700/50 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Attach Receipt Image</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Send a professional receipt image along with the message</p>
                  </div>
                  <Toggle
                    checked={manualSendReceiptImage}
                    onChange={() => { setManualSendReceiptImage(!manualSendReceiptImage); if (!manualSendReceiptImage) setManualImage(null) }}
                  />
                </div>

                {/* Variable Chips */}
                <div>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Click to insert variable:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {MANUAL_SEND_VARS.map(v => (
                      <button
                        key={v.label}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                          isDark
                            ? 'bg-gray-700/60 text-purple-300 hover:bg-purple-900/30 border border-gray-600/50'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                        }`}
                        onClick={() => insertVariableInto(manualTextareaRef.current, manualMessage, setManualMessage, v.label)}
                        title={v.desc}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Message */}
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>Message</label>
                  <textarea
                    ref={manualTextareaRef}
                    value={manualMessage}
                    onChange={(e) => setManualMessage(e.target.value)}
                    rows={5}
                    placeholder="Type your message here or select a template above..."
                    className={`w-full rounded-xl px-4 py-3 text-sm font-mono resize-y border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                      isDark
                        ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                        : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                    }`}
                  />
                </div>

                {/* Info */}
                <div className={`flex items-start gap-2 rounded-xl p-3 ${isDark ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-200'}`}>
                  <Info size={16} className="text-blue-400 mt-0.5 flex-shrink-0" />
                  <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'}`}>
                    WhatsApp must be connected in the WhatsApp settings tab. Messages are sent via your linked WhatsApp session.
                  </p>
                </div>

                {/* Send Button */}
                <button
                  onClick={handleManualSend}
                  disabled={isSending || (!manualMessage.trim() && !manualImage) || !manualPhone.trim()}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  {isSending ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: BULK SEND
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'bulk' && (
          <motion.div
            key="bulk"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            {/* Bulk Message Template */}
            <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
              <div className={`px-5 py-4 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Bulk Reminder Message</h4>
                </div>
                <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  This message will be sent to all selected customers with variables auto-filled per customer.
                </p>
              </div>
              <div className="p-5 space-y-4">
                {/* Attach Receipt Image Toggle */}
                <div className={`flex items-center justify-between rounded-xl p-3 border ${isDark ? 'border-gray-700/50 bg-gray-900/40' : 'border-gray-200 bg-gray-50'}`}>
                  <div>
                    <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Attach Receipt Image</p>
                    <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Send a professional balance receipt image to every selected customer</p>
                  </div>
                  <Toggle
                    checked={bulkSendReceiptImage}
                    onChange={() => setBulkSendReceiptImage(!bulkSendReceiptImage)}
                  />
                </div>

                {/* Variable Chips */}
                <div>
                  <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Click to insert variable:
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {BULK_SEND_VARS.map(v => (
                      <button
                        key={v.label}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-mono cursor-pointer transition-all ${
                          isDark
                            ? 'bg-gray-700/60 text-purple-300 hover:bg-purple-900/30 border border-gray-600/50'
                            : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border border-purple-200'
                        }`}
                        onClick={() => insertVariableInto(bulkTextareaRef.current, bulkMessage, setBulkMessage, v.label)}
                        title={v.desc}
                      >
                        {v.label}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  ref={bulkTextareaRef}
                  value={bulkMessage}
                  onChange={(e) => setBulkMessage(e.target.value)}
                  rows={6}
                  placeholder="Type your bulk message here..."
                  className={`w-full rounded-xl px-4 py-3 text-sm font-mono resize-y border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                    isDark
                      ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                      : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                  }`}
                />

              </div>
            </div>

            {/* Customer List with Balances */}
            <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
              <div className={`px-5 py-4 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Users size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Customers with Outstanding Balance</h4>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${isDark ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-red-100 text-red-700 border border-red-200'}`}>
                    {bulkCustomers.length} customers
                  </span>
                </div>
                <button
                  onClick={loadBulkCustomers}
                  disabled={bulkLoading}
                  className={`p-2 rounded-lg transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                  <RefreshCw size={14} className={bulkLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Search + Select All */}
              <div className={`px-5 py-3 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'} flex items-center gap-3`}>
                <div className="relative flex-1">
                  <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="text"
                    value={bulkSearch}
                    onChange={(e) => setBulkSearch(e.target.value)}
                    placeholder="Filter by name or phone..."
                    className={`w-full rounded-xl pl-9 pr-4 py-2 text-sm border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                      isDark
                        ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                        : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                    }`}
                  />
                </div>
                <button
                  onClick={toggleBulkSelectAll}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all border ${
                    bulkSelected.size === filteredBulkCustomers.length && filteredBulkCustomers.length > 0
                      ? isDark ? 'bg-purple-500/20 text-purple-400 border-purple-500/30' : 'bg-purple-100 text-purple-700 border-purple-200'
                      : isDark ? 'bg-gray-700/50 text-gray-400 border-gray-600/50 hover:bg-gray-700' : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200'
                  }`}
                >
                  {bulkSelected.size === filteredBulkCustomers.length && filteredBulkCustomers.length > 0
                    ? <><CheckSquare size={14} /> Deselect All</>
                    : <><Square size={14} /> Select All</>
                  }
                </button>
              </div>

              {/* Summary bar */}
              <div className={`px-5 py-2.5 border-b ${isDark ? 'border-gray-700/50 bg-gray-900/30' : 'border-gray-200 bg-gray-50'} flex items-center justify-between`}>
                <div className="flex items-center gap-4">
                  <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    <span className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{bulkSelected.size}</span> of {filteredBulkCustomers.length} selected
                  </span>
                  <span className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-300'}`}>|</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Total: <span className="font-bold text-red-400">Rs {bulkTotalBalance.toLocaleString('en-PK')}</span>
                  </span>
                </div>
              </div>

              {/* Customer rows */}
              <div className="max-h-[400px] overflow-y-auto">
                {bulkLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-purple-400" />
                  </div>
                ) : filteredBulkCustomers.length === 0 ? (
                  <div className={`text-center py-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <Users size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No customers with outstanding balance</p>
                  </div>
                ) : (
                  filteredBulkCustomers.map((customer) => {
                    const isSelected = bulkSelected.has(customer.id)
                    const hasPhone = !!customer.phone

                    return (
                      <div
                        key={customer.id}
                        onClick={() => hasPhone && toggleBulkSelect(customer.id)}
                        className={`px-5 py-3 flex items-center gap-3 transition-all border-b last:border-b-0 ${
                          isDark ? 'border-gray-700/30' : 'border-gray-100'
                        } ${hasPhone ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'} ${
                          isSelected
                            ? isDark ? 'bg-purple-900/15' : 'bg-purple-50/50'
                            : isDark ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50'
                        }`}
                      >
                        {/* Checkbox */}
                        <div className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border transition-all ${
                          isSelected
                            ? 'bg-purple-500 border-purple-500'
                            : isDark ? 'border-gray-600 bg-gray-800' : 'border-gray-300 bg-white'
                        }`}>
                          {isSelected && <Check size={12} className="text-white" />}
                        </div>

                        {/* Customer info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                              {customer.full_name || 'Unknown'}
                            </p>
                            {!hasPhone && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${isDark ? 'bg-yellow-500/20 text-yellow-400' : 'bg-yellow-100 text-yellow-700'}`}>
                                NO PHONE
                              </span>
                            )}
                          </div>
                          <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                            {customer.phone || 'No phone number'}
                          </p>
                        </div>

                        {/* Balance */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-sm font-bold text-red-400">
                            Rs {Number(customer.account_balance || 0).toLocaleString('en-PK')}
                          </p>
                          <p className={`text-[10px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>outstanding</p>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>

              {/* Send Button + Progress */}
              <div className={`px-5 py-4 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                {bulkSending ? (
                  <div className="space-y-3">
                    {/* Progress bar */}
                    <div className={`rounded-full h-2.5 overflow-hidden ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-indigo-600 rounded-full transition-all duration-500"
                        style={{ width: `${bulkProgress.total > 0 ? ((bulkProgress.sent + bulkProgress.failed) / bulkProgress.total) * 100 : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Loader2 size={14} className="animate-spin text-purple-400" />
                        <span className={`text-xs font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                          Sending... {bulkProgress.sent + bulkProgress.failed} / {bulkProgress.total}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-green-400">{bulkProgress.sent} sent</span>
                        {bulkProgress.failed > 0 && <span className="text-red-400">{bulkProgress.failed} failed</span>}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleBulkSend}
                      disabled={bulkSelected.size === 0 || !bulkMessage.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-sm font-bold hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <Send size={16} />
                      Send to {bulkSelected.size} Customer{bulkSelected.size !== 1 ? 's' : ''}
                    </button>
                  </div>
                )}

                {/* Rate limit info */}
                <div className={`flex items-start gap-2 rounded-xl p-3 mt-3 ${isDark ? 'bg-yellow-500/10 border border-yellow-500/20' : 'bg-yellow-50 border border-yellow-200'}`}>
                  <AlertCircle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                  <p className={`text-xs ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                    Messages are sent with a 3-6 second delay between each to avoid WhatsApp rate limiting. Sending to {bulkSelected.size} customers will take approximately {Math.ceil(bulkSelected.size * 4.5 / 60)} minute{Math.ceil(bulkSelected.size * 4.5 / 60) !== 1 ? 's' : ''}.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ══════════════════════════════════════════════════════
            TAB: AUTO-SEND LOGS
        ══════════════════════════════════════════════════════ */}
        {activeTab === 'logs' && (
          <motion.div
            key="logs"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="space-y-4"
          >
            <div className={`rounded-2xl border ${isDark ? 'border-gray-700/50 bg-gray-800/60' : 'border-gray-200 bg-white'} overflow-hidden`}>
              <div className={`px-5 py-4 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'} flex items-center justify-between`}>
                <div className="flex items-center gap-2">
                  <Clock size={16} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                  <h4 className={`text-sm font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Send Logs</h4>
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Auto & manual messages
                  </span>
                </div>
                <button
                  onClick={() => loadLogs()}
                  disabled={logsLoading}
                  className={`p-2 rounded-lg transition-all ${isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700/50' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
                >
                  <RefreshCw size={14} className={logsLoading ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* Search */}
              <div className={`px-5 py-3 border-b ${isDark ? 'border-gray-700/50' : 'border-gray-200'}`}>
                <div className="relative">
                  <Search size={14} className={`absolute left-3 top-1/2 -translate-y-1/2 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                  <input
                    type="text"
                    value={logsSearch}
                    onChange={(e) => { setLogsSearch(e.target.value); setLogsPage(1) }}
                    onKeyDown={(e) => e.key === 'Enter' && loadLogs()}
                    placeholder="Search by name, phone or order #..."
                    className={`w-full rounded-xl pl-9 pr-4 py-2 text-sm border focus:ring-2 focus:ring-purple-500/40 focus:outline-none ${
                      isDark
                        ? 'bg-gray-900/60 text-gray-200 border-gray-600/50 placeholder-gray-500'
                        : 'bg-gray-50 text-gray-900 border-gray-200 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>

              {/* Logs List */}
              <div className="divide-y divide-gray-700/30">
                {logsLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 size={24} className="animate-spin text-purple-400" />
                  </div>
                ) : logs.length === 0 ? (
                  <div className={`text-center py-12 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                    <Clock size={32} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No logs found</p>
                    <p className="text-xs mt-1">Messages will appear here once sent</p>
                  </div>
                ) : (
                  logs.map((log) => (
                    <div
                      key={log.id}
                      className={`px-5 py-3 transition-all cursor-pointer ${
                        isDark ? 'hover:bg-gray-700/30' : 'hover:bg-gray-50'
                      }`}
                      onClick={() => setExpandedLog(expandedLog === log.id ? null : log.id)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            log.trigger === 'bill'
                              ? isDark ? 'bg-green-500/20' : 'bg-green-100'
                              : log.trigger === 'auto'
                              ? isDark ? 'bg-purple-500/20' : 'bg-purple-100'
                              : log.trigger === 'bulk'
                              ? isDark ? 'bg-orange-500/20' : 'bg-orange-100'
                              : isDark ? 'bg-blue-500/20' : 'bg-blue-100'
                          }`}>
                            {log.trigger === 'bill' ? (
                              <FileText size={14} className={isDark ? 'text-green-400' : 'text-green-600'} />
                            ) : log.trigger === 'auto' ? (
                              <CreditCard size={14} className={isDark ? 'text-purple-400' : 'text-purple-600'} />
                            ) : log.trigger === 'bulk' ? (
                              <Users size={14} className={isDark ? 'text-orange-400' : 'text-orange-600'} />
                            ) : (
                              <Send size={14} className={isDark ? 'text-blue-400' : 'text-blue-600'} />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <p className={`text-sm font-semibold truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                {log.customer_name || 'Unknown'}
                              </p>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                log.trigger === 'bill'
                                  ? isDark ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-700'
                                  : log.trigger === 'auto'
                                  ? isDark ? 'bg-purple-500/20 text-purple-400' : 'bg-purple-100 text-purple-700'
                                  : log.trigger === 'bulk'
                                  ? isDark ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
                                  : isDark ? 'bg-blue-500/20 text-blue-400' : 'bg-blue-100 text-blue-700'
                              }`}>
                                {log.trigger === 'bill' ? 'BILL' : log.trigger === 'auto' ? 'AUTO' : log.trigger === 'bulk' ? 'BULK' : 'MANUAL'}
                              </span>
                            </div>
                            <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                              {log.phone} {log.order_number ? `| ${log.order_number}` : ''}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 flex-shrink-0">
                          <LogStatusBadge status={log.status} />
                          {log.status === 'failed' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleResend(log) }}
                              disabled={resendingLog === log.id}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 ${
                                isDark
                                  ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border-blue-500/30'
                                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200 border-blue-200'
                              }`}
                            >
                              {resendingLog === log.id
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Send size={11} />
                              }
                              {resendingLog === log.id ? 'Sending...' : 'Resend'}
                            </button>
                          )}
                          <span className={`text-[11px] ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            {formatDate(log.created_at)}
                          </span>
                          {expandedLog === log.id ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
                        </div>
                      </div>

                      {/* Expanded details */}
                      <AnimatePresence>
                        {expandedLog === log.id && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="overflow-hidden"
                          >
                            <div className={`mt-3 rounded-xl p-3 text-xs space-y-1.5 ${isDark ? 'bg-gray-900/60 border border-gray-700/50' : 'bg-gray-50 border border-gray-200'}`}>
                              <div className="flex gap-2">
                                <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Type:</span>
                                <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>{log.message_type || 'text'}</span>
                              </div>
                              {log.message_preview && (
                                <div>
                                  <span className={isDark ? 'text-gray-500' : 'text-gray-400'}>Message:</span>
                                  <p className={`mt-1 whitespace-pre-wrap font-mono ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>
                                    {log.message_preview}
                                  </p>
                                </div>
                              )}
                              {log.error_message && (
                                <div className="flex gap-2">
                                  <span className="text-red-400">Error:</span>
                                  <span className="text-red-300">{log.error_message}</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  ))
                )}
              </div>

              {/* Pagination */}
              {logs.length > 0 && (
                <div className={`px-5 py-3 border-t ${isDark ? 'border-gray-700/50' : 'border-gray-200'} flex items-center justify-between`}>
                  <button
                    onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                    disabled={logsPage <= 1}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
                      isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Previous
                  </button>
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Page {logsPage}</span>
                  <button
                    onClick={() => setLogsPage(p => p + 1)}
                    disabled={logs.length < LOGS_PER_PAGE}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all disabled:opacity-40 ${
                      isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Default export for Next.js route
export default function CustomerAccountPage() {
  return <CustomerAccountPanel />
}
