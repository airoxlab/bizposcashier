// lib/orderReopenHandler.js - New file to handle order reopening
import { authManager } from './authManager'
import { supabase } from './supabase'

export class OrderReopenHandler {
  
  /**
   * Reopen an existing order for modification
   * This will:
   * 1. Load the order data into the cart
   * 2. Store the original order ID for updating
   * 3. Log the reopening action in order history
   */
  static async reopenOrder(order, orderItems, router) {
    try {
      console.log('📝 Reopening order:', order.order_number)
      
      // Log the reopen action
      await authManager.logOrderAction(
        order.id,
        'reopened',
        null,
        `Order reopened for modification by ${authManager.getDisplayName()}`
      )
      
      // Prepare cart data from order items
      const cart = orderItems.map((item, index) => ({
        id: `${item.product_id}-${item.variant_id || 'base'}-${Date.now()}-${index}`,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        basePrice: item.base_price,
        variantPrice: item.variant_price || 0,
        finalPrice: item.final_price,
        quantity: item.quantity,
        totalPrice: item.total_price,
        image: item.image_url,
        isDeal: item.is_deal || false,
        dealProducts: item.deal_products
      }))

      // CRITICAL: Store original order items for tracking changes when printing
      const originalItems = orderItems.map(item => ({
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        quantity: item.quantity,
        isDeal: item.is_deal || false,
        dealProducts: item.deal_products
      }))
      
      // Store order data for reopening
      const reopenData = {
        cart,
        customer: order.customers,
        orderInstructions: order.order_instructions || '',
        discount: order.discount_percentage || 0,
        subtotal: order.subtotal,
        discountAmount: order.discount_amount || 0,
        total: order.total_amount,
        orderType: order.order_type,
        // CRITICAL: Store original order info for updating
        originalOrderId: order.id,
        originalOrderNumber: order.order_number,
        isReopened: true,
        reopenedAt: new Date().toISOString(),
        reopenedBy: authManager.getDisplayName(),
        reopenedByRole: authManager.getRole(),
        reopenedByCashierId: authManager.getCashierInfo()?.id
      }
      
      // Save to localStorage
      localStorage.setItem('walkin_cart', JSON.stringify(reopenData.cart))
      localStorage.setItem('walkin_customer', JSON.stringify(reopenData.customer))
      localStorage.setItem('walkin_instructions', reopenData.orderInstructions)
      localStorage.setItem('walkin_discount', reopenData.discount.toString())
      
      // CRITICAL: Store reopen metadata with original items for change tracking
      localStorage.setItem('order_reopen_data', JSON.stringify({
        originalOrderId: reopenData.originalOrderId,
        originalOrderNumber: reopenData.originalOrderNumber,
        originalOrderStatus: order.order_status, // Preserve status so it's not reset to Pending
        isReopened: true,
        reopenedAt: reopenData.reopenedAt,
        reopenedBy: reopenData.reopenedBy,
        reopenedByRole: reopenData.reopenedByRole,
        reopenedByCashierId: reopenData.reopenedByCashierId,
        originalItems: originalItems // Store original items for comparison
      }))
      
      console.log('✅ Order data loaded for modification')
      
      // Navigate to appropriate page based on order type
      const routes = {
        'walkin': '/walkin',
        'takeaway': '/takeaway',
        'delivery': '/delivery'
      }
      
      router.push(routes[order.order_type] || '/walkin')
      
      return { success: true }
      
    } catch (error) {
      console.error('❌ Error reopening order:', error)
      return { success: false, error: error.message }
    }
  }
  
  /**
   * Check if current cart is a reopened order
   */
  static isReopenedOrder() {
    if (typeof window === 'undefined') return false
    
    const reopenData = localStorage.getItem('order_reopen_data')
    return reopenData !== null
  }
  
  /**
   * Get reopen metadata
   */
  static getReopenData() {
    if (typeof window === 'undefined') return null
    
    try {
      const reopenData = localStorage.getItem('order_reopen_data')
      if (!reopenData) return null
      
      return JSON.parse(reopenData)
    } catch (error) {
      console.error('Error getting reopen data:', error)
      return null
    }
  }
  
  /**
   * Update existing order instead of creating new one
   */
  static async updateExistingOrder(orderData, reopenData) {
    try {
      console.log('📝 Updating existing order:', reopenData.originalOrderNumber)
      
      const session = authManager.getCurrentSession()
      
      // Calculate what changed
      const changes = {
        previousTotal: orderData.previousTotal,
        newTotal: orderData.total,
        itemsModified: true
      }
      
      // Update the order
      const { data: updatedOrder, error: updateError } = await supabase
        .from('orders')
        .update({
          subtotal: orderData.subtotal,
          discount_percentage: orderData.discount || 0,
          discount_amount: orderData.discountAmount || 0,
          total_amount: orderData.total,
          payment_method: orderData.paymentMethod,
          payment_status: orderData.paymentStatus || 'Paid',
          order_instructions: orderData.orderInstructions,
          modified_by_cashier_id: authManager.getCashierInfo()?.id || null,
          session_id: session?.sessionId || null,
          updated_at: new Date().toISOString()
        })
        .eq('id', reopenData.originalOrderId)
        .select()
        .single()
      
      if (updateError) throw updateError
      
      // Delete old order items
      const { error: deleteError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', reopenData.originalOrderId)
      
      if (deleteError) throw deleteError
      
      // Insert new order items
      const orderItemsData = orderData.cart.map(item => ({
        order_id: reopenData.originalOrderId,
        product_id: item.productId,
        variant_id: item.variantId,
        product_name: item.productName,
        variant_name: item.variantName,
        base_price: item.basePrice,
        variant_price: item.variantPrice,
        final_price: item.finalPrice,
        quantity: item.quantity,
        total_price: item.totalPrice
      }))
      
      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItemsData)
      
      if (itemsError) throw itemsError
      
      // Log the modification
      await authManager.logOrderAction(
        reopenData.originalOrderId,
        'modified',
        changes,
        `Order modified by ${authManager.getDisplayName()} (${authManager.getRole()})`
      )
      
      console.log('✅ Order updated successfully')
      
      // Clear reopen data
      this.clearReopenData()
      
      return {
        success: true,
        order: updatedOrder,
        orderNumber: reopenData.originalOrderNumber,
        isUpdate: true
      }
      
    } catch (error) {
      console.error('❌ Error updating order:', error)
      throw error
    }
  }
  
  /**
   * Clear reopen data after successful update
   */
  static clearReopenData() {
    if (typeof window === 'undefined') return
    
    localStorage.removeItem('order_reopen_data')
    console.log('🗑️ Reopen data cleared')
  }
}

export default OrderReopenHandler