'use client'

import React, { useState, useEffect } from 'react'
import { Plus, Trash2, Loader2, Check, ArrowLeft } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

export default function EditPurchaseOrderPanel({ purchaseOrder, onBack, onUpdated }) {
  const [saving, setSaving] = useState(false)
  const [dataLoading, setDataLoading] = useState(true)
  const [suppliers, setSuppliers] = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [units, setUnits] = useState([])
  const [locations, setLocations] = useState([])
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [rows, setRows] = useState([])

  const [header, setHeader] = useState({
    supplier_id: '',
    po_date: '',
    notes: '',
    delivery_charges: '',
    labour_charges: '',
    freight_charges: '',
    other_charges: '',
    tax_percentage: ''
  })

  const [payNow, setPayNow] = useState(false)
  const [paymentAccountId, setPaymentAccountId] = useState('')
  const [paymentAmount, setPaymentAmount] = useState('')

  const user = authManager.getCurrentUser()
  const userId = user?.id
  const canEdit = permissionManager.hasPermission('PO_EDIT') || authManager.getRole() === 'admin'
  const isDark = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const cellCls = `px-2 py-1.5 border text-sm focus:outline-none focus:ring-1 focus:ring-teal-500 rounded w-full ${
    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`
  const inputCls = `px-3 py-2 border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 rounded-lg w-full ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`

  useEffect(() => { if (purchaseOrder?.id) loadData() }, [purchaseOrder?.id])

  const loadData = async () => {
    try {
      setDataLoading(true)
      const [itemsRes, suppRes, invRes, unitsRes, locsRes, accsRes] = await Promise.all([
        supabase.from('purchase_order_items').select('*').eq('purchase_order_id', purchaseOrder.id),
        supabase.from('suppliers').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('inventory_items').select('id, name, sku, unit_id').eq('user_id', userId).order('name'),
        supabase.from('units').select('id, name, abbreviation').order('name'),
        supabase.from('inventory_sections').select('id, name, slug').eq('user_id', userId).eq('is_active', true).order('sort_order'),
        supabase.from('payment_accounts').select('id, name, current_balance').eq('user_id', userId).eq('is_active', true).order('sort_order')
      ])
      setSuppliers(suppRes.data || [])
      setInventoryItems(invRes.data || [])
      setUnits(unitsRes.data || [])
      setLocations(locsRes.data || [])
      setPaymentAccounts(accsRes.data || [])
      setRows((itemsRes.data || []).map(i => ({
        _id: i.id,
        _isExisting: true,
        inventory_item_id: i.inventory_item_id,
        quantity: String(i.quantity),
        purchase_unit_id: i.purchase_unit_id || '',
        target_location: i.target_location || '',
        cost_per_unit: String(i.cost_per_unit),
        discount: String(i.discount || 0),
        batch_number: i.batch_number || '',
        expiry_date: i.expiry_date ? i.expiry_date.split('T')[0] : ''
      })))
      setHeader({
        supplier_id: purchaseOrder.supplier_id,
        po_date: purchaseOrder.po_date.split('T')[0],
        notes: purchaseOrder.notes || '',
        delivery_charges: String(purchaseOrder.delivery_charges || ''),
        labour_charges: String(purchaseOrder.labour_charges || ''),
        freight_charges: String(purchaseOrder.freight_charges || ''),
        other_charges: String(purchaseOrder.other_charges || ''),
        tax_percentage: String(purchaseOrder.tax_percentage || '')
      })
    } catch { notify.error('Failed to load data') }
    finally { setDataLoading(false) }
  }

  const updateRow = (id, field, value) => {
    setRows(prev => prev.map(r => {
      if (r._id !== id) return r
      const updated = { ...r, [field]: value }
      if (field === 'inventory_item_id') {
        const found = inventoryItems.find(i => i.id === value)
        updated.purchase_unit_id = found?.unit_id || ''
      }
      return updated
    }))
  }

  const calcRow = (r) => {
    const qty = parseFloat(r.quantity) || 0
    const cost = parseFloat(r.cost_per_unit) || 0
    const disc = parseFloat(r.discount) || 0
    return qty * cost - disc
  }

  const totals = (() => {
    const subtotal = rows.reduce((s, r) => s + calcRow(r), 0)
    const charges = (parseFloat(header.delivery_charges) || 0) + (parseFloat(header.labour_charges) || 0) +
      (parseFloat(header.freight_charges) || 0) + (parseFloat(header.other_charges) || 0)
    const tax = (subtotal + charges) * ((parseFloat(header.tax_percentage) || 0) / 100)
    return { subtotal, charges, tax, grand: subtotal + charges + tax }
  })()

  useEffect(() => {
    if (payNow) setPaymentAmount(totals.grand.toFixed(2))
  }, [totals.grand, payNow])

  const validRows = rows.filter(r => r.inventory_item_id && r.quantity && r.cost_per_unit)

  const handleSubmit = async () => {
    if (!canEdit) { notify.error('No permission to edit purchase orders'); return }
    if (!header.supplier_id || validRows.length === 0) { notify.error('Select a supplier and add at least one item'); return }
    if (payNow && !paymentAccountId) { notify.error('Select a payment account'); return }

    try {
      setSaving(true)
      const { subtotal, charges, tax, grand } = totals

      const { data: po, error } = await supabase.rpc('update_purchase_order', {
        p_po_id: purchaseOrder.id,
        p_user_id: userId,
        p_header: {
          po_date: header.po_date,
          supplier_id: header.supplier_id,
          notes: header.notes,
          delivery_charges: parseFloat(header.delivery_charges) || 0,
          labour_charges: parseFloat(header.labour_charges) || 0,
          freight_charges: parseFloat(header.freight_charges) || 0,
          other_charges: parseFloat(header.other_charges) || 0,
          tax_percentage: parseFloat(header.tax_percentage) || 0,
          tax_amount: tax,
          total_amount: subtotal,
          grand_total: grand
        },
        p_items: validRows.map(r => ({
          ...(r._isExisting && { id: r._id }),
          inventory_item_id: r.inventory_item_id,
          supplier_id: header.supplier_id,
          target_location: r.target_location || null,
          quantity: parseFloat(r.quantity),
          purchase_unit_id: r.purchase_unit_id || null,
          cost_per_unit: parseFloat(r.cost_per_unit),
          discount: parseFloat(r.discount) || 0,
          total_cost: calcRow(r),
          batch_number: r.batch_number || null,
          expiry_date: r.expiry_date || null,
          notes: null
        }))
      })
      if (error) throw error

      if (payNow && paymentAccountId) {
        const amt = parseFloat(paymentAmount) || grand
        await supabase.from('supplier_payments').insert({
          user_id: userId,
          supplier_id: header.supplier_id,
          purchase_order_id: purchaseOrder.id,
          payment_account_id: paymentAccountId,
          amount: amt,
          notes: `Payment for PO ${purchaseOrder.po_number}`,
          payment_date: header.po_date
        })
      }

      notify.success(`PO ${purchaseOrder.po_number} updated${payNow ? ' & paid' : ''}`)
      onUpdated?.(po)
    } catch (err) {
      notify.error(err.message || 'Failed to update purchase order')
    } finally {
      setSaving(false)
    }
  }

  if (dataLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
    </div>
  )

  const thCls = `px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`

  return (
    <div className="flex flex-col h-full">
      {/* Top bar */}
      <div className={`flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>Edit Purchase Order</h2>
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>{purchaseOrder.po_number}</span>
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">Draft</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onBack} className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !header.supplier_id || validRows.length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold rounded-xl text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Save Changes
          </button>
        </div>
      </div>

      {/* Header fields */}
      <div className={`flex gap-4 px-6 py-3 border-b flex-shrink-0 ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-100 bg-gray-50/60'}`}>
        <div className="flex-1">
          <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Supplier *</label>
          <select value={header.supplier_id} onChange={e => setHeader(p => ({ ...p, supplier_id: e.target.value }))} className={inputCls}>
            <option value="">Select supplier</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="w-44">
          <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Date *</label>
          <input type="date" value={header.po_date} onChange={e => setHeader(p => ({ ...p, po_date: e.target.value }))} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Notes</label>
          <input type="text" placeholder="Optional notes..." value={header.notes} onChange={e => setHeader(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
        </div>
      </div>

      {/* Items table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[900px]">
          <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <th className={`${thCls} w-8`}>#</th>
              <th className={`${thCls} min-w-[200px]`}>Item *</th>
              <th className={`${thCls} w-20`}>Qty *</th>
              <th className={`${thCls} w-24`}>Unit</th>
              <th className={`${thCls} min-w-[130px]`}>Location</th>
              <th className={`${thCls} w-28`}>Batch #</th>
              <th className={`${thCls} w-32`}>Expiry</th>
              <th className={`${thCls} w-28`}>Amount *</th>
              <th className={`${thCls} w-24`}>Discount</th>
              <th className={`${thCls} w-24 text-right`}>Rate</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-gray-700/60' : 'divide-gray-100'}`}>
            {rows.map((row, idx) => {
              const rate = calcRow(row)
              return (
                <tr key={row._id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50/70'}>
                  <td className={`px-3 text-center text-xs font-medium ${themeClasses.textSecondary}`}>{idx + 1}</td>
                  <td className="px-2 py-1.5">
                    <select value={row.inventory_item_id} onChange={e => updateRow(row._id, 'inventory_item_id', e.target.value)} className={cellCls}>
                      <option value="">Search item...</option>
                      {inventoryItems.map(i => <option key={i.id} value={i.id}>{i.name}{i.sku ? ` · ${i.sku}` : ''}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" min="0" value={row.quantity} onChange={e => updateRow(row._id, 'quantity', e.target.value)} className={cellCls} /></td>
                  <td className="px-2 py-1.5">
                    <select value={row.purchase_unit_id} onChange={e => updateRow(row._id, 'purchase_unit_id', e.target.value)} className={cellCls}>
                      <option value="">Unit</option>
                      {units.map(u => <option key={u.id} value={u.id}>{u.abbreviation}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5">
                    <select value={row.target_location} onChange={e => updateRow(row._id, 'target_location', e.target.value)} className={cellCls}>
                      <option value="">Location</option>
                      {locations.map(l => <option key={l.id} value={l.slug}>{l.name}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-1.5"><input type="text" placeholder="--" value={row.batch_number} onChange={e => updateRow(row._id, 'batch_number', e.target.value)} className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input type="date" value={row.expiry_date} onChange={e => updateRow(row._id, 'expiry_date', e.target.value)} className={cellCls} /></td>
                  <td className="px-2 py-1.5"><input type="number" step="0.01" min="0" placeholder="0.00" value={row.cost_per_unit} onChange={e => updateRow(row._id, 'cost_per_unit', e.target.value)} className={cellCls} /></td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1">
                      <input type="number" step="0.01" min="0" value={row.discount} onChange={e => updateRow(row._id, 'discount', e.target.value)} className={cellCls} />
                      <span className={`text-xs flex-shrink-0 ${themeClasses.textSecondary}`}>Rs</span>
                    </div>
                  </td>
                  <td className={`px-3 py-1.5 text-right font-semibold text-sm ${rate > 0 ? 'text-teal-500' : themeClasses.textSecondary}`}>{rate.toFixed(2)}</td>
                  <td className="px-2 py-1.5">
                    <button onClick={() => setRows(prev => prev.filter(r => r._id !== row._id))} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        <button
          onClick={() => setRows(prev => [...prev, { _id: Math.random(), inventory_item_id: '', quantity: '', purchase_unit_id: '', target_location: '', cost_per_unit: '', discount: '0', batch_number: '', expiry_date: '' }])}
          className={`w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 border-b transition-colors ${
            isDark ? 'border-gray-700 text-teal-400 hover:bg-gray-700/40' : 'border-gray-200 text-teal-600 hover:bg-teal-50'
          }`}
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 border-t ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-start gap-6 px-6 py-4">
          {/* Pay Now */}
          <div className="flex flex-col gap-3 flex-shrink-0 w-52">
            <label className="flex items-start gap-3 cursor-pointer">
              <div onClick={() => setPayNow(p => !p)} className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${payNow ? 'bg-teal-600 border-teal-600' : isDark ? 'border-gray-500 bg-gray-700' : 'border-gray-300 bg-white'}`}>
                {payNow && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${themeClasses.textPrimary}`}>Pay Now</p>
                <p className={`text-xs ${themeClasses.textSecondary}`}>Record payment from account</p>
              </div>
            </label>
            {payNow && (
              <div className="space-y-2 pl-8">
                <select value={paymentAccountId} onChange={e => setPaymentAccountId(e.target.value)} className={`${inputCls} text-xs`}>
                  <option value="">Select account</option>
                  {paymentAccounts.map(a => <option key={a.id} value={a.id}>{a.name} — Rs. {parseFloat(a.current_balance || 0).toLocaleString()}</option>)}
                </select>
                <input type="number" step="0.01" placeholder="Amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className={`${inputCls} text-xs`} />
              </div>
            )}
          </div>

          {/* Charges */}
          <div className="flex-1 grid grid-cols-6 gap-3">
            {[
              { key: 'delivery_charges', label: 'Delivery' },
              { key: 'labour_charges', label: 'Labour' },
              { key: 'freight_charges', label: 'Freight' },
              { key: 'other_charges', label: 'Other' },
              { key: 'tax_percentage', label: 'Tax %' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label className={`block text-[10px] font-semibold mb-1 ${themeClasses.textSecondary}`}>{label}</label>
                <input type="number" step="0.01" min="0" value={header[key]} onChange={e => setHeader(p => ({ ...p, [key]: e.target.value }))} placeholder="0" className={`${inputCls} text-xs px-2 py-1.5`} />
              </div>
            ))}
          </div>

          {/* Grand Total */}
          <div className="flex-shrink-0 text-right min-w-[160px]">
            <div className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>
              {validRows.length} item{validRows.length !== 1 ? 's' : ''} · Subtotal: Rs. {totals.subtotal.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">GRAND TOTAL</div>
            <div className={`text-3xl font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              Rs. {totals.grand.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
