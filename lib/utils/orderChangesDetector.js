// lib/utils/orderChangesDetector.js
// Utility to detect changes in order items when order is reopened and modified

/**
 * Compare original and current order items to detect changes
 * @param {Array} originalItems - Original order items from when order was first created
 * @param {Array} currentItems - Current order items (after modification)
 * @returns {Object} - Object containing added, removed, and unchanged items
 */
export function detectOrderChanges(originalItems, currentItems) {
  if (!originalItems || originalItems.length === 0) {
    // No original items means this is not a reopened order
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

  // Create a map of original items for quick lookup
  // Key format: "productId-variantId" or "productId-base" for items without variant
  const originalMap = new Map()
  originalItems.forEach(item => {
    const key = `${item.productId || item.product_id}-${item.variantId || item.variant_id || 'base'}`
    const existingQty = originalMap.get(key)?.quantity || 0
    originalMap.set(key, {
      ...item,
      quantity: existingQty + (item.quantity || 0)
    })
  })

  // Create a map of current items
  const currentMap = new Map()
  currentItems.forEach(item => {
    const key = `${item.productId || item.product_id}-${item.variantId || item.variant_id || 'base'}`
    const existingQty = currentMap.get(key)?.quantity || 0
    currentMap.set(key, {
      ...item,
      quantity: existingQty + (item.quantity || 0)
    })
  })

  // Find added and unchanged items
  currentMap.forEach((currentItem, key) => {
    const originalItem = originalMap.get(key)

    if (!originalItem) {
      // Item is in current but not in original = ADDED
      added.push({
        ...currentItem,
        changeType: 'added'
      })
    } else if (currentItem.quantity > originalItem.quantity) {
      // Quantity increased = partially ADDED
      const addedQty = currentItem.quantity - originalItem.quantity
      added.push({
        ...currentItem,
        quantity: addedQty,
        changeType: 'added',
        note: `+${addedQty} added`
      })
      // Also keep the original quantity as unchanged
      unchanged.push({
        ...currentItem,
        quantity: originalItem.quantity,
        changeType: 'unchanged'
      })
    } else if (currentItem.quantity < originalItem.quantity) {
      // Quantity decreased = partially REMOVED
      const removedQty = originalItem.quantity - currentItem.quantity
      removed.push({
        ...currentItem,
        quantity: removedQty,
        changeType: 'removed',
        note: `-${removedQty} removed`
      })
      // Keep the remaining quantity as unchanged
      unchanged.push({
        ...currentItem,
        changeType: 'unchanged'
      })
    } else {
      // Same quantity = UNCHANGED
      unchanged.push({
        ...currentItem,
        changeType: 'unchanged'
      })
    }
  })

  // Find removed items (in original but not in current)
  originalMap.forEach((originalItem, key) => {
    if (!currentMap.has(key)) {
      // Item was in original but not in current = REMOVED
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
 * Get original items from localStorage (for reopened orders)
 * @returns {Array|null} - Original items or null if not a reopened order
 */
export function getOriginalOrderItems() {
  if (typeof window === 'undefined') return null

  try {
    const reopenData = localStorage.getItem('order_reopen_data')
    if (!reopenData) return null

    const data = JSON.parse(reopenData)
    return data.originalItems || null
  } catch (error) {
    console.error('Error getting original order items:', error)
    return null
  }
}

/**
 * Check if current order is a reopened order
 * @returns {boolean}
 */
export function isReopenedOrder() {
  if (typeof window === 'undefined') return false

  const reopenData = localStorage.getItem('order_reopen_data')
  return reopenData !== null
}
