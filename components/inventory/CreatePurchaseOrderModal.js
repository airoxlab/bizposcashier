'use client'

import React, { useState, useEffect } from 'react'
import { X, Plus, Trash2, Loader2, AlertCircle, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import NotificationSystem, { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export default function CreatePurchaseOrderModal({ isOpen, onClose, onCreated }) {
  const [step, setStep] = useState(1) // 1: header | 2: items | 3: confirm
  const [loading, setLoading] = useState(false)
  const [suppliers, setSuppliers] = useState([])
  const [items, setItems] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [units, setUnits] = useState([])
  const [sections, setSections] = useState([])

  const [formData, setFormData] = useState({
    supplier_id: '',
    po_date: localDateStr(),
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
    if (isOpen) {
      loadData()
    }
  }, [isOpen])

  const loadData = async () => {
    try {
      setLoading(true)
      const [suppliersRes, itemsRes, unitsRes, sectionsRes] = await Promise.all([
        supabase.from('suppliers').select('*').eq('user_id', userId).order('name'),
        supabase.from('inventory_items').select('id, name, sku, unit_id, supplier_id, units(id, name, abbreviation)').eq('user_id', userId).order('name'),
        supabase.from('units').select('*').eq('user_id', userId).order('name'),
        supabase.from('inventory_sections').select('*').eq('user_id', userId).order('sort_order')
      ])

      if (suppliersRes.data) setSuppliers(suppliersRes.data)
      if (itemsRes.data) setInventoryItems(itemsRes.data)
      if (unitsRes.data) setUnits(unitsRes.data)
      if (sectionsRes.data) setSections(sectionsRes.data)
    } catch (error) {
      console.error('Error loading data:', error)
      notify.error('Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  const canCreate = permissionManager.hasPermission('PO_CREATE') || authManager.getRole() === 'admin'

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
    if (loading) return // guard against double-submit → duplicate payment
    if (!canCreate) {
      notify.error('You do not have permission to create purchase orders')
      return
    }

    if (!formData.supplier_id || items.length === 0) {
      notify.error('Please select a supplier and add at least one item')
      return
    }

    try {
      setLoading(true)

      const { subtotal, otherCharges, taxAmount, grandTotal } = calculateTotals()

      // Call the Supabase RPC directly (no API route in cashier - static export)
      const { data, error } = await supabase.rpc('create_purchase_order', {
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

      notify.success(`Purchase order ${data.po_number} created successfully`)
      resetForm()
      onCreated?.(data)
      onClose()
    } catch (error) {
      console.error('Error creating purchase order:', error)
      notify.error(error.message || 'Failed to create purchase order')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setStep(1)
    setFormData({
      supplier_id: '',
      po_date: localDateStr(),
      notes: '',
      delivery_charges: 0,
      labour_charges: 0,
      freight_charges: 0,
      other_charges: 0,
      tax_percentage: 0
    })
    setItems([])
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

  if (!isOpen) return null

  const { subtotal, otherCharges, taxAmount, grandTotal } = calculateTotals()
  const selectedSupplier = suppliers.find(s => s.id === formData.supplier_id)

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Create Purchase Order</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Supplier *</label>
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

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">PO Date *</label>
                <input
                  type="date"
                  value={formData.po_date}
                  onChange={(e) => setFormData({...formData, po_date: e.target.value})}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Notes</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white"
                  placeholder="Any special instructions..."
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <strong>Supplier:</strong> {selectedSupplier?.name || 'Not selected'}
                </p>
              </div>

              {/* Add Item Form */}
              <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4 space-y-3">
                <h3 className="font-semibold text-gray-900 dark:text-white">Add Item</h3>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Item *</label>
                  <select
                    value={newItem.inventory_item_id}
                    onChange={(e) => {
                      const item = inventoryItems.find(i => i.id === e.target.value)
                      setNewItem({
                        ...newItem,
                        inventory_item_id: e.target.value,
                        supplier_id: item?.supplier_id || formData.supplier_id,
                        purchase_unit_id: item?.unit_id
                      })
                    }}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  >
                    <option value="">Select item</option>
                    {inventoryItems.map(item => (
                      <option key={item.id} value={item.id}>{item.name} (SKU: {item.sku})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newItem.quantity}
                      onChange={(e) => setNewItem({...newItem, quantity: e.target.value})}
                      placeholder="0.00"
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Unit</label>
                    <select
                      value={newItem.purchase_unit_id}
                      onChange={(e) => setNewItem({...newItem, purchase_unit_id: e.target.value})}
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    >
                      <option value="">Select</option>
                      {units.map(u => (
                        <option key={u.id} value={u.id}>{u.abbreviation}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Cost/Unit *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newItem.cost_per_unit}
                      onChange={(e) => setNewItem({...newItem, cost_per_unit: e.target.value})}
                      placeholder="0.00"
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Discount</label>
                    <input
                      type="number"
                      step="0.01"
                      value={newItem.discount}
                      onChange={(e) => setNewItem({...newItem, discount: e.target.value})}
                      placeholder="0.00"
                      className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Batch Number</label>
                  <input
                    type="text"
                    value={newItem.batch_number}
                    onChange={(e) => setNewItem({...newItem, batch_number: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={newItem.expiry_date}
                    onChange={(e) => setNewItem({...newItem, expiry_date: e.target.value})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>

                <button
                  onClick={handleAddItem}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 rounded flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" /> Add Item
                </button>
              </div>

              {/* Items List */}
              {items.length > 0 && (
                <div className="space-y-2">
                  <h3 className="font-semibold text-gray-900 dark:text-white">Items ({items.length})</h3>
                  {items.map((item) => {
                    const inventoryItem = inventoryItems.find(i => i.id === item.inventory_item_id)
                    return (
                      <div key={item.id} className="bg-gray-50 dark:bg-gray-800 p-3 rounded flex justify-between items-start">
                        <div className="flex-1">
                          <p className="font-medium text-gray-900 dark:text-white">{inventoryItem?.name}</p>
                          <p className="text-sm text-gray-600 dark:text-gray-400">
                            {item.quantity} × Rs. {item.cost_per_unit.toFixed(2)} = Rs. {item.total_cost.toFixed(2)}
                          </p>
                        </div>
                        <button
                          onClick={() => handleRemoveItem(item.id)}
                          className="text-red-600 hover:text-red-700 dark:hover:text-red-500 ml-2"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              {/* Summary */}
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 space-y-2">
                <h3 className="font-semibold text-blue-900 dark:text-blue-300">Order Summary</h3>
                <p className="text-sm"><strong>Supplier:</strong> {selectedSupplier?.name}</p>
                <p className="text-sm"><strong>Items:</strong> {items.length}</p>
                <p className="text-sm"><strong>Subtotal:</strong> Rs. {subtotal.toFixed(2)}</p>
                {otherCharges > 0 && <p className="text-sm"><strong>Other Charges:</strong> Rs. {otherCharges.toFixed(2)}</p>}
                {taxAmount > 0 && <p className="text-sm"><strong>Tax:</strong> Rs. {taxAmount.toFixed(2)}</p>}
                <p className="text-lg font-bold text-blue-900 dark:text-blue-300">
                  Grand Total: Rs. {grandTotal.toFixed(2)}
                </p>
              </div>

              {/* Charges Section */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Delivery</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.delivery_charges}
                    onChange={(e) => setFormData({...formData, delivery_charges: parseFloat(e.target.value) || 0})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Labour</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.labour_charges}
                    onChange={(e) => setFormData({...formData, labour_charges: parseFloat(e.target.value) || 0})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Freight</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.freight_charges}
                    onChange={(e) => setFormData({...formData, freight_charges: parseFloat(e.target.value) || 0})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Other</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.other_charges}
                    onChange={(e) => setFormData({...formData, other_charges: parseFloat(e.target.value) || 0})}
                    className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Tax %</label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.tax_percentage}
                  onChange={(e) => setFormData({...formData, tax_percentage: parseFloat(e.target.value) || 0})}
                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded dark:bg-gray-700 dark:text-white"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <button
            onClick={() => {
              if (step > 1) setStep(step - 1)
              else onClose()
            }}
            className="px-4 py-2 text-gray-700 dark:text-gray-300 font-medium rounded hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            {step === 1 ? 'Cancel' : 'Back'}
          </button>

          <div className="flex gap-2">
            {step < 3 && (
              <button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !formData.supplier_id}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium rounded"
              >
                Next
              </button>
            )}
            {step === 3 && (
              <button
                onClick={handleSubmit}
                disabled={loading || !canCreate}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white font-medium rounded flex items-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                Create PO
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
