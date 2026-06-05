'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Plus, Trash2, Loader2, Check, ArrowLeft, X, ChevronDown, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'
import { poDraft } from '../../lib/poDraft'

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const VALID_METHODS = ['Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Cheque']
const resolvePaymentMethod = (key) => {
  if (!key) return 'Cash'
  return VALID_METHODS.find(v => v.toLowerCase() === key.toLowerCase().trim()) || 'Cash'
}

// Generic searchable dropdown — used for items, suppliers, and units
// options: [{ id, label, sublabel? }]
function SearchableDropdown({
  value, options, placeholder = 'Select...', onChange,
  onAddNew, canAddNew = false, addNewLabel = '+ Add New',
  isDark, triggerCls, panelWidth = 'w-64', searchPlaceholder = 'Search...'
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  )
  const selected = options.find(o => o.id === value)

  const pick = (id) => { onChange(id); setOpen(false); setSearch('') }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(p => !p); setSearch('') }}
        className={`${triggerCls} flex items-center justify-between gap-1 text-left w-full`}
      >
        <span className={`truncate ${!selected ? (isDark ? 'text-gray-500' : 'text-gray-400') : ''}`}>
          {selected
            ? (selected.sublabel ? `${selected.label} · ${selected.sublabel}` : selected.label)
            : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      </button>

      {open && (
        <div className={`absolute z-40 top-full left-0 mt-1 ${panelWidth} rounded-xl shadow-2xl border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          {/* Search bar */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <Search className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              autoFocus
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filtered.length > 0) pick(filtered[0].id)
                if (e.key === 'Escape') { setOpen(false); setSearch('') }
              }}
              className={`flex-1 text-xs bg-transparent focus:outline-none ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className={`${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className={`px-3 py-3 text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                No results{search ? ` for "${search}"` : ''}
              </p>
            ) : filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onClick={() => pick(o.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors ${
                  value === o.id
                    ? `font-semibold ${isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`
                    : isDark ? 'text-gray-200 hover:bg-gray-700/60' : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium">{o.label}</span>
                {o.sublabel && (
                  <span className={`ml-1.5 text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-400'}`}>{o.sublabel}</span>
                )}
              </button>
            ))}
          </div>

          {/* Add new footer */}
          {canAddNew && (
            <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                type="button"
                onClick={() => { setOpen(false); setSearch(''); onAddNew() }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-indigo-500 hover:text-indigo-400 transition-colors ${isDark ? 'hover:bg-gray-700/60' : 'hover:bg-indigo-50'}`}
              >
                <Plus className="w-3.5 h-3.5" /> {addNewLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

const emptyRow = () => ({
  _id: Math.random(),
  inventory_item_id: '',
  supplier_id: '',
  quantity: '',
  purchase_unit_id: '',
  target_location: '',
  total_amount: '',
  discount: '0',
  batch_number: '',
  expiry_date: ''
})

export default function CreatePurchaseOrderPanel({ onClose, onCreated, restoreDraft = false }) {
  const user    = authManager.getCurrentUser()
  const cashier = authManager.getCashier()
  const isAdmin = authManager.getRole() === 'admin'
  const userId  = user?.id

  // Load a previously auto-saved draft when the caller asked to resume one.
  const savedDraft = restoreDraft ? poDraft.load(userId) : null

  const [saving, setSaving]           = useState(false)
  const submittedRef                  = useRef(false)   // true once the PO is saved — stops auto-save
  const [dataLoading, setDataLoading] = useState(true)
  const [suppliers, setSuppliers]     = useState([])
  const [inventoryItems, setInventoryItems] = useState([])
  const [units, setUnits]             = useState([])
  const [locations, setLocations]     = useState([])
  const [paymentAccounts, setPaymentAccounts] = useState([])
  const [rows, setRows]               = useState(
    () => (savedDraft?.rows?.length ? savedDraft.rows : [emptyRow()])
  )

  const [header, setHeader] = useState(() => savedDraft?.header || {
    po_date: localDateStr(),
    notes: '',
    delivery_charges: '',
    labour_charges: '',
    freight_charges: '',
    other_charges: '',
    tax_percentage: ''
  })

  const [markAsReceived, setMarkAsReceived] = useState(() => savedDraft?.markAsReceived || false)
  const [payNow, setPayNow]               = useState(() => savedDraft?.payNow || false)
  const [paymentAccountId, setPaymentAccountId] = useState(() => savedDraft?.paymentAccountId || '')
  const [paymentAmount, setPaymentAmount] = useState(() => savedDraft?.paymentAmount || '')

  // Quick-add state
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [showAddItem, setShowAddItem]         = useState(false)
  const [addItemForRow, setAddItemForRow]     = useState(null)   // row._id
  const [quickName, setQuickName]             = useState('')
  const [quickSku, setQuickSku]               = useState('')
  const [quickUnit, setQuickUnit]             = useState('')
  const [quickSaving, setQuickSaving]         = useState(false)

  const canCreate      = permissionManager.hasPermission('PO_CREATE')      || isAdmin
  const canReceive     = permissionManager.hasPermission('PO_RECEIVE')     || isAdmin
  const canPay         = permissionManager.hasPermission('PO_PAYMENT')     || isAdmin
  const canAddSupplier = permissionManager.hasPermission('PO_ADD_SUPPLIER') || isAdmin
  const canAddItem     = permissionManager.hasPermission('PO_ADD_ITEM')    || isAdmin

  const isDark = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const cellCls = `px-2 py-1.5 border text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 rounded w-full ${
    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`
  const inputCls = `px-3 py-2 border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 rounded-lg w-full ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`

  useEffect(() => { loadData() }, [])

  // ── Auto-save draft ─────────────────────────────────────────────────────────
  // Persist the in-progress form to localStorage on every change so an
  // unfinished PO survives navigation, refresh, or app restart. Once the form
  // is emptied out again the stale draft is dropped.
  useEffect(() => {
    if (saving || submittedRef.current) return   // don't re-save while submitting / after save
    const hasContent =
      rows.some(r => r.inventory_item_id || r.quantity || r.total_amount) ||
      header.notes?.trim() ||
      markAsReceived || payNow
    if (hasContent) {
      poDraft.save(userId, { rows, header, markAsReceived, payNow, paymentAccountId, paymentAmount })
    } else {
      poDraft.clear(userId)
    }
  }, [rows, header, markAsReceived, payNow, paymentAccountId, paymentAmount, saving, userId])

  const loadData = async () => {
    try {
      setDataLoading(true)
      const [suppRes, itemsRes, unitsRes, locsRes, accsRes] = await Promise.all([
        supabase.from('suppliers').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('inventory_items').select('id, name, sku, unit_id').eq('user_id', userId).order('name'),
        supabase.from('units').select('id, name, abbreviation').eq('user_id', userId).order('name'),
        supabase.from('inventory_sections').select('id, name, slug').eq('user_id', userId).eq('is_active', true).order('sort_order'),
        (() => {
          const drawerEnabled = !isAdmin && (
            user?.use_cashier_drawer === true ||
            (() => { try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false } })()
          )
          let q = supabase.from('payment_accounts').select('id, name, current_balance, payment_method_key').eq('user_id', userId).eq('is_active', true)
          if (drawerEnabled && cashier?.id) q = q.eq('cashier_id', cashier.id)
          else q = q.is('cashier_id', null)
          return q.order('sort_order')
        })()
      ])
      const seenItemKeys = new Set()
      const uniqueItems = (itemsRes.data || []).filter(i => {
        const key = `${i.name}|${i.sku || ''}`
        if (seenItemKeys.has(key)) return false
        seenItemKeys.add(key)
        return true
      })
      const seenUnitKeys = new Set()
      const uniqueUnits = (unitsRes.data || []).filter(u => {
        const key = `${u.name}|${u.abbreviation}`
        if (seenUnitKeys.has(key)) return false
        seenUnitKeys.add(key)
        return true
      })
      setSuppliers(suppRes.data || [])
      setInventoryItems(uniqueItems)
      setUnits(uniqueUnits)
      const locs = locsRes.data || []
      setLocations(locs)
      const kitchen = locs.find(l => /kitchen/i.test(l.slug) || /kitchen/i.test(l.name))
      if (kitchen) {
        setRows(prev => prev.map(r => r.target_location ? r : { ...r, target_location: kitchen.slug }))
      }
      setPaymentAccounts(accsRes.data || [])
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

  const calcRow = (r) => Math.max(0, (parseFloat(r.total_amount) || 0) - (parseFloat(r.discount) || 0))

  const totals = (() => {
    const subtotal = rows.reduce((s, r) => s + calcRow(r), 0)
    const charges  = (parseFloat(header.delivery_charges) || 0) + (parseFloat(header.labour_charges) || 0) +
                     (parseFloat(header.freight_charges) || 0) + (parseFloat(header.other_charges) || 0)
    const tax      = (subtotal + charges) * ((parseFloat(header.tax_percentage) || 0) / 100)
    return { subtotal, charges, tax, grand: subtotal + charges + tax }
  })()

  useEffect(() => { if (payNow) setPaymentAmount(totals.grand.toFixed(2)) }, [totals.grand, payNow])

  const validRows = rows.filter(r => r.inventory_item_id && r.quantity && r.total_amount)

  // ── Quick-add supplier ──────────────────────────────────────────────────────
  const handleQuickAddSupplier = async () => {
    if (!quickName.trim()) return
    setQuickSaving(true)
    const { data, error } = await supabase
      .from('suppliers')
      .insert({ user_id: userId, name: quickName.trim() })
      .select('id, name').single()
    if (error) { notify.error(error.message); setQuickSaving(false); return }
    setSuppliers(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    setShowAddSupplier(false)
    setQuickName('')
    setQuickSaving(false)
    notify.success(`Supplier "${data.name}" added`)
  }

  // ── Quick-add item ──────────────────────────────────────────────────────────
  const handleQuickAddItem = async () => {
    if (!quickName.trim()) return
    setQuickSaving(true)
    const { data, error } = await supabase
      .from('inventory_items')
      .insert({
        user_id: userId,
        name: quickName.trim(),
        sku: quickSku.trim() || '',
        unit_id: quickUnit || null
      })
      .select('id, name, sku, unit_id').single()
    if (error) { notify.error(error.message); setQuickSaving(false); return }
    setInventoryItems(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
    if (addItemForRow) updateRow(addItemForRow, 'inventory_item_id', data.id)
    setShowAddItem(false)
    setAddItemForRow(null)
    setQuickName('')
    setQuickSku('')
    setQuickUnit('')
    setQuickSaving(false)
    notify.success(`Item "${data.name}" added`)
  }

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!canCreate) { notify.error('No permission to create purchase orders'); return }
    if (validRows.length === 0) { notify.error('Add at least one complete item row'); return }
    if (payNow && !paymentAccountId) { notify.error('Select a payment account'); return }
    if (payNow && !canPay) { notify.error('No permission to make payments'); return }
    if (payNow && new Set(validRows.map(r => r.supplier_id).filter(Boolean)).size > 1) {
      notify.error('Pay Now supports single-supplier POs only. Create the PO, then record payments per supplier from Supplier Ledger.')
      return
    }
    if (markAsReceived && !canReceive) { notify.error('No permission to receive stock'); return }

    try {
      setSaving(true)
      const { subtotal, charges, tax, grand } = totals

      const primarySupplierId = validRows.find(r => r.supplier_id)?.supplier_id || ''

      const { data: po, error } = await supabase.rpc('create_purchase_order', {
        p_user_id: userId,
        p_header: {
          po_date: header.po_date, supplier_id: primarySupplierId, notes: header.notes,
          delivery_charges: parseFloat(header.delivery_charges) || 0,
          labour_charges:   parseFloat(header.labour_charges)   || 0,
          freight_charges:  parseFloat(header.freight_charges)  || 0,
          other_charges:    parseFloat(header.other_charges)    || 0,
          tax_percentage:   parseFloat(header.tax_percentage)   || 0,
          tax_amount: tax, total_amount: subtotal, grand_total: grand
        },
        p_items: validRows.map(r => {
          const qty   = parseFloat(r.quantity) || 1
          const total = parseFloat(r.total_amount) || 0
          return {
            inventory_item_id: r.inventory_item_id,
            supplier_id:       r.supplier_id || '',   // RPC falls back to header supplier if empty
            target_location:   r.target_location || null,
            quantity:          qty,
            purchase_unit_id:  r.purchase_unit_id || null,
            cost_per_unit:     total / qty,
            discount:          parseFloat(r.discount) || 0,
            total_cost:        calcRow(r),
            batch_number:      r.batch_number || null,
            expiry_date:       r.expiry_date || null,
            notes:             null
          }
        })
      })
      if (error) throw error
      if (!po || !po.success) throw new Error(po?.error || 'Failed to create purchase order')

      const poId = po.po_id

      if (markAsReceived && canReceive) {
        const { data: itemsData } = await supabase
          .from('purchase_order_items').select('id, quantity').eq('purchase_order_id', poId)
        if (itemsData?.length) {
          await supabase.rpc('receive_purchase_order', {
            p_po_id: poId, p_user_id: userId,
            p_items: itemsData.map(i => ({ po_item_id: i.id, received_qty: i.quantity }))
          })
          if (!isAdmin && cashier?.id) {
            await supabase.from('purchase_orders').update({ received_by_cashier_id: cashier.id }).eq('id', poId)
          }
        }
      }

      if (payNow && paymentAccountId && canPay) {
        const amt   = parseFloat(paymentAmount) || grand
        const today = header.po_date || localDateStr()
        const selectedAccount = paymentAccounts.find(a => a.id === paymentAccountId)
        const { data: payment } = await supabase.from('supplier_payments').insert({
          user_id: userId, supplier_id: primarySupplierId, purchase_order_id: poId,
          payment_account_id: paymentAccountId, amount_paid: amt, amount_settled: amt,
          amount_unapplied: 0, payment_method: resolvePaymentMethod(selectedAccount?.payment_method_key),
          payment_date: today, notes: `Payment for PO ${po.po_number}`,
          paid_by: isAdmin ? userId : null, paid_by_cashier_id: isAdmin ? null : (cashier?.id ?? null),
        }).select().single()

        if (payment) {
          const { data: lastEntry } = await supabase.from('supplier_ledger')
            .select('balance_after').eq('supplier_id', primarySupplierId).eq('user_id', userId)
            .order('created_at', { ascending: false }).limit(1).maybeSingle()
          await supabase.from('supplier_ledger').insert({
            user_id: userId, supplier_id: primarySupplierId, purchase_order_id: poId,
            payment_id: payment.id, transaction_type: 'credit', transaction_date: today,
            amount: amt, balance_before: lastEntry?.balance_after ?? 0,
            balance_after: Math.max(0, (lastEntry?.balance_after ?? 0) - amt),
            description: `Payment for PO ${po.po_number}`, created_by: userId,
          })
        }
      }

      submittedRef.current = true   // stop auto-save
      poDraft.clear(userId)         // PO saved — discard the auto-saved draft
      notify.success(`PO ${po.po_number} created${markAsReceived ? ' & received' : ''}${payNow ? ' & paid' : ''}`)
      onCreated?.({ ...po, id: poId })
    } catch (err) {
      notify.error(err.message || 'Failed to create purchase order')
    } finally {
      setSaving(false)
    }
  }

  if (dataLoading) return (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
    </div>
  )

  const thCls = `px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${isDark ? 'text-gray-400' : 'text-gray-500'}`
  const modalBg = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const btnSecondary = isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'

  return (
    <>
    <div className="flex flex-col h-full">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className={`flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>New Purchase Order</h2>
            <p className={`text-xs ${themeClasses.textSecondary}`}>{validRows.length} item{validRows.length !== 1 ? 's' : ''} ready</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className={`px-4 py-2 rounded-xl text-sm font-semibold ${btnSecondary}`}>Cancel</button>
          <button
            onClick={handleSubmit}
            disabled={saving || validRows.length === 0}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-semibold rounded-xl text-sm"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Create Purchase Order
          </button>
        </div>
      </div>

      {/* ── Header fields ───────────────────────────────────────────────────── */}
      <div className={`flex gap-4 px-6 py-3 border-b flex-shrink-0 ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-100 bg-gray-50/60'}`}>
        <div className="w-44">
          <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Date *</label>
          <input type="date" value={header.po_date} onChange={e => setHeader(p => ({ ...p, po_date: e.target.value }))} className={inputCls} />
        </div>
        <div className="flex-1">
          <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Notes</label>
          <input type="text" placeholder="Optional notes..." value={header.notes} onChange={e => setHeader(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
        </div>
      </div>

      {/* ── Items table ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm border-collapse min-w-[1100px]">
          <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
            <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
              <th className={`${thCls} w-8`}>#</th>
              <th className={`${thCls} min-w-[190px]`}>Item *</th>
              <th className={`${thCls} min-w-[150px]`}>Supplier</th>
              <th className={`${thCls} w-20`}>Qty *</th>
              <th className={`${thCls} w-24`}>Unit</th>
              <th className={`${thCls} min-w-[120px]`}>Location</th>
              <th className={`${thCls} w-24`}>Batch #</th>
              <th className={`${thCls} w-28`}>Expiry</th>
              <th className={`${thCls} w-32`}>Total (Rs) *</th>
              <th className={`${thCls} w-24`}>Discount</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className={`divide-y ${isDark ? 'divide-gray-700/60' : 'divide-gray-100'}`}>
            {rows.map((row, idx) => (
              <tr key={row._id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50/70'}>
                <td className={`px-3 text-center text-xs font-medium ${themeClasses.textSecondary}`}>{idx + 1}</td>

                {/* Item */}
                <td className="px-2 py-1.5">
                  <SearchableDropdown
                    value={row.inventory_item_id}
                    options={inventoryItems.map(i => ({ id: i.id, label: i.name, sublabel: i.sku || undefined }))}
                    placeholder="Select item..."
                    searchPlaceholder="Search items..."
                    onChange={val => updateRow(row._id, 'inventory_item_id', val)}
                    onAddNew={() => { setAddItemForRow(row._id); setQuickName(''); setQuickSku(''); setQuickUnit(''); setShowAddItem(true) }}
                    canAddNew={canAddItem}
                    addNewLabel="Add New Item"
                    isDark={isDark}
                    triggerCls={cellCls}
                    panelWidth="w-72"
                  />
                </td>

                {/* Per-row Supplier */}
                <td className="px-2 py-1.5">
                  <SearchableDropdown
                    value={row.supplier_id}
                    options={suppliers.map(s => ({ id: s.id, label: s.name }))}
                    placeholder="Default"
                    searchPlaceholder="Search suppliers..."
                    onChange={val => updateRow(row._id, 'supplier_id', val)}
                    onAddNew={() => { setQuickName(''); setShowAddSupplier(true) }}
                    canAddNew={canAddSupplier}
                    addNewLabel="Add New Supplier"
                    isDark={isDark}
                    triggerCls={cellCls}
                    panelWidth="w-60"
                  />
                </td>

                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" min="0" placeholder="0" value={row.quantity} onChange={e => updateRow(row._id, 'quantity', e.target.value)} className={cellCls} />
                </td>
                <td className="px-2 py-1.5">
                  <SearchableDropdown
                    value={row.purchase_unit_id}
                    options={units.map(u => ({ id: u.id, label: u.abbreviation, sublabel: u.name }))}
                    placeholder="Unit"
                    searchPlaceholder="Search units..."
                    onChange={val => updateRow(row._id, 'purchase_unit_id', val)}
                    isDark={isDark}
                    triggerCls={cellCls}
                    panelWidth="w-52"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <select value={row.target_location} onChange={e => updateRow(row._id, 'target_location', e.target.value)} className={cellCls}>
                    <option value="">Location</option>
                    {locations.map(l => <option key={l.id} value={l.slug}>{l.name}</option>)}
                  </select>
                </td>
                <td className="px-2 py-1.5">
                  <input type="text" placeholder="--" value={row.batch_number} onChange={e => updateRow(row._id, 'batch_number', e.target.value)} className={cellCls} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="date" value={row.expiry_date} onChange={e => updateRow(row._id, 'expiry_date', e.target.value)} className={cellCls} />
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" min="0" placeholder="0.00" value={row.total_amount} onChange={e => updateRow(row._id, 'total_amount', e.target.value)} className={cellCls} />
                  {row.total_amount && row.quantity && parseFloat(row.quantity) > 0 && (
                    <p className={`text-[10px] mt-0.5 px-1 ${themeClasses.textSecondary}`}>
                      Rs. {(parseFloat(row.total_amount) / parseFloat(row.quantity)).toFixed(2)}/unit
                    </p>
                  )}
                </td>
                <td className="px-2 py-1.5">
                  <input type="number" step="0.01" min="0" placeholder="0" value={row.discount} onChange={e => updateRow(row._id, 'discount', e.target.value)} className={cellCls} />
                </td>
                <td className="px-2 py-1.5">
                  {rows.length > 1 && (
                    <button onClick={() => setRows(prev => prev.filter(r => r._id !== row._id))} className="text-red-400 hover:text-red-600 p-1">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <button
          onClick={() => {
            const kitchen = locations.find(l => /kitchen/i.test(l.slug) || /kitchen/i.test(l.name))
            setRows(prev => [...prev, { ...emptyRow(), target_location: kitchen?.slug || '' }])
          }}
          className={`w-full py-2.5 text-sm font-semibold flex items-center justify-center gap-1.5 border-b transition-colors ${
            isDark ? 'border-gray-700 text-indigo-400 hover:bg-gray-700/40' : 'border-gray-200 text-indigo-600 hover:bg-indigo-50'
          }`}
        >
          <Plus className="w-4 h-4" /> Add Row
        </button>
      </div>

      {/* ── Footer ──────────────────────────────────────────────────────────── */}
      <div className={`flex-shrink-0 border-t ${isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-gray-50'}`}>
        <div className="flex items-start gap-6 px-6 pt-4 pb-3">

          {/* Left: Mark as Received */}
          <div className="flex-shrink-0 w-52">
            <label className={`flex items-start gap-3 cursor-pointer ${!canReceive ? 'opacity-40 cursor-not-allowed' : ''}`}>
              <div onClick={() => canReceive && setMarkAsReceived(p => !p)}
                className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${markAsReceived ? 'bg-indigo-600 border-indigo-600' : isDark ? 'border-gray-500 bg-gray-700' : 'border-gray-300 bg-white'}`}>
                {markAsReceived && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${themeClasses.textPrimary}`}>Mark as Received</p>
                <p className={`text-xs ${themeClasses.textSecondary}`}>Stock added immediately</p>
              </div>
            </label>
          </div>

          {/* Middle: charges */}
          <div className="flex-1 grid grid-cols-5 gap-3">
            {[
              { key: 'delivery_charges', label: 'Delivery' },
              { key: 'labour_charges',   label: 'Labour' },
              { key: 'freight_charges',  label: 'Freight' },
              { key: 'other_charges',    label: 'Other' },
              { key: 'tax_percentage',   label: 'Tax %' }
            ].map(({ key, label }) => (
              <div key={key}>
                <label className={`block text-[10px] font-semibold mb-1 ${themeClasses.textSecondary}`}>{label}</label>
                <input type="number" step="0.01" min="0" value={header[key]} onChange={e => setHeader(p => ({ ...p, [key]: e.target.value }))} placeholder="0" className={`${inputCls} text-xs px-2 py-1.5`} />
              </div>
            ))}
          </div>

          {/* Right: totals */}
          <div className="flex-shrink-0 text-right min-w-[160px]">
            <div className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>
              {validRows.length} item{validRows.length !== 1 ? 's' : ''} · Subtotal: Rs. {totals.subtotal.toFixed(2)}
            </div>
            <div className="text-xs text-gray-400">GRAND TOTAL</div>
            <div className={`text-3xl font-bold ${isDark ? 'text-indigo-400' : 'text-indigo-600'}`}>
              Rs. {totals.grand.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Pay Now row — checkbox + payment accounts inline */}
        {canPay && (
          <div className="flex items-center gap-4 px-6 pb-4 flex-wrap">
            <label className="flex items-start gap-3 cursor-pointer flex-shrink-0 w-52">
              <div onClick={() => setPayNow(p => !p)}
                className={`mt-0.5 w-5 h-5 rounded flex-shrink-0 border-2 flex items-center justify-center transition-all ${payNow ? 'bg-indigo-600 border-indigo-600' : isDark ? 'border-gray-500 bg-gray-700' : 'border-gray-300 bg-white'}`}>
                {payNow && <Check className="w-3 h-3 text-white" />}
              </div>
              <div>
                <p className={`text-sm font-semibold ${themeClasses.textPrimary}`}>Pay Now</p>
                <p className={`text-xs ${themeClasses.textSecondary}`}>{isAdmin ? 'Record from account' : 'Pay from cashier account'}</p>
              </div>
            </label>

            {payNow && (
              <div className="flex flex-wrap items-center gap-2">
                {paymentAccounts.map(a => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setPaymentAccountId(a.id)}
                    className={`flex flex-col items-start px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      paymentAccountId === a.id
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                        : isDark
                          ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-indigo-500'
                          : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400'
                    }`}
                  >
                    <span>{a.name}</span>
                    <span className={`text-[10px] font-normal ${paymentAccountId === a.id ? 'text-indigo-200' : themeClasses.textSecondary}`}>
                      Rs. {parseFloat(a.current_balance || 0).toLocaleString()}
                    </span>
                  </button>
                ))}
                <div className="w-40">
                  <input type="number" step="0.01" placeholder="Amount" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className={`${inputCls} text-xs`} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    {/* ── Quick-add Supplier modal ─────────────────────────────────────────── */}
    {showAddSupplier && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddSupplier(false)} />
        <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl border p-6 ${modalBg}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-bold text-base ${themeClasses.textPrimary}`}>Add New Supplier</h3>
            <button onClick={() => setShowAddSupplier(false)} className={`p-1 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Supplier Name *</label>
              <input
                autoFocus type="text" placeholder="e.g. Ahmad Brothers"
                value={quickName} onChange={e => setQuickName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleQuickAddSupplier()}
                className={inputCls}
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowAddSupplier(false)} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${btnSecondary}`}>Cancel</button>
            <button
              onClick={handleQuickAddSupplier}
              disabled={quickSaving || !quickName.trim()}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2"
            >
              {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add Supplier
            </button>
          </div>
        </div>
      </div>
    )}

    {/* ── Quick-add Item modal ─────────────────────────────────────────────── */}
    {showAddItem && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/60" onClick={() => setShowAddItem(false)} />
        <div className={`relative w-full max-w-sm rounded-2xl shadow-2xl border p-6 ${modalBg}`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-bold text-base ${themeClasses.textPrimary}`}>Add New Item</h3>
            <button onClick={() => setShowAddItem(false)} className={`p-1 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Item Name *</label>
              <input
                autoFocus type="text" placeholder="e.g. Chicken Breast"
                value={quickName} onChange={e => setQuickName(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>SKU (optional)</label>
              <input type="text" placeholder="e.g. CHK-BR-001" value={quickSku} onChange={e => setQuickSku(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={`block text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Unit (optional)</label>
              <SearchableDropdown
                value={quickUnit}
                options={units.map(u => ({ id: u.id, label: u.name, sublabel: u.abbreviation }))}
                placeholder="Select unit..."
                searchPlaceholder="Search units..."
                onChange={val => setQuickUnit(val)}
                isDark={isDark}
                triggerCls={inputCls}
                panelWidth="w-full"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setShowAddItem(false)} className={`flex-1 py-2 rounded-xl text-sm font-semibold ${btnSecondary}`}>Cancel</button>
            <button
              onClick={handleQuickAddItem}
              disabled={quickSaving || !quickName.trim()}
              className="flex-1 py-2 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2"
            >
              {quickSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add Item
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
