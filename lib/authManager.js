// lib/authManager.js - COMPLETE FILE WITH PRINTER ASSET DOWNLOAD
import { supabase } from './supabase'

class AuthManager {
  constructor() {
    this.currentUser = null
    this.currentSession = null
    this.currentRole = null
    this.cashierData = null
    this.isAuthenticated = false
    
    this.AUTH_STORAGE_KEY = 'BizPOS_auth'
    this.SESSION_DURATION = 24 * 60 * 60 * 1000 // 24 hours
    
    if (typeof window !== 'undefined') {
      this.loadAuthState()
    }
  }

  // ==============================================
  // LOGIN METHODS
  // ==============================================

  async login(phone, password) {
    try {
      console.log('🔐 Attempting login with phone:', phone)

      // Clean phone number - keep local format
      const cleanPhone = phone.replace(/\s+/g, '')

      // STEP 1: Try to find admin user
      const { data: adminUser, error: adminError } = await supabase
        .from('users')
        .select('*')
        .eq('phone', cleanPhone)
        .eq('is_active', true)
        .single()

      if (adminUser && !adminError && adminUser.password === password) {
        console.log('✅ Admin user authenticated:', adminUser.customer_name)

        // Create session in database
        const session = await this.createSession(null, adminUser.id, 'admin')

        if (!session) {
          console.warn('⚠️ Failed to create session, continuing anyway')
        }

        // Prepare auth data with credentials
        const authData = {
          user: adminUser,
          session: session,
          role: 'admin',
          cashier: null,
          credentials: {
            phone: cleanPhone,
            password: password
          },
          loginTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + this.SESSION_DURATION).toISOString()
        }

        // Set internal state
        this.currentUser = adminUser
        this.currentSession = session
        this.currentRole = 'admin'
        this.cashierData = null
        this.isAuthenticated = true

        // Save to storage
        this.saveAuthState(authData)

        // Download printer assets (non-blocking - don't await)
        this.downloadPrinterAssets(adminUser).catch(err => {
          console.error('❌ Printer assets download failed (non-blocking):', err)
        })

        // Load permissions
        await this.loadPermissions()

        console.log('✅ Admin login successful')
        return {
          success: true,
          user: adminUser,
          session: session,
          role: 'admin'
        }
      }

      // STEP 2: Try to find cashier
      const { data: cashier, error: cashierError } = await supabase
        .from('cashiers')
        .select(`
          *,
          user:user_id (
            id,
            customer_name,
            store_name,
            store_logo,
            store_address,
            phone,
            email,
            qr_code
          )
        `)
        .eq('phone', cleanPhone)
        .eq('is_active', true)
        .single()

      if (cashier && !cashierError && cashier.password === password) {
        console.log('✅ Cashier authenticated:', cashier.name)

        // Ensure user data exists
        if (!cashier.user) {
          console.error('❌ Cashier has no associated user data')
          throw new Error('Cashier account is not properly configured. Please contact administrator.')
        }

        // Create session in database
        const session = await this.createSession(cashier.id, cashier.user_id, 'cashier')

        if (!session) {
          console.warn('⚠️ Failed to create session, continuing anyway')
        }

        // Combine user and cashier data
        const userData = {
          ...cashier.user,
          cashier_id: cashier.id,
          cashier_name: cashier.name,
          cashier_email: cashier.email,
          cashier_phone: cashier.phone,
          display_name: cashier.name,
          // Include cashier's printer preferences
          is_print_server: cashier.is_print_server,
          share_printer_mode: cashier.share_printer_mode
        }

        // Prepare auth data with credentials
        const authData = {
          user: userData,
          cashier: cashier,
          session: session,
          role: 'cashier',
          credentials: {
            phone: cleanPhone,
            password: password
          },
          loginTime: new Date().toISOString(),
          expiresAt: new Date(Date.now() + this.SESSION_DURATION).toISOString()
        }

        // Set internal state
        this.currentUser = userData
        this.currentSession = session
        this.currentRole = 'cashier'
        this.cashierData = cashier
        this.isAuthenticated = true

        // Save to storage
        this.saveAuthState(authData)

        // Download printer assets (non-blocking - don't await)
        this.downloadPrinterAssets(cashier.user).catch(err => {
          console.error('❌ Printer assets download failed (non-blocking):', err)
        })

        // Load permissions for cashier
        await this.loadPermissions()

        console.log('✅ Cashier login successful')
        return {
          success: true,
          user: userData,
          cashier: cashier,
          session: session,
          role: 'cashier'
        }
      }

      // Neither admin nor cashier found
      console.error('❌ Invalid credentials')
      return {
        success: false,
        error: 'Invalid phone number or password'
      }

    } catch (error) {
      console.error('❌ Login error:', error)
      return {
        success: false,
        error: error.message || 'Login failed. Please try again.'
      }
    }
  }

  // ==============================================
  // PERMISSION LOADING
  // ==============================================

  async loadPermissions() {
    try {
      // Dynamically import to avoid circular dependency
      const { permissionManager } = await import('./permissionManager')
      await permissionManager.loadPermissions()
      console.log('✅ Permissions loaded')
    } catch (error) {
      console.error('❌ Failed to load permissions:', error)
    }
  }

  // ==============================================
  // PRINTER ASSET DOWNLOAD (NEW)
  // ==============================================

  async downloadPrinterAssets(userProfile) {
    try {
      // Check if we're in Electron environment
      if (typeof window === 'undefined' || !window.electron) {
        console.log('📱 Not in Electron environment, skipping printer assets download')
        return
      }

      // Handle missing or invalid userProfile
      if (!userProfile) {
        console.log('⚠️ No user profile provided, skipping printer assets download')
        return
      }

      console.log('🖨️ Downloading printer assets for user:', userProfile.id || userProfile.customer_name)
      console.log('  📄 Store logo:', userProfile.store_logo ? '✓ Present' : '✗ Missing')
      console.log('  📄 QR code:', userProfile.qr_code ? '✓ Present' : '✗ Missing')

      // Add timeout protection (10 seconds max)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Asset download timeout (10s)')), 10000)
      })

      const downloadPromise = window.electron.invoke('download-store-assets', {
        logoUrl: userProfile.store_logo || null,
        qrUrl: userProfile.qr_code || null
      })

      const result = await Promise.race([downloadPromise, timeoutPromise])

      if (result.success) {
        console.log('✅ Printer assets downloaded successfully')
        if (result.results.logo?.success) {
          console.log('  ✓ Logo downloaded:', result.results.logo.skipped ? '(cached)' : '(new)')
        } else if (result.results.logo?.error) {
          console.log('  ⚠️ Logo failed:', result.results.logo.error)
        }
        if (result.results.qr?.success) {
          console.log('  ✓ QR code downloaded:', result.results.qr.skipped ? '(cached)' : '(new)')
        } else if (result.results.qr?.error) {
          console.log('  ⚠️ QR code failed:', result.results.qr.error)
        }
      } else {
        console.warn('⚠️ Printer assets download failed:', result.error)
      }
    } catch (error) {
      console.error('❌ Error downloading printer assets:', error.message || error)
      // Don't fail login if asset download fails - this is non-blocking
    }
  }

  // ==============================================
  // SESSION MANAGEMENT
  // ==============================================

  async createSession(cashierId, userId, role) {
    try {
      const sessionData = {
        cashier_id: cashierId,
        user_id: userId,
        login_time: new Date().toISOString(),
        device_info: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        is_active: true
      }

      const { data, error } = await supabase
        .from('cashier_sessions')
        .insert([sessionData])
        .select()
        .single()

      if (error) {
        console.error('❌ Session creation error:', error)
        return null
      }

      console.log('✅ Session created:', data.id)
      return data

    } catch (error) {
      console.error('❌ Session creation failed:', error)
      return null
    }
  }

  async endSession(sessionId) {
    if (!sessionId) return

    try {
      await supabase
        .from('cashier_sessions')
        .update({
          logout_time: new Date().toISOString(),
          is_active: false
        })
        .eq('id', sessionId)

      console.log('✅ Session ended:', sessionId)
    } catch (error) {
      console.error('❌ Error ending session:', error)
    }
  }

  // ==============================================
  // ORDER HISTORY LOGGING
  // ==============================================

async logOrderAction(orderId, actionType, changes = null, notes = null) {
  try {
    const currentUser = this.getCurrentUser()
    const cashier = this.getCashier()

    // Import cacheManager dynamically to avoid circular dependencies
    const { cacheManager } = await import('./cacheManager')

    const historyEntry = {
      order_id: orderId,
      action_type: actionType,
      user_id: currentUser?.id || null,
      cashier_id: cashier?.id || null,
      changes: changes ? JSON.stringify(changes) : null,
      notes: notes,
      old_subtotal: changes?.oldSubtotal || null,
      new_subtotal: changes?.newSubtotal || null,
      old_total: changes?.oldTotal || null,
      new_total: changes?.newTotal || null,
      price_difference: changes?.newTotal && changes?.oldTotal
        ? (changes.newTotal - changes.oldTotal)
        : null,
      created_at: new Date().toISOString()
    }

    // Check if online - if not, save to cache only
    if (!navigator.onLine) {
      console.log('📴 [AuthManager] Offline - saving history entry to cache')

      // Generate temporary ID for offline entry
      historyEntry.id = `temp_history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      historyEntry._isOffline = true
      historyEntry._isSynced = false

      // Add item changes to the history entry for offline storage
      if (changes) {
        const itemChanges = []

        // Items Added
        if (changes.itemsAdded && changes.itemsAdded.length > 0) {
          changes.itemsAdded.forEach(item => {
            itemChanges.push({
              change_type: 'added',
              product_name: item.name,
              variant_name: item.variant || null,
              new_quantity: item.quantity,
              new_total: item.price
            })
          })
        }

        // Items Removed
        if (changes.itemsRemoved && changes.itemsRemoved.length > 0) {
          changes.itemsRemoved.forEach(item => {
            itemChanges.push({
              change_type: 'removed',
              product_name: item.name,
              variant_name: item.variant || null,
              old_quantity: item.quantity,
              old_total: item.price
            })
          })
        }

        // Items Modified
        if (changes.itemsModified && changes.itemsModified.length > 0) {
          changes.itemsModified.forEach(item => {
            itemChanges.push({
              change_type: 'quantity_changed',
              product_name: item.name,
              variant_name: item.variant || null,
              old_quantity: item.oldQuantity,
              new_quantity: item.newQuantity,
              old_total: item.oldPrice,
              new_total: item.newPrice
            })
          })
        }

        historyEntry.order_item_changes = itemChanges
      }

      // Add user/cashier info for offline display
      historyEntry.users = currentUser ? { id: currentUser.id, customer_name: currentUser.customer_name } : null
      historyEntry.cashiers = cashier ? { id: cashier.id, name: cashier.name } : null

      // Add to cache
      cacheManager.addOrderHistoryEntry(orderId, historyEntry)
      console.log('✅ [AuthManager] History entry saved to cache for offline viewing')

      return historyEntry
    }

    // Online - save to database
    const { data: historyData, error: historyError } = await supabase
      .from('order_history')
      .insert(historyEntry)
      .select()
      .single()

    if (historyError) throw historyError

    // If there are item changes, log them separately
    if (changes && historyData) {
      const itemChanges = []

      // Items Added
      if (changes.itemsAdded && changes.itemsAdded.length > 0) {
        changes.itemsAdded.forEach(item => {
          itemChanges.push({
            order_history_id: historyData.id,
            change_type: 'added',
            product_name: item.name,
            variant_name: item.variant || null,
            new_quantity: item.quantity,
            new_total: item.price
          })
        })
      }

      // Items Removed
      if (changes.itemsRemoved && changes.itemsRemoved.length > 0) {
        changes.itemsRemoved.forEach(item => {
          itemChanges.push({
            order_history_id: historyData.id,
            change_type: 'removed',
            product_name: item.name,
            variant_name: item.variant || null,
            old_quantity: item.quantity,
            old_total: item.price
          })
        })
      }

      // Items Modified
      if (changes.itemsModified && changes.itemsModified.length > 0) {
        changes.itemsModified.forEach(item => {
          itemChanges.push({
            order_history_id: historyData.id,
            change_type: 'quantity_changed',
            product_name: item.name,
            variant_name: item.variant || null,
            old_quantity: item.oldQuantity,
            new_quantity: item.newQuantity,
            old_total: item.oldPrice,
            new_total: item.newPrice
          })
        })
      }

      if (itemChanges.length > 0) {
        const { error: itemChangesError } = await supabase
          .from('order_item_changes')
          .insert(itemChanges)

        if (itemChangesError) {
          console.error('Failed to log item changes:', itemChangesError)
        } else {
          // Attach item changes to historyData so the cache entry includes them
          // (getOrderHistory returns cache-first, so without this the UI never sees the changes)
          historyData.order_item_changes = itemChanges
        }
      }
    }

    // Cache the history entry for offline viewing
    cacheManager.addOrderHistoryEntry(orderId, historyData)

    return historyData
  } catch (error) {
    console.error('Failed to log order action:', error)
    throw error
  }
}

// NEW: Get order history with item changes
async getOrderHistory(orderId) {
  try {
    // Import cacheManager dynamically to avoid circular dependencies
    const { cacheManager } = await import('./cacheManager')

    // Offline — use cache only
    if (!navigator.onLine) {
      const cachedHistory = cacheManager.getOrderHistory(orderId)
      console.log(`📴 [AuthManager] Offline — using cached order history (${cachedHistory?.length || 0} entries)`)
      return cachedHistory || []
    }

    // Online — always fetch fresh from DB so item changes are included
    const { data, error } = await supabase
      .from('order_history')
      .select(`
        *,
        users (
          id,
          customer_name
        ),
        cashiers (
          id,
          name
        ),
        order_item_changes (
          id,
          change_type,
          product_name,
          variant_name,
          old_quantity,
          new_quantity,
          old_price,
          new_price,
          old_total,
          new_total
        )
      `)
      .eq('order_id', orderId)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Update cache for offline use
    if (data) {
      cacheManager.setOrderHistory(orderId, data)
    }

    return data || []
  } catch (error) {
    console.error('Error fetching order history:', error)
    // Fallback to cache on error
    const { cacheManager } = await import('./cacheManager')
    return cacheManager.getOrderHistory(orderId) || []
  }
}


  // ==============================================
  // STORAGE MANAGEMENT (localStorage only)
  // ==============================================

  saveAuthState(authData) {
    try {
      if (typeof window === 'undefined') return

      // Save to localStorage (primary storage)
      // Use Unicode-safe encoding
      const encryptedData = btoa(encodeURIComponent(JSON.stringify(authData)))
      localStorage.setItem(this.AUTH_STORAGE_KEY, encryptedData)
      localStorage.setItem('user', JSON.stringify(authData.user))
      localStorage.setItem('auth_token', `token_${Date.now()}`)
      localStorage.setItem('login_time', authData.loginTime)

      console.log('✅ Auth state saved to localStorage')
    } catch (error) {
      console.error('❌ Error saving auth state:', error)
    }
  }

  getAuthStateSync() {
    try {
      if (typeof window === 'undefined') return null

      const encryptedData = localStorage.getItem(this.AUTH_STORAGE_KEY)
      if (!encryptedData) return null

      let authData
      try {
        // Try Unicode-safe decoding (new method)
        authData = JSON.parse(decodeURIComponent(atob(encryptedData)))
      } catch (decodeError) {
        // Fallback to old method for backward compatibility
        authData = JSON.parse(atob(encryptedData))
      }

      // Check expiration
      if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
        console.log('⏰ Session expired')
        this.logout()
        return null
      }

      return authData
    } catch (error) {
      console.error('❌ Error getting auth state:', error)
      return null
    }
  }

  loadAuthState() {
    try {
      if (typeof window === 'undefined') return false

      const encryptedData = localStorage.getItem(this.AUTH_STORAGE_KEY)
      if (!encryptedData) return false

      let authData
      try {
        // Try Unicode-safe decoding (new method)
        authData = JSON.parse(decodeURIComponent(atob(encryptedData)))
      } catch (decodeError) {
        // Fallback to old method for backward compatibility
        console.log('🔄 Trying legacy decoding method...')
        try {
          authData = JSON.parse(atob(encryptedData))
          // Re-save with new encoding method
          console.log('✅ Legacy data loaded, re-saving with new encoding')
          this.saveAuthState(authData)
        } catch (legacyError) {
          throw new Error('Failed to decode auth data with both methods')
        }
      }

      // Check expiration
      if (authData.expiresAt && new Date(authData.expiresAt) < new Date()) {
        console.log('⏰ Session expired on load')
        this.clearAuth()
        return false
      }

      // Restore state
      this.currentUser = authData.user
      this.currentSession = authData.session
      this.currentRole = authData.role
      this.cashierData = authData.cashier || null
      this.isAuthenticated = true

      console.log('👤 Auth state restored:', authData.role, '-', authData.user?.display_name || authData.user?.customer_name)
      return true

    } catch (error) {
      console.error('❌ Error loading auth state:', error)
      this.clearAuth()
      return false
    }
  }

  async loadAuthStateWithFallback() {
    // Just use localStorage, no IndexedDB
    return this.loadAuthState()
  }

  // ==============================================
  // UTILITY METHODS
  // ==============================================

  isLoggedIn() {
    return this.isAuthenticated && this.currentUser !== null
  }

  getCurrentUser() {
    return this.currentUser
  }

  getCurrentSession() {
    return this.currentSession
  }

  getRole() {
    return this.currentRole || 'admin'
  }

  getCashier() {
    return this.cashierData
  }

  isAdmin() {
    return this.currentRole === 'admin'
  }

  isCashier() {
    return this.currentRole === 'cashier'
  }

  getDisplayName() {
    if (this.currentRole === 'cashier') {
      return this.currentUser?.cashier_name || this.currentUser?.display_name || 'Cashier'
    }
    return this.currentUser?.customer_name || 'Admin'
  }

  updateUser(userData) {
    if (this.isAuthenticated) {
      this.currentUser = { ...this.currentUser, ...userData }

      const authState = this.getAuthStateSync()
      if (authState) {
        authState.user = this.currentUser
        this.saveAuthState(authState)
      }
    }
  }

  // ==============================================
  // SYNC USER DATA FROM DATABASE
  // ==============================================

  async syncUserDataFromDatabase() {
    try {
      if (!this.isAuthenticated) {
        console.log('⚠️ Not authenticated, cannot sync user data')
        return { success: false, error: 'Not authenticated' }
      }

      const authState = this.getAuthStateSync()
      if (!authState || !authState.credentials) {
        console.log('⚠️ No credentials found in storage')
        return { success: false, error: 'No credentials found' }
      }

      console.log('🔄 Syncing user data from database...')

      const { phone, password } = authState.credentials

      if (this.currentRole === 'admin') {
        // Sync admin user data
        const { data: adminUser, error: adminError } = await supabase
          .from('users')
          .select('*')
          .eq('phone', phone)
          .eq('is_active', true)
          .single()

        if (adminError || !adminUser) {
          console.error('❌ Failed to fetch admin user:', adminError)
          return { success: false, error: 'Failed to fetch user data' }
        }

        // Check if password has changed in database
        if (adminUser.password !== password) {
          console.log('🔑 Password has changed in database, updating local storage')
          authState.credentials.password = adminUser.password
        }

        // Update user data
        authState.user = adminUser
        this.currentUser = adminUser

        // Save updated state
        this.saveAuthState(authState)

        console.log('✅ Admin user data synced successfully')
        return { success: true, user: adminUser, passwordChanged: adminUser.password !== password }

      } else if (this.currentRole === 'cashier') {
        // Sync cashier data
        const { data: cashier, error: cashierError } = await supabase
          .from('cashiers')
          .select(`
            *,
            user:user_id (
              id,
              customer_name,
              store_name,
              store_logo,
              store_address,
              phone,
              email,
              qr_code
            )
          `)
          .eq('phone', phone)
          .eq('is_active', true)
          .single()

        if (cashierError || !cashier) {
          console.error('❌ Failed to fetch cashier:', cashierError)
          return { success: false, error: 'Failed to fetch cashier data' }
        }

        // Ensure user data exists
        if (!cashier.user) {
          console.error('❌ Cashier has no associated user data')
          return { success: false, error: 'Cashier account is not properly configured' }
        }

        // Check if password has changed in database
        if (cashier.password !== password) {
          console.log('🔑 Password has changed in database, updating local storage')
          authState.credentials.password = cashier.password
        }

        // Combine user and cashier data
        const userData = {
          ...cashier.user,
          cashier_id: cashier.id,
          cashier_name: cashier.name,
          cashier_email: cashier.email,
          cashier_phone: cashier.phone,
          display_name: cashier.name,
          // Include cashier's printer preferences
          is_print_server: cashier.is_print_server,
          share_printer_mode: cashier.share_printer_mode
        }

        // Update auth state
        authState.user = userData
        authState.cashier = cashier
        this.currentUser = userData
        this.cashierData = cashier

        // Save updated state
        this.saveAuthState(authState)

        console.log('✅ Cashier data synced successfully')
        return { success: true, user: userData, cashier: cashier, passwordChanged: cashier.password !== password }
      }

      return { success: false, error: 'Unknown role' }

    } catch (error) {
      console.error('❌ Error syncing user data:', error)
      return { success: false, error: error.message }
    }
  }

  clearAuth() {
    this.currentUser = null
    this.currentSession = null
    this.currentRole = null
    this.cashierData = null
    this.isAuthenticated = false
    
    if (typeof window !== 'undefined') {
      localStorage.removeItem(this.AUTH_STORAGE_KEY)
      localStorage.removeItem('user')
      localStorage.removeItem('auth_token')
      localStorage.removeItem('login_time')
      localStorage.removeItem('last_activity')
      
      // Clear POS cache
      localStorage.removeItem('pos_cache')
      localStorage.removeItem('walkin_cart')
      localStorage.removeItem('walkin_customer')
      localStorage.removeItem('walkin_instructions')
      localStorage.removeItem('walkin_discount')
      localStorage.removeItem('order_data')
      
      console.log('🔒 Auth state cleared')
    }
  }

  async logout() {
    try {
      // Clear printer assets when logging out
      if (typeof window !== 'undefined' && window.electron) {
        try {
          await window.electron.invoke('delete-printer-assets')
          console.log('🖨️ Printer assets cleared')
        } catch (err) {
          console.log('⚠️ Failed to clear printer assets:', err)
        }
      }

      // Stop network print listener
      if (typeof window !== 'undefined') {
        try {
          const { networkPrintListener } = await import('./networkPrintListener')
          networkPrintListener.stopListening()
          console.log('🔌 Network print listener stopped')
        } catch (error) {
          console.log('⚠️ Network print listener cleanup skipped')
        }
      }

      // End session in database
      if (this.currentSession?.id) {
        await this.endSession(this.currentSession.id)
      }

      // Clear permissions
      try {
        const { permissionManager } = await import('./permissionManager')
        permissionManager.clearPermissions()
      } catch (error) {
        console.log('Permission manager not available')
      }

      // Clear local state
      this.clearAuth()

      // Clear cache manager if available
      if (typeof window !== 'undefined') {
        try {
          const { cacheManager } = await import('./cacheManager')
          cacheManager.clearCache()
          cacheManager.resetSession()
        } catch (error) {
          console.log('Cache manager not available')
        }
      }

      console.log('✅ Logged out successfully')
    } catch (error) {
      console.error('❌ Logout error:', error)
      // Force clear even if errors
      this.clearAuth()
    }
  }

  updateSessionTime() {
    if (this.isAuthenticated && typeof window !== 'undefined') {
      localStorage.setItem('last_activity', new Date().toISOString())
    }
  }

  getSessionInfo() {
    if (!this.isAuthenticated) return null

    try {
      const loginTime = localStorage.getItem('login_time')
      const lastActivity = localStorage.getItem('last_activity')
      
      if (!loginTime) return null

      const loginDate = new Date(loginTime)
      const now = new Date()
      const hoursActive = (now - loginDate) / (1000 * 60 * 60)

      return {
        loginTime: loginDate,
        lastActivity: lastActivity ? new Date(lastActivity) : loginDate,
        hoursActive: hoursActive,
        role: this.currentRole,
        userName: this.getDisplayName(),
        sessionId: this.currentSession?.id
      }
    } catch (error) {
      return null
    }
  }

  refreshAuthState() {
    return this.loadAuthState()
  }
}

// Create singleton instance
export const authManager = new AuthManager()

// React hook for authentication
export const useAuth = () => authManager