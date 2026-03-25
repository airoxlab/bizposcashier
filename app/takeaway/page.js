'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import loyaltyManager from '../../lib/loyaltyManager'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { notify } from '../../components/ui/NotificationSystem'
import { getOrderItemsWithChanges } from '../../lib/utils/orderChangesTracker'
import Modal from '../../components/ui/Modal'
import { printerManager } from '../../lib/printerManager'
import TakeawayCustomerForm from '../../components/pos/TakeawayCustomerForm'
import CategorySidebar from '../../components/test/CategorySidebar'
import ProductGrid from '../../components/test/ProductGrid'
import VariantSelectionScreen from '../../components/test/VariantSelectionScreen'
import DealFlavorSelectionScreen from '../../components/test/DealFlavorSelectionScreen'
import CartSidebar from '../../components/test/CartSidebar'
import WalkinOrdersSidebar from '../../components/test/WalkinOrdersSidebar'
import WalkinOrderDetails from '../../components/test/WalkinOrderDetails'
import { FileText, Check, Printer } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'
import { supabase } from '../../lib/supabase'
import { motion, AnimatePresence } from 'framer-motion'
import ProtectedPage from '../../components/ProtectedPage'

export default function TakeawayPage() {
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
  const [pickupTime, setPickupTime] = useState('')
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(() => cacheManager.isReady())
  const [isLoading, setIsLoading] = useState(() => !cacheManager.isReady())
  const [theme, setTheme] = useState('light')
  const [isReopenedOrder, setIsReopenedOrder] = useState(false)
  const [originalOrderId, setOriginalOrderId] = useState(null)

  // View state management
  const [currentView, setCurrentView] = useState('products')
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [productVariants, setProductVariants] = useState([])
  const [dealProducts, setDealProducts] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  // Orders view
  const [showOrdersView, setShowOrdersView] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [ordersRefreshTrigger, setOrdersRefreshTrigger] = useState(0)

  // Modals
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)
  const [showSuccessModal, setShowSuccessModal] = useState(false)
  const [completedOrderData, setCompletedOrderData] = useState(null)
  const [isPrinting, setIsPrinting] = useState(false)

  // Save cart to localStorage
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('takeaway_cart', JSON.stringify(cart))
      localStorage.setItem('takeaway_customer', JSON.stringify(customer))
      localStorage.setItem('takeaway_instructions', orderInstructions)
      localStorage.setItem('takeaway_pickup_time', pickupTime)
      localStorage.setItem('takeaway_reopened', JSON.stringify(isReopenedOrder))
      localStorage.setItem('takeaway_original_order', originalOrderId)
    }
  }, [cart, customer, orderInstructions, pickupTime, isReopenedOrder, originalOrderId])

  // Listen for reloadCart event (when reopening from same page)
  useEffect(() => {
    const handleReloadCart = (event) => {
      console.log('🔄 [Takeaway] reloadCart event received, reloading cart from localStorage')

      const savedCart = localStorage.getItem('takeaway_cart')
      const savedCustomer = localStorage.getItem('takeaway_customer')
      const savedInstructions = localStorage.getItem('takeaway_instructions')
      const savedPickupTime = localStorage.getItem('takeaway_pickup_time')
      const savedModifyingOrderId = localStorage.getItem('takeaway_modifying_order')

      if (savedCart) {
        const parsedCart = JSON.parse(savedCart)
        console.log('🛒 [Takeaway] Reloading cart from localStorage:', parsedCart)
        setCart(parsedCart)
      }
      // Safe JSON parsing to prevent crashes from undefined values
      if (savedCustomer && savedCustomer !== 'undefined') {
        try {
          setCustomer(JSON.parse(savedCustomer))
        } catch (e) {
          console.warn('⚠️ Failed to parse customer data:', savedCustomer)
        }
      }
      if (savedInstructions) setOrderInstructions(savedInstructions)
      if (savedPickupTime) setPickupTime(savedPickupTime)
      if (savedModifyingOrderId && savedModifyingOrderId !== 'undefined') {
        setIsReopenedOrder(true)
        setOriginalOrderId(savedModifyingOrderId)
        console.log('✅ [Takeaway] Reopen state set:', savedModifyingOrderId)
      }
    }

    window.addEventListener('reloadCart', handleReloadCart)
    return () => window.removeEventListener('reloadCart', handleReloadCart)
  }, [])

  // Function to load order data from localStorage
  const loadOrderDataFromStorage = () => {
    const savedCart = localStorage.getItem('takeaway_cart')
    const savedCustomer = localStorage.getItem('takeaway_customer')
    const savedInstructions = localStorage.getItem('takeaway_instructions')
    const savedPickupTime = localStorage.getItem('takeaway_pickup_time')
    const savedModifyingOrderId = localStorage.getItem('takeaway_modifying_order')
    const savedOriginalOrderNumber = localStorage.getItem('takeaway_modifying_order_number')

    console.log('🔄 [Takeaway] Loading order data from localStorage:', {
      hasCart: !!savedCart,
      cartItemsCount: savedCart ? JSON.parse(savedCart).length : 0,
      hasModifyingOrder: !!savedModifyingOrderId,
      modifyingOrderId: savedModifyingOrderId,
      orderNumber: savedOriginalOrderNumber
    })

    if (savedCart) {
      const parsedCart = JSON.parse(savedCart)
      console.log('📦 [Takeaway] Loading cart from localStorage:', parsedCart)
      setCart(parsedCart)
    }
    // Safe JSON parsing to prevent crashes from undefined values
    if (savedCustomer && savedCustomer !== 'undefined') {
      try {
        setCustomer(JSON.parse(savedCustomer))
      } catch (e) {
        console.warn('⚠️ Failed to parse customer data:', savedCustomer)
      }
    }
    if (savedInstructions) setOrderInstructions(savedInstructions)
    if (savedPickupTime) setPickupTime(savedPickupTime)
    if (savedModifyingOrderId && savedModifyingOrderId !== 'undefined') {
      console.log('🔄 [Takeaway] Setting as reopened order:', savedModifyingOrderId)
      setIsReopenedOrder(true)
      setOriginalOrderId(savedModifyingOrderId)
      console.log('✅ [Takeaway] Reopen state set from loadOrderDataFromStorage')
    }
  }

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

    console.log('👤 Takeaway page loaded by:', role, '-', authManager.getDisplayName())

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

    // Load order data from localStorage
    loadOrderDataFromStorage()

    checkAndLoadData()

    const statusInterval = setInterval(() => {
      setNetworkStatus(cacheManager.getNetworkStatus())
    }, 1000)

    // Add window focus listener to reload data when page becomes visible
    const handleFocus = () => {
      console.log('🔄 [Takeaway] Window focused, checking for updated order data')
      loadOrderDataFromStorage()
    }

    // Add custom event listener for order reopening
    const handleOrderReopened = (event) => {
      console.log('🔄 [Takeaway] Order reopened event received:', event.detail)
      if (event.detail?.orderType === 'takeaway') {
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
      if (cacheManager.isReady()) {
        console.log('📦 Cache is ready, loading data immediately')
        loadCachedData()
        setIsDataReady(true)
        setIsLoading(false)
        return
      }

      console.log('⏳ Cache not ready, waiting for initialization...')
      // Keep loading state true only if cache is not ready

      let attempts = 0
      const maxAttempts = 60

      checkIntervalRef.current = setInterval(() => {
        attempts++

        if (cacheManager.isReady()) {
          console.log('✅ Cache became ready, loading data')
          clearInterval(checkIntervalRef.current)
          loadCachedData()
          setIsDataReady(true)
          setIsLoading(false)
        } else if (attempts >= maxAttempts) {
          console.log('⚠️ Cache timeout, trying to initialize manually')
          clearInterval(checkIntervalRef.current)

          cacheManager.initializeCache().then(() => {
            if (cacheManager.isReady()) {
              loadCachedData()
              setIsDataReady(true)
            } else {
              console.log('❌ Failed to load cache, redirecting to dashboard')
              notify.error('Failed to load menu data. Please try again from the dashboard.', {
                duration: 6000,
                action: {
                  label: 'Go to Dashboard',
                  onClick: () => router.push('/dashboard')
                }
              })
            }
            setIsLoading(false)
          }).catch((error) => {
            console.error('Cache initialization error:', error)
            notify.error('Failed to load menu data. Please check your connection.', {
              duration: 6000,
              action: {
                label: 'Retry',
                onClick: () => window.location.reload()
              }
            })
            setIsLoading(false)
          })
        }
      }, 100) // Reduced from 500ms to 100ms for faster checks

    } catch (error) {
      console.error('Error checking cache:', error)
      setIsLoading(false)
      notify.error('Error loading menu data. Please try again.', {
        action: {
          label: 'Go to Dashboard',
          onClick: () => router.push('/dashboard')
        }
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

    console.log('📦 Loaded from cache:', {
      categories: cachedCategories.length,
      products: cachedProducts.length,
      deals: cachedDeals.length
    })
  }

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    const variants = cacheManager.getProductVariants(product.id)
    setProductVariants(variants)

    if (!variants || variants.length === 0) {
      const cartItem = {
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
      }
      handleAddToCart(cartItem)
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
        setProductVariants([])
      }

      setTimeout(() => {
        if (productGridRef.current) {
          productGridRef.current.scrollToDeals()
        }
      }, 100)
      return
    }

    setSelectedDeal(deal)
    const products = cacheManager.getDealProducts(deal.id)
    setDealProducts(products)
    setCurrentView('deal')
  }

  const handleAddToCart = (cartItem) => {
    setCart(prevCart => {
      // Check if the same item already exists in cart
      const existingItemIndex = prevCart.findIndex(item => {
        // For deals, check if deal IDs match
        if (item.isDeal && cartItem.isDeal) {
          return item.dealId === cartItem.dealId
        }
        // For regular products, check if product ID and variant ID match
        if (!item.isDeal && !cartItem.isDeal) {
          return item.productId === cartItem.productId &&
                 item.variantId === cartItem.variantId
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

    setCart(prevCart => prevCart.map(item =>
      item.id === itemId
        ? { ...item, quantity: newQuantity, totalPrice: item.finalPrice * newQuantity }
        : item
    ))
  }

  const removeCartItem = (itemId) => {
    const item = cart.find(item => item.id === itemId)
    setCart(prevCart => prevCart.filter(item => item.id !== itemId))

    if (item) {
      const itemName = item.isDeal ? item.dealName : item.productName
      toast.info(`${itemName} removed from cart`, { duration: 1000 })
    }
  }

  const handleClearCart = () => {
    setCart([])
    toast.success('Cart cleared', { duration: 1000 })
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
    if (currentView !== 'products') {
      setCurrentView('products')
      setSelectedProduct(null)
      setSelectedDeal(null)
      setProductVariants([])
    }

    setTimeout(() => {
      if (productGridRef.current) {
        productGridRef.current.scrollToCategory(categoryId)
      }
    }, 100)
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
      console.log(`🔄 [Takeaway] Updating order ${order.order_number} status from ${order.order_status} to: ${newStatus}`)

      // Use cacheManager for offline-capable status update
      const result = await cacheManager.updateOrderStatus(order.id, newStatus)

      if (!result.success) {
        throw new Error('Failed to update order status')
      }

      // ================================================================
      // INVENTORY DEDUCTION (only for Completed status)
      // ================================================================
      if (newStatus === 'Completed') {
        console.log('📦 [Takeaway] Order marked as Completed - attempting inventory deduction')
        console.log('📦 [Takeaway] Order details:', {
          order_number: order.order_number,
          order_type: order.order_type,
          order_type_id: order.order_type_id
        })

        // Get order_type_id (crucial for deduction)
        let orderTypeId = order.order_type_id

        // If order_type_id not in order object, try to get it
        if (!orderTypeId) {
          console.warn('⚠️ [Takeaway] order_type_id not found in order object')

          // STEP 1: Try to fetch from orders table
          try {
            const { data: orderData, error: fetchError } = await supabase
              .from('orders')
              .select('order_type_id, order_type')
              .eq('id', order.id)
              .single()

            if (!fetchError && orderData?.order_type_id) {
              orderTypeId = orderData.order_type_id
              console.log('✅ [Takeaway] Fetched order_type_id from orders table:', orderTypeId)
            } else {
              console.warn('⚠️ [Takeaway] order_type_id still null in database, will lookup from order_types table')
            }
          } catch (fetchErr) {
            console.error('❌ [Takeaway] Exception fetching from orders table:', fetchErr)
          }

          // STEP 2: If still no order_type_id, lookup from order_types table using order_type string
          if (!orderTypeId && order.order_type) {
            console.log('🔍 [Takeaway] Looking up order_type_id from order_types table for:', order.order_type)
            try {
              const { data: orderTypeData, error: lookupError } = await supabase
                .from('order_types')
                .select('id, name, code')
                .eq('code', order.order_type)
                .eq('is_active', true)
                .single()

              if (!lookupError && orderTypeData?.id) {
                orderTypeId = orderTypeData.id
                console.log('✅ [Takeaway] Looked up order_type_id from order_types:', orderTypeId, 'for code:', order.order_type)

                // Update the order with the order_type_id for future use
                await supabase
                  .from('orders')
                  .update({ order_type_id: orderTypeId })
                  .eq('id', order.id)
                console.log('✅ [Takeaway] Updated order with order_type_id for future use')
              } else {
                console.error('❌ [Takeaway] Failed to lookup order_type_id:', lookupError)
              }
            } catch (lookupErr) {
              console.error('❌ [Takeaway] Exception looking up order_type_id:', lookupErr)
            }
          }
        } else {
          console.log('✅ [Takeaway] Using order_type_id from order object:', orderTypeId)
        }

        // Call the reliable deduction function (ONLINE ONLY)
        if (orderTypeId && user?.id) {
          if (navigator.onLine) {
            console.log('🌐 [Takeaway] ONLINE - Calling deduct_inventory_for_order with:', {
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

              console.log('📦 [Takeaway] Deduction function returned:', { deductionResult, deductError })

              if (deductError) {
                console.error('❌ [Takeaway] Inventory deduction database error:', deductError)
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
                console.log(`✅ [Takeaway] Inventory deducted successfully: ${deductionResult.deductions_made} items`)
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
              console.warn('⚠️ [Takeaway] Inventory deduction returned non-success:', deductionResult)
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
            console.error('❌ [Takeaway] Exception during inventory deduction:', invError)
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
          console.log('📴 [Takeaway] OFFLINE - Inventory deduction will happen during sync')
          console.log('📴 [Takeaway] Order marked as Completed in cache with:', {
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
        console.error('❌ [Takeaway] Cannot deduct inventory - Missing:', {
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

      // If order is completed, close the order details and refresh orders list
      if (newStatus === 'Completed') {
        setSelectedOrder(null)
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

  // Play beep sound function
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

  // Handle payment completion from inline payment view
  const handlePaymentRequired = async (order, paymentData) => {
    try {
      // CRITICAL: Handle split payment (paymentData is an array)
      if (Array.isArray(paymentData)) {
        console.log('💳 [Takeaway] Processing split payment completion:', paymentData)

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
        if (navigator.onLine) {
          console.log('🌐 [Takeaway Split Payment] ONLINE - Updating order and inserting transactions to database')

          // Update order with split payment
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              payment_method: 'Split',
              payment_status: 'Paid',
              amount_paid: totalPaid,
              updated_at: new Date().toISOString()
            })
            .eq('id', order.id)

          if (updateError) throw updateError

          // Insert payment transactions
          const { error: txError } = await supabase
            .from('order_payment_transactions')
            .insert(transactions)

          if (txError) {
            console.error('❌ [Takeaway] Error inserting payment transactions:', txError)
            throw txError
          } else {
            console.log('✅ [Takeaway] Split payment transactions inserted to database:', transactions.length)
            // Cache the transactions for offline fallback
            cacheManager.setPaymentTransactions(order.id, transactions)
          }
        } else {
          console.log('📴 [Takeaway Split Payment] OFFLINE - Caching order update and transactions')

          // Update order in cache
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
            console.log('✅ [Takeaway Split Payment] Order updated in cache (offline)')
          }

          // Cache the transactions for syncing when online
          cacheManager.setPaymentTransactions(order.id, transactions)
          console.log('✅ [Takeaway Split Payment] Transactions cached for later sync:', transactions.length)
        }

        // Log the split payment action
        await authManager.logOrderAction(
          order.id,
          'payment_completed',
          {
            payment_method: 'Split',
            amount: totalPaid,
            transaction_count: transactions.length
          },
          `Split payment completed: Rs ${totalPaid} (${transactions.length} transactions)`
        )

        // Continue with receipt printing and modal closing
        // (will be handled by the calling code)
        return
      }

      // Regular payment (paymentData is an object)
      // CRITICAL FIX: Check if online or offline
      if (navigator.onLine) {
        console.log('🌐 [Takeaway Payment] ONLINE - Updating order in database')

        // Update order with payment details
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_method: paymentData.paymentMethod,
            payment_status: 'Paid',
            amount_paid: paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            total_amount: paymentData.newTotal,
            updated_at: new Date().toISOString()
          })
          .eq('id', order.id)

        if (updateError) throw updateError

        console.log('✅ [Takeaway Payment] Payment updated in Supabase successfully')
      } else {
        console.log('📴 [Takeaway Payment] OFFLINE - Caching order update')

        // Update order in cache
        const orderIndex = cacheManager.cache.orders.findIndex(o => o.id === order.id)
        if (orderIndex !== -1) {
          cacheManager.cache.orders[orderIndex] = {
            ...cacheManager.cache.orders[orderIndex],
            payment_method: paymentData.paymentMethod,
            payment_status: 'Paid',
            amount_paid: paymentData.newTotal,
            discount_amount: paymentData.discountAmount || 0,
            discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
            total_amount: paymentData.newTotal,
            updated_at: new Date().toISOString(),
            _isSynced: false  // Mark for sync when online
          }
          await cacheManager.saveCacheToStorage()
          console.log('✅ [Takeaway Payment] Order updated in cache (offline)')
        } else {
          console.warn('⚠️ [Takeaway Payment] Order not found in cache:', order.id)
        }
      }

      // Log the payment action (works offline via authManager)
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

      // CRITICAL FIX: Handle customer ledger entry for Account payment (ONLINE ONLY)
      if (navigator.onLine && paymentData.paymentMethod === 'Account' && order.customer_id) {
        try {
          console.log('💳 [Takeaway Payment] Processing customer ledger for Account payment')

          const currentUser = authManager.getCurrentUser()
          if (!currentUser?.id) {
            console.error('⚠️ [Takeaway Payment] No current user found, skipping ledger entry')
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
                console.log(`💳 [Takeaway Payment] Updating ledger from Rs ${existingLedgerEntry.amount} to Rs ${paymentData.newTotal}`)

                // Delete old entry
                const { error: deleteError } = await supabase
                  .from('customer_ledger')
                  .delete()
                  .eq('id', existingLedgerEntry.id)

                if (deleteError) {
                  console.error('⚠️ [Takeaway Payment] Error deleting old ledger entry:', deleteError.message)
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
                      description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'TAKEAWAY'} (Payment completed)`,
                      notes: `Payment completed via inline payment modal`,
                      created_by: currentUser.id
                    })

                  if (ledgerError) {
                    console.error('⚠️ [Takeaway Payment] Error creating updated ledger entry:', ledgerError.message)
                  } else {
                    console.log(`✅ [Takeaway Payment] Updated ledger entry: Rs ${paymentData.newTotal} (Balance: ${newBalance})`)
                  }
                }
              } else {
                console.log('ℹ️ [Takeaway Payment] Ledger entry exists with same amount, no update needed')
              }
            } else {
              // Create new ledger entry
              console.log(`💳 [Takeaway Payment] Creating new ledger entry: Rs ${paymentData.newTotal}`)

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
                  description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'TAKEAWAY'}`,
                  notes: `Payment completed via inline payment modal`,
                  created_by: currentUser.id
                })

              if (ledgerError) {
                console.error('⚠️ [Takeaway Payment] Error creating ledger entry:', ledgerError.message)
              } else {
                console.log(`✅ [Takeaway Payment] Created ledger entry: Rs ${paymentData.newTotal} (Balance: ${newBalance})`)
              }
            }
          }
        } catch (ledgerError) {
          console.error('❌ [Takeaway Payment] Failed to handle customer ledger:', ledgerError)
          // Don't fail the payment if ledger update fails
        }
      }

      // Payment-only: update selectedOrder in state and return — no modal, stays in order details
      if (paymentData.completeOrder === false) {
        setSelectedOrder(prev => prev?.id === order.id
          ? { ...prev, payment_status: 'Paid', payment_method: paymentData.paymentMethod, amount_paid: paymentData.newTotal, total_amount: paymentData.newTotal }
          : prev)
        notify.success('Payment recorded successfully')
        setOrdersRefreshTrigger(prev => prev + 1)
        return
      }

      // Fetch loyalty redemption for this order
      let loyaltyDiscountAmount = 0
      let loyaltyPointsRedeemed = 0

      if (navigator.onLine) {
        try {
          const { data: redemption, error: redemptionError } = await supabase
            .from('loyalty_redemptions')
            .select('points_used, discount_applied')
            .eq('order_id', order.id)
            .maybeSingle()

          if (redemptionError) {
            console.error('❌ Error fetching loyalty for payment:', redemptionError)
          } else if (redemption) {
            loyaltyPointsRedeemed = redemption.points_used || 0
            loyaltyDiscountAmount = redemption.discount_applied || 0
            console.log('✅ Found loyalty redemption for payment (online):', {
              loyaltyPointsRedeemed,
              loyaltyDiscountAmount
            })
          } else {
            console.log('⚠️ No loyalty redemption found for this order')
          }
        } catch (error) {
          console.log('⚠️ Error fetching loyalty:', error)
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
          if (navigator.onLine) {
            const { data: deals, error: dealsError } = await supabase
              .from('deals')
              .select('*')
              .in('id', dealIds)

            if (!dealsError && deals) {
              deals.forEach(deal => dealsMap.set(deal.id, deal))
              console.log(`✅ [Takeaway Payment] Fetched ${deals.length} deal details for modal (online)`)
            }
          } else {
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`✅ [Takeaway Payment] Loaded ${dealsMap.size} deal details from cache (offline)`)
          }
        } catch (error) {
          console.error('[Takeaway Payment] Error fetching deal info:', error)
          const cachedDeals = cacheManager.getDeals()
          cachedDeals.forEach(deal => {
            if (dealIds.includes(deal.id)) {
              dealsMap.set(deal.id, deal)
            }
          })
          console.log(`⚠️ [Takeaway Payment] Using cached deals as fallback: ${dealsMap.size} deals`)
        }
      }

      // Prepare order data for success modal and printing with normalized deal data
      const mappedCartItems = (order.order_items || []).map(item => {
        if (item.is_deal) {
          let dealProducts = []
          let dealName = item.product_name

          // Debug: Log raw deal data
          console.log('🔍 [Takeaway Payment] Processing deal item:', {
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

              console.log('🔍 [Takeaway Payment] Parsed products:', parsedProducts)

              // Normalize the structure
              dealProducts = parsedProducts.map(product => ({
                name: product.name || product.product_name || product.productName || 'Unknown Product',
                quantity: product.quantity || 1,
                variant: product.variant || product.variant_name || product.variantName || null,
                flavor: product.flavor || null
              }))

              console.log(`✅ [Takeaway Payment] Normalized ${dealProducts.length} deal products for modal:`, dealProducts)
            } else {
              console.warn('⚠️ [Takeaway Payment] deal_products is null/undefined for deal:', item.deal_id)
            }
          } catch (e) {
            console.error('❌ [Takeaway Payment] Failed to parse deal_products:', e, 'Raw data:', item.deal_products)
            dealProducts = []
          }

          // Get deal name from database if missing
          if (!dealName && item.deal_id && dealsMap.has(item.deal_id)) {
            const dealInfo = dealsMap.get(item.deal_id)
            dealName = dealInfo.deal_name
            console.log(`✅ [Takeaway Payment] Retrieved deal name: ${dealName}`)
          } else if (!dealName) {
            console.warn('⚠️ [Takeaway Payment] Deal name missing for deal_id:', item.deal_id)
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
        subtotal: order.subtotal || paymentData.newTotal,
        paymentMethod: paymentData.paymentMethod,
        orderType: order.order_type || 'takeaway',
        tableName: null,
        discountAmount: paymentData.discountAmount || 0,
        loyaltyDiscountAmount: loyaltyDiscountAmount,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed,
        discountType: paymentData.discountType || 'percentage',
        discountValue: paymentData.discountValue || 0,
        changeAmount: paymentData.changeAmount || 0,
        cashReceived: paymentData.cashAmount || null,
        cart: mappedCartItems,
        customer: order.customers || null,
        orderInstructions: order.order_instructions || '',
        deliveryCharges: order.delivery_charges || 0,
        deliveryAddress: order.delivery_address || null,
        pickupTime: order.pickup_time || null,
        order: order
      }

      // Set order data and show modal
      setCompletedOrderData(orderData)
      setShowSuccessModal(true)

      // Play beep sound
      playBeepSound()

      // Mark order as completed only if user chose "Paid + Complete"
      if (paymentData.completeOrder !== false) {
        handleOrderStatusUpdate(order, 'Completed').catch(err => {
          console.error('Error updating order status:', err)
        })
      }

      // Refresh orders list
      setOrdersRefreshTrigger(prev => prev + 1)

    } catch (error) {
      console.error('Error completing payment:', error)
      notify.error(`Failed to complete payment: ${error.message}`)
    }
  }

  // Handle completing an already-paid order (show success modal for printing)
  const handleCompleteAlreadyPaidOrder = async (order) => {
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
      if (navigator.onLine) {
        // Online: Try to fetch from database
        try {
          const { data: redemption, error: redemptionError } = await supabase
            .from('loyalty_redemptions')
            .select('points_used, discount_applied')
            .eq('order_id', order.id)
            .maybeSingle()

          if (redemptionError) {
            console.error('❌ Error fetching loyalty for completed order:', redemptionError)
          } else if (redemption) {
            loyaltyPointsRedeemed = redemption.points_used || 0
            loyaltyDiscountAmount = redemption.discount_applied || 0
            console.log('✅ Found loyalty redemption for completed order (online):', {
              loyaltyPointsRedeemed,
              loyaltyDiscountAmount
            })
          } else {
            console.log('⚠️ No loyalty redemption found for this order')
          }
        } catch (error) {
          console.log('⚠️ Error fetching loyalty:', error)
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
          if (navigator.onLine) {
            const { data: deals, error: dealsError } = await supabase
              .from('deals')
              .select('*')
              .in('id', dealIds)

            if (!dealsError && deals) {
              deals.forEach(deal => dealsMap.set(deal.id, deal))
              console.log(`✅ [Takeaway Already Paid] Fetched ${deals.length} deal details for modal (online)`)
            }
          } else {
            const cachedDeals = cacheManager.getDeals()
            cachedDeals.forEach(deal => {
              if (dealIds.includes(deal.id)) {
                dealsMap.set(deal.id, deal)
              }
            })
            console.log(`✅ [Takeaway Already Paid] Loaded ${dealsMap.size} deal details from cache (offline)`)
          }
        } catch (error) {
          console.error('[Takeaway Already Paid] Error fetching deal info:', error)
          const cachedDeals = cacheManager.getDeals()
          cachedDeals.forEach(deal => {
            if (dealIds.includes(deal.id)) {
              dealsMap.set(deal.id, deal)
            }
          })
          console.log(`⚠️ [Takeaway Already Paid] Using cached deals as fallback: ${dealsMap.size} deals`)
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

              console.log(`✅ [Takeaway Already Paid] Normalized ${dealProducts.length} deal products`)
            }
          } catch (e) {
            console.error('❌ [Takeaway Already Paid] Failed to parse deal_products:', e)
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
        orderType: order.order_type || 'takeaway',
        tableName: null,
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
        pickupTime: order.pickup_time || null,
        order: order
      }

      // Set order data and show modal
      setCompletedOrderData(orderData)
      setShowSuccessModal(true)

      // Play beep sound
      playBeepSound()

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

  // Handle print receipt from success modal
  const handlePrintReceipt = async () => {
    if (!completedOrderData) return

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
      const order = completedOrderData.order
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
        // Add cashier/admin name for receipt printing
        cashier_name: order?.cashier_id ? cashierName : null,
        customer_name: !order?.cashier_id ? cashierName : null,
      }

      // Resolve order taker name from completed order
      const completedOrder = completedOrderData.order
      const completedOrderTakerName = completedOrder?.order_takers?.name ||
        (completedOrder?.order_taker_id
          ? (cacheManager.getOrderTakers().find(t => t.id === completedOrder.order_taker_id)?.name || null)
          : null)

      // Ensure order ID is included at the top level for logo fetching
      const printData = {
        ...completedOrderData,
        orderId: completedOrderData.order?.id || completedOrderData.orderId,
        order_taker_name: completedOrderTakerName || null
      }

      // Print the receipt
      const result = await printerManager.printReceipt(
        printData,
        userProfileData,
        printerConfig
      )

      if (result.success) {
        notify.success('Receipt printed successfully')
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

  const handleNewOrderFromSuccess = () => {
    console.log('🆕 [Takeaway] Starting new order, clearing all data')
    setShowSuccessModal(false)
    setCompletedOrderData(null)
    setCart([])
    setCustomer(null)
    setOrderInstructions('')
    setPickupTime('')
    setCurrentView('products')
    // Clear reopened order state
    setIsReopenedOrder(false)
    setOriginalOrderId(null)
    // Clear localStorage
    clearSavedData()
    // Navigate to dashboard
    router.push('/dashboard')
  }

  const handlePrintOrder = async (order, loyaltyRedemption = null) => {
    if (!order) return

    try {
      if (!user?.id) {
        toast.error('User not authenticated')
        return
      }

      toast.loading('Printing receipt...', { id: 'print-receipt' })

      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()

      if (!printer) {
        toast.error('No printer configured. Please add a printer in Settings.', { id: 'print-receipt' })
        return
      }

      // Fetch order items if not already available
      let orderItems = order.items || order.order_items || []
      if (orderItems.length === 0 && order.id) {
        const { data: items, error } = await cacheManager.supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)

        if (!error && items) {
          orderItems = items
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
        console.log('🔍 [handlePrintOrder] No loyalty data passed, attempting to fetch')

        // Try online fetch first
        if (navigator.onLine) {
          try {
            const { data: redemption, error: redemptionError } = await supabase
              .from('loyalty_redemptions')
              .select('points_used, discount_applied')
              .eq('order_id', order.id)
              .maybeSingle()

            if (redemptionError) {
              console.error('❌ Error fetching loyalty for print:', redemptionError)
            } else if (redemption) {
              loyaltyPointsRedeemed = redemption.points_used || 0
              loyaltyDiscountAmount = redemption.discount_applied || 0
              console.log('✅ Found loyalty redemption from database:', { loyaltyPointsRedeemed, loyaltyDiscountAmount })
            } else {
              console.log('⚠️ No loyalty redemption found for order:', order.order_number)
            }
          } catch (error) {
            console.log('⚠️ Error fetching loyalty:', error.message)
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

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'takeaway',
        customer: order.customers || { full_name: order.customer_name, phone: order.customer_phone },
        deliveryAddress: order.customers?.addressline || order.delivery_address,
        orderInstructions: order.order_instructions,
        total: order.total_amount,
        subtotal: order.subtotal,
        deliveryCharges: order.delivery_charges || 0,
        discountAmount: order.discount_amount || 0,
        loyaltyDiscountAmount: loyaltyDiscountAmount,
        loyaltyPointsRedeemed: loyaltyPointsRedeemed,
        discountType: 'amount',
        cart: orderItems.map((item) => {
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
              dealId: item.deal_id,
              dealName: item.product_name,
              dealProducts: dealProducts,
              quantity: item.quantity,
              totalPrice: item.total_price,
              finalPrice: item.final_price,
            }
          }
          return {
            isDeal: false,
            productName: item.product_name,
            variantName: item.variant_name,
            quantity: item.quantity,
            totalPrice: item.total_price,
            finalPrice: item.final_price,
          }
        }),
        paymentMethod: order.payment_method || 'Cash',
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
      const userRaw = JSON.parse(localStorage.getItem('user') || '{}')

      // Get local assets for offline printing
      const localLogo = localStorage.getItem('store_logo_local')
      const localQr = localStorage.getItem('qr_code_local')

      // Get cashier/admin name from order
      const cashierName = order.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order.users?.customer_name || 'Admin')

      const userProfile = {
        store_name: userProfileRaw?.store_name || userRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || userRaw?.store_address || '',
        phone: userProfileRaw?.phone || userRaw?.phone || '',
        // Use local base64/cached logo first, fallback to URL
        store_logo: localLogo || userProfileRaw?.store_logo || userRaw?.store_logo || null,
        // Use local QR first, fallback to URL
        qr_code: localQr || userProfileRaw?.qr_code || userRaw?.qr_code || null,
        hashtag1: userProfileRaw?.hashtag1 || userRaw?.hashtag1 || '',
        hashtag2: userProfileRaw?.hashtag2 || userRaw?.hashtag2 || '',
        show_footer_section: userProfileRaw?.show_footer_section !== false,
        show_logo_on_receipt: userProfileRaw?.show_logo_on_receipt !== false,
        show_business_name_on_receipt: userProfileRaw?.show_business_name_on_receipt !== false,
        // Add cashier/admin name for receipt printing
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const result = await printerManager.printReceipt(orderData, userProfile, printer)

      if (result.success) {
        toast.success('Receipt printed successfully', { id: 'print-receipt' })
      } else {
        throw new Error(result.message || result.error || 'Print failed')
      }
    } catch (error) {
      console.error('Print error:', error)
      toast.error(`Print failed: ${error.message}`, { id: 'print-receipt' })
    }
  }

  const handlePrintToken = async (order, loyaltyRedemption = null) => {
    if (!order) return

    try {
      if (!user?.id) {
        toast.error('User not authenticated')
        return
      }

      toast.loading('Printing kitchen token...', { id: 'print-token' })

      printerManager.setUserId(user.id)
      const printer = await printerManager.getPrinterForPrinting()

      if (!printer) {
        toast.error('No printer configured. Please add a printer in Settings.', { id: 'print-token' })
        return
      }

      // Always fetch fresh order items from Supabase when online (ensures item_instructions is included)
      let orderItems = []
      if (order.id && navigator.onLine) {
        const { data: items, error } = await supabase
          .from('order_items')
          .select('*')
          .eq('order_id', order.id)
        if (!error && items) orderItems = items
      }
      if (!orderItems.length) {
        orderItems = order.items || order.order_items || []
      }

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
            name: item.product_name,
            quantity: item.quantity,
            notes: item.notes || '',
            isDeal: true,
            dealProducts: dealProducts,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            variantName: item.variant_name,
            instructions: item.item_instructions || '',
            category_id: null,
            deal_id: item.deal_id || null,
          }
        }
        return {
          name: item.product_name,
          size: item.variant_name,
          quantity: item.quantity,
          notes: item.notes || '',
          isDeal: false,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          variantName: item.variant_name,
          instructions: item.item_instructions || '',
          category_id: item.category_id || productCategoryMap[item.product_id] || null,
          deal_id: null,
        }
      })

      // 🆕 Check for order changes using order_item_changes table
      if (order.id) {
        mappedItems = await getOrderItemsWithChanges(order.id, mappedItems)
      }

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'takeaway',
        customerName: order.customers?.full_name || order.customer_name || '',
        customerPhone: order.customers?.phone || order.customer_phone || '',
        totalAmount: order.total_amount,
        subtotal: order.subtotal,
        deliveryCharges: order.delivery_charges || 0,
        discountAmount: order.discount_amount || 0,
        specialNotes: order.order_instructions || '',
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
      const userRaw = JSON.parse(localStorage.getItem('user') || '{}')

      // Get cashier/admin name from order
      const cashierName = order.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order.users?.customer_name || 'Admin')

      const userProfile = {
        store_name: userProfileRaw?.store_name || userRaw?.store_name || '',
        store_address: userProfileRaw?.store_address || userRaw?.store_address || '',
        phone: userProfileRaw?.phone || userRaw?.phone || '',
        store_logo: userProfileRaw?.store_logo || userRaw?.store_logo || null,
        // Add cashier/admin name for kitchen token printing
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      const results = await printerManager.printKitchenTokens(orderData, userProfile, printer)
      const allOk = results.every(r => r?.success)
      const anyOk = results.some(r => r?.success)
      if (allOk) {
        toast.success('Kitchen token printed successfully', { id: 'print-token' })
      } else if (anyOk) {
        const failed = results.filter(r => !r?.success).map(r => r?.printerName || r?.printerId).join(', ')
        console.warn(`Kitchen token partial: failed for ${failed}`)
      } else {
        throw new Error(results[0]?.error || 'Print failed')
      }
    } catch (error) {
      console.error('Kitchen token print error:', error)
      toast.error(`Print failed: ${error.message}`, { id: 'print-token' })
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
    setOrderInstructions(data.orderInstructions)
    setPickupTime(data.pickupTime)
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
    console.log('🧹 [Takeaway] Clearing saved data')
    localStorage.removeItem('takeaway_cart')
    localStorage.removeItem('takeaway_customer')
    localStorage.removeItem('takeaway_instructions')
    localStorage.removeItem('takeaway_pickup_time')
    localStorage.removeItem('takeaway_reopened')
    localStorage.removeItem('takeaway_original_order')
    localStorage.removeItem('takeaway_modifying_order')
    localStorage.removeItem('takeaway_modifying_order_number')
    localStorage.removeItem('takeaway_original_state')
    localStorage.removeItem('takeaway_discount')
    localStorage.removeItem('takeaway_original_order_status')
    localStorage.removeItem('takeaway_original_payment_status')
    localStorage.removeItem('takeaway_original_amount_paid')
    localStorage.removeItem('takeaway_original_payment_method')
    localStorage.removeItem('takeaway_can_decrease_qty')
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
    console.log('🔵 [Takeaway] handleOrderAndPay called')

    if (cart.length === 0) {
      notify.warning('Please add items to cart before proceeding')
      return
    }

    if (!customer) {
      notify.warning('Please select a customer before proceeding')
      return
    }

    const orderData = {
      cart,
      customer,
      orderInstructions,
      pickupTime,
      subtotal: calculateSubtotal(),
      total: calculateTotal(),
      orderType: 'takeaway',
      cashierId: cashierData?.id || null,
      userId: user?.id,
      sessionId: sessionId,
      isModifying: isReopenedOrder,
      existingOrderId: originalOrderId,
      existingOrderNumber: localStorage.getItem('takeaway_modifying_order_number'),
      // 🆕 Include original payment information for modified order payment calculation
      originalPaymentStatus: localStorage.getItem('takeaway_original_payment_status'),
      originalAmountPaid: parseFloat(localStorage.getItem('takeaway_original_amount_paid')) || 0,
      originalPaymentMethod: localStorage.getItem('takeaway_original_payment_method')
    }

    console.log('🔵 [Takeaway] Order data prepared:', orderData)

    if (isReopenedOrder && originalOrderId) {
      const originalStateStr = localStorage.getItem('takeaway_original_state')
      if (originalStateStr) {
        const originalState = JSON.parse(originalStateStr)

        const changes = {
          itemsAdded: [],
          itemsRemoved: [],
          itemsModified: [],
          oldSubtotal: originalState.subtotal,
          newSubtotal: orderData.subtotal,
          oldTotal: originalState.total,
          newTotal: orderData.total,
          oldItemCount: originalState.itemCount,
          newItemCount: cart.length
        }

        originalState.items.forEach(oldItem => {
          const itemName = oldItem.isDeal ? oldItem.dealName : oldItem.productName
          const itemVariant = oldItem.isDeal ? null : oldItem.variantName

          const stillExists = cart.find(newItem => {
            const newItemName = newItem.isDeal ? newItem.dealName : newItem.productName
            const newItemVariant = newItem.isDeal ? null : newItem.variantName
            return newItemName === itemName && newItemVariant === itemVariant
          })

          if (!stillExists) {
            changes.itemsRemoved.push({
              name: itemName,
              variant: itemVariant,
              quantity: oldItem.quantity,
              price: oldItem.totalPrice
            })
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
            changes.itemsAdded.push({
              name: itemName,
              variant: itemVariant,
              quantity: newItem.quantity,
              price: newItem.totalPrice
            })
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
    }

    console.log('🔵 [Takeaway] Saving order_data to localStorage')
    orderData.sourcePage = 'takeaway'
    localStorage.setItem('order_data', JSON.stringify(orderData))
    console.log('🔵 [Takeaway] Navigating to payment page')
    notify.info('Proceeding to payment...')
    router.push('/payment')
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
    <ProtectedPage permissionKey="SALES_TAKEAWAY" pageName="Takeaway Orders">
      <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      <Toaster
        position="top-right"
        reverseOrder={false}
        gutter={8}
        toastOptions={{
          duration: 3000,
          style: {
            background: isDark ? '#1f2937' : '#fff',
            color: isDark ? '#f3f4f6' : '#111827',
            border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
          },
          success: {
            duration: 3000,
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff',
            },
          },
          error: {
            duration: 4000,
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff',
            },
          },
        }}
      />

      {/* Left Sidebar - Categories or Orders List */}
      {showOrdersView ? (
        <WalkinOrdersSidebar
          onOrderSelect={handleOrderSelect}
          onClose={handleCloseOrdersView}
          classes={classes}
          isDark={isDark}
          selectedOrderId={selectedOrder?.id}
          onBackClick={handleBackClick}
          orderType="takeaway"
          refreshTrigger={ordersRefreshTrigger}
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
          theme={theme}
          onToggleTheme={toggleTheme}
          networkStatus={networkStatus}
          classes={classes}
          isDark={isDark}
          orderType="takeaway"
          isReopenedOrder={isReopenedOrder}
          onOrdersClick={handleOrdersClick}
          showOrdersView={showOrdersView}
        />
      )}

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
          selectedCategoryId={selectedCategoryId}
        />
      )}

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

      {currentView === 'orders' && (
        <WalkinOrderDetails
          order={selectedOrder}
          classes={classes}
          isDark={isDark}
          onPrint={null}
          onPrintToken={null}
          onMarkReady={(order) => handleOrderStatusUpdate(order, 'Ready')}
          onComplete={handleCompleteAlreadyPaidOrder}
          onPaymentRequired={handlePaymentRequired}
          orderType="takeaway"
          onConvertToDelivery={() => {
            setOrdersRefreshTrigger(prev => prev + 1)
            setSelectedOrder(null)
            setCurrentView('products')
            notify.success('Order converted successfully!')
          }}
          onClose={() => {
            setSelectedOrder(null)
            setCurrentView('products')
          }}
        />
      )}

      <CartSidebar
        cart={cart}
        customer={customer}
        orderInstructions={orderInstructions}
        onUpdateQuantity={updateCartItemQuantity}
        onRemoveItem={removeCartItem}
        onShowCustomerForm={() => setShowCustomerForm(true)}
        onOrderAndPay={handleOrderAndPay}
        onClearCart={handleClearCart}
        calculateSubtotal={calculateSubtotal}
        calculateTotal={calculateTotal}
        classes={classes}
        isDark={isDark}
        networkStatus={networkStatus}
        orderType="takeaway"
        isReopenedOrder={isReopenedOrder}
        onUpdateItemInstruction={updateItemInstruction}
        inlineCustomer={true}
        onCustomerChange={setCustomer}
        orderData={orderData}
        onOrderDataChange={setOrderData}
        onInstructionsChange={setOrderInstructions}
      />

      <TakeawayCustomerForm
        isOpen={showCustomerForm}
        onClose={() => setShowCustomerForm(false)}
        onSubmit={handleCustomerFormSubmit}
        customer={customer}
        pickupTime={pickupTime}
        orderInstructions={orderInstructions}
      />

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

      {/* Success Modal */}
      <AnimatePresence>
        {showSuccessModal && completedOrderData && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className={`${classes.card} rounded-3xl ${classes.shadow} shadow-2xl p-8 max-w-md w-full text-center ${classes.border} border`}
            >
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
                    Rs {completedOrderData.total.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Payment Method:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>{completedOrderData.paymentMethod}</span>
                </div>
                <div className="flex justify-between">
                  <span className={classes.textSecondary}>Order Type:</span>
                  <span className={`font-semibold ${classes.textPrimary} capitalize`}>{completedOrderData.orderType}</span>
                </div>
                {completedOrderData.pickupTime && (
                  <div className="flex justify-between">
                    <span className={classes.textSecondary}>Pickup Time:</span>
                    <span className={`font-semibold ${classes.textPrimary}`}>{completedOrderData.pickupTime}</span>
                  </div>
                )}
                {completedOrderData.discountAmount > 0 && (
                  <div className={`flex justify-between ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    <span>Discount Applied:</span>
                    <span className="font-semibold">Rs {completedOrderData.discountAmount.toFixed(2)}</span>
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
                  onClick={handlePrintReceipt}
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

      </div>
    </ProtectedPage>
  )
}
