'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { User, ShoppingCart, Plus, Minus, Trash2, WifiOff, Gift, X, Sun, Moon, Wifi, Table2, FileText, MessageSquare, ChevronDown, ChevronUp } from 'lucide-react'
import LoyaltyPointsDisplay from '@/components/pos/LoyaltyPointsDisplay'
import { notify } from '../ui/NotificationSystem'
import InlineCustomerPanel from '../pos/InlineCustomerPanel'

export default function CartSidebar({
  cart = [],
  customer,
  orderInstructions = '',
  onUpdateQuantity,
  onRemoveItem,
  onShowCustomerForm,
  onOrderAndPay,
  calculateSubtotal,
  calculateTotal,
  onClearCart,
  classes,
  isDark,
  networkStatus,
  orderType = 'walkin',
  isReopenedOrder = false,
  onToggleTheme,
  selectedTable,
  onChangeTable,
  onInstructionsChange,
  onUpdateItemInstruction,
  inlineCustomer = false,
  onCustomerChange,
  orderData = {},
  onOrderDataChange
}) {
  const [showInstructionPanel, setShowInstructionPanel] = useState(false)
  const [draftInstruction, setDraftInstruction] = useState('')
  const [expandedItemId, setExpandedItemId] = useState(null)
  const [custMode, setCustMode] = useState('idle') // 'idle' | 'searching' | 'expanded'

  // Reset customer panel when customer is cleared externally
  useEffect(() => {
    if (!customer) setCustMode('idle')
  }, [customer])
  const [draftItemInstructions, setDraftItemInstructions] = useState({})
  const getOrderTypeTitle = () => {
    switch(orderType) {
      case 'walkin': return 'POS Walk-in'
      case 'takeaway': return 'POS Takeaway'
      case 'delivery': return 'POS Delivery'
      default: return 'POS'
    }
  }

  const getHeaderGradient = () => {
    switch(orderType) {
      case 'takeaway': return 'bg-gradient-to-r from-orange-600 to-red-600'
      case 'delivery': return 'bg-gradient-to-r from-blue-600 to-cyan-600'
      default: return 'bg-gradient-to-r from-purple-600 to-blue-600'
    }
  }

  // Handle quantity decrease with permission check for reopened orders
  const handleQuantityUpdate = (itemId, newQuantity, currentItem) => {
    // If trying to decrease quantity in a reopened order
    if (isReopenedOrder && newQuantity < currentItem.quantity) {
      // Check permission flag
      const canDecreaseQty = localStorage.getItem(`${orderType}_can_decrease_qty`) === 'true'

      if (!canDecreaseQty) {
        // Get original state to check original quantities
        const originalStateStr = localStorage.getItem(`${orderType}_original_state`)
        if (originalStateStr) {
          try {
            const originalState = JSON.parse(originalStateStr)
            // Find the original item by matching product and variant names
            const originalItem = originalState.items?.find(
              i => i.productName === currentItem.productName &&
                   i.variantName === currentItem.variantName
            )

            if (originalItem && newQuantity < originalItem.quantity) {
              // Cannot decrease below original quantity
              notify.error(`Cannot decrease below original quantity (${originalItem.quantity})`)
              return // Block the decrease
            }
          } catch (error) {
            console.error('Error parsing original state:', error)
          }
        }
      }
    }

    // Proceed with quantity update
    onUpdateQuantity(itemId, newQuantity)
  }

  return (
    <div className={`w-80 ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-l flex flex-col`}>
      <div className={`p-3 ${classes.border} border-b ${classes.card}`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-base font-bold ${classes.textPrimary}`}>{getOrderTypeTitle()}</h2>
            <p className={`${classes.textSecondary} text-xs`}>{cart.length} items in cart</p>
          </div>
          <div className="flex items-center space-x-1.5">
            {/* Theme Toggle */}
            {onToggleTheme && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onToggleTheme}
                className={`p-1.5 rounded-lg ${classes.button} transition-all`}
              >
                <AnimatePresence mode="wait">
                  {isDark ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Sun className="w-3.5 h-3.5 text-yellow-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Moon className={`w-3.5 h-3.5 ${classes.textSecondary}`} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            )}

            {/* WiFi Status */}
            <div className="flex items-center">
              {networkStatus?.isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-red-500" />
              )}
              {networkStatus?.unsyncedOrders > 0 && (
                <span className={`text-xs ${isDark ? 'text-yellow-400' : 'text-yellow-600'} font-medium ml-0.5`}>
                  {networkStatus.unsyncedOrders}
                </span>
              )}
            </div>

            {/* Clear Cart Button */}
            {cart.length > 0 && onClearCart && (
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={onClearCart}
                className={`p-1.5 ${isDark ? 'bg-red-900/20 hover:bg-red-900/40' : 'bg-red-50 hover:bg-red-100'} rounded-lg transition-colors`}
                title="Clear Cart"
              >
                <X className={`w-4 h-4 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
              </motion.button>
            )}
          </div>
        </div>
        {isReopenedOrder && (
          <div className={`mt-1.5 ${isDark ? 'bg-blue-900/20' : 'bg-blue-50'} ${classes.border} border rounded-lg p-1.5`}>
            <p className={`text-xs ${isDark ? 'text-blue-300' : 'text-blue-700'} font-medium`}>
              🔄 Reopened for modification
            </p>
          </div>
        )}
      </div>

      {/* Action Row - always two compact buttons side-by-side */}
      <div className={`p-2 ${classes.border} border-b ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'}`}>
        <div className="flex items-center gap-1.5">

          {/* Table Button — LEFT position for classic pages (walkin/takeaway/delivery) */}
          {!inlineCustomer && selectedTable && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onChangeTable}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isDark ? 'bg-purple-900/30 border-purple-700 text-purple-300 hover:bg-purple-900/50' : 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <Table2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{selectedTable.table_name || selectedTable.table_number}</span>
            </motion.button>
          )}

          {/* ── INLINE CUSTOMER TRIGGER (new-order page) ── */}
          {inlineCustomer && (
            customer ? (
              /* Customer selected: name button + clear */
              <div className="flex flex-1 items-center gap-1 min-w-0">
                <button
                  onClick={() => { setShowInstructionPanel(false); setCustMode(m => m === 'expanded' ? 'idle' : 'expanded') }}
                  className={`flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                    custMode === 'expanded'
                      ? isDark ? 'bg-green-800/40 border-green-500 text-green-200' : 'bg-green-100 border-green-500 text-green-800'
                      : isDark ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-green-50 border-green-300 text-green-700'
                  }`}
                >
                  <User className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate flex-1 text-left">{customer.full_name?.trim() || customer.phone}</span>
                  {custMode === 'expanded'
                    ? <ChevronUp className="w-3 h-3 flex-shrink-0" />
                    : <ChevronDown className="w-3 h-3 flex-shrink-0" />
                  }
                </button>
                <button
                  onClick={() => { onCustomerChange?.(null); setCustMode('idle'); setShowInstructionPanel(false) }}
                  className={`flex-shrink-0 p-1.5 rounded-lg border transition-all ${isDark ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300'}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ) : (
              /* No customer: Add Customer dashed button */
              <button
                onClick={() => { setShowInstructionPanel(false); setCustMode(m => m === 'searching' ? 'idle' : 'searching') }}
                className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                  custMode === 'searching'
                    ? isDark ? 'border-purple-500 text-purple-400 bg-gray-800/60' : 'border-purple-400 text-purple-600 bg-purple-50'
                    : isDark ? 'border-gray-600 border-dashed text-gray-400 hover:border-purple-500 hover:text-purple-400' : 'border-gray-300 border-dashed text-gray-500 hover:border-purple-400 hover:text-purple-600'
                }`}
              >
                <User className="w-3 h-3" />
                <span>{custMode === 'searching' ? 'Cancel' : selectedTable ? 'Customer' : 'Add Customer'}</span>
              </button>
            )
          )}

          {/* ── MODAL CUSTOMER BUTTON (other pages) ── */}
          {!inlineCustomer && (customer ? (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onShowCustomerForm}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isDark ? 'bg-green-900/30 border-green-700 text-green-300 hover:bg-green-900/50' : 'bg-green-50 border-green-300 text-green-700 hover:bg-green-100'
              }`}
            >
              <User className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{customer.full_name?.trim() || customer.phone}</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onShowCustomerForm}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-dashed transition-all ${
                isDark ? 'border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-400' : 'border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600'
              }`}
            >
              <User className="w-3 h-3" />
              <span>Customer</span>
            </motion.button>
          ))}

          {/* Instruction Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => {
              // always close customer panel when interacting with note
              setCustMode('idle')
              if (!showInstructionPanel) {
                setDraftInstruction(orderInstructions)
                setShowInstructionPanel(true)
              } else {
                setShowInstructionPanel(false)
              }
            }}
            className={`${inlineCustomer && customer ? 'flex-shrink-0' : 'flex-1'} flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
              orderInstructions
                ? isDark ? 'bg-amber-900/30 border-amber-600 text-amber-300' : 'bg-amber-50 border-amber-400 text-amber-700'
                : isDark ? 'border-gray-600 text-gray-400 hover:border-amber-500 hover:text-amber-400' : 'border-gray-300 text-gray-500 hover:border-amber-400 hover:text-amber-600'
            }`}
          >
            <FileText className="w-3 h-3" />
            <span>{orderInstructions ? 'Note ✓' : 'Note'}</span>
          </motion.button>

          {/* Table Button — RIGHT position for modern new-order page only */}
          {inlineCustomer && selectedTable && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={onChangeTable}
              className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                isDark ? 'bg-purple-900/30 border-purple-700 text-purple-300 hover:bg-purple-900/50' : 'bg-purple-50 border-purple-300 text-purple-700 hover:bg-purple-100'
              }`}
            >
              <Table2 className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[56px]">{selectedTable.table_name || selectedTable.table_number}</span>
            </motion.button>
          )}
        </div>

        {/* ── FULL-WIDTH CONTENT BELOW (search / customer fields / instruction) ── */}

        {/* Inline Customer Panel content — full width, controlled from action row */}
        {inlineCustomer && (custMode === 'searching' || custMode === 'expanded') && (
          <InlineCustomerPanel
            contentOnly={true}
            mode={custMode}
            onModeChange={setCustMode}
            orderType={orderType}
            customer={customer}
            orderData={orderData}
            onCustomerChange={(c) => { onCustomerChange?.(c) }}
            onOrderDataChange={onOrderDataChange}
            classes={classes}
            isDark={isDark}
          />
        )}

        {/* Inline Instruction Textarea */}
        {showInstructionPanel && (
          <div className="mt-1.5 space-y-1">
            <textarea
              autoFocus
              rows={2}
              value={draftInstruction}
              onChange={e => setDraftInstruction(e.target.value)}
              placeholder="Special requests or notes for this order..."
              className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none resize-none ${
                isDark
                  ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-amber-500'
                  : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-amber-400'
              }`}
            />
            <div className="flex gap-1">
              <button
                onClick={() => setShowInstructionPanel(false)}
                className={`flex-1 py-1 text-xs rounded border transition-colors ${
                  isDark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-100'
                }`}
              >Cancel</button>
              <button
                onClick={() => { onInstructionsChange?.(draftInstruction); setShowInstructionPanel(false) }}
                className="flex-[2] py-1 text-xs font-bold rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors"
              >Save</button>
            </div>
          </div>
        )}
      </div>

      {/* Loyalty Points Display - Below Customer Section */}
      {customer && (
        <div className="px-2 pb-2">
          <LoyaltyPointsDisplay
            customer={customer}
            cart={cart}
            orderType={orderType}
            subtotal={calculateSubtotal()}
            theme={isDark ? 'dark' : 'light'}
          />
        </div>
      )}

      {/* Cart Items */}
      <div className="flex-1 overflow-y-auto p-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {cart.length === 0 ? (
          <div className="text-center py-6">
            <div className={`w-12 h-12 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-2`}>
              <ShoppingCart className={`w-6 h-6 ${classes.textSecondary}`} />
            </div>
            <h3 className={`text-sm font-semibold ${classes.textSecondary} mb-1`}>Cart is empty</h3>
            <p className={`${classes.textSecondary} text-xs`}>Add items to get started</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <AnimatePresence>
              {cart.map((item, index) => (
                <motion.div
                  key={item.id ?? `item-${index}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ delay: index * 0.05 }}
                  className={`${classes.card} rounded-lg p-2 ${classes.shadow} shadow-sm ${classes.border} border group hover:shadow-md transition-all duration-200`}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <div className="flex-1 min-w-0">
                      {/* Deal Badge */}
                      {item.isDeal && (
                        <div className="flex items-center space-x-0.5 mb-0.5">
                          <Gift className={`w-2.5 h-2.5 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                          <span className={`text-[10px] font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>
                            DEAL
                          </span>
                        </div>
                      )}

                      <h4 className={`font-semibold ${classes.textPrimary} text-xs leading-tight truncate`}>
                        {item.isDeal ? item.dealName : item.productName}
                      </h4>

                      {/* Deal price adjustment */}
                      {item.isDeal && item.priceAdjustment > 0 && (
                        <div className="text-[10px] text-orange-600 font-semibold mt-0.5">
                          Base: Rs {item.baseDealPrice} + Rs {item.priceAdjustment} (upgrade)
                        </div>
                      )}

                      {/* Regular product variant */}
                      {!item.isDeal && item.variantName && (
                        <p className={`text-[10px] ${isDark ? 'text-purple-400' : 'text-purple-600'} font-medium`}>
                          {item.variantName}
                        </p>
                      )}

                      {/* Deal products list */}
                      {item.isDeal && item.dealProducts && (
                        <div className="mt-0.5 space-y-0">
                          {item.dealProducts.map((dp, idx) => {
                            const flavorName = dp.variant || (dp.flavor ? (typeof dp.flavor === 'object' ? dp.flavor.name || dp.flavor.flavor_name : dp.flavor) : null);
                            return (
                              <p key={idx} className={`text-[10px] ${classes.textSecondary}`}>
                                • {dp.quantity}x {dp.name}
                                {flavorName && (
                                  <span className={`ml-0.5 ${isDark ? 'text-green-400' : 'text-green-600'} font-semibold`}>
                                    ({flavorName}
                                    {dp.priceAdjustment > 0 && ` +Rs ${dp.priceAdjustment}`})
                                  </span>
                                )}
                              </p>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => onRemoveItem(item.id)}
                        className={`p-0.5 text-red-400 hover:text-red-600 rounded transition-all`}
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                    <div className={`flex items-center ${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-md p-0.5`}>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleQuantityUpdate(item.id, item.quantity - 1, item)}
                        className="w-5 h-5 bg-red-500 hover:bg-red-600 text-white rounded flex items-center justify-center transition-colors"
                      >
                        <Minus className="w-2.5 h-2.5" />
                      </motion.button>
                      <span className={`font-bold ${classes.textPrimary} w-6 text-center text-xs`}>
                        {item.quantity}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => handleQuantityUpdate(item.id, item.quantity + 1, item)}
                        className="w-5 h-5 bg-green-500 hover:bg-green-600 text-white rounded flex items-center justify-center transition-colors"
                      >
                        <Plus className="w-2.5 h-2.5" />
                      </motion.button>
                    </div>
                      <button
                        onClick={() => {
                          const opening = expandedItemId !== item.id
                          setExpandedItemId(opening ? item.id : null)
                          if (opening) {
                            setDraftItemInstructions(prev => ({ ...prev, [item.id]: item.itemInstructions || '' }))
                          }
                        }}
                        className={`w-6 h-6 rounded flex items-center justify-center transition-all ${
                          item.itemInstructions
                            ? isDark ? 'bg-amber-500 text-white' : 'bg-amber-400 text-white'
                            : isDark ? 'bg-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-white' : 'bg-amber-100 text-amber-500 hover:bg-amber-400 hover:text-white'
                        }`}
                        title="Item instructions"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="text-right">
                      <div className={`text-[10px] ${classes.textSecondary}`}>
                        Rs {item.finalPrice || 0} × {item.quantity}
                      </div>
                      <div className={`font-bold ${classes.textPrimary} text-xs`}>
                        Rs {(item.totalPrice || 0).toFixed(2)}
                      </div>
                    </div>
                  </div>

                  {/* Inline item instruction panel */}
                  <AnimatePresence>
                    {expandedItemId === item.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.18 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-1.5 pt-1.5 border-t border-dashed border-amber-400/40 space-y-1.5">
                          <textarea
                            autoFocus
                            rows={2}
                            value={draftItemInstructions[item.id] ?? item.itemInstructions ?? ''}
                            onChange={e => setDraftItemInstructions(prev => ({ ...prev, [item.id]: e.target.value }))}
                            placeholder="Note for this item..."
                            className={`w-full px-2 py-1 text-[11px] rounded border resize-none focus:outline-none focus:ring-1 focus:ring-amber-400 ${
                              isDark
                                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                                : 'bg-amber-50 border-amber-200 text-gray-800 placeholder-gray-400'
                            }`}
                          />
                          <div className="flex gap-1">
                            <button
                              onClick={() => setExpandedItemId(null)}
                              className={`flex-1 py-1 text-[11px] font-medium rounded transition-colors ${
                                isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                              }`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => {
                                onUpdateItemInstruction?.(item.id, draftItemInstructions[item.id] ?? '')
                                setExpandedItemId(null)
                              }}
                              className="flex-[2] py-1 text-[11px] font-bold rounded bg-amber-500 hover:bg-amber-600 text-white transition-colors"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Cart Summary & Checkout */}
      {cart.length > 0 && (
        <div className={`p-2 ${classes.border} border-t ${classes.card}`}>
          {/* Price Summary */}
          <div className={`mb-2 p-2 ${isDark ? 'bg-gray-900/50' : 'bg-gray-50'} rounded-lg`}>
            {orderType === 'delivery' && (parseFloat(calculateTotal()) - parseFloat(calculateSubtotal())) > 0 && (
              <>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs ${classes.textSecondary}`}>Subtotal:</span>
                  <span className={`text-xs ${classes.textSecondary}`}>Rs {parseFloat(calculateSubtotal()).toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span className={`text-xs font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>Delivery Fee:</span>
                  <span className={`text-xs font-medium ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>+Rs {(parseFloat(calculateTotal()) - parseFloat(calculateSubtotal())).toFixed(2)}</span>
                </div>
              </>
            )}
            <div className="flex justify-between items-center">
              <span className={`text-sm font-bold ${classes.textPrimary}`}>Total:</span>
              <span className={`text-base font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>Rs {parseFloat(calculateTotal()).toFixed(2)}</span>
            </div>
          </div>

          {/* Offline Warning */}
          {!networkStatus?.isOnline && (
            <div className={`mb-2 p-2 ${isDark ? 'bg-orange-900/20 border-orange-800' : 'bg-orange-50 border-orange-200'} border rounded-lg`}>
              <div className="flex items-center space-x-1.5">
                <WifiOff className={`w-3 h-3 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                <span className={`${isDark ? 'text-orange-300' : 'text-orange-700'} text-xs font-medium`}>
                  Offline - Will sync later
                </span>
              </div>
            </div>
          )}

          {/* Checkout Button */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOrderAndPay}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 rounded-lg shadow-lg hover:shadow-xl transition-all duration-200"
          >
            <div className="flex items-center justify-center text-sm">
              <ShoppingCart className="w-4 h-4 mr-1.5" />
              Order & Pay Rs {parseFloat(calculateTotal()).toFixed(2)}
            </div>
          </motion.button>
        </div>
      )}

    </div>
  )
}
