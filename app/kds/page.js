'use client'

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import {
  ArrowLeft,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChefHat,
  Flame,
  Package,
  Coffee,
  User,
  Phone,
  MapPin,
  RefreshCw,
  Bell,
  BellOff,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Filter,
  Search,
  MoreVertical,
  Check,
  X,
  Pause,
  Play,
  Sun,
  Moon,
  Zap,
  Timer,
  FileText,
  LayoutGrid,
  List,
  Table2,
  Printer,
  ArrowUpDown
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { cacheManager } from '../../lib/cacheManager'
import { printerManager } from '../../lib/printerManager'
import dailySerialManager from '../../lib/utils/dailySerialManager'
import { getTodaysBusinessDate, filterOrdersByBusinessDate, getBusinessDayRange } from '../../lib/utils/businessDayUtils'
import { getOrderChanges, getOrderItemsWithChanges } from '../../lib/utils/orderChangesTracker'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import ProtectedPage from '../../components/ProtectedPage'

export default function KDSPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [theme, setTheme] = useState('light')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [soundEnabled, setSoundEnabled] = useState(true)
  const [notificationsEnabled, setNotificationsEnabled] = useState(true)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [refreshInterval, setRefreshInterval] = useState(30) // seconds
  const [statusFilter, setStatusFilter] = useState('All') // All, Pending, Preparing, Ready, Completed
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedOrder, setSelectedOrder] = useState(null)
  const [orderItems, setOrderItems] = useState([])
  const [viewMode, setViewMode] = useState('columns') // 'tabs' or 'columns'
  const [allOrders, setAllOrders] = useState([]) // Store all orders for column view
  const [sortOrder, setSortOrder] = useState('desc') // 'asc' (old to new) or 'desc' (new to old)
  const [updatedOrderIds, setUpdatedOrderIds] = useState(new Set()) // Orders updated while in kitchen
  const [selectedOrderChanges, setSelectedOrderChanges] = useState(null) // Changes for selected order modal
  const [mounted, setMounted] = useState(false) // Tracks client-side hydration completion
  const [orderChangesMap, setOrderChangesMap] = useState({}) // orderId → changes[] for inline display
  const audioRef = useRef(null)
  const refreshTimerRef = useRef(null)
  const lastOrderCountRef = useRef(0)
  const allOrdersRef = useRef([]) // Ref to always hold current orders for real-time comparison

  // Helpers to persist "UPDATED" order IDs across re-renders / page refreshes
  const getStoredUpdatedIds = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem('kds_updated_orders') || '[]'))
    } catch {
      return new Set()
    }
  }
  const saveUpdatedIds = (ids) => {
    try {
      localStorage.setItem('kds_updated_orders', JSON.stringify([...ids]))
    } catch {}
  }

  // Status tabs matching orders page
  const statusTabs = [
    { id: 'All', label: 'All', icon: FileText },
    { id: 'Pending', label: 'Placed', icon: Clock },
    { id: 'Preparing', label: 'Preparing', icon: ChefHat },
    { id: 'Ready', label: 'Ready', icon: Package },
    { id: 'Dispatched', label: 'Dispatched', icon: CheckCircle },
  ]

  // Status config matching orders page colors
  const getStatusConfig = (status) => {
    const isDark = themeManager.isDark()
    const configs = {
      Pending: {
        bg: isDark ? 'bg-yellow-900/20' : 'bg-yellow-50',
        border: isDark ? 'border-yellow-700/30' : 'border-yellow-200',
        text: isDark ? 'text-yellow-300' : 'text-yellow-700',
        badge: isDark ? 'bg-yellow-900/30 text-yellow-300' : 'bg-yellow-100 text-yellow-800',
        nextStatus: 'Preparing',
        nextLabel: 'Start Preparing'
      },
      Preparing: {
        bg: isDark ? 'bg-blue-900/20' : 'bg-blue-50',
        border: isDark ? 'border-blue-700/30' : 'border-blue-200',
        text: isDark ? 'text-blue-300' : 'text-blue-700',
        badge: isDark ? 'bg-blue-900/30 text-blue-300' : 'bg-blue-100 text-blue-800',
        nextStatus: 'Ready',
        nextLabel: 'Mark Ready'
      },
      Ready: {
        bg: isDark ? 'bg-purple-900/20' : 'bg-purple-50',
        border: isDark ? 'border-purple-700/30' : 'border-purple-200',
        text: isDark ? 'text-purple-300' : 'text-purple-700',
        badge: isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-800',
        nextStatus: 'Dispatched',
        nextLabel: 'Mark as Dispatch'
      },
      Dispatched: {
        bg: isDark ? 'bg-green-900/20' : 'bg-green-50',
        border: isDark ? 'border-green-700/30' : 'border-green-200',
        text: isDark ? 'text-green-300' : 'text-green-700',
        badge: isDark ? 'bg-green-900/30 text-green-300' : 'bg-green-100 text-green-800',
        nextStatus: null,
        nextLabel: null
      },
    }
    return configs[status] || configs['Pending']
  }

  // Get order type icon
  const getOrderTypeIcon = (type) => {
    switch (type) {
      case 'takeaway': return Package
      case 'delivery': return Truck
      default: return Coffee
    }
  }

  // Get order type color
  const getOrderTypeColor = (type) => {
    const isDark = themeManager.isDark()
    switch (type) {
      case 'takeaway':
        return isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-100 text-orange-600'
      case 'delivery':
        return isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-100 text-blue-600'
      default:
        return isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-600'
    }
  }

  // Mark component as hydrated so theme-dependent classes are safe to use
  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    setUser(userData)
    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    // Initialize cacheManager and printerManager with user ID for offline support
    if (userData?.id) {
      cacheManager.setUserId(userData.id)
      printerManager.setUserId(userData.id)
    }

    // Load orders with user data immediately
    if (userData?.id) {
      loadOrders(false, userData.id)
    }

    // Setup auto-refresh
    let refreshTimer = null
    if (autoRefresh && userData?.id) {
      refreshTimer = setInterval(() => {
        loadOrders(true, userData.id) // Silent refresh
      }, refreshInterval * 1000)
    }

    // Setup realtime subscription
    const subscription = supabase
      .channel('kds-orders')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders'
        },
        (payload) => {
          console.log('🔔 Order update received:', payload)
          if (userData?.id) {
            loadOrders(true, userData.id)
          }

          // Play sound for new orders
          if (payload.eventType === 'INSERT' && soundEnabled) {
            playNotificationSound()
          }

          // Updated order detection is handled inside loadOrders() by comparing
          // freshly fetched orders against allOrdersRef (the previous snapshot)
        }
      )
      .subscribe()

    // Subscribe to order_items INSERT events — these fire AFTER new items are saved,
    // which is the right moment to detect that an existing kitchen order was edited.
    const itemsSubscription = supabase
      .channel('kds-order-items')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_items' },
        (payload) => {
          const orderId = payload.new?.order_id
          if (!orderId) return
          // If this order is already in a kitchen status → it was edited, not newly placed
          const existingOrder = allOrdersRef.current.find(o => o.id === orderId)
          if (existingOrder && ['Pending', 'Preparing', 'Ready'].includes(existingOrder.order_status)) {
            const stored = getStoredUpdatedIds()
            stored.add(orderId)
            saveUpdatedIds(stored)
            setUpdatedOrderIds(new Set(stored))
          }
        }
      )
      .subscribe()

    return () => {
      if (refreshTimer) {
        clearInterval(refreshTimer)
      }
      subscription.unsubscribe()
      itemsSubscription.unsubscribe()
    }
  }, [router, autoRefresh, refreshInterval])

  // No need to reload on filter change - using memoization for instant filtering

  const playNotificationSound = () => {
    if (audioRef.current) {
      audioRef.current.play().catch(err => console.log('Sound play failed:', err))
    }
  }

  const loadOrders = useCallback(async (silent = false, userId = user?.id) => {
    try {
      if (!silent) setLoading(true)

      if (!userId) {
        console.log('No user ID, skipping order load')
        setLoading(false)
        return
      }

      // Get user's business hours from localStorage
      let businessStartTime = '10:00'
      let businessEndTime = '03:00'
      try {
        const userProfile = localStorage.getItem('user_profile')
        if (userProfile) {
          const profile = JSON.parse(userProfile)
          businessStartTime = profile.business_start_time || '10:00'
          businessEndTime = profile.business_end_time || '03:00'
        }
      } catch (e) {
        console.warn('Could not load business hours from profile, using defaults')
      }

      // Get today's business date based on business hours
      const todaysBusinessDate = getTodaysBusinessDate(businessStartTime, businessEndTime)
      const businessDayRange = getBusinessDayRange(todaysBusinessDate, businessStartTime, businessEndTime)

      console.log('KDS loading orders for business date:', todaysBusinessDate)
      console.log('Business day range:', businessDayRange)

      let fetchedOrders = []

      // Check if we're online or offline
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

      if (isOnline) {
        try {
          // Fetch orders for the business day range (may span across midnight)
          // This allows instant tab switching without re-fetching
          const { data, error } = await supabase
            .from('orders')
            .select(`
              id,
              order_number,
              order_type,
              order_status,
              order_time,
              total_amount,
              subtotal,
              created_at,
              order_instructions,
              delivery_charges,
              cashier_id,
              updated_at,
              order_items (
                id,
                product_name,
                variant_name,
                quantity,
                is_deal,
                deal_products,
                item_instructions
              ),
              customers (
                full_name,
                phone
              ),
              tables (
                id,
                table_name,
                table_number
              ),
              cashiers!orders_cashier_id_fkey (
                id,
                name
              ),
              users (
                id,
                customer_name
              )
            `)
            .eq('user_id', userId)
            .gte('created_at', businessDayRange.startDateTime)
            .lt('created_at', businessDayRange.endDateTime)
            .order('created_at', { ascending: false })
            .limit(200)

          if (error) throw error

          fetchedOrders = data || []
          console.log('📦 [KDS] Fetched from Supabase:', fetchedOrders.length)
        } catch (fetchError) {
          // Network error - fall back to cache
          console.warn('🔄 [KDS] Network error, falling back to cache:', fetchError.message)
          const cachedOrders = cacheManager.getAllOrders() || []
          // Filter for today's business day orders
          fetchedOrders = filterOrdersByBusinessDate(cachedOrders, todaysBusinessDate, businessStartTime, businessEndTime)
          console.log('📦 [KDS] Loaded from cache (network error):', fetchedOrders.length)
        }
      } else {
        // Offline mode - get orders from cache using the SAME time-range as the online query.
        // Using filterOrdersByBusinessDate here would cause a mismatch: its getBusinessDate()
        // assigns 3am-10am "gap" orders to the current business date, but the online range
        // starts at 10am — so those orders would appear offline but not online.
        console.log('📴 [KDS] Offline mode - loading from cache')
        const cachedOrders = cacheManager.getAllOrders() || []
        const rangeStart = new Date(businessDayRange.startDateTime)
        const rangeEnd = new Date(businessDayRange.endDateTime)
        fetchedOrders = cachedOrders.filter(o => {
          const t = new Date(o.created_at)
          return t >= rangeStart && t < rangeEnd
        })
        console.log('📦 [KDS] Loaded from cache:', fetchedOrders.length)
      }

      // Check for new orders
      if (notificationsEnabled && fetchedOrders.length > lastOrderCountRef.current) {
        if (!silent && lastOrderCountRef.current > 0) {
          showNotification('New Order Received!', 'A new order is ready for preparation.')
        }
      }
      lastOrderCountRef.current = fetchedOrders.length

      // Enrich orders with daily serial numbers
      const ordersWithSerials = cacheManager.enrichOrdersWithSerials(fetchedOrders)

      // Store all orders (also keep ref in sync for real-time comparison)
      allOrdersRef.current = ordersWithSerials
      setAllOrders(ordersWithSerials)

      // Restore UPDATED tags from localStorage, keeping only IDs still in a kitchen status
      const storedIds = getStoredUpdatedIds()

      // Also seed from order_changes cache — catches orders modified before KDS was opened
      try {
        const cachedChanges = JSON.parse(localStorage.getItem('order_changes') || '{}')
        ordersWithSerials
          .filter(o => ['Pending', 'Preparing', 'Ready'].includes(o.order_status))
          .forEach(o => {
            const changes = cachedChanges[o.id]
            if (changes && changes.length > 0) storedIds.add(o.id)
          })
      } catch (_) {}

      const validIds = new Set(
        [...storedIds].filter(id =>
          ordersWithSerials.some(o => o.id === id && ['Pending', 'Preparing', 'Ready'].includes(o.order_status))
        )
      )
      saveUpdatedIds(validIds) // prune stale IDs
      setUpdatedOrderIds(validIds)

      setLoading(false)
    } catch (error) {
      console.error('Error loading KDS orders:', error)
      // Final fallback to cache on any error
      try {
        // Get user's business hours
        let businessStartTime = '10:00'
        let businessEndTime = '03:00'
        try {
          const userProfile = localStorage.getItem('user_profile')
          if (userProfile) {
            const profile = JSON.parse(userProfile)
            businessStartTime = profile.business_start_time || '10:00'
            businessEndTime = profile.business_end_time || '03:00'
          }
        } catch (e) {
          console.warn('Could not load business hours, using defaults')
        }

        const todaysBusinessDate = getTodaysBusinessDate(businessStartTime, businessEndTime)
        const cachedOrders = cacheManager.getAllOrders() || []
        const todayOrders = filterOrdersByBusinessDate(cachedOrders, todaysBusinessDate, businessStartTime, businessEndTime)
        allOrdersRef.current = todayOrders
        setAllOrders(todayOrders)
        console.log('📦 [KDS] Final fallback - loaded from cache:', todayOrders.length)
      } catch (cacheError) {
        console.error('Cache fallback also failed:', cacheError)
        allOrdersRef.current = []
        setAllOrders([])
      }
      setLoading(false)
    }
  }, [user?.id, notificationsEnabled])

  // Memoized filtered orders - instant filtering without re-fetch
  const filteredOrders = useMemo(() => {
    let result = allOrders

    // Apply status filter
    if (statusFilter !== 'All') {
      result = result.filter(order => order.order_status === statusFilter)
    }

    // Apply search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      result = result.filter(order => {
        const orderNumber = (order.order_number || '').toLowerCase()
        const customerName = (order.customers?.full_name || '').toLowerCase()

        // Serial number search - support searching by serial like "001", "1", "#001", etc.
        const serialNumber = order.daily_serial ? order.daily_serial.toString() : ""
        const serialFormatted = order.daily_serial ? order.daily_serial.toString().padStart(3, '0') : ""
        const searchMatchesSerial = serialNumber === search ||
                                    serialFormatted === search ||
                                    serialFormatted.includes(search) ||
                                    search.replace('#', '') === serialNumber ||
                                    search.replace('#', '') === serialFormatted

        return orderNumber.includes(search) || customerName.includes(search) || searchMatchesSerial
      })
    }

    // Apply sorting
    result = [...result].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime()
      const dateB = new Date(b.created_at).getTime()
      return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
    })

    return result
  }, [allOrders, statusFilter, searchTerm, sortOrder])

  // Memoized orders grouped by status for column view
  const ordersByStatus = useMemo(() => {
    const searchFilter = searchTerm.toLowerCase()
    const filterBySearch = (orders) => {
      if (!searchTerm) return orders
      return orders.filter(order => {
        const orderNumber = (order.order_number || '').toLowerCase()
        const customerName = (order.customers?.full_name || '').toLowerCase()

        // Serial number search - support searching by serial like "001", "1", "#001", etc.
        const serialNumber = order.daily_serial ? order.daily_serial.toString() : ""
        const serialFormatted = order.daily_serial ? order.daily_serial.toString().padStart(3, '0') : ""
        const searchMatchesSerial = serialNumber === searchFilter ||
                                    serialFormatted === searchFilter ||
                                    serialFormatted.includes(searchFilter) ||
                                    searchFilter.replace('#', '') === serialNumber ||
                                    searchFilter.replace('#', '') === serialFormatted

        return orderNumber.includes(searchFilter) || customerName.includes(searchFilter) || searchMatchesSerial
      })
    }

    const sortOrders = (orders) => {
      return [...orders].sort((a, b) => {
        // Updated orders always float to the top
        const aUpdated = updatedOrderIds.has(a.id) ? 1 : 0
        const bUpdated = updatedOrderIds.has(b.id) ? 1 : 0
        if (bUpdated !== aUpdated) return bUpdated - aUpdated
        // Then sort by date
        const dateA = new Date(a.created_at).getTime()
        const dateB = new Date(b.created_at).getTime()
        return sortOrder === 'desc' ? dateB - dateA : dateA - dateB
      })
    }

    return {
      Pending: sortOrders(filterBySearch(allOrders.filter(o => o.order_status === 'Pending'))),
      Preparing: sortOrders(filterBySearch(allOrders.filter(o => o.order_status === 'Preparing'))),
      Ready: sortOrders(filterBySearch(allOrders.filter(o => o.order_status === 'Ready'))),
      Dispatched: sortOrders(filterBySearch(allOrders.filter(o => o.order_status === 'Dispatched'))),
    }
  }, [allOrders, searchTerm, sortOrder, updatedOrderIds])

  const showNotification = (title, body) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/icon.png' })
    }
  }

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission()
      setNotificationsEnabled(permission === 'granted')
    }
  }

  const fetchOrderItems = async (orderId) => {
    try {
      // Check if we're online or offline
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

      if (isOnline) {
        try {
          const { data, error } = await supabase
            .from('order_items')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at')

          if (error) throw error
          setOrderItems(data || [])
        } catch (fetchError) {
          // Network error - fall back to cached order items
          console.warn('🔄 [KDS] Network error fetching items, using cached data')
          const cachedOrder = allOrders.find(o => o.id === orderId)
          setOrderItems(cachedOrder?.order_items || cachedOrder?.items || [])
        }
      } else {
        // Offline: Get items from cached order
        console.log('📴 [KDS] Offline - using cached order items')
        const cachedOrder = allOrders.find(o => o.id === orderId)
        setOrderItems(cachedOrder?.order_items || cachedOrder?.items || [])
      }
    } catch (error) {
      console.error('Error fetching order items:', error)
      // Final fallback to cached order items
      const cachedOrder = allOrders.find(o => o.id === orderId)
      setOrderItems(cachedOrder?.order_items || cachedOrder?.items || [])
    }

    // Fetch order changes (for updated orders)
    try {
      const changes = await getOrderChanges(orderId)
      setSelectedOrderChanges(changes.hasChanges ? changes : null)
    } catch (e) {
      setSelectedOrderChanges(null)
    }
  }

  const updateOrderStatus = async (orderId, newStatus) => {
    try {
      // Check if we're online or offline
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

      if (isOnline) {
        // Online: Update Supabase directly
        const { error } = await supabase
          .from('orders')
          .update({
            order_status: newStatus,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)

        if (error) throw error
      } else {
        // Offline: Use cacheManager to queue the update
        console.log('📴 [KDS] Offline - queueing status update for later sync')
        const result = await cacheManager.updateOrderStatus(orderId, newStatus)
        if (!result.success) {
          throw new Error('Failed to queue offline update')
        }
      }

      // Update local state immediately for instant feedback
      setAllOrders(prevOrders =>
        prevOrders.map(order =>
          order.id === orderId
            ? { ...order, order_status: newStatus, updated_at: new Date().toISOString() }
            : order
        )
      )

      // Show success message
      playNotificationSound()

      // Always close the detail popup after any status action
      setSelectedOrder(null)
      setOrderItems([])
      setSelectedOrderChanges(null)
    } catch (error) {
      console.error('Error updating order status:', error)
      notify.error('Failed to update order status')
    }
  }

  const getElapsedTime = (createdAt) => {
    const now = new Date()
    const created = new Date(createdAt)
    const diffMs = now - created
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)

    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`
    }
    return `${diffMins}m`
  }

  const getPriorityColor = (createdAt) => {
    const diffMs = new Date() - new Date(createdAt)
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins > 30) return 'red' // Critical
    if (diffMins > 15) return 'orange' // Warning
    return 'green' // Normal
  }

  // Load changes for updated orders so they show inline on cards without clicking
  const loadChangesForUpdatedOrders = useCallback(async (updatedIds) => {
    if (!updatedIds || updatedIds.size === 0) return
    const cached = JSON.parse(localStorage.getItem('order_changes') || '{}')
    const fromCache = {}
    const needFetch = []
    for (const id of updatedIds) {
      if (cached[id] && cached[id].length > 0) {
        fromCache[id] = cached[id]
      } else {
        needFetch.push(id)
      }
    }
    if (Object.keys(fromCache).length > 0) {
      setOrderChangesMap(prev => ({ ...prev, ...fromCache }))
    }
    // Fetch uncached ones in background, one at a time to avoid rate-limiting
    for (const id of needFetch) {
      try {
        const result = await getOrderChanges(id)
        if (result.hasChanges) {
          setOrderChangesMap(prev => ({ ...prev, [id]: result.changes }))
        }
      } catch (_) {}
    }
  }, [])

  // Whenever updatedOrderIds changes, pre-fetch changes for all updated orders
  useEffect(() => {
    loadChangesForUpdatedOrders(updatedOrderIds)
  }, [updatedOrderIds, loadChangesForUpdatedOrders])

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  // Print kitchen docket for an order
  const printDocket = async (order, e) => {
    if (e) {
      e.stopPropagation()
    }

    try {
      // Check if we're in Electron environment
      if (!printerManager.isElectron()) {
        notify.warning('Printing is only available in the desktop app.')
        return
      }

      // Get printer configuration
      let printerConfig = await printerManager.getPrinterForPrinting()

      if (!printerConfig) {
        notify.warning('No printer configured. Please configure a printer in Settings.')
        return
      }

      // Debug: Log the printer config
      console.log('🖨️ Printer config retrieved:', JSON.stringify(printerConfig, null, 2))

      // Validate printer configuration has connection details
      const hasUSB = printerConfig.usb_port || printerConfig.usb_device_path
      const hasIP = printerConfig.ip_address || printerConfig.ip
      const connectionType = printerConfig.connection_type || printerConfig.printer_type

      if (!hasUSB && !hasIP) {
        // Try to get the printer config directly from localStorage as fallback
        const storedPrinters = localStorage.getItem('configured_printers')
        if (storedPrinters) {
          const printers = JSON.parse(storedPrinters)
          const userPrinter = printers.find(p => p.user_id === user?.id && (p.ip_address || p.usb_port || p.usb_device_path))
          if (userPrinter) {
            console.log('🖨️ Using fallback printer from localStorage:', userPrinter.name)
            printerConfig = {
              ...printerConfig,
              ip_address: userPrinter.ip_address,
              ip: userPrinter.ip_address,
              usb_port: userPrinter.usb_port || userPrinter.usb_device_path,
              usb_device_path: userPrinter.usb_device_path || userPrinter.usb_port,
              connection_type: userPrinter.connection_type || userPrinter.printer_type,
              printer_type: userPrinter.printer_type || userPrinter.connection_type,
            }
          }
        }

        // Check again after fallback
        const hasUSBNow = printerConfig.usb_port || printerConfig.usb_device_path
        const hasIPNow = printerConfig.ip_address || printerConfig.ip

        if (!hasUSBNow && !hasIPNow) {
          notify.error('Printer configuration is incomplete. Please reconfigure your printer in Settings with a valid IP address or USB connection.')
          return
        }
      }

      // Get order items
      let orderItems = order.order_items || []

      // Prepare order data for kitchen token - must match expected format
      let mappedItems = orderItems.map((item) => {
        if (item.is_deal) {
          let dealProducts = []
          try {
            if (item.deal_products) {
              dealProducts = typeof item.deal_products === 'string'
                ? JSON.parse(item.deal_products)
                : item.deal_products
            }
          } catch (e) {
            console.error('Failed to parse deal_products:', e)
          }
          return {
            isDeal: true,
            name: item.product_name || item.deal_name,
            quantity: item.quantity,
            dealProducts: dealProducts,
            instructions: item.item_instructions || item.instructions || '',
          }
        }
        return {
          isDeal: false,
          name: item.product_name || item.deal_name,
          size: item.variant_name || '',
          quantity: item.quantity,
          instructions: item.item_instructions || item.instructions || '',
        }
      })

      // Enrich items with change tracking (changeType, oldQuantity, newQuantity)
      if (order.id) {
        mappedItems = await getOrderItemsWithChanges(order.id, mappedItems)
      }

      const orderData = {
        orderNumber: order.order_number,
        dailySerial: order.daily_serial || null,
        orderType: order.order_type || 'walkin',
        customerName: order.customers?.full_name || '',
        customerPhone: order.customers?.phone || '',
        totalAmount: order.total_amount || 0,
        subtotal: order.subtotal || order.total_amount || 0,
        deliveryCharges: order.delivery_charges || 0,
        discountAmount: order.discount_amount || 0,
        specialNotes: order.order_instructions || '',
        items: mappedItems,
      }

      // Get user profile
      const userProfileRaw = JSON.parse(
        localStorage.getItem('user_profile') ||
        localStorage.getItem('user') ||
        '{}'
      )

      // Get cashier/admin name from order
      const cashierName = order.cashier_id
        ? (order.cashiers?.name || 'Cashier')
        : (order.users?.customer_name || 'Admin')

      const userProfile = {
        store_name: userProfileRaw?.store_name || 'KITCHEN',
        // Add cashier/admin name for kitchen token printing
        cashier_name: order.cashier_id ? cashierName : null,
        customer_name: !order.cashier_id ? cashierName : null,
      }

      console.log('🖨️ Printing docket for order:', orderData.orderNumber)
      console.log('🖨️ Final printer config:', JSON.stringify(printerConfig, null, 2))

      const result = await printerManager.printKitchenToken(orderData, userProfile, printerConfig)

      if (result.success) {
        console.log('✅ Docket printed successfully')
        notify.success('Docket printed successfully')
      } else {
        console.error('❌ Print failed:', result.error)
        notify.error(`Failed to print docket: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      console.error('❌ Error printing docket:', error)
      notify.error(`Error printing docket: ${error.message}`)
    }
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const OrderCard = ({ order }) => {
    const config = getStatusConfig(order.order_status)
    const OrderIcon = getOrderTypeIcon(order.order_type)
    const elapsed = getElapsedTime(order.created_at)
    const isUpdated = updatedOrderIds.has(order.id)

    return (
      <div
        className={`p-2.5 rounded-lg cursor-pointer border hover:shadow-md relative overflow-hidden ${
          isUpdated
            ? `${isDark ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50'}`
            : `${classes.border} ${classes.card}`
        }`}
        onClick={() => {
          setSelectedOrder(order)
          fetchOrderItems(order.id)
        }}
      >
        {/* UPDATED corner ribbon */}
        {isUpdated && (
          <div className="absolute top-0 right-0 z-10">
            <div className="bg-orange-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-bl-lg shadow-md animate-pulse tracking-wide">
              UPDATED
            </div>
          </div>
        )}

        {/* Compact Header Row */}
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded flex items-center justify-center ${getOrderTypeColor(order.order_type)}`}>
              <OrderIcon className="w-3.5 h-3.5" />
            </div>
            <span className={`font-bold ${classes.textPrimary} text-sm`}>
              {order.daily_serial ? `${dailySerialManager.formatSerial(order.daily_serial)} ` : ''}#{order.order_number}
            </span>
            <span className={`text-xs px-1.5 py-0.5 rounded ${config.badge}`}>{order.order_status}</span>
          </div>
          <span className={`text-xs ${classes.textSecondary} ${isUpdated ? 'pr-10' : ''}`}>{elapsed}</span>
        </div>

        {/* Customer & Table Row */}
        <div className={`flex items-center gap-2 text-xs ${classes.textSecondary} mb-1.5`}>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${getOrderTypeColor(order.order_type)}`}>
            {order.order_type === 'takeaway' ? 'Takeaway' : order.order_type === 'delivery' ? 'Delivery' : 'Walk-in'}
          </span>
          <span className={`${classes.textPrimary} font-medium`}>
            {order.customers?.full_name || ''}
          </span>
          {order.order_type === 'walkin' && order.tables && (
            <>
              <span>•</span>
              <span className={`${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                {order.tables.table_name || `Table ${order.tables.table_number}`}
              </span>
            </>
          )}
        </div>

        {/* Order Items - List Format */}
        {order.order_items && order.order_items.length > 0 && (
          <div className={`p-2 rounded ${isDark ? 'bg-gray-800/50' : 'bg-gray-100'} mb-2`}>
            <div className="space-y-1">
              {order.order_items.slice(0, 6).map((item, index) => {
                let dealProducts = []
                if (item.is_deal && item.deal_products) {
                  try {
                    dealProducts = typeof item.deal_products === 'string'
                      ? JSON.parse(item.deal_products)
                      : item.deal_products
                  } catch (e) {}
                }
                return (
                  <div key={index}>
                    <div className={`text-xs ${classes.textPrimary} flex items-start`}>
                      <span className="font-bold text-green-600 dark:text-green-400 w-6 flex-shrink-0">{item.quantity}x</span>
                      <span className="flex-1">
                        {item.product_name || item.deal_name}
                        {item.is_deal && (
                          <span className={`ml-1 text-[9px] px-1 py-0.5 rounded ${isDark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-600'}`}>Deal</span>
                        )}
                        {!item.is_deal && item.variant_name && (
                          <span className={`${classes.textSecondary} text-[10px]`}> ({item.variant_name})</span>
                        )}
                      </span>
                    </div>
                    {item.is_deal && dealProducts.length > 0 && (
                      <div className={`ml-6 mt-0.5 pl-1.5 border-l-2 ${isDark ? 'border-purple-700' : 'border-purple-300'} space-y-0.5`}>
                        {dealProducts.map((dp, dpIndex) => (
                          <div key={dpIndex} className={`text-[10px] ${classes.textSecondary} flex gap-1`}>
                            <span className="font-medium">{dp.quantity}x {dp.name}</span>
                            {dp.variant && <span>— {dp.variant}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
              {order.order_items.length > 6 && (
                <div className={`text-xs ${classes.textSecondary} italic pl-6`}>+{order.order_items.length - 6} more items</div>
              )}
            </div>
          </div>
        )}

        {/* Action Buttons - Compact */}
        <div className="flex gap-1.5">
          <button
            onClick={(e) => printDocket(order, e)}
            className={`flex-1 py-1.5 rounded text-xs font-medium flex items-center justify-center gap-1 ${
              isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            Print
          </button>
          {config.nextStatus && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                updateOrderStatus(order.id, config.nextStatus)
              }}
              className={`flex-1 py-1.5 rounded text-xs font-medium ${
                isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
              }`}
            >
              {config.nextLabel}
            </button>
          )}
        </div>
      </div>
    )
  }

  // Status Column Component for Column View
  const StatusColumn = ({ title, icon: Icon, status, orders, config, onOrderClick, onStatusUpdate, onPrintDocket, classes, isDark, updatedIds, changesMap }) => {
    const updatedCount = updatedIds ? orders.filter(o => updatedIds.has(o.id)).length : 0

    return (
      <div className={`flex flex-col h-full rounded-xl ${classes.card} ${classes.border} border overflow-hidden`}>
        {/* Column Header */}
        <div className={`p-3 ${config.bg} ${config.border} border-b flex items-center justify-between`}>
          <div className="flex items-center space-x-2">
            <Icon className={`w-5 h-5 ${config.text}`} />
            <h3 className={`font-bold ${config.text}`}>{title}</h3>
            {updatedCount > 0 && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500 text-white animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                {updatedCount} modified
              </span>
            )}
          </div>
          <span className={`px-2 py-0.5 rounded-full text-sm font-bold ${config.badge}`}>
            {orders.length}
          </span>
        </div>

        {/* Orders List - Scrollable */}
        <div className="flex-1 overflow-y-auto p-2 space-y-2">
          {orders.length === 0 ? (
            <div className="text-center py-8">
              <Icon className={`w-8 h-8 mx-auto mb-2 ${classes.textSecondary} opacity-50`} />
              <p className={`text-sm ${classes.textSecondary}`}>No orders</p>
            </div>
          ) : (
            orders.map((order) => {
              const isUpdated = updatedIds && updatedIds.has(order.id)
              return (
              <div
                key={order.id}
                className={`rounded-xl cursor-pointer border hover:shadow-lg transition-shadow relative overflow-hidden ${
                  isUpdated
                    ? (isDark ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50')
                    : `${config.bg} ${config.border}`
                }`}
                onClick={() => onOrderClick(order)}
              >
                {/* UPDATED top banner */}
                {isUpdated && (
                  <div className="bg-orange-500 text-white text-[10px] font-bold px-3 py-1 flex items-center gap-1.5 animate-pulse">
                    <span className="w-1.5 h-1.5 rounded-full bg-white inline-block" />
                    ORDER MODIFIED
                  </div>
                )}

                <div className="p-2.5">
                  {/* Header: serial + order number + time */}
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`font-bold text-sm ${classes.textPrimary}`}>
                      {order.daily_serial ? `${dailySerialManager.formatSerial(order.daily_serial)} ` : ''}#{order.order_number}
                    </span>
                    <span className={`text-[11px] font-medium ${classes.textSecondary}`}>{getElapsedTime(order.created_at)}</span>
                  </div>

                  {/* Order type + customer */}
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide ${getOrderTypeColor(order.order_type)}`}>
                      {order.order_type === 'takeaway' ? 'Takeaway' : order.order_type === 'delivery' ? 'Delivery' : 'Walk-in'}
                    </span>
                    {order.customers?.full_name && (
                      <span className={`text-xs ${classes.textPrimary} font-medium`}>{order.customers.full_name}</span>
                    )}
                    {order.order_type === 'walkin' && order.tables && (
                      <span className={`text-xs font-semibold ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                        · {order.tables.table_name || `T${order.tables.table_number}`}
                      </span>
                    )}
                  </div>

                  {/* Order Items */}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className={`rounded-lg ${isDark ? 'bg-gray-900/40' : 'bg-white/70'} mb-2 divide-y ${isDark ? 'divide-gray-700/40' : 'divide-gray-100'}`}>
                      {order.order_items.slice(0, 6).map((item, index) => {
                        let dealProducts = []
                        if (item.is_deal && item.deal_products) {
                          try {
                            dealProducts = typeof item.deal_products === 'string'
                              ? JSON.parse(item.deal_products)
                              : item.deal_products
                          } catch (e) {}
                        }
                        return (
                          <div key={index} className="px-2 py-1.5">
                            <div className={`text-xs ${classes.textPrimary} flex items-start gap-1.5`}>
                              <span className={`font-extrabold text-sm leading-tight min-w-[22px] ${isDark ? 'text-green-400' : 'text-green-600'}`}>{item.quantity}x</span>
                              <div className="flex-1 min-w-0">
                                <span className="font-semibold leading-snug">
                                  {item.product_name || item.deal_name}
                                </span>
                                {item.is_deal && (
                                  <span className={`ml-1 text-[9px] px-1 py-0.5 rounded align-middle ${isDark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-600'}`}>Deal</span>
                                )}
                                {!item.is_deal && item.variant_name && (
                                  <span className={`ml-1 text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{item.variant_name}</span>
                                )}
                              </div>
                            </div>
                            {item.is_deal && dealProducts.length > 0 && (
                              <div className={`ml-8 mt-1 pl-2 border-l-2 ${isDark ? 'border-purple-700' : 'border-purple-300'} space-y-0.5`}>
                                {dealProducts.map((dp, dpIndex) => (
                                  <div key={dpIndex} className={`text-[10px] ${isDark ? 'text-gray-300' : 'text-gray-600'} flex gap-1`}>
                                    <span className="font-medium">{dp.quantity}x {dp.name}</span>
                                    {dp.variant && <span className={isDark ? 'text-gray-400' : 'text-gray-500'}>— {dp.variant}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {order.order_items.length > 6 && (
                        <div className={`px-2 py-1 text-xs ${classes.textSecondary} italic`}>+{order.order_items.length - 6} more items</div>
                      )}
                    </div>
                  )}

                  {/* Inline changes section — visible on card without clicking */}
                  {isUpdated && changesMap && changesMap[order.id] && changesMap[order.id].length > 0 && (
                    <div className={`rounded-lg mb-2 px-2 py-1.5 ${isDark ? 'bg-orange-900/30 border border-orange-700/40' : 'bg-orange-50 border border-orange-200'}`}>
                      <p className={`text-[9px] font-bold uppercase tracking-wide mb-1 ${isDark ? 'text-orange-300' : 'text-orange-600'}`}>Changes</p>
                      <div className="space-y-0.5">
                        {changesMap[order.id].map((c, i) => (
                          <div key={i} className={`text-[10px] font-medium flex items-center gap-1 flex-wrap ${
                            c.change_type === 'added' ? (isDark ? 'text-green-400' : 'text-green-600') :
                            c.change_type === 'removed' ? (isDark ? 'text-red-400' : 'text-red-600') :
                            (isDark ? 'text-orange-300' : 'text-orange-600')
                          }`}>
                            <span className="font-bold text-[11px] w-3 shrink-0">
                              {c.change_type === 'added' ? '+' : c.change_type === 'removed' ? '−' : '~'}
                            </span>
                            {c.change_type === 'added' && (
                              <span><span className="font-bold">{c.new_quantity}x</span> {c.product_name}{c.variant_name ? ` (${c.variant_name})` : ''}</span>
                            )}
                            {c.change_type === 'removed' && (
                              <span className="line-through opacity-80"><span className="font-bold">{c.old_quantity}x</span> {c.product_name}{c.variant_name ? ` (${c.variant_name})` : ''}</span>
                            )}
                            {c.change_type === 'quantity_changed' && (
                              <span>
                                {c.product_name}{c.variant_name ? ` (${c.variant_name})` : ''}{': '}
                                <span className="line-through opacity-70">{c.old_quantity}x</span>
                                {' → '}
                                <span className="font-bold">{c.new_quantity}x</span>
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex gap-1.5">
                    <button
                      onClick={(e) => onPrintDocket(order, e)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 ${
                        isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                      }`}
                    >
                      <Printer className="w-3 h-3" />
                      Print
                    </button>
                    {config.nextStatus && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          onStatusUpdate(order.id, config.nextStatus)
                        }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                          isDark ? 'bg-purple-600 hover:bg-purple-700 text-white' : 'bg-purple-500 hover:bg-purple-600 text-white'
                        }`}
                      >
                        {config.nextLabel}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )})
          )}
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${classes.background}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
          <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading kitchen display...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage permissionKey="KDS" pageName="Kitchen Display System">
      <div className={`min-h-screen ${classes.background}`}>
        {/* Hidden audio element for notifications */}
        <audio ref={audioRef} src="/notification.mp3" preload="auto" />

      {/* Top Bar - Compact Header */}
      <div className={`${classes.card} ${classes.border} border-b sticky top-0 z-50`}>
        {/* Header Row */}
        <div className="px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={() => router.push('/dashboard')}
              className={`p-2 rounded-lg ${classes.button} hover:shadow-md`}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div>
              <h1 className={`text-xl font-bold ${classes.textPrimary} flex items-center space-x-2`}>
                <ChefHat className="w-6 h-6 text-orange-500" />
                <span>Kitchen Display</span>
              </h1>
              <p className={`text-sm ${classes.textSecondary}`}>
                Today • {allOrders.length} orders
              </p>
            </div>
          </div>

          {/* Right Controls - Simplified */}
          <div className="flex items-center space-x-3">
            {/* Search */}
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${classes.textSecondary}`} />
              <input
                type="text"
                placeholder="Search orders..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`pl-10 pr-4 py-2 w-48 text-sm rounded-lg ${classes.border} border ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>

            {/* Sort Filter Button */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center space-x-2 ${classes.button} ${classes.textPrimary} hover:shadow-md`}
              title={sortOrder === 'desc' ? 'Currently: New to Old (Click for Old to New)' : 'Currently: Old to New (Click for New to Old)'}
            >
              <ArrowUpDown className="w-4 h-4" />
              <span>{sortOrder === 'desc' ? 'New to Old' : 'Old to New'}</span>
            </button>

            {/* View Mode Toggle */}
            <button
              onClick={() => setViewMode(viewMode === 'tabs' ? 'columns' : 'tabs')}
              className={`px-4 py-2 rounded-lg font-medium text-sm flex items-center space-x-2 ${
                viewMode === 'columns'
                  ? 'bg-purple-500 text-white'
                  : `${classes.button} ${classes.textPrimary}`
              } hover:shadow-md`}
              title={viewMode === 'tabs' ? 'Switch to Column View' : 'Switch to Tab View'}
            >
              {viewMode === 'tabs' ? <LayoutGrid className="w-4 h-4" /> : <List className="w-4 h-4" />}
              <span>{viewMode === 'tabs' ? 'Column View' : 'Tab View'}</span>
            </button>

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              className={`p-2 rounded-lg ${classes.button} hover:shadow-md`}
              title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
            >
              {theme === 'light' ? (
                <Moon className="w-5 h-5 text-gray-600" />
              ) : (
                <Sun className="w-5 h-5 text-yellow-400" />
              )}
            </button>
          </div>
        </div>

        {/* Status Tabs - Only show in tabs view mode */}
        {viewMode === 'tabs' && (
          <div className={`px-4 py-2 flex items-center space-x-2 border-t ${classes.border}`}>
            {statusTabs.map((tab) => {
              const TabIcon = tab.icon
              const isActive = statusFilter === tab.id
              // Get count for each tab
              const count = tab.id === 'All'
                ? allOrders.length
                : allOrders.filter(o => o.order_status === tab.id).length
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium text-sm ${
                    isActive
                      ? 'bg-purple-500 text-white shadow-md'
                      : `${classes.button} ${classes.textSecondary} hover:${classes.textPrimary}`
                  }`}
                >
                  <TabIcon className="w-4 h-4" />
                  <span>{tab.label}</span>
                  <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${
                    isActive ? 'bg-white/20' : isDark ? 'bg-gray-700' : 'bg-gray-200'
                  }`}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* Main Content */}
      {viewMode === 'tabs' ? (
        // Tab View - Single status at a time
        <div className="max-w-7xl mx-auto p-6">
          {filteredOrders.length === 0 ? (
            <div className="text-center py-20">
              <div className={`w-24 h-24 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'} flex items-center justify-center mx-auto mb-6`}>
                <ChefHat className={`w-12 h-12 ${classes.textSecondary}`} />
              </div>
              <h3 className={`text-2xl font-bold ${classes.textPrimary} mb-2`}>
                No Active Orders
              </h3>
              <p className={`${classes.textSecondary} text-lg`}>
                All orders are completed or no new orders yet
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredOrders.map((order) => (
                <OrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </div>
      ) : (
        // Column View - Full screen, all statuses side by side
        <div className="h-[calc(100vh-80px)] p-3">
          <div className="grid grid-cols-4 gap-3 h-full">
            {/* Placed (Pending) Column */}
            <StatusColumn
              title="Placed"
              icon={Clock}
              status="Pending"
              orders={ordersByStatus.Pending}
              config={getStatusConfig('Pending')}
              onOrderClick={(order) => {
                setSelectedOrder(order)
                fetchOrderItems(order.id)
              }}
              onStatusUpdate={updateOrderStatus}
              onPrintDocket={printDocket}
              classes={classes}
              isDark={isDark}
              updatedIds={updatedOrderIds}
              changesMap={orderChangesMap}
            />

            {/* Preparing Column */}
            <StatusColumn
              title="Preparing"
              icon={ChefHat}
              status="Preparing"
              orders={ordersByStatus.Preparing}
              config={getStatusConfig('Preparing')}
              onOrderClick={(order) => {
                setSelectedOrder(order)
                fetchOrderItems(order.id)
              }}
              onStatusUpdate={updateOrderStatus}
              onPrintDocket={printDocket}
              classes={classes}
              isDark={isDark}
              updatedIds={updatedOrderIds}
              changesMap={orderChangesMap}
            />

            {/* Ready Column */}
            <StatusColumn
              title="Ready"
              icon={Package}
              status="Ready"
              orders={ordersByStatus.Ready}
              config={getStatusConfig('Ready')}
              onOrderClick={(order) => {
                setSelectedOrder(order)
                fetchOrderItems(order.id)
              }}
              onStatusUpdate={updateOrderStatus}
              onPrintDocket={printDocket}
              classes={classes}
              isDark={isDark}
              updatedIds={updatedOrderIds}
              changesMap={orderChangesMap}
            />

            {/* Dispatched Column */}
            <StatusColumn
              title="Dispatched"
              icon={CheckCircle}
              status="Dispatched"
              orders={ordersByStatus.Dispatched}
              config={getStatusConfig('Dispatched')}
              onOrderClick={(order) => {
                setSelectedOrder(order)
                fetchOrderItems(order.id)
              }}
              onStatusUpdate={updateOrderStatus}
              onPrintDocket={printDocket}
              classes={classes}
              isDark={isDark}
              updatedIds={updatedOrderIds}
              changesMap={orderChangesMap}
            />
          </div>
        </div>
      )}

      {/* Order Detail Modal */}
      {selectedOrder && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => {
            setSelectedOrder(null)
            setOrderItems([])
            setSelectedOrderChanges(null)
          }}
        >
          <div
            className={`${classes.card} rounded-2xl ${classes.border} border-2 max-w-2xl w-full max-h-[95vh] overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
              {/* Modal Header */}
              <div className={`p-6 ${classes.border} border-b`}>
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <h2 className={`text-2xl font-bold ${classes.textPrimary}`}>
                        {selectedOrder.daily_serial ? `${dailySerialManager.formatSerial(selectedOrder.daily_serial)} - ` : ''}Order #{selectedOrder.order_number}
                      </h2>
                      {selectedOrderChanges && selectedOrderChanges.hasChanges && (
                        <span className="px-2 py-1 rounded-lg text-sm font-bold bg-orange-500 text-white animate-pulse">
                          ORDER UPDATED
                        </span>
                      )}
                    </div>
                    <p className={`text-sm ${classes.textSecondary}`}>
                      {new Date(selectedOrder.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedOrder(null)
                      setOrderItems([])
                      setSelectedOrderChanges(null)
                    }}
                    className={`p-2 rounded-lg ${classes.button}`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Customer Info */}
                {selectedOrder.customers && (
                  <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                    <div className={`font-semibold ${classes.textPrimary} mb-2`}>
                      {selectedOrder.customers.full_name}
                    </div>
                    {selectedOrder.customers.phone && (
                      <div className={`text-sm ${classes.textSecondary} flex items-center space-x-2`}>
                        <Phone className="w-4 h-4" />
                        <span>{selectedOrder.customers.phone}</span>
                      </div>
                    )}
                    {selectedOrder.delivery_address && (
                      <div className={`text-sm ${classes.textSecondary} flex items-center space-x-2 mt-1`}>
                        <MapPin className="w-4 h-4" />
                        <span>{selectedOrder.delivery_address}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Order Items */}
              <div className="p-4">
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-3`}>Order Items</h3>
                <div className={`rounded-xl ${isDark ? 'bg-gray-800' : 'bg-gray-100'} overflow-hidden`}>
                  {/* Table Header */}
                  <div className={`grid grid-cols-12 gap-2 px-3 py-2 text-xs font-semibold ${classes.textSecondary} ${isDark ? 'bg-gray-700' : 'bg-gray-200'}`}>
                    <div className="col-span-1">Qty</div>
                    <div className="col-span-7">Item</div>
                    <div className="col-span-4">Details</div>
                  </div>
                  {/* Table Rows */}
                  {orderItems.map((item, index) => {
                    let dealProducts = []
                    if (item.is_deal && item.deal_products) {
                      try {
                        dealProducts = typeof item.deal_products === 'string'
                          ? JSON.parse(item.deal_products)
                          : item.deal_products
                      } catch (e) {
                        console.error('Failed to parse deal_products:', e)
                      }
                    }
                    return (
                      <div
                        key={index}
                        className={`px-3 py-2.5 text-sm ${index !== orderItems.length - 1 ? `border-b ${classes.border}` : ''}`}
                      >
                        {/* Item row: Qty | Name | Details (variant + instructions) */}
                        <div className="grid grid-cols-12 gap-2 items-start">
                          <div className={`col-span-1 font-bold ${classes.textPrimary} pt-0.5`}>
                            {item.quantity}x
                          </div>
                          <div className={`col-span-7 ${classes.textPrimary} font-medium flex items-center gap-2`}>
                            {item.product_name || item.deal_name}
                            {item.is_deal && (
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${isDark ? 'bg-purple-900/60 text-purple-300' : 'bg-purple-100 text-purple-600'}`}>
                                Deal
                              </span>
                            )}
                          </div>
                          <div className="col-span-4 text-xs space-y-1">
                            {/* Variant / flavor */}
                            {!item.is_deal && (item.variant_name || item.flavor_name) && (
                              <div className={classes.textSecondary}>
                                {item.variant_name && <span className="mr-1">{item.variant_name}</span>}
                                {item.flavor_name && <span>{item.flavor_name}</span>}
                              </div>
                            )}
                            {/* Deal sub-products */}
                            {item.is_deal && dealProducts.length > 0 && (
                              <div className="space-y-0.5">
                                {dealProducts.map((dp, dpIndex) => (
                                  <div key={dpIndex} className={`flex items-start gap-1 ${classes.textPrimary}`}>
                                    <span className="font-bold text-green-600 dark:text-green-400">{dp.quantity}x</span>
                                    <span>{dp.name}{dp.variant && <span className={`${classes.textSecondary} ml-1`}>— {dp.variant}</span>}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                            {/* Item instructions */}
                            {item.item_instructions && (
                              <div className={`flex items-start gap-1 px-1.5 py-1 rounded font-medium ${isDark ? 'bg-orange-500/10 text-orange-400' : 'bg-orange-50 text-orange-600'}`}>
                                <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
                                <span>{item.item_instructions}</span>
                              </div>
                            )}
                            {/* Empty state */}
                            {!item.item_instructions && !item.variant_name && !item.flavor_name && !(item.is_deal && dealProducts.length > 0) && (
                              <span className={classes.textSecondary}>-</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* Order Changes Section - shown when order was modified in kitchen */}
                {selectedOrderChanges && selectedOrderChanges.hasChanges && (
                  <div className={`mt-4 rounded-xl p-4 ${isDark ? 'bg-orange-900/20 border border-orange-700' : 'bg-orange-50 border border-orange-300'}`}>
                    <h3 className={`text-sm font-bold mb-3 flex items-center gap-2 ${isDark ? 'text-orange-300' : 'text-orange-700'}`}>
                      <AlertTriangle className="w-4 h-4" />
                      Order Updated — Changes
                    </h3>
                    <div className="space-y-1.5">
                      {selectedOrderChanges.changes.map((change, idx) => {
                        const isAdded = change.change_type === 'added'
                        const isRemoved = change.change_type === 'removed'
                        const isModified = change.change_type === 'quantity_changed'
                        return (
                          <div key={idx} className={`text-xs flex items-start gap-2 ${
                            isAdded ? (isDark ? 'text-green-300' : 'text-green-700') :
                            isRemoved ? (isDark ? 'text-red-300' : 'text-red-700') :
                            (isDark ? 'text-yellow-300' : 'text-yellow-700')
                          }`}>
                            <span className="font-bold flex-shrink-0">
                              {isAdded ? '+ NEW' : isRemoved ? '– REM' : '~ QTY'}
                            </span>
                            <span className="flex-1">
                              {change.product_name}
                              {change.variant_name && ` (${change.variant_name})`}
                              {isModified && (
                                <span className="ml-1">
                                  — <span className="line-through opacity-60">{change.old_quantity}x</span>
                                  {' → '}<span className="font-bold">{change.new_quantity}x</span>
                                </span>
                              )}
                              {isAdded && <span className="ml-1 font-bold">{change.new_quantity}x</span>}
                              {isRemoved && <span className="ml-1 line-through opacity-60">{change.old_quantity}x</span>}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="mt-6 flex flex-wrap gap-3">
                  {/* Print Docket Button - Always show */}
                  <button
                    onClick={() => printDocket(selectedOrder)}
                    className={`px-6 py-3 rounded-xl font-semibold shadow-lg flex items-center ${
                      isDark
                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                        : 'bg-gray-200 hover:bg-gray-300 text-gray-800'
                    }`}
                  >
                    <Printer className="w-5 h-5 mr-2" />
                    Print Docket
                  </button>

                  {/* Status Action Button - Only show if there's a next status */}
                  {getStatusConfig(selectedOrder.order_status).nextStatus && (
                    <button
                      onClick={() => updateOrderStatus(selectedOrder.id, getStatusConfig(selectedOrder.order_status).nextStatus)}
                      className="flex-1 py-3 rounded-xl bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold shadow-lg"
                    >
                      <Check className="w-5 h-5 inline mr-2" />
                      {getStatusConfig(selectedOrder.order_status).nextLabel}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}


      {/* Notification System */}
      <NotificationSystem />
      </div>
    </ProtectedPage>
  )
}
