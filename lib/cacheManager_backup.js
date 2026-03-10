// lib/cacheManager.js - COMPLETE FILE WITH PROPER UNIT CONVERSION
import { supabase } from './supabase'
import dailySerialManager from './utils/dailySerialManager'

// Global variable to ensure true singleton
let globalCacheManager = null

class CacheManager {
  constructor() {
    // Prevent multiple instances
    if (globalCacheManager) {
      return globalCacheManager
    }

    this.cache = {
      categories: [],
      products: [],
      variants: new Map(),
      customers: new Map(),
      orders: [],
      deals: [],
      dealProducts: new Map(),
      tables: [],
      pendingStatusUpdates: [], // Track offline status updates
      expenses: [], // Track expenses for offline mode
      expenseCategories: [], // Track expense categories
      expenseSubcategories: [], // Track expense subcategories
      stockHistory: [], // Track stock history/purchases
      lastSync: null,
      sessionLoaded: false
    }
    
    this.userId = null
    this.initialized = false
    this.isFirstLoad = true
    
    if (typeof window !== 'undefined') {
      this.isOnline = navigator.onLine
      this.syncQueue = []
      this.isSyncing = false
      
      window.addEventListener('online', () => {
        this.isOnline = true
        this.syncOfflineData()
      })
      
      window.addEventListener('offline', () => {
        this.isOnline = false
      })

      this.loadCacheFromStorage().then(() => {
        if (this.cache.categories.length > 0 || this.cache.products.length > 0) {
          this.initialized = true
          console.log('Cache restored from localStorage on startup')
        }
      })
    } else {
      this.isOnline = true
      this.syncQueue = []
      this.isSyncing = false
    }

    globalCacheManager = this
  }

  setUserId(userId) {
    this.userId = userId
    console.log('Cache Manager: User ID set to', userId)
  }

  isElectron() {
    return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron
  }

  isReady() {
    return this.initialized && (this.cache.categories.length > 0 || this.cache.products.length > 0)
  }

  // 🆕 CRITICAL: Convert units to base unit (everything to kg or liters)
  convertToBaseUnit(quantity, unitAbbreviation) {
    const unit = unitAbbreviation?.toLowerCase() || ''
    
    // Weight conversions (to kg)
    if (unit === 'g' || unit === 'gram' || unit === 'grams') {
      return quantity / 1000 // 1000g = 1kg
    }
    if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') {
      return quantity // Already in kg
    }
    if (unit === 'mg' || unit === 'milligram' || unit === 'milligrams') {
      return quantity / 1000000 // 1000000mg = 1kg
    }
    
    // Volume conversions (to liters)
    if (unit === 'ml' || unit === 'milliliter' || unit === 'milliliters') {
      return quantity / 1000 // 1000ml = 1L
    }
    if (unit === 'l' || unit === 'liter' || unit === 'liters') {
      return quantity // Already in liters
    }
    
    // No conversion needed for pieces, units, etc.
    return quantity
  }

  async findCustomerByPhone(phoneNumber) {
    try {
      console.log(`[CacheManager] Searching for customer with phone: ${phoneNumber}`)
      
      if (!this.userId) {
        throw new Error('User ID is required to find customers')
      }
      
      if (this.isElectron()) {
        const result = await window.electronAPI.customerFindByPhone({ 
          phone: phoneNumber,
          user_id: this.userId 
        })
        
        if (!result.success) {
          if (result.notFound) {
            return null
          }
          throw new Error(result.error)
        }
        
        return result.data
      } else {
        const { data, error } = await supabase
          .from('customers')
          .select('*')
          .eq('phone', phoneNumber)
          .eq('user_id', this.userId)
          .single()

        if (error) {
          if (error.code === 'PGRST116') {
            return null
          }
          throw error
        }

        return data
      }

    } catch (error) {
      console.error(`[CacheManager] Error finding customer:`, error)
      return null
    }
  }
// Replace your findOrCreateCustomer method in cacheManager.js with this updated version

async findOrCreateCustomer(phoneNumber, customerData = null) {
  try {
    console.log('[CacheManager] findOrCreateCustomer called with phone:', phoneNumber)
    console.log('[CacheManager] User ID:', this.userId)
    console.log('[CacheManager] Online status:', this.isOnline)

    if (!this.userId) {
      const error = new Error('User ID is required to create/find customers')
      console.error('[CacheManager] ❌ No user ID!', error)
      throw error
    }

    // Check cache first (for both online and offline customers)
    const cachedCustomer = this.cache.customers.get(phoneNumber)
    if (cachedCustomer) {
      console.log('📦 Found customer in cache:', cachedCustomer.full_name)

      // If we have customer data to update and customer exists
      if (customerData && !cachedCustomer._isTemp) {
        // Update existing customer if online
        if (this.isOnline) {
          return await this.updateExistingCustomer(cachedCustomer.id, phoneNumber, customerData)
        }
      }

      return cachedCustomer
    }

    // Try to find in database if online
    if (this.isOnline) {
      console.log('[CacheManager] Searching database for existing customer...')
      const existingCustomer = await this.findCustomerByPhone(phoneNumber)

      if (existingCustomer && !customerData) {
        this.cache.customers.set(phoneNumber, existingCustomer)
        return existingCustomer
      }

      if (existingCustomer && customerData) {
        // Update existing customer
        console.log('[CacheManager] Updating existing customer...')
        return await this.updateExistingCustomer(existingCustomer.id, phoneNumber, customerData)
      }
    }

    // Create new customer (works both online and offline)
    console.log('[CacheManager] Creating new customer...')
    return await this.createNewCustomer(phoneNumber, customerData)

  } catch (error) {
    console.error(`[CacheManager] ❌ Error in findOrCreateCustomer:`, error)
    console.error(`[CacheManager] Error message:`, error.message)
    console.error(`[CacheManager] Error stack:`, error.stack)

    // If offline or error, create temp customer
    if (!this.isOnline || error.message.includes('Failed to fetch')) {
      console.log('⚠️ Creating temp customer due to offline/error')
      return await this.createTempCustomer(phoneNumber, customerData)
    }

    // For any other error, create temp customer as fallback
    console.log('⚠️ Creating temp customer as fallback due to error')
    return await this.createTempCustomer(phoneNumber, customerData)
  }
}

async updateExistingCustomer(customerId, phoneNumber, customerData) {
  try {
    const updatePayload = {
      id: customerId,
      full_name: customerData.fullName || `${customerData.firstName} ${customerData.lastName}`.trim(),
      email: customerData.email || '',
      phone: phoneNumber,
      addressline: customerData.addressLine || '',
      user_id: this.userId
    }

    console.log('[CacheManager] Updating customer:', updatePayload)

    if (this.isElectron()) {
      console.log('[CacheManager] Using Electron API for update')
      const result = await window.electronAPI.customerUpdate(updatePayload)
      console.log('[CacheManager] Electron update result:', result)

      if (!result.success) {
        throw new Error(result.error)
      }

      // Electron API returns customer in 'customer' property, not 'data'
      const customerData = result.customer || result.data
      if (!customerData) {
        throw new Error('No customer data returned from Electron API')
      }

      this.cache.customers.set(phoneNumber, customerData)
      await this.saveCacheToStorage()
      console.log('[CacheManager] Customer updated via Electron:', customerData)
      return customerData
    } else {
      console.log('[CacheManager] Using Supabase for update')
      const { data, error } = await supabase
        .from('customers')
        .update({
          full_name: updatePayload.full_name,
          email: updatePayload.email,
          addressline: updatePayload.addressline
        })
        .eq('id', customerId)
        .eq('user_id', this.userId)
        .select()
        .single()

      if (error) {
        console.error('[CacheManager] Supabase update error:', error)
        throw error
      }

      // Update cache
      this.cache.customers.set(phoneNumber, data)
      await this.saveCacheToStorage()

      console.log('[CacheManager] Customer updated via Supabase:', data)
      return data
    }
  } catch (error) {
    console.error('[CacheManager] ❌ Error updating customer:', error)
    // Instead of throwing, return the cached customer as fallback
    const cachedCustomer = this.cache.customers.get(phoneNumber)
    if (cachedCustomer) {
      console.log('[CacheManager] Returning cached customer as fallback')
      return cachedCustomer
    }
    throw error
  }
}

async createNewCustomer(phoneNumber, customerData) {
  try {
    const createPayload = {
      full_name: customerData?.fullName || `${customerData?.firstName || ''} ${customerData?.lastName || ''}`.trim(),
      email: customerData?.email || '',
      phone: phoneNumber,
      addressline: customerData?.addressLine || '',
      user_id: this.userId
    }

    console.log('[CacheManager] Creating new customer:', createPayload)

    // If offline, create temp customer
    if (!this.isOnline) {
      console.log('📴 Offline: Creating temp customer')
      return await this.createTempCustomer(phoneNumber, customerData)
    }

    if (this.isElectron()) {
      console.log('[CacheManager] Using Electron API for create')
      const result = await window.electronAPI.customerCreate(createPayload)
      console.log('[CacheManager] Electron create result:', result)

      if (!result.success) {
        throw new Error(result.error)
      }

      // Electron API returns customer in 'customer' property, not 'data'
      const customerData = result.customer || result.data
      if (!customerData) {
        throw new Error('No customer data returned from Electron API')
      }

      this.cache.customers.set(phoneNumber, customerData)
      await this.saveCacheToStorage()
      console.log('[CacheManager] ✅ Customer created via Electron:', customerData)
      return customerData
    } else {
      console.log('[CacheManager] Using Supabase for create')
      const { data, error } = await supabase
        .from('customers')
        .insert(createPayload)
        .select()
        .single()

      if (error) {
        console.error('[CacheManager] Supabase create error:', error)
        throw error
      }

      // Update cache immediately
      this.cache.customers.set(phoneNumber, data)

      // Also update localStorage
      const allCustomers = this.getAllCustomers()
      localStorage.setItem('pos_customers', JSON.stringify(allCustomers))

      await this.saveCacheToStorage()

      console.log('[CacheManager] ✅ Customer created via Supabase:', data.full_name)

      return data
    }
  } catch (error) {
    console.error('[CacheManager] ❌ Error creating customer:', error)
    console.error('[CacheManager] Falling back to temp customer')
    // Fallback to temp customer
    return await this.createTempCustomer(phoneNumber, customerData)
  }
}

async createTempCustomer(phoneNumber, customerData) {
  const tempId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

  const tempCustomer = {
    id: tempId,
    phone: phoneNumber,
    full_name: customerData?.fullName || `${customerData?.firstName || ''} ${customerData?.lastName || ''}`.trim(),
    email: customerData?.email || '',
    addressline: customerData?.addressLine || '',
    user_id: this.userId,
    _isTemp: true,
    _createdAt: new Date().toISOString()
  }

  // Store in cache
  this.cache.customers.set(phoneNumber, tempCustomer)
  await this.saveCacheToStorage()

  console.log('💾 Temp customer created:', tempCustomer.full_name, '- Will sync when online')

  return tempCustomer
}

  async fetchAllCustomers() {
  try {
    console.log('[CacheManager] Fetching all customers...')
    
    if (!this.userId) {
      throw new Error('User ID is required to fetch customers')
    }

    if (this.isElectron()) {
      const result = await window.electronAPI.customerGetAll({ user_id: this.userId })
      
      if (!result.success) {
        throw new Error(result.error)
      }
      
      // Store customers in cache as Map with phone as key
      this.cache.customers.clear()
      result.data.forEach(customer => {
        this.cache.customers.set(customer.phone, customer)
      })
      
      // Also store in localStorage
      localStorage.setItem('pos_customers', JSON.stringify(result.data))
      
      console.log(`✅ [CacheManager] Fetched ${result.data.length} customers`)
      return result.data
      
    } else {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })

      if (error) throw error

      // Store customers in cache as Map with phone as key
      this.cache.customers.clear()
      data.forEach(customer => {
        this.cache.customers.set(customer.phone, customer)
      })
      
      // Also store in localStorage
      localStorage.setItem('pos_customers', JSON.stringify(data))
      
      console.log(`✅ [CacheManager] Fetched ${data.length} customers`)
      return data
    }

  } catch (error) {
    console.error('[CacheManager] Error fetching customers:', error)
    throw error
  }
}

getAllCustomers() {
  return Array.from(this.cache.customers.values())
}

  async initializeCache(forceRefresh = false) {
    try {
      console.log('Initializing cache...')
      
      if (!this.userId) {
        throw new Error('User ID is required. Please log in again.')
      }
      
      await this.loadCacheFromStorage()
      
      if ((this.cache.categories.length > 0 || this.cache.products.length > 0) && !forceRefresh) {
        this.initialized = true
        
        if (this.cache.sessionLoaded && !forceRefresh) {
          return true
        }
      }
      
      if (this.isOnline && (this.isFirstLoad || forceRefresh)) {
        await this.fetchAllData()
        await this.saveCacheToStorage()
        this.initialized = true
        this.isFirstLoad = false
        this.cache.sessionLoaded = true
      }
      
      return true
    } catch (error) {
      console.error('Cache initialization failed:', error)
      await this.loadCacheFromStorage()
      if (this.cache.categories.length > 0 || this.cache.products.length > 0) {
        this.initialized = true
        return true
      }
      return false
    }
  }

  async refreshData() {
    await this.initializeCache(true)
  }

  resetSession() {
    this.cache.sessionLoaded = false
    this.isFirstLoad = true
    this.saveCacheToStorage()
  }



  async saveCacheToStorage() {
    if (typeof window === 'undefined') return

    try {
      const cacheData = {
        categories: this.cache.categories,
        products: this.cache.products,
        variants: Array.from(this.cache.variants.entries()),
        customers: Array.from(this.cache.customers.entries()),
        orders: this.cache.orders,
        deals: this.cache.deals,
        dealProducts: Array.from(this.cache.dealProducts.entries()),
        tables: this.cache.tables,
        pendingStatusUpdates: this.cache.pendingStatusUpdates || [],
        expenses: this.cache.expenses || [],
        expenseCategories: this.cache.expenseCategories || [],
        expenseSubcategories: this.cache.expenseSubcategories || [],
        stockHistory: this.cache.stockHistory || [],
        lastSync: this.cache.lastSync,
        initialized: this.initialized,
        sessionLoaded: this.cache.sessionLoaded,
        userId: this.userId
      }

      localStorage.setItem('pos_cache', JSON.stringify(cacheData))
    } catch (error) {
      console.error('Error saving cache:', error)
    }
  }

  async loadCacheFromStorage() {
    if (typeof window === 'undefined') return

    try {
      const cacheData = localStorage.getItem('pos_cache')
      if (cacheData) {
        const parsed = JSON.parse(cacheData)

        if (this.userId && parsed.userId && parsed.userId !== this.userId) {
          this.clearCache()
          return
        }

        this.cache.categories = parsed.categories || []
        this.cache.products = parsed.products || []
        this.cache.variants = new Map(parsed.variants || [])
        this.cache.customers = new Map(parsed.customers || [])
        this.cache.orders = parsed.orders || []
        this.cache.deals = parsed.deals || []
        this.cache.dealProducts = new Map(parsed.dealProducts || [])
        this.cache.tables = parsed.tables || []
        this.cache.pendingStatusUpdates = parsed.pendingStatusUpdates || []
        this.cache.expenses = parsed.expenses || []
        this.cache.expenseCategories = parsed.expenseCategories || []
        this.cache.expenseSubcategories = parsed.expenseSubcategories || []
        this.cache.stockHistory = parsed.stockHistory || []
        this.cache.lastSync = parsed.lastSync
        this.initialized = parsed.initialized || false
        this.cache.sessionLoaded = parsed.sessionLoaded || false
      }
    } catch (error) {
      console.error('Error loading cache:', error)
    }
  }

  getCategories() {
    return this.cache.categories
  }

  getProducts() {
    return this.cache.products
  }

  getProductsByCategory(categoryId) {
    return this.cache.products.filter(product => product.category_id === categoryId)
  }

  getProductVariants(productId) {
    return this.cache.variants.get(productId) || []
  }

  getDeals() {
    const now = new Date()

    return this.cache.deals
      .filter(deal => deal.is_active)
      .map(deal => {
        // Check if deal is out of time
        const startDate = deal.start_date ? new Date(deal.start_date) : null
        const endDate = deal.end_date ? new Date(deal.end_date) : null

        let isOutOfTime = false

        // Deal is out of time if:
        // 1. Current time is before start_date
        // 2. Current time is after end_date
        if (startDate && now < startDate) {
          isOutOfTime = true
        } else if (endDate && now > endDate) {
          isOutOfTime = true
        }

        return {
          ...deal,
          isOutOfTime
        }
      })
  }

  getDealProducts(dealId) {
    return this.cache.dealProducts.get(dealId) || []
  }

  // 🆕 FIXED: Process inventory deduction with PROPER UNIT CONVERSION
  async processInventoryDeduction(orderItems, orderId) {
    console.log(`📦 [Inventory] Starting inventory deduction for order ${orderId}`)

    const inventoryUpdates = []

    try {
      // Calculate total quantity needed per inventory item
      const inventoryNeeded = new Map()

      // === PART 1A: Process products WITH variants ===
      const itemsWithVariants = orderItems.filter(item => item.variant_id && !item.is_deal)
      const variantIds = itemsWithVariants.map(item => item.variant_id)

      if (variantIds.length > 0) {
        // Fetch variant ingredients with units
        const { data: variantIngredients, error: ingredientsError } = await supabase
          .from('product_variant_ingredients')
          .select(`
            *,
            inventory_items (
              id,
              name,
              sku,
              current_stock,
              minimum_stock,
              average_cost
            ),
            units (
              id,
              name,
              abbreviation
            )
          `)
          .in('variant_id', variantIds)

        if (!ingredientsError && variantIngredients && variantIngredients.length > 0) {
          console.log(`📦 [Inventory] Found ${variantIngredients.length} variant ingredient mappings`)

          for (const orderItem of itemsWithVariants) {
            const itemIngredients = variantIngredients.filter(
              vi => vi.variant_id === orderItem.variant_id
            )

            for (const ingredient of itemIngredients) {
              if (!ingredient.inventory_items) {
                console.log(`ℹ️ [Inventory] Ingredient item not found - skipping`)
                continue
              }

              const inventoryItemId = ingredient.inventory_item_id

              // Get the recipe quantity and its unit
              const recipeQuantity = parseFloat(ingredient.quantity)
              const recipeUnitAbbr = ingredient.units?.abbreviation

              // Convert recipe quantity to base unit (e.g., 500g → 0.5kg)
              const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)

              // Total needed = recipe per serving × order quantity
              const totalQuantityNeeded = recipeQuantityInBaseUnit * orderItem.quantity

              if (inventoryNeeded.has(inventoryItemId)) {
                inventoryNeeded.set(
                  inventoryItemId,
                  inventoryNeeded.get(inventoryItemId) + totalQuantityNeeded
                )
              } else {
                inventoryNeeded.set(inventoryItemId, totalQuantityNeeded)
              }

              console.log(
                `📦 [Inventory] ${ingredient.inventory_items.name}: ` +
                `${recipeQuantity} ${recipeUnitAbbr} × ${orderItem.quantity} = ` +
                `${totalQuantityNeeded.toFixed(3)} (base unit) needed`
              )
            }
          }
        }
      }

      // === PART 1B: Process products WITHOUT variants (base products) ===
      const itemsWithoutVariants = orderItems.filter(item => !item.variant_id && item.product_id && !item.is_deal)
      const productIds = itemsWithoutVariants.map(item => item.product_id)

      if (productIds.length > 0) {
        console.log(`📦 [Inventory] Processing ${productIds.length} products without variants`)

        // Fetch ingredients for products without variants (where variant_id is NULL)
        const { data: productIngredients, error: productIngredientsError } = await supabase
          .from('product_variant_ingredients')
          .select(`
            *,
            inventory_items (
              id,
              name,
              sku,
              current_stock,
              minimum_stock,
              average_cost
            ),
            units (
              id,
              name,
              abbreviation
            )
          `)
          .in('product_id', productIds)
          .is('variant_id', null)

        if (!productIngredientsError && productIngredients && productIngredients.length > 0) {
          console.log(`📦 [Inventory] Found ${productIngredients.length} base product ingredient mappings`)

          for (const orderItem of itemsWithoutVariants) {
            const itemIngredients = productIngredients.filter(
              pi => pi.product_id === orderItem.product_id
            )

            for (const ingredient of itemIngredients) {
              if (!ingredient.inventory_items) {
                console.log(`ℹ️ [Inventory] Ingredient item not found - skipping`)
                continue
              }

              const inventoryItemId = ingredient.inventory_item_id

              // Get the recipe quantity and its unit
              const recipeQuantity = parseFloat(ingredient.quantity)
              const recipeUnitAbbr = ingredient.units?.abbreviation

              // Convert recipe quantity to base unit (e.g., 500g → 0.5kg)
              const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)

              // Total needed = recipe per serving × order quantity
              const totalQuantityNeeded = recipeQuantityInBaseUnit * orderItem.quantity

              if (inventoryNeeded.has(inventoryItemId)) {
                inventoryNeeded.set(
                  inventoryItemId,
                  inventoryNeeded.get(inventoryItemId) + totalQuantityNeeded
                )
              } else {
                inventoryNeeded.set(inventoryItemId, totalQuantityNeeded)
              }

              console.log(
                `📦 [Inventory] ${ingredient.inventory_items.name}: ` +
                `${recipeQuantity} ${recipeUnitAbbr} × ${orderItem.quantity} = ` +
                `${totalQuantityNeeded.toFixed(3)} (base unit) needed`
              )
            }
          }
        } else {
          console.log(`ℹ️ [Inventory] No base product ingredients found for products: ${productIds.join(', ')}`)
        }
      }

      // === PART 2: Process deal items ===
      const dealItems = orderItems.filter(item => item.is_deal && item.deal_id)

      if (dealItems.length > 0) {
        console.log(`📦 [Inventory] Processing ${dealItems.length} deal items`)

        for (const dealItem of dealItems) {
          try {
            // Parse deal_products JSON to get the deal components
            let dealProducts = []
            if (typeof dealItem.deal_products === 'string') {
              try {
                dealProducts = JSON.parse(dealItem.deal_products)
              } catch (e) {
                console.log(`ℹ️ [Inventory] Failed to parse deal_products JSON`)
                continue
              }
            } else if (Array.isArray(dealItem.deal_products)) {
              dealProducts = dealItem.deal_products
            }

            if (!dealProducts || dealProducts.length === 0) {
              console.log(`ℹ️ [Inventory] No deal products found for deal ${dealItem.deal_id}`)
              continue
            }

            // Fetch deal products
            const { data: dealProductsData, error: dealProductsError } = await supabase
              .from('deal_products')
              .select('*')
              .eq('deal_id', dealItem.deal_id)

            if (dealProductsError || !dealProductsData) {
              console.log(`ℹ️ [Inventory] Failed to fetch deal products for deal ${dealItem.deal_id}`)
              continue
            }

            console.log(`📦 [Inventory] Found ${dealProductsData.length} deal products for deal ${dealItem.deal_id}`)

            // Process each deal product
            for (const dealProduct of dealProductsData) {
              // The deal product name is the actual product name
              // The description is the variant name
              const productName = dealProduct.name
              const variantName = dealProduct.description

              console.log(`📦 [Inventory] Processing deal product: ${productName}${variantName ? ` (${variantName})` : ''}`)

              // Find the actual product
              const actualProduct = this.cache.products.find(p =>
                p.name.toLowerCase() === productName.toLowerCase()
              )

              if (!actualProduct) {
                console.log(`⚠️ [Inventory] Product '${productName}' not found in cache`)
                continue
              }

              // If variant specified, find the variant
              let variantId = null
              if (variantName) {
                const variants = this.getProductVariants(actualProduct.id)
                const matchedVariant = variants.find(v =>
                  v.name.toLowerCase() === variantName.toLowerCase()
                )
                if (matchedVariant) {
                  variantId = matchedVariant.id
                } else {
                  console.log(`⚠️ [Inventory] Variant '${variantName}' not found for product '${productName}'`)
                }
              }

              // Fetch ingredients based on whether it has a variant or not
              let ingredientsData = []

              if (variantId) {
                // Get variant-specific ingredients
                const { data: variantIngredients, error: variantIngredientsError } = await supabase
                  .from('product_variant_ingredients')
                  .select(`
                    *,
                    inventory_items (
                      id,
                      name,
                      sku,
                      current_stock,
                      average_cost
                    ),
                    units (
                      id,
                      name,
                      abbreviation
                    )
                  `)
                  .eq('variant_id', variantId)

                if (!variantIngredientsError && variantIngredients) {
                  ingredientsData = variantIngredients
                }
              } else {
                // Get base product ingredients (where variant_id is NULL)
                const { data: productIngredients, error: productIngredientsError } = await supabase
                  .from('product_variant_ingredients')
                  .select(`
                    *,
                    inventory_items (
                      id,
                      name,
                      sku,
                      current_stock,
                      average_cost
                    ),
                    units (
                      id,
                      name,
                      abbreviation
                    )
                  `)
                  .eq('product_id', actualProduct.id)
                  .is('variant_id', null)

                if (!productIngredientsError && productIngredients) {
                  ingredientsData = productIngredients
                }
              }

              // Process ingredients
              for (const ingredient of ingredientsData) {
                if (!ingredient.inventory_items) continue

                const inventoryItemId = ingredient.inventory_item_id
                const recipeQuantity = parseFloat(ingredient.quantity)
                const recipeUnitAbbr = ingredient.units?.abbreviation

                // Convert to base unit
                const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)

                // Total = recipe × deal product quantity × order quantity
                const totalQuantityNeeded = recipeQuantityInBaseUnit * (dealProduct.quantity || 1) * dealItem.quantity

                if (inventoryNeeded.has(inventoryItemId)) {
                  inventoryNeeded.set(
                    inventoryItemId,
                    inventoryNeeded.get(inventoryItemId) + totalQuantityNeeded
                  )
                } else {
                  inventoryNeeded.set(inventoryItemId, totalQuantityNeeded)
                }

                console.log(
                  `📦 [Inventory] Deal ${productName}${variantName ? ` (${variantName})` : ''}: ` +
                  `${ingredient.inventory_items.name}: ${recipeQuantity} ${recipeUnitAbbr} × ` +
                  `${dealProduct.quantity || 1} × ${dealItem.quantity} = ` +
                  `${totalQuantityNeeded.toFixed(3)} (base unit) needed`
                )
              }
            }
          } catch (dealError) {
            console.log(`ℹ️ [Inventory] Error processing deal ${dealItem.deal_id}: ${dealError.message}`)
            continue
          }
        }
      }

      if (inventoryNeeded.size === 0) {
        console.log(`ℹ️ [Inventory] No valid inventory items to update`)
        return { success: true, inventoryUpdates: [] }
      }

      console.log(`📦 [Inventory] Total unique inventory items to update: ${inventoryNeeded.size}`)

      // Update each inventory item
      for (const [inventoryItemId, quantityNeeded] of inventoryNeeded.entries()) {
        try {
          const { data: inventoryItem, error: fetchError } = await supabase
            .from('inventory_items')
            .select('*, units(*)')
            .eq('id', inventoryItemId)
            .single()

          if (fetchError || !inventoryItem) {
            console.log(`ℹ️ [Inventory] Item ${inventoryItemId} not found - skipping`)
            continue
          }

          const currentStock = parseFloat(inventoryItem.current_stock)
          const newStock = currentStock - quantityNeeded

          if (newStock < 0) {
            console.log(`ℹ️ [Inventory] ${inventoryItem.name} will go negative - proceeding anyway`)
          }

          const newTotalValue = newStock * inventoryItem.average_cost

          // Update inventory
          const { error: updateError } = await supabase
            .from('inventory_items')
            .update({
              current_stock: newStock,
              total_value: newTotalValue,
              updated_at: new Date().toISOString()
            })
            .eq('id', inventoryItemId)

          if (updateError) {
            console.log(`ℹ️ [Inventory] Failed to update ${inventoryItem.name} - skipping`)
            continue
          }

          // Create stock history
          try {
            await supabase
              .from('stock_history')
              .insert({
                inventory_item_id: inventoryItemId,
                transaction_type: 'sale',
                quantity: -quantityNeeded,
                before_stock: currentStock,
                after_stock: newStock,
                reference_id: orderId,
                notes: `Deducted for order ${orderId}`,
                created_at: new Date().toISOString()
              })
          } catch (historyError) {
            console.log(`ℹ️ [Inventory] History creation failed - continuing`)
          }

          inventoryUpdates.push({
            itemId: inventoryItemId,
            itemName: inventoryItem.name,
            quantityDeducted: quantityNeeded,
            unit: inventoryItem.units?.abbreviation,
            previousStock: currentStock,
            newStock: newStock
          })

          console.log(
            `✅ [Inventory] Updated ${inventoryItem.name}: ` +
            `${currentStock} → ${newStock} ${inventoryItem.units?.abbreviation}`
          )
        } catch (itemError) {
          console.log(`ℹ️ [Inventory] Error processing item - skipping`)
          continue
        }
      }

      console.log(`✅ [Inventory] Deduction complete: ${inventoryUpdates.length} items updated`)
      
      return {
        success: true,
        inventoryUpdates
      }

    } catch (error) {
      console.log(`ℹ️ [Inventory] Process error: ${error.message}`)
      return {
        success: true,
        inventoryUpdates
      }
    }
  }

async createOrder(orderData) {
  const orderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const orderNumber = this.generateOrderNumber()

  // Generate daily serial number (UI only, not stored in DB)
  const dailySerial = dailySerialManager.getNextSerial(orderNumber)

  const order = {
    id: orderId,
    order_number: orderNumber,
    daily_serial: dailySerial, // UI-only field
    user_id: orderData.user_id,
    cashier_id: orderData.cashier_id || null, // NEW: Cashier tracking
    session_id: orderData.session_id || null, // NEW: Session tracking
    customer_id: orderData.customer_id,
    order_type: orderData.order_type,
    subtotal: orderData.subtotal,
    discount_amount: orderData.discount_amount || 0,
    discount_percentage: orderData.discount_percentage || 0,
    delivery_charges: orderData.delivery_charges || 0, // FIXED: Add delivery charges
    delivery_boy_id: orderData.delivery_boy_id || null, // FIXED: Add delivery boy
    table_id: orderData.table_id || null, // Add table_id for walkin orders
    total_amount: orderData.total_amount,
    payment_method: orderData.payment_method,
    payment_status: orderData.payment_status,
    order_status: orderData.order_status,
    order_instructions: orderData.order_instructions || null,
    takeaway_time: orderData.takeaway_time || null, // FIXED: Add takeaway time
    delivery_time: orderData.delivery_time || null, // FIXED: Add delivery time
    order_date: new Date().toISOString().split('T')[0],
    order_time: new Date().toTimeString().split(' ')[0],
    created_at: new Date().toISOString(),
    items: orderData.items,
    // Metadata for reopened orders
    is_reopened: orderData.is_reopened || false,
    original_order_id: orderData.original_order_id || null,
    _isOffline: !this.isOnline,
    _isSynced: false
  }

  this.cache.orders.push(order)
  this.saveCacheToStorage()

  if (this.isOnline) {
    await this.syncOrder(order)
  }

  return { order, orderNumber, dailySerial }
}


 async syncOrder(order) {
  try {
    let customerId = order.customer_id
    
    // Handle temp customer
    if (order.customer_id && order.customer_id.toString().startsWith('temp_')) {
      const tempCustomer = Array.from(this.cache.customers.values())
        .find(c => c.id === order.customer_id)

      if (tempCustomer && tempCustomer._isTemp) {
        const { data: realCustomer, error } = await supabase
          .from('customers')
          .insert({
            phone: tempCustomer.phone,
           full_name: tempCustomer.full_name,

            email: tempCustomer.email,
            addressline: tempCustomer.addressline,
            user_id: this.userId
          })
          .select()
          .single()

        if (!error) {
          customerId = realCustomer.id
          this.cache.customers.set(tempCustomer.phone, realCustomer)
        }
      }
    }

    // Validate delivery_boy_id exists if provided
    let deliveryBoyId = order.delivery_boy_id || null
    if (deliveryBoyId) {
      const { data: deliveryBoy, error: deliveryBoyError } = await supabase
        .from('delivery_boys')
        .select('id')
        .eq('id', deliveryBoyId)
        .single()

      if (deliveryBoyError || !deliveryBoy) {
        console.warn(`⚠️ Delivery boy ${deliveryBoyId} not found, setting to null`)
        deliveryBoyId = null
      }
    }

    // Insert order with cashier and session tracking
    const { data: syncedOrder, error: orderError } = await supabase
      .from('orders')
      .insert({
        user_id: order.user_id,
        cashier_id: order.cashier_id, // NEW: Save cashier ID
        session_id: order.session_id, // NEW: Save session ID
        customer_id: customerId,
        order_number: order.order_number,
        order_type: order.order_type,
        subtotal: order.subtotal,
        discount_amount: order.discount_amount,
        discount_percentage: order.discount_percentage,
        delivery_charges: order.delivery_charges || 0, // FIXED: Save delivery charges
        delivery_boy_id: deliveryBoyId, // FIXED: Validated delivery boy ID or null
        table_id: order.table_id || null, // Save table_id for walkin orders
        total_amount: order.total_amount,
        payment_method: order.payment_method,
        payment_status: order.payment_status,
        order_status: order.order_status,
        order_instructions: order.order_instructions,
        takeaway_time: order.takeaway_time, // FIXED: Save takeaway time
        delivery_time: order.delivery_time, // FIXED: Save delivery time
        order_date: order.order_date,
        order_time: order.order_time
      })
      .select()
      .single()

    if (orderError) throw orderError

    // Insert order items
    for (const item of order.items) {
      // DEBUG: Log item being inserted
      if (item.is_deal) {
        console.log('💾 CacheManager - Inserting DEAL item to DB:', {
          product_name: item.product_name,
          is_deal: item.is_deal,
          deal_id: item.deal_id,
          deal_products: item.deal_products
        });
      }

      const { error: itemError } = await supabase
        .from('order_items')
        .insert({
          order_id: syncedOrder.id,
          product_id: item.product_id,
          variant_id: item.variant_id,
          product_name: item.product_name,
          variant_name: item.variant_name,
          base_price: item.base_price,
          variant_price: item.variant_price,
          final_price: item.final_price,
          quantity: item.quantity,
          total_price: item.total_price,
          // FIXED: Add deal-specific fields
          is_deal: item.is_deal || false,
          deal_id: item.deal_id || null,
          deal_products: item.deal_products || null
        })

      if (itemError) throw itemError
    }

    // DISABLED: Inventory deduction now happens in database trigger when order is marked as 'Completed'
    // This prevents double deduction (once on sync, once on completion)
    // The trigger deduct_inventory_on_order_complete() handles both regular products and deals
    console.log(`📦 [Sync] Inventory deduction will happen when order is marked as Completed (via database trigger)`)

    // OLD CODE (commented out):
    // console.log(`📦 [Sync] Processing SILENT inventory deduction for order ${order.order_number}`)
    // const inventoryResult = await this.processInventoryDeduction(order.items, syncedOrder.id)
    //
    // if (inventoryResult.inventoryUpdates.length > 0) {
    //   console.log(`✅ [Sync] Silently updated ${inventoryResult.inventoryUpdates.length} inventory items`)
    // }

    // Log to order_history if this was a reopened order
    if (order.is_reopened && order.original_order_id) {
      console.log(`📝 [Sync] Logging reopened order action`)
      
      // Import authManager dynamically to avoid circular dependencies
      const { authManager } = await import('./authManager')
      
      await authManager.logOrderAction(
        order.original_order_id,
        'reopened_and_synced',
        {
          new_order_number: order.order_number,
          new_order_id: syncedOrder.id
        },
        `Order was reopened and synced as ${order.order_number}`
      )
    }

    order._isSynced = true
    order._syncedAt = new Date().toISOString()
    this.saveCacheToStorage()

    console.log(`✅ Order ${order.order_number} synced successfully with cashier ID: ${order.cashier_id}`)
    return { success: true }

  } catch (error) {
    console.error(`❌ Failed to sync order ${order.order_number}:`, error)
    return { success: false, error: error.message }
  }
}
async fetchAllData() {
  try {
    if (!this.userId) {
      throw new Error('User ID is required to fetch data')
    }

    const startTime = Date.now()

    // Fetch categories, products, customers, deals, and tables in parallel
    const [categoriesResult, productsResult, customersResult, dealsResult, tablesResult] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('user_id', this.userId)
        .order('sort_order'),
      supabase
        .from('products')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('customers')
        .select('*')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false }),
      supabase
        .from('deals')
        .select('*')
        .eq('user_id', this.userId)
        .order('sort_order'),
      supabase
        .from('tables')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('table_number', { ascending: true })
    ])

    if (categoriesResult.error) throw categoriesResult.error
    if (productsResult.error) throw productsResult.error
    if (customersResult.error) throw customersResult.error

    if (dealsResult.error) {
      console.error('❌ [Cache] Error fetching deals:', dealsResult.error)
      // Don't throw, just set empty array
      this.cache.deals = []
    } else {
      this.cache.deals = dealsResult.data || []
      console.log(`📦 [Cache] Raw deals fetched: ${this.cache.deals.length}`)
      if (this.cache.deals.length > 0) {
        console.log('📦 [Cache] Deals:', this.cache.deals)
      }
    }

    // Store tables
    if (tablesResult.error) {
      console.error('❌ [Cache] Error fetching tables:', tablesResult.error)
      this.cache.tables = []
    } else {
      this.cache.tables = tablesResult.data || []
      console.log(`📦 [Cache] Tables fetched: ${this.cache.tables.length}`)
    }

    // Store categories and products
    this.cache.categories = categoriesResult.data || []
    this.cache.products = productsResult.data || []

    // Store customers in cache Map (using phone as key)
    this.cache.customers.clear()
    if (customersResult.data) {
      customersResult.data.forEach(customer => {
        this.cache.customers.set(customer.phone, customer)
      })
      // Also store in localStorage separately for easy access
      localStorage.setItem('pos_customers', JSON.stringify(customersResult.data))
      console.log(`✅ Loaded ${customersResult.data.length} customers`)
    }

    // Fetch variants for all products
    if (this.cache.products.length > 0) {
      const productIds = this.cache.products.map(p => p.id)
      const { data: allVariants, error: variantsError } = await supabase
        .from('product_variants')
        .select('*')
        .in('product_id', productIds)
        .order('sort_order')

      if (variantsError) throw variantsError

      this.cache.variants.clear()
      if (allVariants) {
        allVariants.forEach(variant => {
          if (!this.cache.variants.has(variant.product_id)) {
            this.cache.variants.set(variant.product_id, [])
          }
          this.cache.variants.get(variant.product_id).push(variant)
        })
      }
    }

    // Fetch deal products with flavors for all deals
    if (this.cache.deals.length > 0) {
      console.log(`📦 [Cache] Fetching products for ${this.cache.deals.length} deals`)
      const dealIds = this.cache.deals.map(d => d.id)
      const { data: allDealProducts, error: dealProductsError } = await supabase
        .from('deal_products')
        .select('*')
        .in('deal_id', dealIds)

      if (dealProductsError) {
        console.error('❌ [Cache] Error fetching deal products:', dealProductsError)
        throw dealProductsError
      }

      this.cache.dealProducts.clear()
      if (allDealProducts) {
        console.log(`📦 [Cache] Found ${allDealProducts.length} deal products`)

        // Process each deal product and find matching product + variant
        allDealProducts.forEach(dealProduct => {
          if (!this.cache.dealProducts.has(dealProduct.deal_id)) {
            this.cache.dealProducts.set(dealProduct.deal_id, [])
          }

          // Parse the product name and variant from the deal product
          // Assuming format: "Product Name" with description being "Variant Name"
          const productName = dealProduct.name
          const variantName = dealProduct.description // The variant is stored in description

          // Find the matching product in cache using product_id (preferred) or name
          const matchedProduct = dealProduct.product_id
            ? this.cache.products.find(p => p.id === dealProduct.product_id)
            : this.cache.products.find(p => p.name.toLowerCase() === productName.toLowerCase())

          // Get all variants for this product
          const productVariants = matchedProduct ? this.getProductVariants(matchedProduct.id) : []

          // Find the specific variant price if variant_id is provided
          let variantPrice = null
          if (dealProduct.variant_id && productVariants.length > 0) {
            const matchedVariant = productVariants.find(v => v.id === dealProduct.variant_id)
            variantPrice = matchedVariant ? parseFloat(matchedVariant.price) : null
          }

          // Build deal product with variant info
          const product = {
            ...dealProduct,
            productName: productName,
            variantName: variantName,
            matchedProduct: matchedProduct,
            variants: productVariants,
            variantPrice: variantPrice // Add the actual variant price
          }

          this.cache.dealProducts.get(dealProduct.deal_id).push(product)

          console.log(`📦 [Cache] Deal Product: ${productName}${variantName ? ` (${variantName})` : ''} - Matched: ${!!matchedProduct}, Variant Price: ${variantPrice}`)
        })
      }
    } else {
      console.log('📦 [Cache] No deals found to fetch products for')
    }

    this.cache.lastSync = new Date().toISOString()
    this.cache.sessionLoaded = true
    this.initialized = true

    const endTime = Date.now()
    console.log(`✅ Data loaded in ${endTime - startTime}ms`)
    console.log(`   - Categories: ${this.cache.categories.length}`)
    console.log(`   - Products: ${this.cache.products.length}`)
    console.log(`   - Customers: ${this.cache.customers.size}`)
    console.log(`   - Deals: ${this.cache.deals.length}`)
    console.log(`   - Tables: ${this.cache.tables.length}`)
    console.log(`   - Variants: ${this.cache.variants.size} product(s) with variants`)

  } catch (error) {
    console.error('❌ Error fetching data:', error)
    throw error
  }
}

// Add this method to your cacheManager.js class

async refreshCustomers() {
  try {
    console.log('[CacheManager] Refreshing customers...')
    
    if (!this.userId) {
      throw new Error('User ID is required to fetch customers')
    }

    // Directly fetch from Supabase (no Electron check for customers)
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Update cache
    this.cache.customers.clear()
    if (data) {
      data.forEach(customer => {
        this.cache.customers.set(customer.phone, customer)
      })
      // Update localStorage
      localStorage.setItem('pos_customers', JSON.stringify(data))
      console.log(`✅ [CacheManager] Refreshed ${data.length} customers`)
    }
    
    // Save to main cache storage
    await this.saveCacheToStorage()
    
    return data || []
  } catch (error) {
    console.error('[CacheManager] Error refreshing customers:', error)
    // Don't throw error, just return empty array
    return []
  }
}

// Also add this helper method to get all customers
getAllCustomers() {
  return Array.from(this.cache.customers.values())
}

// Get all cached tables
getAllTables() {
  return this.cache.tables || []
}

// Update table status in cache (for occupied/available changes)
async updateTableStatus(tableId, newStatus) {
  try {
    const tableIndex = this.cache.tables.findIndex(t => t.id === tableId)
    if (tableIndex === -1) {
      console.warn(`[CacheManager] Table ${tableId} not found in cache`)
      return false
    }

    const oldStatus = this.cache.tables[tableIndex].status
    this.cache.tables[tableIndex].status = newStatus
    this.cache.tables[tableIndex].updated_at = new Date().toISOString()

    // Save to localStorage
    await this.saveCacheToStorage()

    console.log(`✅ [CacheManager] Table ${tableId} status updated: ${oldStatus} → ${newStatus}`)

    // Also update in Supabase if online
    if (this.isOnline) {
      const { error } = await supabase
        .from('tables')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', tableId)

      if (error) {
        console.error('[CacheManager] Error updating table in Supabase:', error)
        // Don't throw - cache is already updated, will sync later
      } else {
        console.log(`✅ [CacheManager] Table ${tableId} synced to Supabase`)
      }
    }

    return true
  } catch (error) {
    console.error('[CacheManager] Error updating table status:', error)
    return false
  }
}

// Get table by ID from cache
getTableById(tableId) {
  return this.cache.tables.find(t => t.id === tableId) || null
}

// Refresh tables from database
async refreshTables() {
  try {
    if (!this.userId) {
      throw new Error('User ID is required to fetch tables')
    }

    if (!this.isOnline) {
      console.log('📴 Offline: Using cached tables only')
      return this.getAllTables()
    }

    const { data, error } = await supabase
      .from('tables')
      .select('*')
      .eq('user_id', this.userId)
      .eq('is_active', true)
      .order('table_number', { ascending: true })

    if (error) throw error

    this.cache.tables = data || []
    await this.saveCacheToStorage()
    console.log(`✅ [CacheManager] Refreshed ${this.cache.tables.length} tables`)

    return this.cache.tables
  } catch (error) {
    console.error('[CacheManager] Error refreshing tables:', error)
    return this.getAllTables()
  }
}

  async fetchRecentOrders(daysBack = 30) {
    try {
      if (!this.userId) {
        throw new Error('User ID is required to fetch orders')
      }

      if (!this.isOnline) {
        console.log('📴 Offline: Using cached orders only')
        return this.getAllOrders()
      }

      console.log(`📥 Fetching orders from last ${daysBack} days...`)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - daysBack)
      const startDateStr = startDate.toISOString().split('T')[0]

      const { data, error } = await supabase
        .from('orders')
        .select(`
          *,
          customers (
            id,
            full_name,
            phone,
            email,
            addressline
          ),
          order_items (
            id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            base_price,
            variant_price,
            final_price,
            quantity,
            total_price
          ),
          cashiers!orders_cashier_id_fkey (
            id,
            name,
            email
          ),
          modified_cashier:cashiers!orders_modified_by_cashier_fkey (
            id,
            name
          ),
          delivery_boys (
            id,
            name,
            phone,
            vehicle_type
          )
        `)
        .eq('user_id', this.userId)
        .gte('order_date', startDateStr)
        .order('created_at', { ascending: false })
        .limit(500) // Limit to 500 most recent orders to save memory

      if (error) throw error

      // Mark all fetched orders as synced and rename order_items to items
      const syncedOrders = data.map(order => ({
        ...order,
        items: order.order_items || [], // Rename for consistency with offline orders
        _isSynced: true,
        _isOffline: false
      }))

      // Replace synced orders in cache, keep unsynced ones
      const syncedOrderIds = new Set(data.map(o => o.order_number))
      const unsyncedOrders = this.cache.orders.filter(o => !syncedOrderIds.has(o.order_number) && !o._isSynced)

      this.cache.orders = [...syncedOrders, ...unsyncedOrders]
      await this.saveCacheToStorage()

      console.log(`✅ Loaded ${data.length} orders from database, ${unsyncedOrders.length} offline orders`)

      return this.cache.orders

    } catch (error) {
      console.error('Error fetching orders:', error)
      console.log('⚠️ Using cached orders due to error')
      return this.getAllOrders()
    }
  }

  // ==================== EXPENSE METHODS ====================

  async fetchExpenseData(filters = {}) {
    try {
      if (!this.userId) {
        throw new Error('User ID is required to fetch expenses')
      }

      const { dateFrom, dateTo, categoryFilter, paymentFilter } = filters

      if (!this.isOnline) {
        console.log('📴 Offline: Using cached expense data')
        return this.getFilteredExpenseData(filters)
      }

      // Fetch expenses with categories and subcategories
      let expenseQuery = supabase
        .from('expenses')
        .select(`
          *,
          expense_categories (
            id,
            name
          ),
          expense_subcategories (
            id,
            name
          )
        `)
        .eq('user_id', this.userId)
        .order('expense_date', { ascending: false })

      // Fetch stock history purchases (inventory purchases)
      let stockQuery = supabase
        .from('stock_history')
        .select(`
          *,
          inventory_items (
            id,
            name
          ),
          suppliers (
            id,
            name
          )
        `)
        .eq('user_id', this.userId)
        .eq('transaction_type', 'purchase')
        .order('created_at', { ascending: false })

      // Fetch expense categories
      const categoriesQuery = supabase
        .from('expense_categories')
        .select('*')
        .eq('user_id', this.userId)
        .order('name')

      // Fetch expense subcategories
      const subcategoriesQuery = supabase
        .from('expense_subcategories')
        .select('*')
        .eq('user_id', this.userId)
        .order('name')

      // Execute all queries in parallel
      const [expenseResult, stockResult, categoriesResult, subcategoriesResult] = await Promise.all([
        expenseQuery,
        stockQuery,
        categoriesQuery,
        subcategoriesQuery
      ])

      if (expenseResult.error) throw expenseResult.error
      if (stockResult.error) throw stockResult.error
      if (categoriesResult.error) throw categoriesResult.error
      if (subcategoriesResult.error) throw subcategoriesResult.error

      // Update cache
      this.cache.expenses = expenseResult.data || []
      this.cache.stockHistory = stockResult.data || []
      this.cache.expenseCategories = categoriesResult.data || []
      this.cache.expenseSubcategories = subcategoriesResult.data || []
      await this.saveCacheToStorage()

      console.log(`✅ Loaded ${this.cache.expenses.length} expenses, ${this.cache.stockHistory.length} stock purchases`)

      // Return filtered data
      return this.getFilteredExpenseData(filters)

    } catch (error) {
      console.error('Error fetching expense data:', error)
      console.log('⚠️ Using cached expense data due to error')
      return this.getFilteredExpenseData(filters)
    }
  }

  getFilteredExpenseData(filters = {}) {
    const { dateFrom, dateTo, categoryFilter, paymentFilter } = filters

    // Filter expenses
    let expenses = [...this.cache.expenses]
    if (dateFrom) expenses = expenses.filter(e => e.expense_date >= dateFrom)
    if (dateTo) expenses = expenses.filter(e => e.expense_date <= dateTo)
    if (categoryFilter && categoryFilter !== 'All') {
      expenses = expenses.filter(e => e.category_id === categoryFilter)
    }
    if (paymentFilter && paymentFilter !== 'All') {
      expenses = expenses.filter(e => e.payment_method === paymentFilter)
    }

    // Filter stock history
    let stockPurchases = [...this.cache.stockHistory]
    if (dateFrom) {
      stockPurchases = stockPurchases.filter(s => s.created_at >= `${dateFrom}T00:00:00`)
    }
    if (dateTo) {
      stockPurchases = stockPurchases.filter(s => s.created_at <= `${dateTo}T23:59:59`)
    }

    return {
      expenses,
      stockPurchases,
      expenseCategories: this.cache.expenseCategories,
      expenseSubcategories: this.cache.expenseSubcategories,
      isOffline: !this.isOnline
    }
  }

  getAllExpenses() {
    return this.cache.expenses || []
  }

  getExpenseCategories() {
    return this.cache.expenseCategories || []
  }

  getExpenseSubcategories() {
    return this.cache.expenseSubcategories || []
  }

  getStockHistory() {
    return this.cache.stockHistory || []
  }

  // ==================== END EXPENSE METHODS ====================

  async syncOfflineData() {
    if (this.isSyncing) {
      console.log('⏸️ Sync already in progress, skipping...')
      return { success: false, reason: 'Sync already in progress' }
    }

    if (!this.isOnline) {
      console.log('📡 Device offline, cannot sync')
      return { success: false, reason: 'Device offline' }
    }

    this.isSyncing = true
    console.log('🔄 Starting offline data sync...')

    try {
      // First, sync pending status updates
      const statusUpdateResult = await this.syncPendingStatusUpdates()

      const unsyncedOrders = this.cache.orders.filter(order => !order._isSynced)

      if (unsyncedOrders.length === 0 && statusUpdateResult.successCount === 0) {
        console.log('✅ No orders or status updates to sync')
        this.isSyncing = false
        return { success: true, count: 0, statusUpdates: statusUpdateResult }
      }

      console.log(`📦 Found ${unsyncedOrders.length} unsynced orders:`,
        unsyncedOrders.map(o => o.order_number))

      let successCount = 0
      let failedCount = 0
      const errors = []

      for (const order of unsyncedOrders) {
        console.log(`🔄 Syncing order: ${order.order_number}`)
        const result = await this.syncOrder(order)

        if (result.success) {
          successCount++
          console.log(`✅ Successfully synced: ${order.order_number}`)
        } else {
          failedCount++
          errors.push({ order: order.order_number, error: result.error })
          console.error(`❌ Failed to sync ${order.order_number}:`, result.error)
        }
      }

      console.log(`📊 Sync complete: ${successCount} success, ${failedCount} failed`)

      // Refresh orders from database after sync
      if (successCount > 0) {
        await this.fetchRecentOrders(30)
      }

      return {
        success: failedCount === 0,
        successCount,
        failedCount,
        errors
      }

    } catch (error) {
      console.error('❌ Sync failed with exception:', error)
      return { success: false, error: error.message }
    } finally {
      this.isSyncing = false
    }
  }

  getOfflineOrdersCount() {
    return this.cache.orders.filter(order => !order._isSynced).length
  }

  getAllOrders() {
    return this.cache.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  // Update order status with offline support
  async updateOrderStatus(orderId, newStatus, additionalData = {}) {
    const updateData = {
      order_status: newStatus,
      updated_at: new Date().toISOString(),
      ...additionalData
    }

    // Update local cache first
    const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
    if (orderIndex !== -1) {
      this.cache.orders[orderIndex] = {
        ...this.cache.orders[orderIndex],
        ...updateData
      }
    }

    if (this.isOnline) {
      // Online: Update Supabase directly
      try {
        const { error } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)

        if (error) throw error

        this.saveCacheToStorage()
        return { success: true, isOffline: false }
      } catch (error) {
        console.error('Error updating order status online:', error)
        // Fall back to offline mode if online update fails
        return this.queueStatusUpdateForSync(orderId, updateData)
      }
    } else {
      // Offline: Queue for later sync
      return this.queueStatusUpdateForSync(orderId, updateData)
    }
  }

  // Queue a status update for sync when back online
  queueStatusUpdateForSync(orderId, updateData) {
    // Check if there's already a pending update for this order
    const existingIndex = this.cache.pendingStatusUpdates.findIndex(
      u => u.orderId === orderId
    )

    const pendingUpdate = {
      orderId,
      updateData,
      createdAt: new Date().toISOString(),
      _isSynced: false
    }

    if (existingIndex !== -1) {
      // Replace existing pending update with newer one
      this.cache.pendingStatusUpdates[existingIndex] = pendingUpdate
    } else {
      this.cache.pendingStatusUpdates.push(pendingUpdate)
    }

    this.saveCacheToStorage()
    console.log(`📝 Queued status update for order ${orderId}: ${updateData.order_status}`)

    return { success: true, isOffline: true }
  }

  // Sync pending status updates when back online
  async syncPendingStatusUpdates() {
    const pendingUpdates = this.cache.pendingStatusUpdates.filter(u => !u._isSynced)

    if (pendingUpdates.length === 0) {
      return { success: true, count: 0 }
    }

    console.log(`🔄 Syncing ${pendingUpdates.length} pending status updates...`)

    let successCount = 0
    let failedCount = 0
    const errors = []

    for (const update of pendingUpdates) {
      try {
        const { error } = await supabase
          .from('orders')
          .update(update.updateData)
          .eq('id', update.orderId)

        if (error) throw error

        // Mark as synced
        update._isSynced = true
        successCount++
        console.log(`✅ Synced status update for order ${update.orderId}`)
      } catch (error) {
        failedCount++
        errors.push({ orderId: update.orderId, error: error.message })
        console.error(`❌ Failed to sync status update for ${update.orderId}:`, error)
      }
    }

    // Remove synced updates from the pending list
    this.cache.pendingStatusUpdates = this.cache.pendingStatusUpdates.filter(
      u => !u._isSynced
    )
    this.saveCacheToStorage()

    console.log(`📊 Status update sync complete: ${successCount} success, ${failedCount} failed`)

    return {
      success: failedCount === 0,
      successCount,
      failedCount,
      errors
    }
  }

  // Get count of pending status updates
  getPendingStatusUpdatesCount() {
    return this.cache.pendingStatusUpdates.filter(u => !u._isSynced).length
  }

  generateOrderNumber() {
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0')
    return `ORD${timestamp}${random}`
  }

  /**
   * Enrich order with daily serial number (UI-only field)
   * Call this when displaying orders fetched from database
   */
  enrichOrderWithSerial(order) {
    if (!order || !order.order_number) return order

    // Get or create serial for this order
    const dailySerial = dailySerialManager.getOrCreateSerial(order.order_number)

    return {
      ...order,
      daily_serial: dailySerial
    }
  }

  /**
   * Enrich multiple orders with daily serial numbers
   * Assigns serials in chronological order (oldest first)
   * Only assigns serials to TODAY's orders
   * NOTE: This method is called independently by walk-in, takeaway, and delivery pages
   * So we cannot rely only on the orders passed in - we need to consider ALL today's orders
   */
  enrichOrdersWithSerials(orders) {
    if (!Array.isArray(orders) || orders.length === 0) return orders

    const today = new Date().toISOString().split('T')[0]

    // IMPORTANT: Get existing serial assignments from localStorage
    // This ensures we don't re-assign serials to orders that already have them
    const existingData = dailySerialManager.getStoredData()
    const existingAssignments = existingData && existingData.date === today ? existingData.orderMap : {}

    console.log(`📊 [Serial Assignment] Processing ${orders.length} orders, ${Object.keys(existingAssignments).length} already have serials`)

    // Filter only today's orders for serial assignment
    const todaysOrders = orders.filter(order => {
      const orderDate = order.order_date || (order.created_at ? order.created_at.split('T')[0] : null)
      return orderDate === today
    })

    // Separate orders into those with existing serials and those without
    const ordersWithSerials = todaysOrders.filter(order => existingAssignments[order.order_number])
    const ordersWithoutSerials = todaysOrders.filter(order => !existingAssignments[order.order_number])

    console.log(`  - ${ordersWithSerials.length} already have serials`)
    console.log(`  - ${ordersWithoutSerials.length} need new serials`)

    // Sort orders WITHOUT serials by created_at for chronological assignment
    const sortedNewOrders = [...ordersWithoutSerials].sort((a, b) => {
      const dateA = new Date(a.created_at || a.order_time || 0)
      const dateB = new Date(b.created_at || b.order_time || 0)
      return dateA - dateB
    })

    // Extract order numbers for new orders only
    const orderNumbers = sortedNewOrders
      .filter(order => order && order.order_number)
      .map(order => order.order_number)

    // Batch assign serials ONLY to orders that don't have them yet
    const newAssignments = dailySerialManager.batchAssignSerials(orderNumbers)

    // Combine existing and new assignments
    const allAssignments = { ...existingAssignments, ...newAssignments }

    console.log(`  - Total serials assigned: ${Object.keys(allAssignments).length}`)

    // Enrich all orders - only today's orders get serials
    return orders.map(order => {
      if (!order || !order.order_number) return order

      const orderDate = order.order_date || (order.created_at ? order.created_at.split('T')[0] : null)
      const isToday = orderDate === today

      return {
        ...order,
        daily_serial: isToday ? (allAssignments[order.order_number] || null) : null
      }
    })
  }

  startBackgroundSync() {
    if (typeof window === 'undefined') return
    
    setInterval(async () => {
      if (this.isOnline && !this.isSyncing) {
        const unsyncedCount = this.getOfflineOrdersCount()
        if (unsyncedCount > 0) {
          console.log(`Background sync: ${unsyncedCount} orders pending`)
          await this.syncOfflineData()
        }
      }
    }, 30000)
  }

  async refreshCacheIfStale(maxAgeHours = 1) {
    if (!this.isOnline) return

    const lastSync = this.cache.lastSync ? new Date(this.cache.lastSync) : null
    const now = new Date()
    const ageHours = lastSync ? (now - lastSync) / (1000 * 60 * 60) : Infinity

    if (ageHours > maxAgeHours) {
      await this.fetchAllData()
      await this.saveCacheToStorage()
    }
  }

  clearCache() {
    this.cache = {
      categories: [],
      products: [],
      variants: new Map(),
      customers: new Map(),
      orders: [],
      deals: [],
      dealProducts: new Map(),
      tables: [],
      pendingStatusUpdates: [],
      lastSync: null,
      sessionLoaded: false
    }
    this.userId = null
    this.initialized = false
    this.isFirstLoad = true

    if (typeof window !== 'undefined') {
      localStorage.removeItem('pos_cache')
    }
  }

  getNetworkStatus() {
    return {
      isOnline: this.isOnline,
      unsyncedOrders: this.getOfflineOrdersCount(),
      pendingStatusUpdates: this.getPendingStatusUpdatesCount(),
      lastSync: this.cache.lastSync,
      isSyncing: this.isSyncing
    }
  }

  // 🆕 Calculate Cost of Goods Sold (COGS) for Daily P&L
  async calculateCOGS(orders) {
    console.log(`📊 [COGS] Calculating COGS for ${orders.length} orders`)

    const cogsData = {
      totalCOGS: 0,
      orderDetails: [],
      ingredientBreakdown: new Map()
    }

    try {
      for (const order of orders) {
        if (order.order_status === 'Cancelled') continue

        // === NEW APPROACH: Read COGS from stock_history table ===
        // The database trigger already calculates and stores costs when orders are completed
        const { data: stockHistory, error: stockError } = await supabase
          .from('stock_history')
          .select(`
            *,
            inventory_items (
              id,
              name,
              units (abbreviation)
            )
          `)
          .eq('reference_id', order.id)
          .eq('transaction_type', 'sale')

        if (stockError) {
          console.error(`❌ [COGS] Error fetching stock history for order ${order.order_number}:`, stockError)
          continue
        }

        let orderCOGS = 0
        const orderIngredients = []

        if (stockHistory && stockHistory.length > 0) {
          // Calculate COGS from actual stock history entries
          for (const entry of stockHistory) {
            // quantity is negative for sales, so we need absolute value
            const quantityUsed = Math.abs(parseFloat(entry.quantity || 0))
            const beforeStock = parseFloat(entry.before_stock || 0)
            const afterStock = parseFloat(entry.after_stock || 0)

            // Calculate cost based on stock movement and average cost at time of sale
            // The actual cost is: quantity_used * average_cost_at_time
            // We can derive this from the inventory value change
            const stockChange = Math.abs(beforeStock - afterStock)

            // Get the inventory item to find current average cost
            // (Note: This is the current average cost, ideally we'd store historical cost)
            const { data: inventoryItem } = await supabase
              .from('inventory_items')
              .select('average_cost')
              .eq('id', entry.inventory_item_id)
              .single()

            const averageCost = inventoryItem ? parseFloat(inventoryItem.average_cost || 0) : 0
            const cost = stockChange * averageCost

            orderCOGS += cost
            orderIngredients.push({
              name: entry.inventory_items?.name || 'Unknown',
              quantity: stockChange,
              unit: entry.inventory_items?.units?.abbreviation || '',
              cost: cost
            })

            // Track total ingredient usage
            const ingredientId = entry.inventory_item_id
            if (cogsData.ingredientBreakdown.has(ingredientId)) {
              const existing = cogsData.ingredientBreakdown.get(ingredientId)
              existing.quantity += stockChange
              existing.cost += cost
            } else {
              cogsData.ingredientBreakdown.set(ingredientId, {
                name: entry.inventory_items?.name || 'Unknown',
                quantity: stockChange,
                unit: entry.inventory_items?.units?.abbreviation || '',
                cost: cost
              })
            }
          }

          console.log(`✅ [COGS] Order ${order.order_number}: Rs ${orderCOGS.toFixed(2)} (from ${stockHistory.length} stock movements)`)
        } else {
          console.log(`⚠️ [COGS] No stock history found for order ${order.order_number}`)
        }

        cogsData.totalCOGS += orderCOGS
        cogsData.orderDetails.push({
          orderId: order.id,
          orderNumber: order.order_number,
          revenue: parseFloat(order.total_amount || 0),
          cogs: orderCOGS,
          profit: parseFloat(order.total_amount || 0) - orderCOGS,
          ingredients: orderIngredients
        })
      }

      // Convert Map to array for easier consumption
      cogsData.ingredientBreakdown = Array.from(cogsData.ingredientBreakdown.values())
          const { data: variantIngredients, error } = await supabase
            .from('product_variant_ingredients')
            .select(`
              *,
              inventory_items (
                id,
                name,
                average_cost,
                units (abbreviation)
              ),
              units (abbreviation)
            `)
            .in('variant_id', variantIds)

          if (!error && variantIngredients) {
            for (const orderItem of itemsWithVariants) {
              const itemIngredients = variantIngredients.filter(
                vi => vi.variant_id === orderItem.variant_id
              )

              for (const ingredient of itemIngredients) {
                if (!ingredient.inventory_items) continue

                const recipeQuantity = parseFloat(ingredient.quantity)
                const recipeUnitAbbr = ingredient.units?.abbreviation
                const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                const totalQuantity = recipeQuantityInBaseUnit * orderItem.quantity
                const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                orderCOGS += cost
                orderIngredients.push({
                  name: ingredient.inventory_items.name,
                  quantity: totalQuantity,
                  unit: ingredient.inventory_items.units?.abbreviation,
                  cost: cost
                })

                // Track total ingredient usage
                const ingredientId = ingredient.inventory_item_id
                if (cogsData.ingredientBreakdown.has(ingredientId)) {
                  const existing = cogsData.ingredientBreakdown.get(ingredientId)
                  existing.quantity += totalQuantity
                  existing.cost += cost
                } else {
                  cogsData.ingredientBreakdown.set(ingredientId, {
                    name: ingredient.inventory_items.name,
                    quantity: totalQuantity,
                    unit: ingredient.inventory_items.units?.abbreviation,
                    cost: cost
                  })
                }
              }
            }
          }
        }

        // === Process products WITHOUT variants (base products) ===
        const itemsWithoutVariants = orderItems.filter(item => !item.variant_id && item.product_id && !item.is_deal)
        const productIds = itemsWithoutVariants.map(item => item.product_id)

        if (productIds.length > 0) {
          const { data: productIngredients, error: productError } = await supabase
            .from('product_variant_ingredients')
            .select(`
              *,
              inventory_items (
                id,
                name,
                average_cost,
                units (abbreviation)
              ),
              units (abbreviation)
            `)
            .in('product_id', productIds)
            .is('variant_id', null)

          if (!productError && productIngredients) {
            for (const orderItem of itemsWithoutVariants) {
              const itemIngredients = productIngredients.filter(
                pi => pi.product_id === orderItem.product_id
              )

              for (const ingredient of itemIngredients) {
                if (!ingredient.inventory_items) continue

                const recipeQuantity = parseFloat(ingredient.quantity)
                const recipeUnitAbbr = ingredient.units?.abbreviation
                const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                const totalQuantity = recipeQuantityInBaseUnit * orderItem.quantity
                const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                orderCOGS += cost
                orderIngredients.push({
                  name: ingredient.inventory_items.name,
                  quantity: totalQuantity,
                  unit: ingredient.inventory_items.units?.abbreviation,
                  cost: cost
                })

                // Track total ingredient usage
                const ingredientId = ingredient.inventory_item_id
                if (cogsData.ingredientBreakdown.has(ingredientId)) {
                  const existing = cogsData.ingredientBreakdown.get(ingredientId)
                  existing.quantity += totalQuantity
                  existing.cost += cost
                } else {
                  cogsData.ingredientBreakdown.set(ingredientId, {
                    name: ingredient.inventory_items.name,
                    quantity: totalQuantity,
                    unit: ingredient.inventory_items.units?.abbreviation,
                    cost: cost
                  })
                }
              }
            }
          }
        }

        // === Process ORDER TYPE INGREDIENTS (NEW) ===
        // This adds the cost of order type-specific ingredients (e.g., packaging, extra ingredients)
        const orderType = order.order_type // 'walkin', 'takeaway', 'delivery'

        if (orderType) {
          console.log(`📦 [COGS] Calculating order type ingredients for order ${order.order_number} (Type: ${orderType})`)

          // Get order type ID
          const { data: orderTypeData } = await supabase
            .from('order_types')
            .select('id')
            .eq('code', orderType)
            .single()

          if (orderTypeData) {
            const orderTypeId = orderTypeData.id

            // Process items with variants
            for (const orderItem of itemsWithVariants) {
              const { data: orderTypeIngredients } = await supabase
                .from('product_order_type_ingredients')
                .select(`
                  *,
                  inventory_items (
                    id,
                    name,
                    average_cost,
                    units (abbreviation)
                  ),
                  units (abbreviation)
                `)
                .eq('variant_id', orderItem.variant_id)
                .eq('order_type_id', orderTypeId)

              if (orderTypeIngredients && orderTypeIngredients.length > 0) {
                for (const ingredient of orderTypeIngredients) {
                  if (!ingredient.inventory_items) continue

                  const recipeQuantity = parseFloat(ingredient.quantity)
                  const recipeUnitAbbr = ingredient.units?.abbreviation
                  const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                  const totalQuantity = recipeQuantityInBaseUnit * orderItem.quantity
                  const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                  orderCOGS += cost
                  orderIngredients.push({
                    name: ingredient.inventory_items.name + ' (Order Type)',
                    quantity: totalQuantity,
                    unit: ingredient.inventory_items.units?.abbreviation,
                    cost: cost
                  })

                  // Track total ingredient usage
                  const ingredientId = ingredient.inventory_item_id
                  if (cogsData.ingredientBreakdown.has(ingredientId)) {
                    const existing = cogsData.ingredientBreakdown.get(ingredientId)
                    existing.quantity += totalQuantity
                    existing.cost += cost
                  } else {
                    cogsData.ingredientBreakdown.set(ingredientId, {
                      name: ingredient.inventory_items.name,
                      quantity: totalQuantity,
                      unit: ingredient.inventory_items.units?.abbreviation,
                      cost: cost
                    })
                  }

                  console.log(`✅ [COGS] Added order type ingredient: ${ingredient.inventory_items.name} - Cost: ${cost.toFixed(2)}`)
                }
              }
            }

            // Process items without variants
            for (const orderItem of itemsWithoutVariants) {
              const { data: orderTypeIngredients } = await supabase
                .from('product_order_type_ingredients')
                .select(`
                  *,
                  inventory_items (
                    id,
                    name,
                    average_cost,
                    units (abbreviation)
                  ),
                  units (abbreviation)
                `)
                .eq('product_id', orderItem.product_id)
                .is('variant_id', null)
                .eq('order_type_id', orderTypeId)

              if (orderTypeIngredients && orderTypeIngredients.length > 0) {
                for (const ingredient of orderTypeIngredients) {
                  if (!ingredient.inventory_items) continue

                  const recipeQuantity = parseFloat(ingredient.quantity)
                  const recipeUnitAbbr = ingredient.units?.abbreviation
                  const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                  const totalQuantity = recipeQuantityInBaseUnit * orderItem.quantity
                  const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                  orderCOGS += cost
                  orderIngredients.push({
                    name: ingredient.inventory_items.name + ' (Order Type)',
                    quantity: totalQuantity,
                    unit: ingredient.inventory_items.units?.abbreviation,
                    cost: cost
                  })

                  // Track total ingredient usage
                  const ingredientId = ingredient.inventory_item_id
                  if (cogsData.ingredientBreakdown.has(ingredientId)) {
                    const existing = cogsData.ingredientBreakdown.get(ingredientId)
                    existing.quantity += totalQuantity
                    existing.cost += cost
                  } else {
                    cogsData.ingredientBreakdown.set(ingredientId, {
                      name: ingredient.inventory_items.name,
                      quantity: totalQuantity,
                      unit: ingredient.inventory_items.units?.abbreviation,
                      cost: cost
                    })
                  }

                  console.log(`✅ [COGS] Added order type ingredient: ${ingredient.inventory_items.name} - Cost: ${cost.toFixed(2)}`)
                }
              }
            }
          }
        }

        // === Process deal items ===
        const dealItems = orderItems.filter(item => item.is_deal && item.deal_id)

        for (const dealItem of dealItems) {
          try {
            let dealProducts = []
            if (typeof dealItem.deal_products === 'string') {
              try {
                dealProducts = JSON.parse(dealItem.deal_products)
              } catch (e) {
                continue
              }
            } else if (Array.isArray(dealItem.deal_products)) {
              dealProducts = dealItem.deal_products
            }

            const { data: dealProductsData, error } = await supabase
              .from('deal_products')
              .select('*')
              .eq('deal_id', dealItem.deal_id)

            if (error || !dealProductsData) continue

            for (const dealProduct of dealProductsData) {
              // The deal product name is the actual product name
              // The description is the variant name
              const productName = dealProduct.name
              const variantName = dealProduct.description

              // Find the actual product
              const actualProduct = this.cache.products.find(p =>
                p.name.toLowerCase() === productName.toLowerCase()
              )

              if (!actualProduct) continue

              // If variant specified, find the variant
              let variantId = null
              if (variantName) {
                const variants = this.getProductVariants(actualProduct.id)
                const matchedVariant = variants.find(v =>
                  v.name.toLowerCase() === variantName.toLowerCase()
                )
                if (matchedVariant) variantId = matchedVariant.id
              }

              // Fetch ingredients based on whether it has a variant or not
              let ingredientsData = []

              if (variantId) {
                const { data: variantIngredients } = await supabase
                  .from('product_variant_ingredients')
                  .select(`
                    *,
                    inventory_items (
                      id,
                      name,
                      average_cost
                    ),
                    units (abbreviation)
                  `)
                  .eq('variant_id', variantId)

                if (variantIngredients) ingredientsData = variantIngredients
              } else {
                const { data: productIngredients } = await supabase
                  .from('product_variant_ingredients')
                  .select(`
                    *,
                    inventory_items (
                      id,
                      name,
                      average_cost
                    ),
                    units (abbreviation)
                  `)
                  .eq('product_id', actualProduct.id)
                  .is('variant_id', null)

                if (productIngredients) ingredientsData = productIngredients
              }

              // Process ingredients
              for (const ingredient of ingredientsData) {
                if (!ingredient.inventory_items) continue

                const recipeQuantity = parseFloat(ingredient.quantity)
                const recipeUnitAbbr = ingredient.units?.abbreviation
                const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                const totalQuantity = recipeQuantityInBaseUnit * (dealProduct.quantity || 1) * dealItem.quantity
                const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                orderCOGS += cost
                orderIngredients.push({
                  name: ingredient.inventory_items.name,
                  quantity: totalQuantity,
                  unit: ingredient.units?.abbreviation,
                  cost: cost
                })

                const ingredientId = ingredient.inventory_item_id
                if (cogsData.ingredientBreakdown.has(ingredientId)) {
                  const existing = cogsData.ingredientBreakdown.get(ingredientId)
                  existing.quantity += totalQuantity
                  existing.cost += cost
                } else {
                  cogsData.ingredientBreakdown.set(ingredientId, {
                    name: ingredient.inventory_items.name,
                    quantity: totalQuantity,
                      unit: ingredient.units?.abbreviation,
                      cost: cost
                    })
                  }
                }
              }

              // === Process ORDER TYPE INGREDIENTS for DEAL products ===
              if (orderType) {
                const { data: orderTypeData } = await supabase
                  .from('order_types')
                  .select('id')
                  .eq('code', orderType)
                  .single()

                if (orderTypeData) {
                  const orderTypeId = orderTypeData.id
                  let orderTypeIngredientsData = []

                  if (variantId) {
                    // Deal product has a variant
                    const { data: orderTypeIngredients } = await supabase
                      .from('product_order_type_ingredients')
                      .select(`
                        *,
                        inventory_items (
                          id,
                          name,
                          average_cost,
                          units (abbreviation)
                        ),
                        units (abbreviation)
                      `)
                      .eq('variant_id', variantId)
                      .eq('order_type_id', orderTypeId)

                    if (orderTypeIngredients) orderTypeIngredientsData = orderTypeIngredients
                  } else {
                    // Deal product has no variant (base product)
                    const { data: orderTypeIngredients } = await supabase
                      .from('product_order_type_ingredients')
                      .select(`
                        *,
                        inventory_items (
                          id,
                          name,
                          average_cost,
                          units (abbreviation)
                        ),
                        units (abbreviation)
                      `)
                      .eq('product_id', actualProduct.id)
                      .is('variant_id', null)
                      .eq('order_type_id', orderTypeId)

                    if (orderTypeIngredients) orderTypeIngredientsData = orderTypeIngredients
                  }

                  // Process order type ingredients
                  for (const ingredient of orderTypeIngredientsData) {
                    if (!ingredient.inventory_items) continue

                    const recipeQuantity = parseFloat(ingredient.quantity)
                    const recipeUnitAbbr = ingredient.units?.abbreviation
                    const recipeQuantityInBaseUnit = this.convertToBaseUnit(recipeQuantity, recipeUnitAbbr)
                    const totalQuantity = recipeQuantityInBaseUnit * (dealProduct.quantity || 1) * dealItem.quantity
                    const cost = totalQuantity * parseFloat(ingredient.inventory_items.average_cost || 0)

                    orderCOGS += cost
                    orderIngredients.push({
                      name: ingredient.inventory_items.name + ' (Order Type)',
                      quantity: totalQuantity,
                      unit: ingredient.inventory_items.units?.abbreviation,
                      cost: cost
                    })

                    const ingredientId = ingredient.inventory_item_id
                    if (cogsData.ingredientBreakdown.has(ingredientId)) {
                      const existing = cogsData.ingredientBreakdown.get(ingredientId)
                      existing.quantity += totalQuantity
                      existing.cost += cost
                    } else {
                      cogsData.ingredientBreakdown.set(ingredientId, {
                        name: ingredient.inventory_items.name,
                        quantity: totalQuantity,
                        unit: ingredient.inventory_items.units?.abbreviation,
                        cost: cost
                      })
                    }

                    console.log(`✅ [COGS] Added order type ingredient for DEAL: ${ingredient.inventory_items.name} - Cost: ${cost.toFixed(2)}`)
                  }
                }
              }
          } catch (dealError) {
            console.log(`ℹ️ [COGS] Error processing deal: ${dealError.message}`)
            continue
          }
        }

        cogsData.totalCOGS += orderCOGS
        cogsData.orderDetails.push({
          orderId: order.id,
          orderNumber: order.order_number,
          revenue: parseFloat(order.total_amount || 0),
          cogs: orderCOGS,
          profit: parseFloat(order.total_amount || 0) - orderCOGS,
          ingredients: orderIngredients
        })
      }

      // Convert Map to array for easier consumption
      cogsData.ingredientBreakdown = Array.from(cogsData.ingredientBreakdown.values())
        .sort((a, b) => b.cost - a.cost)

      console.log(`✅ [COGS] Calculation complete: Total COGS = ${cogsData.totalCOGS.toFixed(2)}`)

      return cogsData

    } catch (error) {
      console.error(`❌ [COGS] Calculation error:`, error)
      return cogsData
    }
  }

  // 🆕 Fetch Daily P&L data for a specific date
  async fetchDailyPnL(userId, date) {
    console.log(`📊 [P&L] Fetching Daily P&L for ${date}`)

    try {
      let allOrders = []
      let isOfflineMode = !this.isOnline

      if (this.isOnline) {
        // Online: Fetch from Supabase
        const { data: orders, error } = await supabase
          .from('orders')
          .select(`
            *,
            order_items (*)
          `)
          .eq('user_id', userId)
          .eq('order_date', date)
          .eq('order_status', 'Completed')
          .order('created_at', { ascending: false })

        if (error) throw error

        // Also include unsynced local orders for this date that are Completed
        const localOrders = this.cache.orders.filter(order =>
          order.user_id === userId &&
          order.order_date === date &&
          order.order_status === 'Completed' &&
          !order._isSynced
        )

        allOrders = [...(orders || []), ...localOrders]
      } else {
        // Offline: Use only cached orders
        console.log(`📴 [P&L] Offline mode - using cached orders only`)
        allOrders = this.cache.orders.filter(order =>
          order.user_id === userId &&
          order.order_date === date &&
          order.order_status === 'Completed'
        )
        isOfflineMode = true
      }

      // Calculate revenue
      const totalRevenue = allOrders.reduce((sum, order) =>
        sum + parseFloat(order.total_amount || 0), 0
      )

      // Calculate COGS (only when online, as it requires database queries for ingredient costs)
      let cogsData = {
        totalCOGS: 0,
        orderDetails: [],
        ingredientBreakdown: new Map()
      }

      if (this.isOnline && allOrders.length > 0) {
        cogsData = await this.calculateCOGS(allOrders)
      }

      // Calculate metrics
      const netProfit = totalRevenue - cogsData.totalCOGS
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0

      return {
        date,
        totalRevenue,
        totalCOGS: cogsData.totalCOGS,
        netProfit,
        profitMargin,
        orderCount: allOrders.length,
        orderDetails: cogsData.orderDetails,
        ingredientBreakdown: cogsData.ingredientBreakdown,
        offlineOrderCount: allOrders.filter(o => !o._isSynced || o._isOffline).length,
        isOfflineMode
      }

    } catch (error) {
      console.error(`❌ [P&L] Error fetching Daily P&L:`, error)

      // Fallback to cached orders on error
      const cachedOrders = this.cache.orders.filter(order =>
        order.user_id === userId &&
        order.order_date === date &&
        order.order_status === 'Completed'
      )

      const totalRevenue = cachedOrders.reduce((sum, order) =>
        sum + parseFloat(order.total_amount || 0), 0
      )

      return {
        date,
        totalRevenue,
        totalCOGS: 0,
        netProfit: totalRevenue,
        profitMargin: 100,
        orderCount: cachedOrders.length,
        orderDetails: [],
        ingredientBreakdown: new Map(),
        offlineOrderCount: cachedOrders.length,
        isOfflineMode: true,
        error: error.message
      }
    }
  }
}

export const cacheManager = new CacheManager()
export const useCacheManager = () => cacheManager