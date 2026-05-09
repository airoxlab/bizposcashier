'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, AlertCircle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import NotificationSystem, { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'

export default function ReceiveStockModal({ isOpen, onClose, purchaseOrder, onReceived }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [receivedQty, setReceivedQty] = useState({})

  const user = authManager.getCurrentUser()
  const userId = user?.id

  useEffect(() => {
    if (isOpen && purchaseOrder?.id) {
      loadItems()
    }
  }, [isOpen, purchaseOrder?.id])

  const loadItems = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items(id, name, sku),
          units:purchase_unit_id(id, name, abbreviation)
        `)
        .eq('purchase_order_id', purchaseOrder.id)

      if (error) throw error

      setItems(data || [])

      // Initialize received quantities to full remaining amount
      const initial = {}
      data?.forEach(item => {
        const remaining = (item.quantity || 0) - (item.received_quantity || 0)
        initial[item.id] = remaining > 0 ? remaining : 0
      })
      setReceivedQty(initial)
    } catch (error) {
      console.error('Error loading items:', error)
      notify.error('Failed to load items')
    } finally {
      setLoading(false)
    }
  }

  const canReceive = permissionManager.hasPermission('PO_RECEIVE') || authManager.getRole() === 'admin'

  const handleReceive = async () => {
    if (!canReceive) {
      notify.error('You do not have permission to receive stock')
      return
    }

    const itemsToReceive = Object.entries(receivedQty)
      .filter(([, qty]) => qty > 0)
      .map(([itemId, qty]) => ({
        po_item_id: itemId,
        received_qty: qty
      }))

    if (itemsToReceive.length === 0) {
      notify.error('Please enter quantity for at least one item')
      return
    }

    try {
      setLoading(true)

      // Call RPC directly (no API route in cashier)
      const { data, error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: purchaseOrder.id,
        p_user_id: userId,
        p_items: itemsToReceive
      })

      if (error) throw error

      notify.success(`Stock received successfully. Order status: ${data.po_status}`)
      onReceived?.(data)
      onClose()
    } catch (error) {
      console.error('Error receiving stock:', error)
      notify.error(error.message || 'Failed to receive stock')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !purchaseOrder) return null

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Receive Stock</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6">
            <p className="text-sm text-blue-800 dark:text-blue-300">
              <strong>PO #:</strong> {purchaseOrder.po_number} | <strong>Status:</strong> {purchaseOrder.status}
            </p>
          </div>

          {loading && items.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-gray-600 dark:text-gray-400">
              No items to receive
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const remaining = (item.quantity || 0) - (item.received_quantity || 0)
                const isFullyReceived = remaining <= 0
                const qty = receivedQty[item.id] || 0

                return (
                  <div
                    key={item.id}
                    className={`p-4 rounded-lg border ${
                      isFullyReceived
                        ? 'bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700'
                        : 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 dark:text-white">
                          {item.inventory_items?.name}
                        </p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          Ordered: {item.quantity} {item.units?.abbreviation} | Already Received: {item.received_quantity || 0}
                        </p>
                      </div>
                      {isFullyReceived && (
                        <div className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded text-xs font-medium">
                          ✓ Completed
                        </div>
                      )}
                    </div>

                    {!isFullyReceived && (
                      <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Receive Now ({remaining} {item.units?.abbreviation} remaining)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          max={remaining}
                          value={qty}
                          onChange={(e) => {
                            const val = Math.min(parseFloat(e.target.value) || 0, remaining)
                            setReceivedQty({...receivedQty, [item.id]: val >= 0 ? val : 0})
                          }}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                          disabled={isFullyReceived}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            Cancel
          </button>

          <button
            onClick={handleReceive}
            disabled={loading || !canReceive}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Receive Stock
          </button>
        </div>
      </div>
    </Modal>
  )
}
