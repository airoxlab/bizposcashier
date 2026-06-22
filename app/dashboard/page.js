'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users,
  ShoppingBag,
  ShoppingCart,
  Truck,
  Receipt,
  FileText,
  BarChart3,
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
  Crown,
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
  ArrowRight,
  Zap,
  Package,
  Building2,
  BookOpen
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import whatsappQueue from '../../lib/whatsappQueue'
import { webOrderNotificationManager } from '../../lib/webOrderNotification'
import { networkPrintListener } from '../../lib/networkPrintListener'
import ProtectedPage from '../../components/ProtectedPage'
import PrinterStatusBadge from '../../components/PrinterStatusBadge'
import FingerprintStatusBadge from '../../components/FingerprintStatusBadge'
import DashboardUpdateButton from '../../components/DashboardUpdateButton'
import CashierAnalytics from '../../components/pos/CashierAnalytics'
import { usePermissions, permissionManager } from '../../lib/permissionManager'
import { planManager } from '../../lib/planManager'

// ── Plan route definitions ──────────────────────────────────────────────────
// Single source of truth for dashboard card gating. To add a new page, put
// its route in the appropriate plan object — no other change needed.
const CASHIER_PLANS = {
  starter: {
    name: 'Starter',
    routes: new Set([
      '/walkin', '/takeaway', '/delivery', '/new-order',
      '/orders', '/payment', '/expenses', '/reports',
      '/riders', '/printer', '/settings',
    ]),
  },
  growth: {
    name: 'Growth',
    routes: new Set([
      '/kds', '/marketing', '/offline-orders',
    ]),
  },
  business: {
    name: 'Business',
    routes: new Set([
      '/purchase-orders', '/suppliers',
      '/ledgers', '/my-till', '/web-orders', '/payroll',
    ]),
  },
}
const PLAN_TIER = { starter: 0, growth: 1, business: 2 }

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Format millisecond duration as compact human-readable string (minutes only).
function fmtDuration(ms) {
  const abs       = Math.abs(ms)
  const totalMins = Math.floor(abs / 60000)
  const days  = Math.floor(totalMins / 1440)
  const hours = Math.floor((totalMins % 1440) / 60)
  const mins  = totalMins % 60
  if (days >= 1)  return `${days}d`
  if (hours >= 1) return `${hours}h ${mins}m`
  if (mins >= 1)  return `${mins}m`
  return '<1m'
}

// Returns the required plan display name if current plan cannot access route, else null.
function getRoutePlanLock(route, currentSlug) {
  for (const [slug, plan] of Object.entries(CASHIER_PLANS)) {
    if (plan.routes.has(route)) {
      const currentTier = PLAN_TIER[currentSlug ?? 'starter'] ?? 0
      if (currentTier >= PLAN_TIER[slug]) return null
      return plan.name
    }
  }
  return null
}
// ────────────────────────────────────────────────────────────────────────────

function Tooltip({ label, children, className = '' }) {
  return (
    <div className={`relative group/tip inline-flex ${className}`}>
      {children}
      <span className="pointer-events-none absolute top-full left-1/2 -translate-x-1/2 mt-2 whitespace-nowrap text-xs font-semibold px-2 py-1 rounded-md bg-gray-900 dark:bg-white text-white dark:text-gray-900 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-75 z-[60] shadow-md">
        {label}
      </span>
    </div>
  )
}

export default function Dashboard() {
  const [user, setUser] = useState(null)
  const [userRole, setUserRole] = useState(null)
  const [displayName, setDisplayName] = useState('')
  const [currentTime, setCurrentTime] = useState(new Date())
  const [cacheStatus, setCacheStatus] = useState({
    isInitialized: false,
    isLoading: false,
    error: null,
    networkStatus: { isOnline: true, unsyncedOrders: 0, lastSync: null, isSyncing: false }
  })
  const [theme, setTheme] = useState('light')
  const [layoutTheme, setLayoutTheme] = useState('classic')
  const [pendingWebOrders, setPendingWebOrders] = useState(0)
  const [activeOrders, setActiveOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(true)
  const [waStatus, setWaStatus] = useState('disconnected')
  const [planVersion, setPlanVersion] = useState(planManager.isLoaded ? 1 : 0)
  const planReady = planVersion > 0
  const router = useRouter()
  const permissions = usePermissions()

  useEffect(() => {
    const onLoaded = () => setPlanVersion(v => v + 1)
    // Fire immediately if plan is already in cache — covers the mount case
    if (planManager.isLoaded) onLoaded()
    window.addEventListener('planmanager:loaded', onLoaded)
    return () => window.removeEventListener('planmanager:loaded', onLoaded)
  }, [])

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
    setLayoutTheme(localStorage.getItem('pos_layout_theme') || 'classic')

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

      // Only the print server machine publishes its IP — office/client laptops must not overwrite it.
      if (isServerMode && typeof window !== 'undefined' && window.electronAPI?.getLocalIP) {
        window.electronAPI.getLocalIP().then(async (detectedIp) => {
          if (!detectedIp || detectedIp === '127.0.0.1') return
          try {
            const { data: current } = await supabase
              .from('users')
              .select('print_server_ip')
              .eq('id', userData.id)
              .single()
            if (current?.print_server_ip !== detectedIp) {
              await supabase
                .from('users')
                .update({ print_server_ip: detectedIp })
                .eq('id', userData.id)
              console.log(`🖨️ [Dashboard] Print server IP updated to ${detectedIp}`)
            }
          } catch (e) {
            console.warn('⚠️ [Dashboard] Failed to auto-publish print server IP:', e.message)
          }
        })
      }
    }

    // Start background sync and preload menu/catalog data so order pages open instantly
    cacheManager.startBackgroundSync()
    initializeCache()

    // Clock — updates currentTime every second
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)

    // Fetch active orders and poll every 30s
    fetchActiveOrders()
    const ordersRefreshTimer = setInterval(fetchActiveOrders, 30000)

    // Poll network status every 3s so the online/offline indicator stays accurate
    const networkTimer = setInterval(() => {
      setCacheStatus(prev => ({ ...prev, networkStatus: cacheManager.getNetworkStatus() }))
    }, 3000)

    // Also update immediately on browser online/offline events
    const onOnline = () => setCacheStatus(prev => ({ ...prev, networkStatus: cacheManager.getNetworkStatus() }))
    const onOffline = () => setCacheStatus(prev => ({ ...prev, networkStatus: cacheManager.getNetworkStatus() }))
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)

    return () => {
      clearInterval(timer)
      clearInterval(ordersRefreshTimer)
      clearInterval(networkTimer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      webOrderNotificationManager.stopListening()
      // Don't stop networkPrintListener here - it should persist across pages
      // It will be stopped on logout (authManager) or when "I am Server" is toggled OFF (printer page)
    }
  }, [router])

  // WhatsApp status — centralized server-side socket, shared across all PCs/roles.
  // Map server 'qr' → 'qr_ready' so the indicator shows the connecting (yellow) state.
  useEffect(() => {
    const restaurantId = authManager.getCurrentUser()?.id
    if (!restaurantId) return
    const unsub = whatsappQueue.subscribeConnection(restaurantId, (conn) => {
      const s = conn?.status === 'qr' ? 'qr_ready' : (conn?.status || 'disconnected')
      setWaStatus(s)
    })
    return () => unsub()
  }, [])

  // Quick actions: fixed 8-column row, last slot is "Others" folder when overflow
  const QUICK_ACTIONS_PER_ROW = 8

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
      console.log('🔄 Refreshing cache, permissions, and plan...')
      await cacheManager.refreshData()

      // Also refresh permissions silently
      const permResult = await permissionManager.forceReloadFromServer()

      if (permResult.success) {
        console.log(`✅ Permissions refreshed! ${permResult.count} permissions loaded`)
      }

      // Refresh user profile from DB (picks up setting changes: KDS alerts, receipt options, etc.)
      await authManager.syncUserDataFromDatabase()

      // Refresh plan (picks up plan changes + feature overrides from super-admin)
      const userData = authManager.getCurrentUser()
      if (userData?.id) {
        await planManager.refresh(userData.id)
        console.log('✅ Plan refreshed:', planManager.getPlanName())
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

  const handleLogout = () => setShowLogoutConfirm(true)

  const confirmLogout = async () => {
    setShowLogoutConfirm(false)
    await authManager.logout()
    router.push('/')
  }

  const fetchActiveOrders = async () => {
    try {
      const userData = authManager.getCurrentUser()
      if (!userData?.id) return
      const today = localDateStr()

      if (!cacheManager.checkOnlineStatus()) {
        const cached = cacheManager.cache.orders || []
        const todayUnpaid = cached
          .filter(o =>
            o.order_date === today &&
            o.payment_status !== 'Paid' &&
            (o.order_source === 'POS' || o.is_approved === true)
          )
          .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
          .slice(0, 8)
          .map(o => {
            const customerMap = cacheManager.cache.customers
            const c = customerMap ? Array.from(customerMap.values()).find(c => c.id === o.customer_id) : null
            return { ...o, customers: c ? { full_name: c.full_name } : null }
          })
        setActiveOrders(todayUnpaid)
        return
      }

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

  // ============================================================================
  // MAIN QUICK ACTIONS - Always visible on dashboard
  // ============================================================================
  const mainQuickItems = [
    {
      id: 'orders',
      title: 'Orders',
      icon: FileText,
      gradient: 'from-pink-500 to-rose-600',
      route: '/orders',
      permissionKey: 'ORDERS'
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
      id: 'expenses',
      title: 'Expenses',
      icon: Receipt,
      gradient: 'from-purple-500 to-indigo-600',
      route: '/expenses',
      permissionKey: 'EXPENSES'
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
      id: 'riders',
      title: 'Riders Orders',
      icon: Truck,
      gradient: 'from-blue-500 to-cyan-600',
      route: '/riders',
      permissionKey: 'RIDERS'
    },
    {
      id: 'marketing',
      title: 'Marketing',
      icon: MessageSquare,
      gradient: 'from-cyan-500 to-teal-600',
      route: '/marketing',
      permissionKey: 'MARKETING'
    },
    {
      id: 'web-orders',
      title: 'Web Orders',
      icon: Globe,
      gradient: 'from-purple-500 to-pink-600',
      route: '/web-orders',
      permissionKey: 'WEB_ORDERS'
    }
  ]

  // ============================================================================
  // OTHER QUICK ACTIONS - Hidden in "Others" folder (mobile phone style)
  // ============================================================================
  const otherQuickItems = [
    {
      id: 'my-till',
      title: 'My Till',
      icon: Wallet,
      gradient: 'from-violet-500 to-purple-600',
      route: '/my-till',
      permissionKey: 'MY_TILL'
    },
    {
      id: 'purchase-orders',
      title: 'Purchase Orders',
      icon: Package,
      gradient: 'from-teal-500 to-cyan-600',
      route: '/purchase-orders',
      permissionKey: 'PURCHASE_ORDERS'
    },
    {
      id: 'suppliers',
      title: 'Suppliers',
      icon: Building2,
      gradient: 'from-amber-500 to-orange-600',
      route: '/suppliers',
      permissionKey: 'SUPPLIERS'
    },
    {
      id: 'ledgers',
      title: 'Supplier Ledger',
      icon: BookOpen,
      gradient: 'from-blue-500 to-indigo-600',
      route: '/ledgers',
      permissionKey: 'SUPPLIER_LEDGER'
    },
    {
      id: 'payroll',
      title: 'Payroll',
      icon: Users,
      gradient: 'from-blue-500 to-indigo-600',
      route: '/payroll',
      permissionKey: 'PAYROLL'
    },

  ]

  // Helper to check if user has permission for a card
  const hasCardPermission = (permissionKey) => {
    if (!permissionKey) return true // No permission required
    return permissions.hasPermission(permissionKey)
  }

  const currentPlanSlug = planReady ? (planManager.getPlanSlug() ?? 'starter') : 'starter'
  const getCardPlanLock = (route) => {
    if (!planReady) return null
    return getRoutePlanLock(route, currentPlanSlug)
  }

  // Combine all quick actions into a single list. If they exceed one row,
  // last slot becomes the "Others" folder containing the overflow.
  const allQuickItems = [...mainQuickItems, ...otherQuickItems]
  const overflows = allQuickItems.length > QUICK_ACTIONS_PER_ROW
  const visibleMainItems = overflows
    ? allQuickItems.slice(0, QUICK_ACTIONS_PER_ROW - 1)
    : allQuickItems
  const dynamicOtherItems = overflows ? allQuickItems.slice(QUICK_ACTIONS_PER_ROW - 1) : []
  const hasVisibleOtherItems = overflows

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

  // Get theme classes from theme manager
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const [showAnalytics, setShowAnalytics] = useState(false)
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [showOthersFolder, setShowOthersFolder] = useState(false) // Mobile folder modal state

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
        className={`relative w-full ${themeClasses.header} backdrop-blur-lg
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
                <div className="flex items-center gap-2 mt-0.5">
                  <p className={`${themeClasses.textSecondary} font-medium`}>
                    {user.store_name}
                  </p>
                  {/* WhatsApp Status Badge */}
                  <div
                    title={waStatus === 'connected' ? 'WhatsApp Connected' : waStatus === 'connecting' || waStatus === 'qr_ready' ? 'WhatsApp Connecting...' : 'WhatsApp Disconnected'}
                    style={{ cursor: 'not-allowed' }}
                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs font-medium select-none ${
                      waStatus === 'connected'
                        ? isDark ? 'bg-green-500/15 border-green-500/30 text-green-400' : 'bg-green-50 border-green-200 text-green-700'
                        : waStatus === 'connecting' || waStatus === 'qr_ready'
                        ? isDark ? 'bg-yellow-500/15 border-yellow-500/30 text-yellow-400' : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                        : isDark ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-600'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      waStatus === 'connected' ? 'bg-green-500' :
                      waStatus === 'connecting' || waStatus === 'qr_ready' ? 'bg-yellow-400 animate-pulse' :
                      'bg-red-500'
                    }`} />
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347zM12 0C5.373 0 0 5.373 0 12c0 2.135.561 4.14 1.541 5.874L0 24l6.336-1.521A11.94 11.94 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818a9.8 9.8 0 01-5.015-1.374l-.36-.214-3.762.903.964-3.674-.234-.375A9.778 9.778 0 012.182 12C2.182 6.57 6.57 2.182 12 2.182S21.818 6.57 21.818 12 17.43 21.818 12 21.818z"/>
                    </svg>
                  </div>
                </div>

                  {/* Plan + Invoice status row */}
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {/* Plan Badge */}
                    {(() => {
                      const colors   = planManager.getPlanColors()
                      const planName = planManager.getPlanName()
                      const expired  = planManager.isExpired()

                      // If expired but there's an unpaid invoice not yet due,
                      // don't show "Expired" — the "Due Xd" badge already tells
                      // the user about the payment. Show plan name normally.
                      const invoiceDueMs      = planManager.getInvoiceDueMs()
                      const hasPendingInvoice = planManager.getInvoice()?.status === 'unpaid'
                                                && invoiceDueMs !== null && invoiceDueMs > 0
                      const showExpired = expired && !hasPendingInvoice

                      return (
                        <button
                          onClick={() => router.push('/settings?tab=plan')}
                          title={`Your plan: ${planName}${expired ? ' (expired)' : ''}`}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs font-semibold transition-all ${
                            showExpired
                              ? isDark ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
                              : isDark ? 'bg-purple-500/15 border-purple-500/30 text-purple-400' : `${colors.bg} ${colors.border} border ${colors.text}`
                          }`}
                        >
                          <Zap className="w-3 h-3 flex-shrink-0" />
                          {showExpired ? 'Expired' : planName}
                        </button>
                      )
                    })()}

                    {/* Invoice Due Badge — updates every second via currentTime re-render */}
                    {planReady && (() => {
                      const invoice = planManager.getInvoice()
                      if (!invoice || invoice.status !== 'unpaid') return null

                      // Compute ms remaining using currentTime so the badge ticks live
                      const hasDueAt = !!invoice.due_at
                      const ms = hasDueAt
                        ? new Date(invoice.due_at) - currentTime
                        : (() => {
                            if (!invoice.due_date) return null
                            const s = String(invoice.due_date).split('T')[0]
                            const [y, mo, d] = s.split('-').map(Number)
                            return new Date(y, mo - 1, d, 23, 59, 59) - currentTime
                          })()
                      if (ms === null) return null

                      const isOvd = ms < 0
                      const dur   = fmtDuration(ms)
                      const label = isOvd ? `Overdue ${dur}` : `Due ${dur}`
                      const title = isOvd
                        ? `Invoice overdue by ${dur}`
                        : `Invoice due in ${dur}`

                      return (
                        <span
                          title={title}
                          className={`flex items-center gap-1 px-1.5 py-0.5 rounded-lg border text-xs font-semibold ${
                            isOvd
                              ? isDark ? 'bg-red-500/15 border-red-500/30 text-red-400' : 'bg-red-50 border-red-200 text-red-700'
                              : ms < 3600000
                              ? isDark ? 'bg-red-500/15 border-red-500/30 text-red-400'   : 'bg-red-50 border-red-200 text-red-700'
                              : isDark ? 'bg-amber-500/15 border-amber-500/30 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-700'
                          }`}
                        >
                          <Clock className="w-3 h-3 flex-shrink-0" />
                          {label}
                        </span>
                      )
                    })()}
                  </div>
              </div>
            </div>

            {/* Center: Time and Date */}
            <div className="flex items-center justify-center gap-4">
              {/* Update Button — only renders when an update is available (mock for now) */}
              <DashboardUpdateButton />

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
            </div>

            {/* Right: Controls */}
            <div className="flex items-center justify-end space-x-2 pr-4">
              {/* Network Status */}
              <div className="flex items-center space-x-2">
                <Tooltip label={cacheStatus.networkStatus.isOnline ? 'Online' : 'Offline'}>
                  {cacheStatus.networkStatus.isOnline ? (
                    <Wifi className="w-5 h-5 text-green-500" />
                  ) : (
                    <WifiOff className="w-5 h-5 text-red-500" />
                  )}
                </Tooltip>

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

              {/* Analytics Button */}
              {permissions.canViewSalesAnalytics() && (
                <Tooltip label="Analytics">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowAnalytics(true)}
                    className={`p-3 rounded-xl ${themeClasses.button} transition-all`}
                  >
                    <BarChart3 className="w-5 h-5 text-indigo-500" />
                  </motion.button>
                </Tooltip>
              )}

              {/* Refresh Button */}
              <Tooltip label="Refresh">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleRefreshCache}
                  disabled={cacheStatus.isLoading}
                  className={`p-3 rounded-xl ${themeClasses.button} transition-all disabled:opacity-50`}
                >
                  <RefreshCw className={`w-5 h-5 ${themeClasses.textSecondary} ${cacheStatus.isLoading ? 'animate-spin' : ''}`} />
                </motion.button>
              </Tooltip>

              {/* Theme Toggle */}
              <Tooltip label={theme === 'dark' ? 'Light Mode' : 'Dark Mode'}>
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
              </Tooltip>

              {/* Offline Orders Button */}
              <Tooltip label="Offline Orders">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleNavigation('/offline-orders', 'OFFLINE_ORDERS')}
                  className={`p-3 rounded-xl ${themeClasses.button} transition-all relative ${!permissions.hasPermission('OFFLINE_ORDERS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Database className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                  {cacheStatus.networkStatus.unsyncedOrders > 0 && (
                    <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-blue-500 text-white text-xs font-bold rounded-full">
                      {cacheStatus.networkStatus.unsyncedOrders}
                    </span>
                  )}
                </motion.button>
              </Tooltip>

              {/* Printer — click navigates to /printer, hover shows live status with Test/Print */}
              <PrinterStatusBadge
                onClick={() => handleNavigation('/printer', 'PRINTERS')}
                disabled={!permissions.hasPermission('PRINTERS')}
                buttonClassName={`relative p-3 rounded-xl ${themeClasses.button} transition-all ${!permissions.hasPermission('PRINTERS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                iconClassName={`w-5 h-5 ${themeClasses.textSecondary}`}
              />

              <FingerprintStatusBadge className={`p-3 rounded-xl ${themeClasses.button}`} />

              {/* Plan Button */}
              <Tooltip label="Plan & Billing">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push('/settings?tab=plan')}
                  className={`p-3 rounded-xl ${themeClasses.button} transition-all`}
                >
                  <Crown className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                </motion.button>
              </Tooltip>

              {/* Settings Button */}
              <Tooltip label="Settings">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleNavigation('/settings', 'SETTINGS')}
                  className={`p-3 rounded-xl ${themeClasses.button} transition-all ${!permissions.hasPermission('SETTINGS') ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <Settings className={`w-5 h-5 ${themeClasses.textSecondary}`} />
                </motion.button>
              </Tooltip>

              {/* Logout Button */}
              <Tooltip label="Sign Out">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleLogout}
                  className="p-3 rounded-xl bg-red-500 hover:bg-red-600 text-white hover:shadow-lg transition-all"
                >
                  <LogOut className="w-5 h-5" />
                </motion.button>
              </Tooltip>
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
                onClick={() => { window.dispatchEvent(new CustomEvent('page-navigating')); router.push('/new-order') }}
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
                  whileHover={hasPermission ? { y: -10, scale: 1.02, transition: { duration: 0.1, type: 'tween', ease: 'easeOut' } } : {}}
                  whileTap={hasPermission ? { scale: 0.98 } : {}}
                  onClick={() => handleNavigation(card.route, card.permissionKey)}
                  className={`${hasPermission ? 'cursor-pointer' : 'cursor-not-allowed'} group relative`}
                >
                  <div className={`relative overflow-hidden rounded-3xl shadow-xl ${hasPermission ? 'hover:shadow-2xl' : 'opacity-60'} transition-all duration-100`}>
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

        {/* Quick Actions - Mobile Folder Style */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className={layoutTheme === 'modern' ? 'mt-8' : ''}
        >
          <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-6 text-center`}>
            Quick Actions
          </h3>

          {/* Single Row - Full Width 8-column grid */}
          <div className="w-full px-4">
            <div className="grid grid-cols-8 gap-3 w-full">
              {/* Main Quick Actions */}
              {visibleMainItems.map((item, index) => {
                const hasPermission = hasCardPermission(item.permissionKey)
                const planLock = getCardPlanLock(item.route)
                const locked = !hasPermission || !!planLock
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.7 + index * 0.05 }}
                    whileHover={!locked ? { y: -5, scale: 1.05, transition: { duration: 0.1, type: 'tween', ease: 'easeOut' } } : {}}
                    whileTap={!locked ? { scale: 0.95 } : {}}
                    onClick={() => {
                      if (locked) return
                      handleNavigation(item.route, item.permissionKey)
                    }}
                    className={`${locked ? 'cursor-not-allowed' : 'cursor-pointer'} w-full`}
                  >
                    <div className={`${themeClasses.card} rounded-2xl p-4 ${themeClasses.shadow} ${!locked ? 'hover:shadow-xl' : ''} transition-all duration-100 ${themeClasses.border} border relative h-full flex flex-col items-center justify-center`}>
                      {!hasPermission ? (
                        <div className="absolute -top-2 -right-2 z-20">
                          <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                            <Shield className="w-2.5 h-2.5" />
                            LOCKED
                          </div>
                        </div>
                      ) : planLock ? (
                        <div className="absolute -top-2 -right-2 z-20">
                          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                            <Crown className="w-2.5 h-2.5" />
                            {planLock.toUpperCase()}
                          </div>
                        </div>
                      ) : null}
                      <div className={locked ? 'blur-sm pointer-events-none flex flex-col items-center' : 'flex flex-col items-center'}>
                        <motion.div
                          whileHover={!locked ? { rotate: 10, scale: 1.1 } : {}}
                          className={`w-10 h-10 mb-3 bg-gradient-to-r ${item.gradient} rounded-xl flex items-center justify-center shadow-lg relative`}
                        >
                          <item.icon className="w-5 h-5 text-white" />
                          {item.id === 'web-orders' && pendingWebOrders > 0 && (
                            <motion.div
                              initial={{ scale: 0 }}
                              animate={{ scale: [1, 1.1, 1] }}
                              transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white text-xs font-bold rounded-full w-6 h-6 flex items-center justify-center shadow-lg border-2 border-white z-10"
                            >
                              {pendingWebOrders}
                            </motion.div>
                          )}
                        </motion.div>
                        <h4 className={`text-center font-medium text-xs sm:text-sm ${themeClasses.textPrimary}`}>
                          {item.title}
                        </h4>
                      </div>
                    </div>
                  </motion.div>
                )
              })}

              {/* Others Folder - Always Last Card (if there are visible other items with permissions) */}
              {hasVisibleOtherItems && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.7 + visibleMainItems.length * 0.05 }}
                  whileHover={{ y: -5, scale: 1.05, transition: { duration: 0.1, type: 'tween', ease: 'easeOut' } }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowOthersFolder(true)}
                  className="cursor-pointer w-full"
                >
                  <div className={`${themeClasses.card} rounded-2xl p-4 ${themeClasses.shadow} hover:shadow-xl transition-all duration-100 ${themeClasses.border} border relative h-full flex flex-col items-center justify-center`}>
                    {/* iOS-style folder: 2×2 grid of mini gradient swatches */}
                    <div className={`w-10 h-10 mb-3 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-xl flex items-center justify-center shadow-lg`}>
                      <div className="grid grid-cols-2 gap-1">
                        {Array.from({ length: 4 }).map((_, i) => {
                          const o = dynamicOtherItems[i]
                          return o
                            ? <div key={i} className={`w-2 h-2 rounded-sm bg-gradient-to-br ${o.gradient}`} />
                            : <div key={i} className={`w-2 h-2 rounded-sm ${isDark ? 'bg-gray-600' : 'bg-gray-400'}`} />
                        })}
                      </div>
                    </div>
                    <h4 className={`text-center font-medium text-xs sm:text-sm ${themeClasses.textPrimary}`}>Others</h4>
                    {dynamicOtherItems.length > 0 && (
                      <div className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] font-bold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center shadow-md">
                        {dynamicOtherItems.length}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </div>
          </div>

          {/* Others Folder Modal - Mobile Phone Style Popup */}
          <AnimatePresence>
            {showOthersFolder && (
              <>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setShowOthersFolder(false)}
                  className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
                />
                <motion.div
                  initial={{ opacity: 0, y: 16, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 16, scale: 0.95 }}
                  className={`fixed bottom-8 left-1/2 -translate-x-1/2 z-50 ${themeClasses.card} rounded-3xl p-6 shadow-2xl ${themeClasses.border} border max-w-md w-[90vw]`}
                >
                  <div className="flex items-center justify-between mb-4">
                    <h4 className={`font-bold text-lg ${themeClasses.textPrimary}`}>More Actions</h4>
                    <button
                      onClick={() => setShowOthersFolder(false)}
                      className={`w-8 h-8 rounded-full ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} flex items-center justify-center transition-colors`}
                    >
                      <X className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {dynamicOtherItems.map((item, index) => {
                      const hasPermission = hasCardPermission(item.permissionKey)
                      const planLock = getCardPlanLock(item.route)
                      const locked = !hasPermission || !!planLock
                      return (
                        <motion.div
                          key={item.id}
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: index * 0.05 }}
                          whileHover={!locked ? { y: -5, scale: 1.05, transition: { duration: 0.1, type: 'tween', ease: 'easeOut' } } : {}}
                          whileTap={!locked ? { scale: 0.95 } : {}}
                          onClick={() => {
                            if (locked) return
                            setShowOthersFolder(false)
                            handleNavigation(item.route, item.permissionKey)
                          }}
                          className={`${locked ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <div className={`${themeClasses.card} rounded-2xl p-4 ${themeClasses.shadow} ${!locked ? 'hover:shadow-xl' : ''} transition-all duration-100 ${themeClasses.border} border relative h-full flex flex-col items-center`}>
                            {!hasPermission ? (
                              <div className="absolute -top-2 -right-2 z-20">
                                <div className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                                  <Shield className="w-2.5 h-2.5" />
                                  LOCKED
                                </div>
                              </div>
                            ) : planLock ? (
                              <div className="absolute -top-2 -right-2 z-20">
                                <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shadow-md">
                                  <Crown className="w-2.5 h-2.5" />
                                  {planLock.toUpperCase()}
                                </div>
                              </div>
                            ) : null}
                            <div className={locked ? 'blur-sm pointer-events-none flex flex-col items-center' : 'flex flex-col items-center'}>
                              <motion.div
                                whileHover={!locked ? { rotate: 10, scale: 1.1 } : {}}
                                className={`w-10 h-10 mx-auto mb-3 bg-gradient-to-r ${item.gradient} rounded-xl flex items-center justify-center shadow-lg relative`}
                              >
                                <item.icon className="w-5 h-5 text-white" />
                                {item.id === 'web-orders' && pendingWebOrders > 0 && (
                                  <motion.div
                                    initial={{ scale: 0 }}
                                    animate={{ scale: [1, 1.1, 1] }}
                                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
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
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </motion.div>
      </main>
      </div>

      <CashierAnalytics
        isOpen={showAnalytics}
        onClose={() => setShowAnalytics(false)}
        isDark={isDark}
      />

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowLogoutConfirm(false)} />
          <div className={`relative rounded-2xl shadow-2xl p-6 w-80 ${isDark ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'}`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <LogOut className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h3 className="font-semibold text-base">Confirm Logout</h3>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Are you sure you want to log out?</p>
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className={`flex-1 py-2 rounded-xl font-medium text-sm transition-all ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
              >
                Cancel
              </button>
              <button
                onClick={confirmLogout}
                className="flex-1 py-2 rounded-xl font-medium text-sm bg-red-500 hover:bg-red-600 text-white transition-all"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </ProtectedPage>
  )
}
