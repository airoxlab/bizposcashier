'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Search, Loader2, TrendingDown, TrendingUp, CreditCard, BookOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import SupplierPaymentModal from '../../components/inventory/SupplierPaymentModal'
import themeManager from '../../lib/themeManager'

export default function LedgersPage() {
  const router = useRouter()
  const [user, setUser]                         = useState(null)
  const [suppliers, setSuppliers]               = useState([])
  const [ledgerEntries, setLedgerEntries]       = useState([])
  const [filteredEntries, setFilteredEntries]   = useState([])
  const [loading, setLoading]                   = useState(true)
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [selectedType, setSelectedType]         = useState('all')
  const [searchTerm, setSearchTerm]             = useState('')
  const [showPaymentModal, setShowPaymentModal] = useState(false)

  const themeClasses = themeManager.getClasses()
  const isDark       = themeManager.isDark()

  useEffect(() => {
    if (!authManager.isLoggedIn()) { router.push('/'); return }
    const userData = authManager.getCurrentUser()
    setUser(userData)
    if (userData?.id) loadData(userData.id)
  }, [router])

  const loadData = async (userId) => {
    try {
      setLoading(true)
      const [{ data: suppliersData }, { data: ledgerData }] = await Promise.all([
        supabase.from('suppliers').select('*').eq('user_id', userId).order('name'),
        supabase.from('supplier_ledger')
          .select('*, suppliers(id, name), purchase_orders(id, po_number), supplier_payments(id, amount_paid)')
          .eq('user_id', userId)
          .order('transaction_date', { ascending: false }),
      ])
      setSuppliers(suppliersData || [])
      setLedgerEntries(ledgerData || [])
      filterEntries(ledgerData || [], 'all', 'all', '')
    } catch (error) {
      notify.error('Failed to load ledger data')
    } finally {
      setLoading(false)
    }
  }

  const filterEntries = (entries, supplier, type, search) => {
    let filtered = entries
    if (supplier !== 'all') filtered = filtered.filter(e => e.supplier_id === supplier)
    if (type !== 'all') filtered = filtered.filter(e => e.transaction_type === type)
    if (search.trim()) {
      const q = search.toLowerCase()
      filtered = filtered.filter(e =>
        e.description?.toLowerCase().includes(q) ||
        e.suppliers?.name?.toLowerCase().includes(q)
      )
    }
    setFilteredEntries(filtered)
  }

  const handleSupplierClick = (id) => {
    setSelectedSupplier(id)
    filterEntries(ledgerEntries, id, selectedType, searchTerm)
  }

  const handleTypeChange = (type) => {
    setSelectedType(type)
    filterEntries(ledgerEntries, selectedSupplier, type, searchTerm)
  }

  const handleSearch = (e) => {
    setSearchTerm(e.target.value)
    filterEntries(ledgerEntries, selectedSupplier, selectedType, e.target.value)
  }

  // Per-supplier running balance
  const runningBalanceById = (() => {
    const map = {}
    const bySupplier = {}
    ledgerEntries.forEach(e => {
      ;(bySupplier[e.supplier_id] = bySupplier[e.supplier_id] || []).push(e)
    })
    Object.entries(bySupplier).forEach(([sid, entries]) => {
      const sorted = [...entries].sort((a, b) => {
        const d = new Date(a.transaction_date) - new Date(b.transaction_date)
        return d !== 0 ? d : new Date(a.created_at || 0) - new Date(b.created_at || 0)
      })
      const supplier = suppliers.find(s => s.id === sid)
      let bal = parseFloat(supplier?.opening_amount || 0)
      sorted.forEach(e => {
        const isDebit = e.transaction_type === 'debit' || e.transaction_type === 'purchase'
        bal += isDebit ? e.amount : -e.amount
        map[e.id] = bal
      })
    })
    return map
  })()

  // Per-supplier balance summary
  const supplierBalances = suppliers.map(supplier => {
    const supplierLedger = ledgerEntries.filter(e => e.supplier_id === supplier.id)
    const balance = supplierLedger.reduce((sum, entry) => {
      if (entry.transaction_type === 'debit' || entry.transaction_type === 'purchase') return sum + entry.amount
      return sum - entry.amount
    }, parseFloat(supplier.opening_amount || 0))
    return { ...supplier, balance, transactions: supplierLedger.length }
  })

  const activeSupplierObj = selectedSupplier !== 'all'
    ? supplierBalances.find(s => s.id === selectedSupplier) || null
    : null

  // Summary for right panel
  const totalDebit   = filteredEntries.filter(e => e.transaction_type === 'debit' || e.transaction_type === 'purchase').reduce((s, e) => s + e.amount, 0)
  const totalCredit  = filteredEntries.filter(e => e.transaction_type === 'credit' || e.transaction_type === 'payment').reduce((s, e) => s + e.amount, 0)
  const netBalance   = totalDebit - totalCredit

  if (!user) return <div className={`h-screen w-screen ${themeClasses.background}`} />

  return (
    <ProtectedPage permissionKey="SUPPLIER_LEDGER" pageName="Supplier Ledger">
      <NotificationSystem />
      <div className={`h-screen flex ${themeClasses.background} overflow-hidden text-sm`}>

        {/* ── LEFT PANEL ── */}
        <div className={`w-72 flex-shrink-0 flex flex-col h-full border-r ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>

          {/* Gradient header */}
          <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 px-4 pt-4 pb-4 flex-shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <motion.button
                whileHover={{ x: -2 }} whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Dashboard</span>
              </motion.button>
            </div>
            <h1 className="text-xl font-bold text-white mb-3">Supplier Ledger</h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
              <input
                type="text" placeholder="Search..."
                value={searchTerm} onChange={handleSearch}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white/90 text-gray-800 rounded-lg border border-white/20 focus:ring-1 focus:ring-white/30 focus:outline-none"
              />
            </div>
          </div>

          {/* Type filter pills */}
          <div className={`flex gap-1.5 px-3 py-2.5 flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
            {[
              { key: 'all',      label: 'All' },
              { key: 'purchase', label: 'Purchases' },
              { key: 'credit',   label: 'Payments' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => handleTypeChange(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                  selectedType === key
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : isDark
                      ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                      : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Supplier list — acts as filter */}
          <div className="flex-1 overflow-y-auto">
            {/* All Suppliers row */}
            <motion.button
              whileHover={{ x: 2 }}
              onClick={() => handleSupplierClick('all')}
              className={`w-full px-4 py-3 text-left border-b transition-all ${
                selectedSupplier === 'all'
                  ? isDark ? 'bg-indigo-900/40 border-l-2 border-l-indigo-500' : 'bg-indigo-50 border-l-2 border-l-indigo-500'
                  : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
              }`}
            >
              <p className={`font-semibold ${themeClasses.textPrimary}`}>All Suppliers</p>
              <p className={`text-xs ${themeClasses.textSecondary}`}>{suppliers.length} suppliers</p>
            </motion.button>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : supplierBalances.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${themeClasses.textSecondary}`}>
                <BookOpen className="w-8 h-8 mb-2 opacity-30" />
                <p className="text-xs">No suppliers yet</p>
              </div>
            ) : (
              supplierBalances.map(supplier => (
                <motion.button
                  key={supplier.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleSupplierClick(supplier.id)}
                  className={`w-full px-4 py-3 text-left border-b transition-all ${
                    selectedSupplier === supplier.id
                      ? isDark ? 'bg-indigo-900/40 border-l-2 border-l-indigo-500' : 'bg-indigo-50 border-l-2 border-l-indigo-500'
                      : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <p className={`font-semibold text-xs ${themeClasses.textPrimary}`}>{supplier.name}</p>
                    <span className={`text-xs font-bold ${supplier.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                      Rs.&nbsp;{supplier.balance.toFixed(0)}
                    </span>
                  </div>
                  <p className={`text-[10px] mt-0.5 ${themeClasses.textSecondary}`}>{supplier.transactions} transactions</p>
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="flex-1 overflow-y-auto p-5">

          {/* Header row */}
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className={`text-base font-bold ${themeClasses.textPrimary}`}>
                {activeSupplierObj ? activeSupplierObj.name : 'All Suppliers'}
              </h2>
              {activeSupplierObj && (
                <p className={`text-xs mt-0.5 ${themeClasses.textSecondary}`}>
                  Balance:&nbsp;
                  <span className={`font-bold ${activeSupplierObj.balance > 0 ? 'text-red-500' : 'text-green-500'}`}>
                    Rs. {activeSupplierObj.balance.toFixed(2)}
                  </span>
                </p>
              )}
            </div>
            {activeSupplierObj && (
              <motion.button
                whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                onClick={() => setShowPaymentModal(true)}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
              >
                <CreditCard className="w-4 h-4" /> Record Payment
              </motion.button>
            )}
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[
              { label: 'Total Purchases', value: totalDebit,  cls: 'text-red-600 dark:text-red-400',   Icon: TrendingDown },
              { label: 'Total Payments',  value: totalCredit, cls: 'text-green-600 dark:text-green-400', Icon: TrendingUp   },
              { label: 'Net Balance',     value: netBalance,  cls: netBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400', Icon: CreditCard },
            ].map(({ label, value, cls, Icon }) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className={`${themeClasses.card} rounded-xl p-4 ${themeClasses.shadow} border ${themeClasses.border} flex items-center gap-3`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                  <Icon className={`w-4.5 h-4.5 ${cls}`} />
                </div>
                <div>
                  <p className={`text-xs font-medium ${themeClasses.textSecondary}`}>{label}</p>
                  <p className={`text-lg font-bold ${cls}`}>Rs.&nbsp;{value.toFixed(0)}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Transaction table */}
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className={`${themeClasses.card} rounded-xl overflow-hidden border ${themeClasses.border}`}
          >
            {filteredEntries.length === 0 ? (
              <div className={`flex flex-col items-center justify-center py-16 ${themeClasses.textSecondary}`}>
                <BookOpen className="w-10 h-10 mb-3 opacity-25" />
                <p className="text-sm font-medium">No transactions found</p>
                <p className="text-xs mt-1 opacity-70">Try a different filter or supplier</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`border-b ${themeClasses.border} ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                      {['Date', 'Supplier', 'Description', 'Type', 'Amount', 'Balance'].map(h => (
                        <th key={h} className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${isDark ? 'divide-gray-700/60' : 'divide-gray-100'}`}>
                    {filteredEntries.map((entry) => {
                      const supplier = suppliers.find(s => s.id === entry.supplier_id)
                      const isDebit  = entry.transaction_type === 'debit' || entry.transaction_type === 'purchase'
                      const balance  = runningBalanceById[entry.id] ?? 0
                      return (
                        <tr key={entry.id} className={`transition-colors ${isDark ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'}`}>
                          <td className={`px-4 py-3 text-xs ${themeClasses.textSecondary} whitespace-nowrap`}>
                            {new Date(entry.transaction_date).toLocaleDateString('en-PK')}
                          </td>
                          <td className={`px-4 py-3 text-sm font-medium ${themeClasses.textPrimary}`}>{supplier?.name}</td>
                          <td className={`px-4 py-3 text-xs ${themeClasses.textSecondary} max-w-[200px] truncate`}>
                            {entry.description || entry.purchase_orders?.po_number || '—'}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                              isDebit
                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                            }`}>
                              {isDebit ? '↓ Purchase' : '↑ Payment'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            {isDebit ? '−' : '+'} Rs.&nbsp;{entry.amount.toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            Rs.&nbsp;{balance.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </motion.div>
        </div>
      </div>

      {/* Payment modal */}
      {activeSupplierObj && (
        <SupplierPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          supplier={activeSupplierObj}
          onPaymentRecorded={() => { if (user?.id) loadData(user.id) }}
        />
      )}
    </ProtectedPage>
  )
}
