'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import ProtectedPage from '../../components/ProtectedPage'
import {
  ArrowLeft,
  Plus,
  Search,
  DollarSign,
  Receipt,
  Edit3,
  Trash2,
  Settings,
  X,
  Save,
  Tag,
  FileText,
  Building,
  Smartphone,
  Clock,
  Check,
  Wallet,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  Truck
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { cacheManager } from '../../lib/cacheManager'
import Modal from '../../components/ui/Modal'
import PinPad from '../../components/ui/PinPad'
import ConfirmModal from '../../components/ui/ConfirmModal'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

// ─── Offline cache keys ────────────────────────────────────────────────────────
const EXPENSE_CACHE = {
  all:           'pos_expenses_all',
  categories:    'pos_expense_categories',
  subcategories: 'pos_expense_subcategories',
  accounts:      'pos_payment_accounts',
  pin:           'pos_expense_pin',
  pending:       'pending_expenses',
}

// ─── Date preset helpers ───────────────────────────────────────────────────────
// Format a Date using LOCAL calendar parts — never UTC. toISOString() converts
// to UTC, which shifts an expense recorded after midnight PKT to the previous day.
const localDateStr = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function getDateRangeFromPreset(preset) {
  const today = new Date()
  const fmt = localDateStr

  switch (preset) {
    case 'today':
      return { from: fmt(today), to: fmt(today) }
    case 'yesterday': {
      const y = new Date(today); y.setDate(today.getDate() - 1)
      return { from: fmt(y), to: fmt(y) }
    }
    case 'this_week': {
      const dow = today.getDay()
      const mon = new Date(today); mon.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
      return { from: fmt(mon), to: fmt(today) }
    }
    case 'this_month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1)
      return { from: fmt(first), to: fmt(today) }
    }
    case 'last_month': {
      const firstThisMonth = new Date(today.getFullYear(), today.getMonth(), 1)
      const lastLastMonth = new Date(firstThisMonth); lastLastMonth.setDate(0)
      const firstLastMonth = new Date(lastLastMonth.getFullYear(), lastLastMonth.getMonth(), 1)
      return { from: fmt(firstLastMonth), to: fmt(lastLastMonth) }
    }
    default:
      return { from: '', to: '' }
  }
}

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

  // Date filters — preset-driven
  const [datePreset, setDatePreset] = useState('today')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Category / subcategory / payment filters
  const [categoryFilter, setCategoryFilter] = useState('All')
  const [subcategoryFilter, setSubcategoryFilter] = useState('All')
  const [paymentFilter, setPaymentFilter] = useState('All')

  // Payment accounts
  const [paymentAccounts, setPaymentAccounts] = useState([])

  // Suppliers
  const [suppliers, setSuppliers] = useState([])

  // UI states
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [showCategoryModal, setShowCategoryModal] = useState(false)
  const [editingExpense, setEditingExpense] = useState(null)
  const [selectedExpense, setSelectedExpense] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState({ show: false, expenseId: null })
  const [isDeleting, setIsDeleting] = useState(false)
  const [isSavingCategory, setIsSavingCategory] = useState(false)

  // Category modal tab
  const [categoryTab, setCategoryTab] = useState('list')

  // Category management — new states
  const [expandedCategories, setExpandedCategories] = useState(new Set())
  const [editingCategoryInline, setEditingCategoryInline] = useState(null)
  const [confirmDeleteCategory, setConfirmDeleteCategory] = useState({ show: false, categoryId: null, name: '' })
  const [confirmDeleteSubcategory, setConfirmDeleteSubcategory] = useState({ show: false, subcategoryId: null, name: '' })
  const [newSubcatInputs, setNewSubcatInputs] = useState({})
  const [savingSubcat, setSavingSubcat] = useState({})
  const [isDeletingCategory, setIsDeletingCategory] = useState(false)
  const [isDeletingSubcategory, setIsDeletingSubcategory] = useState(false)

  // Form data
  const [expenseForm, setExpenseForm] = useState({
    amount: '',
    categoryId: '',
    subcategoryId: '',
    description: '',
    paymentMethod: '',
    paymentAccountId: '',
    supplierId: '',
    taxRate: 0,
    expenseDate: localDateStr(new Date())
  })

  // Category form (new category tab)
  const [categoryForm, setCategoryForm] = useState({
    name: '',
    description: '',
    subcategories: ['']
  })

  // Maps payment_account.payment_method_key (lowercase) → expenses.payment_method
  const ACCOUNT_KEY_TO_METHOD = {
    cash: 'Cash',
    easypaisa: 'EasyPaisa',
    jazzcash: 'JazzCash',
    bank: 'Bank',
    card: 'Card',
    'petty cash': 'Petty Cash',
  }

  // Offline
  const [isOnline, setIsOnline] = useState(() => typeof window !== 'undefined' ? cacheManager.checkOnlineStatus() : true)
  const [pendingCount, setPendingCount] = useState(0)

  // Theme
  const themeClasses = themeManager.getClasses()
  const componentStyles = themeManager.getComponentStyles()
  const isDark = themeManager.isDark()

  // ─── Offline helpers ───────────────────────────────────────────────────────
  const countPending = () => {
    try {
      const p = JSON.parse(localStorage.getItem(EXPENSE_CACHE.pending) || '[]')
      setPendingCount(p.length)
    } catch { setPendingCount(0) }
  }

  const filterCachedExpenses = (all) => {
    const cashierId = authManager.getCashier()?.id
    let list = all
    if (cashierId) list = list.filter(e => e.cashier_id === cashierId)
    if (dateFrom) list = list.filter(e => e.expense_date >= dateFrom)
    if (dateTo) list = list.filter(e => e.expense_date <= dateTo)
    if (categoryFilter !== 'All') list = list.filter(e => e.category_id === categoryFilter)
    if (subcategoryFilter !== 'All') list = list.filter(e => e.subcategory_id === subcategoryFilter)
    if (paymentFilter !== 'All') list = list.filter(e => e.payment_method === paymentFilter)
    return list.sort((a, b) => {
      if (a.expense_date !== b.expense_date) return b.expense_date.localeCompare(a.expense_date)
      return (b.expense_time || '').localeCompare(a.expense_time || '')
    })
  }

  // ─── Init ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/')
      return
    }
    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    themeManager.applyTheme()

    // Apply 'today' preset on mount
    const { from, to } = getDateRangeFromPreset('today')
    setDateFrom(from)
    setDateTo(to)
  }, [router])

  useEffect(() => {
    if (isAuthenticated) fetchData()
  }, [isAuthenticated, dateFrom, dateTo, categoryFilter, subcategoryFilter, paymentFilter])

  useEffect(() => {
    countPending()
    const handleOnline = () => { setIsOnline(true); syncPendingExpenses() }
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', handleOffline) }
  }, [])

  // ─── Date preset handler ───────────────────────────────────────────────────
  const handleDatePresetChange = (preset) => {
    setDatePreset(preset)
    if (preset !== 'custom') {
      const { from, to } = getDateRangeFromPreset(preset)
      setDateFrom(from)
      setDateTo(to)
    }
  }

  // ─── PIN verification ──────────────────────────────────────────────────────
  const verifyPin = async () => {
    if (pin.length !== 6) { setPinError('PIN must be 6 digits'); return }
    if (!cacheManager.checkOnlineStatus()) {
      try {
        const cached = JSON.parse(localStorage.getItem(EXPENSE_CACHE.pin) || 'null')
        if (cached?.userId === user?.id && cached?.pin === pin) {
          setIsAuthenticated(true); setPin('')
        } else {
          setPinError(cached ? 'Invalid PIN.' : 'Connect to internet to verify PIN for the first time.')
          setPin('')
        }
      } catch { setPinError('PIN verification unavailable offline.') }
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
        localStorage.setItem(EXPENSE_CACHE.pin, JSON.stringify({ userId: user.id, pin: data.expense_pin }))
        setIsAuthenticated(true); setPin('')
      } else {
        setPinError('Invalid PIN. Please try again.'); setPin('')
      }
    } catch (error) {
      console.error('Error verifying PIN:', error)
      setPinError('Error verifying PIN. Please try again.')
    } finally { setPinLoading(false) }
  }

  // ─── Fetch data ────────────────────────────────────────────────────────────
  const fetchData = async () => {
    setLoading(true)
    try {
      if (!user?.id) { setLoading(false); return }

      if (!cacheManager.checkOnlineStatus()) {
        try {
          const all = JSON.parse(localStorage.getItem(EXPENSE_CACHE.all) || '[]')
          const cats = JSON.parse(localStorage.getItem(EXPENSE_CACHE.categories) || '[]')
          const subcats = JSON.parse(localStorage.getItem(EXPENSE_CACHE.subcategories) || '[]')
          const accts = JSON.parse(localStorage.getItem(EXPENSE_CACHE.accounts) || '[]')
          setExpenses(filterCachedExpenses(all))
          setCategories(cats)
          setSubcategories(subcats)
          setPaymentAccounts(accts)
        } catch {}
        setLoading(false)
        return
      }

      const [expensesResult, categoriesResult, subcategoriesResult] = await Promise.all([
        (async () => {
          const currentCashierId = authManager.getCashier()?.id
          let query = supabase
            .from('expenses')
            .select(`
              id, amount, description, payment_method, expense_date, expense_time,
              tax_rate, tax_amount, total_amount, created_at, category_id, subcategory_id, cashier_id, supplier_id,
              category:expense_categories (id, name),
              subcategory:expense_subcategories (id, name),
              supplier:suppliers (id, name)
            `)
            .eq('user_id', user.id)
            .order('expense_date', { ascending: false })

          if (currentCashierId) query = query.eq('cashier_id', currentCashierId)
          if (dateFrom) query = query.gte('expense_date', dateFrom)
          if (dateTo) query = query.lte('expense_date', dateTo)
          if (categoryFilter !== 'All') query = query.eq('category_id', categoryFilter)
          if (subcategoryFilter !== 'All') query = query.eq('subcategory_id', subcategoryFilter)
          if (paymentFilter !== 'All') query = query.eq('payment_method', paymentFilter)

          return query.limit(200)
        })(),

        supabase.from('expense_categories').select('id, name, description').eq('user_id', user.id).order('name'),
        supabase.from('expense_subcategories').select('id, name, category_id').eq('user_id', user.id).order('name')
      ])

      if (expensesResult.error) notify.error(`Failed to fetch expenses: ${expensesResult.error.message}`)
      if (categoriesResult.error) notify.error(`Failed to fetch categories: ${categoriesResult.error.message}`)

      const sorted = (expensesResult.data || []).sort((a, b) => {
        if (a.expense_date !== b.expense_date) return b.expense_date.localeCompare(a.expense_date)
        return (b.expense_time || '').localeCompare(a.expense_time || '')
      })

      setExpenses(sorted)
      setCategories(categoriesResult.data || [])
      setSubcategories(subcategoriesResult.data || [])

      // Cache for offline use
      localStorage.setItem(EXPENSE_CACHE.all, JSON.stringify(sorted))
      localStorage.setItem(EXPENSE_CACHE.categories, JSON.stringify(categoriesResult.data || []))
      localStorage.setItem(EXPENSE_CACHE.subcategories, JSON.stringify(subcategoriesResult.data || []))

      fetchPaymentAccounts()
      fetchSuppliers()
    } catch (error) {
      console.error('Error fetching expense data:', error)
      notify.error(`Failed to load data: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const fetchExpenses = async () => {
    try {
      if (!user?.id) return
      const currentCashierId = authManager.getCashier()?.id
      let query = supabase
        .from('expenses')
        .select(`
          id, amount, description, payment_method, expense_date, expense_time,
          tax_rate, tax_amount, total_amount, created_at, category_id, subcategory_id,
          category:expense_categories (id, name),
          subcategory:expense_subcategories (id, name)
        `)
        .eq('user_id', user.id)
        .order('expense_date', { ascending: false })

      if (currentCashierId) query = query.eq('cashier_id', currentCashierId)
      if (dateFrom) query = query.gte('expense_date', dateFrom)
      if (dateTo) query = query.lte('expense_date', dateTo)
      if (categoryFilter !== 'All') query = query.eq('category_id', categoryFilter)
      if (subcategoryFilter !== 'All') query = query.eq('subcategory_id', subcategoryFilter)
      if (paymentFilter !== 'All') query = query.eq('payment_method', paymentFilter)

      const { data } = await query.limit(200)
      const sorted = (data || []).sort((a, b) => {
        if (a.expense_date !== b.expense_date) return b.expense_date.localeCompare(a.expense_date)
        return (b.expense_time || '').localeCompare(a.expense_time || '')
      })
      setExpenses(sorted)
    } catch (error) {
      console.error('Error fetching expenses:', error)
    }
  }

  const fetchCategories = async () => {
    try {
      if (!user?.id) return
      const { data, error } = await supabase
        .from('expense_categories')
        .select('id, name, description')
        .eq('user_id', user.id)
        .order('name')
      if (error) throw error
      setCategories(data || [])
    } catch (error) {
      console.error('Error fetching categories:', error)
      notify.error(`Failed to fetch categories: ${error.message}`)
    }
  }

  const fetchSubcategories = async () => {
    try {
      if (!user?.id) return
      const { data } = await supabase
        .from('expense_subcategories')
        .select('id, name, category_id')
        .eq('user_id', user.id)
        .order('name')
      setSubcategories(data || [])
    } catch (e) {
      console.error(e)
    }
  }

  const resolveDrawerEnabled = () => {
    const u = authManager.getCurrentUser()
    if (u?.use_cashier_drawer !== undefined) return !!u.use_cashier_drawer
    try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false }
  }

  const fetchPaymentAccounts = async () => {
    try {
      if (!user?.id) return
      const cashier = authManager.getCashier()
      const drawerEnabled = resolveDrawerEnabled()
      if (drawerEnabled && cashier?.id) {
        const { data: cashierAccounts, error } = await supabase
          .from('payment_accounts')
          .select('*')
          .eq('cashier_id', cashier.id)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        if (!error && cashierAccounts && cashierAccounts.length > 0) {
          setPaymentAccounts(cashierAccounts)
          localStorage.setItem(EXPENSE_CACHE.accounts, JSON.stringify(cashierAccounts))
          return
        }
      }
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('user_id', user.id)
        .is('cashier_id', null)
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (error) throw error
      if (!data || data.length === 0) {
        await supabase.rpc('initialize_default_payment_accounts', { p_user_id: user.id })
        const { data: newAccounts } = await supabase
          .from('payment_accounts')
          .select('*')
          .eq('user_id', user.id)
          .is('cashier_id', null)
          .eq('is_active', true)
          .order('sort_order', { ascending: true })
        setPaymentAccounts(newAccounts || [])
        localStorage.setItem(EXPENSE_CACHE.accounts, JSON.stringify(newAccounts || []))
      } else {
        setPaymentAccounts(data)
        localStorage.setItem(EXPENSE_CACHE.accounts, JSON.stringify(data))
      }
    } catch (error) {
      console.error('Error fetching payment accounts:', error)
    }
  }

  const fetchSuppliers = async () => {
    try {
      if (!user?.id) return
      const { data } = await supabase.from('suppliers').select('id, name').eq('user_id', user.id).order('name')
      setSuppliers(data || [])
    } catch { /* silent */ }
  }

  // ─── Expense CRUD ──────────────────────────────────────────────────────────
  const calculateTotalAmount = () => {
    const amount = parseFloat(expenseForm.amount) || 0
    return amount + (amount * expenseForm.taxRate) / 100
  }

  const handleSaveExpense = async () => {
    try {
      const effectivePaymentMethod = expenseForm.supplierId ? 'Unpaid' : expenseForm.paymentMethod
      if (!expenseForm.amount || !expenseForm.categoryId || !effectivePaymentMethod) {
        notify.warning('Please fill in all required fields')
        return
      }
      const amount = parseFloat(expenseForm.amount)
      const taxAmount = (amount * expenseForm.taxRate) / 100
      const totalAmount = amount + taxAmount
      const expenseData = {
        user_id: user.id,
        cashier_id: authManager.getCashier()?.id || null,
        amount,
        category_id: expenseForm.categoryId,
        subcategory_id: expenseForm.subcategoryId || null,
        description: expenseForm.description,
        payment_method: effectivePaymentMethod,
        payment_account_id: expenseForm.supplierId ? null : (expenseForm.paymentAccountId || null),
        supplier_id: expenseForm.supplierId || null,
        tax_rate: expenseForm.taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        expense_date: expenseForm.expenseDate,
        expense_time: new Date().toTimeString().split(' ')[0]
      }

      if (!cacheManager.checkOnlineStatus()) {
        const pendingRaw = localStorage.getItem(EXPENSE_CACHE.pending)
        const pending = pendingRaw ? JSON.parse(pendingRaw) : []
        const tempId = `offline_${Date.now()}`
        const offlineExpense = {
          ...expenseData,
          id: editingExpense ? editingExpense.id : tempId,
          category: categories.find(c => c.id === expenseForm.categoryId) || null,
          subcategory: subcategories.find(s => s.id === expenseForm.subcategoryId) || null,
          _isOffline: true,
          _isTemp: !editingExpense,
        }
        const filtered = pending.filter(op => !(op.type !== 'delete' && op.id === (editingExpense?.id || tempId)))
        filtered.push({ type: editingExpense ? 'update' : 'insert', id: offlineExpense.id, data: expenseData })
        localStorage.setItem(EXPENSE_CACHE.pending, JSON.stringify(filtered))
        const allCached = JSON.parse(localStorage.getItem(EXPENSE_CACHE.all) || '[]')
        if (editingExpense) {
          const idx = allCached.findIndex(e => e.id === editingExpense.id)
          if (idx >= 0) allCached[idx] = offlineExpense; else allCached.unshift(offlineExpense)
        } else {
          allCached.unshift(offlineExpense)
        }
        localStorage.setItem(EXPENSE_CACHE.all, JSON.stringify(allCached))
        setExpenses(filterCachedExpenses(allCached))
        setShowAddExpense(false); setEditingExpense(null); resetExpenseForm()
        countPending()
        notify.success(`Expense ${editingExpense ? 'updated' : 'saved'} offline — will sync when connected.`)
        return
      }

      if (editingExpense) {
        const { error } = await supabase.from('expenses').update(expenseData).eq('id', editingExpense.id)
        if (error) throw error
      } else {
        const { data: newExpense, error } = await supabase.from('expenses').insert(expenseData).select().single()
        if (error) throw error

        // Create supplier ledger debit entry if linked to a supplier
        if (expenseForm.supplierId && newExpense) {
          const { data: lastEntry } = await supabase
            .from('supplier_ledger')
            .select('balance_after')
            .eq('supplier_id', expenseForm.supplierId)
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1).maybeSingle()

          const balanceBefore = parseFloat(lastEntry?.balance_after ?? 0)
          const balanceAfter  = balanceBefore + totalAmount

          const selectedCat = categories.find(c => c.id === expenseForm.categoryId)
          const { error: ledgerError } = await supabase.from('supplier_ledger').insert({
            user_id:          user.id,
            supplier_id:      expenseForm.supplierId,
            transaction_type: 'debit',
            transaction_date: expenseForm.expenseDate,
            amount:           totalAmount,
            balance_before:   balanceBefore,
            balance_after:    balanceAfter,
            description:      expenseForm.description || `Expense: ${selectedCat?.name || 'Uncategorized'}`,
            created_by:       user.id,
          })
          if (ledgerError) throw ledgerError
        }
      }
      setShowAddExpense(false)
      setEditingExpense(null)
      resetExpenseForm()
      fetchExpenses()
      notify.success(editingExpense ? 'Expense updated successfully' : 'Expense added successfully')
    } catch (error) {
      const msg = error?.message || error?.details || JSON.stringify(error) || 'Unknown error'
      console.error('Error saving expense:', msg)
      notify.error(`Failed to save expense: ${msg}`)
    }
  }

  const handleDeleteExpense = (expenseId) => {
    setConfirmDelete({ show: true, expenseId })
  }

  const confirmDeleteExpense = async () => {
    if (!cacheManager.checkOnlineStatus()) {
      const expenseId = confirmDelete.expenseId
      const isTemp = String(expenseId).startsWith('offline_')
      const pending = JSON.parse(localStorage.getItem(EXPENSE_CACHE.pending) || '[]')
      const filtered = pending.filter(op => op.id !== expenseId)
      if (!isTemp) filtered.push({ type: 'delete', id: expenseId })
      localStorage.setItem(EXPENSE_CACHE.pending, JSON.stringify(filtered))
      const allCached = JSON.parse(localStorage.getItem(EXPENSE_CACHE.all) || '[]').filter(e => e.id !== expenseId)
      localStorage.setItem(EXPENSE_CACHE.all, JSON.stringify(allCached))
      setExpenses(prev => prev.filter(e => e.id !== expenseId))
      setConfirmDelete({ show: false, expenseId: null }); setSelectedExpense(null)
      countPending()
      notify.success('Expense deleted offline — will sync when connected.')
      return
    }
    setIsDeleting(true)
    try {
      const { error } = await supabase.from('expenses').delete().eq('id', confirmDelete.expenseId)
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

  const syncPendingExpenses = async () => {
    if (!user?.id) return
    const pendingRaw = localStorage.getItem(EXPENSE_CACHE.pending)
    if (!pendingRaw) return
    let pending
    try { pending = JSON.parse(pendingRaw) } catch { return }
    if (!pending.length) return

    const failed = []
    for (const op of pending) {
      try {
        if (op.type === 'insert') {
          const { error } = await supabase.from('expenses').insert(op.data)
          if (error) throw error
        } else if (op.type === 'update') {
          const { error } = await supabase.from('expenses').update(op.data).eq('id', op.id)
          if (error) throw error
        } else if (op.type === 'delete') {
          const { error } = await supabase.from('expenses').delete().eq('id', op.id)
          if (error) throw error
        }
      } catch (e) { failed.push(op) }
    }

    if (failed.length === 0) {
      localStorage.removeItem(EXPENSE_CACHE.pending)
      setPendingCount(0)
      notify.success(`Synced ${pending.length} expense${pending.length > 1 ? 's' : ''} successfully.`)
    } else {
      localStorage.setItem(EXPENSE_CACHE.pending, JSON.stringify(failed))
      setPendingCount(failed.length)
      notify.warning(`${pending.length - failed.length} synced, ${failed.length} failed.`)
    }
    if (isAuthenticated) fetchData()
  }

  const resetExpenseForm = () => {
    setExpenseForm({
      amount: '',
      categoryId: '',
      subcategoryId: '',
      description: '',
      paymentMethod: '',
      paymentAccountId: '',
      supplierId: '',
      taxRate: 0,
      expenseDate: localDateStr(new Date())
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
      paymentAccountId: expense.payment_account_id || '',
      supplierId: expense.supplier_id || '',
      taxRate: expense.tax_rate || 0,
      expenseDate: expense.expense_date
    })
    setShowAddExpense(true)
  }

  // ─── Category CRUD ─────────────────────────────────────────────────────────
  const handleSaveCategory = async () => {
    if (!cacheManager.checkOnlineStatus()) { notify.warning('Category management requires internet connection.'); return }
    if (isSavingCategory) return
    try {
      if (!categoryForm.name) { notify.warning('Category name is required'); return }
      if (!user?.id) { notify.error('User not authenticated'); return }
      setIsSavingCategory(true)

      const { data: category, error: categoryError } = await supabase
        .from('expense_categories')
        .insert({ user_id: user.id, name: categoryForm.name.trim(), description: categoryForm.description?.trim() || null })
        .select()
        .single()

      if (categoryError) {
        notify.error(`Failed to save: ${categoryError.message || 'Unknown error'}`)
        return
      }

      const nonEmpty = categoryForm.subcategories.filter(s => s.trim())
      for (const subcat of nonEmpty) {
        await supabase.from('expense_subcategories').insert({
          user_id: user.id,
          category_id: category.id,
          name: subcat.trim()
        })
      }

      setCategoryForm({ name: '', description: '', subcategories: [''] })
      setCategoryTab('list')
      await fetchCategories()
      await fetchSubcategories()
      notify.success('Category created successfully!')
    } catch (error) {
      notify.error(`Unexpected error: ${error.message || 'Please try again'}`)
    } finally {
      setIsSavingCategory(false)
    }
  }

  const handleUpdateCategory = async () => {
    if (!editingCategoryInline) return
    try {
      if (!editingCategoryInline.name.trim()) { notify.warning('Category name cannot be empty'); return }
      const { error } = await supabase
        .from('expense_categories')
        .update({ name: editingCategoryInline.name.trim(), description: editingCategoryInline.description?.trim() || null })
        .eq('id', editingCategoryInline.id)
      if (error) throw error
      setEditingCategoryInline(null)
      await fetchCategories()
      notify.success('Category updated')
    } catch (error) {
      notify.error(`Failed to update: ${error.message}`)
    }
  }

  const handleDeleteCategory = async () => {
    if (!confirmDeleteCategory.categoryId) return
    setIsDeletingCategory(true)
    try {
      // Delete subcategories first
      await supabase.from('expense_subcategories').delete().eq('category_id', confirmDeleteCategory.categoryId)
      const { error } = await supabase.from('expense_categories').delete().eq('id', confirmDeleteCategory.categoryId)
      if (error) throw error
      setConfirmDeleteCategory({ show: false, categoryId: null, name: '' })
      await fetchCategories()
      await fetchSubcategories()
      notify.success('Category deleted')
    } catch (error) {
      notify.error(`Failed to delete: ${error.message}`)
    } finally {
      setIsDeletingCategory(false)
    }
  }

  const handleDeleteSubcategory = async () => {
    if (!confirmDeleteSubcategory.subcategoryId) return
    setIsDeletingSubcategory(true)
    try {
      const { error } = await supabase
        .from('expense_subcategories')
        .delete()
        .eq('id', confirmDeleteSubcategory.subcategoryId)
      if (error) throw error
      setConfirmDeleteSubcategory({ show: false, subcategoryId: null, name: '' })
      await fetchSubcategories()
      notify.success('Subcategory deleted')
    } catch (error) {
      notify.error(`Failed to delete: ${error.message}`)
    } finally {
      setIsDeletingSubcategory(false)
    }
  }

  const handleAddSubcategoryToExisting = async (categoryId) => {
    const name = (newSubcatInputs[categoryId] || '').trim()
    if (!name) { notify.warning('Enter a subcategory name'); return }
    setSavingSubcat(prev => ({ ...prev, [categoryId]: true }))
    try {
      const { error } = await supabase.from('expense_subcategories').insert({
        user_id: user.id,
        category_id: categoryId,
        name
      })
      if (error) throw error
      setNewSubcatInputs(prev => ({ ...prev, [categoryId]: '' }))
      await fetchSubcategories()
      notify.success('Subcategory added')
    } catch (error) {
      notify.error(`Failed to add: ${error.message}`)
    } finally {
      setSavingSubcat(prev => ({ ...prev, [categoryId]: false }))
    }
  }

  // ─── Payment method helpers ────────────────────────────────────────────────
  const METHOD_KEY_ICON = {
    cash: DollarSign, easypaisa: Smartphone, jazzcash: Smartphone,
    bank: Building, card: DollarSign, 'petty cash': Wallet
  }
  const METHOD_KEY_COLOR = {
    cash: 'from-green-500 to-green-600', easypaisa: 'from-green-600 to-green-700',
    jazzcash: 'from-orange-500 to-red-600', bank: 'from-blue-500 to-indigo-600',
    card: 'from-purple-500 to-indigo-600', 'petty cash': 'from-purple-500 to-indigo-600'
  }

  const getPaymentMethodIcon = (method) => {
    const acct = paymentAccounts.find(a => a.name === method)
    if (acct) return METHOD_KEY_ICON[acct.payment_method_key?.toLowerCase()] || Wallet
    return METHOD_KEY_ICON[method?.toLowerCase()] || DollarSign
  }

  const getPaymentMethodColor = (method) => {
    const acct = paymentAccounts.find(a => a.name === method)
    if (acct) return METHOD_KEY_COLOR[acct.payment_method_key?.toLowerCase()] || 'from-gray-500 to-gray-600'
    return METHOD_KEY_COLOR[method?.toLowerCase()] || 'from-gray-500 to-gray-600'
  }

  const getTotalExpenses = () =>
    expenses.reduce((sum, e) => sum + parseFloat(e.total_amount || e.amount), 0)

  // Client-side search filter
  const filteredExpenses = expenses.filter(expense => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return (
      expense.description?.toLowerCase().includes(q) ||
      expense.category?.name?.toLowerCase().includes(q) ||
      expense.subcategory?.name?.toLowerCase().includes(q)
    )
  })

  // Subcategories filtered by selected category
  const filteredSubcatOptions = categoryFilter === 'All'
    ? subcategories
    : subcategories.filter(s => s.category_id === categoryFilter)

  // ─── PIN gate ──────────────────────────────────────────────────────────────
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
              <PinPad pin={pin} onPinChange={setPin} onSubmit={verifyPin} error={pinError} loading={pinLoading} />
            </div>
          </div>
        </div>
      </ProtectedPage>
    )
  }

  // ─── Main layout ───────────────────────────────────────────────────────────
  return (
    <ProtectedPage permissionKey="EXPENSES" pageName="Expenses">
      <div className={`h-screen flex ${componentStyles.page} overflow-hidden text-sm`}>

        {/* ── Left Panel ──────────────────────────────────────────────────── */}
        <div className={`w-80 ${themeClasses.card} ${themeClasses.shadow} ${themeClasses.border} border-r flex flex-col`}>

          {/* Gradient header */}
          <div className="p-2 border-b border-gray-200/50 bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600">
            {/* Top row: back + theme toggle + settings + add */}
            <div className="flex items-center justify-between mb-2">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push('/dashboard')}
                className="flex items-center text-white/90 hover:text-white transition-all"
              >
                <div className="w-7 h-7 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center mr-2 transition-all">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="text-xs font-semibold">Dashboard</span>
              </motion.button>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => { themeManager.toggleTheme?.(); window.location.reload() }}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  title="Toggle theme"
                >
                  {isDark ? <Sun className="w-3.5 h-3.5 text-white" /> : <Moon className="w-3.5 h-3.5 text-white" />}
                </button>
                <button
                  onClick={() => { setShowCategoryModal(true); setCategoryTab('list') }}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  title="Manage categories"
                >
                  <Settings className="w-3.5 h-3.5 text-white" />
                </button>
                <button
                  onClick={() => setShowAddExpense(true)}
                  className="p-1.5 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
                  title="Add expense"
                >
                  <Plus className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
            </div>

            <div className="mb-2">
              <h1 className="text-base font-bold text-white">Expense Manager</h1>
              <p className="text-purple-100 text-xs">Track and manage expenses</p>
            </div>

            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 w-3.5 h-3.5" />
              <input
                type="text"
                placeholder="Search expenses..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border focus:ring-1 focus:ring-white/30
                  ${isDark
                    ? 'bg-gray-700/90 border-gray-600 text-white placeholder-gray-400'
                    : 'bg-white/90 border-white/20 text-gray-800 placeholder-gray-500'
                  }`}
              />
            </div>
          </div>

          {/* Offline / pending sync banner */}
          {(!isOnline || pendingCount > 0) && (
            <div className={`px-2 py-1.5 flex items-center justify-between text-xs ${!isOnline ? 'bg-amber-500/10 border-b border-amber-500/20' : 'bg-blue-500/10 border-b border-blue-500/20'}`}>
              <span className={!isOnline ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400'}>
                {!isOnline ? 'Offline — showing cached data' : `${pendingCount} expense${pendingCount > 1 ? 's' : ''} pending sync`}
              </span>
              {isOnline && pendingCount > 0 && (
                <button onClick={syncPendingExpenses} className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">Sync now</button>
              )}
            </div>
          )}

          {/* Filter row */}
          <div className={`p-2 space-y-1.5 ${isDark ? 'bg-gray-700/80' : 'bg-gray-50/80'} ${themeClasses.border} border-b`}>
            {/* Date preset */}
            <select
              value={datePreset}
              onChange={(e) => handleDatePresetChange(e.target.value)}
              className={`w-full text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this_week">This Week</option>
              <option value="this_month">This Month</option>
              <option value="last_month">Last Month</option>
              <option value="custom">Custom Range</option>
            </select>

            {/* Custom date inputs */}
            {datePreset === 'custom' && (
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className={`text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
                />
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className={`text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
                />
              </div>
            )}

            {/* Category filter */}
            <select
              value={categoryFilter}
              onChange={(e) => { setCategoryFilter(e.target.value); setSubcategoryFilter('All') }}
              className={`w-full text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
            >
              <option value="All">All Categories</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
            </select>

            {/* Subcategory filter */}
            <select
              value={subcategoryFilter}
              onChange={(e) => setSubcategoryFilter(e.target.value)}
              className={`w-full text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
            >
              <option value="All">All Subcategories</option>
              {filteredSubcatOptions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>

            {/* Payment filter */}
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className={`w-full text-xs ${themeClasses.input} border ${themeClasses.border} rounded px-2 py-1`}
            >
              <option value="All">All Payment Methods</option>
              {paymentAccounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
            </select>

            {/* Summary row */}
            <div className="flex items-center justify-between pt-0.5">
              <span className={`text-xs ${themeClasses.textSecondary}`}>{filteredExpenses.length} expense{filteredExpenses.length !== 1 ? 's' : ''}</span>
              <span className={`text-xs font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                PKR {getTotalExpenses().toFixed(2)}
              </span>
            </div>
          </div>

          {/* Expense list */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-2 space-y-1.5">
                {[...Array(6)].map((_, i) => (
                  <div key={i} className={`p-2 rounded-lg border ${themeClasses.border} animate-pulse`}>
                    <div className="flex justify-between mb-1.5">
                      <div className={`h-3 w-24 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                      <div className={`h-3 w-16 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                    </div>
                    <div className={`h-2.5 w-32 rounded ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`} />
                  </div>
                ))}
              </div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-10 px-4">
                <Receipt className={`w-10 h-10 ${themeClasses.textSecondary} mx-auto mb-2`} />
                <p className={`text-sm font-semibold ${themeClasses.textSecondary}`}>No expenses found</p>
                <p className={`text-xs ${themeClasses.textSecondary} mt-1`}>Try adjusting filters</p>
              </div>
            ) : (
              <div className="p-2 space-y-1.5">
                {filteredExpenses.map((expense) => {
                  const PaymentIcon = getPaymentMethodIcon(expense.payment_method)
                  return (
                    <motion.div
                      key={expense.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedExpense(expense)}
                      className={`p-2 rounded-lg border cursor-pointer transition-all ${
                        selectedExpense?.id === expense.id
                          ? `${isDark ? 'bg-purple-900/50 border-purple-600' : 'bg-purple-50 border-purple-200'}`
                          : `${themeClasses.card} ${themeClasses.border} ${themeClasses.hover}`
                      }`}
                    >
                      {/* Row 1: icon + category + subcategory + date | amount + payment */}
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center min-w-0 flex-1">
                          <div className={`w-6 h-6 rounded-md bg-gradient-to-r ${getPaymentMethodColor(expense.payment_method)} flex items-center justify-center mr-2 flex-shrink-0`}>
                            <PaymentIcon className="w-3 h-3 text-white" />
                          </div>
                          <div className="min-w-0">
                            <p className={`font-semibold text-xs ${themeClasses.textPrimary} truncate`}>
                              {expense.category?.name || 'Uncategorized'}
                              {expense.subcategory?.name && (
                                <span className={`font-normal ${themeClasses.textSecondary}`}> · {expense.subcategory.name}</span>
                              )}
                            </p>
                            <p className={`text-xs ${themeClasses.textSecondary}`}>{expense.expense_date}</p>
                          </div>
                        </div>
                        <div className="text-right flex-shrink-0 ml-2">
                          <p className={`font-bold text-xs ${themeClasses.textPrimary}`}>
                            PKR {parseFloat(expense.total_amount || expense.amount).toFixed(2)}
                          </p>
                          <p className={`text-xs ${themeClasses.textSecondary} truncate max-w-[70px]`}>{expense.payment_method}</p>
                        </div>
                      </div>

                      {/* Row 2: time + actions */}
                      <div className="flex items-center justify-between">
                        <span className={`text-xs ${themeClasses.textSecondary}`}>{expense.expense_time || ''}</span>
                        <div className="flex gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); openEditExpense(expense) }}
                            className="p-0.5 text-blue-500 hover:text-blue-700 rounded transition-colors"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteExpense(expense.id) }}
                            className="p-0.5 text-red-500 hover:text-red-700 rounded transition-colors"
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

        {/* ── Right Panel ─────────────────────────────────────────────────── */}
        <div className={`flex-1 flex flex-col ${themeClasses.card} backdrop-blur-xl`}>
          {selectedExpense ? (
            <>
              {/* Header */}
              <div className={`p-6 ${themeClasses.border} border-b ${isDark ? 'bg-gray-700/80' : 'bg-gray-50/80'}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-r ${getPaymentMethodColor(selectedExpense.payment_method)} flex items-center justify-center mr-4`}>
                      {React.createElement(getPaymentMethodIcon(selectedExpense.payment_method), { className: 'w-6 h-6 text-white' })}
                    </div>
                    <div>
                      <h2 className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                        {selectedExpense.category?.name || 'Uncategorized'}
                      </h2>
                      <p className={themeClasses.textSecondary}>
                        {selectedExpense.subcategory?.name && `${selectedExpense.subcategory.name} · `}
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

              {/* Details */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Payment Info */}
                  <div className={`${themeClasses.card} rounded-2xl p-6 ${themeClasses.border} border`}>
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

                  {/* Category Info */}
                  <div className={`${themeClasses.card} rounded-2xl p-6 ${themeClasses.border} border`}>
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
                    <div className={`${themeClasses.card} rounded-2xl p-6 ${themeClasses.border} border`}>
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

        {/* ── Add/Edit Expense Slide-in ────────────────────────────────────── */}
        <AnimatePresence>
          {showAddExpense && (
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              className={`fixed inset-y-0 right-0 w-96 ${themeClasses.card} ${themeClasses.shadow} z-50 flex flex-col`}
            >
              {/* Slide-in header */}
              <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-bold text-white">
                    {editingExpense ? 'Edit Expense' : 'Add New Expense'}
                  </h3>
                  <button
                    onClick={() => { setShowAddExpense(false); setEditingExpense(null); resetExpenseForm() }}
                    className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
              </div>

              {/* Form */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Amount */}
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Amount (PKR) *</label>
                  <input
                    type="number"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg font-semibold`}
                    placeholder="0.00"
                  />
                </div>

                {/* Category */}
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Category *</label>
                  <select
                    value={expenseForm.categoryId}
                    onChange={(e) => setExpenseForm({ ...expenseForm, categoryId: e.target.value, subcategoryId: '' })}
                    className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500`}
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                {/* Subcategory */}
                {expenseForm.categoryId && (
                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Subcategory</label>
                    <select
                      value={expenseForm.subcategoryId}
                      onChange={(e) => setExpenseForm({ ...expenseForm, subcategoryId: e.target.value })}
                      className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500`}
                    >
                      <option value="">Select Subcategory</option>
                      {subcategories
                        .filter(s => s.category_id === expenseForm.categoryId)
                        .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                )}

                {/* Link to Supplier (optional) */}
                {suppliers.length > 0 && (
                  <div>
                    <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>
                      Link to Supplier
                      <span className={`ml-2 text-xs font-normal ${themeClasses.textSecondary}`}>optional — marks as unpaid in supplier ledger</span>
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setExpenseForm(f => ({ ...f, supplierId: '', paymentMethod: f.supplierId ? '' : f.paymentMethod }))}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                          !expenseForm.supplierId
                            ? 'bg-gray-500 border-gray-500 text-white'
                            : isDark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:border-gray-500' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'
                        }`}
                      >
                        None
                      </button>
                      {suppliers.map(s => (
                        <button
                          key={s.id}
                          onClick={() => setExpenseForm(f => ({ ...f, supplierId: s.id, paymentMethod: 'Unpaid', paymentAccountId: '' }))}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                            expenseForm.supplierId === s.id
                              ? 'bg-indigo-600 border-indigo-600 text-white shadow-sm'
                              : isDark ? 'bg-gray-700 border-gray-600 text-gray-200 hover:border-indigo-500' : 'bg-white border-gray-200 text-gray-700 hover:border-indigo-400'
                          }`}
                        >
                          <Truck className="w-3 h-3" />
                          {s.name}
                        </button>
                      ))}
                    </div>
                    {expenseForm.supplierId && (
                      <p className={`mt-1.5 text-xs ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                        This expense will be recorded as unpaid in the supplier ledger. Pay via Suppliers → Record Payment.
                      </p>
                    )}
                  </div>
                )}

                {/* Pay From Account */}
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
                    {expenseForm.supplierId ? 'Payment' : 'Pay From Account *'}
                  </label>
                  {expenseForm.supplierId ? (
                    <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 ${isDark ? 'bg-amber-900/20 border-amber-700' : 'bg-amber-50 border-amber-300'}`}>
                      <Clock className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
                      <span className={`text-sm font-semibold ${isDark ? 'text-amber-300' : 'text-amber-700'}`}>Unpaid — linked to supplier</span>
                    </div>
                  ) : paymentAccounts.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {paymentAccounts.map((account) => (
                        <button
                          key={account.id}
                          onClick={() => setExpenseForm({ ...expenseForm, paymentAccountId: account.id, paymentMethod: account.name })}
                          className={`p-3 rounded-xl border-2 transition-all ${
                            expenseForm.paymentAccountId === account.id
                              ? `border-purple-500 ${isDark ? 'bg-purple-900/50' : 'bg-purple-50'}`
                              : `${themeClasses.border} ${themeClasses.hover} ${themeClasses.card}`
                          }`}
                        >
                          <div className="flex flex-col items-center">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center mb-1.5" style={{ backgroundColor: (account.color || '#6366f1') + '30' }}>
                              <Wallet className="w-4 h-4" style={{ color: account.color || '#6366f1' }} />
                            </div>
                            <span className={`text-xs font-medium ${themeClasses.textPrimary}`}>{account.name}</span>
                            <span className={`text-xs ${themeClasses.textSecondary}`}>
                              PKR {parseFloat(account.current_balance || 0).toLocaleString()}
                            </span>
                          </div>
                        </button>
                      ))}
                      <button
                        onClick={() => setExpenseForm({ ...expenseForm, paymentAccountId: '', paymentMethod: 'Unpaid' })}
                        className={`p-3 rounded-xl border-2 transition-all ${
                          expenseForm.paymentMethod === 'Unpaid'
                            ? `border-purple-500 ${isDark ? 'bg-purple-900/50' : 'bg-purple-50'}`
                            : `${themeClasses.border} ${themeClasses.hover} ${themeClasses.card}`
                        }`}
                      >
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 bg-gradient-to-r from-gray-500 to-gray-600 rounded-lg flex items-center justify-center mb-1.5">
                            <Clock className="w-4 h-4 text-white" />
                          </div>
                          <span className={`text-xs font-medium ${themeClasses.textPrimary}`}>Unpaid</span>
                        </div>
                      </button>
                    </div>
                  ) : (
                    <div className={`text-xs ${themeClasses.textSecondary} text-center py-4`}>Loading accounts...</div>
                  )}
                </div>

                {/* Tax Rate */}
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Tax Rate (%)</label>
                  <input
                    type="number"
                    value={expenseForm.taxRate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, taxRate: parseFloat(e.target.value) || 0 })}
                    className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500`}
                    placeholder="0"
                    min="0"
                    max="100"
                    step="0.01"
                  />
                </div>

                {/* Total preview */}
                {expenseForm.amount && (
                  <div className={`rounded-xl p-3 border ${isDark ? 'bg-green-900/50 border-green-700' : 'bg-green-50 border-green-200'}`}>
                    <h4 className={`font-semibold text-sm ${isDark ? 'text-green-300' : 'text-green-900'} mb-1.5`}>Total Calculation</h4>
                    <div className="space-y-1 text-xs">
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
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Expense Date *</label>
                  <input
                    type="date"
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500`}
                  />
                </div>

                {/* Description */}
                <div>
                  <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-1.5`}>Description</label>
                  <textarea
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                    className={`w-full px-4 py-3 ${themeClasses.input} border rounded-xl focus:ring-2 focus:ring-purple-500 resize-none`}
                    rows="3"
                    placeholder="Enter expense description..."
                  />
                </div>
              </div>

              {/* Footer */}
              <div className={`p-4 ${themeClasses.border} border-t ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                <div className="flex space-x-3">
                  <button
                    onClick={() => { setShowAddExpense(false); setEditingExpense(null); resetExpenseForm() }}
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

        {/* ── Category Management Modal ────────────────────────────────────── */}
        <Modal
          isOpen={showCategoryModal}
          onClose={() => setShowCategoryModal(false)}
          title="Category Management"
          maxWidth="max-w-xl"
        >
          {/* Tab bar */}
          <div className={`flex rounded-lg overflow-hidden border ${themeClasses.border} mb-4`}>
            {[{ id: 'list', label: 'All Categories' }, { id: 'new', label: 'New Category' }].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCategoryTab(tab.id)}
                className={`flex-1 py-2 text-xs font-semibold transition-colors ${
                  categoryTab === tab.id
                    ? 'bg-gradient-to-r from-purple-600 to-blue-600 text-white'
                    : `${themeClasses.card} ${themeClasses.textSecondary} ${themeClasses.hover}`
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ── All Categories tab ── */}
          {categoryTab === 'list' && (
            <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
              {categories.length === 0 ? (
                <div className={`text-center py-8 ${themeClasses.textSecondary} text-sm`}>
                  No categories yet. Create one in the "New Category" tab.
                </div>
              ) : (
                categories.map(cat => {
                  const catSubcats = subcategories.filter(s => s.category_id === cat.id)
                  const isExpanded = expandedCategories.has(cat.id)
                  const isEditing = editingCategoryInline?.id === cat.id

                  return (
                    <div key={cat.id} className={`rounded-lg border ${themeClasses.border} overflow-hidden`}>
                      {/* Category row */}
                      <div className={`flex items-center gap-2 p-2.5 ${isDark ? 'bg-gray-700/60' : 'bg-gray-50'}`}>
                        {isEditing ? (
                          <input
                            type="text"
                            value={editingCategoryInline.name}
                            onChange={(e) => setEditingCategoryInline({ ...editingCategoryInline, name: e.target.value })}
                            className={`flex-1 text-xs px-2 py-1 rounded border ${themeClasses.input} ${themeClasses.border}`}
                            autoFocus
                            onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateCategory(); if (e.key === 'Escape') setEditingCategoryInline(null) }}
                          />
                        ) : (
                          <span className={`flex-1 text-xs font-semibold ${themeClasses.textPrimary} truncate`}>{cat.name}</span>
                        )}

                        <div className="flex items-center gap-1 flex-shrink-0">
                          {isEditing ? (
                            <>
                              <button onClick={handleUpdateCategory} className="p-1 text-green-500 hover:text-green-700 rounded transition-colors" title="Save">
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button onClick={() => setEditingCategoryInline(null)} className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors" title="Cancel">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setEditingCategoryInline({ id: cat.id, name: cat.name, description: cat.description || '' })}
                              className="p-1 text-blue-500 hover:text-blue-700 rounded transition-colors"
                              title="Edit"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setConfirmDeleteCategory({ show: true, categoryId: cat.id, name: cat.name })}
                            className="p-1 text-red-500 hover:text-red-700 rounded transition-colors"
                            title="Delete category"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              const next = new Set(expandedCategories)
                              if (next.has(cat.id)) next.delete(cat.id)
                              else next.add(cat.id)
                              setExpandedCategories(next)
                            }}
                            className={`p-1 ${themeClasses.textSecondary} hover:text-gray-700 rounded transition-colors`}
                            title={isExpanded ? 'Collapse' : 'Expand subcategories'}
                          >
                            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {/* Subcategories panel */}
                      {isExpanded && (
                        <div className={`px-3 pb-2 pt-1.5 space-y-1 ${isDark ? 'bg-gray-800/50' : 'bg-white'}`}>
                          {catSubcats.length === 0 ? (
                            <p className={`text-xs ${themeClasses.textSecondary} py-1`}>No subcategories yet.</p>
                          ) : (
                            catSubcats.map(sub => (
                              <div key={sub.id} className={`flex items-center justify-between py-1 px-2 rounded ${isDark ? 'bg-gray-700/40' : 'bg-gray-50'}`}>
                                <span className={`text-xs ${themeClasses.textPrimary}`}>{sub.name}</span>
                                <button
                                  onClick={() => setConfirmDeleteSubcategory({ show: true, subcategoryId: sub.id, name: sub.name })}
                                  className="p-0.5 text-red-400 hover:text-red-600 rounded transition-colors"
                                  title="Delete subcategory"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            ))
                          )}

                          {/* Add subcategory input */}
                          <div className="flex gap-1.5 mt-1.5">
                            <input
                              type="text"
                              value={newSubcatInputs[cat.id] || ''}
                              onChange={(e) => setNewSubcatInputs(prev => ({ ...prev, [cat.id]: e.target.value }))}
                              onKeyDown={(e) => { if (e.key === 'Enter') handleAddSubcategoryToExisting(cat.id) }}
                              placeholder="New subcategory..."
                              className={`flex-1 text-xs px-2 py-1 rounded border ${themeClasses.input} ${themeClasses.border}`}
                            />
                            <button
                              onClick={() => handleAddSubcategoryToExisting(cat.id)}
                              disabled={savingSubcat[cat.id]}
                              className="px-2 py-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white text-xs rounded disabled:opacity-50 transition-all hover:from-purple-700 hover:to-blue-700"
                            >
                              {savingSubcat[cat.id] ? <Clock className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          )}

          {/* ── New Category tab ── */}
          {categoryTab === 'new' && (
            <div className="space-y-4">
              <div>
                <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-1.5 uppercase tracking-wide flex items-center gap-2`}>
                  <Tag className="w-4 h-4" /> Category Name *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  className={`w-full px-4 py-3 ${themeClasses.input} border-2 ${themeClasses.border} rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-all text-base font-medium`}
                  placeholder="e.g., Rent, Utilities, Salaries"
                  autoFocus
                />
              </div>

              <div>
                <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-1.5 uppercase tracking-wide flex items-center gap-2`}>
                  <FileText className="w-4 h-4" /> Description
                  <span className="text-xs font-normal normal-case text-gray-400">(Optional)</span>
                </label>
                <textarea
                  value={categoryForm.description}
                  onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                  className={`w-full px-4 py-2.5 ${themeClasses.input} border-2 ${themeClasses.border} rounded-xl focus:ring-2 focus:ring-purple-500 transition-all resize-none`}
                  rows="2"
                  placeholder="Brief description"
                />
              </div>

              <div className={`rounded-xl border-2 ${themeClasses.border} p-3 ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                <label className={`block text-xs font-bold ${themeClasses.textPrimary} mb-2 uppercase tracking-wide flex items-center gap-2`}>
                  <Settings className="w-4 h-4" /> Subcategories
                  <span className="text-xs font-normal normal-case text-gray-400">(Optional)</span>
                </label>
                <div className="space-y-1.5">
                  {categoryForm.subcategories.map((subcat, index) => (
                    <motion.div key={index} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="flex gap-2">
                      <div className="relative flex-1">
                        <input
                          type="text"
                          value={subcat}
                          onChange={(e) => {
                            const n = [...categoryForm.subcategories]
                            n[index] = e.target.value
                            setCategoryForm({ ...categoryForm, subcategories: n })
                          }}
                          className={`w-full pl-7 pr-3 py-2 ${themeClasses.input} border ${themeClasses.border} rounded-lg focus:ring-2 focus:ring-purple-500 text-xs`}
                          placeholder={`Subcategory ${index + 1}`}
                        />
                        <span className={`absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold ${themeClasses.textSecondary}`}>#{index + 1}</span>
                      </div>
                      {categoryForm.subcategories.length > 1 && (
                        <button
                          onClick={() => setCategoryForm({ ...categoryForm, subcategories: categoryForm.subcategories.filter((_, i) => i !== index) })}
                          className={`p-2 ${isDark ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400' : 'bg-red-50 hover:bg-red-100 text-red-600'} rounded-lg transition-all`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </motion.div>
                  ))}
                  <button
                    onClick={() => setCategoryForm({ ...categoryForm, subcategories: [...categoryForm.subcategories, ''] })}
                    className={`w-full py-2 border-2 border-dashed ${themeClasses.border} ${themeClasses.textSecondary} rounded-lg ${themeClasses.hover} transition-all text-xs font-medium flex items-center justify-center gap-1.5 mt-1`}
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Subcategory
                  </button>
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <button
                  onClick={() => { setShowCategoryModal(false); setCategoryForm({ name: '', description: '', subcategories: [''] }) }}
                  className={`flex-1 px-6 py-3 border-2 ${themeClasses.border} ${themeClasses.textPrimary} font-semibold rounded-xl ${themeClasses.hover} transition-all`}
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={{ scale: isSavingCategory ? 1 : 1.02 }}
                  whileTap={{ scale: isSavingCategory ? 1 : 0.98 }}
                  onClick={handleSaveCategory}
                  disabled={!categoryForm.name || isSavingCategory}
                  className={`flex-1 ${categoryForm.name && !isSavingCategory ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700' : 'bg-gray-400 cursor-not-allowed'} text-white font-bold py-3 px-6 rounded-xl shadow-lg transition-all flex items-center justify-center gap-2`}
                >
                  {isSavingCategory ? (
                    <><Clock className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><Check className="w-4 h-4" /> Create Category</>
                  )}
                </motion.button>
              </div>
            </div>
          )}
        </Modal>

        {/* ── Confirm delete expense ─────────────────────────────────────── */}
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

        {/* ── Confirm delete category ────────────────────────────────────── */}
        <ConfirmModal
          isOpen={confirmDeleteCategory.show}
          onClose={() => setConfirmDeleteCategory({ show: false, categoryId: null, name: '' })}
          onConfirm={handleDeleteCategory}
          title="Delete Category"
          message={`Delete "${confirmDeleteCategory.name}" and all its subcategories? This cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          isLoading={isDeletingCategory}
        />

        {/* ── Confirm delete subcategory ─────────────────────────────────── */}
        <ConfirmModal
          isOpen={confirmDeleteSubcategory.show}
          onClose={() => setConfirmDeleteSubcategory({ show: false, subcategoryId: null, name: '' })}
          onConfirm={handleDeleteSubcategory}
          title="Delete Subcategory"
          message={`Delete subcategory "${confirmDeleteSubcategory.name}"? This cannot be undone.`}
          confirmText="Delete"
          cancelText="Cancel"
          type="danger"
          isLoading={isDeletingSubcategory}
        />

        <NotificationSystem />
      </div>
    </ProtectedPage>
  )
}
