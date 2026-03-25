'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { printerManager } from '../../lib/printerManager'
import { supabase } from '../../lib/supabase'
import { notify } from '../../components/ui/NotificationSystem'
import Modal from '../../components/ui/Modal'
import ProductGrid from '../../components/test/ProductGrid'
import VariantSelectionScreen from '../../components/test/VariantSelectionScreen'
import DealFlavorSelectionScreen from '../../components/test/DealFlavorSelectionScreen'
import CartSidebar from '../../components/test/CartSidebar'
import WalkinOrdersSidebar from '../../components/test/WalkinOrdersSidebar'
import WalkinOrderDetails from '../../components/test/WalkinOrderDetails'
import TableSelectionPanel from '../../components/test/TableSelectionPanel'
import loyaltyManager from '../../lib/loyaltyManager'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { usePermissions } from '../../lib/permissionManager'
import { Users, ShoppingBag, Truck, FileText } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
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
  const [categories, setCategories] = useState([])
  const [menus, setMenus] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [deals, setDeals] = useState([])
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
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

  // Table selection (walkin only)
  const [selectedTable, setSelectedTable] = useState(null)

  // Order taker (walkin only)
  const [orderTakers, setOrderTakers] = useState([])
  const [selectedOrderTaker, setSelectedOrderTaker] = useState(null)
  const [requireOrderTaker, setRequireOrderTaker] = useState(false)

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

    const savedTable = localStorage.getItem('new_order_walkin_table')
    if (savedTable) try { setSelectedTable(JSON.parse(savedTable)) } catch {}

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
    setIsLoading(true)
    try {
      if (cacheManager.isReady()) {
        loadCachedData()
        setIsDataReady(true)
        setIsLoading(false)
        return
      }

      const loadingId = notify.loading('Loading menu data...')
      let attempts = 0

      const checkInterval = setInterval(() => {
        attempts++
        if (cacheManager.isReady()) {
          clearInterval(checkInterval)
          notify.remove(loadingId)
          loadCachedData()
          setIsDataReady(true)
          setIsLoading(false)
        } else if (attempts >= 30) {
          clearInterval(checkInterval)
          notify.remove(loadingId)
          cacheManager.initializeCache().then(() => {
            if (cacheManager.isReady()) {
              loadCachedData()
              setIsDataReady(true)
            } else {
              notify.error('Failed to load menu data.')
            }
            setIsLoading(false)
          })
        }
      }, 500)
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
      handleAddToCart({
        id: `${product.id}-base-${Date.now()}`,
        productId: product.id,
        variantId: null,
        productName: product.name,
        variantName: null,
        basePrice: parseFloat(product.base_price),
        variantPrice: 0,
        finalPrice: parseFloat(product.base_price),
        quantity: 1,
        totalPrice: parseFloat(product.base_price),
        image: product.image_url
      })
    } else {
      setCurrentView('variant')
    }
  }

  const handleDealClick = (deal) => {
    if (deal?.scrollToDeals) {
      if (currentView !== 'products') {
        setCurrentView('products')
        setSelectedProduct(null)
        setSelectedDeal(null)
      }
      setTimeout(() => { if (productGridRef.current) productGridRef.current.scrollToDeals() }, 100)
      return
    }
    setSelectedDeal(deal)
    setDealProducts(cacheManager.getDealProducts(deal.id))
    setCurrentView('deal')
  }

  const handleAddToCart = (cartItem) => {
    setCart(prev => {
      const existingIndex = prev.findIndex(item => {
        if (item.isDeal && cartItem.isDeal) return item.dealId === cartItem.dealId
        if (!item.isDeal && !cartItem.isDeal) return item.productId === cartItem.productId && item.variantId === cartItem.variantId
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
    setCart(prev => prev.map(item =>
      item.id === itemId ? { ...item, quantity: newQuantity, totalPrice: item.finalPrice * newQuantity } : item
    ))
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
  }

  const calculateSubtotal = () => cart.reduce((sum, item) => sum + item.totalPrice, 0)
  const calculateTotal = () => calculateSubtotal()

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
    setCart([])
    setCustomer(null)
    setOrderInstructions('')
    setOrderExtras({ walkin: {}, takeaway: {}, delivery: {} })
    setSelectedTable(null)
    notify.info('Order discarded')
    router.push('/dashboard/')
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
      ...extras
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
    return <div className={`h-screen w-screen ${classes.background}`} />
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
      if (order.id && navigator.onLine) {
        const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) orderItems = order.order_items || order.items || []

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
          ? { isDeal: true, dealId: item.deal_id, dealName: item.product_name, dealProducts: (() => { try { return typeof item.deal_products === 'string' ? JSON.parse(item.deal_products) : (item.deal_products || []) } catch(e) { return [] } })(), quantity: item.quantity, totalPrice: item.total_price, itemInstructions: item.item_instructions || null }
          : { isDeal: false, productName: item.product_name, variantName: item.variant_name, quantity: item.quantity, totalPrice: item.total_price, itemInstructions: item.item_instructions || null }
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
      if (order.id && navigator.onLine) {
        const { data } = await supabase.from('order_items').select('*').eq('order_id', order.id)
        orderItems = data || []
      }
      if (!orderItems.length) orderItems = order.order_items || order.items || []

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
      const result = await cacheManager.updateOrderStatus(order.id, newStatus)
      if (!result.success) throw new Error(result.message || 'Failed to update order status')

      // Free the table when a walkin order is completed
      if (newStatus === 'Completed' && order.order_type === 'walkin' && order.table_id) {
        await cacheManager.updateTableStatus(order.table_id, 'available')
        console.log(`✅ [NewOrder] Table ${order.table_id} freed after order completion`)
        setSelectedTable(null)
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
          if (navigator.onLine) {
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

        setSelectedOrder(null)
        setCurrentView('products')
        setOrdersRefreshTrigger(prev => prev + 1)
      } else {
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

        if (navigator.onLine) {
          const { error: updateError } = await supabase
            .from('orders')
            .update({ payment_method: 'Split', payment_status: 'Paid', amount_paid: totalPaid, updated_at: new Date().toISOString() })
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
      if (navigator.onLine) {
        const { error } = await supabase
          .from('orders')
          .update({
            payment_method: paymentData.paymentMethod,
            payment_status: 'Paid',
            amount_paid: paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            total_amount: paymentData.newTotal,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
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
                  await supabase.from('customer_ledger').insert({
                    user_id: currentUser.id, customer_id: order.customer_id,
                    transaction_type: 'debit', amount: paymentData.newTotal,
                    balance_before: currentBalance, balance_after: currentBalance + paymentData.newTotal,
                    order_id: order.id,
                    description: `Order #${order.order_number} - ${(order.order_type || 'WALKIN').toUpperCase()}`,
                    notes: 'Payment completed via inline payment modal', created_by: currentUser.id
                  })
                }
              } else {
                const currentBalance = await customerLedgerManager.getCustomerBalance(order.customer_id)
                await supabase.from('customer_ledger').insert({
                  user_id: currentUser.id, customer_id: order.customer_id,
                  transaction_type: 'debit', amount: paymentData.newTotal,
                  balance_before: currentBalance, balance_after: currentBalance + paymentData.newTotal,
                  order_id: order.id,
                  description: `Order #${order.order_number} - ${(order.order_type || 'WALKIN').toUpperCase()}`,
                  notes: 'Payment completed via inline payment modal', created_by: currentUser.id
                })
              }
            }
          } catch (ledgerError) {
            console.error('Failed to handle customer ledger:', ledgerError)
            // Don't fail payment if ledger update fails
          }
        }
      } else {
        const orderIndex = cacheManager.cache.orders.findIndex(o => o.id === order.id)
        if (orderIndex !== -1) {
          cacheManager.cache.orders[orderIndex] = {
            ...cacheManager.cache.orders[orderIndex],
            payment_method: paymentData.paymentMethod,
            payment_status: 'Paid',
            amount_paid: paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            total_amount: paymentData.newTotal,
            service_charge_amount: paymentData.serviceChargeAmount || 0,
            service_charge_percentage: paymentData.serviceChargeType === 'percentage' ? paymentData.serviceChargeValue : 0,
            updated_at: new Date().toISOString(),
            _isSynced: false
          }
          await cacheManager.saveCacheToStorage()
        }
      }

      if (paymentData.completeOrder === false) {
        setSelectedOrder(prev => prev?.id === order.id
          ? { ...prev, payment_status: 'Paid', payment_method: paymentData.paymentMethod, amount_paid: paymentData.newTotal, total_amount: paymentData.newTotal }
          : prev)
        toast.success('Payment recorded successfully')
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      toast.success(`Order #${order.order_number} paid and completed!`)
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

  return (
    <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      <Toaster position="top-center" toastOptions={{ duration: 2000 }} />

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
        isReopenedOrder={false}
        onInstructionsChange={(val) => setOrderInstructions(val)}
        onUpdateItemInstruction={updateItemInstruction}
        inlineCustomer={true}
        onCustomerChange={(c) => setCustomer(c)}
        orderData={orderExtras[activeOrderType] || {}}
        onOrderDataChange={(data) => setOrderExtras(prev => ({ ...prev, [activeOrderType]: data }))}
        selectedTable={activeOrderType === 'walkin' ? selectedTable : null}
        onChangeTable={handleTableClick}
        orderTakers={activeOrderType === 'walkin' ? orderTakers : []}
        selectedOrderTaker={activeOrderType === 'walkin' ? selectedOrderTaker : null}
        onOrderTakerChange={(taker) => activeOrderType === 'walkin' && setSelectedOrderTaker(taker)}
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
