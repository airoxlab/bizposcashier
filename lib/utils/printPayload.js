// lib/utils/printPayload.js
//
// Single source of truth for building thermal-print payloads
// (kitchen token + receipt).
//
// The ESC/POS generators in electron/printing/usbPrinter.js read:
//   • per-item note    → item.instructions
//   • order-level note → orderData.specialNotes (fallback: orderData.notes)
//   • receipt amounts  → item.totalPrice / item.finalPrice
//
// Historically every page hand-built these payloads and the note field names
// drifted (item_instructions vs itemInstructions vs instructions vs notes),
// which silently dropped cart notes from kitchen tokens on some buttons.
// All print call sites must build their payloads through these helpers.

import { cacheManager } from '../cacheManager'

// Per-item note, tolerant of every shape that reaches a print handler:
// DB order_items rows use item_instructions, cart state uses itemInstructions,
// older payloads used instructions/notes.
export function getItemNote(item) {
  return (
    item.item_instructions ||
    item.itemInstructions ||
    item.instructions ||
    item.notes ||
    ''
  )
}

// deal_products is stored as JSON — it may arrive as a string, an array, or
// null. Normalize to [{ name, quantity, variant, flavor }], which is what the
// ESC/POS generator reads (it ignores everything else).
export function normalizeDealProducts(dealProducts) {
  let parsed = dealProducts
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed) } catch { parsed = [] }
  }
  if (!Array.isArray(parsed)) return []
  return parsed.map(p => ({
    name: p.name || p.product_name || p.productName || 'Item',
    quantity: p.quantity || p.qty || 1,
    variant: p.variant || p.variant_name || p.variantName || null,
    flavor: p.flavor || null,
  }))
}

// product_id → category_id lookup from the offline cache, used for
// category-based printer routing when an item row lacks category_id.
export function buildProductCategoryMap() {
  const map = {}
  cacheManager.cache?.products?.forEach(p => { map[p.id] = p.category_id })
  return map
}

// Map order items — DB order_items rows (snake_case) or cart items
// (camelCase) — to the canonical kitchen-token item shape.
export function mapKitchenItems(items, productCategoryMap = {}) {
  return (items || []).filter(Boolean).map(item => {
    const isDeal = item.is_deal ?? item.isDeal ?? false
    const instructions = getItemNote(item)
    if (isDeal) {
      const name = item.product_name || item.productName || item.dealName || item.deal_name || item.name || 'Deal'
      return {
        isDeal: true,
        name,
        quantity: item.quantity,
        dealProducts: normalizeDealProducts(item.deal_products ?? item.dealProducts),
        productId: item.product_id ?? item.productId ?? null,
        variantId: item.variant_id ?? item.variantId ?? null,
        productName: name,
        variantName: item.variant_name ?? item.variantName ?? null,
        instructions,
        category_id: null,
        deal_id: item.deal_id ?? item.dealId ?? null,
      }
    }
    const productId = item.product_id ?? item.productId ?? null
    const name = item.product_name || item.productName || item.name || ''
    return {
      isDeal: false,
      name,
      size: item.variant_name ?? item.variantName ?? item.size ?? '',
      quantity: item.quantity,
      productId,
      variantId: item.variant_id ?? item.variantId ?? null,
      productName: name,
      variantName: item.variant_name ?? item.variantName ?? null,
      instructions,
      category_id: item.category_id ?? item.categoryId ?? productCategoryMap[productId] ?? null,
      deal_id: null,
    }
  })
}

// Table name from whatever shape the order carries (joined tables row,
// flat field, or table_id resolved via the offline cache).
export function resolveOrderTableName(order) {
  if (order?.tables?.table_name) return order.tables.table_name
  if (order?.tables?.table_number) return `Table ${order.tables.table_number}`
  if (order?.tableName) return order.tableName
  if (order?.table_name) return order.table_name
  if (order?.table_id) {
    const t = cacheManager.getAllTables?.().find(t => t.id === order.table_id)
    if (t) return t.table_name || `Table ${t.table_number}`
  }
  return null
}

export function resolveOrderTakerName(order) {
  if (order?.order_takers?.name) return order.order_takers.name
  if (order?.order_taker_name) return order.order_taker_name
  if (order?.order_taker_id) {
    return cacheManager.getOrderTakers?.().find(t => t.id === order.order_taker_id)?.name || null
  }
  return null
}

// Kitchen-token payload from a DB order row + pre-mapped items.
// `extra` carries page-specific fields (updateVersion, changesOnly, a
// dailySerial override, defaultOrderType…) and wins over derived fields.
export function buildKitchenTokenPayload(order, mappedItems, extra = {}) {
  const { defaultOrderType = 'walkin', ...overrides } = extra
  return {
    orderId: order.id ?? null,
    orderNumber: order.order_number || order.orderNumber || null,
    dailySerial: order.daily_serial ?? order.dailySerial ?? null,
    orderType: order.order_type || order.orderType || defaultOrderType,
    customerName: order.customers?.full_name || order.customer_name || order.customerName || '',
    customerPhone: order.customers?.phone || order.customer_phone || order.customerPhone || '',
    specialNotes: order.order_instructions || order.orderInstructions || order.specialNotes || '',
    tableName: resolveOrderTableName(order),
    deliveryAddress: order.delivery_address || order.customers?.addressline || order.customers?.address || order.deliveryAddress || '',
    items: mappedItems,
    order_taker_name: resolveOrderTakerName(order),
    ...overrides,
  }
}

// Shared "who took the order" resolution used by both userProfile builders.
function resolveTakenBy(order) {
  return order?.cashier_id
    ? (order.cashiers?.name || 'Cashier')
    : (order?.users?.customer_name || 'Admin')
}

function readCachedProfile() {
  if (typeof localStorage === 'undefined') return {}
  try {
    return JSON.parse(localStorage.getItem('user_profile') || localStorage.getItem('user') || '{}') || {}
  } catch {
    return {}
  }
}

// userProfile block for kitchen tokens: the generator only prints
// cashier_name / customer_name (store_name is kept for logs).
export function buildKitchenUserProfile(order) {
  const profile = readCachedProfile()
  const takenBy = resolveTakenBy(order)
  return {
    store_name: profile?.store_name || 'KITCHEN',
    cashier_name: order?.cashier_id ? takenBy : null,
    customer_name: !order?.cashier_id ? takenBy : null,
  }
}

// userProfile block for receipts: store identity + display toggles, with the
// same localStorage fallbacks the pages previously duplicated inline.
export function buildReceiptUserProfile(order) {
  const profile = readCachedProfile()
  const takenBy = resolveTakenBy(order)
  const local = (key) => (typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null)
  return {
    store_name: profile?.store_name || '',
    store_address: profile?.store_address || '',
    phone: profile?.phone || '',
    phone_secondary: profile?.phone_secondary || '',
    store_logo: local('store_logo_local') || profile?.store_logo || null,
    qr_code: local('qr_code_local') || profile?.qr_code || null,
    hashtag1: profile?.hashtag1 || '',
    hashtag2: profile?.hashtag2 || '',
    show_footer_section: profile?.show_footer_section !== false,
    show_logo_on_receipt: profile?.show_logo_on_receipt !== false,
    show_business_name_on_receipt: profile?.show_business_name_on_receipt !== false,
    show_powered_by_airoxlab: profile?.show_powered_by_airoxlab !== false,
    receipt_review_message: profile?.receipt_review_message || '',
    receipt_footer_message: profile?.receipt_footer_message || '',
    cashier_name: order?.cashier_id ? takenBy : null,
    customer_name: !order?.cashier_id ? takenBy : null,
  }
}

// Map order items to the canonical receipt line shape (used as orderData.cart).
export function mapReceiptItems(items) {
  return (items || []).filter(Boolean).map(item => {
    const isDeal = item.is_deal ?? item.isDeal ?? false
    const base = {
      quantity: item.quantity,
      finalPrice: parseFloat(item.final_price ?? item.finalPrice ?? 0) || 0,
      totalPrice: parseFloat(item.total_price ?? item.totalPrice ?? 0) || 0,
      itemDiscountType: item.item_discount_type ?? item.itemDiscountType ?? null,
      itemDiscountAmount: parseFloat(item.item_discount_amount ?? item.itemDiscountAmount ?? 0) || 0,
      itemInstructions: getItemNote(item) || null,
    }
    if (isDeal) {
      return {
        ...base,
        isDeal: true,
        dealId: item.deal_id ?? item.dealId ?? null,
        dealName: item.product_name || item.productName || item.dealName || item.deal_name || item.name || 'Deal',
        dealProducts: normalizeDealProducts(item.deal_products ?? item.dealProducts),
      }
    }
    return {
      ...base,
      isDeal: false,
      productId: item.product_id ?? item.productId ?? null,
      productName: item.product_name || item.productName || item.name || '',
      variantId: item.variant_id ?? item.variantId ?? null,
      variantName: item.variant_name ?? item.variantName ?? null,
    }
  })
}
