/**
 * accountAutoSend.js
 *
 * Automatically sends a WhatsApp bill when an order is placed on a customer account,
 * if the admin has enabled `auto_send_on_account_payment` in customer_account_settings.
 *
 * Called fire-and-forget from the payment page — catches all errors internally.
 */

import { supabase } from './supabase'
import { authManager } from './authManager'
import { permissionManager } from './permissionManager'
import { notify } from '../components/ui/NotificationSystem'

const DEFAULT_TEMPLATE = `Dear {customer_name},

Your order #{order_number} has been placed on your account.

{order_items}

Subtotal: Rs.{subtotal}
Discount: Rs.{discount}
Service Charges: Rs.{service_charge}
Order Total: Rs.{order_total}
Loyalty Points Earned: {loyalty_points}

Previous Balance: Rs.{previous_balance}
New Balance: Rs.{new_balance}

Date: {order_date}

Thank you for your business!
— {business_name}`

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

/**
 * Auto-send account bill via WhatsApp after order placement.
 *
 * @param {object} params
 * @param {string} params.orderId         - The order ID (may be null for offline orders)
 * @param {string} params.orderNumber     - e.g. "ORD-0042"
 * @param {object} params.customer        - { id, full_name, phone, account_balance }
 * @param {number} params.totalAmount     - Order total
 * @param {string} params.orderType       - e.g. "walkin", "delivery"
 * @param {Array}  params.cartItems       - Cart items as fallback for order_items
 * @param {number} params.previousBalance - Balance before this order
 * @param {number} params.newBalance      - Balance after this order
 * @param {number} [params.subtotal]      - Order subtotal
 * @param {number} [params.discount]      - Discount amount
 * @param {number} [params.serviceCharge] - Service charge amount
 * @param {number} [params.deliveryCharges] - Delivery charges
 * @param {number} [params.loyaltyPoints] - Loyalty points earned/redeemed
 */
export async function triggerAccountAutoSend({
  orderId,
  orderNumber,
  customer,
  totalAmount,
  orderType,
  cartItems,
  previousBalance,
  newBalance,
  subtotal,
  discount,
  serviceCharge,
  deliveryCharges,
  loyaltyPoints,
}) {
  try {
    const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp
    if (!isElectron) return

    const userId = authManager.getCurrentUser()?.id
    if (!userId) return

    // Permission check: admins always allowed, cashiers need SEND_ACCOUNT_BILL
    const isAdmin = authManager.getRole() === 'admin'
    if (!isAdmin && !permissionManager.hasPermission('SEND_ACCOUNT_BILL')) {
      console.log('[AccountAutoSend] Cashier lacks SEND_ACCOUNT_BILL permission — skipping')
      return
    }

    const customerPhone = customer?.phone
    const customerName = customer?.full_name || 'Customer'
    if (!customerPhone) {
      console.log('[AccountAutoSend] No customer phone — skipping')
      return
    }

    const phone = formatPhone(customerPhone)
    if (!phone) {
      console.log('[AccountAutoSend] Invalid phone number — skipping')
      return
    }

    // 1. Check if auto_send_on_account_payment is enabled
    const { data: settings } = await supabase
      .from('customer_account_settings')
      .select('auto_send_on_account_payment, account_template, send_receipt_image, service_enabled, include_logo_on_images')
      .eq('user_id', userId)
      .single()

    if (!settings || settings.service_enabled === false) {
      console.log('[AccountAutoSend] Service disabled — skipping')
      return
    }

    if (!settings.auto_send_on_account_payment) {
      console.log('[AccountAutoSend] Auto-send disabled — skipping')
      return
    }

    // 2. Check WhatsApp connection
    const { status: waStatus } = await window.electronAPI.whatsapp.getStatus()
    if (waStatus !== 'connected') {
      console.log('[AccountAutoSend] WhatsApp not connected — skipping')
      return
    }

    // 3. Build order items text
    let itemsText = ''
    let rawItems = []

    // Try fetching from DB first
    if (orderId) {
      try {
        const { data: items } = await supabase
          .from('order_items')
          .select('product_name, variant_name, quantity, final_price, total_price')
          .eq('order_id', orderId)

        if (items && items.length > 0) {
          rawItems = items.map(item => {
            const displayName = item.variant_name
              ? `${item.product_name} (${item.variant_name})`
              : item.product_name
            return {
              name: displayName,
              quantity: item.quantity,
              price: Number(item.final_price),
              total: Number(item.total_price || item.final_price * item.quantity),
            }
          })
          itemsText = rawItems.map(item =>
            `${item.quantity}x ${item.name} - Rs.${item.total.toLocaleString('en-PK')}`
          ).join('\n')
        }
      } catch (_) {}
    }

    // Fallback: use cart items
    if (!itemsText && cartItems && cartItems.length > 0) {
      rawItems = cartItems.map(item => {
        const displayName = item.isDeal
          ? (item.dealName || item.name || 'Deal')
          : (item.productName || item.name || item.product_name || 'Item')
            + (item.variantName ? ` (${item.variantName})` : '')
        const price = Number(item.price || item.final_price || 0)
        const qty = item.quantity || 1
        const total = Number(item.totalPrice || item.total_price || price * qty)
        return { name: displayName, quantity: qty, price, total }
      })
      itemsText = rawItems.map(item =>
        `${item.quantity}x ${item.name} - Rs.${item.total.toLocaleString('en-PK')}`
      ).join('\n')
    }

    // 4. Get business name + logo
    let businessName = ''
    let storeLogo = null
    try {
      const { data: profile } = await supabase
        .from('users')
        .select('store_name, store_logo')
        .eq('id', userId)
        .single()
      if (profile?.store_name) businessName = profile.store_name.replace(/\s+/g, ' ').trim()
      if (profile?.store_logo && settings.include_logo_on_images !== false) storeLogo = profile.store_logo
    } catch (_) {}

    // 5. Build message from template
    const template = settings.account_template || DEFAULT_TEMPLATE
    const orderDate = new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })

    const message = template
      .replace(/\{customer_name\}/g, customerName)
      .replace(/\{phone\}/g, customerPhone || '')
      .replace(/\{order_number\}/g, orderNumber || '')
      .replace(/\{order_total\}/g, Number(totalAmount || 0).toLocaleString('en-PK'))
      .replace(/\{order_items\}/g, itemsText || 'N/A')
      .replace(/\{previous_balance\}/g, Number(previousBalance || 0).toLocaleString('en-PK'))
      .replace(/\{new_balance\}/g, Number(newBalance || 0).toLocaleString('en-PK'))
      .replace(/\{order_date\}/g, orderDate)
      .replace(/\{business_name\}/g, businessName)
      .replace(/\{subtotal\}/g, Number(subtotal || totalAmount || 0).toLocaleString('en-PK'))
      .replace(/\{discount\}/g, Number(discount || 0).toLocaleString('en-PK'))
      .replace(/\{service_charge\}/g, Number(serviceCharge || 0).toLocaleString('en-PK'))
      .replace(/\{loyalty_points\}/g, String(loyaltyPoints || 0))

    // 6. Send via WhatsApp
    let result
    if (settings.send_receipt_image && window.electronAPI?.whatsapp?.sendReceiptImage) {
      result = await window.electronAPI.whatsapp.sendReceiptImage({
        phone,
        message,
        receiptData: {
          businessName,
          logoUrl: storeLogo,
          orderNumber: orderNumber || '',
          orderDate,
          orderType: orderType || 'walkin',
          customerName,
          customerPhone: customerPhone || '',
          items: rawItems,
          subtotal: Number(subtotal || totalAmount || 0),
          discount: Number(discount || 0),
          serviceCharge: Number(serviceCharge || 0),
          deliveryCharges: Number(deliveryCharges || 0),
          total: Number(totalAmount || 0),
          previousBalance: Number(previousBalance || 0),
          newBalance: Number(newBalance || 0),
          loyaltyPoints: Number(loyaltyPoints || 0),
          paymentMethod: 'Customer Account',
        }
      })
    } else {
      result = await window.electronAPI.whatsapp.sendOrderMessage({ phone, message })
    }

    if (result?.success === false) {
      throw new Error(result?.error || 'Failed to send')
    }

    // 7. Log success
    await supabase.from('customer_account_send_logs').insert({
      user_id: userId,
      phone,
      customer_name: customerName,
      order_number: orderNumber || null,
      order_id: orderId || null,
      message_type: settings.send_receipt_image ? 'receipt_image' : 'text',
      message_preview: message.substring(0, 200),
      status: 'sent',
      trigger: 'auto',
    })

    console.log(`[AccountAutoSend] Bill sent to ${customerName} (${phone})`)
    notify.success(`Bill auto-sent to ${customerName}`)
  } catch (e) {
    console.error('[AccountAutoSend] Failed:', e.message)
    notify.error(`Auto-send failed for ${customer?.full_name || 'customer'}`)

    // Log failure
    try {
      const userId = authManager.getCurrentUser()?.id
      await supabase.from('customer_account_send_logs').insert({
        user_id: userId,
        phone: customer?.phone || '',
        customer_name: customer?.full_name || 'Customer',
        order_number: orderNumber || null,
        order_id: orderId || null,
        message_type: 'text',
        message_preview: '',
        status: 'failed',
        trigger: 'auto',
        error_message: e.message,
      })
    } catch (_) {}
  }
}