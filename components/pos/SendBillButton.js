'use client'

/**
 * SendBillButton - Reusable WhatsApp bill send button for Customer Account orders.
 *
 * Shows only when order.payment_method === 'Account' and the order has a customer.
 * Click is non-blocking — send runs in the background, button stays interactive.
 *
 * Props:
 *   order      – order object (needs: id, order_number, payment_method, customer_id,
 *                customer (or customer_name + customer_phone), total_amount, order_type, order_date)
 *   size       – 'sm' | 'md' | 'lg'  (default 'md')
 *   className  – optional extra classes
 */

import { useState, useRef, useEffect } from 'react'
import { CheckCircle, MessageSquare, Loader2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import { getStatus as waGetStatus, enqueueTextAndWait, enqueueImageAndWait } from '../../lib/whatsappQueue'

export default function SendBillButton({ order, size = 'md', className = '' }) {
  // 'idle' | 'queued' | 'sent'
  const [status, setStatus] = useState('idle')
  const [serviceEnabled, setServiceEnabled] = useState(true)
  const sendingRef = useRef(false)

  const isAdmin = authManager.getRole() === 'admin'

  // Check service_enabled + whether auto-send already sent for this order
  useEffect(() => {
    async function checkSettings() {
      try {
        const userId = authManager.getCurrentUser()?.id
        if (!userId) return

        const { data } = await supabase
          .from('customer_account_settings')
          .select('service_enabled, auto_send_on_account_payment')
          .eq('user_id', userId)
          .single()

        if (data && data.service_enabled === false) {
          setServiceEnabled(false)
        }

        // If auto-send is enabled, check if a message was already sent for this order
        if (data?.auto_send_on_account_payment && order?.order_number) {
          const { data: existingLog } = await supabase
            .from('customer_account_send_logs')
            .select('id')
            .eq('user_id', userId)
            .eq('order_number', order.order_number)
            .eq('trigger', 'auto')
            .eq('status', 'sent')
            .limit(1)
            .maybeSingle()

          if (existingLog) {
            setStatus('sent')
            // Auto-reset after a few seconds so button becomes usable for re-send
            setTimeout(() => setStatus('idle'), 5000)
          }
        }
      } catch (_) {}
    }
    checkSettings()
  }, [order?.order_number])

  // Only show for Customer Account orders with a customer
  if (!order) return null
  if (order.payment_method !== 'Account') return null

  // Support both `order.customer` (payment page) and `order.customers` (Supabase join)
  const cust = order.customer || order.customers
  const customerId = order.customer_id || cust?.id
  const customerName = cust?.full_name || order.customer_name || 'Customer'
  const customerPhone = cust?.phone || order.customer_phone
  if (!customerId || !customerPhone) return null

  // If service is disabled: hide for cashier, show warning for admin
  if (!serviceEnabled && !isAdmin) return null

  // If cashier doesn't have SEND_ACCOUNT_BILL permission, hide button
  if (!isAdmin && !permissionManager.hasPermission('SEND_ACCOUNT_BILL')) return null

  function handleClick(e) {
    if (e) e.stopPropagation()

    // Prevent double-click
    if (sendingRef.current) return
    sendingRef.current = true

    // Show loader immediately
    setStatus('sending')

    // Fire-and-forget — runs entirely in background, unlocks button when done
    sendBillInBackground()
  }

  async function sendBillInBackground() {
    // Block sending if service is disabled
    if (!serviceEnabled) {
      notify.error('Customer Account Notifications are disabled by admin')
      setStatus('idle')
      sendingRef.current = false
      return
    }

    // Desktop is needed only to render the receipt image; text always works.
    const canRenderImage =
      typeof window !== 'undefined' && !!window.electronAPI?.whatsapp?.renderReceiptImage

    try {
      const userId = authManager.getCurrentUser()?.id
      if (!userId) throw new Error('Not logged in')

      // Check WhatsApp connection first (centralized — server-side socket)
      const { status: waStatus } = await waGetStatus(userId)
      if (waStatus !== 'connected') {
        notify.error('WhatsApp is not connected. Please connect in Settings > WhatsApp.')
        setStatus('idle')
        sendingRef.current = false
        return
      }

      // Format phone
      let phone = (customerPhone || '').trim().replace(/[\s\-\.\(\)]/g, '')
      if (phone.startsWith('+')) phone = phone.slice(1)
      if (phone.startsWith('00')) phone = phone.slice(2)
      if (phone.startsWith('0') && phone.length === 11) phone = '92' + phone.slice(1)

      if (!phone || phone.length < 10) {
        throw new Error('Invalid phone number')
      }

      // Resolve order ID if not available (e.g. freshly placed order)
      let orderId = order.id
      if (!orderId && order.order_number) {
        try {
          const { data: found } = await supabase
            .from('orders')
            .select('id')
            .eq('order_number', order.order_number)
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1)
            .single()
          if (found) orderId = found.id
        } catch (_) {}
      }

      // Load user's template + receipt image toggle + logo toggle from settings
      let template = null
      let sendReceiptImage = false
      let includeLogoOnImages = true
      try {
        const { data: settings } = await supabase
          .from('customer_account_settings')
          .select('account_template, send_receipt_image, include_logo_on_images')
          .eq('user_id', userId)
          .single()
        if (settings?.account_template) template = settings.account_template
        if (settings?.send_receipt_image) sendReceiptImage = true
        if (settings?.include_logo_on_images === false) includeLogoOnImages = false
      } catch (_) {}

      // Fallback template
      if (!template) {
        template = `Dear {customer_name},\n\nYour order #{order_number} has been placed on your account.\n\n{order_items}\n\nOrder Total: Rs.{order_total}\nPrevious Balance: Rs.{previous_balance}\nNew Balance: Rs.{new_balance}\n\nDate: {order_date}\n\nThank you!\n— {business_name}`
      }

      // Fetch order items (from DB, or fallback to cart prop)
      let itemsText = ''
      let rawItems = []
      console.log('📦 [SendBill] orderId:', orderId, '| order.id:', order.id, '| order_number:', order.order_number)
      if (orderId) {
        try {
          const { data: items, error: itemsErr } = await supabase
            .from('order_items')
            .select('product_name, variant_name, quantity, final_price, total_price, is_deal, deal_products')
            .eq('order_id', orderId)

          console.log('📦 [SendBill] Items query result:', { count: items?.length, error: itemsErr?.message, items })

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
        } catch (itemEx) {
          console.error('📦 [SendBill] Items fetch exception:', itemEx)
        }
      } else {
        console.warn('📦 [SendBill] No orderId available — cannot fetch items from DB')
      }
      // Fallback: use cart items passed via order prop
      if (!itemsText && order.cart && order.cart.length > 0) {
        rawItems = order.cart.map(item => {
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

      // Fetch ledger balance info for this order
      let previousBalance = 0
      let newBalance = 0
      if (orderId) {
        try {
          const { data: ledgerEntry } = await supabase
            .from('customer_ledger')
            .select('balance_before, balance_after')
            .eq('order_id', orderId)
            .eq('transaction_type', 'debit')
            .order('created_at', { ascending: false })
            .limit(1)
            .single()

          if (ledgerEntry) {
            previousBalance = ledgerEntry.balance_before || 0
            newBalance = ledgerEntry.balance_after || 0
          }
        } catch (_) {}
      }

      // Get business name + logo
      let businessName = ''
      let storeLogo = null
      try {
        const { data: profile } = await supabase
          .from('users')
          .select('store_name, store_logo')
          .eq('id', userId)
          .single()
        if (profile?.store_name) businessName = profile.store_name
        if (profile?.store_logo && includeLogoOnImages) storeLogo = profile.store_logo
      } catch (_) {}

      // Build message
      const orderDate = order.order_date
        ? new Date(order.order_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
        : new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })

      const message = template
        .replace(/\{customer_name\}/g, customerName)
        .replace(/\{phone\}/g, customerPhone || '')
        .replace(/\{order_number\}/g, order.order_number || '')
        .replace(/\{order_total\}/g, Number(order.total_amount || 0).toLocaleString('en-PK'))
        .replace(/\{order_items\}/g, itemsText || 'N/A')
        .replace(/\{previous_balance\}/g, Number(previousBalance).toLocaleString('en-PK'))
        .replace(/\{new_balance\}/g, Number(newBalance).toLocaleString('en-PK'))
        .replace(/\{order_date\}/g, orderDate)
        .replace(/\{business_name\}/g, businessName)

      // Send via WhatsApp — with receipt image if toggle is ON
      let result
      if (sendReceiptImage && canRenderImage) {
        // Fetch extra order details for the receipt
        let subtotal = Number(order.subtotal || order.total_amount || 0)
        let discount = Number(order.discount_amount || 0)
        let serviceCharge = Number(order.service_charge_amount || 0)
        let deliveryCharges = Number(order.delivery_charges || 0)

        // Try fetching from DB if we have orderId
        if (orderId) {
          try {
            const { data: orderRow } = await supabase
              .from('orders')
              .select('subtotal, discount_amount, service_charge_amount, delivery_charges')
              .eq('id', orderId)
              .single()
            if (orderRow) {
              subtotal = Number(orderRow.subtotal || subtotal)
              discount = Number(orderRow.discount_amount || discount)
              serviceCharge = Number(orderRow.service_charge_amount || serviceCharge)
              deliveryCharges = Number(orderRow.delivery_charges || deliveryCharges)
            }
          } catch (_) {}
        }

        const rendered = await window.electronAPI.whatsapp.renderReceiptImage({
          receiptData: {
            businessName,
            logoUrl: storeLogo,
            orderNumber: order.order_number || '',
            orderDate,
            orderType: order.order_type || order.orderType || 'walkin',
            customerName,
            customerPhone: customerPhone || '',
            items: rawItems,
            subtotal,
            discount,
            serviceCharge,
            deliveryCharges,
            total: Number(order.total_amount || 0),
            previousBalance,
            newBalance,
            paymentMethod: 'Customer Account',
          }
        })
        if (rendered?.success && rendered.dataUrl) {
          result = await enqueueImageAndWait({ restaurantId: userId, phone, message, dataUrl: rendered.dataUrl, filename: `receipt_${order.order_number || 'order'}.png` })
        } else {
          result = await enqueueTextAndWait({ restaurantId: userId, phone, message })
        }
      } else {
        result = await enqueueTextAndWait({ restaurantId: userId, phone, message })
      }

      if (result?.success === false) {
        throw new Error(result?.error || 'Failed to send')
      }

      // Log success
      const logPayload = {
        user_id: userId,
        phone,
        customer_name: customerName,
        order_number: order.order_number || null,
        order_id: orderId || null,
        message_type: 'text',
        message_preview: message.substring(0, 200),
        status: 'sent',
        trigger: 'bill',
      }
      console.log('📝 [SendBill] Logging to customer_account_send_logs:', logPayload)
      const { error: logError } = await supabase.from('customer_account_send_logs').insert(logPayload)
      if (logError) {
        console.error('❌ [SendBill] Failed to insert log:', logError)
      } else {
        console.log('✅ [SendBill] Log inserted successfully')
      }

      setStatus('sent')
      sendingRef.current = false
      notify.success(`Bill sent to ${customerName}`)
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e) {
      console.error('Failed to send bill:', e)
      notify.error(`Failed: ${e.message}`)
      setStatus('idle')
      sendingRef.current = false

      // Log failure
      try {
        const uid = authManager.getCurrentUser()?.id
        const failPayload = {
          user_id: uid,
          phone: customerPhone,
          customer_name: customerName,
          order_number: order.order_number || null,
          order_id: order.id || null,
          message_type: 'text',
          message_preview: '',
          status: 'failed',
          trigger: 'bill',
          error_message: e.message,
        }
        console.log('📝 [SendBill] Logging failure:', failPayload)
        const { error: failLogErr } = await supabase.from('customer_account_send_logs').insert(failPayload)
        if (failLogErr) console.error('❌ [SendBill] Failed to insert failure log:', failLogErr)
      } catch (logErr) {
        console.error('❌ [SendBill] Exception in failure logging:', logErr)
      }
    }
  }

  const isBusy = status === 'sending'
  const isDisabled = !serviceEnabled

  // ── Size variants ──
  if (size === 'sm') {
    return (
      <button
        onClick={handleClick}
        disabled={isDisabled}
        title={isDisabled ? 'Account notifications disabled by admin' : 'Send bill via WhatsApp'}
        className={`flex items-center gap-1 px-1.5 py-1.5 text-white rounded-md transition-colors text-xs font-medium whitespace-nowrap ${
          isDisabled
            ? 'bg-gray-400 cursor-not-allowed opacity-50'
            : status === 'sent'
            ? 'bg-green-600'
            : isBusy
            ? 'bg-purple-400 pointer-events-none cursor-not-allowed'
            : 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800'
        } ${className}`}
      >
        {isBusy ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : status === 'sent' ? (
          <CheckCircle className="w-3 h-3" />
        ) : (
          <MessageSquare className="w-3 h-3" />
        )}
        {isBusy ? '' : status === 'sent' ? 'Sent' : 'Bill'}
      </button>
    )
  }

  if (size === 'lg') {
    return (
      <button
        onClick={handleClick}
        disabled={isDisabled}
        title={isDisabled ? 'Account notifications disabled by admin' : ''}
        className={`px-6 py-3 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center w-full ${
          isDisabled
            ? 'bg-gray-400 text-white cursor-not-allowed opacity-50'
            : status === 'sent'
            ? 'bg-green-600 text-white'
            : isBusy
            ? 'bg-purple-400 text-white pointer-events-none cursor-not-allowed'
            : 'bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white'
        } ${className}`}
      >
        {isBusy ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Sending...
          </>
        ) : status === 'sent' ? (
          <>
            <CheckCircle className="w-5 h-5 mr-2" />
            Bill Sent!
          </>
        ) : (
          <>
            <MessageSquare className="w-5 h-5 mr-2" />
            Send Bill on WhatsApp
          </>
        )}
      </button>
    )
  }

  // Default 'md' size
  return (
    <button
      onClick={handleClick}
      disabled={isDisabled}
      title={isDisabled ? 'Account notifications disabled by admin' : ''}
      className={`flex items-center space-x-1.5 px-3 py-2 text-white rounded-lg transition-all font-medium text-sm ${
        isDisabled
          ? 'bg-gray-400 cursor-not-allowed opacity-50'
          : status === 'sent'
          ? 'bg-green-500'
          : isBusy
          ? 'bg-purple-400 pointer-events-none cursor-not-allowed'
          : 'bg-purple-500 hover:bg-purple-600'
      } ${className}`}
    >
      {isBusy ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
      ) : status === 'sent' ? (
        <CheckCircle className="w-3.5 h-3.5" />
      ) : (
        <MessageSquare className="w-3.5 h-3.5" />
      )}
      <span>{isBusy ? 'Sending...' : status === 'sent' ? 'Sent!' : 'Send Bill'}</span>
    </button>
  )
}
