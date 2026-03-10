'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProtectedPage from '../../components/ProtectedPage'
import {
  ArrowLeft,
  Plus,
  Search,
  Filter,
  Calendar,
  DollarSign,
  Receipt,
  Edit3,
  Trash2,
  Settings,
  TrendingUp,
  TrendingDown,
  MoreVertical,
  X,
  Save,
  Tag,
  FileText,
  Building,
  Smartphone,
  Clock,
  Check,
  Wallet
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import Modal from '../../components/ui/Modal'
import PinPad from '../../components/ui/PinPad'
import ConfirmModal from '../../components/ui/ConfirmModal'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

export default function ExpensesPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinLoading, setPinLoading] = useState(false)

  // Expenses data
  const [expenses, setExpenses] = useState([])
  const [categories, setCategories] = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [loading, setLoading] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [paymentFilter, setPaymentFilter] = useState('All')

  // UI states
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState({ show: false, expenseId: null })
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  // Form data
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    categoryId: '',
    subcategoryId: '',
    description: '',
    paymentMethod: '',
    taxRate: 0,
    expenseDate: new Date().toISOString().split('T')[0]
  })

  // Category form
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    subcategories: ['']
  })

  const paymentMethods = [
    {
      id: 'Cash',
      name: 'Cash',
      icon: DollarSign,
      color: 'from-green-500 to-green-600',
      logo: null
    },
    {
      id: 'Petty Cash',
      name: 'Petty Cash',
      icon: Wallet,
      color: 'from-purple-500 to-indigo-600',
      logo: null
    },
    {
      id: 'EasyPaisa',
      name: 'EasyPaisa',
      icon: Smartphone,
      color: 'from-green-600 to-green-700',
      logo: '/images/Easypaisa-logo.png'
    },
    {
      id: 'JazzCash',
      name: 'JazzCash',
      icon: Smartphone,
      color: 'from-orange-500 to-red-600',
      logo: '/images/new-Jazzcash-logo.png'
    },
    {
      id: 'Bank',
      name: 'Bank Transfer',
      icon: Building,
      color: 'from-blue-500 to-indigo-600',
      logo: '/images/meezan-bank-logo.png'
    },
    {
      id: 'Unpaid',
      name: 'Unpaid',
      icon: Clock,
      color: 'from-gray-500 to-gray-600',
      logo: null
    }
  ]

  // Theme management
  const themeClasses = themeManager.getClasses()
  const componentStyles = themeManager.getComponentStyles()
  const isDark = themeManager.isDark()

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/')
      return
    }
    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    // Set user ID in cacheManager early
    if (parsedUser?.id) {
      cacheManager.setUserId(parsedUser.id)
    }

    // Set default date range (last 30 days to show more expenses)
    const today = new Date()
    const thirtyDaysAgo = new Date(today)
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    setDateFrom(thirtyDaysAgo.toISOString().split('T')[0])
    setDateTo(today.toISOString().split('T')[0])
  }, [router])

  useEffect(() => {
    if (isAuthenticated) {
      fetchData()
    }
  }, [isAuthenticated, dateFrom, dateTo, categoryFilter, paymentFilter, searchTerm])

  const verifyPin = async () => {
    if (pin.length !== 6) {
      setPinError('PIN must be 6 digits')
      return
    }

    setPinLoading(true)
    setPinError('')

    try {
      const { data, error } = await supabase
        .from('users')
        .select('expense_pin')
        .eq('id', user.id)
        .single()

      if (error) throw error

      if (data.expense_pin === pin) {
        setIsAuthenticated(true)
        setPin('')
      } else {
        setPinError('Invalid PIN. Please try again.')
        setPin('')
      }
    } catch (error) {
      console.error('Error verifying PIN:', error)
      setPinError('Error verifying PIN. Please try again.')
    } finally {
      setPinLoading(false)
    }
  }

  const fetchData = async () => {
    setLoading(true)
    try {
      if (!user?.id) {
        console.error('No user ID available for fetching expenses')
        setLoading(false)
        return
      }

      console.log('Fetching expenses with direct query...')

      // Fetch expenses, categories, and subcategories in parallel
      const [expensesResult, categoriesResult, subcategoriesResult] = await Promise.all([
        // Expenses query
        (async () => {
          let query = supabase
            .from('expenses')
            .select(`
              id,
              amount,
              description,
              payment_method,
              expense_date,
              expense_time,
              tax_rate,
              created_at,
              category_id,
              subcategory_id,
              category:expense_categories (
                id,
                name
              ),
              subcategory:expense_subcategories (
                id,
                name
              )
            `)
            .eq('user_id', user.id)
            .order('expense_date', { ascending: false })

          if (dateFrom) {
            query = query.gte('expense_date', dateFrom)
          }
          if (dateTo) {
            query = query.lte('expense_date', dateTo)
          }
          if (categoryFilter && categoryFilter !== 'All') {
            query = query.eq('category_id', categoryFilter)
          }
          if (paymentFilter && paymentFilter !== 'All') {
            query = query.eq('payment_method', paymentFilter)
          }

          return query.limit(200)
        })(),

        // Categories query
        supabase
          .from('expense_categories')
          .select('id, name, description')
          .eq('user_id', user.id)
          .order('name'),

        // Subcategories query
        supabase
          .from('expense_subcategories')
          .select('id, name, category_id')
          .eq('user_id', user.id)
          .order('name')
      ])

      // Check for errors
      if (expensesResult.error) {
        console.error('❌ Error fetching expenses:', expensesResult.error)
      }
      if (categoriesResult.error) {
        console.error('❌ Error fetching categories:', categoriesResult.error)
        notify.error(`Failed to fetch categories: ${categoriesResult.error.message}`)
      }
      if (subcategoriesResult.error) {
        console.error('❌ Error fetching subcategories:', subcategoriesResult.error)
      }

      // Process results
      const expenses = expensesResult.data || []
      const categories = categoriesResult.data || []
      const subcategories = subcategoriesResult.data || []

      // Sort expenses by date and time
      const sortedExpenses = expenses.sort((a, b) => {
        if (a.expense_date !== b.expense_date) {
          return b.expense_date.localeCompare(a.expense_date)
        }
        return (b.expense_time || '').localeCompare(a.expense_time || '')
      })

      console.log('✅ Fetched expense data:', {
        expenses: sortedExpenses.length,
        categories: categories.length,
        subcategories: subcategories.length
      })

      setExpenses(sortedExpenses)
      setCategories(categories)
      setSubcategories(subcategories)
    } catch (error) {
      console.error('❌ Error fetching expense data:', error)
      notify.error(`Failed to load data: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchExpenses = async () => {
    // Quick refresh of expenses only
    try {
      if (!user?.id) return

      let query = supabase
        .from('expenses')
        .select(`
          id,
          amount,
          description,
          payment_method,
          expense_date,
          expense_time,
          tax_rate,
          created_at,
          category_id,
          subcategory_id,
          category:expense_categories (id, name),
          subcategory:expense_subcategories (id, name)
        `)
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false })

      if (dateFrom) query = query.gte('expense_date', dateFrom)
      if (dateTo) query = query.lte('expense_date', dateTo)
      if (categoryFilter && categoryFilter !== 'All') query = query.eq('category_id', categoryFilter)
      if (paymentFilter && paymentFilter !== 'All') query = query.eq('payment_method', paymentFilter)

      const { data } = await query.limit(200)

      const sortedExpenses = (data || []).sort((a, b) => {
        if (a.expense_date !== b.expense_date) {
          return b.expense_date.localeCompare(a.expense_date)
        }
        return (b.expense_time || '').localeCompare(a.expense_time || '')
      })

      setExpenses(sortedExpenses)
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }

  const fetchCategories = async () => {
    // Quick refresh of categories only
    try {
      if (!user?.id) {
        console.log('⚠️ No user ID, cannot fetch categories')
        return
      }

      console.log('🔍 Fetching categories for user:', user.id)

      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name, description')
        .eq('user_id', user.id)
        .order('name')

      if (error) {
        console.error('❌ Error fetching categories:', error)
        throw error
      }

      console.log('✅ Found categories:', data?.length || 0, data)
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
      notify.error(`Failed to fetch categories: ${error.message}`)
    }
  }

  const fetchSubcategories = async () => {
    // Subcategories are now fetched via cacheManager in fetchData
    // Keeping for compatibility with handleSaveCategory
    try {
      const result = await cacheManager.fetchExpenseData({})
      setSubcategories(result.expenseSubcategories || [])
    } catch (error) {
      console.error('Error fetching subcategories:', error)
    }
  }

  const calculateTotalAmount = () => {
    const amount = parseFloat(expenseForm.amount) || 0
    const taxAmount = (amount * expenseForm.taxRate) / 100
    return amount + taxAmount
  }

  const handleSaveExpense = async () => {
    try {
      if (!expenseForm.amount || !expenseForm.categoryId || !expenseForm.paymentMethod) {
        notify.warning('Please fill in all required fields')
        return
      }

      const amount = parseFloat(expenseForm.amount)
      const taxAmount = (amount * expenseForm.taxRate) / 100
      const totalAmount = amount + taxAmount

      const expenseData = {
        user_id: user.id,
        amount: amount,
        category_id: expenseForm.categoryId,
        subcategory_id: expenseForm.subcategoryId || null,
        description: expenseForm.description,
        payment_method: expenseForm.paymentMethod,
        tax_rate: expenseForm.taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        expense_date: expenseForm.expenseDate,
        expense_time: new Date().toTimeString().split(' ')[0]
      }

      if (editingExpense) {
        const { error } = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', editingExpense.id)

        if (error) throw error
      } else {
        const { error } = await supabase
          .from('expenses')
          .insert(expenseData)

        if (error) throw error
      }

      setShowAddExpense(false)
      setEditingExpense(null)
      resetExpenseForm()
      fetchExpenses()
      notify.success(editingExpense ? 'Expense updated successfully' : 'Expense added successfully')
    } catch (error) {
      console.error('Error saving expense:', error)
      notify.error('Failed to save expense')
    }
  }

  const handleDeleteExpense = async (expenseId) => {
    setConfirmDelete({ show: true, expenseId })
  }

  const confirmDeleteExpense = async () => {
    setIsDeleting(true)
    try {
      const { error } = await supabase
        .from('expenses')
        .delete()
        .eq('id', confirmDelete.expenseId)

      if (error) throw error

      setConfirmDelete({ show: false, expenseId: null })
      setSelectedExpense(null)
      fetchExpenses()
      notify.success('Expense deleted successfully')
    } catch (error) {
      console.error('Error deleting expense:', error)
      notify.error('Failed to delete expense')
    } finally {
      setIsDeleting(false)
    }
  }

  const handleSaveCategory = async () => {
    // Prevent double submission
    if (isSavingCategory) {
      console.log('⏸️ Already saving, please wait...')
      return
    }

    try {
      if (!categoryForm.name) {
        notify.warning('Category name is required')
        return
      }

      setIsSavingCategory(true)
      console.log('💾 Saving category:', categoryForm.name)
      console.log('👤 User object:', user)
      console.log('🆔 User ID:', user?.id)

      if (!user?.id) {
        notify.error('User not authenticated')
        setIsSavingCategory(false)
        return
      }

      // Prepare data
      const insertData = {
        user_id: user.id,
        name: categoryForm.name.trim(),
        description: categoryForm.description?.trim() || null
      }

      console.log('📝 Insert data:', insertData)

      // Save category
      const { data: category, error: categoryError } = await supabase
        .from('expense_categories')
        .insert(insertData)
        .select()
        .single()

      console.log('📊 Insert result:', { data: category, error: categoryError })

      if (categoryError) {
        console.error('❌ Error saving category:', categoryError)
        console.error('❌ Error details:', JSON.stringify(categoryError, null, 2))
        notify.error(`Failed to save: ${categoryError.message || categoryError.hint || 'Unknown error'}`)
        setIsSavingCategory(false)
        return
      }

      console.log('✅ Category saved:', category)

      // Save subcategories
      const nonEmptySubcats = categoryForm.subcategories.filter(s => s.trim())
      if (nonEmptySubcats.length > 0) {
        console.log(`💾 Saving ${nonEmptySubcats.length} subcategories...`)
        for (const subcat of nonEmptySubcats) {
          const { error: subcatError } = await supabase
            .from('expense_subcategories')
            .insert({
              user_id: user.id,
              category_id: category.id,
              name: subcat.trim()
            })

          if (subcatError) {
            console.error('⚠️ Error saving subcategory:', subcatError)
            // Continue with other subcategories even if one fails
          }
        }
      }

      setShowCategoryModal(false)
      setCategoryForm({ name: '', description: '', subcategories: [''] })
      await fetchCategories()
      await fetchSubcategories()
      notify.success('Category created successfully!')
    } catch (error) {
      console.error('❌ Unexpected error:', error)
      notify.error(`Unexpected error: ${error.message || 'Please try again'}`)
    } finally {
      setIsSavingCategory(false)
    }
  }

  const resetExpenseForm = () => {
    setExpenseForm({
      amount: '',
      categoryId: '',
      subcategoryId: '',
      description: '',
      paymentMethod: '',
      taxRate: 0,
      expenseDate: new Date().toISOString().split('T')[0]
    })
  }

  const openEditExpense = (expense) => {
    setEditingExpense(expense)
    setExpenseForm({
      amount: expense.amount.toString(),
      categoryId: expense.category_id,
      subcategoryId: expense.subcategory_id || '',
      description: expense.description || '',
      paymentMethod: expense.payment_method,
      taxRate: expense.tax_rate || 0,
      expenseDate: expense.expense_date
    })
    setShowAddExpense(true)
  }

  const getPaymentMethodIcon = (method) => {
    const config = paymentMethods.find(p => p.id === method)
    return config?.icon || DollarSign
  }

  const getPaymentMethodColor = (method) => {
    const config = paymentMethods.find(p => p.id === method)
    return config?.color || 'from-gray-500 to-gray-600'
  }

  const getTotalExpenses = () => {
    return expenses.reduce((sum, expense) => sum + parseFloat(expense.total_amount || expense.amount), 0)
  }

  const filteredExpenses = expenses.filter(expense => {
    const searchMatch =
      expense.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.category?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      expense.subcategory?.name?.toLowerCase().includes(searchTerm.toLowerCase())

    return searchMatch
  })

  if (!isAuthenticated) {
    return (
      <ProtectedPage permissionKey="EXPENSES" pageName="Expenses">
        <div className={componentStyles.page}>
        <div className="flex items-center justify-center p-4 min-h-screen">
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

            <PinPad
              pin={pin}
              onPinChange={setPin}
              onSubmit={verifyPin}
              error={pinError}
              loading={pinLoading}
            />
          </div>
        </div>
      </div>
      </ProtectedPage>
    )
  }

  return (
    <ProtectedPage permissionKey="EXPENSES" pageName="Expenses">
      <div className={`h-screen flex ${componentStyles.page} overflow-hidden text-sm`}>
      {/* Left Panel - Expenses List */}
      <div className={`w-96 ${themeClasses.card} backdrop-blur-xl ${themeClasses.shadow} ${themeClasses.border} border-r flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200/50 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600">
          <div className="flex items-center justify-between mb-4">
            <motion.button
              whileHover={{ x: -3, scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-white/90 hover:text-white transition-all"
            >
              <div className="w-10 h-10 rounded-xl bg-white/20 hover:bg-white/30 flex items-center justify-center mr-3 transition-all">
                <ArrowLeft className="w-5 h-5" />
              </div>
              <span className="font-semibold">Dashboard</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowCategoryModal(true)}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
            >
              <Settings className="w-5 h-5 text-white" />
            </motion.button>
          </div>

          <div className="mb-4">
            <h1 className="text-2xl font-bold text-white mb-1">Expense Manager</h1>
            <p className="text-purple-100 text-sm">Track and manage expenses</p>
          </div>

          {/* Search & Add */}
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-9 pr-3 py-2 text-sm ${isDark ? 'bg-gray-700/90 border-gray-600 text-white placeholder-gray-400' : 'bg-white/90 border-white/20 text-gray-800'} border rounded-lg focus:ring-1 focus:ring-white/30`}
              />
            </div>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowAddExpense(true)}
              className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all flex items-center"
            >
              <Plus className="w-4 h-4 text-white" />
            </motion.button>
          </div>
        </div>

        {/* Filters */}
        <div className={`p-3 ${isDark ? 'bg-gray-700/80' : 'bg-gray-50/80'} ${themeClasses.border} border-b`}>
          <div className="grid grid-cols-3 gap-2 mb-2">
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={`text-xs ${themeClasses.input} rounded px-2 py-1`}
            >
              <option value="All">All Categories</option>
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>

            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className={`text-xs ${themeClasses.input} rounded px-2 py-1`}
            >
              <option value="All">All Payments</option>
              {paymentMethods.map(method => (
                <option key={method.id} value={method.id}>{method.name}</option>
              ))}
            </select>

            <div className={`text-xs font-semibold ${themeClasses.textPrimary} flex items-center justify-center ${themeClasses.card} rounded border px-2`}>
              {filteredExpenses.length} Total
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={`text-xs ${themeClasses.input} rounded px-2 py-1`}
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={`text-xs ${themeClasses.input} rounded px-2 py-1`}
            />
          </div>
        </div>

        {/* Total Summary */}
        <div className={`p-3 bg-gradient-to-r ${isDark ? 'from-green-900/50 to-emerald-900/50' : 'from-green-50 to-emerald-50'} ${themeClasses.border} border-b`}>
          <div className="flex items-center justify-between">
            <span className={`text-sm font-semibold ${isDark ? 'text-green-300' : 'text-green-800'}`}>Total Expenses:</span>
            <span className={`text-lg font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
              PKR {getTotalExpenses().toFixed(2)}
            </span>
          </div>
        </div>

        {/* Expenses List */}
        <div className="flex-1 overflow-y-auto">
          {!loading && filteredExpenses.length === 0 ? (
            <div className="text-center py-12 px-4">
              <Receipt className={`w-12 h-12 ${themeClasses.textSecondary} mx-auto mb-3`} />
              <h3 className={`text-lg font-semibold ${themeClasses.textSecondary} mb-2`}>No expenses found</h3>
              <p className={`${themeClasses.textSecondary} text-sm`}>Add your first expense to get started</p>
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {filteredExpenses.map((expense) => {
                const PaymentIcon = getPaymentMethodIcon(expense.payment_method)
                return (
                  <motion.div
                    key={expense.id}
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedExpense(expense)}
                    className={`p-3 rounded-lg cursor-pointer transition-all ${themeClasses.border} border ${selectedExpense?.id === expense.id
                        ? `${isDark ? 'bg-purple-900/50 border-purple-600' : 'bg-purple-50 border-purple-200'} ${themeClasses.shadow}`
                        : `${themeClasses.card} ${themeClasses.hover}`
                      }`}
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center">
                        <div className={`w-8 h-8 rounded-lg bg-gradient-to-r ${getPaymentMethodColor(expense.payment_method)} flex items-center justify-center mr-3`}>
                          <PaymentIcon className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <h3 className={`font-bold ${themeClasses.textPrimary} text-sm`}>
                            {expense.category?.name || 'Uncategorized'}
                          </h3>
                          <p className={`text-xs ${themeClasses.textSecondary}`}>
                            {expense.subcategory?.name && `${expense.subcategory.name} • `}
                            {expense.expense_date}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-bold ${themeClasses.textPrimary} text-sm`}>
                          PKR {parseFloat(expense.total_amount || expense.amount).toFixed(2)}
                        </p>
                        <p className={`text-xs ${themeClasses.textSecondary}`}>{expense.payment_method}</p>
                      </div>
                    </div>

                    {expense.description && (
                      <p className={`text-xs ${themeClasses.textSecondary} truncate mt-1`}>
                        {expense.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between mt-2">
                      <span className={`text-xs ${themeClasses.textSecondary}`}>
                        {expense.expense_time}
                      </span>
                      <div className="flex space-x-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            openEditExpense(expense)
                          }}
                          className="p-1 text-blue-500 hover:text-blue-700 rounded transition-colors"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteExpense(expense.id)
                          }}
                          className="p-1 text-red-500 hover:text-red-700 rounded transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Panel - Expense Details */}
      <div className={`flex-1 flex flex-col ${themeClasses.card} backdrop-blur-xl`}>
        {selectedExpense ? (
          <>
            {/* Expense Header */}
            <div className={`p-6 ${themeClasses.border} border-b ${isDark ? 'bg-gray-700/80' : 'bg-gray-50/80'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${getPaymentMethodColor(selectedExpense.payment_method)} flex items-center justify-center mr-4`}>
                    {React.createElement(getPaymentMethodIcon(selectedExpense.payment_method), { className: "w-6 h-6 text-white" })}
                  </div>
                  <div>
                    <h2 className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                      {selectedExpense.category?.name || 'Uncategorized'}
                    </h2>
                    <p className={themeClasses.textSecondary}>
                      {selectedExpense.subcategory?.name && `${selectedExpense.subcategory.name} • `}
                      {new Date(selectedExpense.expense_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                <div className="text-right">
                  <p className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                    PKR {parseFloat(selectedExpense.total_amount || selectedExpense.amount).toFixed(2)}
                  </p>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>{selectedExpense.payment_method}</p>
                </div>
              </div>
            </div>

            {/* Expense Details */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Payment Information */}
                <div className={`${themeClasses.card} backdrop-blur-sm rounded-2xl p-6 ${themeClasses.border} border`}>
                  <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                    <DollarSign className="w-5 h-5 mr-2 text-green-500" />
                    Payment Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className={themeClasses.textSecondary}>Base Amount:</span>
                      <span className={`font-semibold ${themeClasses.textPrimary}`}>PKR {parseFloat(selectedExpense.amount).toFixed(2)}</span>
                    </div>
                    {selectedExpense.tax_rate > 0 && (
                      <>
                        <div className="flex justify-between">
                          <span className={themeClasses.textSecondary}>Tax ({selectedExpense.tax_rate}%):</span>
                          <span className={`font-semibold ${themeClasses.textPrimary}`}>PKR {parseFloat(selectedExpense.tax_amount || 0).toFixed(2)}</span>
                        </div>
                        <div className={`flex justify-between ${themeClasses.border} border-t pt-2`}>
                          <span className={`${themeClasses.textPrimary} font-semibold`}>Total Amount:</span>
                          <span className={`font-bold text-lg ${themeClasses.textPrimary}`}>PKR {parseFloat(selectedExpense.total_amount || selectedExpense.amount).toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div className="flex justify-between">
                      <span className={themeClasses.textSecondary}>Payment Method:</span>
                      <span className={`font-semibold ${themeClasses.textPrimary}`}>{selectedExpense.payment_method}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className={themeClasses.textSecondary}>Date & Time:</span>
                      <span className={`font-semibold ${themeClasses.textPrimary}`}>
                        {new Date(selectedExpense.expense_date).toLocaleDateString()} at {selectedExpense.expense_time}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Category Information */}
                <div className={`${themeClasses.card} backdrop-blur-sm rounded-2xl p-6 ${themeClasses.border} border`}>
                  <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                    <Tag className="w-5 h-5 mr-2 text-purple-500" />
                    Category Details
                  </h3>
                  <div className="space-y-3">
                    <div>
                      <span className={`${themeClasses.textSecondary} block`}>Category:</span>
                      <span className={`font-semibold text-lg ${themeClasses.textPrimary}`}>{selectedExpense.category?.name || 'Uncategorized'}</span>
                    </div>
                    {selectedExpense.subcategory?.name && (
                      <div>
                        <span className={`${themeClasses.textSecondary} block`}>Subcategory:</span>
                        <span className={`font-semibold ${themeClasses.textPrimary}`}>{selectedExpense.subcategory.name}</span>
                      </div>
                    )}
                    {selectedExpense.description && (
                      <div>
                        <span className={`${themeClasses.textSecondary} block`}>Description:</span>
                        <p className={`font-semibold ${themeClasses.textPrimary}`}>{selectedExpense.description}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="lg:col-span-2">
                  <div className={`${themeClasses.card} backdrop-blur-sm rounded-2xl p-6 ${themeClasses.border} border`}>
                    <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4`}>Actions</h3>
                    <div className="flex space-x-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => openEditExpense(selectedExpense)}
                        className="flex-1 flex items-center justify-center py-3 px-4 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all font-semibold"
                      >
                        <Edit3 className="w-4 h-4 mr-2" />
                        Edit Expense
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDeleteExpense(selectedExpense.id)}
                        className="flex-1 flex items-center justify-center py-3 px-4 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl transition-all font-semibold"
                      >
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete Expense
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className={`w-24 h-24 ${isDark ? 'bg-gradient-to-br from-purple-900/50 to-blue-900/50' : 'bg-gradient-to-br from-purple-100 to-blue-100'} rounded-full flex items-center justify-center mx-auto mb-6`}>
                <Receipt className="w-12 h-12 text-purple-500" />
              </div>
              <h3 className={`text-2xl font-bold ${themeClasses.textSecondary} mb-3`}>Select an Expense</h3>
              <p className={`${themeClasses.textSecondary} text-lg`}>Choose an expense from the list to view details</p>
            </div>
          </div>
        )}
      </div>

      {/* Add/Edit Expense Side Panel */}
      <AnimatePresence>
        {showAddExpense && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={`fixed inset-y-0 right-0 w-96 ${themeClasses.card} ${themeClasses.shadow} z-50 flex flex-col`}
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-bold text-white">
                  {editingExpense ? 'Edit Expense' : 'Add New Expense'}
                </h3>
                <button
                  onClick={() => {
                    setShowAddExpense(false)
                    setEditingExpense(null)
                    resetExpenseForm()
                  }}
                  className="p-2 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Amount */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                  Amount (PKR) *
                </label>
                <input
                  type="number"
                  value={expenseForm.amount}
                  onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg font-semibold`}
                  placeholder="0.00"
                />
              </div>

              {/* Category */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                  Category *
                </label>
                <select
                  value={expenseForm.categoryId}
                  onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value, subcategoryId: '' })}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                >
                  <option value="">Select Category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>{category.name}</option>
                  ))}
                </select>
              </div>

              {/* Subcategory */}
              {expenseForm.categoryId && (
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                    Subcategory
                  </label>
                  <select
                    value={expenseForm.subcategoryId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, subcategoryId: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  >
                    <option value="">Select Subcategory</option>
                    {subcategories
                      .filter(sub => sub.category_id === expenseForm.categoryId)
                      .map(subcategory => (
                        <option key={subcategory.id} value={subcategory.id}>{subcategory.name}</option>
                      ))}
                  </select>
                </div>
              )}

              {/* Payment Method */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-3`}>
                  Payment Method *
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.id}
                      onClick={() => setExpenseForm({ ...expenseForm, paymentMethod: method.id })}
                      className={`p-3 rounded-xl border-2 transition-all ${expenseForm.paymentMethod === method.id
                          ? `border-purple-500 ${isDark ? 'bg-purple-900/50' : 'bg-purple-50'}`
                          : `${themeClasses.border} ${themeClasses.hover} ${themeClasses.card}`
                        }`}
                    >
                      <div className="flex flex-col items-center">
                        <div className={`w-8 h-8 bg-gradient-to-r ${method.color} rounded-lg flex items-center justify-center mb-2`}>
                          {React.createElement(method.icon, { className: "w-4 h-4 text-white" })}
                        </div>
                        <span className={`text-xs font-medium ${themeClasses.textPrimary}`}>{method.name}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tax Rate */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                  Tax Rate (%)
                </label>
                <input
                  type="number"
                  value={expenseForm.taxRate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, taxRate: parseFloat(e.target.value) || 0 })}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                  placeholder="0"
                  min="0"
                  max="100"
                  step="0.01"
                />
              </div>

              {/* Total Calculation */}
              {expenseForm.amount && (
                <div className={`${isDark ? 'bg-green-900/50 border-green-700' : 'bg-green-50 border-green-200'} rounded-xl p-4 border`}>
                  <h4 className={`font-semibold ${isDark ? 'text-green-300' : 'text-green-900'} mb-2`}>Total Calculation</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className={themeClasses.textSecondary}>Base Amount:</span>
                      <span className={themeClasses.textPrimary}>PKR {parseFloat(expenseForm.amount || 0).toFixed(2)}</span>
                    </div>
                    {expenseForm.taxRate > 0 && (
                      <div className="flex justify-between">
                        <span className={themeClasses.textSecondary}>Tax ({expenseForm.taxRate}%):</span>
                        <span className={themeClasses.textPrimary}>PKR {((parseFloat(expenseForm.amount || 0) * expenseForm.taxRate) / 100).toFixed(2)}</span>
                      </div>
                    )}
                    <div className={`flex justify-between font-bold ${isDark ? 'text-green-300 border-green-700' : 'text-green-800 border-green-200'} border-t pt-1`}>
                      <span>Total:</span>
                      <span>PKR {calculateTotalAmount().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Date */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                  Expense Date *
                </label>
                <input
                  type="date"
                  value={expenseForm.expenseDate}
                  onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent`}
                />
              </div>

              {/* Description */}
              <div>
                <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                  Description
                </label>
                <textarea
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  className={`w-full px-4 py-3 ${themeClasses.input} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none`}
                  rows="3"
                  placeholder="Enter expense description..."
                />
              </div>
            </div>

            {/* Footer */}
            <div className={`p-6 ${themeClasses.border} border-t ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowAddExpense(false)
                    setEditingExpense(null)
                    resetExpenseForm()
                  }}
                  className={`flex-1 px-4 py-3 border-2 ${themeClasses.border} ${themeClasses.textPrimary} font-semibold rounded-xl ${themeClasses.hover} transition-all`}
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSaveExpense}
                  className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all"
                >
                  <Save className="w-4 h-4 mr-2 inline" />
                  {editingExpense ? 'Update' : 'Save'} Expense
                </motion.button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Category Management Modal */}
      <Modal
        isOpen={showCategoryModal}
        onClose={() => setShowCategoryModal(false)}
        title="Create New Category"
        maxWidth="max-w-xl"
      >
        <div className="space-y-5">
          {/* Category Name */}
          <div>
            <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-2 uppercase tracking-wide flex items-center gap-2`}>
              <Tag className="w-4 h-4" />
              Category Name *
            </label>
            <input
              type="text"
              value={categoryForm.name}
              onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
              className={`w-full px-4 py-3.5 ${themeClasses.input} border-2 ${themeClasses.border} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-base font-medium`}
              placeholder="e.g., Rent, Utilities, Salaries"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-2 uppercase tracking-wide flex items-center gap-2`}>
              <FileText className="w-4 h-4" />
              Description <span className="text-xs font-normal normal-case text-gray-400">(Optional)</span>
            </label>
            <textarea
              value={categoryForm.description}
              onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
              className={`w-full px-4 py-3 ${themeClasses.input} border-2 ${themeClasses.border} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all resize-none`}
              rows="2"
              placeholder="Brief description of this category"
            />
          </div>

          {/* Subcategories */}
          <div className={`rounded-xl border-2 ${themeClasses.border} p-4 ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
            <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-3 uppercase tracking-wide flex items-center gap-2`}>
              <Settings className="w-4 h-4" />
              Subcategories <span className="text-xs font-normal normal-case text-gray-400">(Optional)</span>
            </label>

            <div className="space-y-2">
              {categoryForm.subcategories.map((subcat, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex gap-2"
                >
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={subcat}
                      onChange={(e) => {
                        const newSubcats = [...categoryForm.subcategories]
                        newSubcats[index] = e.target.value
                        setCategoryForm({ ...categoryForm, subcategories: newSubcats })
                      }}
                      className={`w-full pl-8 pr-4 py-2.5 ${themeClasses.input} border ${themeClasses.border} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all`}
                      placeholder={`Subcategory ${index + 1}`}
                    />
                    <span className={`absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold ${themeClasses.textSecondary}`}>
                      #{index + 1}
                    </span>
                  </div>
                  {categoryForm.subcategories.length > 1 && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        const newSubcats = categoryForm.subcategories.filter((_, i) => i !== index)
                        setCategoryForm({ ...categoryForm, subcategories: newSubcats })
                      }}
                      className={`p-2.5 ${isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600'} rounded-lg transition-all`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  )}
                </motion.div>
              ))}

              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={() => setCategoryForm({
                  ...categoryForm,
                  subcategories: [...categoryForm.subcategories, '']
                })}
                className={`w-full py-3 border-2 border-dashed ${themeClasses.border} ${themeClasses.textSecondary} rounded-lg ${themeClasses.hover} transition-all font-medium flex items-center justify-center gap-2 mt-2`}
              >
                <Plus className="w-4 h-4" />
                Add Subcategory
              </motion.button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => {
                setShowCategoryModal(false)
                setCategoryForm({ name: '', description: '', subcategories: [''] })
              }}
              className={`flex-1 px-6 py-3 border-2 ${themeClasses.border} ${themeClasses.textPrimary} font-semibold rounded-xl ${themeClasses.hover} transition-all`}
            >
              Cancel
            </button>
            <motion.button
              whileHover={{ scale: isSavingCategory ? 1 : 1.02 }}
              whileTap={{ scale: isSavingCategory ? 1 : 0.98 }}
              onClick={handleSaveCategory}
              disabled={!categoryForm.name || isSavingCategory}
              className={`flex-1 ${categoryForm.name && !isSavingCategory ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' : 'bg-gray-400 cursor-not-allowed'} text-white font-bold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2`}
            >
              {isSavingCategory ? (
                <>
                  <Clock className="w-5 h-5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check className="w-5 h-5" />
                  Create Category
                </>
              )}
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Confirm Delete Modal */}
      <ConfirmModal
        isOpen={confirmDelete.show}
        onClose={() => setConfirmDelete({ show: false, expenseId: null })}
        onConfirm={confirmDeleteExpense}
        title="Delete Expense"
        message="Are you sure you want to delete this expense? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        isLoading={isDeleting}
      />

      {/* Notification System */}
      <NotificationSystem />
      </div>
    </ProtectedPage>
  )
}