'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Save, RefreshCw, Phone, Mail, MapPin, Store,
  UserCircle, ImageIcon, X, AlertCircle, Wifi, WifiOff,
  CreditCard, QrCode, Clock, Upload, Check, Truck,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { profileManager } from '../../../lib/profileManager'
import { supabase } from '../../../lib/supabase'
import { notify } from '../../../components/ui/NotificationSystem'

function ModernToggle({ checked, onChange, label, description, disabled = false }) {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  return (
    <div className={`p-4 rounded-xl transition-all duration-200 ${isDark ? 'bg-gray-800/50 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1 mr-4">
          <p className={`font-semibold text-sm ${classes.textPrimary}`}>{label}</p>
          {description && <p className={`text-xs mt-0.5 ${classes.textSecondary}`}>{description}</p>}
        </div>
        <button
          type="button"
          onClick={onChange}
          disabled={disabled}
          className={`relative inline-flex h-7 w-12 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
            checked ? 'bg-gradient-to-r from-purple-500 to-purple-600' : isDark ? 'bg-gray-700' : 'bg-gray-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <span className={`pointer-events-none inline-block h-6 w-6 transform rounded-full bg-white shadow-lg ring-0 transition-all duration-200 ease-in-out ${checked ? 'translate-x-5' : 'translate-x-0'}`}>
            <span className={`absolute inset-0 flex h-full w-full items-center justify-center transition-opacity ${checked ? 'opacity-0' : 'opacity-100'}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
            </span>
            <span className={`absolute inset-0 flex h-full w-full items-center justify-center transition-opacity ${checked ? 'opacity-100' : 'opacity-0'}`}>
              <span className="h-1.5 w-1.5 rounded-full bg-purple-600" />
            </span>
          </span>
        </button>
      </div>
    </div>
  )
}

export function PersonalPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const fileInputRef = useRef(null)
  const qrFileInputRef = useRef(null)

  const [isSaving, setIsSaving] = useState(false)
  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true)
  const [saveMessage, setSaveMessage] = useState('')
  const [validationErrors, setValidationErrors] = useState({})
  const [tempLogo, setTempLogo] = useState(null)
  const [tempQrCode, setTempQrCode] = useState(null)
  const [logoPreview, setLogoPreview] = useState(() => profileManager.getLocalProfile()?.store_logo || '')
  const [qrPreview, setQrPreview] = useState(() => profileManager.getLocalProfile()?.qr_code || '')
  const [personalInfo, setPersonalInfo] = useState(() => {
    const cached = profileManager.getLocalProfile()
    return cached || {
      customer_name: '', email: '', store_name: '', phone: '',
      store_address: '', store_logo: '', qr_code: '',
      invoice_status: 'unpaid', hashtag1: '', hashtag2: '',
      show_footer_section: true, show_logo_on_receipt: true,
      show_business_name_on_receipt: true, show_powered_by_airoxlab: true, show_dispatch_button: true,
      business_start_time: '10:00', business_end_time: '03:00',
      receipt_review_message: '', receipt_footer_message: '',
    }
  })

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    fetchProfileSilent()
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  const fetchProfileSilent = async () => {
    try {
      const userEmail = profileManager.getCurrentUserEmail()
      if (!userEmail) return
      const { data, error } = await supabase
        .from('users')
        .select('customer_name, email, store_name, phone, phone_secondary, store_address, store_logo, qr_code, invoice_status, hashtag1, hashtag2, show_footer_section, show_logo_on_receipt, show_business_name_on_receipt, show_powered_by_airoxlab, show_dispatch_button, business_start_time, business_end_time, receipt_review_message, receipt_footer_message')
        .eq('email', userEmail)
        .single()
      if (error) {
        if (!navigator.onLine || error.message?.includes('Failed to fetch')) return
        return
      }
      if (data) {
        const profile = {
          customer_name: data.customer_name || '',
          email: data.email || '',
          store_name: data.store_name || '',
          phone: data.phone || '',
          phone_secondary: data.phone_secondary || '',
          store_address: data.store_address || '',
          store_logo: data.store_logo || '',
          qr_code: data.qr_code || '',
          invoice_status: data.invoice_status || 'unpaid',
          hashtag1: data.hashtag1 || '',
          hashtag2: data.hashtag2 || '',
          show_footer_section: data.show_footer_section !== false,
          show_logo_on_receipt: data.show_logo_on_receipt !== false,
          show_business_name_on_receipt: data.show_business_name_on_receipt !== false,
          show_powered_by_airoxlab: data.show_powered_by_airoxlab !== false,
          show_dispatch_button: data.show_dispatch_button !== false,
          business_start_time: data.business_start_time || '10:00',
          business_end_time: data.business_end_time || '03:00',
          receipt_review_message: data.receipt_review_message || '',
          receipt_footer_message: data.receipt_footer_message || '',
        }
        setPersonalInfo(profile)
        setLogoPreview(profile.store_logo || '')
        setQrPreview(profile.qr_code || '')
        profileManager.saveLocalProfile(profile)
        if (profile.store_logo) profileManager.saveLogoLocally(profile.store_logo).catch(() => {})
        if (profile.qr_code) profileManager.saveQrLocally(profile.qr_code).catch(() => {})
      }
    } catch { /* silent */ }
  }

  const handleRefresh = async () => {
    const id = notify.loading('Refreshing profile...')
    await fetchProfileSilent()
    notify.remove(id)
    notify.success('Profile refreshed')
  }

  const handlePersonalInfoChange = (field, value) => {
    setPersonalInfo(prev => ({ ...prev, [field]: value }))
    if (validationErrors[field]) setValidationErrors(prev => ({ ...prev, [field]: null }))
  }

  const handleLogoUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      const validation = await profileManager.validateImageFile(file)
      if (!validation.isValid) { notify.error(validation.errors[0]); return }
      setTempLogo(file)
      const reader = new FileReader()
      reader.onload = e => setLogoPreview(e.target.result)
      reader.readAsDataURL(file)
      notify.success('Logo selected. Click Save Changes to upload.')
    } catch { notify.error('Error processing image file') }
  }

  const handleQrUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) return
    try {
      const validation = await profileManager.validateImageFile(file)
      if (!validation.isValid) { notify.error(validation.errors[0]); return }
      setTempQrCode(file)
      const reader = new FileReader()
      reader.onload = e => setQrPreview(e.target.result)
      reader.readAsDataURL(file)
      notify.success('QR code selected. Click Save Changes to upload.')
    } catch { notify.error('Error processing image file') }
  }

  const validateForm = () => {
    const errors = {}
    if (personalInfo.store_address && !profileManager.validateAddress(personalInfo.store_address)) {
      errors.store_address = 'Address is too long (max 500 characters)'
    }
    setValidationErrors(errors)
    return Object.keys(errors).length === 0
  }

  const showSaveMessage = (message, type = 'success') => {
    setSaveMessage({ text: message, type })
    setTimeout(() => setSaveMessage(''), 3000)
  }

  const handleSavePersonalInfo = async () => {
    if (!validateForm()) { notify.error('Please fix the validation errors'); return }
    setIsSaving(true)
    try {
      if (!isOnline) {
        const updated = { ...personalInfo }
        if (tempLogo) {
          const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(tempLogo) })
          updated.store_logo = data
          await profileManager.saveLogoLocally(data)
        }
        if (tempQrCode) {
          const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(tempQrCode) })
          updated.qr_code = data
          await profileManager.saveQrLocally(data)
        }
        profileManager.saveLocalProfile(updated)
        setPersonalInfo(updated)
        setTempLogo(null); setTempQrCode(null)
        setLogoPreview(updated.store_logo || '')
        setQrPreview(updated.qr_code || '')
        if (!updated.store_logo) localStorage.removeItem('store_logo_local')
        if (!updated.qr_code) localStorage.removeItem('qr_code_local')
        notify.warning('Saved locally. Changes will sync when online.')
        showSaveMessage('Profile saved locally (offline mode)', 'warning')
        return
      }

      const id = notify.loading('Updating profile...')
      const result = await profileManager.updateProfile(personalInfo, tempLogo, tempQrCode)
      notify.remove(id)

      const d = result.data || personalInfo
      setPersonalInfo(d)
      setTempLogo(null); setTempQrCode(null)
      setLogoPreview(d.store_logo || '')
      setQrPreview(d.qr_code || '')
      if (!d.store_logo) localStorage.removeItem('store_logo_local')
      if (!d.qr_code) localStorage.removeItem('qr_code_local')

      if (result.success) {
        showSaveMessage('Profile updated successfully!')
        notify.success('Profile updated successfully')
      } else {
        profileManager.saveLocalProfile(d)
        notify.warning('Profile saved locally; server sync failed.')
        showSaveMessage('Profile saved locally (server error)', 'warning')
      }
    } catch (error) {
      const updated = { ...personalInfo }
      if (tempLogo) {
        const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(tempLogo) })
        updated.store_logo = data
        await profileManager.saveLogoLocally(data)
      }
      if (tempQrCode) {
        const data = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(tempQrCode) })
        updated.qr_code = data
        await profileManager.saveQrLocally(data)
      }
      profileManager.saveLocalProfile(updated)
      setPersonalInfo(updated)
      setTempLogo(null); setTempQrCode(null)
      setLogoPreview(updated.store_logo || '')
      setQrPreview(updated.qr_code || '')
      if (!updated.store_logo) localStorage.removeItem('store_logo_local')
      if (!updated.qr_code) localStorage.removeItem('qr_code_local')
      notify.error('Error saving profile. Changes saved locally.')
      showSaveMessage('Profile saved locally (error occurred)', 'warning')
    } finally {
      setIsSaving(false)
    }
  }

  const getInvoiceStatusColor = (s) => s === 'paid' ? 'text-green-600' : 'text-red-600'
  const getInvoiceStatusDisplay = (s) => s === 'paid' ? 'Paid' : 'Unpaid'

  return (
    <motion.div
      key="personal"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      {/* Profile Header */}
      <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6 mb-6`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <motion.div
              whileHover={{ rotate: 360, scale: 1.1 }}
              transition={{ duration: 0.5 }}
              className="w-14 h-14 bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg"
            >
              <User className="w-7 h-7 text-white" />
            </motion.div>
            <div>
              <h2 className={`text-2xl font-bold ${classes.textPrimary}`}>Profile Information</h2>
              <p className={`${classes.textSecondary} text-sm mt-1`}>Update your personal and store details</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <AnimatePresence>
              {saveMessage && (
                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-xl shadow-md ${
                    saveMessage.type === 'error' || saveMessage.text?.includes('Failed')
                      ? isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-700'
                      : saveMessage.type === 'warning'
                      ? isDark ? 'bg-orange-900/20 text-orange-400' : 'bg-orange-100 text-orange-700'
                      : isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-100 text-green-700'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span className="text-sm font-medium">{saveMessage.text || saveMessage}</span>
                </motion.div>
              )}
            </AnimatePresence>
            <button onClick={handleRefresh} className={`p-1.5 rounded-lg ${classes.button} transition-all`} title="Refresh profile">
              <RefreshCw className={`w-3.5 h-3.5 ${classes.textSecondary}`} />
            </button>
            {isOnline ? <Wifi className="w-3.5 h-3.5 text-green-500" /> : <WifiOff className="w-3.5 h-3.5 text-red-500" />}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left Column — Logo and QR */}
        <div className="xl:col-span-1 space-y-6">
          {/* Logo Upload */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <h3 className={`text-lg font-bold ${classes.textPrimary} mb-4 flex items-center space-x-2`}>
              <ImageIcon className="w-5 h-5" />
              <span>Store Logo</span>
            </h3>
            <div className={`${classes.border} border-2 border-dashed rounded-xl p-6 text-center space-y-4`}>
              {logoPreview ? (
                <div className="relative">
                  <img src={logoPreview} alt="Store Logo" className="w-full h-48 object-cover rounded-xl mx-auto shadow-lg" />
                  <button
                    onClick={() => {
                      setLogoPreview(''); setTempLogo(null)
                      setPersonalInfo(prev => ({ ...prev, store_logo: '' }))
                      localStorage.removeItem('store_logo_local')
                      if (fileInputRef.current) fileInputRef.current.value = ''
                      notify.success('Logo removed. Click Save Changes to apply.')
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className={`w-full h-48 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-xl flex items-center justify-center`}>
                  <ImageIcon className={`w-16 h-16 ${classes.textSecondary}`} />
                </div>
              )}
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`w-full px-4 py-2.5 ${classes.button} rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2`}
                >
                  <Upload className="w-4 h-4" />
                  <span>{logoPreview ? 'Change Logo' : 'Upload Logo'}</span>
                </motion.button>
                <p className={`text-xs ${classes.textSecondary} mt-2`}>Recommended: 250×300px, Max 5MB</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <ModernToggle
                checked={personalInfo.show_logo_on_receipt}
                onChange={() => setPersonalInfo(prev => ({ ...prev, show_logo_on_receipt: !prev.show_logo_on_receipt }))}
                label="Print Logo on Receipt"
                description="Display logo on printed receipts"
              />
              <ModernToggle
                checked={personalInfo.show_business_name_on_receipt}
                onChange={() => setPersonalInfo(prev => ({ ...prev, show_business_name_on_receipt: !prev.show_business_name_on_receipt }))}
                label="Print Business Name"
                description="Display store name on receipts"
              />
            </div>
          </div>

          {/* QR Code Upload */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <h3 className={`text-lg font-bold ${classes.textPrimary} mb-4 flex items-center space-x-2`}>
              <QrCode className="w-5 h-5" />
              <span>QR Code</span>
            </h3>
            <div className={`${classes.border} border-2 border-dashed rounded-xl p-6 text-center space-y-4`}>
              {qrPreview ? (
                <div className="relative">
                  <img src={qrPreview} alt="QR Code" className="w-full h-48 object-cover rounded-xl mx-auto shadow-lg" />
                  <button
                    onClick={() => {
                      setQrPreview(''); setTempQrCode(null)
                      setPersonalInfo(prev => ({ ...prev, qr_code: '' }))
                      localStorage.removeItem('qr_code_local')
                      if (qrFileInputRef.current) qrFileInputRef.current.value = ''
                      notify.success('QR code removed. Click Save Changes to apply.')
                    }}
                    className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors shadow-lg"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <div className={`w-full h-48 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-xl flex items-center justify-center`}>
                  <QrCode className={`w-16 h-16 ${classes.textSecondary}`} />
                </div>
              )}
              <div>
                <input ref={qrFileInputRef} type="file" accept="image/*" onChange={handleQrUpload} className="hidden" />
                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={() => qrFileInputRef.current?.click()}
                  className={`w-full px-4 py-2.5 ${classes.button} rounded-xl font-semibold transition-all duration-200 flex items-center justify-center space-x-2`}
                >
                  <Upload className="w-4 h-4" />
                  <span>{qrPreview ? 'Change QR Code' : 'Upload QR Code'}</span>
                </motion.button>
                <p className={`text-xs ${classes.textSecondary} mt-2`}>Recommended: Square format, Max 5MB</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column — Form Fields */}
        <div className="xl:col-span-2 space-y-6">
          {/* Basic Information */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <h3 className={`text-lg font-bold ${classes.textPrimary} mb-6`}>Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              {/* Customer Name — read-only */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Customer Name</label>
                <div className="relative">
                  <UserCircle className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <input type="text" value={personalInfo.customer_name || ''} readOnly placeholder="Customer name"
                    className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textSecondary} cursor-not-allowed ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} focus:outline-none`} />
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Read-only field</p>
              </div>
              {/* Email — read-only */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Email Address</label>
                <div className="relative">
                  <Mail className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <input type="email" value={personalInfo.email || ''} readOnly placeholder="Email address"
                    className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textSecondary} cursor-not-allowed ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} focus:outline-none`} />
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Read-only field</p>
              </div>
              {/* Store Name — read-only */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Store Name</label>
                <div className="relative">
                  <Store className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <input type="text" value={personalInfo.store_name || ''} readOnly placeholder="Store name"
                    className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textSecondary} cursor-not-allowed ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} focus:outline-none`} />
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Read-only field</p>
              </div>
              {/* Phone */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Phone Number</label>
                <div className="relative">
                  <Phone className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <input type="tel" value={personalInfo.phone || ''} onChange={e => handlePersonalInfoChange('phone', e.target.value)} placeholder="Enter phone number"
                    className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textPrimary} focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all focus:outline-none`} />
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Any format accepted</p>
              </div>
              {/* Secondary Phone */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Secondary Phone</label>
                <div className="relative">
                  <Phone className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <input type="tel" value={personalInfo.phone_secondary || ''} onChange={e => handlePersonalInfoChange('phone_secondary', e.target.value)} placeholder="Enter secondary phone (optional)"
                    className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textPrimary} focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all focus:outline-none`} />
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Shown on receipt next to primary phone</p>
              </div>
              {/* Invoice Status — read-only */}
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Invoice Status</label>
                <div className="relative">
                  <CreditCard className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                  <div className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl cursor-not-allowed ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} flex items-center`}>
                    <span className={`font-semibold ${getInvoiceStatusColor(personalInfo.invoice_status)}`}>
                      {getInvoiceStatusDisplay(personalInfo.invoice_status)}
                    </span>
                  </div>
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Managed by admin</p>
              </div>
            </div>
            {/* Store Address */}
            <div className="mt-4">
              <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Store Address</label>
              <div className="relative">
                <MapPin className={`absolute left-4 top-3.5 w-5 h-5 ${classes.textSecondary}`} />
                <textarea
                  value={personalInfo.store_address || ''}
                  onChange={e => handlePersonalInfoChange('store_address', e.target.value)}
                  placeholder="Enter your complete store address"
                  rows={3}
                  className={`w-full pl-12 pr-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl ${classes.textPrimary} focus:border-purple-500 focus:ring-2 focus:ring-purple-200 transition-all resize-none focus:outline-none ${validationErrors.store_address ? 'border-red-500' : ''}`}
                />
              </div>
              {validationErrors.store_address && (
                <div className="flex items-center mt-1.5 text-red-500">
                  <AlertCircle className="w-4 h-4 mr-1" />
                  <p className="text-xs">{validationErrors.store_address}</p>
                </div>
              )}
            </div>
          </div>

          {/* Receipt Settings */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-teal-500 rounded-xl flex items-center justify-center shadow-lg">
                <QrCode className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${classes.textPrimary}`}>Receipt Settings</h3>
                <p className={`text-sm ${classes.textSecondary}`}>Customize your thermal receipt footer</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Hashtag 1</label>
                <input type="text" value={personalInfo.hashtag1 || ''}
                  onChange={e => setPersonalInfo({ ...personalInfo, hashtag1: e.target.value })}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`}
                  placeholder="#YourBrand" maxLength="30" />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>e.g., #CheesySpace</p>
              </div>
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Hashtag 2</label>
                <input type="text" value={personalInfo.hashtag2 || ''}
                  onChange={e => setPersonalInfo({ ...personalInfo, hashtag2: e.target.value })}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`}
                  placeholder="#YourCity" maxLength="30" />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>e.g., #Lahore</p>
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Review Message <span className={`font-normal text-xs ${classes.textSecondary}`}>(shown in footer)</span></label>
                <input type="text" value={personalInfo.receipt_review_message || ''}
                  onChange={e => setPersonalInfo({ ...personalInfo, receipt_review_message: e.target.value })}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`}
                  placeholder="e.g. Your feedback = our glow up" maxLength="100" />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Leave blank to hide the review line</p>
              </div>
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Footer Thank-you Message <span className={`font-normal text-xs ${classes.textSecondary}`}>(before powered-by line)</span></label>
                <input type="text" value={personalInfo.receipt_footer_message || ''}
                  onChange={e => setPersonalInfo({ ...personalInfo, receipt_footer_message: e.target.value })}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`}
                  placeholder="e.g. Thanks for visiting! See you soon!" maxLength="100" />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Leave blank to hide this message</p>
              </div>
            </div>
            <ModernToggle
              checked={personalInfo.show_footer_section}
              onChange={() => setPersonalInfo({ ...personalInfo, show_footer_section: !personalInfo.show_footer_section })}
              label="Show Footer Section"
              description="Include QR code, review message, and hashtags on receipts"
            />
            <ModernToggle
              checked={personalInfo.show_powered_by_airoxlab !== false}
              onChange={() => setPersonalInfo({ ...personalInfo, show_powered_by_airoxlab: !personalInfo.show_powered_by_airoxlab })}
              label="Show Powered by airoxlab.com"
              description="Display branding line at the bottom of every receipt"
            />
            <div className={`mt-4 ${isDark ? 'bg-gray-800' : 'bg-blue-50'} rounded-xl p-5 border-2 border-dashed ${isDark ? 'border-gray-700' : 'border-blue-200'}`}>
              <p className={`text-xs font-bold ${classes.textPrimary} mb-3`}>Receipt Footer Preview:</p>
              {personalInfo.show_footer_section ? (
                <div className={`text-xs ${classes.textSecondary} space-y-1 text-center`}>
                  <p>[QR CODE]</p>
                  {personalInfo.receipt_review_message ? (
                    <p className="mt-2">{personalInfo.receipt_review_message}</p>
                  ) : (
                    <p className="mt-2 text-gray-400 italic">(review message hidden)</p>
                  )}
                  {(personalInfo.hashtag1 || personalInfo.hashtag2) ? (
                    <p className="font-semibold text-purple-600 dark:text-purple-400 mt-1">
                      {[personalInfo.hashtag1, personalInfo.hashtag2].filter(Boolean).join(' ')}
                    </p>
                  ) : (
                    <p className="font-medium text-gray-400 italic mt-1">(Enter hashtags above)</p>
                  )}
                </div>
              ) : (
                <div className={`text-xs ${classes.textSecondary} text-center`}>
                  <p className="text-xs text-gray-500 mt-1">(QR code and review section hidden)</p>
                </div>
              )}
              {personalInfo.receipt_footer_message && (
                <p className={`text-xs ${classes.textSecondary} text-center mt-2`}>{personalInfo.receipt_footer_message}</p>
              )}
              {personalInfo.show_powered_by_airoxlab !== false && (
                <p className={`text-xs ${classes.textSecondary} text-center mt-1`}>Powered by airoxlab.com</p>
              )}
            </div>
          </div>

          {/* Orders Settings */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-xl flex items-center justify-center shadow-lg">
                <Truck className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${classes.textPrimary}`}>Orders Settings</h3>
                <p className={`text-sm ${classes.textSecondary}`}>Configure order page options</p>
              </div>
            </div>
            <ModernToggle
              checked={personalInfo.show_dispatch_button}
              onChange={() => setPersonalInfo(prev => ({ ...prev, show_dispatch_button: !prev.show_dispatch_button }))}
              label="Show Dispatch Button"
              description="Show dispatch button on orders page for delivery orders (disable if using KDS)"
            />
          </div>

          {/* Business Hours */}
          <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-2xl p-6`}>
            <div className="flex items-center space-x-3 mb-6">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                <Clock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className={`text-lg font-bold ${classes.textPrimary}`}>Business Hours</h3>
                <p className={`text-sm ${classes.textSecondary}`}>Set your daily operational hours</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Business Day Starts At</label>
                <input type="time" value={personalInfo.business_start_time || '10:00'}
                  onChange={e => handlePersonalInfoChange('business_start_time', e.target.value)}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`} />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>e.g., 10:00 AM</p>
              </div>
              <div>
                <label className={`block text-sm font-semibold ${classes.textPrimary} mb-2`}>Business Day Ends At</label>
                <input type="time" value={personalInfo.business_end_time || '03:00'}
                  onChange={e => handlePersonalInfoChange('business_end_time', e.target.value)}
                  className={`w-full px-4 py-3.5 ${classes.card} ${classes.border} border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${classes.textPrimary} focus:outline-none`} />
                <p className={`text-xs ${classes.textSecondary} mt-1.5`}>Can be next day, e.g., 03:00 AM</p>
              </div>
            </div>
            <div className={`mt-4 ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'} rounded-xl p-4 border ${isDark ? 'border-blue-800' : 'border-blue-200'}`}>
              <div className="flex items-start space-x-3">
                <AlertCircle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                <div>
                  <p className={`text-sm font-semibold ${isDark ? 'text-blue-300' : 'text-blue-900'} mb-1`}>How Business Hours Work</p>
                  <p className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-700'}`}>
                    Orders are grouped by your business day to prevent midnight from splitting your actual operational period.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <motion.button
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              onClick={handleSavePersonalInfo}
              disabled={isSaving}
              className={`px-8 py-4 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-3 ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSaving ? (
                <><RefreshCw className="w-5 h-5 animate-spin" /><span>Saving Changes...</span></>
              ) : (
                <><Save className="w-5 h-5" /><span>Save Changes</span></>
              )}
            </motion.button>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
