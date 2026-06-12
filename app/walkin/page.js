'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { triggerWhatsAppAutoSend } from '../../lib/whatsappAutoSend'
import { triggerAccountAutoSend } from '../../lib/accountAutoSend'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { printerManager } from '../../lib/printerManager'
import loyaltyManager from '../../lib/loyaltyManager'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { notify } from '../../components/ui/NotificationSystem'
import { getOrderItemsWithChanges, saveChangesOffline } from '../../lib/utils/orderChangesTracker'
import Modal from '../../components/ui/Modal'
import WalkInCustomerForm from '../../components/pos/WalkInCustomerForm'
import CategorySidebar from '../../components/order/CategorySidebar'
import ProductGrid from '../../components/order/ProductGrid'
import VariantSelectionScreen from '../../components/order/VariantSelectionScreen'
import DealFlavorSelectionScreen from '../../components/order/DealFlavorSelectionScreen'
import CartSidebar from '../../components/order/CartSidebar'
import TableSelectionPanel from '../../components/order/TableSelectionPanel'
import WalkinOrdersSidebar from '../../components/order/WalkinOrdersSidebar'
import WalkinOrderDetails from '../../components/order/WalkinOrderDetails'
import SplitPaymentModal from '../../components/pos/SplitPaymentModal'
import { FileText, Check, Eye, Printer, X } from 'lucide-react'
import toast from 'react-hot-toast'
import PosToaster from '@/components/ui/PosToaster'
import { supabase } from '../../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import ProtectedPage from '../../components/ProtectedPage'

export default function WalkInPage() {
  const router = useRouter()
  const productGridRef = useRef(null)
  const checkIntervalRef = useRef(null)

  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [cashierData, setCashierData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [categories, setCategories] = useState(() => cacheManager.isReady() ? cacheManager.getCategories() : [])
  const [menus, setMenus] = useState(() => cacheManager.isReady() ? cacheManager.getMenus() : [])
  const [allProducts, setAllProducts] = useState(() => cacheManager.isReady() ? cacheManager.getProducts() : [])
  const [deals, setDeals] = useState(() => cacheManager.isReady() ? cacheManager.getDeals() : [])
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(null)
  const [orderData, setOrderData] = useState({})
  const [orderInstructions, setOrderInstructions] = useState('')
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(() => cacheManager.isReady())
  const [isLoading, setIsLoading] = useState(() => !cacheManager.isReady())
  const [theme, setTheme] = useState('light')
  const [isReopenedOrder, setIsReopenedOrder] = useState(false)
  const [originalOrderId, setOriginalOrderId] = useState(null)
  const [isPlacingOrder, setIsPlacingOrder] = useState(false)

  // View state management
  const [currentView, setCurrentView] = useState('products') // 'products', 'variant', 'deal', 'tables', 'orders'
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [productVariants, setProductVariants] = useState([])
  const [dealProducts, setDealProducts] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  // Table selection
  const [selectedTable, setSelectedTable] = useState(null)

  // Order taker
  const [orderTakers, setOrderTakers] = useState([])
  const [selectedOrderTaker, setSelectedOrderTaker] = useState(null)
  const [requireOrderTaker, setRequireOrderTaker] = useState(false)
  const [requireCustomer, setRequireCustomer] = useState(false) // from pos_require_customer.walkin

  // POS order behavior settings
  const [showOrderConfirmationPopup, setShowOrderConfirmationPopup] = useState(true)
  const [autoPrintKitchen, setAutoPrintKitchen] = useState(false)
  const [autoPrintReceipt, setAutoPrintReceipt] = useState(false)

  // Orders view
  const [showOrdersView, setShowOrdersView] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0)

  // Modals
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [completedOrderData, setCompletedOrderData] = useState(null)
  const successTimerRef = useRef(null)
  useEffect(() => {
    if (showSuccessModal) {
      clearTimeout(successTimerRef.current)
      successTimerRef.current = setTimeout(() => setShowSuccessModal(false), 3000)
    } else {
      clearTimeout(successTimerRef.current)
    }
    return () => clearTimeout(successTimerRef.current)
  }, [showSuccessModal])
  const [isPrinting, setIsPrinting] = useState(false)
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false)
  const [splitPaymentOrder, setSplitPaymentOrder] = useState(null)

  // Debug: Monitor cart changes
  useEffect(() => {
    console.log('🛒 Cart state changed:', cart.length, 'items', cart)
  }, [cart])

  // Listen for reloadCart event (when reopening from same page)
  useEffect(() => {
    const handleReloadCart = (event) => {
      console.log('🔄 reloadCart event received, reloading cart from localStorage')

      const savedCart = localStorage.getItem('walkin_cart')
      const savedCustomer = localStorage.getItem('walkin_customer')
      const savedInstructions = localStorage.getItem('walkin_instructions')
      const savedModifyingOrderId = localStorage.getItem('walkin_modifying_order')
      const savedTable = localStorage.getItem('walkin_table')

      if (savedCart) {
        try {
          const parsedCart = JSON.parse(savedCart)
          console.log('✅ Reloaded cart from localStorage:', parsedCart.length, 'items')
          setCart(parsedCart)
        } catch (e) {
          console.warn('⚠️ [Walkin] Corrupted cart data in localStorage, resetting:', e)
        }
      }

      // Safe JSON parsing with error handling
      if (savedCustomer && savedCustomer !== 'undefined') {
        try {
          setCustomer(JSON.parse(savedCustomer))
        } catch (e) {
          console.warn('⚠️ Failed to parse customer data:', savedCustomer)
        }
      }

      if (savedInstructions) setOrderInstructions(savedInstructions)

      if (savedTable && savedTable !== 'undefined') {
        try {
          setSelectedTable(JSON.parse(savedTable))
        } catch (e) {
          console.warn('⚠️ Failed to parse table data:', savedTable)
        }
      }

      if (savedModifyingOrderId && savedModifyingOrderId !== 'undefined') {
        setIsReopenedOrder(true)
        setOriginalOrderId(savedModifyingOrderId)
        console.log('✅ [Walkin] Reopen state set:', savedModifyingOrderId)
      }

      const savedOrderTaker = localStorage.getItem('walkin_order_taker')
      if (savedOrderTaker && savedOrderTaker !== 'null') {
        try {
          const taker = JSON.parse(savedOrderTaker)
          if (taker?.id) setSelectedOrderTaker(taker)
        } catch (e) {
          console.warn('⚠️ Failed to parse order taker data')
        }
      } else {
        setSelectedOrderTaker(null)
      }
    }

    window.addEventListener('reloadCart', handleReloadCart)
    return () => window.removeEventListener('reloadCart', handleReloadCart)
  }, [])

  // Save cart to localStorage
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('walkin_cart', JSON.stringify(cart))
      localStorage.setItem('walkin_customer', JSON.stringify(customer))
      localStorage.setItem('walkin_instructions', orderInstructions)
      localStorage.setItem('walkin_reopened', JSON.stringify(isReopenedOrder))
      localStorage.setItem('walkin_original_order', originalOrderId)
      if (selectedTable) {
        localStorage.setItem('walkin_table', JSON.stringify(selectedTable))
      }
    }
  }, [cart, customer, orderInstructions, isReopenedOrder, originalOrderId, selectedTable])


  // Load cached data on mount
  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    const role = authManager.getRole()
    const cashier = authManager.getCashier()
    const session = authManager.getCurrentSession()

    setUser(userData)
    setUserRole(role)
    setCashierData(cashier)
    setSessionId(session?.id)

    console.log('👤 Walkin page loaded by:', role, '-', authManager.getDisplayName())

    if (userData?.id) {
      cacheManager.setUserId(userData.id)
      // Initialize loyalty manager
      loyaltyManager.initialize(userData.id).catch(err => {
        console.error('Failed to initialize loyalty manager:', err)
      })

      // Set up web order notifications
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

    // Function to load order data from localStorage
    const loadOrderDataFromStorage = () => {
      const savedCart = localStorage.getItem('walkin_cart')
      const savedCustomer = localStorage.getItem('walkin_customer')
      const savedInstructions = localStorage.getItem('walkin_instructions')
      const savedModifyingOrderId = localStorage.getItem('walkin_modifying_order')
      const savedOriginalOrderNumber = localStorage.getItem('walkin_modifying_order_number')
      const savedTable = localStorage.getItem('walkin_table')

      console.log('🔄 [Walkin] Loading order data from localStorage:', {
        hasCart: !!savedCart,
        cartItemsCount: savedCart ? (() => { try { return JSON.parse(savedCart).length } catch { return 0 } })() : 0,
        hasModifyingOrder: !!savedModifyingOrderId,
        modifyingOrderId: savedModifyingOrderId,
        orderNumber: savedOriginalOrderNumber,
        hasTable: !!savedTable
      })

      if (savedCart) {
        try {
          const parsedCart = JSON.parse(savedCart)
          console.log('📦 [Walkin] Loading cart from localStorage:', parsedCart)
          setCart(parsedCart)
        } catch (e) {
          console.warn('⚠️ Failed to parse cart data')
        }
      }

      if (savedCustomer && savedCustomer !== 'undefined') {
        try {
          setCustomer(JSON.parse(savedCustomer))
        } catch (e) {
          console.warn('⚠️ Failed to parse customer data')
        }
      }

      if (savedInstructions) setOrderInstructions(savedInstructions)

      if (savedTable && savedTable !== 'undefined') {
        try {
          setSelectedTable(JSON.parse(savedTable))
        } catch (e) {
          console.warn('⚠️ Failed to parse table data')
        }
      }

      if (savedModifyingOrderId && savedModifyingOrderId !== 'undefined') {
        console.log('🔄 [Walkin] Setting as reopened order:', savedModifyingOrderId)
        setIsReopenedOrder(true)
        setOriginalOrderId(savedModifyingOrderId)
      }

      const savedOrderTaker = localStorage.getItem('walkin_order_taker')
      if (savedOrderTaker && savedOrderTaker !== 'null') {
        try {
          const taker = JSON.parse(savedOrderTaker)
          if (taker?.id) setSelectedOrderTaker(taker)
        } catch (e) {
          console.warn('⚠️ Failed to parse order taker data')
        }
      } else {
        setSelectedOrderTaker(null)
      }
    }

    // Load order data from localStorage
    loadOrderDataFromStorage()

    checkAndLoadData()

    const statusInterval = setInterval(() => {
      setNetworkStatus(cacheManager.getNetworkStatus())
    }, 1000)

    // Add window focus listener to reload data when page becomes visible
    const handleFocus = () => {
      console.log('🔄 [Walkin] Window focused, checking for updated order data')
      loadOrderDataFromStorage()
    }

    // Add custom event listener for order reopening
    const handleOrderReopened = (event) => {
      console.log('🔄 [Walkin] Order reopened event received:', event.detail)
      if (event.detail?.orderType === 'walkin') {
        // Small delay to ensure localStorage is fully written
        setTimeout(() => {
          loadOrderDataFromStorage()
        }, 100)
      }
    }

    window.addEventListener('focus', handleFocus)
    window.addEventListener('orderReopened', handleOrderReopened)

    return () => {
      clearInterval(statusInterval)
      clearInterval(checkIntervalRef.current)
      window.removeEventListener('focus', handleFocus)
      window.removeEventListener('orderReopened', handleOrderReopened)
    }
  }, []) // Empty array ensures this runs on every mount

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  const checkAndLoadData = async () => {
    try {
      // Fast path: sync bootstrap already populated the cache from localStorage
      if (cacheManager.isReady()) {
        loadCachedData()
        setIsDataReady(true)
        setIsLoading(false)
        return
      }

      // Slow path: first-ever load (no localStorage cache yet) — fetch from Supabase
      setIsLoading(true)
      await cacheManager.initializeCache()
      if (cacheManager.isReady()) {
        loadCachedData()
        setIsDataReady(true)
      } else {
        notify.error('Failed to load menu data. Please try again from the dashboard.', {
          duration: 6000,
          action: { label: 'Go to Dashboard', onClick: () => router.push('/dashboard') }
        })
      }
      setIsLoading(false)
    } catch (error) {
      console.error('Cache initialization error:', error)
      setIsLoading(false)
      notify.error('Failed to load menu data. Please check your connection.', {
        duration: 6000,
        action: { label: 'Retry', onClick: () => window.location.reload() }
      })
    }
  }

  const loadCachedData = () => {
    const cachedCategories = cacheManager.getCategories()
    const cachedProducts = cacheManager.getProducts()
    const cachedDeals = cacheManager.getDeals()

    setCategories(cachedCategories)
    setMenus(cacheManager.getMenus())
    setAllProducts(cachedProducts)
    setDeals(cachedDeals)

    // Load order takers and require setting
    const takers = cacheManager.getOrderTakers()
    setOrderTakers(takers)
    try {
      const req = localStorage.getItem('pos_require_order_taker')
      if (req !== null) setRequireOrderTaker(JSON.parse(req))
      const reqCust = localStorage.getItem('pos_require_customer')
      if (reqCust !== null) {
        const parsed = JSON.parse(reqCust)
        setRequireCustomer(!!parsed?.walkin)
      }
      const showConf = localStorage.getItem('pos_show_order_confirmation')
      if (showConf !== null) setShowOrderConfirmationPopup(JSON.parse(showConf))
      const autoKitchen = localStorage.getItem('pos_auto_print_kitchen')
      if (autoKitchen !== null) setAutoPrintKitchen(JSON.parse(autoKitchen))
      const autoReceipt = localStorage.getItem('pos_auto_print_receipt')
      if (autoReceipt !== null) setAutoPrintReceipt(JSON.parse(autoReceipt))
    } catch {}


    console.log('📦 Loaded from cache:', {
      categories: cachedCategories.length,
      products: cachedProducts.length,
      deals: cachedDeals.length
    })

    console.log('🎁 Deals data:', cachedDeals)

    // Show notification if no deals
    if (cachedDeals.length === 0) {
      console.warn('⚠️ No active deals found. Make sure:')
      console.warn('   1. Deals exist in the database')
      console.warn('   2. Deals have is_active = true')
      console.warn('   3. Deals belong to the current user')
    }
  }

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    const variants = cacheManager.getProductVariants(product.id)
    setProductVariants(variants)

    // If no variants, add to cart directly
    if (!variants || variants.length === 0) {
      const basePrice = parseFloat(product.base_price)
      const discount = parseFloat(product.discount_percentage) || 0
      const finalPrice = basePrice * (1 - discount / 100)
      const cartItem = {
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
      }
      handleAddToCart(cartItem)
    } else {
      setCurrentView('variant')
    }
  }

  const handleDealClick = async (deal) => {
    // Check if this is a scroll-to-deals request
    if (deal?.scrollToDeals) {
      // Close any open modals first
      if (currentView !== 'products') {
        setCurrentView('products')
        setSelectedProduct(null)
        setSelectedDeal(null)
        setProductVariants([])
      }

      // Scroll to deals section with a small delay
      setTimeout(() => {
        if (productGridRef.current) {
          productGridRef.current.scrollToDeals()
        }
      }, 100)
      return
    }

    // Otherwise, it's a regular deal click
    await cacheManager.ensureDealProducts(deal.id)
    setSelectedDeal(deal)
    const products = cacheManager.getDealProducts(deal.id)
    setDealProducts(products)
    setCurrentView('deal')
  }

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

  const handlePrintReceipt = async (overrideOrderData = null) => {
    const printData = overrideOrderData || completedOrderData
    if (!printData) return

    setIsPrinting(true)
    try {
      // Check if we're in Electron environment
      if (!printerManager.isElectron()) {
        notify.warning('Printing is only available in the desktop app.')
        setIsPrinting(false)
        return
      }

      // Set user ID for printer manager
      if (user?.id) {
        printerManager.setUserId(user.id)
      }

      // Get printer configuration
      const printerConfig = await printerManager.getPrinterForPrinting()

      if (!printerConfig) {
        notify.warning('No printer configured. Please configure a printer in Settings.')
        setIsPrinting(false)
        return
      }

      // Get user profile data
      const userProfileRaw = JSON.parse(
        localStorage.getItem('user_profile') ||
        localStorage.getItem('user') ||
        '{}'
      )

      // Get local assets for offline printing
      const localLogo = localStorage.getItem('store_logo_local')
      const localQr = localStorage.getItem('qr_code_local')

      // Get cashier/admin name from completed order
      const order = printData.order
      const cashierName = order?.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order?.users?.customer_name || 'Admin')

      const userProfileData = {
        store_name: userProfileRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || '',
        phone: userProfileRaw?.phone || '',
        // Use local base64/cached logo first, fallback to URL
        store_logo: localLogo || userProfileRaw?.store_logo || null,
        // Use local QR first, fallback to URL
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
        // Add cashier/admin name for receipt printing
        cashier_name: order?.cashier_id ? cashierName : null,
        customer_name: !order?.cashier_id ? cashierName : null,
      }

      // Resolve order taker name from completed order
      const completedOrderTakerName = order?.order_takers?.name ||
        (order?.order_taker_id
          ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
          : null)

      // Ensure order ID is included at the top level for logo fetching.
      // Exclude the raw `order` object — it contains Supabase internals that can't pass IPC structured clone.
      const { order: _rawOrder, ...printDataWithoutOrder } = printData
      const finalPrintData = {
        ...printDataWithoutOrder,
        orderId: printData.order?.id || printData.orderId,
        order_taker_name: completedOrderTakerName || null
      }

      // Debug log what's being sent to printer
      console.log('🖨️ [Modal Print] Printing receipt with data:', {
        orderNumber: finalPrintData.orderNumber,
        cartLength: finalPrintData.cart?.length,
        discountAmount: finalPrintData.discountAmount,
        loyaltyDiscountAmount: finalPrintData.loyaltyDiscountAmount,
        loyaltyPointsRedeemed: finalPrintData.loyaltyPointsRedeemed,
        deals: finalPrintData.cart?.filter(item => item.isDeal).map(item => ({
          name: item.dealName,
          productsCount: item.dealProducts?.length,
          products: item.dealProducts
        }))
      })

      // Print the receipt
      const result = await printerManager.printReceipt(
        finalPrintData,
        userProfileData,
        printerConfig
      )

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

  const triggerOrderSuccess = (orderData, skipAutoPrint = false, forceModal = false) => {
    setCompletedOrderData(orderData)
    playBeepSound()

    if (!skipAutoPrint && autoPrintKitchen && orderData?.order) {
      handlePrintToken(orderData.order).catch(err => console.error('Auto kitchen print failed:', err))
    }

    if (!forceModal && !showOrderConfirmationPopup) {
      if (!skipAutoPrint && autoPrintReceipt) {
        handlePrintReceipt(orderData).catch(err => console.error('Auto receipt print failed:', err))
      }
      setTimeout(() => {
        setCart([])
        setCustomer(null)
        setOrderInstructions('')
        setSelectedTable(null)
        setCurrentView('products')
        setIsReopenedOrder(false)
        setOriginalOrderId(null)
        clearSavedData()
        setOrdersRefreshTrigger(prev => prev + 1)
        router.push('/walkin')
      }, 300)
      return
    }

    if (!skipAutoPrint && autoPrintReceipt) {
      handlePrintReceipt(orderData).catch(err => console.error('Auto receipt print failed:', err))
    }

    setShowSuccessModal(true)
  }

  const handleNewOrderFromSuccess = () => {
    console.log('🆕 [Walkin] Starting new order, clearing all data')
    setShowSuccessModal(false)
    setCompletedOrderData(null)
    setCart([])
    setCustomer(null)
    setOrderInstructions('')
    setSelectedTable(null)
    setCurrentView('products')
    // Clear reopened order state
    setIsReopenedOrder(false)
    setOriginalOrderId(null)
    // Clear localStorage
    clearSavedData()
    setOrdersRefreshTrigger(prev => prev + 1)
    // Navigate to dashboard
    router.push('/dashboard')
  }

  const handleAddToCart = (cartItem) => {
    setCart(prevCart => {
      // Check if the same item already exists in cart
      const existingItemIndex = prevCart.findIndex(item => {
        // For deals, check if deal IDs match
        if (item.isDeal && cartItem.isDeal) {
          return item.dealId === cartItem.dealId
        }
        // For regular products, check if product ID, variant ID, and instructions match
        if (!item.isDeal && !cartItem.isDeal) {
          return item.productId === cartItem.productId &&
                 item.variantId === cartItem.variantId &&
                 !item.itemInstructions  // don't merge items that have custom instructions
        }
        return false
      })

      // If item exists, increment its quantity
      if (existingItemIndex !== -1) {
        const updatedCart = [...prevCart]
        const existingItem = updatedCart[existingItemIndex]
        const newQuantity = existingItem.quantity + cartItem.quantity
        updatedCart[existingItemIndex] = {
          ...existingItem,
          quantity: newQuantity,
          totalPrice: existingItem.finalPrice * newQuantity
        }
        return updatedCart
      }

      // If item doesn't exist, add it to cart
      return [...prevCart, cartItem]
    })
    setCurrentView('products')
    setSelectedProduct(null)
    setSelectedDeal(null)
    setProductVariants([])
    setDealProducts([])

    const itemName = cartItem.isDeal ? cartItem.dealName : cartItem.productName
    const variantInfo = cartItem.variantName ? ` (${cartItem.variantName})` : ''
    toast.success(`${itemName}${variantInfo} added to cart!`, {
      duration: 1000,
      style: {
        borderRadius: '10px',
        background: theme === 'dark' ? '#1f2937' : '#fff',
        color: theme === 'dark' ? '#f3f4f6' : '#111827',
        border: theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
      },
    })
  }

  const updateCartItemQuantity = (itemId, newQuantity) => {
    if (newQuantity <= 0) {
      removeCartItem(itemId)
      return
    }

    setCart(prevCart => prevCart.map(item => {
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

  const removeCartItem = (itemId) => {
    const item = cart.find(item => item.id === itemId)
    setCart(prevCart => prevCart.filter(item => item.id !== itemId))
    // Removed toast notification - too many notifications
  }

  const handleClearCart = () => {
    setCart([])
    // Removed toast notification - too many notifications
  }

  const updateItemInstruction = (itemId, instruction) => {
    setCart(prev => prev.map(item =>
      item.id === itemId ? { ...item, itemInstructions: instruction } : item
    ))
  }

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0)
  }

  const calculateTotal = () => {
    return calculateSubtotal()
  }

  const scrollToCategory = (categoryId) => {
    // Close any open modals/panels first (including table selection)
    if (currentView !== 'products') {
      setCurrentView('products')
      setSelectedProduct(null)
      setSelectedDeal(null)
      setProductVariants([])
    }

    // Use the ref to scroll to the category section
    // Add a small delay to ensure the view has switched before scrolling
    setTimeout(() => {
      if (productGridRef.current) {
        productGridRef.current.scrollToCategory(categoryId)
      }
    }, 100)
  }

  // Table selection handlers
  const handleTableClick = () => {
    if (currentView === 'tables') {
      // Toggle off - return to products
      setCurrentView('products')
    } else {
      // Show table selection panel
      setCurrentView('tables')
      setSelectedProduct(null)
      setSelectedDeal(null)
      setProductVariants([])
      setDealProducts([])
    }
  }

  const handleTableSelect = (table) => {
    setSelectedTable(table)
    setCurrentView('products')
    // Removed toast notification - too many notifications
  }

  // Orders view handlers
  const handleOrdersClick = () => {
    if (showOrdersView) {
      // Toggle off - return to categories sidebar
      setShowOrdersView(false)
      setSelectedOrder(null)
      // Only go back to products if we were showing order details
      if (currentView === 'orders') {
        setCurrentView('products')
      }
    } else {
      // Show orders list in sidebar (keep current view)
      setShowOrdersView(true)
      // Don't change currentView here - product menu stays visible
    }
  }

  const handleOrderSelect = (order) => {
    setSelectedOrder(order)
    // Now show order details in center area
    setCurrentView('orders')
    setSelectedProduct(null)
    setSelectedDeal(null)
    setProductVariants([])
    setDealProducts([])
  }

  const handleCloseOrdersView = () => {
    setShowOrdersView(false)
    setSelectedOrder(null)
    setCurrentView('products')
  }

  const handleOrderStatusUpdate = async (order, newStatus) => {
    try {
      console.log(`🔄 [Walkin] Updating order ${order.order_number} status from ${order.order_status} to: ${newStatus}`)

      // Track which cashier completed/changed the order
      const additionalData = {}
      const cashierData = authManager.getCashier()
      if (cashierData?.id) {
        additionalData.modified_by_cashier_id = cashierData.id
        // If order has no cashier (e.g. created by order taker), assign the completing cashier
        if (!order.cashier_id) {
          additionalData.cashier_id = cashierData.id
        }
      }

      // Use cacheManager for offline-capable status update
      const result = await cacheManager.updateOrderStatus(order.id, newStatus, additionalData)

      if (!result.success) {
        throw new Error('Failed to update order status')
      }

      // ================================================================
      // INVENTORY DEDUCTION (only for Completed status)
      // ================================================================
      if (newStatus === 'Completed') {
        console.log('📦 [Walkin] Order marked as Completed - attempting inventory deduction')
        console.log('📦 [Walkin] Order details:', {
          order_number: order.order_number,
          order_type: order.order_type,
          order_type_id: order.order_type_id
        })

        // Get order_type_id (crucial for deduction)
        let orderTypeId = order.order_type_id

        // If order_type_id not in order object, try to get it
        if (!orderTypeId) {
          console.warn('⚠️ [Walkin] order_type_id not found in order object')

          // STEP 1: Try to fetch from orders table
          try {
            const { data: orderData, error: fetchError } = await supabase
              .from('orders')
              .select('order_type_id, order_type')
              .eq('id', order.id)
              .single()

            if (!fetchError && orderData?.order_type_id) {
              orderTypeId = orderData.order_type_id
              console.log('✅ [Walkin] Fetched order_type_id from orders table:', orderTypeId)
            } else {
              console.warn('⚠️ [Walkin] order_type_id still null in database, will lookup from order_types table')
            }
          } catch (fetchErr) {
            console.error('❌ [Walkin] Exception fetching from orders table:', fetchErr)
          }

          // STEP 2: If still no order_type_id, lookup from order_types table using order_type string
          if (!orderTypeId && order.order_type) {
            console.log('🔍 [Walkin] Looking up order_type_id from order_types table for:', order.order_type)
            try {
              const { data: orderTypeData, error: lookupError } = await supabase
                .from('order_types')
                .select('id, name, code')
                .eq('code', order.order_type)
                .eq('is_active', true)
                .single()

              if (!lookupError && orderTypeData?.id) {
                orderTypeId = orderTypeData.id
                console.log('✅ [Walkin] Looked up order_type_id from order_types:', orderTypeId, 'for code:', order.order_type)

                // Update the order with the order_type_id for future use
                await supabase
                  .from('orders')
                  .update({ order_type_id: orderTypeId })
                  .eq('id', order.id)
                console.log('✅ [Walkin] Updated order with order_type_id for future use')
              } else {
                console.error('❌ [Walkin] Failed to lookup order_type_id:', lookupError)
              }
            } catch (lookupErr) {
              console.error('❌ [Walkin] Exception looking up order_type_id:', lookupErr)
            }
          }
        } else {
          console.log('✅ [Walkin] Using order_type_id from order object:', orderTypeId)
        }

        // Call the reliable deduction function (ONLINE ONLY)
        if (orderTypeId && user?.id) {
          if (cacheManager.checkOnlineStatus()) {
            console.log('🌐 [Walkin] ONLINE - Calling deduct_inventory_for_order with:', {
              order_id: order.id,
              user_id: user.id,
              order_type_id: orderTypeId
            })

            try {
              const { data: deductionResult, error: deductError } = await supabase.rpc(
                'deduct_inventory_for_order',
                {
                  p_order_id: order.id,
                  p_user_id: user.id,
                  p_order_type_id: orderTypeId
                }
              )

              console.log('📦 [Walkin] Deduction function returned:', { deductionResult, deductError })

              if (deductError) {
                console.error('❌ [Walkin] Inventory deduction database error:', deductError)
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
                console.log(`✅ [Walkin] Inventory deducted successfully: ${deductionResult.deductions_made} items`)
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
              console.warn('⚠️ [Walkin] Inventory deduction returned non-success:', deductionResult)
              const errorMsg = deductionResult?.error || 'Inventory may not have been deducted'
              toast('⚠️ ' + errorMsg, {
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
            console.error('❌ [Walkin] Exception during inventory deduction:', invError)
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
          // OFFLINE MODE: Inventory will be deducted when order syncs
          console.log('📴 [Walkin] OFFLINE - Inventory deduction will happen during sync')
          console.log('📴 [Walkin] Order marked as Completed in cache with:', {
            order_id: order.id,
            order_type_id: orderTypeId,
            order_status: 'Completed'
          })
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
        console.error('❌ [Walkin] Cannot deduct inventory - Missing:', {
          orderTypeId: !!orderTypeId,
          userId: !!user?.id
        })
        toast.error('Cannot deduct inventory: Missing order type or user ID', {
          duration: 6000,
          style: {
            borderRadius: '10px',
            background: theme === 'dark' ? '#1f2937' : '#fff',
            color: theme === 'dark' ? '#f3f4f6' : '#111827',
            border: '2px solid #ef4444',
          },
        })
      }
    }
      // ================================================================

      // Show appropriate toast based on online/offline status
      if (result.isOffline) {
        toast.success(`Order marked as ${newStatus} (will sync when online)`, {
          duration: 3000,
          style: {
            borderRadius: '10px',
            background: theme === 'dark' ? '#1f2937' : '#fff',
            color: theme === 'dark' ? '#f3f4f6' : '#111827',
            border: theme === 'dark' ? '1px solid #f59e0b' : '1px solid #f59e0b',
          },
        })
      } else {
        toast.success(`Order marked as ${newStatus}!`, {
          duration: 2000,
          style: {
            borderRadius: '10px',
            background: theme === 'dark' ? '#1f2937' : '#fff',
            color: theme === 'dark' ? '#f3f4f6' : '#111827',
            border: theme === 'dark' ? '1px solid #374151' : '1px solid #e5e7eb',
          },
        })
      }

      // WhatsApp auto-send
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
      if (newStatus === 'Completed') {
        triggerWhatsAppAutoSend(order, user?.id, 'Completed')
          .then(r => waNotify(r, 'WhatsApp message sent to customer'))
          .catch(err => toast.error(`WhatsApp error: ${err.message}`, { duration: 5000 }))
      }

      // Free the table when a walkin order is completed or cancelled
      if ((newStatus === 'Completed' || newStatus === 'Cancelled') && order.order_type === 'walkin' && order.table_id) {
        await cacheManager.updateTableStatus(order.table_id, 'available')
        console.log(`✅ [Walkin] Table ${order.table_id} freed after order ${newStatus}`)
      }

      // If order is completed, close the order details and refresh orders list
      if (newStatus === 'Completed') {
        setSelectedOrder(null)
        setSelectedTable(null)
        setCurrentView('products')
        // Trigger refresh of orders list to remove completed order
        setOrdersRefreshTrigger(prev => prev + 1)
      } else {
        // Refresh the selected order for other status changes
        setSelectedOrder({ ...order, order_status: newStatus })
      }
    } catch (error) {
      console.error('Error updating order status:', error)
      toast.error('Failed to update order status')
    }
  }

  // Handle payment completion from inline payment view
  const handlePaymentRequired = async (order, paymentData) => {
    try {
      // Check if this is a split payment request
      if (paymentData.useSplitPayment) {
        console.log('💳 Split payment requested for order:', order.order_number)
        setSplitPaymentOrder(order)
        setShowSplitPaymentModal(true)
        return
      }

      // Check if paymentData is an array (split payment results)
      if (Array.isArray(paymentData)) {
        console.log('💳 Processing split payment completion:', paymentData)

        // Calculate total from payments
        const totalPaid = paymentData.reduce((sum, p) => sum + parseFloat(p.amount), 0)

        // Prepare payment transactions
        const transactions = paymentData.map(payment => ({
          order_id: order.id,
          user_id: user?.id || order.user_id,
          payment_method: payment.method,
          amount: parseFloat(payment.amount),
          reference_number: payment.reference || null,
          notes: payment.notes || null,
          created_at: new Date().toISOString()
        }))

        // CRITICAL FIX: Check if online or offline
        if (cacheManager.checkOnlineStatus()) {
          console.log('🌐 [Split Payment] ONLINE - Updating order and inserting transactions to database')

          // Update order with split payment
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

          // Insert payment transactions
          const { error: txError } = await supabase
            .from('order_payment_transactions')
            .insert(transactions)

          if (txError) {
            console.error('❌ Error inserting payment transactions:', txError)
            throw txError
          } else {
            console.log('✅ Split payment transactions inserted to database:', transactions.length)
            // Cache the transactions for offline fallback
            cacheManager.setPaymentTransactions(order.id, transactions)
          }
        } else {
          console.log('📴 [Split Payment] OFFLINE - Caching order update and transactions')

          // Update order in cache
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
            console.log('✅ [Split Payment] Order updated in cache (offline)')
          }

          // Cache the transactions for syncing when online
          cacheManager.setPaymentTransactions(order.id, transactions)
          console.log('✅ [Split Payment] Transactions cached for later sync:', transactions.length)
        }

        // Fetch deal info for any deals in the order (for proper split payment modal printing)
        const dealIds = (order.order_items || []).filter(item => item.is_deal && item.deal_id).map(item => item.deal_id)
        let dealsMap = new Map()

        if (dealIds.length > 0) {
          try {
            if (cacheManager.checkOnlineStatus()) {
              const { data: deals, error: dealsError } = await supabase
                .from('deals')
                .select('*')
                .in('id', dealIds)

              if (!dealsError && deals) {
                deals.forEach(deal => dealsMap.set(deal.id, deal))
                console.log(`✅ [Split Payment] Fetched ${deals.length} deal details for modal (online)`)
              }
            } else {
              const cachedDeals = cacheManager.getDeals()
              cachedDeals.forEach(deal => {
                if (dealIds.includes(deal.id)) {
                  dealsMap.set(deal.id, deal)
                }
              })
              console.log(`✅ [Split Payment] Loaded ${dealsMap.size} deal details from cache (offline)`)
            }
          } catch (error) {
            console.error('[Split Payment] Error fetching deal info:', error)
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`⚠️ [Split Payment] Using cached deals as fallback: ${dealsMap.size} deals`)
          }
        }

        // Prepare order data for success modal with normalized deal data
        const mappedCartItems = (order.order_items || []).map(item => {
          if (item.is_deal) {
            let dealProducts = []
            let dealName = item.product_name

            // Debug: Log raw deal data
            console.log('🔍 [Split Payment Modal] Processing deal item:', {
              product_name: item.product_name,
              deal_id: item.deal_id,
              deal_products_raw: item.deal_products,
              deal_products_type: typeof item.deal_products
            })

            // Parse and normalize deal products
            try {
              if (item.deal_products) {
                const parsedProducts = typeof item.deal_products === 'string'
                  ? JSON.parse(item.deal_products)
                  : item.deal_products

                console.log('🔍 [Split Payment Modal] Parsed products:', parsedProducts)

                // Normalize the structure
                dealProducts = parsedProducts.map(product => ({
                  name: product.name || product.product_name || product.productName || 'Unknown Product',
                  quantity: product.quantity || 1,
                  variant: product.variant || product.variant_name || product.variantName || null,
                  flavor: product.flavor || null
                }))

                console.log(`✅ [Split Payment] Normalized ${dealProducts.length} deal products for modal:`, dealProducts)
              } else {
                console.warn('⚠️ [Split Payment Modal] deal_products is null/undefined for deal:', item.deal_id)
              }
            } catch (e) {
              console.error('❌ [Split Payment] Failed to parse deal_products:', e, 'Raw data:', item.deal_products)
              dealProducts = []
            }

            // Get deal name from database if missing
            if (!dealName && item.deal_id && dealsMap.has(item.deal_id)) {
              const dealInfo = dealsMap.get(item.deal_id)
              dealName = dealInfo.deal_name
              console.log(`✅ [Split Payment] Retrieved deal name: ${dealName}`)
            } else if (!dealName) {
              console.warn('⚠️ [Split Payment Modal] Deal name missing for deal_id:', item.deal_id)
            }

            return {
              id: item.id,
              isDeal: true,
              dealId: item.deal_id,
              dealName: dealName || 'Deal',
              dealProducts: dealProducts,
              quantity: item.quantity,
              finalPrice: item.final_price,
              totalPrice: item.total_price
            }
          }

          return {
            id: item.id,
            isDeal: false,
            productId: item.product_id,
            productName: item.product_name,
            variantId: item.variant_id,
            variantName: item.variant_name,
            quantity: item.quantity,
            finalPrice: item.final_price,
            totalPrice: item.total_price
          }
        })

        // Fetch loyalty redemption for split payment
        let splitLoyaltyDiscountAmount = 0
        let splitLoyaltyPointsRedeemed = 0

        if (cacheManager.checkOnlineStatus()) {
          try {
            const { data: redemption } = await supabase
              .from('loyalty_redemptions')
              .select('points_used, discount_applied')
              .eq('order_id', order.id)
              .maybeSingle()

            if (redemption) {
              splitLoyaltyPointsRedeemed = redemption.points_used || 0
              splitLoyaltyDiscountAmount = redemption.discount_applied || 0
              console.log('✅ Found loyalty redemption for split payment:', {
                splitLoyaltyPointsRedeemed,
                splitLoyaltyDiscountAmount
              })
            }
          } catch (error) {
            console.log('⚠️ No loyalty redemption found for split payment')
          }
        } else {
          // Offline: Check cached order for loyalty data
          console.log('📴 [Split Payment] Offline - checking order for cached loyalty data')
          const cachedLoyaltyData = {
            points_used: order.loyalty_points_redeemed || order.loyaltyPointsRedeemed || 0,
            discount_applied: order.loyalty_discount_amount || order.loyaltyDiscountAmount || 0
          }

          if (cachedLoyaltyData.points_used > 0 || cachedLoyaltyData.discount_applied > 0) {
            splitLoyaltyPointsRedeemed = cachedLoyaltyData.points_used
            splitLoyaltyDiscountAmount = cachedLoyaltyData.discount_applied
            console.log('✅ [Split Payment] Found cached loyalty data:', {
              splitLoyaltyPointsRedeemed,
              splitLoyaltyDiscountAmount
            })
          }
        }

        const orderData = {
          orderNumber: order.order_number,
          dailySerial: order.daily_serial || null,
          total: order.total_amount,
          subtotal: order.subtotal || order.total_amount,
          paymentMethod: 'Split',
          paymentTransactions: transactions,
          orderType: order.order_type || 'walkin',
          tableName: resolveTableName(order),
          discountAmount: order.discount_amount || 0,
          loyaltyDiscountAmount: splitLoyaltyDiscountAmount,
          loyaltyPointsRedeemed: splitLoyaltyPointsRedeemed,
          discountType: 'amount',
          discountValue: order.discount_amount || 0,
          changeAmount: 0,
          cashReceived: null,
          cart: mappedCartItems,
          customer: order.customers || null,
          orderInstructions: order.order_instructions || '',
          deliveryCharges: order.delivery_charges || 0,
          deliveryAddress: order.delivery_address || null,
          order: order
        }

        // Set order data and show modal/auto-redirect based on settings
        triggerOrderSuccess(orderData, !!paymentData.skipAutoPrint, !!paymentData.forceModal)

        // Mark order as completed
        await handleOrderStatusUpdate(order, 'Completed').catch(err => {
          console.error('Error updating order status:', err)
        })

        // Refresh orders list
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

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
        if (!cust.full_name?.trim()) {
          alert('Customer Ledger payment requires a customer name.')
          return
        }
        const realPhone = (cust.phone || '').trim()
        if (!realPhone || /^noph/i.test(realPhone)) {
          alert("Customer Ledger payment requires the customer's phone number. Please add the number before completing this order.")
          return
        }
      }

      // Regular (non-split) payment handling
      // Update order with payment details (works both online and offline)
      const isComplimentary = paymentData.paymentMethod === 'Complimentary'
      const isUnpaid = paymentData.paymentMethod === 'Unpaid'
      // Determine if this payment should also mark the order as Completed
      const shouldComplete = paymentData.completeOrder !== false

      if (cacheManager.checkOnlineStatus()) {
        // Online: Update database directly — include order_status in the SAME write
        // to avoid race conditions where payment is saved but status stays Pending
        const cashierData = authManager.getCashier()
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_method: paymentData.paymentMethod,
            payment_status: isUnpaid ? 'Pending' : 'Paid',
            amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
            total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal,
            ...(shouldComplete ? { order_status: 'Completed' } : {}),
            ...(shouldComplete && cashierData?.id && !order.cashier_id ? { cashier_id: cashierData.id } : {}),
            ...(shouldComplete && cashierData?.id ? { modified_by_cashier_id: cashierData.id } : {}),
            ...(isComplimentary && paymentData.complimentaryReason ? { order_instructions: [order.order_instructions, `[COMPLIMENTARY: ${paymentData.complimentaryReason}]`].filter(Boolean).join(' | ') } : {}),
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)

        if (updateError) throw updateError

        // Optimistic local patch — sidebar removes/updates the card instantly
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('orderLocallyUpdated', {
            detail: {
              orderId: order.id,
              patch: {
                payment_method: paymentData.paymentMethod,
                payment_status: isUnpaid ? 'Pending' : 'Paid',
                amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal,
                total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal,
                ...(shouldComplete ? { order_status: 'Completed' } : {}),
              },
            },
          }))
        }

        // Log the payment action
        await authManager.logOrderAction(
          order.id,
          'payment_completed',
          {
            payment_method: paymentData.paymentMethod,
            amount: paymentData.newTotal,
            discount: paymentData.discountAmount
          },
          `Payment completed: ${paymentData.paymentMethod} - Rs ${paymentData.newTotal}`
        )
      } else {
        // Offline: Update cache only — include order_status in the same write
        console.log('📴 [Payment] Offline mode - updating order in cache')
        const orderIndex = cacheManager.cache.orders.findIndex(o => o.id === order.id)
        if (orderIndex !== -1) {
          cacheManager.cache.orders[orderIndex] = {
            ...cacheManager.cache.orders[orderIndex],
            payment_method: paymentData.paymentMethod,
            payment_status: isUnpaid ? 'Pending' : 'Paid',
            amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
            total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal,
            ...(shouldComplete ? { order_status: 'Completed' } : {}),
            updated_at: new Date().toISOString(),
            _isSynced: false
          }
          await cacheManager.saveCacheToStorage()
          console.log('✅ [Payment] Order updated in cache (offline)')
        }

        // Log payment action offline
        await authManager.logOrderAction(
          order.id,
          'payment_completed',
          {
            payment_method: paymentData.paymentMethod,
            amount: paymentData.newTotal,
            discount: paymentData.discountAmount
          },
          `Payment completed (offline): ${paymentData.paymentMethod} - Rs ${paymentData.newTotal}`
        )
      }

      // CRITICAL FIX: Handle customer ledger entry for Account payment (ONLINE ONLY)
      if (cacheManager.checkOnlineStatus() && paymentData.paymentMethod === 'Account' && order.customer_id) {
        try {
          console.log('💳 [Walkin Payment] Processing customer ledger for Account payment')

          const currentUser = authManager.getCurrentUser()
          if (!currentUser?.id) {
            console.error('⚠️ [Walkin Payment] No current user found, skipping ledger entry')
          } else {
            // Import customerLedgerManager
            const customerLedgerModule = await import('../../lib/customerLedgerManager')
            const customerLedgerManager = customerLedgerModule.default
            customerLedgerManager.setUserId(currentUser.id)

            // Check if ledger entry already exists for this order
            const { data: existingLedgerEntry } = await supabase
              .from('customer_ledger')
              .select('*')
              .eq('order_id', order.id)
              .eq('user_id', currentUser.id)
              .eq('transaction_type', 'debit')
              .maybeSingle()

            if (existingLedgerEntry) {
              // Update existing ledger entry if amount changed
              if (existingLedgerEntry.amount !== paymentData.newTotal) {
                console.log(`💳 [Walkin Payment] Updating ledger from Rs ${existingLedgerEntry.amount} to Rs ${paymentData.newTotal}`)

                // Delete old entry
                const { error: deleteError } = await supabase
                  .from('customer_ledger')
                  .delete()
                  .eq('id', existingLedgerEntry.id)

                if (deleteError) {
                  console.error('⚠️ [Walkin Payment] Error deleting old ledger entry:', deleteError.message)
                } else {
                  // Create new entry with updated amount
                  const currentBalance = await customerLedgerManager.getCustomerBalance(order.customer_id)
                  const newBalance = currentBalance + paymentData.newTotal

                  const { error: ledgerError } = await supabase
                    .from('customer_ledger')
                    .insert({
                      user_id: currentUser.id,
                      customer_id: order.customer_id,
                      transaction_type: 'debit',
                      amount: paymentData.newTotal,
                      balance_before: currentBalance,
                      balance_after: newBalance,
                      order_id: order.id,
                      description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'WALKIN'} (Payment completed)`,
                      notes: `Payment completed via inline payment modal`,
                      created_by: currentUser.id
                    })

                  if (ledgerError) {
                    console.error('⚠️ [Walkin Payment] Error creating updated ledger entry:', ledgerError.message)
                  } else {
                    console.log(`✅ [Walkin Payment] Updated ledger entry: Rs ${paymentData.newTotal} (Balance: ${newBalance})`)
                    await supabase.from('customers').update({ account_balance: newBalance }).eq('id', order.customer_id)
                  }
                }
              } else {
                console.log('ℹ️ [Walkin Payment] Ledger entry exists with same amount, no update needed')
              }
            } else {
              // Create new ledger entry
              console.log(`💳 [Walkin Payment] Creating new ledger entry: Rs ${paymentData.newTotal}`)

              const currentBalance = await customerLedgerManager.getCustomerBalance(order.customer_id)
              const newBalance = currentBalance + paymentData.newTotal

              const { error: ledgerError } = await supabase
                .from('customer_ledger')
                .insert({
                  user_id: currentUser.id,
                  customer_id: order.customer_id,
                  transaction_type: 'debit',
                  amount: paymentData.newTotal,
                  balance_before: currentBalance,
                  balance_after: newBalance,
                  order_id: order.id,
                  description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'WALKIN'}`,
                  notes: `Payment completed via inline payment modal`,
                  created_by: currentUser.id
                })

              if (ledgerError) {
                console.error('⚠️ [Walkin Payment] Error creating ledger entry:', ledgerError.message)
              } else {
                console.log(`✅ [Walkin Payment] Created ledger entry: Rs ${paymentData.newTotal} (Balance: ${newBalance})`)
                await supabase.from('customers').update({ account_balance: newBalance }).eq('id', order.customer_id)
              }
            }
          }
        } catch (ledgerError) {
          console.error('❌ [Walkin Payment] Failed to handle customer ledger:', ledgerError)
          // Don't fail the payment if ledger update fails
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
          })
        }
      } else if (paymentData.paymentMethod === 'Account' && order.customer_id) {
        // OFFLINE: queue the Account ledger entry so syncPendingLedgerEntries replays it on reconnect
        cacheManager.addPendingLedgerEntry({
          type: 'debit',
          customer_id: order.customer_id,
          amount: paymentData.newTotal,
          order_id: order.id,
          description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'WALKIN'}`,
          notes: 'Queued offline — will sync on reconnect',
        })
        console.log('💳 [Walkin Payment] Offline — Account ledger queued for sync')
      }

      // Payment-only: update selectedOrder in state and return — no modal, stays in order details
      if (paymentData.completeOrder === false) {
        setSelectedOrder(prev => prev?.id === order.id
          ? { ...prev, payment_status: isUnpaid ? 'Pending' : 'Paid', payment_method: paymentData.paymentMethod, amount_paid: (isComplimentary || isUnpaid) ? 0 : paymentData.newTotal, total_amount: isComplimentary || isUnpaid ? order.total_amount : paymentData.newTotal, service_charge_amount: paymentData.serviceChargeAmount || 0, service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0 }
          : prev)
        toast.success('Payment recorded successfully')
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      // Fetch loyalty redemption for this order
      let loyaltyDiscountAmount = 0
      let loyaltyPointsRedeemed = 0

      if (cacheManager.checkOnlineStatus()) {
        try {
          const { data: redemption } = await supabase
            .from('loyalty_redemptions')
            .select('points_used, discount_applied')
            .eq('order_id', order.id)
            .maybeSingle()

          if (redemption) {
            loyaltyPointsRedeemed = redemption.points_used || 0
            loyaltyDiscountAmount = redemption.discount_applied || 0
            console.log('✅ Found loyalty redemption for payment (online):', {
              loyaltyPointsRedeemed,
              loyaltyDiscountAmount
            })
          }
        } catch (error) {
          console.log('⚠️ No loyalty redemption found for this order')
        }
      } else {
        // Offline: Check cached order for loyalty data
        console.log('📴 [Payment] Offline mode - checking order for cached loyalty data')
        const cachedLoyaltyData = {
          points_used: order.loyalty_points_redeemed || order.loyaltyPointsRedeemed || 0,
          discount_applied: order.loyalty_discount_amount || order.loyaltyDiscountAmount || 0
        }

        if (cachedLoyaltyData.points_used > 0 || cachedLoyaltyData.discount_applied > 0) {
          loyaltyPointsRedeemed = cachedLoyaltyData.points_used
          loyaltyDiscountAmount = cachedLoyaltyData.discount_applied
          console.log('✅ [Payment] Found cached loyalty data in order object (offline):', {
            loyaltyPointsRedeemed,
            loyaltyDiscountAmount
          })
        } else {
          console.log('⚠️ [Payment] No cached loyalty data found in order object (offline)')
        }
      }

      // Fetch deal info for any deals in the order (for proper printing)
      const dealIds = (order.order_items || []).filter(item => item.is_deal && item.deal_id).map(item => item.deal_id)
      let dealsMap = new Map()

      if (dealIds.length > 0) {
        try {
          if (cacheManager.checkOnlineStatus()) {
            const { data: deals, error: dealsError } = await supabase
              .from('deals')
              .select('*')
              .in('id', dealIds)

            if (!dealsError && deals) {
              deals.forEach(deal => dealsMap.set(deal.id, deal))
              console.log(`✅ Fetched ${deals.length} deal details for modal print (online)`)
            }
          } else {
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`✅ Loaded ${dealsMap.size} deal details from cache for modal print (offline)`)
          }
        } catch (error) {
          console.error('Error fetching deal info for modal:', error)
          const cachedDeals = cacheManager.getDeals()
          cachedDeals.forEach(deal => {
            if (dealIds.includes(deal.id)) {
              dealsMap.set(deal.id, deal)
            }
          })
          console.log(`⚠️ Using cached deals as fallback for modal: ${dealsMap.size} deals`)
        }
      }

      // Prepare order data for success modal and printing FIRST
      // Map order_items to have correct camelCase properties for printer
      const mappedCartItems = (order.order_items || []).map(item => {
        if (item.is_deal) {
          let dealProducts = []
          let dealName = item.product_name

          // Debug: Log raw deal data
          console.log('🔍 [Modal] Processing deal item:', {
            product_name: item.product_name,
            deal_id: item.deal_id,
            deal_products_raw: item.deal_products,
            deal_products_type: typeof item.deal_products
          })

          // Parse and normalize deal products
          try {
            if (item.deal_products) {
              const parsedProducts = typeof item.deal_products === 'string'
                ? JSON.parse(item.deal_products)
                : item.deal_products

              console.log('🔍 [Modal] Parsed products:', parsedProducts)

              // Normalize the structure
              dealProducts = parsedProducts.map(product => ({
                name: product.name || product.product_name || product.productName || 'Unknown Product',
                quantity: product.quantity || 1,
                variant: product.variant || product.variant_name || product.variantName || null,
                flavor: product.flavor || null
              }))

              console.log(`✅ Normalized ${dealProducts.length} deal products for modal:`, dealProducts)
            } else {
              console.warn('⚠️ [Modal] deal_products is null/undefined for deal:', item.deal_id)
            }
          } catch (e) {
            console.error('❌ Failed to parse deal_products in modal:', e, 'Raw data:', item.deal_products)
            dealProducts = []
          }

          // Get deal name from database if missing
          if (!dealName && item.deal_id && dealsMap.has(item.deal_id)) {
            const dealInfo = dealsMap.get(item.deal_id)
            dealName = dealInfo.deal_name
            console.log(`✅ Retrieved deal name for modal: ${dealName}`)
          } else if (!dealName) {
            console.warn('⚠️ [Modal] Deal name missing and not found in dealsMap for deal_id:', item.deal_id)
          }

          return {
            id: item.id,
            isDeal: true,
            dealId: item.deal_id,
            dealName: dealName || 'Deal',
            dealProducts: dealProducts,
            quantity: item.quantity,
            finalPrice: item.final_price,
            totalPrice: item.total_price
          }
        }

        return {
          id: item.id,
          isDeal: false,
          productId: item.product_id,
          productName: item.product_name,
          variantId: item.variant_id,
          variantName: item.variant_name,
          quantity: item.quantity,
          finalPrice: item.final_price,
          totalPrice: item.total_price
        }
      })

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        total: paymentData.newTotal,
        subtotal: parseFloat(order.subtotal) > 0
          ? parseFloat(order.subtotal)
          : Math.max(0, paymentData.newTotal + (paymentData.discountAmount || 0) - (paymentData.serviceChargeAmount || 0) - (order.delivery_charges || 0)),
        paymentMethod: paymentData.paymentMethod,
        orderType: order.order_type || 'walkin',
        tableName: resolveTableName(order),
        discountAmount: paymentData.discountAmount || 0,
        loyaltyDiscountAmount: loyaltyDiscountAmount,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed,
        discountType: paymentData.discountType || 'percentage',
        discountValue: paymentData.discountValue || 0,
        serviceChargeAmount: paymentData.serviceChargeAmount || 0,
        serviceChargeType: paymentData.serviceChargeType || 'percentage',
        serviceChargeValue: paymentData.serviceChargeValue || 0,
        changeAmount: paymentData.changeAmount || 0,
        cashReceived: paymentData.cashAmount || null,
        cart: mappedCartItems,
        customer: order.customers ? {
          id: order.customers.id || null,
          full_name: order.customers.full_name || null,
          phone: order.customers.phone || null,
          email: order.customers.email || null,
        } : null,
        orderInstructions: order.order_instructions || '',
        deliveryCharges: order.delivery_charges || 0,
        deliveryAddress: order.delivery_address || null,
        order: order
      }

      // Debug log for modal print data
      console.log('🖨️ [Modal Print Data] Cart items prepared:', mappedCartItems.length)
      mappedCartItems.forEach((item, idx) => {
        if (item.isDeal) {
          console.log(`  Deal ${idx}:`, {
            dealName: item.dealName,
            dealId: item.dealId,
            products: item.dealProducts?.length || 0,
            firstProduct: item.dealProducts?.[0]
          })
        }
      })

      // Fetch payment transactions for split payment
      if (paymentData.paymentMethod === 'Split' && order.id) {
        try {
          // Try cache first (for offline support)
          const cachedTransactions = cacheManager.getPaymentTransactions(order.id)
          if (cachedTransactions && cachedTransactions.length > 0) {
            orderData.paymentTransactions = cachedTransactions
            console.log('✅ Using cached payment transactions for modal:', cachedTransactions)
          } else if (cacheManager.checkOnlineStatus()) {
            // Fetch from database if online and not cached
            const { data: transactions, error: txError } = await supabase
              .from('order_payment_transactions')
              .select('*')
              .eq('order_id', order.id)
              .order('created_at', { ascending: true })

            if (txError) {
              console.error('Error fetching payment transactions for modal:', txError)
            } else if (transactions && transactions.length > 0) {
              cacheManager.setPaymentTransactions(order.id, transactions)
              orderData.paymentTransactions = transactions
              console.log('✅ Found payment transactions for modal:', transactions)
            }
          } else {
            console.log('📴 Offline: No cached payment transactions found for modal')
          }
        } catch (error) {
          console.error('Error fetching payment transactions for modal:', error)
        }
      }

      // Set order data and show modal/auto-redirect based on settings
      triggerOrderSuccess(orderData, !!paymentData.skipAutoPrint, !!paymentData.forceModal)

      // Inventory deduction + refresh (status already set in the payment update above)
      if (shouldComplete) {
        // Run inventory deduction (the status is already Completed in DB/cache)
        await handleOrderStatusUpdate(order, 'Completed').catch(err => {
          console.error('Error during post-completion tasks:', err)
        })
      }

      // Refresh orders list
      setOrdersRefreshTrigger(prev => prev + 1)

    } catch (error) {
      toast.error(`Payment failed: ${error?.message}`)
      notify.error(`Failed to complete payment: ${error.message}`)
    }
  }

  // Quick-complete an order from the sidebar without opening it
  const handleQuickCompleteOrder = async (order, paymentMethod, action, cashReceived) => {
    try {
      if (!paymentMethod || action === 'complete') {
        await handleCompleteAlreadyPaidOrder(order, true, true)
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
          skipAutoPrint: true,
          forceModal: action === 'pay_complete',
        })
      }
    } catch (err) {
      console.error('Quick complete failed:', err)
      toast.error('Quick complete failed: ' + err.message)
    }
  }

  // Handle completing an already-paid order (show success modal for printing)
  const handleCompleteAlreadyPaidOrder = async (order, skipAutoPrint = false, forceModal = false) => {
    try {
      // If no order provided (e.g., called from cancel), just refresh the list
      if (!order) {
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      // Fetch loyalty redemption for this order
      let loyaltyDiscountAmount = 0
      let loyaltyPointsRedeemed = 0

      // Check if we're online or offline
      if (cacheManager.checkOnlineStatus()) {
        // Online: Try to fetch from database
        try {
          const { data: redemption } = await supabase
            .from('loyalty_redemptions')
            .select('points_used, discount_applied')
            .eq('order_id', order.id)
            .maybeSingle()

          if (redemption) {
            loyaltyPointsRedeemed = redemption.points_used || 0
            loyaltyDiscountAmount = redemption.discount_applied || 0
            console.log('✅ Found loyalty redemption for completed order (online):', {
              loyaltyPointsRedeemed,
              loyaltyDiscountAmount
            })
          }
        } catch (error) {
          console.log('⚠️ No loyalty redemption found for this order (online)')
        }
      } else {
        // Offline: Check cached order for loyalty data
        console.log('📴 [handleCompleteAlreadyPaidOrder] Offline - checking order for cached loyalty data')
        const cachedLoyaltyData = {
          points_used: order.loyalty_points_redeemed || order.loyaltyPointsRedeemed || 0,
          discount_applied: order.loyalty_discount_amount || order.loyaltyDiscountAmount || 0
        }

        if (cachedLoyaltyData.points_used > 0 || cachedLoyaltyData.discount_applied > 0) {
          loyaltyPointsRedeemed = cachedLoyaltyData.points_used
          loyaltyDiscountAmount = cachedLoyaltyData.discount_applied
          console.log('✅ Found cached loyalty data in order object (offline):', {
            loyaltyPointsRedeemed,
            loyaltyDiscountAmount
          })
        } else {
          console.log('⚠️ No cached loyalty data found in order object (offline)')
        }
      }

      // Fetch deal info for any deals in the order (for proper printing)
      const dealIds = (order.order_items || []).filter(item => item.is_deal && item.deal_id).map(item => item.deal_id)
      let dealsMap = new Map()

      if (dealIds.length > 0) {
        try {
          if (cacheManager.checkOnlineStatus()) {
            const { data: deals, error: dealsError } = await supabase
              .from('deals')
              .select('*')
              .in('id', dealIds)

            if (!dealsError && deals) {
              deals.forEach(deal => dealsMap.set(deal.id, deal))
              console.log(`✅ [Already Paid] Fetched ${deals.length} deal details for modal (online)`)
            }
          } else {
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`✅ [Already Paid] Loaded ${dealsMap.size} deal details from cache (offline)`)
          }
        } catch (error) {
          console.error('[Already Paid] Error fetching deal info:', error)
          const cachedDeals = cacheManager.getDeals()
          cachedDeals.forEach(deal => {
            if (dealIds.includes(deal.id)) {
              dealsMap.set(deal.id, deal)
            }
          })
          console.log(`⚠️ [Already Paid] Using cached deals as fallback: ${dealsMap.size} deals`)
        }
      }

      // Map order_items with normalized deal data for printer
      const mappedCartItems = (order.order_items || []).map(item => {
        if (item.is_deal) {
          let dealProducts = []
          let dealName = item.product_name

          // Parse and normalize deal products
          try {
            if (item.deal_products) {
              const parsedProducts = typeof item.deal_products === 'string'
                ? JSON.parse(item.deal_products)
                : item.deal_products

              // Normalize the structure
              dealProducts = parsedProducts.map(product => ({
                name: product.name || product.product_name || product.productName || 'Unknown Product',
                quantity: product.quantity || 1,
                variant: product.variant || product.variant_name || product.variantName || null,
                flavor: product.flavor || null
              }))

              console.log(`✅ [Already Paid] Normalized ${dealProducts.length} deal products`)
            }
          } catch (e) {
            console.error('❌ [Already Paid] Failed to parse deal_products:', e)
            dealProducts = []
          }

          // Get deal name from database if missing
          if (!dealName && item.deal_id && dealsMap.has(item.deal_id)) {
            const dealInfo = dealsMap.get(item.deal_id)
            dealName = dealInfo.deal_name
          }

          return {
            id: item.id,
            isDeal: true,
            dealId: item.deal_id,
            dealName: dealName || 'Deal',
            dealProducts: dealProducts,
            quantity: item.quantity,
            finalPrice: item.final_price,
            totalPrice: item.total_price
          }
        }

        return {
          id: item.id,
          isDeal: false,
          productId: item.product_id,
          productName: item.product_name,
          variantId: item.variant_id,
          variantName: item.variant_name,
          quantity: item.quantity,
          finalPrice: item.final_price,
          totalPrice: item.total_price
        }
      })

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        total: order.total_amount || order.subtotal || 0,
        subtotal: order.subtotal || order.total_amount || 0,
        paymentMethod: order.payment_method || 'Cash',
        orderType: order.order_type || 'walkin',
        tableName: resolveTableName(order),
        discountAmount: order.discount_amount || 0,
        loyaltyDiscountAmount: loyaltyDiscountAmount,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed,
        discountType: order.discount_percentage > 0 ? 'percentage' : 'fixed',
        discountValue: order.discount_percentage || order.discount_amount || 0,
        changeAmount: 0,
        cashReceived: null,
        cart: mappedCartItems,
        customer: order.customers || null,
        orderInstructions: order.order_instructions || '',
        deliveryCharges: order.delivery_charges || 0,
        deliveryAddress: order.delivery_address || null,
        order: order
      }

      // Fetch payment transactions for split payment
      if (order.payment_method === 'Split' && order.id) {
        try {
          // Try cache first (for offline support)
          const cachedTransactions = cacheManager.getPaymentTransactions(order.id)
          if (cachedTransactions && cachedTransactions.length > 0) {
            orderData.paymentTransactions = cachedTransactions
            console.log('✅ Using cached payment transactions for already-paid modal:', cachedTransactions)
          } else if (cacheManager.checkOnlineStatus()) {
            // Fetch from database if online and not cached
            const { data: transactions, error: txError } = await supabase
              .from('order_payment_transactions')
              .select('*')
              .eq('order_id', order.id)
              .order('created_at', { ascending: true })

            if (txError) {
              console.error('Error fetching payment transactions for already-paid modal:', txError)
            } else if (transactions && transactions.length > 0) {
              cacheManager.setPaymentTransactions(order.id, transactions)
              orderData.paymentTransactions = transactions
              console.log('✅ Found payment transactions for already-paid modal:', transactions)
            }
          } else {
            console.log('📴 Offline: No cached payment transactions found for already-paid modal')
          }
        } catch (error) {
          console.error('Error fetching payment transactions for already-paid modal:', error)
        }
      }

      // Set order data and show modal/auto-redirect based on settings
      triggerOrderSuccess(orderData, skipAutoPrint, forceModal)

      // Optimistic local patch — removes the card from the sidebar instantly
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('orderLocallyUpdated', {
          detail: { orderId: order.id, patch: { order_status: 'Completed' } },
        }))
      }

      // Mark order as completed (this happens in background, modal stays visible)
      handleOrderStatusUpdate(order, 'Completed').catch(err => {
        console.error('Error updating order status:', err)
      })

      // Refresh orders list
      setOrdersRefreshTrigger(prev => prev + 1)

    } catch (error) {
      console.error('Error completing order:', error)
      notify.error(`Failed to complete order: ${error.message}`)
    }
  }

  const handlePrintOrder = async (order, loyaltyRedemption = null) => {
    try {
      if (!user?.id) {
        toast.error('User not logged in')
        return
      }

      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()

      if (!printer) {
        toast.error('No printer configured. Please configure a printer in settings.')
        return
      }

      // Fetch order items — gate supabase on online status, fall back to cache when offline
      let orderItems = []
      if (order.id && cacheManager.checkOnlineStatus()) {
        const { data } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) {
        orderItems = order.order_items || order.items || []
        if (!orderItems.length && order.id) {
          const cached = (cacheManager.getAllOrders?.() || []).find(o => o.id === order.id)
          orderItems = cached?.order_items || cached?.items || []
        }
      }

      // Fetch loyalty redemption for this order
      let loyaltyDiscountAmount = 0
      let loyaltyPointsRedeemed = 0

      // If loyalty redemption was passed from child component, use it
      if (loyaltyRedemption) {
        loyaltyPointsRedeemed = loyaltyRedemption.points_used || 0
        loyaltyDiscountAmount = loyaltyRedemption.discount_applied || 0
        console.log('✅ [handlePrintOrder] Using loyalty data from component:', {
          loyaltyPointsRedeemed,
          loyaltyDiscountAmount
        })
      } else {
        console.log('🔍 [handlePrintOrder] No loyalty data passed, attempting to fetch for order:', order.order_number)

        // Try online fetch first
        if (cacheManager.checkOnlineStatus()) {
          try {
            const { data: redemption, error: redemptionError } = await supabase
              .from('loyalty_redemptions')
              .select('points_used, discount_applied')
              .eq('order_id', order.id)
              .maybeSingle()

            console.log('📊 Loyalty query result:', { redemption, error: redemptionError })

            if (redemptionError) {
              console.error('❌ Error fetching loyalty for print:', redemptionError)
            } else if (redemption) {
              loyaltyPointsRedeemed = redemption.points_used || 0
              loyaltyDiscountAmount = redemption.discount_applied || 0
              console.log('✅ Found loyalty redemption from database:', {
                loyaltyPointsRedeemed,
                loyaltyDiscountAmount
              })
            } else {
              console.log('⚠️ No loyalty redemption found in database for order:', order.order_number)
            }
          } catch (error) {
            console.log('⚠️ Error fetching loyalty redemption from database:', {
              orderNumber: order.order_number,
              error: error.message
            })
          }
        } else {
          // Offline mode - check cached order for loyalty data
          console.log('📴 [handlePrintOrder] Offline mode - checking order object for cached loyalty data')
          const cachedLoyaltyData = {
            points_used: order.loyalty_points_redeemed || order.loyaltyPointsRedeemed || 0,
            discount_applied: order.loyalty_discount_amount || order.loyaltyDiscountAmount || 0
          }

          if (cachedLoyaltyData.points_used > 0 || cachedLoyaltyData.discount_applied > 0) {
            loyaltyPointsRedeemed = cachedLoyaltyData.points_used
            loyaltyDiscountAmount = cachedLoyaltyData.discount_applied
            console.log('✅ [handlePrintOrder] Found cached loyalty data in order object:', {
              loyaltyPointsRedeemed,
              loyaltyDiscountAmount
            })
          } else {
            console.log('⚠️ [handlePrintOrder] No cached loyalty data found in order object')
          }
        }
      }

      // Fetch deal info for any deals in the order (cache-first for offline support)
      const dealIds = orderItems.filter(item => item.is_deal && item.deal_id).map(item => item.deal_id)
      let dealsMap = new Map()

      if (dealIds.length > 0) {
        try {
          if (cacheManager.checkOnlineStatus()) {
            // Online: Fetch from database
            const { data: deals, error: dealsError } = await supabase
              .from('deals')
              .select('*')
              .in('id', dealIds)

            if (!dealsError && deals) {
              deals.forEach(deal => {
                dealsMap.set(deal.id, deal)
              })
              console.log(`✅ Fetched ${deals.length} deal details for printing (online)`)
            }
          } else {
            // Offline: Use cached deals
            console.log('📴 [Print] Offline mode - using cached deals')
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`✅ Loaded ${dealsMap.size} deal details from cache (offline)`)
          }
        } catch (error) {
          console.error('Error fetching deal info:', error)
          // Fallback to cache even if online fetch fails
          const cachedDeals = cacheManager.getAllDeals()
          cachedDeals.forEach(deal => {
            if (dealIds.includes(deal.id)) {
              dealsMap.set(deal.id, deal)
            }
          })
          console.log(`⚠️ Using cached deals as fallback: ${dealsMap.size} deals`)
        }
      }

      // Prepare order data for printing
      const _scAmt      = parseFloat(order.service_charge_amount || 0)
      const _discAmt    = parseFloat(order.discount_amount || 0)
      const _delivAmt   = parseFloat(order.delivery_charges || 0)
      const _totalAmt   = parseFloat(order.total_amount || 0)
      // If subtotal not stored, derive it: items sum = total + discount − SC − delivery
      const _subtotal   = parseFloat(order.subtotal) > 0
        ? parseFloat(order.subtotal)
        : Math.max(0, _totalAmt + _discAmt - _scAmt - _delivAmt)

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'walkin',
        customer: order.customers ? {
          id: order.customers.id || null,
          full_name: order.customers.full_name || null,
          phone: order.customers.phone || null,
          email: order.customers.email || null,
        } : { full_name: 'Guest' },
        deliveryAddress: order.delivery_address,
        orderInstructions: order.order_instructions,
        total: _totalAmt,
        subtotal: _subtotal,
        deliveryCharges: _delivAmt,
        discountAmount: _discAmt,
        loyaltyDiscountAmount: loyaltyDiscountAmount,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed,
        discountType: 'amount',
        serviceChargeAmount: _scAmt,
        serviceChargeType: parseFloat(order.service_charge_percentage || 0) > 0 ? 'percentage' : 'fixed',
        serviceChargeValue: parseFloat(order.service_charge_percentage || 0),
        tableName: resolveTableName(order),
        cart: orderItems.map((item) => {
          if (item.is_deal) {
            let dealProducts = []
            let dealName = item.product_name

            // Parse deal products from stored JSON
            try {
              if (item.deal_products) {
                const parsedProducts = typeof item.deal_products === 'string'
                  ? JSON.parse(item.deal_products)
                  : item.deal_products

                // Normalize the structure - ensure each product has the 'name' field
                dealProducts = parsedProducts.map(product => ({
                  name: product.name || product.product_name || product.productName || 'Unknown Product',
                  quantity: product.quantity || 1,
                  variant: product.variant || product.variant_name || product.variantName || null,
                  flavor: product.flavor || null
                }))

                console.log(`✅ Normalized ${dealProducts.length} deal products for printing:`, dealProducts)
              }
            } catch (e) {
              console.error('Failed to parse deal_products:', e)
              dealProducts = []
            }

            // If deal name is missing, get it from the deals table
            if (!dealName && item.deal_id && dealsMap.has(item.deal_id)) {
              const dealInfo = dealsMap.get(item.deal_id)
              dealName = dealInfo.deal_name
              console.log(`✅ Retrieved deal name from database: ${dealName}`)
            }

            return {
              isDeal: true,
              dealId: item.deal_id,
              dealName: dealName || 'Deal',
              dealProducts: dealProducts,
              quantity: item.quantity,
              totalPrice: item.total_price,
              finalPrice: item.final_price,
              itemDiscountType: item.item_discount_type || null,
              itemDiscountAmount: parseFloat(item.item_discount_amount) || 0,
            }
          }
          return {
            isDeal: false,
            productName: item.product_name,
            variantName: item.variant_name,
            quantity: item.quantity,
            totalPrice: item.total_price,
            finalPrice: item.final_price,
            itemDiscountType: item.item_discount_type || null,
            itemDiscountAmount: parseFloat(item.item_discount_amount) || 0,
          }
        }),
        paymentMethod: order.payment_method || 'Unpaid',
        order_taker_name: order.order_takers?.name ||
          (order.order_taker_id
            ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
            : null)
      }

      // Fetch payment transactions for split payment
      if (order.payment_method === 'Split' && order.id) {
        try {
          // Try cache first (for offline support)
          const cachedTransactions = cacheManager.getPaymentTransactions(order.id)
          if (cachedTransactions && cachedTransactions.length > 0) {
            orderData.paymentTransactions = cachedTransactions
            console.log('✅ Using cached payment transactions:', cachedTransactions)
          } else if (cacheManager.checkOnlineStatus()) {
            // Fetch from database if online and not cached
            const { data: transactions, error: txError } = await supabase
              .from('order_payment_transactions')
              .select('*')
              .eq('order_id', order.id)
              .order('created_at', { ascending: true })

            if (txError) {
              console.error('Error fetching payment transactions:', txError)
            } else if (transactions && transactions.length > 0) {
              cacheManager.setPaymentTransactions(order.id, transactions)
              orderData.paymentTransactions = transactions
              console.log('✅ Found payment transactions:', transactions)
            }
          } else {
            console.log('📴 Offline: No cached payment transactions found')
          }
        } catch (error) {
          console.error('Error fetching payment transactions:', error)
        }
      }

      // Get user profile
      const userProfileRaw = JSON.parse(
        localStorage.getItem('user_profile') ||
        localStorage.getItem('user') ||
        '{}'
      )

      // Get local assets for offline printing
      const localLogo = localStorage.getItem('store_logo_local')
      const localQr = localStorage.getItem('qr_code_local')

      // Get cashier/admin name from order
      const cashierName = order.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order.users?.customer_name || 'Admin')

      const userProfile = {
        store_name: userProfileRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || '',
        phone: userProfileRaw?.phone || '',
        // Use local base64/cached logo first, fallback to URL
        store_logo: localLogo || userProfileRaw?.store_logo || null,
        // Use local QR first, fallback to URL
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
        // Add cashier/admin name for receipt printing
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const result = await printerManager.printReceipt(orderData, userProfile, printer)

      if (result.success) {
        // Removed toast notification - blocks UI for 3 seconds
        console.log(`✅ Receipt printed to ${printer.name}`)
      } else {
        throw new Error(result.error || 'Print failed')
      }
    } catch (error) {
      console.error('Print error:', error)
      toast.error(`Print failed: ${error.message}`)
    }
  }

  const handlePrintToken = async (order, loyaltyRedemption = null) => {
    try {
      if (!user?.id) {
        toast.error('User not logged in')
        return
      }

      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()

      if (!printer) {
        toast.error('No printer configured. Please configure a printer in settings.')
        return
      }

      // Always fetch fresh order items from Supabase when online (ensures item_instructions is included)
      let orderItems = []
      if (order.id && cacheManager.checkOnlineStatus()) {
        const { data } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) {
        orderItems = order.order_items || order.items || []
      }

      // Prepare order data for kitchen token
      // Build product→category lookup for routing
      const productCategoryMap = {}
      cacheManager.cache?.products?.forEach(p => { productCategoryMap[p.id] = p.category_id })

      let mappedItems = orderItems.map((item) => {
        if (item.is_deal) {
          let dealProducts = []
          try {
            if (item.deal_products) {
              dealProducts = typeof item.deal_products === 'string'
                ? JSON.parse(item.deal_products)
                : item.deal_products
            }
          } catch (e) {
            console.error('Failed to parse deal_products:', e)
          }
          return {
            isDeal: true,
            name: item.product_name,
            quantity: item.quantity,
            dealProducts: dealProducts,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            variantName: item.variant_name,
            instructions: item.item_instructions || '',
            category_id: null,
            deal_id: item.deal_id || null
          }
        }
        return {
          isDeal: false,
          name: item.product_name,
          size: item.variant_name,
          quantity: item.quantity,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          variantName: item.variant_name,
          instructions: item.item_instructions || '',
          category_id: item.category_id || productCategoryMap[item.product_id] || null,
          deal_id: null
        }
      })

      // If this is a reopened order with unsaved changes (print before payment),
      // compute the diff from walkin_original_state vs current cart and cache it
      // so getOrderItemsWithChanges can find and apply the changes on the token.
      if (isReopenedOrder && originalOrderId && order.id === originalOrderId) {
        try {
          const originalStateStr = localStorage.getItem('walkin_original_state')
          if (originalStateStr) {
            const originalState = JSON.parse(originalStateStr)
            const changes = { itemsAdded: [], itemsRemoved: [], itemsModified: [] }

            originalState.items.forEach(oldItem => {
              const itemName = oldItem.isDeal ? oldItem.dealName : oldItem.productName
              const itemVariant = oldItem.isDeal ? null : oldItem.variantName
              const stillExists = cart.find(newItem => {
                const newItemName = newItem.isDeal ? newItem.dealName : newItem.productName
                const newItemVariant = newItem.isDeal ? null : newItem.variantName
                return newItemName === itemName && newItemVariant === itemVariant
              })
              if (!stillExists) {
                changes.itemsRemoved.push({ name: itemName, variant: itemVariant, quantity: oldItem.quantity, price: oldItem.totalPrice })
              }
            })

            cart.forEach(newItem => {
              const itemName = newItem.isDeal ? newItem.dealName : newItem.productName
              const itemVariant = newItem.isDeal ? null : newItem.variantName
              const oldItem = originalState.items.find(old => {
                const oldItemName = old.isDeal ? old.dealName : old.productName
                const oldItemVariant = old.isDeal ? null : old.variantName
                return oldItemName === itemName && oldItemVariant === itemVariant
              })
              if (!oldItem) {
                changes.itemsAdded.push({ name: itemName, variant: itemVariant, quantity: newItem.quantity, price: newItem.totalPrice })
              } else if (oldItem.quantity !== newItem.quantity) {
                changes.itemsModified.push({ name: itemName, variant: itemVariant, oldQuantity: oldItem.quantity, newQuantity: newItem.quantity, oldPrice: oldItem.totalPrice, newPrice: newItem.totalPrice })
              }
            })

            const hasChanges = changes.itemsAdded.length > 0 || changes.itemsRemoved.length > 0 || changes.itemsModified.length > 0
            if (hasChanges) {
              saveChangesOffline(order.id, order.order_number, changes, { cacheOnly: true })
            }
          }
        } catch (e) {
          console.warn('Could not cache order changes for print:', e)
        }
      }

      // 🆕 Check for order changes using order_item_changes table
      if (order.id) {
        mappedItems = await getOrderItemsWithChanges(order.id, mappedItems)
      }

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'walkin',
        customerName: order.customers?.full_name || '',
        customerPhone: order.customers?.phone || '',
        specialNotes: order.order_instructions || '',
        tableName: resolveTableName(order),
        items: mappedItems,
        order_taker_name: order.order_takers?.name ||
          (order.order_taker_id
            ? (cacheManager.getOrderTakers().find(t => t.id === order.order_taker_id)?.name || null)
            : null)
      }

      // Get user profile
      const userProfileRaw = JSON.parse(
        localStorage.getItem('user_profile') ||
        localStorage.getItem('user') ||
        '{}'
      )

      // Get cashier/admin name from order
      const cashierName = order.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order.users?.customer_name || 'Admin')

      const userProfile = {
        store_name: userProfileRaw?.store_name || 'KITCHEN',
        // Add cashier/admin name for kitchen token printing
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const results = await printerManager.printKitchenTokens(orderData, userProfile, printer)

      const allOk = results.every(r => r?.success)
      const anyOk = results.some(r => r?.success)
      if (allOk) {
        console.log(`✅ Kitchen token printed`)
      } else if (anyOk) {
        const failed = results.filter(r => !r?.success).map(r => r?.printerName || r?.printerId).join(', ')
        toast.warning(`Kitchen token partial: failed for ${failed}`)
      } else {
        throw new Error(results[0]?.error || 'Print failed')
      }
    } catch (error) {
      console.error('Kitchen token print error:', error)
      toast.error(`Print failed: ${error.message}`)
    }
  }

  const getProductsByCategory = (categoryId) => {
    return allProducts.filter(product => product.category_id === categoryId)
  }

  const getProductCount = (categoryId) => {
    return getProductsByCategory(categoryId).length
  }

  const handleCustomerFormSubmit = (data) => {
    setCustomer(data.customer)
    setOrderInstructions(data.instructions || data.orderInstructions || '')
    setShowCustomerForm(false)
  }

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
      clearSavedData()
      router.push('/dashboard/')
    }
  }

  const clearSavedData = () => {
    console.log('🧹 [Walkin] Clearing saved data')
    localStorage.removeItem('walkin_cart')
    localStorage.removeItem('walkin_customer')
    localStorage.removeItem('walkin_instructions')
    localStorage.removeItem('walkin_reopened')
    localStorage.removeItem('walkin_original_order')
    localStorage.removeItem('walkin_table')
    localStorage.removeItem('walkin_discount')
    localStorage.removeItem('walkin_modifying_order')
    localStorage.removeItem('walkin_modifying_order_number')
    localStorage.removeItem('walkin_modifying_daily_serial')
    localStorage.removeItem('walkin_order_taker')
    localStorage.removeItem('walkin_original_state')
    localStorage.removeItem('walkin_original_order_status')
    localStorage.removeItem('walkin_original_payment_status')
    localStorage.removeItem('walkin_original_amount_paid')
    localStorage.removeItem('walkin_original_payment_method')
    localStorage.removeItem('walkin_can_decrease_qty')
    localStorage.removeItem('walkin_original_service_charge')
  }

  const handleConfirmExit = () => {
    clearSavedData()
    setCart([])
    notify.info('Order discarded')
    router.push('/dashboard/')
  }

  const handleSaveAndExit = () => {
    notify.success('Order saved for later')
    router.push('/dashboard/')
  }

  const handleOrderAndPay = async () => {
    console.log('🔵 [Walkin] handleOrderAndPay called')
    console.log('🔵 [Walkin] Cart length:', cart.length)
    console.log('🔵 [Walkin] isReopenedOrder:', isReopenedOrder)
    console.log('🔵 [Walkin] originalOrderId:', originalOrderId)

    if (isPlacingOrder) return
    setIsPlacingOrder(true)

    if (cart.length === 0) {
      console.warn('🚫 [Walkin] Blocked: cart is empty')
      notify.warning('Please add items to cart before proceeding')
      setIsPlacingOrder(false)
      return
    }

    if (requireOrderTaker && !selectedOrderTaker) {
      console.warn('🚫 [Walkin] Blocked: requireOrderTaker is true but no order taker selected')
      notify.warning('Please select an order taker before proceeding')
      setIsPlacingOrder(false)
      return
    }

    if (requireCustomer && !customer) {
      console.warn('🚫 [Walkin] Blocked: requireCustomer is true but no customer selected. Check admin settings → Customer Requirement → Walk-in')
      notify.warning('Customer is required for walk-in orders — please select a customer')
      setIsPlacingOrder(false)
      return
    }

    // Restore original service charge for this walkin order (saved when reopening)
    let scAmount = 0, scPercentage = 0
    try {
      const scStr = localStorage.getItem('walkin_original_service_charge')
      if (scStr) { const sc = JSON.parse(scStr); scAmount = sc.amount || 0; scPercentage = sc.percentage || 0 }
    } catch {}

    const orderData = {
      cart,
      customer,
      orderInstructions,
      subtotal: calculateSubtotal(),
      total: calculateTotal(),
      orderType: 'walkin',
      cashierId: cashierData?.id || null,
      userId: user?.id,
      sessionId: sessionId,
      orderTakerId: selectedOrderTaker?.id || null,
      orderTakerName: selectedOrderTaker?.name || null,
      isModifying: isReopenedOrder,
      existingOrderId: originalOrderId,
      existingOrderNumber: localStorage.getItem('walkin_modifying_order_number'),
      originalPaymentStatus: localStorage.getItem('walkin_original_payment_status'),
      originalAmountPaid: parseFloat(localStorage.getItem('walkin_original_amount_paid')) || 0,
      originalPaymentMethod: localStorage.getItem('walkin_original_payment_method'),
      originalOrderStatus: localStorage.getItem('walkin_original_order_status') || null,
      tableId: selectedTable?.id || null,
      tableName: selectedTable?.table_name || selectedTable?.table_number || null,
      serviceChargeAmount: scAmount,
      serviceChargePercentage: scPercentage
    }

    console.log('🔵 [Walkin] Order data prepared:', {
      isModifying: orderData.isModifying,
      existingOrderId: orderData.existingOrderId,
      existingOrderNumber: orderData.existingOrderNumber,
      isReopenedOrder: isReopenedOrder,
      originalOrderId: originalOrderId
    })

    if (isReopenedOrder && originalOrderId) {
      const originalStateStr = localStorage.getItem('walkin_original_state')
      if (originalStateStr) {
        try {
        const originalState = JSON.parse(originalStateStr)

        const changes = {
          itemsAdded: [],
          itemsRemoved: [],
          itemsModified: [],
          oldSubtotal: originalState?.subtotal || 0,
          newSubtotal: orderData.subtotal,
          oldTotal: originalState?.total || 0,
          newTotal: orderData.total,
          oldItemCount: originalState?.itemCount || 0,
          newItemCount: cart.length
        }

        ;(originalState?.items || []).forEach(oldItem => {
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
        } catch (e) {
          console.error('[Walkin] Failed to parse walkin_original_state:', e)
        }
      }
    }

    try {
      console.log('🔵 [Walkin] Saving order_data to localStorage')
      orderData.sourcePage = 'walkin'
      localStorage.setItem('order_data', JSON.stringify(orderData))
      console.log('🔵 [Walkin] Navigating to payment page')
      router.push('/payment')
    } finally {
      setIsPlacingOrder(false)
    }
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

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

  return (
    <ProtectedPage permissionKey="SALES_WALKIN" pageName="Walk-in Orders">
      <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      {/* Toast Notifications — top-center, respects admin toggle */}
      <PosToaster isDark={isDark} />

      {/* Left Sidebar - Categories or Orders List */}
      {showOrdersView ? (
        <WalkinOrdersSidebar
          onOrderSelect={handleOrderSelect}
          onClose={handleCloseOrdersView}
          classes={classes}
          isDark={isDark}
          selectedOrderId={selectedOrder?.id}
          onTableClick={handleTableClick}
          selectedTable={selectedTable}
          onBackClick={handleBackClick}
          orderType="walkin"
          refreshTrigger={ordersRefreshTrigger}
          onQuickComplete={handleQuickCompleteOrder}
          onOrdersLoaded={(freshOrders) => {
            if (!selectedOrder) return
            const updated = freshOrders.find(o => o.id === selectedOrder.id)
            if (updated && updated.updated_at !== selectedOrder.updated_at) {
              setSelectedOrder(updated)
            }
          }}
        />
      ) : (
        <CategorySidebar
          categories={categories}
          menus={menus}
          deals={deals}
          onCategoryClick={scrollToCategory}
          onDealClick={handleDealClick}
          getProductCount={getProductCount}
          onBackClick={handleBackClick}
          classes={classes}
          isDark={isDark}
          orderType="walkin"
          isReopenedOrder={isReopenedOrder}
          onTableClick={handleTableClick}
          selectedTable={selectedTable}
          onOrdersClick={handleOrdersClick}
          showOrdersView={showOrdersView}
        />
      )}

      {/* Center - Dynamic Content */}
      {/* ProductGrid is always mounted but hidden to preserve image cache */}
      <div className={`flex-1 flex flex-col ${currentView !== 'products' ? 'hidden' : ''}`}>
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
          selectedCategoryId={selectedCategoryId}
        />
      </div>

      {currentView === 'variant' && (
        <VariantSelectionScreen
          product={selectedProduct}
          variants={productVariants}
          onAddToCart={handleAddToCart}
          onBack={() => { setCurrentView('products'); setTimeout(() => productGridRef.current?.focusSearch(), 50) }}
          classes={classes}
          isDark={isDark}
        />
      )}

      {currentView === 'deal' && (
        <DealFlavorSelectionScreen
          deal={selectedDeal}
          dealProducts={dealProducts}
          onAddToCart={handleAddToCart}
          onBack={() => { setCurrentView('products'); setTimeout(() => productGridRef.current?.focusSearch(), 50) }}
          classes={classes}
          isDark={isDark}
        />
      )}

      {currentView === 'tables' && (
        <div className={`flex-1 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-x flex flex-col`}>
          <TableSelectionPanel
            onSelectTable={handleTableSelect}
            selectedTable={selectedTable}
            classes={classes}
            isDark={isDark}
            onClose={() => setCurrentView('products')}
          />
        </div>
      )}

      {currentView === 'orders' && (
        <WalkinOrderDetails
          order={selectedOrder}
          classes={classes}
          isDark={isDark}
          onPrint={handlePrintOrder}
          onPrintToken={handlePrintToken}
          onMarkReady={(order) => handleOrderStatusUpdate(order, 'Ready')}
          onComplete={handleCompleteAlreadyPaidOrder}
          onPaymentRequired={handlePaymentRequired}
          onClose={() => {
            setSelectedOrder(null)
            setCurrentView('products')
          }}
          orderType="walkin"
          onConvertToDelivery={() => {
            setOrdersRefreshTrigger(prev => prev + 1)
            setSelectedOrder(null)
            setCurrentView('products')
            notify.success('Order converted to delivery! Check the delivery page.')
          }}
        />
      )}

      {/* Right Sidebar - Cart */}
      <CartSidebar
        cart={cart}
        customer={customer}
        orderInstructions={orderInstructions}
        onUpdateQuantity={updateCartItemQuantity}
        onRemoveItem={removeCartItem}
        onShowCustomerForm={() => setShowCustomerForm(true)}
        onOrderAndPay={handleOrderAndPay}
        isPlacingOrder={isPlacingOrder}
        onClearCart={handleClearCart}
        calculateSubtotal={calculateSubtotal}
        calculateTotal={calculateTotal}
        classes={classes}
        isDark={isDark}
        networkStatus={networkStatus}
        orderType="walkin"
        isReopenedOrder={isReopenedOrder}
        onToggleTheme={toggleTheme}
        selectedTable={selectedTable}
        onChangeTable={() => setCurrentView('tables')}
        onInstructionsChange={setOrderInstructions}
        onUpdateItemInstruction={updateItemInstruction}
        onUpdateItemDiscount={updateItemDiscount}
        inlineCustomer={true}
        onCustomerChange={setCustomer}
        orderData={orderData}
        onOrderDataChange={setOrderData}
        orderTakers={orderTakers}
        selectedOrderTaker={selectedOrderTaker}
        onOrderTakerChange={(taker) => {
          setSelectedOrderTaker(taker)
          if (taker?.id) {
            localStorage.setItem('walkin_order_taker', JSON.stringify(taker))
          } else {
            localStorage.removeItem('walkin_order_taker')
          }
        }}
        requireOrderTaker={requireOrderTaker}
      />

      {/* Customer Form */}
      <WalkInCustomerForm
        isOpen={showCustomerForm}
        onClose={() => setShowCustomerForm(false)}
        onSubmit={handleCustomerFormSubmit}
        customer={customer}
      />

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && completedOrderData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`${classes.card} rounded-3xl ${classes.shadow} shadow-2xl p-8 max-w-md w-full text-center ${classes.border} border relative overflow-hidden`}
            >
              {/* Mini X close button */}
              <button
                onClick={() => setShowSuccessModal(false)}
                className="absolute top-3 right-3 z-10 w-5 h-5 rounded-full bg-black/25 hover:bg-black/45 flex items-center justify-center transition-colors"
              >
                <X className="w-2.5 h-2.5 text-white" />
              </button>

              {/* 3-second auto-close progress bar */}
              <div className="absolute top-0 left-0 right-0 h-0.5 bg-transparent">
                <div
                  key={String(showSuccessModal)}
                  className="h-full bg-blue-500"
                  style={{ animation: 'success-shrink 3s linear forwards' }}
                />
              </div>
              <style>{`@keyframes success-shrink { from { width:100% } to { width:0% } }`}</style>

              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                  isDark ? 'bg-green-900/30' : 'bg-green-100'
                }`}
              >
                <Check className={`w-10 h-10 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              </motion.div>

              <h1 className={`text-2xl font-bold ${classes.textPrimary} mb-2`}>
                Payment Complete!
              </h1>
              <p className={`${classes.textSecondary} mb-6`}>
                Order has been successfully completed
              </p>

              <div className={`${isDark ? 'bg-gray-800/50' : 'bg-gray-50'} rounded-2xl p-4 mb-6 ${classes.border} border`}>
                <p className={`text-sm ${classes.textSecondary} mb-1`}>Order Number</p>
                <p className="text-2xl font-bold text-purple-600">{completedOrderData.orderNumber}</p>
              </div>

              <div className="space-y-2 mb-6 text-left">
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Total Amount:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>
                    Rs {(completedOrderData.total || 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Payment Method:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>{completedOrderData.paymentMethod || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Order Type:</span>
                  <span className={`font-semibold ${classes.textPrimary} capitalize`}>{completedOrderData.orderType || 'walkin'}</span>
                </div>
                {completedOrderData.tableName && (
                  <div className="flex justify-between">
                    <span className={classes.textSecondary}>Table:</span>
                    <span className={`font-semibold ${classes.textPrimary}`}>{completedOrderData.tableName}</span>
                  </div>
                )}
                {completedOrderData.discountAmount > 0 && (
                  <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    <span>Discount Applied:</span>
                    <span className="font-semibold">Rs {(completedOrderData.discountAmount || 0).toFixed(2)}</span>
                  </div>
                )}
                {completedOrderData.loyaltyPointsRedeemed > 0 && (
                  <div className={`flex justify-between ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                    <span>Loyalty Points Used:</span>
                    <span className="font-semibold">{completedOrderData.loyaltyPointsRedeemed} pts (-Rs {(completedOrderData.loyaltyDiscountAmount || 0).toFixed(2)})</span>
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
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => handlePrintReceipt()}
                  disabled={isPrinting}
                  className={`w-full px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white font-semibold rounded-xl transition-all duration-200 flex items-center justify-center ${
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
                      Print Receipt
                    </>
                  )}
                </motion.button>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleNewOrderFromSuccess}
                  className="w-full px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl transition-all duration-200"
                >
                  New Order
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Exit Confirmation Modal */}
      <Modal
        isOpen={showExitModal}
        onClose={() => setShowExitModal(false)}
        title="Save your order?"
        maxWidth="max-w-md"
      >
        <div className="text-center space-y-6">
          <div className={`w-16 h-16 ${isDark ? 'bg-yellow-900/20' : 'bg-yellow-100'} rounded-full flex items-center justify-center mx-auto`}>
            <FileText className={`w-8 h-8 ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`} />
          </div>
          <p className={`${classes.textSecondary}`}>
            You have items in your cart. Would you like to save your progress or discard the order?
          </p>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={handleSaveAndExit}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              Save & Exit
            </button>
            <button
              onClick={handleConfirmExit}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              Discard & Exit
            </button>
          </div>
        </div>
      </Modal>

      {/* Split Payment Modal */}
      {showSplitPaymentModal && splitPaymentOrder && (
        <SplitPaymentModal
          isOpen={showSplitPaymentModal}
          onClose={() => {
            setShowSplitPaymentModal(false)
            setSplitPaymentOrder(null)
          }}
          totalAmount={splitPaymentOrder.total_amount}
          amountDue={splitPaymentOrder.total_amount}
          customer={splitPaymentOrder.customers}
          onPaymentComplete={async (paymentData) => {
            setShowSplitPaymentModal(false)
            setSplitPaymentOrder(null)
            // Call the same handler but with actual payment data this time
            await handlePaymentRequired(splitPaymentOrder, paymentData)
          }}
          isDark={isDark}
          classes={classes}
        />
      )}

      </div>
    </ProtectedPage>
  )
}
