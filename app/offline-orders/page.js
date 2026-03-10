'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Database,
  ArrowLeft,
  RefreshCw,
  CloudUpload,
  Trash2,
  CheckCircle,
  AlertCircle,
  Wifi,
  WifiOff,
  Sun,
  Moon
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { cacheManager } from '../../lib/cacheManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'

export default function OfflineOrdersPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [offlineOrders, setOfflineOrders] = useState([])
  const [syncingOrderId, setSyncingOrderId] = useState(null)
  const [isOnline, setIsOnline] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    // Check authentication
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    setUser(userData)

    // Initialize theme
    const savedTheme = themeManager.getTheme()
    setTheme(savedTheme)

    // Load offline orders
    loadOfflineOrders()

    // Check network status
    updateNetworkStatus()

    // Listen for online/offline events
    const handleOnline = () => updateNetworkStatus()
    const handleOffline = () => updateNetworkStatus()

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Auto-refresh every 5 seconds
    const interval = setInterval(() => {
      loadOfflineOrders()
      updateNetworkStatus()
    }, 5000)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(interval)
    }
  }, [router])

  const loadOfflineOrders = () => {
    const orders = cacheManager.getOfflineOrders()
    setOfflineOrders(orders)
  }

  const updateNetworkStatus = () => {
    const status = cacheManager.getNetworkStatus()
    setIsOnline(status.isOnline)
    setIsSyncing(status.isSyncing)
  }

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark'
    themeManager.setTheme(newTheme)
    setTheme(newTheme)
  }

  const handleSyncSingleOrder = async (orderId) => {
    if (!isOnline) {
      alert('Cannot sync: Device is offline')
      return
    }

    try {
      setSyncingOrderId(orderId)
      console.log(`🔄 Syncing order: ${orderId}`)

      const result = await cacheManager.syncSingleOrder(orderId)

      if (result.success) {
        console.log(`✅ Order synced successfully: ${orderId}`)
      } else {
        console.error(`❌ Sync failed for order ${orderId}:`, result.error)
        alert(`Sync failed: ${result.error}`)
      }

      // Reload offline orders
      loadOfflineOrders()
      updateNetworkStatus()
    } catch (error) {
      console.error(`❌ Error syncing order ${orderId}:`, error)
      alert(`Error syncing order: ${error.message}`)
    } finally {
      setSyncingOrderId(null)
    }
  }

  const handleDeleteOfflineOrder = async (orderId) => {
    if (!confirm('Are you sure you want to delete this offline order? This action cannot be undone.')) {
      return
    }

    try {
      const result = await cacheManager.deleteOfflineOrder(orderId)

      if (result.success) {
        console.log(`✅ Order deleted: ${orderId}`)
        loadOfflineOrders()
        updateNetworkStatus()
      } else {
        console.error(`❌ Delete failed for order ${orderId}:`, result.error)
        alert(`Failed to delete order: ${result.error}`)
      }
    } catch (error) {
      console.error(`❌ Error deleting order ${orderId}:`, error)
      alert(`Error deleting order: ${error.message}`)
    }
  }

  const handleSyncAllOrders = async () => {
    if (!isOnline) {
      alert('Cannot sync: Device is offline')
      return
    }

    try {
      setIsSyncing(true)
      console.log('🔄 Syncing all offline orders...')

      const result = await cacheManager.syncOfflineData()
      console.log('📊 Sync result:', result)

      // Reload offline orders
      loadOfflineOrders()
      updateNetworkStatus()

      if (result.success) {
        alert(`Successfully synced ${result.syncedCount || 0} order(s)`)
      } else {
        alert(`Sync completed with errors: ${result.error}`)
      }
    } catch (error) {
      console.error('❌ Error syncing all orders:', error)
      alert(`Error syncing orders: ${error.message}`)
    } finally {
      setIsSyncing(false)
    }
  }

  const isDark = theme === 'dark'

  const themeClasses = {
    bg: isDark ? 'bg-gray-900' : 'bg-gray-50',
    card: isDark ? 'bg-gray-800' : 'bg-white',
    textPrimary: isDark ? 'text-white' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
    border: isDark ? 'border-gray-700' : 'border-gray-200',
    button: isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200',
    shadow: isDark ? 'shadow-lg shadow-black/20' : 'shadow-lg'
  }

  return (
    <ProtectedPage permissionKey="OFFLINE_ORDERS" pageName="Offline Orders">
      <div className={`min-h-screen ${themeClasses.bg} transition-colors duration-200`}>
        {/* Header */}
        <div className={`${themeClasses.card} ${themeClasses.shadow} sticky top-0 z-40 border-b ${themeClasses.border}`}>
          <div className="max-w-7xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              {/* Left: Back Button */}
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/dashboard')}
                className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-gray-500 to-gray-600 hover:from-gray-600 hover:to-gray-700 text-white font-semibold transition-all"
              >
                <ArrowLeft className="w-5 h-5" />
                <span>Back to Dashboard</span>
              </motion.button>

              {/* Center: Title */}
              <div className="flex items-center space-x-3">
                <div className={`p-3 rounded-xl ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                  <Database className={`w-8 h-8 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
                </div>
                <div>
                  <h1 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>
                    Offline Orders
                  </h1>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>
                    {offlineOrders.length} order(s) pending sync
                  </p>
                </div>
              </div>

              {/* Right: Controls */}
              <div className="flex items-center space-x-3">
                {/* Network Status */}
                <div className="flex items-center space-x-2">
                  {isOnline ? (
                    <div className="flex items-center space-x-2 text-green-500">
                      <Wifi className="w-5 h-5" />
                      <span className="text-sm font-medium">Online</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 text-red-500">
                      <WifiOff className="w-5 h-5" />
                      <span className="text-sm font-medium">Offline</span>
                    </div>
                  )}
                </div>

                {/* Refresh Button */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    loadOfflineOrders()
                    updateNetworkStatus()
                  }}
                  className={`p-3 rounded-xl ${themeClasses.button} transition-all`}
                  title="Refresh"
                >
                  <RefreshCw className={`w-5 h-5 ${themeClasses.textSecondary}`} />
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

                {/* Sync All Button */}
                {offlineOrders.length > 0 && (
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleSyncAllOrders}
                    disabled={!isOnline || isSyncing}
                    className={`px-6 py-3 rounded-xl font-semibold transition-all flex items-center space-x-2 ${
                      !isOnline || isSyncing
                        ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                        : 'bg-green-500 hover:bg-green-600 text-white'
                    }`}
                  >
                    {isSyncing ? (
                      <>
                        <RefreshCw className="w-5 h-5 animate-spin" />
                        <span>Syncing All...</span>
                      </>
                    ) : (
                      <>
                        <CloudUpload className="w-5 h-5" />
                        <span>Sync All Orders</span>
                      </>
                    )}
                  </motion.button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {offlineOrders.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className={`${themeClasses.card} rounded-2xl ${themeClasses.shadow} p-12 text-center border ${themeClasses.border}`}
            >
              <div className={`w-24 h-24 rounded-full mx-auto mb-6 flex items-center justify-center ${
                isDark ? 'bg-green-900/30' : 'bg-green-100'
              }`}>
                <CheckCircle className={`w-12 h-12 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
              </div>
              <h3 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>
                All Orders Synced!
              </h3>
              <p className={`text-lg ${themeClasses.textSecondary}`}>
                There are no offline orders waiting to sync.
              </p>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {offlineOrders.map((order, index) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`${themeClasses.card} rounded-2xl p-6 ${themeClasses.shadow} border ${themeClasses.border}`}
                >
                  {/* Order Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center space-x-3 mb-3">
                        <h3 className={`text-xl font-bold ${themeClasses.textPrimary}`}>
                          {order.order_number}
                        </h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          order._syncError
                            ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                            : 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                        }`}>
                          {order._syncError ? 'Sync Failed' : 'Pending Sync'}
                        </span>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold uppercase ${
                          order.order_type === 'walkin'
                            ? 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                            : order.order_type === 'takeaway'
                            ? 'bg-blue-500/20 text-blue-500 border border-blue-500/30'
                            : 'bg-orange-500/20 text-orange-500 border border-orange-500/30'
                        }`}>
                          {order.order_type}
                        </span>
                      </div>

                      <div className={`grid grid-cols-2 md:grid-cols-4 gap-4 text-sm ${themeClasses.textSecondary}`}>
                        <div>
                          <span className="block text-xs uppercase mb-1">Total Amount</span>
                          <span className={`text-lg font-bold ${themeClasses.textPrimary}`}>
                            Rs {order.total_amount?.toFixed(2)}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase mb-1">Payment Method</span>
                          <span className={`font-semibold ${themeClasses.textPrimary}`}>
                            {order.payment_method || 'N/A'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase mb-1">Customer</span>
                          <span className={`font-semibold ${themeClasses.textPrimary}`}>
                            {order.customers?.name || 'Walk-in'}
                          </span>
                        </div>
                        <div>
                          <span className="block text-xs uppercase mb-1">Created</span>
                          <span className={`font-semibold ${themeClasses.textPrimary}`}>
                            {new Date(order.created_at).toLocaleString()}
                          </span>
                        </div>
                      </div>

                      {order._syncError && (
                        <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                          <div className="flex items-start space-x-2">
                            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-red-500 text-sm font-semibold">Sync Error</p>
                              <p className="text-red-500 text-sm mt-1">{order._syncError}</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center space-x-2 ml-6">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleSyncSingleOrder(order.id)}
                        disabled={syncingOrderId === order.id || !isOnline}
                        className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center space-x-2 ${
                          syncingOrderId === order.id
                            ? 'bg-blue-500/50 text-white cursor-not-allowed'
                            : !isOnline
                            ? 'bg-gray-500/50 text-gray-300 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600 text-white shadow-lg'
                        }`}
                      >
                        {syncingOrderId === order.id ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            <span>Syncing...</span>
                          </>
                        ) : (
                          <>
                            <CloudUpload className="w-4 h-4" />
                            <span>Sync</span>
                          </>
                        )}
                      </motion.button>

                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => handleDeleteOfflineOrder(order.id)}
                        disabled={syncingOrderId === order.id}
                        className={`p-2.5 rounded-xl text-sm font-semibold transition-all ${
                          syncingOrderId === order.id
                            ? 'bg-red-500/50 text-white cursor-not-allowed'
                            : 'bg-red-500 hover:bg-red-600 text-white shadow-lg'
                        }`}
                        title="Delete offline order"
                      >
                        <Trash2 className="w-4 h-4" />
                      </motion.button>
                    </div>
                  </div>

                  {/* Order JSON (Collapsible) */}
                  <details className="mt-4">
                    <summary className={`cursor-pointer text-sm font-semibold ${themeClasses.textPrimary} hover:text-blue-500 transition-colors flex items-center space-x-2`}>
                      <span>📄 View JSON Data</span>
                    </summary>
                    <pre className={`mt-3 p-4 ${isDark ? 'bg-gray-900' : 'bg-gray-50'} rounded-xl overflow-x-auto text-xs ${themeClasses.textSecondary} border ${themeClasses.border} font-mono`}>
                      {JSON.stringify(order, null, 2)}
                    </pre>
                  </details>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>
    </ProtectedPage>
  )
}
