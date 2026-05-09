'use client'

import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import NotificationSystem, { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'

export default function EditPurchaseOrderModal({ isOpen, onClose, purchaseOrder, onUpdated }) {
  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [units, setUnits] = useState([])

  const [formData, setFormData] = useState({
    supplier_id: '',
    po_date: '',
    notes: '',
    delivery_charges: 0,
    labour_charges: 0,
    freight_charges: 0,
    other_charges: 0,
    tax_percentage: 0
  })

  const [newItem, setNewItem] = useState({
    inventory_item_id: '',
    supplier_id: '',
    quantity: '',
    purchase_unit_id: '',
    cost_per_unit: '',
    discount: 0,
    batch_number: '',
    expiry_date: '',
    notes: ''
  })

  const user = authManager.getCurrentUser()
  const userId = user?.id

  useEffect(() => {
    if (isOpen && purchaseOrder?.id) {
      loadData()
    }
  }, [isOpen, purchaseOrder?.id])

  const loadData = async () => {
    try {
      setLoading(true)

      // Load PO items
      const { data: itemsData } = await supabase
        .from('purchase_order_items')
        .select('*')
        .eq('purchase_order_id', purchaseOrder.id)

      // Load options
      const [suppliersRes, inventoryRes, unitsRes] = await Promise.all([
        supabase.from('suppliers').select('*').eq('user_id', userId).order('name'),
        supabase.from('inventory_items').select('id, name, sku, unit_id, supplier_id, units(id, name, abbreviation)').eq('user_id', userId).order('name'),
        supabase.from('units').select('*').order('name')
      ])

      setItems(itemsData?.map(item => ({ ...item, _isExisting: true })) || [])
      setSuppliers(suppliersRes.data || [])
      setInventoryItems(inventoryRes.data || [])
      setUnits(unitsRes.data || [])

      // Initialize form
      setFormData({
        supplier_id: purchaseOrder.supplier_id,
        po_date: purchaseOrder.po_date.split('T')[0],
        notes: purchaseOrder.notes || '',
        delivery_charges: purchaseOrder.delivery_charges || 0,
        labour_charges: purchaseOrder.labour_charges || 0,
        freight_charges: purchaseOrder.freight_charges || 0,
        other_charges: purchaseOrder.other_charges || 0,
        tax_percentage: purchaseOrder.tax_percentage || 0
      })
    } catch (error) {
      console.error('Error loading data:', error)
      notify.error('Failed to load purchase order')
    } finally {
      setLoading(false)
    }
  }

  const canEdit = permissionManager.hasPermission('PO_EDIT') || authManager.getRole() === 'admin'

  const handleAddItem = () => {
    if (!newItem.inventory_item_id || !newItem.quantity || !newItem.cost_per_unit) {
      notify.error('Please fill in all required fields')
      return
    }

    const item = {
      ...newItem,
      id: Math.random(),
      quantity: parseFloat(newItem.quantity),
      cost_per_unit: parseFloat(newItem.cost_per_unit),
      discount: parseFloat(newItem.discount) || 0,
      total_cost: (parseFloat(newItem.quantity) * parseFloat(newItem.cost_per_unit)) - (parseFloat(newItem.discount) || 0)
    }

    setItems([...items, item])
    setNewItem({
      inventory_item_id: '',
      supplier_id: '',
      quantity: '',
      purchase_unit_id: '',
      cost_per_unit: '',
      discount: 0,
      batch_number: '',
      expiry_date: '',
      notes: ''
    })
  }

  const handleRemoveItem = (id) => {
    setItems(items.filter(item => item.id !== id))
  }

  const calculateTotals = () => {
    const subtotal = items.reduce((sum, item) => sum + item.total_cost, 0)
    const otherCharges = (parseFloat(formData.delivery_charges) || 0) +
      (parseFloat(formData.labour_charges) || 0) +
      (parseFloat(formData.freight_charges) || 0) +
      (parseFloat(formData.other_charges) || 0)
    const taxAmount = (subtotal + otherCharges) * ((parseFloat(formData.tax_percentage) || 0) / 100)
    const grandTotal = subtotal + otherCharges + taxAmount

    return { subtotal, otherCharges, taxAmount, grandTotal }
  }

  const handleSubmit = async () => {
    if (!canEdit) {
      notify.error('You do not have permission to edit purchase orders')
      return
    }

    if (!formData.supplier_id || items.length === 0) {
      notify.error('Please select a supplier and add at least one item')
      return
    }

    try {
      setLoading(true)

      const { subtotal, otherCharges, taxAmount, grandTotal } = calculateTotals()

      const { data, error } = await supabase.rpc('update_purchase_order', {
        p_po_id: purchaseOrder.id,
        p_user_id: userId,
        p_header: {
          po_date: formData.po_date,
          supplier_id: formData.supplier_id,
          notes: formData.notes,
          delivery_charges: parseFloat(formData.delivery_charges) || 0,
          labour_charges: parseFloat(formData.labour_charges) || 0,
          freight_charges: parseFloat(formData.freight_charges) || 0,
          other_charges: parseFloat(formData.other_charges) || 0,
          tax_percentage: parseFloat(formData.tax_percentage) || 0,
          tax_amount: taxAmount,
          total_amount: subtotal,
          grand_total: grandTotal
        },
        p_items: items.map(item => ({
          ...(item._isExisting && { id: item.id }),
          inventory_item_id: item.inventory_item_id,
          supplier_id: item.supplier_id || formData.supplier_id,
          quantity: parseFloat(item.quantity),
          purchase_unit_id: item.purchase_unit_id,
          cost_per_unit: parseFloat(item.cost_per_unit),
          discount: parseFloat(item.discount) || 0,
          total_cost: item.total_cost,
          batch_number: item.batch_number || null,
          expiry_date: item.expiry_date || null,
          notes: item.notes || null
        }))
      })

      if (error) throw error

      notify.success('Purchase order updated successfully')
      onUpdated?.(data)
      onClose()
    } catch (error) {
      console.error('Error updating PO:', error)
      notify.error(error.message || 'Failed to update purchase order')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || purchaseOrder.status !== 'draft') {
    return null
  }

  const { subtotal, otherCharges, taxAmount, grandTotal } = calculateTotals()
  const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Edit Purchase Order</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && !formData.supplier_id ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Header Section */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supplier</label>
                  <select
                    value={formData.supplier_id}
                    onChange={(e) => setFormData({...formData, supplier_id: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Select a supplier</option>
                    {suppliers.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PO Date</label>
                    <input
                      type="date"
                      value={formData.po_date}
                      onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    rows={2}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              {/* Items Section */}
              <div className="space-y-3">
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Add/Edit Items</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item</label>
                    <select
                      value={newItem.inventory_item_id}
                      onChange={(e) => {
                        const item = inventoryItems.find(i => i.id === e.target.value)
                        setNewItem({...newItem, inventory_item_id: e.target.value, purchase_unit_id: item?.unit_id})
                      }}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Select item</option>
                      {inventoryItems.map(item => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Qty</label>
                      <input type="number" step="0.01" value={newItem.quantity} onChange={(e) => setNewItem({...newItem, quantity: e.target.value})} className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cost</label>
                      <input type="number" step="0.01" value={newItem.cost_per_unit} onChange={(e) => setNewItem({...newItem, cost_per_unit: e.target.value})} className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Discount</label>
                      <input type="number" step="0.01" value={newItem.discount} onChange={(e) => setNewItem({...newItem, discount: e.target.value})} className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                    </div>
                  </div>

                  <button onClick={handleAddItem} className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded flex items-center justify-center gap-2">
                    <Plus className="w-4 h-4" /> Add Item
                  </button>
                </div>

                {/* Items List */}
                {items.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white">Current Items</h3>
                    {items.map((item) => {
                      const invItem = inventoryItems.find(i => i.id === item.inventory_item_id)
                      const itemTotal = (parseFloat(item.quantity) * parseFloat(item.cost_per_unit)) - (parseFloat(item.discount) || 0)
                      return (
                        <div key={item.id} className="bg-white dark:bg-gray-800 p-3 rounded border border-gray-200 dark:border-gray-700 flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900 dark:text-white">{invItem?.name || 'Unknown Item'}</p>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{item.quantity} × Rs. {item.cost_per_unit} = Rs. {itemTotal.toFixed(2)}</p>
                          </div>
                          <button onClick={() => handleRemoveItem(item.id)} className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Charges */}
              <div className="grid grid-cols-2 gap-3">
                <input type="number" step="0.01" placeholder="Delivery" value={formData.delivery_charges} onChange={(e) => setFormData({...formData, delivery_charges: parseFloat(e.target.value) || 0})} className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                <input type="number" step="0.01" placeholder="Labour" value={formData.labour_charges} onChange={(e) => setFormData({...formData, labour_charges: parseFloat(e.target.value) || 0})} className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                <input type="number" step="0.01" placeholder="Freight" value={formData.freight_charges} onChange={(e) => setFormData({...formData, freight_charges: parseFloat(e.target.value) || 0})} className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
                <input type="number" step="0.01" placeholder="Tax %" value={formData.tax_percentage} onChange={(e) => setFormData({...formData, tax_percentage: parseFloat(e.target.value) || 0})} className="px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white" />
              </div>

              {/* Total */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <div className="flex justify-between text-lg font-bold text-blue-900 dark:text-blue-300">
                  <span>Grand Total:</span>
                  <span>Rs. {grandTotal.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !canEdit}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded flex items-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>
    </Modal>
  )
}
