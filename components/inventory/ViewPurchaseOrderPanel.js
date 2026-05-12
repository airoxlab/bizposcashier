'use client'

import React, { useState, useEffect } from 'react'
import { ArrowLeft, Download, Trash2, Loader2, Edit2, Package, CreditCard, Check, X, AlertCircle, CheckCircle, RotateCcw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'
import RecordPaymentModal from './RecordPaymentModal'
import themeManager from '../../lib/themeManager'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const STATUS_STYLES = {
  draft:     'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  sent:      'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  received:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300',
  partial:   'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300',
  cancelled: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300'
}

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Confirmed', received: 'Received',
  partial: 'Partial', cancelled: 'Cancelled'
}

export default function ViewPurchaseOrderPanel({ purchaseOrder, onBack, onEdit, onDeleted, onUpdated }) {
  const [loading, setLoading] = useState(true)
  const [items, setItems] = useState([])
  const [supplier, setSupplier] = useState(null)
  const [allSuppliers, setAllSuppliers] = useState([])
  const [receivedQty, setReceivedQty] = useState({})
  const [receivingMode, setReceivingMode] = useState(false)
  const [receiveSaving, setReceiveSaving] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [statusChanging, setStatusChanging] = useState(false)

  const user    = authManager.getCurrentUser()
  const cashier = authManager.getCashier()
  const isAdmin = authManager.getRole() === 'admin'
  const isDark  = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const isAdminOrHasPerm = (perm) => permissionManager.hasPermission(perm) || isAdmin
  const canDelete      = isAdminOrHasPerm('PO_DELETE')
  const canReceive     = isAdminOrHasPerm('PO_RECEIVE')
  const canEdit        = isAdminOrHasPerm('PO_EDIT') && purchaseOrder?.status === 'draft'
  const canPay         = isAdminOrHasPerm('PO_PAYMENT')
  const canChangeStatus = isAdminOrHasPerm('PO_EDIT')

  const canReceiveStock = canReceive &&
    purchaseOrder?.status !== 'cancelled' &&
    purchaseOrder?.status !== 'received'

  const statusLabel = STATUS_LABELS[purchaseOrder?.status] || purchaseOrder?.status?.toUpperCase() || ''

  useEffect(() => {
    if (purchaseOrder?.id) { loadDetails(); setReceivingMode(false) }
  }, [purchaseOrder?.id])

  const loadDetails = async () => {
    try {
      setLoading(true)
      const [itemsRes, supplierRes] = await Promise.all([
        supabase.from('purchase_order_items')
          .select('*, inventory_items(id, name, sku), units:purchase_unit_id(id, abbreviation), suppliers:supplier_id(id, name)')
          .eq('purchase_order_id', purchaseOrder.id),
        purchaseOrder.supplier_id
          ? supabase.from('suppliers').select('id, name').eq('id', purchaseOrder.supplier_id).single()
          : Promise.resolve({ data: null })
      ])
      const itemsData = itemsRes.data || []
      setItems(itemsData)
      setSupplier(supplierRes.data)

      // Collect unique suppliers from per-item supplier_id plus PO header supplier
      const seenIds = new Set()
      const unique = []
      if (supplierRes.data) { seenIds.add(supplierRes.data.id); unique.push(supplierRes.data) }
      itemsData.forEach(i => {
        if (i.suppliers?.id && !seenIds.has(i.suppliers.id)) {
          seenIds.add(i.suppliers.id)
          unique.push(i.suppliers)
        }
      })
      setAllSuppliers(unique)
      // Default receive qty = full remaining
      const init = {}
      itemsData.forEach(i => {
        const rem = (i.quantity || 0) - (i.received_quantity || 0)
        init[i.id] = rem > 0 ? rem : 0
      })
      setReceivedQty(init)
    } catch { notify.error('Failed to load details') }
    finally { setLoading(false) }
  }

  const handleReceive = async () => {
    if (!canReceive) { notify.error('No permission to receive stock'); return }
    const itemsToReceive = Object.entries(receivedQty)
      .filter(([, qty]) => qty > 0)
      .map(([poItemId, qty]) => ({ po_item_id: poItemId, received_qty: qty }))
    if (itemsToReceive.length === 0) { notify.error('Enter qty for at least one item'); return }
    try {
      setReceiveSaving(true)
      const { data, error } = await supabase.rpc('receive_purchase_order', {
        p_po_id: purchaseOrder.id,
        p_user_id: user?.id,
        p_items: itemsToReceive
      })
      if (error) throw error
      notify.success(`Stock received — PO status: ${data.po_status}`)
      // Track which cashier received the stock
      if (!isAdmin && cashier?.id) {
        await supabase.from('purchase_orders')
          .update({ received_by_cashier_id: cashier.id })
          .eq('id', purchaseOrder.id)
      }
      setReceivingMode(false)
      onUpdated?.()
      loadDetails()
    } catch (err) {
      notify.error(err.message || 'Failed to receive stock')
    } finally {
      setReceiveSaving(false)
    }
  }

  const handleDelete = async () => {
    try {
      setDeleting(true)
      const { error } = await supabase.rpc('delete_purchase_order', {
        p_po_id: purchaseOrder.id, p_user_id: user?.id
      })
      if (error) throw error
      notify.success(`PO ${purchaseOrder.po_number} deleted`)
      onDeleted?.()
    } catch (err) {
      notify.error(err.message || 'Failed to delete')
    } finally { setDeleting(false) }
  }

  const handleStatusChange = async (newStatus) => {
    try {
      setStatusChanging(true)
      const update = {
        status: newStatus,
        // Track which cashier changed the status
        ...(!isAdmin && cashier?.id ? { updated_by_cashier_id: cashier.id } : {})
      }
      const { error } = await supabase
        .from('purchase_orders')
        .update(update)
        .eq('id', purchaseOrder.id)
      if (error) throw error
      const label = newStatus === 'sent' ? 'confirmed' : 'reverted to draft'
      notify.success(`PO ${purchaseOrder.po_number} ${label}`)
      onUpdated?.()
    } catch (err) {
      notify.error(err.message || 'Failed to update status')
    } finally {
      setStatusChanging(false)
    }
  }

  const handleExportPDF = () => {
    try {
      const doc = new jsPDF()
      const pw = doc.internal.pageSize.getWidth()
      doc.setFontSize(16)
      doc.text('Purchase Order', pw / 2, 20, { align: 'center' })
      doc.setFontSize(10)
      doc.text(`PO #: ${purchaseOrder.po_number}`, 20, 35)
      doc.text(`Date: ${new Date(purchaseOrder.po_date).toLocaleDateString('en-PK')}`, 20, 42)
      doc.text(`Status: ${STATUS_LABELS[purchaseOrder.status] || (purchaseOrder.status ?? '').toUpperCase()}`, 20, 49)
      doc.text(`Supplier: ${supplier?.name || 'N/A'}`, 20, 56)
      autoTable(doc, {
        head: [['Item', 'Qty', 'Unit', 'Cost/Unit', 'Discount', 'Total']],
        body: items.map(i => [
          i.inventory_items?.name || 'N/A', i.quantity,
          i.units?.abbreviation || '',
          `Rs. ${(i.cost_per_unit || 0).toFixed(2)}`,
          i.discount > 0 ? `Rs. ${(i.discount || 0).toFixed(2)}` : '—',
          `Rs. ${(i.total_cost || 0).toFixed(2)}`
        ]),
        startY: 65, styles: { fontSize: 9 }
      })
      const finalY = doc.lastAutoTable.finalY + 10
      doc.text(`Grand Total: Rs. ${(purchaseOrder.grand_total || 0).toFixed(2)}`, 140, finalY + 10)
      doc.save(`PO-${purchaseOrder.po_number}.pdf`)
      notify.success('PDF exported')
    } catch { notify.error('Failed to export PDF') }
  }

  if (!purchaseOrder) return null

  const statusCls = STATUS_STYLES[purchaseOrder.status] || STATUS_STYLES.draft
  const allReceived = items.length > 0 && items.every(i => (i.received_quantity || 0) >= i.quantity)

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className={`flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>PO #{purchaseOrder.po_number}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${statusCls}`}>{STATUS_LABELS[purchaseOrder.status] || (purchaseOrder.status ?? '').toUpperCase()}</span>
              {purchaseOrder.payment_status && (
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  purchaseOrder.payment_status === 'paid'
                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                    : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                }`}>
                  {purchaseOrder.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                </span>
              )}
            </div>
            <p className={`text-xs mt-0.5 ${themeClasses.textSecondary}`}>
              {new Date(purchaseOrder.po_date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleExportPDF} className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            <Download className="w-4 h-4" /> PDF
          </button>

          {/* Draft → Confirm (sent) */}
          {purchaseOrder.status === 'draft' && canChangeStatus && (
            <button
              onClick={() => handleStatusChange('sent')}
              disabled={statusChanging}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white"
            >
              {statusChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Confirm Order
            </button>
          )}

          {/* Sent → Revert to Draft */}
          {purchaseOrder.status === 'sent' && canChangeStatus && (
            <button
              onClick={() => handleStatusChange('draft')}
              disabled={statusChanging}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold disabled:bg-gray-400 text-white ${isDark ? 'bg-gray-600 hover:bg-gray-500' : 'bg-gray-500 hover:bg-gray-600'}`}
            >
              {statusChanging ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
              Revert to Draft
            </button>
          )}

          {canEdit && (
            <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white">
              <Edit2 className="w-4 h-4" /> Edit
            </button>
          )}

          {canPay && purchaseOrder.payment_status !== 'paid' && (
            <button onClick={() => setShowPaymentModal(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white">
              <CreditCard className="w-4 h-4" /> Record Payment
            </button>
          )}

          {canReceiveStock && (
            <button
              onClick={() => setReceivingMode(p => !p)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                receivingMode
                  ? isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                  : 'bg-teal-600 hover:bg-teal-700 text-white'
              }`}
            >
              <Package className="w-4 h-4" />
              {receivingMode ? 'Cancel Receive' : 'Receive Stock'}
            </button>
          )}

          {(purchaseOrder.status === 'draft' || purchaseOrder.status === 'sent') && canDelete && (
            <button onClick={() => setShowDeleteConfirm(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 text-white">
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Info cards row */}
          <div className="grid grid-cols-4 gap-4">
            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
              <p className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>
                {allSuppliers.length > 1 ? 'Suppliers' : 'Supplier'}
              </p>
              {allSuppliers.length === 0 ? (
                <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>—</p>
              ) : allSuppliers.length === 1 ? (
                <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>{allSuppliers[0].name}</p>
              ) : (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {allSuppliers.map(s => (
                    <span key={s.id} className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                      {s.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
            {[
              { label: 'Date', value: new Date(purchaseOrder.po_date).toLocaleDateString('en-PK') },
              { label: 'Total Items', value: purchaseOrder.total_items || items.length },
              { label: 'Grand Total', value: `Rs. ${(purchaseOrder.grand_total || 0).toFixed(2)}` }
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>{label}</p>
                <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Receive stock inline */}
          {receivingMode && (
            <div className={`rounded-xl border-2 overflow-hidden ${isDark ? 'border-teal-700 bg-gray-800' : 'border-teal-200 bg-teal-50/40'}`}>
              <div className={`flex items-center justify-between px-5 py-3 ${isDark ? 'bg-teal-900/30' : 'bg-teal-100/60'}`}>
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-teal-500" />
                  <span className={`text-sm font-bold ${isDark ? 'text-teal-300' : 'text-teal-800'}`}>Receive Stock — PO #{purchaseOrder.po_number}</span>
                </div>
                <button
                  onClick={handleReceive}
                  disabled={receiveSaving}
                  className="flex items-center gap-2 px-4 py-1.5 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white text-sm font-semibold rounded-lg"
                >
                  {receiveSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Receive Stock
                </button>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className={`text-xs font-semibold uppercase ${isDark ? 'bg-gray-700/50 text-gray-400' : 'bg-white/70 text-gray-500'}`}>
                    <th className="text-left px-5 py-2.5">#</th>
                    <th className="text-left px-3 py-2.5">Item</th>
                    <th className="text-center px-3 py-2.5">Ordered</th>
                    <th className="text-center px-3 py-2.5">Received</th>
                    <th className="text-center px-3 py-2.5">Remaining</th>
                    <th className="text-center px-3 py-2.5 w-36">Receive Now</th>
                    <th className="text-right px-5 py-2.5">Est. Cost</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-200'}`}>
                  {items.map((item, idx) => {
                    const remaining = (item.quantity || 0) - (item.received_quantity || 0)
                    const fullyReceived = remaining <= 0
                    const qty = receivedQty[item.id] || 0
                    return (
                      <tr key={item.id} className={isDark ? 'hover:bg-gray-700/30' : 'hover:bg-white/60'}>
                        <td className={`px-5 py-3 text-xs font-medium ${themeClasses.textSecondary}`}>{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-2">
                            {fullyReceived && <Check className="w-4 h-4 text-green-500 flex-shrink-0" />}
                            <div>
                              <p className={`font-semibold text-sm ${themeClasses.textPrimary}`}>{item.inventory_items?.name}</p>
                              {item.inventory_items?.sku && <p className={`text-xs ${themeClasses.textSecondary}`}>{item.inventory_items.sku}</p>}
                            </div>
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-center text-sm ${themeClasses.textSecondary}`}>{item.quantity} {item.units?.abbreviation || ''}</td>
                        <td className={`px-3 py-3 text-center text-sm font-medium ${item.received_quantity > 0 ? 'text-green-500' : themeClasses.textSecondary}`}>
                          {item.received_quantity || 0} {item.units?.abbreviation || ''}
                        </td>
                        <td className={`px-3 py-3 text-center text-sm font-medium ${remaining > 0 ? 'text-orange-500' : 'text-green-500'}`}>
                          {fullyReceived ? '✓ Done' : `${remaining} ${item.units?.abbreviation || ''}`}
                        </td>
                        <td className="px-3 py-3 text-center">
                          {fullyReceived ? (
                            <span className="text-xs text-green-500 font-semibold">Fully Received</span>
                          ) : (
                            <input
                              type="number" step="0.01" min="0" max={remaining}
                              value={qty}
                              onChange={e => {
                                const val = Math.min(parseFloat(e.target.value) || 0, remaining)
                                setReceivedQty(p => ({ ...p, [item.id]: val >= 0 ? val : 0 }))
                              }}
                              className={`w-28 px-2 py-1 rounded-lg border text-sm text-center focus:outline-none focus:ring-2 focus:ring-teal-500 ${isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                            />
                          )}
                        </td>
                        <td className={`px-5 py-3 text-right text-sm font-semibold ${themeClasses.textPrimary}`}>
                          Rs. {(qty * (item.cost_per_unit || 0)).toFixed(2)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Items table (view mode) */}
          {!receivingMode && (
            <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <div className={`flex items-center justify-between px-5 py-3 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <h3 className={`text-sm font-bold ${themeClasses.textPrimary}`}>Order Items</h3>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                  {items.length} item{items.length !== 1 ? 's' : ''}
                  {allReceived && <span className="ml-1.5 text-green-500">· Fully Received</span>}
                </span>
              </div>
              <table className={`w-full text-sm ${isDark ? 'bg-gray-900/40' : 'bg-white'}`}>
                <thead>
                  <tr className={`text-xs font-semibold uppercase ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                    <th className="text-left px-5 py-2.5">#</th>
                    <th className="text-left px-3 py-2.5">Item</th>
                    <th className="text-left px-3 py-2.5">Supplier</th>
                    <th className="text-center px-3 py-2.5">Qty</th>
                    <th className="text-center px-3 py-2.5">Received</th>
                    <th className="text-right px-3 py-2.5">Cost/Unit</th>
                    <th className="text-right px-3 py-2.5">Discount</th>
                    <th className="text-right px-5 py-2.5">Total</th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                  {items.length === 0 ? (
                    <tr><td colSpan={8} className={`py-10 text-center text-sm ${themeClasses.textSecondary}`}>No items found</td></tr>
                  ) : items.map((item, idx) => {
                    const fullyReceived = (item.received_quantity || 0) >= item.quantity
                    return (
                      <tr key={item.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                        <td className={`px-5 py-3 text-xs font-medium ${themeClasses.textSecondary}`}>{idx + 1}</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            {fullyReceived && <Check className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />}
                            <div>
                              <p className={`font-semibold ${themeClasses.textPrimary}`}>{item.inventory_items?.name || '—'}</p>
                              {item.batch_number && <p className={`text-xs ${themeClasses.textSecondary}`}>Batch: {item.batch_number}</p>}
                              {item.expiry_date && <p className={`text-xs ${themeClasses.textSecondary}`}>Exp: {new Date(item.expiry_date).toLocaleDateString('en-PK')}</p>}
                            </div>
                          </div>
                        </td>
                        <td className={`px-3 py-3 text-sm ${themeClasses.textSecondary}`}>
                          {item.suppliers?.name
                            ? <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{item.suppliers.name}</span>
                            : <span className={`text-xs ${themeClasses.textSecondary}`}>—</span>}
                        </td>
                        <td className={`px-3 py-3 text-center ${themeClasses.textSecondary}`}>{item.quantity} {item.units?.abbreviation || ''}</td>
                        <td className="px-3 py-3 text-center">
                          {item.received_quantity > 0 ? (
                            <span className="text-green-500 font-semibold text-xs">{item.received_quantity} {item.units?.abbreviation || ''}</span>
                          ) : <span className={`text-xs ${themeClasses.textSecondary}`}>—</span>}
                        </td>
                        <td className={`px-3 py-3 text-right ${themeClasses.textSecondary}`}>Rs. {(item.cost_per_unit || 0).toFixed(2)}</td>
                        <td className={`px-3 py-3 text-right ${themeClasses.textSecondary}`}>{item.discount > 0 ? `Rs. ${(item.discount || 0).toFixed(2)}` : '—'}</td>
                        <td className={`px-5 py-3 text-right font-bold ${themeClasses.textPrimary}`}>Rs. {(item.total_cost || 0).toFixed(2)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals + Notes */}
          <div className="grid grid-cols-2 gap-4">
            <div className={`rounded-xl p-5 space-y-2 border ${isDark ? 'bg-teal-900/20 border-teal-700' : 'bg-teal-50 border-teal-200'}`}>
              <h3 className={`text-sm font-bold mb-3 ${isDark ? 'text-teal-300' : 'text-teal-800'}`}>Totals</h3>
              {[
                { label: 'Subtotal', value: `Rs. ${purchaseOrder.total_amount?.toFixed(2)}` },
                purchaseOrder.delivery_charges > 0 && { label: 'Delivery', value: `Rs. ${purchaseOrder.delivery_charges.toFixed(2)}` },
                purchaseOrder.labour_charges > 0 && { label: 'Labour', value: `Rs. ${purchaseOrder.labour_charges.toFixed(2)}` },
                purchaseOrder.freight_charges > 0 && { label: 'Freight', value: `Rs. ${purchaseOrder.freight_charges.toFixed(2)}` },
                purchaseOrder.other_charges > 0 && { label: 'Other', value: `Rs. ${purchaseOrder.other_charges.toFixed(2)}` },
                purchaseOrder.tax_amount > 0 && { label: `Tax (${purchaseOrder.tax_percentage}%)`, value: `Rs. ${purchaseOrder.tax_amount.toFixed(2)}` }
              ].filter(Boolean).map(({ label, value }) => (
                <div key={label} className="flex justify-between text-sm">
                  <span className={isDark ? 'text-teal-200' : 'text-teal-700'}>{label}</span>
                  <span className={`font-medium ${themeClasses.textPrimary}`}>{value}</span>
                </div>
              ))}
              <div className={`flex justify-between font-bold text-base pt-2 border-t ${isDark ? 'border-teal-700 text-teal-300' : 'border-teal-300 text-teal-900'}`}>
                <span>Grand Total</span>
                <span>Rs. {(purchaseOrder.grand_total || 0).toFixed(2)}</span>
              </div>
            </div>

            {purchaseOrder.notes && (
              <div className={`rounded-xl p-5 ${isDark ? 'bg-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-2 ${themeClasses.textSecondary}`}>Notes</p>
                <p className={`text-sm ${themeClasses.textPrimary}`}>{purchaseOrder.notes}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} title="Delete Purchase Order">
        <p className={`mb-5 text-sm ${themeClasses.textSecondary}`}>
          Delete PO #{purchaseOrder.po_number}? This cannot be undone.
        </p>
        <div className="flex justify-end gap-3">
          <button onClick={() => setShowDeleteConfirm(false)} className={`px-4 py-2 rounded-lg text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white">
            {deleting && <Loader2 className="w-4 h-4 animate-spin" />} Delete
          </button>
        </div>
      </Modal>

      <RecordPaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        purchaseOrder={purchaseOrder}
        onPaymentRecorded={() => { onUpdated?.(); loadDetails() }}
      />
    </div>
  )
}
