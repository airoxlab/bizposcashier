'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  User,
  ShoppingCart,
  Plus,
  Minus,
  Edit3,
  Trash2,
  FileText,
  X,
  Check,
  Coffee,
  Utensils,
  Cookie,
  Wifi,
  WifiOff,
  AlertCircle,
  Sun,
  Moon,
  Clock
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { notify } from '../../components/ui/NotificationSystem'
import Modal from '../../components/ui/Modal'
import TakeawayCustomerForm from '../../components/pos/TakeawayCustomerForm'

export default function TakeAwayPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [cashierData, setCashierData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [categories, setCategories] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(null)
  const [orderInstructions, setOrderInstructions] = useState('')
  const [takeawayTime, setTakeawayTime] = useState(() => {
    const now = new Date()
    now.setMinutes(now.getMinutes() + 30)
    return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  })
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [productVariants, setProductVariants] = useState([])
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [showVariantModal, setShowVariantModal] = useState(false)
  const [variantsCache, setVariantsCache] = useState(new Map())
  const [showExitModal, setShowExitModal] = useState(false)
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [theme, setTheme] = useState('light')
  const [isReopenedOrder, setIsReopenedOrder] = useState(false)
  const [originalOrderId, setOriginalOrderId] = useState(null)

  const productRefs = useRef({})
  const variantModalRef = useRef(null)

  // Pre-cache all variants
  useEffect(() => {
    if (isDataReady && allProducts.length > 0) {
      console.log('🚀 Pre-caching all product variants...')
      const cache = new Map()
      let cachedCount = 0
      allProducts.forEach(product => {
        const variants = cacheManager.getProductVariants(product.id)
        if (variants && variants.length > 0) {
          cache.set(product.id, variants)
          cachedCount++
        }
      })
      setVariantsCache(cache)
      console.log(`✅ Pre-cached variants for ${cachedCount} products`)
    }
  }, [isDataReady, allProducts])

  // Save cart to localStorage
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('takeaway_cart', JSON.stringify(cart))
      localStorage.setItem('takeaway_customer', JSON.stringify(customer))
      localStorage.setItem('takeaway_instructions', orderInstructions)
      localStorage.setItem('takeaway_time', takeawayTime)
      localStorage.setItem('takeaway_reopened', JSON.stringify(isReopenedOrder))
      localStorage.setItem('takeaway_original_order', originalOrderId)
    }
  }, [cart, customer, orderInstructions, takeawayTime, isReopenedOrder, originalOrderId])

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
    }

    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    const savedCart = localStorage.getItem('takeaway_cart')
    const savedCustomer = localStorage.getItem('takeaway_customer')
    const savedInstructions = localStorage.getItem('takeaway_instructions')
    const savedTakeawayTime = localStorage.getItem('takeaway_time')
    const savedModifyingOrderId = localStorage.getItem('takeaway_modifying_order')

    if (savedCart) setCart(JSON.parse(savedCart))
    if (savedCustomer) setCustomer(JSON.parse(savedCustomer))
    if (savedInstructions) setOrderInstructions(savedInstructions)
    if (savedTakeawayTime) setTakeawayTime(savedTakeawayTime)
    if (savedModifyingOrderId) {
      setIsReopenedOrder(true)
      setOriginalOrderId(savedModifyingOrderId)
    }

    checkAndLoadData()

    const statusInterval = setInterval(() => {
      setNetworkStatus(cacheManager.getNetworkStatus())
    }, 1000)

    return () => clearInterval(statusInterval)
  }, [router])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (variantModalRef.current && !variantModalRef.current.contains(event.target)) {
        setShowVariantModal(false)
      }
    }

    if (showVariantModal) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showVariantModal])

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  const checkAndLoadData = async () => {
    setIsLoading(true)

    try {
      if (cacheManager.isReady()) {
        console.log('📦 Cache is ready, loading data immediately')
        loadCachedData()
        setIsDataReady(true)
        setIsLoading(false)
        return
      }

      console.log('⏳ Cache not ready, waiting for initialization...')
      const loadingId = notify.loading('Loading menu data...')
      let attempts = 0
      const maxAttempts = 30

      const checkInterval = setInterval(() => {
        attempts++
        if (cacheManager.isReady()) {
          console.log('✅ Cache became ready, loading data')
          clearInterval(checkInterval)
          notify.remove(loadingId)
          loadCachedData()
          setIsDataReady(true)
          setIsLoading(false)
          notify.success('Menu data loaded')
        } else if (attempts >= maxAttempts) {
          console.log('⚠️ Cache timeout')
          clearInterval(checkInterval)
          notify.remove(loadingId)
          setIsLoading(false)
          notify.error('Failed to load menu data', {
            action: {
              label: 'Go to Dashboard',
              onClick: () => router.push('/dashboard')
            }
          })
        }
      }, 500)
    } catch (error) {
      console.error('Error checking cache:', error)
      setIsLoading(false)
      notify.error('Error loading menu data')
    }
  }

  const loadCachedData = () => {
    const cachedCategories = cacheManager.getCategories()
    const cachedProducts = cacheManager.getProducts()
    setCategories(cachedCategories)
    setAllProducts(cachedProducts)
    console.log('📦 Loaded from cache:', {
      categories: cachedCategories.length,
      products: cachedProducts.length
    })
  }

  const handleProductClick = (product) => {
    setSelectedProduct(product)
    let variants = []
    
    if (variantsCache.has(product.id)) {
      variants = variantsCache.get(product.id)
      console.log('✅ Using cached variants for', product.name)
    } else {
      variants = cacheManager.getProductVariants(product.id)
      setVariantsCache(prev => {
        const newCache = new Map(prev)
        newCache.set(product.id, variants)
        return newCache
      })
      console.log('📦 Loaded variants for', product.name)
    }

    setProductVariants(variants)
    setSelectedVariant(null)
    setQuantity(1)
    setShowVariantModal(true)
  }

  const handleAddToCart = () => {
    if (!selectedProduct) return

    let finalPrice
    let variantPrice = 0
    let basePrice = parseFloat(selectedProduct.base_price)

    if (selectedVariant) {
      finalPrice = parseFloat(selectedVariant.price)
      variantPrice = finalPrice
      basePrice = 0
    } else {
      finalPrice = basePrice
    }

    const cartItem = {
      id: `${selectedProduct.id}-${selectedVariant?.id || 'base'}-${Date.now()}`,
      productId: selectedProduct.id,
      variantId: selectedVariant?.id || null,
      productName: selectedProduct.name,
      variantName: selectedVariant?.name || null,
      basePrice: basePrice,
      variantPrice: variantPrice,
      finalPrice: finalPrice,
      quantity: quantity,
      totalPrice: finalPrice * quantity,
      image: selectedProduct.image_url
    }

    setCart(prevCart => [...prevCart, cartItem])
    setShowVariantModal(false)
    setSelectedProduct(null)
    setSelectedVariant(null)
    setQuantity(1)

    notify.success(`${cartItem.productName} added to cart`, { duration: 2000 })
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
      notify.info(`${item.productName} removed from cart`, { duration: 2000 })
    }
  }

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0)
  }

  const calculateTotal = () => {
    return calculateSubtotal()
  }

  const scrollToCategory = (categoryId) => {
    const element = productRefs.current[categoryId]
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  const getProductsByCategory = (categoryId) => {
    return allProducts.filter(product => product.category_id === categoryId)
  }

  const handleCustomerFormSubmit = (data) => {
    setCustomer(data.customer)
    setOrderInstructions(data.orderInstructions)
    setTakeawayTime(data.takeawayTime)
    setShowCustomerForm(false)
  }

  const handleBackClick = () => {
    if (cart.length > 0) {
      setShowExitModal(true)
    } else {
      clearSavedData()
      router.push('/dashboard/')
    }
  }

  const clearSavedData = () => {
    localStorage.removeItem('takeaway_cart')
    localStorage.removeItem('takeaway_customer')
    localStorage.removeItem('takeaway_instructions')
    localStorage.removeItem('takeaway_time')
    localStorage.removeItem('takeaway_reopened')
    localStorage.removeItem('takeaway_original_order')
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

  const handleOrderAndPay = () => {
    if (cart.length === 0) {
      notify.warning('Please add items to cart before proceeding')
      return
    }

    if (!takeawayTime) {
      notify.warning('Please select a takeaway time')
      return
    }

    const orderData = {
      cart,
      customer,
      orderInstructions,
      subtotal: calculateSubtotal(),
      total: calculateTotal(),
      orderType: 'takeaway',
      takeawayTime,
      cashierId: cashierData?.id || null,
      userId: user?.id,
      sessionId: sessionId,
      isModifying: isReopenedOrder,
      existingOrderId: originalOrderId,
      existingOrderNumber: localStorage.getItem('takeaway_modifying_order_number')
    }

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
          const stillExists = cart.find(newItem => 
            newItem.productName === oldItem.productName && 
            newItem.variantName === oldItem.variantName
          )
          if (!stillExists) {
            changes.itemsRemoved.push({
              name: oldItem.productName,
              variant: oldItem.variantName,
              quantity: oldItem.quantity,
              price: oldItem.totalPrice
            })
          }
        })

        cart.forEach(newItem => {
          const oldItem = originalState.items.find(old => 
            old.productName === newItem.productName && 
            old.variantName === newItem.variantName
          )
          
          if (!oldItem) {
            changes.itemsAdded.push({
              name: newItem.productName,
              variant: newItem.variantName,
              quantity: newItem.quantity,
              price: newItem.totalPrice
            })
          } else if (oldItem.quantity !== newItem.quantity) {
            changes.itemsModified.push({
              name: newItem.productName,
              variant: newItem.variantName,
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

    localStorage.setItem('order_data', JSON.stringify(orderData))
    notify.info('Proceeding to payment...')
    router.push('/payment')
  }

  const getCategoryIcon = (categoryName) => {
    const name = categoryName.toLowerCase()
    if (name.includes('coffee') || name.includes('drink')) return Coffee
    if (name.includes('food') || name.includes('meal')) return Utensils
    return Cookie
  }

  const calculateFinalPrice = () => {
    if (!selectedProduct) return 0
    if (selectedVariant) {
      return parseFloat(selectedVariant.price)
    } else {
      return parseFloat(selectedProduct.base_price)
    }
  }

  const calculateTotalPrice = () => {
    return calculateFinalPrice() * quantity
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  if (isLoading || !isDataReady) {
    return (
      <div className={`h-screen flex items-center justify-center ${classes.background} transition-all duration-500`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-orange-600 border-t-transparent mx-auto mb-4"></div>
          <h3 className={`text-xl font-bold ${classes.textPrimary} mb-2`}>Loading Menu Data</h3>
          <p className={`${classes.textSecondary} mb-4`}>Please wait while we load your products...</p>

          <div className={`${isDark ? 'bg-blue-900/20 border-blue-700/30' : 'bg-blue-50 border-blue-200'} border rounded-lg p-3 max-w-md mx-auto`}>
            <div className="flex items-center justify-center space-x-2 mb-2">
              {networkStatus.isOnline ? (
                <Wifi className="w-4 h-4 text-green-500" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-500" />
              )}
              <span className={`text-sm font-medium ${classes.textPrimary}`}>
                {networkStatus.isOnline ? 'Online' : 'Offline Mode'}
              </span>
            </div>
            <p className={`text-xs ${classes.textSecondary}`}>
              {networkStatus.isOnline ? 'Loading from server or cache...' : 'Using cached data only'}
            </p>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      {/* Left Sidebar - Categories */}
      <div className={`w-64 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-r flex flex-col`}>
        <div className={`p-4 ${classes.border} border-b ${classes.card}`}>
          <motion.button
            whileHover={{ x: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleBackClick}
            className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors mb-3 group`}
          >
            <div className={`w-8 h-8 rounded-full ${classes.button} group-hover:${classes.shadow} group-hover:shadow-sm flex items-center justify-center mr-3 transition-colors`}>
              <ArrowLeft className="w-4 h-4" />
            </div>
            <span className="font-medium text-sm">Back to Dashboard</span>
          </motion.button>
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className={`text-xl font-bold ${classes.textPrimary}`}>Take Away Order</h2>
              <p className={`${classes.textSecondary} text-sm`}>
                {isReopenedOrder ? '🔄 Reopened Order' : 'New Order'}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className={`p-2 rounded-lg ${classes.button} transition-all`}
              >
                <AnimatePresence mode="wait">
                  {isDark ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Sun className="w-4 h-4 text-yellow-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Moon className={`w-4 h-4 ${classes.textSecondary}`} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              <div className="flex items-center space-x-2">
                {networkStatus.isOnline ? (
                  <Wifi className="w-4 h-4 text-green-500" />
                ) : (
                  <WifiOff className="w-4 h-4 text-red-500" />
                )}
                {networkStatus.unsyncedOrders > 0 && (
                  <div className="flex items-center space-x-1">
                    <AlertCircle className="w-4 h-4 text-orange-500" />
                    <span className={`text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'} font-medium`}>
                      {networkStatus.unsyncedOrders}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-scroll p-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          <h3 className={`text-xs font-semibold ${classes.textSecondary} uppercase tracking-wider mb-3`}>
            Categories
          </h3>
          <div className="space-y-1">
            {categories.map((category) => {
              const IconComponent = getCategoryIcon(category.name)
              const productCount = getProductsByCategory(category.id).length
              return (
                <motion.button
                  key={category.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => scrollToCategory(category.id)}
                  className={`w-full text-left p-3 rounded-lg transition-all duration-300 group hover:${isDark ? 'bg-orange-900/20' : 'bg-orange-100'} ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center">
                    <div className={`w-10 h-10 rounded-lg overflow-hidden mr-3 ${isDark ? 'bg-orange-900/30' : 'bg-orange-100'} flex items-center justify-center`}>
                      {category.image_url ? (
                        <img
                          src={category.image_url}
                          alt={category.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <IconComponent className={`w-5 h-5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold ${classes.textPrimary} truncate text-sm`}>
                        {category.name}
                      </div>
                      <div className={`text-xs ${classes.textSecondary}`}>
                        {productCount} items
                      </div>
                    </div>
                  </div>
                </motion.button>
              )
            })}
          </div>
        </div>
      </div>

      {/* Center - Products */}
      <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b p-4`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-xl font-bold ${classes.textPrimary}`}>
                Products Menu
              </h1>
              <p className={`${classes.textSecondary} text-sm`}>
                {allProducts.length} items available
                {!networkStatus.isOnline && (
                  <span className={`ml-2 ${isDark ? 'text-orange-400' : 'text-orange-600'} font-medium`}>(Offline Mode)</span>
                )}
              </p>
            </div>
            <div className="text-right">
              <div className={`text-xs ${classes.textSecondary}`}>
                {new Date().toLocaleDateString()}
              </div>
              <div className={`text-sm font-semibold ${classes.textPrimary}`}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-scroll p-4" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {categories.map((category) => {
            const categoryProducts = getProductsByCategory(category.id)
            if (categoryProducts.length === 0) return null

            return (
              <div
                key={category.id}
                ref={el => productRefs.current[category.id] = el}
                className="mb-6"
              >
                <div className={`sticky top-0 ${classes.card} py-2 z-10 rounded-lg mb-3 ${classes.shadow} shadow-sm`}>
                  <h2 className={`text-lg font-bold ${classes.textPrimary} px-3`}>
                    {category.name}
                  </h2>
                  <div className={`text-xs ${classes.textSecondary} px-3`}>
                    {categoryProducts.length} items
                  </div>
                </div>
                <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-3">
                  {categoryProducts.map((product) => (
                    <motion.div
                      key={product.id}
                      whileHover={{ y: -4, scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => handleProductClick(product)}
                      className={`${classes.card} rounded-xl ${classes.shadow} shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group ${classes.border} border`}
                    >
                      <div className={`relative aspect-square ${isDark ? 'bg-gray-700' : 'bg-gray-100'} overflow-hidden`}>
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex items-center justify-center h-full">
                            <div className="w-12 h-12 bg-orange-500 rounded-full flex items-center justify-center">
                              <span className="text-white text-lg font-bold">
                                {product.name.charAt(0)}
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="absolute top-2 left-2 bg-green-600 text-white px-2 py-1 rounded-full text-xs font-bold shadow-lg">
                          Rs {product.base_price}
                        </div>

                        <motion.div
                          whileHover={{ scale: 1.1, rotate: 90 }}
                          transition={{ type: "spring", stiffness: 300 }}
                          className={`absolute bottom-2 right-2 w-8 h-8 ${classes.card} rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-all duration-300`}
                        >
                          <Plus className="w-4 h-4 text-orange-600" />
                        </motion.div>
                      </div>

                      <div className="p-2">
                        <h3 className={`font-bold ${classes.textPrimary} text-sm mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate`}>
                          {product.name}
                        </h3>
                        {product.ingredients && (
                          <p className={`${classes.textSecondary} text-xs truncate`}>
                            {product.ingredients}
                          </p>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            )
          })}

          {allProducts.length === 0 && (
            <div className="text-center py-20">
              <div className={`w-24 h-24 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                <Coffee className={`w-12 h-12 ${classes.textSecondary}`} />
              </div>
              <h3 className={`text-2xl font-bold ${classes.textSecondary} mb-3`}>
                No products found
              </h3>
              <p className={`${classes.textSecondary} text-lg`}>
                Add some delicious items to get started
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Cart */}
      <div className={`w-80 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-l flex flex-col`}>
        <div className={`p-4 ${classes.border} border-b ${classes.card}`}>
          <h2 className={`text-xl font-bold ${classes.textPrimary}`}>POS Take Away</h2>
          <p className={`${classes.textSecondary} text-sm`}>{cart.length} items in cart</p>
          {isReopenedOrder && (
            <div className={`mt-2 ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'} ${classes.border} border rounded-lg p-2`}>
              <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'} font-medium`}>
                🔄 Order reopened for modification
              </p>
            </div>
          )}
        </div>

        {/* Customer Button */}
        <div className={`p-3 ${classes.border} border-b ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
          {customer ? (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-300'} border-2 rounded-xl p-3`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start space-x-3">
                  <div className={`w-10 h-10 ${isDark ? 'bg-green-800' : 'bg-green-200'} rounded-full flex items-center justify-center flex-shrink-0`}>
                    <User className={`w-5 h-5 ${isDark ? 'text-green-300' : 'text-green-700'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                  <p className={`font-bold ${isDark ? 'text-orange-300' : 'text-orange-800'} text-sm truncate`}>
  {customer.full_name || `${customer.first_name || ''} ${customer.last_name || ''}`.trim() || 'Unknown Customer'}
</p>
                    <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'} truncate`}>
                      {customer.phone}
                    </p>
                    {customer.email && (
                      <p className={`text-xs ${isDark ? 'text-green-500' : 'text-green-500'} truncate`}>
                        {customer.email}
                      </p>
                    )}
                    {takeawayTime && (
                      <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'} mt-1 flex items-center`}>
                        <Clock className="w-3 h-3 mr-1" /> {takeawayTime}
                      </p>
                    )}
                    {orderInstructions && (
                      <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'} mt-1 italic`}>
                        📝 {orderInstructions}
                      </p>
                    )}
                  </div>
                </div>
           <motion.button
  whileHover={{ scale: 1.1 }}
  whileTap={{ scale: 0.9 }}
  onClick={() => setShowCustomerForm(true)}
  className={`p-2 ${isDark ? 'bg-orange-600 hover:bg-orange-700' : 'bg-orange-500 hover:bg-orange-600'} rounded-lg transition-colors flex-shrink-0 shadow-md`}
>
  <Edit3 className="w-4 h-4 text-white" />
</motion.button>
              </div>
            </motion.div>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCustomerForm(true)}
              className={`w-full flex items-center justify-center p-4 ${classes.card} rounded-xl hover:${classes.shadow} hover:shadow-lg transition-all duration-200 ${classes.border} border-2 border-dashed hover:border-orange-500`}
            >
              <User className="w-5 h-5 text-orange-600 mr-3" />
              <span className={`font-semibold ${classes.textPrimary}`}>
                Add Customer Details
              </span>
            </motion.button>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 overflow-y-auto p-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <style jsx>{`
            div::-webkit-scrollbar {
              display: none;
            }
          `}</style>
          {cart.length === 0 ? (
            <div className="text-center py-8">
              <div className={`w-16 h-16 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-3`}>
                <ShoppingCart className={`w-8 h-8 ${classes.textSecondary}`} />
              </div>
              <h3 className={`text-lg font-semibold ${classes.textSecondary} mb-2`}>Cart is empty</h3>
              <p className={`${classes.textSecondary} text-sm`}>Add items to get started</p>
            </div>
          ) : (
            <div className="space-y-2">
              <AnimatePresence>
                {cart.map((item, index) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`${classes.card} rounded-lg p-3 ${classes.shadow} shadow-sm ${classes.border} border group hover:shadow-md transition-all duration-200`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h4 className={`font-semibold ${classes.textPrimary} text-sm leading-tight truncate`}>
                          {item.productName}
                        </h4>
                        {item.variantName && (
                          <p className={`text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'} font-medium mt-0.5`}>
                            {item.variantName}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => removeCartItem(item.id)}
                        className={`p-1 text-red-400 hover:text-red-600 hover:${isDark ? 'bg-red-900/20' : 'bg-red-50'} rounded transition-all opacity-0 group-hover:opacity-100`}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>

                    <div className="flex items-center justify-between">
                      <div className={`flex items-center ${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-lg p-1`}>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => updateCartItemQuantity(item.id, item.quantity - 1)}
                          className="w-7 h-7 bg-red-500 hover:bg-red-600 text-white rounded-md flex items-center justify-center transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </motion.button>
                        <span className={`font-bold ${classes.textPrimary} w-8 text-center text-sm`}>
                          {item.quantity}
                        </span>
                        <motion.button
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => updateCartItemQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 bg-green-500 hover:bg-green-600 text-white rounded-md flex items-center justify-center transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </motion.button>
                      </div>

                      <div className="text-right">
                        <div className={`text-xs ${classes.textSecondary}`}>
                          Rs {item.finalPrice} × {item.quantity}
                        </div>
                        <div className={`font-bold ${classes.textPrimary} text-sm`}>
                          Rs {item.totalPrice.toFixed(2)}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Cart Summary & Checkout */}
        {cart.length > 0 && (
          <div className={`p-4 ${classes.border} border-t ${classes.card}`}>
            <div className={`space-y-2 mb-4 p-3 ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'} rounded-lg`}>
              <div className={`flex justify-between text-lg font-bold ${classes.textPrimary}`}>
                <span>Total:</span>
                <span className={`${isDark ? 'text-green-400' : 'text-green-600'}`}>Rs {calculateTotal().toFixed(2)}</span>
              </div>
            </div>

            {!networkStatus.isOnline && (
              <div className={`mb-4 p-3 ${isDark ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'} border rounded-lg`}>
                <div className="flex items-center space-x-2">
                  <WifiOff className={`w-4 h-4 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                  <span className={`${isDark ? 'text-orange-300' : 'text-orange-700'} text-sm font-medium`}>
                    Offline Mode - Order will sync when online
                  </span>
                </div>
              </div>
            )}

            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleOrderAndPay}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-3 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              <div className="flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 mr-2" />
                Order & Pay Rs {calculateTotal().toFixed(2)}
              </div>
            </motion.button>
          </div>
        )}
      </div>

      {/* Variant Modal */}
      <AnimatePresence>
        {showVariantModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              ref={variantModalRef}
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              transition={{ duration: 0.15, ease: "easeOut" }}
              className={`${classes.card} rounded-2xl ${classes.shadow} shadow-2xl w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col`}
            >
              <div className="relative bg-gradient-to-r from-orange-600 to-red-600 p-4 text-white flex-shrink-0">
                <button
                  onClick={() => setShowVariantModal(false)}
                  className="absolute top-3 right-3 p-1.5 hover:bg-white/20 rounded-full transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>

                <div className="flex items-center space-x-3 pr-10">
                  <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0">
                    {selectedProduct?.image_url ? (
                      <img
                        src={selectedProduct.image_url}
                        alt={selectedProduct.name}
                        className="w-full h-full object-cover rounded-lg"
                        loading="eager"
                      />
                    ) : (
                      <span className="text-lg font-bold text-white">
                        {selectedProduct?.name?.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold truncate">{selectedProduct?.name}</h3>
                    <p className="text-orange-200 text-sm">
                      {productVariants.length > 0 ? 'Select a size' : `Rs ${selectedProduct?.base_price}`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {productVariants && productVariants.length > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className={`text-base font-bold ${classes.textPrimary}`}>Choose Size</h4>
                      {!selectedVariant && (
                        <span className={`${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-600'} text-xs font-semibold px-2 py-1 rounded-full`}>
                          Required
                        </span>
                      )}
                    </div>

                    <div className={`space-y-2 ${productVariants.length > 4 ? 'max-h-48 overflow-y-auto pr-1' : ''}`}>
                      {productVariants.map((variant) => {
                        const variantPrice = parseFloat(variant.price)
                        const isSelected = selectedVariant?.id === variant.id

                        return (
                          <button
                            key={variant.id}
                            onClick={() => setSelectedVariant(variant)}
                            className={`relative p-3 rounded-lg border-2 text-left transition-all duration-100 w-full ${
                              isSelected
                                ? `border-orange-500 ${isDark ? 'bg-orange-900/20' : 'bg-orange-50'} shadow-md`
                                : `${classes.border} hover:border-orange-300 hover:${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <div className="flex-1 min-w-0">
                                <div className={`font-semibold text-sm ${
                                  isSelected
                                    ? isDark ? 'text-orange-300' : 'text-orange-700'
                                    : classes.textPrimary
                                } truncate`}>
                                  {variant.name}
                                </div>
                                <div className={`text-xs ${classes.textSecondary} mt-0.5`}>
                                  Variant Price Only
                                </div>
                              </div>
                              <div className="text-right ml-3 flex-shrink-0 flex items-center space-x-2">
                                <div className={`text-base font-bold ${
                                  isSelected
                                    ? isDark ? 'text-orange-400' : 'text-orange-600'
                                    : classes.textPrimary
                                }`}>
                                  Rs {variantPrice.toFixed(2)}
                                </div>
                                {isSelected && (
                                  <div className="w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                                    <Check className="w-2.5 h-2.5 text-white" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}

                {(!productVariants || productVariants.length === 0) && (
                  <div className={`${isDark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'} border rounded-lg p-3`}>
                    <p className={`${isDark ? 'text-green-300' : 'text-green-700'} text-sm`}>
                      ✓ Base price: Rs {selectedProduct?.base_price}
                    </p>
                  </div>
                )}

                <div>
                  <h4 className={`text-base font-bold ${classes.textPrimary} mb-3`}>Quantity</h4>
                  <div className="flex items-center justify-center">
                    <div className={`flex items-center ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-lg p-1.5`}>
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-8 h-8 bg-red-500 hover:bg-red-600 active:scale-95 text-white rounded-md flex items-center justify-center transition-all"
                      >
                        <Minus className="w-3 h-3" />
                      </button>

                      <div className="mx-4 text-center">
                        <div className={`text-xl font-bold ${classes.textPrimary}`}>{quantity}</div>
                        <div className={`text-xs ${classes.textSecondary}`}>items</div>
                      </div>

                      <button
                        onClick={() => setQuantity(quantity + 1)}
                        className="w-8 h-8 bg-green-500 hover:bg-green-600 active:scale-95 text-white rounded-md flex items-center justify-center transition-all"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className={`p-3 bg-gradient-to-r ${isDark ? 'from-green-900/20 to-emerald-900/20 border-green-800' : 'from-green-50 to-emerald-50 border-green-200'} rounded-lg border`}>
                  <div className="flex justify-between items-center">
                    <div>
                      <div className={`text-sm font-medium ${classes.textPrimary}`}>Total Price</div>
                      <div className={`text-xs ${classes.textSecondary}`}>
                        Rs {calculateFinalPrice().toFixed(2)} × {quantity}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                        Rs {calculateTotalPrice().toFixed(2)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className={`flex-shrink-0 p-4 ${classes.border} border-t ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
                <div className="flex space-x-3">
                  <button
                    onClick={() => setShowVariantModal(false)}
                    className={`flex-1 py-2.5 px-4 border-2 ${classes.border} ${classes.textPrimary} font-semibold rounded-lg hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'} transition-all text-sm`}
                  >
                    Cancel
                  </button>

                  <button
                    onClick={handleAddToCart}
                    disabled={productVariants.length > 0 && !selectedVariant}
                    className={`flex-2 py-2.5 px-4 font-bold rounded-lg transition-all duration-100 text-sm ${
                      productVariants.length > 0 && !selectedVariant
                        ? `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
                        : 'bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 text-white shadow-lg hover:shadow-xl'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-2">
                      <Plus className="w-4 h-4" />
                      <span className="truncate">
                        {productVariants.length > 0 && !selectedVariant
                          ? 'Select Size First'
                          : `Add Rs ${calculateTotalPrice().toFixed(2)}`
                        }
                      </span>
                    </div>
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Customer Form */}
      <TakeawayCustomerForm
        isOpen={showCustomerForm}
        onClose={() => setShowCustomerForm(false)}
        onSubmit={handleCustomerFormSubmit}
        customer={customer}
        takeawayTime={takeawayTime}
      />

      {/* Exit Modal */}
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
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSaveAndExit}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              Save & Exit
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleConfirmExit}
              className="px-6 py-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
            >
              Discard & Exit
            </motion.button>
          </div>
        </div>
      </Modal>
    </div>
  )
}