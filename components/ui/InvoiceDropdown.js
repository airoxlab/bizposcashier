// components/ui/InvoiceDropdown.js
'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Check, CreditCard, AlertCircle } from 'lucide-react'

const invoiceOptions = [
  {
    value: 'paid',
    label: 'Paid',
    description: 'Invoice has been paid',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    icon: Check
  },
  {
    value: 'unpaid',
    label: 'Unpaid',
    description: 'Invoice is pending payment',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    icon: AlertCircle
  }
]

export default function InvoiceDropdown({ value, onChange, disabled = false, isDark = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef(null)

  const selectedOption = invoiceOptions.find(option => option.value === value) || invoiceOptions[1]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleSelect = (optionValue) => {
    onChange(optionValue)
    setIsOpen(false)
  }

  const SelectedIcon = selectedOption.icon

  return (
    <div ref={dropdownRef} className="relative">
      <motion.button
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`w-full pl-12 pr-10 py-3 text-left rounded-lg border transition-all duration-200 flex items-center justify-between ${
          disabled 
            ? `cursor-not-allowed opacity-50 ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-300'}`
            : `cursor-pointer ${isDark 
                ? `bg-gray-800 border-gray-600 hover:border-gray-500 text-gray-100` 
                : `bg-white border-gray-300 hover:border-gray-400 text-gray-900`
              }`
        } ${isOpen ? 'ring-2 ring-purple-200 border-purple-500' : ''}`}
      >
        <div className="flex items-center space-x-3">
          <SelectedIcon className={`w-5 h-5 ${selectedOption.color}`} />
          <div>
            <div className={`font-medium ${isDark ? 'text-gray-100' : 'text-gray-900'}`}>
              {selectedOption.label}
            </div>
            <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              {selectedOption.description}
            </div>
          </div>
        </div>
        <ChevronDown 
          className={`w-5 h-5 transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          } ${isDark ? 'text-gray-400' : 'text-gray-500'}`} 
        />
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`absolute z-50 w-full mt-2 rounded-lg border shadow-lg ${
              isDark 
                ? 'bg-gray-800 border-gray-600' 
                : 'bg-white border-gray-200'
            }`}
          >
            <div className="py-2">
              {invoiceOptions.map((option) => {
                const IconComponent = option.icon
                const isSelected = option.value === value
                
                return (
                  <motion.button
                    key={option.value}
                    whileHover={{ backgroundColor: isDark ? 'rgba(107, 114, 128, 0.1)' : 'rgba(107, 114, 128, 0.05)' }}
                    onClick={() => handleSelect(option.value)}
                    className={`w-full px-4 py-3 text-left flex items-center space-x-3 transition-colors ${
                      isSelected 
                        ? isDark 
                          ? 'bg-purple-900/20 text-purple-400' 
                          : 'bg-purple-50 text-purple-700'
                        : isDark 
                          ? 'text-gray-100 hover:bg-gray-700' 
                          : 'text-gray-900 hover:bg-gray-50'
                    }`}
                  >
                    <IconComponent className={`w-5 h-5 ${
                      isSelected 
                        ? isDark ? 'text-purple-400' : 'text-purple-600'
                        : option.color
                    }`} />
                    <div className="flex-1">
                      <div className={`font-medium ${
                        isSelected 
                          ? isDark ? 'text-purple-400' : 'text-purple-700'
                          : isDark ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {option.label}
                      </div>
                      <div className={`text-xs ${
                        isSelected 
                          ? isDark ? 'text-purple-300' : 'text-purple-600'
                          : isDark ? 'text-gray-400' : 'text-gray-500'
                      }`}>
                        {option.description}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className={`w-4 h-4 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hidden input for form compatibility */}
      <input type="hidden" name="invoice_status" value={value} />
      
      {/* Icon positioned absolutely */}
      <CreditCard className={`absolute left-3 top-3 w-5 h-5 pointer-events-none ${
        isDark ? 'text-gray-400' : 'text-gray-500'
      }`} />
    </div>
  )
}