// lib/utils/kdsAmendments.js
// KDS "amendment tickets" (sub-orders). When an order the kitchen has ALREADY
// started (kitchen_status past 'Placed') is edited, we spawn a small sub-ticket
// that carries only the delta (added / removed / qty-changed items). It shows up
// on the KDS as its own card — labelled #<serial> (<letter>) — so a late change
// can't get buried inside a card the chef has already read.
//
// The order stays ONE financial row (no double revenue). This is a pure kitchen-
// workflow entity that mirrors orders.kitchen_status so the KDS groups it into the
// same columns. See table migration: database/kds_amendments.sql
import { supabase } from '../supabase'

/**
 * Split a detailedChanges diff (the shape the order-modify flow already builds:
 * { itemsAdded, itemsRemoved, itemsModified }) into up to two amendment rows:
 *   - 'addon'  : items to MAKE  (new items + quantity increases)
 *   - 'change' : items CHANGED  (removed items + quantity decreases)
 * Returns an array of { kind, items } (0, 1, or 2 entries).
 */
export function buildAmendmentRows(detailedChanges) {
  if (!detailedChanges) return []

  const addonItems = []
  const changeItems = []

  ;(detailedChanges.itemsAdded || []).forEach((it) => {
    addonItems.push({
      name: it.name,
      variant: it.variant || null,
      quantity: it.quantity,
      instructions: it.instructions || null,
      isDeal: !!it.isDeal,
      dealProducts: it.dealProducts || null,
      changeType: 'added',
    })
  })

  ;(detailedChanges.itemsModified || []).forEach((it) => {
    const delta = (it.newQuantity || 0) - (it.oldQuantity || 0)
    if (delta > 0) {
      // Quantity increased — the kitchen needs to make `delta` more.
      addonItems.push({
        name: it.name,
        variant: it.variant || null,
        quantity: delta,
        oldQuantity: it.oldQuantity,
        newQuantity: it.newQuantity,
        changeType: 'increased',
      })
    } else if (delta < 0) {
      // Quantity reduced — chef may already be cooking; this is a stop signal.
      changeItems.push({
        name: it.name,
        variant: it.variant || null,
        quantity: Math.abs(delta),
        oldQuantity: it.oldQuantity,
        newQuantity: it.newQuantity,
        changeType: 'reduced',
      })
    }
  })

  ;(detailedChanges.itemsRemoved || []).forEach((it) => {
    changeItems.push({
      name: it.name,
      variant: it.variant || null,
      quantity: it.quantity,
      isDeal: !!it.isDeal,
      dealProducts: it.dealProducts || null,
      changeType: 'removed',
    })
  })

  const rows = []
  if (addonItems.length) rows.push({ kind: 'addon', items: addonItems })
  if (changeItems.length) rows.push({ kind: 'change', items: changeItems })
  return rows
}

/**
 * Create amendment ticket(s) for a just-saved order edit.
 * Guard: only spawn when the kitchen has already started the order
 * (kitchen_status is 'Preparing' or 'Ready'). If it's still Placed the added
 * items already ride on the parent card; if it's Collected the order is done.
 *
 * @returns {Promise<{created:number, skipped?:string, error?:string}>}
 */
export async function createAmendmentsForEdit({
  orderId,
  orderNumber,
  userId,
  letter,
  detailedChanges,
  kitchenStatus,
}) {
  try {
    if (!orderId) return { created: 0, skipped: 'no-order' }
    if (!kitchenStatus || kitchenStatus === 'Collected') {
      return { created: 0, skipped: 'not-in-kitchen' }
    }

    const rows = buildAmendmentRows(detailedChanges).map((r) => ({
      order_id: orderId,
      user_id: userId || null,
      order_number: orderNumber || null,
      letter: letter || null,
      kind: r.kind,
      items: r.items,
      kitchen_status: null, // enters the KDS "Placed" queue as a fresh ticket
    }))
    if (!rows.length) return { created: 0 }

    const { error } = await supabase.from('kds_amendments').insert(rows)
    if (error) throw error

    console.log(`🧾 [KDS] Created ${rows.length} amendment ticket(s) for order`, orderNumber)
    return { created: rows.length }
  } catch (error) {
    console.warn('⚠️ [KDS] Failed to create amendment ticket:', error?.message)
    return { created: 0, error: error?.message }
  }
}

/**
 * Advance an amendment ticket's own kitchen status
 * (null → 'Preparing' → 'Ready' → 'Collected').
 */
export async function updateAmendmentStatus(amendmentId, newStatus) {
  const { error } = await supabase
    .from('kds_amendments')
    .update({ kitchen_status: newStatus, updated_at: new Date().toISOString() })
    .eq('id', amendmentId)
  if (error) throw error
  return { success: true }
}

/**
 * Load open amendment tickets (kitchen_status != 'Collected') for a business-day
 * window. Uses an explicit is-null OR neq filter because `neq('Collected')` alone
 * would drop NULL (= Placed) rows in PostgreSQL.
 */
export async function fetchOpenAmendments({ userId, startDateTime, endDateTime }) {
  if (!userId) return []
  try {
    const { data, error } = await supabase
      .from('kds_amendments')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startDateTime)
      .lt('created_at', endDateTime)
      .or('kitchen_status.is.null,kitchen_status.neq.Collected')
      .order('created_at', { ascending: true })
      .limit(200)

    if (error) throw error
    return data || []
  } catch (error) {
    console.warn('⚠️ [KDS] Failed to load amendments:', error?.message)
    return []
  }
}
