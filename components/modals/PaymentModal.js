'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  DollarSign,
  Smartphone,
  Building,
  Clock,
  CheckCircle,
  AlertTriangle,
  Percent,
  Tag
} from 'lucide-react'
import Image from 'next/image'

export default function PaymentModal({
  isOpen,
  onClose,
  order,
  onPaymentComplete,
  classes,
  isDark
}) {
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [cashAmount, setCashAmount] = useState('')
  const [changeAmount, setChangeAmount] = useState(0)
  const [isProcessing, setIsProcessing] = useState(false)

  // Smart Discount States
  const [showDiscountSection, setShowDiscountSection] = useState(false)
  const [discountType, setDiscountType] = useState('percentage')
  const [discountValue, setDiscountValue] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [originalSubtotal, setOriginalSubtotal] = useState(0)

  const paymentMethods = [
    {
      id: 'cash',
      name: 'Cash',
      icon: DollarSign,
      color: 'from-green-500 to-green-600',
      requiresAmount: true,
      logo: null
    },
    {
      id: 'easypaisa',
      name: 'EasyPaisa',
      icon: Smartphone,
      color: 'from-green-600 to-green-700',
      requiresAmount: false,
      logo: '/images/Easypaisa-logo.png'
    },
    {
      id: 'jazzcash',
      name: 'JazzCash',
      icon: Smartphone,
      color: 'from-orange-500 to-red-600',
      requiresAmount: false,
      logo: '/images/new-Jazzcash-logo.png'
    },
    {
      id: 'bank',
      name: 'Bank',
      displayName: 'Meezan Bank',
      icon: Building,
      color: 'from-blue-500 to-indigo-600',
      requiresAmount: false,
      logo: '/images/meezan-bank-logo.png'
    }
  ]

  useEffect(() => {
    if (order) {
      setOriginalSubtotal(order.subtotal || order.total_amount)
      setCashAmount((order.total_amount || 0).toString())
      setChangeAmount(0)
    }
  }, [order])

  // Calculate discount amount
  const calculateDiscount = () => {
    if (!discountValue || !originalSubtotal) return 0

    if (discountType === 'percentage') {
      return (originalSubtotal * discountValue) / 100
    } else {
      return Math.min(discountValue, originalSubtotal)
    }
  }

  // Update discount when value changes
  useEffect(() => {
    const newDiscountAmount = calculateDiscount()
    setDiscountAmount(newDiscountAmount)

    if (order) {
      const newTotal = Math.max(0, originalSubtotal - newDiscountAmount)
      setCashAmount(newTotal.toString())
    }
  }, [discountType, discountValue, originalSubtotal])

  const handleDiscountValueChange = (value) => {
    const numValue = Math.max(0, parseFloat(value) || 0)

    if (discountType === 'percentage') {
      setDiscountValue(Math.min(100, numValue))
    } else {
      setDiscountValue(Math.min(originalSubtotal, numValue))
    }
  }

  const removeDiscount = () => {
    setDiscountType('percentage')
    setDiscountValue(0)
    setDiscountAmount(0)
  }

  // Generate smart quick amounts based on total
  const generateQuickAmounts = (total) => {
    const roundedTotal = Math.ceil(total)
    const amounts = new Set([roundedTotal])

    const commonAmounts = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000]

    amounts.add(roundedTotal + 50)
    amounts.add(roundedTotal + 100)
    amounts.add(roundedTotal + 500)

    commonAmounts.forEach(amount => {
      if (amount > total) {
        amounts.add(amount)
      }
    })

    return Array.from(amounts).sort((a, b) => a - b).slice(0, 8)
  }

  const getCurrentTotal = () => {
    // Get loyalty discount from order
    const loyaltyDiscount = order?.loyalty_discount_amount || order?.loyaltyDiscountAmount || 0
    return Math.max(0, originalSubtotal - discountAmount - loyaltyDiscount)
  }

  const quickAmounts = order ? generateQuickAmounts(getCurrentTotal()) : []

  const handlePaymentMethodSelect = (method) => {
    setSelectedPaymentMethod(method)
    if (!method.requiresAmount) {
      setCashAmount('')
      setChangeAmount(0)
    } else {
      setCashAmount(getCurrentTotal().toString())
      setChangeAmount(0)
    }
  }

  const handleQuickAmount = (amount) => {
    if (selectedPaymentMethod?.requiresAmount) {
      setCashAmount(amount.toString())
      const change = amount - getCurrentTotal()
      setChangeAmount(change > 0 ? change : 0)
    }
  }

  const handleCashAmountChange = (amount) => {
    setCashAmount(amount)
    const numericAmount = parseFloat(amount) || 0
    const change = numericAmount - getCurrentTotal()
    setChangeAmount(change > 0 ? change : 0)
  }

  const canProcessPayment = () => {
    if (!selectedPaymentMethod) return false
    if (selectedPaymentMethod.requiresAmount) {
      return parseFloat(cashAmount) >= getCurrentTotal()
    }
    return true
  }

  const handlePayment = async () => {
    if (!canProcessPayment()) return

    setIsProcessing(true)

    try {
      const paymentData = {
        paymentMethod: selectedPaymentMethod.name,
        cashReceived: selectedPaymentMethod.requiresAmount ? parseFloat(cashAmount) : null,
        changeAmount: selectedPaymentMethod.requiresAmount ? changeAmount : 0,
        discountType,
        discountValue,
        discountAmount,
        newTotal: getCurrentTotal()
      }

      await onPaymentComplete(paymentData)
      onClose()
    } catch (error) {
      console.error('Payment error:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!isOpen || !order) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          className={`${classes.card} rounded-2xl ${classes.shadow} shadow-2xl w-full h-[95vh] flex flex-col overflow-hidden`}
          style={{ maxWidth: '1400px' }}
        >
          {/* Compact Header */}
          <div className={`${classes.card} ${classes.border} border-b px-6 py-3 flex items-center justify-between`}>
            <div>
              <h2 className={`text-xl font-bold ${classes.textPrimary}`}>Complete Payment</h2>
              <p className={`text-sm ${classes.textSecondary}`}>
                Order Total: <span className="font-bold">Rs {getCurrentTotal().toFixed(2)}</span> • Items: {(order.cart || []).length}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <div className={`text-sm font-bold px-3 py-1 rounded ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
                {(order.orderType || 'WALKIN').toUpperCase()}
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${classes.button} hover:bg-red-500 hover:text-white transition-colors`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Two Column Grid Layout - No Scrolling */}
          <div className="flex-1 grid grid-cols-[55%_45%] gap-4 p-4 overflow-hidden">

            {/* LEFT COLUMN - Payment Controls */}
            <div className="flex flex-col gap-3 overflow-hidden">

              {/* Smart Discount Section - Compact */}
              <div className={`${classes.card} rounded-lg ${classes.shadow} shadow-sm ${classes.border} border p-3`}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`text-sm font-bold ${classes.textPrimary} flex items-center`}>
                    <Tag className="w-4 h-4 mr-1.5 text-purple-600" />
                    Smart Discount
                  </h3>
                  <button
                    onClick={() => setShowDiscountSection(!showDiscountSection)}
                    className={`px-2 py-1 rounded text-xs font-medium ${classes.button} transition-all`}
                  >
                    {showDiscountSection ? 'Hide' : 'Add Discount'}
                  </button>
                </div>

                {showDiscountSection && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                          Type
                        </label>
                        <select
                          value={discountType}
                          onChange={(e) => {
                            setDiscountType(e.target.value)
                            setDiscountValue(0)
                          }}
                          className={`w-full px-2 py-1.5 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                        >
                          <option value="percentage">%</option>
                          <option value="fixed">Rs</option>
                        </select>
                      </div>

                      <div>
                        <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                          Value
                        </label>
                        <input
                          type="number"
                          value={discountValue || ''}
                          onChange={(e) => handleDiscountValueChange(e.target.value)}
                          placeholder="0"
                          className={`w-full px-2 py-1.5 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                        />
                      </div>

                      <div>
                        <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                          Amount
                        </label>
                        <div className={`px-2 py-1.5 text-xs ${isDark ? 'bg-green-900/20' : 'bg-green-50'} rounded border ${isDark ? 'border-green-700/30' : 'border-green-200'} font-bold text-green-600`}>
                          Rs {discountAmount.toFixed(0)}
                        </div>
                      </div>
                    </div>

                    {discountAmount > 0 && (
                      <button
                        onClick={removeDiscount}
                        className="flex items-center px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-xs"
                      >
                        <X className="w-3 h-3 mr-1" />
                        Remove
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Payment Methods - Compact */}
              <div className={`${classes.card} rounded-lg ${classes.shadow} shadow-sm ${classes.border} border p-3 flex-1 flex flex-col overflow-hidden`}>
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Select Payment Method</h3>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => handlePaymentMethodSelect(method)}
                      className={`p-3 rounded-lg transition-all border-2 ${
                        selectedPaymentMethod?.id === method.id
                          ? `border-purple-500 ${isDark ? 'bg-purple-900/20' : 'bg-purple-50'} shadow`
                          : `${classes.border} ${classes.card}`
                      }`}
                    >
                      {method.logo ? (
                        <div className="w-10 h-10 relative mb-1 mx-auto">
                          <Image
                            src={method.logo}
                            alt={method.name}
                            fill
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <div className={`w-10 h-10 bg-gradient-to-r ${method.color} rounded flex items-center justify-center mb-1 mx-auto`}>
                          <method.icon className="w-5 h-5 text-white" />
                        </div>
                      )}
                      <p className={`font-semibold text-xs text-center ${classes.textPrimary}`}>
                        {method.displayName || method.name}
                      </p>
                    </button>
                  ))}
                </div>

                {/* Unpaid Option */}
                <button
                  onClick={() => handlePaymentMethodSelect({ id: 'unpaid', name: 'Unpaid', requiresAmount: false })}
                  className={`p-3 rounded-lg transition-all border-2 mb-2 ${
                    selectedPaymentMethod?.id === 'unpaid'
                      ? `border-purple-500 ${isDark ? 'bg-purple-900/20' : 'bg-purple-50'} shadow`
                      : `${classes.border} ${classes.card}`
                  }`}
                >
                  <div className="flex items-center justify-center">
                    <Clock className={`w-5 h-5 mr-2 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                    <span className={`font-semibold text-sm ${classes.textPrimary}`}>Unpaid</span>
                  </div>
                </button>

                {/* Split Payment Button */}
                <button
                  onClick={() => {
                    onPaymentComplete({ useSplitPayment: true })
                    onClose()
                  }}
                  className="w-full py-3 rounded-lg border-2 border-orange-500 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow text-sm"
                >
                  <div className="flex items-center justify-center">
                    <DollarSign className="w-4 h-4 mr-1.5" />
                    Split Payment (Multiple Methods)
                  </div>
                  <p className="text-[10px] text-orange-100 mt-0.5">Pay using multiple payment methods (e.g., Rs 1000 Cash + Rs 960 EasyPaisa)</p>
                </button>
              </div>
            </div>
            {/* End LEFT COLUMN */}

            {/* RIGHT COLUMN - Order Summary & Cash Details */}
            <div className="flex flex-col gap-3 overflow-hidden">

              {/* Order Summary with Items */}
              <div className={`${classes.card} rounded-lg ${classes.shadow} shadow-sm ${classes.border} border p-3 flex-1 flex flex-col overflow-hidden`}>
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Order Summary</h3>

                {/* Items List - Scrollable */}
                <div className="flex-1 overflow-y-auto space-y-1.5 mb-2">
                  {(order.cart || []).map((item, index) => (
                    <div key={index} className={`p-2 rounded text-xs ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className={`font-semibold ${classes.textPrimary} truncate`}>{item.productName || item.dealName}</p>
                          {item.variantName && (
                            <p className={`text-[10px] ${classes.textSecondary}`}>{item.variantName}</p>
                          )}
                        </div>
                        <div className="text-right ml-2 flex-shrink-0">
                          <p className={`font-semibold ${classes.textPrimary}`}>Rs {item.totalPrice?.toFixed(0)}</p>
                          <p className={`text-[10px] ${classes.textSecondary}`}>{item.quantity} × Rs {item.finalPrice?.toFixed(0)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Totals - Fixed */}
                <div className={`border-t ${classes.border} pt-2 space-y-1`}>
                  <div className="flex justify-between text-xs">
                    <span className={classes.textSecondary}>Subtotal:</span>
                    <span className={`font-semibold ${classes.textPrimary}`}>Rs {originalSubtotal.toFixed(2)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className={`flex justify-between text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                      <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : `Rs ${discountValue}`}):</span>
                      <span className="font-semibold">-Rs {discountAmount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className={`flex justify-between font-bold ${classes.textPrimary} border-t ${classes.border} pt-1.5 mt-1`}>
                    <span className="text-sm">Total:</span>
                    <span className="text-lg text-green-600">Rs {getCurrentTotal().toFixed(2)}</span>
                  </div>

                  {/* Customer Info */}
                  {order.customer && (
                    <div className={`mt-2 p-2 rounded text-xs ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                      <p className={`font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Customer Details</p>
                      <p className={classes.textPrimary}>{order.customer.phone}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Cash Payment Details - Only when cash selected */}
              {selectedPaymentMethod?.requiresAmount && (
                <div className={`${classes.card} rounded-lg ${classes.shadow} shadow-sm ${classes.border} border p-3`}>
                  <h3 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Cash Payment Details</h3>

                  {/* Quick Amount Buttons */}
                  <div className="mb-2">
                    <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>Quick Amount Selection</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {quickAmounts.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => handleQuickAmount(amount)}
                          className={`p-1.5 rounded text-[10px] font-semibold transition-all ${
                            parseInt(cashAmount) === amount
                              ? 'bg-purple-600 text-white shadow'
                              : `${classes.button} ${classes.textPrimary}`
                          }`}
                        >
                          Rs {amount}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                        Cash Received
                      </label>
                      <input
                        type="number"
                        value={cashAmount}
                        onChange={(e) => handleCashAmountChange(e.target.value)}
                        className={`w-full px-2 py-1.5 text-sm ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                      />
                    </div>

                    <div>
                      <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                        Order Total
                      </label>
                      <div className={`px-2 py-1.5 text-sm ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded font-semibold ${classes.textPrimary}`}>
                        Rs {getCurrentTotal().toFixed(0)}
                      </div>
                    </div>

                    <div>
                      <label className={`block text-xs font-medium ${classes.textSecondary} mb-1`}>
                        Change
                      </label>
                      <div className={`px-2 py-1.5 text-sm rounded font-bold ${
                        changeAmount > 0
                          ? `${isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-600'}`
                          : `${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-500'}`
                      }`}>
                        Rs {changeAmount.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {/* Warnings */}
                  {cashAmount && parseFloat(cashAmount) < getCurrentTotal() && (
                    <div className={`mt-2 p-2 rounded border text-xs ${isDark ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-200'}`}>
                      <div className="flex items-center">
                        <AlertTriangle className={`w-3 h-3 mr-1.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                        <p className={`font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                          Need Rs {(getCurrentTotal() - parseFloat(cashAmount)).toFixed(0)} more
                        </p>
                      </div>
                    </div>
                  )}

                  {changeAmount > 0 && (
                    <div className={`mt-2 p-2 rounded border text-xs ${isDark ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-200'}`}>
                      <div className="flex items-center">
                        <CheckCircle className={`w-3 h-3 mr-1.5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                        <p className={`font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                          Change: Rs {changeAmount.toFixed(0)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* End RIGHT COLUMN */}

          </div>
          {/* End Two Column Grid */}

          {/* Footer - Action Buttons */}
          <div className={`${classes.card} ${classes.border} border-t px-6 py-3`}>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                className={`py-2.5 rounded-lg font-semibold text-sm ${classes.button} transition-all`}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={!canProcessPayment() || isProcessing}
                className={`py-2.5 rounded-lg font-semibold text-sm transition-all ${
                  canProcessPayment() && !isProcessing
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
                }`}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 inline mr-1.5" />
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

                <h3 className={`text-lg font-bold ${classes.textPrimary} mb-4`}>Cash Payment Details</h3>

                {/* Quick Amount Buttons */}
                <div className="mb-4">
                  <label className={`block text-sm font-medium ${classes.textSecondary} mb-2`}>
                    Quick Amount
                  </label>
                  <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handleQuickAmount(amount)}
                        className={`p-2 rounded-lg font-semibold transition-all text-xs ${
                          parseInt(cashAmount) === amount
                            ? 'bg-purple-600 text-white shadow-lg'
                            : `${classes.button} ${classes.textPrimary}`
                        }`}
                      >
                        Rs {amount}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${classes.textSecondary} mb-2`}>
                      Cash Received
                    </label>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => handleCashAmountChange(e.target.value)}
                      className={`w-full px-4 py-2 ${classes.input} rounded-lg focus:ring-2 focus:ring-purple-500`}
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${classes.textSecondary} mb-2`}>
                      Order Total
                    </label>
                    <div className={`px-4 py-2 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg font-semibold ${classes.textPrimary}`}>
                      Rs {getCurrentTotal().toFixed(2)}
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${classes.textSecondary} mb-2`}>
                      Change
                    </label>
                    <div className={`px-4 py-2 rounded-lg font-bold ${
                      changeAmount > 0
                        ? `${isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-600'}`
                        : `${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-gray-50 text-gray-500'}`
                    }`}>
                      Rs {changeAmount.toFixed(2)}
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {cashAmount && parseFloat(cashAmount) < getCurrentTotal() && (
                  <div className={`mt-3 p-3 rounded-lg border ${isDark ? 'bg-red-900/20 border-red-800/30' : 'bg-red-50 border-red-200'}`}>
                    <div className="flex items-center">
                      <AlertTriangle className={`w-4 h-4 mr-2 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                      <p className={`font-medium text-sm ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                        Insufficient! Need Rs {(getCurrentTotal() - parseFloat(cashAmount)).toFixed(2)} more.
                      </p>
                    </div>
                  </div>
                )}

                {changeAmount > 0 && (
                  <div className={`mt-3 p-3 rounded-lg border ${isDark ? 'bg-green-900/20 border-green-800/30' : 'bg-green-50 border-green-200'}`}>
                    <div className="flex items-center">
                      <CheckCircle className={`w-4 h-4 mr-2 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                      <p className={`font-medium text-sm ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                        Payment sufficient! Change: Rs {changeAmount.toFixed(2)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Order Summary */}
            <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-xl p-4 space-y-2`}>
              <div className="flex justify-between">
                <span className={classes.textSecondary}>Subtotal:</span>
                <span className={`font-semibold ${classes.textPrimary}`}>Rs {originalSubtotal.toFixed(2)}</span>
              </div>
              {discountAmount > 0 && (
                <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  <span>Discount ({discountType === 'percentage' ? `${discountValue}%` : `Rs ${discountValue}`}):</span>
                  <span className="font-semibold">-Rs {discountAmount.toFixed(2)}</span>
                </div>
              )}
              <div className={`flex justify-between text-xl font-bold ${classes.textPrimary} border-t ${classes.border} pt-2`}>
                <span>Total:</span>
                <span className="text-green-600">Rs {getCurrentTotal().toFixed(2)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className={`flex-1 py-3 rounded-xl font-semibold ${classes.button} transition-all`}
              >
                Cancel
              </button>
              <button
                onClick={handlePayment}
                disabled={!canProcessPayment() || isProcessing}
                className={`flex-1 py-3 rounded-xl font-semibold transition-all ${
                  canProcessPayment() && !isProcessing
                    ? 'bg-green-600 hover:bg-green-700 text-white'
                    : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
                }`}
              >
                {isProcessing ? (
                  <div className="flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Processing...
                  </div>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5 inline mr-2" />
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
