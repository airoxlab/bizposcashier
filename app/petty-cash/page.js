'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  Plus,
  TrendingDown,
  Calendar,
  ArrowLeft,
  Receipt,
  CheckCircle,
  Clock,
  XCircle,
  Upload,
  X,
  AlertCircle,
  Tag,
  FileText,
  Filter,
  RefreshCw
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { authManager } from '../../lib/authManager'
import pettyCashManager from '../../lib/pettyCashManager'
import { supabase } from '../../lib/supabase'
import ProtectedPage from '../../components/ProtectedPage'
import themeManager from '../../lib/themeManager'
import { notify } from '../../components/ui/NotificationSystem'

function PettyCashPageContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [account, setAccount] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [replenishments, setReplenishments] = useState([])
  const [reconciliations, setReconciliations] = useState([])
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [showExpenseForm, setShowExpenseForm] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [showSubcategoryModal, setShowSubcategoryModal] = useState(false)
  const [showReplenishmentModal, setShowReplenishmentModal] = useState(false)
  const [showReconciliationModal, setShowReconciliationModal] = useState(false)
  const [dateFilter, setDateFilter] = useState('today')
  const [activeTab, setActiveTab] = useState('transactions')

  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    categoryId: '',
    subcategoryId: '',
    description: '',
    paymentMethod: 'Cash',
    taxRate: 0,
    receiptImage: null,
    notes: ''
  })

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: ''
  })

  const [subcategoryForm, setSubcategoryForm] = useState({
    name: '',
    description: ''
  })

  const [replenishmentForm, setReplenishmentForm] = useState({
    amount: '',
    justification: ''
  })

  const [reconciliationForm, setReconciliationForm] = useState({
    actualBalance: '',
    varianceReason: ''
  })

  // Theme management
  const themeClasses = themeManager.getClasses()
  const componentStyles = themeManager.getComponentStyles()
  const isDark = themeManager.isDark()

  useEffect(() => {
    const userData = authManager.getCurrentUser()
    if (!userData) {
      router.push('/')
      return
    }

    // Clear previous data when user changes
    setAccount(null)
    setTransactions([])
    setCategories([])
    setSubcategories([])

    setUser(userData)
    fetchData()
    fetchCategories()
  }, [])

  useEffect(() => {
    if (account) {
      fetchTransactions()
      fetchReplenishments()
      fetchReconciliations()
    }
  }, [account, dateFilter])

  const fetchData = async () => {
    setLoading(true)
    try {
      // Clear old account data first to prevent showing stale data
      setAccount(null)

      const accountData = await pettyCashManager.getMyAccount()
      console.log('Account data:', accountData)

      if (accountData) {
        setAccount(accountData)
      }
    } catch (error) {
      console.error('Error fetching account:', error)
      notify.error('Failed to load petty cash account')
    } finally {
      setLoading(false)
    }
  }

  const fetchCategories = async () => {
    try {
      const { data: cats, error: catError } = await supabase
        .from('petty_cash_categories')
        .select('*')
        .eq('user_id', authManager.getCurrentUser()?.id)
        .eq('is_active', true)
        .order('name')

      if (catError) throw catError
      setCategories(cats || [])

      const { data: subs, error: subError } = await supabase
        .from('petty_cash_subcategories')
        .select('*')
        .eq('user_id', authManager.getCurrentUser()?.id)
        .eq('is_active', true)
        .order('name')

      if (subError) throw subError
      setSubcategories(subs || [])
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchTransactions = async () => {
    try {
      if (!account) return

      const filters = {
        accountId: account.id
      }

      // Apply date filter
      const today = new Date()
      if (dateFilter === 'today') {
        filters.dateFrom = today.toISOString().split('T')[0]
        filters.dateTo = today.toISOString().split('T')[0]
      } else if (dateFilter === 'week') {
        const weekAgo = new Date(today)
        weekAgo.setDate(weekAgo.getDate() - 7)
        filters.dateFrom = weekAgo.toISOString().split('T')[0]
        filters.dateTo = today.toISOString().split('T')[0]
      } else if (dateFilter === 'month') {
        const monthAgo = new Date(today)
        monthAgo.setMonth(monthAgo.getMonth() - 1)
        filters.dateFrom = monthAgo.toISOString().split('T')[0]
        filters.dateTo = today.toISOString().split('T')[0]
      }

      const txns = await pettyCashManager.getTransactions(filters)
      setTransactions(txns)
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchReplenishments = async () => {
    try {
      if (!account) return

      const { data, error } = await supabase
        .from('petty_cash_replenishments')
        .select('*')
        .eq('petty_cash_account_id', account.id)
        .order('request_date', { ascending: false })
        .order('request_time', { ascending: false })
        .limit(10)

      if (error) throw error
      setReplenishments(data || [])
    } catch (error) {
      console.error('Error fetching replenishments:', error)
    }
  }

  const fetchReconciliations = async () => {
    try {
      if (!account) return

      // Add timestamp to bust cache
      const { data, error } = await supabase
        .from('petty_cash_reconciliations')
        .select('*')
        .eq('petty_cash_account_id', account.id)
        .order('reconciliation_date', { ascending: false })
        .order('reconciliation_time', { ascending: false })
        .limit(10)

      if (error) throw error

      console.log('Fetched reconciliations:', data) // Debug log
      setReconciliations(data || [])
    } catch (error) {
      console.error('Error fetching reconciliations:', error)
    }
  }

  const handleCreateCategory = async (e) => {
    e.preventDefault()
    try {
      const currentUser = authManager.getCurrentUser()
      if (!categoryForm.name) {
        notify.warning('Category name is required')
        return
      }

      const { data, error } = await supabase
        .from('petty_cash_categories')
        .insert({
          user_id: currentUser.id,
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null
        })
        .select()

      if (error) throw error

      notify.success('Category created successfully')
      setShowCategoryModal(false)
      setCategoryForm({ name: '', description: '' })
      fetchCategories()
    } catch (error) {
      console.error('Error:', error)
      notify.error(error.message || 'Failed to create category')
    }
  }

  const handleCreateSubcategory = async (e) => {
    e.preventDefault()
    try {
      const currentUser = authManager.getCurrentUser()
      if (!subcategoryForm.name) {
        notify.warning('Subcategory name is required')
        return
      }

      if (!expenseForm.categoryId) {
        notify.warning('Please select a category first')
        return
      }

      const { data, error } = await supabase
        .from('petty_cash_subcategories')
        .insert({
          user_id: currentUser.id,
          category_id: expenseForm.categoryId,
          name: subcategoryForm.name.trim(),
          description: subcategoryForm.description.trim() || null
        })
        .select()

      if (error) throw error

      notify.success('Subcategory created successfully')
      setShowSubcategoryModal(false)
      setSubcategoryForm({ name: '', description: '' })
      fetchCategories()
    } catch (error) {
      console.error('Error:', error)
      notify.error(error.message || 'Failed to create subcategory')
    }
  }

  const handleExpenseSubmit = async (e) => {
    e.preventDefault()
    try {
      if (!expenseForm.amount || !expenseForm.categoryId || !expenseForm.description) {
        notify.warning('Please fill in all required fields')
        return
      }

      await pettyCashManager.recordExpense({
        pettyCashAccountId: account.id,
        amount: parseFloat(expenseForm.amount),
        categoryId: expenseForm.categoryId,
        subcategoryId: expenseForm.subcategoryId || null,
        description: expenseForm.description,
        paymentMethod: expenseForm.paymentMethod,
        taxRate: expenseForm.taxRate,
        notes: expenseForm.notes
      })

      notify.success('Expense recorded successfully')
      setShowExpenseForm(false)
      setExpenseForm({
        amount: '',
        categoryId: '',
        subcategoryId: '',
        description: '',
        paymentMethod: 'Cash',
        taxRate: 0,
        receiptImage: null,
        notes: ''
      })
      fetchData()
      fetchTransactions()
    } catch (error) {
      console.error('Error:', error)
      notify.error(error.message || 'Failed to record expense')
    }
  }

  const handleReplenishmentSubmit = async (e) => {
    e.preventDefault()
    try {
      const currentUser = authManager.getCurrentUser()
      if (!replenishmentForm.amount || parseFloat(replenishmentForm.amount) <= 0) {
        notify.warning('Please enter a valid amount')
        return
      }

      if (!replenishmentForm.justification) {
        notify.warning('Please provide a justification')
        return
      }

      // Create replenishment request (this would go to admin for approval)
      const { data, error } = await supabase
        .from('petty_cash_replenishments')
        .insert({
          petty_cash_account_id: account.id,
          user_id: currentUser.id,
          requested_amount: parseFloat(replenishmentForm.amount),
          current_balance: account.current_balance,
          justification: replenishmentForm.justification,
          status: 'pending',
          requested_by: currentUser.id
        })

      if (error) throw error

      notify.success('Replenishment request submitted successfully')
      setShowReplenishmentModal(false)
      setReplenishmentForm({ amount: '', justification: '' })
      fetchReplenishments()
    } catch (error) {
      console.error('Error:', error)
      notify.error(error.message || 'Failed to submit replenishment request')
    }
  }

  const handleReconciliationSubmit = async (e) => {
    e.preventDefault()
    try {
      const currentUser = authManager.getCurrentUser()
      if (!reconciliationForm.actualBalance || parseFloat(reconciliationForm.actualBalance) < 0) {
        notify.warning('Please enter the actual balance counted')
        return
      }

      const actualBalance = parseFloat(reconciliationForm.actualBalance)
      const expectedBalance = account.current_balance
      const variance = actualBalance - expectedBalance

      if (variance !== 0 && !reconciliationForm.varianceReason) {
        notify.warning('Please explain the variance')
        return
      }

      // Create reconciliation record
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('petty_cash_reconciliations')
        .insert({
          petty_cash_account_id: account.id,
          user_id: currentUser.id,
          reconciliation_date: today,
          period_start_date: today,
          period_end_date: today,
          opening_balance: account.opening_balance,
          expected_balance: expectedBalance,
          actual_balance: actualBalance,
          variance: variance,
          variance_reason: reconciliationForm.varianceReason || null,
          status: variance === 0 ? 'completed' : 'pending',
          reconciled_by: currentUser.id
        })

      if (error) throw error

      // If there's a shortage/surplus, create an adjustment transaction
      if (variance !== 0 && data) {
        await pettyCashManager.createTransaction({
          pettyCashAccountId: account.id,
          transactionType: 'reconciliation',
          amount: Math.abs(variance),
          description: variance > 0
            ? `Reconciliation - Surplus: Rs. ${variance.toFixed(2)}`
            : `Reconciliation - Shortage: Rs. ${Math.abs(variance).toFixed(2)}`,
          notes: reconciliationForm.varianceReason,
          requiresApproval: true,
          approvalStatus: 'pending',
          reconciliationId: data.id  // Link transaction to reconciliation
        })
      }

      notify.success(variance === 0
        ? 'Reconciliation completed successfully'
        : 'Reconciliation submitted for approval (variance detected)')

      setShowReconciliationModal(false)
      setReconciliationForm({ actualBalance: '', varianceReason: '' })
      fetchData()
      fetchReconciliations()
      fetchTransactions()
    } catch (error) {
      console.error('Error:', error)
      notify.error(error.message || 'Failed to complete reconciliation')
    }
  }

  const getTodayStats = () => {
    const todayTransactions = transactions.filter(t => {
      const tDate = new Date(t.transaction_date).toDateString()
      return tDate === new Date().toDateString() && t.transaction_type === 'expense'
    })

    const totalSpent = todayTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0)
    const transactionCount = todayTransactions.length
    const pendingApprovals = todayTransactions.filter(t => t.requires_approval && t.approval_status === 'pending').length

    return { totalSpent, transactionCount, pendingApprovals }
  }

  if (loading) {
    const classes = themeManager.getClasses()
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${classes.background}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
          <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading...</p>
        </div>
      </div>
    )
  }

  if (!account) {
    return (
      <div className={componentStyles.page}>
        <div className="flex items-center justify-center min-h-screen p-6">
          <div className="w-full max-w-md">
            <motion.button
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/dashboard')}
              className={`flex items-center ${themeClasses.textSecondary} ${themeClasses.hover} transition-colors mb-8`}
            >
              <ArrowLeft className="w-5 h-5 mr-2" />
              Back to Dashboard
            </motion.button>

            <div className={`${themeClasses.card} rounded-xl ${themeClasses.border} border-2 border-dashed p-12 text-center`}>
              <Wallet className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h3 className={`text-xl font-semibold ${themeClasses.text} mb-2`}>No Petty Cash Account</h3>
              <p className={themeClasses.textSecondary}>
                You don't have a petty cash account assigned. Please contact your administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const todayStats = getTodayStats()

  return (
    <div className={`h-screen flex flex-col ${componentStyles.page} overflow-hidden text-sm`}>
      {/* Main Content - Two Panel Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Balance & Stats */}
        <div className={`w-80 ${themeClasses.card} backdrop-blur-xl ${themeClasses.shadow} ${themeClasses.border} border-r flex flex-col`}>
        {/* Header */}
        <div className="p-3 border-b border-gray-200/50 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600">
          <div className="flex items-center justify-between mb-3">
            <motion.button
              whileHover={{ x: -3, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-white/90 hover:text-white transition-all"
            >
              <div className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center mr-2 transition-all">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-sm font-semibold">Dashboard</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowExpenseForm(true)}
              className="px-2 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all flex items-center text-white"
            >
              <Plus className="w-4 h-4 mr-1" />
              <span className="text-xs font-medium">Expense</span>
            </motion.button>
          </div>

          <div className="mb-3">
            <h1 className="text-xl font-bold text-white mb-0.5">Petty Cash</h1>
            <p className="text-purple-100 text-xs">{account.account_name}</p>
          </div>

          {/* Balance Display */}
          <div className="bg-white/10 backdrop-blur-lg rounded-lg p-3 border border-white/20">
            <p className="text-purple-100 text-[10px] mb-0.5">Current Balance</p>
            <h2 className="text-2xl font-bold text-white mb-1">
              Rs. {parseFloat(account.current_balance || 0).toLocaleString()}
            </h2>
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-purple-200">
                Allocated: Rs. {parseFloat(account.opening_balance || 0).toLocaleString()}
              </span>
              <span className="text-purple-200">
                Spent: Rs. {parseFloat(account.total_spent || 0).toLocaleString()}
              </span>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-1.5 mt-2">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowReplenishmentModal(true)}
              className="bg-green-500/20 hover:bg-green-500/30 text-white px-2 py-1.5 rounded-md transition-all flex items-center justify-center border border-green-400/30"
            >
              <TrendingDown className="w-3 h-3 mr-1 rotate-180" />
              <span className="text-[10px] font-medium">Request</span>
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowReconciliationModal(true)}
              className="bg-blue-500/20 hover:bg-blue-500/30 text-white px-2 py-1.5 rounded-md transition-all flex items-center justify-center border border-blue-400/30"
            >
              <CheckCircle className="w-3 h-3 mr-1" />
              <span className="text-[10px] font-medium">Reconcile</span>
            </motion.button>
          </div>
        </div>

        {/* Today's Stats */}
        <div className={`p-2 ${isDark ? 'bg-gray-700/80' : 'bg-gray-50/80'} ${themeClasses.border} border-b`}>
          <h3 className={`text-[10px] font-semibold ${themeClasses.textSecondary} uppercase mb-2`}>Today's Activity</h3>
          <div className="grid grid-cols-3 gap-1.5">
            <div className={`${themeClasses.card} rounded-md p-2 ${themeClasses.border}`}>
              <TrendingDown className="w-3 h-3 text-red-500 mb-1" />
              <p className="text-[9px] text-gray-500">Spent</p>
              <p className={`text-xs font-bold ${themeClasses.text}`}>Rs. {todayStats.totalSpent.toLocaleString()}</p>
            </div>
            <div className={`${themeClasses.card} rounded-md p-2 ${themeClasses.border}`}>
              <Receipt className="w-3 h-3 text-blue-500 mb-1" />
              <p className="text-[9px] text-gray-500">Count</p>
              <p className={`text-xs font-bold ${themeClasses.text}`}>{todayStats.transactionCount}</p>
            </div>
            <div className={`${themeClasses.card} rounded-md p-2 ${themeClasses.border}`}>
              <Clock className="w-3 h-3 text-yellow-500 mb-1" />
              <p className="text-[9px] text-gray-500">Pending</p>
              <p className={`text-xs font-bold ${themeClasses.text}`}>{todayStats.pendingApprovals}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Expense Form or Details */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <AnimatePresence mode="wait">
          {showExpenseForm ? (
            <motion.div
              key="expense-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className={`flex-1 flex flex-col ${componentStyles.page}`}
            >
              {/* Form Header */}
              <div className="p-4 border-b border-gray-200/50 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-white">Record Expense</h2>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => setShowExpenseForm(false)}
                    className="text-white hover:bg-white/20 rounded-lg p-1.5 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>

              {/* Form Body */}
              <div className="flex-1 overflow-y-auto p-4">
                <form onSubmit={handleExpenseSubmit} className="space-y-4 max-w-2xl">
                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                      Amount (Rs) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={expenseForm.amount}
                      onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                      className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-lg font-semibold`}
                      placeholder="0.00"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className={`block text-sm font-semibold ${themeClasses.text}`}>
                          Category <span className="text-red-500">*</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowCategoryModal(true)}
                          className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" />
                          Add New
                        </button>
                      </div>
                      <select
                        value={expenseForm.categoryId}
                        onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value, subcategoryId: '' })}
                        className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                        required
                      >
                        <option value="">Select category</option>
                        {categories.map((cat) => (
                          <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className={`block text-sm font-semibold ${themeClasses.text}`}>
                          Subcategory
                        </label>
                        {expenseForm.categoryId && (
                          <button
                            type="button"
                            onClick={() => setShowSubcategoryModal(true)}
                            className="text-xs text-purple-600 hover:text-purple-700 font-medium flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" />
                            Add New
                          </button>
                        )}
                      </div>
                      <select
                        value={expenseForm.subcategoryId}
                        onChange={(e) => setExpenseForm({ ...expenseForm, subcategoryId: e.target.value })}
                        className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                        disabled={!expenseForm.categoryId}
                      >
                        <option value="">None</option>
                        {subcategories.filter(s => s.category_id === expenseForm.categoryId).map((sub) => (
                          <option key={sub.id} value={sub.id}>{sub.name}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                      Description <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={expenseForm.description}
                      onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                      className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                      placeholder="What was this expense for?"
                      required
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                      Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={expenseForm.taxRate}
                      onChange={(e) => setExpenseForm({ ...expenseForm, taxRate: parseFloat(e.target.value) || 0 })}
                      className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                      placeholder="0"
                    />
                  </div>

                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                      Notes
                    </label>
                    <textarea
                      value={expenseForm.notes}
                      onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })}
                      rows={3}
                      className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
                      placeholder="Additional notes (optional)"
                    />
                  </div>

                  <div className="flex gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowExpenseForm(false)}
                      className={`flex-1 py-3 ${themeClasses.card} border-2 ${themeClasses.border} ${themeClasses.text} rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
                    >
                      Record Expense
                    </button>
                  </div>
                </form>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className={`flex-1 overflow-y-auto ${componentStyles.page} p-4`}
            >
              {/* Tabs */}
              <div className={`${themeClasses.card} rounded-xl ${themeClasses.border} ${themeClasses.shadow} overflow-hidden`}>
                {/* Tab Headers */}
                <div className="flex border-b border-gray-200">
                  <button
                    onClick={() => setActiveTab('transactions')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                      activeTab === 'transactions'
                        ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                        : `${themeClasses.text} hover:bg-gray-50 dark:hover:bg-gray-700`
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <FileText className="w-4 h-4" />
                      <span>Transactions</span>
                      {transactions.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          activeTab === 'transactions' ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          {transactions.length}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('replenishments')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                      activeTab === 'replenishments'
                        ? 'bg-gradient-to-r from-green-600 to-emerald-600 text-white'
                        : `${themeClasses.text} hover:bg-gray-50 dark:hover:bg-gray-700`
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <TrendingDown className="w-4 h-4 rotate-180" />
                      <span>Replenishments</span>
                      {replenishments.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          activeTab === 'replenishments' ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          {replenishments.length}
                        </span>
                      )}
                    </div>
                  </button>

                  <button
                    onClick={() => setActiveTab('reconciliations')}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-all ${
                      activeTab === 'reconciliations'
                        ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white'
                        : `${themeClasses.text} hover:bg-gray-50 dark:hover:bg-gray-700`
                    }`}
                  >
                    <div className="flex items-center justify-center gap-2">
                      <CheckCircle className="w-4 h-4" />
                      <span>Reconciliations</span>
                      {reconciliations.length > 0 && (
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          activeTab === 'reconciliations' ? 'bg-white/20' : 'bg-gray-200'
                        }`}>
                          {reconciliations.length}
                        </span>
                      )}
                    </div>
                  </button>
                </div>

                {/* Tab Content */}
                <div className="p-4">
                  {/* Transactions Tab */}
                  {activeTab === 'transactions' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex gap-2">
                          {['today', 'week', 'month', 'all'].map((filter) => (
                            <button
                              key={filter}
                              onClick={() => setDateFilter(filter)}
                              className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-all ${
                                dateFilter === filter
                                  ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white shadow-md'
                                  : `${themeClasses.card} ${themeClasses.text} hover:bg-gray-100 dark:hover:bg-gray-700`
                              }`}
                            >
                              {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </button>
                          ))}
                        </div>
                        <button
                          onClick={() => {
                            fetchData()
                            fetchTransactions()
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                          title="Refresh"
                        >
                          <RefreshCw className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>

                      {transactions.length > 0 ? (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {transactions.map((transaction) => (
                            <div
                              key={transaction.id}
                              className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-3 border ${themeClasses.border} hover:shadow-md transition-shadow`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className={`font-semibold ${themeClasses.text} text-sm`}>{transaction.description}</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(transaction.transaction_date).toLocaleDateString()}
                                  </p>
                                  {transaction.category && (
                                    <div className="flex items-center text-xs text-gray-500 mt-1">
                                      <Tag className="w-3 h-3 mr-1" />
                                      {transaction.category.name}
                                    </div>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold ${transaction.transaction_type === 'expense' ? 'text-red-600' : 'text-green-600'}`}>
                                    {transaction.transaction_type === 'expense' ? '-' : '+'}Rs. {parseFloat(transaction.amount).toLocaleString()}
                                  </p>
                                  {transaction.requires_approval && (
                                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${
                                      transaction.approval_status === 'approved' ? 'bg-green-100 text-green-800' :
                                      transaction.approval_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                      'bg-yellow-100 text-yellow-800'
                                    }`}>
                                      {transaction.approval_status || 'Pending'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <FileText className="w-16 h-16 text-gray-300 mx-auto mb-3 opacity-50" />
                          <p className="text-gray-500">No transactions yet</p>
                          <p className="text-gray-400 text-sm mt-2">Click "Expense" to record your first transaction</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Replenishments Tab */}
                  {activeTab === 'replenishments' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex flex-wrap gap-2">
                          {replenishments.filter(r => r.status === 'pending').length > 0 && (
                            <span className="bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 text-xs font-medium text-yellow-900">
                              {replenishments.filter(r => r.status === 'pending').length} Pending
                            </span>
                          )}
                          {replenishments.filter(r => r.status === 'completed').length > 0 && (
                            <span className="bg-green-50 border border-green-200 rounded-lg px-2 py-1 text-xs font-medium text-green-900">
                              {replenishments.filter(r => r.status === 'completed').length} Completed
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            fetchData()
                            fetchReplenishments()
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                          title="Refresh"
                        >
                          <RefreshCw className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>

                      {replenishments.length > 0 ? (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {replenishments.map((req) => (
                            <div
                              key={req.id}
                              className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-3 border ${themeClasses.border}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">Replenishment Request</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(req.request_date).toLocaleDateString()}
                                  </p>
                                  <p className="text-xs text-gray-600 mt-1">{req.justification}</p>
                                </div>
                                <div className="text-right">
                                  <p className="font-bold text-green-600">Rs. {parseFloat(req.requested_amount).toLocaleString()}</p>
                                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${
                                    req.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    req.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {req.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <TrendingDown className="w-16 h-16 text-gray-300 mx-auto mb-3 opacity-50 rotate-180" />
                          <p className="text-gray-500">No replenishment requests</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reconciliations Tab */}
                  {activeTab === 'reconciliations' && (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex flex-wrap gap-2">
                          {reconciliations.filter(r => r.status === 'pending').length > 0 && (
                            <span className="bg-yellow-50 border border-yellow-200 rounded-lg px-2 py-1 text-xs font-medium text-yellow-900">
                              {reconciliations.filter(r => r.status === 'pending').length} Pending
                            </span>
                          )}
                          {reconciliations.filter(r => r.status === 'completed').length > 0 && (
                            <span className="bg-green-50 border border-green-200 rounded-lg px-2 py-1 text-xs font-medium text-green-900">
                              {reconciliations.filter(r => r.status === 'completed').length} Completed
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            fetchData()
                            fetchReconciliations()
                          }}
                          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-all"
                          title="Refresh"
                        >
                          <RefreshCw className="w-4 h-4 text-gray-600" />
                        </button>
                      </div>

                      {reconciliations.length > 0 ? (
                        <div className="space-y-2 max-h-[500px] overflow-y-auto">
                          {reconciliations.map((rec) => (
                            <div
                              key={rec.id}
                              className={`${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} rounded-lg p-3 border ${themeClasses.border}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <p className="font-semibold text-sm">Daily Reconciliation</p>
                                  <p className="text-xs text-gray-500 mt-1">
                                    {new Date(rec.reconciliation_date).toLocaleDateString()}
                                  </p>
                                  {rec.variance_reason && (
                                    <p className="text-xs text-gray-600 mt-1">{rec.variance_reason}</p>
                                  )}
                                </div>
                                <div className="text-right">
                                  <p className={`font-bold ${rec.variance === 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    Var: Rs. {parseFloat(rec.variance).toLocaleString()}
                                  </p>
                                  <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs ${
                                    rec.status === 'completed' ? 'bg-green-100 text-green-800' :
                                    rec.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                                    'bg-red-100 text-red-800'
                                  }`}>
                                    {rec.status}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-12">
                          <CheckCircle className="w-16 h-16 text-gray-300 mx-auto mb-3 opacity-50" />
                          <p className="text-gray-500">No reconciliation records</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>

      {/* Category Modal */}
      <AnimatePresence>
        {showCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowCategoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`${themeClasses.card} rounded-2xl p-6 max-w-md w-full ${themeClasses.shadow} border-2 ${themeClasses.border}`}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${themeClasses.text}`}>Create Category</h3>
                <button
                  onClick={() => setShowCategoryModal(false)}
                  className={`${themeClasses.textSecondary} hover:${themeClasses.text}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCategory} className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                    Category Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={categoryForm.name}
                    onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                    placeholder="e.g., Office Supplies"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    rows={3}
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
                    placeholder="Brief description of this category"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className={`flex-1 py-3 ${themeClasses.card} border-2 ${themeClasses.border} ${themeClasses.text} rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
                  >
                    Create Category
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

        {/* Subcategory Modal */}
        {showSubcategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowSubcategoryModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className={`${themeClasses.card} rounded-2xl p-6 max-w-md w-full ${themeClasses.shadow} border-2 ${themeClasses.border}`}
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className={`text-xl font-bold ${themeClasses.text}`}>Create Subcategory</h3>
                <button
                  onClick={() => setShowSubcategoryModal(false)}
                  className={`${themeClasses.textSecondary} hover:${themeClasses.text}`}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateSubcategory} className="space-y-4">
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                    Subcategory Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={subcategoryForm.name}
                    onChange={(e) => setSubcategoryForm({ ...subcategoryForm, name: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                    placeholder="e.g., Ice Bags"
                    required
                    autoFocus
                  />
                </div>

                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                    Description (Optional)
                  </label>
                  <textarea
                    value={subcategoryForm.description}
                    onChange={(e) => setSubcategoryForm({ ...subcategoryForm, description: e.target.value })}
                    rows={3}
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
                    placeholder="Brief description of this subcategory"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowSubcategoryModal(false)}
                    className={`flex-1 py-3 ${themeClasses.card} border-2 ${themeClasses.border} ${themeClasses.text} rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl font-semibold hover:from-purple-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
                  >
                    Create Subcategory
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}

      {/* Replenishment Request Modal */}
      {showReplenishmentModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowReplenishmentModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`${themeClasses.card} rounded-2xl p-6 max-w-md w-full ${themeClasses.shadow} border-2 ${themeClasses.border}`}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-bold ${themeClasses.text}`}>Request Replenishment</h3>
              <button
                onClick={() => setShowReplenishmentModal(false)}
                className={`${themeClasses.textSecondary} hover:${themeClasses.text}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`mb-6 p-4 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${themeClasses.textSecondary} mb-1`}>Current Balance</p>
              <p className={`text-2xl font-bold ${themeClasses.text}`}>
                Rs. {parseFloat(account.current_balance || 0).toLocaleString()}
              </p>
            </div>

            <form onSubmit={handleReplenishmentSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                  Amount Needed <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={replenishmentForm.amount}
                  onChange={(e) => setReplenishmentForm({ ...replenishmentForm, amount: e.target.value })}
                  step="0.01"
                  min="0.01"
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-lg font-semibold`}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                  Justification <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={replenishmentForm.justification}
                  onChange={(e) => setReplenishmentForm({ ...replenishmentForm, justification: e.target.value })}
                  rows={4}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
                  placeholder="Explain why you need this replenishment..."
                  required
                />
              </div>

              {replenishmentForm.amount && parseFloat(replenishmentForm.amount) > 0 && (
                <div className={`p-4 rounded-xl ${isDark ? 'bg-green-900/30' : 'bg-green-50'} border-2 border-green-500/30`}>
                  <p className={`text-sm ${isDark ? 'text-green-300' : 'text-green-800'} mb-1`}>New Balance (if approved)</p>
                  <p className={`text-2xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                    Rs. {(parseFloat(account.current_balance || 0) + parseFloat(replenishmentForm.amount)).toLocaleString()}
                  </p>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReplenishmentModal(false)}
                  className={`flex-1 py-3 ${themeClasses.card} border-2 ${themeClasses.border} ${themeClasses.text} rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl font-semibold hover:from-green-700 hover:to-green-800 shadow-lg hover:shadow-xl transition-all"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}

      {/* Reconciliation Modal */}
      {showReconciliationModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setShowReconciliationModal(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={`${themeClasses.card} rounded-2xl p-6 max-w-md w-full ${themeClasses.shadow} border-2 ${themeClasses.border}`}
          >
            <div className="flex items-center justify-between mb-6">
              <h3 className={`text-xl font-bold ${themeClasses.text}`}>Reconcile Petty Cash</h3>
              <button
                onClick={() => setShowReconciliationModal(false)}
                className={`${themeClasses.textSecondary} hover:${themeClasses.text}`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className={`mb-6 p-4 rounded-xl ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <p className={`text-sm ${themeClasses.textSecondary} mb-1`}>Expected Balance (System)</p>
              <p className={`text-2xl font-bold ${themeClasses.text}`}>
                Rs. {parseFloat(account.current_balance || 0).toLocaleString()}
              </p>
            </div>

            <form onSubmit={handleReconciliationSubmit} className="space-y-4">
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                  Actual Balance (Physical Count) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  value={reconciliationForm.actualBalance}
                  onChange={(e) => setReconciliationForm({ ...reconciliationForm, actualBalance: e.target.value })}
                  step="0.01"
                  min="0"
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-lg font-semibold`}
                  placeholder="0.00"
                  required
                  autoFocus
                />
              </div>

              {reconciliationForm.actualBalance && (
                <>
                  {(() => {
                    const variance = parseFloat(reconciliationForm.actualBalance) - parseFloat(account.current_balance || 0)
                    return (
                      <div className={`p-4 rounded-xl border-2 ${
                        variance === 0
                          ? `${isDark ? 'bg-green-900/30 border-green-500/30' : 'bg-green-50 border-green-200'}`
                          : variance > 0
                          ? `${isDark ? 'bg-blue-900/30 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`
                          : `${isDark ? 'bg-red-900/30 border-red-500/30' : 'bg-red-50 border-red-200'}`
                      }`}>
                        <p className={`text-sm mb-1 ${
                          variance === 0
                            ? `${isDark ? 'text-green-300' : 'text-green-800'}`
                            : variance > 0
                            ? `${isDark ? 'text-blue-300' : 'text-blue-800'}`
                            : `${isDark ? 'text-red-300' : 'text-red-800'}`
                        }`}>
                          {variance === 0 ? 'Perfect Match!' : variance > 0 ? 'Surplus' : 'Shortage'}
                        </p>
                        <p className={`text-2xl font-bold ${
                          variance === 0
                            ? `${isDark ? 'text-green-400' : 'text-green-600'}`
                            : variance > 0
                            ? `${isDark ? 'text-blue-400' : 'text-blue-600'}`
                            : `${isDark ? 'text-red-400' : 'text-red-600'}`
                        }`}>
                          {variance === 0 ? 'Balanced' : `Rs. ${Math.abs(variance).toLocaleString()}`}
                        </p>
                      </div>
                    )
                  })()}

                  {parseFloat(reconciliationForm.actualBalance) !== parseFloat(account.current_balance || 0) && (
                    <div>
                      <label className={`block text-sm font-semibold ${themeClasses.text} mb-2`}>
                        Explain Variance <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        value={reconciliationForm.varianceReason}
                        onChange={(e) => setReconciliationForm({ ...reconciliationForm, varianceReason: e.target.value })}
                        rows={3}
                        className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl border-2 ${themeClasses.border} focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
                        placeholder="Explain why there's a difference..."
                        required
                      />
                    </div>
                  )}
                </>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowReconciliationModal(false)}
                  className={`flex-1 py-3 ${themeClasses.card} border-2 ${themeClasses.border} ${themeClasses.text} rounded-xl font-semibold hover:bg-gray-100 dark:hover:bg-gray-700 transition-all`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl font-semibold hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl transition-all"
                >
                  Complete Reconciliation
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </div>
  )
}

export default function PettyCashPage() {
  return (
    <ProtectedPage permissionKey="PETTY_CASH_USE" pageName="Petty Cash">
      <PettyCashPageContent />
    </ProtectedPage>
  )
}
