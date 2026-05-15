'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Loader2, RotateCcw, ArrowLeft,
  ChevronRight, Check, CreditCard, Banknote
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

// ─── helpers ────────────────────────────────────────────────────────────────

const REFUND_OPTIONS = [
  { key: 'credit_note', label: 'Credit Note', desc: 'Reduces supplier balance', Icon: CreditCard },
  { key: 'cash_refund', label: 'Cash Refund',  desc: 'Cash paid back to you',   Icon: Banknote   },
]

// ─── Main tab component ─────────────────────────────────────────────────────

export default function PurchaseReturnsTab({ user }) {
  const [returns, setReturns]             = useState([])
  const [filteredReturns, setFiltered]    = useState([])
  const [loading, setLoading]             = useState(true)
  const [searchTerm, setSearchTerm]       = useState('')
  const [selectedReturn, setSelected]     = useState(null)
  const [mode, setMode]                   = useState('list') // list | create | view

  const isDark       = themeManager.isDark()
  const themeClasses = themeManager.getClasses()
  const canCreate    = permissionManager.hasPermission('PO_RETURN') || authManager.getRole() === 'admin'

  useEffect(() => { if (user?.id) loadReturns() }, [user?.id])

  const loadReturns = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('purchase_returns')
        .select('*, suppliers(id, name)')
        .eq('user_id', user.id)
        .order('return_date', { ascending: false })
      if (error) throw error
      setReturns(data || [])
    } catch { notify.error('Failed to load purchase returns') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    const q = searchTerm.trim().toLowerCase()
    setFiltered(
      q
        ? returns.filter(r =>
            r.return_number?.toLowerCase().includes(q) ||
            r.po_number?.toLowerCase().includes(q) ||
            r.suppliers?.name?.toLowerCase().includes(q)
          )
        : returns
    )
  }, [searchTerm, returns])

  const stats = {
    total:  returns.length,
    credit: returns.filter(r => r.refund_type === 'credit_note').length,
    cash:   returns.filter(r => r.refund_type === 'cash_refund').length,
  }

  return (
    <div className="flex flex-1 h-full overflow-hidden">

      {/* ── Left panel ── */}
      <div className={`w-80 flex-shrink-0 flex flex-col h-full border-r ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>

        {/* Stats + controls */}
        <div className={`px-4 pt-3 pb-3 flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-100 bg-gray-50/60'}`}>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {[
              { label: 'Total',  value: stats.total,  cls: themeClasses.textPrimary },
              { label: 'Credit', value: stats.credit, cls: 'text-blue-500'  },
              { label: 'Cash',   value: stats.cash,   cls: 'text-green-500' },
            ].map(({ label, value, cls }) => (
              <div key={label} className={`text-center rounded-lg py-2 ${isDark ? 'bg-gray-700/60' : 'bg-white border border-gray-100'}`}>
                <p className={`text-sm font-bold ${cls}`}>{value}</p>
                <p className={`text-[9px] font-medium ${themeClasses.textSecondary}`}>{label}</p>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text" placeholder="Search return # or PO..."
                value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-violet-500 ${
                  isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                }`}
              />
            </div>
            {canCreate && (
              <motion.button
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                onClick={() => { setSelected(null); setMode('create') }}
                className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${
                  mode === 'create'
                    ? 'bg-violet-600 text-white'
                    : isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-violet-50 hover:bg-violet-100 text-violet-700 border border-violet-200'
                }`}
              >
                <Plus className="w-4 h-4" /> New
              </motion.button>
            )}
          </div>
        </div>

        {/* Returns list */}
        <div className="flex-1 overflow-y-auto py-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-violet-500" />
            </div>
          ) : filteredReturns.length === 0 ? (
            <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${themeClasses.textSecondary}`}>
              <RotateCcw className="w-10 h-10 mb-3 opacity-30" />
              <p className="text-sm font-medium">No purchase returns</p>
              {canCreate && <p className="text-xs mt-1 opacity-70">Create your first return</p>}
            </div>
          ) : (
            filteredReturns.map(ret => {
              const isSelected = selectedReturn?.id === ret.id && mode === 'view'
              const isCash     = ret.refund_type === 'cash_refund'
              return (
                <motion.button
                  key={ret.id} whileHover={{ x: 2 }}
                  onClick={() => { setSelected(ret); setMode('view') }}
                  className={`w-full px-4 py-3 text-left border-b transition-all ${
                    isSelected
                      ? isDark ? 'bg-violet-900/40 border-l-2 border-l-violet-500' : 'bg-violet-50 border-l-2 border-l-violet-500'
                      : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`font-semibold text-sm ${themeClasses.textPrimary}`}>
                      {ret.return_number}
                    </span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isCash
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                        : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                    }`}>
                      {isCash ? 'Cash' : 'Credit'}
                    </span>
                  </div>
                  <p className={`text-xs ${themeClasses.textSecondary}`}>
                    PO: {ret.po_number} · {ret.suppliers?.name}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <span className={`text-xs ${themeClasses.textSecondary}`}>
                      {new Date(ret.return_date).toLocaleDateString('en-PK')}
                    </span>
                    <span className="text-sm font-bold text-red-500">
                      −Rs.&nbsp;{(ret.total_amount || 0).toFixed(0)}
                    </span>
                  </div>
                </motion.button>
              )
            })
          )}
        </div>
      </div>

      {/* ── Right panel ── */}
      <div className={`flex-1 h-full overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-50/50'}`}>
        <AnimatePresence mode="wait">
          {mode === 'create' && (
            <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full">
              <CreateReturnPanel
                user={user}
                onClose={() => setMode('list')}
                onCreated={(ret) => { loadReturns(); setSelected(ret); setMode('view') }}
              />
            </motion.div>
          )}
          {mode === 'view' && selectedReturn && (
            <motion.div key={`view-${selectedReturn.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full overflow-y-auto">
              <ViewReturnPanel ret={selectedReturn} onBack={() => { setSelected(null); setMode('list') }} />
            </motion.div>
          )}
          {mode === 'list' && (
            <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col items-center justify-center">
              <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                <RotateCcw className={`w-10 h-10 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
              </div>
              <p className={`text-lg font-semibold ${themeClasses.textPrimary}`}>No return selected</p>
              <p className={`text-sm mt-1 ${themeClasses.textSecondary}`}>
                {canCreate ? (
                  <>Select a return or{' '}
                    <button onClick={() => setMode('create')} className="text-violet-600 hover:text-violet-500 font-semibold underline underline-offset-2">
                      create a new one
                    </button>
                  </>
                ) : 'Select a return to view details'}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// ─── Create Return Panel ─────────────────────────────────────────────────────

function CreateReturnPanel({ user, onClose, onCreated }) {
  const [step, setStep]                     = useState(1)
  const [poSearch, setPoSearch]             = useState('')
  const [poList, setPoList]                 = useState([])
  const [loadingPOs, setLoadingPOs]         = useState(true)
  const [selectedPO, setSelectedPO]         = useState(null)
  const [poItems, setPoItems]               = useState([])
  const [loadingItems, setLoadingItems]     = useState(false)
  const [paymentAccounts, setPayAccounts]   = useState([])
  const [refundType, setRefundType]         = useState('credit_note')
  const [paymentAccountId, setPayAccId]     = useState('')
  const [reason, setReason]                 = useState('')
  const [notes, setNotes]                   = useState('')
  const [saving, setSaving]                 = useState(false)

  const isDark       = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
  }`

  useEffect(() => { loadPOs(); loadPaymentAccounts() }, [])

  const loadPOs = async () => {
    const { data } = await supabase
      .from('purchase_orders')
      .select('id, po_number, po_date, supplier_id, grand_total, suppliers(id, name)')
      .eq('user_id', user.id)
      .in('status', ['received', 'partial'])
      .order('po_date', { ascending: false })
    setPoList(data || [])
    setLoadingPOs(false)
  }

  const loadPaymentAccounts = async () => {
    const { data } = await supabase
      .from('payment_accounts')
      .select('id, name, current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('sort_order')
    setPayAccounts(data || [])
  }

  const selectPO = async (po) => {
    setLoadingItems(true)
    setStep(2)
    setSelectedPO(po)
    const [itemsRes, returnsRes] = await Promise.all([
      supabase
        .from('purchase_order_items')
        .select('id, inventory_item_id, quantity, received_quantity, cost_per_unit, inventory_items(id, name, sku, units(abbreviation))')
        .eq('purchase_order_id', po.id)
        .gt('received_quantity', 0),
      // Quantities already returned against this PO (prevents over-returning)
      supabase
        .from('purchase_return_items')
        .select('inventory_item_id, quantity, purchase_returns!inner(purchase_order_id)')
        .eq('purchase_returns.purchase_order_id', po.id),
    ])
    const returnedMap = {}
    ;(returnsRes.data || []).forEach(r => {
      returnedMap[r.inventory_item_id] = (returnedMap[r.inventory_item_id] || 0) + (parseFloat(r.quantity) || 0)
    })
    setPoItems(
      (itemsRes.data || [])
        .map(i => {
          const returnable = Math.max(
            0,
            (parseFloat(i.received_quantity) || 0) - (returnedMap[i.inventory_item_id] || 0)
          )
          return { ...i, returnable, return_qty: String(returnable), checked: returnable > 0 }
        })
        .filter(i => i.returnable > 0)
    )
    setLoadingItems(false)
  }

  const toggleItem = (idx) =>
    setPoItems(p => p.map((i, n) => n === idx ? { ...i, checked: !i.checked } : i))

  const setQty = (idx, val) =>
    setPoItems(p => p.map((i, n) => n === idx ? { ...i, return_qty: val, checked: true } : i))

  const activeItems = poItems.filter(i => i.checked && parseFloat(i.return_qty) > 0)
  const total = activeItems.reduce(
    (s, i) => s + (parseFloat(i.return_qty) || 0) * (parseFloat(i.cost_per_unit) || 0),
    0
  )

  const filteredPOs = poSearch
    ? poList.filter(p =>
        p.po_number?.toLowerCase().includes(poSearch.toLowerCase()) ||
        p.suppliers?.name?.toLowerCase().includes(poSearch.toLowerCase())
      )
    : poList

  const handleSave = async () => {
    if (activeItems.length === 0) { notify.error('Select at least one item with a return quantity'); return }
    for (const i of activeItems) {
      const rq  = parseFloat(i.return_qty)
      const max = parseFloat(i.returnable)
      if (!rq || rq <= 0) { notify.error(`Enter a valid qty for ${i.inventory_items?.name}`); return }
      if (rq > max) { notify.error(`${i.inventory_items?.name}: max returnable is ${max}`); return }
    }
    if (!reason.trim()) { notify.error('Return reason is required'); return }
    if (refundType === 'cash_refund' && !paymentAccountId) { notify.error('Select a payment account'); return }

    try {
      setSaving(true)
      const { data: result, error } = await supabase.rpc('create_purchase_return', {
        p_user_id:            user.id,
        p_supplier_id:        selectedPO.supplier_id,
        p_purchase_order_id:  selectedPO.id,
        p_po_number:          selectedPO.po_number,
        p_return_date:        new Date().toISOString().split('T')[0],
        p_reason:             reason.trim(),
        p_refund_type:        refundType,
        p_payment_account_id: refundType === 'cash_refund' ? paymentAccountId : null,
        p_notes:              notes.trim() || null,
        p_created_by:         user.id,
        p_items:              activeItems.map(i => ({
          inventory_item_id: i.inventory_item_id,
          quantity:          parseFloat(i.return_qty),
          cost_per_unit:     parseFloat(i.cost_per_unit) || 0,
          total_cost:        (parseFloat(i.return_qty) || 0) * (parseFloat(i.cost_per_unit) || 0),
        })),
      })

      if (error) throw error
      if (!result?.success) throw new Error(result?.error || 'RPC returned failure')

      notify.success(`Return #${result.return_number} created`)
      onCreated?.({
        id:            result.return_id,
        return_number: result.return_number,
        po_number:     selectedPO.po_number,
        return_date:   new Date().toISOString().split('T')[0],
        refund_type:   refundType,
        total_amount:  result.total_amount,
        supplier_id:   selectedPO.supplier_id,
        suppliers:     selectedPO.suppliers,
        reason,
        notes: notes.trim() || null,
      })
    } catch (err) {
      notify.error(err.message || 'Failed to create return')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">

      {/* Top bar */}
      <div className={`flex items-center justify-between px-6 py-3.5 border-b flex-shrink-0 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
        <div className="flex items-center gap-3">
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>
              {step === 1 ? 'Select Purchase Order' : `Return Items — PO #${selectedPO?.po_number}`}
            </h2>
            <p className={`text-xs ${themeClasses.textSecondary}`}>
              {step === 1
                ? 'Only received / partially received POs are eligible'
                : `${activeItems.length} item${activeItems.length !== 1 ? 's' : ''} selected · Rs. ${total.toFixed(2)}`}
            </p>
          </div>
        </div>

        {step === 2 && (
          <div className="flex gap-2">
            <button
              onClick={() => { setStep(1); setSelectedPO(null); setPoItems([]) }}
              className={`px-4 py-2 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
            >
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving || activeItems.length === 0 || !reason.trim()}
              className="flex items-center gap-2 px-5 py-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 text-white font-semibold rounded-xl text-sm"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create Return
            </button>
          </div>
        )}
      </div>

      {/* ── Step 1: Select PO ── */}
      {step === 1 && (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text" placeholder="Search PO number or supplier..."
              value={poSearch} onChange={e => setPoSearch(e.target.value)}
              className={`${inputCls} pl-9`}
            />
          </div>

          {loadingPOs ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
          ) : filteredPOs.length === 0 ? (
            <div className={`text-center py-12 ${themeClasses.textSecondary}`}>
              <RotateCcw className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm font-medium">No eligible purchase orders</p>
              <p className="text-xs mt-1 opacity-70">Only received or partially-received POs can have returns</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPOs.map(po => (
                <motion.button
                  key={po.id}
                  whileHover={{ scale: 1.005 }} whileTap={{ scale: 0.998 }}
                  onClick={() => selectPO(po)}
                  className={`w-full flex items-center justify-between p-4 rounded-xl border-2 text-left transition-all ${
                    isDark
                      ? 'border-gray-700 hover:border-violet-600 bg-gray-800/50 hover:bg-gray-800'
                      : 'border-gray-200 hover:border-violet-300 bg-white hover:bg-violet-50/30'
                  }`}
                >
                  <div>
                    <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>{po.po_number}</p>
                    <p className={`text-xs ${themeClasses.textSecondary}`}>{po.suppliers?.name}</p>
                    <p className={`text-xs ${themeClasses.textSecondary} mt-0.5`}>
                      {new Date(po.po_date).toLocaleDateString('en-PK')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>
                      Rs.&nbsp;{(po.grand_total || 0).toFixed(0)}
                    </p>
                    <ChevronRight className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                  </div>
                </motion.button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Step 2: Select items + refund config ── */}
      {step === 2 && (
        <div className="flex-1 overflow-y-auto flex flex-col">
          {loadingItems ? (
            <div className="flex justify-center py-12"><Loader2 className="w-5 h-5 animate-spin text-violet-500" /></div>
          ) : (
            <>
              {/* Items table */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse min-w-[640px]">
                  <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                      <th className="w-10 px-3 py-2.5"></th>
                      <th className={`text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary}`}>Item</th>
                      <th className={`text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary} w-28`}>Returnable</th>
                      <th className={`text-center px-3 py-2.5 text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary} w-32`}>Return Qty</th>
                      <th className={`text-right px-5 py-2.5 text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary} w-28`}>Est. Value</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700/60' : 'divide-gray-100'}`}>
                    {poItems.map((item, idx) => {
                      const estVal = (parseFloat(item.return_qty) || 0) * (parseFloat(item.cost_per_unit) || 0)
                      const unit   = item.inventory_items?.units?.abbreviation || ''
                      return (
                        <tr
                          key={item.id}
                          className={`${item.checked ? '' : 'opacity-40'} ${isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}`}
                        >
                          <td className="px-3 py-3 text-center">
                            <button
                              onClick={() => toggleItem(idx)}
                              className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-all ${
                                item.checked ? 'bg-violet-600 border-violet-600' : isDark ? 'border-gray-500' : 'border-gray-300'
                              }`}
                            >
                              {item.checked && <Check className="w-3 h-3 text-white" />}
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <p className={`font-semibold ${themeClasses.textPrimary}`}>{item.inventory_items?.name}</p>
                            {item.inventory_items?.sku && (
                              <p className={`text-xs ${themeClasses.textSecondary}`}>{item.inventory_items.sku}</p>
                            )}
                            <p className={`text-xs ${themeClasses.textSecondary}`}>
                              Cost: Rs.&nbsp;{(item.cost_per_unit || 0).toFixed(2)} / {unit || 'unit'}
                            </p>
                          </td>
                          <td className={`px-3 py-3 text-center text-sm ${themeClasses.textSecondary}`}>
                            {item.returnable}&nbsp;{unit}
                          </td>
                          <td className="px-3 py-3 text-center">
                            <input
                              type="number" step="0.01" min="0" max={item.returnable}
                              value={item.return_qty}
                              onChange={e => setQty(idx, e.target.value)}
                              onClick={() => setPoItems(p => p.map((i, n) => n === idx ? { ...i, checked: true } : i))}
                              className={`w-24 px-2 py-1.5 rounded-lg border text-sm text-center focus:outline-none focus:ring-2 focus:ring-violet-500 ${
                                isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
                              }`}
                            />
                          </td>
                          <td className={`px-5 py-3 text-right font-semibold text-sm ${estVal > 0 ? 'text-red-500' : themeClasses.textSecondary}`}>
                            {estVal > 0 ? `Rs. ${estVal.toFixed(2)}` : '—'}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Refund config footer */}
              <div className={`border-t flex-shrink-0 p-6 ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-200 bg-gray-50/60'}`}>
                <div className="grid grid-cols-2 gap-6">

                  {/* Left: refund type + account */}
                  <div className="space-y-4">
                    <div>
                      <p className={`text-xs font-semibold mb-2 ${themeClasses.textSecondary}`}>Refund Type *</p>
                      <div className="grid grid-cols-2 gap-2">
                        {REFUND_OPTIONS.map(({ key, label, desc, Icon }) => (
                          <button
                            key={key}
                            onClick={() => setRefundType(key)}
                            className={`flex flex-col items-start p-3 rounded-xl border-2 text-left transition-all ${
                              refundType === key
                                ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20'
                                : isDark ? 'border-gray-700 bg-gray-800 hover:border-gray-600' : 'border-gray-200 bg-white hover:border-gray-300'
                            }`}
                          >
                            <Icon className={`w-4 h-4 mb-1 ${refundType === key ? 'text-violet-600 dark:text-violet-400' : themeClasses.textSecondary}`} />
                            <span className={`text-sm font-bold ${refundType === key ? 'text-violet-700 dark:text-violet-300' : themeClasses.textPrimary}`}>{label}</span>
                            <span className={`text-xs ${themeClasses.textSecondary}`}>{desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {refundType === 'cash_refund' && (
                      <div>
                        <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Payment Account *</label>
                        <select
                          value={paymentAccountId}
                          onChange={e => setPayAccId(e.target.value)}
                          className={inputCls}
                        >
                          <option value="">Select account</option>
                          {paymentAccounts.map(a => (
                            <option key={a.id} value={a.id}>
                              {a.name} — Rs.&nbsp;{parseFloat(a.current_balance || 0).toLocaleString()}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  {/* Right: reason + notes + total */}
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Reason *</label>
                      <input
                        type="text"
                        placeholder="e.g. Damaged goods, wrong item..."
                        value={reason}
                        onChange={e => setReason(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Notes</label>
                      <input
                        type="text"
                        placeholder="Optional notes..."
                        value={notes}
                        onChange={e => setNotes(e.target.value)}
                        className={inputCls}
                      />
                    </div>
                    <div className={`rounded-xl p-4 text-right ${isDark ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
                      <p className={`text-xs mb-1 ${isDark ? 'text-red-300' : 'text-red-600'}`}>
                        {activeItems.length} item{activeItems.length !== 1 ? 's' : ''} · Return Total
                      </p>
                      <p className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                        Rs.&nbsp;{total.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── View Return Panel ───────────────────────────────────────────────────────

function ViewReturnPanel({ ret, onBack }) {
  const [items, setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const isDark       = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  useEffect(() => {
    if (!ret?.id) return
    const load = async () => {
      try {
        setLoading(true)
        const { data } = await supabase
          .from('purchase_return_items')
          .select('*, inventory_items(id, name, sku, units(abbreviation))')
          .eq('purchase_return_id', ret.id)
        setItems(data || [])
      } finally { setLoading(false) }
    }
    load()
  }, [ret?.id])

  const isCash = ret.refund_type === 'cash_refund'

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
              <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>Return #{ret.return_number}</h2>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                isCash
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
                  : 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
              }`}>
                {isCash ? 'Cash Refund' : 'Credit Note'}
              </span>
            </div>
            <p className={`text-xs mt-0.5 ${themeClasses.textSecondary}`}>
              PO: {ret.po_number} · {new Date(ret.return_date).toLocaleDateString('en-PK', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Info cards */}
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Supplier',    value: ret.suppliers?.name || '—' },
              { label: 'Return Date', value: new Date(ret.return_date).toLocaleDateString('en-PK') },
              { label: 'Refund Type', value: isCash ? 'Cash Refund' : 'Credit Note' },
              { label: 'Total',       value: `Rs. ${(ret.total_amount || 0).toFixed(2)}` },
            ].map(({ label, value }) => (
              <div key={label} className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-white border border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>{label}</p>
                <p className={`font-bold text-sm ${themeClasses.textPrimary}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Reason */}
          {ret.reason && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
              <p className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Reason</p>
              <p className={`text-sm ${themeClasses.textPrimary}`}>{ret.reason}</p>
            </div>
          )}

          {/* Items table */}
          <div className={`rounded-xl overflow-hidden border ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className={`px-5 py-3 flex items-center justify-between ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
              <h3 className={`text-sm font-bold ${themeClasses.textPrimary}`}>Returned Items</h3>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                {items.length} item{items.length !== 1 ? 's' : ''}
              </span>
            </div>
            <table className={`w-full text-sm ${isDark ? 'bg-gray-900/40' : 'bg-white'}`}>
              <thead>
                <tr className={`text-xs font-semibold uppercase ${isDark ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
                  <th className="text-left px-5 py-2.5">#</th>
                  <th className="text-left px-3 py-2.5">Item</th>
                  <th className="text-center px-3 py-2.5">Qty</th>
                  <th className="text-right px-3 py-2.5">Cost / Unit</th>
                  <th className="text-right px-5 py-2.5">Total</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${isDark ? 'divide-gray-700' : 'divide-gray-100'}`}>
                {items.length === 0 ? (
                  <tr>
                    <td colSpan={5} className={`py-8 text-center text-sm ${themeClasses.textSecondary}`}>No items found</td>
                  </tr>
                ) : items.map((item, idx) => (
                  <tr key={item.id} className={isDark ? 'hover:bg-gray-800/50' : 'hover:bg-gray-50'}>
                    <td className={`px-5 py-3 text-xs font-medium ${themeClasses.textSecondary}`}>{idx + 1}</td>
                    <td className="px-3 py-3">
                      <p className={`font-semibold ${themeClasses.textPrimary}`}>{item.inventory_items?.name}</p>
                      {item.inventory_items?.sku && (
                        <p className={`text-xs ${themeClasses.textSecondary}`}>{item.inventory_items.sku}</p>
                      )}
                    </td>
                    <td className={`px-3 py-3 text-center ${themeClasses.textSecondary}`}>
                      {item.quantity}&nbsp;{item.inventory_items?.units?.abbreviation || ''}
                    </td>
                    <td className={`px-3 py-3 text-right ${themeClasses.textSecondary}`}>
                      Rs.&nbsp;{(item.cost_per_unit || 0).toFixed(2)}
                    </td>
                    <td className="px-5 py-3 text-right font-bold text-red-500">
                      Rs.&nbsp;{(item.total_cost || 0).toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Total card */}
          <div className="flex justify-end">
            <div className={`rounded-xl p-5 text-right min-w-[200px] ${isDark ? 'bg-red-900/20 border border-red-700' : 'bg-red-50 border border-red-200'}`}>
              <p className={`text-xs mb-1 ${isDark ? 'text-red-300' : 'text-red-600'}`}>Total Returned</p>
              <p className={`text-2xl font-bold ${isDark ? 'text-red-400' : 'text-red-700'}`}>
                Rs.&nbsp;{(ret.total_amount || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Notes */}
          {ret.notes && (
            <div className={`rounded-xl p-4 ${isDark ? 'bg-gray-800' : 'bg-gray-50 border border-gray-200'}`}>
              <p className={`text-xs font-semibold mb-1 ${themeClasses.textSecondary}`}>Notes</p>
              <p className={`text-sm ${themeClasses.textPrimary}`}>{ret.notes}</p>
            </div>
          )}

        </div>
      )}
    </div>
  )
}
