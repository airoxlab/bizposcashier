'use client'

import { useState, useEffect, useRef } from 'react'
import { User, Phone, FileText, X, Check, Search, MapPin } from 'lucide-react'
import { themeManager } from '../../lib/themeManager'
import { cacheManager } from '../../lib/cacheManager'
import { notify } from '../ui/NotificationSystem'

export default function WalkInCustomerForm({ 
  isOpen, 
  onClose, 
  onSubmit,
  customer = null
}) {
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [formData, setFormData] = useState({
    phone: '',
    fullName: '',
    instructions: ''
  })

  const [errors, setErrors] = useState({})
  const [suggestions, setSuggestions] = useState([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [allCustomers, setAllCustomers] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1)
  const [isSaving, setIsSaving] = useState(false)

  const searchInputRef = useRef(null)
  const suggestionsRef = useRef(null)
  const fullNameRef = useRef(null)
  const instructionsRef = useRef(null)
  const cancelButtonRef = useRef(null)
  const saveButtonRef = useRef(null)

  // Load all customers on mount
  useEffect(() => {
    if (isOpen) {
      loadAllCustomers()
      // Focus on phone input when opened
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [isOpen])

  // Load existing customer data when editing
  useEffect(() => {
    if (isOpen && customer) {
      setFormData({
        phone: customer.phone || '',
        fullName: customer.full_name || '',
        instructions: ''
      })
      setSelectedCustomer(customer)
    } else if (isOpen && !customer) {
      clearForm()
    }
  }, [isOpen, customer])

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
      instructionsRef.current,
      cancelButtonRef.current,
      saveButtonRef.current
    ].filter(el => el != null)

    const currentIndex = focusableFields.findIndex(el => el === activeElement)
    if (currentIndex === -1) return

    let nextIndex = currentIndex

    // Navigate with arrow keys
    switch (key) {
      case 'ArrowDown':
        e.preventDefault()
        nextIndex = (currentIndex + 1) % focusableFields.length
        break
      case 'ArrowUp':
        e.preventDefault()
        nextIndex = currentIndex - 1 < 0 ? focusableFields.length - 1 : currentIndex - 1
        break
      case 'ArrowRight':
        // Only navigate for buttons (last two elements)
        if (currentIndex >= focusableFields.length - 2) {
          e.preventDefault()
          nextIndex = currentIndex === focusableFields.length - 1 ? focusableFields.length - 2 : focusableFields.length - 1
        }
        break
      case 'ArrowLeft':
        // Only navigate for buttons (last two elements)
        if (currentIndex >= focusableFields.length - 2) {
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

  const loadAllCustomers = async () => {
    try {
      let customers = cacheManager.getAllCustomers() || []
      
      if (customers.length === 0) {
        const storedCustomers = JSON.parse(localStorage.getItem('pos_customers') || '[]')
        customers = storedCustomers
      }
      
      setAllCustomers(customers)
      console.log('📋 Loaded customers:', customers.length)
    } catch (error) {
      console.error('Error loading customers:', error)
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
      .filter(c => c != null)
      .filter(c => {
        const phone = (c.phone || '').toLowerCase()
        const fullName = (c.full_name || '').toLowerCase()
        const address = (c.addressline || '').toLowerCase()
        return phone.includes(search) || fullName.includes(search) || address.includes(search)
      }).slice(0, 8)

    setSuggestions(filtered)
    setShowSuggestions(filtered.length > 0)
  }

  const searchCustomerByPhone = async () => {
    if (formData.phone.length < 10) return

    try {
      const existingCustomer = await cacheManager.findCustomerByPhone(formData.phone)
      
      if (existingCustomer) {
        setFormData({
          phone: existingCustomer.phone || '',
          fullName: existingCustomer.full_name || '',
          instructions: ''
        })
        setSelectedCustomer(existingCustomer)
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
      instructions: ''
    })
    setSelectedCustomer(suggestion)
    setShowSuggestions(false)
    setSuggestions([])
    setSelectedSuggestionIndex(-1)

    // Removed toast notification - too disturbing
  }

  const clearForm = () => {
    setFormData({
      phone: '',
      fullName: '',
      instructions: ''
    })
    setSelectedCustomer(null)
    setErrors({})
    setSuggestions([])
    setShowSuggestions(false)
  }

  const validateForm = () => {
    const newErrors = {}

    if (!formData.phone || formData.phone.length < 10) {
      newErrors.phone = 'Phone number required (min 10 digits)'
    }

    if (!formData.fullName || formData.fullName.trim().length < 2) {
      newErrors.fullName = 'Full name is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
    
    // Clear selected customer when user edits
    if (selectedCustomer && (field === 'phone' || field === 'fullName')) {
      setSelectedCustomer(null)
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
        addressLine: '',
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

      // Call parent submit with saved customer
      await onSubmit({
        ...customerData,
        customer: savedCustomer,
        orderInstructions: formData.instructions
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
        <div className="bg-gradient-to-r from-purple-600 to-blue-600 p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">
                  Customer Info
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
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500'
              } ${errors.phone ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
              placeholder="03001234567"
            />
            {errors.phone && (
              <p className="text-red-500 text-xs mt-1 font-medium">{errors.phone}</p>
            )}
          </div>

          {/* Full Name */}
          <div className="relative">
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <User className="w-4 h-4 mr-2 text-purple-500" />
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
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500'
              } ${errors.fullName ? 'border-red-500' : ''} focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
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
                <div className={`p-2 border-b ${isDark ? 'bg-purple-900/20 border-gray-700' : 'bg-purple-50 border-gray-200'}`}>
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
                          ? 'bg-purple-700 border-gray-700'
                          : 'bg-purple-100 border-gray-100'
                        : isDark
                        ? 'hover:bg-gray-700 border-gray-700'
                        : 'hover:bg-gray-50 border-gray-100'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                        selectedSuggestionIndex === index
                          ? isDark ? 'bg-purple-800' : 'bg-purple-200'
                          : isDark ? 'bg-purple-900/40' : 'bg-purple-100'
                      }`}>
                        <User className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
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
                          ? isDark ? 'text-purple-300' : 'text-purple-700'
                          : isDark ? 'text-purple-400' : 'text-purple-600'
                      }`} />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Special Instructions */}
          <div>
            <label className={`block text-sm font-semibold mb-2 flex items-center ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>
              <FileText className="w-4 h-4 mr-2 text-orange-500" />
              Special Instructions
              <span className={`ml-2 text-xs font-normal ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>(Optional)</span>
            </label>
            <textarea
              ref={instructionsRef}
              value={formData.instructions}
              onChange={(e) => handleInputChange('instructions', e.target.value)}
              onKeyDown={handleKeyDown}
              rows={3}
              className={`w-full px-4 py-3 rounded-lg border-2 resize-none transition-all ${
                isDark
                  ? 'bg-gray-800 border-gray-700 text-white focus:border-purple-500'
                  : 'bg-gray-50 border-gray-200 text-gray-900 focus:border-purple-500'
              } focus:outline-none focus:ring-2 focus:ring-purple-500/20`}
              placeholder="Any special requests or notes..."
            />
          </div>

          {/* Helper Text */}
          <div className={`text-center text-xs p-3 rounded-lg ${
            isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-600'
          }`}>
            <p>Type phone or name to search</p>
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
              className={`flex-[2] px-5 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold rounded-lg transition-all shadow-lg ${isSaving ? 'opacity-50 cursor-not-allowed' : 'hover:from-purple-700 hover:to-blue-700'}`}
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