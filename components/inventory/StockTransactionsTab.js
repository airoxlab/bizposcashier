'use client'

import React, { useState, useEffect } from 'react'
import { Search, Loader2, Activity, TrendingUp, TrendingDown, Package, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

// ─── Transaction type config ─────────────────────────────────────────────────

const TYPES = {
  purchase:        { label: 'Purchase',        badge: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',   icon: TrendingUp   },
  purchase_return: { label: 'Return',          badge: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',           icon: TrendingDown },
  order_deduction: { label: 'Order Deduction', badge: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300', icon: TrendingDown },
  adjustment_in:   { label: 'Adj. In',         badge: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',       icon: TrendingUp   },
  adjustment_out:  { label: 'Adj. Out',        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',   icon: TrendingDown },
  recipe:          { label: 'Recipe',          badge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300', icon: Package      },
  transfer_in:     { label: 'Transfer In',     badge: 'bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300',       icon: TrendingUp   },
  transfer_out:    { label: 'Transfer Out',    badge: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300',       icon: TrendingDown },
}

// Positive-qty types (all others are outgoing)
const POSITIVE_TYPES = new Set(['purchase', 'adjustment_in', 'transfer_in'])

function isPositiveType(type) {
  return POSITIVE_TYPES.has(type)
}

const PAGE_SIZE = 100

export default function StockTransactionsTab({ user }) {
  const [transactions, setTransactions] = useState([])
  const [filtered, setFiltered]         = useState([])
  const [loading, setLoading]           = useState(true)
  const [searchTerm, setSearchTerm]     = useState('')
  const [typeFilter, setTypeFilter]     = useState('all')
  const [dateFrom, setDateFrom]         = useState('')
  const [dateTo, setDateTo]             = useState('')

  const isDark       = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  useEffect(() => { if (user?.id) loadTransactions() }, [user?.id])

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('stock_history')
        .select('*, inventory_items(id, name, sku, units(name, abbreviation)), suppliers(id, name)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(PAGE_SIZE)
      if (error) throw error
      setTransactions(data || [])
    } catch { notify.error('Failed to load stock transactions') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let list = transactions

    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(t =>
        t.inventory_items?.name?.toLowerCase().includes(q) ||
        t.inventory_items?.sku?.toLowerCase().includes(q) ||
        t.suppliers?.name?.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      )
    }

    if (typeFilter !== 'all') {
      list = list.filter(t => t.transaction_type === typeFilter)
    }

    if (dateFrom) {
      list = list.filter(t => new Date(t.created_at) >= new Date(dateFrom + 'T00:00:00'))
    }
    if (dateTo) {
      list = list.filter(t => new Date(t.created_at) <= new Date(dateTo + 'T23:59:59'))
    }

    setFiltered(list)
  }, [searchTerm, typeFilter, dateFrom, dateTo, transactions])

  const hasFilters = searchTerm || typeFilter !== 'all' || dateFrom || dateTo
  const clearFilters = () => { setSearchTerm(''); setTypeFilter('all'); setDateFrom(''); setDateTo('') }

  const countIn  = transactions.filter(t => isPositiveType(t.transaction_type)).length
  const countOut = transactions.filter(t => !isPositiveType(t.transaction_type)).length

  const inputCls = `px-3 py-2 border text-sm rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-900'
  }`

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">

      {/* ── Filter bar ── */}
      <div className={`flex items-center gap-3 px-5 py-3 border-b flex-shrink-0 flex-wrap ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-100 bg-gray-50/60'}`}>

        {/* Stats chips */}
        <div className="flex gap-2 flex-shrink-0">
          {[
            { label: `${transactions.length} Total`, cls: isDark ? 'bg-gray-700 text-gray-200' : 'bg-gray-100 text-gray-700' },
            { label: `${countIn} In`,                cls: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300' },
            { label: `${countOut} Out`,              cls: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
          ].map(({ label, cls }) => (
            <span key={label} className={`text-xs font-semibold px-3 py-1.5 rounded-full ${cls}`}>{label}</span>
          ))}
        </div>

        <div className="flex-1 flex gap-2 flex-wrap items-center">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search item name, SKU or supplier..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`${inputCls} w-full pl-9`}
            />
          </div>

          {/* Type filter */}
          <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className={`${inputCls} min-w-[140px]`}>
            <option value="all">All Types</option>
            {Object.entries(TYPES).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>

          {/* Date range */}
          <input
            type="date" value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={inputCls}
            title="From date"
          />
          <input
            type="date" value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={inputCls}
            title="To date"
          />

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={clearFilters}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium flex-shrink-0 ${
                isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
              }`}
            >
              <X className="w-3.5 h-3.5" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Table ── */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className={`flex flex-col items-center justify-center py-16 ${themeClasses.textSecondary}`}>
            <Activity className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-base font-semibold">No transactions found</p>
            <p className="text-sm mt-1 opacity-70">
              {hasFilters ? 'Try adjusting your filters' : 'Stock movements will appear here once items are received'}
            </p>
          </div>
        ) : (
          <table className="w-full text-sm border-collapse min-w-[900px]">
            <thead className={`sticky top-0 z-10 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
              <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                {[
                  { label: 'Date & Time',  cls: 'w-32' },
                  { label: 'Item',         cls: ''      },
                  { label: 'Type',         cls: 'w-32' },
                  { label: 'Qty Change',   cls: 'w-28' },
                  { label: 'Before',       cls: 'w-20 text-right' },
                  { label: 'After',        cls: 'w-20 text-right' },
                  { label: 'Cost / Unit',  cls: 'w-24 text-right' },
                  { label: 'Supplier',     cls: 'w-32' },
                  { label: 'Notes',        cls: 'w-40' },
                ].map(({ label, cls }) => (
                  <th key={label} className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary} ${cls}`}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className={`divide-y ${isDark ? 'divide-gray-700/50' : 'divide-gray-100'}`}>
              {filtered.map(txn => {
                const typeInfo  = TYPES[txn.transaction_type] || { label: txn.transaction_type?.replace(/_/g, ' ') || '—', badge: 'bg-gray-100 text-gray-600', icon: Package }
                const positive  = isPositiveType(txn.transaction_type)
                const TypeIcon  = typeInfo.icon || Package
                const unit      = txn.inventory_items?.units?.abbreviation || ''
                const qtyStr    = txn.quantity != null ? `${positive ? '+' : '−'}${Math.abs(txn.quantity)}${unit ? ' ' + unit : ''}` : '—'

                return (
                  <tr key={txn.id} className={isDark ? 'hover:bg-gray-800/40' : 'hover:bg-gray-50/80'}>
                    {/* Date + time */}
                    <td className={`px-4 py-3 ${themeClasses.textSecondary}`}>
                      <p className="text-xs font-medium">{new Date(txn.created_at).toLocaleDateString('en-PK')}</p>
                      <p className="text-[10px] opacity-60">
                        {new Date(txn.created_at).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </td>

                    {/* Item */}
                    <td className="px-4 py-3">
                      <p className={`font-semibold text-sm ${themeClasses.textPrimary}`}>
                        {txn.inventory_items?.name || '—'}
                      </p>
                      {txn.inventory_items?.sku && (
                        <p className={`text-xs ${themeClasses.textSecondary}`}>{txn.inventory_items.sku}</p>
                      )}
                    </td>

                    {/* Type badge */}
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${typeInfo.badge}`}>
                        <TypeIcon className="w-3 h-3" />
                        {typeInfo.label}
                      </span>
                    </td>

                    {/* Qty change */}
                    <td className="px-4 py-3">
                      <span className={`font-bold text-sm ${positive ? 'text-green-500' : 'text-red-500'}`}>
                        {qtyStr}
                      </span>
                    </td>

                    {/* Before stock */}
                    <td className={`px-4 py-3 text-right text-sm ${themeClasses.textSecondary}`}>
                      {txn.before_stock != null ? txn.before_stock : '—'}
                    </td>

                    {/* After stock */}
                    <td className={`px-4 py-3 text-right text-sm font-medium ${themeClasses.textPrimary}`}>
                      {txn.after_stock != null ? txn.after_stock : '—'}
                    </td>

                    {/* Cost per unit */}
                    <td className={`px-4 py-3 text-right text-sm ${themeClasses.textSecondary}`}>
                      {txn.cost_per_unit != null ? `Rs. ${parseFloat(txn.cost_per_unit).toFixed(2)}` : '—'}
                    </td>

                    {/* Supplier */}
                    <td className={`px-4 py-3 text-xs ${themeClasses.textSecondary} max-w-[130px] truncate`}>
                      {txn.suppliers?.name || '—'}
                    </td>

                    {/* Notes */}
                    <td className={`px-4 py-3 text-xs ${themeClasses.textSecondary} max-w-[160px] truncate`} title={txn.notes || ''}>
                      {txn.notes || '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Footer: showing N of M */}
      {!loading && filtered.length > 0 && (
        <div className={`px-5 py-2 border-t text-xs flex-shrink-0 ${isDark ? 'border-gray-700 text-gray-500' : 'border-gray-100 text-gray-400'}`}>
          Showing {filtered.length} of {transactions.length} transactions
          {transactions.length >= PAGE_SIZE && (
            <span className="ml-2 text-indigo-400">(limited to last {PAGE_SIZE})</span>
          )}
        </div>
      )}
    </div>
  )
}
