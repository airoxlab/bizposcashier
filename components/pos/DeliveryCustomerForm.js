'use client'

import { useState, useEffect, useRef } from 'react'
import { User, Phone, FileText, X, Check, Search, Clock, MapPin, DollarSign, Truck, Users, Plus, Home, Building, Tag } from 'lucide-react'
import { themeManager } from '../../lib/themeManager'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { notify } from '../ui/NotificationSystem'
import { supabase } from '../../lib/supabaseClient'

export default function DeliveryCustomerForm({
  isOpen,
  onClose,
  onSubmit,
  customer = null,
  deliveryTime = '',
  deliveryCharges = 0
}) {
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [formData, setFormData] = useState({
    phone: '',
    fullName: '',
    addressLine: '',
    addressLabel: 'Home',
    instructions: '',
    deliveryTime: '',
    deliveryCharges: 0,
    deliveryBoyId: ''
  })

  const [errors, setErrors] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [allCustomers, setAllCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [isSaving, setIsSaving] = useState(false)
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [loadingDeliveryBoys, setLoadingDeliveryBoys] = useState(false)

  // Multiple addresses support
  const [customerAddresses, setCustomerAddresses] = useState([])
  const [showAddNewAddress, setShowAddNewAddress] = useState(false)
  const [loadingAddresses, setLoadingAddresses] = useState(false)

  const searchInputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const fullNameRef = useRef(null)
  const homeButtonRef = useRef(null)
  const officeButtonRef = useRef(null)
  const house1ButtonRef = useRef(null)
  const house2ButtonRef = useRef(null)
  const otherButtonRef = useRef(null)
  const addressLineRef = useRef(null)
  const deliveryBoyRef = useRef(null)
  const deliveryTimeRef = useRef(null)
  const time30mRef = useRef(null)
  const time45mRef = useRef(null)
  const time60mRef = useRef(null)
  const time90mRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const saveButtonRef = useRef(null)

  // Quick time buttons (in minutes from now)
  const quickTimes = [30, 45, 60, 90]

  // Quick charges buttons
  const quickCharges = [0, 50, 100, 150, 200]

  // Address label options
  const addressLabels = ['Home', 'Office', 'House 1', 'House 2', 'Other']

  // Load all customers and delivery boys on mount
  useEffect(() => {
    if (isOpen) {
      loadAllCustomers()
      loadDeliveryBoys()
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load existing customer data when editing
  useEffect(() => {
    if (isOpen && customer) {
      setFormData({
        phone: customer.phone || '',
        fullName: customer.full_name || '',
        addressLine: customer.addressline || '',
        addressLabel: 'Home',
        instructions: '',
        deliveryTime: deliveryTime || getDefaultTime(),
        deliveryCharges: deliveryCharges || 0,
        deliveryBoyId: ''
      })
      setSelectedCustomer(customer)
      // Load addresses for existing customer
      if (customer.id) {
        loadCustomerAddresses(customer.id)
      }
    } else if (isOpen && !customer) {
      clearForm()
    }
  }, [isOpen, customer, deliveryTime, deliveryCharges])

  // Search suggestions when typing in phone or name
  useEffect(() => {
    const searchTerm = formData.phone || formData.fullName
    if (searchTerm && searchTerm.length >= 2 && !selectedCustomer) {
      searchSuggestions(searchTerm)
    } else {
      setSuggestions([])
      setShowSuggestions(false)
    }
  }, [formData.phone, formData.fullName])

  // Auto-search when phone reaches 10+ digits
  useEffect(() => {
    if (formData.phone.length >= 10 && !selectedCustomer) {
      searchCustomerByPhone()
    }
  }, [formData.phone])

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        suggestionsRef.current &&
        !suggestionsRef.current.contains(event.target) &&
        searchInputRef.current &&
        !searchInputRef.current.contains(event.target)
      ) {
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Reset selected suggestion index when suggestions change
  useEffect(() => {
    setSelectedSuggestionIndex(-1)
  }, [suggestions])

  // Handle keyboard navigation with arrow keys
  const handleKeyDown = (e) => {
    const { key } = e
    const activeElement = document.activeElement

    // Handle suggestions dropdown navigation
    if (showSuggestions && suggestions.length > 0 &&
        (activeElement === searchInputRef.current || activeElement === fullNameRef.current)) {

      if (key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        return
      } else if (key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        return
      } else if (key === 'Enter' && selectedSuggestionIndex >= 0) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedSuggestionIndex])
        setSelectedSuggestionIndex(-1)
        return
      } else if (key === 'Escape') {
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedSuggestionIndex(-1)
        return
      }
    }

    // Define focusable fields in order
    const focusableFields = [
      searchInputRef.current,
      fullNameRef.current,
      homeButtonRef.current,
      officeButtonRef.current,
      house1ButtonRef.current,
      house2ButtonRef.current,
      otherButtonRef.current,
      addressLineRef.current,
      deliveryBoyRef.current,
      deliveryTimeRef.current,
      time30mRef.current,
      time45mRef.current,
      time60mRef.current,
      time90mRef.current,
      cancelButtonRef.current,
      saveButtonRef.current
    ].filter(el => el != null)

    const currentIndex = focusableFields.findIndex(el => el === activeElement)
    if (currentIndex === -1) return

    let nextIndex = currentIndex

    // Check if current element is an address label button
    const addressLabelButtons = [homeButtonRef.current, officeButtonRef.current, house1ButtonRef.current, house2ButtonRef.current, otherButtonRef.current]
    const isAddressLabelButton = addressLabelButtons.includes(activeElement)
    const addressLabelButtonStartIndex = focusableFields.indexOf(homeButtonRef.current)

    // Check if current element is a time button
    const timeButtons = [time30mRef.current, time45mRef.current, time60mRef.current, time90mRef.current]
    const isTimeButton = timeButtons.includes(activeElement)
    const timeButtonStartIndex = focusableFields.indexOf(time30mRef.current)

    // Navigate with arrow keys
    switch (key) {
      case 'ArrowDown':
        e.preventDefault()
        // If on address label buttons, skip to address textarea
        if (isAddressLabelButton) {
          nextIndex = addressLabelButtonStartIndex + 5 // Skip all address label buttons
          if (nextIndex >= focusableFields.length) nextIndex = 0
        }
        // If on time buttons, skip to next field
        else if (isTimeButton) {
          nextIndex = timeButtonStartIndex + 4 // Skip all time buttons
          if (nextIndex >= focusableFields.length) nextIndex = 0
        } else {
          nextIndex = (currentIndex + 1) % focusableFields.length
        }
        break
      case 'ArrowUp':
        e.preventDefault()
        // If on address label buttons, go to full name input
        if (isAddressLabelButton) {
          nextIndex = addressLabelButtonStartIndex - 1 // Go to full name input
        }
        // If on address textarea, go to last address label button
        else if (currentIndex === addressLabelButtonStartIndex + 5) {
          nextIndex = addressLabelButtonStartIndex + 4 // Go to last address label button (Other)
        }
        // If on time buttons, go to delivery time input
        else if (isTimeButton) {
          nextIndex = timeButtonStartIndex - 1 // Go to delivery time input
        } else if (currentIndex === timeButtonStartIndex + 4) {
          // If on the field after time buttons, go to last time button
          nextIndex = timeButtonStartIndex + 3
        } else {
          nextIndex = currentIndex - 1 < 0 ? focusableFields.length - 1 : currentIndex - 1
        }
        break
      case 'ArrowRight':
        // Navigate right within address label buttons
        if (isAddressLabelButton && currentIndex < addressLabelButtonStartIndex + 4) {
          e.preventDefault()
          nextIndex = currentIndex + 1
        }
        // Navigate right within time buttons
        else if (isTimeButton && currentIndex < timeButtonStartIndex + 3) {
          e.preventDefault()
          nextIndex = currentIndex + 1
        }
        // Navigate between Cancel and Save buttons (last two elements)
        else if (currentIndex >= focusableFields.length - 2) {
          e.preventDefault()
          nextIndex = currentIndex === focusableFields.length - 1 ? focusableFields.length - 2 : focusableFields.length - 1
        }
        break
      case 'ArrowLeft':
        // Navigate left within address label buttons
        if (isAddressLabelButton && currentIndex > addressLabelButtonStartIndex) {
          e.preventDefault()
          nextIndex = currentIndex - 1
        }
        // Navigate left within time buttons
        else if (isTimeButton && currentIndex > timeButtonStartIndex) {
          e.preventDefault()
          nextIndex = currentIndex - 1
        }
        // Navigate between Cancel and Save buttons (last two elements)
        else if (currentIndex >= focusableFields.length - 2) {
          e.preventDefault()
          nextIndex = currentIndex === focusableFields.length - 2 ? focusableFields.length - 1 : focusableFields.length - 2
        }
        break
      case 'Enter':
        // Submit form when Enter is pressed on Save button
        if (activeElement === saveButtonRef.current) {
          e.preventDefault()
          handleSubmit()
        }
        // Close form when Enter is pressed on Cancel button
        else if (activeElement === cancelButtonRef.current) {
          e.preventDefault()
          onClose()
        }
        break
      case 'Escape':
        e.preventDefault()
        onClose()
        break
      default:
        return
    }

    if (nextIndex !== currentIndex) {
      focusableFields[nextIndex]?.focus()
    }
  }

  const getDefaultTime = () => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 45) // 45 minutes for delivery
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  }

  const addMinutesToTime = (minutes) => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + minutes)
    const timeString = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    setFormData({ ...formData, deliveryTime: timeString })
  }

  const setCharges = (amount) => {
    setFormData({ ...formData, deliveryCharges: amount })
  }

  const loadAllCustomers = async () => {
    try {
      let customers = cacheManager.getAllCustomers() || []

      if (customers.length === 0) {
        const storedCustomers = JSON.parse(localStorage.getItem('pos_customers') || '[]')
        customers = storedCustomers
      }

      // Filter out any null/undefined entries
      const validCustomers = customers.filter(c => c != null && c.phone)

      setAllCustomers(validCustomers)
      console.log('📋 Loaded customers:', validCustomers.length)
    } catch (error) {
      console.error('Error loading customers:', error)
      setAllCustomers([])
    }
  }

  const loadDeliveryBoys = async () => {
    try {
      setLoadingDeliveryBoys(true)

      // Get current user ID
      const currentUser = authManager.getCurrentUser()
      if (!currentUser?.id) {
        console.warn('No user ID found, cannot load delivery boys')
        setDeliveryBoys([])
        setLoadingDeliveryBoys(false)
        return
      }

      const { data, error } = await supabase
        .from('delivery_boys')
        .select('*')
        .eq('status', 'active')
        .eq('user_id', currentUser.id)
        .order('name', { ascending: true })

      if (error) {
        console.error('Error loading delivery boys:', error)
        notify.error('Failed to load delivery boys', { duration: 2000 })
        setDeliveryBoys([])
        return
      }

      setDeliveryBoys(data || [])
      console.log('🚴 Loaded delivery boys for user:', currentUser.id, '- Count:', data?.length || 0)
    } catch (error) {
      console.error('Error loading delivery boys:', error)
      setDeliveryBoys([])
    } finally {
      setLoadingDeliveryBoys(false)
    }
  }

  // Load addresses for a specific customer
  const loadCustomerAddresses = async (customerId) => {
    if (!customerId) return

    try {
      setLoadingAddresses(true)
      console.log('📍 Loading addresses for customer:', customerId)

      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customerId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error loading customer addresses:', error)
        setCustomerAddresses([])
        return
      }

      setCustomerAddresses(data || [])
      console.log('📍 Loaded addresses:', data?.length || 0)

      // If customer has addresses, show the selector
      if (data && data.length > 0) {
        // Auto-select default address or first one
        const defaultAddr = data.find(a => a.is_default) || data[0]
        setFormData(prev => ({
          ...prev,
          addressLine: defaultAddr.address_line,
          addressLabel: defaultAddr.label || 'Home'
        }))
      }
    } catch (error) {
      console.error('Error loading addresses:', error)
      setCustomerAddresses([])
    } finally {
      setLoadingAddresses(false)
    }
  }

  // Save a new address for the customer
  const saveNewAddress = async (customerId, addressLine, label, isDefault = false) => {
    if (!customerId || !addressLine) return null

    try {
      console.log('💾 Saving new address for customer:', customerId)

      const { data, error } = await supabase
        .from('customer_addresses')
        .insert([{
          customer_id: customerId,
          address_line: addressLine.trim(),
          label: label || 'Home',
          is_default: isDefault
        }])
        .select()
        .single()

      if (error) {
        console.error('Error saving address:', error)
        return null
      }

      console.log('✅ Address saved:', data)
      return data
    } catch (error) {
      console.error('Error saving address:', error)
      return null
    }
  }

  const searchSuggestions = (searchTerm) => {
    if (!searchTerm || searchTerm.length < 2) {
      setSuggestions([])
      setShowSuggestions(false)
      return
    }

    const search = searchTerm.toLowerCase()
    const filtered = allCustomers
      .filter(c => c != null) // Filter out null/undefined customers
      .filter(c => {
        const phone = (c.phone || '').toLowerCase()
        const fullName = (c.full_name || '').toLowerCase()
        const address = (c.addressline || '').toLowerCase()
        return phone.includes(search) || fullName.includes(search) || address.includes(search)
      })
      .slice(0, 8)

    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
  }

  const searchCustomerByPhone = async () => {
    if (formData.phone.length < 10) return

    try {
      const existingCustomer = await cacheManager.findCustomerByPhone(formData.phone)

      if (existingCustomer) {
        setFormData({
          ...formData,
          fullName: existingCustomer.full_name || '',
          addressLine: existingCustomer.addressline || ''
        })
        setSelectedCustomer(existingCustomer)

        // Load addresses for this customer
        if (existingCustomer.id) {
          loadCustomerAddresses(existingCustomer.id)
        }

        notify.success(`Found: ${existingCustomer.full_name}`, { duration: 2000 })
      }
    } catch (error) {
      console.error('Error searching customer:', error)
    }
  }

  const selectSuggestion = (suggestion) => {
    setFormData({
      phone: suggestion.phone || '',
      fullName: suggestion.full_name || '',
      addressLine: suggestion.addressline || '',
      addressLabel: 'Home',
      instructions: '',
      deliveryTime: formData.deliveryTime || getDefaultTime(),
      deliveryCharges: formData.deliveryCharges || 0,
      deliveryBoyId: formData.deliveryBoyId
    })
    setSelectedCustomer(suggestion)
    setShowSuggestions(false)
    setSuggestions([])
    setSelectedSuggestionIndex(-1)

    // Load addresses for selected customer
    if (suggestion.id) {
      loadCustomerAddresses(suggestion.id)
    }

    // Removed toast notification - too disturbing
  }

  const selectAddress = (address) => {
    setFormData(prev => ({
      ...prev,
      addressLine: address.address_line,
      addressLabel: address.label || 'Home'
    }))
    // Removed toast notification - too disturbing
  }

  const clearForm = () => {
    setFormData({
      phone: '',
      fullName: '',
      addressLine: '',
      addressLabel: 'Home',
      instructions: '',
      deliveryTime: getDefaultTime(),
      deliveryCharges: 0,
      deliveryBoyId: ''
    })
    setSelectedCustomer(null)
    setCustomerAddresses([])
    setErrors({})
    setSuggestions([])
    setShowSuggestions(false)
    setShowAddNewAddress(false)
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.phone || formData.phone.length < 10) {
      newErrors.phone = 'Phone number required (min 10 digits)'
    }

    if (!formData.fullName || formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name is required'
    }

    if (!formData.addressLine || formData.addressLine.trim().length < 5) {
      newErrors.addressLine = 'Delivery address is required (min 5 characters)'
    }

    if (!formData.deliveryTime) {
      newErrors.deliveryTime = 'Delivery time is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))

    // Clear selected customer when user edits phone or name
    if (selectedCustomer && (field === 'phone' || field === 'fullName')) {
      setSelectedCustomer(null)
      setCustomerAddresses([])
    }

    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }))
    }
  }

  const handleSubmit = async () => {
    if (!validateForm()) {
      notify.error('Please fill required fields', { duration: 2000 })
      return
    }

    if (isSaving) return
    setIsSaving(true)

    try {
      // Split full name into first and last name for backend
      const nameParts = formData.fullName.trim().split(' ')
      const firstName = nameParts[0] || ''
      const lastName = nameParts.slice(1).join(' ') || ''

      const customerData = {
        phone: formData.phone,
        firstName: firstName,
        lastName: lastName,
        fullName: formData.fullName.trim(),
        addressLine: formData.addressLine.trim(),
        instructions: formData.instructions,
        existingCustomerId: selectedCustomer?.id
      }

      // Save customer using cacheManager
      console.log('💾 Saving customer:', customerData)

      const savedCustomer = await cacheManager.findOrCreateCustomer(
        formData.phone,
        customerData
      )

      console.log('✅ Customer saved:', savedCustomer)

      if (!savedCustomer) {
        console.error('❌ savedCustomer is null/undefined!')
        notify.error('Failed to save customer - please try again', { duration: 3000 })
        return
      }

      // Save address to customer_addresses if it's not already stored there
      // Note: do NOT gate on selectedCustomer?.id — new customers also need their address saved
      const addressAlreadyExists = customerAddresses.some(a => a.address_line === formData.addressLine.trim())
      if (savedCustomer.id && formData.addressLine.trim() && !addressAlreadyExists) {
        await saveNewAddress(
          savedCustomer.id,
          formData.addressLine,
          formData.addressLabel,
          customerAddresses.length === 0 // Make default if it's the first address
        )
      }

      // Call parent submit with saved customer
      console.log('📤 Calling onSubmit with customer:', savedCustomer)
      await onSubmit({
        customer: {
          ...savedCustomer,
          addressline: formData.addressLine.trim() // Use selected address
        },
        orderInstructions: formData.instructions,
        deliveryTime: formData.deliveryTime,
        deliveryCharges: parseFloat(formData.deliveryCharges) || 0,
        deliveryBoyId: formData.deliveryBoyId || null
      })

      // Refresh customers cache immediately
      try {
        const refreshedCustomers = await cacheManager.refreshCustomers()
        console.log('✅ Customers refreshed:', refreshedCustomers.length)
        await loadAllCustomers()
      } catch (error) {
        console.error('Error refreshing customers:', error)
      }

      // Removed toast notification - too many notifications
      clearForm()
      onClose()
    } catch (error) {
      console.error('Error submitting customer:', error)
      notify.error('Failed to save customer', { duration: 2000 })
    } finally {
      setIsSaving(false)
    }
  }

  // Get icon for address label
  const getAddressIcon = (label) => {
    switch(label?.toLowerCase()) {
      case 'office': return Building
      case 'home': return Home
      default: return MapPin
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sidebar */}
      <div className={`relative w-full max-w-md h-full ${isDark ? 'bg-gray-900' : 'bg-white'} shadow-2xl flex flex-col`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-600 to-cyan-600 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <Truck className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Delivery Order
                </h2>
                <p className="text-white/90 text-xs">
                  Search or add new
                </p>
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

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Phone Number */}
          <div className="relative">
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <Phone className="w-4 h-4 mr-2 text-green-500" />
              Phone Number *
            </label>
            <input
              ref={searchInputRef}
              type="tel"
              value={formData.phone}
              onChange={(e) => handleInputChange('phone', e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true)
              }}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } ${errors.phone ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              placeholder="03001234567"
            />
            {errors.phone && (
              <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="relative">
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <User className="w-4 h-4 mr-2 text-blue-500" />
              Full Name *
            </label>
            <input
              ref={fullNameRef}
              type="text"
              value={formData.fullName}
              onChange={(e) => handleInputChange('fullName', e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => {
                if (suggestions.length > 0) setShowSuggestions(true)
              }}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } ${errors.fullName ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              placeholder="Enter Customer Name"
            />
            {errors.fullName && (
              <p className="text-red-500 text-xs mt-1 font-medium">{errors.fullName}</p>
            )}

            {/* Suggestions Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                className={`absolute top-full left-0 right-0 mt-2 rounded-lg shadow-xl overflow-hidden z-50 max-h-64 overflow-y-auto ${
                  isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'
                }`}
              >
                <div className={`p-2 border-b ${isDark ? 'bg-blue-900/20 border-gray-700' : 'bg-blue-50 border-gray-200'}`}>
                  <p className={`text-xs font-semibold flex items-center ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
                    <Search className="w-3 h-3 mr-1" />
                    {suggestions.length} found
                  </p>
                </div>
                {suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    onClick={() => selectSuggestion(suggestion)}
                    onMouseEnter={() => setSelectedSuggestionIndex(index)}
                    className={`w-full text-left p-3 transition-colors border-b last:border-b-0 ${
                      selectedSuggestionIndex === index
                        ? isDark
                          ? 'bg-blue-700 border-gray-700'
                          : 'bg-blue-100 border-gray-100'
                        : isDark
                        ? 'hover:bg-gray-700 border-gray-700'
                        : 'hover:bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        selectedSuggestionIndex === index
                          ? isDark ? 'bg-blue-800' : 'bg-blue-200'
                          : isDark ? 'bg-blue-900/40' : 'bg-blue-100'
                      }`}>
                        <User className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`font-semibold text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {suggestion.full_name || 'Unnamed'}
                        </p>
                        <p className={`text-xs truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                          📱 {suggestion.phone}
                        </p>
                        {suggestion.addressline && (
                          <p className={`text-xs truncate ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                            📍 {suggestion.addressline}
                          </p>
                        )}
                      </div>
                      <Check className={`w-4 h-4 ${
                        selectedSuggestionIndex === index
                          ? isDark ? 'text-blue-300' : 'text-blue-700'
                          : isDark ? 'text-blue-400' : 'text-blue-600'
                      }`} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Delivery Address */}
          <div className="relative">
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <MapPin className="w-4 h-4 mr-2 text-red-500" />
              Delivery Address *
            </label>

            {/* Address label chips — always show all 5 */}
            <div className="flex flex-wrap gap-2 mb-2">
              {[
                { lbl: 'Home', ref: homeButtonRef },
                { lbl: 'Office', ref: officeButtonRef },
                { lbl: 'House 1', ref: house1ButtonRef },
                { lbl: 'House 2', ref: house2ButtonRef },
                { lbl: 'Other', ref: otherButtonRef },
              ].map(({ lbl, ref: btnRef }) => {
                const savedAddr = customerAddresses.find(a => a.label === lbl)
                return (
                  <button
                    key={lbl}
                    ref={btnRef}
                    type="button"
                    onClick={() => {
                      if (savedAddr) {
                        setFormData(prev => ({ ...prev, addressLabel: lbl, addressLine: savedAddr.address_line }))
                      } else {
                        setFormData(prev => ({ ...prev, addressLabel: lbl, addressLine: '' }))
                      }
                    }}
                    onKeyDown={handleKeyDown}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                      formData.addressLabel === lbl
                        ? isDark ? 'bg-purple-600 text-white' : 'bg-purple-500 text-white'
                        : isDark ? 'bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
                    }`}
                  >
                    {lbl}
                  </button>
                )
              })}
            </div>

            <textarea
              ref={addressLineRef}
              value={formData.addressLine}
              onChange={(e) => handleInputChange('addressLine', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={2}
              className={`w-full px-4 py-3 rounded-lg border-2 resize-none transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } ${errors.addressLine ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              placeholder="Enter full delivery address..."
            />
            {errors.addressLine && (
              <p className="text-red-500 text-xs mt-1 font-medium">{errors.addressLine}</p>
            )}

            {/* Show hint for new address */}
            {selectedCustomer && showAddNewAddress && (
              <p className={`text-xs mt-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                💡 This will be saved as a new address for {selectedCustomer.full_name}
              </p>
            )}
          </div>

          {/* Delivery Boy */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <Users className="w-4 h-4 mr-2 text-cyan-500" />
              Delivery Boy
              <span className={`ml-2 text-xs font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>(Optional)</span>
            </label>
            <select
              ref={deliveryBoyRef}
              value={formData.deliveryBoyId}
              onChange={(e) => handleInputChange('deliveryBoyId', e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loadingDeliveryBoys}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              <option value="">
                {loadingDeliveryBoys ? 'Loading delivery boys...' : 'Select Delivery Boy (Optional)'}
              </option>
              {deliveryBoys.map((boy) => (
                <option key={boy.id} value={boy.id}>
                  {boy.name} {boy.phone ? `- ${boy.phone}` : ''}
                </option>
              ))}
            </select>
            {deliveryBoys.length === 0 && !loadingDeliveryBoys && (
              <p className={`text-xs mt-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                No active delivery boys found
              </p>
            )}
          </div>

          {/* Delivery Time */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <Clock className="w-4 h-4 mr-2 text-purple-500" />
              Delivery Time *
            </label>
            <input
              ref={deliveryTimeRef}
              type="time"
              value={formData.deliveryTime}
              onChange={(e) => handleInputChange('deliveryTime', e.target.value)}
              onKeyDown={handleKeyDown}
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } ${errors.deliveryTime ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
            />
            {errors.deliveryTime && (
              <p className="text-red-500 text-xs mt-1 font-medium">{errors.deliveryTime}</p>
            )}

            {/* Quick Time Buttons */}
            <div className="grid grid-cols-4 gap-2 mt-2">
              <button
                ref={time30mRef}
                type="button"
                onClick={() => addMinutesToTime(30)}
                onKeyDown={handleKeyDown}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  isDark
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                +30m
              </button>
              <button
                ref={time45mRef}
                type="button"
                onClick={() => addMinutesToTime(45)}
                onKeyDown={handleKeyDown}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  isDark
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                +45m
              </button>
              <button
                ref={time60mRef}
                type="button"
                onClick={() => addMinutesToTime(60)}
                onKeyDown={handleKeyDown}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  isDark
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                +60m
              </button>
              <button
                ref={time90mRef}
                type="button"
                onClick={() => addMinutesToTime(90)}
                onKeyDown={handleKeyDown}
                className={`px-3 py-2 text-xs font-semibold rounded-lg transition-all ${
                  isDark
                    ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                }`}
              >
                +90m
              </button>
            </div>
          </div>

          {/* Delivery Charges */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <DollarSign className="w-4 h-4 mr-2 text-green-500" />
              Delivery Charges (Rs)
            </label>
            <input
              type="number"
              value={formData.deliveryCharges}
              onChange={(e) => handleInputChange('deliveryCharges', e.target.value)}
              min="0"
              step="10"
              className={`w-full px-4 py-3 rounded-lg border-2 transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              placeholder="0"
            />

            {/* Quick Charges Buttons */}
            <div className="grid grid-cols-5 gap-2 mt-2">
              {quickCharges.map((amount) => (
                <button
                  key={amount}
                  type="button"
                  onClick={() => setCharges(amount)}
                  className={`px-2 py-2 text-xs font-semibold rounded-lg transition-all ${
                    formData.deliveryCharges == amount
                      ? isDark
                        ? 'bg-blue-600 text-white border-2 border-blue-500'
                        : 'bg-blue-500 text-white border-2 border-blue-600'
                      : isDark
                        ? 'bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
                  }`}
                >
                  Rs {amount}
                </button>
              ))}
            </div>
          </div>

          {/* Special Instructions */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <FileText className="w-4 h-4 mr-2 text-orange-500" />
              Special Instructions
              <span className={`ml-2 text-xs font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>(Optional)</span>
            </label>
            <textarea
              value={formData.instructions}
              onChange={(e) => handleInputChange('instructions', e.target.value)}
              rows={2}
              className={`w-full px-4 py-3 rounded-lg border-2 resize-none transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-blue-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-blue-500'
              } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
              placeholder="Any special requests or notes..."
            />
          </div>

          {/* Helper Text */}
          <div className={`text-center text-xs p-3 rounded-lg ${
            isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
          }`}>
            <p>Type phone or name to search • Select from saved addresses</p>
          </div>
        </div>

        {/* Footer Buttons */}
        <div className={`border-t p-4 ${isDark ? 'bg-gray-900 border-gray-800' : 'bg-white border-gray-200'}`}>
          <div className="flex space-x-3">
            <button
              ref={cancelButtonRef}
              type="button"
              onClick={onClose}
              onKeyDown={handleKeyDown}
              className={`flex-1 px-5 py-3 font-semibold rounded-lg transition-all ${
                isDark
                  ? 'bg-gray-800 hover:bg-gray-750 text-gray-200 border border-gray-700'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
              }`}
            >
              <div className="flex items-center justify-center">
                <X className="w-4 h-4 mr-2" />
                Cancel
              </div>
            </button>

            <button
              ref={saveButtonRef}
              type="button"
              onClick={handleSubmit}
              onKeyDown={handleKeyDown}
              disabled={isSaving}
              className={`flex-[2] px-5 py-3 bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-bold rounded-lg transition-all shadow-lg ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:from-blue-700 hover:to-cyan-700'}`}
            >
              <div className="flex items-center justify-center">
                <Check className="w-4 h-4 mr-2" />
                {isSaving ? 'Saving...' : 'Save'}
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
