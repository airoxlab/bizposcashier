'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  DollarSign,
  Smartphone,
  Building,
  CheckCircle,
  CreditCard,
  AlertTriangle,
  Tag,
  X,
  ArrowLeft
} from 'lucide-react'
import Image from 'next/image'

export default function InlinePaymentSection({
  order,
  onPaymentComplete,
  onCancel,
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
      // Calculate the original subtotal (before any discounts)
      const orderSubtotal = order.subtotal || order.total_amount
      setOriginalSubtotal(orderSubtotal)

      // Check if order has existing discount
      const existingDiscount = order.discount_amount || 0
      const existingDiscountPercentage = order.discount_percentage || 0

      if (existingDiscount > 0) {
        console.log('📋 [InlinePayment] Order has existing discount:', {
          discount_amount: existingDiscount,
          discount_percentage: existingDiscountPercentage
        })

        // Set discount type and value based on what's in the order
        if (existingDiscountPercentage > 0) {
          setDiscountType('percentage')
          setDiscountValue(existingDiscountPercentage)
        } else {
          setDiscountType('fixed')
          setDiscountValue(existingDiscount)
        }
        setDiscountAmount(existingDiscount)
        setShowDiscountSection(true) // Show the discount section

        // Set cash amount to the total after discount
        setCashAmount((order.total_amount || 0).toString())
      } else {
        // No existing discount
        setCashAmount((order.total_amount || 0).toString())
        setDiscountValue(0)
        setDiscountAmount(0)
      }

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
      const deliveryCharges = order?.delivery_charges || 0
      const newTotal = Math.max(0, originalSubtotal - newDiscountAmount) + deliveryCharges
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

    const commonAmounts = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 5000]

    amounts.add(roundedTotal + 50)
    amounts.add(roundedTotal + 100)

    commonAmounts.forEach(amount => {
      if (amount > total) {
        amounts.add(amount)
      }
    })

    return Array.from(amounts).sort((a, b) => a - b).slice(0, 6)
  }

  const getCurrentTotal = () => {
    // Get loyalty discount from order
    const loyaltyDiscount = order?.loyalty_discount_amount || order?.loyaltyDiscountAmount || 0
    const deliveryCharges = order?.delivery_charges || 0
    return Math.max(0, originalSubtotal - discountAmount - loyaltyDiscount) + deliveryCharges
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

  const handlePayment = async (completeOrder = true) => {
    console.log('[DEBUG] handlePayment called', { completeOrder, canProcess: canProcessPayment(), selectedPaymentMethod: selectedPaymentMethod?.name })
    if (!canProcessPayment()) {
      console.log('[DEBUG] canProcessPayment() returned false — button disabled, returning early')
      return
    }

    setIsProcessing(true)

    try {
      const paymentData = {
        paymentMethod: selectedPaymentMethod.name,
        cashReceived: selectedPaymentMethod.requiresAmount ? parseFloat(cashAmount) : null,
        changeAmount: selectedPaymentMethod.requiresAmount ? changeAmount : 0,
        discountType,
        discountValue,
        discountAmount,
        newTotal: getCurrentTotal(),
        completeOrder
      }

      console.log('[DEBUG] calling onPaymentComplete with paymentData:', paymentData)
      await onPaymentComplete(paymentData)
      console.log('[DEBUG] onPaymentComplete finished')
    } catch (error) {
      console.error('[DEBUG] Payment error in handlePayment:', error)
    } finally {
      setIsProcessing(false)
    }
  }

  if (!order) return null

  return (
    <div className="flex-1 flex flex-col overflow-hidden h-screen">
      {/* Compact Header */}
      <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b px-4 py-2`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onCancel}
              className={`p-1.5 rounded-lg ${classes.button} hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className={`text-sm font-bold ${classes.textPrimary}`}>Complete Payment</h1>
              <p className={`text-xs ${classes.textSecondary}`}>
                Order Total: Rs {getCurrentTotal().toFixed(2)} • Items: {(order.order_items || []).length}
              </p>
            </div>
          </div>
          <div className={`text-sm font-bold px-3 py-1 rounded ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
            {order.order_type?.toUpperCase() || 'WALKIN'}
          </div>
        </div>
      </div>

      {/* Two Column Layout - NO SCROLLING */}
      <div className="flex-1 grid grid-cols-[60%_40%] gap-3 p-3 overflow-hidden">

        {/* LEFT COLUMN - Payment Controls */}
        <div className="flex flex-col gap-3 overflow-hidden">

          {/* Smart Discount Section */}
        <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border rounded-lg p-3`}>
          <div className="flex items-center justify-between mb-2">
            <h3 className={`text-xs font-bold ${classes.textPrimary} flex items-center`}>
              <Tag className="w-3.5 h-3.5 mr-1.5 text-purple-600" />
              Discount
            </h3>
            <button
              onClick={() => setShowDiscountSection(!showDiscountSection)}
              className={`px-2 py-1 rounded text-[10px] font-medium ${classes.button} transition-all`}
            >
              {showDiscountSection ? 'Hide' : 'Add'}
            </button>
          </div>

          {showDiscountSection && (
            <div className="space-y-2">
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Type</label>
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
                  <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Value</label>
                  <input
                    type="number"
                    value={discountValue || ''}
                    onChange={(e) => handleDiscountValueChange(e.target.value)}
                    placeholder="0"
                    className={`w-full px-2 py-1.5 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                  />
                </div>

                <div>
                  <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Amount</label>
                  <div className={`px-2 py-1.5 text-xs ${isDark ? 'bg-green-900/20' : 'bg-green-50'} rounded border ${isDark ? 'border-green-700/30' : 'border-green-200'} font-bold text-green-600`}>
                    Rs {discountAmount.toFixed(0)}
                  </div>
                </div>
              </div>

              {discountAmount > 0 && (
                <button
                  onClick={removeDiscount}
                  className="flex items-center px-2 py-1 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded text-[10px]"
                >
                  <X className="w-3 h-3 mr-1" />
                  Remove
                </button>
              )}
            </div>
          )}
        </div>

        {/* Payment Methods */}
        <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border rounded-lg p-3`}>
          <h3 className={`text-xs font-bold ${classes.textPrimary} mb-2`}>Payment Method</h3>
          <div className="grid grid-cols-4 gap-2">
            {paymentMethods.map((method) => (
              <button
                key={method.id}
                onClick={() => handlePaymentMethodSelect(method)}
                className={`p-2 rounded-lg transition-all border ${
                  selectedPaymentMethod?.id === method.id
                    ? `border-purple-500 ${isDark ? 'bg-purple-900/20' : 'bg-purple-50'} shadow`
                    : `${classes.border} ${classes.card}`
                }`}
              >
                {method.logo ? (
                  <div className="w-8 h-8 relative mb-1 mx-auto">
                    <Image
                      src={method.logo}
                      alt={method.name}
                      fill
                      className="object-contain"
                    />
                  </div>
                ) : (
                  <div className={`w-8 h-8 bg-gradient-to-r ${method.color} rounded flex items-center justify-center mb-1 mx-auto`}>
                    <method.icon className="w-4 h-4 text-white" />
                  </div>
                )}
                <p className={`font-semibold text-[10px] text-center ${classes.textPrimary}`}>
                  {method.displayName || method.name}
                </p>
              </button>
            ))}
          </div>

          {/* Split Payment Button */}
          <button
            onClick={() => {
              // Signal parent to show split payment modal
              onPaymentComplete({ useSplitPayment: true })
            }}
            className="w-full mt-2 py-2 rounded-lg border-2 border-orange-500 bg-gradient-to-r from-orange-500 to-orange-600 text-white font-bold hover:from-orange-600 hover:to-orange-700 transition-all shadow text-xs"
          >
            <div className="flex items-center justify-center">
              <DollarSign className="w-3.5 h-3.5 mr-1" />
              Split Payment
            </div>
          </button>
        </div>

        {/* Cash Amount Input */}
        {selectedPaymentMethod?.requiresAmount && (
          <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border rounded-lg p-3`}>
            <h3 className={`text-xs font-bold ${classes.textPrimary} mb-2`}>Cash Details</h3>

            {/* Quick Amount Buttons */}
            <div className="mb-2">
              <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Quick Amount</label>
              <div className="grid grid-cols-3 gap-1.5">
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
                <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Received</label>
                <input
                  type="number"
                  value={cashAmount}
                  onChange={(e) => handleCashAmountChange(e.target.value)}
                  className={`w-full px-2 py-1.5 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                />
              </div>

              <div>
                <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Total</label>
                <div className={`px-2 py-1.5 text-xs ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded font-semibold ${classes.textPrimary}`}>
                  Rs {getCurrentTotal().toFixed(0)}
                </div>
              </div>

              <div>
                <label className={`block text-[10px] font-medium ${classes.textSecondary} mb-1`}>Change</label>
                <div className={`px-2 py-1.5 text-xs rounded font-bold ${
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
                    Change: Rs {changeAmount.toFixed(2)}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
        </div>
        {/* End LEFT COLUMN */}

        {/* RIGHT COLUMN - Order Summary */}
        <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border rounded-lg p-3 flex flex-col overflow-hidden`}>
          <h3 className={`text-xs font-bold ${classes.textPrimary} mb-2`}>Order Summary</h3>

          {/* Order Items - Scrollable if needed */}
          <div className="flex-1 overflow-y-auto mb-3 space-y-1.5">
            {(order.order_items || []).map((item, index) => (
              <div key={index} className={`p-2 rounded text-xs ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <p className={`font-semibold ${classes.textPrimary}`}>{item.product_name}</p>
                    {item.variant_name && (
                      <p className={`text-[10px] ${classes.textSecondary}`}>{item.variant_name}</p>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <p className={`font-semibold ${classes.textPrimary}`}>Rs {item.total_price?.toFixed(0)}</p>
                    <p className={`text-[10px] ${classes.textSecondary}`}>{item.quantity} × Rs {item.final_price?.toFixed(0)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Totals Summary - Fixed at bottom */}
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
            {(order.loyalty_points_redeemed > 0 || order.loyaltyPointsRedeemed > 0) && (
              <div className={`flex justify-between text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                <span>Loyalty Points ({order.loyalty_points_redeemed || order.loyaltyPointsRedeemed} pts):</span>
                <span className="font-semibold">-Rs {(order.loyalty_discount_amount || order.loyaltyDiscountAmount || 0).toFixed(2)}</span>
              </div>
            )}
            {(order.delivery_charges || 0) > 0 && (
              <div className={`flex justify-between text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                <span>Delivery Charges:</span>
                <span className="font-semibold">+Rs {(order.delivery_charges || 0).toFixed(2)}</span>
              </div>
            )}
            <div className={`flex justify-between font-bold ${classes.textPrimary} border-t ${classes.border} pt-1.5 mt-1`}>
              <span className="text-sm">Total:</span>
              <span className="text-lg text-green-600">Rs {getCurrentTotal().toFixed(2)}</span>
            </div>
            {order.customers && (
              <div className={`mt-2 p-2 rounded ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'}`}>
                <p className={`text-[10px] font-semibold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Customer Details</p>
                <p className={`text-xs ${classes.textPrimary}`}>{order.customers.phone}</p>
              </div>
            )}
          </div>
        </div>
        {/* End RIGHT COLUMN */}

      </div>

      {/* Footer - Action Buttons */}
      <div className={`${classes.card} ${classes.border} border-t p-3`}>
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={onCancel}
            className={`py-2 rounded-lg font-semibold text-sm ${classes.button} transition-all`}
          >
            Cancel
          </button>
          <button
            onClick={() => handlePayment(false)}
            disabled={!canProcessPayment() || isProcessing}
            className={`py-2 rounded-lg font-semibold text-xs transition-all ${
              canProcessPayment() && !isProcessing
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                Processing...
              </div>
            ) : (
              <>
                <CreditCard className="w-3.5 h-3.5 inline mr-1" />
                Mark Paid
              </>
            )}
          </button>
          <button
            onClick={() => handlePayment(true)}
            disabled={!canProcessPayment() || isProcessing}
            className={`py-2 rounded-lg font-semibold text-xs transition-all ${
              canProcessPayment() && !isProcessing
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
            }`}
          >
            {isProcessing ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                Processing...
              </div>
            ) : (
              <>
                <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
                Paid + Complete
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
