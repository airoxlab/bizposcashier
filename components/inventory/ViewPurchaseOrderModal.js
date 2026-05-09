'use client'

import React, { useState, useEffect } from 'react'
import { X, Download, Trash2, Loader2, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import NotificationSystem, { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'
import ReceiveStockModal from './ReceiveStockModal'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export default function ViewPurchaseOrderModal({ isOpen, onClose, purchaseOrder, onDeleted, onUpdated }) {
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [supplier, setSupplier] = useState(null)
  const [showReceiveModal, setShowReceiveModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const user = authManager.getCurrentUser()
  const userId = user?.id

  useEffect(() => {
    if (isOpen && purchaseOrder?.id) {
      loadDetails()
    }
  }, [isOpen, purchaseOrder?.id])

  const loadDetails = async () => {
    try {
      setLoading(true)

      // Load items
      const { data: itemsData } = await supabase
        .from('purchase_order_items')
        .select(`
          *,
          inventory_items(id, name, sku),
          units:purchase_unit_id(id, abbreviation)
        `)
        .eq('purchase_order_id', purchaseOrder.id)

      // Load supplier
      const { data: supplierData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('id', purchaseOrder.supplier_id)
        .single()

      setItems(itemsData || [])
      setSupplier(supplierData)
    } catch (error) {
      console.error('Error loading details:', error)
      notify.error('Failed to load purchase order details')
    } finally {
      setLoading(false)
    }
  }

  const canDelete = permissionManager.hasPermission('PO_DELETE') || authManager.getRole() === 'admin'
  const canReceive = permissionManager.hasPermission('PO_RECEIVE') || authManager.getRole() === 'admin'

  const handleDelete = async () => {
    try {
      setDeleting(true)

      const { data, error } = await supabase.rpc('delete_purchase_order', {
        p_po_id: purchaseOrder.id,
        p_user_id: userId
      })

      if (error) throw error

      notify.success(`Purchase order ${purchaseOrder.po_number} deleted`)
      onDeleted?.()
      onClose()
    } catch (error) {
      console.error('Error deleting PO:', error)
      notify.error(error.message || 'Failed to delete purchase order')
    } finally {
      setDeleting(false)
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      const pageWidth = doc.internal.pageSize.getWidth()

      // Header
      doc.setFontSize(16)
      doc.text('Purchase Order', pageWidth / 2, 20, { align: 'center' })

      // PO Details
      doc.setFontSize(10)
      doc.text(`PO #: ${purchaseOrder.po_number}`, 20, 35)
      doc.text(`Date: ${new Date(purchaseOrder.po_date).toLocaleDateString('en-PK')}`, 20, 42)
      doc.text(`Status: ${purchaseOrder.status.toUpperCase()}`, 20, 49)
      doc.text(`Supplier: ${supplier?.name || 'N/A'}`, 20, 56)

      // Items table
      const tableData = items.map(item => [
        item.inventory_items?.name || 'N/A',
        item.quantity,
        item.units?.abbreviation || '',
        `Rs. ${item.cost_per_unit.toFixed(2)}`,
        `Rs. ${item.total_cost.toFixed(2)}`
      ])

      autoTable(doc, {
        head: [['Item', 'Qty', 'Unit', 'Cost/Unit', 'Total']],
        body: tableData,
        startY: 65,
        styles: { fontSize: 9 }
      })

      // Totals
      const finalY = doc.lastAutoTable.finalY + 10
      doc.setFontSize(10)
      doc.text(`Subtotal: Rs. ${purchaseOrder.total_amount.toFixed(2)}`, 150, finalY)
      doc.text(`Tax: Rs. ${purchaseOrder.tax_amount.toFixed(2)}`, 150, finalY + 7)
      doc.setFontSize(12)
      doc.text(`Grand Total: Rs. ${purchaseOrder.grand_total.toFixed(2)}`, 150, finalY + 15)

      doc.save(`PO-${purchaseOrder.po_number}.pdf`)
      notify.success('PDF exported successfully')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      notify.error('Failed to export PDF')
    }
  }

  if (!isOpen || !purchaseOrder) return null

  const statusColor = {
    draft: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
    received: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    partial: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    cancelled: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-300'
  }

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} size="lg">
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">Purchase Order #{purchaseOrder.po_number}</h2>
              <span className={`inline-block mt-2 px-3 py-1 rounded-full text-xs font-medium ${statusColor[purchaseOrder.status] || ''}`}>
                {purchaseOrder.status.toUpperCase()}
              </span>
            </div>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
              </div>
            ) : (
              <>
                {/* Details Card */}
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-2">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Supplier</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{supplier?.name || 'N/A'}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Date</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">
                        {new Date(purchaseOrder.po_date).toLocaleDateString('en-PK')}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Items</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">{items.length}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-gray-600 dark:text-gray-400">Grand Total</p>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white">Rs. {purchaseOrder.grand_total.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                {/* Items */}
                {items.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-3">Items</h3>
                    <div className="space-y-2">
                      {items.map((item) => (
                        <div key={item.id} className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-gray-900 dark:text-white">{item.inventory_items?.name}</p>
                              <p className="text-sm text-gray-600 dark:text-gray-400">
                                {item.quantity} {item.units?.abbreviation} @ Rs. {item.cost_per_unit.toFixed(2)}
                              </p>
                              {item.batch_number && (
                                <p className="text-xs text-gray-500 dark:text-gray-500">Batch: {item.batch_number}</p>
                              )}
                              {item.received_quantity > 0 && (
                                <p className="text-xs text-green-600 dark:text-green-400">
                                  Received: {item.received_quantity} {item.units?.abbreviation}
                                </p>
                              )}
                            </div>
                            <p className="font-semibold text-gray-900 dark:text-white">Rs. {item.total_cost.toFixed(2)}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Totals */}
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-700 dark:text-gray-300">Subtotal:</span>
                    <span className="font-medium text-gray-900 dark:text-white">Rs. {purchaseOrder.total_amount.toFixed(2)}</span>
                  </div>
                  {purchaseOrder.delivery_charges > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Delivery:</span>
                      <span className="text-gray-900 dark:text-white">Rs. {purchaseOrder.delivery_charges.toFixed(2)}</span>
                    </div>
                  )}
                  {purchaseOrder.tax_amount > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-700 dark:text-gray-300">Tax:</span>
                      <span className="text-gray-900 dark:text-white">Rs. {purchaseOrder.tax_amount.toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold pt-2 border-t border-blue-200 dark:border-blue-700">
                    <span className="text-blue-900 dark:text-blue-300">Grand Total:</span>
                    <span className="text-blue-900 dark:text-blue-300">Rs. {purchaseOrder.grand_total.toFixed(2)}</span>
                  </div>
                </div>

                {purchaseOrder.notes && (
                  <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</p>
                    <p className="text-sm text-gray-700 dark:text-gray-300">{purchaseOrder.notes}</p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 gap-2 flex-wrap">
            <div className="flex gap-2">
              <button
                onClick={handleExportPDF}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded flex items-center gap-2 text-sm"
              >
                <Download className="w-4 h-4" /> PDF
              </button>

              {purchaseOrder.status === 'draft' && canDelete && (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="px-3 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded flex items-center gap-2 text-sm"
                >
                  <Trash2 className="w-4 h-4" /> Delete
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Close
              </button>

              {purchaseOrder.status !== 'cancelled' && purchaseOrder.status !== 'received' && canReceive && (
                <button
                  onClick={() => setShowReceiveModal(true)}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded"
                >
                  Receive Stock
                </button>
              )}
            </div>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
          <div className="p-6">
            <h2 className="text-lg font-bold text-gray-900 dark:text-white mb-4">Delete Purchase Order?</h2>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Are you sure you want to delete PO #{purchaseOrder.po_number}? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white font-medium rounded flex items-center gap-2"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Delete
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Receive Stock Modal */}
      <ReceiveStockModal
        isOpen={showReceiveModal}
        onClose={() => setShowReceiveModal(false)}
        purchaseOrder={purchaseOrder}
        onReceived={() => {
          setShowReceiveModal(false)
          onUpdated?.()
          loadDetails()
        }}
      />
    </>
  )
}
