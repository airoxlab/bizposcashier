/**
 * whatsappAutoSend.js
 *
 * Called whenever an order status changes to a trigger point.
 * Supports four trigger statuses:
 *   - 'Completed'  → thank-you message + review link
 *   - 'Preparing'  → notify customer order has started
 *   - 'Dispatched' → notify customer order is on its way
 *   - 'Ready'      → notify customer order is ready for collection/service
 *
 * Safe to call fire-and-forget — catches all errors internally.
 */

import { supabase } from './supabase'

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
}

/**
 * Main entry point.
 *
 * @param {object} order         - Order object (id, customer_id, order_type, order_number, total_amount, ...)
 * @param {string} userId        - Logged-in user's ID
 * @param {string} triggerStatus - 'Completed' | 'Preparing' | 'Dispatched' | 'Ready'
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

    const logBase = {
      user_id:        ownerUserId,
      order_id:       order.id,
      order_type:     order.order_type || null,
      trigger_status: triggerStatus,
    }

    // ── 2. Check for duplicate ────────────────────────────────────────────
    const { data: existing } = await supabase
      .from('whatsapp_auto_send_logs')
      .select('id')
      .eq('user_id', ownerUserId)
      .eq('order_id', order.id)
      .eq('trigger_status', triggerStatus)
      .single()

    if (existing) {
      console.log(`[WA AutoSend] Already sent for order ${order.order_number} @ ${triggerStatus} — skipping`)
      return
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
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return
      }
      if (waSetting[`auto_send_${orderType}`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return
      }
    } else if (triggerStatus === 'Preparing') {
      if (!waSetting?.auto_send_on_preparing) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return
      }
      if (waSetting[`auto_send_${orderType}_preparing`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return
      }
    } else if (triggerStatus === 'Dispatched') {
      if (!waSetting?.auto_send_on_ready) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return
      }
      if (waSetting[`auto_send_${orderType}_dispatched`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return
      }
    } else if (triggerStatus === 'Ready') {
      if (!waSetting?.auto_send_on_ready_status) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' }); return
      }
      if (waSetting[`auto_send_${orderType}_ready`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' }); return
      }
    } else {
      return // unknown trigger
    }

    // ── 5. Check WhatsApp connection ──────────────────────────────────────
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'not_electron' }); return
    }
    const { status: waStatus } = await window.electronAPI.whatsapp.getStatus()
    if (waStatus !== 'connected') {
      await logResult({ ...logBase, status: 'failed', skip_reason: 'wa_disconnected' }); return
    }

    // ── 6. Get customer ───────────────────────────────────────────────────
    if (!order.customer_id) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_customer' }); return
    }
    const { data: customer } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('id', order.customer_id)
      .single()
    if (!customer?.phone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_phone', customer_id: order.customer_id }); return
    }

    // ── 7. Check if blocked ───────────────────────────────────────────────
    const { data: contactRecord } = await supabase
      .from('whatsapp_contacts')
      .select('is_blocked')
      .eq('user_id', ownerUserId)
      .eq('customer_id', customer.id)
      .single()
    if (contactRecord?.is_blocked) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'blocked', customer_id: customer.id }); return
    }

    // ── 8. Format phone ───────────────────────────────────────────────────
    const formattedPhone = formatPhone(customer.phone)
    if (!formattedPhone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'invalid_phone', customer_id: customer.id }); return
    }

    // ── 9. Fetch full order data for rich variables ───────────────────────
    const { data: fullOrder } = await supabase
      .from('orders')
      .select('table_id, takeaway_time, delivery_time, subtotal, discount_amount, delivery_charges, delivery_address, payment_method, cashier_id, order_instructions')
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
      Completed:  `${orderType}_template`,
      Preparing:  `${orderType}_preparing_template`,
      Dispatched: `${orderType}_dispatched_template`,
      Ready:      `${orderType}_ready_template`,
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
    })

    const result = await window.electronAPI.whatsapp.sendOrderMessage({ phone: formattedPhone, message })

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
      return { success: false, error: result.error || 'Failed to send WhatsApp message' }
    }

  } catch (err) {
    console.error('[WA AutoSend] Error:', err.message)
    try { await logResult({ user_id: userId, order_id: order?.id, trigger_status: triggerStatus, status: 'failed', error_message: err.message }) } catch (_) {}
    return { success: false, error: err.message }
  }
}

async function logResult(data) {
  await supabase.from('whatsapp_auto_send_logs').insert(data)
}
