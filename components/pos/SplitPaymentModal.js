'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  DollarSign,
  Smartphone,
  Building,
  User,
  Check,
  AlertTriangle
} from 'lucide-react'
import { themeManager } from '../../lib/themeManager'

/**
 * Fast Split Payment Modal - Optimized for Peak Hours
 * All payment methods visible at once - just enter amounts!
 */
export default function SplitPaymentModal({
  isOpen,
  onClose,
  totalAmount,
  amountDue,
  onPaymentComplete,
  customer = null,
  title = 'Split Payment'
}) {
  // Single state object for all payment amounts
  const [amounts, setAmounts] = useState({
    Cash: '',
    EasyPaisa: '',
    JazzCash: '',
    Bank: '',
    Account: ''
  })

  const [errors, setErrors] = useState({})
  const [isProcessing, setIsProcessing] = useState(false)

  const isDark = themeManager.isDark()
  const classes = themeManager.getClasses()

  // Payment methods with icons
  const paymentMethods = [
    {
      id: 'Cash',
      name: 'Cash',
      icon: DollarSign,
      color: 'bg-green-500',
      borderColor: 'border-green-500',
      focusRing: 'focus:ring-green-500'
    },
    {
      id: 'EasyPaisa',
      name: 'EasyPaisa',
      icon: Smartphone,
      color: 'bg-green-600',
      borderColor: 'border-green-600',
      focusRing: 'focus:ring-green-600'
    },
    {
      id: 'JazzCash',
      name: 'JazzCash',
      icon: Smartphone,
      color: 'bg-orange-500',
      borderColor: 'border-orange-500',
      focusRing: 'focus:ring-orange-500'
    },
    {
      id: 'Bank',
      name: 'Meezan Bank',
      icon: Building,
      color: 'bg-blue-500',
      borderColor: 'border-blue-500',
      focusRing: 'focus:ring-blue-500'
    },
    {
      id: 'Account',
      name: 'Customer Account',
      icon: User,
      color: 'bg-purple-500',
      borderColor: 'border-purple-500',
      focusRing: 'focus:ring-purple-500',
      disabled: !customer
    }
  ]

  // Reset when modal opens
  useEffect(() => {
    if (isOpen) {
      setAmounts({
        Cash: '',
        EasyPaisa: '',
        JazzCash: '',
        Bank: '',
        Account: ''
      })
      setErrors({})
    }
  }, [isOpen])

  // Calculate total entered
  const totalEntered = Object.values(amounts).reduce((sum, val) => {
    return sum + (parseFloat(val) || 0)
  }, 0)

  const remaining = (amountDue || 0) - totalEntered

  // Update amount with validation
  const updateAmount = (method, value) => {
    // Don't allow negative values
    if (parseFloat(value) < 0) return

    // Calculate what the total would be if we set this value
    const otherAmounts = Object.entries(amounts)
      .filter(([key]) => key !== method)
      .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0)

    const newTotal = otherAmounts + (parseFloat(value) || 0)

    // Don't allow total to exceed order amount (with small tolerance for rounding)
    if (newTotal > (amountDue || 0) + 0.01) {
      // Set error
      setErrors(prev => ({
        ...prev,
        total: `Cannot exceed order total of Rs ${(amountDue || 0).toFixed(2)}`
      }))
      return
    }

    setAmounts(prev => ({
      ...prev,
      [method]: value
    }))

    // Clear error
    if (errors[method]) {
      const newErrors = { ...errors }
      delete newErrors[method]
      setErrors(newErrors)
    }
  }

  // Disable input if already fully paid
  const isFieldDisabled = (method) => {
    const methodAmount = parseFloat(amounts[method]) || 0
    const paymentMethod = paymentMethods.find(m => m.id === method)

    // Disabled if payment method itself is disabled (e.g., Account without customer)
    if (paymentMethod?.disabled) return true

    // Disabled if already fully paid and this field is empty
    if (Math.abs(remaining) < 0.01 && methodAmount === 0) return true

    return false
  }

  // Validate
  const validateForm = () => {
    const newErrors = {}

    // Check if at least one amount is entered
    const hasAnyAmount = Object.values(amounts).some(val => parseFloat(val) > 0)
    if (!hasAnyAmount) {
      newErrors.general = 'Please enter at least one payment amount'
    }

    // Check if total matches
    if (Math.abs(remaining) > 0.01) {
      newErrors.total = remaining > 0
        ? `Still need Rs ${remaining.toFixed(2)}`
        : `Overpaid by Rs ${Math.abs(remaining).toFixed(2)}`
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Submit
  const handleSubmit = async () => {
    if (!validateForm()) return

    setIsProcessing(true)

    try {
      // Build payments array from non-zero amounts
      const payments = Object.entries(amounts)
        .filter(([method, amount]) => parseFloat(amount) > 0)
        .map(([method, amount]) => ({
          method,
          amount: parseFloat(amount),
          reference: null,
          notes: null
        }))

      await onPaymentComplete(payments)
      onClose()
    } catch (error) {
      console.error('Payment error:', error)
      setErrors({ submit: error.message || 'Failed to process payment' })
    } finally {
      setIsProcessing(false)
    }
  }

  // Handle Enter key to submit
  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && Math.abs(remaining) < 0.01) {
      handleSubmit()
    }
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`relative ${classes.card} rounded-3xl shadow-2xl w-full max-w-3xl`}
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-orange-500 to-orange-600 px-8 py-5 rounded-t-3xl">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-white">{title}</h2>
                <p className="text-orange-100 text-base mt-1">
                  Order Total: <span className="font-bold text-white">Rs {(amountDue || 0).toFixed(2)}</span>
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-white/20 transition-colors"
              >
                <X className="w-6 h-6 text-white" />
              </button>
            </div>
          </div>

          {/* Body - All Payment Methods */}
          <div className="px-8 py-6">
            <div className="grid grid-cols-5 gap-4 mb-6">
              {paymentMethods.map((method) => {
                const hasAmount = parseFloat(amounts[method.id]) > 0
                const isDisabled = method.disabled

                const fieldDisabled = isFieldDisabled(method.id)

                return (
                  <div key={method.id} className="text-center">
                    {/* Icon & Label */}
                    <div className={`mb-3 ${fieldDisabled ? 'opacity-40' : ''}`}>
                      <div className={`w-12 h-12 ${method.color} rounded-full flex items-center justify-center mx-auto mb-2 ${
                        hasAmount ? 'ring-4 ring-offset-2 ' + method.borderColor.replace('border-', 'ring-') : ''
                      }`}>
                        <method.icon className="w-6 h-6 text-white" />
                      </div>
                      <p className={`text-xs font-semibold ${classes.textPrimary}`}>
                        {method.name}
                      </p>
                    </div>

                    {/* Amount Input */}
                    <div className="relative">
                      <input
                        type="number"
                        value={amounts[method.id]}
                        onChange={(e) => updateAmount(method.id, e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={fieldDisabled}
                        placeholder="0"
                        step="0.01"
                        min="0"
                        className={`w-full px-2 py-3 text-center text-lg font-bold ${classes.input} rounded-xl border-2 transition-all ${
                          fieldDisabled
                            ? 'bg-gray-100 cursor-not-allowed opacity-50'
                            : hasAmount
                            ? method.borderColor + ' ' + method.focusRing + ' ring-2'
                            : 'border-gray-300 focus:ring-2 ' + method.focusRing
                        }`}
                      />
                      {hasAmount && (
                        <div className={`absolute -top-1 -right-1 w-5 h-5 ${method.color} rounded-full flex items-center justify-center`}>
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Summary Bar */}
            <div className={`rounded-2xl p-5 ${
              Math.abs(remaining) < 0.01
                ? isDark ? 'bg-green-900/30 border-2 border-green-500' : 'bg-green-50 border-2 border-green-400'
                : isDark ? 'bg-orange-900/30 border-2 border-orange-500' : 'bg-orange-50 border-2 border-orange-400'
            }`}>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className={`text-xs ${classes.textSecondary} mb-1`}>Order Total</p>
                  <p className={`text-xl font-bold ${classes.textPrimary}`}>
                    Rs {(amountDue || 0).toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${classes.textSecondary} mb-1`}>You Entered</p>
                  <p className={`text-xl font-bold ${classes.textPrimary}`}>
                    Rs {totalEntered.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className={`text-xs ${classes.textSecondary} mb-1`}>Remaining</p>
                  <p className={`text-xl font-bold ${
                    Math.abs(remaining) < 0.01 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    Rs {remaining.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>

            {/* Error Messages */}
            {(errors.general || errors.total || errors.submit) && (
              <div className={`mt-4 p-4 rounded-xl ${isDark ? 'bg-red-900/20' : 'bg-red-50'} border-2 border-red-500`}>
                <div className="flex items-center text-red-600">
                  <AlertTriangle className="w-5 h-5 mr-2 flex-shrink-0" />
                  <span className="font-semibold">
                    {errors.general || errors.total || errors.submit}
                  </span>
                </div>
              </div>
            )}

            {/* Helpful Tip */}
            {!errors.general && !errors.total && (
              <p className={`text-center text-xs ${classes.textSecondary} mt-4`}>
                <strong>Tip:</strong> Enter amounts in any payment methods to split the total. Fields lock once total is reached.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className={`px-8 py-5 ${classes.border} border-t rounded-b-3xl bg-gradient-to-r ${
            isDark ? 'from-gray-800 to-gray-900' : 'from-gray-50 to-gray-100'
          }`}>
            <div className="flex items-center justify-end space-x-4">
              <button
                onClick={onClose}
                disabled={isProcessing}
                className="px-8 py-3 rounded-xl font-semibold transition-all bg-gray-300 hover:bg-gray-400 text-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isProcessing || Math.abs(remaining) > 0.01}
                className={`px-10 py-3 rounded-xl font-semibold text-lg transition-all flex items-center ${
                  isProcessing || Math.abs(remaining) > 0.01
                    ? 'bg-gray-400 text-gray-600 cursor-not-allowed'
                    : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg hover:shadow-xl transform hover:scale-105'
                }`}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Check className="w-6 h-6 mr-2" />
                    Complete Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
