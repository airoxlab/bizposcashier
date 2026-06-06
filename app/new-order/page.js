'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { triggerWhatsAppAutoSend } from '../../lib/whatsappAutoSend'
import { triggerAccountAutoSend } from '../../lib/accountAutoSend'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { printerManager } from '../../lib/printerManager'
import { supabase } from '../../lib/supabase'
import { notify } from '../../components/ui/NotificationSystem'
import Modal from '../../components/ui/Modal'
import ProductGrid from '../../components/order/ProductGrid'
import VariantSelectionScreen from '../../components/order/VariantSelectionScreen'
import DealFlavorSelectionScreen from '../../components/order/DealFlavorSelectionScreen'
import CartSidebar from '../../components/order/CartSidebar'
import WalkinOrdersSidebar from '../../components/order/WalkinOrdersSidebar'
import WalkinOrderDetails from '../../components/order/WalkinOrderDetails'
import TableSelectionPanel from '../../components/order/TableSelectionPanel'
import loyaltyManager from '../../lib/loyaltyManager'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { usePermissions } from '../../lib/permissionManager'
import { Users, ShoppingBag, Truck, FileText, Printer, CheckCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import PosToaster from '@/components/ui/PosToaster'
import SplitPaymentModal from '../../components/pos/SplitPaymentModal'

const ORDER_TABS = [
  {
    id: 'walkin',
    label: 'Walk-in',
    icon: Users,
    gradient: 'from-purple-500 to-indigo-600',
    activeColor: 'bg-gradient-to-b from-purple-500 to-indigo-600',
    storageKey: 'new_order_walkin',
    permissionKey: 'SALES_WALKIN'
  },
  {
    id: 'takeaway',
    label: 'Take Away',
    icon: ShoppingBag,
    gradient: 'from-orange-500 to-amber-500',
    activeColor: 'bg-gradient-to-b from-orange-500 to-amber-500',
    storageKey: 'new_order_takeaway',
    permissionKey: 'SALES_TAKEAWAY'
  },
  {
    id: 'delivery',
    label: 'Delivery',
    icon: Truck,
    gradient: 'from-emerald-500 to-teal-600',
    activeColor: 'bg-gradient-to-b from-emerald-500 to-teal-600',
    storageKey: 'new_order_delivery',
    permissionKey: 'SALES_DELIVERY'
  }
]

export default function NewOrderPage() {
  const router = useRouter()
  const productGridRef = useRef(null)
  const isInitialized = useRef(false)
  const permissions = usePermissions()
  const [permissionsReady, setPermissionsReady] = useState(() => permissions.isLoaded())

  // Poll until permissions are loaded so tabBar re-renders with correct tabs
  useEffect(() => {
    if (permissionsReady) return
    const interval = setInterval(() => {
      if (permissions.isLoaded()) {
        setPermissionsReady(true)
        clearInterval(interval)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [permissionsReady])

  const [user, setUser] = useState(null)
  const [cashierData, setCashierData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [categories, setCategories] = useState(() => cacheManager.isReady() ? cacheManager.getCategories() : [])
  const [menus, setMenus] = useState(() => cacheManager.isReady() ? cacheManager.getMenus() : [])
  const [allProducts, setAllProducts] = useState(() => cacheManager.isReady() ? cacheManager.getProducts() : [])
  const [deals, setDeals] = useState(() => cacheManager.isReady() ? cacheManager.getDeals() : [])
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(() => cacheManager.isReady())
  const [isLoading, setIsLoading] = useState(() => !cacheManager.isReady())
  const [theme, setTheme] = useState('light')

  // Active order type tab
  const [activeOrderType, setActiveOrderType] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('new_order_active_type') || 'walkin') : 'walkin'
  )

  // Shared cart, customer, instructions across order types
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(null)
  const [orderInstructions, setOrderInstructions] = useState('')
  const [orderExtras, setOrderExtras] = useState({ walkin: {}, takeaway: {}, delivery: {} })
  // Last delivery charge we auto-applied (seeded on mount). Lets us distinguish a
  // cashier's manual edit from our own value so we never overwrite a manual charge.
  const deliveryChargeAutoRef = useRef(null)

  // View state
  const [currentView, setCurrentView] = useState('products')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [productVariants, setProductVariants] = useState([])
  const [dealProducts, setDealProducts] = useState([])

  // Modals
  const [showExitModal, setShowExitModal] = useState(false)

  // Active orders sidebar
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0)
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false)
  const [splitPaymentOrder, setSplitPaymentOrder] = useState(null)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [completedOrderData, setCompletedOrderData] = useState(null)
  const [isPrinting, setIsPrinting] = useState(false)

  // Reopened/modified order state
  const [isReopenedOrder, setIsReopenedOrder] = useState(false)
  const [modifyingOrderId, setModifyingOrderId] = useState(null)
  const [modifyingOrderNumber, setModifyingOrderNumber] = useState(null)
  const [modifyingDailySerial, setModifyingDailySerial] = useState(null)
  const [originalState, setOriginalState] = useState(null)
  const [originalOrderStatus, setOriginalOrderStatus] = useState(null)
  const [originalPaymentStatus, setOriginalPaymentStatus] = useState(null)
  const [originalAmountPaid, setOriginalAmountPaid] = useState(0)
  const [originalPaymentMethod, setOriginalPaymentMethod] = useState(null)
  const [canDecreaseQty, setCanDecreaseQty] = useState(true)

  // Table selection (walkin only)
  const [selectedTable, setSelectedTable] = useState(null)

  // Order taker (walkin only)
  const [orderTakers, setOrderTakers] = useState([])
  const [selectedOrderTaker, setSelectedOrderTaker] = useState(null)
  const [requireOrderTaker, setRequireOrderTaker] = useState(false)
  // Per-order-type "customer required" flags from admin settings (users.require_customer_*).
  // Cached in localStorage.pos_require_customer by cacheManager.
  const [requireCustomer, setRequireCustomer] = useState({ walkin: false, takeaway: false, delivery: true })

  // Persist shared cart/instructions to localStorage
  useEffect(() => {
    if (!isInitialized.current) return
    if (cart.length > 0) {
      localStorage.setItem('new_order_cart', JSON.stringify(cart))
    } else {
      localStorage.removeItem('new_order_cart')
    }
  }, [cart])

  useEffect(() => {
    if (!isInitialized.current) return
    if (orderInstructions) {
      localStorage.setItem('new_order_instructions', orderInstructions)
    } else {
      localStorage.removeItem('new_order_instructions')
    }
  }, [orderInstructions])

  useEffect(() => {
    if (!isInitialized.current) return
    if (customer) {
      localStorage.setItem('new_order_customer', JSON.stringify(customer))
    } else {
      localStorage.removeItem('new_order_customer')
    }
  }, [customer])

  useEffect(() => {
    if (!isInitialized.current) return
    ORDER_TABS.forEach(tab => {
      const e = orderExtras[tab.id]
      if (e && Object.keys(e).length > 0) {
        localStorage.setItem(`${tab.storageKey}_extras`, JSON.stringify(e))
      } else {
        localStorage.removeItem(`${tab.storageKey}_extras`)
      }
    })
  }, [orderExtras])

  useEffect(() => {
    if (!isInitialized.current) return
    if (selectedTable) {
      localStorage.setItem('new_order_walkin_table', JSON.stringify(selectedTable))
    } else {
      localStorage.removeItem('new_order_walkin_table')
    }
  }, [selectedTable])

  useEffect(() => {
    localStorage.setItem('new_order_active_type', activeOrderType)
  }, [activeOrderType])

  // If the stored active tab type is not permitted, switch to the first permitted tab
  useEffect(() => {
    const activeTabDef = ORDER_TABS.find(t => t.id === activeOrderType)
    if (activeTabDef && !permissions.hasPermission(activeTabDef.permissionKey)) {
      const firstAllowed = ORDER_TABS.find(t => permissions.hasPermission(t.permissionKey))
      if (firstAllowed) setActiveOrderType(firstAllowed.id)
    }
  }, [permissions, activeOrderType])

  // Load data on mount
  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    const cashier = authManager.getCashier()
    const session = authManager.getCurrentSession()

    setUser(userData)
    setCashierData(cashier)
    setSessionId(session?.id)

    if (userData?.id) {
      cacheManager.setUserId(userData.id)
      loyaltyManager.initialize(userData.id).catch(err => {
        console.error('Failed to initialize loyalty manager:', err)
      })
      webOrderNotificationManager.setUserId(userData.id)
      webOrderNotificationManager.startListening(null, {
        action: {
          label: 'View Web Orders',
          onClick: () => router.push('/web-orders')
        }
      })
    }

    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    // Independently refresh charge defaults (resilient to the big cache fetch
    // failing). Emits 'pos-charge-settings-updated' → reconcileDeliveryCharge.
    cacheManager.syncChargeSettings()

    // Restore shared cart/customer/instructions and per-tab extras from localStorage
    const savedCart = localStorage.getItem('new_order_cart')
    const savedCustomer = localStorage.getItem('new_order_customer')
    const savedInstructions = localStorage.getItem('new_order_instructions')
    if (savedCart) try { setCart(JSON.parse(savedCart)) } catch {}
    if (savedCustomer) try { setCustomer(JSON.parse(savedCustomer)) } catch {}
    if (savedInstructions) setOrderInstructions(savedInstructions)

    const restoredExtras = { walkin: {}, takeaway: {}, delivery: {} }
    ORDER_TABS.forEach(tab => {
      const savedExtras = localStorage.getItem(`${tab.storageKey}_extras`)
      if (savedExtras) try { restoredExtras[tab.id] = JSON.parse(savedExtras) } catch {}
    })
    // Seed default delivery charge immediately (fixed OR percentage) so the total
    // is correct before the user opens InlineCustomerPanel. Percentage is resolved
    // against the restored cart subtotal; the recompute effect below keeps it in
    // sync as the cart changes.
    if (!restoredExtras.delivery.deliveryCharges) {
      let seedSubtotal = 0
      try {
        const c = savedCart ? JSON.parse(savedCart) : []
        seedSubtotal = c.reduce((s, i) => s + (i.totalPrice || 0), 0)
      } catch {}
      const seeded = cacheManager.resolveDeliveryChargeAmount(seedSubtotal)
      if (seeded > 0) restoredExtras.delivery.deliveryCharges = seeded
    }
    deliveryChargeAutoRef.current = parseFloat(restoredExtras.delivery.deliveryCharges) || 0

    const savedTable = localStorage.getItem('new_order_walkin_table')
    if (savedTable) try { setSelectedTable(JSON.parse(savedTable)) } catch {}

    const savedOrderTaker = localStorage.getItem('new_order_order_taker')
    if (savedOrderTaker) try { const t = JSON.parse(savedOrderTaker); if (t?.id) setSelectedOrderTaker(t) } catch {}

    // Restore modification state if reopened order was in progress
    const savedModifyingOrder = localStorage.getItem('new_order_modifying_order')
    if (savedModifyingOrder) {
      setIsReopenedOrder(true)
      setModifyingOrderId(savedModifyingOrder)
      setModifyingOrderNumber(localStorage.getItem('new_order_modifying_order_number') || null)
      setModifyingDailySerial(localStorage.getItem('new_order_modifying_daily_serial') || null)
      try {
        const os = localStorage.getItem('new_order_original_state')
        if (os) setOriginalState(JSON.parse(os))
      } catch {}
      setOriginalOrderStatus(localStorage.getItem('new_order_original_order_status') || null)
      setOriginalPaymentStatus(localStorage.getItem('new_order_original_payment_status') || null)
      setOriginalAmountPaid(parseFloat(localStorage.getItem('new_order_original_amount_paid')) || 0)
      setOriginalPaymentMethod(localStorage.getItem('new_order_original_payment_method') || null)
      setCanDecreaseQty(localStorage.getItem('new_order_can_decrease_qty') !== 'false')
    }

    setOrderExtras(restoredExtras)
    isInitialized.current = true

    checkAndLoadData()

    const statusInterval = setInterval(() => {
      setNetworkStatus(cacheManager.getNetworkStatus())
    }, 1000)

    const handleFocus = () => {
      checkAndLoadData()
      // Sync cart/customer/instructions from localStorage — clears them if payment succeeded
      const savedCart = localStorage.getItem('new_order_cart')
      const savedCustomer = localStorage.getItem('new_order_customer')
      const savedInstructions = localStorage.getItem('new_order_instructions')
      setCart(savedCart ? JSON.parse(savedCart) : [])
      setCustomer(savedCustomer ? JSON.parse(savedCustomer) : null)
      setOrderInstructions(savedInstructions || '')
      // Also sync per-tab extras
      setOrderExtras(prev => {
        const updated = { ...prev }
        ORDER_TABS.forEach(tab => {
          const saved = localStorage.getItem(`${tab.storageKey}_extras`)
          updated[tab.id] = saved ? JSON.parse(saved) : {}
        })
        return updated
      })
    }

    const handleOrderReopened = (event) => {
      if (event.detail?.orderType && ORDER_TABS.some(t => t.id === event.detail.orderType)) {
        setTimeout(() => {
          const savedCart = localStorage.getItem('new_order_cart')
          const savedCustomer = localStorage.getItem('new_order_customer')
          if (savedCart) try { setCart(JSON.parse(savedCart)) } catch {}
          if (savedCustomer) try { setCustomer(JSON.parse(savedCustomer)) } catch {}
        }, 100)
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('orderReopened', handleOrderReopened)

    return () => {
      clearInterval(statusInterval)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('orderReopened', handleOrderReopened)
    }
  }, [])

  const checkAndLoadData = async () => {
    try {
      if (cacheManager.isReady()) {
        loadCachedData()
        setIsDataReady(true)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      await cacheManager.initializeCache()
      if (cacheManager.isReady()) {
        loadCachedData()
        setIsDataReady(true)
      } else {
        notify.error('Failed to load menu data.')
      }
      setIsLoading(false)
    } catch {
      setIsLoading(false)
    }
  }

  const loadCachedData = () => {
    setCategories(cacheManager.getCategories())
    setMenus(cacheManager.getMenus())
    setAllProducts(cacheManager.getProducts())
    setDeals(cacheManager.getDeals())

    // Load order takers and require setting
    setOrderTakers(cacheManager.getOrderTakers())
    try {
      const req = localStorage.getItem('pos_require_order_taker')
      if (req !== null) setRequireOrderTaker(JSON.parse(req))
      const reqCust = localStorage.getItem('pos_require_customer')
      if (reqCust !== null) {
        const parsed = JSON.parse(reqCust)
        setRequireCustomer({
          walkin:   !!parsed?.walkin,
          takeaway: !!parsed?.takeaway,
          delivery: !!parsed?.delivery,
        })
      }
    } catch {}
  }

  const handleTabSwitch = (tabId) => {
    const tab = ORDER_TABS.find(t => t.id === tabId)
    if (tab && !permissions.hasPermission(tab.permissionKey)) {
      notify.error(`You don't have permission to access ${tab.label} orders`)
      return
    }
    setActiveOrderType(tabId)
    setCurrentView('products')
    setSelectedProduct(null)
    setSelectedDeal(null)
    setProductVariants([])
    setDealProducts([])
    setSelectedOrder(null)
  }

  const handleOrderSelect = (order) => {
    // Toggle: clicking the already-selected order hides the details and returns to products
    if (selectedOrder?.id === order.id) {
      setSelectedOrder(null)
      setCurrentView('products')
      return
    }
    setSelectedOrder(order)
    setCurrentView('orders')
  }

  const handleTableClick = () => {
    if (currentView === 'tables') {
      setCurrentView('products')
    } else {
      setCurrentView('tables')
    }
  }

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    const variants = cacheManager.getProductVariants(product.id)
    setProductVariants(variants)
    if (!variants || variants.length === 0) {
      const basePrice = parseFloat(product.base_price)
      const discount = parseFloat(product.discount_percentage) || 0
      const finalPrice = basePrice * (1 - discount / 100)
      handleAddToCart({
        id: `${product.id}-base-${Date.now()}`,
        productId: product.id,
        variantId: null,
        productName: product.name,
        variantName: null,
        basePrice: basePrice,
        variantPrice: 0,
        finalPrice: finalPrice,
        quantity: 1,
        totalPrice: finalPrice,
        image: product.image_url
      })
    } else {
      setCurrentView('variant')
    }
  }

  const handleDealClick = async (deal) => {
    if (deal?.scrollToDeals) {
      if (currentView !== 'products') {
        setCurrentView('products')
        setSelectedProduct(null)
        setSelectedDeal(null)
      }
      setTimeout(() => { if (productGridRef.current) productGridRef.current.scrollToDeals() }, 100)
      return
    }
    await cacheManager.ensureDealProducts(deal.id)
    setSelectedDeal(deal)
    setDealProducts(cacheManager.getDealProducts(deal.id))
    setCurrentView('deal')
  }

  const handleAddToCart = (cartItem) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(item => {
        if (item.isDeal && cartItem.isDeal) return item.dealId === cartItem.dealId
        if (!item.isDeal && !cartItem.isDeal) return item.productId === cartItem.productId && item.variantId === cartItem.variantId && !item.itemInstructions
        return false
      })
      if (existingIndex !== -1) {
        const updated = [...prev]
        const existing = updated[existingIndex]
        const newQty = existing.quantity + cartItem.quantity
        updated[existingIndex] = { ...existing, quantity: newQty, totalPrice: existing.finalPrice * newQty }
        return updated
      }
      return [...prev, cartItem]
    })
    setCurrentView('products')
    setSelectedProduct(null)
    setSelectedDeal(null)
    setProductVariants([])
    setDealProducts([])
    const name = cartItem.isDeal ? cartItem.dealName : cartItem.productName
    toast.success(`${name} added!`, { duration: 1000 })
  }

  const updateCartItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) { removeCartItem(itemId); return }
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const gross = item.finalPrice * newQuantity
      const discountAmount = item.itemDiscountType === 'percentage' && item.itemDiscountValue
        ? (gross * item.itemDiscountValue) / 100
        : item.itemDiscountType === 'fixed'
          ? Math.min(item.itemDiscountValue || 0, gross)
          : 0
      return { ...item, quantity: newQuantity, totalPrice: gross - discountAmount, itemDiscountAmount: discountAmount }
    }))
  }

  const updateItemDiscount = (itemId, discountType, discountValue) => {
    setCart(prev => prev.map(item => {
      if (item.id !== itemId) return item
      const gross = item.finalPrice * item.quantity
      const discountAmount = discountType === 'percentage'
        ? (gross * discountValue) / 100
        : discountType === 'fixed'
          ? Math.min(discountValue, gross)
          : 0
      return {
        ...item,
        itemDiscountType: discountType,
        itemDiscountValue: discountValue,
        itemDiscountAmount: discountAmount,
        totalPrice: gross - discountAmount,
      }
    }))
  }

  const updateItemInstruction = (itemId, instruction) => {
    setCart(prev => prev.map(item =>
      item.id === itemId ? { ...item, itemInstructions: instruction } : item
    ))
  }

  const removeCartItem = (itemId) => {
    setCart(prev => prev.filter(i => i.id !== itemId))
  }

  const handleClearCart = () => {
    setCart([])
    clearModificationState()
  }

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.totalPrice, 0)
  const calculateTotal = () => {
    const subtotal = calculateSubtotal()
    if (activeOrderType === 'delivery') {
      const dc = parseFloat(orderExtras.delivery?.deliveryCharges) || 0
      return subtotal + dc
    }
    return subtotal
  }

  // Re-apply the admin default delivery charge (fixed OR percentage) to the
  // delivery tab, unless it's a reopened order or the cashier manually edited it.
  // Percentage is computed against the live cart subtotal.
  const reconcileDeliveryCharge = () => {
    if (isReopenedOrder) return
    const current = parseFloat(orderExtras.delivery?.deliveryCharges) || 0
    const isManual = deliveryChargeAutoRef.current !== null &&
                     Math.abs(current - deliveryChargeAutoRef.current) > 0.001
    if (isManual) return
    const subtotal = cart.reduce((s, i) => s + (i.totalPrice || 0), 0)
    const computed = cacheManager.resolveDeliveryChargeAmount(subtotal)
    deliveryChargeAutoRef.current = computed
    if (current !== computed) {
      setOrderExtras(prev => ({ ...prev, delivery: { ...prev.delivery, deliveryCharges: computed } }))
    }
  }

  // Live recompute for PERCENTAGE delivery charges as the cart subtotal changes.
  useEffect(() => {
    const dc = cacheManager.getDefaultDeliveryCharge()
    if (dc?.type !== 'percentage' || !(dc?.value > 0)) return
    reconcileDeliveryCharge()
  }, [cart, isReopenedOrder])

  // Re-apply defaults (fixed OR percentage) when charge settings change — fired by
  // the header refresh button and background settings sync.
  useEffect(() => {
    const onChargeUpdate = () => reconcileDeliveryCharge()
    window.addEventListener('pos-charge-settings-updated', onChargeUpdate)
    return () => window.removeEventListener('pos-charge-settings-updated', onChargeUpdate)
  }, [cart, isReopenedOrder, orderExtras.delivery?.deliveryCharges])

  const handleBackClick = () => {
    if (currentView !== 'products') {
      setCurrentView('products')
      setSelectedProduct(null)
      setSelectedDeal(null)
      return
    }
    if (cart.length > 0) {
      setShowExitModal(true)
    } else {
      window.dispatchEvent(new CustomEvent('page-navigating'))
      router.push('/dashboard/')
    }
  }

  const handleConfirmExit = () => {
    localStorage.removeItem('new_order_cart')
    localStorage.removeItem('new_order_customer')
    localStorage.removeItem('new_order_instructions')
    ORDER_TABS.forEach(tab => {
      localStorage.removeItem(`${tab.storageKey}_extras`)
    })
    localStorage.removeItem('new_order_walkin_table')
    localStorage.removeItem('new_order_order_taker')
    setCart([])
    setCustomer(null)
    setOrderInstructions('')
    setOrderExtras({ walkin: {}, takeaway: {}, delivery: {} })
    setSelectedTable(null)
    setSelectedOrderTaker(null)
    clearModificationState()
    notify.info('Order discarded')
    window.dispatchEvent(new CustomEvent('page-navigating'))
    router.push('/dashboard/')
  }

  // Handle reopening an order from the sidebar into the new-order page's cart
  const handleReopenInPlace = (reopenData) => {
    const orderType = reopenData.orderType || 'walkin'

    // Switch to the correct tab
    setActiveOrderType(orderType)

    // Load reopened order data into cart
    setCart(reopenData.cart || [])
    setCustomer(reopenData.customer || null)
    setOrderInstructions(reopenData.orderInstructions || '')

    // Set modification state
    setIsReopenedOrder(true)
    setModifyingOrderId(reopenData.existingOrderId || null)
    setModifyingOrderNumber(reopenData.existingOrderNumber || null)
    setModifyingDailySerial(reopenData.dailySerial || null)
    setOriginalState(reopenData.originalState || null)
    setOriginalOrderStatus(reopenData.originalOrderStatus || null)
    setOriginalPaymentStatus(reopenData.originalPaymentStatus || null)
    setOriginalAmountPaid(reopenData.originalAmountPaid || 0)
    setOriginalPaymentMethod(reopenData.originalPaymentMethod || null)
    setCanDecreaseQty(reopenData.canDecreaseQty !== false)

    // Set extras (discount, delivery charges, service charge, etc.)
    setOrderExtras(prev => ({
      ...prev,
      [orderType]: {
        discount: reopenData.discount || 0,
        ...(reopenData.deliveryCharges ? { deliveryCharges: reopenData.deliveryCharges } : {}),
        ...(reopenData.deliveryTime ? { deliveryTime: reopenData.deliveryTime } : {}),
        ...(reopenData.pickupTime ? { pickupTime: reopenData.pickupTime } : {}),
        ...(orderType === 'walkin' ? {
          serviceChargeAmount: parseFloat(reopenData.serviceChargeAmount || 0),
          serviceChargePercentage: reopenData.serviceChargeType === 'percentage' ? parseFloat(reopenData.serviceChargeValue || 0) : 0
        } : {})
      }
    }))

    // Restore table for walkin
    if (orderType === 'walkin' && reopenData.tableId) {
      setSelectedTable(reopenData.table || { id: reopenData.tableId })
    }

    // Restore order taker and persist to localStorage
    if (orderType === 'walkin' && reopenData.orderTakerId) {
      const taker = { id: reopenData.orderTakerId, name: reopenData.orderTakerName || null }
      setSelectedOrderTaker(taker)
      localStorage.setItem('new_order_order_taker', JSON.stringify(taker))
    }

    // Persist modification state to localStorage
    localStorage.setItem('new_order_modifying_order', reopenData.existingOrderId || '')
    localStorage.setItem('new_order_modifying_order_number', reopenData.existingOrderNumber || '')
    localStorage.setItem('new_order_modifying_daily_serial', reopenData.dailySerial || '')
    localStorage.setItem('new_order_original_state', JSON.stringify(reopenData.originalState || null))
    localStorage.setItem('new_order_original_order_status', reopenData.originalOrderStatus || 'Pending')
    localStorage.setItem('new_order_original_payment_status', reopenData.originalPaymentStatus || 'Pending')
    localStorage.setItem('new_order_original_amount_paid', (reopenData.originalAmountPaid || 0).toString())
    localStorage.setItem('new_order_original_payment_method', reopenData.originalPaymentMethod || 'Cash')
    localStorage.setItem('new_order_can_decrease_qty', (reopenData.canDecreaseQty !== false).toString())

    // Close order details and return to products view
    setSelectedOrder(null)
    setCurrentView('products')
    setOrdersRefreshTrigger(prev => prev + 1)

    notify.success(`Order #${reopenData.existingOrderNumber || ''} loaded for modification`)
  }

  // Clear modification state (used when clearing cart or after successful order)
  const clearModificationState = () => {
    setIsReopenedOrder(false)
    setModifyingOrderId(null)
    setModifyingOrderNumber(null)
    setModifyingDailySerial(null)
    setOriginalState(null)
    setOriginalOrderStatus(null)
    setOriginalPaymentStatus(null)
    setOriginalAmountPaid(0)
    setOriginalPaymentMethod(null)
    setCanDecreaseQty(true)
    localStorage.removeItem('new_order_modifying_order')
    localStorage.removeItem('new_order_modifying_order_number')
    localStorage.removeItem('new_order_modifying_daily_serial')
    localStorage.removeItem('new_order_original_state')
    localStorage.removeItem('new_order_original_order_status')
    localStorage.removeItem('new_order_original_payment_status')
    localStorage.removeItem('new_order_original_amount_paid')
    localStorage.removeItem('new_order_original_payment_method')
    localStorage.removeItem('new_order_can_decrease_qty')
    // Clear per-tab service charge when modification is cancelled/completed
    setOrderExtras(prev => {
      const updated = { ...prev }
      if (updated.walkin) {
        const { serviceChargeAmount: _a, serviceChargePercentage: _p, ...rest } = updated.walkin
        updated.walkin = rest
      }
      return updated
    })
  }

  const handleOrderAndPay = () => {
    if (cart.length === 0) {
      notify.warning('Please add items to cart before proceeding')
      return
    }
    const activeTabDef = ORDER_TABS.find(t => t.id === activeOrderType)
    if (activeTabDef && !permissions.hasPermission(activeTabDef.permissionKey)) {
      notify.error(`You don't have permission to place ${activeTabDef.label} orders`)
      return
    }
    if (activeOrderType === 'walkin' && requireOrderTaker && !selectedOrderTaker) {
      notify.warning('Please select an order taker before proceeding')
      return
    }
    // Per-tab "require customer" from admin settings
    if (requireCustomer[activeOrderType] && !customer) {
      const typeLabel = activeOrderType === 'walkin' ? 'walk-in'
        : activeOrderType === 'takeaway' ? 'takeaway'
        : 'delivery'
      notify.warning(`Customer is required for ${typeLabel} orders — please select a customer`)
      return
    }
    const tab = ORDER_TABS.find(t => t.id === activeOrderType)
    const extras = orderExtras[activeOrderType] || {}
    const orderData = {
      cart,
      customer,
      orderInstructions,
      subtotal: calculateSubtotal(),
      total: calculateTotal(),
      orderType: activeOrderType,
      cashierId: cashierData?.id || null,
      userId: user?.id,
      sessionId,
      orderTakerId: activeOrderType === 'walkin' ? (selectedOrderTaker?.id || null) : null,
      orderTakerName: activeOrderType === 'walkin' ? (selectedOrderTaker?.name || null) : null,
      tableId: activeOrderType === 'walkin' ? (selectedTable?.id || null) : null,
      tableName: activeOrderType === 'walkin' ? (selectedTable?.table_name || selectedTable?.table_number || null) : null,
      sourceStorageKey: tab?.storageKey || null,
      sourcePage: 'new-order',
      // Include modification data if this is a reopened order
      isModifying: isReopenedOrder,
      existingOrderId: modifyingOrderId,
      existingOrderNumber: modifyingOrderNumber,
      originalPaymentStatus: originalPaymentStatus,
      originalAmountPaid: originalAmountPaid,
      originalPaymentMethod: originalPaymentMethod,
      originalOrderStatus: originalOrderStatus,
      ...extras
    }

    // Include detailed changes for modified orders
    if (isReopenedOrder && modifyingOrderId && originalState) {
      const changes = {
        itemsAdded: [],
        itemsRemoved: [],
        itemsModified: [],
        oldTotal: originalState.total,
        newTotal: orderData.total,
        oldSubtotal: originalState.subtotal
      }

      // Find removed items
      originalState.items.forEach(oldItem => {
        const itemName = oldItem.isDeal ? oldItem.dealName : oldItem.productName
        const itemVariant = oldItem.isDeal ? null : oldItem.variantName

        const stillExists = cart.find(newItem => {
          const newItemName = newItem.isDeal ? newItem.dealName : newItem.productName
          const newItemVariant = newItem.isDeal ? null : newItem.variantName
          return newItemName === itemName && newItemVariant === itemVariant
        })
        if (!stillExists) {
          const removed = {
            name: itemName,
            variant: itemVariant,
            quantity: oldItem.quantity,
            price: oldItem.totalPrice
          }
          if (oldItem.isDeal) { removed.isDeal = true; removed.dealProducts = oldItem.dealProducts || null }
          changes.itemsRemoved.push(removed)
        }
      })

      // Find added and modified items
      cart.forEach(newItem => {
        const itemName = newItem.isDeal ? newItem.dealName : newItem.productName
        const itemVariant = newItem.isDeal ? null : newItem.variantName

        const oldItem = originalState.items.find(old => {
          const oldItemName = old.isDeal ? old.dealName : old.productName
          const oldItemVariant = old.isDeal ? null : old.variantName
          return oldItemName === itemName && oldItemVariant === itemVariant
        })
        if (!oldItem) {
          const added = {
            name: itemName,
            variant: itemVariant,
            quantity: newItem.quantity,
            price: newItem.totalPrice
          }
          if (newItem.isDeal) { added.isDeal = true; added.dealProducts = newItem.dealProducts || null }
          changes.itemsAdded.push(added)
        } else if (oldItem.quantity !== newItem.quantity) {
          changes.itemsModified.push({
            name: itemName,
            variant: itemVariant,
            oldQuantity: oldItem.quantity,
            newQuantity: newItem.quantity,
            oldPrice: oldItem.totalPrice,
            newPrice: newItem.totalPrice
          })
        }
      })

      orderData.detailedChanges = changes
    }

    localStorage.setItem('order_data', JSON.stringify(orderData))
    // Do NOT clear cart here — payment page clears it on success.
    // If user comes back from payment, cart is preserved.
    notify.info('Proceeding to payment...')
    router.push('/payment')
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const activeTab = ORDER_TABS.find(t => t.id === activeOrderType)

  if (isLoading || !isDataReady) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${classes.background}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
          <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading menu...</p>
        </div>
      </div>
    )
  }

  const tabBar = (
    <div className="flex items-center gap-2">
      {(permissionsReady ? ORDER_TABS.filter(tab => permissions.hasPermission(tab.permissionKey)) : ORDER_TABS).map(tab => {
        const isActive = activeOrderType === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => handleTabSwitch(tab.id)}
            className={`flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
              isActive
                ? `bg-gradient-to-r ${tab.gradient} text-white shadow-md scale-105`
                : isDark
                  ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border border-gray-600'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-gray-200'
            }`}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        )
      })}
    </div>
  )

  // Resolve table name from order — falls back to cache lookup when join isn't populated
  const resolveTableName = (order) => {
    if (order?.tables?.table_name) return order.tables.table_name
    if (order?.tables?.table_number) return `Table ${order.tables.table_number}`
    if (order?.tableName) return order.tableName
    if (order?.table_name) return order.table_name
    if (order?.table_id) {
      const t = cacheManager.getAllTables().find(t => t.id === order.table_id)
      if (t) return t.table_name || `Table ${t.table_number}`
    }
    return ''
  }

  const handlePrintOrder = async (order) => {
    try {
      if (!user?.id) { toast.error('User not logged in'); return }
      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()
      if (!printer) { toast.error('No printer configured. Please configure a printer in settings.'); return }

      let orderItems = []
      if (order.id && cacheManager.checkOnlineStatus()) {
        const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) {
        orderItems = order.order_items || order.items || []
        if (!orderItems.length && order.id) {
          const cached = (cacheManager.getAllOrders?.() || []).find(o => o.id === order.id)
          orderItems = cached?.order_items || cached?.items || []
        }
      }

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'walkin',
        tableName: resolveTableName(order),
        customer: order.customers || { full_name: 'Guest' },
        deliveryAddress: order.delivery_address || order.customers?.addressline || order.customers?.address,
        orderInstructions: order.order_instructions,
        total: order.total_amount,
        subtotal: order.subtotal || order.total_amount,
        deliveryCharges: order.delivery_charges || 0,
        discountAmount: order.discount_amount || 0,
        loyaltyDiscountAmount: 0,
        loyaltyPointsRedeemed: 0,
        discountType: 'amount',
        serviceChargeAmount: parseFloat(order.service_charge_amount || 0),
        serviceChargeType: parseFloat(order.service_charge_percentage || 0) > 0 ? 'percentage' : 'fixed',
        serviceChargeValue: parseFloat(order.service_charge_percentage || 0),
        cart: orderItems.map(item => item.is_deal
          ? { isDeal: true, dealId: item.deal_id, dealName: item.product_name, dealProducts: (() => { try { return typeof item.deal_products === 'string' ? JSON.parse(item.deal_products) : (item.deal_products || []) } catch(e) { return [] } })(), quantity: item.quantity, totalPrice: item.total_price, finalPrice: item.final_price, itemDiscountType: item.item_discount_type || null, itemDiscountAmount: parseFloat(item.item_discount_amount) || 0, itemInstructions: item.item_instructions || null }
          : { isDeal: false, productName: item.product_name, variantName: item.variant_name, quantity: item.quantity, totalPrice: item.total_price, finalPrice: item.final_price, itemDiscountType: item.item_discount_type || null, itemDiscountAmount: parseFloat(item.item_discount_amount) || 0, itemInstructions: item.item_instructions || null }
        ),
        paymentMethod: order.payment_method || 'Unpaid',
        order_taker_name: order.order_takers?.name ||
          (order.order_taker_id
            ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
            : null)
      }

      const userProfileRaw = JSON.parse(localStorage.getItem('user_profile') || localStorage.getItem('user') || '{}')
      const cashierName = order.cashier_id ? (order.cashiers?.name || 'Cashier') : (order.users?.customer_name || 'Admin')
      const userProfile = {
        store_name: userProfileRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || '',
        phone: userProfileRaw?.phone || '',
        store_logo: localStorage.getItem('store_logo_local') || userProfileRaw?.store_logo || null,
        qr_code: localStorage.getItem('qr_code_local') || userProfileRaw?.qr_code || null,
        hashtag1: userProfileRaw?.hashtag1 || '',
        hashtag2: userProfileRaw?.hashtag2 || '',
        show_footer_section: userProfileRaw?.show_footer_section !== false,
        show_logo_on_receipt: userProfileRaw?.show_logo_on_receipt !== false,
        show_business_name_on_receipt: userProfileRaw?.show_business_name_on_receipt !== false,
        show_powered_by_airoxlab: userProfileRaw?.show_powered_by_airoxlab !== false,
        phone_secondary: userProfileRaw?.phone_secondary || '',
        receipt_review_message: userProfileRaw?.receipt_review_message || '',
        receipt_footer_message: userProfileRaw?.receipt_footer_message || '',
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const result = await printerManager.printReceipt(orderData, userProfile, printer)
      if (!result.success) throw new Error(result.error || 'Print failed')
    } catch (error) {
      console.error('Print error:', error)
      toast.error(`Print failed: ${error.message}`)
    }
  }

  const handlePrintToken = async (order) => {
    try {
      if (!user?.id) { toast.error('User not logged in'); return }
      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()
      if (!printer) { toast.error('No printer configured. Please configure a printer in settings.'); return }

      let orderItems = []
      if (order.id && cacheManager.checkOnlineStatus()) {
        const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) {
        orderItems = order.order_items || order.items || []
        if (!orderItems.length && order.id) {
          const cached = (cacheManager.getAllOrders?.() || []).find(o => o.id === order.id)
          orderItems = cached?.order_items || cached?.items || []
        }
      }

      const productCategoryMap = {}
      cacheManager.cache?.products?.forEach(p => { productCategoryMap[p.id] = p.category_id })

      const mappedItems = orderItems.map(item => item.is_deal
        ? { isDeal: true, name: item.product_name, quantity: item.quantity, dealProducts: (() => { try { return typeof item.deal_products === 'string' ? JSON.parse(item.deal_products) : (item.deal_products || []) } catch(e) { return [] } })(), instructions: item.item_instructions || '', category_id: null, deal_id: item.deal_id || null }
        : { isDeal: false, name: item.product_name, size: item.variant_name, quantity: item.quantity, instructions: item.item_instructions || '', category_id: item.category_id || productCategoryMap[item.product_id] || null, deal_id: null }
      )

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'walkin',
        tableName: resolveTableName(order),
        customerName: order.customers?.full_name || '',
        customerPhone: order.customers?.phone || '',
        specialNotes: order.order_instructions || '',
        deliveryAddress: order.delivery_address || order.customers?.addressline || order.customers?.address || '',
        items: mappedItems,
        order_taker_name: order.order_takers?.name ||
          (order.order_taker_id
            ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
            : null)
      }

      const userProfileRaw = JSON.parse(localStorage.getItem('user_profile') || localStorage.getItem('user') || '{}')
      const cashierName = order.cashier_id ? (order.cashiers?.name || 'Cashier') : (order.users?.customer_name || 'Admin')
      const userProfile = {
        store_name: userProfileRaw?.store_name || 'KITCHEN',
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const results = await printerManager.printKitchenTokens(orderData, userProfile, printer)
      const allOk = results.every(r => r?.success)
      const anyOk = results.some(r => r?.success)
      if (allOk) {
        // success
      } else if (anyOk) {
        const failed = results.filter(r => !r?.success).map(r => r?.printerName || r?.printerId).join(', ')
        console.warn(`Kitchen token partial: failed for ${failed}`)
      } else {
        throw new Error(results[0]?.error || 'Print failed')
      }
    } catch (error) {
      console.error('Kitchen token print error:', error)
      toast.error(`Print failed: ${error.message}`)
    }
  }

  const handleOrderStatusUpdate = async (order, newStatus) => {
    try {
      // Track which cashier completed/changed the order
      const additionalData = {}
      const cashierData = authManager.getCashier()
      if (cashierData?.id) {
        additionalData.modified_by_cashier_id = cashierData.id
        if (!order.cashier_id) {
          additionalData.cashier_id = cashierData.id
        }
      }

      const result = await cacheManager.updateOrderStatus(order.id, newStatus, additionalData)
      if (!result.success) throw new Error(result.message || 'Failed to update order status')

      // Free the table when a walkin order is completed or cancelled
      if ((newStatus === 'Completed' || newStatus === 'Cancelled') && order.order_type === 'walkin' && order.table_id) {
        await cacheManager.updateTableStatus(order.table_id, 'available')
        console.log(`✅ [NewOrder] Table ${order.table_id} freed after order ${newStatus}`)
        if (newStatus === 'Completed') setSelectedTable(null)
      }

      // ================================================================
      // INVENTORY DEDUCTION (only for Completed status)
      // ================================================================
      if (newStatus === 'Completed') {
        console.log('📦 [NewOrder] Order marked as Completed - attempting inventory deduction')

        // Resolve order_type_id — try order object first, then DB, then order_types lookup
        let orderTypeId = order.order_type_id

        if (!orderTypeId) {
          console.warn('⚠️ [NewOrder] order_type_id not in order object — fetching from DB')
          try {
            const { data: orderData, error: fetchError } = await supabase
              .from('orders')
              .select('order_type_id, order_type')
              .eq('id', order.id)
              .single()
            if (!fetchError && orderData?.order_type_id) {
              orderTypeId = orderData.order_type_id
              console.log('✅ [NewOrder] Got order_type_id from orders table:', orderTypeId)
            }
          } catch (fetchErr) {
            console.error('❌ [NewOrder] Exception fetching orders table:', fetchErr)
          }

          // Last resort: look up from order_types by code
          if (!orderTypeId && order.order_type) {
            try {
              const { data: otData, error: otError } = await supabase
                .from('order_types')
                .select('id')
                .eq('code', order.order_type)
                .eq('is_active', true)
                .single()
              if (!otError && otData?.id) {
                orderTypeId = otData.id
                console.log('✅ [NewOrder] Resolved order_type_id from order_types:', orderTypeId)
                // Persist so future lookups are instant
                await supabase
                  .from('orders')
                  .update({ order_type_id: orderTypeId })
                  .eq('id', order.id)
              } else {
                console.error('❌ [NewOrder] Could not resolve order_type_id:', otError)
              }
            } catch (lookupErr) {
              console.error('❌ [NewOrder] Exception looking up order_type_id:', lookupErr)
            }
          }
        } else {
          console.log('✅ [NewOrder] Using order_type_id from order object:', orderTypeId)
        }

        if (orderTypeId && user?.id) {
          if (cacheManager.checkOnlineStatus()) {
            console.log('🌐 [NewOrder] ONLINE - Calling deduct_inventory_for_order')
            try {
              const { data: deductionResult, error: deductError } = await supabase.rpc(
                'deduct_inventory_for_order',
                {
                  p_order_id: order.id,
                  p_user_id: user.id,
                  p_order_type_id: orderTypeId
                }
              )
              if (deductError) {
                console.error('❌ [NewOrder] Deduction DB error:', deductError)
                toast.error(`Order completed but inventory deduction failed: ${deductError.message}`, {
                  duration: 7000,
                  style: {
                    borderRadius: '10px',
                    background: theme === 'dark' ? '#1f2937' : '#fff',
                    color: theme === 'dark' ? '#f3f4f6' : '#111827',
                    border: '2px solid #ef4444',
                  },
                })
              } else if (deductionResult?.success) {
                console.log(`✅ [NewOrder] Inventory deducted: ${deductionResult.deductions_made} items`)
                toast.success(`Order completed! ${deductionResult.deductions_made} inventory items deducted.`, {
                  duration: 4000,
                  style: {
                    borderRadius: '10px',
                    background: theme === 'dark' ? '#1f2937' : '#fff',
                    color: theme === 'dark' ? '#f3f4f6' : '#111827',
                    border: '2px solid #10b981',
                  },
                })
              } else {
                console.warn('⚠️ [NewOrder] Deduction returned non-success:', deductionResult)
                toast('⚠️ ' + (deductionResult?.error || deductionResult?.message || 'Inventory may not have been deducted'), {
                  duration: 6000,
                  style: {
                    borderRadius: '10px',
                    background: theme === 'dark' ? '#1f2937' : '#fff',
                    color: theme === 'dark' ? '#f3f4f6' : '#111827',
                    border: '2px solid #f59e0b',
                  },
                })
              }
            } catch (invError) {
              console.error('❌ [NewOrder] Exception during deduction:', invError)
              toast.error('Failed to deduct inventory: ' + invError.message, {
                duration: 7000,
                style: {
                  borderRadius: '10px',
                  background: theme === 'dark' ? '#1f2937' : '#fff',
                  color: theme === 'dark' ? '#f3f4f6' : '#111827',
                  border: '2px solid #ef4444',
                },
              })
            }
          } else {
            // OFFLINE — deduction will happen during sync
            console.log('📴 [NewOrder] OFFLINE - Inventory deduction deferred to sync')
            toast('📴 Order completed offline. Inventory will sync when online.', {
              duration: 5000,
              style: {
                borderRadius: '10px',
                background: theme === 'dark' ? '#1f2937' : '#fff',
                color: theme === 'dark' ? '#f3f4f6' : '#111827',
                border: '2px solid #f59e0b',
              },
            })
          }
        } else {
          console.error('❌ [NewOrder] Cannot deduct - missing orderTypeId or userId', {
            orderTypeId: !!orderTypeId,
            userId: !!user?.id,
          })
        }

        // WhatsApp auto-send on Completed
        const waNotify = (r, successMsg) => {
          if (r?.success) toast.success(successMsg, { duration: 3000 })
          else if (r && !r.silent) toast.error(`WhatsApp: ${r.error || 'Failed to send'}`, { duration: 5000 })
        }
        triggerWhatsAppAutoSend(order, user?.id, 'Completed')
          .then(r => waNotify(r, 'WhatsApp message sent to customer'))
          .catch(err => toast.error(`WhatsApp error: ${err.message}`, { duration: 5000 }))

        setSelectedOrder(null)
        setCurrentView('products')
        setOrdersRefreshTrigger(prev => prev + 1)
      } else {
        // WhatsApp auto-send on intermediate statuses
        const waNotify = (r, successMsg) => {
          if (r?.success) toast.success(successMsg, { duration: 3000 })
          else if (r && !r.silent) toast.error(`WhatsApp: ${r.error || 'Failed to send'}`, { duration: 5000 })
        }
        if (newStatus === 'Preparing') {
          triggerWhatsAppAutoSend(order, user?.id, 'Preparing')
            .then(r => waNotify(r, 'WhatsApp: preparing notification sent'))
            .catch(err => toast.error(`WhatsApp error: ${err.message}`, { duration: 5000 }))
        }
        if (newStatus === 'Ready') {
          triggerWhatsAppAutoSend(order, user?.id, 'Ready')
            .then(r => waNotify(r, 'WhatsApp: order ready notification sent'))
            .catch(err => toast.error(`WhatsApp error: ${err.message}`, { duration: 5000 }))
        }
        if (newStatus === 'Dispatched') {
          triggerWhatsAppAutoSend(order, user?.id, 'Dispatched')
            .then(r => waNotify(r, 'WhatsApp: dispatch notification sent'))
            .catch(err => toast.error(`WhatsApp error: ${err.message}`, { duration: 5000 }))
        }
        setOrdersRefreshTrigger(prev => prev + 1)
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      toast.error('Failed to update order status')
    }
  }

  const handlePaymentRequired = async (order, paymentData) => {
    try {
      // Split payment: open modal
      if (paymentData?.useSplitPayment) {
        setSplitPaymentOrder(order)
        setShowSplitPaymentModal(true)
        return
      }

      // Split payment results (array of {method, amount})
      if (Array.isArray(paymentData)) {
        const totalPaid = paymentData.reduce((sum, p) => sum + parseFloat(p.amount), 0)
        const transactions = paymentData.map(payment => ({
          order_id: order.id,
          user_id: user?.id || order.user_id,
          payment_method: payment.method,
          amount: parseFloat(payment.amount),
          reference_number: payment.reference || null,
          notes: payment.notes || null,
          created_at: new Date().toISOString()
        }))

        if (cacheManager.checkOnlineStatus()) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              payment_method: 'Split',
              payment_status: 'Paid',
              amount_paid: totalPaid,
              order_status: 'Completed',
              order_taker_id: order.order_taker_id || null,
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id)
          if (updateError) throw updateError

          const { error: txError } = await supabase.from('order_payment_transactions').insert(transactions)
          if (txError) throw txError
          cacheManager.setPaymentTransactions?.(order.id, transactions)
        } else {
          const orderIndex = cacheManager.cache.orders.findIndex(o => o.id === order.id)
          if (orderIndex !== -1) {
            cacheManager.cache.orders[orderIndex] = {
              ...cacheManager.cache.orders[orderIndex],
              payment_method: 'Split',
              payment_status: 'Paid',
              amount_paid: totalPaid,
              order_status: 'Completed',
              order_taker_id: order.order_taker_id || null,
              updated_at: new Date().toISOString(),
              _isSynced: false
            }
            await cacheManager.saveCacheToStorage()
          }
          cacheManager.setPaymentTransactions?.(order.id, transactions)
        }

        toast.success(`Order #${order.order_number} paid and completed!`)
        await handleOrderStatusUpdate(order, 'Completed')
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      // Regular payment
      // Validate Account (Customer Ledger) payment requires a customer WITH a phone number
      if (paymentData.paymentMethod === 'Account') {
        let cust = order.customers || order.customer
        // The customer object may not be joined onto the order — verify against the DB
        if ((!cust || !cust.phone) && order.customer_id) {
          const { data: dbCust } = await supabase
            .from('customers').select('full_name, phone').eq('id', order.customer_id).single()
          if (dbCust) cust = dbCust
        }
        if (!order.customer_id || !cust) {
          alert('Customer Ledger payment requires a customer. Please add a customer first.')
          return
        }
        if (!cust.full_name?.trim()) { alert('Customer Ledger payment requires a customer name.'); return }
        const realPhone = (cust.phone || '').trim()
        if (!realPhone || /^noph/i.test(realPhone)) {
          alert("Customer Ledger payment requires the customer's phone number. Please add the number before completing this order.")
          return
        }
      }

      const isComplimentary = paymentData.paymentMethod === 'Complimentary'
      const isUnpaid = paymentData.paymentMethod === 'Unpaid'
      const shouldComplete = paymentData.completeOrder !== false

      if (cacheManager.checkOnlineStatus()) {
        // Update payment fields + order_status in ONE atomic write
        const cashierData = authManager.getCashier()
        const { error } = await supabase
          .from('orders')
          .update({
            payment_method: paymentData.paymentMethod,
            payment_status: isUnpaid ? 'Pending' : 'Paid',
            amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
            ...(shouldComplete ? { order_status: 'Completed' } : {}),
            ...(shouldComplete && cashierData?.id && !order.cashier_id ? { cashier_id: cashierData.id } : {}),
            ...(shouldComplete && cashierData?.id ? { modified_by_cashier_id: cashierData.id } : {}),
            ...(isComplimentary && paymentData.complimentaryReason ? { order_instructions: [order.order_instructions, `[COMPLIMENTARY: ${paymentData.complimentaryReason}]`].filter(Boolean).join(' | ') } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)
        if (error) throw error

        // Account payment: create customer ledger entry
        if (paymentData.paymentMethod === 'Account' && order.customer_id) {
          try {
            const currentUser = authManager.getCurrentUser()
            if (currentUser?.id) {
              const customerLedgerModule = await import('../../lib/customerLedgerManager')
              const customerLedgerManager = customerLedgerModule.default
              customerLedgerManager.setUserId(currentUser.id)

              const { data: existing } = await supabase
                .from('customer_ledger')
                .select('*')
                .eq('order_id', order.id)
                .eq('user_id', currentUser.id)
                .eq('transaction_type', 'debit')
                .maybeSingle()

              if (existing) {
                if (existing.amount !== paymentData.newTotal) {
                  await supabase.from('customer_ledger').delete().eq('id', existing.id)
                  const currentBalance = await customerLedgerManager.getCustomerBalance(order.customer_id)
                  const newBalance = currentBalance + paymentData.newTotal
                  await supabase.from('customer_ledger').insert({
                    user_id: currentUser.id, customer_id: order.customer_id,
                    transaction_type: 'debit', amount: paymentData.newTotal,
                    balance_before: currentBalance, balance_after: newBalance,
                    order_id: order.id,
                    description: `Order #${order.order_number} - ${(order.order_type || 'WALKIN').toUpperCase()}`,
                    notes: 'Payment completed via inline payment modal', created_by: currentUser.id
                  })
                  await supabase.from('customers').update({ account_balance: newBalance }).eq('id', order.customer_id)
                }
              } else {
                const currentBalance = await customerLedgerManager.getCustomerBalance(order.customer_id)
                const newBalance = currentBalance + paymentData.newTotal
                await supabase.from('customer_ledger').insert({
                  user_id: currentUser.id, customer_id: order.customer_id,
                  transaction_type: 'debit', amount: paymentData.newTotal,
                  balance_before: currentBalance, balance_after: newBalance,
                  order_id: order.id,
                  description: `Order #${order.order_number} - ${(order.order_type || 'WALKIN').toUpperCase()}`,
                  notes: 'Payment completed via inline payment modal', created_by: currentUser.id
                })
                await supabase.from('customers').update({ account_balance: newBalance }).eq('id', order.customer_id)
              }
            }
          } catch (ledgerError) {
            console.error('Failed to handle customer ledger:', ledgerError)
            // Don't fail payment if ledger update fails
          }

          // Auto-send WhatsApp bill (fire-and-forget)
          const cust = order.customers || order.customer
          if (cust?.phone) {
            triggerAccountAutoSend({
              orderId: order.id,
              orderNumber: order.order_number,
              customer: { id: order.customer_id, full_name: cust.full_name, phone: cust.phone },
              totalAmount: paymentData.newTotal,
              orderType: order.order_type,
              previousBalance: 0, // will be fetched from ledger in accountAutoSend
              newBalance: 0,
            })
          }
        }
      } else {
        const orderIndex = cacheManager.cache.orders.findIndex(o => o.id === order.id)
        if (orderIndex !== -1) {
          cacheManager.cache.orders[orderIndex] = {
            ...cacheManager.cache.orders[orderIndex],
            payment_method: paymentData.paymentMethod,
            payment_status: isUnpaid ? 'Pending' : 'Paid',
            amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
            ...(shouldComplete ? { order_status: 'Completed' } : {}),
            updated_at: new Date().toISOString(),
            _isSynced: false
          }
          await cacheManager.saveCacheToStorage()
        }
      }

      if (!shouldComplete) {
        setSelectedOrder(prev => prev?.id === order.id
          ? { ...prev, payment_status: isUnpaid ? 'Pending' : 'Paid', payment_method: paymentData.paymentMethod, amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal, total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal }
          : prev)
        toast.success('Payment recorded successfully')
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      toast.success(`Order #${order.order_number} paid and completed!`)
      // Inventory deduction + post-completion tasks (status already set above)
      await handleOrderStatusUpdate(order, 'Completed')
    } catch (error) {
      toast.error(`Payment failed: ${error?.message}`)
    }
  }

  const handleCompleteAlreadyPaidOrder = async (order) => {
    try {
      if (!order) { setOrdersRefreshTrigger(prev => prev + 1); return }
      toast.success(`Order #${order.order_number} completed!`)
      await handleOrderStatusUpdate(order, 'Completed')
    } catch (error) {
      toast.error(`Failed to complete order: ${error?.message}`)
    }
  }

  const handlePrintReceipt = async (overrideOrderData = null) => {
    const printData = overrideOrderData || completedOrderData
    if (!printData) return
    setIsPrinting(true)
    try {
      if (!printerManager.isElectron()) {
        notify.warning('Printing is only available in the desktop app.')
        return
      }
      if (user?.id) printerManager.setUserId(user.id)
      const printerConfig = await printerManager.getPrinterForPrinting()
      if (!printerConfig) {
        notify.warning('No printer configured. Please configure a printer in Settings.')
        return
      }
      const userProfileRaw = JSON.parse(
        localStorage.getItem('user_profile') || localStorage.getItem('user') || '{}'
      )
      const localLogo = localStorage.getItem('store_logo_local')
      const localQr = localStorage.getItem('qr_code_local')
      const order = printData.order
      const cashierName = order?.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order?.users?.customer_name || 'Admin')
      const userProfileData = {
        store_name: userProfileRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || '',
        phone: userProfileRaw?.phone || '',
        store_logo: localLogo || userProfileRaw?.store_logo || null,
        qr_code: localQr || userProfileRaw?.qr_code || null,
        hashtag1: userProfileRaw?.hashtag1 || '',
        hashtag2: userProfileRaw?.hashtag2 || '',
        show_footer_section: userProfileRaw?.show_footer_section !== false,
        show_logo_on_receipt: userProfileRaw?.show_logo_on_receipt !== false,
        show_business_name_on_receipt: userProfileRaw?.show_business_name_on_receipt !== false,
        show_powered_by_airoxlab: userProfileRaw?.show_powered_by_airoxlab !== false,
        phone_secondary: userProfileRaw?.phone_secondary || '',
        receipt_review_message: userProfileRaw?.receipt_review_message || '',
        receipt_footer_message: userProfileRaw?.receipt_footer_message || '',
        cashier_name: order?.cashier_id ? cashierName : null,
        customer_name: !order?.cashier_id ? cashierName : null,
      }
      const completedOrderTakerName = order?.order_takers?.name ||
        (order?.order_taker_id
          ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
          : null)
      const { order: _rawOrder, ...printDataWithoutOrder } = printData
      const finalPrintData = {
        ...printDataWithoutOrder,
        orderId: printData.order?.id || printData.orderId,
        order_taker_name: completedOrderTakerName || null
      }
      const result = await printerManager.printReceipt(finalPrintData, userProfileData, printerConfig)
      if (result.success) {
        notify.success('Receipt printed successfully')
        setShowSuccessModal(false)
      } else {
        notify.error(`Failed to print receipt: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('Error printing receipt:', error)
      notify.error(`Error printing receipt: ${error.message}`)
    } finally {
      setIsPrinting(false)
    }
  }

  const handleQuickCompleteOrder = async (order, paymentMethod, action, cashReceived) => {
    try {
      if (!paymentMethod || action === 'complete') {
        await handleCompleteAlreadyPaidOrder(order)
      } else {
        const total = order.total_amount
        const cash = parseFloat(cashReceived) || total
        const scAmount = parseFloat(order.service_charge_amount || 0)
        const scPct    = parseFloat(order.service_charge_percentage || 0)
        await handlePaymentRequired(order, {
          paymentMethod,
          newTotal: total,
          discountAmount: parseFloat(order.discount_amount || 0),
          discountType: 'percentage',
          discountValue: parseFloat(order.discount_percentage || 0),
          serviceChargeAmount: scAmount,
          serviceChargeType: 'percentage',
          serviceChargeValue: scPct,
          changeAmount: Math.max(0, cash - total),
          cashAmount: cash,
          completeOrder: action === 'pay_complete',
        })
      }
      setOrdersRefreshTrigger(prev => prev + 1)
      if (action === 'pay_complete') {
        const total = order.total_amount
        const cash = parseFloat(cashReceived) || total

        // Fetch order items for receipt printing
        let orderItems = []
        if (order.id && cacheManager.checkOnlineStatus()) {
          const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id)
          orderItems = data || []
        }
        if (!orderItems.length) {
          orderItems = order.order_items || order.items || []
          if (!orderItems.length && order.id) {
            const cached = (cacheManager.getAllOrders?.() || []).find(o => o.id === order.id)
            orderItems = cached?.order_items || cached?.items || []
          }
        }

        const cart = orderItems.map(item => {
          if (item.is_deal) {
            let dealProducts = []
            try {
              if (item.deal_products) {
                const parsed = typeof item.deal_products === 'string' ? JSON.parse(item.deal_products) : item.deal_products
                dealProducts = parsed.map(p => ({
                  name: p.name || p.product_name || p.productName || 'Unknown',
                  quantity: p.quantity || 1,
                  variant: p.variant || p.variant_name || p.variantName || null,
                  flavor: p.flavor || null
                }))
              }
            } catch { dealProducts = [] }
            return { id: item.id, isDeal: true, dealId: item.deal_id, dealName: item.product_name || 'Deal', dealProducts, quantity: item.quantity, finalPrice: item.final_price, totalPrice: item.total_price }
          }
          return { id: item.id, isDeal: false, productId: item.product_id, productName: item.product_name, variantId: item.variant_id, variantName: item.variant_name, quantity: item.quantity, finalPrice: item.final_price, totalPrice: item.total_price }
        })

        const discountAmount = parseFloat(order.discount_amount || 0)
        const scAmount       = parseFloat(order.service_charge_amount || 0)
        const delivCharges   = parseFloat(order.delivery_charges || 0)
        const subtotal       = parseFloat(order.subtotal) > 0
          ? parseFloat(order.subtotal)
          : Math.max(0, total + discountAmount - scAmount - delivCharges)

        setCompletedOrderData({
          orderNumber:        order.order_number || order.daily_serial_number,
          dailySerial:        order.daily_serial || null,
          total,
          subtotal,
          paymentMethod:      paymentMethod || order.payment_method || 'Cash',
          orderType:          order.order_type || 'walkin',
          discountAmount,
          serviceChargeAmount: scAmount,
          changeAmount:       Math.max(0, cash - total),
          deliveryCharges:    delivCharges,
          deliveryAddress:    order.delivery_address || null,
          delivery_boy_name:  order.delivery_boys?.name ||
            (order.delivery_boy_id
              ? (cacheManager.getAllDeliveryBoys?.().find(b => b.id === order.delivery_boy_id)?.name || null)
              : null),
          cart,
          order,
        })
        setShowSuccessModal(true)
      }
    } catch (err) {
      console.error('Quick complete failed:', err)
      toast.error('Quick complete failed: ' + err.message)
    }
  }

  return (
    <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      <PosToaster isDark={isDark} toastOptions={{ duration: 2000 }} />

      {/* Main POS Layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left Sidebar - Always-visible active orders with type tabs */}
        <WalkinOrdersSidebar
          onOrderSelect={handleOrderSelect}
          onClose={() => { setSelectedOrder(null); setCurrentView('products') }}
          classes={classes}
          isDark={isDark}
          selectedOrderId={selectedOrder?.id}
          onTableClick={handleTableClick}
          selectedTable={selectedTable}
          onBackClick={handleBackClick}
          orderType={activeOrderType}
          refreshTrigger={ordersRefreshTrigger}
          showTypeTabs={true}
          categories={categories}
          menus={menus}
          allProducts={allProducts}
          deals={deals}
          onCategoryClick={(id) => productGridRef.current?.scrollToCategory(id)}
          onDealsClick={() => productGridRef.current?.scrollToDeals()}
          onTypeTabChange={handleTabSwitch}
          onQuickComplete={handleQuickCompleteOrder}
        />

      {/* Center - Dynamic Content */}
      {currentView === 'products' && (
        <ProductGrid
          ref={productGridRef}
          categories={categories}
          deals={deals}
          allProducts={allProducts}
          onProductClick={handleProductClick}
          onDealClick={handleDealClick}
          classes={classes}
          isDark={isDark}
          networkStatus={networkStatus}
          headerCenter={tabBar}
        />
      )}

      {currentView === 'variant' && (
        <VariantSelectionScreen
          product={selectedProduct}
          variants={productVariants}
          onAddToCart={handleAddToCart}
          onBack={() => setCurrentView('products')}
          classes={classes}
          isDark={isDark}
        />
      )}

      {currentView === 'deal' && (
        <DealFlavorSelectionScreen
          deal={selectedDeal}
          dealProducts={dealProducts}
          onAddToCart={handleAddToCart}
          onBack={() => setCurrentView('products')}
          classes={classes}
          isDark={isDark}
        />
      )}

      {currentView === 'tables' && (
        <TableSelectionPanel
          onSelectTable={(table) => {
            setSelectedTable(table)
            setCurrentView('products')
          }}
          selectedTable={selectedTable}
          classes={classes}
          isDark={isDark}
          onClose={() => setCurrentView('products')}
        />
      )}

      {currentView === 'orders' && selectedOrder && (
        <WalkinOrderDetails
          order={selectedOrder}
          classes={classes}
          isDark={isDark}
          orderType={selectedOrder.order_type || activeOrderType}
          onClose={() => {
            setSelectedOrder(null)
            setCurrentView('products')
          }}
          onPrint={() => handlePrintOrder(selectedOrder)}
          onPrintToken={() => handlePrintToken(selectedOrder)}
          onMarkReady={(order) => handleOrderStatusUpdate(order, 'Ready')}
          onComplete={handleCompleteAlreadyPaidOrder}
          onPaymentRequired={handlePaymentRequired}
          onConvertToDelivery={() => {
            setOrdersRefreshTrigger(prev => prev + 1)
            setSelectedOrder(null)
            setCurrentView('products')
            notify.success('Order converted! Check the delivery page.')
          }}
          onReopen={handleReopenInPlace}
        />
      )}

      {/* Right - Cart */}
      <CartSidebar
        cart={cart}
        customer={customer}
        orderInstructions={orderInstructions}
        onUpdateQuantity={updateCartItemQuantity}
        onRemoveItem={removeCartItem}
        onOrderAndPay={handleOrderAndPay}
        onClearCart={handleClearCart}
        calculateSubtotal={calculateSubtotal}
        calculateTotal={calculateTotal}
        classes={classes}
        isDark={isDark}
        networkStatus={networkStatus}
        orderType={activeOrderType}
        isReopenedOrder={isReopenedOrder}
        onInstructionsChange={(val) => setOrderInstructions(val)}
        onUpdateItemInstruction={updateItemInstruction}
        onUpdateItemDiscount={updateItemDiscount}
        inlineCustomer={true}
        onCustomerChange={(c) => setCustomer(c)}
        orderData={orderExtras[activeOrderType] || {}}
        onOrderDataChange={(data) => setOrderExtras(prev => ({ ...prev, [activeOrderType]: data }))}
        selectedTable={activeOrderType === 'walkin' ? selectedTable : null}
        onChangeTable={handleTableClick}
        orderTakers={activeOrderType === 'walkin' ? orderTakers : []}
        selectedOrderTaker={activeOrderType === 'walkin' ? selectedOrderTaker : null}
        onOrderTakerChange={(taker) => {
          if (activeOrderType !== 'walkin') return
          setSelectedOrderTaker(taker)
          if (taker?.id) {
            localStorage.setItem('new_order_order_taker', JSON.stringify(taker))
          } else {
            localStorage.removeItem('new_order_order_taker')
          }
        }}
        requireOrderTaker={activeOrderType === 'walkin' ? requireOrderTaker : false}
      />

      </div>{/* end flex flex-1 overflow-hidden */}

      {/* Split Payment Modal */}
      {showSplitPaymentModal && splitPaymentOrder && (
        <SplitPaymentModal
          isOpen={showSplitPaymentModal}
          onClose={() => { setShowSplitPaymentModal(false); setSplitPaymentOrder(null) }}
          totalAmount={splitPaymentOrder.total_amount}
          amountDue={splitPaymentOrder.total_amount}
          customer={splitPaymentOrder.customers}
          onPaymentComplete={async (paymentData) => {
            setShowSplitPaymentModal(false)
            setSplitPaymentOrder(null)
            await handlePaymentRequired(splitPaymentOrder, paymentData)
          }}
          isDark={isDark}
          classes={classes}
        />
      )}

      {/* Quick Pay Success Modal */}
      {showSuccessModal && completedOrderData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className={`${isDark ? 'bg-gray-900' : 'bg-white'} rounded-3xl p-8 max-w-md w-full shadow-2xl`}>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className={`text-2xl font-bold ${classes.textPrimary}`}>Order Complete!</h2>
            </div>

            <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-2xl p-4 mb-6 border ${classes.border}`}>
              <p className={`text-sm ${classes.textSecondary} mb-1`}>Order Number</p>
              <p className="text-2xl font-bold text-purple-600">{completedOrderData.orderNumber}</p>
            </div>

            <div className="space-y-2 mb-6 text-left">
              <div className="flex justify-between">
                <span className={classes.textSecondary}>Total Amount:</span>
                <span className={`font-semibold ${classes.textPrimary}`}>Rs {(completedOrderData.total || 0).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className={classes.textSecondary}>Payment Method:</span>
                <span className={`font-semibold ${classes.textPrimary}`}>{completedOrderData.paymentMethod || 'N/A'}</span>
              </div>
              <div className="flex justify-between">
                <span className={classes.textSecondary}>Order Type:</span>
                <span className={`font-semibold ${classes.textPrimary} capitalize`}>{completedOrderData.orderType || 'walkin'}</span>
              </div>
              {completedOrderData.discountAmount > 0 && (
                <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  <span>Discount Applied:</span>
                  <span className="font-semibold">Rs {(completedOrderData.discountAmount || 0).toFixed(2)}</span>
                </div>
              )}
              {completedOrderData.changeAmount > 0 && (
                <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                  <span>Change to Return:</span>
                  <span className="font-semibold">Rs {completedOrderData.changeAmount.toFixed(2)}</span>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => handlePrintReceipt()}
                disabled={isPrinting}
                className={`w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center ${isPrinting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {isPrinting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                    Printing...
                  </>
                ) : (
                  <>
                    <Printer className="w-5 h-5 mr-2" />
                    Print Receipt
                  </>
                )}
              </button>
              <button
                onClick={() => setShowSuccessModal(false)}
                className={`w-full px-6 py-3 ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'} font-semibold rounded-xl transition-all duration-200`}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal */}
      <Modal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        title="Exit new order?"
        maxWidth="max-w-md"
      >
        <div className="text-center space-y-6">
          <div className={`w-16 h-16 ${isDark ? 'bg-yellow-900/20' : 'bg-yellow-100'} rounded-full flex items-center justify-center mx-auto`}>
            <FileText className={`w-8 h-8 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          </div>
          <p className={`${classes.textSecondary}`}>
            You have items in your cart. Discard and exit?
          </p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => setShowExitModal(false)}
              className="px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmExit}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all"
            >
              Discard & Exit
            </button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
