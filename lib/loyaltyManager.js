import { supabase } from './supabase'

/**
 * LoyaltyManager - Manages loyalty points rules, customer points, and calculations
 * Singleton pattern with offline syncing support
 */
class LoyaltyManager {
  constructor() {
    if (LoyaltyManager.instance) {
      return LoyaltyManager.instance
    }

    this.loyaltyRules = []
    this.redemptionOptions = []
    this.customerPoints = new Map() // Map<customerId, pointsData>
    // Start optimistically online — navigator.onLine is unreliable in packaged Electron
    this.isOnline = true
    this.lastSync = null
    this.isSyncing = false

    // Network status listeners - only on client-side
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true
        this.syncLoyaltyData()
      })

      window.addEventListener('offline', () => {
        this.isOnline = false
      })
    }

    LoyaltyManager.instance = this
  }

  /**
   * Initialize loyalty data from cache or fetch from server
   */
  async initialize(userId) {
    if (!userId) {
      console.warn('⚠️ LoyaltyManager: No userId provided')
      return
    }

    this.userId = userId

    // Load from localStorage first
    this.loadFromCache()

    // Fetch fresh data if online
    if (this.isOnline) {
      await this.syncLoyaltyData()
    }
  }

  /**
   * Load loyalty data from localStorage cache
   */
  loadFromCache() {
    if (typeof localStorage === 'undefined') return
    try {
      const cachedRules = localStorage.getItem('loyalty_rules')
      const cachedRedemptions = localStorage.getItem('loyalty_redemptions')
      const cachedCustomerPoints = localStorage.getItem('loyalty_customer_points')

      if (cachedRules) {
        this.loyaltyRules = JSON.parse(cachedRules)
        console.log(`✅ Loaded ${this.loyaltyRules.length} loyalty rules from cache`)
      }

      if (cachedRedemptions) {
        this.redemptionOptions = JSON.parse(cachedRedemptions)
        console.log(`✅ Loaded ${this.redemptionOptions.length} redemption options from cache`)
      }

      if (cachedCustomerPoints) {
        const pointsArray = JSON.parse(cachedCustomerPoints)
        this.customerPoints = new Map(pointsArray.map(p => [p.customer_id, p]))
        console.log(`✅ Loaded ${this.customerPoints.size} customer points from cache`)
      }
    } catch (error) {
      console.error('❌ Error loading loyalty data from cache:', error)
    }
  }

  /**
   * Save loyalty data to localStorage cache
   */
  saveToCache() {
    if (typeof localStorage === 'undefined') return
    try {
      localStorage.setItem('loyalty_rules', JSON.stringify(this.loyaltyRules))
      localStorage.setItem('loyalty_redemptions', JSON.stringify(this.redemptionOptions))
      localStorage.setItem(
        'loyalty_customer_points',
        JSON.stringify(Array.from(this.customerPoints.values()))
      )
      console.log('💾 Loyalty data saved to cache')
    } catch (error) {
      console.error('❌ Error saving loyalty data to cache:', error)
    }
  }

  /**
   * Sync all loyalty data from Supabase
   */
  async syncLoyaltyData() {
    if (!this.isOnline || this.isSyncing || !this.userId) {
      return
    }

    this.isSyncing = true
    console.log('🔄 Syncing loyalty data...')

    try {
      // Fetch active loyalty rules
      const { data: rulesData, error: rulesError } = await supabase
        .from('loyalty_rules')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('priority', { ascending: false })

      if (rulesError) throw rulesError

      // Filter rules by date range
      const now = new Date()
      this.loyaltyRules = (rulesData || []).filter(rule => {
        const startValid = !rule.start_date || new Date(rule.start_date) <= now
        const endValid = !rule.end_date || new Date(rule.end_date) >= now
        return startValid && endValid
      })

      console.log(`✅ Synced ${this.loyaltyRules.length} active loyalty rules`)

      // Fetch active redemption options
      const { data: redemptionsData, error: redemptionsError } = await supabase
        .from('loyalty_redemption_options')
        .select('*')
        .eq('user_id', this.userId)
        .eq('is_active', true)
        .order('points_required', { ascending: true })

      if (redemptionsError) throw redemptionsError

      // Filter redemptions by date range
      this.redemptionOptions = (redemptionsData || []).filter(option => {
        const fromValid = !option.valid_from || new Date(option.valid_from) <= now
        const untilValid = !option.valid_until || new Date(option.valid_until) >= now
        return fromValid && untilValid
      })

      console.log(`✅ Synced ${this.redemptionOptions.length} active redemption options`)

      // Save to cache
      this.saveToCache()
      this.lastSync = new Date()
    } catch (error) {
      console.error('❌ Error syncing loyalty data:', error)
    } finally {
      this.isSyncing = false
    }
  }

  /**
   * Get customer loyalty points
   */
  async getCustomerPoints(customerId) {
    if (!customerId) return null

    // Check cache first
    if (this.customerPoints.has(customerId)) {
      return this.customerPoints.get(customerId)
    }

    // Fetch from database if online
    if (this.isOnline && this.userId) {
      try {
        const { data, error } = await supabase
          .from('customer_loyalty_points')
          .select('*')
          .eq('customer_id', customerId)
          .eq('user_id', this.userId)
          .single()

        if (error && error.code !== 'PGRST116') {
          // PGRST116 = no rows returned
          throw error
        }

        const pointsData = data || {
          customer_id: customerId,
          current_balance: 0,
          total_points_earned: 0,
          points_redeemed: 0,
          loyalty_tier: 'BRONZE'
        }

        this.customerPoints.set(customerId, pointsData)
        this.saveToCache()
        return pointsData
      } catch (error) {
        console.error('❌ Error fetching customer points:', error)
      }
    }

    return null
  }

  /**
   * Calculate loyalty points for an order
   * Returns: { totalPoints, breakdown: [{ ruleName, points, ruleId }] }
   */
  calculatePointsForOrder(orderData) {
    if (!this.loyaltyRules || this.loyaltyRules.length === 0) {
      return { totalPoints: 0, breakdown: [] }
    }

    const {
      customerId,
      orderType, // 'walkin', 'takeaway', 'delivery'
      subtotal,
      items, // cart items with product_id, category_id, quantity
      orderDate = new Date()
    } = orderData

    const breakdown = []
    let totalPoints = 0

    // Evaluate each rule
    for (const rule of this.loyaltyRules) {
      const rulePoints = this.evaluateRule(rule, orderData)

      if (rulePoints > 0) {
        // Apply max points per order limit
        const cappedPoints = rule.max_points_per_order
          ? Math.min(rulePoints, rule.max_points_per_order)
          : rulePoints

        breakdown.push({
          ruleName: rule.rule_name,
          ruleId: rule.id,
          points: cappedPoints,
          description: this.getRuleDescription(rule)
        })

        totalPoints += cappedPoints
      }
    }

    return { totalPoints: Math.floor(totalPoints), breakdown }
  }

  /**
   * Evaluate a single loyalty rule against order data
   */
  evaluateRule(rule, orderData) {
    const conditions = rule.conditions || {}
    const rewards = rule.rewards || {}

    // Check all conditions
    if (!this.checkConditions(conditions, orderData)) {
      return 0
    }

    // Calculate points based on reward type
    return this.calculateRewardPoints(rewards, orderData)
  }

  /**
   * Check if order meets all rule conditions
   */
  checkConditions(conditions, orderData) {
    const { customerId, orderType, subtotal, items, orderDate } = orderData

    // Customer condition
    if (conditions.customer) {
      if (conditions.customer.type === 'specific') {
        if (!conditions.customer.value?.includes(customerId)) {
          return false
        }
      }
      // Group conditions not checked in POS (requires customer metadata)
    }

    // Day condition
    if (conditions.days && conditions.days.type === 'specific') {
      const dayOfWeek = new Date(orderDate).getDay() // 0 = Sunday, 6 = Saturday
      if (!conditions.days.value?.includes(dayOfWeek)) {
        return false
      }
    }

    // Time condition
    if (conditions.time && conditions.time.type === 'range') {
      const currentTime = new Date(orderDate).toTimeString().substring(0, 5) // HH:MM
      if (currentTime < conditions.time.start || currentTime > conditions.time.end) {
        return false
      }
    }

    // Product condition
    if (conditions.products && conditions.products.type !== 'all') {
      const hasMatchingProduct = items.some(item => {
        if (conditions.products.type === 'specific') {
          return conditions.products.value?.includes(item.product_id)
        } else if (conditions.products.type === 'category') {
          return conditions.products.value?.includes(item.category_id)
        }
        return false
      })

      if (!hasMatchingProduct) {
        return false
      }
    }

    // Order type condition
    if (conditions.order_type && conditions.order_type.type === 'specific') {
      if (!conditions.order_type.value?.includes(orderType.toLowerCase())) {
        return false
      }
    }

    // Order value condition
    if (conditions.order_value) {
      if (conditions.order_value.type === 'minimum') {
        if (subtotal < conditions.order_value.min) {
          return false
        }
      } else if (conditions.order_value.type === 'range') {
        if (subtotal < conditions.order_value.min || subtotal > conditions.order_value.max) {
          return false
        }
      }
    }

    // Item count condition
    if (conditions.item_count && conditions.item_count.type === 'minimum') {
      const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)
      if (totalItems < conditions.item_count.min) {
        return false
      }
    }

    return true
  }

  /**
   * Calculate reward points based on reward type
   */
  calculateRewardPoints(rewards, orderData) {
    const { subtotal, items } = orderData

    switch (rewards.type) {
      case 'fixed':
        return rewards.points_per_order || 0

      case 'per_product':
        const totalProducts = items.reduce((sum, item) => sum + item.quantity, 0)
        return (rewards.points_per_product || 0) * totalProducts

      case 'per_rupee':
        const threshold = rewards.rupee_threshold || 100
        const pointsPerRupee = rewards.points_per_rupee || 0
        return Math.floor(subtotal / threshold) * pointsPerRupee

      case 'multiplier':
        // Multiplier needs base points from other rules
        // For now, return 0 as it should be applied after base calculation
        // This would need special handling in calculatePointsForOrder
        return 0

      case 'bonus':
        return rewards.bonus_points || 0

      default:
        return 0
    }
  }

  /**
   * Get human-readable description of a rule
   */
  getRuleDescription(rule) {
    const rewards = rule.rewards || {}

    switch (rewards.type) {
      case 'fixed':
        return `${rewards.points_per_order} points per order`
      case 'per_product':
        return `${rewards.points_per_product} points per product`
      case 'per_rupee':
        return `${rewards.points_per_rupee} point per ${rewards.rupee_threshold} PKR`
      case 'multiplier':
        return `${rewards.multiplier}x points`
      case 'bonus':
        return `${rewards.bonus_points} bonus points`
      default:
        return 'Custom reward'
    }
  }

  /**
   * Award points to customer (call after order is saved)
   */
  async awardPoints(customerId, orderId, pointsData) {
    if (!this.isOnline || !this.userId) {
      // Queue the award so it syncs when back online
      const pending = JSON.parse(localStorage.getItem('pending_loyalty_sync') || '[]')
      pending.push({
        type: 'award',
        customerId,
        orderId,
        pointsData,
        timestamp: new Date().toISOString()
      })
      localStorage.setItem('pending_loyalty_sync', JSON.stringify(pending))

      // Optimistically update local cache so UI shows correct balance
      const currentPoints = this.customerPoints.get(customerId) || {
        customer_id: customerId,
        current_balance: 0,
        total_points_earned: 0,
        points_redeemed: 0,
        loyalty_tier: 'BRONZE'
      }
      this.customerPoints.set(customerId, {
        ...currentPoints,
        current_balance: (currentPoints.current_balance || 0) + (pointsData.totalPoints || 0),
        total_points_earned: (currentPoints.total_points_earned || 0) + (pointsData.totalPoints || 0)
      })
      this.saveToCache()

      console.warn(`⏸️ Queued ${pointsData.totalPoints} loyalty points for customer ${customerId} (offline sync pending)`)
      return { success: false, offline: true, queued: true }
    }

    try {
      const { totalPoints, breakdown } = pointsData

      if (totalPoints <= 0) {
        return { success: true, points: 0 }
      }

      // Get current customer points
      const currentPoints = await this.getCustomerPoints(customerId)
      const currentBalance = currentPoints?.current_balance || 0

      // Upsert customer_loyalty_points
      const { error: upsertError } = await supabase
        .from('customer_loyalty_points')
        .upsert(
          {
            customer_id: customerId,
            user_id: this.userId,
            current_balance: currentBalance + totalPoints,
            total_points_earned: (currentPoints?.total_points_earned || 0) + totalPoints,
            last_earned_at: new Date().toISOString()
          },
          {
            onConflict: 'customer_id,user_id'
          }
        )

      if (upsertError) throw upsertError

      // Insert loyalty points log for each rule
      const logsToInsert = breakdown.map(b => ({
        customer_id: customerId,
        user_id: this.userId,
        order_id: orderId,
        transaction_type: 'EARNED',
        points: b.points,
        rule_id: b.ruleId,
        rule_name: b.ruleName,
        order_type: pointsData.orderType,
        order_total: pointsData.subtotal,
        order_date: new Date().toISOString(),
        balance_before: currentBalance,
        balance_after: currentBalance + totalPoints
      }))

      const { error: logError } = await supabase
        .from('loyalty_points_log')
        .insert(logsToInsert)

      if (logError) {
        console.error('❌ Error logging loyalty points:', JSON.stringify(logError, null, 2))
        console.error('❌ Data being inserted:', JSON.stringify(logsToInsert, null, 2))
        // Don't fail the whole operation if logging fails
      }

      // Update local cache
      this.customerPoints.set(customerId, {
        ...currentPoints,
        current_balance: currentBalance + totalPoints,
        total_points_earned: (currentPoints?.total_points_earned || 0) + totalPoints,
        last_earned_at: new Date().toISOString()
      })
      this.saveToCache()

      console.log(`✅ Awarded ${totalPoints} points to customer ${customerId}`)
      return { success: true, points: totalPoints }
    } catch (error) {
      console.error('❌ Error awarding loyalty points:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * Sync any pending offline loyalty awards/redemptions to Supabase.
   * Called by cacheManager.syncOfflineData() when back online.
   */
  async syncPendingLoyalty() {
    if (!this.isOnline || !this.userId) return { success: false, synced: 0 }

    const pending = JSON.parse(localStorage.getItem('pending_loyalty_sync') || '[]')
    const unsynced = pending.filter(item => !item.synced)

    if (unsynced.length === 0) {
      console.log('✅ [Loyalty] No pending loyalty sync entries')
      return { success: true, synced: 0 }
    }

    console.log(`🔄 [Loyalty] Syncing ${unsynced.length} pending loyalty entries...`)
    let syncedCount = 0

    for (const item of unsynced) {
      try {
        if (item.type === 'award') {
          const result = await this.awardPoints(item.customerId, item.orderId, item.pointsData)
          if (result.success) {
            item.synced = true
            syncedCount++
            console.log(`✅ [Loyalty] Synced award: ${item.pointsData?.totalPoints} pts for ${item.customerId}`)
          }
        } else if (item.type === 'redeem') {
          const result = await this.redeemPoints(
            item.customerId,
            item.orderId,
            item.redemptionOptionId,
            item.pointsUsed,
            item.discountApplied
          )
          if (result.success) {
            item.synced = true
            syncedCount++
            console.log(`✅ [Loyalty] Synced redemption: ${item.pointsUsed} pts for ${item.customerId}`)
          }
        }
      } catch (error) {
        console.error(`❌ [Loyalty] Failed to sync entry:`, error)
      }
    }

    localStorage.setItem('pending_loyalty_sync', JSON.stringify(pending))
    console.log(`✅ [Loyalty] Sync complete: ${syncedCount}/${unsynced.length} entries synced`)
    return { success: true, synced: syncedCount, total: unsynced.length }
  }

  /**
   * Get available redemption options for a customer
   */
  getAvailableRedemptions(customerBalance) {
    return this.redemptionOptions.filter(option => option.points_required <= customerBalance)
  }

  /**
   * Redeem points (apply discount/reward)
   */
  async redeemPoints(customerId, orderId, redemptionOptionId, pointsUsed, discountApplied = 0) {
    if (!this.isOnline || !this.userId) {
      // Queue the redemption so it syncs when back online
      const pending = JSON.parse(localStorage.getItem('pending_loyalty_sync') || '[]')
      pending.push({
        type: 'redeem',
        customerId,
        orderId,
        redemptionOptionId,
        pointsUsed,
        discountApplied,
        timestamp: new Date().toISOString()
      })
      localStorage.setItem('pending_loyalty_sync', JSON.stringify(pending))

      // Optimistically deduct from local cache so UI stays consistent
      const currentPoints = this.customerPoints.get(customerId)
      if (currentPoints) {
        this.customerPoints.set(customerId, {
          ...currentPoints,
          current_balance: Math.max(0, (currentPoints.current_balance || 0) - pointsUsed),
          points_redeemed: (currentPoints.points_redeemed || 0) + pointsUsed
        })
        this.saveToCache()
      }

      console.warn(`⏸️ Queued redemption of ${pointsUsed} points for customer ${customerId} (offline sync pending)`)
      return { success: false, offline: true, queued: true }
    }

    try {
      // Get current customer points
      const currentPoints = await this.getCustomerPoints(customerId)
      const currentBalance = currentPoints?.current_balance || 0

      if (currentBalance < pointsUsed) {
        return { success: false, error: 'Insufficient points' }
      }

      // Update customer points
      const newBalance = currentBalance - pointsUsed

      const { error: updateError } = await supabase
        .from('customer_loyalty_points')
        .update({
          current_balance: newBalance,
          points_redeemed: (currentPoints?.points_redeemed || 0) + pointsUsed,
          last_redeemed_at: new Date().toISOString()
        })
        .eq('customer_id', customerId)
        .eq('user_id', this.userId)

      if (updateError) throw updateError

      // Log redemption
      const { error: logError } = await supabase.from('loyalty_points_log').insert([
        {
          customer_id: customerId,
          user_id: this.userId,
          order_id: orderId,
          transaction_type: 'REDEEMED',
          points: -pointsUsed,
          balance_before: currentBalance,
          balance_after: newBalance,
          notes: `Redeemed via redemption option - PKR ${discountApplied} discount`
        }
      ])

      if (logError) {
        console.error('❌ Error logging redemption:', JSON.stringify(logError, null, 2))
      }

      // Insert redemption record
      const { error: redemptionError } = await supabase.from('loyalty_redemptions').insert([
        {
          customer_id: customerId,
          user_id: this.userId,
          order_id: orderId,
          redemption_option_id: redemptionOptionId,
          points_used: pointsUsed,
          discount_applied: discountApplied
        }
      ])

      if (redemptionError) {
        console.error('❌ Error recording redemption:', JSON.stringify(redemptionError, null, 2))
      }

      // Update local cache
      this.customerPoints.set(customerId, {
        ...currentPoints,
        current_balance: newBalance,
        points_redeemed: (currentPoints?.points_redeemed || 0) + pointsUsed,
        last_redeemed_at: new Date().toISOString()
      })
      this.saveToCache()

      console.log(`✅ Redeemed ${pointsUsed} points for customer ${customerId} - PKR ${discountApplied} discount`)
      return { success: true, newBalance, discountApplied }
    } catch (error) {
      console.error('❌ Error redeeming points:', error)
      return { success: false, error: error.message }
    }
  }
}

// Export singleton instance
const loyaltyManager = new LoyaltyManager()
export default loyaltyManager
