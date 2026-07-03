/**
 * whatsappAutoSend.js
 *
 * Called whenever an order status changes to a trigger point.
 * Supports these trigger statuses:
 *   - 'Completed'     → thank-you message + review link
 *   - 'Preparing'     → notify customer order has started
 *   - 'Dispatched'    → notify customer order is on its way
 *   - 'Ready'         → notify customer order is ready for collection/service
 *   - 'RiderAssigned' → (delivery only) notify customer which rider is bringing
 *                        their order, with the rider's name + phone
 *
 * Safe to call fire-and-forget — catches all errors internally.
 */

import { supabase } from './supabase'
import { getStatus as waGetStatus, enqueueTextAndWait } from './whatsappQueue'

const REVIEW_BASE_URL = process.env.NEXT_PUBLIC_REVIEW_BASE_URL || 'https://pos-product-reviews-page.vercel.app'

function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return null
  let p = phone.trim().replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (!/^\d+$/.test(p)) return null
  if (p.startsWith('0') && p.length === 11) p = '92' + p.slice(1)
  if (p.length < 10 || p.length > 15) return null
  if (p.startsWith('0')) return null
  return p
}

function formatTime12h(timeStr) {
  if (!timeStr) return ''
  try {
    // Handles "HH:MM:SS" or full ISO timestamp
    const t = timeStr.includes('T') ? new Date(timeStr) : new Date(`1970-01-01T${timeStr}`)
    return t.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true })
  } catch { return timeStr }
}

function buildMessage(template, vars) {
  return template
    .replace(/\{customer_name\}/g,     vars.customer_name     || 'Customer')
    .replace(/\{order_number\}/g,      vars.order_number      || '')
    .replace(/\{order_type\}/g,        vars.order_type        || '')
    .replace(/\{total_amount\}/g,      vars.total_amount      || '')
    .replace(/\{subtotal\}/g,          vars.subtotal          || '')
    .replace(/\{discount_amount\}/g,   vars.discount_amount   || '')
    .replace(/\{delivery_charges\}/g,  vars.delivery_charges  || '')
    .replace(/\{order_date\}/g,        vars.order_date        || '')
    .replace(/\{business_name\}/g,     vars.business_name     || '')
    .replace(/\{review_link\}/g,       vars.review_link       || '')
    .replace(/\{item_list\}/g,         vars.item_list         || '')
    .replace(/\{table_number\}/g,      vars.table_number      || '')
    .replace(/\{payment_method\}/g,    vars.payment_method    || '')
    .replace(/\{cashier_name\}/g,      vars.cashier_name      || '')
    .replace(/\{delivery_address\}/g,  vars.delivery_address  || '')
    .replace(/\{takeaway_time\}/g,     vars.takeaway_time     || '')
    .replace(/\{delivery_time\}/g,     vars.delivery_time     || '')
    .replace(/\{order_instructions\}/g, vars.order_instructions || '')
    .replace(/\{rider_name\}/g,        vars.rider_name        || '')
    .replace(/\{rider_phone\}/g,       vars.rider_phone       || '')
    .replace(/\{rider_vehicle\}/g,     vars.rider_vehicle     || '')
}

/**
 * Main entry point.
 *
 * @param {object} order         - Order object (id, customer_id, order_type, order_number, total_amount, ...)
 * @param {string} userId        - Logged-in user's ID
 * @param {string} triggerStatus - 'Completed' | 'Preparing' | 'Dispatched' | 'Ready' | 'RiderAssigned'
 */
export async function triggerWhatsAppAutoSend(order, userId, triggerStatus = 'Completed') {
  if (!order?.id || !userId) return

  // Normalize legacy trigger status names
  if (triggerStatus === 'ReadyStatus') triggerStatus = 'Ready'

  try {
    // ── 1. Resolve the business owner's user_id ───────────────────────────
    let ownerUserId = userId
    if (order.user_id && order.user_id !== userId) {
      ownerUserId = order.user_id
    } else if (!order.user_id) {
      const { data: orderRow } = await supabase
        .from('orders')
        .select('user_id')
        .eq('id', order.id)
        .single()
      if (orderRow?.user_id) ownerUserId = orderRow.user_id
    }

    // Resolve the assigned rider for the RiderAssigned trigger. Used both to
    // dedup PER RIDER (so re-assigning a *different* rider re-notifies) and to
    // stamp the log row. Falls back to the order's current delivery_boy_id.
    let riderId = order.delivery_boy_id || null
    if (triggerStatus === 'RiderAssigned' && !riderId) {
      const { data: rRow } = await supabase
        .from('orders')
        .select('delivery_boy_id')
        .eq('id', order.id)
        .single()
      riderId = rRow?.delivery_boy_id || null
    }

    const logBase = {
      user_id:        ownerUserId,
      order_id:       order.id,
      order_type:     order.order_type || null,
      trigger_status: triggerStatus,
      rider_id:       riderId,
    }

    // ── 2. Check for duplicate — only skip if a message was already SENT.
    // Failed/skipped records must allow retries, so we filter on status='sent'.
    // For RiderAssigned we dedup PER (order, rider): a message already sent for
    // THIS rider is skipped (idempotent against double-clicks), but assigning a
    // DIFFERENT rider is a fresh (order, rider) pair and re-notifies.
    let dupQuery = supabase
      .from('whatsapp_auto_send_logs')
      .select('id')
      .eq('user_id', ownerUserId)
      .eq('order_id', order.id)
      .eq('trigger_status', triggerStatus)
      .eq('status', 'sent')
    if (triggerStatus === 'RiderAssigned' && riderId) {
      dupQuery = dupQuery.eq('rider_id', riderId)
    }
    const { data: existing } = await dupQuery.limit(1).maybeSingle()

    if (existing) {
      console.log(`[WA AutoSend] Already sent for order ${order.order_number} @ ${triggerStatus} — skipping`)
      return { success: false, silent: true }
    }

    // ── 3. Load WhatsApp settings ─────────────────────────────────────────
    const { data: waSetting } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('user_id', ownerUserId)
      .single()

    // ── 4. Check master + per-type toggles ───────────────────────────────
    const orderType = order.order_type // 'walkin' | 'takeaway' | 'delivery'

    if (triggerStatus === 'Completed') {
      if (!waSetting?.auto_send_on_complete) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return { success: false, silent: true }
      }
      if (waSetting[`auto_send_${orderType}`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return { success: false, silent: true }
      }
    } else if (triggerStatus === 'Preparing') {
      if (!waSetting?.auto_send_on_preparing) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return { success: false, silent: true }
      }
      if (waSetting[`auto_send_${orderType}_preparing`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return { success: false, silent: true }
      }
    } else if (triggerStatus === 'Dispatched') {
      if (!waSetting?.auto_send_on_ready) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return { success: false, silent: true }
      }
      if (waSetting[`auto_send_${orderType}_dispatched`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return { success: false, silent: true }
      }
    } else if (triggerStatus === 'Ready') {
      if (!waSetting?.auto_send_on_ready_status) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return { success: false, silent: true }
      }
      if (waSetting[`auto_send_${orderType}_ready`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return { success: false, silent: true }
      }
    } else if (triggerStatus === 'RiderAssigned') {
      // Delivery-only trigger — fired from AssignRiderButton when a rider is set.
      if (orderType !== 'delivery') {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'not_delivery' }); return { success: false, silent: true }
      }
      if (!waSetting?.auto_send_on_rider_assigned) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return { success: false, silent: true }
      }
      if (waSetting.auto_send_delivery_rider_assigned === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return { success: false, silent: true }
      }
    } else {
      return { success: false, silent: true } // unknown trigger
    }

    // ── 5. Check WhatsApp connection (centralized — server-side socket) ────
    // If WA is mid-reconnect ('connecting'), wait up to 10s for it to come online.
    // This prevents spurious failures when the auto-reconnect fires at the same
    // moment the user completes an order.
    let waStatus = 'disconnected'
    for (let attempt = 0; attempt < 5; attempt++) {
      ;({ status: waStatus } = await waGetStatus(ownerUserId))
      if (waStatus === 'connected') break
      if (waStatus !== 'connecting') break  // 'disconnected' or 'qr' — won't self-heal
      await new Promise(r => setTimeout(r, 2000))
    }
    if (waStatus !== 'connected') {
      await logResult({ ...logBase, status: 'failed', skip_reason: 'wa_disconnected' })
      return { success: false, silent: false, error: 'WhatsApp is disconnected — go to Settings → WhatsApp to reconnect' }
    }

    // ── 6. Get customer ───────────────────────────────────────────────────
    if (!order.customer_id) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_customer' }); return { success: false, silent: true }
    }
    const { data: customer } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('id', order.customer_id)
      .single()
    if (!customer?.phone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_phone', customer_id: order.customer_id }); return { success: false, silent: true }
    }

    // ── 7. Check if blocked ───────────────────────────────────────────────
    const { data: contactRecord } = await supabase
      .from('whatsapp_contacts')
      .select('is_blocked')
      .eq('user_id', ownerUserId)
      .eq('customer_id', customer.id)
      .single()
    if (contactRecord?.is_blocked) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'blocked', customer_id: customer.id }); return { success: false, silent: true }
    }

    // ── 8. Format phone ───────────────────────────────────────────────────
    const formattedPhone = formatPhone(customer.phone)
    if (!formattedPhone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'invalid_phone', customer_id: customer.id }); return { success: false, silent: true }
    }

    // ── 9. Fetch full order data for rich variables ───────────────────────
    const { data: fullOrder } = await supabase
      .from('orders')
      .select('table_id, takeaway_time, delivery_time, subtotal, discount_amount, delivery_charges, delivery_address, payment_method, cashier_id, order_instructions, delivery_boy_id')
      .eq('id', order.id)
      .single()
    const enriched = { ...fullOrder, ...order }

    // Item list
    let itemList = ''
    const { data: items } = await supabase
      .from('order_items')
      .select('product_name, variant_name, quantity, total_price, is_deal, deal_products')
      .eq('order_id', order.id)
    if (items?.length) {
      itemList = items.map(i => {
        const name = i.is_deal ? i.product_name : [i.product_name, i.variant_name].filter(Boolean).join(' — ')
        return `• ${name} × ${i.quantity}  Rs. ${Number(i.total_price || 0).toLocaleString()}`
      }).join('\n')
    }

    // Table number (walkin only)
    let tableNumber = ''
    if (enriched.table_id) {
      const { data: tableRow } = await supabase
        .from('tables')
        .select('table_name, table_number')
        .eq('id', enriched.table_id)
        .single()
      tableNumber = tableRow?.table_name || tableRow?.table_number || ''
    }

    // Cashier name
    let cashierName = ''
    if (enriched.cashier_id) {
      const { data: cashierRow } = await supabase
        .from('cashiers')
        .select('name')
        .eq('id', enriched.cashier_id)
        .single()
      cashierName = cashierRow?.name || ''
    }

    // Rider (delivery) info — powers {rider_name}/{rider_phone}/{rider_vehicle}.
    // Resolved for any delivery order that has a rider, so the rider-assigned
    // template AND the dispatched/ready/completed delivery templates can use it.
    let riderName = '', riderPhone = '', riderVehicle = ''
    if (orderType === 'delivery' && enriched.delivery_boy_id) {
      const { data: riderRow } = await supabase
        .from('delivery_boys')
        .select('name, phone, vehicle_type')
        .eq('id', enriched.delivery_boy_id)
        .single()
      if (riderRow) {
        riderName    = riderRow.name || ''
        riderPhone   = riderRow.phone || ''
        riderVehicle = riderRow.vehicle_type || ''
      }
    }

    // ── 10. Generate review link (Completed only) ─────────────────────────
    let reviewLink = ''
    if (triggerStatus === 'Completed' && waSetting?.include_review_link) {
      const { data: existingReview } = await supabase
        .from('order_reviews')
        .select('review_token')
        .eq('order_id', order.id)
        .eq('user_id', ownerUserId)
        .single()
      let token = existingReview?.review_token
      if (!token) {
        const { data: newReview } = await supabase
          .from('order_reviews')
          .insert({ user_id: ownerUserId, order_id: order.id, customer_id: customer.id })
          .select('review_token')
          .single()
        token = newReview?.review_token
      }
      if (token) {
        const baseUrl = REVIEW_BASE_URL.replace(/\/+$/, '')
        reviewLink = `${baseUrl}/r/${token}`
      }
    }

    // ── 11. Get business name ─────────────────────────────────────────────
    let businessName = 'Our Restaurant'
    const { data: userRow } = await supabase
      .from('users')
      .select('store_name, customer_name')
      .eq('id', ownerUserId)
      .single()
    businessName = (userRow?.store_name || userRow?.customer_name || businessName).replace(/\s+/g, ' ').trim()

    // ── 12. Pick template ─────────────────────────────────────────────────
    const templateKeyMap = {
      Completed:     `${orderType}_template`,
      Preparing:     `${orderType}_preparing_template`,
      Dispatched:    `${orderType}_dispatched_template`,
      Ready:         `${orderType}_ready_template`,
      RiderAssigned: `${orderType}_rider_assigned_template`, // delivery-only
    }
    const templateKey = templateKeyMap[triggerStatus] || `${orderType}_template`
    const template = waSetting?.[templateKey] || waSetting?.walkin_template || ''

    // ── 13. Build and send message ────────────────────────────────────────
    const message = buildMessage(template, {
      customer_name:      customer.full_name || 'Customer',
      order_number:       enriched.order_number || '',
      order_type:         enriched.order_type || '',
      total_amount:       Number(enriched.total_amount || 0).toLocaleString(),
      subtotal:           Number(enriched.subtotal || 0).toLocaleString(),
      discount_amount:    Number(enriched.discount_amount || 0).toLocaleString(),
      delivery_charges:   Number(enriched.delivery_charges || 0).toLocaleString(),
      order_date:         enriched.order_date
        ? new Date(enriched.order_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }),
      business_name:      businessName,
      review_link:        reviewLink,
      item_list:          itemList,
      table_number:       tableNumber,
      payment_method:     enriched.payment_method || '',
      cashier_name:       cashierName,
      delivery_address:   enriched.delivery_address || '',
      takeaway_time:      formatTime12h(enriched.takeaway_time),
      delivery_time:      formatTime12h(enriched.delivery_time),
      order_instructions: enriched.order_instructions || '',
      rider_name:         riderName,
      rider_phone:        riderPhone,
      rider_vehicle:      riderVehicle,
    })

    const result = await enqueueTextAndWait({ restaurantId: ownerUserId, phone: formattedPhone, message })

    if (result.success) {
      await logResult({
        ...logBase,
        status:        'sent',
        customer_id:   customer.id,
        phone_sent_to: formattedPhone,
        message_sent:  message,
        sent_at:       new Date().toISOString(),
      })
      console.log(`[WA AutoSend] ✅ ${triggerStatus} → sent to ${formattedPhone} for order ${enriched.order_number}`)
      return { success: true, phone: formattedPhone }
    } else {
      await logResult({
        ...logBase,
        status:        'failed',
        customer_id:   customer.id,
        phone_sent_to: formattedPhone,
        message_sent:  message,
        error_message: result.error || 'Unknown error',
      })
      return { success: false, silent: false, error: result.error || 'WhatsApp failed to send message' }
    }

  } catch (err) {
    console.error('[WA AutoSend] Error:', err.message)
    try { await logResult({ user_id: userId, order_id: order?.id, trigger_status: triggerStatus, status: 'failed', error_message: err.message }) } catch (_) {}
    return { success: false, silent: false, error: err.message }
  }
}

async function logResult(data) {
  await supabase.from('whatsapp_auto_send_logs').insert(data)
}
