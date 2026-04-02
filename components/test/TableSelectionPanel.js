'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Table2, Users, MapPin, Check, RefreshCw, MoreVertical, CheckCircle, XCircle } from 'lucide-react'
import { cacheManager } from '../../lib/cacheManager'
import { isInTodaysBusinessDay } from '../../lib/utils/businessDayUtils'

export default function TableSelectionPanel({
  onSelectTable,
  selectedTable,
  classes,
  isDark,
  onClose
}) {
  const [tables, setTables] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState(null)
  const [openMenuId, setOpenMenuId] = useState(null) // table id whose menu is open
  const [changingStatusId, setChangingStatusId] = useState(null) // table id being updated
  const menuRef = useRef(null)

  useEffect(() => {
    fetchTables()
  }, [])

  // Close menu when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpenMenuId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Re-apply occupancy overlay whenever orders change (order completed, new order placed, etc.)
  useEffect(() => {
    const handler = () => {
      setTables(prev => applyActiveOrderOccupancy(cacheManager.getAllTables()))
    }
    window.addEventListener('ordersUpdated', handler)
    return () => window.removeEventListener('ordersUpdated', handler)
  }, [])

  // Overlay occupied status from active orders so the table grid is always accurate
  // even if updateTableStatus() was missed or ran out of order.
  // Only considers orders from the current business day to avoid stale pending
  // orders from previous sessions blocking tables.
  const applyActiveOrderOccupancy = (tableList) => {
    const userProfile = (() => { try { return JSON.parse(localStorage.getItem('user_profile') || '{}') } catch { return {} } })()
    const startTime = userProfile.business_start_time || '10:00'
    const endTime = userProfile.business_end_time || '03:00'

    const activeOrders = (cacheManager.cache?.orders || []).filter(o =>
      o.table_id &&
      o.order_type === 'walkin' &&
      !['completed', 'cancelled', 'Completed', 'Cancelled'].includes(o.order_status) &&
      isInTodaysBusinessDay(o.created_at, startTime, endTime)
    )
    const occupiedTableIds = new Set(activeOrders.map(o => o.table_id))
    return tableList.map(t => ({
      ...t,
      status: occupiedTableIds.has(t.id) ? 'occupied' : t.status
    }))
  }

  const fetchTables = async (forceRefresh = false) => {
    setIsLoading(true)
    setError(null)

    try {
      // Show cached tables immediately for fast render, then refresh in background
      const cachedTables = cacheManager.getAllTables()
      if (cachedTables.length > 0 && !forceRefresh) {
        setTables(applyActiveOrderOccupancy(cachedTables))
        setIsLoading(false)
      }

      // Always fetch fresh orders + tables from DB to get accurate occupancy
      // (stale cache can show a table as occupied even after the order is completed)
      if (navigator.onLine !== false) {
        await cacheManager.fetchRecentOrders()
        const refreshedTables = await cacheManager.refreshTables()
        setTables(applyActiveOrderOccupancy(refreshedTables || []))
      }
    } catch (err) {
      console.error('Error fetching tables:', err)

      // Try to use cached tables as fallback
      const fallbackTables = cacheManager.getAllTables()
      if (fallbackTables.length > 0) {
        setTables(applyActiveOrderOccupancy(fallbackTables))
      } else {
        setError(err.message)
      }
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'available':
        return isDark
          ? 'bg-green-900/30 border-green-700 text-green-400'
          : 'bg-green-50 border-green-300 text-green-700'
      case 'occupied':
        return isDark
          ? 'bg-red-900/30 border-red-700 text-red-400'
          : 'bg-red-50 border-red-300 text-red-700'
      case 'reserved':
        return isDark
          ? 'bg-yellow-900/30 border-yellow-700 text-yellow-400'
          : 'bg-yellow-50 border-yellow-300 text-yellow-700'
      case 'maintenance':
        return isDark
          ? 'bg-gray-700/50 border-gray-600 text-gray-400'
          : 'bg-gray-100 border-gray-300 text-gray-600'
      default:
        return isDark
          ? 'bg-gray-700/50 border-gray-600 text-gray-400'
          : 'bg-gray-50 border-gray-300 text-gray-600'
    }
  }

  const getStatusBadgeColor = (status) => {
    switch (status) {
      case 'available':
        return 'bg-green-500 text-white'
      case 'occupied':
        return 'bg-red-500 text-white'
      case 'reserved':
        return 'bg-yellow-500 text-white'
      case 'maintenance':
        return 'bg-gray-500 text-white'
      default:
        return 'bg-gray-500 text-white'
    }
  }

  const handleToggleStatus = async (e, table) => {
    e.stopPropagation()
    setOpenMenuId(null)
    const newStatus = table.status === 'available' ? 'occupied' : 'available'
    setChangingStatusId(table.id)
    try {
      await cacheManager.updateTableStatus(table.id, newStatus)
      setTables(prev => prev.map(t => t.id === table.id ? { ...t, status: newStatus } : t))
    } catch (err) {
      console.error('Failed to update table status:', err)
    } finally {
      setChangingStatusId(null)
    }
  }

  const handleTableSelect = (table) => {
    // If already selected, deselect it
    if (selectedTable?.id === table.id) {
      onSelectTable(null)
      if (onClose) onClose()
      return
    }
    // Prevent selection of non-available tables
    if (table.status !== 'available') {
      return
    }
    onSelectTable(table)
    if (onClose) {
      onClose()
    }
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-600 border-t-transparent mx-auto mb-4"></div>
          <p className={classes.textSecondary}>Loading tables...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <p className={`${isDark ? 'text-red-400' : 'text-red-600'} mb-4`}>
            Error loading tables: {error}
          </p>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchTables}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center mx-auto"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </motion.button>
        </div>
      </div>
    )
  }

  if (tables.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <Table2 className={`w-16 h-16 ${classes.textSecondary} mx-auto mb-4`} />
          <h3 className={`text-lg font-semibold ${classes.textPrimary} mb-2`}>No Tables Found</h3>
          <p className={`${classes.textSecondary} text-sm`}>
            Please add tables in your dashboard settings.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      {/* Header */}
      <div className={`p-6 ${classes.border} border-b`}>
        <div className="flex items-center justify-between">
          <div>
            <h2 className={`text-2xl font-bold ${classes.textPrimary}`}>Select Table</h2>
            <p className={`${classes.textSecondary} text-sm mt-1`}>
              {tables.length} tables available
            </p>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => fetchTables(true)}
            className={`p-2 rounded-lg ${classes.button} transition-all`}
            title="Refresh tables from server"
          >
            <RefreshCw className={`w-5 h-5 ${classes.textSecondary}`} />
          </motion.button>
        </div>
      </div>

      {/* Tables Grid */}
      <div className="flex-1 overflow-y-auto p-6" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        <style jsx>{`
          div::-webkit-scrollbar {
            display: none;
          }
        `}</style>

        <div ref={menuRef} className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {tables.map((table) => {
            const isSelected = selectedTable?.id === table.id
            const isAvailable = table.status === 'available'
            const isDisabled = !isAvailable
            const isChanging = changingStatusId === table.id
            const menuOpen = openMenuId === table.id
            // Only show toggle for available/occupied (not reserved/maintenance)
            const canToggle = table.status === 'available' || table.status === 'occupied'

            return (
              <motion.div
                key={table.id}
                whileHover={isDisabled ? {} : { scale: 1.02 }}
                whileTap={isDisabled ? {} : { scale: 0.98 }}
                onClick={() => handleTableSelect(table)}
                className={`
                  relative p-3 rounded-lg border-2 transition-all duration-200
                  ${isDisabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                  ${isSelected
                    ? `${isDark ? 'bg-purple-900/30 border-purple-500' : 'bg-purple-50 border-purple-500'} ring-2 ring-purple-500 ring-opacity-50`
                    : isDisabled
                      ? `${getStatusColor(table.status)}`
                      : `${getStatusColor(table.status)} hover:shadow-lg`
                  }
                `}
              >
                {/* Selected Indicator */}
                {isSelected && (
                  <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                )}

                {/* Menu button (top-left) */}
                {canToggle && !isSelected && (
                  <div className="absolute top-1 left-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(menuOpen ? null : table.id) }}
                      className={`p-0.5 rounded transition-colors ${isDark ? 'hover:bg-white/10 text-gray-400' : 'hover:bg-black/10 text-gray-500'}`}
                    >
                      {isChanging
                        ? <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        : <MoreVertical className="w-3 h-3" />
                      }
                    </button>

                    <AnimatePresence>
                      {menuOpen && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.9, y: -4 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9, y: -4 }}
                          transition={{ duration: 0.1 }}
                          className={`absolute top-6 left-0 z-50 rounded-lg shadow-xl border py-1 min-w-[140px] ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}
                        >
                          {isAvailable ? (
                            <button
                              onClick={(e) => handleToggleStatus(e, table)}
                              className={`w-full flex items-center px-3 py-2 text-xs gap-2 transition-colors ${isDark ? 'hover:bg-gray-700 text-red-400' : 'hover:bg-red-50 text-red-600'}`}
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Mark as Occupied
                            </button>
                          ) : (
                            <button
                              onClick={(e) => handleToggleStatus(e, table)}
                              className={`w-full flex items-center px-3 py-2 text-xs gap-2 transition-colors ${isDark ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-600'}`}
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Mark as Available
                            </button>
                          )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}

                {/* Table Name */}
                <div className="text-center mb-2">
                  <h3 className={`font-bold ${classes.textPrimary} text-xs`}>
                    {table.table_name || `Table ${table.table_number}`}
                  </h3>
                </div>

                {/* Table Info - Inline */}
                <div className="flex items-center justify-between text-xs mb-2">
                  <div className="flex items-center">
                    <Users className={`w-3 h-3 mr-1 ${classes.textSecondary}`} />
                    <span className={classes.textSecondary}>{table.capacity}</span>
                  </div>
                  {table.location && (
                    <div className="flex items-center">
                      <MapPin className={`w-3 h-3 mr-0.5 ${classes.textSecondary}`} />
                      <span className={`${classes.textSecondary} truncate max-w-[50px]`}>{table.location}</span>
                    </div>
                  )}
                </div>

                {/* Status Badge */}
                <div className="text-center">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${getStatusBadgeColor(table.status)}`}>
                    {table.status}
                  </span>
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>

      {/* Footer with Legend */}
      <div className={`p-4 ${classes.border} border-t ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
        <div className="flex items-center justify-center space-x-6 text-xs">
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-green-500 mr-2"></div>
            <span className={classes.textSecondary}>Available</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
            <span className={classes.textSecondary}>Occupied</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-yellow-500 mr-2"></div>
            <span className={classes.textSecondary}>Reserved</span>
          </div>
          <div className="flex items-center">
            <div className="w-3 h-3 rounded-full bg-gray-500 mr-2"></div>
            <span className={classes.textSecondary}>Maintenance</span>
          </div>
        </div>
      </div>
    </div>
  )
}
