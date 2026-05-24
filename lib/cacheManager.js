// lib/cacheManager.js - COMPLETE FILE WITH PROPER UNIT CONVERSION
const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

import { supabase } from './supabase'
import { planManager } from './planManager'
import dailySerialManager from './utils/dailySerialManager'
import { getTodaysBusinessDate, getBusinessDate } from './utils/businessDayUtils'
// Static import to avoid dynamic import failures in packaged Electron builds
// (no circular dep: customerLedgerManager only imports supabase, not cacheManager)
import customerLedgerManager from './customerLedgerManager'

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
      menus: [],
      products: [],
      variants: new Map(),
      customers: new Map(),
      orders: [],
      deals: [],
      dealProducts: new Map(),
      tables: [],
      pendingStatusUpdates: [], // Track offline status updates
      pendingLedgerEntries: [], // Track pending ledger entries (cancellation reversals, etc.)
      pendingExpenseEntries: [], // Track offline expense inserts (e.g. complimentary-order expense)
      expenses: [], // Track expenses for offline mode
      expenseCategories: [], // Track expense categories
      expenseSubcategories: [], // Track expense subcategories
      stockHistory: [], // Track stock history/purchases
      paymentTransactions: new Map(), // Track payment transactions for split payments (orderId -> transactions[])
      orderHistory: new Map(), // Track order history entries (orderId -> history[])
      order_takers: [], // Track order takers list
      delivery_boys: [], // Track delivery boys / riders
      cashiers: [], // Track cashier staff accounts
      paymentAccounts: [], // Track payment accounts (cash, card, etc.)
      lastSync: null,
      sessionLoaded: false,
      defaultDeliveryCharge: { type: 'fixed', value: 0 }
    }

    this.userId = null
    this.initialized = false
    this.isFirstLoad = true

    // Eagerly restore delivery charge default from localStorage so it is available
    // on the very first render — before initializeCache() runs asynchronously.
    if (typeof window !== 'undefined') {
      try {
        const raw = localStorage.getItem('pos_default_delivery_charge')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.value > 0) {
            this.cache.defaultDeliveryCharge = parsed
          }
        }
      } catch {}
    }

    if (typeof window !== 'undefined') {
      // ── Synchronous bootstrap ────────────────────────────────────────────────
      // localStorage.getItem is synchronous. By reading pos_cache here — before
      // any async promise — isReady() returns true on the very first call, so
      // React useState initializers see populated data and never show a spinner.
      try {
        const _raw = localStorage.getItem('pos_cache')
        if (_raw) {
          const _p = JSON.parse(_raw)
          if (_p.categories?.length)    this.cache.categories   = _p.categories
          if (_p.menus?.length)         this.cache.menus        = _p.menus
          if (_p.products?.length)      this.cache.products     = _p.products
          if (_p.deals?.length)         this.cache.deals        = _p.deals
          if (_p.tables?.length)        this.cache.tables       = _p.tables
          if (_p.order_takers?.length)  this.cache.order_takers = _p.order_takers
          if (_p.delivery_boys?.length) this.cache.delivery_boys = _p.delivery_boys
          if (_p.variants?.length)      this.cache.variants     = new Map(_p.variants)
          if (_p.dealProducts?.length)  this.cache.dealProducts = new Map(_p.dealProducts)
          if (_p.defaultDeliveryCharge) this.cache.defaultDeliveryCharge = _p.defaultDeliveryCharge
          this.initialized = _p.initialized || false
        }
      } catch {}
      // ────────────────────────────────────────────────────────────────────────

      // Use navigator.onLine for instant initial state (~0ms).
      // It's not perfect but gives a good starting point.
      this._forceOffline = localStorage.getItem('pos_force_offline') === 'true'
      this.isOnline = this._forceOffline ? false : navigator.onLine
      this.syncQueue = []
      this.isSyncing = false
      this._lastConnectivityCheck = 0 // timestamp of last fetch-based check

      window.addEventListener('online', () => {
        if (this._forceOffline) return
        console.log('🌐 [CacheManager] Browser online event fired')
        this.isOnline = true
        // Verify with a real request before syncing
        this.checkConnectivity().then(online => {
          if (online) this.syncOfflineData()
        })
      })

      window.addEventListener('offline', () => {
        if (this._forceOffline) return
        console.log('📴 [CacheManager] Browser offline event fired')
        this.isOnline = false
      })

      this.loadCacheFromStorage().then(() => {
        if (this.cache.categories.length > 0 || this.cache.products.length > 0) {
          this.initialized = true
          console.log('Cache restored from localStorage on startup')
        }
        // Real connectivity check on startup to confirm navigator.onLine
        this.checkConnectivity()
        // Periodic re-check every 30s — only for self-healing, not for speed
        setInterval(() => this.checkConnectivity(), 30000)
      })
    } else {
      this.isOnline = true
      this.syncQueue = []
      this.isSyncing = false
      this._lastConnectivityCheck = 0
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
    // Ready if we have usable data — don't gate on `initialized` flag
    // which may not be set yet during page transitions
    return this.cache.categories.length > 0 || this.cache.products.length > 0
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
        
        return result.customer
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
      const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
      console.error(`[CacheManager] Error finding customer:`, errorMessage)
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

    // A customer added by name only (no phone) can't be matched by phone —
    // always create a fresh record instead of merging into another no-phone customer.
    if (!String(phoneNumber || '').trim()) {
      if (!customerData) return null
      console.log('[CacheManager] No phone provided — creating a new name-only customer')
      return await this.createNewCustomer('', customerData)
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error(`[CacheManager] ❌ Error in findOrCreateCustomer:`, errorMessage)
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error('[CacheManager] ❌ Error updating customer:', errorMessage)
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error('[CacheManager] ❌ Error creating customer:', errorMessage)
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error('[CacheManager] Error fetching customers:', errorMessage)
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

      // If we already have cached data and this isn't a forced refresh,
      // mark as ready immediately — no need to re-fetch from server.
      if ((this.cache.categories.length > 0 || this.cache.products.length > 0) && !forceRefresh) {
        this.initialized = true
        this.cache.sessionLoaded = true

        // On first load only, do a background refresh to pick up server changes
        // without blocking the UI.
        if (this.isFirstLoad && this.isOnline) {
          this.isFirstLoad = false
          this.fetchAllData().then(() => {
            this.debouncedSave()
            if (this.userId) {
              dailySerialManager.initFromDB(supabase, this.userId).catch(() => {})
            }
            this._downloadProductImages(false)
          }).catch(err => console.warn('Background cache refresh failed:', err))
        }

        return true
      }

      if (this.isOnline && (this.isFirstLoad || forceRefresh)) {
        await this.fetchAllData()
        await this.saveCacheToStorage()
        this.initialized = true
        this.isFirstLoad = false
        this.cache.sessionLoaded = true
        // Seed daily serial counter from DB BEFORE returning so the counter is correct
        // when the first order is placed. This is the blocking first-load path so awaiting is safe.
        if (this.userId) {
          await dailySerialManager.initFromDB(supabase, this.userId).catch(() => {})
        }
        // Download images on first load (no clear) — refresh handles clearFirst=true separately
        if (!forceRefresh) this._downloadProductImages(false)
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
    // Sync user data from database first
    try {
      const { authManager } = await import('./authManager')
      const syncResult = await authManager.syncUserDataFromDatabase()
      if (syncResult.success) {
        console.log('✅ User data synced from database')
        if (syncResult.passwordChanged) {
          console.log('🔑 Password was updated in local storage')
        }
      }
    } catch (error) {
      console.error('❌ Error syncing user data:', error)
    }

    // Then refresh cache data
    await this.initializeCache(true)

    // Re-download all product/deal images (clear old ones first)
    this._downloadProductImages(true)
  }

  // ── Image caching ──────────────────────────────────────────────────────

  // Returns a local URL (served via the embedded HTTP server) if the image has
  // been downloaded, otherwise falls back to the original remote URL.
  getImageUrl(remoteUrl) {
    if (!remoteUrl) return null
    if (typeof window === 'undefined') return remoteUrl
    // Only use locally-cached images in production mode (HTTP server runs on port 3939).
    // In dev mode (port 3000) the local-images route doesn't exist, so always use remote URL.
    if (window.location.port === '3939') {
      try {
        const map      = JSON.parse(localStorage.getItem('pos_image_map') || '{}')
        const filename = map[remoteUrl]
        if (filename) return `http://127.0.0.1:3939/local-images/${filename}`
      } catch (_) {}
    }
    return remoteUrl
  }

  // Download all product and deal images to the Electron userData folder.
  // clearFirst=true  → wipe folder before downloading (used on refresh)
  // clearFirst=false → add without removing existing (used on first load)
  async _downloadProductImages(clearFirst = false) {
    if (typeof window === 'undefined' || !window.electronAPI?.images) return
    // Only cache images in production mode (where the local-images HTTP route exists)
    if (window.location.port !== '3939') return

    try {
      if (clearFirst) {
        await window.electronAPI.images.clearAll()
        localStorage.removeItem('pos_image_map')
      } else {
        // Skip download if images were already cached (avoid re-downloading on every app open)
        const existing = localStorage.getItem('pos_image_map')
        if (existing && Object.keys(JSON.parse(existing)).length > 0) {
          console.log('🖼️ [CacheManager] Images already cached, skipping download')
          return
        }
      }

      const items = []
      for (const p of this.cache.products || []) {
        if (p.image_url) items.push({ id: p.id, url: p.image_url, type: 'product' })
      }
      for (const d of this.cache.deals || []) {
        if (d.image_url) items.push({ id: d.id, url: d.image_url, type: 'deal' })
      }
      if (items.length === 0) return

      console.log(`🖼️ [CacheManager] Downloading ${items.length} product/deal images...`)
      const result = await window.electronAPI.images.downloadAll(items)
      if (result.success) {
        const existing = JSON.parse(localStorage.getItem('pos_image_map') || '{}')
        localStorage.setItem('pos_image_map', JSON.stringify({ ...existing, ...result.mapping }))
        console.log(`🖼️ [CacheManager] ${Object.keys(result.mapping).length} images cached locally`)
      }
    } catch (err) {
      console.warn('🖼️ [CacheManager] Image download failed (non-critical):', err.message)
    }
  }

  _preloadImages() {
    if (typeof window === 'undefined') return
    // Collect the URLs the UI actually renders (local 127.0.0.1:3939 URLs in prod,
    // remote Supabase URLs in dev or before disk cache is populated).
    const urls = new Set()
    for (const p of this.cache.products || []) {
      if (p.image_url) urls.add(this.getImageUrl(p.image_url))
    }
    for (const d of this.cache.deals || []) {
      if (d.image_url) urls.add(this.getImageUrl(d.image_url))
    }
    for (const c of this.cache.categories || []) {
      if (c.image_url) urls.add(this.getImageUrl(c.image_url))
    }
    if (urls.size === 0) return
    console.log(`🖼️ [CacheManager] Preloading ${urls.size} images into browser cache...`)
    // Hold Image refs alive on the singleton so the browser keeps them in memory
    // across route changes — prevents the flicker when navigating dashboard ↔ walkin.
    // decode() forces the browser to fully decode each image into its bitmap buffer so
    // <img> tags render instantly (no blank→pop-in flash) when the user opens any order page.
    this._imageRefs = []
    for (const url of urls) {
      const img = new Image()
      img.src = url
      img.decode().catch(() => {})
      this._imageRefs.push(img)
    }
  }

  resetSession() {
    this.cache.sessionLoaded = false
    this.isFirstLoad = true
    this.saveCacheToStorage()
  }



  // Debounced save — batches rapid writes (order updates, cart changes) into one write
  // after 400ms of inactivity. Call saveCacheToStorage() for immediate writes (offline orders).
  debouncedSave() {
    if (typeof window === 'undefined') return
    clearTimeout(this._saveTimer)
    this._saveTimer = setTimeout(() => this.saveCacheToStorage(), 400)
  }

  async saveCacheToStorage() {
    if (typeof window === 'undefined') return
    clearTimeout(this._saveTimer) // cancel any pending debounced save

    try {
      console.log(`💾 [CacheManager] Saving cache to localStorage:`)
      console.log(`  - ${this.cache.orders.length} orders`)
      console.log(`  - ${this.cache.paymentTransactions.size} orders with payment transactions`)
      console.log(`  - ${this.cache.orderHistory.size} orders with history`)
      console.log(`  - ${this.cache.products.length} products`)

      const cacheData = {
        categories: this.cache.categories,
        menus: this.cache.menus || [],
        products: this.cache.products,
        variants: Array.from(this.cache.variants.entries()),
        customers: Array.from(this.cache.customers.entries()),
        orders: this.cache.orders,
        deals: this.cache.deals,
        dealProducts: Array.from(this.cache.dealProducts.entries()),
        tables: this.cache.tables,
        pendingStatusUpdates: this.cache.pendingStatusUpdates || [],
        pendingLedgerEntries: this.cache.pendingLedgerEntries || [],
        pendingExpenseEntries: this.cache.pendingExpenseEntries || [],
        expenses: this.cache.expenses || [],
        expenseCategories: this.cache.expenseCategories || [],
        paymentTransactions: Array.from(this.cache.paymentTransactions.entries()),
        orderHistory: Array.from(this.cache.orderHistory.entries()),
        expenseSubcategories: this.cache.expenseSubcategories || [],
        stockHistory: this.cache.stockHistory || [],
        order_takers: this.cache.order_takers || [],
        delivery_boys: this.cache.delivery_boys || [],
        cashiers: this.cache.cashiers || [],
        paymentAccounts: this.cache.paymentAccounts || [],
        lastSync: this.cache.lastSync,
        initialized: this.initialized,
        sessionLoaded: this.cache.sessionLoaded,
        userId: this.userId,
        defaultDeliveryCharge: this.cache.defaultDeliveryCharge
      }

      localStorage.setItem('pos_cache', JSON.stringify(cacheData))

      // If any offline/unsynced orders exist, back them up to the configured folder.
      // Runs regardless of current connectivity — folder always keeps the latest copy.
      const hasOfflineOrders = this.cache.orders.some(o => o._isOffline || !o._isSynced)
      if (hasOfflineOrders) {
        this._triggerBackupToFolder()
      }
    } catch (error) {
      console.error('Error saving cache:', error)
    }
  }

  _triggerBackupToFolder() {
    try {
      if (typeof window === 'undefined') return
      if (!window.electronAPI?.backup?.autoSave) return
      const folderPath = localStorage.getItem('pos_backup_folder')
      if (!folderPath) return
      const data = {
        pos_cache: JSON.parse(localStorage.getItem('pos_cache') || '{}'),
        pos_customers: JSON.parse(localStorage.getItem('pos_customers') || '[]'),
        pending_order_changes_sync: JSON.parse(localStorage.getItem('pending_order_changes_sync') || '[]'),
        order_changes: JSON.parse(localStorage.getItem('order_changes') || '{}'),
      }
      // Fire-and-forget — don't block the cache save
      window.electronAPI.backup.autoSave(data, folderPath)
        .then(res => {
          if (res.success) console.log('💾 [Backup] Offline orders backed up to folder')
          else console.warn('⚠️ [Backup] Folder backup failed:', res.error)
        })
        .catch(err => console.warn('⚠️ [Backup] Folder backup error:', err.message))
    } catch (err) {
      console.warn('⚠️ [Backup] _triggerBackupToFolder error:', err.message)
    }
  }

  async loadCacheFromStorage() {
    if (typeof window === 'undefined') return

    try {
      let cacheData = localStorage.getItem('pos_cache')

      // Safety net: if localStorage is empty and we're in Electron, try to restore
      // from the file-system backup. This handles the case where a port change wiped
      // localStorage, or the user moved to a new machine.
      if (!cacheData && this.isElectron() && window.electronAPI?.backup?.loadConfig) {
        console.warn('⚠️ [CacheManager] localStorage empty — attempting auto-restore from backup...')
        try {
          const configResult = await window.electronAPI.backup.loadConfig()
          if (configResult?.folderPath) {
            const restoreResult = await window.electronAPI.backup.restoreFromFolder(configResult.folderPath)
            if (restoreResult?.success && restoreResult.data) {
              const { data } = restoreResult
              // Restore all keys to localStorage so the rest of this function can parse normally
              if (data.pos_cache) {
                localStorage.setItem('pos_cache', JSON.stringify(data.pos_cache))
                cacheData = JSON.stringify(data.pos_cache)
              }
              if (data.pos_customers) localStorage.setItem('pos_customers', JSON.stringify(data.pos_customers))
              if (data.pending_order_changes_sync) localStorage.setItem('pending_order_changes_sync', JSON.stringify(data.pending_order_changes_sync))
              if (data.order_changes) localStorage.setItem('order_changes', JSON.stringify(data.order_changes))
              // Also restore backup folder path to localStorage so backup continues working
              localStorage.setItem('pos_backup_folder', configResult.folderPath)
              const orderCount = data.pos_cache?.orders?.length || 0
              console.log(`✅ [CacheManager] Auto-restored from backup: ${orderCount} orders recovered`)
            } else {
              console.warn('⚠️ [CacheManager] Backup restore failed or no backup found:', restoreResult?.error)
            }
          } else {
            console.warn('⚠️ [CacheManager] No backup folder configured — cannot auto-restore')
          }
        } catch (restoreError) {
          console.warn('⚠️ [CacheManager] Auto-restore error:', restoreError.message)
        }
      }

      if (cacheData) {
        const parsed = JSON.parse(cacheData)

        if (this.userId && parsed.userId && parsed.userId !== this.userId) {
          this.clearCache()
          return
        }

        this.cache.categories = parsed.categories || []
        this.cache.menus = parsed.menus || []
        this.cache.products = parsed.products || []
        this.cache.variants = new Map(parsed.variants || [])
        this.cache.customers = new Map(parsed.customers || [])
        this.cache.orders = parsed.orders || []
        this.cache.deals = parsed.deals || []
        this.cache.dealProducts = new Map(parsed.dealProducts || [])
        this.cache.tables = parsed.tables || []
        this.cache.pendingStatusUpdates = parsed.pendingStatusUpdates || []
        this.cache.pendingLedgerEntries = parsed.pendingLedgerEntries || []
        this.cache.pendingExpenseEntries = parsed.pendingExpenseEntries || []
        this.cache.expenses = parsed.expenses || []
        this.cache.expenseCategories = parsed.expenseCategories || []
        this.cache.expenseSubcategories = parsed.expenseSubcategories || []
        this.cache.stockHistory = parsed.stockHistory || []
        this.cache.paymentTransactions = new Map(parsed.paymentTransactions || [])
        this.cache.orderHistory = new Map(parsed.orderHistory || [])
        this.cache.order_takers = parsed.order_takers || []
        this.cache.delivery_boys = parsed.delivery_boys || []
        this.cache.cashiers = parsed.cashiers || []
        this.cache.paymentAccounts = parsed.paymentAccounts || []
        this.cache.lastSync = parsed.lastSync
        this.initialized = parsed.initialized || false
        this.cache.sessionLoaded = parsed.sessionLoaded || false
        if (parsed.defaultDeliveryCharge) {
          this.cache.defaultDeliveryCharge = parsed.defaultDeliveryCharge
        }

        console.log('📦 [CacheManager] Loaded cache from localStorage:')
        console.log(`  - ${this.cache.orders.length} orders`)
        console.log(`  - ${this.cache.paymentTransactions.size} orders with payment transactions`)
        console.log(`  - ${this.cache.products.length} products`)
      }
    } catch (error) {
      console.error('Error loading cache:', error)
    }
  }

  getCategories() {
    return this.cache.categories
  }

  getOrderTakers() {
    return (this.cache.order_takers || []).filter(ot => ot.is_active !== false)
  }

  getAllDeliveryBoys() {
    return (this.cache.delivery_boys || []).filter(b => b.status !== 'inactive')
  }

  getDefaultDeliveryCharge() {
    const mem = this.cache.defaultDeliveryCharge
    if (mem && mem.value > 0) return mem
    // Fallback to localStorage key (same pattern as pos_default_service_charge)
    // so the value is available instantly even before the in-memory cache initializes.
    try {
      if (typeof window !== 'undefined') {
        const raw = localStorage.getItem('pos_default_delivery_charge')
        if (raw) {
          const parsed = JSON.parse(raw)
          if (parsed && parsed.value > 0) return parsed
        }
      }
    } catch {}
    return { type: 'fixed', value: 0 }
  }

  getMenus() {
    return this.cache.menus || []
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
      console.error(`❌ [Inventory] Process error: ${error.message}`)
      return {
        success: false,
        error: error.message,
        inventoryUpdates
      }
    }
  }

async createOrder(orderData) {
  // Subscription gate — block order taking once the subscription has expired.
  if (planManager.isOrderBlocked && planManager.isOrderBlocked()) {
    const err = new Error('Your BizPOS subscription has expired. Order taking is paused — please renew to continue.')
    err.code = 'SUBSCRIPTION_EXPIRED'
    throw err
  }

  // Check if we're modifying an existing order
  if (orderData.isModifying) {
    console.log('🔄 [CacheManager] Modifying existing order')
    console.log('📋 [CacheManager] existingOrderNumber:', orderData.existingOrderNumber)
    console.log('📋 [CacheManager] existingOrderId:', orderData.existingOrderId)

    // Reload cache from localStorage first (ensures we have latest data)
    if (typeof window !== 'undefined') {
      await this.loadCacheFromStorage()
      console.log('📂 [CacheManager] Cache reloaded, has', this.cache.orders.length, 'orders')
    }

    let existingOrderIndex = -1
    let searchMethod = ''

    // Try to find by order_number first (most reliable)
    if (orderData.existingOrderNumber) {
      existingOrderIndex = this.cache.orders.findIndex(o => o.order_number === orderData.existingOrderNumber)
      searchMethod = 'order_number'
    }

    // Fallback: Try to find by ID if order_number didn't work
    if (existingOrderIndex === -1 && orderData.existingOrderId) {
      existingOrderIndex = this.cache.orders.findIndex(o => o.id === orderData.existingOrderId)
      searchMethod = 'id'
    }

    console.log('📍 [CacheManager] Found at index:', existingOrderIndex, 'using', searchMethod)

    // If still not found, log all available orders for debugging
    if (existingOrderIndex === -1) {
      console.error('❌ [CacheManager] Order NOT found in cache!')
      console.error('📋 [CacheManager] Available orders:', this.cache.orders.map(o => ({
        number: o.order_number,
        id: o.id,
        offline: o._isOffline
      })))
    }

    if (existingOrderIndex >= 0) {
      // Update existing order
      const existingOrder = this.cache.orders[existingOrderIndex]
      // Resolve modifier identity + source for the eventual audit row.
      // Pull from orderData (set by the payment page), then fall back to
      // whatever authManager knows. Stored on the cached order so syncOrder
      // can pass them to modify_order_atomic later — offline or online.
      let modifierUserId = null
      let modifierCashierId = orderData.cashier_id || null
      let modifierName = 'Cashier'
      try {
        const { authManager } = await import('./authManager')
        const currentUser = authManager.getCurrentUser?.()
        const cashier    = authManager.getCashier?.()
        modifierUserId = currentUser?.id || this.userId || null
        modifierCashierId = modifierCashierId || cashier?.id || null
        modifierName = cashier?.name || currentUser?.customer_name || 'Cashier'
      } catch {}

      const updatedOrder = {
        ...existingOrder,
        subtotal: orderData.subtotal,
        discount_amount: orderData.discount_amount || 0,
        discount_percentage: orderData.discount_percentage || 0,
        service_charge_amount: orderData.service_charge_amount || 0,
        service_charge_percentage: orderData.service_charge_percentage || 0,
        delivery_charges: orderData.delivery_charges || 0,
        delivery_boy_id: orderData.delivery_boy_id || null,
        delivery_address: orderData.delivery_address || null,
        table_id: orderData.table_id || null,
        total_amount: orderData.total_amount,
        payment_method: orderData.payment_method,
        payment_status: orderData.payment_status,
        order_status: orderData.order_status,
        order_instructions: orderData.order_instructions || null,
        takeaway_time: orderData.takeaway_time || null,
        delivery_time: orderData.delivery_time || null,
        loyalty_points_redeemed: orderData.loyalty_points_redeemed || 0,
        loyalty_discount_amount: orderData.loyalty_discount_amount || 0,
        items: orderData.items,
        updated_at: new Date().toISOString(),
        modified_by_cashier_id: orderData.cashier_id || null,
        order_taker_id: orderData.order_taker_id !== undefined ? (orderData.order_taker_id || null) : (existingOrder.order_taker_id || null),
        _isSynced: this.isOnline, // Mark as synced only if online
        // Attach pending audit context — syncOrder reads these when calling
        // modify_order_atomic (the RPC writes history + item_changes atomically).
        _pendingDetailedChanges: orderData.detailedChanges || null,
        _pendingModifierUserId:  modifierUserId,
        _pendingModifierCashierId: modifierCashierId,
        _pendingModifierName:    modifierName,
        _pendingModifierSource:  this.isOnline ? 'Desktop POS' : 'Desktop POS (offline sync)',
      }

      // Replace the order in cache
      this.cache.orders[existingOrderIndex] = updatedOrder
      this.saveCacheToStorage()

      // NOTE: we intentionally do NOT call authManager.logOrderAction here
      // anymore. modify_order_atomic (called by syncOrder) writes order_history
      // + order_item_changes inside the same transaction as the item replace.
      // Calling logOrderAction additionally would produce duplicate history
      // rows on sync (one from the RPC, one from syncOfflineHistory pushing
      // the cached entry).

      // If online, sync the update to database
      if (this.isOnline) {
        console.log(`🔄 [CacheManager] Syncing order modifications to database (ONLINE)`)
        await this.syncOrder(updatedOrder)
      } else {
        console.log(`💾 [CacheManager] Order modifications saved to cache (OFFLINE) - will sync when online with atomic history`)
      }

      console.log(`✅ [CacheManager] Order ${existingOrder.order_number} updated successfully`)
      return {
        order: updatedOrder,
        orderNumber: existingOrder.order_number,
        dailySerial: existingOrder.daily_serial
      }
    }

    // Order not found in local cache.
    //
    // IMPORTANT: do NOT silently fall through to creating a new order.
    // That caused a real incident where a cashier reopened a mobile-punched
    // order and clicked Update → a brand new order was created and marked
    // paid while the original stayed untouched (duplicate-paid-order bug).
    // Mobile-created orders are fetched into the desktop orders list directly
    // from the DB and are typically NOT in cacheManager.cache.orders, so the
    // old fall-through hit this case routinely.
    //
    // Instead:
    //   - If online AND we know the existing UUID, call modify_order_atomic
    //     directly against the DB. It writes items + history atomically.
    //   - If offline OR we don't have an existing UUID, throw a clear error
    //     so the cashier sees what happened rather than silently double-booking.
    if (orderData.existingOrderId) {
      if (!this.isOnline) {
        throw new Error(
          `Cannot modify order ${orderData.existingOrderNumber || orderData.existingOrderId}: ` +
          `it is not in local cache and this terminal is offline. ` +
          `Reconnect to the internet and try again. ` +
          `(Refusing to create a new order to prevent duplicate billing.)`
        )
      }

      console.warn(
        `⚠️ [CacheManager] Order ${orderData.existingOrderNumber || orderData.existingOrderId} ` +
        `not in local cache — running direct RPC modify (online fallback, bypasses cache).`
      )

      // Resolve modifier identity for the audit row
      let modifierUserId = this.userId || null
      let modifierCashierId = orderData.cashier_id || null
      let modifierName = 'Cashier'
      try {
        const { authManager } = await import('./authManager')
        const currentUser = authManager.getCurrentUser?.()
        const cashier    = authManager.getCashier?.()
        modifierUserId = currentUser?.id || this.userId || null
        modifierCashierId = modifierCashierId || cashier?.id || null
        modifierName = cashier?.name || currentUser?.customer_name || 'Cashier'
      } catch {}

      // Normalise items to the shape the RPC's INSERT reads from the JSONB.
      // Missing user_id / deal_id / deal_products would otherwise drop deal
      // data and (if user_id is required) break the insert for deal orders.
      const normalizedItems = (orderData.items || []).map(i => ({
        product_id:        i.product_id ?? i.productId ?? null,
        variant_id:        i.variant_id ?? i.variantId ?? null,
        product_name:      i.product_name ?? i.productName,
        variant_name:      i.variant_name ?? i.variantName ?? null,
        base_price:        i.base_price ?? i.basePrice,
        variant_price:     i.variant_price ?? i.variantPrice ?? 0,
        final_price:       i.final_price ?? i.finalPrice,
        quantity:          i.quantity,
        total_price:       i.total_price ?? i.totalPrice,
        is_deal:           i.is_deal ?? i.isDeal ?? false,
        deal_id:           i.deal_id ?? i.dealId ?? null,
        deal_products:     i.deal_products ?? i.dealProducts
          ? (typeof (i.deal_products ?? i.dealProducts) === 'string'
              ? (i.deal_products ?? i.dealProducts)
              : JSON.stringify(i.deal_products ?? i.dealProducts))
          : null,
        item_instructions: i.item_instructions ?? i.instruction ?? null,
        user_id:           i.user_id ?? modifierUserId ?? this.userId ?? null,
      }))

      const { data: rpcResult, error: rpcError } = await supabase.rpc('modify_order_atomic', {
        p_order_id:              orderData.existingOrderId,
        p_expected_order_number: orderData.existingOrderNumber || null,
        p_order_data: {
          order_type:                orderData.order_type,
          customer_id:               orderData.customer_id || null,
          subtotal:                  orderData.subtotal,
          discount_amount:           orderData.discount_amount || 0,
          discount_percentage:       orderData.discount_percentage || 0,
          service_charge_amount:     orderData.service_charge_amount || 0,
          service_charge_percentage: orderData.service_charge_percentage || 0,
          delivery_charges:          orderData.delivery_charges || 0,
          delivery_boy_id:           orderData.delivery_boy_id || null,
          delivery_address:          orderData.delivery_address || null,
          table_id:                  orderData.table_id || null,
          total_amount:              orderData.total_amount,
          payment_method:            orderData.payment_method,
          payment_status:            orderData.payment_status,
          order_status:              orderData.order_status,
          order_instructions:        orderData.order_instructions || null,
          takeaway_time:             orderData.takeaway_time || null,
          delivery_time:             orderData.delivery_time || null,
          loyalty_points_redeemed:   orderData.loyalty_points_redeemed || 0,
          loyalty_discount_amount:   orderData.loyalty_discount_amount || 0,
          order_taker_id:            orderData.order_taker_id || null,
        },
        p_items: normalizedItems,
        p_changes: orderData.detailedChanges || null,
        p_modifier_user_id:    modifierUserId,
        p_modifier_cashier_id: modifierCashierId,
        p_modifier_name:       modifierName,
        p_modifier_source:     'Desktop POS (cache-miss fallback)',
        // The reopen-and-pay flow is the primary caller here. The cashier has
        // already decided to modify this order, so don't let the lock guard
        // reject their action; the interactive caller takes responsibility.
        p_allow_locked:        true,
      })

      if (rpcError) {
        throw new Error(`Failed to modify order via direct RPC: ${rpcError.message}`)
      }
      if (!rpcResult?.success) {
        throw new Error(rpcResult?.message || rpcResult?.error || 'modify_order_atomic returned failure')
      }

      const syncedOrder = rpcResult.order
      // Add the now-known order into cache so future lookups don't repeat this fallback.
      // Use normalizedItems (what we just sent to the DB) rather than the raw input.
      const idx = this.cache.orders.findIndex(o => o.id === syncedOrder.id)
      const cached = { ...syncedOrder, items: normalizedItems, _isSynced: true }
      if (idx >= 0) this.cache.orders[idx] = cached
      else this.cache.orders.push(cached)
      this.saveCacheToStorage()

      console.log(`✅ [CacheManager] Order ${syncedOrder.order_number} modified via direct RPC (order now cached)`)
      return {
        order: syncedOrder,
        orderNumber: syncedOrder.order_number,
        dailySerial: syncedOrder.daily_serial,
      }
    }

    // isModifying was set but no existingOrderId was provided — the caller's
    // reopen state is broken. Don't silently create a new order; refuse.
    throw new Error(
      'Cannot modify order: "isModifying" flag was set but no existingOrderId was provided. ' +
      'This is a reopen-state bug — please close and reopen the order before trying again.'
    )
  }

  // Create new order (ONLINE-FIRST ARCHITECTURE)
  const tempOrderId = `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  const orderNumber = this.generateOrderNumber()

  // Generate daily serial number (UI only, not stored in DB)
  const dailySerial = dailySerialManager.getNextSerial(orderNumber)

  const orderTemplate = {
    id: tempOrderId,
    order_number: orderNumber,
    daily_serial: dailySerial,
    user_id: orderData.user_id,
    cashier_id: orderData.cashier_id || null,
    session_id: orderData.session_id || null,
    customer_id: orderData.customer_id,
    order_type: orderData.order_type,
    order_source: orderData.order_source || 'POS',
    original_order_source: orderData.original_order_source || orderData.order_source || 'POS',
    is_approved: orderData.is_approved !== undefined ? orderData.is_approved : true,
    approved_at: orderData.approved_at || null,
    approved_by_cashier_id: orderData.approved_by_cashier_id || null,
    approval_notes: orderData.approval_notes || null,
    order_taker_id: orderData.order_taker_id || null,
    subtotal: orderData.subtotal,
    discount_amount: orderData.discount_amount || 0,
    discount_percentage: orderData.discount_percentage || 0,
    service_charge_amount: orderData.service_charge_amount || 0,
    service_charge_percentage: orderData.service_charge_percentage || 0,
    delivery_charges: orderData.delivery_charges || 0,
    delivery_boy_id: orderData.delivery_boy_id || null,
    delivery_address: orderData.delivery_address || null,
    table_id: orderData.table_id || null,
    total_amount: orderData.total_amount,
    payment_method: orderData.payment_method,
    payment_status: orderData.payment_status,
    order_status: orderData.order_status,
    order_instructions: orderData.order_instructions || null,
    takeaway_time: orderData.takeaway_time || null,
    delivery_time: orderData.delivery_time || null,
    loyalty_points_redeemed: orderData.loyalty_points_redeemed || 0,
    loyalty_discount_amount: orderData.loyalty_discount_amount || 0,
    order_date: (() => {
      // Use business date so orders created between midnight and business-end-time
      // (e.g. 12:54 AM with a 3 AM cutoff) belong to the correct business day.
      const { startTime, endTime } = dailySerialManager.getBusinessHours()
      return getTodaysBusinessDate(startTime, endTime)
    })(),
    order_time: new Date().toTimeString().split(' ')[0],
    created_at: new Date().toISOString(),
    items: orderData.items,
    is_reopened: orderData.is_reopened || false,
    original_order_id: orderData.original_order_id || null,
    _isOffline: false // Set based on actual result below
  }

  // Instant online/offline decision using navigator.onLine (~0ms)
  // plus our cached isOnline state (confirmed by background checkConnectivity)
  const instantOnline = (typeof navigator !== 'undefined' && navigator.onLine) && this.isOnline

  // ONLINE MODE: Create in Supabase FIRST, cache only if fails
  if (instantOnline) {
    console.log(`🌐 [createOrder] ONLINE - Creating order ${orderNumber} in Supabase first`)

    try {
      // Race syncOrder against a 10-second timeout. syncOrder does multiple DB operations
      // (customer lookup, order insert, items insert, serial RPC) which can take 3-8s on
      // normal connections. Previous 3s timeout was too aggressive.
      const syncResult = await Promise.race([
        this.syncOrder(orderTemplate),
        new Promise((_, reject) => setTimeout(() => reject(new Error('sync_timeout')), 10000))
      ])

      if (syncResult && syncResult.success) {
        console.log(`✅ [createOrder] Order ${orderNumber} created in Supabase with ID: ${syncResult.order.id}`)

        const dbSerial = syncResult.order.daily_serial ?? dailySerial
        const onlineOrder = {
          ...orderTemplate,
          id: syncResult.order.id,
          daily_serial: dbSerial,
          _isSynced: true,
          _syncedAt: new Date().toISOString(),
          _isOffline: false
        }

        return { order: onlineOrder, orderNumber, dailySerial: dbSerial }
      } else {
        console.error(`❌ [createOrder] Supabase failed:`, syncResult?.error)

        const offlineOrder = {
          ...orderTemplate,
          _isSynced: false,
          _syncError: syncResult?.error || 'Supabase sync failed',
          _isOffline: true
        }

        this.cache.orders.push(offlineOrder)
        this.saveCacheToStorage()

        return { order: offlineOrder, orderNumber, dailySerial }
      }
    } catch (error) {
      if (error.message === 'sync_timeout') {
        console.warn(`⏱️ [createOrder] Sync timed out after 10s — caching order for retry`)
        // Do NOT set this.isOnline = false — timeout ≠ offline.
        // checkConnectivity will correct the status in background.
      } else {
        console.error(`❌ [createOrder] Exception:`, error)
        // Real network failure — mark offline so next order skips sync instantly
        this.isOnline = false
      }

      const offlineOrder = {
        ...orderTemplate,
        _isSynced: false,
        _syncError: error.message || 'Exception during sync',
        _isOffline: true
      }

      this.cache.orders.push(offlineOrder)
      this.saveCacheToStorage()

      return { order: offlineOrder, orderNumber, dailySerial }
    }
  } else {
    // OFFLINE MODE: Cache for later sync
    console.log(`📴 [createOrder] OFFLINE - Caching order ${orderNumber}`)

    const offlineOrder = {
      ...orderTemplate,
      _isSynced: false,
      _isOffline: true
    }

    this.cache.orders.push(offlineOrder)
    this.saveCacheToStorage()

    return { order: offlineOrder, orderNumber, dailySerial }
  }
}


 async syncOrder(order) {
  try {
    let customerId = order.customer_id

    // Handle temp_ or local_ customer IDs (created offline / inline)
    if (order.customer_id && (
      order.customer_id.toString().startsWith('temp_') ||
      order.customer_id.toString().startsWith('local_')
    )) {
      const tempCustomer = Array.from(this.cache.customers.values())
        .find(c => c.id === order.customer_id)

      if (tempCustomer) {
        // Try to find existing customer by phone first to avoid duplicates
        let realCustomerId = null
        if (tempCustomer.phone) {
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('phone', tempCustomer.phone)
            .eq('user_id', this.userId)
            .single()
          if (existing?.id) realCustomerId = existing.id
        }

        if (!realCustomerId) {
          const { data: realCustomer, error } = await supabase
            .from('customers')
            .insert({
              phone: tempCustomer.phone,
              full_name: tempCustomer.full_name,
              email: tempCustomer.email || null,
              addressline: tempCustomer.addressline || null,
              user_id: this.userId
            })
            .select()
            .single()

          if (!error) realCustomerId = realCustomer.id
        }

        if (realCustomerId) {
          customerId = realCustomerId
          if (tempCustomer.phone) this.cache.customers.set(tempCustomer.phone, { ...tempCustomer, id: realCustomerId })
        } else {
          // Can't sync customer — set to null so order still syncs
          console.warn(`⚠️ [Sync] Could not sync local customer ${order.customer_id}, proceeding without customer`)
          customerId = null
        }
      } else {
        // Local customer not in cache — null it out so INSERT doesn't fail
        console.warn(`⚠️ [Sync] Local customer ${order.customer_id} not found in cache, setting to null`)
        customerId = null
      }
    }

    // Resolve delivery_boy_id — check local cache first to avoid nulling it out when offline
    let deliveryBoyId = order.delivery_boy_id || null
    if (deliveryBoyId) {
      const cachedBoys = this.cache?.delivery_boys || []
      const inCache = cachedBoys.some(b => b.id === deliveryBoyId)
      if (!inCache && navigator.onLine) {
        const { data: deliveryBoy, error: deliveryBoyError } = await supabase
          .from('delivery_boys')
          .select('id')
          .eq('id', deliveryBoyId)
          .maybeSingle()
        if (deliveryBoyError) {
          console.warn(`⚠️ Could not validate delivery boy ${deliveryBoyId}:`, deliveryBoyError.message)
        } else if (!deliveryBoy) {
          console.warn(`⚠️ Delivery boy ${deliveryBoyId} not found in database, setting to null`)
          deliveryBoyId = null
        }
      }
    }

    // Check if order already exists in database (for updates vs inserts)
    const isValidUUID = (str) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(str)
    }

    let syncedOrder = null
    let wasNewInsert = false

    // Build shared params for modify_order_atomic — used for both the
    // valid-UUID path and the order-number-recovery path below.
    const buildAtomicParams = (targetOrderId) => ({
      p_order_id:              targetOrderId,
      p_expected_order_number: order.order_number,
      p_order_data: {
        order_type:                order.order_type,
        customer_id:               customerId,
        subtotal:                  order.subtotal,
        discount_amount:           order.discount_amount,
        discount_percentage:       order.discount_percentage,
        service_charge_amount:     order.service_charge_amount || 0,
        service_charge_percentage: order.service_charge_percentage || 0,
        delivery_charges:          order.delivery_charges || 0,
        delivery_boy_id:           deliveryBoyId,
        delivery_address:          order.delivery_address || null,
        table_id:                  order.table_id || null,
        total_amount:              order.total_amount,
        payment_method:            order.payment_method,
        payment_status:            order.payment_status,
        order_status:              order.order_status,
        order_instructions:        order.order_instructions,
        takeaway_time:             order.takeaway_time,
        delivery_time:             order.delivery_time,
        loyalty_points_redeemed:   order.loyalty_points_redeemed || 0,
        loyalty_discount_amount:   order.loyalty_discount_amount || 0,
        order_taker_id:            order.order_taker_id || null
      },
      p_items: order.items,
      // Pending change context captured at edit time (createOrder/modify branch).
      // Server-side diff will additionally compute fieldChanges automatically.
      p_changes:             order._pendingDetailedChanges || null,
      p_modifier_user_id:    order._pendingModifierUserId    || order.user_id || this.userId || null,
      p_modifier_cashier_id: order._pendingModifierCashierId || order.modified_by_cashier_id || order.cashier_id || null,
      p_modifier_name:       order._pendingModifierName      || 'Cashier',
      p_modifier_source:     order._pendingModifierSource    || 'Desktop POS (offline sync)',
      // Offline-queued modifications must still be allowed to sync even if the
      // order has become Paid/Completed in the meantime — the cashier already
      // committed to this edit before disconnecting. The lock guard is meant
      // for the interactive path (payment/reopen), which runs online.
      p_allow_locked:        true,
    })

    // If order has a valid UUID, it exists in database - UPDATE it
    if (order.id && isValidUUID(order.id)) {
      console.log(`🔄 [Sync] Updating existing order in database: ${order.id}`)

      // Atomic UPDATE + item replace + order_history + order_item_changes in ONE tx.
      // Replaces the old upsert_order_with_items call which didn't write history —
      // that's what let offline-synced modifications slip past the audit log.
      const { data: modResultA, error: modErrorA } = await supabase.rpc(
        'modify_order_atomic',
        buildAtomicParams(order.id)
      )
      if (modErrorA) throw modErrorA
      if (!modResultA?.success) throw new Error(modResultA?.message || modResultA?.error || 'modify_order_atomic failed')
      syncedOrder = modResultA.order
      console.log(`✅ [Sync] Updated existing order ${order.order_number} atomically (with history)`)

    } else {
      // Order doesn't have a valid UUID, but might already exist in database
      // Check if order with this order_number already exists
      console.log(`🔍 [Sync] Checking if order ${order.order_number} already exists in database`)

      const { data: existingOrder, error: checkError } = await supabase
        .from('orders')
        .select('id')
        .eq('order_number', order.order_number)
        .single()

      if (existingOrder && !checkError) {
        // Order already exists! Update the local cache with the real UUID and use UPDATE logic
        console.log(`⚠️ [Sync] Order ${order.order_number} already exists in database with ID: ${existingOrder.id}`)
        console.log(`🔄 [Sync] Updating existing order instead of inserting`)

        // Update local cache with real UUID
        order.id = existingOrder.id

        // Same atomic RPC path — writes history alongside the item replace.
        const { data: modResultB, error: modErrorB } = await supabase.rpc(
          'modify_order_atomic',
          buildAtomicParams(existingOrder.id)
        )
        if (modErrorB) throw modErrorB
        if (!modResultB?.success) throw new Error(modResultB?.message || modResultB?.error || 'modify_order_atomic failed')
        syncedOrder = modResultB.order
        console.log(`✅ [Sync] Updated existing order ${order.order_number} atomically (with history)`)

      } else {
        // Order doesn't exist in database - INSERT it
        console.log(`📝 [Sync] Inserting new order to database: ${order.order_number}`)

        // Atomic INSERT order + items + serial assignment in one transaction via RPC
        // Handles race condition (duplicate order_number) internally
        const safeUUID = (v) => (v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null
        const { data: insertResult, error: insertError } = await supabase.rpc(
          'insert_new_order_with_items',
          {
            p_order_data: {
              user_id:                   order.user_id,
              cashier_id:                safeUUID(order.cashier_id),
              session_id:                safeUUID(order.session_id),
              customer_id:               safeUUID(customerId),
              order_number:              order.order_number,
              order_type:                order.order_type,
              order_source:              order.order_source || 'POS',
              original_order_source:     order.original_order_source || order.order_source || 'POS',
              is_approved:               order.is_approved !== undefined ? order.is_approved : true,
              approved_at:               order.approved_at || null,
              approved_by_cashier_id:    safeUUID(order.approved_by_cashier_id),
              approval_notes:            order.approval_notes || null,
              subtotal:                  order.subtotal,
              discount_amount:           order.discount_amount,
              discount_percentage:       order.discount_percentage,
              service_charge_amount:     order.service_charge_amount || 0,
              service_charge_percentage: order.service_charge_percentage || 0,
              delivery_charges:          order.delivery_charges || 0,
              delivery_boy_id:           deliveryBoyId,
              delivery_address:          order.delivery_address || null,
              table_id:                  safeUUID(order.table_id),
              total_amount:              order.total_amount,
              payment_method:            order.payment_method,
              payment_status:            order.payment_status,
              order_status:              order.order_status,
              order_instructions:        order.order_instructions,
              takeaway_time:             order.takeaway_time,
              delivery_time:             order.delivery_time,
              loyalty_points_redeemed:   order.loyalty_points_redeemed || 0,
              loyalty_discount_amount:   order.loyalty_discount_amount || 0,
              order_date:                order.order_date,
              order_time:                order.order_time,
              daily_serial:              null,
              order_taker_id:            safeUUID(order.order_taker_id)
            },
            p_items: order.items,
            p_assign_daily_serial: true
          }
        )

        if (insertError) throw insertError
        if (!insertResult?.success) throw new Error(insertResult?.error || 'insert_new_order_with_items failed')

        syncedOrder = insertResult.order
        // If the RPC didn't populate order.id, fetch it by order_number so
        // downstream steps (inventory deduction, cache) have a real UUID.
        if (!syncedOrder?.id) {
          const { data: fetchedRow } = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', order.order_number)
            .single()
          if (fetchedRow?.id) {
            if (!syncedOrder) syncedOrder = {}
            syncedOrder.id = fetchedRow.id
            console.log(`🔑 [Sync] Fetched real order ID after insert: ${syncedOrder.id}`)
          }
        }
        order.id = syncedOrder?.id || order.id

        if (insertResult.daily_serial != null) {
          syncedOrder.daily_serial = insertResult.daily_serial
          dailySerialManager.setSerial(order.order_number, insertResult.daily_serial)
          console.log(`🔢 [Sync] DB serial #${insertResult.daily_serial} assigned to ${order.order_number}${order._isOffline ? ' (was offline)' : ''}`)
        }

        if (insertResult.was_duplicate) {
          console.warn(`⚠️ [Sync] Race condition handled internally for ${order.order_number}`)
        }

        wasNewInsert = true
        console.log(`✅ [Sync] Inserted new order ${order.order_number} atomically`)
      }
    }

    // 🆕 CRITICAL FIX: Deduct inventory for offline orders that were INSERT-ed as Completed.
    // MUST run AFTER order_items are inserted so the SQL function can find the line items.
    // (DB triggers only fire on UPDATE, not INSERT, so manual deduction is required here.)
    if (wasNewInsert && order.order_status === 'Completed') {
      console.log(`📦 [Sync] Deducting inventory for newly inserted Completed order ${order.order_number}`)

      // Get order_type_id (required for inventory deduction)
      let orderTypeId = order.order_type_id

      if (!orderTypeId && order.order_type) {
        console.log(`🔍 [Sync] Looking up order_type_id for: ${order.order_type}`)
        try {
          const { data: orderTypeData, error: lookupError } = await supabase
            .from('order_types')
            .select('id, name, code')
            .eq('code', order.order_type)
            .eq('is_active', true)
            .single()

          if (!lookupError && orderTypeData?.id) {
            orderTypeId = orderTypeData.id
            console.log(`✅ [Sync] Found order_type_id: ${orderTypeId}`)
            await supabase
              .from('orders')
              .update({ order_type_id: orderTypeId })
              .eq('id', syncedOrder.id)
            console.log(`✅ [Sync] Updated order with order_type_id`)
          } else {
            console.error(`❌ [Sync] Failed to lookup order_type_id: code=${order.order_type} error=${lookupError?.message || lookupError?.code || JSON.stringify(lookupError)}`)
          }
        } catch (lookupErr) {
          console.error(`❌ [Sync] Exception looking up order_type_id:`, lookupErr)
        }
      }

      if (orderTypeId && this.userId) {
        console.log(`📦 [Sync] Calling deduct_inventory_for_order: order_id=${syncedOrder?.id} order_type_id=${orderTypeId}`)

        try {
          const { data: deductionResult, error: deductionError } = await supabase.rpc(
            'deduct_inventory_for_order',
            {
              p_order_id: syncedOrder.id,
              p_user_id: this.userId,
              p_order_type_id: orderTypeId
            }
          )

          console.log(`📦 [Sync] Deduction raw result:`, JSON.stringify(deductionResult))

          const hasRealError = deductionError && (deductionError.message || deductionError.code)
          if (hasRealError) {
            console.error(`❌ [Sync] Database deduction RPC error: ${deductionError.message || deductionError.code} (code=${deductionError.code} details=${deductionError.details})`)
            throw deductionError
          } else if (deductionError) {
            // Supabase returned a truthy-but-empty error object — log all keys to diagnose
            console.warn(`⚠️ [Sync] Deduction non-fatal error: msg=${deductionError.message} code=${deductionError.code} keys=${Object.keys(deductionError).join(',')}`)
          }

          if (!deductionError && deductionResult && deductionResult.success) {
            console.log(`✅ [Sync] Successfully deducted inventory: ${deductionResult.deductions_made} items`)
            console.log(`   💰 Total COGS: Rs. ${deductionResult.total_cogs || 0}`)
            const deductedIdx = this.cache.orders.findIndex(o => o.id === syncedOrder.id || o.order_number === order.order_number)
            if (deductedIdx !== -1) this.cache.orders[deductedIdx]._inventoryDeducted = true
            if (deductionResult.warnings && deductionResult.warnings.length > 0) {
              console.warn(`⚠️ [Sync] Warnings:`, deductionResult.warnings)
            }
          } else if (!deductionError) {
            const errorMsg = deductionResult?.error || deductionResult?.message || JSON.stringify(deductionResult) || 'Unknown deduction error'
            console.error(`❌ [Sync] Deduction failed:`, errorMsg)
            if (errorMsg.includes('already deducted')) {
              console.warn(`ℹ️ [Sync] Stock was already deducted (duplicate sync prevented)`)
              const deductedIdx = this.cache.orders.findIndex(o => o.id === syncedOrder.id || o.order_number === order.order_number)
              if (deductedIdx !== -1) this.cache.orders[deductedIdx]._inventoryDeducted = true
            } else {
              console.warn(`⚠️ [Sync] Inventory deduction issue: ${errorMsg}`)
            }
          }
        } catch (inventoryError) {
          console.error(`❌ [Sync] Failed to deduct inventory:`, inventoryError)
          console.warn(`⚠️ [Sync] Order ${order.order_number} synced, but inventory deduction failed`)
        }
      } else {
        console.error(`❌ [Sync] Cannot deduct inventory - Missing:`, {
          orderTypeId: !!orderTypeId,
          userId: !!this.userId,
          orderType: order.order_type
        })
        console.warn(`⚠️ [Sync] Order ${order.order_number} synced without inventory deduction`)
      }

      // 🆕 RACE CONDITION FIX: Remove any pending status update for this order.
      // The INSERT already set status='Completed' and deducted inventory above.
      // If syncPendingStatusUpdates later does UPDATE SET status='Completed', it
      // would fire a double inventory deduction via the DB trigger.
      const beforeLen = this.cache.pendingStatusUpdates.length
      this.cache.pendingStatusUpdates = this.cache.pendingStatusUpdates.filter(
        u => u.orderId !== order.id && u.orderNumber !== order.order_number
      )
      if (this.cache.pendingStatusUpdates.length < beforeLen) {
        console.log(`🧹 [Sync] Cleared pending status update for Completed order ${order.order_number} to prevent double deduction`)
      }
    }

    // CRITICAL FIX: Sync cached payment transactions for split payments
    if (order.payment_method === 'Split') {
      // Store the original order ID before it gets updated
      const originalOrderId = order.id

      console.log(`💳 [Sync] Checking for cached payment transactions for order ${order.order_number}`)
      console.log(`💳 [Sync] Original order ID: ${originalOrderId}`)
      console.log(`💳 [Sync] Synced order ID: ${syncedOrder.id}`)

      const cachedTransactions = this.getPaymentTransactions(originalOrderId)

      if (cachedTransactions && cachedTransactions.length > 0) {
        console.log(`💳 [Sync] Found ${cachedTransactions.length} cached payment transactions for order ${order.order_number}`)
        console.log(`💳 [Sync] Transactions:`, cachedTransactions)

        try {
          // Check if transactions already exist to prevent duplicates
          const { data: existingTx, error: checkError } = await supabase
            .from('order_payment_transactions')
            .select('id')
            .eq('order_id', syncedOrder.id)

          if (checkError) {
            console.error('⚠️ [Sync] Error checking existing payment transactions:', checkError.message)
          } else if (existingTx && existingTx.length > 0) {
            console.log(`ℹ️ [Sync] Payment transactions already exist for order ${order.order_number}, skipping duplicate insert`)
          } else {
            // Prepare transactions with synced order ID and user_id
            const transactionsToInsert = cachedTransactions.map(tx => ({
              order_id: syncedOrder.id,
              user_id: this.userId,
              payment_method: tx.payment_method,
              amount: tx.amount,
              reference_number: tx.reference_number || null,
              notes: tx.notes || null,
              transaction_date: localDateStr(),
              transaction_time: new Date().toTimeString().split(' ')[0],
              recorded_by: order.cashier_id || this.userId || null
            }))

            console.log(`💳 [Sync] Inserting ${transactionsToInsert.length} transactions to database:`, transactionsToInsert)

            // Insert payment transactions
            const { error: insertError } = await supabase
              .from('order_payment_transactions')
              .insert(transactionsToInsert)

            if (insertError) {
              console.error('❌ [Sync] Error inserting payment transactions:', insertError.message)
              console.error('❌ [Sync] Error details:', insertError)
            } else {
              console.log(`✅ [Sync] Successfully synced ${transactionsToInsert.length} payment transactions to database`)

              // CRITICAL: Update cache key if order ID changed (temp ID -> real UUID)
              if (originalOrderId !== syncedOrder.id) {
                console.log(`🔄 [Sync] Updating cache key from ${originalOrderId} to ${syncedOrder.id}`)
                this.cache.paymentTransactions.delete(originalOrderId)
                this.cache.paymentTransactions.set(syncedOrder.id, cachedTransactions)
              }
            }
          }
        } catch (txError) {
          console.error('❌ [Sync] Failed to sync payment transactions:', txError)
          // Don't fail the entire order sync if transactions fail
        }
      } else {
        console.log(`⚠️ [Sync] No cached payment transactions found for split payment order ${order.order_number}`)
        console.log(`⚠️ [Sync] Checked with order ID: ${originalOrderId}`)
        console.log(`⚠️ [Sync] Current cache has ${this.cache.paymentTransactions.size} orders with transactions`)

        // Debug: Log all cached transaction keys
        const cacheKeys = Array.from(this.cache.paymentTransactions.keys())
        console.log(`⚠️ [Sync] Cached transaction keys:`, cacheKeys)
      }
    }

    // Sync loyalty redemption if loyalty was used
    if ((order.loyalty_points_redeemed || 0) > 0 && order.customer_id) {
      console.log(`🎁 [Sync] Syncing loyalty redemption: ${order.loyalty_points_redeemed} points, Rs ${order.loyalty_discount_amount} discount`)

      try {
        // Get customer's current loyalty balance
        const { data: customerPoints, error: fetchError } = await supabase
          .from('customer_loyalty_points')
          .select('current_balance, points_redeemed')
          .eq('customer_id', customerId)
          .eq('user_id', this.userId)
          .single()

        if (fetchError && fetchError.code !== 'PGRST116') {
          console.error('⚠️ [Sync] Error fetching customer loyalty balance:', fetchError.message)
        } else {
          const currentBalance = customerPoints?.current_balance || 0
          const pointsToRedeem = order.loyalty_points_redeemed
          const newBalance = Math.max(0, currentBalance - pointsToRedeem)

          // Update customer's loyalty balance
          const { error: updateError } = await supabase
            .from('customer_loyalty_points')
            .update({
              current_balance: newBalance,
              points_redeemed: (customerPoints?.points_redeemed || 0) + pointsToRedeem,
              last_redeemed_at: new Date().toISOString()
            })
            .eq('customer_id', customerId)
            .eq('user_id', this.userId)

          if (updateError) {
            console.error('⚠️ [Sync] Error updating customer loyalty balance:', updateError.message)
          } else {
            console.log(`✅ [Sync] Updated customer loyalty balance: ${currentBalance} -> ${newBalance}`)
          }

          // Log redemption in loyalty_points_log
          const { error: logError } = await supabase
            .from('loyalty_points_log')
            .insert({
              customer_id: customerId,
              user_id: this.userId,
              order_id: syncedOrder.id,
              transaction_type: 'REDEEMED',
              points: -pointsToRedeem,
              balance_before: currentBalance,
              balance_after: newBalance,
              notes: `Redeemed offline - PKR ${order.loyalty_discount_amount} discount (synced order ${order.order_number})`
            })

          if (logError) {
            console.error('⚠️ [Sync] Error logging loyalty redemption:', logError.message)
          } else {
            console.log(`✅ [Sync] Logged loyalty redemption in loyalty_points_log`)
          }

          // Insert redemption record in loyalty_redemptions
          const { error: redemptionError } = await supabase
            .from('loyalty_redemptions')
            .insert({
              customer_id: customerId,
              user_id: this.userId,
              order_id: syncedOrder.id,
              cashier_id: order.cashier_id || null,
              points_used: pointsToRedeem,
              discount_applied: order.loyalty_discount_amount || 0
            })

          if (redemptionError) {
            console.error('⚠️ [Sync] Error recording loyalty redemption:', redemptionError.message)
          } else {
            console.log(`✅ [Sync] Recorded loyalty redemption in loyalty_redemptions`)
          }
        }
      } catch (loyaltyError) {
        console.error('❌ [Sync] Failed to sync loyalty redemption:', loyaltyError.message)
      }
    }

    // Sync customer account ledger entry if payment method was "Account" with a customer
    // NOTE: "Unpaid" means pay-later in cash - do NOT add to customer ledger
    // NOTE: Do NOT create a debit for cancelled orders (credit reversal is handled by syncPendingLedgerEntries)
    if (order.payment_method === 'Account' && customerId && order.order_status !== 'Cancelled') {
      try {
        // CRITICAL: Check if ledger entry already exists for this order to prevent duplicates
        const { data: existingLedgerEntry } = await supabase
          .from('customer_ledger')
          .select('*')
          .eq('order_id', syncedOrder.id)
          .eq('user_id', this.userId)
          .eq('transaction_type', 'debit')
          .maybeSingle()

        if (existingLedgerEntry) {
          // CRITICAL FIX: Update existing ledger entry if order was modified
          const newDebitAmount = order.total_amount
          if (existingLedgerEntry.amount !== newDebitAmount) {
            console.log(`💳 [Sync] Order was modified - updating ledger entry from Rs ${existingLedgerEntry.amount} to Rs ${newDebitAmount}`)

            // Delete the old ledger entry
            const { error: deleteError } = await supabase
              .from('customer_ledger')
              .delete()
              .eq('id', existingLedgerEntry.id)

            if (deleteError) {
              console.error('⚠️ [Sync] Error deleting old ledger entry:', deleteError.message)
            } else {
              console.log('✅ [Sync] Old ledger entry deleted')

              customerLedgerManager.setUserId(this.userId)

              // Get customer's current balance (after deleting old entry)
              const currentBalance = await customerLedgerManager.getCustomerBalance(customerId)
              const newBalance = currentBalance + newDebitAmount

              // Create new ledger entry with updated amount
              const { error: ledgerError } = await supabase
                .from('customer_ledger')
                .insert({
                  user_id: this.userId,
                  customer_id: customerId,
                  transaction_type: 'debit',
                  amount: newDebitAmount,
                  balance_before: currentBalance,
                  balance_after: newBalance,
                  order_id: syncedOrder.id,
                  description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'WALKIN'} (Modified)`,
                  notes: `Order modified - Updated total: Rs ${order.total_amount}`,
                  created_by: this.userId
                })

              if (ledgerError) {
                console.error('⚠️ [Sync] Error creating updated ledger entry:', ledgerError.message)
              } else {
                console.log(`✅ [Sync] Updated ledger entry created: Rs ${order.total_amount} (Balance: ${currentBalance} -> ${newBalance})`)
                await supabase.from('customers').update({ account_balance: newBalance }).eq('id', customerId)

                // Show notification if this is being called from payment page (online order)
                if (!order._wasOffline && typeof window !== 'undefined') {
                  const { notify } = await import('../components/ui/NotificationSystem')
                  notify.success(`Updated customer account. New balance: Rs ${newBalance.toFixed(2)}`, { duration: 5000 })
                }
              }
            }
          } else {
            console.log(`ℹ️ [Sync] Ledger entry already exists for order ${order.order_number} with same amount, no update needed`)
          }
        } else {
          // Debit the full order total to customer account
          const debitAmount = order.total_amount

          if (debitAmount > 0) {
            console.log(`💳 [Sync] Creating customer ledger entry for Account payment: Rs ${debitAmount}`)

            customerLedgerManager.setUserId(this.userId)

            // Get customer's current balance
            const currentBalance = await customerLedgerManager.getCustomerBalance(customerId)
            const newBalance = currentBalance + debitAmount

            const notes = order._isOffline ? `Synced from offline - ${order.items?.length || 0} items` : `${order.items?.length || 0} items`

            // Create ledger debit entry
            const { error: ledgerError } = await supabase
              .from('customer_ledger')
              .insert({
                user_id: this.userId,
                customer_id: customerId,
                transaction_type: 'debit',
                amount: debitAmount,
                balance_before: currentBalance,
                balance_after: newBalance,
                order_id: syncedOrder.id,
                description: `Order #${order.order_number} - ${order.order_type?.toUpperCase() || 'WALKIN'}`,
                notes,
                created_by: this.userId
              })

            if (ledgerError) {
              console.error('⚠️ [Sync] Error creating customer ledger entry:', ledgerError.message)
            } else {
              console.log(`✅ [Sync] Created customer ledger entry: Rs ${debitAmount} (Balance: ${currentBalance} -> ${newBalance})`)
              await supabase.from('customers').update({ account_balance: newBalance }).eq('id', customerId)

              // Show notification if this is being called from payment page (online order)
              if (!order._wasOffline && typeof window !== 'undefined') {
                const { notify } = await import('../components/ui/NotificationSystem')
                notify.success(`Rs ${debitAmount.toFixed(0)} added to customer account. New balance: Rs ${newBalance.toFixed(0)}`, { duration: 5000 })
              }
            }
          }
        }
      } catch (ledgerError) {
        console.error('❌ [Sync] Failed to create customer ledger entry:', ledgerError.message)
      }
    }

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

    // Update order with real UUID and DB-assigned serial from database
    order.id = syncedOrder.id
    // Propagate the DB-assigned daily_serial back to the in-memory order so the
    // returned syncResult carries the authoritative serial (not the local guess).
    if (syncedOrder.daily_serial != null) {
      order.daily_serial = syncedOrder.daily_serial
    }
    order._isSynced = true
    order._syncedAt = new Date().toISOString()
    // Clear pending audit context now that the RPC has consumed it and written
    // the authoritative order_history row. Leaving these keys on the cached
    // order would cause a re-sync to post them to history a second time.
    delete order._pendingDetailedChanges
    delete order._pendingModifierUserId
    delete order._pendingModifierCashierId
    delete order._pendingModifierName
    delete order._pendingModifierSource
    this.saveCacheToStorage()

    console.log(`✅ Order ${order.order_number} synced successfully with cashier ID: ${order.cashier_id}`)
    console.log(`🔑 Order ID updated from temporary to UUID: ${syncedOrder.id}`)
    return { success: true, order: { id: syncedOrder.id, ...order } }

  } catch (error) {
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error(`❌ Failed to sync order ${order.order_number}:`, errorMessage)
    return { success: false, error: error.message }
  }
}

async syncOfflineHistory() {
  console.log('📝 [Sync] Starting offline history sync...')

  let successCount = 0
  let failedCount = 0
  const errors = []

  try {
    // Get all offline history entries from cache
    const allHistoryEntries = []
    for (const [orderId, historyArray] of this.cache.orderHistory.entries()) {
      const offlineEntries = historyArray.filter(entry => entry._isOffline && !entry._isSynced)
      if (offlineEntries.length > 0) {
        // Find the order to get its order_number (for lookup after ID changes)
        const order = this.cache.orders.find(o => o.id === orderId)
        const orderNumber = order?.order_number || null

        allHistoryEntries.push(...offlineEntries.map(entry => ({
          ...entry,
          orderId,
          order_number: orderNumber // Include order_number so we can find order after sync
        })))
      }
    }

    if (allHistoryEntries.length === 0) {
      console.log('✅ [Sync] No offline history entries to sync')
      return { successCount: 0, failedCount: 0, errors: [] }
    }

    console.log(`📝 [Sync] Found ${allHistoryEntries.length} offline history entries to sync`)

    // Sync each history entry
    for (const entry of allHistoryEntries) {
      try {
        console.log(`🔄 [Sync] Syncing history entry for order ${entry.orderId}`)

        // IMPORTANT: Find the actual order in cache to get its CURRENT ID (which will be a UUID if synced)
        // The entry.orderId might still be the temporary ID, but the order object has been updated
        let order = this.cache.orders.find(o => o.id === entry.orderId || o.order_number === entry.order_number)

        // If order not in cache, it might have been created online
        // Try fetching from database if we're online
        if (!order && navigator.onLine) {
          console.log(`🔍 [Sync] Order not in cache, fetching from database: ${entry.orderId}`)

          try {
            const { data: dbOrder, error: fetchError } = await supabase
              .from('orders')
              .select('id, order_number')
              .or(`id.eq.${entry.orderId},order_number.eq.${entry.order_number}`)
              .single()

            if (!fetchError && dbOrder) {
              console.log(`✅ [Sync] Found order in database: ${dbOrder.id}`)
              order = dbOrder
            } else {
              console.warn(`⚠️ [Sync] Order not found in database either:`, fetchError?.message || 'No data returned')
            }
          } catch (dbError) {
            console.warn(`⚠️ [Sync] Failed to fetch order from database:`, dbError.message)
          }
        }

        if (!order) {
          console.warn(`⚠️ [Sync] Order not found in cache or database for history entry: ${entry.orderId}`)
          console.warn(`⚠️ [Sync] This may be an orphaned history entry - marking as synced to skip future attempts`)

          // Mark this entry as synced so we don't keep trying
          const cachedHistory = this.cache.orderHistory.get(entry.orderId)
          if (cachedHistory) {
            const entryIndex = cachedHistory.findIndex(h => h.id === entry.id)
            if (entryIndex >= 0) {
              cachedHistory[entryIndex]._isSynced = true
              cachedHistory[entryIndex]._skipped = true
              cachedHistory[entryIndex]._skipReason = 'Order not found in cache or database'
              this.cache.orderHistory.set(entry.orderId, cachedHistory)
            }
          }

          failedCount++
          errors.push({ orderId: entry.orderId, error: 'Order not found - orphaned history entry' })
          continue // Skip to next entry
        }

        // Use the order's CURRENT id (which will be a UUID after syncing)
        const currentOrderId = order.id
        console.log(`🔑 [Sync] Using order ID: ${currentOrderId} (was: ${entry.orderId})`)

        // Prepare history data for database
        const historyData = {
          order_id: currentOrderId, // Use the current UUID, not the old temporary ID
          action_type: entry.action_type,
          user_id: entry.user_id,
          cashier_id: entry.cashier_id,
          actor_name: entry.actor_name || null,
          changes: entry.changes,
          notes: entry.notes,
          old_subtotal: entry.old_subtotal,
          new_subtotal: entry.new_subtotal,
          old_total: entry.old_total,
          new_total: entry.new_total,
          price_difference: entry.price_difference,
          created_at: entry.created_at
        }

        // Insert to database
        const { data: syncedHistory, error: historyError } = await supabase
          .from('order_history')
          .insert(historyData)
          .select()
          .single()

        if (historyError) throw historyError

        console.log(`✅ [Sync] History entry synced with ID: ${syncedHistory.id}`)

        // If there are item changes, sync them too
        if (entry.order_item_changes && entry.order_item_changes.length > 0) {
          console.log(`📦 [Sync] Syncing ${entry.order_item_changes.length} item changes`)

          const itemChanges = entry.order_item_changes.map(change => ({
            order_history_id: syncedHistory.id,
            change_type: change.change_type,
            product_name: change.product_name,
            variant_name: change.variant_name || null,
            old_quantity: change.old_quantity || null,
            new_quantity: change.new_quantity || null,
            old_price: change.old_price || null,
            new_price: change.new_price || null,
            old_total: change.old_total || null,
            new_total: change.new_total || null
          }))

          const { error: itemChangesError } = await supabase
            .from('order_item_changes')
            .insert(itemChanges)

          if (itemChangesError) {
            console.error('⚠️ [Sync] Failed to sync item changes:', itemChangesError)
          } else {
            console.log(`✅ [Sync] ${itemChanges.length} item changes synced`)
          }
        }

        // Update the entry in cache to mark as synced
        const cachedHistory = this.cache.orderHistory.get(entry.orderId)
        if (cachedHistory) {
          const entryIndex = cachedHistory.findIndex(h => h.id === entry.id)
          if (entryIndex >= 0) {
            cachedHistory[entryIndex]._isSynced = true
            cachedHistory[entryIndex]._syncedAt = new Date().toISOString()
            cachedHistory[entryIndex].id = syncedHistory.id // Update with real database ID
            this.cache.orderHistory.set(entry.orderId, cachedHistory)
          }
        }

        successCount++
      } catch (error) {
        console.error(`❌ [Sync] Failed to sync history entry:`, error)
        failedCount++
        errors.push({ orderId: entry.orderId, error: error.message })
      }
    }

    // Save updated cache
    this.debouncedSave()

    console.log(`📊 [Sync] History sync complete: ${successCount} success, ${failedCount} failed`)
    return { successCount, failedCount, errors }

  } catch (error) {
    console.error('❌ [Sync] History sync failed with exception:', error)
    return { successCount, failedCount, errors: [...errors, { error: error.message }] }
  }
}

async fetchAllData() {
  try {
    if (!this.userId) {
      throw new Error('User ID is required to fetch data')
    }

    const startTime = Date.now()

    // Fetch categories, products, customers, deals, tables, menus, order_takers, and delivery_boys in parallel
    const [categoriesResult, productsResult, customersResult, dealsResult, tablesResult, menusResult, orderTakersResult, userSettingsResult, deliveryBoysResult, cashiersResult, paymentAccountsResult, expenseCategoriesResult, expenseSubcategoriesResult] = await Promise.all([
      supabase
        .from('categories')
        .select('*')
        .eq('user_id', this.userId)
        .eq('enable_for_pos', true)
        .order('sort_order'),
      supabase
        .from('products')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .eq('enable_for_pos', true)
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
        .eq('is_active', true)
        .eq('enable_for_pos', true)
        .order('sort_order'),
      supabase
        .from('tables')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('table_number', { ascending: true }),
      supabase
        .from('menus')
        .select('*')
        .eq('user_id', this.userId)
        .order('sort_order'),
      supabase
        .from('order_takers')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('users')
        .select('require_order_taker, default_service_charge_type, default_service_charge_value, default_delivery_charge_type, default_delivery_charge_value, require_customer_walkin, require_customer_takeaway, require_customer_delivery, toast_notifications_enabled, show_order_confirmation, auto_print_kitchen_token, auto_print_customer_receipt, use_cashier_drawer')
        .eq('id', this.userId)
        .single(),
      supabase
        .from('delivery_boys')
        .select('id, name, phone, vehicle_type, status')
        .eq('user_id', this.userId)
        .eq('status', 'active')
        .order('name'),
      supabase
        .from('cashiers')
        .select('id, name, phone, is_active')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('name'),
      supabase
        .from('payment_accounts')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('expense_categories')
        .select('id, name, description')
        .eq('user_id', this.userId)
        .order('name'),
      supabase
        .from('expense_subcategories')
        .select('id, name, category_id')
        .eq('user_id', this.userId)
        .order('name')
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

    // Store menus
    if (menusResult.error) {
      console.error('❌ [Cache] Error fetching menus:', menusResult.error)
      this.cache.menus = []
    } else {
      this.cache.menus = menusResult.data || []
      console.log(`📦 [Cache] Menus fetched: ${this.cache.menus.length}`)
    }

    // Store order_takers
    if (orderTakersResult.error) {
      console.error('❌ [Cache] Error fetching order_takers:', orderTakersResult.error)
      this.cache.order_takers = []
    } else {
      this.cache.order_takers = orderTakersResult.data || []
      console.log(`📦 [Cache] Order takers fetched: ${this.cache.order_takers.length}`)
    }

    // Store delivery_boys
    if (deliveryBoysResult && !deliveryBoysResult.error) {
      this.cache.delivery_boys = deliveryBoysResult.data || []
      console.log(`📦 [Cache] Delivery boys fetched: ${this.cache.delivery_boys.length}`)
    } else {
      this.cache.delivery_boys = this.cache.delivery_boys || []
    }

    // Store cashiers
    if (cashiersResult && !cashiersResult.error) {
      this.cache.cashiers = cashiersResult.data || []
      console.log(`📦 [Cache] Cashiers fetched: ${this.cache.cashiers.length}`)
    } else {
      this.cache.cashiers = this.cache.cashiers || []
    }

    // Store payment accounts (all active accounts for this user)
    if (paymentAccountsResult && !paymentAccountsResult.error) {
      this.cache.paymentAccounts = paymentAccountsResult.data || []
      console.log(`📦 [Cache] Payment accounts fetched: ${this.cache.paymentAccounts.length}`)
    } else {
      this.cache.paymentAccounts = this.cache.paymentAccounts || []
    }

    // Store expense categories and subcategories
    if (expenseCategoriesResult && !expenseCategoriesResult.error) {
      this.cache.expenseCategories = expenseCategoriesResult.data || []
      console.log(`📦 [Cache] Expense categories fetched: ${this.cache.expenseCategories.length}`)
    } else {
      this.cache.expenseCategories = this.cache.expenseCategories || []
    }
    if (expenseSubcategoriesResult && !expenseSubcategoriesResult.error) {
      this.cache.expenseSubcategories = expenseSubcategoriesResult.data || []
      console.log(`📦 [Cache] Expense subcategories fetched: ${this.cache.expenseSubcategories.length}`)
    } else {
      this.cache.expenseSubcategories = this.cache.expenseSubcategories || []
    }

    // Store require_order_taker and default_service_charge settings to localStorage
    if (!userSettingsResult.error && userSettingsResult.data) {
      const requireOrderTaker = userSettingsResult.data.require_order_taker || false
      if (typeof window !== 'undefined') {
        localStorage.setItem('pos_require_order_taker', JSON.stringify(requireOrderTaker))
        const scType = userSettingsResult.data.default_service_charge_type || 'percentage'
        const scValue = parseFloat(userSettingsResult.data.default_service_charge_value) || 0
        localStorage.setItem('pos_default_service_charge', JSON.stringify({ type: scType, value: scValue }))
        const dcType = userSettingsResult.data.default_delivery_charge_type || 'fixed'
        const dcValue = parseFloat(userSettingsResult.data.default_delivery_charge_value) || 0
        this.cache.defaultDeliveryCharge = { type: dcType, value: dcValue }
        localStorage.setItem('pos_default_delivery_charge', JSON.stringify({ type: dcType, value: dcValue }))

        // Per-order-type "require customer" flags — enforced by walkin/takeaway/
        // delivery/new-order pages. Defaults match server defaults: delivery=true
        // (needs address/contact), walkin/takeaway=false.
        const requireCustomer = {
          walkin:   !!userSettingsResult.data.require_customer_walkin,
          takeaway: !!userSettingsResult.data.require_customer_takeaway,
          delivery: userSettingsResult.data.require_customer_delivery !== false,
        }
        localStorage.setItem('pos_require_customer', JSON.stringify(requireCustomer))
        console.log(`📦 [Cache] require_customer:`, requireCustomer)

        // POS-wide toast notifications flag. Default true (show toasts) so a
        // missing column on an older row still shows notifications.
        const toastsEnabled = userSettingsResult.data.toast_notifications_enabled !== false
        localStorage.setItem('pos_toast_enabled', JSON.stringify(toastsEnabled))
        console.log(`📦 [Cache] toast_notifications_enabled: ${toastsEnabled}`)

        // POS order behavior settings
        const showOrderConf = userSettingsResult.data.show_order_confirmation !== false
        localStorage.setItem('pos_show_order_confirmation', JSON.stringify(showOrderConf))
        const autoPrintKitchen = !!userSettingsResult.data.auto_print_kitchen_token
        localStorage.setItem('pos_auto_print_kitchen', JSON.stringify(autoPrintKitchen))
        const autoPrintReceipt = !!userSettingsResult.data.auto_print_customer_receipt
        localStorage.setItem('pos_auto_print_receipt', JSON.stringify(autoPrintReceipt))
        console.log(`📦 [Cache] order behavior: popup=${showOrderConf}, kitchen=${autoPrintKitchen}, receipt=${autoPrintReceipt}`)

        // Cashier drawer system toggle
        const cashierDrawerEnabled = !!userSettingsResult.data.use_cashier_drawer
        localStorage.setItem('pos_cashier_drawer_enabled', JSON.stringify(cashierDrawerEnabled))
        console.log(`📦 [Cache] use_cashier_drawer: ${cashierDrawerEnabled}`)
      }
      console.log(`📦 [Cache] require_order_taker: ${requireOrderTaker}, default_service_charge: ${userSettingsResult.data.default_service_charge_value}`)
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

    // Fetch variants and deal_products in parallel (both depend on the first Promise.all)
    const productIds = this.cache.products.map(p => p.id)
    const dealIds = this.cache.deals.map(d => d.id)

    const [variantsRes, dealProductsRes] = await Promise.all([
      productIds.length > 0
        ? supabase.from('product_variants').select('*').in('product_id', productIds).order('sort_order')
        : Promise.resolve({ data: [], error: null }),
      dealIds.length > 0
        ? supabase.from('deal_products').select('*').in('deal_id', dealIds)
        : Promise.resolve({ data: [], error: null }),
    ])

    if (variantsRes.error) throw variantsRes.error
    this.cache.variants.clear()
    if (variantsRes.data?.length) {
      variantsRes.data.forEach(variant => {
        if (!this.cache.variants.has(variant.product_id)) {
          this.cache.variants.set(variant.product_id, [])
        }
        this.cache.variants.get(variant.product_id).push(variant)
      })
    }

    const allDealProducts = dealProductsRes.data || []
    const dealProductsError = dealProductsRes.error
    if (dealProductsError) {
      console.error('❌ [Cache] Error fetching deal products:', dealProductsError)
      throw dealProductsError
    }

    if (this.cache.deals.length > 0) {
      console.log(`📦 [Cache] Fetching products for ${this.cache.deals.length} deals`)

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
        })
      }
    }

    this.cache.lastSync = new Date().toISOString()
    this.cache.sessionLoaded = true
    this.initialized = true

    // Warm the browser HTTP cache so images appear instantly on page navigation
    this._preloadImages()

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

    // Skip refresh if offline
    if (!this.isOnline) {
      console.log('📴 [CacheManager] Offline - skipping customer refresh, using cached customers')
      return Array.from(this.cache.customers.values())
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'

    // Only log as error if it's not a network/fetch error (which is expected when offline)
    if (errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError')) {
      console.log('📴 [CacheManager] Network unavailable - using cached customers')
    } else {
      console.error('[CacheManager] Error refreshing customers:', errorMessage)
    }

    // Return cached customers instead of empty array
    return Array.from(this.cache.customers.values())
  }
}

// Also add this helper method to get all customers
getAllCustomers() {
  return Array.from(this.cache.customers.values())
}

// Update a single customer's fields in the local cache
updateCustomerInCache(customerId, fields) {
  const existing = this.cache.customers.get(customerId)
  if (existing) {
    this.cache.customers.set(customerId, { ...existing, ...fields })
  }
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
    this.debouncedSave()

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
        const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
        console.error('[CacheManager] Error updating table in Supabase:', errorMessage)
        // Don't throw - cache is already updated, will sync later
      } else {
        console.log(`✅ [CacheManager] Table ${tableId} synced to Supabase`)
      }
    }

    return true
  } catch (error) {
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error('[CacheManager] Error updating table status:', errorMessage)
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
    const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
    console.error('[CacheManager] Error refreshing tables:', errorMessage)
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
            total_price,
            is_deal,
            deal_id,
            deal_products,
            item_instructions
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

      // Fetch payment transactions for split payment orders
      const splitOrders = syncedOrders.filter(order => order.payment_method === 'Split')
      if (splitOrders.length > 0) {
        console.log(`💳 Fetching payment transactions for ${splitOrders.length} split payment orders...`)

        // Fetch all transactions in one query for efficiency
        const splitOrderIds = splitOrders.map(o => o.id)
        const { data: transactions, error: txError } = await supabase
          .from('order_payment_transactions')
          .select('*')
          .in('order_id', splitOrderIds)
          .order('created_at', { ascending: true })

        if (!txError && transactions) {
          // Group transactions by order_id
          const txByOrder = transactions.reduce((acc, tx) => {
            if (!acc[tx.order_id]) acc[tx.order_id] = []
            acc[tx.order_id].push(tx)
            return acc
          }, {})

          // Cache transactions for each order
          splitOrders.forEach(order => {
            const orderTx = txByOrder[order.id] || []
            if (orderTx.length > 0) {
              this.cache.paymentTransactions.set(order.id, orderTx)
            }
          })

          console.log(`✅ Cached payment transactions for ${Object.keys(txByOrder).length} orders`)
        }
      }

      // Replace synced orders in cache, keep unsynced ones
      const syncedOrderIds = new Set(data.map(o => o.order_number))
      const unsyncedOrders = this.cache.orders.filter(o => !syncedOrderIds.has(o.order_number) && !o._isSynced)

      this.cache.orders = [...syncedOrders, ...unsyncedOrders]
      this.debouncedSave()

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

  /**
   * Real connectivity check — does an actual HTTP request.
   *
   * Strategy:
   *  - navigator.onLine gives instant (~0ms) feedback for UI/decisions
   *  - This method does a real fetch to confirm actual internet access
   *  - Called on startup, on 'online' event, and every 30s as background self-heal
   *  - NOT called in hot paths (createOrder uses navigator.onLine directly)
   */
  async checkConnectivity() {
    if (this._forceOffline) {
      this.isOnline = false
      return false
    }
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (!supabaseUrl) {
      this.isOnline = false
      return false
    }

    const doFetch = async () => {
      const res = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'HEAD',
        cache: 'no-store',
      })
      return res.ok || res.status < 500
    }

    // If the OS reports we're online, allow one retry before declaring offline.
    // This handles slow DNS / TLS handshake on startup without any hardcoded timer.
    const maxAttempts = (typeof navigator !== 'undefined' && navigator.onLine) ? 2 : 1
    let online = false

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        online = await doFetch()
        break
      } catch {
        if (attempt < maxAttempts - 1) continue
        online = false
      }
    }

    const wasOnline = this.isOnline
    this.isOnline = online
    this._lastConnectivityCheck = Date.now()

    if (!wasOnline && this.isOnline) {
      console.log('🌐 [CacheManager] Connectivity confirmed — syncing offline data')
      this.syncOfflineData()
    }
    return this.isOnline
  }

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
      // First, sync user data from database
      try {
        const { authManager } = await import('./authManager')
        const userSyncResult = await authManager.syncUserDataFromDatabase()
        if (userSyncResult.success) {
          console.log('✅ User data synced from database')
          if (userSyncResult.passwordChanged) {
            console.log('🔑 Password was updated in local storage')
          }
        }
      } catch (error) {
        console.error('❌ Error syncing user data:', error)
      }

      const unsyncedOrders = this.cache.orders.filter(order => !order._isSynced)
      const pendingLedger = (this.cache.pendingLedgerEntries || []).length
      const pendingExpenses = (this.cache.pendingExpenseEntries || []).length

      if (unsyncedOrders.length === 0 && pendingLedger === 0 && pendingExpenses === 0) {
        console.log('✅ No orders, ledger, or expense entries to sync')
        this.isSyncing = false
        return { success: true, count: 0 }
      }

      if (unsyncedOrders.length === 0 && (pendingLedger > 0 || pendingExpenses > 0)) {
        // Only ledger / expense entries to sync — skip straight to them
        if (pendingLedger > 0) {
          const ledgerResult = await this.syncPendingLedgerEntries()
          if (ledgerResult.successCount > 0 || ledgerResult.failedCount > 0) {
            console.log(`💳 Ledger sync: ${ledgerResult.successCount} synced, ${ledgerResult.failedCount} failed`)
          }
        }
        if (pendingExpenses > 0) {
          const expenseResult = await this.syncPendingExpenseEntries()
          if (expenseResult.successCount > 0 || expenseResult.failedCount > 0) {
            console.log(`💰 Expense sync: ${expenseResult.successCount} synced, ${expenseResult.failedCount} failed`)
          }
        }
        this.isSyncing = false
        return { success: true, count: 0 }
      }

      console.log(`📦 Found ${unsyncedOrders.length} unsynced orders:`,
        unsyncedOrders.map(o => o.order_number))

      let successCount = 0
      let failedCount = 0
      const errors = []

      // IMPORTANT: Sync orders FIRST so temporary IDs get replaced with real UUIDs
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

      console.log(`📊 Order sync complete: ${successCount} success, ${failedCount} failed`)

      // Refresh orders from database after sync to get the real UUIDs
      if (successCount > 0) {
        await this.fetchRecentOrders(30)
      }

      // NOW sync pending status updates AFTER orders have been synced and have real UUIDs
      const statusUpdateResult = await this.syncPendingStatusUpdates()
      console.log(`📝 Status update sync: ${statusUpdateResult.successCount} synced, ${statusUpdateResult.failedCount} failed`)

      // Sync pending ledger entries (cancellation reversals queued while offline)
      const ledgerResult = await this.syncPendingLedgerEntries()
      if (ledgerResult.successCount > 0 || ledgerResult.failedCount > 0) {
        console.log(`💳 Ledger sync: ${ledgerResult.successCount} synced, ${ledgerResult.failedCount} failed`)
      }

      // Sync pending expense entries (complimentary-order expenses queued while offline)
      const expenseResult = await this.syncPendingExpenseEntries()
      if (expenseResult.successCount > 0 || expenseResult.failedCount > 0) {
        console.log(`💰 Expense sync: ${expenseResult.successCount} synced, ${expenseResult.failedCount} failed`)
      }

      // Finally sync offline history entries AFTER orders have been synced and have real UUIDs
      const historyResult = await this.syncOfflineHistory()
      console.log(`📝 History sync: ${historyResult.successCount} synced, ${historyResult.failedCount} failed`)

      // Sync pending order item changes
      try {
        const { syncPendingChanges } = await import('./utils/orderChangesTracker')
        const changesResult = await syncPendingChanges()
        if (changesResult.success) {
          console.log(`📝 Order changes sync: ${changesResult.synced}/${changesResult.total} synced`)
        }
      } catch (error) {
        console.error('❌ Error syncing order changes:', error)
      }

      // Sync pending loyalty points awards/redemptions (queued while offline)
      try {
        const { default: loyaltyManager } = await import('./loyaltyManager')
        const loyaltyResult = await loyaltyManager.syncPendingLoyalty()
        if (loyaltyResult.synced > 0) {
          console.log(`🎁 Loyalty sync: ${loyaltyResult.synced}/${loyaltyResult.total} entries synced`)
        }
      } catch (error) {
        console.error('❌ Error syncing loyalty points:', error)
      }

      // Refresh order_takers and require_order_taker setting after coming back online
      // so any changes made in admin while POS was offline are picked up immediately
      try {
        await this.refreshOrderTakerSettings()
      } catch (error) {
        console.warn('⚠️ [Sync] Could not refresh order taker settings:', error.message)
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

  async refreshOrderTakerSettings() {
    if (!this.userId) return
    try {
      const [orderTakersResult, userSettingsResult, deliveryBoysRefreshResult] = await Promise.all([
        supabase
          .from('order_takers')
          .select('*')
          .eq('user_id', this.userId)
          .eq('is_active', true)
          .order('name'),
        supabase
          .from('users')
          .select('require_order_taker, default_service_charge_type, default_service_charge_value, default_delivery_charge_type, default_delivery_charge_value, require_customer_walkin, require_customer_takeaway, require_customer_delivery, toast_notifications_enabled, show_order_confirmation, auto_print_kitchen_token, auto_print_customer_receipt, use_cashier_drawer')
          .eq('id', this.userId)
          .single(),
        supabase
          .from('delivery_boys')
          .select('id, name, phone, vehicle_type, status')
          .eq('user_id', this.userId)
          .eq('status', 'active')
          .order('name')
      ])
      if (!orderTakersResult.error) {
        this.cache.order_takers = orderTakersResult.data || []
        if (deliveryBoysRefreshResult && !deliveryBoysRefreshResult.error) {
          this.cache.delivery_boys = deliveryBoysRefreshResult.data || []
        }
        this.saveCacheToStorage()
        console.log(`🔄 [Sync] Order takers refreshed: ${this.cache.order_takers.length}`)
      }
      if (!userSettingsResult.error && userSettingsResult.data && typeof window !== 'undefined') {
        localStorage.setItem('pos_require_order_taker', JSON.stringify(userSettingsResult.data.require_order_taker || false))
        const scType = userSettingsResult.data.default_service_charge_type || 'percentage'
        const scValue = parseFloat(userSettingsResult.data.default_service_charge_value) || 0
        localStorage.setItem('pos_default_service_charge', JSON.stringify({ type: scType, value: scValue }))
        const dcType = userSettingsResult.data.default_delivery_charge_type || 'fixed'
        const dcValue = parseFloat(userSettingsResult.data.default_delivery_charge_value) || 0
        this.cache.defaultDeliveryCharge = { type: dcType, value: dcValue }
        localStorage.setItem('pos_default_delivery_charge', JSON.stringify({ type: dcType, value: dcValue }))

        // Refresh per-order-type "require customer" flags
        const requireCustomer = {
          walkin:   !!userSettingsResult.data.require_customer_walkin,
          takeaway: !!userSettingsResult.data.require_customer_takeaway,
          delivery: userSettingsResult.data.require_customer_delivery !== false,
        }
        localStorage.setItem('pos_require_customer', JSON.stringify(requireCustomer))

        // Refresh POS toast-notifications flag
        const toastsEnabled = userSettingsResult.data.toast_notifications_enabled !== false
        localStorage.setItem('pos_toast_enabled', JSON.stringify(toastsEnabled))

        // Refresh POS order behavior settings
        const showOrderConf = userSettingsResult.data.show_order_confirmation !== false
        localStorage.setItem('pos_show_order_confirmation', JSON.stringify(showOrderConf))
        const autoPrintKitchen = !!userSettingsResult.data.auto_print_kitchen_token
        localStorage.setItem('pos_auto_print_kitchen', JSON.stringify(autoPrintKitchen))
        const autoPrintReceipt = !!userSettingsResult.data.auto_print_customer_receipt
        localStorage.setItem('pos_auto_print_receipt', JSON.stringify(autoPrintReceipt))

        // Cashier drawer system toggle
        const cashierDrawerEnabled = !!userSettingsResult.data.use_cashier_drawer
        localStorage.setItem('pos_cashier_drawer_enabled', JSON.stringify(cashierDrawerEnabled))

        console.log(`🔄 [Sync] require_order_taker: ${userSettingsResult.data.require_order_taker}, default_service_charge: ${scValue}, require_customer:`, requireCustomer, `toasts: ${toastsEnabled}, popup: ${showOrderConf}, kitchenPrint: ${autoPrintKitchen}, receiptPrint: ${autoPrintReceipt}`)
      }
    } catch (error) {
      console.warn('⚠️ [refreshOrderTakerSettings] Error:', error.message)
    }
  }

  getOfflineOrdersCount() {
    return this.cache.orders.filter(order => !order._isSynced).length
  }

  getAllOrders() {
    return this.cache.orders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  // Get all offline orders (unsynced)
  getOfflineOrders() {
    const offlineOrders = this.cache.orders.filter(order => !order._isSynced)
    return offlineOrders.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  // ── DATA RECOVERY ──────────────────────────────────────────────
  // Merges orders recovered from old localStorage port sessions into
  // the current cache so they appear in the Offline Orders page and
  // can be pushed to Supabase via the normal sync flow.
  injectRecoveredOrders(recoveredOrders) {
    const existingIds = new Set(this.cache.orders.map(o => o.id))
    const existingOrderNumbers = new Set(this.cache.orders.map(o => o.order_number).filter(Boolean))

    const newOrders = recoveredOrders.filter(order => {
      if (order._isSynced) return false                          // already in DB
      if (existingIds.has(order.id)) return false                // already in cache by ID
      if (order.order_number && existingOrderNumbers.has(order.order_number)) return false // duplicate number
      return true
    })

    if (newOrders.length > 0) {
      // Mark every recovered order clearly so the UI can highlight them
      const tagged = newOrders.map(o => ({
        ...o,
        _isOffline: true,
        _isSynced: false,
        _recovered: true,         // flag so UI can show "Recovered" badge
        _syncError: null,
      }))
      this.cache.orders.push(...tagged)
      this.saveCacheToStorage()
      console.log(`✅ [Recovery] Injected ${tagged.length} recovered orders into cache`)
    }

    return newOrders.length
  }
  // ───────────────────────────────────────────────────────────────

  // Sync a single offline order
  async syncSingleOrder(orderId) {
    try {
      console.log(`🔄 [CacheManager] Syncing single order: ${orderId}`)

      const order = this.cache.orders.find(o => o.id === orderId)
      if (!order) {
        throw new Error('Order not found in cache')
      }

      if (order._isSynced) {
        return { success: true, message: 'Order already synced', order }
      }

      // Check if online
      if (!this.checkOnlineStatus()) {
        throw new Error('Cannot sync: Device is offline')
      }

      // Sync the order using existing syncOrder method
      const result = await this.syncOrder(order)

      if (result.success) {
        // Mark as synced and update cache
        const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
        if (orderIndex !== -1) {
          this.cache.orders[orderIndex]._isSynced = true
          this.cache.orders[orderIndex]._syncError = null
          await this.saveCacheToStorage()
        }

        return {
          success: true,
          message: 'Order synced successfully',
          order: result.syncedOrder,
          originalOrderId: orderId
        }
      } else {
        // Mark sync error
        const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
        if (orderIndex !== -1) {
          this.cache.orders[orderIndex]._syncError = result.error || 'Unknown sync error'
          await this.saveCacheToStorage()
        }

        throw new Error(result.error || 'Sync failed')
      }
    } catch (error) {
      console.error(`❌ [CacheManager] Failed to sync order ${orderId}:`, error)

      // Store error in order for display
      const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
      if (orderIndex !== -1) {
        this.cache.orders[orderIndex]._syncError = error.message
        await this.saveCacheToStorage()
      }

      return {
        success: false,
        error: error.message,
        orderId
      }
    }
  }

  // Delete an offline order (use with caution)
  async deleteOfflineOrder(orderId) {
    try {
      console.log(`🗑️ [CacheManager] Deleting offline order: ${orderId}`)

      const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
      if (orderIndex === -1) {
        throw new Error('Order not found')
      }

      const order = this.cache.orders[orderIndex]
      if (order._isSynced) {
        throw new Error('Cannot delete synced order')
      }

      // Remove from cache
      this.cache.orders.splice(orderIndex, 1)

      // Also remove payment transactions if any
      this.cache.paymentTransactions.delete(orderId)

      await this.saveCacheToStorage()

      console.log(`✅ [CacheManager] Offline order deleted: ${orderId}`)
      return { success: true, message: 'Order deleted successfully' }

    } catch (error) {
      console.error(`❌ [CacheManager] Failed to delete order ${orderId}:`, error)
      return { success: false, error: error.message }
    }
  }

  // Get payment transactions for an order (for split payments)
  getPaymentTransactions(orderId) {
    const transactions = this.cache.paymentTransactions.get(orderId) || []
    console.log(`🔍 [CacheManager] Getting payment transactions for order ID: ${orderId}`)
    console.log(`🔍 [CacheManager] Found ${transactions.length} transactions`)
    if (transactions.length > 0) {
      console.log(`🔍 [CacheManager] Transactions:`, JSON.stringify(transactions, null, 2))
    } else {
      console.log(`🔍 [CacheManager] No transactions found. Current cache has ${this.cache.paymentTransactions.size} orders with transactions`)
      console.log(`🔍 [CacheManager] Cached order IDs:`, Array.from(this.cache.paymentTransactions.keys()))
    }
    return transactions
  }

  // Set payment transactions for an order (for split payments)
  setPaymentTransactions(orderId, transactions) {
    console.log(`💾 [CacheManager] Caching ${transactions.length} payment transactions for order ID: ${orderId}`)
    console.log(`💾 [CacheManager] Transactions to cache:`, JSON.stringify(transactions, null, 2))
    this.cache.paymentTransactions.set(orderId, transactions)
    this.saveCacheToStorage()
    console.log(`✅ [CacheManager] Payment transactions cached successfully`)
    console.log(`✅ [CacheManager] Total cached orders with transactions: ${this.cache.paymentTransactions.size}`)
    console.log(`✅ [CacheManager] All cached order IDs:`, Array.from(this.cache.paymentTransactions.keys()))
  }

  // Get order history for an order
  getOrderHistory(orderId) {
    const history = this.cache.orderHistory.get(orderId) || []
    console.log(`🔍 [CacheManager] Getting order history for order ${orderId}:`, history.length > 0 ? `${history.length} entries found` : 'none found')
    return history
  }

  // Set order history for an order (cache history entries)
  setOrderHistory(orderId, history) {
    console.log(`💾 [CacheManager] Caching ${history.length} history entries for order ${orderId}`)
    this.cache.orderHistory.set(orderId, history)
    this.saveCacheToStorage()
    console.log(`✅ [CacheManager] Order history cached. Total cached orders with history: ${this.cache.orderHistory.size}`)
  }

  // Add a single history entry to cache (for offline modifications)
  addOrderHistoryEntry(orderId, historyEntry) {
    const existingHistory = this.cache.orderHistory.get(orderId) || []
    existingHistory.unshift(historyEntry) // Add to beginning (most recent first)
    this.cache.orderHistory.set(orderId, existingHistory)
    this.saveCacheToStorage()
    console.log(`✅ [CacheManager] Added history entry for order ${orderId}. Total entries: ${existingHistory.length}`)
    return historyEntry
  }

  // Update order status with offline support
  async updateOrderStatus(orderId, newStatus, additionalData = {}) {
    const updateData = {
      order_status: newStatus,
      updated_at: new Date().toISOString(),
      ...additionalData
    }

    // Update local cache in-memory ONLY (no localStorage write yet — avoids spurious backup)
    // saveCacheToStorage() is called only after the outcome is known:
    //   success  → _isSynced: true  → no backup triggered
    //   failure  → queueStatusUpdateForSync() marks _isSynced: false and saves → backup triggered
    const orderIndex = this.cache.orders.findIndex(o => o.id === orderId)
    if (orderIndex !== -1) {
      this.cache.orders[orderIndex] = {
        ...this.cache.orders[orderIndex],
        ...updateData
        // _isSynced intentionally NOT changed here — set by success/failure paths below
      }

      // Dispatch event to notify UI components that orders changed
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('ordersUpdated', {
          detail: {
            orderId,
            newStatus,
            orderType: this.cache.orders[orderIndex].order_type
          }
        }))
      }

      // Save to localStorage immediately so page reloads during DB call don't read stale status
      // _isSynced is NOT changed here so backup trigger behavior is preserved
      this.saveCacheToStorage()
    }

    // Check CURRENT network status (respects force-offline flag)
    const isCurrentlyOnline = this.checkOnlineStatus()

    // 🆕 CRITICAL FIX: Validate orderId is a UUID, not temporary ID
    const isValidUUID = (str) => {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      return uuidRegex.test(str)
    }

    const currentOrderId = isValidUUID(orderId) ? orderId : null

    // If orderId is temporary, get the real UUID from cache
    if (!currentOrderId && orderIndex !== -1) {
      const cachedOrder = this.cache.orders[orderIndex]
      console.warn(`⚠️ [updateOrderStatus] Order ${orderId} is temporary ID, checking cache for real UUID`)

      // Check if cached order has been synced and has a real UUID
      if (cachedOrder._isSynced && isValidUUID(cachedOrder.id)) {
        console.log(`✅ [updateOrderStatus] Found real UUID in cache: ${cachedOrder.id}`)
        // Update the orderId to use the real UUID
        orderId = cachedOrder.id
      } else {
        console.warn(`⚠️ [updateOrderStatus] Order not synced yet, queueing update`)
        return this.queueStatusUpdateForSync(orderId, updateData)
      }
    }

    console.log(`🔍 [updateOrderStatus] Order ${orderId} -> ${newStatus}, Network: ${isCurrentlyOnline ? 'ONLINE' : 'OFFLINE'}`)

    if (isCurrentlyOnline) {
      // Online: Update Supabase directly
      try {
        const { data, error } = await supabase
          .from('orders')
          .update(updateData)
          .eq('id', orderId)
          .select()

        if (error) {
          console.error('❌ [updateOrderStatus] Supabase error details:', {
            message: error.message,
            details: error.details,
            hint: error.hint,
            code: error.code
          })
          throw error
        }

        // Check if any rows were updated
        if (!data || data.length === 0) {
          console.error('❌ [updateOrderStatus] No rows updated - order not found in database:', orderId)
          throw new Error(`Order ${orderId} not found in database`)
        }

        // Mark as synced in cache
        if (orderIndex !== -1) {
          this.cache.orders[orderIndex]._isSynced = true
          this.saveCacheToStorage()
        }

        console.log(`✅ [updateOrderStatus] Order ${orderId} updated successfully ONLINE`)
        return { success: true, isOffline: false }
      } catch (error) {
        console.error('❌ [updateOrderStatus] Error updating order status online:', {
          error,
          orderId,
          newStatus,
          errorMessage: error?.message || 'Unknown error',
          errorCode: error?.code,
          errorDetails: error?.details
        })
        // Fall back to offline mode if online update fails
        return this.queueStatusUpdateForSync(orderId, updateData)
      }
    } else {
      // Offline: Queue for later sync
      console.log(`📴 [updateOrderStatus] Device offline, queueing update for sync`)
      return this.queueStatusUpdateForSync(orderId, updateData)
    }
  }

  // Queue a status update for sync when back online
  queueStatusUpdateForSync(orderId, updateData) {
    // Mark order as unsynced in memory so saveCacheToStorage() below persists it correctly
    const orderIdx = this.cache.orders.findIndex(o => o.id === orderId)
    if (orderIdx !== -1) {
      this.cache.orders[orderIdx]._isSynced = false
    }

    // Store order metadata so sync can deduct inventory without extra DB lookups
    const order = orderIdx !== -1 ? this.cache.orders[orderIdx] : null
    const orderNumber = order?.order_number || null
    const orderTypeId = order?.order_type_id || null  // UUID — used directly in deduction RPC
    const orderType   = order?.order_type   || null  // string code — fallback if UUID not stored

    // Check if there's already a pending update for this order
    const existingIndex = this.cache.pendingStatusUpdates.findIndex(
      u => u.orderId === orderId
    )

    const pendingUpdate = {
      orderId,
      orderNumber,  // fallback lookup by order_number
      orderTypeId,  // UUID passed directly to deduct_inventory_for_order
      orderType,    // string code used to lookup UUID if orderTypeId is missing
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
    console.log(`📝 [queueStatusUpdate] Queued for order ${orderId} (${orderNumber}): ${updateData.order_status}`)

    return { success: true, isOffline: true }
  }

  addPendingLedgerEntry(entry) {
    if (!this.cache.pendingLedgerEntries) this.cache.pendingLedgerEntries = []
    this.cache.pendingLedgerEntries.push({ ...entry, _queuedAt: new Date().toISOString() })
    this.saveCacheToStorage()
    console.log(`📝 [CacheManager] Queued pending ledger entry: ${entry.type} Rs ${entry.amount} for customer ${entry.customer_id}`)
  }

  async syncPendingLedgerEntries() {
    const entries = this.cache.pendingLedgerEntries || []
    if (entries.length === 0) return { successCount: 0, failedCount: 0 }

    if (!this.checkOnlineStatus()) {
      return { successCount: 0, failedCount: 0, reason: 'offline' }
    }

    console.log(`💳 [Sync] Syncing ${entries.length} pending ledger entries...`)
    let successCount = 0
    let failedCount = 0
    const remaining = []

    for (const entry of entries) {
      try {
        const { default: customerLedgerManager } = await import('./customerLedgerManager')
        customerLedgerManager.setUserId(this.userId)
        const currentBalance = await customerLedgerManager.getCustomerBalance(entry.customer_id)
        const newBalance = entry.type === 'credit'
          ? currentBalance - entry.amount
          : currentBalance + entry.amount

        const { error } = await supabase.from('customer_ledger').insert({
          user_id: this.userId,
          customer_id: entry.customer_id,
          transaction_type: entry.type,
          amount: entry.amount,
          balance_before: currentBalance,
          balance_after: newBalance,
          order_id: entry.order_id || null,
          description: entry.description || `${entry.type === 'credit' ? 'Credit' : 'Debit'} entry`,
          notes: entry.notes || 'Synced from offline queue',
          created_by: this.userId
        })

        if (error) {
          console.error(`❌ [Sync] Failed to sync ledger entry:`, error.message)
          remaining.push(entry)
          failedCount++
        } else {
          await supabase.from('customers').update({ account_balance: newBalance }).eq('id', entry.customer_id)
          console.log(`✅ [Sync] Synced ledger entry: ${entry.type} Rs ${entry.amount}`)
          successCount++
        }
      } catch (err) {
        console.error(`❌ [Sync] Error syncing ledger entry:`, err)
        remaining.push(entry)
        failedCount++
      }
    }

    this.cache.pendingLedgerEntries = remaining
    await this.saveCacheToStorage()
    return { successCount, failedCount }
  }

  // Queue an expense row to be inserted into Supabase when the device reconnects.
  // Used today by the complimentary-order flow so offline complimentary orders
  // still produce a matching expense entry once back online.
  addPendingExpenseEntry(entry) {
    if (!this.cache.pendingExpenseEntries) this.cache.pendingExpenseEntries = []
    this.cache.pendingExpenseEntries.push({ ...entry, _queuedAt: new Date().toISOString() })
    this.saveCacheToStorage()
    console.log(`📝 [CacheManager] Queued pending expense: Rs ${entry.amount} - ${entry.description}`)
  }

  async syncPendingExpenseEntries() {
    const entries = this.cache.pendingExpenseEntries || []
    if (entries.length === 0) return { successCount: 0, failedCount: 0 }
    if (!this.checkOnlineStatus()) return { successCount: 0, failedCount: 0, reason: 'offline' }

    console.log(`💰 [Sync] Syncing ${entries.length} pending expense entries...`)

    // Resolve "Complimentary Orders" category once for all entries that need it
    const needsCompCat = entries.some(e => e.needs_complimentary_category)
    let compCategoryId = null
    if (needsCompCat) {
      try {
        const { data: existingCat } = await supabase
          .from('expense_categories')
          .select('id')
          .eq('user_id', this.userId)
          .eq('name', 'Complimentary Orders')
          .maybeSingle()
        if (existingCat) {
          compCategoryId = existingCat.id
        } else {
          const { data: newCat } = await supabase
            .from('expense_categories')
            .insert({ user_id: this.userId, name: 'Complimentary Orders', icon: 'Gift', color: '#ec4899' })
            .select('id')
            .single()
          if (newCat) compCategoryId = newCat.id
        }
      } catch (catErr) {
        console.error('❌ [Sync] Failed to resolve Complimentary Orders category:', catErr)
      }
    }

    let successCount = 0
    let failedCount = 0
    const remaining = []

    for (const entry of entries) {
      try {
        const { needs_complimentary_category, _queuedAt, ...expenseData } = entry
        if (needs_complimentary_category && compCategoryId) {
          expenseData.category_id = compCategoryId
        }

        // Dedup by description (e.g. "Complimentary Order #ORD-123 - reason")
        if (expenseData.description) {
          const { data: existing } = await supabase
            .from('expenses')
            .select('id')
            .eq('user_id', this.userId)
            .eq('description', expenseData.description)
            .maybeSingle()
          if (existing) {
            console.log(`⏭️  [Sync] Expense already exists, skipping: ${expenseData.description}`)
            successCount++
            continue
          }
        }

        const { error } = await supabase.from('expenses').insert(expenseData)
        if (error) {
          console.error(`❌ [Sync] Failed to insert expense:`, error.message)
          remaining.push(entry)
          failedCount++
        } else {
          console.log(`✅ [Sync] Synced expense: Rs ${expenseData.amount} - ${expenseData.description}`)
          successCount++
        }
      } catch (err) {
        console.error(`❌ [Sync] Error syncing expense entry:`, err)
        remaining.push(entry)
        failedCount++
      }
    }

    this.cache.pendingExpenseEntries = remaining
    await this.saveCacheToStorage()
    return { successCount, failedCount }
  }

  // Sync pending status updates when back online
  async syncPendingStatusUpdates() {
    // Check if we're actually online before attempting sync
    if (!this.checkOnlineStatus()) {
      console.log('⏸️ Skipping sync - device is offline')
      return { success: false, count: 0, reason: 'offline' }
    }

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
        // 🆕 CRITICAL FIX: Find order by ID first, then by order_number as fallback
        let order = this.cache.orders.find(o => o.id === update.orderId)

        // If not found by ID and we have order_number, try that (for orders that got synced and changed ID)
        if (!order && update.orderNumber) {
          order = this.cache.orders.find(o => o.order_number === update.orderNumber)
          if (order) {
            console.log(`🔍 [Sync] Found order by order_number fallback: ${update.orderNumber} (new ID: ${order.id})`)
          }
        }

        if (!order) {
          // Order not in cache anymore (probably old orders from days ago)
          // Skip this update and mark as synced to remove from queue
          console.warn(`⚠️ [Sync] Order not found in cache: ${update.orderId} (${update.orderNumber}) - skipping`)
          update._isSynced = true // Mark as synced so it gets removed from pending list
          continue
        }

        // Use the order's CURRENT id (which will be a UUID after syncing)
        const currentOrderId = order.id
        console.log(`🔑 [Sync] Syncing status update: ${update.orderId} -> ${currentOrderId} (${update.orderNumber})`)

        // Skip if still a local offline ID — syncOrder handles these via INSERT + deduction
        const isRealUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentOrderId)
        if (!isRealUUID) {
          console.warn(`⚠️ [Sync] Order ${update.orderNumber} has local ID (${currentOrderId}) — not yet synced to DB, skipping status update`)
          continue
        }

        const { error } = await supabase
          .from('orders')
          .update(update.updateData)
          .eq('id', currentOrderId) // Use the current UUID, not the old temporary ID

        if (error) throw error

        // Mark as synced in both the update and the order cache
        update._isSynced = true
        const orderIndex = this.cache.orders.findIndex(o => o.id === currentOrderId)
        if (orderIndex !== -1) {
          this.cache.orders[orderIndex]._isSynced = true
        }

        successCount++
        console.log(`✅ [Sync] Synced status update for order ${currentOrderId}: ${update.updateData.order_status}`)

        // Deduct inventory for offline-completed orders
        if (update.updateData.order_status === 'Completed') {
          // Prefer stored orderTypeId from queue (set at queue time when order is in memory).
          // Fall back to cached order, then DB lookup by string code.
          let orderTypeId = update.orderTypeId || order?.order_type_id || null
          const orderTypeCode = update.orderType || order?.order_type || null

          if (!orderTypeId && orderTypeCode) {
            try {
              const { data: otData } = await supabase
                .from('order_types')
                .select('id')
                .eq('code', orderTypeCode)
                .eq('is_active', true)
                .single()
              if (otData?.id) {
                orderTypeId = otData.id
                // Persist back to the order cache so future syncs skip the lookup
                if (order) order.order_type_id = orderTypeId
              }
            } catch (_) {}
          }

          if (orderTypeId && this.userId) {
            try {
              const { data: deductResult, error: deductError } = await supabase.rpc(
                'deduct_inventory_for_order',
                { p_order_id: currentOrderId, p_user_id: this.userId, p_order_type_id: orderTypeId }
              )
              if (deductError) {
                console.error(`❌ [Sync] Inventory deduction error for ${update.orderNumber}:`, deductError)
              } else if (deductResult?.success) {
                console.log(`✅ [Sync] Inventory deducted for offline order ${update.orderNumber}: ${deductResult.deductions_made} items`)
                // Mark locally so UI can reflect deducted state
                if (orderIndex !== -1) this.cache.orders[orderIndex]._inventoryDeducted = true
              } else {
                const msg = deductResult?.error || 'unknown'
                if (msg.includes('already deducted')) {
                  console.log(`ℹ️ [Sync] Inventory already deducted for ${update.orderNumber} — skipping`)
                  if (orderIndex !== -1) this.cache.orders[orderIndex]._inventoryDeducted = true
                } else {
                  console.warn(`⚠️ [Sync] Deduction not applied for ${update.orderNumber}: ${msg}`)
                }
              }
            } catch (deductErr) {
              console.error(`❌ [Sync] Inventory deduction exception for ${update.orderNumber}:`, deductErr)
              // Don't fail the sync — order is synced, deduction can be retried manually
            }
          } else {
            console.warn(`⚠️ [Sync] Skipping deduction for ${update.orderNumber} — missing orderTypeId or userId`)
          }
        }
      } catch (error) {
        failedCount++
        const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
        errors.push({ orderId: update.orderId, error: errorMessage })
        console.error(`❌ [Sync] Failed to sync status update for ${update.orderId}:`, errorMessage)
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

    // Use the business date for serial assignment — this respects the business-end-time setting
    // so orders created between midnight and the cutoff (e.g. 3 AM) belong to the previous business day.
    const { startTime: bizStart, endTime: bizEnd } = dailySerialManager.getBusinessHours()
    const todayBusiness = getTodaysBusinessDate(bizStart, bizEnd)

    // Helper: get the business date for an order timestamp
    const toOrderBusinessDate = (order) => {
      if (order.created_at) return getBusinessDate(order.created_at, bizStart, bizEnd)
      if (order.order_date) return order.order_date
      return null
    }

    // IMPORTANT: Get existing serial assignments from localStorage
    // dailySerialManager stores data keyed by business date — compare against the same
    const existingData = dailySerialManager.getStoredData()
    const existingAssignments = existingData && existingData.date === todayBusiness ? existingData.orderMap : {}

    console.log(`📊 [Serial Assignment] Processing ${orders.length} orders, ${Object.keys(existingAssignments).length} already have serials`)

    // Filter only today's orders for serial assignment using the business date
    const todaysOrders = orders.filter(order => toOrderBusinessDate(order) === todayBusiness)

    // First: sync any DB-assigned serials into localStorage so the local counter stays
    // in step with the DB counter. Without this, batchAssignSerials can assign numbers
    // lower than what the DB has already handed out on this or other devices.
    todaysOrders.forEach(order => {
      if (order.daily_serial != null && !existingAssignments[order.order_number]) {
        dailySerialManager.setSerial(order.order_number, order.daily_serial)
      }
    })

    // Re-read assignments after syncing DB serials (counter may have advanced)
    const updatedData = dailySerialManager.getStoredData()
    const updatedAssignments = updatedData && updatedData.date === todayBusiness ? updatedData.orderMap : {}

    // Separate orders: those already in localStorage vs those needing local assignment
    // Only assign local serials to orders that have NO serial from DB either
    const ordersWithSerials = todaysOrders.filter(order => updatedAssignments[order.order_number])
    const ordersWithoutSerials = todaysOrders.filter(order =>
      !updatedAssignments[order.order_number] && order.daily_serial == null
    )

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

    // Batch assign serials ONLY to orders that have no DB serial and no local serial yet
    const newAssignments = dailySerialManager.batchAssignSerials(orderNumbers)

    // Combine: localStorage (includes DB-synced serials) + newly local-assigned
    const allAssignments = { ...updatedAssignments, ...newAssignments }

    console.log(`  - Total serials assigned: ${Object.keys(allAssignments).length}`)

    // Enrich all orders — only current business day orders get local serial assignment
    return orders.map(order => {
      if (!order || !order.order_number) return order

      const isToday = toOrderBusinessDate(order) === todayBusiness

      // For non-today orders, preserve whatever daily_serial came from DB — don't wipe it
      if (!isToday) return order

      // DB serial is the authoritative value — set by the atomic RPC across all devices
      // Only fall back to localStorage for offline orders not yet synced to DB
      if (order.daily_serial != null) return order

      return {
        ...order,
        daily_serial: allAssignments[order.order_number] || null
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
      menus: [],
      products: [],
      variants: new Map(),
      customers: new Map(),
      orders: [],
      deals: [],
      dealProducts: new Map(),
      tables: [],
      pendingStatusUpdates: [],
      paymentTransactions: new Map(),
      orderHistory: new Map(),
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

  // Returns the current online status.
  // We no longer read navigator.onLine here — it is unreliable in packaged Electron
  // (can return false even when the internet is available).
  // this.isOnline is maintained by checkConnectivity() (real HTTP test) and window events.
  checkOnlineStatus() {
    return this._forceOffline ? false : this.isOnline
  }

  getNetworkStatus() {
    return {
      isOnline: this.checkOnlineStatus(),
      unsyncedOrders: this.getOfflineOrdersCount(),
      pendingStatusUpdates: this.getPendingStatusUpdatesCount(),
      lastSync: this.cache.lastSync,
      isSyncing: this.isSyncing,
      forceOffline: this._forceOffline
    }
  }

  setForceOffline(val) {
    this._forceOffline = !!val
    if (typeof window !== 'undefined') {
      localStorage.setItem('pos_force_offline', this._forceOffline ? 'true' : 'false')
    }
    if (this._forceOffline) {
      this.isOnline = false
      console.log('🔌 [CacheManager] Force-offline mode ON — all network calls will be skipped')
    } else {
      console.log('🌐 [CacheManager] Force-offline mode OFF — checking real connectivity...')
      this.checkConnectivity()
    }
  }

  getForceOffline() {
    return !!this._forceOffline
  }

  // 🆕 Calculate Cost of Goods Sold (COGS) for Daily P&L
  // 🆕 Calculate Cost of Goods Sold (COGS) for Daily P&L - reads from stock_history
  async calculateCOGS(orders) {
    console.log(`📊 [COGS] Calculating COGS for ${orders.length} orders`)

    const cogsData = {
      totalCOGS: 0,
      orderDetails: [],
      ingredientBreakdown: new Map()
    }

    try {
      const validOrders = orders.filter(o => o.order_status !== 'Cancelled')
      if (validOrders.length === 0) return cogsData

      const orderIds = validOrders.map(o => o.id).filter(Boolean)
      if (orderIds.length === 0) return cogsData

      // Step 1: Use RPC for accurate COGS totals (same as Financial Reports)
      const BATCH = 200
      const orderCogsMap = {}
      for (let i = 0; i < orderIds.length; i += BATCH) {
        const { data, error } = await supabase.rpc('calculate_cogs_for_orders', {
          p_order_ids: orderIds.slice(i, i + BATCH),
          p_user_id: this.userId,
        })
        if (!error && data) {
          data.forEach(row => {
            orderCogsMap[row.order_id] = parseFloat(row.total_cogs || 0)
          })
        }
      }

      // Step 2: Build per-order details using RPC totals
      validOrders.forEach(order => {
        const orderCOGS = orderCogsMap[order.id] || 0
        cogsData.totalCOGS += orderCOGS
        cogsData.orderDetails.push({
          orderId: order.id,
          orderNumber: order.order_number,
          revenue: parseFloat(order.total_amount || 0),
          cogs: orderCOGS,
          profit: parseFloat(order.total_amount || 0) - orderCOGS,
          ingredients: []
        })
      })

      // Step 3: Fetch ingredient breakdown from stock_history for detailed view
      const { data: stockHistory, error: stockError } = await supabase
        .from('stock_history')
        .select(`
          id, quantity, total_cost, cost_per_unit, notes, inventory_item_id, reference_id,
          inventory_items (
            id, name,
            units (abbreviation)
          )
        `)
        .in('reference_id', orderIds)
        .in('transaction_type', ['order_deduction', 'order'])

      if (!stockError && stockHistory) {
        // Build ingredient breakdown
        for (const entry of stockHistory) {
          const stockChange = Math.abs(parseFloat(entry.quantity || 0))
          const cost = entry.total_cost != null
            ? Math.abs(parseFloat(entry.total_cost))
            : parseFloat(entry.cost_per_unit || 0) * stockChange

          const isRecipeYield = !entry.inventory_item_id
          const name = isRecipeYield
            ? (entry.notes?.match(/\(Recipe Yield: (.+?)\)/)?.[1] || 'Recipe')
            : (entry.inventory_items?.name || 'Unknown')
          const unit = entry.inventory_items?.units?.abbreviation || ''

          const breakdownKey = entry.inventory_item_id || `recipe:${name}`
          if (cogsData.ingredientBreakdown.has(breakdownKey)) {
            const existing = cogsData.ingredientBreakdown.get(breakdownKey)
            existing.quantity += stockChange
            existing.cost += cost
          } else {
            cogsData.ingredientBreakdown.set(breakdownKey, { name, quantity: stockChange, unit, cost })
          }

          // Also add to the order's ingredients array
          const orderDetail = cogsData.orderDetails.find(d => d.orderId === entry.reference_id)
          if (orderDetail) {
            orderDetail.ingredients.push({ name, quantity: stockChange, unit, cost })
          }
        }
      }

      // Convert Map to array
      cogsData.ingredientBreakdown = Array.from(cogsData.ingredientBreakdown.values())
        .sort((a, b) => b.cost - a.cost)

      console.log(`✅ [COGS] Calculation complete: Total COGS = ${cogsData.totalCOGS.toFixed(2)}`)
      return cogsData

    } catch (error) {
      console.error(`❌ [COGS] Calculation error:`, error)
      return cogsData
    }
  }
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

      // Calculate revenue (exclude complimentary orders)
      const totalRevenue = allOrders.reduce((sum, order) =>
        order.payment_method === 'Complimentary' ? sum : sum + parseFloat(order.total_amount || 0), 0
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
        order.payment_method === 'Complimentary' ? sum : sum + parseFloat(order.total_amount || 0), 0
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