'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Receipt,
  FileText,
  BarChart3,
  Printer,
  Settings,
  Sun,
  Moon,
  User,
  Store,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle,
  LogOut,
  Bell,
  MessageSquare,
  Shield,
  UserCircle,
  ChefHat,
  Globe,
  Database,
  X,
  Trash2,
  CloudUpload,
  Wallet,
  DollarSign,
  Clock,
  ArrowRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { networkPrintListener } from '../../lib/networkPrintListener'
import ProtectedPage from '../../components/ProtectedPage'
import { usePermissions, permissionManager } from '../../lib/permissionManager'

export default function Dashboard() {
  const [user, setUser] = useState(() => authManager.isLoggedIn() ? authManager.getCurrentUser() : null)
  const [userRole, setUserRole] = useState(() => authManager.getRole())
  const [displayName, setDisplayName] = useState(() => authManager.getDisplayName() || '')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [cacheStatus, setCacheStatus] = useState({
    isInitialized: false,
    isLoading: false,
    error: null,
    networkStatus: { isOnline: true, unsyncedOrders: 0, lastSync: null, isSyncing: false }
  })
  const [theme, setTheme] = useState('light')
  const [layoutTheme, setLayoutTheme] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('pos_layout_theme') || 'classic') : 'classic'
  )
  const [pendingWebOrders, setPendingWebOrders] = useState(0)
  const [activeOrders, setActiveOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const router = useRouter()
  const permissions = usePermissions()

  useEffect(() => {
    // Check authentication first
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    const role = authManager.getRole()
    const name = authManager.getDisplayName()
    
    setUser(userData)
    setUserRole(role)
    setDisplayName(name)

    console.log('👤 Dashboard loaded for:', name, '(', role, ')')

    // Set user ID in cache manager for filtering
    if (userData?.id) {
      cacheManager.setUserId(userData.id)
      webOrderNotificationManager.setUserId(userData.id)

      console.log('👤 [Dashboard] Setting up web order notifications for user:', userData.id)

      // Start listening for new web orders
      webOrderNotificationManager.startListening(async (newOrder) => {
        console.log('🔔 [Dashboard] Notification callback triggered for order:', newOrder?.order_number)
        // Update pending count when new order arrives
        const count = await webOrderNotificationManager.getPendingCount()
        console.log('📊 [Dashboard] Updated pending count:', count)
        setPendingWebOrders(count)
      })

      // Initial fetch of pending count
      webOrderNotificationManager.getPendingCount().then(count => {
        console.log('📊 [Dashboard] Initial pending count:', count)
        setPendingWebOrders(count)
      })

      // Set up network print listener for print servers
      console.log('🖨️ [Dashboard] Setting up network print listener for user:', userData.id)
      networkPrintListener.setUserId(userData.id)

      // Load printer preferences from database (persists across sessions)
      // Fall back to localStorage if database doesn't have the values yet
      const isServerMode = userData.is_print_server ?? (localStorage.getItem('is_print_server') === 'true')
      const shareMode = userData.share_printer_mode ?? (localStorage.getItem('share_printer_mode') === 'true')

      // Sync to localStorage for quick access
      localStorage.setItem('is_print_server', isServerMode.toString())
      localStorage.setItem('share_printer_mode', shareMode.toString())

      console.log('🖨️ [Dashboard] Printer preferences loaded:', { isServerMode, shareMode })

      networkPrintListener.setIsServer(isServerMode)

      // Start listening if server mode is on
      if (isServerMode) {
        console.log('✅ [Dashboard] Starting network print listener (server mode ON)')
        networkPrintListener.startListening()
      } else {
        console.log('⏹️ [Dashboard] Server mode OFF, listener not started')
      }
    }

    // Load and apply theme
    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    // Initialize cache only on first load
    initializeCache()

    // Update time every second and refresh pending count every 30 seconds
    const timer = setInterval(() => {
      setCurrentTime(new Date())
      // Update network status
      setCacheStatus(prev => ({
        ...prev,
        networkStatus: cacheManager.getNetworkStatus()
      }))
    }, 1000)

    const countRefreshTimer = setInterval(async () => {
      if (userData?.id) {
        const count = await webOrderNotificationManager.getPendingCount()
        setPendingWebOrders(count)
      }
    }, 30000) // Refresh every 30 seconds

    // Start background sync
    cacheManager.startBackgroundSync()

    // Fetch active orders and poll every 30s
    fetchActiveOrders()
    const ordersRefreshTimer = setInterval(fetchActiveOrders, 30000)

    return () => {
      clearInterval(timer)
      clearInterval(countRefreshTimer)
      clearInterval(ordersRefreshTimer)
      webOrderNotificationManager.stopListening()
      // Don't stop networkPrintListener here - it should persist across pages
      // It will be stopped on logout (authManager) or when "I am Server" is toggled OFF (printer page)
    }
  }, [router])

  const initializeCache = async () => {
    try {
      setCacheStatus(prev => ({ ...prev, isLoading: true, error: null }))
      
      // Only force refresh if explicitly requested, otherwise use cache
      const success = await cacheManager.initializeCache(false)
      
      setCacheStatus(prev => ({
        ...prev,
        isInitialized: success,
        isLoading: false,
        error: success ? null : 'Failed to load some data - working offline',
        networkStatus: cacheManager.getNetworkStatus()
      }))

    } catch (error) {
      console.error('Cache initialization error:', error)
      setCacheStatus(prev => ({
        ...prev,
        isLoading: false,
        error: 'Cache initialization failed',
        networkStatus: cacheManager.getNetworkStatus()
      }))
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  const handleRefreshCache = async () => {
    setCacheStatus(prev => ({ ...prev, isLoading: true }))
    try {
      // Refresh cache data (products, categories, etc.)
      console.log('🔄 Refreshing cache and permissions...')
      await cacheManager.refreshData()

      // Also refresh permissions silently
      const permResult = await permissionManager.forceReloadFromServer()

      if (permResult.success) {
        console.log(`✅ Cache and permissions refreshed! ${permResult.count} permissions loaded`)
      }

      setCacheStatus(prev => ({
        ...prev,
        isLoading: false,
        networkStatus: cacheManager.getNetworkStatus()
      }))
    } catch (error) {
      console.error('Refresh error:', error)
      setCacheStatus(prev => ({
        ...prev,
        isLoading: false,
        networkStatus: cacheManager.getNetworkStatus()
      }))
    }
  }

  const handleLogout = async () => {
    await authManager.logout()
    router.push('/')
  }

  const fetchActiveOrders = async () => {
    try {
      const userData = authManager.getCurrentUser()
      if (!userData?.id) return
      const today = new Date().toISOString().split('T')[0]
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_number, order_type, order_status, payment_status, total_amount, created_at, customers(full_name)')
        .eq('user_id', userData.id)
        .or('order_source.eq.POS,is_approved.eq.true')
        .gte('order_date', today)
        .lte('order_date', today)
        .neq('payment_status', 'Paid')
        .order('created_at', { ascending: false })
        .limit(8)
      if (!error && data) setActiveOrders(data)
    } catch (e) {
      // silently ignore
    } finally {
      setOrdersLoading(false)
    }
  }

  const getTimeElapsed = (createdAt) => {
    const diffMs = new Date() - new Date(createdAt)
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const h = Math.floor(diffMins / 60)
    return `${h}h ${diffMins % 60}m`
  }

  const formatTime = (date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true
    })
  }

  const formatDate = (date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const orderTypeCards = [
    {
      id: 'walkin',
      title: 'Walk In',
      description: 'Quick service for dine-in customers',
      icon: Users,
      gradient: 'from-emerald-500 to-teal-600',
      route: '/walkin',
      permissionKey: 'SALES_WALKIN'
    },
    {
      id: 'takeaway',
      title: 'Take Away',
      description: 'Orders for pickup',
      icon: ShoppingBag,
      gradient: 'from-blue-500 to-cyan-600',
      route: '/takeaway',
      permissionKey: 'SALES_TAKEAWAY'
    },
    {
      id: 'delivery',
      title: 'Delivery',
      description: 'Home delivery orders',
      icon: Truck,
      gradient: 'from-orange-500 to-red-600',
      route: '/delivery',
      permissionKey: 'SALES_DELIVERY'
    },
    // {
    //   id: 'test',
    //   title: 'Test',
    //   description: 'Test delivery orders',
    //   icon: Truck,
    //   gradient: 'from-orange-500 to-red-600',
    //   route: '/test'
    // }
  ]

  const bottomMenuItems = [

    {
      id: 'expenses',
      title: 'Expenses',
      icon: Receipt,
      gradient: 'from-purple-500 to-indigo-600',
      route: '/expenses',
      permissionKey: 'EXPENSES'
    },
    {
      id: 'orders',
      title: 'Orders',
      icon: FileText,
      gradient: 'from-pink-500 to-rose-600',
      route: '/orders',
      permissionKey: 'ORDERS'
    },
    {
      id: 'web-orders',
      title: 'Web Orders',
      icon: Globe,
      gradient: 'from-purple-500 to-pink-600',
      route: '/web-orders',
      permissionKey: 'WEB_ORDERS'
    },
    {
      id: 'kds',
      title: 'Kitchen Display',
      icon: ChefHat,
      gradient: 'from-orange-500 to-red-600',
      route: '/kds',
      permissionKey: 'KDS'
    },
    {
      id: 'riders',
      title: 'Riders Orders',
      icon: Truck,
      gradient: 'from-blue-500 to-cyan-600',
      route: '/riders',
      permissionKey: 'RIDERS'
    },
    {
      id: 'reports',
      title: 'Reports',
      icon: BarChart3,
      gradient: 'from-green-500 to-emerald-600',
      route: '/reports',
      permissionKey: 'REPORTS'
    },
    {
      id: 'marketing',
      title: 'Marketing',
      icon: MessageSquare,
      gradient: 'from-cyan-500 to-blue-600',
      route: '/marketing',
      permissionKey: 'MARKETING'
    },
    {
      id: 'petty-cash',
      title: 'Petty Cash',
      icon: Wallet,
      gradient: 'from-indigo-500 to-purple-600',
      route: '/petty-cash',
      permissionKey: 'PETTY_CASH_USE'
    }
  ]

  const handleNavigation = (route, permissionKey) => {
    // Debug logging
    console.log('🔍 Navigation attempt:', { route, permissionKey })

    // Check permission before navigation
    const hasPermission = permissions.hasPermission(permissionKey)
    console.log('🔍 Has permission?', hasPermission)

    if (permissionKey && !hasPermission) {
      console.log('❌ Navigation blocked - no permission for:', permissionKey)
      return // Do nothing if no permission
    }

    console.log('✅ Navigation allowed, pushing route:', route)
    router.push(route)
  }

  // Helper to check if user has permission for a card
  const hasCardPermission = (permissionKey) => {
    if (!permissionKey) return true // No permission required
    return permissions.hasPermission(permissionKey)
  }

  // Get theme classes from theme manager
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  // Get role badge color
  const getRoleBadge = () => {
    if (userRole === 'admin') {
      return {
        bg: isDark ? 'bg-purple-900/30' : 'bg-purple-100',
        text: isDark ? 'text-purple-300' : 'text-purple-700',
        icon: Shield
      }
    } else {
      return {
        bg: isDark ? 'bg-blue-900/30' : 'bg-blue-100',
        text: isDark ? 'text-blue-300' : 'text-blue-700',
        icon: UserCircle
      }
    }
  }

  const roleBadge = getRoleBadge()

  if (!user) {
    const classes = themeManager.getClasses()
    return <div className={`h-screen w-screen ${classes.background}`} />
  }

  return (
    <ProtectedPage permissionKey="DASHBOARD" pageName="Dashboard">
      <div className={`h-screen w-screen overflow-hidden ${themeClasses.background} transition-all duration-500`}>
      {/* Enhanced Header */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className={`w-full ${themeClasses.header} backdrop-blur-lg 
               ${themeClasses.border} border-b shadow-lg`}
      >
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="grid grid-cols-3 items-center">
            {/* Left: User Info with Role Badge */}
            <div className="flex items-center space-x-4">
              <div className="relative">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Store className="w-6 h-6 text-white" />
                </div>
                {/* Role Indicator Badge */}
                <div className={`absolute -bottom-1 -right-1 w-5 h-5 ${roleBadge.bg} rounded-full flex items-center justify-center border-2 ${themeClasses.border}`}>
                  <roleBadge.icon className={`w-3 h-3 ${roleBadge.text}`} />
                </div>
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <h1 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                    Welcome, {displayName}
                  </h1>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${roleBadge.bg} ${roleBadge.text}`}>
                    {userRole?.toUpperCase()}
                  </span>
                </div>
                <p className={`${themeClasses.textSecondary} font-medium`}>
                  {user.store_name}
                </p>
              </div>
            </div>

            {/* Center: Time and Date */}
            <div className="text-center">
              <motion.div 
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className={`text-4xl font-bold ${themeClasses.textPrimary} mb-1`}
              >
                {formatTime(currentTime)}
              </motion.div>
              <div className={`text-sm ${themeClasses.textSecondary}`}>
                {formatDate(currentTime)}
              </div>
            </div>

            {/* Right: Controls */}
            <div className="flex items-center justify-end space-x-3">
              {/* Network Status */}
              <div className="flex items-center space-x-2">
                {cacheStatus.networkStatus.isOnline ? (
                  <Wifi className="w-5 h-5 text-green-500" />
                ) : (
                  <WifiOff className="w-5 h-5 text-red-500" />
                )}
                
                {cacheStatus.networkStatus.unsyncedOrders > 0 && (
                  <div className={`flex items-center space-x-1 ${isDark ? 'bg-orange-900' : 'bg-orange-100'} px-2 py-1 rounded-full`}>
                    <AlertCircle className="w-4 h-4 text-orange-600" />
                    <span className={`text-xs font-medium ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>
                      {cacheStatus.networkStatus.unsyncedOrders}
                    </span>
                  </div>
                )}
                
                {cacheStatus.networkStatus.isSyncing && (
                  <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />
                )}
              </div>

              {/* Refresh Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleRefreshCache}
                disabled={cacheStatus.isLoading}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all disabled:opacity-50`}
                title="Refresh Cache & Permissions - Sync data and check for updated access rights"
              >
                <RefreshCw className={`w-5 h-5 ${themeClasses.textSecondary} ${cacheStatus.isLoading ? 'animate-spin' : ''}`} />
              </motion.button>

              {/* Theme Toggle */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all`}
              >
                <AnimatePresence mode="wait">
                  {theme === 'dark' ? (
                    <motion.div
                      key="sun"
                      initial={{ rotate: -90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: 90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Sun className="w-5 h-5 text-yellow-500" />
                    </motion.div>
                  ) : (
                    <motion.div
                      key="moon"
                      initial={{ rotate: 90, opacity: 0 }}
                      animate={{ rotate: 0, opacity: 1 }}
                      exit={{ rotate: -90, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <Moon className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>

              {/* Sync Status / Notifications */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={async () => {
                  if (cacheStatus.networkStatus.unsyncedOrders > 0) {
                    console.log('🔄 Manual sync triggered from dashboard')
                    const result = await cacheManager.syncOfflineData()
                    console.log('📊 Sync result:', result)
                    setCacheStatus(prev => ({
                      ...prev,
                      networkStatus: cacheManager.getNetworkStatus()
                    }))
                  }
                }}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all relative ${cacheStatus.networkStatus.unsyncedOrders > 0 ? 'cursor-pointer' : ''}`}
                title={cacheStatus.networkStatus.unsyncedOrders > 0
                  ? `Click to sync ${cacheStatus.networkStatus.unsyncedOrders} pending order(s)`
                  : 'No pending orders'}
              >
                <Bell className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                {cacheStatus.networkStatus.unsyncedOrders > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-xs font-bold rounded-full">
                    {cacheStatus.networkStatus.unsyncedOrders}
                  </span>
                )}
              </motion.button>

              {/* Offline Orders Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleNavigation('/offline-orders', 'OFFLINE_ORDERS')}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all relative ${!permissions.hasPermission('OFFLINE_ORDERS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                title={cacheStatus.networkStatus.unsyncedOrders > 0
                  ? `View ${cacheStatus.networkStatus.unsyncedOrders} offline order(s)`
                  : 'No offline orders'}
              >
                <Database className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                {cacheStatus.networkStatus.unsyncedOrders > 0 && (
                  <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                    {cacheStatus.networkStatus.unsyncedOrders}
                  </span>
                )}
              </motion.button>

              {/* Printer Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleNavigation('/printer', 'PRINTERS')}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all ${!permissions.hasPermission('PRINTERS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Printer"
              >
                <Printer className={`w-5 h-5 ${themeClasses.textSecondary}`} />
              </motion.button>

              {/* Settings Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleNavigation('/settings', 'SETTINGS')}
                className={`p-3 rounded-xl ${themeClasses.button} transition-all ${!permissions.hasPermission('SETTINGS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                title="Settings"
              >
                <Settings className={`w-5 h-5 ${themeClasses.textSecondary}`} />
              </motion.button>

              {/* Logout Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleLogout}
                className="p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white hover:shadow-lg transition-all"
              >
                <LogOut className="w-5 h-5" />
              </motion.button>
            </div>
          </div>
        </div>

        {/* Cache Status Bar */}
        <AnimatePresence>
          {(cacheStatus.isLoading || cacheStatus.error) && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`${themeClasses.border} border-t px-6 py-3`}
            >
              <div className="max-w-7xl mx-auto flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {cacheStatus.isLoading ? (
                    <>
                      <RefreshCw className="w-5 h-5 text-blue-500 animate-spin" />
                      <span className={`${isDark ? 'text-blue-300' : 'text-blue-700'} font-medium`}>Loading menu data...</span>
                    </>
                  ) : cacheStatus.error ? (
                    <>
                      <AlertCircle className="w-5 h-5 text-orange-500" />
                      <span className={`${isDark ? 'text-orange-300' : 'text-orange-700'} font-medium`}>{cacheStatus.error}</span>
                    </>
                  ) : null}
                </div>
                
                {cacheStatus.networkStatus.lastSync && (
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                    Last sync: {new Date(cacheStatus.networkStatus.lastSync).toLocaleTimeString()}
                  </span>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.header>

      {/* Main Content */}
      <main className="flex-1 w-full h-[calc(100vh-80px)] overflow-y-auto px-4 py-6">
        {/* Order Type Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          {layoutTheme === 'modern' ? (
            /* Modern layout: New Order card + Active Orders feed */
            <div className="flex gap-6 items-stretch">
              {/* New Order Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                whileHover={{ y: -10, scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/new-order')}
                className="cursor-pointer group relative w-full max-w-sm flex-shrink-0"
              >
                <div className="relative overflow-hidden rounded-3xl shadow-xl hover:shadow-2xl transition-all duration-300 h-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-purple-500 to-indigo-600 opacity-90"></div>
                  <div className="relative p-10 text-center text-white h-full flex flex-col items-center justify-center">
                    <motion.div
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                      className="w-24 h-24 mx-auto mb-6 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm"
                    >
                      <ShoppingCart className="w-12 h-12" />
                    </motion.div>
                    <h3 className="text-3xl font-bold mb-3">New Order</h3>
                    <p className="text-white/80 font-medium">Start a new walk-in, takeaway or delivery order</p>
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                </div>
              </motion.div>

              {/* Active Orders Feed */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex-1 min-w-0"
              >
                <div className={`rounded-3xl shadow-xl border overflow-hidden flex flex-col ${isDark ? 'bg-gray-800/80 border-gray-700/60' : 'bg-white/80 border-white/60'} backdrop-blur-md`}>
                  {/* Header */}
                  <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-gray-700/60' : 'border-gray-200/60'}`}>
                    <div className="flex items-center gap-2.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse block" />
                      <span className={`font-bold text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>Active Orders</span>
                      {activeOrders.length > 0 && (
                        <span className="bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                          {activeOrders.length}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={fetchActiveOrders}
                      className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-800'}`}
                      title="Refresh"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Orders list */}
                  <div className="overflow-y-auto" style={{ scrollbarWidth: 'none', maxHeight: '180px' }}>
                    {ordersLoading ? (
                      <div className="p-4 space-y-3">
                        {[...Array(4)].map((_, i) => (
                          <div key={i} className={`h-14 rounded-xl animate-pulse ${isDark ? 'bg-gray-700/60' : 'bg-gray-100'}`} />
                        ))}
                      </div>
                    ) : activeOrders.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full py-10 px-6 text-center">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                          <CheckCircle className={`w-7 h-7 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                        </div>
                        <p className={`font-semibold text-sm ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>All caught up!</p>
                        <p className={`text-xs mt-1 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>No pending orders right now</p>
                      </div>
                    ) : (
                      <div className="p-3 space-y-2">
                        {activeOrders.map((order) => {
                          const typeColor = order.order_type === 'walkin'
                            ? 'bg-emerald-500'
                            : order.order_type === 'takeaway'
                            ? 'bg-blue-500'
                            : 'bg-orange-500'
                          const borderColor = order.order_type === 'walkin'
                            ? 'border-l-emerald-500'
                            : order.order_type === 'takeaway'
                            ? 'border-l-blue-500'
                            : 'border-l-orange-500'
                          const typeLabel = order.order_type === 'walkin'
                            ? 'Walk-in'
                            : order.order_type === 'takeaway'
                            ? 'Takeaway'
                            : 'Delivery'
                          const TypeIcon = order.order_type === 'walkin'
                            ? Users
                            : order.order_type === 'takeaway'
                            ? ShoppingBag
                            : Truck
                          const customerName = order.customers?.full_name

                          return (
                            <motion.div
                              key={order.id}
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              className={`flex items-center gap-3 p-3 rounded-xl border-l-4 ${isDark ? 'bg-gray-700/50 hover:bg-gray-700' : 'bg-gray-50 hover:bg-gray-100'} transition-colors cursor-pointer ${borderColor}`}
                              onClick={() => router.push('/orders')}
                            >
                              {/* Type icon */}
                              <div className={`w-8 h-8 rounded-lg ${typeColor} flex items-center justify-center flex-shrink-0`}>
                                <TypeIcon className="w-4 h-4 text-white" />
                              </div>
                              {/* Info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                    #{order.order_number}
                                  </span>
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isDark ? 'bg-gray-600 text-gray-300' : 'bg-gray-200 text-gray-600'}`}>
                                    {typeLabel}
                                  </span>
                                </div>
                                <div className={`text-xs mt-0.5 truncate ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {customerName || 'Walk-in customer'} &nbsp;·&nbsp;
                                  <Clock className="w-3 h-3 inline -mt-0.5" /> {getTimeElapsed(order.created_at)}
                                </div>
                              </div>
                              {/* Amount */}
                              <div className="text-right flex-shrink-0">
                                <div className={`font-bold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
                                  Rs {parseFloat(order.total_amount || 0).toFixed(0)}
                                </div>
                                <div className={`text-xs ${order.order_status === 'pending' ? 'text-yellow-500' : order.order_status === 'preparing' ? 'text-orange-500' : 'text-green-500'}`}>
                                  {order.order_status || 'pending'}
                                </div>
                              </div>
                            </motion.div>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className={`px-5 py-3 border-t ${isDark ? 'border-gray-700/60' : 'border-gray-200/60'}`}>
                    <button
                      onClick={() => router.push('/orders')}
                      className={`flex items-center gap-1.5 text-sm font-semibold transition-colors ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-800'}`}
                    >
                      View all orders <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            </div>
          ) : (
            /* Classic layout: three individual cards */
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {orderTypeCards.map((card, index) => {
                const hasPermission = hasCardPermission(card.permissionKey)
                return (
                <motion.div
                  key={card.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 + index * 0.1 }}
                  whileHover={hasPermission ? { y: -10, scale: 1.02 } : {}}
                  whileTap={hasPermission ? { scale: 0.98 } : {}}
                  onClick={() => handleNavigation(card.route, card.permissionKey)}
                  className={`${hasPermission ? 'cursor-pointer' : 'cursor-not-allowed'} group relative`}
                >
                  <div className={`relative overflow-hidden rounded-3xl shadow-xl ${hasPermission ? 'hover:shadow-2xl' : 'opacity-60'} transition-all duration-300`}>
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} ${!hasPermission ? 'opacity-50' : 'opacity-90'}`}></div>
                    {!hasPermission && (
                      <div className="absolute top-3 right-3 z-20">
                        <div className="bg-red-500/90 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full flex items-center gap-1.5 shadow-lg">
                          <Shield className="w-3.5 h-3.5" />
                          LOCKED
                        </div>
                      </div>
                    )}
                    <div className="relative p-8 text-center text-white">
                      <motion.div
                        whileHover={{ rotate: 360, scale: 1.1 }}
                        transition={{ duration: 0.5 }}
                        className="w-20 h-20 mx-auto mb-6 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm"
                      >
                        <card.icon className="w-10 h-10" />
                      </motion.div>
                      <h3 className="text-2xl font-bold mb-3">{card.title}</h3>
                      <p className="text-white/80 font-medium">{card.description}</p>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
                  </div>
                </motion.div>
              )})}
            </div>
          )}
        </motion.div>

        {/* Bottom Menu */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className={layoutTheme === 'modern' ? 'mt-8' : ''}
        >
          <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-6 text-center`}>
            Quick Actions
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {bottomMenuItems.map((item, index) => {
              const hasPermission = hasCardPermission(item.permissionKey)
              return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.7 + index * 0.05 }}
                whileHover={hasPermission ? { y: -5, scale: 1.05 } : {}}
                whileTap={hasPermission ? { scale: 0.95 } : {}}
                onClick={() => handleNavigation(item.route, item.permissionKey)}
                className={`${hasPermission ? 'cursor-pointer' : 'cursor-not-allowed'} group`}
              >
                <div className={`${themeClasses.card} rounded-2xl p-4 ${themeClasses.shadow} ${hasPermission ? 'hover:shadow-xl' : 'opacity-60'} transition-all duration-300 ${themeClasses.border} border relative`}>
                  {!hasPermission && (
                    <div className="absolute -top-2 -right-2 z-20">
                      <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                        <Shield className="w-2.5 h-2.5" />
                        LOCKED
                      </div>
                    </div>
                  )}
                  <motion.div
                    whileHover={hasPermission ? { rotate: 10, scale: 1.1 } : {}}
                    className={`w-10 h-10 mx-auto mb-3 bg-gradient-to-r ${item.gradient} rounded-xl flex items-center justify-center shadow-lg relative`}
                  >
                    <item.icon className="w-5 h-5 text-white" />
                    {/* Show badge for web orders with pending count */}
                    {item.id === 'web-orders' && pendingWebOrders > 0 && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: [1, 1.1, 1] }}
                        transition={{
                          repeat: Infinity,
                          duration: 2,
                          ease: "easeInOut"
                        }}
                        className="absolute -top-2 -right-2 bg-red-500 text-white text-sm font-bold rounded-full min-w-[28px] h-7 px-2 flex items-center justify-center shadow-lg border-2 border-white z-10"
                      >
                        {pendingWebOrders}
                      </motion.div>
                    )}
                  </motion.div>
                  <h4 className={`text-center font-medium text-sm ${themeClasses.textPrimary}`}>
                    {item.title}
                  </h4>
                </div>
              </motion.div>
            )})}
          </div>
        </motion.div>
      </main>
      </div>
    </ProtectedPage>
  )
}
