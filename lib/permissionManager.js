// lib/permissionManager.js - Permission Management System
import { supabase } from './supabase'
import { authManager } from './authManager'

class PermissionManager {
  constructor() {
    this.permissions = []
    this.permissionMap = new Map() // For quick lookups
    this.isLoaded = false
    this._cachePreloaded = false
  }

  /**
   * Load permissions for the current cashier
   * Called on login/app startup
   * Now with offline support via localStorage caching
   */
  async loadPermissions() {
    try {
      const cashier = authManager.getCashier()
      const role = authManager.getRole()

      // If admin, grant all permissions
      if (role === 'admin') {
        console.log('🔓 Admin role detected - granting all permissions')
        await this.loadAllPermissions()
        this.isLoaded = true
        return true
      }

      // If cashier, load their specific permissions
      if (cashier && cashier.id) {
        console.log('🔐 Loading permissions for cashier:', cashier.name)

        const cacheKey = `cashier_permissions_${cashier.id}`

        // Try to load from cache first (for offline mode)
        const cachedPermissions = this.loadFromCache(cacheKey)

        // Check if online
        const isOnline = navigator.onLine

        if (isOnline) {
          try {
            // Fetch fresh permissions from server
            const { data, error } = await supabase
              .from('cashier_permissions')
              .select(`
                *,
                permissions (
                  id,
                  permission_key,
                  permission_name,
                  description,
                  permission_type
                )
              `)
              .eq('cashier_id', cashier.id)

            if (error) throw error

            this.permissions = data?.map(cp => cp.permissions) || []

            // Save to cache for offline use
            this.saveToCache(cacheKey, this.permissions)

            console.log(`✅ Loaded ${this.permissions.length} permissions from server (cached for offline)`)
          } catch (error) {
            console.warn('⚠️ Failed to fetch from server, using cached permissions:', error)

            // Fallback to cache if server fetch fails
            if (cachedPermissions) {
              this.permissions = cachedPermissions
              console.log(`📦 Using ${this.permissions.length} cached permissions (offline mode)`)
            } else {
              throw new Error('No cached permissions available and server unreachable')
            }
          }
        } else {
          // Offline mode - use cache
          if (cachedPermissions) {
            this.permissions = cachedPermissions
            console.log(`📦 Using ${this.permissions.length} cached permissions (offline mode)`)
          } else {
            console.error('❌ No cached permissions found for offline mode')
            this.isLoaded = true
            return false
          }
        }

        // Build permission map for fast lookups
        this.permissionMap.clear()
        this.permissions.forEach(perm => {
          this.permissionMap.set(perm.permission_key, perm)
        })

        this.isLoaded = true
        return true
      }

      console.warn('⚠️ No cashier found, no permissions loaded')
      this.isLoaded = true
      return false

    } catch (error) {
      console.error('❌ Error loading permissions:', error)
      this.isLoaded = false
      return false
    }
  }

  /**
   * Load all permissions (for admin users)
   * Also cached for offline mode
   */
  async loadAllPermissions() {
    try {
      const cacheKey = 'admin_all_permissions'

      // Try cache first
      const cachedPermissions = this.loadFromCache(cacheKey)
      const isOnline = navigator.onLine

      if (isOnline) {
        try {
          const { data, error } = await supabase
            .from('permissions')
            .select('*')
            .order('permission_type', { ascending: false })
            .order('permission_name')

          if (error) throw error

          this.permissions = data || []

          // Cache for offline use
          this.saveToCache(cacheKey, this.permissions)

          console.log(`✅ Loaded all ${this.permissions.length} permissions (admin mode, cached)`)
        } catch (error) {
          console.warn('⚠️ Failed to fetch permissions, using cache:', error)
          if (cachedPermissions) {
            this.permissions = cachedPermissions
            console.log(`📦 Using ${this.permissions.length} cached permissions (offline mode)`)
          } else {
            throw error
          }
        }
      } else {
        // Offline - use cache
        if (cachedPermissions) {
          this.permissions = cachedPermissions
          console.log(`📦 Using ${this.permissions.length} cached permissions (offline mode)`)
        } else {
          console.error('❌ No cached permissions for offline mode')
          return false
        }
      }

      // Build permission map
      this.permissionMap.clear()
      this.permissions.forEach(perm => {
        this.permissionMap.set(perm.permission_key, perm)
      })

      return true

    } catch (error) {
      const errorMessage = error?.message || error?.error_description || JSON.stringify(error) || 'Unknown error'
      console.error('❌ Error loading all permissions:', errorMessage)
      return false
    }
  }

  /**
   * Save permissions to localStorage cache
   */
  saveToCache(key, permissions) {
    try {
      const cacheData = {
        permissions,
        timestamp: Date.now(),
        version: '1.0'
      }
      localStorage.setItem(key, JSON.stringify(cacheData))
      console.log(`💾 Cached ${permissions.length} permissions`)
    } catch (error) {
      console.error('❌ Failed to cache permissions:', error)
    }
  }

  /**
   * Load permissions from localStorage cache
   */
  loadFromCache(key) {
    try {
      const cached = localStorage.getItem(key)
      if (!cached) return null

      const cacheData = JSON.parse(cached)

      // Optional: Check if cache is too old (e.g., 30 days)
      const maxAge = 30 * 24 * 60 * 60 * 1000 // 30 days
      if (Date.now() - cacheData.timestamp > maxAge) {
        console.warn('⚠️ Cached permissions are too old, will refresh when online')
        // Don't delete - still useful for offline mode
      }

      return cacheData.permissions
    } catch (error) {
      console.error('❌ Failed to load cached permissions:', error)
      return null
    }
  }

  /**
   * Synchronously pre-populate permissionMap from localStorage cache.
   * Called by hasPermission() when the async load hasn't completed yet.
   * Eliminates the LOCKED flash on first render.
   */
  _loadFromCacheSync() {
    if (typeof window === 'undefined') return
    try {
      const cashier = authManager.getCashier()
      if (!cashier?.id) return
      const cached = this.loadFromCache(`cashier_permissions_${cashier.id}`)
      if (cached && cached.length > 0) {
        cached.forEach(perm => this.permissionMap.set(perm.permission_key, perm))
        console.log('⚡ [Permissions] Sync pre-loaded from cache:', cached.length, 'permissions')
      }
    } catch (e) { /* ignore */ }
    this._cachePreloaded = true
  }

  /**
   * Check if user has a specific permission
   * @param {string} permissionKey - The permission key (e.g., 'DASHBOARD', 'CANCEL_ORDER')
   * @returns {boolean}
   */
  hasPermission(permissionKey) {
    // Admin always has all permissions
    if (authManager.getRole() === 'admin') {
      return true
    }

    // If async load hasn't finished yet, try loading from localStorage cache synchronously
    // so the first render shows the correct state (no LOCKED flash)
    if (!this.isLoaded && !this._cachePreloaded) {
      this._loadFromCacheSync()
    }

    // Check if permission exists in the map
    return this.permissionMap.has(permissionKey)
  }

  /**
   * Check multiple permissions at once (OR logic)
   * Returns true if user has ANY of the specified permissions
   */
  hasAnyPermission(...permissionKeys) {
    if (authManager.getRole() === 'admin') {
      return true
    }

    return permissionKeys.some(key => this.hasPermission(key))
  }

  /**
   * Check multiple permissions at once (AND logic)
   * Returns true if user has ALL of the specified permissions
   */
  hasAllPermissions(...permissionKeys) {
    if (authManager.getRole() === 'admin') {
      return true
    }

    return permissionKeys.every(key => this.hasPermission(key))
  }

  /**
   * Get all permissions for current user
   */
  getAllPermissions() {
    return this.permissions
  }

  /**
   * Get permissions by type
   * @param {string} type - 'PAGE' or 'ACTION'
   */
  getPermissionsByType(type) {
    return this.permissions.filter(p => p.permission_type === type)
  }

  /**
   * Check if user has page access
   */
  canAccessPage(pageKey) {
    return this.hasPermission(pageKey)
  }

  /**
   * Check if user can perform an action
   */
  canPerformAction(actionKey) {
    return this.hasPermission(actionKey)
  }

  /**
   * Clear all permissions (on logout)
   * @param {boolean} clearCache - Whether to also clear localStorage cache
   */
  clearPermissions(clearCache = false) {
    this.permissions = []
    this.permissionMap.clear()
    this.isLoaded = false

    if (clearCache) {
      // Clear all permission caches
      const cashier = authManager.getCashier()
      if (cashier?.id) {
        localStorage.removeItem(`cashier_permissions_${cashier.id}`)
      }
      localStorage.removeItem('admin_all_permissions')
      console.log('🔒 Permissions cleared (including cache)')
    } else {
      console.log('🔒 Permissions cleared (cache preserved for offline mode)')
    }
  }

  /**
   * Reload permissions (useful after permission changes)
   * Clears memory but keeps cache
   */
  async reloadPermissions() {
    this.clearPermissions(false)
    return await this.loadPermissions()
  }

  /**
   * Force reload permissions from server (ignore cache)
   * Use this when admin updates permissions and cashier needs fresh data
   */
  async forceReloadFromServer() {
    try {
      const cashier = authManager.getCashier()
      const role = authManager.getRole()

      console.log('🔄 Force reloading permissions from server...')

      if (role === 'admin') {
        // Force fetch all permissions for admin
        const cacheKey = 'admin_all_permissions'
        const { data, error } = await supabase
          .from('permissions')
          .select('*')
          .order('permission_type', { ascending: false })
          .order('permission_name')

        if (error) throw error

        this.permissions = data || []
        this.saveToCache(cacheKey, this.permissions)

        console.log(`✅ Force reloaded ${this.permissions.length} permissions from server`)
      } else if (cashier && cashier.id) {
        // Force fetch cashier permissions
        const cacheKey = `cashier_permissions_${cashier.id}`
        const { data, error } = await supabase
          .from('cashier_permissions')
          .select(`
            *,
            permissions (
              id,
              permission_key,
              permission_name,
              description,
              permission_type
            )
          `)
          .eq('cashier_id', cashier.id)

        if (error) throw error

        this.permissions = data?.map(cp => cp.permissions) || []
        this.saveToCache(cacheKey, this.permissions)

        console.log(`✅ Force reloaded ${this.permissions.length} permissions from server`)
      }

      // Rebuild permission map
      this.permissionMap.clear()
      this.permissions.forEach(perm => {
        this.permissionMap.set(perm.permission_key, perm)
      })

      this.isLoaded = true
      return { success: true, count: this.permissions.length }

    } catch (error) {
      console.error('❌ Error force reloading permissions:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Check if permissions are loaded
   */
  isPermissionsLoaded() {
    return this.isLoaded
  }

  /**
   * Get permission details
   */
  getPermissionDetails(permissionKey) {
    return this.permissionMap.get(permissionKey) || null
  }

  // ============= PAGE-SPECIFIC CHECKS =============

  canAccessDashboard() {
    return this.hasPermission('DASHBOARD')
  }

  canAccessWalkinOrders() {
    return this.hasPermission('SALES_WALKIN')
  }

  canAccessTakeawayOrders() {
    return this.hasPermission('SALES_TAKEAWAY')
  }

  canAccessDeliveryOrders() {
    return this.hasPermission('SALES_DELIVERY')
  }

  canAccessOrders() {
    return this.hasPermission('ORDERS')
  }

  canAccessKDS() {
    return this.hasPermission('KDS')
  }

  canAccessExpenses() {
    return this.hasPermission('EXPENSES')
  }

  canAccessReports() {
    return this.hasPermission('REPORTS')
  }

  canAccessMarketing() {
    return this.hasPermission('MARKETING')
  }

  canAccessSettings() {
    return this.hasPermission('SETTINGS')
  }

  canAccessPrinters() {
    return this.hasPermission('PRINTERS')
  }

  canAccessWebOrders() {
    return this.hasPermission('WEB_ORDERS')
  }

  canAccessRiders() {
    return this.hasPermission('RIDERS')
  }

  canAccessOfflineOrders() {
    return this.hasPermission('OFFLINE_ORDERS')
  }

  canAccessPayment() {
    return this.hasPermission('PAYMENT')
  }

  // ============= ACTION-SPECIFIC CHECKS =============

  canCancelOrder() {
    return this.hasPermission('CANCEL_ORDER')
  }

  canReopenOrder() {
    return this.hasPermission('REOPEN_ORDER')
  }

  canDecreaseReopenQuantity() {
    return this.hasPermission('MODIFY_REOPEN_DECREASE_QTY')
  }

  // ============= UTILITY METHODS =============

  /**
   * Get missing permissions (for debugging)
   */
  getMissingPermissions(requiredPermissions) {
    if (authManager.getRole() === 'admin') {
      return []
    }

    return requiredPermissions.filter(key => !this.hasPermission(key))
  }

  /**
   * Log current permissions (for debugging)
   */
  logPermissions() {
    console.log('📋 Current Permissions:', {
      role: authManager.getRole(),
      isLoaded: this.isLoaded,
      count: this.permissions.length,
      permissions: this.permissions.map(p => p.permission_key)
    })
  }
}

// Create singleton instance
export const permissionManager = new PermissionManager()

// React hook for permissions
export const usePermissions = () => ({
  hasPermission: (key) => permissionManager.hasPermission(key),
  hasAnyPermission: (...keys) => permissionManager.hasAnyPermission(...keys),
  hasAllPermissions: (...keys) => permissionManager.hasAllPermissions(...keys),
  canAccessPage: (key) => permissionManager.canAccessPage(key),
  canPerformAction: (key) => permissionManager.canPerformAction(key),
  getAllPermissions: () => permissionManager.getAllPermissions(),
  getPermissionsByType: (type) => permissionManager.getPermissionsByType(type),
  isLoaded: () => permissionManager.isPermissionsLoaded(),

  // Page-specific checks
  canAccessDashboard: () => permissionManager.canAccessDashboard(),
  canAccessWalkinOrders: () => permissionManager.canAccessWalkinOrders(),
  canAccessTakeawayOrders: () => permissionManager.canAccessTakeawayOrders(),
  canAccessDeliveryOrders: () => permissionManager.canAccessDeliveryOrders(),
  canAccessOrders: () => permissionManager.canAccessOrders(),
  canAccessKDS: () => permissionManager.canAccessKDS(),
  canAccessExpenses: () => permissionManager.canAccessExpenses(),
  canAccessReports: () => permissionManager.canAccessReports(),
  canAccessMarketing: () => permissionManager.canAccessMarketing(),
  canAccessSettings: () => permissionManager.canAccessSettings(),
  canAccessPrinters: () => permissionManager.canAccessPrinters(),
  canAccessWebOrders: () => permissionManager.canAccessWebOrders(),
  canAccessRiders: () => permissionManager.canAccessRiders(),
  canAccessOfflineOrders: () => permissionManager.canAccessOfflineOrders(),
  canAccessPayment: () => permissionManager.canAccessPayment(),

  // Action-specific checks
  canCancelOrder: () => permissionManager.canCancelOrder(),
  canReopenOrder: () => permissionManager.canReopenOrder(),
  canDecreaseReopenQuantity: () => permissionManager.canDecreaseReopenQuantity()
})
