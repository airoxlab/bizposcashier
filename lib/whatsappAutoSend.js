/**
 * whatsappAutoSend.js
 *
 * Called whenever an order status changes to a trigger point.
 * Supports two trigger statuses:
 *   - 'Ready'     → notify customer order is ready / on the way (no review link)
 *   - 'Completed' → thank-you message + review link
 *
 * Safe to call fire-and-forget — catches all errors internally.
 */

import { supabase } from './supabase'

const REVIEW_BASE_URL = 'https://pos-product-reviews-page.vercel.app'

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

function buildMessage(template, vars) {
  return template
    .replace(/\{customer_name\}/g, vars.customer_name || 'Customer')
    .replace(/\{order_number\}/g,  vars.order_number  || '')
    .replace(/\{order_type\}/g,    vars.order_type    || '')
    .replace(/\{total_amount\}/g,  vars.total_amount  || '')
    .replace(/\{order_date\}/g,    vars.order_date    || '')
    .replace(/\{business_name\}/g, vars.business_name || '')
    .replace(/\{review_link\}/g,   vars.review_link   || '')
}

/**
 * Main entry point.
 *
 * @param {object} order         - Order object (id, customer_id, order_type, order_number, total_amount)
 * @param {string} userId        - Logged-in user's ID
 * @param {string} triggerStatus - 'Ready' | 'Completed' (default: 'Completed')
 */
export async function triggerWhatsAppAutoSend(order, userId, triggerStatus = 'Completed') {
  if (!order?.id || !userId) return

  try {
    // ── 1. Resolve the business owner's user_id ───────────────────────────
    // Orders always store the admin/owner user_id regardless of who is logged in.
    // A cashier's userId won't have whatsapp_settings — use the order's user_id instead.
    let ownerUserId = userId
    if (order.user_id && order.user_id !== userId) {
      ownerUserId = order.user_id
    } else if (!order.user_id) {
      // Fetch it from the orders table in case it's not on the order object
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

    // ── 2. Check for duplicate (already sent for this order + trigger) ────
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

    // ── 3. Load WhatsApp settings (always from owner's account) ──────────
    const { data: waSetting } = await supabase
      .from('whatsapp_settings')
      .select('*')
      .eq('user_id', ownerUserId)
      .single()

    // ── 3. Check global toggles per trigger ──────────────────────────────
    if (triggerStatus === 'Completed') {
      if (!waSetting?.auto_send_on_complete) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' })
        return
      }
      if (waSetting[`auto_send_${order.order_type}`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' })
        return
      }
    } else if (triggerStatus === 'Ready') {
      if (!waSetting?.auto_send_on_ready) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' })
        return
      }
      if (waSetting[`auto_send_${order.order_type}_ready`] === false) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'order_type_disabled' })
        return
      }
    } else if (triggerStatus === 'ReadyStatus') {
      if (!waSetting?.auto_send_on_ready_status) {
        await logResult({ ...logBase, status: 'skipped', skip_reason: 'auto_send_disabled' })
        return
      }
    } else {
      return // unknown trigger
    }

    // ── 4. Check WhatsApp connection ──────────────────────────────────────
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'not_electron' })
      return
    }

    const { status: waStatus } = await window.electronAPI.whatsapp.getStatus()
    if (waStatus !== 'connected') {
      await logResult({ ...logBase, status: 'failed', skip_reason: 'wa_disconnected' })
      return
    }

    // ── 5. Get customer ───────────────────────────────────────────────────
    if (!order.customer_id) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_customer' })
      return
    }

    const { data: customer } = await supabase
      .from('customers')
      .select('id, full_name, phone')
      .eq('id', order.customer_id)
      .single()

    if (!customer?.phone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'no_phone', customer_id: order.customer_id })
      return
    }

    // ── 6. Check if blocked ───────────────────────────────────────────────
    const { data: contactRecord } = await supabase
      .from('whatsapp_contacts')
      .select('is_blocked')
      .eq('user_id', ownerUserId)
      .eq('customer_id', customer.id)
      .single()

    if (contactRecord?.is_blocked) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'blocked', customer_id: customer.id })
      return
    }

    // ── 7. Format phone ───────────────────────────────────────────────────
    const formattedPhone = formatPhone(customer.phone)
    if (!formattedPhone) {
      await logResult({ ...logBase, status: 'skipped', skip_reason: 'invalid_phone', customer_id: customer.id })
      return
    }

    // ── 8. Generate review token (only for Completed) ─────────────────────
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
        const baseUrl = (waSetting.review_base_url?.trim() || REVIEW_BASE_URL).replace(/\/+$/, '')
        reviewLink = `${baseUrl}/r/${token}`
      }
    }

    // ── 9. Get business name ──────────────────────────────────────────────
    let businessName = 'Our Restaurant'
    const { data: userRow } = await supabase
      .from('users')
      .select('store_name, customer_name')
      .eq('id', ownerUserId)
      .single()
    businessName = userRow?.store_name || userRow?.customer_name || businessName

    // ── 10. Pick template ─────────────────────────────────────────────────
    let templateKey
    if (triggerStatus === 'Ready' || triggerStatus === 'ReadyStatus') {
      templateKey = `${order.order_type}_ready_template`
    } else {
      templateKey = `${order.order_type}_template`
    }
    const template = waSetting?.[templateKey] || waSetting?.walkin_template || ''

    const message = buildMessage(template, {
      customer_name: customer.full_name || 'Customer',
      order_number:  order.order_number || '',
      order_type:    order.order_type   || '',
      total_amount:  Number(order.total_amount || 0).toLocaleString(),
      order_date:    order.order_date
        ? new Date(order.order_date).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' }),
      business_name: businessName,
      review_link:   reviewLink,
    })

    // ── 11. Send via Electron ─────────────────────────────────────────────
    const result = await window.electronAPI.whatsapp.sendOrderMessage({ phone: formattedPhone, message })

    if (result.success) {
      await logResult({
        ...logBase,
        status:       'sent',
        customer_id:  customer.id,
        phone_sent_to: formattedPhone,
        message_sent: message,
        sent_at:      new Date().toISOString(),
      })
      console.log(`[WA AutoSend] ✅ ${triggerStatus} → sent to ${formattedPhone} for order ${order.order_number}`)
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
    try { await logResult({ ...logBase, status: 'failed', error_message: err.message }) } catch (_) {}
    return { success: false, error: err.message }
  }
}

async function logResult(data) {
  await supabase.from('whatsapp_auto_send_logs').insert(data)
}
