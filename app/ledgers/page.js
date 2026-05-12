'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Search, Loader2, TrendingDown, TrendingUp } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

export default function LedgersPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [filteredEntries, setFilteredEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSupplier, setSelectedSupplier] = useState('all')
  const [selectedType, setSelectedType] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')

  // Theme
  const themeClasses = themeManager.getClasses()
  const componentStyles = themeManager.getComponentStyles()
  const isDark = themeManager.isDark()

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }
    const userData = authManager.getCurrentUser()
    setUser(userData)
    if (userData?.id) {
      loadData(userData.id)
    }
  }, [router])

  const loadData = async (userId) => {
    try {
      setLoading(true)

      // Load suppliers
      const { data: suppliersData } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', userId)
        .order('name')

      // Load ledger entries
      const { data: ledgerData } = await supabase
        .from('supplier_ledger')
        .select(`
          *,
          suppliers(id, name),
          purchase_orders(id, po_number),
          supplier_payments(id, amount_paid)
        `)
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })

      setSuppliers(suppliersData || [])
      setLedgerEntries(ledgerData || [])
      filterEntries(ledgerData || [], 'all', 'all', '')
    } catch (error) {
      console.error('Error loading ledger:', error)
      notify.error('Failed to load ledger data')
    } finally {
      setLoading(false)
    }
  }

  const filterEntries = (entries, supplier, type, search) => {
    let filtered = entries

    if (supplier !== 'all') {
      filtered = filtered.filter(e => e.supplier_id === supplier)
    }

    if (type !== 'all') {
      filtered = filtered.filter(e => e.transaction_type === type)
    }

    if (search.trim()) {
      filtered = filtered.filter(e =>
        e.description?.toLowerCase().includes(search.toLowerCase()) ||
        e.suppliers?.name?.toLowerCase().includes(search.toLowerCase())
      )
    }

    setFilteredEntries(filtered)
  }

  const handleFilterChange = (supplier, type) => {
    setSelectedSupplier(supplier)
    setSelectedType(type)
    filterEntries(ledgerEntries, supplier, type, searchTerm)
  }

  const handleSearch = (e) => {
    setSearchTerm(e.target.value)
    filterEntries(ledgerEntries, selectedSupplier, selectedType, e.target.value)
  }

  // Calculate supplier balances
  const supplierBalances = suppliers.map(supplier => {
    const supplierLedger = ledgerEntries.filter(e => e.supplier_id === supplier.id)
    const balance = supplierLedger.reduce((sum, entry) => {
      if (entry.transaction_type === 'debit') return sum + entry.amount
      if (entry.transaction_type === 'credit') return sum - entry.amount
      return sum
    }, supplier.opening_amount || 0)

    return { ...supplier, balance, transactions: supplierLedger.length }
  })

  if (!user) return <div className={`h-screen w-screen ${themeClasses.background}`} />

  const typeColors = {
    'debit': 'text-red-600 dark:text-red-400',
    'credit': 'text-green-600 dark:text-green-400',
    'purchase': 'text-red-600 dark:text-red-400',
    'payment': 'text-green-600 dark:text-green-400'
  }

  const typeBgColors = {
    'debit': 'bg-red-50 dark:bg-red-900/20',
    'credit': 'bg-green-50 dark:bg-green-900/20',
    'purchase': 'bg-red-50 dark:bg-red-900/20',
    'payment': 'bg-green-50 dark:bg-green-900/20'
  }

  return (
    <ProtectedPage permissionKey="SUPPLIER_LEDGER" pageName="Supplier Ledger">
      <NotificationSystem />
      <div className={`h-screen flex ${themeClasses.background} overflow-hidden text-sm`}>
        {/* LEFT PANEL */}
        <div className={`w-80 flex-shrink-0 flex flex-col h-full border-r ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 px-4 pt-4 pb-5 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Dashboard</span>
              </motion.button>
            </div>
            <h1 className="text-xl font-bold text-white">Supplier Ledger</h1>

            {/* Search */}
            <div className="relative mt-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={handleSearch}
                className="w-full pl-9 pr-3 py-2 text-sm bg-white/90 border-white/20 text-gray-800 rounded-lg focus:ring-1 focus:ring-white/30 border"
              />
            </div>
          </div>

          {/* Filters */}
          <div className={`px-3 py-2 space-y-2 border-b flex-shrink-0 ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
            <div>
              <label className={`block text-xs font-medium ${themeClasses.textSecondary} mb-1.5`}>Supplier</label>
              <select
                value={selectedSupplier}
                onChange={(e) => handleFilterChange(e.target.value, selectedType)}
                className={`w-full px-2 py-1 text-xs border ${themeClasses.border} rounded ${themeClasses.input}`}
              >
                <option value="all">All Suppliers</option>
                {suppliers.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className={`block text-xs font-medium ${themeClasses.textSecondary} mb-1.5`}>Type</label>
              <select
                value={selectedType}
                onChange={(e) => handleFilterChange(selectedSupplier, e.target.value)}
                className={`w-full px-2 py-1 text-xs border ${themeClasses.border} rounded ${themeClasses.input}`}
              >
                <option value="all">All Types</option>
                <option value="debit">Purchases (Debit)</option>
                <option value="credit">Payments (Credit)</option>
              </select>
            </div>
          </div>

          {/* Supplier Balances */}
          <div className={`px-3 py-2 border-b flex-shrink-0 ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
            <p className={`text-xs font-semibold ${themeClasses.textSecondary} mb-2`}>SUPPLIER BALANCES</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {supplierBalances.map(supplier => (
                <div
                  key={supplier.id}
                  className={`p-2 rounded text-xs ${
                    selectedSupplier === supplier.id
                      ? `${isDark ? 'bg-blue-900/50' : 'bg-blue-50'} border ${isDark ? 'border-blue-600' : 'border-blue-200'}`
                      : `${themeClasses.card} border ${themeClasses.border}`
                  }`}
                >
                  <p className={`font-semibold ${themeClasses.textPrimary}`}>{supplier.name}</p>
                  <p className={`text-lg font-bold ${supplier.balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                    Rs. {supplier.balance.toFixed(2)}
                  </p>
                  <p className={`text-xs ${themeClasses.textSecondary}`}>{supplier.transactions} transactions</p>
                </div>
              ))}
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <p className={`text-sm font-medium ${themeClasses.textSecondary}`}>No transactions found</p>
              </div>
            ) : (
              filteredEntries.map((entry) => {
                const supplier = suppliers.find(s => s.id === entry.supplier_id)
                const isDebit = entry.transaction_type === 'debit' || entry.transaction_type === 'purchase'
                return (
                  <motion.div
                    key={entry.id}
                    whileHover={{ x: 2 }}
                    className={`px-4 py-3 border-b transition-all ${
                      selectedSupplier === entry.supplier_id
                        ? isDark ? 'bg-blue-900/40 border-l-2 border-l-blue-500' : 'bg-blue-50 border-l-2 border-l-blue-400'
                        : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <p className={`font-semibold ${themeClasses.textPrimary} text-xs`}>{supplier?.name}</p>
                      <span className={`text-xs font-bold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        {isDebit ? '−' : '+'} Rs. {entry.amount.toFixed(2)}
                      </span>
                    </div>
                    <p className={`text-xs ${themeClasses.textSecondary}`}>
                      {entry.transaction_type.charAt(0).toUpperCase() + entry.transaction_type.slice(1)}
                    </p>
                    <p className={`text-xs ${themeClasses.textSecondary}`}>
                      {new Date(entry.transaction_date).toLocaleDateString('en-PK')}
                    </p>
                  </motion.div>
                )
              })
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              {(() => {
                const totalDebit = filteredEntries
                  .filter(e => e.transaction_type === 'debit' || e.transaction_type === 'purchase')
                  .reduce((sum, e) => sum + e.amount, 0)

                const totalCredit = filteredEntries
                  .filter(e => e.transaction_type === 'credit' || e.transaction_type === 'payment')
                  .reduce((sum, e) => sum + e.amount, 0)

                const netBalance = totalDebit - totalCredit

                return (
                  <>
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`${themeClasses.card} rounded-lg p-4 ${themeClasses.shadow} ${themeClasses.border} border`}
                    >
                      <p className={`text-xs font-medium ${themeClasses.textSecondary} mb-2`}>Total Purchases</p>
                      <p className="text-2xl font-bold text-red-600 dark:text-red-400">Rs. {totalDebit.toFixed(2)}</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className={`${themeClasses.card} rounded-lg p-4 ${themeClasses.shadow} ${themeClasses.border} border`}
                    >
                      <p className={`text-xs font-medium ${themeClasses.textSecondary} mb-2`}>Total Payments</p>
                      <p className="text-2xl font-bold text-green-600 dark:text-green-400">Rs. {totalCredit.toFixed(2)}</p>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className={`${themeClasses.card} rounded-lg p-4 ${themeClasses.shadow} ${themeClasses.border} border`}
                    >
                      <p className={`text-xs font-medium ${themeClasses.textSecondary} mb-2`}>Net Balance</p>
                      <p className={`text-2xl font-bold ${netBalance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                        Rs. {netBalance.toFixed(2)}
                      </p>
                    </motion.div>
                  </>
                )
              })()}
            </div>

            {/* Transactions Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className={`${themeClasses.card} rounded-lg overflow-hidden ${themeClasses.shadow} ${themeClasses.border} border`}
            >
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} border-b ${themeClasses.border}`}>
                      <th className={`px-4 py-3 text-left text-xs font-semibold ${themeClasses.textSecondary}`}>Date</th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold ${themeClasses.textSecondary}`}>Supplier</th>
                      <th className={`px-4 py-3 text-left text-xs font-semibold ${themeClasses.textSecondary}`}>Type</th>
                      <th className={`px-4 py-3 text-right text-xs font-semibold ${themeClasses.textSecondary}`}>Amount</th>
                      <th className={`px-4 py-3 text-right text-xs font-semibold ${themeClasses.textSecondary}`}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredEntries.map((entry, idx) => {
                      const supplier = suppliers.find(s => s.id === entry.supplier_id)
                      const isDebit = entry.transaction_type === 'debit' || entry.transaction_type === 'purchase'
                      const balance = filteredEntries.slice(0, idx + 1)
                        .filter(e => e.supplier_id === entry.supplier_id)
                        .reduce((sum, e) => {
                          if (e.transaction_type === 'debit' || e.transaction_type === 'purchase') return sum + e.amount
                          else return sum - e.amount
                        }, 0)

                      return (
                        <tr
                          key={entry.id}
                          className={`border-b ${themeClasses.border} ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'} transition-colors`}
                        >
                          <td className={`px-4 py-3 text-sm ${themeClasses.textPrimary}`}>
                            {new Date(entry.transaction_date).toLocaleDateString('en-PK')}
                          </td>
                          <td className={`px-4 py-3 text-sm ${themeClasses.textPrimary}`}>{supplier?.name}</td>
                          <td className={`px-4 py-3 text-sm`}>
                            <span className={`text-xs font-semibold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                              {entry.transaction_type === 'debit' || entry.transaction_type === 'purchase' ? '↓ Purchase' : '↑ Payment'}
                            </span>
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-semibold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            Rs. {entry.amount.toFixed(2)}
                          </td>
                          <td className={`px-4 py-3 text-sm text-right font-bold ${balance > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                            Rs. {balance.toFixed(2)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </div>
        </div>
      </div>
    </ProtectedPage>
  )
}
