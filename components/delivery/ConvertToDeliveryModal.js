'use client'

import { useState, useEffect } from 'react'
import { X, User, MapPin, Truck, Clock, DollarSign, AlertCircle, Search, Plus } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { notify } from '../ui/NotificationSystem'

export default function ConvertToDeliveryModal({ isOpen, onClose, order, onSuccess }) {
  const [formData, setFormData] = useState({
    phone: '',
    fullName: '',
    addressLine: '',
    addressLabel: 'Home',
    deliveryTime: '',
    deliveryCharges: 0,
    deliveryBoyId: '',
    instructions: ''
  })

  const [customerSuggestions, setCustomerSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [isConverting, setIsConverting] = useState(false)
  const [errors, setErrors] = useState({})

  // Load existing customer data from the order
  useEffect(() => {
    if (isOpen && order) {
      loadOrderCustomer()
      loadDeliveryBoys()
      setDefaultDeliveryTime()
    }
  }, [isOpen, order])

  const loadOrderCustomer = async () => {
    if (order.customer_id) {
      try {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('id', order.customer_id)
          .single()

        if (data) {
          setFormData(prev => ({
            ...prev,
            phone: data.phone || '',
            fullName: data.full_name || ''
          }))
          setSelectedCustomer(data)
          await loadCustomerAddresses(data.id)
        }
      } catch (error) {
        console.error('Error loading customer:', error)
      }
    }
  }

  const loadCustomerAddresses = async (customerId) => {
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })

      if (data && data.length > 0) {
        setSavedAddresses(data)
        // Auto-select default address
        const defaultAddr = data.find(addr => addr.is_default) || data[0]
        setFormData(prev => ({
          ...prev,
          addressLine: defaultAddr.address_line,
          addressLabel: defaultAddr.label
        }))
      }
    } catch (error) {
      console.error('Error loading addresses:', error)
    }
  }

  const loadDeliveryBoys = async () => {
    try {
      // Get current user ID from authManager (same as DeliveryCustomerForm)
      const currentUser = authManager.getCurrentUser()
      if (!currentUser?.id) {
        console.warn('No user ID found, cannot load delivery boys')
        setDeliveryBoys([])
        return
      }

      console.log('Loading delivery boys for user:', currentUser.id)

      const { data, error } = await supabase
        .from('delivery_boys')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', currentUser.id)
        .order('name', { ascending: true })

      if (error) {
        console.error('Error fetching delivery boys:', error)
        notify.error('Failed to load delivery boys')
        return
      }

      console.log('Loaded delivery boys:', data)
      setDeliveryBoys(data || [])

      if (!data || data.length === 0) {
        console.warn('No active delivery boys found')
      }
    } catch (error) {
      console.error('Error loading delivery boys:', error)
      notify.error('Failed to load delivery boys')
    }
  }

  const setDefaultDeliveryTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 45) // Default 45 minutes from now
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    setFormData(prev => ({ ...prev, deliveryTime: `${hours}:${minutes}` }))
  }

  const searchCustomers = async (query) => {
    if (query.length < 3) {
      setCustomerSuggestions([])
      return
    }

    try {
      const currentUser = authManager.getCurrentUser()
      if (!currentUser?.id) return

      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', currentUser.id)
        .or(`phone.ilike.%${query}%,full_name.ilike.%${query}%`)
        .limit(5)

      if (data) {
        setCustomerSuggestions(data)
        setShowSuggestions(true)
      }
    } catch (error) {
      console.error('Error searching customers:', error)
    }
  }

  const selectCustomer = async (customer) => {
    setSelectedCustomer(customer)
    setFormData(prev => ({
      ...prev,
      phone: customer.phone,
      fullName: customer.full_name || ''
    }))
    setShowSuggestions(false)
    await loadCustomerAddresses(customer.id)
  }

  const handlePhoneChange = (e) => {
    const phone = e.target.value
    setFormData(prev => ({ ...prev, phone }))
    searchCustomers(phone)
  }

  const selectAddress = (address) => {
    setFormData(prev => ({
      ...prev,
      addressLine: address.address_line,
      addressLabel: address.label
    }))
  }

  const addTimeOffset = (minutes) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + minutes)
    const hours = String(now.getHours()).padStart(2, '0')
    const mins = String(now.getMinutes()).padStart(2, '0')
    setFormData(prev => ({ ...prev, deliveryTime: `${hours}:${mins}` }))
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.phone || formData.phone.length < 10) {
      newErrors.phone = 'Valid phone number required (min 10 digits)'
    }
    if (!formData.fullName || formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Customer name required (min 2 characters)'
    }
    if (!formData.addressLine || formData.addressLine.trim().length < 5) {
      newErrors.addressLine = 'Delivery address required (min 5 characters)'
    }
    if (!formData.deliveryTime) {
      newErrors.deliveryTime = 'Delivery time required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleConvert = async () => {
    if (!validateForm()) {
      notify.error('Please fill all required fields')
      return
    }

    setIsConverting(true)

    try {
      // 1. Update or create customer with new address
      let customerId = selectedCustomer?.id

      if (!customerId) {
        // Create new customer
        const { data: newCustomer, error: customerError } = await supabase
          .from('customers')
          .insert({
            phone: formData.phone,
            full_name: formData.fullName,
            addressline: formData.addressLine,
            user_id: order.user_id
          })
          .select()
          .single()

        if (customerError) throw customerError
        customerId = newCustomer.id
      } else {
        // Update existing customer's current address
        await supabase
          .from('customers')
          .update({ addressline: formData.addressLine })
          .eq('id', customerId)
      }

      // 2. Save address to customer_addresses if it's new
      if (customerId) {
        const { data: existingAddresses } = await supabase
          .from('customer_addresses')
          .select('address_line')
          .eq('customer_id', customerId)

        const addressExists = existingAddresses?.some(
          addr => addr.address_line.trim() === formData.addressLine.trim()
        )

        if (!addressExists) {
          await supabase.from('customer_addresses').insert({
            customer_id: customerId,
            address_line: formData.addressLine,
            label: formData.addressLabel,
            is_default: savedAddresses.length === 0
          })
        }
      }

      // 3. Convert deliveryTime to timestamp
      const [hours, minutes] = formData.deliveryTime.split(':')
      const deliveryDateTime = new Date()
      deliveryDateTime.setHours(parseInt(hours), parseInt(minutes), 0, 0)

      // 4. Update the order using cacheManager (handles both DB and cache)
      const additionalData = {
        order_type: 'delivery',
        customer_id: customerId,
        delivery_address: formData.addressLine,
        delivery_time: deliveryDateTime.toISOString(),
        delivery_charges: parseFloat(formData.deliveryCharges) || 0,
        delivery_boy_id: formData.deliveryBoyId || null,
        order_instructions: formData.instructions || order.order_instructions,
        total_amount: order.total_amount + (parseFloat(formData.deliveryCharges) || 0)
      }

      // Use updateOrderStatus with additionalData to update all fields
      const result = await cacheManager.updateOrderStatus(
        order.id,
        order.order_status, // Keep current status
        additionalData
      )

      if (!result.success) {
        throw new Error('Failed to update order')
      }

      // Let parent component handle success notification
      onSuccess?.()
      onClose()
    } catch (error) {
      console.error('Error converting order:', error)
      notify.error('Failed to convert order: ' + error.message)
    } finally {
      setIsConverting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-6 rounded-t-2xl flex items-center justify-between z-10">
          <div className="flex items-center space-x-3">
            <Truck className="w-6 h-6" />
            <div>
              <h2 className="text-xl font-bold">Convert to Delivery Order</h2>
              <p className="text-sm text-blue-100">Order #{order?.order_number}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Customer Info */}
          <div>
            <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              <User className="w-4 h-4 mr-2" />
              Customer Phone *
            </label>
            <div className="relative">
              <input
                type="tel"
                value={formData.phone}
                onChange={handlePhoneChange}
                placeholder="Enter phone number"
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                  errors.phone ? 'border-red-500' : ''
                }`}
              />
              {errors.phone && (
                <p className="text-red-500 text-xs mt-1">{errors.phone}</p>
              )}

              {/* Customer Suggestions */}
              {showSuggestions && customerSuggestions.length > 0 && (
                <div className="absolute z-20 w-full mt-1 bg-white dark:bg-gray-700 border dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {customerSuggestions.map((customer) => (
                    <button
                      key={customer.id}
                      onClick={() => selectCustomer(customer)}
                      className="w-full px-4 py-3 text-left hover:bg-blue-50 dark:hover:bg-gray-600 border-b dark:border-gray-600 last:border-b-0"
                    >
                      <div className="font-medium dark:text-white">{customer.full_name}</div>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{customer.phone}</div>
                      {customer.addressline && (
                        <div className="text-xs text-gray-500 dark:text-gray-500 mt-1">{customer.addressline}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Customer Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Customer Name *
            </label>
            <input
              type="text"
              value={formData.fullName}
              onChange={(e) => setFormData(prev => ({ ...prev, fullName: e.target.value }))}
              placeholder="Enter customer name"
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.fullName ? 'border-red-500' : ''
              }`}
            />
            {errors.fullName && (
              <p className="text-red-500 text-xs mt-1">{errors.fullName}</p>
            )}
          </div>

          {/* Saved Addresses */}
          {savedAddresses.length > 0 && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
                Saved Addresses
              </label>
              <div className="grid grid-cols-1 gap-2">
                {savedAddresses.map((addr) => (
                  <button
                    key={addr.id}
                    onClick={() => selectAddress(addr)}
                    className={`p-3 text-left border rounded-lg hover:border-blue-500 transition-colors ${
                      formData.addressLine === addr.address_line
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-300 dark:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                        {addr.label}
                      </span>
                      {addr.is_default && (
                        <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-2 py-1 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">{addr.address_line}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Delivery Address */}
          <div>
            <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              <MapPin className="w-4 h-4 mr-2" />
              Delivery Address *
            </label>
            <textarea
              value={formData.addressLine}
              onChange={(e) => setFormData(prev => ({ ...prev, addressLine: e.target.value }))}
              placeholder="Enter complete delivery address"
              rows={3}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.addressLine ? 'border-red-500' : ''
              }`}
            />
            {errors.addressLine && (
              <p className="text-red-500 text-xs mt-1">{errors.addressLine}</p>
            )}

            {/* Address Label Quick Buttons */}
            <div className="flex flex-wrap gap-2 mt-2">
              {['Home', 'Office', 'House 1', 'House 2', 'Other'].map((label) => (
                <button
                  key={label}
                  onClick={() => setFormData(prev => ({ ...prev, addressLabel: label }))}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    formData.addressLabel === label
                      ? 'bg-blue-500 text-white border-blue-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-blue-500'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Boy Selection */}
          <div>
            <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              <Truck className="w-4 h-4 mr-2" />
              Delivery Boy (Optional)
            </label>
            <select
              value={formData.deliveryBoyId}
              onChange={(e) => setFormData(prev => ({ ...prev, deliveryBoyId: e.target.value }))}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            >
              <option value="">Select delivery boy</option>
              {deliveryBoys.map((boy) => (
                <option key={boy.id} value={boy.id}>
                  {boy.name} {boy.phone && `- ${boy.phone}`}
                </option>
              ))}
            </select>
          </div>

          {/* Delivery Time */}
          <div>
            <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              <Clock className="w-4 h-4 mr-2" />
              Delivery Time *
            </label>
            <input
              type="time"
              value={formData.deliveryTime}
              onChange={(e) => setFormData(prev => ({ ...prev, deliveryTime: e.target.value }))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white ${
                errors.deliveryTime ? 'border-red-500' : ''
              }`}
            />
            {errors.deliveryTime && (
              <p className="text-red-500 text-xs mt-1">{errors.deliveryTime}</p>
            )}

            {/* Time Quick Buttons */}
            <div className="flex flex-wrap gap-2 mt-2">
              {[
                { label: '+30m', minutes: 30 },
                { label: '+45m', minutes: 45 },
                { label: '+60m', minutes: 60 },
                { label: '+90m', minutes: 90 }
              ].map((btn) => (
                <button
                  key={btn.label}
                  onClick={() => addTimeOffset(btn.minutes)}
                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 rounded-lg hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors"
                >
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Delivery Charges */}
          <div>
            <label className="flex items-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              <DollarSign className="w-4 h-4 mr-2" />
              Delivery Charges (Rs)
            </label>
            <input
              type="number"
              min="0"
              value={formData.deliveryCharges}
              onChange={(e) => setFormData(prev => ({ ...prev, deliveryCharges: e.target.value }))}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />

            {/* Charges Quick Buttons */}
            <div className="flex flex-wrap gap-2 mt-2">
              {[0, 50, 100, 150, 200].map((amount) => (
                <button
                  key={amount}
                  onClick={() => setFormData(prev => ({ ...prev, deliveryCharges: amount }))}
                  className={`px-3 py-1 text-xs rounded-lg border transition-colors ${
                    parseInt(formData.deliveryCharges) === amount
                      ? 'bg-green-500 text-white border-green-500'
                      : 'bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:border-green-500'
                  }`}
                >
                  {amount === 0 ? 'Free' : `Rs ${amount}`}
                </button>
              ))}
            </div>
          </div>

          {/* Special Instructions */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Special Instructions (Optional)
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => setFormData(prev => ({ ...prev, instructions: e.target.value }))}
              placeholder="Any special instructions for delivery..."
              rows={2}
              className="w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 resize-none dark:bg-gray-700 dark:border-gray-600 dark:text-white"
            />
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertCircle className="w-5 h-5 text-blue-600 dark:text-blue-400 mt-0.5" />
              <div className="text-sm text-blue-800 dark:text-blue-300">
                <p className="font-semibold mb-1">Order Conversion</p>
                <p>This will convert the takeaway order to a delivery order. The order will be moved to the delivery section and can no longer be picked up.</p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 p-6 rounded-b-2xl border-t dark:border-gray-700 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            New Total: <span className="font-bold text-lg text-gray-900 dark:text-white">
              Rs {(order?.total_amount || 0) + (parseFloat(formData.deliveryCharges) || 0)}
            </span>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isConverting}
              className="px-6 py-3 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleConvert}
              disabled={isConverting}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 flex items-center space-x-2"
            >
              {isConverting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Converting...</span>
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4" />
                  <span>Convert to Delivery</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
