// lib/utils/orderSnapshotManager.js
// Manages order snapshots for tracking changes when orders are modified
// Supports both ONLINE and OFFLINE modes

import { supabase } from '../supabase'

/**
 * Capture and store original order items snapshot
 * Call this right after creating an order and its items
 * Works for both online and offline orders
 */
export async function captureOrderSnapshot(orderId, orderItems) {
  try {
    console.log('📸 [Snapshot] Capturing original items for order:', orderId)

    // Create a lightweight snapshot of items
    const snapshot = orderItems.map(item => ({
      product_id: item.product_id,
      variant_id: item.variant_id,
      product_name: item.product_name,
      variant_name: item.variant_name,
      quantity: item.quantity,
      is_deal: item.is_deal || false,
      deal_id: item.deal_id || null,
      deal_products: item.deal_products || null
    }))

    // Check if online or offline
    const isOnline = navigator.onLine

    if (isOnline) {
      // ONLINE: Store in database
      const { error } = await supabase
        .from('orders')
        .update({ original_items_snapshot: snapshot })
        .eq('id', orderId)

      if (error) {
        console.error('❌ [Snapshot] Error storing snapshot in database:', error)
        // Fallback to cache
        storeSnapshotInCache(orderId, snapshot)
        return { success: true, snapshot, source: 'cache-fallback' }
      }

      // Also store in cache for offline access
      storeSnapshotInCache(orderId, snapshot)
      console.log('✅ [Snapshot] Captured snapshot in database + cache:', snapshot.length, 'items')
      return { success: true, snapshot, source: 'database' }
    } else {
      // OFFLINE: Store in cache only
      storeSnapshotInCache(orderId, snapshot)
      console.log('✅ [Snapshot] Captured snapshot in cache (offline):', snapshot.length, 'items')
      return { success: true, snapshot, source: 'cache' }
    }

  } catch (error) {
    console.error('❌ [Snapshot] Error:', error)
    // Try to save to cache as fallback
    try {
      storeSnapshotInCache(orderId, orderItems)
      return { success: true, snapshot: orderItems, source: 'cache-emergency' }
    } catch (cacheError) {
      return { success: false, error: error.message }
    }
  }
}

/**
 * Store snapshot in localStorage cache
 */
function storeSnapshotInCache(orderId, snapshot) {
  try {
    if (typeof window === 'undefined') return

    // Get existing snapshots from cache
    const cachedSnapshots = JSON.parse(localStorage.getItem('order_snapshots') || '{}')

    // Add this order's snapshot
    cachedSnapshots[orderId] = snapshot

    // Store back
    localStorage.setItem('order_snapshots', JSON.stringify(cachedSnapshots))

    console.log('💾 [Snapshot] Stored in cache for order:', orderId)
  } catch (error) {
    console.error('❌ [Snapshot] Error storing in cache:', error)
  }
}

/**
 * Get snapshot from cache
 */
function getSnapshotFromCache(orderId) {
  try {
    if (typeof window === 'undefined') return null

    const cachedSnapshots = JSON.parse(localStorage.getItem('order_snapshots') || '{}')
    return cachedSnapshots[orderId] || null
  } catch (error) {
    console.error('❌ [Snapshot] Error reading from cache:', error)
    return null
  }
}

/**
 * Get original order items snapshot
 * Checks cache first (for offline), then database (for online)
 */
export async function getOrderSnapshot(orderId) {
  try {
    // First try cache (works offline and is faster)
    const cachedSnapshot = getSnapshotFromCache(orderId)

    if (cachedSnapshot) {
      console.log('📦 [Snapshot] Found in cache for order:', orderId)
      return cachedSnapshot
    }

    // If online, try database
    if (navigator.onLine) {
      const { data, error } = await supabase
        .from('orders')
        .select('original_items_snapshot')
        .eq('id', orderId)
        .single()

      if (error) {
        console.error('❌ [Snapshot] Error fetching from database:', error)
        return null
      }

      const snapshot = data?.original_items_snapshot || null

      // Cache it for offline use
      if (snapshot) {
        storeSnapshotInCache(orderId, snapshot)
      }

      console.log('📡 [Snapshot] Found in database for order:', orderId)
      return snapshot
    }

    console.log('📴 [Snapshot] No snapshot found (offline, not in cache)')
    return null

  } catch (error) {
    console.error('❌ [Snapshot] Error:', error)
    // Try cache as fallback
    return getSnapshotFromCache(orderId)
  }
}

/**
 * Compare current items with snapshot to detect changes
 * Works for offline mode too (using cached snapshot)
 */
export function compareWithSnapshot(originalSnapshot, currentItems) {
  if (!originalSnapshot || originalSnapshot.length === 0) {
    return {
      hasChanges: false,
      addedItems: [],
      removedItems: [],
      unchangedItems: currentItems || []
    }
  }

  const added = []
  const removed = []
  const unchanged = []

  // Create maps for quick lookup
  const originalMap = new Map()
  originalSnapshot.forEach(item => {
    const key = `${item.product_id}-${item.variant_id || 'base'}`
    const existing = originalMap.get(key)
    originalMap.set(key, {
      ...item,
      quantity: (existing?.quantity || 0) + item.quantity
    })
  })

  const currentMap = new Map()
  currentItems.forEach(item => {
    const key = `${item.product_id || item.productId}-${item.variant_id || item.variantId || 'base'}`
    const existing = currentMap.get(key)
    currentMap.set(key, {
      ...item,
      quantity: (existing?.quantity || 0) + item.quantity
    })
  })

  // Find added and unchanged items
  currentMap.forEach((currentItem, key) => {
    const originalItem = originalMap.get(key)

    if (!originalItem) {
      // Item is new - ADDED
      added.push({
        ...currentItem,
        changeType: 'added'
      })
    } else if (currentItem.quantity > originalItem.quantity) {
      // Quantity increased
      added.push({
        ...currentItem,
        quantity: currentItem.quantity - originalItem.quantity,
        changeType: 'added'
      })
      unchanged.push({
        ...currentItem,
        quantity: originalItem.quantity,
        changeType: 'unchanged'
      })
    } else if (currentItem.quantity < originalItem.quantity) {
      // Quantity decreased
      removed.push({
        ...currentItem,
        quantity: originalItem.quantity - currentItem.quantity,
        changeType: 'removed'
      })
      unchanged.push({
        ...currentItem,
        changeType: 'unchanged'
      })
    } else {
      // Same quantity - UNCHANGED
      unchanged.push({
        ...currentItem,
        changeType: 'unchanged'
      })
    }
  })

  // Find removed items
  originalMap.forEach((originalItem, key) => {
    if (!currentMap.has(key)) {
      // Item was completely removed
      removed.push({
        ...originalItem,
        changeType: 'removed'
      })
    }
  })

  return {
    hasChanges: added.length > 0 || removed.length > 0,
    addedItems: added,
    removedItems: removed,
    unchangedItems: unchanged
  }
}

/**
 * Get order with snapshot for printing
 * Fetches order and compares current items with snapshot
 * Works for both online and offline orders
 */
export async function getOrderWithChanges(orderId, currentOrderItems) {
  try {
    // Fetch snapshot (checks cache first, then database)
    const snapshot = await getOrderSnapshot(orderId)

    if (!snapshot) {
      console.log('ℹ️ [Snapshot] No snapshot found, treating as new order')
      return {
        hasChanges: false,
        items: currentOrderItems
      }
    }

    console.log('🔍 [Snapshot] Comparing current items with snapshot:', {
      snapshot: snapshot.length,
      current: currentOrderItems.length
    })

    // Compare current items with snapshot
    const changes = compareWithSnapshot(snapshot, currentOrderItems)

    if (changes.hasChanges) {
      console.log('✅ [Snapshot] Changes detected:', {
        added: changes.addedItems.length,
        removed: changes.removedItems.length,
        unchanged: changes.unchangedItems.length
      })

      // Merge items with change indicators
      const mergedItems = [
        ...changes.addedItems,
        ...changes.removedItems,
        ...changes.unchangedItems
      ]

      return {
        hasChanges: true,
        items: mergedItems,
        changes
      }
    }

    console.log('ℹ️ [Snapshot] No changes detected')
    return {
      hasChanges: false,
      items: currentOrderItems
    }

  } catch (error) {
    console.error('❌ [Snapshot] Error getting order with changes:', error)
    return {
      hasChanges: false,
      items: currentOrderItems
    }
  }
}

/**
 * Sync cached snapshots to database when coming online
 * Call this when internet connection is restored
 */
export async function syncSnapshotsToDatabase() {
  try {
    if (!navigator.onLine) {
      console.log('📴 [Snapshot Sync] Still offline, skipping sync')
      return { success: false, reason: 'offline' }
    }

    const cachedSnapshots = JSON.parse(localStorage.getItem('order_snapshots') || '{}')
    const orderIds = Object.keys(cachedSnapshots)

    if (orderIds.length === 0) {
      console.log('ℹ️ [Snapshot Sync] No snapshots to sync')
      return { success: true, synced: 0 }
    }

    console.log(`🔄 [Snapshot Sync] Syncing ${orderIds.length} snapshots to database...`)

    let synced = 0
    let failed = 0

    for (const orderId of orderIds) {
      const snapshot = cachedSnapshots[orderId]

      // Check if snapshot already exists in database
      const { data: existingOrder } = await supabase
        .from('orders')
        .select('original_items_snapshot')
        .eq('id', orderId)
        .single()

      // Only sync if snapshot doesn't exist in database
      if (!existingOrder?.original_items_snapshot) {
        const { error } = await supabase
          .from('orders')
          .update({ original_items_snapshot: snapshot })
          .eq('id', orderId)

        if (error) {
          console.error(`❌ [Snapshot Sync] Failed to sync order ${orderId}:`, error)
          failed++
        } else {
          console.log(`✅ [Snapshot Sync] Synced order ${orderId}`)
          synced++
        }
      }
    }

    console.log(`🎉 [Snapshot Sync] Complete: ${synced} synced, ${failed} failed`)
    return { success: true, synced, failed }

  } catch (error) {
    console.error('❌ [Snapshot Sync] Error:', error)
    return { success: false, error: error.message }
  }
}
