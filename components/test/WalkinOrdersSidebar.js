'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { Coffee, RefreshCw, ArrowLeft, Table2, ClipboardList, X, Truck, AlertCircle, User, ShoppingBag, Layers, LayoutList, ChevronDown, ChevronRight } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { cacheManager } from '../../lib/cacheManager'
import dailySerialManager from '../../lib/utils/dailySerialManager'
import { getBusinessDate } from '../../lib/utils/businessDayUtils'

export default function WalkinOrdersSidebar({
  onOrderSelect,
  onClose,
  classes,
  isDark,
  selectedOrderId,
  onTableClick,
  selectedTable,
  onBackClick,
  orderType = 'walkin',
  refreshTrigger = 0,
  showTypeTabs = false,
  categories = [],
  menus = [],
  allProducts = [],
  deals = [],
  onCategoryClick,
  onDealsClick,
  onOrdersLoaded, // optional: called with fresh orders after each fetch
  onTypeTabChange, // optional: called when sidebar type tab changes (for syncing with parent)
}) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(!showTypeTabs)
  const [refreshing, setRefreshing] = useState(false)
  const [showOrders, setShowOrders] = useState(false)
  const [isGrouped, setIsGrouped] = useState(menus.length > 0)
  const [collapsedMenus, setCollapsedMenus] = useState({})

  const toggleMenuCollapse = (menuId) => {
    setCollapsedMenus(prev => ({ ...prev, [menuId]: !prev[menuId] }))
  }
  const listRef = useRef(null)
  const [activeTypeTab, setActiveTypeTab] = useState(orderType)
  const effectiveOrderType = showTypeTabs ? activeTypeTab : orderType

  // Sync internal tab when the parent changes activeOrderType (e.g. via the product grid tab bar)
  useEffect(() => {
    if (showTypeTabs && activeTypeTab !== orderType) {
      setActiveTypeTab(orderType) // triggers re-render → effectiveOrderType updates → next effect fetches
    }
  }, [orderType, showTypeTabs])

  // Re-fetch when effectiveOrderType changes AND the orders panel is open
  useEffect(() => {
    if (showTypeTabs && showOrders) {
      setLoading(true)
      fetchPendingOrders()
    }
  }, [effectiveOrderType])

  const TYPE_TABS = [
    { id: 'walkin', label: 'Walk-in', icon: User, gradient: 'from-purple-500 to-indigo-600' },
    { id: 'takeaway', label: 'Take Away', icon: ShoppingBag, gradient: 'from-orange-500 to-amber-500' },
    { id: 'delivery', label: 'Delivery', icon: Truck, gradient: 'from-emerald-500 to-teal-600' },
  ]

  // Fast scroll — multiply wheel delta so the list scrolls further per notch
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    const onWheel = (e) => {
      if (e.deltaY === 0) return
      e.preventDefault()
      el.scrollTop += e.deltaY * 2.5
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  useEffect(() => {
    // 🆕 CRITICAL FIX: Listen for order updates from cache
    const handleOrdersUpdated = (event) => {
      console.log('📡 [WalkinOrdersSidebar] Orders updated event received:', event.detail)
      // Only refresh if orders panel is open and order type matches
      if (showOrders && event.detail?.orderType === effectiveOrderType) {
        console.log('🔄 [WalkinOrdersSidebar] Auto-refreshing orders due to cache update')
        fetchPendingOrders()
      }
    }

    window.addEventListener('ordersUpdated', handleOrdersUpdated)

    return () => {
      window.removeEventListener('ordersUpdated', handleOrdersUpdated)
    }
  }, [effectiveOrderType])

  // On classic pages (showTypeTabs=false), auto-fetch orders on mount like before
  useEffect(() => {
    if (!showTypeTabs) {
      fetchPendingOrders()
    }
  }, [])

  // Refresh orders when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0) {
      fetchPendingOrders()
    }
  }, [refreshTrigger])

  // Realtime subscription — update list instantly when any order changes in DB
  useEffect(() => {
    if (!navigator.onLine) return
    const user = authManager.getCurrentUser()
    if (!user) return

    let debounceTimer = null
    const debouncedFetch = () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => fetchPendingOrders(), 400)
    }

    const channel = supabase
      .channel(`orders-realtime-${effectiveOrderType}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'orders',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        const orderType = payload.new?.order_type || payload.old?.order_type
        if (!orderType || orderType === effectiveOrderType) {
          debouncedFetch()
        }
      })
      .subscribe()

    return () => {
      clearTimeout(debounceTimer)
      supabase.removeChannel(channel)
    }
  }, [effectiveOrderType])

  const fetchPendingOrders = async () => {
    try {
      setRefreshing(true)
      const user = authManager.getCurrentUser()
      if (!user) return

      // Check if online - use both navigator.onLine and cacheManager for reliability
      const isOnline = navigator.onLine && cacheManager.isOnline
      console.log(`📡 [WalkinOrdersSidebar] Fetching orders - Online: ${isOnline}`)

      if (isOnline) {
        // Fetch from Supabase when online - include order_items for offline compatibility
        const { data, error} = await supabase
          .from('orders')
          .select(`
            *,
            customers (
              id,
              full_name,
              phone
            ),
            tables (
              id,
              table_number,
              table_name
            ),
            delivery_boys (
              id,
              name,
              phone,
              vehicle_type
            ),
            cashiers!orders_cashier_id_fkey (
              id,
              name
            ),
            users (
              id,
              customer_name
            ),
            order_items (
              id,
              product_id,
              variant_id,
              product_name,
              variant_name,
              base_price,
              variant_price,
              final_price,
              quantity,
              total_price,
              is_deal,
              deal_id,
              deal_products
            )
          `)
          .eq('user_id', user.id)
          .eq('order_type', effectiveOrderType)
          .in('order_status', ['Pending', 'Preparing', 'Ready', 'Dispatched'])
          .order('created_at', { ascending: false })

        if (error) throw error

        // Also store items as 'items' property for consistency with cache
        const ordersWithItems = (data || []).map(order => ({
          ...order,
          items: order.order_items || []
        }))

        // Fetch payment transactions for split payment orders
        const splitOrders = ordersWithItems.filter(order => order.payment_method === 'Split')
        if (splitOrders.length > 0) {
          console.log(`💳 [WalkinOrdersSidebar] Fetching payment transactions for ${splitOrders.length} split orders`)

          const splitOrderIds = splitOrders.map(o => o.id)
          const { data: transactions, error: txError } = await supabase
            .from('order_payment_transactions')
            .select('*')
            .in('order_id', splitOrderIds)
            .order('created_at', { ascending: true })

          if (!txError && transactions) {
            // Cache transactions for offline use - set them in the Map WITHOUT saving yet
            const txByOrder = transactions.reduce((acc, tx) => {
              if (!acc[tx.order_id]) acc[tx.order_id] = []
              acc[tx.order_id].push(tx)
              return acc
            }, {})

            // Set all transactions in cache Map (without calling save each time)
            splitOrders.forEach(order => {
              const orderTx = txByOrder[order.id] || []
              if (orderTx.length > 0) {
                // Directly set in Map without saving
                cacheManager.cache.paymentTransactions.set(order.id, orderTx)
                console.log(`💾 [WalkinOrdersSidebar] Prepared ${orderTx.length} transactions for order ${order.id}`)
              }
            })

            console.log(`✅ [WalkinOrdersSidebar] Prepared payment transactions for ${Object.keys(txByOrder).length} split orders`)
          } else if (txError) {
            console.error('❌ [WalkinOrdersSidebar] Error fetching payment transactions:', txError)
          }
        }

        // Enrich with daily serial numbers
        const ordersWithSerials = cacheManager.enrichOrdersWithSerials(ordersWithItems)

        // IMPORTANT: Update cache with fetched orders so they're available offline
        // Only update orders that match our filter criteria (Pending/Preparing/Ready)
        const existingCachedOrders = cacheManager.getAllOrders()
        const fetchedOrderNumbers = new Set(ordersWithSerials.map(o => o.order_number))

        // Smart cache update strategy:
        // 1. Keep truly offline orders (not synced yet) - these are new orders created offline
        // 2. Remove any previously cached orders that match this order type but aren't in the fetch
        //    (they've likely been completed/cancelled and filtered out by the query)
        // 3. Add/update with freshly fetched orders
        const offlineOrders = existingCachedOrders.filter(o => !o._isSynced)
        const otherTypeOrders = existingCachedOrders.filter(o =>
          o._isSynced && o.order_type !== effectiveOrderType
        )

        const updatedCache = [
          ...offlineOrders,
          ...otherTypeOrders,
          ...ordersWithSerials.map(o => ({ ...o, _isSynced: true, _isOffline: false }))
        ]

        console.log(`🧹 [WalkinOrdersSidebar] Cache cleanup:`)
        console.log(`  - Kept ${offlineOrders.length} offline orders`)
        console.log(`  - Kept ${otherTypeOrders.length} orders of other types`)
        console.log(`  - Added ${ordersWithSerials.length} fresh ${orderType} orders`)
        console.log(`  - Total: ${existingCachedOrders.length} → ${updatedCache.length} orders`)

        // Update the cache manually (since we're not using createOrder)
        cacheManager.cache.orders = updatedCache

        // Save everything (orders + payment transactions) to localStorage in one go
        await cacheManager.saveCacheToStorage()
        console.log(`💾 [WalkinOrdersSidebar] Saved ${ordersWithSerials.length} orders + ${cacheManager.cache.paymentTransactions.size} payment transaction entries to cache`)
        console.log(`📊 [WalkinOrdersSidebar] Cache now has ${cacheManager.cache.paymentTransactions.size} orders with payment transactions`)

        setOrders(ordersWithSerials)
        onOrdersLoaded?.(ordersWithSerials)
        console.log(`📦 [Orders] Loaded ${data?.length || 0} ${orderType} orders from Supabase`)
      } else {
        // Use cached orders when offline
        console.log(`📴 [WalkinOrdersSidebar] OFFLINE MODE - Loading from cache`)
        const cachedOrders = cacheManager.getAllOrders()
        console.log(`📦 [WalkinOrdersSidebar] Cache has ${cachedOrders.length} total orders`)
        console.log(`💳 [WalkinOrdersSidebar] Cache has ${cacheManager.cache.paymentTransactions.size} orders with payment transactions`)

        const filteredOrders = cachedOrders.filter(order =>
          order.order_type === effectiveOrderType &&
          ['Pending', 'Preparing', 'Ready', 'Dispatched'].includes(order.order_status)
        )
        console.log(`✅ [WalkinOrdersSidebar] Filtered to ${filteredOrders.length} ${effectiveOrderType} pending orders`)

        // Get table info from cache for walkin orders
        if (effectiveOrderType === 'walkin') {
          const tables = cacheManager.getAllTables()
          filteredOrders.forEach(order => {
            if (order.table_id) {
              const table = tables.find(t => t.id === order.table_id)
              if (table) {
                order.tables = {
                  id: table.id,
                  table_number: table.table_number,
                  table_name: table.table_name
                }
              }
            }
          })
        }

        // Get delivery boy info from cache for delivery orders
        if (effectiveOrderType === 'delivery') {
          const deliveryBoys = cacheManager.getAllDeliveryBoys()
          filteredOrders.forEach(order => {
            if (order.delivery_boy_id) {
              const rider = deliveryBoys.find(r => r.id === order.delivery_boy_id)
              if (rider) {
                order.delivery_boys = {
                  id: rider.id,
                  name: rider.name,
                  phone: rider.phone,
                  vehicle_type: rider.vehicle_type
                }
              }
            }
          })
        }

        // Ensure order items are accessible (cached orders may have items or order_items)
        filteredOrders.forEach(order => {
          if (!order.items && order.order_items) {
            order.items = order.order_items
          }
          if (!order.order_items && order.items) {
            order.order_items = order.items
          }
        })

        // Enrich with daily serial numbers (cached orders already have daily_serial if created today)
        const ordersWithSerials = cacheManager.enrichOrdersWithSerials(filteredOrders)
        setOrders(ordersWithSerials)
        onOrdersLoaded?.(ordersWithSerials)
        console.log(`📦 [Orders] Loaded ${filteredOrders.length} ${orderType} orders from cache (offline)`)
      }
    } catch (error) {
      console.error('Error fetching pending orders:', error)

      // Fallback to cached orders on error
      const cachedOrders = cacheManager.getAllOrders()
      const filteredOrders = cachedOrders.filter(order =>
        order.order_type === effectiveOrderType &&
        ['Pending', 'Preparing', 'Ready'].includes(order.order_status)
      )

      // Ensure order items are accessible
      filteredOrders.forEach(order => {
        if (!order.items && order.order_items) {
          order.items = order.order_items
        }
        if (!order.order_items && order.items) {
          order.order_items = order.items
        }
      })

      const ordersWithSerials = cacheManager.enrichOrdersWithSerials(filteredOrders)
      setOrders(ordersWithSerials)
      console.log(`📦 [Orders] Fallback to ${filteredOrders.length} cached orders due to error`)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending':
        return isDark
          ? 'bg-yellow-900/30 text-yellow-400 border border-yellow-700'
          : 'bg-yellow-100 text-yellow-700 border border-yellow-300'
      case 'Preparing':
        return isDark
          ? 'bg-blue-900/30 text-blue-400 border border-blue-700'
          : 'bg-blue-100 text-blue-700 border border-blue-300'
      case 'Ready':
        return isDark
          ? 'bg-purple-900/30 text-purple-400 border border-purple-700'
          : 'bg-purple-100 text-purple-700 border border-purple-300'
      default:
        return isDark
          ? 'bg-gray-700 text-gray-300'
          : 'bg-gray-100 text-gray-600'
    }
  }

  const formatTime = (timeString) => {
    if (!timeString) return ''
    const [hours, minutes] = timeString.split(':')
    const date = new Date()
    date.setHours(parseInt(hours), parseInt(minutes))
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  }

  const formatOrderNumber = (orderNumber) => {
    if (!orderNumber) return ''
    return `#${orderNumber.slice(-9)}`
  }

  const formatOrderDisplay = (order) => {
    if (!order || !order.order_number) return ''

    const formattedOrderNumber = formatOrderNumber(order.order_number)

    // Check if today's order using business date (respects business-end-time cutoff)
    const { startTime, endTime } = dailySerialManager.getBusinessHours()
    const todayBusiness = dailySerialManager.getTodayDate()
    const orderBusinessDate = order.created_at
      ? getBusinessDate(order.created_at, startTime, endTime)
      : order.order_date || null
    const isToday = orderBusinessDate === todayBusiness

    // Get serial: prefer pre-enriched value, fall back to localStorage lookup for today's orders
    const serial = order.daily_serial || (isToday ? dailySerialManager.getOrCreateSerial(order.order_number) : null)

    if (serial) {
      const formattedSerial = dailySerialManager.formatSerial(serial)
      return `${formattedSerial} ${formattedOrderNumber}`
    }

    // For old orders, just show order number
    return formattedOrderNumber
  }

  return (
    <div className={`w-64 h-full ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-r flex flex-col`}>
      {/* Header - Same as CategorySidebar */}
      <div className={`px-2 py-2 ${classes.border} border-b ${classes.card}`}>
        <motion.button
          whileHover={{ x: -2 }}
          whileTap={{ scale: 0.98 }}
          onClick={onBackClick}
          className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors mb-1.5 group`}
        >
          <div className={`w-8 h-8 rounded-full ${classes.button} group-hover:${classes.shadow} group-hover:shadow-sm flex items-center justify-center mr-3 transition-colors`}>
            <ArrowLeft className="w-4 h-4" />
          </div>
          <span className="font-medium text-sm">Back to Dashboard</span>
        </motion.button>

        <div className="flex items-center justify-between mb-0">
          <div>
            <h2 className={`text-xl font-bold ${classes.textPrimary}`}>
              New Order
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {/* Orders Icon - toggles orders panel on new-order page */}
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                if (showTypeTabs) {
                  const next = !showOrders
                  setShowOrders(next)
                  if (next) { setLoading(true); fetchPendingOrders() }
                  else { onClose?.() } // closing panel → also close any open order details in parent
                } else {
                  onClose()
                }
              }}
              className={`p-2.5 rounded-lg transition-all relative ${
                showTypeTabs
                  ? showOrders
                    ? (isDark ? 'bg-blue-600/30 border border-blue-500' : 'bg-blue-100 border border-blue-400')
                    : (isDark ? 'bg-gray-700 border border-gray-600 hover:bg-gray-600' : 'bg-gray-100 border border-gray-200 hover:bg-gray-200')
                  : (isDark ? 'bg-blue-600/30 border border-blue-500' : 'bg-blue-100 border border-blue-400')
              }`}
              title="View pending orders"
            >
              <ClipboardList className={`w-5 h-5 ${
                showOrders || !showTypeTabs
                  ? (isDark ? 'text-blue-400' : 'text-blue-600')
                  : (isDark ? 'text-gray-400' : 'text-gray-500')
              }`} />
            </motion.button>

            {/* Table Selection Icon - Only for walkin */}
            {orderType === 'walkin' && onTableClick && (
              <motion.button
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.95 }}
                onClick={onTableClick}
                className={`p-2.5 rounded-lg transition-all relative ${
                  selectedTable
                    ? (isDark ? 'bg-green-600/30 border border-green-500' : 'bg-green-100 border border-green-400')
                    : (isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200')
                }`}
                title={selectedTable ? `Table: ${selectedTable.table_name || selectedTable.table_number}` : 'Select Table'}
              >
                <Table2 className={`w-5 h-5 ${selectedTable ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-300' : 'text-gray-600')}`} />
                {selectedTable && (
                  <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-white dark:border-gray-800 shadow-sm"></div>
                )}
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* Type Tab Bar — only visible when orders panel is open */}
      {showTypeTabs && showOrders && (
        <div className={`px-3 py-2.5 ${classes.border} border-b`}>
          <div className={`flex rounded-xl overflow-hidden border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
            {TYPE_TABS.map((tab, i) => {
              const isActive = activeTypeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTypeTab(tab.id) // triggers effectiveOrderType change → useEffect fetches
                    onTypeTabChange?.(tab.id) // sync parent's activeOrderType
                  }}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 px-1 text-[11px] font-semibold transition-all duration-200 ${
                    i !== 0 ? (isDark ? 'border-l border-gray-600' : 'border-l border-gray-200') : ''
                  } ${
                    isActive
                      ? `bg-gradient-to-b ${tab.gradient} text-white`
                      : isDark
                        ? 'bg-gray-700/50 text-gray-400 hover:bg-gray-700'
                        : 'bg-gray-50 text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  <tab.icon className="w-3 h-3" />
                  <span className="leading-tight text-center">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {(!showTypeTabs || showOrders) ? (
        <>
      {/* Orders Section Header */}
      <div className="p-3 pb-0">
        <div className="flex items-center justify-between mb-3">
          <h3 className={`text-xs font-semibold ${classes.textSecondary} uppercase tracking-wider`}>
            Active Orders
          </h3>
          <div className="flex items-center gap-1.5">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={fetchPendingOrders}
              disabled={refreshing}
              className={`p-1.5 rounded-md transition-all ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'}`}
              title="Refresh orders"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''} ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => showTypeTabs ? setShowOrders(false) : onClose?.()}
              className={`p-1.5 rounded-md transition-all ${isDark ? 'bg-red-900/40 hover:bg-red-900/60' : 'bg-red-50 hover:bg-red-100'}`}
              title="Close orders view"
            >
              <X className={`w-3.5 h-3.5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div ref={listRef} className="flex-1 overflow-y-scroll p-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        {loading ? (
          // Loading skeletons
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`p-3 rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'} animate-pulse`}>
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full ${isDark ? 'bg-gray-600' : 'bg-gray-200'} mr-2`}></div>
                    <div>
                      <div className={`h-4 w-24 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded mb-1`}></div>
                      <div className={`h-3 w-16 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded`}></div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`h-4 w-14 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded mb-1`}></div>
                    <div className={`h-3 w-10 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded`}></div>
                  </div>
                </div>
                <div className="flex justify-between items-center">
                  <div className={`h-3 w-20 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded`}></div>
                  <div className={`h-5 w-16 ${isDark ? 'bg-gray-600' : 'bg-gray-200'} rounded-full`}></div>
                </div>
              </div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          // Empty state
          <div className="text-center py-8">
            <div className={`w-16 h-16 ${isDark ? 'bg-gray-700' : 'bg-gray-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
              <Coffee className={`w-8 h-8 ${classes.textSecondary}`} />
            </div>
            <p className={`${classes.textSecondary} text-sm`}>No active orders</p>
          </div>
        ) : (
          // Orders list
          <div className="space-y-2">
            {orders.map((order) => (
              <motion.button
                key={order.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onOrderSelect(order)}
                className={`w-full text-left p-3 rounded-lg transition-all duration-200 ${
                  selectedOrderId === order.id
                    ? isDark
                      ? 'bg-green-900/30 border border-green-700'
                      : 'bg-green-50 border border-green-300'
                    : isDark
                      ? 'bg-gray-700/50 hover:bg-gray-700'
                      : 'bg-gray-50 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center">
                    <div className={`w-8 h-8 rounded-full ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'} flex items-center justify-center mr-2`}>
                      <Coffee className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                    </div>
                    <div>
                      <div className={`font-semibold ${classes.textPrimary} text-sm`}>
                        {formatOrderDisplay(order)}
                      </div>
                      <div className={`text-xs ${classes.textSecondary}`}>
                        {effectiveOrderType === 'walkin' ? 'Walkin' : effectiveOrderType === 'takeaway' ? 'Takeaway' : 'Delivery'}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${isDark ? 'text-green-400' : 'text-green-600'} text-sm`}>
                      Rs {order.total_amount}
                    </div>
                    <div className={`text-xs ${classes.textSecondary}`}>
                      {formatTime(order.order_time)}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center gap-1">
                  <div className={`text-xs ${classes.textSecondary} truncate max-w-[80px]`}>
                    {order.customers?.full_name || 'Walk-in Customer'}
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${getStatusColor(order.order_status)}`}>
                      {order.order_status}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                      order.payment_status === 'Paid'
                        ? isDark ? 'bg-green-900/40 text-green-400' : 'bg-green-100 text-green-700'
                        : isDark ? 'bg-orange-900/40 text-orange-400' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {order.payment_status === 'Paid' ? 'Paid' : 'Unpaid'}
                    </span>
                  </div>
                </div>

                {/* Show table info for walkin orders */}
                {effectiveOrderType === 'walkin' && order.tables && (
                  <div className={`flex items-center gap-1 mt-1.5 pt-1.5 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                    <Table2 className={`w-3 h-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                    <span className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'} font-medium`}>
                      {order.tables.table_name || `Table ${order.tables.table_number}`}
                    </span>
                  </div>
                )}

                {/* Show rider info for delivery orders */}
                {effectiveOrderType === 'delivery' && (
                  <div className={`flex items-center gap-1 mt-1.5 pt-1.5 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                    {order.delivery_boys ? (
                      <>
                        <Truck className={`w-3 h-3 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                        <span className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'} font-medium`}>
                          {order.delivery_boys.name}
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className={`w-3 h-3 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                        <span className={`text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'} font-medium`}>
                          No rider assigned
                        </span>
                      </>
                    )}
                  </div>
                )}

                {/* Show cashier/admin info */}
                <div className={`flex items-center gap-1 mt-1.5 pt-1.5 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                  <User className={`w-3 h-3 ${isDark ? 'text-gray-400' : 'text-gray-600'}`} />
                  <span className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-600'} font-medium`}>
                    {order.cashier_id
                      ? (order.cashiers?.name || 'Cashier')
                      : (order.users?.customer_name || 'Admin')}
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        )}
      </div>
        </>
      ) : (
        /* Product categories list */
        <div ref={listRef} className="flex-1 overflow-y-scroll p-3" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          <div className="flex items-center justify-between mb-2 px-1">
            <p className={`text-xs font-semibold uppercase tracking-wider ${classes.textSecondary}`}>
              Categories
            </p>
            {menus.length > 0 && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={() => setIsGrouped(g => !g)}
                title={isGrouped ? 'Ungroup categories' : 'Group by menu'}
                className={`p-1 rounded transition-colors ${
                  isGrouped
                    ? (isDark ? 'text-green-400 bg-green-900/30' : 'text-green-600 bg-green-100')
                    : (isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600')
                }`}
              >
                {isGrouped ? <Layers className="w-3.5 h-3.5" /> : <LayoutList className="w-3.5 h-3.5" />}
              </motion.button>
            )}
          </div>

          {(() => {
            const renderCatBtn = (cat) => {
              const count = allProducts.filter(p => p.category_id === cat.id).length
              return (
                <motion.button
                  key={cat.id}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => onCategoryClick?.(cat.id)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-150 ${
                    isDark ? 'bg-gray-700/60 hover:bg-gray-700' : 'bg-gray-100 hover:bg-gray-200'
                  }`}
                >
                  <div className="w-12 h-12 rounded-lg overflow-hidden flex-shrink-0">
                    {cat.image_url ? (
                      <img
                        src={cacheManager.getImageUrl(cat.image_url)}
                        alt={cat.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className={`w-full h-full flex items-center justify-center ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`}>
                        <Coffee className={`w-5 h-5 ${classes.textSecondary}`} />
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className={`font-semibold text-sm truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                      {cat.name}
                    </div>
                    <div className={`text-xs ${classes.textSecondary}`}>{count} item{count !== 1 ? 's' : ''}</div>
                  </div>
                </motion.button>
              )
            }

            if (isGrouped && menus.length > 0) {
              const menuMap = {}
              menus.forEach(m => { menuMap[m.id] = m })
              const grouped = menus.map(menu => ({
                menu,
                cats: categories.filter(c => c.menu_id === menu.id)
              })).filter(g => g.cats.length > 0)
              const unassigned = categories.filter(c => !c.menu_id || !menuMap[c.menu_id])

              const renderMenuGroup = (id, label, cats, labelClass) => {
                const collapsed = collapsedMenus[id]
                return (
                  <div key={id}>
                    <button
                      onClick={() => toggleMenuCollapse(id)}
                      className="w-full flex items-center justify-between px-1 mb-1.5"
                    >
                      <span className={`text-xs font-bold uppercase tracking-wider ${labelClass}`}>{label}</span>
                      {collapsed
                        ? <ChevronRight className={`w-3.5 h-3.5 ${labelClass}`} />
                        : <ChevronDown className={`w-3.5 h-3.5 ${labelClass}`} />
                      }
                    </button>
                    {!collapsed && <div className="space-y-2">{cats.map(renderCatBtn)}</div>}
                  </div>
                )
              }

              return (
                <div className="space-y-3">
                  {grouped.map(({ menu, cats }) =>
                    renderMenuGroup(menu.id, menu.name, cats, isDark ? 'text-green-400' : 'text-green-700')
                  )}
                  {unassigned.length > 0 &&
                    renderMenuGroup('__other__', grouped.length > 0 ? 'Other' : 'Categories', unassigned, classes.textSecondary)
                  }
                </div>
              )
            }

            return <div className="space-y-2">{categories.map(renderCatBtn)}</div>
          })()}

          {deals?.length > 0 && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onDealsClick?.()}
              className={`w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all duration-150 mt-2 ${
                isDark ? 'bg-yellow-900/30 hover:bg-yellow-900/50' : 'bg-yellow-50 hover:bg-yellow-100'
              }`}
            >
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center flex-shrink-0">
                <span className="text-xl">🎁</span>
              </div>
              <div className="min-w-0">
                <div className={`font-semibold text-sm ${isDark ? 'text-yellow-300' : 'text-yellow-700'}`}>Special Deals</div>
                <div className={`text-xs ${classes.textSecondary}`}>{deals.length} deal{deals.length !== 1 ? 's' : ''}</div>
              </div>
            </motion.button>
          )}

          {categories.length === 0 && (
            <p className={`text-xs text-center py-8 ${classes.textSecondary}`}>No categories yet</p>
          )}
        </div>
      )}
    </div>
  )
}
