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
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'

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
  const [amounts, setAmounts] = useState({})
  const [errors, setErrors] = useState({})
  const [isProcessing, setIsProcessing] = useState(false)
  const [cashierAccounts, setCashierAccounts] = useState([])

  const isDark = themeManager.isDark()
  const classes = themeManager.getClasses()

  // Load payment accounts — cashier's own till when drawer is ON, admin accounts otherwise
  useEffect(() => {
    const cashier = authManager.getCashier()
    const currentUser = authManager.getCurrentUser()
    const userId = currentUser?.id
    if (!userId) return

    const drawerEnabled = currentUser?.use_cashier_drawer === true ||
      (() => { try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false } })()

    if (drawerEnabled && cashier?.id) {
      supabase.from('payment_accounts').select('*')
        .eq('user_id', userId).eq('cashier_id', cashier.id).eq('is_active', true).order('sort_order')
        .then(({ data }) => { if (data?.length > 0) setCashierAccounts(data) })
    } else {
      supabase.from('payment_accounts').select('*')
        .eq('user_id', userId).is('cashier_id', null).eq('is_active', true).order('sort_order')
        .then(({ data }) => { if (data?.length > 0) setCashierAccounts(data) })
    }
  }, [])

  // Format currency — show decimals only when needed
  const fmtRs = (v) => {
    const n = parseFloat(v) || 0
    return n % 1 === 0 ? `Rs ${n}` : `Rs ${n.toFixed(2)}`
  }

  const METHOD_KEY_UI = {
    cash:      { icon: DollarSign, color: 'bg-green-500',  borderColor: 'border-green-500',  focusRing: 'focus:ring-green-500' },
    easypaisa: { icon: Smartphone, color: 'bg-green-600',  borderColor: 'border-green-600',  focusRing: 'focus:ring-green-600' },
    jazzcash:  { icon: Smartphone, color: 'bg-orange-500', borderColor: 'border-orange-500', focusRing: 'focus:ring-orange-500' },
    bank:      { icon: Building,   color: 'bg-blue-500',   borderColor: 'border-blue-500',   focusRing: 'focus:ring-blue-500'  },
  }
  const DEFAULT_SPLIT_UI = { icon: User, color: 'bg-indigo-500', borderColor: 'border-indigo-500', focusRing: 'focus:ring-indigo-500' }

  const tillMethods = cashierAccounts.length > 0
    ? cashierAccounts.map(acct => ({
        id: acct.name,
        name: acct.name,
        ...(METHOD_KEY_UI[acct.payment_method_key] || DEFAULT_SPLIT_UI),
      }))
    : [
        { id: 'Cash',      name: 'Cash',      icon: DollarSign, color: 'bg-green-500',  borderColor: 'border-green-500',  focusRing: 'focus:ring-green-500' },
        { id: 'EasyPaisa', name: 'EasyPaisa', icon: Smartphone, color: 'bg-green-600',  borderColor: 'border-green-600',  focusRing: 'focus:ring-green-600' },
        { id: 'JazzCash',  name: 'JazzCash',  icon: Smartphone, color: 'bg-orange-500', borderColor: 'border-orange-500', focusRing: 'focus:ring-orange-500' },
        { id: 'Bank',      name: 'Bank',      icon: Building,   color: 'bg-blue-500',   borderColor: 'border-blue-500',   focusRing: 'focus:ring-blue-500'  },
      ]

  const paymentMethods = [
    ...tillMethods,
    { id: 'Account', name: 'Customer Account', icon: User, color: 'bg-purple-500', borderColor: 'border-purple-500', focusRing: 'focus:ring-purple-500', disabled: !customer },
  ]

  // Reset amounts when modal opens or accounts load — keys are the method names
  useEffect(() => {
    if (isOpen) {
      const initial = {}
      tillMethods.forEach(m => { initial[m.id] = '' })
      initial['Account'] = ''
      setAmounts(initial)
      setErrors({})
    }
  }, [isOpen, cashierAccounts])

  // Calculate total entered
  const totalEntered = Object.values(amounts).reduce((sum, val) => {
    return sum + (parseFloat(val) || 0)
  }, 0)

  const orderTotal = parseFloat((amountDue || 0).toFixed(2))
  const remaining = orderTotal - totalEntered

  // Update amount with validation
  const updateAmount = (method, value) => {
    // Don't allow negative values
    if (parseFloat(value) < 0) return

    // Calculate what the total would be if we set this value
    const otherAmounts = Object.entries(amounts)
      .filter(([key]) => key !== method)
      .reduce((sum, [, val]) => sum + (parseFloat(val) || 0), 0)

    const newTotal = otherAmounts + (parseFloat(value) || 0)

    // Don't allow total to exceed order amount
    if (newTotal > (amountDue || 0) + 0.5) {
      setErrors(prev => ({
        ...prev,
        total: `Cannot exceed order total of ${fmtRs(amountDue)}`
      }))
      return
    }

    setAmounts(prev => ({
      ...prev,
      [method]: value
    }))

    // Clear errors when value changes
    setErrors(prev => {
      const next = { ...prev }
      delete next[method]
      delete next.total
      return next
    })
  }

  // Disable input if already fully paid
  const isFieldDisabled = (method) => {
    const methodAmount = parseFloat(amounts[method]) || 0
    const paymentMethod = paymentMethods.find(m => m.id === method)

    // Disabled if payment method itself is disabled (e.g., Account without customer)
    if (paymentMethod?.disabled) return true

    // Disabled if already fully paid and this field is empty
    if (remaining <= 0 && methodAmount === 0) return true

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

    // Check if total matches (small tolerance for rounding)
    if (remaining > 0.5) {
      newErrors.total = `Still need ${fmtRs(remaining)}`
    } else if (remaining < -0.5) {
      newErrors.total = `Overpaid by ${fmtRs(Math.abs(remaining))}`
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
    if (e.key === 'Enter' && isComplete) {
      handleSubmit()
    }
  }

  if (!isOpen) return null

  const isComplete = Math.abs(remaining) < 1 && totalEntered > 0
  const totalUsed = Object.values(amounts).filter(v => parseFloat(v) > 0).length

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className={`relative ${isDark ? 'bg-gray-900' : 'bg-white'} rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden`}
        >
          {/* Header */}
          <div className={`px-6 py-4 flex items-center justify-between ${isDark ? 'border-gray-800' : 'border-gray-100'} border-b`}>
            <div>
              <h2 className={`text-lg font-bold ${classes.textPrimary}`}>{title}</h2>
              <p className={`text-xs ${classes.textSecondary} mt-0.5`}>
                Split <span className="font-bold text-green-600">{fmtRs(amountDue)}</span> across multiple methods
              </p>
            </div>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'} transition-colors`}
            >
              <X className={`w-5 h-5 ${classes.textSecondary}`} />
            </button>
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {/* Payment method rows */}
            <div className="space-y-2.5">
              {paymentMethods.map((method) => {
                const hasAmount = parseFloat(amounts[method.id]) > 0
                const fieldDisabled = isFieldDisabled(method.id)

                return (
                  <div
                    key={method.id}
                    className={`flex items-center gap-3 p-2.5 rounded-xl transition-all duration-150 ${
                      hasAmount
                        ? isDark ? 'bg-gray-800 ring-1 ring-green-500/30' : 'bg-green-50/50 ring-1 ring-green-200'
                        : fieldDisabled
                        ? 'opacity-35'
                        : isDark ? 'bg-gray-800/50 hover:bg-gray-800' : 'bg-gray-50 hover:bg-gray-100'
                    }`}
                  >
                    {/* Icon */}
                    <div className={`w-9 h-9 ${method.color} rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      <method.icon className="w-4.5 h-4.5 text-white" style={{ width: 18, height: 18 }} />
                    </div>

                    {/* Label */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${classes.textPrimary} leading-tight`}>{method.name}</p>
                      {method.disabled && (
                        <p className={`text-[9px] ${isDark ? 'text-red-400' : 'text-red-500'}`}>No customer selected</p>
                      )}
                    </div>

                    {/* Amount Input */}
                    <div className="relative w-36">
                      <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-medium ${
                        hasAmount ? (isDark ? 'text-green-400' : 'text-green-600') : classes.textSecondary
                      }`}>Rs</span>
                      <input
                        type="number"
                        value={amounts[method.id]}
                        onChange={(e) => updateAmount(method.id, e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={fieldDisabled}
                        placeholder="0"
                        step="1"
                        min="0"
                        className={`w-full pl-9 pr-3 py-2 text-right text-sm font-bold rounded-lg border transition-all ${
                          fieldDisabled
                            ? `cursor-not-allowed ${isDark ? 'bg-gray-900 border-gray-700 text-gray-600' : 'bg-gray-100 border-gray-200 text-gray-400'}`
                            : hasAmount
                            ? `${isDark ? 'bg-gray-900 border-green-500 text-green-400' : 'bg-white border-green-400 text-green-700'} focus:ring-2 focus:ring-green-500/30`
                            : `${isDark ? 'bg-gray-900 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'} focus:ring-2 focus:ring-purple-500/30 focus:border-purple-400`
                        }`}
                      />
                      {hasAmount && (
                        <div className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center shadow-sm">
                          <Check className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Progress + Summary */}
            <div className="mt-5">
              {/* Progress bar */}
              <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-gray-200'}`}>
                <motion.div
                  className={`h-full rounded-full ${isComplete ? 'bg-green-500' : 'bg-purple-500'}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min((totalEntered / (amountDue || 1)) * 100, 100)}%` }}
                  transition={{ type: 'spring', damping: 20 }}
                />
              </div>

              {/* Summary row */}
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-4">
                  <div>
                    <p className={`text-[9px] uppercase tracking-wider ${classes.textSecondary}`}>Entered</p>
                    <p className={`text-base font-bold ${classes.textPrimary}`}>{fmtRs(totalEntered)}</p>
                  </div>
                  <div className={`w-px h-8 ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  <div>
                    <p className={`text-[9px] uppercase tracking-wider ${classes.textSecondary}`}>Remaining</p>
                    <p className={`text-base font-bold ${isComplete ? 'text-green-500' : 'text-orange-500'}`}>
                      {isComplete ? 'Fully Paid' : fmtRs(remaining)}
                    </p>
                  </div>
                </div>
                <div className={`text-[10px] font-medium px-2 py-1 rounded-full ${
                  isComplete
                    ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                    : isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-100 text-gray-500'
                }`}>
                  {totalUsed} method{totalUsed !== 1 ? 's' : ''} used
                </div>
              </div>
            </div>

            {/* Error */}
            {(errors.general || errors.total || errors.submit) && (
              <div className={`mt-4 flex items-center gap-2 p-3 rounded-xl text-xs font-medium ${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-600'}`}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {errors.general || errors.total || errors.submit}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 flex items-center justify-end gap-3 ${isDark ? 'border-gray-800 bg-gray-900/50' : 'border-gray-100 bg-gray-50/50'} border-t`}>
            <button
              onClick={onClose}
              disabled={isProcessing}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isDark ? 'text-gray-400 hover:bg-gray-800' : 'text-gray-600 hover:bg-gray-200'
              }`}
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isProcessing || !isComplete}
              className={`px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all duration-200 ${
                isProcessing || !isComplete
                  ? isDark ? 'bg-gray-800 text-gray-500 cursor-not-allowed' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white shadow-lg shadow-green-500/20'
              }`}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white/30 border-t-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Complete Split Payment
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
