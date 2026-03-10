'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  ShoppingCart,
  Users,
  Coffee,
  Truck,
  Filter,
  Download,
  RefreshCw,
  BarChart3,
  PieChart,
  LineChart,
  Clock,
  Target,
  MapPin,
  Phone,
  FileText,
  AlertCircle,
  CheckCircle,
  XCircle,
  Eye,
  Settings,
  CreditCard,
  Wallet,
  Receipt,
  Calculator,
  Activity,
  Percent,
  Star,
  Building,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Sun,
  Moon,
  WifiOff,
  BookOpen
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart as RechartsPieChart, Pie, Cell, LineChart as RechartsLineChart, Line, AreaChart, Area, ComposedChart } from 'recharts'
import { themeManager } from '../../lib/themeManager'
import LedgerTab from '../../components/reports/LedgerTab'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import ProtectedPage from '../../components/ProtectedPage'

export default function ReportsPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [theme, setTheme] = useState('light')

  // Date and Time Filters
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [timeFrom, setTimeFrom] = useState('')
  const [timeTo, setTimeTo] = useState('')

  // Advanced Filters
  const [orderTypeFilter, setOrderTypeFilter] = useState('All')
  const [paymentMethodFilter, setPaymentMethodFilter] = useState('All')
  const [orderStatusFilter, setOrderStatusFilter] = useState('All')
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('All')
  const [cashierFilter, setCashierFilter] = useState('All')

  // New Expense Filters
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState('All')
  const [expensePaymentFilter, setExpensePaymentFilter] = useState('All')
  const [profitabilityView, setProfitabilityView] = useState('daily') // daily, weekly, monthly

  // Report View Toggle
  const [activeReportTab, setActiveReportTab] = useState('overview') // overview, profit-loss, expenses, detailed

  // Data States
  const [salesData, setSalesData] = useState({
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    totalCustomers: 0,
    topProducts: [],
    ordersByType: [],
    paymentMethods: [],
    hourlyTrends: [],
    dailyTrends: [],
    topCustomers: [],
    cashierPerformance: []
  })

  // New Expense and Profit Data
  const [expenseData, setExpenseData] = useState({
    totalExpenses: 0,
    totalRegularExpenses: 0,
    totalInventoryPurchases: 0,
    expensesByCategory: [],
    expensesByPayment: [],
    dailyExpenses: [],
    topExpenseCategories: []
  })

  const [profitData, setProfitData] = useState({
    netProfit: 0,
    profitMargin: 0,
    dailyProfitLoss: [],
    weeklyProfitLoss: [],
    monthlyProfitLoss: []
  })

  const [productPerformanceData, setProductPerformanceData] = useState({
    bestSellers: [],
    worstSellers: [],
    totalProductsSold: 0,
    totalUniqueProducts: 0,
    averageProductRevenue: 0,
    topRevenueProducts: []
  })

  const [peakHoursData, setPeakHoursData] = useState({
    hourlyData: [],
    dailyData: [],
    busiestHour: null,
    slowestHour: null,
    averageOrdersPerHour: 0,
    totalOrdersAnalyzed: 0,
    peakDays: []
  })

  const [rawOrders, setRawOrders] = useState([])
  const [rawExpenses, setRawExpenses] = useState([])
  const [cashiers, setCashiers] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])

  // Daily P&L State
  const [dailyPnLData, setDailyPnLData] = useState(null)
  const [dailyPnLLoading, setDailyPnLLoading] = useState(false)
  const [selectedPnLDate, setSelectedPnLDate] = useState(new Date().toISOString().split('T')[0])

  // Chart Colors
  const chartColors = {
    primary: '#8B5CF6',
    secondary: '#06B6D4',
    success: '#10B981',
    warning: '#F59E0B',
    danger: '#EF4444',
    info: '#3B82F6',
    profit: '#059669',
    loss: '#DC2626',
    expense: '#F97316'
  }

  const pieColors = ['#8B5CF6', '#06B6D4', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1', '#14B8A6']

  const reportTabs = [
    { id: 'overview', label: 'Overview', icon: BarChart3 },
    { id: 'profit-loss', label: 'Profit & Loss', icon: Calculator },
    { id: 'expenses', label: 'Expenses', icon: Receipt },
    { id: 'product-performance', label: 'Product Performance', icon: TrendingUp },
    { id: 'peak-hours', label: 'Peak Hours', icon: Clock },
    { id: 'detailed', label: 'Detailed', icon: FileText },
    { id: 'daily-pnl', label: 'Daily P&L', icon: Target },
    { id: 'ledger', label: 'Customer Ledger', icon: BookOpen }
  ]

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) {
      router.push('/')
      return
    }
    const parsedUser = JSON.parse(userData)
    setUser(parsedUser)

    // Initialize cacheManager with user ID
    if (parsedUser?.id) {
      cacheManager.setUserId(parsedUser.id)
    }

    // Load and apply theme
    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    // Set default date range (today)
    const today = new Date().toISOString().split('T')[0]
    setDateFrom(today)
    setDateTo(today)

  }, [router])

  useEffect(() => {
    if (user) {
      fetchAllReportsData()
    }
  }, [user, dateFrom, dateTo, timeFrom, timeTo, orderTypeFilter, paymentMethodFilter, orderStatusFilter, paymentStatusFilter, cashierFilter, expenseCategoryFilter, expensePaymentFilter])
useEffect(() => {
  if (user && user.id) {
    fetchInitialData(user.id)
  }
}, [user])
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

const fetchInitialData = async (userId) => {
  try {
    // Check if online
    const isOnline = navigator.onLine

    if (isOnline) {
      // Fetch cashiers - filtered by user (online only since cashiers don't change often)
      const { data: cashiersData, error: cashiersError } = await supabase
        .from('cashiers')
        .select('id, name')
        .eq('user_id', userId)
        .order('name')

      if (!cashiersError) {
        setCashiers(cashiersData || [])
      }
    }

    // Fetch expense categories using cacheManager (works offline and online)
    await cacheManager.fetchExpenseData({}) // This will populate the cache
    const categories = cacheManager.getExpenseCategories()
    setExpenseCategories(categories || [])
  } catch (error) {
    console.error('Error fetching initial data:', error)
    // Try to get cached expense categories on error
    const cachedCategories = cacheManager.getExpenseCategories()
    if (cachedCategories.length > 0) {
      setExpenseCategories(cachedCategories)
    }
  }
}



  const fetchAllReportsData = async () => {
    setLoading(true)
    try {
      // Fetch all reports data in parallel
      const [salesResult, expenseResult, productPerformanceResult, peakHoursResult] = await Promise.all([
        fetchSalesData(),
        fetchExpenseData(),
        fetchProductPerformanceData(),
        fetchPeakHoursData()
      ])

      // Process the data after both are fetched (even if there are errors, use empty data)
      const salesData = salesResult?.salesData || {
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalCustomers: 0,
        topProducts: [],
        ordersByType: [],
        paymentMethods: [],
        hourlyTrends: [],
        dailyTrends: [],
        topCustomers: [],
        cashierPerformance: []
      }

      const expenseData = expenseResult?.expenseData || {
        totalExpenses: 0,
        totalRegularExpenses: 0,
        totalInventoryPurchases: 0,
        expensesByCategory: [],
        expensesByPayment: [],
        dailyExpenses: [],
        topExpenseCategories: []
      }

      // Product performance data is already set in the fetch function
      // No need to process it here as it's not used in other calculations

      calculateProfitData(salesData, expenseData)
    } catch (error) {
      console.error('Error fetching reports data:', error)
      console.error('Error stack:', error?.stack)
      // Set empty data to prevent crashes
      setSalesData({
        totalRevenue: 0,
        totalOrders: 0,
        averageOrderValue: 0,
        totalCustomers: 0,
        topProducts: [],
        ordersByType: [],
        paymentMethods: [],
        hourlyTrends: [],
        dailyTrends: [],
        topCustomers: [],
        cashierPerformance: []
      })
      setExpenseData({
        totalExpenses: 0,
        totalRegularExpenses: 0,
        totalInventoryPurchases: 0,
        expensesByCategory: [],
        expensesByPayment: [],
        dailyExpenses: [],
        topExpenseCategories: []
      })
      setProfitData({
        netProfit: 0,
        profitMargin: 0,
        dailyProfitLoss: []
      })
      setProductPerformanceData({
        bestSellers: [],
        worstSellers: [],
        totalProductsSold: 0,
        totalUniqueProducts: 0,
        averageProductRevenue: 0,
        topRevenueProducts: []
      })
      setPeakHoursData({
        hourlyData: [],
        dailyData: [],
        busiestHour: null,
        slowestHour: null,
        averageOrdersPerHour: 0,
        totalOrdersAnalyzed: 0,
        peakDays: []
      })
    } finally {
      setLoading(false)
    }
  }

const fetchSalesData = async () => {
  try {
    if (!user?.id) return null

    // Build optimized query with filters at database level (using * like Daily P&L that works)
    let query = supabase
      .from('orders')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    // Apply date filters at database level
    if (dateFrom) {
      query = query.gte('order_date', dateFrom)
    }
    if (dateTo) {
      query = query.lte('order_date', dateTo)
    }

    // Apply type filters at database level
    if (orderTypeFilter !== 'All') {
      query = query.eq('order_type', orderTypeFilter.toLowerCase())
    }
    if (paymentMethodFilter !== 'All') {
      query = query.eq('payment_method', paymentMethodFilter)
    }
    if (orderStatusFilter !== 'All') {
      query = query.eq('order_status', orderStatusFilter)
    }
    if (paymentStatusFilter !== 'All') {
      query = query.eq('payment_status', paymentStatusFilter)
    }
    if (cashierFilter !== 'All') {
      query = query.eq('cashier_id', cashierFilter)
    }

    const { data, error } = await query.limit(500)

    if (error) {
      console.error('Supabase query error:', error)
      console.error('Error details:', JSON.stringify(error, null, 2))
      throw error
    }

    let orders = data || []

    // Apply time filters client-side (less common filter)
    if (timeFrom || timeTo) {
      orders = orders.filter(order => {
        if (timeFrom && order.order_time < timeFrom) return false
        if (timeTo && order.order_time > timeTo) return false
        return true
      })
    }

    // Fetch order_items for all orders
    if (orders.length > 0) {
      const orderIds = orders.map(o => o.id)
      const { data: orderItems, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds)

      if (!itemsError && orderItems) {
        // Attach order_items to each order
        orders = orders.map(order => ({
          ...order,
          order_items: orderItems.filter(item => item.order_id === order.id)
        }))
      } else {
        console.warn('Failed to fetch order items:', itemsError)
        // Attach empty array if no items found
        orders = orders.map(order => ({ ...order, order_items: [] }))
      }

      // Fetch payment transactions for Split payment orders
      const { data: paymentTransactions, error: transactionsError } = await supabase
        .from('order_payment_transactions')
        .select('*')
        .in('order_id', orderIds)

      if (!transactionsError && paymentTransactions) {
        // Attach payment_transactions to each order
        orders = orders.map(order => ({
          ...order,
          payment_transactions: paymentTransactions.filter(t => t.order_id === order.id)
        }))
      } else {
        console.warn('Failed to fetch payment transactions:', transactionsError)
        // Attach empty array if no transactions found
        orders = orders.map(order => ({ ...order, payment_transactions: [] }))
      }
    }

    setRawOrders(orders)
    const processedSalesData = processSalesData(orders)
    return { salesData: processedSalesData }
  } catch (error) {
    console.error('Error fetching sales data:', error)
    console.error('Error message:', error?.message)
    console.error('Error code:', error?.code)
    console.error('Error details:', error?.details)
    console.error('Error hint:', error?.hint)
    // Return empty data structure to prevent app crash
    setRawOrders([])
    setSalesData({
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      totalCustomers: 0,
      topProducts: [],
      ordersByType: [],
      paymentMethods: [],
      hourlyTrends: [],
      dailyTrends: [],
      topCustomers: [],
      cashierPerformance: []
    })
    return { salesData: {
      totalRevenue: 0,
      totalOrders: 0,
      averageOrderValue: 0,
      totalCustomers: 0,
      topProducts: [],
      ordersByType: [],
      paymentMethods: [],
      hourlyTrends: [],
      dailyTrends: [],
      topCustomers: [],
      cashierPerformance: []
    }}
  }
}

const fetchExpenseData = async () => {
  try {
    if (!user?.id) return null

    // Fetch expenses with direct optimized query
    let expenseQuery = supabase
      .from('expenses')
      .select(`
        id,
        amount,
        total_amount,
        tax_amount,
        description,
        payment_method,
        expense_date,
        expense_time,
        tax_rate,
        category_id,
        subcategory_id,
        created_at,
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

    // Apply date filters
    if (dateFrom) {
      expenseQuery = expenseQuery.gte('expense_date', dateFrom)
    }
    if (dateTo) {
      expenseQuery = expenseQuery.lte('expense_date', dateTo)
    }

    // Apply category filter
    if (expenseCategoryFilter !== 'All') {
      expenseQuery = expenseQuery.eq('category_id', expenseCategoryFilter)
    }

    // Apply payment method filter
    if (expensePaymentFilter !== 'All') {
      expenseQuery = expenseQuery.eq('payment_method', expensePaymentFilter)
    }

    const { data: expenses, error: expenseError } = await expenseQuery.limit(500)

    if (expenseError) {
      console.error('Expense query error:', expenseError)
      console.error('Error details:', JSON.stringify(expenseError, null, 2))
      throw expenseError
    }

    // Fetch stock purchases (inventory purchases) separately
    let stockQuery = supabase
      .from('stock_history')
      .select(`
        id,
        quantity,
        unit_cost,
        total_cost,
        created_at,
        inventory_items (
          id,
          name
        )
      `)
      .eq('user_id', user.id)
      .eq('transaction_type', 'purchase')
      .order('created_at', { ascending: false })

    if (dateFrom) {
      stockQuery = stockQuery.gte('created_at', dateFrom)
    }
    if (dateTo) {
      stockQuery = stockQuery.lte('created_at', `${dateTo}T23:59:59`)
    }

    const { data: stockPurchases, error: stockError } = await stockQuery.limit(200)

    if (stockError) {
      console.log('Stock purchases query error (may not exist):', stockError.message)
    }

    setRawExpenses(expenses || [])
    const processedExpenseData = processExpenseData(expenses || [], stockPurchases || [])
    return { expenseData: processedExpenseData, isOffline: false }
  } catch (error) {
    console.error('Error fetching expense data:', error)
    console.error('Error message:', error?.message)
    console.error('Error code:', error?.code)
    console.error('Error details:', error?.details)
    // Return empty expense data structure to prevent app crash
    setRawExpenses([])
    const emptyExpenseData = {
      totalExpenses: 0,
      totalRegularExpenses: 0,
      totalInventoryPurchases: 0,
      expensesByCategory: [],
      expensesByPayment: [],
      dailyExpenses: [],
      topExpenseCategories: []
    }
    setExpenseData(emptyExpenseData)
    return { expenseData: emptyExpenseData, isOffline: false }
  }
}


 const processSalesData = (orders) => {
  // Filter to only include Completed orders for revenue calculations (like Daily P&L)
  const validOrders = orders.filter(order => order.order_status === 'Completed')

  // Calculate basic metrics - only from completed orders
  const totalRevenue = validOrders.reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0)
  const totalOrders = validOrders.length
  const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0
  const uniqueCustomers = new Set(validOrders.filter(o => o.customer_id).map(o => o.customer_id)).size

  // Top products analysis - only from completed/valid orders
  const productMap = new Map()
  validOrders.forEach(order => {
    order.order_items?.forEach(item => {
      const key = `${item.product_name}${item.variant_name ? ` (${item.variant_name})` : ''}`
      if (!productMap.has(key)) {
        productMap.set(key, { name: key, quantity: 0, revenue: 0 })
      }
      const product = productMap.get(key)
      product.quantity += item.quantity
      product.revenue += parseFloat(item.total_price || 0)
    })
  })
  const topProducts = Array.from(productMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Orders by type - only count non-cancelled orders
  const ordersByType = [
    { 
      name: 'Walk-in', 
      value: validOrders.filter(o => o.order_type === 'walkin').length, 
      revenue: validOrders.filter(o => o.order_type === 'walkin').reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) 
    },
    { 
      name: 'Takeaway', 
      value: validOrders.filter(o => o.order_type === 'takeaway').length, 
      revenue: validOrders.filter(o => o.order_type === 'takeaway').reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) 
    },
    { 
      name: 'Delivery', 
      value: validOrders.filter(o => o.order_type === 'delivery').length, 
      revenue: validOrders.filter(o => o.order_type === 'delivery').reduce((sum, o) => sum + parseFloat(o.total_amount || 0), 0) 
    }
  ].filter(type => type.value > 0)

  // Payment methods - aggregate from both single payments and split payments
  const paymentMethodMap = new Map()
  validOrders.forEach(order => {
    if (order.payment_method === 'Split' && order.payment_transactions && order.payment_transactions.length > 0) {
      // For split payments, aggregate from payment_transactions
      order.payment_transactions.forEach(transaction => {
        const method = transaction.payment_method
        if (!paymentMethodMap.has(method)) {
          paymentMethodMap.set(method, { name: method, value: 0, revenue: 0 })
        }
        const payment = paymentMethodMap.get(method)
        payment.revenue += parseFloat(transaction.amount || 0)
      })
      // Count the split payment order once for "Split" method
      if (!paymentMethodMap.has('Split')) {
        paymentMethodMap.set('Split', { name: 'Split', value: 0, revenue: 0 })
      }
      paymentMethodMap.get('Split').value += 1
    } else {
      // For single payment method orders
      const method = order.payment_method
      if (!paymentMethodMap.has(method)) {
        paymentMethodMap.set(method, { name: method, value: 0, revenue: 0 })
      }
      const payment = paymentMethodMap.get(method)
      payment.value += 1
      payment.revenue += parseFloat(order.total_amount || 0)
    }
  })
  const paymentMethods = Array.from(paymentMethodMap.values())

  // Daily revenue trends - only from valid orders
  const dailyMap = new Map()
  validOrders.forEach(order => {
    const date = order.order_date
    if (!dailyMap.has(date)) {
      dailyMap.set(date, { date, orders: 0, revenue: 0 })
    }
    const dayData = dailyMap.get(date)
    dayData.orders += 1
    dayData.revenue += parseFloat(order.total_amount || 0)
  })
  const dailyTrends = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date))

  // Top customers analysis - only from valid orders
  const customerMap = new Map()
  validOrders.filter(o => o.customer_id && o.customers).forEach(order => {
    if (!customerMap.has(order.customer_id)) {
      customerMap.set(order.customer_id, {
        id: order.customer_id,
        name: `${order.customers.first_name} ${order.customers.last_name}`,
        phone: order.customers.phone,
        orders: 0,
        revenue: 0
      })
    }
    const customer = customerMap.get(order.customer_id)
    customer.orders += 1
    customer.revenue += parseFloat(order.total_amount || 0)
  })
  const topCustomers = Array.from(customerMap.values())
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Cashier performance analysis - only from valid orders
  const cashierMap = new Map()
  validOrders.forEach(order => {
    const cashierId = order.cashier_id || 'admin'
    const cashierName = order.cashiers?.name || 'Admin'

    if (!cashierMap.has(cashierId)) {
      cashierMap.set(cashierId, {
        id: cashierId,
        name: cashierName,
        orders: 0,
        revenue: 0
      })
    }
    const cashier = cashierMap.get(cashierId)
    cashier.orders += 1
    cashier.revenue += parseFloat(order.total_amount || 0)
  })
  const cashierPerformance = Array.from(cashierMap.values())
    .sort((a, b) => b.revenue - a.revenue)

  // Hourly trends - only from valid orders
  const hourlyMap = new Map()
  validOrders.forEach(order => {
    const hour = parseInt(order.order_time?.split(':')[0] || '0')
    if (!hourlyMap.has(hour)) {
      hourlyMap.set(hour, { hour, orders: 0, revenue: 0 })
    }
    const hourData = hourlyMap.get(hour)
    hourData.orders += 1
    hourData.revenue += parseFloat(order.total_amount || 0)
  })
  const hourlyTrends = Array.from(hourlyMap.values()).sort((a, b) => a.hour - b.hour)

  const processedData = {
    totalRevenue,
    totalOrders,
    averageOrderValue,
    totalCustomers: uniqueCustomers,
    topProducts,
    ordersByType,
    paymentMethods,
    dailyTrends,
    topCustomers,
    cashierPerformance,
    hourlyTrends
  }

  setSalesData(processedData)
  return processedData
}

  const processExpenseData = (expenses, stockPurchases = []) => {
    // Calculate total from regular expenses
    const totalRegularExpenses = expenses.reduce((sum, expense) => sum + parseFloat(expense.total_amount || expense.amount || 0), 0)

    // Calculate total from inventory purchases (stock_history)
    const totalInventoryPurchases = stockPurchases.reduce((sum, purchase) => sum + parseFloat(purchase.total_cost || 0), 0)

    // Combined total expenses
    const totalExpenses = totalRegularExpenses + totalInventoryPurchases

    // Expenses by category
    const categoryMap = new Map()

    // Add regular expenses to category map
    expenses.forEach(expense => {
      const categoryName = expense.category?.name || 'Uncategorized'
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, { name: categoryName, value: 0, amount: 0 })
      }
      const category = categoryMap.get(categoryName)
      category.value += 1
      category.amount += parseFloat(expense.total_amount || expense.amount || 0)
    })

    // Add inventory purchases as a separate category
    if (stockPurchases.length > 0) {
      categoryMap.set('Inventory Purchases', {
        name: 'Inventory Purchases',
        value: stockPurchases.length,
        amount: totalInventoryPurchases
      })
    }

    const expensesByCategory = Array.from(categoryMap.values())
      .sort((a, b) => b.amount - a.amount)

    // Expenses by payment method
    const paymentMap = new Map()
    expenses.forEach(expense => {
      const method = expense.payment_method
      if (!paymentMap.has(method)) {
        paymentMap.set(method, { name: method, value: 0, amount: 0 })
      }
      const payment = paymentMap.get(method)
      payment.value += 1
      payment.amount += parseFloat(expense.total_amount || expense.amount || 0)
    })

    // Add inventory purchases to payment methods (as 'Inventory' or could track actual payment if available)
    if (stockPurchases.length > 0) {
      if (!paymentMap.has('Inventory Purchase')) {
        paymentMap.set('Inventory Purchase', { name: 'Inventory Purchase', value: 0, amount: 0 })
      }
      const inventoryPayment = paymentMap.get('Inventory Purchase')
      inventoryPayment.value += stockPurchases.length
      inventoryPayment.amount += totalInventoryPurchases
    }

    const expensesByPayment = Array.from(paymentMap.values())

    // Daily expenses
    const dailyExpenseMap = new Map()

    // Add regular expenses to daily map
    expenses.forEach(expense => {
      const date = expense.expense_date
      if (!dailyExpenseMap.has(date)) {
        dailyExpenseMap.set(date, { date, expenses: 0, amount: 0 })
      }
      const dayData = dailyExpenseMap.get(date)
      dayData.expenses += 1
      dayData.amount += parseFloat(expense.total_amount || expense.amount || 0)
    })

    // Add inventory purchases to daily map
    stockPurchases.forEach(purchase => {
      const date = purchase.created_at?.split('T')[0] || new Date().toISOString().split('T')[0]
      if (!dailyExpenseMap.has(date)) {
        dailyExpenseMap.set(date, { date, expenses: 0, amount: 0 })
      }
      const dayData = dailyExpenseMap.get(date)
      dayData.expenses += 1
      dayData.amount += parseFloat(purchase.total_cost || 0)
    })

    const dailyExpenses = Array.from(dailyExpenseMap.values()).sort((a, b) => a.date.localeCompare(b.date))

    const processedData = {
      totalExpenses,
      totalRegularExpenses,
      totalInventoryPurchases,
      expensesByCategory,
      expensesByPayment,
      dailyExpenses,
      topExpenseCategories: expensesByCategory.slice(0, 10)
    }

    setExpenseData(processedData)
    return processedData
  }

  const fetchProductPerformanceData = async () => {
    try {
      if (!user?.id) return null

      // Build query for order_items with date/time filters
      let query = supabase
        .from('order_items')
        .select(`
          id,
          product_name,
          variant_name,
          final_price,
          quantity,
          total_price,
          is_deal,
          order_id,
          orders!inner(
            id,
            order_status,
            order_date,
            order_time,
            user_id
          )
        `)
        .eq('orders.user_id', user.id)
        .eq('orders.order_status', 'Completed')

      // Apply date filters
      if (dateFrom) {
        query = query.gte('orders.order_date', dateFrom)
      }
      if (dateTo) {
        query = query.lte('orders.order_date', dateTo)
      }

      // Apply time filters if provided
      if (timeFrom) {
        query = query.gte('orders.order_time', timeFrom)
      }
      if (timeTo) {
        query = query.lte('orders.order_time', timeTo)
      }

      const { data: orderItems, error } = await query

      if (error) {
        console.error('Error fetching order items for product performance:', error)
        return null
      }

      // Aggregate data by product/variant
      const productMap = new Map()

      orderItems.forEach(item => {
        // Create unique key for product + variant combination
        const key = item.variant_name
          ? `${item.product_name} - ${item.variant_name}`
          : item.product_name

        if (productMap.has(key)) {
          const existing = productMap.get(key)
          existing.quantity += item.quantity
          existing.revenue += parseFloat(item.total_price || 0)
          existing.orderCount += 1
        } else {
          productMap.set(key, {
            name: key,
            productName: item.product_name,
            variantName: item.variant_name || null,
            quantity: item.quantity,
            revenue: parseFloat(item.total_price || 0),
            orderCount: 1,
            isDeal: item.is_deal,
            averagePrice: parseFloat(item.final_price || 0)
          })
        }
      })

      // Convert map to array and sort
      const allProducts = Array.from(productMap.values())

      // Calculate average price for each product
      allProducts.forEach(product => {
        product.averagePrice = product.quantity > 0 ? product.revenue / product.quantity : 0
      })

      // Sort by quantity for best/worst sellers
      const sortedByQuantity = [...allProducts].sort((a, b) => b.quantity - a.quantity)
      const bestSellers = sortedByQuantity.slice(0, 20)
      const worstSellers = sortedByQuantity.slice(-10).reverse()

      // Sort by revenue for top revenue products
      const sortedByRevenue = [...allProducts].sort((a, b) => b.revenue - a.revenue)
      const topRevenueProducts = sortedByRevenue.slice(0, 20)

      // Calculate totals
      const totalProductsSold = allProducts.reduce((sum, p) => sum + p.quantity, 0)
      const totalRevenue = allProducts.reduce((sum, p) => sum + p.revenue, 0)
      const totalUniqueProducts = allProducts.length
      const averageProductRevenue = totalUniqueProducts > 0 ? totalRevenue / totalUniqueProducts : 0

      const performanceData = {
        bestSellers,
        worstSellers,
        totalProductsSold,
        totalUniqueProducts,
        averageProductRevenue,
        topRevenueProducts
      }

      setProductPerformanceData(performanceData)
      return performanceData
    } catch (error) {
      console.error('Error in fetchProductPerformanceData:', error)
      return null
    }
  }

  const fetchPeakHoursData = async () => {
    try {
      if (!user?.id) return null

      // Build query for orders with date/time filters
      let query = supabase
        .from('orders')
        .select('id, order_time, order_date, order_type, total_amount, order_status, created_at')
        .eq('user_id', user.id)
        .eq('order_status', 'Completed')

      // Apply date filters
      if (dateFrom) {
        query = query.gte('order_date', dateFrom)
      }
      if (dateTo) {
        query = query.lte('order_date', dateTo)
      }

      // Apply time filters if provided
      if (timeFrom) {
        query = query.gte('order_time', timeFrom)
      }
      if (timeTo) {
        query = query.lte('order_time', timeTo)
      }

      const { data: orders, error } = await query

      if (error) {
        console.error('Error fetching orders for peak hours:', error)
        return null
      }

      // Initialize hourly data structure (0-23 hours)
      const hourlyMap = new Map()
      for (let i = 0; i < 24; i++) {
        hourlyMap.set(i, {
          hour: i,
          orderCount: 0,
          revenue: 0,
          orderTypes: { walkin: 0, takeaway: 0, delivery: 0 }
        })
      }

      // Initialize daily data structure (Monday-Sunday)
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
      const dailyMap = new Map()
      dayNames.forEach((day, index) => {
        dailyMap.set(index, {
          day: day,
          dayIndex: index,
          orderCount: 0,
          revenue: 0
        })
      })

      // Aggregate data
      orders.forEach(order => {
        // Parse hour from order_time (format: HH:MM:SS)
        const hour = order.order_time ? parseInt(order.order_time.split(':')[0]) : new Date(order.created_at).getHours()

        if (hour >= 0 && hour < 24) {
          const hourData = hourlyMap.get(hour)
          hourData.orderCount += 1
          hourData.revenue += parseFloat(order.total_amount || 0)

          // Track order type
          const orderType = order.order_type?.toLowerCase()
          if (hourData.orderTypes[orderType] !== undefined) {
            hourData.orderTypes[orderType] += 1
          }
        }

        // Aggregate by day of week
        const orderDate = new Date(order.order_date || order.created_at)
        const dayOfWeek = orderDate.getDay()
        const dayData = dailyMap.get(dayOfWeek)
        if (dayData) {
          dayData.orderCount += 1
          dayData.revenue += parseFloat(order.total_amount || 0)
        }
      })

      // Convert maps to arrays
      const hourlyData = Array.from(hourlyMap.values())
      const dailyData = Array.from(dailyMap.values())

      // Find busiest and slowest hours
      const sortedByOrders = [...hourlyData].sort((a, b) => b.orderCount - a.orderCount)
      const busiestHour = sortedByOrders[0]
      const slowestHour = sortedByOrders.filter(h => h.orderCount > 0).slice(-1)[0] || null

      // Calculate average orders per hour
      const totalOrders = orders.length
      const hoursWithOrders = hourlyData.filter(h => h.orderCount > 0).length
      const averageOrdersPerHour = hoursWithOrders > 0 ? totalOrders / hoursWithOrders : 0

      // Find peak days
      const peakDays = [...dailyData].sort((a, b) => b.orderCount - a.orderCount).slice(0, 3)

      const peakData = {
        hourlyData,
        dailyData,
        busiestHour,
        slowestHour,
        averageOrdersPerHour,
        totalOrdersAnalyzed: totalOrders,
        peakDays
      }

      setPeakHoursData(peakData)
      return peakData
    } catch (error) {
      console.error('Error in fetchPeakHoursData:', error)
      return null
    }
  }

 // Also replace the calculateProfitData function to ensure it uses correct revenue data
const calculateProfitData = (salesDataParam, expenseDataParam) => {
  const netProfit = salesDataParam.totalRevenue - expenseDataParam.totalExpenses
  const profitMargin = salesDataParam.totalRevenue > 0 ? (netProfit / salesDataParam.totalRevenue) * 100 : 0

  // Combine daily revenue and expenses for profit/loss analysis
  const dailyProfitLoss = []
  const allDates = new Set([
    ...salesDataParam.dailyTrends.map(d => d.date),
    ...expenseDataParam.dailyExpenses.map(d => d.date)
  ])

  Array.from(allDates).sort().forEach(date => {
    const revenue = salesDataParam.dailyTrends.find(d => d.date === date)?.revenue || 0
    const expenses = expenseDataParam.dailyExpenses.find(d => d.date === date)?.amount || 0
    const profit = revenue - expenses

    dailyProfitLoss.push({
      date,
      revenue,
      expenses,
      profit,
      profitMargin: revenue > 0 ? (profit / revenue) * 100 : 0
    })
  })

  const calculatedProfitData = {
    netProfit,
    profitMargin,
    dailyProfitLoss
  }

  setProfitData(calculatedProfitData)
  return calculatedProfitData
}

  // Fetch Daily P&L data
  const fetchDailyPnL = async (date) => {
    if (!user) return

    setDailyPnLLoading(true)
    try {
      const pnlData = await cacheManager.fetchDailyPnL(user.id, date)
      setDailyPnLData(pnlData)
    } catch (error) {
      console.error('Error fetching Daily P&L:', error)
      setDailyPnLData(null)
    } finally {
      setDailyPnLLoading(false)
    }
  }

  // Fetch Daily P&L when date changes or on initial load of daily-pnl tab
  useEffect(() => {
    if (user && activeReportTab === 'daily-pnl' && selectedPnLDate) {
      fetchDailyPnL(selectedPnLDate)
    }
  }, [user, activeReportTab, selectedPnLDate])

  const handleRefresh = async () => {
    setRefreshing(true)
    await fetchAllReportsData()
    if (activeReportTab === 'daily-pnl') {
      await fetchDailyPnL(selectedPnLDate)
    }
    setRefreshing(false)
  }

  const exportToCSV = () => {
    let csvData = []
    let fileName = `${activeReportTab}-report-${dateFrom}-to-${dateTo}.csv`

    switch (activeReportTab) {
      case 'overview':
        // Export summary overview metrics
        csvData = [
          { 'Metric': 'Total Revenue', 'Value': salesData.totalRevenue.toFixed(2) },
          { 'Metric': 'Total Orders', 'Value': salesData.totalOrders },
          { 'Metric': 'Average Order Value', 'Value': salesData.averageOrderValue.toFixed(2) },
          { 'Metric': 'Total Customers', 'Value': salesData.totalCustomers },
          { 'Metric': 'Total Expenses', 'Value': expenseData.totalExpenses.toFixed(2) },
          { 'Metric': 'Net Profit', 'Value': profitData.netProfit.toFixed(2) },
          { 'Metric': 'Profit Margin %', 'Value': profitData.profitMargin.toFixed(2) }
        ]
        break

      case 'profit-loss':
        // Export daily profit & loss data
        csvData = profitData.dailyProfitLoss.map(day => ({
          'Date': day.date || '',
          'Revenue': (day.revenue || 0).toFixed(2),
          'Expenses': (day.expenses || 0).toFixed(2),
          'Net Profit': (day.profit || 0).toFixed(2),
          'Profit Margin %': (day.profitMargin || 0).toFixed(2)
        }))
        break

      case 'expenses':
        // Export expenses data
        csvData = rawExpenses.map(expense => ({
          'Date': expense.expense_date,
          'Category': expense.category?.name || 'Uncategorized',
          'Description': expense.description || '',
          'Amount': expense.amount,
          'Tax': expense.tax_amount || 0,
          'Total': expense.total_amount || expense.amount,
          'Payment Method': expense.payment_method
        }))
        break

      case 'product-performance':
        // Export product performance data
        csvData = productPerformanceData.bestSellers.map(product => ({
          'Product': product.name || '',
          'Quantity Sold': product.quantity || 0,
          'Revenue': (product.revenue || 0).toFixed(2),
          'Orders': product.orders || 0,
          'Avg per Order': (product.orders > 0 ? (product.quantity / product.orders) : 0).toFixed(2)
        }))
        break

      case 'peak-hours':
        // Export hourly peak data
        csvData = peakHoursData.hourlyData.map(hour => ({
          'Hour': `${hour.hour}:00`,
          'Orders': hour.orders || 0,
          'Revenue': (hour.revenue || 0).toFixed(2),
          'Avg Order Value': (hour.avgOrderValue || 0).toFixed(2)
        }))
        break

      case 'daily-pnl':
        // Export daily P&L data if available
        if (dailyPnLData) {
          csvData = [
            { 'Metric': 'Date', 'Value': dailyPnLData.date },
            { 'Metric': 'Total Revenue', 'Value': dailyPnLData.totalRevenue?.toFixed(2) || 0 },
            { 'Metric': 'Total Orders', 'Value': dailyPnLData.totalOrders || 0 },
            { 'Metric': 'Total Expenses', 'Value': dailyPnLData.totalExpenses?.toFixed(2) || 0 },
            { 'Metric': 'Net Profit', 'Value': dailyPnLData.netProfit?.toFixed(2) || 0 },
            { 'Metric': 'Profit Margin %', 'Value': dailyPnLData.profitMargin?.toFixed(2) || 0 }
          ]
        }
        fileName = `daily-pnl-${selectedPnLDate}.csv`
        break

      case 'ledger':
        // Ledger tab has its own export - show message
        notify.info('Please use the Export button in the Customer Ledger tab')
        return

      case 'detailed':
      default:
        // Export detailed orders data
        csvData = rawOrders.map(order => ({
          'Order Number': order.order_number,
          'Date': order.order_date,
          'Time': order.order_time,
          'Type': order.order_type,
          'Customer': order.customers ? `${order.customers.full_name || order.customers.first_name + ' ' + order.customers.last_name}` : 'Walk-in',
          'Subtotal': order.subtotal,
          'Discount': order.discount_amount || 0,
          'Delivery Charges': order.delivery_charges || 0,
          'Total': order.total_amount,
          'Payment Method': order.payment_method,
          'Payment Status': order.payment_status,
          'Status': order.order_status
        }))
        break
    }

    if (!csvData || csvData.length === 0) {
      notify.error('No data available to export')
      return
    }

    const csv = [
      Object.keys(csvData[0] || {}).join(','),
      ...csvData.map(row => Object.values(row).map(val => `"${val}"`).join(','))
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
  }

  const formatCurrency = (amount) => {
    return `Rs ${parseFloat(amount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  }

  const getPaymentMethodIcon = (method) => {
    switch (method) {
      case 'Cash': return DollarSign
      case 'EasyPaisa': return Smartphone
      case 'JazzCash': return Smartphone
      case 'Bank': return Building
      case 'Account': return Users
      case 'Split': return CreditCard
      case 'Unpaid': return AlertCircle
      default: return CreditCard
    }
  }

  // Get theme classes from theme manager
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  return (
    <ProtectedPage permissionKey="REPORTS" pageName="Reports">
      <div className={`h-screen flex ${themeClasses.background} overflow-hidden text-sm transition-all duration-500`}>
      {/* Left Panel - Reports Sidebar - Matching Orders Page */}
      <div className={`w-80 ${themeClasses.card} shadow-lg ${themeClasses.border} border-r flex flex-col h-full`}>
        {/* Header - Matching Orders Page exactly */}
        <div className="p-3 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between mb-3">
            <motion.button
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-white/90 hover:text-white transition-all text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="font-medium">Dashboard</span>
            </motion.button>

            {/* Theme Toggle */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
            >
              <AnimatePresence mode="wait">
                {isDark ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Sun className="w-4 h-4 text-yellow-300" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Moon className="w-4 h-4 text-white/90" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          <div className="mb-3">
            <h1 className="text-lg font-bold text-white">Business Analytics</h1>
            <p className="text-purple-100 text-xs">Complete financial insights and profit analysis</p>
          </div>

          <div className="flex items-center space-x-2">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center px-3 py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-lg transition-all disabled:opacity-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={exportToCSV}
              className="flex items-center px-3 py-2 bg-purple-500 hover:bg-purple-400 text-white rounded-lg transition-all disabled:opacity-50 text-sm"
            >
              <Download className="w-4 h-4 mr-1" />
              Export CSV
            </motion.button>
          </div>
        </div>

        {/* Navigation Tabs - Matching Orders page style */}
        <div className={`p-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'} ${themeClasses.border} border-b`}>
          <div className={`flex flex-col space-y-1 ${themeClasses.card} rounded-lg p-1`}>
            {reportTabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveReportTab(tab.id)}
                className={`flex items-center px-3 py-2 rounded-md text-xs font-medium transition-all ${activeReportTab === tab.id
                  ? 'bg-purple-600 text-white shadow-sm'
                  : isDark
                    ? 'text-gray-300 hover:text-purple-300 hover:bg-purple-900/40'
                    : 'text-gray-600 hover:text-purple-700 hover:bg-purple-100'
                  }`}
              >
                <tab.icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Filter Toggle - Matching Orders page */}
        <div className={`px-3 py-2 ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'} ${themeClasses.border} border-b`}>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setShowFilters(!showFilters)}
            className={`w-full flex items-center justify-between px-3 py-2 ${themeClasses.button} rounded-lg transition-all text-sm font-medium`}
          >
            <div className="flex items-center">
              <Filter className="w-4 h-4 mr-2" />
              Filter
            </div>
            {showFilters ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </motion.button>
        </div>

        {/* Orders Count - Matching Orders page */}
        <div className={`px-3 py-1 ${isDark ? 'bg-gray-700/50' : 'bg-gray-100'} ${themeClasses.border} border-b`}>
          <p className={`text-xs font-semibold ${themeClasses.textPrimary}`}>
            Total {rawOrders.length + rawExpenses.length} Records
          </p>
        </div>

        {/* Summary Stats in Sidebar - positioned at bottom like Orders page */}
        <div className={`mt-auto p-3 ${themeClasses.border} border-t ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
          <div className={`text-xs ${themeClasses.textSecondary} mb-2 font-medium`}>Quick Summary</div>
          <div className="space-y-2">
            <div className="flex justify-between text-xs">
              <span className={themeClasses.textSecondary}>Total Orders:</span>
              <span className={`${themeClasses.textPrimary} font-semibold`}>{salesData.totalOrders}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className={themeClasses.textSecondary}>Total Revenue:</span>
              <span className="text-green-500 font-semibold">{formatCurrency(salesData.totalRevenue)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className={themeClasses.textSecondary}>Total Expenses:</span>
              <span className="text-red-500 font-semibold">{formatCurrency(expenseData.totalExpenses)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Main Content */}
      <div className={`flex-1 flex flex-col ${themeClasses.card} overflow-hidden`}>
        {/* Collapsible Filters - at top of right panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`overflow-hidden ${themeClasses.border} border-b ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}
            >
              <div className="p-4 space-y-4">
                {/* Date Filters */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>From Date</label>
                    <input
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>To Date</label>
                    <input
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>From Time</label>
                    <input
                      type="time"
                      value={timeFrom}
                      onChange={(e) => setTimeFrom(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>To Time</label>
                    <input
                      type="time"
                      value={timeTo}
                      onChange={(e) => setTimeTo(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    />
                  </div>
                </div>

                {/* Category Filters */}
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Order Type</label>
                    <select
                      value={orderTypeFilter}
                      onChange={(e) => setOrderTypeFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Types</option>
                      <option value="Walkin">Walk-in</option>
                      <option value="Takeaway">Takeaway</option>
                      <option value="Delivery">Delivery</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Payment Method</label>
                    <select
                      value={paymentMethodFilter}
                      onChange={(e) => setPaymentMethodFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Methods</option>
                      <option value="Cash">Cash</option>
                      <option value="EasyPaisa">EasyPaisa</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Bank">Bank</option>
                      <option value="Account">Account</option>
                      <option value="Split">Split</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Order Status</label>
                    <select
                      value={orderStatusFilter}
                      onChange={(e) => setOrderStatusFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Preparing">Preparing</option>
                      <option value="Ready">Ready</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Payment Status</label>
                    <select
                      value={paymentStatusFilter}
                      onChange={(e) => setPaymentStatusFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Status</option>
                      <option value="Pending">Pending</option>
                      <option value="Paid">Paid</option>
                      <option value="Refunded">Refunded</option>
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Cashier</label>
                    <select
                      value={cashierFilter}
                      onChange={(e) => setCashierFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Cashiers</option>
                      <option value="">Admin</option>
                      {cashiers.map(cashier => (
                        <option key={cashier.id} value={cashier.id}>{cashier.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Expense Category</label>
                    <select
                      value={expenseCategoryFilter}
                      onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Categories</option>
                      {expenseCategories.map(category => (
                        <option key={category.id} value={category.id}>{category.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium ${themeClasses.textPrimary} mb-2`}>Expense Payment</label>
                    <select
                      value={expensePaymentFilter}
                      onChange={(e) => setExpensePaymentFilter(e.target.value)}
                      className={`w-full px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                    >
                      <option value="All">All Methods</option>
                      <option value="Cash">Cash</option>
                      <option value="EasyPaisa">EasyPaisa</option>
                      <option value="JazzCash">JazzCash</option>
                      <option value="Bank">Bank</option>
                      <option value="Account">Account</option>
                      <option value="Unpaid">Unpaid</option>
                    </select>
                  </div>
                </div>

                {/* Reset Button */}
                <div className="flex justify-end">
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      const today = new Date().toISOString().split('T')[0]
                      setDateFrom(today)
                      setDateTo(today)
                      setTimeFrom('')
                      setTimeTo('')
                      setOrderTypeFilter('All')
                      setPaymentMethodFilter('All')
                      setOrderStatusFilter('All')
                      setPaymentStatusFilter('All')
                      setCashierFilter('All')
                      setExpenseCategoryFilter('All')
                      setExpensePaymentFilter('All')
                      // Close filter panel after reset
                      setShowFilters(false)
                    }}
                    className={`flex items-center px-4 py-2 ${themeClasses.button} rounded-lg transition-all font-medium text-sm`}
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Reset All Filters
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!loading && (
            <>
              {/* Overview Tab */}
              {activeReportTab === 'overview' && (
                <>
                  {/* Key Metrics Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm">Total Revenue</p>
                          <p className="text-3xl font-bold">{formatCurrency(salesData.totalRevenue)}</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-green-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-red-500 to-pink-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-100 text-sm">Total Expenses</p>
                          <p className="text-3xl font-bold">{formatCurrency(expenseData.totalExpenses)}</p>
                          <p className="text-red-200 text-xs mt-1">(Inventory + Other)</p>
                        </div>
                        <Receipt className="w-12 h-12 text-red-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className={`bg-gradient-to-r ${profitData.netProfit >= 0 ? 'from-blue-500 to-cyan-600' : 'from-orange-500 to-red-600'} rounded-3xl p-6 text-white shadow-xl`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Net Profit</p>
                          <p className="text-3xl font-bold">{formatCurrency(profitData.netProfit)}</p>
                        </div>
                        {profitData.netProfit >= 0 ?
                          <TrendingUp className="w-12 h-12 text-blue-100" /> :
                          <TrendingDown className="w-12 h-12 text-orange-100" />
                        }
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Profit Margin</p>
                          <p className="text-3xl font-bold">{profitData.profitMargin.toFixed(1)}%</p>
                        </div>
                        <Percent className="w-12 h-12 text-purple-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Revenue vs Expenses Chart */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <Activity className="w-5 h-5 mr-2 text-purple-600" />
                      Revenue vs Expenses Overview
                    </h3>
                    <div className="h-80">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={profitData.dailyProfitLoss}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                          <XAxis
                            dataKey="date"
                            stroke={isDark ? "#9ca3af" : "#6b7280"}
                            tickFormatter={(value) => new Date(value).toLocaleDateString()}
                          />
                          <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                              color: isDark ? '#f3f4f6' : '#1f2937'
                            }}
                            formatter={(value, name) => [
                              formatCurrency(value),
                              name === 'revenue' ? 'Revenue' :
                                name === 'expenses' ? 'Expenses' : 'Profit'
                            ]}
                            labelFormatter={(value) => new Date(value).toLocaleDateString()}
                          />
                          <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                          <Bar dataKey="expenses" fill={chartColors.danger} name="expenses" />
                          <Line
                            type="monotone"
                            dataKey="profit"
                            stroke={chartColors.primary}
                            strokeWidth={3}
                            name="profit"
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Quick Stats Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                    {/* Orders Summary */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                        <ShoppingCart className="w-5 h-5 mr-2 text-blue-600" />
                        Orders Summary
                      </h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className={themeClasses.textSecondary}>Total Orders:</span>
                          <span className={`font-bold ${themeClasses.textPrimary}`}>{salesData.totalOrders}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeClasses.textSecondary}>Avg Order Value:</span>
                          <span className={`font-bold ${themeClasses.textPrimary}`}>{formatCurrency(salesData.averageOrderValue)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className={themeClasses.textSecondary}>Unique Customers:</span>
                          <span className={`font-bold ${themeClasses.textPrimary}`}>{salesData.totalCustomers}</span>
                        </div>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                        <CreditCard className="w-5 h-5 mr-2 text-green-600" />
                        Payment Methods
                      </h3>
                      <div className="space-y-3">
                        {salesData.paymentMethods.slice(0, 4).map((method, index) => {
                          const Icon = getPaymentMethodIcon(method.name)
                          return (
                            <div key={method.name} className="flex items-center justify-between">
                              <div className="flex items-center">
                                <Icon className={`w-4 h-4 mr-2 ${themeClasses.textSecondary}`} />
                                <span className={`${themeClasses.textSecondary} text-sm`}>{method.name}</span>
                              </div>
                              <span className={`font-semibold ${themeClasses.textPrimary}`}>{formatCurrency(method.revenue)}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>

                    {/* Top Expense Categories */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-lg font-bold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                        <Receipt className="w-5 h-5 mr-2 text-red-600" />
                        Top Expenses
                      </h3>
                      <div className="space-y-3">
                        {expenseData.topExpenseCategories.slice(0, 4).map((category, index) => (
                          <div key={category.name} className="flex items-center justify-between">
                            <span className={`${themeClasses.textSecondary} text-sm`}>{category.name}</span>
                            <span className={`font-semibold ${themeClasses.textPrimary}`}>{formatCurrency(category.amount)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </>
              )}{/* Profit & Loss Tab */}
              {activeReportTab === 'profit-loss' && (
                <>
                  {/* Profit Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`bg-gradient-to-r ${profitData.netProfit >= 0 ? 'from-green-500 to-emerald-600' : 'from-red-500 to-pink-600'} rounded-3xl p-6 text-white shadow-xl`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-white/80 text-sm">Net Profit/Loss</p>
                          <p className="text-3xl font-bold">{formatCurrency(profitData.netProfit)}</p>
                          <p className="text-white/80 text-xs mt-1">
                            {profitData.netProfit >= 0 ? 'Profitable' : 'Loss Making'}
                          </p>
                        </div>
                        {profitData.netProfit >= 0 ?
                          <TrendingUp className="w-12 h-12 text-white/80" /> :
                          <TrendingDown className="w-12 h-12 text-white/80" />
                        }
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Profit Margin</p>
                          <p className="text-3xl font-bold">{profitData.profitMargin.toFixed(2)}%</p>
                          <p className="text-blue-100 text-xs mt-1">
                            {profitData.profitMargin > 20 ? 'Excellent' :
                              profitData.profitMargin > 10 ? 'Good' :
                                profitData.profitMargin > 0 ? 'Fair' : 'Poor'}
                          </p>
                        </div>
                        <Percent className="w-12 h-12 text-blue-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Revenue:Expense Ratio</p>
                          <p className="text-3xl font-bold">
                            {expenseData.totalExpenses > 0 ?
                              (salesData.totalRevenue / expenseData.totalExpenses).toFixed(1) :
                              '∞'
                            }:1
                          </p>
                          <p className="text-purple-100 text-xs mt-1">Revenue per expense</p>
                        </div>
                        <Calculator className="w-12 h-12 text-purple-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Daily Profit/Loss Chart */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <LineChart className="w-5 h-5 mr-2 text-purple-600" />
                      Daily Profit & Loss Analysis
                    </h3>
                    <div className="h-96">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={profitData.dailyProfitLoss}>
                          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                          <XAxis
                            dataKey="date"
                            stroke={isDark ? "#9ca3af" : "#6b7280"}
                            tickFormatter={(value) => new Date(value).toLocaleDateString()}
                          />
                          <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                              border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                              borderRadius: '12px',
                              boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                              color: isDark ? '#f3f4f6' : '#1f2937'
                            }}
                            formatter={(value, name) => [
                              name === 'profitMargin' ? `${value.toFixed(2)}%` : formatCurrency(value),
                              name === 'revenue' ? 'Revenue' :
                                name === 'expenses' ? 'Expenses' :
                                  name === 'profit' ? 'Net Profit' :
                                    'Profit Margin'
                            ]}
                            labelFormatter={(value) => `Date: ${new Date(value).toLocaleDateString()}`}
                          />
                          <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                          <Bar dataKey="expenses" fill={chartColors.danger} name="expenses" />
                          <Line
                            type="monotone"
                            dataKey="profit"
                            stroke={chartColors.primary}
                            strokeWidth={4}
                            name="profit"
                            dot={{ fill: chartColors.primary, strokeWidth: 2, r: 6 }}
                          />
                          <Line
                            type="monotone"
                            dataKey="profitMargin"
                            stroke={chartColors.warning}
                            strokeWidth={3}
                            name="profitMargin"
                            yAxisId="right"
                            dot={{ fill: chartColors.warning, strokeWidth: 2, r: 4 }}
                          />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* Profit/Loss Summary Table */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <FileText className={`w-5 h-5 mr-2 ${themeClasses.textSecondary}`} />
                      Daily Profit/Loss Summary
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className={`${themeClasses.border} border-b`}>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Date</th>
                            <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Revenue</th>
                            <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Expenses</th>
                            <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Net Profit</th>
                            <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Margin %</th>
                            <th className={`text-center py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {profitData.dailyProfitLoss.map((day) => (
                            <tr key={day.date} className={`${themeClasses.border} border-b ${themeClasses.hover} transition-all`}>
                              <td className={`py-3 px-4 font-medium ${themeClasses.textPrimary}`}>
                                {new Date(day.date).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-green-600">
                                {formatCurrency(day.revenue)}
                              </td>
                              <td className="py-3 px-4 text-right font-semibold text-red-600">
                                {formatCurrency(day.expenses)}
                              </td>
                              <td className={`py-3 px-4 text-right font-bold ${day.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatCurrency(day.profit)}
                              </td>
                              <td className={`py-3 px-4 text-right font-semibold ${day.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {day.profitMargin.toFixed(2)}%
                              </td>
                              <td className="py-3 px-4 text-center">
                                {day.profit >= 0 ?
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <TrendingUp className="w-3 h-3 mr-1" />
                                    Profit
                                  </span> :
                                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">
                                    <TrendingDown className="w-3 h-3 mr-1" />
                                    Loss
                                  </span>
                                }
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}

              {/* Expenses Tab */}
              {activeReportTab === 'expenses' && (
                <>
                  {/* Expense Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-red-500 to-pink-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-100 text-sm">Total Expenses</p>
                          <p className="text-3xl font-bold">{formatCurrency(expenseData.totalExpenses)}</p>
                          <p className="text-red-200 text-xs mt-1">(Inventory Purchases + Other Expenses)</p>
                        </div>
                        <Receipt className="w-12 h-12 text-red-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-orange-500 to-amber-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm">Avg Daily Expense</p>
                          <p className="text-3xl font-bold">
                            {formatCurrency(expenseData.dailyExpenses.length > 0 ?
                              expenseData.totalExpenses / expenseData.dailyExpenses.length : 0)}
                          </p>
                        </div>
                        <Calendar className="w-12 h-12 text-orange-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Expense Categories</p>
                          <p className="text-3xl font-bold">{expenseData.expensesByCategory.length}</p>
                        </div>
                        <Settings className="w-12 h-12 text-purple-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Expense to Revenue</p>
                          <p className="text-3xl font-bold">
                            {salesData.totalRevenue > 0 ?
                              ((expenseData.totalExpenses / salesData.totalRevenue) * 100).toFixed(1) : 0}%
                          </p>
                        </div>
                        <Percent className="w-12 h-12 text-blue-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Expense Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Expenses by Category */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <PieChart className="w-5 h-5 mr-2 text-red-600" />
                        Expenses by Category
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                color: isDark ? '#f3f4f6' : '#1f2937'
                              }}
                              formatter={(value, name) => [formatCurrency(value), name]}
                            />
                            <Pie
                              data={expenseData.expensesByCategory}
                              dataKey="amount"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                            >
                              {expenseData.expensesByCategory.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                              ))}
                            </Pie>
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Daily Expenses Trend */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <LineChart className="w-5 h-5 mr-2 text-orange-600" />
                        Daily Expense Trends
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={expenseData.dailyExpenses}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                            <XAxis
                              dataKey="date"
                              stroke={isDark ? "#9ca3af" : "#6b7280"}
                              tickFormatter={(value) => new Date(value).toLocaleDateString()}
                            />
                            <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                color: isDark ? '#f3f4f6' : '#1f2937'
                              }}
                              formatter={(value, name) => [
                                name === 'amount' ? formatCurrency(value) : value,
                                name === 'amount' ? 'Amount' : 'Count'
                              ]}
                              labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            />
                            <Area
                              type="monotone"
                              dataKey="amount"
                              stackId="1"
                              stroke={chartColors.expense}
                              fill={chartColors.expense}
                              fillOpacity={0.6}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Top Expense Categories */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <Star className="w-5 h-5 mr-2 text-yellow-600" />
                      Top Expense Categories
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {expenseData.topExpenseCategories.map((category, index) => (
                        <div key={category.name} className={`${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl p-4 transition-all`}>
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-gradient-to-r from-red-500 to-pink-500 rounded-lg flex items-center justify-center text-white font-bold text-sm mr-3">
                                {index + 1}
                              </div>
                              <h4 className={`font-semibold ${themeClasses.textPrimary}`}>{category.name}</h4>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className={themeClasses.textSecondary}>Amount:</span>
                              <span className="font-bold text-red-600">{formatCurrency(category.amount)}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className={themeClasses.textSecondary}>Transactions:</span>
                              <span className={`font-semibold ${themeClasses.textPrimary}`}>{category.value}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                              <span className={themeClasses.textSecondary}>Avg per transaction:</span>
                              <span className={`font-semibold ${themeClasses.textPrimary}`}>
                                {formatCurrency(category.amount / category.value)}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Daily P&L Tab */}
              {activeReportTab === 'daily-pnl' && (
                <>
                  {/* Daily P&L Section */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} flex items-center`}>
                        <Target className="w-5 h-5 mr-2 text-purple-600" />
                        Daily Profit & Loss (COGS Based)
                      </h3>
                      <div className="flex items-center gap-4">
                        <input
                          type="date"
                          value={selectedPnLDate}
                          onChange={(e) => setSelectedPnLDate(e.target.value)}
                          className={`px-3 py-2 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-sm`}
                        />
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => fetchDailyPnL(selectedPnLDate)}
                          disabled={dailyPnLLoading}
                          className="flex items-center px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all disabled:opacity-50 text-sm"
                        >
                          <RefreshCw className={`w-4 h-4 mr-1 ${dailyPnLLoading ? 'animate-spin' : ''}`} />
                          {dailyPnLLoading ? 'Loading...' : 'Calculate'}
                        </motion.button>
                      </div>
                    </div>

                    <p className={`text-sm ${themeClasses.textSecondary} mb-6`}>
                      Shows only <strong>Completed</strong> orders for accurate revenue and COGS calculation
                    </p>

                    {dailyPnLData?.isOfflineMode && (
                      <div className={`mb-4 p-3 rounded-lg ${isDark ? 'bg-yellow-900/20 border-yellow-700/30' : 'bg-yellow-50 border-yellow-200'} border flex items-center`}>
                        <WifiOff className="w-4 h-4 text-yellow-500 mr-2" />
                        <span className={`text-sm ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>
                          Offline mode - showing cached orders only. COGS calculation requires internet connection.
                        </span>
                      </div>
                    )}

                    {dailyPnLLoading ? (
                      <div className="flex items-center justify-center py-12">
                        <RefreshCw className="w-8 h-8 animate-spin text-purple-600" />
                        <span className={`ml-3 ${themeClasses.textSecondary}`}>Calculating COGS...</span>
                      </div>
                    ) : dailyPnLData ? (
                      <>
                        {/* P&L Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                          <div className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-2xl p-4 text-white">
                            <p className="text-green-100 text-xs mb-1">Total Revenue</p>
                            <p className="text-2xl font-bold">{formatCurrency(dailyPnLData.totalRevenue)}</p>
                            <p className="text-green-100 text-xs mt-1">{dailyPnLData.orderCount} completed orders</p>
                          </div>
                          <div className="bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl p-4 text-white">
                            <p className="text-orange-100 text-xs mb-1">Cost of Goods Sold</p>
                            <p className="text-2xl font-bold">{formatCurrency(dailyPnLData.totalCOGS)}</p>
                            <p className="text-orange-100 text-xs mt-1">Inventory consumed</p>
                          </div>
                          <div className={`bg-gradient-to-r ${dailyPnLData.netProfit >= 0 ? 'from-purple-500 to-indigo-600' : 'from-red-500 to-pink-600'} rounded-2xl p-4 text-white`}>
                            <p className="text-purple-100 text-xs mb-1">Net Profit</p>
                            <p className="text-2xl font-bold">{formatCurrency(dailyPnLData.netProfit)}</p>
                            <p className="text-purple-100 text-xs mt-1">Revenue - COGS</p>
                          </div>
                          <div className={`bg-gradient-to-r ${dailyPnLData.profitMargin >= 0 ? 'from-cyan-500 to-blue-600' : 'from-gray-500 to-gray-600'} rounded-2xl p-4 text-white`}>
                            <p className="text-cyan-100 text-xs mb-1">Profit Margin</p>
                            <p className="text-2xl font-bold">{dailyPnLData.profitMargin.toFixed(1)}%</p>
                            <p className="text-cyan-100 text-xs mt-1">
                              {dailyPnLData.offlineOrderCount > 0 && `+${dailyPnLData.offlineOrderCount} offline`}
                            </p>
                          </div>
                        </div>

                        {/* P&L Chart */}
                        {dailyPnLData.orderDetails && dailyPnLData.orderDetails.length > 0 && (
                          <div className="mb-6">
                            <h4 className={`font-semibold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                              <BarChart3 className="w-4 h-4 mr-2 text-purple-600" />
                              Revenue vs COGS by Order
                            </h4>
                            <div className="h-80">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dailyPnLData.orderDetails.slice(0, 15)}>
                                  <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                                  <XAxis
                                    dataKey="orderNumber"
                                    stroke={isDark ? "#9ca3af" : "#6b7280"}
                                    tick={{ fontSize: 10 }}
                                  />
                                  <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                                  <Tooltip
                                    contentStyle={{
                                      backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                      border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                      borderRadius: '12px',
                                      color: isDark ? '#f3f4f6' : '#1f2937'
                                    }}
                                    formatter={(value, name) => [
                                      formatCurrency(value),
                                      name === 'revenue' ? 'Revenue' : name === 'cogs' ? 'COGS' : 'Profit'
                                    ]}
                                  />
                                  <Legend />
                                  <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                                  <Bar dataKey="cogs" fill={chartColors.warning} name="cogs" />
                                  <Bar dataKey="profit" fill={chartColors.primary} name="profit" />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        )}

                        {/* Ingredient Breakdown */}
                        {dailyPnLData.ingredientBreakdown && dailyPnLData.ingredientBreakdown.length > 0 && (
                          <div>
                            <h4 className={`font-semibold ${themeClasses.textPrimary} mb-4 flex items-center`}>
                              <Activity className="w-4 h-4 mr-2 text-orange-600" />
                              Top Ingredients by Cost
                            </h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto">
                              {dailyPnLData.ingredientBreakdown.slice(0, 20).map((ingredient, index) => (
                                <div
                                  key={index}
                                  className={`flex items-center justify-between p-3 ${isDark ? 'bg-gray-700' : 'bg-gray-50'} rounded-xl`}
                                >
                                  <div className="flex items-center">
                                    <div className="w-8 h-8 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg flex items-center justify-center text-white font-bold text-xs mr-3">
                                      {index + 1}
                                    </div>
                                    <div>
                                      <p className={`font-medium ${themeClasses.textPrimary} text-sm`}>{ingredient.name}</p>
                                      <p className={`text-xs ${themeClasses.textSecondary}`}>
                                        {ingredient.quantity.toFixed(3)} {ingredient.unit}
                                      </p>
                                    </div>
                                  </div>
                                  <p className="font-bold text-orange-600">{formatCurrency(ingredient.cost)}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {dailyPnLData.orderCount === 0 && (
                          <div className="text-center py-8">
                            <Target className={`w-12 h-12 ${themeClasses.textSecondary} mx-auto mb-3`} />
                            <p className={themeClasses.textSecondary}>No completed orders found for this date</p>
                            <p className={`text-sm ${themeClasses.textSecondary}`}>Select a different date or mark orders as Completed</p>
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-center py-8">
                        <Target className={`w-12 h-12 ${themeClasses.textSecondary} mx-auto mb-3`} />
                        <p className={themeClasses.textSecondary}>Select a date and click Calculate</p>
                        <p className={`text-sm ${themeClasses.textSecondary}`}>to view Daily P&L with COGS breakdown</p>
                      </div>
                    )}
                  </div>

                  {/* Order Details Table */}
                  {dailyPnLData && dailyPnLData.orderDetails && dailyPnLData.orderDetails.length > 0 && (
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <FileText className="w-5 h-5 mr-2 text-blue-600" />
                        Order-by-Order Breakdown
                      </h3>
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className={`${themeClasses.border} border-b`}>
                              <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Order #</th>
                              <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Revenue</th>
                              <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>COGS</th>
                              <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Profit</th>
                              <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Margin</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dailyPnLData.orderDetails.map((order, index) => (
                              <tr key={index} className={`${themeClasses.border} border-b ${themeClasses.hover}`}>
                                <td className="py-3 px-4">
                                  <span className="font-mono text-sm font-semibold text-purple-600">
                                    #{order.orderNumber}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className="text-green-600 font-medium">{formatCurrency(order.revenue)}</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className="text-orange-600 font-medium">{formatCurrency(order.cogs)}</span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`font-bold ${order.profit >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                    {formatCurrency(order.profit)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`font-medium ${order.revenue > 0 && (order.profit / order.revenue) * 100 >= 0 ? 'text-cyan-600' : 'text-red-600'}`}>
                                    {order.revenue > 0 ? ((order.profit / order.revenue) * 100).toFixed(1) : 0}%
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className={`${isDark ? 'bg-gray-700' : 'bg-gray-100'} font-bold`}>
                              <td className="py-3 px-4">TOTAL</td>
                              <td className="py-3 px-4 text-right text-green-600">{formatCurrency(dailyPnLData.totalRevenue)}</td>
                              <td className="py-3 px-4 text-right text-orange-600">{formatCurrency(dailyPnLData.totalCOGS)}</td>
                              <td className="py-3 px-4 text-right text-purple-600">{formatCurrency(dailyPnLData.netProfit)}</td>
                              <td className="py-3 px-4 text-right text-cyan-600">{dailyPnLData.profitMargin.toFixed(1)}%</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Product Performance Tab */}
              {activeReportTab === 'product-performance' && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Total Products Sold</p>
                          <p className="text-3xl font-bold">{productPerformanceData.totalProductsSold.toLocaleString()}</p>
                        </div>
                        <ShoppingCart className="w-12 h-12 text-purple-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Unique Products</p>
                          <p className="text-3xl font-bold">{productPerformanceData.totalUniqueProducts}</p>
                        </div>
                        <Coffee className="w-12 h-12 text-blue-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm">Avg Product Revenue</p>
                          <p className="text-3xl font-bold">{formatCurrency(productPerformanceData.averageProductRevenue)}</p>
                        </div>
                        <DollarSign className="w-12 h-12 text-green-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="bg-gradient-to-r from-orange-500 to-red-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm">Best Seller</p>
                          <p className="text-xl font-bold truncate">
                            {productPerformanceData.bestSellers[0]?.name || 'N/A'}
                          </p>
                          <p className="text-orange-200 text-xs mt-1">
                            {productPerformanceData.bestSellers[0]?.quantity || 0} sold
                          </p>
                        </div>
                        <Star className="w-12 h-12 text-orange-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Best Sellers Section */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <TrendingUp className="w-6 h-6 mr-2 text-green-600" />
                      Best Sellers (Top 20 by Quantity)
                    </h3>

                    {productPerformanceData.bestSellers.length === 0 ? (
                      <div className="text-center py-12">
                        <Coffee className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                        <p className={`${themeClasses.textSecondary}`}>No sales data available for the selected period</p>
                      </div>
                    ) : (
                      <>
                        {/* Chart */}
                        <div className="h-96 mb-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={productPerformanceData.bestSellers.slice(0, 10)}>
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                              <XAxis
                                dataKey="name"
                                stroke={isDark ? "#9ca3af" : "#6b7280"}
                                angle={-45}
                                textAnchor="end"
                                height={100}
                                interval={0}
                                tick={{ fontSize: 10 }}
                              />
                              <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                  color: isDark ? '#f3f4f6' : '#1f2937'
                                }}
                                formatter={(value, name) => {
                                  if (name === 'quantity') return [value, 'Quantity Sold']
                                  if (name === 'revenue') return [formatCurrency(value), 'Total Revenue']
                                  return [value, name]
                                }}
                              />
                              <Legend />
                              <Bar dataKey="quantity" fill={chartColors.primary} name="quantity" />
                              <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Rank</th>
                                <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Product</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Qty Sold</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Revenue</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Avg Price</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Orders</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productPerformanceData.bestSellers.map((product, index) => (
                                <tr key={index} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b hover:${isDark ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}>
                                  <td className={`p-3 ${themeClasses.textPrimary}`}>
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                                      index === 0 ? 'bg-yellow-500 text-white' :
                                      index === 1 ? 'bg-gray-400 text-white' :
                                      index === 2 ? 'bg-orange-600 text-white' :
                                      isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                                    } font-bold text-sm`}>
                                      {index + 1}
                                    </span>
                                  </td>
                                  <td className={`p-3 ${themeClasses.textPrimary}`}>
                                    <div className="font-medium">{product.productName}</div>
                                    {product.variantName && (
                                      <div className={`text-xs ${themeClasses.textSecondary}`}>{product.variantName}</div>
                                    )}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textPrimary} font-semibold`}>
                                    {product.quantity.toLocaleString()}
                                  </td>
                                  <td className={`p-3 text-right font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                    {formatCurrency(product.revenue)}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textPrimary}`}>
                                    {formatCurrency(product.averagePrice)}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textSecondary}`}>
                                    {product.orderCount}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Worst Sellers Section */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <TrendingDown className="w-6 h-6 mr-2 text-red-600" />
                      Worst Sellers (Bottom 10 by Quantity)
                    </h3>

                    {productPerformanceData.worstSellers.length === 0 ? (
                      <div className="text-center py-12">
                        <AlertCircle className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                        <p className={`${themeClasses.textSecondary}`}>No data available</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full">
                          <thead>
                            <tr className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                              <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Product</th>
                              <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Qty Sold</th>
                              <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Revenue</th>
                              <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Avg Price</th>
                              <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Orders</th>
                            </tr>
                          </thead>
                          <tbody>
                            {productPerformanceData.worstSellers.map((product, index) => (
                              <tr key={index} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b hover:${isDark ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}>
                                <td className={`p-3 ${themeClasses.textPrimary}`}>
                                  <div className="font-medium">{product.productName}</div>
                                  {product.variantName && (
                                    <div className={`text-xs ${themeClasses.textSecondary}`}>{product.variantName}</div>
                                  )}
                                </td>
                                <td className={`p-3 text-right ${themeClasses.textPrimary} font-semibold`}>
                                  {product.quantity.toLocaleString()}
                                </td>
                                <td className={`p-3 text-right font-semibold ${isDark ? 'text-red-400' : 'text-red-600'}`}>
                                  {formatCurrency(product.revenue)}
                                </td>
                                <td className={`p-3 text-right ${themeClasses.textPrimary}`}>
                                  {formatCurrency(product.averagePrice)}
                                </td>
                                <td className={`p-3 text-right ${themeClasses.textSecondary}`}>
                                  {product.orderCount}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Top Revenue Products */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <DollarSign className="w-6 h-6 mr-2 text-purple-600" />
                      Top Revenue Generators (Top 20 by Revenue)
                    </h3>

                    {productPerformanceData.topRevenueProducts.length === 0 ? (
                      <div className="text-center py-12">
                        <DollarSign className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                        <p className={`${themeClasses.textSecondary}`}>No revenue data available</p>
                      </div>
                    ) : (
                      <>
                        {/* Pie Chart */}
                        <div className="h-96 mb-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <RechartsPieChart>
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                  color: isDark ? '#f3f4f6' : '#1f2937'
                                }}
                                formatter={(value, name) => [formatCurrency(value), name]}
                              />
                              <Pie
                                data={productPerformanceData.topRevenueProducts.slice(0, 8)}
                                dataKey="revenue"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                outerRadius={120}
                                label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                              >
                                {productPerformanceData.topRevenueProducts.slice(0, 8).map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                                ))}
                              </Pie>
                            </RechartsPieChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Rank</th>
                                <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Product</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Revenue</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Qty Sold</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Avg Price</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Orders</th>
                              </tr>
                            </thead>
                            <tbody>
                              {productPerformanceData.topRevenueProducts.map((product, index) => (
                                <tr key={index} className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b hover:${isDark ? 'bg-gray-800' : 'bg-gray-50'} transition-colors`}>
                                  <td className={`p-3 ${themeClasses.textPrimary}`}>
                                    <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full ${
                                      index === 0 ? 'bg-yellow-500 text-white' :
                                      index === 1 ? 'bg-gray-400 text-white' :
                                      index === 2 ? 'bg-orange-600 text-white' :
                                      isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-600'
                                    } font-bold text-sm`}>
                                      {index + 1}
                                    </span>
                                  </td>
                                  <td className={`p-3 ${themeClasses.textPrimary}`}>
                                    <div className="font-medium">{product.productName}</div>
                                    {product.variantName && (
                                      <div className={`text-xs ${themeClasses.textSecondary}`}>{product.variantName}</div>
                                    )}
                                  </td>
                                  <td className={`p-3 text-right font-bold ${isDark ? 'text-green-400' : 'text-green-600'} text-lg`}>
                                    {formatCurrency(product.revenue)}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textPrimary} font-semibold`}>
                                    {product.quantity.toLocaleString()}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textPrimary}`}>
                                    {formatCurrency(product.averagePrice)}
                                  </td>
                                  <td className={`p-3 text-right ${themeClasses.textSecondary}`}>
                                    {product.orderCount}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>
                </>
              )}

              {/* Peak Hours Tab */}
              {activeReportTab === 'peak-hours' && (
                <>
                  {/* Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-orange-500 to-red-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-orange-100 text-sm">Busiest Hour</p>
                          <p className="text-3xl font-bold">
                            {peakHoursData.busiestHour ?
                              `${peakHoursData.busiestHour.hour}:00` :
                              'N/A'}
                          </p>
                          <p className="text-orange-200 text-xs mt-1">
                            {peakHoursData.busiestHour?.orderCount || 0} orders
                          </p>
                        </div>
                        <Clock className="w-12 h-12 text-orange-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Avg Orders/Hour</p>
                          <p className="text-3xl font-bold">
                            {peakHoursData.averageOrdersPerHour.toFixed(1)}
                          </p>
                        </div>
                        <Activity className="w-12 h-12 text-blue-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Total Orders</p>
                          <p className="text-3xl font-bold">
                            {peakHoursData.totalOrdersAnalyzed.toLocaleString()}
                          </p>
                          <p className="text-purple-200 text-xs mt-1">Analyzed</p>
                        </div>
                        <ShoppingCart className="w-12 h-12 text-purple-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm">Peak Day</p>
                          <p className="text-2xl font-bold">
                            {peakHoursData.peakDays[0]?.day || 'N/A'}
                          </p>
                          <p className="text-green-200 text-xs mt-1">
                            {peakHoursData.peakDays[0]?.orderCount || 0} orders
                          </p>
                        </div>
                        <Calendar className="w-12 h-12 text-green-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Hourly Breakdown Chart */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <Clock className="w-6 h-6 mr-2 text-orange-600" />
                      Hourly Sales Breakdown
                    </h3>

                    {peakHoursData.hourlyData.length === 0 ? (
                      <div className="text-center py-12">
                        <Clock className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                        <p className={`${themeClasses.textSecondary}`}>No hourly data available for the selected period</p>
                      </div>
                    ) : (
                      <>
                        {/* Bar Chart */}
                        <div className="h-96 mb-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <ComposedChart data={peakHoursData.hourlyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                              <XAxis
                                dataKey="hour"
                                stroke={isDark ? "#9ca3af" : "#6b7280"}
                                tickFormatter={(hour) => `${hour}:00`}
                              />
                              <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                  color: isDark ? '#f3f4f6' : '#1f2937'
                                }}
                                formatter={(value, name) => {
                                  if (name === 'orderCount') return [value, 'Orders']
                                  if (name === 'revenue') return [formatCurrency(value), 'Revenue']
                                  return [value, name]
                                }}
                                labelFormatter={(hour) => `${hour}:00 - ${hour + 1}:00`}
                              />
                              <Legend />
                              <Bar dataKey="orderCount" fill={chartColors.primary} name="orderCount" />
                              <Line
                                type="monotone"
                                dataKey="revenue"
                                stroke={chartColors.success}
                                strokeWidth={3}
                                name="revenue"
                              />
                            </ComposedChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Hourly Details Table */}
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className={`${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                                <th className={`p-3 text-left ${themeClasses.textPrimary} font-bold text-sm`}>Time Slot</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Orders</th>
                                <th className={`p-3 text-right ${themeClasses.textPrimary} font-bold text-sm`}>Revenue</th>
                                <th className={`p-3 text-center ${themeClasses.textPrimary} font-bold text-sm`}>Walk-in</th>
                                <th className={`p-3 text-center ${themeClasses.textPrimary} font-bold text-sm`}>Takeaway</th>
                                <th className={`p-3 text-center ${themeClasses.textPrimary} font-bold text-sm`}>Delivery</th>
                              </tr>
                            </thead>
                            <tbody>
                              {peakHoursData.hourlyData
                                .filter(h => h.orderCount > 0)
                                .map((hourData, index) => {
                                  const isBusiest = peakHoursData.busiestHour?.hour === hourData.hour
                                  return (
                                    <tr
                                      key={index}
                                      className={`${isDark ? 'border-gray-700' : 'border-gray-200'} border-b hover:${isDark ? 'bg-gray-800' : 'bg-gray-50'} transition-colors ${
                                        isBusiest ? (isDark ? 'bg-orange-900/20' : 'bg-orange-50') : ''
                                      }`}
                                    >
                                      <td className={`p-3 ${themeClasses.textPrimary} font-medium`}>
                                        {hourData.hour}:00 - {hourData.hour + 1}:00
                                        {isBusiest && (
                                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${isDark ? 'bg-orange-900 text-orange-300' : 'bg-orange-200 text-orange-700'}`}>
                                            Peak
                                          </span>
                                        )}
                                      </td>
                                      <td className={`p-3 text-right font-semibold ${themeClasses.textPrimary}`}>
                                        {hourData.orderCount}
                                      </td>
                                      <td className={`p-3 text-right font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                                        {formatCurrency(hourData.revenue)}
                                      </td>
                                      <td className={`p-3 text-center ${themeClasses.textSecondary}`}>
                                        {hourData.orderTypes.walkin}
                                      </td>
                                      <td className={`p-3 text-center ${themeClasses.textSecondary}`}>
                                        {hourData.orderTypes.takeaway}
                                      </td>
                                      <td className={`p-3 text-center ${themeClasses.textSecondary}`}>
                                        {hourData.orderTypes.delivery}
                                      </td>
                                    </tr>
                                  )
                                })}
                            </tbody>
                          </table>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Day of Week Comparison */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6 mb-8`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <Calendar className="w-6 h-6 mr-2 text-purple-600" />
                      Day of Week Analysis
                    </h3>

                    {peakHoursData.dailyData.length === 0 ? (
                      <div className="text-center py-12">
                        <Calendar className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                        <p className={`${themeClasses.textSecondary}`}>No daily data available</p>
                      </div>
                    ) : (
                      <>
                        {/* Bar Chart for Days */}
                        <div className="h-80 mb-6">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={peakHoursData.dailyData}>
                              <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                              <XAxis
                                dataKey="day"
                                stroke={isDark ? "#9ca3af" : "#6b7280"}
                              />
                              <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                              <Tooltip
                                contentStyle={{
                                  backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                  borderRadius: '12px',
                                  boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                  color: isDark ? '#f3f4f6' : '#1f2937'
                                }}
                                formatter={(value, name) => {
                                  if (name === 'orderCount') return [value, 'Orders']
                                  if (name === 'revenue') return [formatCurrency(value), 'Revenue']
                                  return [value, name]
                                }}
                              />
                              <Legend />
                              <Bar dataKey="orderCount" fill={chartColors.info} name="orderCount" />
                              <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>

                        {/* Daily Summary Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {peakHoursData.peakDays.map((day, index) => {
                            const medalColors = [
                              { bg: 'from-yellow-500 to-orange-500', text: 'text-yellow-100', medal: '🥇' },
                              { bg: 'from-gray-400 to-gray-500', text: 'text-gray-100', medal: '🥈' },
                              { bg: 'from-orange-600 to-red-600', text: 'text-orange-100', medal: '🥉' }
                            ]
                            const colors = medalColors[index] || medalColors[2]

                            return (
                              <motion.div
                                key={day.dayIndex}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: index * 0.1 }}
                                className={`bg-gradient-to-r ${colors.bg} rounded-2xl p-5 text-white shadow-lg`}
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-2xl">{colors.medal}</span>
                                  <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-white/20`}>
                                    #{index + 1}
                                  </span>
                                </div>
                                <h4 className={`text-xl font-bold ${colors.text} mb-1`}>
                                  {day.day}
                                </h4>
                                <p className={`${colors.text} text-sm mb-2`}>
                                  {day.orderCount} orders
                                </p>
                                <p className="text-2xl font-bold">
                                  {formatCurrency(day.revenue)}
                                </p>
                              </motion.div>
                            )
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Insights & Recommendations */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                    <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                      <Target className="w-6 h-6 mr-2 text-blue-600" />
                      Business Insights
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      {/* Peak Hours Insight */}
                      <div className={`${isDark ? 'bg-orange-900/20 border-orange-700/30' : 'bg-orange-50 border-orange-200'} border-2 rounded-xl p-5`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full ${isDark ? 'bg-orange-700' : 'bg-orange-500'} flex items-center justify-center flex-shrink-0`}>
                            <TrendingUp className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className={`font-bold ${isDark ? 'text-orange-300' : 'text-orange-700'} mb-2`}>
                              Peak Hours Strategy
                            </h4>
                            <p className={`text-sm ${isDark ? 'text-orange-200' : 'text-orange-600'}`}>
                              Your busiest hour is {peakHoursData.busiestHour?.hour || 'N/A'}:00 with {peakHoursData.busiestHour?.orderCount || 0} orders.
                              Consider scheduling more staff during this time and ensuring inventory is well-stocked.
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Slow Hours Insight */}
                      <div className={`${isDark ? 'bg-blue-900/20 border-blue-700/30' : 'bg-blue-50 border-blue-200'} border-2 rounded-xl p-5`}>
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-full ${isDark ? 'bg-blue-700' : 'bg-blue-500'} flex items-center justify-center flex-shrink-0`}>
                            <TrendingDown className="w-5 h-5 text-white" />
                          </div>
                          <div className="flex-1">
                            <h4 className={`font-bold ${isDark ? 'text-blue-300' : 'text-blue-700'} mb-2`}>
                              Slow Period Opportunity
                            </h4>
                            <p className={`text-sm ${isDark ? 'text-blue-200' : 'text-blue-600'}`}>
                              The slowest hour is {peakHoursData.slowestHour?.hour || 'N/A'}:00.
                              Run promotions or happy hour specials during slow periods to increase traffic.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Customer Ledger Tab */}
              {activeReportTab === 'ledger' && (
                <LedgerTab
                  userId={user?.id}
                  startDate={dateFrom}
                  endDate={dateTo}
                />
              )}

              {/* Detailed Tab */}
              {activeReportTab === 'detailed' && (
                <>
                  {/* Comprehensive Metrics Dashboard */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-gradient-to-r from-green-500 to-emerald-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-green-100 text-sm">Total Revenue</p>
                          <p className="text-2xl font-bold">{formatCurrency(salesData.totalRevenue)}</p>
                        </div>
                        <DollarSign className="w-10 h-10 text-green-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 }}
                      className="bg-gradient-to-r from-blue-500 to-cyan-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-blue-100 text-sm">Total Orders</p>
                          <p className="text-2xl font-bold">{salesData.totalOrders.toLocaleString()}</p>
                        </div>
                        <ShoppingCart className="w-10 h-10 text-blue-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 }}
                      className="bg-gradient-to-r from-red-500 to-pink-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-red-100 text-sm">Total Expenses</p>
                          <p className="text-2xl font-bold">{formatCurrency(expenseData.totalExpenses)}</p>
                        </div>
                        <Receipt className="w-10 h-10 text-red-100" />
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.3 }}
                      className={`bg-gradient-to-r ${profitData.netProfit >= 0 ? 'from-purple-500 to-indigo-600' : 'from-orange-500 to-red-600'} rounded-3xl p-6 text-white shadow-xl`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-purple-100 text-sm">Net Profit</p>
                          <p className="text-2xl font-bold">{formatCurrency(profitData.netProfit)}</p>
                        </div>
                        {profitData.netProfit >= 0 ?
                          <TrendingUp className="w-10 h-10 text-purple-100" /> :
                          <TrendingDown className="w-10 h-10 text-orange-100" />
                        }
                      </div>
                    </motion.div>

                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="bg-gradient-to-r from-yellow-500 to-orange-600 rounded-3xl p-6 text-white shadow-xl"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-yellow-100 text-sm">Customers</p>
                          <p className="text-2xl font-bold">{salesData.totalCustomers.toLocaleString()}</p>
                        </div>
                        <Users className="w-10 h-10 text-yellow-100" />
                      </div>
                    </motion.div>
                  </div>

                  {/* Comprehensive Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Revenue vs Expenses vs Profit */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <BarChart3 className="w-5 h-5 mr-2 text-purple-600" />
                        Revenue vs Expenses vs Profit
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={profitData.dailyProfitLoss}>
                            <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e0e7ff"} />
                            <XAxis
                              dataKey="date"
                              stroke={isDark ? "#9ca3af" : "#6b7280"}
                              tickFormatter={(value) => new Date(value).toLocaleDateString()}
                            />
                            <YAxis stroke={isDark ? "#9ca3af" : "#6b7280"} />
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                color: isDark ? '#f3f4f6' : '#1f2937'
                              }}
                              formatter={(value, name) => [
                                formatCurrency(value),
                                name === 'revenue' ? 'Revenue' :
                                  name === 'expenses' ? 'Expenses' : 'Net Profit'
                              ]}
                              labelFormatter={(value) => new Date(value).toLocaleDateString()}
                            />
                            <Bar dataKey="revenue" fill={chartColors.success} name="revenue" />
                            <Bar dataKey="expenses" fill={chartColors.danger} name="expenses" />
                            <Line
                              type="monotone"
                              dataKey="profit"
                              stroke={chartColors.primary}
                              strokeWidth={3}
                              name="profit"
                            />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Order Types Distribution */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <Coffee className="w-5 h-5 mr-2 text-green-600" />
                        Order Types Distribution
                      </h3>
                      <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                          <RechartsPieChart>
                            <Tooltip
                              contentStyle={{
                                backgroundColor: isDark ? 'rgba(31, 41, 55, 0.95)' : 'rgba(255, 255, 255, 0.95)',
                                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                                borderRadius: '12px',
                                boxShadow: '0 10px 25px rgba(0, 0, 0, 0.1)',
                                color: isDark ? '#f3f4f6' : '#1f2937'
                              }}
                              formatter={(value, name) => [
                                `${value} orders (${formatCurrency(salesData.ordersByType.find(t => t.name === name)?.revenue || 0)})`,
                                name
                              ]}
                            />
                            <Pie
                              data={salesData.ordersByType}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={80}
                            >
                              {salesData.ordersByType.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                              ))}
                            </Pie>
                          </RechartsPieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Analytics Tables */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                    {/* Top Products */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <TrendingUp className="w-5 h-5 mr-2 text-green-600" />
                        Top Selling Products
                      </h3>
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {salesData.topProducts.map((product, index) => (
                          <div key={index} className={`flex items-center justify-between p-3 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl transition-all`}>
                            <div className="flex items-center">
                              <div className="w-8 h-8 bg-gradient-to-r from-green-500 to-emerald-500 rounded-lg flex items-center justify-center text-white font-bold text-sm mr-3">
                                {index + 1}
                              </div>
                              <div>
                                <h4 className={`font-semibold ${themeClasses.textPrimary} truncate max-w-40`}>
                                  {product.name}
                                </h4>
                                <p className={`text-sm ${themeClasses.textSecondary}`}>{product.quantity} sold</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`font-bold ${themeClasses.textPrimary}`}>{formatCurrency(product.revenue)}</p>
                              <p className={`text-sm ${themeClasses.textSecondary}`}>
                                {formatCurrency(product.revenue / product.quantity)} avg
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Top Customers */}
                    <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} mb-6 flex items-center`}>
                        <Users className="w-5 h-5 mr-2 text-blue-600" />
                        Valuable Customers
                      </h3>
                      <div className="space-y-3 max-h-80 overflow-y-auto">
                        {salesData.topCustomers && salesData.topCustomers.length > 0 ? (
                          salesData.topCustomers.map((customer, index) => (
                            <div key={customer.id} className={`flex items-center justify-between p-3 ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-50 hover:bg-gray-100'} rounded-xl transition-all`}>
                              <div className="flex items-center">
                                <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center text-white font-bold text-sm mr-3">
                                  {index + 1}
                                </div>
                                <div>
                                  <h4 className={`font-semibold ${themeClasses.textPrimary}`}>{customer.name}</h4>
                                  <p className={`text-sm ${themeClasses.textSecondary} flex items-center`}>
                                    <Phone className="w-3 h-3 mr-1" />
                                    {customer.phone}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className={`font-bold ${themeClasses.textPrimary}`}>{formatCurrency(customer.revenue)}</p>
                                <p className={`text-sm ${themeClasses.textSecondary}`}>{customer.orders} orders</p>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="text-center py-8">
                            <Users className={`w-12 h-12 ${themeClasses.textSecondary} mx-auto mb-3`} />
                            <p className={themeClasses.textSecondary}>No customer data available</p>
                            <p className={`text-sm ${themeClasses.textSecondary}`}>Most orders are walk-ins</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recent Transactions Table */}
                  <div className={`${themeClasses.card} rounded-3xl ${themeClasses.shadow} ${themeClasses.border} border p-6`}>
                    <div className="flex items-center justify-between mb-6">
                      <h3 className={`text-xl font-bold ${themeClasses.textPrimary} flex items-center`}>
                        <FileText className={`w-5 h-5 mr-2 ${themeClasses.textSecondary}`} />
                        Recent Transactions
                      </h3>
                      <div className={`text-sm ${themeClasses.textSecondary}`}>
                        Showing latest {Math.min(rawOrders.length + rawExpenses.length, 20)} transactions
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className={`${themeClasses.border} border-b`}>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Type</th>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>ID</th>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Date/Time</th>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Description</th>
                            <th className={`text-left py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Method</th>
                            <th className={`text-right py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Amount</th>
                            <th className={`text-center py-3 px-4 font-semibold ${themeClasses.textPrimary}`}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {/* Combine and sort orders and expenses by date */}
                          {[
                            ...rawOrders.map(order => ({
                              type: 'order',
                              id: order.order_number,
                              date: order.order_date,
                              time: order.order_time,
                              description: `${order.order_type} order`,
                              method: order.payment_method,
                              amount: order.total_amount,
                              status: order.order_status,
                              data: order
                            })),
                            ...rawExpenses.map(expense => ({
                              type: 'expense',
                              id: expense.id,
                              date: expense.expense_date,
                              time: expense.expense_time || '00:00:00',
                              description: expense.description || expense.category?.name || 'Expense',
                              method: expense.payment_method,
                              amount: expense.total_amount || expense.amount,
                              status: 'completed',
                              data: expense
                            }))
                          ]
                            .sort((a, b) => {
                              const dateA = new Date(`${a.date}T${a.time}`)
                              const dateB = new Date(`${b.date}T${b.time}`)
                              return dateB - dateA
                            })
                            .slice(0, 20)
                            .map((transaction, index) => (
                              <motion.tr
                                key={`${transaction.type}-${transaction.id}`}
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: index * 0.02 }}
                                className={`${themeClasses.border} border-b ${themeClasses.hover} transition-all`}
                              >
                                <td className="py-3 px-4">
                                  <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${transaction.type === 'order'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-red-100 text-red-800'
                                    }`}>
                                    {transaction.type === 'order' ? (
                                      <>
                                        <DollarSign className="w-3 h-3 mr-1" />
                                        Sale
                                      </>
                                    ) : (
                                      <>
                                        <Receipt className="w-3 h-3 mr-1" />
                                        Expense
                                      </>
                                    )}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <span className="font-mono text-sm font-semibold text-purple-600">
                                    {transaction.type === 'order' ? `#${transaction.id}` : `EXP-${transaction.id.slice(-6)}`}
                                  </span>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-sm">
                                    <div className={`font-medium ${themeClasses.textPrimary}`}>
                                      {new Date(transaction.date).toLocaleDateString()}
                                    </div>
                                    <div className={themeClasses.textSecondary}>{transaction.time}</div>
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="text-sm">
                                    <div className={`font-medium ${themeClasses.textPrimary} truncate max-w-40`}>
                                      {transaction.description}
                                    </div>
                                    {transaction.type === 'order' && transaction.data.customers && (
                                      <div className={`${themeClasses.textSecondary} text-xs`}>
                                        {transaction.data.customers.first_name} {transaction.data.customers.last_name}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex items-center">
                                    {React.createElement(getPaymentMethodIcon(transaction.method), {
                                      className: `w-4 h-4 mr-2 ${themeClasses.textSecondary}`
                                    })}
                                    <span className={`text-sm font-medium ${themeClasses.textPrimary}`}>{transaction.method}</span>
                                  </div>
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <span className={`font-bold ${transaction.type === 'order' ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                    {transaction.type === 'order' ? '+' : '-'}{formatCurrency(transaction.amount)}
                                  </span>
                                </td>
                                <td className="py-3 px-4 text-center">
                                  <motion.button
                                    whileHover={{ scale: 1.1 }}
                                    whileTap={{ scale: 0.9 }}
                                    onClick={() => {
                                      if (transaction.type === 'order') {
                                        router.push(`/orders?order=${transaction.data.id}`)
                                      } else {
                                        // Navigate to expenses page with this expense selected
                                        router.push(`/expenses?expense=${transaction.data.id}`)
                                      }
                                    }}
                                    className={`p-2 text-blue-500 hover:text-blue-700 ${isDark ? 'hover:bg-gray-700' : 'hover:bg-blue-50'} rounded-lg transition-all`}
                                  >
                                    <Eye className="w-4 h-4" />
                                  </motion.button>
                                </td>
                              </motion.tr>
                            ))}
                        </tbody>
                      </table>

                      {rawOrders.length === 0 && rawExpenses.length === 0 && (
                        <div className="text-center py-12">
                          <FileText className={`w-16 h-16 ${themeClasses.textSecondary} mx-auto mb-4`} />
                          <h3 className={`text-lg font-semibold ${themeClasses.textSecondary} mb-2`}>No transactions found</h3>
                          <p className={themeClasses.textSecondary}>Try adjusting your filters to see more data</p>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Notification System */}
      <NotificationSystem />
      </div>
    </ProtectedPage>
  )
}