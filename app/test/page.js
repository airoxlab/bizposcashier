'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { notify } from '../../components/ui/NotificationSystem'
import Modal from '../../components/ui/Modal'
import WalkInCustomerForm from '../../components/pos/WalkInCustomerForm'
import CategorySidebar from '../../components/test/CategorySidebar'
import ProductGrid from '../../components/test/ProductGrid'
import VariantSelectionScreen from '../../components/test/VariantSelectionScreen'
import DealFlavorSelectionScreen from '../../components/test/DealFlavorSelectionScreen'
import CartSidebar from '../../components/test/CartSidebar'
import { FileText } from 'lucide-react'
import toast, { Toaster } from 'react-hot-toast'

export default function TestPage() {
  const router = useRouter()
  const productGridRef = useRef(null)

  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [cashierData, setCashierData] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const [categories, setCategories] = useState([])
  const [allProducts, setAllProducts] = useState([])
  const [deals, setDeals] = useState([])
  const [cart, setCart] = useState([])
  const [customer, setCustomer] = useState(null)
  const [orderInstructions, setOrderInstructions] = useState('')
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true, unsyncedOrders: 0 })
  const [isDataReady, setIsDataReady] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [theme, setTheme] = useState('light')
  const [isReopenedOrder, setIsReopenedOrder] = useState(false)
  const [originalOrderId, setOriginalOrderId] = useState(null)

  // View state management
  const [currentView, setCurrentView] = useState('products') // 'products', 'variant', 'deal'
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [productVariants, setProductVariants] = useState([])
  const [dealProducts, setDealProducts] = useState([])
  const [selectedCategoryId, setSelectedCategoryId] = useState(null)

  // Modals
  const [showCustomerForm, setShowCustomerForm] = useState(false)
  const [showExitModal, setShowExitModal] = useState(false)

  // Save cart to localStorage
  useEffect(() => {
    if (cart.length > 0) {
      localStorage.setItem('test_cart', JSON.stringify(cart))
      localStorage.setItem('test_customer', JSON.stringify(customer))
      localStorage.setItem('test_instructions', orderInstructions)
      localStorage.setItem('test_reopened', JSON.stringify(isReopenedOrder))
      localStorage.setItem('test_original_order', originalOrderId)
    }
  }, [cart, customer, orderInstructions, isReopenedOrder, originalOrderId])

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

    console.log('👤 Test page loaded by:', role, '-', authManager.getDisplayName())

    if (userData?.id) {
      cacheManager.setUserId(userData.id)
    }

    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    const savedCart = localStorage.getItem('test_cart')
    const savedCustomer = localStorage.getItem('test_customer')
    const savedInstructions = localStorage.getItem('test_instructions')
    const savedModifyingOrderId = localStorage.getItem('test_modifying_order')

    if (savedCart) setCart(JSON.parse(savedCart))
    if (savedCustomer) setCustomer(JSON.parse(savedCustomer))
    if (savedInstructions) setOrderInstructions(savedInstructions)
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

      const loadingId = notify.loading('Loading menu data, please wait...')

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
          notify.success('Menu data loaded successfully')
        } else if (attempts >= maxAttempts) {
          console.log('⚠️ Cache timeout, trying to initialize manually')
          clearInterval(checkInterval)
          notify.remove(loadingId)

          cacheManager.initializeCache().then(() => {
            if (cacheManager.isReady()) {
              loadCachedData()
              setIsDataReady(true)
              notify.success('Menu data loaded successfully')
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
      }, 500)

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
    setAllProducts(cachedProducts)
    setDeals(cachedDeals)

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
    setSelectedDeal(deal)
    const products = cacheManager.getDealProducts(deal.id)
    setDealProducts(products)
    setCurrentView('deal')
  }

  const handleAddToCart = (cartItem) => {
    setCart(prevCart => [...prevCart, cartItem])
    setCurrentView('products')
    setSelectedProduct(null)
    setSelectedDeal(null)
    setProductVariants([])
    setDealProducts([])

    // Show toast notification
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

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + item.totalPrice, 0)
  }

  const calculateTotal = () => {
    return calculateSubtotal()
  }

  const scrollToCategory = (categoryId) => {
    // Close any open modals first
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

  const getProductsByCategory = (categoryId) => {
    return allProducts.filter(product => product.category_id === categoryId)
  }

  const getProductCount = (categoryId) => {
    return getProductsByCategory(categoryId).length
  }

  const handleCustomerFormSubmit = (data) => {
    setCustomer(data.customer)
    setOrderInstructions(data.orderInstructions)
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
    localStorage.removeItem('test_cart')
    localStorage.removeItem('test_customer')
    localStorage.removeItem('test_instructions')
    localStorage.removeItem('test_reopened')
    localStorage.removeItem('test_original_order')
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
    console.log('🔵 [Test] handleOrderAndPay called')
    console.log('🔵 [Test] Cart length:', cart.length)
    console.log('🔵 [Test] isReopenedOrder:', isReopenedOrder)
    console.log('🔵 [Test] originalOrderId:', originalOrderId)

    if (cart.length === 0) {
      notify.warning('Please add items to cart before proceeding')
      return
    }

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
      isModifying: isReopenedOrder,
      existingOrderId: originalOrderId,
      existingOrderNumber: localStorage.getItem('test_modifying_order_number')
    }

    console.log('🔵 [Test] Order data prepared:', orderData)

    if (isReopenedOrder && originalOrderId) {
      const originalStateStr = localStorage.getItem('test_original_state')
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

    console.log('🔵 [Test] Saving order_data to localStorage')
    localStorage.setItem('order_data', JSON.stringify(orderData))
    console.log('🔵 [Test] Navigating to payment page')
    notify.info('Proceeding to payment...')
    router.push('/payment')
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  if (isLoading || !isDataReady) {
    return <div className={`h-screen w-screen ${classes.background}`} />
  }

  return (
    <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      {/* Toast Notifications */}
      <Toaster
        position="top-center"
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

      {/* Left Sidebar - Categories */}
      <CategorySidebar
        categories={categories}
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
        orderType="walkin"
        isReopenedOrder={isReopenedOrder}
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
          selectedCategoryId={selectedCategoryId}
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

      {/* Right Sidebar - Cart */}
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
        orderType="walkin"
        isReopenedOrder={isReopenedOrder}
      />

      {/* Customer Form */}
      <WalkInCustomerForm
        isOpen={showCustomerForm}
        onClose={() => setShowCustomerForm(false)}
        onSubmit={handleCustomerFormSubmit}
        customer={customer}
      />

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
    </div>
  )
}
