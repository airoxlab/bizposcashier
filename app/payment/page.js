'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  CreditCard,
  Smartphone,
  Building,
  Clock,
  DollarSign,
  Check,
  Printer,
  Volume2,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  Sun,
  Moon,
  Percent,
  Minus,
  Plus,
  Tag,
  X,
  Eye,
  MapPin,
  Truck,
  LayoutGrid,
  UserCheck
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { printerManager } from '../../lib/printerManager'
import loyaltyManager from '../../lib/loyaltyManager'
import customerLedgerManager from '../../lib/customerLedgerManager'
import { notify } from '../../components/ui/NotificationSystem'
import { supabase } from '../../lib/supabase'
import { getOrderItemsWithChanges } from '../../lib/utils/orderChangesTracker'
import LoyaltyRedemption from '../../components/pos/LoyaltyRedemption'
import SplitPaymentModal from '../../components/pos/SplitPaymentModal'
import paymentTransactionManager from '../../lib/paymentTransactionManager'

import Image from 'next/image'

export default function PaymentPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [orderData, setOrderData] = useState(null)
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState(null)
  const [cashAmount, setCashAmount] = useState('')
  const [isProcessing, setIsProcessing] = useState(false)
  const [orderComplete, setOrderComplete] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')
  const [changeAmount, setChangeAmount] = useState(0)
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isOfflineOrder, setIsOfflineOrder] = useState(false)
  const [theme, setTheme] = useState('light')
  const [isPrinting, setIsPrinting] = useState(false)

  // Split Payment States
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false)

  // Smart Discount States
  const [showDiscountSection, setShowDiscountSection] = useState(false)
  const [discountType, setDiscountType] = useState('percentage') // 'percentage' or 'fixed'
  const [discountValue, setDiscountValue] = useState(0)
  const [discountAmount, setDiscountAmount] = useState(0)
  const [originalSubtotal, setOriginalSubtotal] = useState(0)

  // Service Charge States
  const [showServiceChargeSection, setShowServiceChargeSection] = useState(false)
  const [serviceChargeType, setServiceChargeType] = useState('percentage') // 'percentage' or 'fixed'
  const [serviceChargeValue, setServiceChargeValue] = useState(0)
  const [serviceChargeAmount, setServiceChargeAmount] = useState(0)

  // Loyalty Redemption States
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(null)
  const [loyaltyDiscountAmount, setLoyaltyDiscountAmount] = useState(0)

  // Customer Ledger States
  const [customerLedgerBalance, setCustomerLedgerBalance] = useState(0)
  const [loadingLedgerBalance, setLoadingLedgerBalance] = useState(false)

  // Modified Order Payment States
  const [amountDue, setAmountDue] = useState(0) // For modified paid orders, this is the additional amount
  const [isModifiedPaidOrder, setIsModifiedPaidOrder] = useState(false)
useEffect(() => {
  // Check authentication
  if (!authManager.isLoggedIn()) {
    router.push('/')
    return
  }

  const userData = authManager.getCurrentUser()
  setUser(userData)

  // CRITICAL: Set user ID in all managers immediately
  if (userData?.id) {
    printerManager.setUserId(userData.id)
    customerLedgerManager.setUserId(userData.id)
    cacheManager.setUserId(userData.id)
    console.log('✅ [Payment Page] User ID set in printerManager, customerLedgerManager, cacheManager:', userData.id)
  }

  // Load and apply theme
  setTheme(themeManager.currentTheme)
  themeManager.applyTheme()

  // Get order data
  const savedOrderData = localStorage.getItem('order_data')
  if (!savedOrderData) {
    router.push('/dashboard/')
    return
  }

  const parsedOrderData = JSON.parse(savedOrderData)
  setOrderData(parsedOrderData)
  setOriginalSubtotal(parsedOrderData.subtotal)

  // 🆕 CRITICAL FIX: Calculate amount due for modified PAID orders
  // If modifying a previously PAID order, only charge for additional items
  // If modifying an UNPAID/Account order, charge the full total
  let calculatedAmountDue = parsedOrderData.total

  if (parsedOrderData.isModifying && parsedOrderData.originalPaymentStatus === 'Paid') {
    // This is a modified PAID order - customer already paid the original amount
    // Only charge for the difference (additional items)
    const oldTotal = parsedOrderData.detailedChanges?.oldTotal || parsedOrderData.originalState?.total || 0
    const newTotal = parsedOrderData.total
    calculatedAmountDue = Math.max(0, newTotal - oldTotal)
    setIsModifiedPaidOrder(true)
    console.log(`💰 [Payment] Modified PAID order - Old: Rs ${oldTotal}, New: Rs ${newTotal}, Due: Rs ${calculatedAmountDue}`)
  } else if (parsedOrderData.isModifying && (parsedOrderData.originalPaymentStatus === 'Pending' || parsedOrderData.originalPaymentMethod === 'Account' || parsedOrderData.originalPaymentMethod === 'Unpaid')) {
    // This is a modified UNPAID/Account order - customer hasn't paid anything yet
    // Charge the full new total
    calculatedAmountDue = parsedOrderData.total
    setIsModifiedPaidOrder(false)
    console.log(`💰 [Payment] Modified UNPAID order - Full amount due: Rs ${calculatedAmountDue}`)
  } else {
    // New order - charge full total
    calculatedAmountDue = parsedOrderData.total
    setIsModifiedPaidOrder(false)
  }

  setAmountDue(calculatedAmountDue)

  // Set default cash amount to amount due
  setCashAmount(calculatedAmountDue.toString())
  setChangeAmount(0)

  // Pre-populate service charge:
  // - If modifying and order already has service charge → restore it
  // - Otherwise apply the admin default (works for new orders AND reopened orders with no SC)
  try {
    const existingSC = parseFloat(parsedOrderData.originalState?.service_charge_amount || parsedOrderData.serviceChargeAmount || 0)
    const existingSCPct = parseFloat(parsedOrderData.originalState?.service_charge_percentage || parsedOrderData.serviceChargePercentage || 0)
    if (existingSC > 0) {
      setServiceChargeType(existingSCPct > 0 ? 'percentage' : 'fixed')
      setServiceChargeValue(existingSCPct > 0 ? existingSCPct : existingSC)
      setShowServiceChargeSection(true)
    } else {
      const defaultSC = JSON.parse(localStorage.getItem('pos_default_service_charge') || '{}')
      if (defaultSC.value > 0) {
        setServiceChargeType(defaultSC.type || 'percentage')
        setServiceChargeValue(defaultSC.value)
        setShowServiceChargeSection(true)
      }
    }
  } catch (e) {
    // ignore parse errors
  }

  // Update network status
  const statusInterval = setInterval(() => {
    setNetworkStatus(cacheManager.getNetworkStatus())
  }, 1000)

  return () => clearInterval(statusInterval)
}, [router])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  // Smart discount amounts based on total
  const generateSmartDiscounts = (total) => {
    const discounts = []

    // Fixed amount discounts
    const fixedAmounts = [25, 50, 75, 100, 150, 200, 250, 300, 500, 1000]
    fixedAmounts.forEach(amount => {
      if (amount < total) {
        discounts.push({ type: 'fixed', value: amount, label: `Rs ${amount}` })
      }
    })

    // Percentage discounts
    const percentages = [5, 10, 15, 20, 25, 30]
    percentages.forEach(percent => {
      const amount = (total * percent) / 100
      if (amount >= 10) { // Only show if discount is at least Rs 10
        discounts.push({ type: 'percentage', value: percent, label: `${percent}%` })
      }
    })

    return discounts.slice(0, 8) // Limit to 8 options
  }

  const smartDiscounts = orderData ? generateSmartDiscounts(originalSubtotal) : []

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
    },
    {
      id: 'account',
      name: 'Account',
      displayName: 'Customer Account',
      icon: CreditCard,
      color: 'from-purple-500 to-purple-600',
      requiresAmount: false,
      logo: null,
      requiresCustomer: true
    },
    {
      id: 'unpaid',
      name: 'Unpaid',
      icon: Clock,
      color: 'from-gray-500 to-gray-600',
      requiresAmount: false,
      logo: null
    }
  ]

  // Calculate discount amount
  const calculateDiscount = () => {
    if (!discountValue || !originalSubtotal) return 0

    if (discountType === 'percentage') {
      return (originalSubtotal * discountValue) / 100
    } else {
      return Math.min(discountValue, originalSubtotal)
    }
  }

  // Calculate service charge amount
  const calculateServiceCharge = (netAmount) => {
    if (!serviceChargeValue) return 0
    if (serviceChargeType === 'percentage') {
      return (netAmount * serviceChargeValue) / 100
    }
    return serviceChargeValue
  }

  // Update discount when value changes
  useEffect(() => {
    const newDiscountAmount = calculateDiscount()
    setDiscountAmount(newDiscountAmount)

    if (orderData) {
      // Calculate total with both smart discount and loyalty redemption
      const totalDiscount = newDiscountAmount + loyaltyDiscountAmount
      const deliveryCharges = parseFloat(orderData.deliveryCharges) || 0
      const netAfterDiscount = Math.max(0, originalSubtotal - totalDiscount)
      const newSCAmount = calculateServiceCharge(netAfterDiscount)
      setServiceChargeAmount(newSCAmount)
      const newTotal = netAfterDiscount + newSCAmount + deliveryCharges

      // 🆕 Recalculate amount due for modified PAID orders
      let calculatedAmountDue = newTotal
      if (orderData.isModifying && orderData.originalPaymentStatus === 'Paid') {
        const oldTotal = orderData.detailedChanges?.oldTotal || orderData.originalState?.total || 0
        calculatedAmountDue = Math.max(0, newTotal - oldTotal)
        setIsModifiedPaidOrder(true)
      } else {
        calculatedAmountDue = newTotal
      }
      setAmountDue(calculatedAmountDue)
      setCashAmount(calculatedAmountDue.toString())

      // Update order data with new totals (also fix detailedChanges.newTotal to include service charge)
      setOrderData(prev => ({
        ...prev,
        discountType,
        discountValue,
        discountAmount: newDiscountAmount,
        loyaltyDiscountAmount,
        total: newTotal,
        detailedChanges: prev?.detailedChanges ? { ...prev.detailedChanges, newTotal } : prev?.detailedChanges
      }))
    }
  }, [discountType, discountValue, originalSubtotal, loyaltyDiscountAmount, serviceChargeType, serviceChargeValue])

  const handleSmartDiscount = (discount) => {
    setDiscountType(discount.type)
    setDiscountValue(discount.value)
    notify.success(`${discount.label} discount applied!`)
  }

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
    notify.info('Discount removed')
  }

  // Loyalty redemption handlers
  const handleRedemptionApplied = (redemptionData) => {
    setLoyaltyRedemption(redemptionData)
    setLoyaltyDiscountAmount(redemptionData.discountAmount)
    notify.success(`${redemptionData.redemptionName} applied! PKR ${redemptionData.discountAmount.toFixed(2)} off`)
  }

  const handleRedemptionRemoved = () => {
    setLoyaltyRedemption(null)
    setLoyaltyDiscountAmount(0)
    notify.info('Loyalty redemption removed')
  }

  // Generate smart quick amounts based on total
  const generateQuickAmounts = (total) => {
    const roundedTotal = Math.ceil(total)
    const amounts = new Set([roundedTotal]) // Always include exact total

    // Add common amounts
    const commonAmounts = [100, 200, 500, 1000, 1500, 2000, 2500, 3000, 5000, 10000]

    // Add amounts close to total
    amounts.add(roundedTotal + 50)
    amounts.add(roundedTotal + 100)
    amounts.add(roundedTotal + 500)

    // Add common amounts that are larger than total
    commonAmounts.forEach(amount => {
      if (amount > total) {
        amounts.add(amount)
      }
    })

    return Array.from(amounts).sort((a, b) => a - b).slice(0, 8)
  }

  const quickAmounts = orderData ? generateQuickAmounts(amountDue || orderData.total) : []

  const playBeepSound = () => {
    try {
      const audio = new Audio('/sounds/beep.mp3')
      audio.play().catch(() => {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)()
        const oscillator = audioContext.createOscillator()
        const gainNode = audioContext.createGain()

        oscillator.connect(gainNode)
        gainNode.connect(audioContext.destination)

        oscillator.frequency.value = 800
        oscillator.type = 'sine'

        gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5)

        oscillator.start(audioContext.currentTime)
        oscillator.stop(audioContext.currentTime + 0.5)
      })
    } catch (error) {
      console.log('Could not play beep sound:', error)
    }
  }

  const handlePaymentMethodSelect = async (method) => {
    // Check if method requires customer
    if (method.requiresCustomer && !orderData.customer) {
      notify.error('Customer Account payment requires a customer to be selected!')
      return
    }

    setSelectedPaymentMethod(method)
    if (!method.requiresAmount) {
      setCashAmount('')
      setChangeAmount(0)
    } else {
      // Keep the default amount due for cash (handles modified paid orders correctly)
      setCashAmount(amountDue.toString())
      setChangeAmount(0)
    }

    // Fetch customer ledger balance if Account payment method is selected
    if (method.id === 'account' && orderData.customer?.id) {
      if (!networkStatus.isOnline) {
        console.log('📊 [Payment] Offline — skipping ledger balance fetch')
        setCustomerLedgerBalance(0)
      } else {
        setLoadingLedgerBalance(true)
        try {
          const balance = await customerLedgerManager.getCustomerBalance(orderData.customer.id)
          setCustomerLedgerBalance(balance)
          console.log(`📊 [Payment] Customer current balance: Rs ${balance}`)
        } catch (error) {
          console.error('Failed to fetch customer ledger balance:', error)
          setCustomerLedgerBalance(0)
        } finally {
          setLoadingLedgerBalance(false)
        }
      }
    }
  }

  const handleQuickAmount = (amount) => {
    if (selectedPaymentMethod?.requiresAmount) {
      setCashAmount(amount.toString())
      const change = amount - amountDue
      setChangeAmount(change > 0 ? change : 0)
    }
  }

  const handleCashAmountChange = (amount) => {
    setCashAmount(amount)
    if (orderData) {
      const numericAmount = parseFloat(amount) || 0
      const change = numericAmount - amountDue
      setChangeAmount(change > 0 ? change : 0)
    }
  }

  const canProcessPayment = () => {
    if (!selectedPaymentMethod) return false
    if (selectedPaymentMethod.requiresAmount) {
      return parseFloat(cashAmount) >= amountDue
    }
    return true
  }
// COMPLETE UPDATED processOrder function with delivery_charges and delivery_time fixes
const processOrder = async () => {
  if (!canProcessPayment() || !orderData) return

  setIsProcessing(true)

  try {
    const currentUser = authManager.getCurrentUser()
    const currentSession = authManager.getCurrentSession()
    const cashier = authManager.getCashier()
    
    // Prepare order items
    const orderItems = orderData.cart.map(item => {
      // DEBUG: Log cart item before processing
      console.log('💾 Payment - Cart item before DB save:', JSON.stringify(item, null, 2));

      if (item.isDeal) {
        // Handle deal items
        console.log('💾 Payment - Processing as DEAL. dealProducts:', item.dealProducts);
        return {
          deal_id: item.dealId,
          product_id: null,
          variant_id: null,
          product_name: item.dealName,
          variant_name: null,
          base_price: item.baseDealPrice || item.finalPrice,
          variant_price: item.priceAdjustment || 0,
          final_price: item.finalPrice,
          quantity: item.quantity,
          total_price: item.totalPrice,
          is_deal: true,
          deal_products: JSON.stringify(item.dealProducts),
          item_instructions: item.itemInstructions || null
        }
      } else {
        // Handle regular product items
        return {
          product_id: item.productId,
          variant_id: item.variantId,
          product_name: item.productName,
          variant_name: item.variantName,
          base_price: item.basePrice,
          variant_price: item.variantPrice || 0,
          final_price: item.finalPrice,
          quantity: item.quantity,
          total_price: item.totalPrice,
          is_deal: false,
          item_instructions: item.itemInstructions || null
        }
      }
    })

    // DEBUG: Log final orderItems array before database insert
    console.log('💾 Payment - Final orderItems to save:', JSON.stringify(orderItems, null, 2));

    // Prepare delivery time for database (convert time string to timestamp)
    let deliveryTimeForDB = null
    if (orderData.deliveryTime) {
      // Convert "HH:MM" format to timestamp
      const today = new Date()
      const [hours, minutes] = orderData.deliveryTime.split(':')
      today.setHours(parseInt(hours), parseInt(minutes), 0, 0)
      deliveryTimeForDB = today.toISOString()
    }

    // Prepare takeaway time for database (convert time string to time format)
    let takeawayTimeForDB = null
    if (orderData.takeawayTime) {
      takeawayTimeForDB = orderData.takeawayTime // Already in "HH:MM:SS" or "HH:MM" format
    }

    // Declare newDailySerial here so it's accessible after the if/else block
    let newDailySerial = null

    // CHECK IF WE'RE MODIFYING AN EXISTING ORDER (only if online)
    if (orderData.isModifying && orderData.existingOrderId && navigator.onLine) {
      console.log('🔄 Modifying existing order (ONLINE):', orderData.existingOrderId)

      // Update existing order - WITH delivery_charges and delivery_time
      // Preserve the original order status (e.g. 'Preparing') so editing doesn't revert it to Pending
      const preservedOrderStatus = orderData.originalOrderStatus || 'Pending'
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          order_type: orderData.orderType, // Preserve order_type so kitchen shows correct type
          subtotal: orderData.subtotal,
          discount_amount: discountAmount || 0,
          discount_percentage: discountType === 'percentage' ? discountValue : 0,
          service_charge_amount: serviceChargeAmount || 0,
          service_charge_percentage: serviceChargeType === 'percentage' ? serviceChargeValue : 0,
          delivery_charges: orderData.deliveryCharges || 0,
          delivery_boy_id: orderData.deliveryBoyId || null,
          delivery_address: orderData.deliveryAddress || '',
          table_id: orderData.tableId || null,
          total_amount: orderData.total,
          payment_method: selectedPaymentMethod.name,
          payment_status: (selectedPaymentMethod.id === 'unpaid' || selectedPaymentMethod.id === 'account') ? 'Pending' : 'Paid',
          order_status: preservedOrderStatus,
          order_instructions: orderData.orderInstructions || '',
          delivery_time: deliveryTimeForDB,
          takeaway_time: takeawayTimeForDB,
          updated_at: new Date().toISOString(),
          modified_by_cashier_id: cashier?.id || null
        })
        .eq('id', orderData.existingOrderId)

      if (updateError) throw updateError

      // Delete old order items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderData.existingOrderId)

      if (deleteError) throw deleteError

      // Insert new order items
      for (const item of orderItems) {
        const { error: itemError } = await supabase
          .from('order_items')
          .insert({
            order_id: orderData.existingOrderId,
            ...item
          })

        if (itemError) throw itemError
      }

      // Update customer ledger entry if payment method is Account with a customer
      // NOTE: "Unpaid" means pay-later in cash - do NOT add to customer ledger
      if (selectedPaymentMethod?.id === 'account' && orderData.customer?.id) {
        try {
          console.log('💳 [Payment] Updating customer ledger for modified order')

          // Find and delete the old ledger entry for this order
          const { data: oldLedgerEntry, error: fetchError } = await supabase
            .from('customer_ledger')
            .select('*')
            .eq('order_id', orderData.existingOrderId)
            .eq('user_id', currentUser.id)
            .eq('transaction_type', 'debit')
            .maybeSingle()

          if (fetchError) {
            console.error('⚠️ [Payment] Error fetching old ledger entry:', fetchError.message)
          } else if (oldLedgerEntry) {
            console.log(`💳 [Payment] Found old ledger entry: Rs ${oldLedgerEntry.amount} (will be updated to Rs ${orderData.total})`)

            // Delete the old ledger entry
            const { error: deleteError } = await supabase
              .from('customer_ledger')
              .delete()
              .eq('id', oldLedgerEntry.id)

            if (deleteError) {
              console.error('⚠️ [Payment] Error deleting old ledger entry:', deleteError.message)
            } else {
              console.log('✅ [Payment] Old ledger entry deleted')
            }
          } else {
            console.log('ℹ️ [Payment] No existing ledger entry found for this order')
          }

          // Create new ledger entry with updated amount
          const modifyDebitAmount = orderData.total
          customerLedgerManager.setUserId(currentUser.id)
          const currentBalance = await customerLedgerManager.getCustomerBalance(orderData.customer.id)
          const newBalance = currentBalance + modifyDebitAmount

          if (modifyDebitAmount > 0) {
            const { error: ledgerError } = await supabase
              .from('customer_ledger')
              .insert({
                user_id: currentUser.id,
                customer_id: orderData.customer.id,
                transaction_type: 'debit',
                amount: modifyDebitAmount,
                balance_before: currentBalance,
                balance_after: newBalance,
                order_id: orderData.existingOrderId,
                description: `Order #${orderData.existingOrderNumber} - ${orderData.orderType?.toUpperCase() || 'WALKIN'} (Modified)`,
                notes: `Order modified - Updated total: Rs ${orderData.total}`,
                created_by: currentUser.id
              })

            if (ledgerError) {
              console.error('⚠️ [Payment] Error creating updated ledger entry:', ledgerError.message)
            } else {
              console.log(`✅ [Payment] Updated ledger entry created: Rs ${modifyDebitAmount} (Balance: ${currentBalance} -> ${newBalance})`)
              await supabase.from('customers').update({ account_balance: newBalance }).eq('id', orderData.customer.id)
              notify.success(`Updated customer account. New balance: Rs ${newBalance.toFixed(0)}`, { duration: 5000 })
            }
          }
        } catch (ledgerError) {
          console.error('❌ [Payment] Failed to update customer ledger:', ledgerError.message)
          // Don't fail the order if ledger update fails
        }
      }

      // Log detailed modification with item changes (authManager also saves to order_item_changes)
      await authManager.logOrderAction(
        orderData.existingOrderId,
        'modified',
        orderData.detailedChanges || {
          items_count: orderItems.length,
          total_amount: orderData.total,
          delivery_charges: orderData.deliveryCharges || 0
        },
        `Order modified and payment completed by ${cashier?.name || 'Admin'}`
      )

      // Cache item changes for reprint display (authManager.logOrderAction already wrote to DB above)
      if (orderData.detailedChanges) {
        const { saveChangesOffline } = await import('../../lib/utils/orderChangesTracker')
        const result = await saveChangesOffline(orderData.existingOrderId, orderData.existingOrderNumber, orderData.detailedChanges, { cacheOnly: true })
        if (result?.success) {
          console.log(`💾 Cached ${result.changesCount} item changes for reprint (DB already written by logOrderAction)`)
        }
      }

      setOrderNumber(orderData.existingOrderNumber)
      setIsOfflineOrder(false)

      // Restore daily_serial for printing — it was saved to localStorage when reopening
      const savedSerial = localStorage.getItem(`${orderData.orderType}_modifying_daily_serial`)
      if (savedSerial) newDailySerial = parseInt(savedSerial) || null

      console.log(`✅ Order ${orderData.existingOrderNumber} modified successfully`)

    } else {
      // CREATE NEW ORDER or MODIFY OFFLINE (use cacheManager which handles both)
      // CREATE NEW ORDER (or update existing if modifying offline) - WITH delivery_charges and delivery_time
      const { order, orderNumber: newOrderNumber, dailySerial: _newDailySerial } = await cacheManager.createOrder({
        user_id: currentUser.id,
        cashier_id: cashier?.id || orderData.cashierId || null,
        session_id: currentSession?.id || orderData.sessionId || null,
        customer_id: orderData.customer?.id || null,
        order_type: orderData.orderType,
        order_type_id: orderData.orderTypeId || null, // 🆕 Added for inventory deduction
        subtotal: orderData.subtotal,
        discount_amount: discountAmount || 0, // Smart discount only (not including loyalty)
        discount_percentage: discountType === 'percentage' ? discountValue : 0,
        service_charge_amount: serviceChargeAmount || 0,
        service_charge_percentage: serviceChargeType === 'percentage' ? serviceChargeValue : 0,
        delivery_charges: orderData.deliveryCharges || 0, // FIX: Add delivery charges
        delivery_boy_id: orderData.deliveryBoyId || null, // FIX: Add delivery boy
        delivery_address: orderData.deliveryAddress || '', // Store delivery address
        table_id: orderData.tableId || null, // Add table_id for walkin orders
        order_taker_id: orderData.orderTakerId || null,
        total_amount: orderData.total,
        payment_method: selectedPaymentMethod.name,
        payment_status: (selectedPaymentMethod.id === 'unpaid' || selectedPaymentMethod.id === 'account') ? 'Pending' : 'Paid',
        order_status: orderData.isModifying && orderData.originalOrderStatus
          ? orderData.originalOrderStatus
          : 'Pending',
        order_instructions: orderData.orderInstructions || '',
        delivery_time: deliveryTimeForDB, // FIX: Add delivery time
        takeaway_time: takeawayTimeForDB, // Also add takeaway time
        loyalty_points_redeemed: loyaltyRedemption?.pointsToRedeem || 0, // Add loyalty points
        loyalty_discount_amount: loyaltyDiscountAmount || 0, // Add loyalty discount
        items: orderItems,
        // Pass modification info for offline mode
        isModifying: orderData.isModifying || false,
        existingOrderId: orderData.existingOrderId || null,
        existingOrderNumber: orderData.existingOrderNumber || null,
        detailedChanges: orderData.detailedChanges || null // Pass detailed changes for history tracking
      })
      newDailySerial = _newDailySerial

      setOrderNumber(newOrderNumber)
      setIsOfflineOrder(order._isOffline)

      console.log(`✅ Order ${newOrderNumber} placed successfully`)
      console.log(`💰 Delivery charges: Rs ${orderData.deliveryCharges || 0}`)
      console.log(`🕐 Delivery time: ${orderData.deliveryTime || 'N/A'}`)

      // Cache item changes for reprint display
      // cacheManager.createOrder() already called authManager.logOrderAction() which handles DB writes
      // (online: writes directly; offline: queued via syncOfflineHistory - no need for pending_order_changes_sync)
      if (orderData.isModifying && orderData.detailedChanges) {
        const { saveChangesOffline } = await import('../../lib/utils/orderChangesTracker')
        const result = await saveChangesOffline(order.id, newOrderNumber, orderData.detailedChanges, { cacheOnly: true })
        if (result?.success) {
          console.log(`💾 Cached ${result.changesCount} item changes for reprint`)
        }
      }

      // Update table status to occupied for walkin orders
      if (orderData.orderType === 'walkin' && orderData.tableId) {
        await cacheManager.updateTableStatus(orderData.tableId, 'occupied')
        console.log(`✅ Table ${orderData.tableId} marked as occupied`)
      }

      // Handle loyalty redemption if applied
      if (loyaltyRedemption && orderData.customer?.id) {
        try {
          const redemptionResult = await loyaltyManager.redeemPoints(
            orderData.customer.id,
            newOrderNumber,
            loyaltyRedemption.redemptionOptionId,
            loyaltyRedemption.pointsToRedeem,
            loyaltyRedemption.discountAmount
          )

          if (redemptionResult.success) {
            console.log(`✅ Redeemed ${loyaltyRedemption.pointsToRedeem} points - PKR ${loyaltyRedemption.discountAmount} discount`)
            notify.success(`✅ Redeemed ${loyaltyRedemption.pointsToRedeem} points!`, { duration: 5000 })
          } else if (redemptionResult.offline) {
            console.log('⚠️ Loyalty redemption will be processed when online')
          }
        } catch (redemptionError) {
          console.error('Failed to redeem loyalty points:', redemptionError)
          // Don't fail the order if redemption fails
        }
      }

      // Award loyalty points if customer exists (but not if modifying)
      if (orderData.customer?.id && !orderData.isModifying) {
        try {
          const pointsCalculation = loyaltyManager.calculatePointsForOrder({
            customerId: orderData.customer.id,
            orderType: orderData.orderType,
            subtotal: orderData.subtotal,
            items: orderData.cart.map(item => ({
              product_id: item.product_id,
              category_id: item.category_id,
              quantity: item.quantity,
              price: item.finalPrice
            })),
            orderDate: new Date()
          })

          if (pointsCalculation.totalPoints > 0) {
            const awardResult = await loyaltyManager.awardPoints(
              orderData.customer.id,
              newOrderNumber,
              {
                ...pointsCalculation,
                orderType: orderData.orderType,
                subtotal: orderData.subtotal
              }
            )

            if (awardResult.success) {
              console.log(`🎉 Awarded ${awardResult.points} loyalty points to customer`)
              notify.success(`🎉 Customer earned ${awardResult.points} loyalty points!`, { duration: 5000 })
            } else if (awardResult.offline) {
              console.log('⚠️ Loyalty points will be awarded when online')
            }
          }
        } catch (loyaltyError) {
          console.error('Failed to award loyalty points:', loyaltyError)
          // Don't fail the order if loyalty fails
        }
      }

      // NOTE: Customer Account ledger entry is created automatically in cacheManager.syncOrder()
      // No need to create it here to avoid duplicates
      // "Unpaid" orders do NOT touch the customer ledger
      if (selectedPaymentMethod?.id === 'account' && orderData.customer?.id) {
        console.log(`💳 [Payment] Account payment with customer - ledger entry will be created during order sync`)
      }
    }

    // Store for printing
    localStorage.setItem('final_order_data', JSON.stringify({
      ...orderData,
      orderNumber: orderData.isModifying ? orderData.existingOrderNumber : orderNumber,
      dailySerial: newDailySerial || orderData.dailySerial || null,
      paymentMethod: selectedPaymentMethod.name,
      cashReceived: selectedPaymentMethod.requiresAmount ? parseFloat(cashAmount) : null,
      changeAmount: selectedPaymentMethod.requiresAmount ? changeAmount : 0,
      cashierName: cashier?.name || currentUser?.customer_name,
      cashierId: cashier?.id || null,
      discountAmount: discountAmount || 0,
      discountType: discountType,
      discountValue: discountValue,
      serviceChargeAmount: serviceChargeAmount || 0,
      serviceChargeType: serviceChargeType,
      serviceChargeValue: serviceChargeValue || 0,
      tableId: orderData.tableId || null,
      tableName: orderData.tableName || null
    }))

    playBeepSound()

    // Clear saved order data
    localStorage.removeItem('order_data')
    localStorage.removeItem('walkin_cart')
    localStorage.removeItem('walkin_customer')
    localStorage.removeItem('walkin_instructions')
    localStorage.removeItem('walkin_modifying_order')
    localStorage.removeItem('walkin_modifying_order_number')
    localStorage.removeItem('walkin_original_state')
    localStorage.removeItem('walkin_original_order_status')
    localStorage.removeItem('walkin_original_payment_status')
    localStorage.removeItem('walkin_original_amount_paid')
    localStorage.removeItem('walkin_original_payment_method')
    localStorage.removeItem('walkin_can_decrease_qty')
    localStorage.removeItem('walkin_table')
    localStorage.removeItem('walkin_reopened')
    localStorage.removeItem('delivery_cart')
    localStorage.removeItem('delivery_customer')
    localStorage.removeItem('delivery_instructions')
    localStorage.removeItem('delivery_time')
    localStorage.removeItem('delivery_charges')
    localStorage.removeItem('delivery_boy_id')
    localStorage.removeItem('delivery_reopened')
    localStorage.removeItem('delivery_original_order')
    localStorage.removeItem('delivery_modifying_order')
    localStorage.removeItem('delivery_modifying_order_number')
    localStorage.removeItem('delivery_original_state')
    localStorage.removeItem('delivery_order_data')
    localStorage.removeItem('delivery_discount')
    localStorage.removeItem('delivery_original_order_status')
    localStorage.removeItem('delivery_original_payment_status')
    localStorage.removeItem('delivery_original_amount_paid')
    localStorage.removeItem('delivery_original_payment_method')
    localStorage.removeItem('delivery_can_decrease_qty')
    localStorage.removeItem('takeaway_cart')
    localStorage.removeItem('takeaway_customer')
    localStorage.removeItem('takeaway_instructions')
    localStorage.removeItem('takeaway_pickup_time')
    localStorage.removeItem('takeaway_modifying_order')
    localStorage.removeItem('takeaway_modifying_order_number')
    localStorage.removeItem('takeaway_original_state')
    localStorage.removeItem('takeaway_discount')
    localStorage.removeItem('takeaway_original_order_status')
    localStorage.removeItem('takeaway_original_payment_status')
    localStorage.removeItem('takeaway_original_amount_paid')
    localStorage.removeItem('takeaway_original_payment_method')
    localStorage.removeItem('takeaway_can_decrease_qty')
    localStorage.removeItem('takeaway_reopened')

    // Clear new-order page shared cart/customer/instructions
    if (orderData?.sourcePage === 'new-order') {
      localStorage.removeItem('new_order_cart')
      localStorage.removeItem('new_order_customer')
      localStorage.removeItem('new_order_instructions')
      localStorage.removeItem('new_order_walkin_table')
      const sourceKey = orderData?.sourceStorageKey
      if (sourceKey) localStorage.removeItem(`${sourceKey}_extras`)
    }

    setOrderComplete(true)

  } catch (error) {
    console.error('Error processing order:', error)
    notify.error(`Failed to process order: ${error.message}. Please try again.`)
  } finally {
    setIsProcessing(false)
  }
}
  // Enhanced function to get user profile data from localStorage
  const getUserProfileData = () => {
    try {
      // First try to get from user_profile localStorage
      const userProfileStr = localStorage.getItem('user_profile')
      const userStr = localStorage.getItem('user')
      
      let userProfile = {}
      let user = {}
      
      if (userProfileStr) {
        try {
          userProfile = JSON.parse(userProfileStr)
        } catch (e) {
          console.log('Error parsing user_profile:', e)
        }
      }
      
      if (userStr) {
        try {
          user = JSON.parse(userStr)
        } catch (e) {
          console.log('Error parsing user:', e)
        }
      }

      // Properly handle show_footer_section boolean
      const showFooter = userProfile?.show_footer_section !== undefined
        ? userProfile.show_footer_section
        : (user?.show_footer_section !== undefined ? user.show_footer_section : true)

      // Properly handle show_logo_on_receipt boolean
      const showLogo = userProfile?.show_logo_on_receipt !== undefined
        ? userProfile.show_logo_on_receipt
        : (user?.show_logo_on_receipt !== undefined ? user.show_logo_on_receipt : true)

      // Properly handle show_business_name_on_receipt boolean
      const showBusinessName = userProfile?.show_business_name_on_receipt !== undefined
        ? userProfile.show_business_name_on_receipt
        : (user?.show_business_name_on_receipt !== undefined ? user.show_business_name_on_receipt : true)

      console.log('Retrieved localStorage data for thermal print:', {
        userProfile,
        user,
        combinedData: {
          store_name: userProfile?.store_name || user?.store_name || '',
          store_address: userProfile?.store_address || user?.store_address || '',
          phone: userProfile?.phone || user?.phone || '',
          store_logo: userProfile?.store_logo || user?.store_logo || null,
          qr_code: userProfile?.qr_code || user?.qr_code || null,
          hashtag1: userProfile?.hashtag1 || user?.hashtag1 || '',
          hashtag2: userProfile?.hashtag2 || user?.hashtag2 || '',
          show_footer_section: showFooter,
          show_logo_on_receipt: showLogo,
          show_business_name_on_receipt: showBusinessName
        }
      })

      // Get local assets for offline printing
      const localLogo = localStorage.getItem('store_logo_local')
      const localQr = localStorage.getItem('qr_code_local')

      // Get cashier information from final_order_data
      let cashierName = null
      let cashierId = null
      try {
        const finalOrderDataStr = localStorage.getItem('final_order_data')
        if (finalOrderDataStr) {
          const finalOrderData = JSON.parse(finalOrderDataStr)
          cashierName = finalOrderData.cashierName || null
          cashierId = finalOrderData.cashierId || null
        }
      } catch (e) {
        console.log('Error parsing final_order_data:', e)
      }

      // Merge data with proper priorities
      return {
        store_name: userProfile?.store_name || user?.store_name || 'GEN Z CAFE',
        store_address: userProfile?.store_address || user?.store_address || 'Gulshan e Madina, Jhang Road, Bhakkar',
        phone: userProfile?.phone || user?.phone || '0310-1731573',
        email: userProfile?.email || user?.email || '',
        customer_name: cashierId ? null : (cashierName || user?.customer_name || ''),
        // Use local base64/cached logo first, fallback to URL
        store_logo: localLogo || userProfile?.store_logo || user?.store_logo || null,
        // Use local QR first, fallback to URL
        qr_code: localQr || userProfile?.qr_code || user?.qr_code || null,
        hashtag1: userProfile?.hashtag1 || user?.hashtag1 || '',
        hashtag2: userProfile?.hashtag2 || user?.hashtag2 || '',
        show_footer_section: showFooter,
        show_logo_on_receipt: showLogo,
        show_business_name_on_receipt: showBusinessName,
        // Add cashier/admin name for receipt printing
        cashier_name: cashierId ? cashierName : null,
      }
    } catch (error) {
      console.error('Error getting user profile data:', error)
      // Return fallback data
      return {
        store_name: 'GEN Z CAFE',
        store_address: 'Gulshan e Madina, Jhang Road, Bhakkar',
        phone: '0310-1731573',
        email: '',
        customer_name: '',
        store_logo: null,
        qr_code: null,
        hashtag1: '',
        hashtag2: '',
        show_footer_section: true,
        show_logo_on_receipt: true,
        show_business_name_on_receipt: true
      }
    }
  }

// Updated handleThermalPrint function for your payment page
const handleThermalPrint = async () => {
  if (!orderData || !orderNumber) {
    notify.error('No order data available for printing')
    return
  }

  setIsPrinting(true)

  try {
    // Removed loading notification - too many notifications

    // Get printer config using the updated PrinterManager
    console.log('🔍 Getting printer config...')
    const printerConfig = await printerManager.getPrinterForPrinting()
    
    if (!printerConfig) {
      // Removed notification cleanup code

      console.error('❌ No printer configuration found')
      
      // Check if we're in Electron
      if (!printerManager.isElectron()) {
        notify.error('Printing only available in desktop app!')
        return
      }
      
      const allPrinters = await printerManager.getConfiguredPrinters()
      console.log('📋 Available printers:', allPrinters)
      
      notify.error('No thermal printer configured! Please configure a default thermal printer first.')
      
      // Don't redirect immediately - let user decide
      setTimeout(() => {
        const userWantsToSetup = confirm('Would you like to open printer settings to configure a printer?')
        if (userWantsToSetup) {
          window.open('/printer', '_blank')
        }
      }, 500)
      
      return
    }

    console.log('✅ Found printer config:', printerConfig)

    // Get user profile data from localStorage
    const userProfileData = getUserProfileData()

    // Get final order data which includes split payment info
    const finalOrderDataStr = localStorage.getItem('final_order_data')
    const finalOrderData = finalOrderDataStr ? JSON.parse(finalOrderDataStr) : null

    // Resolve order taker name
    const orderTakerForReceipt = orderData?.orderTakerName ||
      (orderData?.orderTakerId
        ? (cacheManager.getOrderTakers().find(t => t.id === orderData.orderTakerId)?.name || null)
        : null)

    // Prepare complete order data
    const completeOrderData = {
      ...orderData,
      orderNumber,
      dailySerial: finalOrderData?.dailySerial || orderData?.dailySerial || null,
      paymentMethod: finalOrderData?.paymentMethod || selectedPaymentMethod?.name || 'Cash',
      cashReceived: selectedPaymentMethod?.requiresAmount ? parseFloat(cashAmount) : null,
      changeAmount: selectedPaymentMethod?.requiresAmount ? changeAmount : 0,
      discountType: discountType || 'percentage',
      discountValue: discountValue || 0,
      discountAmount: discountAmount || 0,
      loyaltyDiscountAmount: loyaltyDiscountAmount || 0,
      loyaltyPointsRedeemed: loyaltyRedemption?.pointsToRedeem || 0,
      serviceChargeAmount: serviceChargeAmount || 0,
      serviceChargeType: serviceChargeType || 'percentage',
      serviceChargeValue: serviceChargeValue || 0,
      orderType: orderData.orderType || 'walkin',
      tableName: orderData.tableName || finalOrderData?.tableName || null,
      order_taker_name: orderTakerForReceipt || null
    }

    // If split payment, add the payment transactions
    if (completeOrderData.paymentMethod === 'Split' && finalOrderData?.splitPayments) {
      completeOrderData.paymentTransactions = finalOrderData.splitPayments.map(payment => ({
        payment_method: payment.method,
        amount: payment.amount
      }))
    }

    console.log('📤 Sending print request to:', printerConfig.ip_address + ':' + printerConfig.port)

    // Use the updated PrinterManager to print
    const result = await printerManager.printReceipt(
      completeOrderData,
      userProfileData,
      printerConfig
    )

    // Removed notification cleanup code

    console.log('📄 Print result:', result)

    if (result.success) {
      notify.success(`Receipt printed successfully to ${printerConfig.name}! Order #${orderNumber}`)
      console.log('✅ Thermal print successful')

      // Update printer connection status
      await printerManager.updateConnectionStatus(printerConfig.id, true)
    } else {
      throw new Error(result.message || result.error || 'Print failed')
    }

  } catch (error) {
    console.error('❌ Thermal print failed:', error)

    // Removed notification cleanup code

    // More specific error handling
    if (error.message.includes('Printer not connected') || error.message.includes('Connection timeout')) {
      notify.error(`Printer connection failed: ${error.message}`)
      setTimeout(() => {
        const userWantsToCheck = confirm('Would you like to open printer settings to check the connection?')
        if (userWantsToCheck) {
          window.open('/printer', '_blank')
        }
      }, 500)
    } else if (error.message.includes('No printer configuration') || error.message.includes('only available in desktop app')) {
      notify.error('Printing only available in desktop app. Please use the desktop version.')
    } else {
      notify.error(`Print failed: ${error.message}`)
    }
  } finally {
    setIsPrinting(false)
  }
}

const handlePrintKitchenToken = async () => {
  if (!orderData || !orderNumber) {
    notify.error('No order data available for printing')
    return
  }

  setIsPrinting(true)

  try {
    // Get printer config
    console.log('🔍 Getting printer config...')
    const printerConfig = await printerManager.getPrinterForPrinting()

    if (!printerConfig) {
      console.error('❌ No printer configuration found')
      notify.error('No thermal printer configured! Please configure a printer first.')
      return
    }

    console.log('✅ Found printer config:', printerConfig)

    // Get user profile data
    const userProfileData = getUserProfileData()

    // Get final order data (contains dailySerial assigned after order creation)
    const finalOrderDataStr = localStorage.getItem('final_order_data')
    const finalOrderData = finalOrderDataStr ? JSON.parse(finalOrderDataStr) : null

    // Build a product lookup for category_id fallback (cart items may not carry it)
    const productCategoryMap = {}
    cacheManager.cache?.products?.forEach(p => { productCategoryMap[p.id] = p.category_id })

    // Map cart items
    let mappedItems = orderData.cart?.map(item => ({
      name: item.isDeal ? item.dealName : (item.productName || item.name),
      size: item.isDeal ? '' : (item.variantName || item.size || ''),
      quantity: item.quantity,
      notes: item.notes || '',
      isDeal: item.isDeal || false,
      dealProducts: item.isDeal ? item.dealProducts : null,
      instructions: item.itemInstructions || '',
      category_id: item.isDeal ? null : (item.category_id || productCategoryMap[item.productId] || null),
      deal_id: item.isDeal ? (item.dealId || item.deal_id || null) : null
    })) || []

    // 🆕 Check for order changes
    if (orderData.isModifying && orderData.detailedChanges) {
      // Modified order - use detailedChanges from orderData (before saving to DB)
      console.log('📝 Order being modified - using detailedChanges:', orderData.detailedChanges)

      const changes = orderData.detailedChanges

      // Mark current items with appropriate change type
      mappedItems = mappedItems.map(item => {
        const itemName = item.name
        const itemVariant = item.size || ''

        // Check if item was brand-new added
        const wasAdded = changes.itemsAdded?.some(added =>
          added.name === itemName && (added.variant || '') === itemVariant
        )

        // Check if item quantity was modified
        const wasModified = changes.itemsModified?.find(modified =>
          modified.name === itemName && (modified.variant || '') === itemVariant
        )

        if (wasAdded) {
          return { ...item, changeType: 'added' }
        } else if (wasModified) {
          // Show old→new quantity on a single line (no duplicate entries)
          return {
            ...item,
            changeType: 'modified',
            oldQuantity: wasModified.oldQuantity,
            newQuantity: wasModified.newQuantity,
            quantity: wasModified.newQuantity
          }
        }

        return { ...item, changeType: 'unchanged' }
      })

      // Add completely removed items
      const removedItems = []
      if (changes.itemsRemoved && changes.itemsRemoved.length > 0) {
        changes.itemsRemoved.forEach(removed => {
          removedItems.push({
            name: removed.name,
            size: removed.variant || '',
            quantity: removed.quantity,
            notes: '',
            isDeal: false,
            changeType: 'removed'
          })
        })
      }

      // Merge: current items (with change types) + completely removed items
      mappedItems = [...mappedItems, ...removedItems]

    } else if (orderData.orderId) {
      // Existing order - fetch changes from database
      mappedItems = await getOrderItemsWithChanges(orderData.orderId, mappedItems)
    }

    // Resolve order taker name for kitchen token
    const orderTakerForToken = orderData?.orderTakerName ||
      (orderData?.orderTakerId
        ? (cacheManager.getOrderTakers().find(t => t.id === orderData.orderTakerId)?.name || null)
        : null)

    // Prepare kitchen token data
    const kitchenTokenData = {
      orderNumber,
      dailySerial: finalOrderData?.dailySerial || orderData?.dailySerial || null,
      orderType: orderData.orderType,
      tableName: orderData.tableName || finalOrderData?.tableName || null,
      customerName: orderData.customerName || '',
      customerPhone: orderData.customerPhone || '',
      specialNotes: orderData.orderInstructions || '',
      deliveryAddress: orderData.deliveryAddress || '',
      items: mappedItems,
      order_taker_name: orderTakerForToken || null
    }

    // Use printerManager to print kitchen token(s) with category/deal-based routing
    const results = await printerManager.printKitchenTokens(
      kitchenTokenData,
      userProfileData,
      printerConfig
    )

    const allOk = results.every(r => r.success)
    const anyOk = results.some(r => r.success)
    if (allOk) {
      notify.success('Kitchen token printed successfully!')
    } else if (anyOk) {
      const failed = results.filter(r => !r.success).map(r => r.printerName || r.printerId).join(', ')
      notify.warning(`Kitchen token partial: failed for ${failed}`)
    } else {
      const firstErr = results[0]?.error || results[0]?.message || 'Kitchen token print failed'
      throw new Error(firstErr)
    }

  } catch (error) {
    console.error('❌ Kitchen token print failed:', error)
    notify.error(`Kitchen token print failed: ${error.message}`)
  } finally {
    setIsPrinting(false)
  }
}

  const handleNewOrder = () => {
    const sourcePage = orderData?.sourcePage
    if (sourcePage === 'new-order') {
      router.push('/new-order')
    } else if (sourcePage === 'walkin' || orderData?.orderType === 'walkin') {
      router.push('/walkin')
    } else if (sourcePage === 'takeaway' || orderData?.orderType === 'takeaway') {
      router.push('/takeaway')
    } else if (sourcePage === 'delivery' || orderData?.orderType === 'delivery') {
      router.push('/delivery')
    } else {
      router.push('/dashboard')
    }
  }

  const handleViewOrder = () => {
    router.push('/orders/')
  }

  // Handle split payment button click - just opens modal (no order creation yet)
  const handleSplitPaymentClick = () => {
    setShowSplitPaymentModal(true)
  }

  // Handle payment completion from split payment modal - creates order + processes payment
  const handleSplitPaymentComplete = async (payments) => {
    if (!orderData) return

    setIsProcessing(true)

    try {
      const currentUser = authManager.getCurrentUser()
      const currentSession = authManager.getCurrentSession()
      const cashier = authManager.getCashier()

      // Prepare order items
      const orderItems = orderData.cart.map(item => {
        if (item.isDeal) {
          return {
            deal_id: item.dealId,
            product_id: null,
            variant_id: null,
            product_name: item.dealName,
            variant_name: null,
            base_price: item.baseDealPrice || item.finalPrice,
            variant_price: item.priceAdjustment || 0,
            final_price: item.finalPrice,
            quantity: item.quantity,
            total_price: item.totalPrice,
            is_deal: true,
            deal_products: JSON.stringify(item.dealProducts)
          }
        } else {
          return {
            product_id: item.productId,
            variant_id: item.variantId,
            product_name: item.productName,
            variant_name: item.variantName,
            base_price: item.basePrice,
            variant_price: item.variantPrice || 0,
            final_price: item.finalPrice,
            quantity: item.quantity,
            total_price: item.totalPrice,
            is_deal: false
          }
        }
      })

      // Prepare delivery/takeaway times
      let deliveryTimeForDB = null
      if (orderData.deliveryTime) {
        const today = new Date()
        const [hours, minutes] = orderData.deliveryTime.split(':')
        today.setHours(parseInt(hours), parseInt(minutes), 0, 0)
        deliveryTimeForDB = today.toISOString()
      }

      let takeawayTimeForDB = null
      if (orderData.takeawayTime) {
        takeawayTimeForDB = orderData.takeawayTime
      }

      // Calculate total amount being paid
      const totalPaidAmount = payments.reduce((sum, p) => sum + p.amount, 0)

      // Determine payment status
      const paymentStatus = Math.abs(totalPaidAmount - orderData.total) < 0.01 ? 'Paid' : 'Partial'

      // Create order with split payment info (or update existing if modifying offline)
      const { order, orderNumber: newOrderNumber, dailySerial: newDailySerial } = await cacheManager.createOrder({
        user_id: currentUser.id,
        cashier_id: cashier?.id || orderData.cashierId || null,
        session_id: currentSession?.id || orderData.sessionId || null,
        customer_id: orderData.customer?.id || null,
        order_type: orderData.orderType,
        order_type_id: orderData.orderTypeId || null, // 🆕 Added for inventory deduction
        subtotal: orderData.subtotal,
        discount_amount: discountAmount || 0,
        discount_percentage: discountType === 'percentage' ? discountValue : 0,
        service_charge_amount: serviceChargeAmount || 0,
        service_charge_percentage: serviceChargeType === 'percentage' ? serviceChargeValue : 0,
        delivery_charges: orderData.deliveryCharges || 0,
        delivery_boy_id: orderData.deliveryBoyId || null,
        delivery_address: orderData.deliveryAddress || '',
        table_id: orderData.tableId || null,
        total_amount: orderData.total,
        payment_method: 'Split',
        payment_status: paymentStatus,
        amount_paid: totalPaidAmount,
        order_status: orderData.isModifying && orderData.originalOrderStatus
          ? orderData.originalOrderStatus
          : 'Pending',
        order_instructions: orderData.orderInstructions || '',
        delivery_time: deliveryTimeForDB,
        takeaway_time: takeawayTimeForDB,
        loyalty_points_redeemed: loyaltyRedemption?.pointsToRedeem || 0, // Add loyalty points
        loyalty_discount_amount: loyaltyDiscountAmount || 0, // Add loyalty discount
        items: orderItems,
        // Pass modification info for offline mode
        isModifying: orderData.isModifying || false,
        existingOrderId: orderData.existingOrderId || null,
        existingOrderNumber: orderData.existingOrderNumber || null,
        detailedChanges: orderData.detailedChanges || null // Pass detailed changes for history tracking
      })

      setOrderNumber(newOrderNumber)
      setIsOfflineOrder(order._isOffline)

      console.log(`✅ Order ${newOrderNumber} created with split payment`)
      console.log('📋 Order details:', { orderId: order.id, userId: order.user_id, isOffline: order._isOffline })
      console.log('👤 Current user:', { id: currentUser.id, name: currentUser.customer_name })
      console.log('💰 Payments to process:', payments)

      // Helper function to check if string is valid UUID
      const isValidUUID = (str) => {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
        return uuidRegex.test(str)
      }

      // Store split payment transactions in database
      // Only call database function if order has a real UUID (not temporary string ID)
      if (!order._isOffline && order.id && isValidUUID(order.id)) {
        try {
          console.log('🔄 Calling processSplitPayment with:', {
            orderId: order.id,
            userId: currentUser.id,
            paymentsCount: payments.length
          })

          const paymentResult = await paymentTransactionManager.processSplitPayment(
            order.id,
            currentUser.id,
            payments,
            currentUser.id // recorded_by
          )

          if (paymentResult.success) {
            console.log(`✅ Split payment transactions stored:`, paymentResult)
            // Also cache for offline fallback
            const transactions = payments.map(p => ({
              order_id: order.id,
              payment_method: p.method,
              amount: p.amount,
              reference_number: p.reference || null,
              notes: p.notes || null,
              created_at: new Date().toISOString()
            }))
            cacheManager.setPaymentTransactions(order.id, transactions)
          } else {
            console.warn('⚠️ Payment transaction recording failed:', paymentResult.error)
          }
        } catch (paymentError) {
          console.error('⚠️ Payment transaction recording failed:', paymentError)
          // Don't fail the order creation, just log the error
        }
      } else {
        // CRITICAL FIX: Cache payment transactions for offline orders
        console.log('📴 [Split Payment] OFFLINE - Caching payment transactions for later sync')
        console.log('📴 [Split Payment] Order ID:', order.id)
        console.log('📴 [Split Payment] Payments:', payments)

        // Prepare transactions for caching
        const transactions = payments.map(p => ({
          order_id: order.id,
          payment_method: p.method,
          amount: p.amount,
          reference_number: p.reference || null,
          notes: p.notes || null,
          created_at: new Date().toISOString()
        }))

        // Cache the transactions - they will be synced when going online
        cacheManager.setPaymentTransactions(order.id, transactions)

        console.log('✅ [Split Payment] Payment transactions cached for order:', order.id)
        console.log('✅ [Split Payment] Cached transactions:', transactions)
      }

      notify.success(`Payment collected! Rs ${totalPaidAmount.toFixed(2)} paid`)

      // Update table status for walkin orders
      if (orderData.orderType === 'walkin' && orderData.tableId) {
        await cacheManager.updateTableStatus(orderData.tableId, 'occupied')
      }

      // Store for printing
      localStorage.setItem('final_order_data', JSON.stringify({
        ...orderData,
        orderNumber: newOrderNumber,
        dailySerial: newDailySerial || orderData.dailySerial || null,
        paymentMethod: 'Split',
        cashReceived: null,
        changeAmount: 0,
        cashierName: cashier?.name || currentUser?.customer_name,
        cashierId: cashier?.id || null,
        discountAmount: discountAmount || 0,
        discountType: discountType,
        discountValue: discountValue,
        tableId: orderData.tableId || null,
        tableName: orderData.tableName || null,
        splitPayments: payments
      }))

      playBeepSound()

      // Clear saved order data
      localStorage.removeItem('order_data')
      localStorage.removeItem('walkin_cart')
      localStorage.removeItem('walkin_customer')
      localStorage.removeItem('walkin_instructions')
      localStorage.removeItem('walkin_modifying_order')
      localStorage.removeItem('walkin_modifying_order_number')
      localStorage.removeItem('walkin_original_state')
      localStorage.removeItem('walkin_original_order_status')
      localStorage.removeItem('walkin_original_payment_status')
      localStorage.removeItem('walkin_original_amount_paid')
      localStorage.removeItem('walkin_original_payment_method')
      localStorage.removeItem('walkin_can_decrease_qty')
      localStorage.removeItem('walkin_table')
      localStorage.removeItem('walkin_reopened')
      localStorage.removeItem('delivery_cart')
      localStorage.removeItem('delivery_customer')
      localStorage.removeItem('delivery_instructions')
      localStorage.removeItem('delivery_time')
      localStorage.removeItem('delivery_charges')
      localStorage.removeItem('delivery_boy_id')
      localStorage.removeItem('delivery_reopened')
      localStorage.removeItem('delivery_original_order')
      localStorage.removeItem('delivery_modifying_order')
      localStorage.removeItem('delivery_modifying_order_number')
      localStorage.removeItem('delivery_original_state')
      localStorage.removeItem('delivery_order_data')
      localStorage.removeItem('delivery_discount')
      localStorage.removeItem('delivery_original_order_status')
      localStorage.removeItem('delivery_original_payment_status')
      localStorage.removeItem('delivery_original_amount_paid')
      localStorage.removeItem('delivery_original_payment_method')
      localStorage.removeItem('delivery_can_decrease_qty')
      localStorage.removeItem('takeaway_cart')
      localStorage.removeItem('takeaway_customer')
      localStorage.removeItem('takeaway_instructions')
      localStorage.removeItem('takeaway_pickup_time')
      localStorage.removeItem('takeaway_modifying_order')
      localStorage.removeItem('takeaway_modifying_order_number')
      localStorage.removeItem('takeaway_original_state')
      localStorage.removeItem('takeaway_discount')
      localStorage.removeItem('takeaway_original_order_status')
      localStorage.removeItem('takeaway_original_payment_status')
      localStorage.removeItem('takeaway_original_amount_paid')
      localStorage.removeItem('takeaway_original_payment_method')
      localStorage.removeItem('takeaway_can_decrease_qty')
      localStorage.removeItem('takeaway_reopened')

      // Clear new-order page shared cart/customer/instructions
      if (orderData?.sourcePage === 'new-order') {
        localStorage.removeItem('new_order_cart')
        localStorage.removeItem('new_order_customer')
        localStorage.removeItem('new_order_instructions')
        localStorage.removeItem('new_order_walkin_table')
        const sourceKeySplit = orderData?.sourceStorageKey
        if (sourceKeySplit) localStorage.removeItem(`${sourceKeySplit}_extras`)
      }

      // Close modal and show order complete
      setShowSplitPaymentModal(false)
      setOrderComplete(true)

    } catch (error) {
      console.error('Error processing split payment:', error)
      notify.error(`Failed to process split payment: ${error.message}`)
    } finally {
      setIsProcessing(false)
    }
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  if (!orderData) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${classes.background}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
          <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading order...</p>
        </div>
      </div>
    )
  }
if (orderComplete) {
  return (
    <div className={`min-h-screen ${classes.background} flex items-center justify-center p-4 transition-all duration-500`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`${classes.card} rounded-3xl ${classes.shadow} shadow-2xl p-8 max-w-md w-full text-center ${classes.border} border`}
      >
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
          className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
            isOfflineOrder
              ? isDark ? 'bg-orange-900/30' : 'bg-orange-100'
              : isDark ? 'bg-green-900/30' : 'bg-green-100'
          }`}
        >
          {isOfflineOrder ? (
            <WifiOff className={`w-10 h-10 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
          ) : (
            <Check className={`w-10 h-10 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
          )}
        </motion.div>

        <h1 className={`text-2xl font-bold ${classes.textPrimary} mb-2`}>
          {isOfflineOrder ? 'Order Saved!' : 'Order Confirmed!'}
        </h1>
        <p className={`${classes.textSecondary} mb-6`}>
          {isOfflineOrder
            ? 'Order saved locally and will sync when online'
            : 'Your order has been successfully placed'
          }
        </p>

        {/* Network Status Warning */}
        {isOfflineOrder && (
          <div className={`${isDark ? 'bg-orange-900/20 border-orange-700/30' : 'bg-orange-50 border-orange-200'} border rounded-lg p-3 mb-6`}>
            <div className="flex items-center justify-center space-x-2">
              <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
              <span className={`${isDark ? 'text-orange-300' : 'text-orange-700'} text-sm font-medium`}>
                Working in offline mode
              </span>
            </div>
            <p className={`${isDark ? 'text-orange-400' : 'text-orange-600'} text-xs mt-1`}>
              Order will automatically sync when internet is restored
            </p>
          </div>
        )}

        <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-2xl p-4 mb-6 ${classes.border} border`}>
          <p className={`text-sm ${classes.textSecondary} mb-1`}>Order Number</p>
          <p className="text-2xl font-bold text-purple-600">{orderNumber}</p>
        </div>

        <div className="space-y-2 mb-6 text-left">
          <div className="flex justify-between">
            <span className={classes.textSecondary}>Total Amount:</span>
            <span className={`font-semibold ${classes.textPrimary}`}>
              Rs {orderData.total.toFixed(2)}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={classes.textSecondary}>Payment Method:</span>
            <span className={`font-semibold ${classes.textPrimary}`}>
              {(() => {
                // Try to get payment method from localStorage (for split payments)
                try {
                  const finalOrderData = localStorage.getItem('final_order_data')
                  if (finalOrderData) {
                    const orderData = JSON.parse(finalOrderData)
                    if (orderData.paymentMethod === 'Split') {
                      return '🔀 Split Payment'
                    }
                  }
                } catch (e) {
                  // Ignore parsing errors
                }
                // Fall back to selected payment method
                return selectedPaymentMethod?.name || 'N/A'
              })()}
            </span>
          </div>
          <div className="flex justify-between">
            <span className={classes.textSecondary}>Order Type:</span>
            <span className={`font-semibold ${classes.textPrimary} capitalize`}>{orderData.orderType}</span>
          </div>
          {/* Show table info for walkin orders */}
          {orderData.orderType === 'walkin' && orderData.tableName && (
            <div className="flex justify-between">
              <span className={classes.textSecondary}>Table:</span>
              <span className={`font-semibold ${classes.textPrimary}`}>{orderData.tableName}</span>
            </div>
          )}
          {/* Show takeaway time for takeaway orders */}
          {orderData.orderType === 'takeaway' && orderData.takeawayTime && (
            <div className="flex justify-between">
              <span className={classes.textSecondary}>Pickup Time:</span>
              <span className={`font-semibold ${classes.textPrimary}`}>{orderData.takeawayTime}</span>
            </div>
          )}
          {/* Show delivery info for delivery orders */}
          {orderData.orderType === 'delivery' && (
            <>
              {orderData.deliveryTime && (
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Delivery Time:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>{orderData.deliveryTime}</span>
                </div>
              )}
              {parseFloat(orderData.deliveryCharges) > 0 && (
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Delivery Charges:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>Rs {parseFloat(orderData.deliveryCharges).toFixed(2)}</span>
                </div>
              )}
              {orderData.deliveryAddress && (
                <div className="flex justify-between items-start">
                  <span className={`${classes.textSecondary} flex-shrink-0 mr-2`}>Address:</span>
                  <span className={`font-semibold ${classes.textPrimary} text-right text-sm`}>{orderData.deliveryAddress}</span>
                </div>
              )}
            </>
          )}
          {discountAmount > 0 && (
            <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              <span>Discount Applied:</span>
              <span className="font-semibold">Rs {discountAmount.toFixed(2)}</span>
            </div>
          )}
          {loyaltyDiscountAmount > 0 && (
            <div className={`flex justify-between ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
              <span>Loyalty Discount ({loyaltyRedemption?.pointsToRedeem} pts):</span>
              <span className="font-semibold">Rs {loyaltyDiscountAmount.toFixed(2)}</span>
            </div>
          )}
          {selectedPaymentMethod?.id === 'cash' && changeAmount > 0 && (
            <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              <span>Change to Return:</span>
              <span className="font-semibold">Rs {changeAmount.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between">
            <span className={classes.textSecondary}>Status:</span>
            <span className={`font-semibold ${
              isOfflineOrder
                ? isDark ? 'text-orange-400' : 'text-orange-600'
                : isDark ? 'text-green-400' : 'text-green-600'
            }`}>
              {isOfflineOrder ? 'Saved Offline' : 'Synced Online'}
            </span>
          </div>
        </div>

        {/* NEW BUTTON LAYOUT - 2 ROWS */}
        <div className="space-y-3">
          {/* Row 1: New Order & View Order */}
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleNewOrder}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all duration-200"
            >
              New Order
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleViewOrder}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center"
            >
              <Eye className="w-5 h-5 mr-2" />
              View Order
            </motion.button>
          </div>

          {/* Row 2: Print Receipt & Token Number */}
          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleThermalPrint}
              disabled={isPrinting}
              className={`px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center ${
                isPrinting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isPrinting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Printing...
                </>
              ) : (
                <>
                  <Printer className="w-5 h-5 mr-2" />
                  Receipt
                </>
              )}
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handlePrintKitchenToken}
              disabled={isPrinting}
              className={`px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center ${
                isPrinting ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {isPrinting ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                  Printing...
                </>
              ) : (
                <>
                  <Volume2 className="w-5 h-5 mr-2" />
                  Kitchen Token
                </>
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  )
}
  return (
    <div className={`h-screen flex flex-col ${classes.background} transition-all duration-500 overflow-hidden`}>
      {/* Compact Header */}
      <div className={`${classes.header} backdrop-blur-lg ${classes.border} border-b ${classes.shadow} shadow-sm`}>
        <div className="max-w-full flex items-center justify-between px-4 py-2">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.back()}
              className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors`}
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              <span className="text-sm">Back to Order</span>
            </button>

            <div className="border-l pl-3 border-gray-300 dark:border-gray-700">
              <h1 className={`text-lg font-bold ${classes.textPrimary}`}>Complete Payment</h1>
              <p className={`text-xs ${classes.textSecondary}`}>
                Order Total: <span className="font-bold">Rs {orderData.total.toFixed(2)}</span> • Items: {orderData.cart.length}
                {!networkStatus.isOnline && <span className="text-orange-600 ml-2">• Offline</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className={`text-sm font-bold px-3 py-1 rounded ${isDark ? 'bg-purple-900/30 text-purple-400' : 'bg-purple-100 text-purple-600'}`}>
              {orderData.orderType.toUpperCase()}
            </div>

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className={`p-2 rounded-lg ${classes.button} transition-all`}
            >
              {isDark ? <Sun className="w-4 h-4 text-yellow-500" /> : <Moon className={`w-4 h-4 ${classes.textSecondary}`} />}
            </motion.button>
          </div>
        </div>
      </div>

      {/* Compact Content - NO SCROLLING */}
      <div className="flex-1 overflow-hidden p-3">
        <div className="h-full grid grid-cols-[55%_45%] gap-3">

          {/* LEFT COLUMN - Payment Controls (scrollable when needed) */}
          <div className="flex flex-col gap-3 overflow-y-auto">

            {/* Smart Discount Section - COMPACT */}
            <div className={`${classes.card} rounded-lg ${classes.border} border p-2`}>
              <div className="flex items-center justify-between mb-1">
                <h2 className={`text-sm font-bold ${classes.textPrimary} flex items-center`}>
                  <Tag className="w-3.5 h-3.5 mr-1 text-purple-600" />
                  Discount
                </h2>
                <button
                  onClick={() => setShowDiscountSection(!showDiscountSection)}
                  className={`px-2 py-1 rounded text-xs ${classes.button} font-medium`}
                >
                  {showDiscountSection ? 'Hide' : 'Add'}
                </button>
              </div>

              {showDiscountSection && (
                <div className="space-y-2">
                  {/* Quick Discount Options - Compact Grid */}
                  <div>
                    <label className={`block text-xs ${classes.textSecondary} mb-1`}>Quick</label>
                    <div className="grid grid-cols-6 gap-1">
                      {smartDiscounts.map((discount, index) => (
                        <button
                          key={index}
                          onClick={() => handleSmartDiscount(discount)}
                          className={`p-1 rounded text-xs font-semibold ${discountType === discount.type && discountValue === discount.value
                              ? 'bg-purple-600 text-white'
                              : `${classes.button} ${classes.textPrimary}`
                            }`}
                        >
                          {discount.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Manual Discount Input - Compact */}
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Type</label>
                      <select
                        value={discountType}
                        onChange={(e) => {
                          setDiscountType(e.target.value)
                          setDiscountValue(0)
                        }}
                        className={`w-full px-2 py-1 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                      >
                        <option value="percentage">%</option>
                        <option value="fixed">Rs</option>
                      </select>
                    </div>

                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Value</label>
                      <input
                        type="number"
                        value={discountValue || ''}
                        onChange={(e) => handleDiscountValueChange(e.target.value)}
                        placeholder="0"
                        max={discountType === 'percentage' ? 100 : originalSubtotal}
                        min="0"
                        className={`w-full px-2 py-1 text-xs ${classes.input} rounded focus:ring-1 focus:ring-purple-500`}
                      />
                    </div>

                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Amount</label>
                      <div className={`px-2 py-1 text-xs ${isDark ? 'bg-green-900/20' : 'bg-green-50'} rounded border ${isDark ? 'border-green-700/30' : 'border-green-200'} font-bold text-green-600`}>
                        Rs {discountAmount.toFixed(0)}
                      </div>
                    </div>
                  </div>

                  {/* Remove Discount Button */}
                  {discountAmount > 0 && (
                    <button
                      onClick={removeDiscount}
                      className="flex items-center px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Service Charge Section */}
            <div className={`${classes.card} rounded-lg ${classes.border} border p-2`}>
              <div className="flex items-center justify-between mb-1">
                <h2 className={`text-sm font-bold ${classes.textPrimary} flex items-center`}>
                  <span className="w-3.5 h-3.5 mr-1 text-orange-500 font-bold text-xs">%</span>
                  Service Charge
                </h2>
                <button
                  onClick={() => setShowServiceChargeSection(!showServiceChargeSection)}
                  className={`px-2 py-1 rounded text-xs ${classes.button} font-medium`}
                >
                  {showServiceChargeSection ? 'Hide' : 'Add'}
                </button>
              </div>

              {showServiceChargeSection && (
                <div className="space-y-2">
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Type</label>
                      <select
                        value={serviceChargeType}
                        onChange={(e) => { setServiceChargeType(e.target.value); setServiceChargeValue(0) }}
                        className={`w-full px-2 py-1 text-xs ${classes.input} rounded focus:ring-1 focus:ring-orange-500`}
                      >
                        <option value="percentage">%</option>
                        <option value="fixed">Rs</option>
                      </select>
                    </div>
                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Value</label>
                      <input
                        type="number"
                        value={serviceChargeValue || ''}
                        onChange={(e) => setServiceChargeValue(Math.max(0, parseFloat(e.target.value) || 0))}
                        placeholder="0"
                        min="0"
                        className={`w-full px-2 py-1 text-xs ${classes.input} rounded focus:ring-1 focus:ring-orange-500`}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs ${classes.textSecondary} mb-1`}>Amount</label>
                      <div className={`px-2 py-1 text-xs ${isDark ? 'bg-orange-900/20' : 'bg-orange-50'} rounded border ${isDark ? 'border-orange-700/30' : 'border-orange-200'} font-bold text-orange-600`}>
                        Rs {serviceChargeAmount.toFixed(0)}
                      </div>
                    </div>
                  </div>
                  {serviceChargeAmount > 0 && (
                    <button
                      onClick={() => { setServiceChargeValue(0); setServiceChargeAmount(0) }}
                      className="flex items-center px-2 py-1 text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded"
                    >
                      <X className="w-3 h-3 mr-1" />
                      Remove
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Payment Methods Grid - COMPACT */}
            <div className={`${classes.card} rounded-lg ${classes.border} border p-2 flex-1 overflow-hidden flex flex-col`}>
              <h2 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Payment Method</h2>

              <div className="grid grid-cols-3 gap-2 mb-2">
                {paymentMethods.map((method) => {
                  const isDisabled = method.requiresCustomer && !orderData.customer
                  return (
                    <button
                      key={method.id}
                      onClick={() => handlePaymentMethodSelect(method)}
                      disabled={isDisabled}
                      className={`p-2 rounded-lg border ${
                        isDisabled
                          ? `opacity-50 cursor-not-allowed ${classes.border} ${classes.card}`
                          : selectedPaymentMethod?.id === method.id
                          ? `border-purple-500 ${isDark ? 'bg-purple-900/20' : 'bg-purple-50'}`
                          : `${classes.border} ${classes.card}`
                      }`}
                      title={isDisabled ? 'Requires customer selection' : ''}
                    >
                    <div className="flex flex-col items-center">
                      {method.logo ? (
                        <div className="w-8 h-8 relative mb-1">
                          <Image
                            src={method.logo}
                            alt={method.name}
                            fill
                            className="object-contain"
                          />
                        </div>
                      ) : (
                        <div className={`w-8 h-8 bg-gradient-to-r ${method.color} rounded flex items-center justify-center mb-1`}>
                          <method.icon className="w-4 h-4 text-white" />
                        </div>
                      )}
                      <h3 className={`text-[10px] font-semibold text-center ${
                        isDisabled
                          ? classes.textSecondary
                          : selectedPaymentMethod?.id === method.id
                          ? isDark ? 'text-purple-300' : 'text-purple-700'
                          : classes.textPrimary
                        }`}>
                        {method.displayName || method.name}
                      </h3>
                    </div>
                  </button>
                  )
                })}
              </div>

              {/* Customer Account Panel */}
              {selectedPaymentMethod?.id === 'account' && orderData.customer && (
                <div className={`mb-2 rounded-lg border ${isDark ? 'bg-purple-900/20 border-purple-700/30' : 'bg-purple-50 border-purple-200'} overflow-hidden`}>
                  {/* Customer name header */}
                  <div className={`px-3 py-1.5 border-b ${isDark ? 'border-purple-700/30 bg-purple-900/30' : 'border-purple-200 bg-purple-100/60'}`}>
                    <p className={`text-xs font-semibold ${isDark ? 'text-purple-200' : 'text-purple-900'}`}>
                      {orderData.customer.full_name || orderData.customer.first_name + ' ' + orderData.customer.last_name || 'Customer'}
                    </p>
                  </div>
                  {/* Stats row */}
                  <div className="grid grid-cols-2 divide-x divide-purple-200/40 px-0">
                    <div className="p-2 text-center">
                      <p className={`text-[9px] uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Balance Owed</p>
                      <p className={`text-xs font-bold ${isDark ? 'text-orange-300' : 'text-orange-600'}`}>
                        {loadingLedgerBalance ? '...' : `Rs ${customerLedgerBalance.toFixed(0)}`}
                      </p>
                    </div>
                    <div className="p-2 text-center">
                      <p className={`text-[9px] uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Order Total</p>
                      <p className={`text-xs font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
                        Rs {orderData.total.toFixed(0)}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Split Payment Button - Compact */}
              <button
                onClick={handleSplitPaymentClick}
                disabled={isProcessing}
                className={`w-full py-2 rounded-lg text-xs font-semibold ${
                  isProcessing
                    ? 'bg-gray-400 cursor-not-allowed'
                    : isDark
                    ? 'bg-gradient-to-r from-orange-600 to-orange-700'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600'
                } text-white flex items-center justify-center`}
              >
                {isProcessing ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                    Creating...
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3 h-3 mr-1" />
                    Split Payment
                  </>
                )}
              </button>
            </div>

            {/* Cash Amount Input - COMPACT */}
            {selectedPaymentMethod?.requiresAmount && (
              <div className={`${classes.card} rounded-lg ${classes.border} border p-2`}>
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Cash Details</h3>

                {/* Quick Amount Buttons - Compact */}
                <div className="mb-3">
                  <label className={`block text-xs ${classes.textSecondary} mb-1`}>Quick</label>
                  <div className="grid grid-cols-6 gap-1.5">
                    {quickAmounts.map((amount) => (
                      <button
                        key={amount}
                        onClick={() => handleQuickAmount(amount)}
                        className={`p-1 rounded text-[10px] font-semibold relative ${parseInt(cashAmount) === amount
                            ? 'bg-purple-600 text-white'
                            : `${classes.button} ${classes.textPrimary}`
                          }`}
                      >
                        {amount}
                        {amount === Math.ceil(orderData.total) && (
                          <div className="absolute -top-0.5 -right-0.5 bg-green-500 text-white text-[8px] px-1 rounded-full">
                            ✓
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Manual Amount Input - Compact Grid */}
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <label className={`block text-xs ${classes.textSecondary} mb-1`}>Received</label>
                    <input
                      type="number"
                      value={cashAmount}
                      onChange={(e) => handleCashAmountChange(e.target.value)}
                      placeholder="0"
                      className={`w-full px-2 py-1 ${classes.border} border rounded text-xs font-semibold ${classes.input} ${classes.textPrimary}`}
                      min={orderData.total}
                      step="0.01"
                    />
                  </div>

                  <div>
                    <label className={`block text-xs ${classes.textSecondary} mb-1`}>Total</label>
                    <div className={`px-2 py-1 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} ${classes.border} border rounded text-xs font-semibold ${classes.textPrimary}`}>
                      {orderData.total.toFixed(0)}
                    </div>
                  </div>

                  <div>
                    <label className={`block text-xs ${classes.textSecondary} mb-1`}>Change</label>
                    <div className={`px-2 py-1 border rounded text-xs font-bold ${changeAmount > 0
                        ? `${isDark ? 'bg-green-900/20 border-green-700/30 text-green-400' : 'bg-green-50 border-green-200 text-green-600'}`
                        : `${isDark ? 'bg-gray-700/50 border-gray-600 text-gray-400' : 'bg-gray-50 border-gray-200 text-gray-500'}`
                      }`}>
                      {changeAmount.toFixed(0)}
                    </div>
                  </div>
                </div>

                {/* Insufficient Amount Warning - Compact */}
                {cashAmount && parseFloat(cashAmount) < orderData.total && (
                  <div className={`p-1.5 rounded border text-xs ${isDark
                        ? 'bg-red-900/20 border-red-800/30'
                        : 'bg-red-50 border-red-200'
                      }`}>
                    <div className="flex items-center">
                      <AlertTriangle className={`w-3 h-3 mr-1 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                      <p className={`font-medium ${isDark ? 'text-red-300' : 'text-red-700'}`}>
                        Need Rs {(orderData.total - parseFloat(cashAmount)).toFixed(0)} more
                      </p>
                    </div>
                  </div>
                )}

                {/* Overpayment Success - Compact */}
                {changeAmount > 0 && (
                  <div className={`p-1.5 rounded border text-xs ${isDark
                        ? 'bg-green-900/20 border-green-800/30'
                        : 'bg-green-50 border-green-200'
                      }`}>
                    <div className="flex items-center">
                      <CheckCircle className={`w-3 h-3 mr-1 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                      <p className={`font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                        Change: Rs {changeAmount.toFixed(0)}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Loyalty Redemption Section - Compact */}
            {orderData.customer && (
              <LoyaltyRedemption
                customer={orderData.customer}
                orderTotal={originalSubtotal - discountAmount}
                onRedemptionApplied={handleRedemptionApplied}
                onRedemptionRemoved={handleRedemptionRemoved}
                theme={theme}
                loyaltyManager={loyaltyManager}
                compact={true}
              />
            )}
          </div>

          {/* RIGHT COLUMN - Order Summary */}
          <div className={`${classes.card} rounded-lg ${classes.border} border p-2 overflow-hidden flex flex-col`}>
            <h2 className={`text-sm font-bold ${classes.textPrimary} mb-2`}>Order Summary</h2>

            {/* Modification Preview - Shows when modifying an order */}
            {orderData.isModifying && orderData.detailedChanges && (
              <div className={`mb-2 p-2 ${isDark ? 'bg-blue-900/30 border-blue-700/50' : 'bg-blue-50 border-blue-300'} rounded border`}>
                <div className="flex items-center mb-2">
                  <Eye className={`w-3.5 h-3.5 mr-1.5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                  <h3 className={`text-xs font-bold ${isDark ? 'text-blue-300' : 'text-blue-900'}`}>
                    Order Modified - Changes Preview
                  </h3>
                </div>

                {/* Items Added */}
                {orderData.detailedChanges.itemsAdded && orderData.detailedChanges.itemsAdded.length > 0 && (
                  <div className="mb-2">
                    <h4 className={`text-[10px] font-semibold ${isDark ? 'text-green-400' : 'text-green-700'} mb-1`}>
                      ✅ Items Added ({orderData.detailedChanges.itemsAdded.length})
                    </h4>
                    <div className="space-y-0.5">
                      {orderData.detailedChanges.itemsAdded.map((item, idx) => (
                        <div key={idx} className={`text-[10px] ${isDark ? 'text-green-300' : 'text-green-600'} pl-2`}>
                          • {item.quantity}x {item.name}
                          {item.variant && ` (${item.variant})`}
                          <span className="ml-1 font-semibold">+Rs {item.price.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Items Modified */}
                {orderData.detailedChanges.itemsModified && orderData.detailedChanges.itemsModified.length > 0 && (
                  <div className="mb-2">
                    <h4 className={`text-[10px] font-semibold ${isDark ? 'text-orange-400' : 'text-orange-700'} mb-1`}>
                      🔄 Items Modified ({orderData.detailedChanges.itemsModified.length})
                    </h4>
                    <div className="space-y-0.5">
                      {orderData.detailedChanges.itemsModified.map((item, idx) => (
                        <div key={idx} className={`text-[10px] ${isDark ? 'text-orange-300' : 'text-orange-600'} pl-2`}>
                          • {item.name}
                          {item.variant && ` (${item.variant})`}
                          <div className={`ml-2 ${isDark ? 'text-orange-200' : 'text-orange-500'}`}>
                            Quantity: <span className="line-through">{item.oldQuantity}</span> → <span className="font-semibold">{item.newQuantity}</span>
                            {' | '}
                            Price: <span className="line-through">Rs {item.oldPrice.toFixed(0)}</span> → <span className="font-semibold">Rs {item.newPrice.toFixed(0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Items Removed */}
                {orderData.detailedChanges.itemsRemoved && orderData.detailedChanges.itemsRemoved.length > 0 && (
                  <div className="mb-2">
                    <h4 className={`text-[10px] font-semibold ${isDark ? 'text-red-400' : 'text-red-700'} mb-1`}>
                      ❌ Items Removed ({orderData.detailedChanges.itemsRemoved.length})
                    </h4>
                    <div className="space-y-0.5">
                      {orderData.detailedChanges.itemsRemoved.map((item, idx) => (
                        <div key={idx} className={`text-[10px] ${isDark ? 'text-red-300' : 'text-red-600'} pl-2 line-through`}>
                          • {item.quantity}x {item.name}
                          {item.variant && ` (${item.variant})`}
                          <span className="ml-1">Rs {item.price.toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Total Change */}
                {orderData.detailedChanges.oldTotal !== undefined && orderData.detailedChanges.newTotal !== undefined && (
                  <div className={`pt-2 mt-2 ${classes.border} border-t`}>
                    <div className="flex justify-between items-center">
                      <span className={`text-[10px] ${classes.textSecondary}`}>Total Change:</span>
                      <div className="text-right">
                        <span className={`text-[10px] ${classes.textSecondary} line-through`}>
                          Rs {orderData.detailedChanges.oldTotal.toFixed(0)}
                        </span>
                        <span className={`ml-2 text-xs font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          → Rs {orderData.detailedChanges.newTotal.toFixed(0)}
                        </span>
                        <div className={`text-[10px] mt-0.5 ${
                          orderData.detailedChanges.newTotal > orderData.detailedChanges.oldTotal
                            ? (isDark ? 'text-orange-400' : 'text-orange-600')
                            : (isDark ? 'text-green-400' : 'text-green-600')
                        }`}>
                          {orderData.detailedChanges.newTotal > orderData.detailedChanges.oldTotal ? '+' : ''}
                          Rs {(orderData.detailedChanges.newTotal - orderData.detailedChanges.oldTotal).toFixed(0)}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Order Items - Compact Scrollable */}
            <div className="flex-1 overflow-y-auto space-y-1 mb-2">
              {orderData.cart.map((item, index) => (
                <div key={index} className={`flex justify-between items-start p-1.5 ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded ${classes.border} border`}>
                  <div className="flex-1 min-w-0">
                    <h4 className={`text-xs font-semibold ${classes.textPrimary} truncate`}>
                      {item.isDeal ? item.dealName : item.productName}
                    </h4>
                    {item.isDeal && item.dealProducts && item.dealProducts.length > 0 && (
                      <div className={`text-[10px] ${classes.textSecondary}`}>
                        {item.dealProducts.map((dp, dpIndex) => {
                          const flavorName = dp.flavor ? (typeof dp.flavor === 'object' ? dp.flavor.name : dp.flavor) : null;
                          return (
                            <div key={dpIndex}>
                              • {dp.quantity}x {dp.name}{flavorName ? ` (${flavorName})` : ''}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {!item.isDeal && item.variantName && (
                      <p className={`text-[10px] ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>Size: {item.variantName}</p>
                    )}
                    <p className={`text-[10px] ${classes.textSecondary}`}>
                      {item.quantity} × Rs {item.finalPrice.toFixed(0)}
                    </p>
                  </div>
                  <div className="text-right ml-2">
                    <p className={`text-xs font-semibold ${classes.textPrimary}`}>
                      Rs {item.totalPrice.toFixed(0)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {/* Totals - Compact */}
            <div className={`space-y-1 mb-2 ${classes.border} border-t pt-2`}>
              <div className="flex justify-between text-xs">
                <span className={classes.textSecondary}>Subtotal:</span>
                <span className={`font-semibold ${classes.textPrimary}`}>
                  Rs {originalSubtotal.toFixed(0)}
                </span>
              </div>
              {discountAmount > 0 && (
                <div className={`flex justify-between text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  <span>
                    Discount ({discountType === 'percentage' ? `${discountValue}%` : `Rs ${discountValue}`}):
                  </span>
                  <span className="font-semibold">-Rs {discountAmount.toFixed(0)}</span>
                </div>
              )}
              {loyaltyDiscountAmount > 0 && (
                <div className={`flex justify-between text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                  <span>
                    Loyalty ({loyaltyRedemption?.pointsToRedeem} pts):
                  </span>
                  <span className="font-semibold">-Rs {loyaltyDiscountAmount.toFixed(0)}</span>
                </div>
              )}
              {serviceChargeAmount > 0 && (
                <div className={`flex justify-between text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                  <span>
                    Service Charge ({serviceChargeType === 'percentage' ? `${serviceChargeValue}%` : `Rs ${serviceChargeValue}`}):
                  </span>
                  <span className="font-semibold">+Rs {serviceChargeAmount.toFixed(0)}</span>
                </div>
              )}
              {parseFloat(orderData.deliveryCharges) > 0 && (
                <div className={`flex justify-between text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                  <span>Delivery:</span>
                  <span className="font-semibold">+Rs {parseFloat(orderData.deliveryCharges).toFixed(0)}</span>
                </div>
              )}
              <div className={`flex justify-between text-base font-bold ${classes.textPrimary} ${classes.border} border-t pt-1.5 mt-1.5`}>
                <span>Total:</span>
                <span className="text-green-600">Rs {orderData.total.toFixed(0)}</span>
              </div>

              {/* Payment Breakdown for Modified PAID Orders */}
              {isModifiedPaidOrder && (
                <div className={`mt-2 p-2 ${isDark ? 'bg-orange-900/30 border-orange-700/50' : 'bg-orange-50 border-orange-300'} rounded border`}>
                  <h4 className={`text-[10px] font-bold ${isDark ? 'text-orange-300' : 'text-orange-900'} mb-1.5`}>
                    💳 Payment Breakdown
                  </h4>
                  <div className="space-y-0.5">
                    <div className="flex justify-between text-[10px]">
                      <span className={isDark ? 'text-orange-200' : 'text-orange-700'}>Previously Paid:</span>
                      <span className={`font-semibold ${isDark ? 'text-orange-100' : 'text-orange-800'}`}>
                        Rs {(orderData.detailedChanges?.oldTotal || orderData.originalState?.total || 0).toFixed(0)}
                      </span>
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className={isDark ? 'text-orange-200' : 'text-orange-700'}>New Order Total:</span>
                      <span className={`font-semibold ${isDark ? 'text-orange-100' : 'text-orange-800'}`}>
                        Rs {orderData.total.toFixed(0)}
                      </span>
                    </div>
                    <div className={`flex justify-between text-xs font-bold ${classes.border} border-t pt-1 mt-1`}>
                      <span className={isDark ? 'text-orange-300' : 'text-orange-900'}>Amount Due (Additional):</span>
                      <span className={`${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                        Rs {amountDue.toFixed(0)}
                      </span>
                    </div>
                  </div>
                  <p className={`text-[9px] mt-1.5 ${isDark ? 'text-orange-400' : 'text-orange-600'} italic`}>
                    ℹ️ Customer already paid Rs {(orderData.detailedChanges?.oldTotal || 0).toFixed(0)}. Only charging for additional items.
                  </p>
                </div>
              )}
            </div>

            {/* Customer Info - Compact */}
            {orderData.customer && (
              <div className={`mb-2 p-1.5 ${isDark ? 'bg-blue-900/20 border-blue-700/30' : 'bg-blue-50 border-blue-200'} rounded border`}>
                <h4 className={`font-semibold text-xs ${isDark ? 'text-blue-300' : 'text-blue-900'} mb-0.5`}>Customer</h4>
                {(orderData.customer.full_name?.trim() || orderData.customer.first_name) && (
                  <p className={`${isDark ? 'text-blue-200' : 'text-blue-700'} text-xs font-medium`}>
                    {orderData.customer.full_name?.trim() || [orderData.customer.first_name, orderData.customer.last_name].filter(Boolean).join(' ')}
                  </p>
                )}
                <p className={`${isDark ? 'text-blue-300' : 'text-blue-600'} text-[10px]`}>{orderData.customer.phone}</p>
                {orderData.orderType === 'delivery' && orderData.deliveryAddress && (
                  <div className="flex items-start mt-1">
                    <MapPin className={`w-3 h-3 mr-1 mt-0.5 ${isDark ? 'text-blue-400' : 'text-blue-600'} flex-shrink-0`} />
                    <p className={`${isDark ? 'text-blue-300' : 'text-blue-600'} text-[10px]`}>{orderData.deliveryAddress}</p>
                  </div>
                )}
                {orderData.customer._isTemp && (
                  <p className={`${isDark ? 'text-orange-400' : 'text-orange-600'} text-[8px] mt-0.5`}>* Will be created when online</p>
                )}
              </div>
            )}

            {/* Table Info - Compact */}
            {orderData.orderType === 'walkin' && orderData.tableName && (
              <div className={`mb-2 p-1.5 ${isDark ? 'bg-purple-900/20 border-purple-700/30' : 'bg-purple-50 border-purple-200'} rounded border`}>
                <div className="flex items-center mb-0.5">
                  <LayoutGrid className={`w-3 h-3 mr-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                  <h4 className={`font-semibold text-xs ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>
                    Table
                  </h4>
                </div>
                <p className={`${isDark ? 'text-purple-200' : 'text-purple-700'} text-[10px]`}>
                  {orderData.tableName}
                </p>
              </div>
            )}

            {/* Order Taker Info - Compact */}
            {(orderData.orderTakerName || orderData.orderTakerId) && (() => {
              const takerName = orderData.orderTakerName ||
                (orderData.orderTakerId ? cacheManager.getOrderTakers().find(t => t.id === orderData.orderTakerId)?.name : null)
              if (!takerName) return null
              return (
                <div className={`mb-2 p-1.5 ${isDark ? 'bg-indigo-900/20 border-indigo-700/30' : 'bg-indigo-50 border-indigo-200'} rounded border`}>
                  <div className="flex items-center mb-0.5">
                    <UserCheck className={`w-3 h-3 mr-1 ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`} />
                    <h4 className={`font-semibold text-xs ${isDark ? 'text-indigo-300' : 'text-indigo-900'}`}>Order Taker</h4>
                  </div>
                  <p className={`${isDark ? 'text-indigo-200' : 'text-indigo-700'} text-[10px]`}>{takerName}</p>
                </div>
              )
            })()}

            {/* Time Info - Compact */}
            {(orderData.takeawayTime || orderData.deliveryTime) && (
              <div className={`mb-2 p-1.5 ${isDark ? 'bg-purple-900/20 border-purple-700/30' : 'bg-purple-50 border-purple-200'} rounded border`}>
                <div className="flex items-center mb-0.5">
                  {orderData.orderType === 'delivery' ? (
                    <Truck className={`w-3 h-3 mr-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                  ) : (
                    <Clock className={`w-3 h-3 mr-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                  )}
                  <h4 className={`font-semibold text-xs ${isDark ? 'text-purple-300' : 'text-purple-900'}`}>
                    {orderData.orderType === 'delivery' ? 'Delivery' : 'Pickup'}
                  </h4>
                </div>
                <p className={`${isDark ? 'text-purple-200' : 'text-purple-700'} text-[10px]`}>
                  {orderData.deliveryTime || orderData.takeawayTime}
                </p>
              </div>
            )}

            {/* Instructions - Compact */}
            {orderData.orderInstructions && (
              <div className={`mb-2 p-1.5 ${isDark ? 'bg-orange-900/20 border-orange-700/30' : 'bg-orange-50 border-orange-200'} rounded border`}>
                <h4 className={`font-semibold text-xs ${isDark ? 'text-orange-300' : 'text-orange-900'} mb-0.5`}>Instructions</h4>
                <p className={`${isDark ? 'text-orange-200' : 'text-orange-700'} text-[10px]`}>{orderData.orderInstructions}</p>
              </div>
            )}


            {/* Complete Payment Button - Compact */}
            <button
              onClick={processOrder}
              disabled={!canProcessPayment() || isProcessing}
              className={`w-full py-2 rounded-lg font-bold text-sm flex items-center justify-center ${canProcessPayment() && !isProcessing
                  ? 'bg-green-600 hover:bg-green-700 text-white'
                  : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
                }`}
            >
              {isProcessing ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-1"></div>
                  Processing...
                </>
              ) : (
                <>
                  {networkStatus.isOnline ? (
                    <CheckCircle className="w-4 h-4 mr-1" />
                  ) : (
                    <Volume2 className="w-4 h-4 mr-1" />
                  )}
                  {networkStatus.isOnline
                    ? (selectedPaymentMethod?.id === 'account' || selectedPaymentMethod?.id === 'unpaid'
                        ? 'Place Order'
                        : 'Complete Payment')
                    : 'Save Order (Offline)'}
                </>
              )}
            </button>

            {!selectedPaymentMethod && (
              <p className={`text-center ${classes.textSecondary} text-[10px] mt-1`}>
                Please select a payment method above
              </p>
            )}

            {selectedPaymentMethod?.requiresAmount && !canProcessPayment() && (
              <p className={`text-center ${isDark ? 'text-red-400' : 'text-red-500'} text-[10px] mt-1`}>
                Please enter sufficient cash amount
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Split Payment Modal */}
      <SplitPaymentModal
        isOpen={showSplitPaymentModal}
        onClose={() => setShowSplitPaymentModal(false)}
        totalAmount={orderData?.total || 0}
        amountDue={amountDue || orderData?.total || 0}
        onPaymentComplete={handleSplitPaymentComplete}
        customer={orderData?.customer}
        title="Split Payment"
      />
    </div>
  )
}