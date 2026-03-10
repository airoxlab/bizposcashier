'use client'

import { useState, useEffect } from 'react'
import { X, User, Phone, FileText, Clock, Check, Coffee } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { notify } from '../ui/NotificationSystem'
import { themeManager } from '../../lib/themeManager'

export default function ConvertToTakeawayModal({ isOpen, onClose, order, onSuccess }) {
  const isDark = themeManager.isDark()

  const [formData, setFormData] = useState({
    phone: '',
    fullName: '',
    pickupTime: '',
    instructions: ''
  })
  const [customerSuggestions, setCustomerSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [isConverting, setIsConverting] = useState(false)
  const [errors, setErrors] = useState({})

  const getDefaultTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 30)
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  // Pre-fill from existing order data on open
  useEffect(() => {
    if (isOpen && order) {
      setFormData({
        phone: order.customer_phone || '',
        fullName: order.customer_name || '',
        pickupTime: getDefaultTime(),
        instructions: order.order_instructions || ''
      })
      setErrors({})
      setShowSuggestions(false)
      if (order.customer_id) {
        setSelectedCustomer({
          id: order.customer_id,
          phone: order.customer_phone,
          full_name: order.customer_name
        })
      } else {
        setSelectedCustomer(null)
      }
    }
  }, [isOpen, order])

  const addMinutesToTime = (minutes) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + minutes)
    setFormData(prev => ({
      ...prev,
      pickupTime: now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    }))
  }

  const searchCustomers = async (query) => {
    if (query.length < 3) { setCustomerSuggestions([]); setShowSuggestions(false); return }
    try {
      const currentUser = authManager.getCurrentUser()
      if (!currentUser?.id) return
      const { data } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', currentUser.id)
        .or(`phone.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(6)
      if (data) { setCustomerSuggestions(data); setShowSuggestions(data.length > 0) }
    } catch {}
  }

  const selectCustomer = (customer) => {
    setSelectedCustomer(customer)
    setFormData(prev => ({
      ...prev,
      phone: customer.phone || '',
      fullName: customer.full_name || ''
    }))
    setShowSuggestions(false)
    setCustomerSuggestions([])
  }

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }))
    if (field === 'phone' || field === 'fullName') {
      setSelectedCustomer(null)
      searchCustomers(value)
    }
  }

  const validateForm = () => {
    const newErrors = {}
    if (!formData.phone || formData.phone.length < 10)
      newErrors.phone = 'Phone number required (min 10 digits)'
    if (!formData.fullName || formData.fullName.trim().length < 2)
      newErrors.fullName = 'Full name required'
    if (!formData.pickupTime)
      newErrors.pickupTime = 'Pickup time required'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleConvert = async () => {
    if (!validateForm()) { notify.error('Please fill required fields'); return }
    setIsConverting(true)
    try {
      let customerId = selectedCustomer?.id

      if (!customerId) {
        const { data: newCustomer, error } = await supabase
          .from('customers')
          .insert({
            phone: formData.phone,
            full_name: formData.fullName,
            user_id: order.user_id
          })
          .select()
          .single()
        if (error) throw error
        customerId = newCustomer.id
      }

      // Convert HH:MM to ISO timestamp
      const [hours, minutes] = formData.pickupTime.split(':')
      const pickupDateTime = new Date()
      pickupDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      const updateData = {
        order_type: 'takeaway',
        customer_id: customerId,
        delivery_time: pickupDateTime.toISOString(),
        delivery_address: null,
        delivery_charges: 0,
        delivery_boy_id: null,
        order_instructions: formData.instructions || order.order_instructions,
      }

      // Subtract delivery charges from total when converting away from delivery
      if (order.order_type === 'delivery') {
        const charges = parseFloat(order.delivery_charges) || 0
        updateData.total_amount = Math.max(0, (parseFloat(order.total_amount) || 0) - charges)
      }

      const result = await cacheManager.updateOrderStatus(
        order.id,
        order.order_status,
        updateData
      )

      if (!result.success) throw new Error('Failed to update order')
      onSuccess?.()
      onClose()
    } catch (error) {
      notify.error('Failed to convert order: ' + error.message)
    } finally {
      setIsConverting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Sidebar panel */}
      <div className={`relative w-full max-w-md h-full ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-red-600 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Coffee className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Move to Takeaway</h2>
                <p className="text-white/90 text-xs">Order #{order?.order_number}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 bg-white/20 hover:bg-white/30 rounded-lg flex items-center justify-center transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Phone */}
          <div className="relative">
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <Phone className="w-4 h-4 mr-2 text-green-500" />
              Phone Number *
            </label>
            <input
              type="tel"
              value={formData.phone}
              onChange={e => handleFieldChange('phone', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all outline-none ${
                isDark ? 'bg-gray-800 border-gray-700 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500'
              } ${errors.phone ? 'border-red-500' : ''} focus:ring-2 focus:ring-orange-500/20`}
              placeholder="03001234567"
            />
            {errors.phone && <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone}</p>}

            {/* Customer suggestions */}
            {showSuggestions && customerSuggestions.length > 0 && (
              <div className={`absolute top-full left-0 right-0 mt-1 rounded-lg shadow-xl overflow-hidden z-50 max-h-48 overflow-y-auto ${
                isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
              }`}>
                {customerSuggestions.map(c => (
                  <button
                    key={c.id}
                    onClick={() => selectCustomer(c)}
                    className={`w-full text-left p-3 flex items-center space-x-3 transition-colors border-b last:border-b-0 ${
                      isDark ? 'hover:bg-gray-700 border-gray-700' : 'hover:bg-orange-50 border-gray-100'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center ${isDark ? 'bg-orange-900/40' : 'bg-orange-100'}`}>
                      <User className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-semibold text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>{c.full_name || 'Unnamed'}</p>
                      <p className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{c.phone}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Full Name */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <User className="w-4 h-4 mr-2 text-orange-500" />
              Full Name *
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={e => handleFieldChange('fullName', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all outline-none ${
                isDark ? 'bg-gray-800 border-gray-700 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500'
              } ${errors.fullName ? 'border-red-500' : ''} focus:ring-2 focus:ring-orange-500/20`}
              placeholder="Enter Customer Name"
            />
            {errors.fullName && <p className="text-red-500 text-xs mt-1 font-medium">{errors.fullName}</p>}
          </div>

          {/* Pickup Time */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <Clock className="w-4 h-4 mr-2 text-blue-500" />
              Pickup Time *
            </label>
            <input
              type="time"
              value={formData.pickupTime}
              onChange={e => handleFieldChange('pickupTime', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all outline-none ${
                isDark ? 'bg-gray-800 border-gray-700 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500'
              } ${errors.pickupTime ? 'border-red-500' : ''} focus:ring-2 focus:ring-orange-500/20`}
            />
            {errors.pickupTime && <p className="text-red-500 text-xs mt-1 font-medium">{errors.pickupTime}</p>}
            <div className="grid grid-cols-4 gap-2 mt-2">
              {[15, 30, 45, 60].map(m => (
                <button
                  key={m}
                  type="button"
                  onClick={() => addMinutesToTime(m)}
                  className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                    isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                  }`}
                >
                  +{m}m
                </button>
              ))}
            </div>
          </div>

          {/* Instructions */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <FileText className="w-4 h-4 mr-2 text-purple-500" />
              Special Instructions
              <span className={`ml-2 text-xs font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>(Optional)</span>
            </label>
            <textarea
              value={formData.instructions}
              onChange={e => handleFieldChange('instructions', e.target.value)}
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border-2 resize-none transition-all outline-none ${
                isDark ? 'bg-gray-800 border-gray-700 text-white focus:border-orange-500' : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-orange-500'
              } focus:ring-2 focus:ring-orange-500/20`}
              placeholder="Any special requests or notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`border-t p-4 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-5 py-3 font-semibold rounded-lg transition-all flex items-center justify-center ${
                isDark ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700' : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
              }`}
            >
              <X className="w-4 h-4 mr-2" />
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConvert}
              disabled={isConverting}
              className={`flex-[2] px-5 py-3 bg-gradient-to-r from-orange-600 to-red-600 text-white font-bold rounded-lg transition-all shadow-lg flex items-center justify-center ${
                isConverting ? 'opacity-50 cursor-not-allowed' : 'hover:from-orange-700 hover:to-red-700'
              }`}
            >
              <Check className="w-4 h-4 mr-2" />
              {isConverting ? 'Converting...' : 'Move to Takeaway'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
