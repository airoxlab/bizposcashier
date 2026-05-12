'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Search, Loader2, ShoppingCart,
  ChevronDown, RotateCcw, Activity
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import ProtectedPage from '../../components/ProtectedPage'
import NotificationSystem from '../../components/ui/NotificationSystem'
import CreatePurchaseOrderPanel from '../../components/inventory/CreatePurchaseOrderPanel'
import ViewPurchaseOrderPanel from '../../components/inventory/ViewPurchaseOrderPanel'
import EditPurchaseOrderPanel from '../../components/inventory/EditPurchaseOrderPanel'
import PurchaseReturnsTab from '../../components/inventory/PurchaseReturnsTab'
import StockTransactionsTab from '../../components/inventory/StockTransactionsTab'
import themeManager from '../../lib/themeManager'

const STATUS_STYLES = {
  draft:     { badge: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300' },
  sent:      { badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  received:  { badge: 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300' },
  partial:   { badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300' },
  cancelled: { badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300' },
}

const STATUS_LABELS = {
  draft: 'Draft', sent: 'Confirmed', received: 'Received',
  partial: 'Partial', cancelled: 'Cancelled',
}

const TABS = [
  { key: 'orders',       label: 'Purchase Orders',  Icon: ShoppingCart },
  { key: 'returns',      label: 'Purchase Returns', Icon: RotateCcw    },
  { key: 'transactions', label: 'Transactions',     Icon: Activity     },
]

export default function PurchaseOrdersPage() {
  const router = useRouter()
  const [user, setUser]                         = useState(null)
  const [activeTab, setActiveTab]               = useState('orders')
  const [purchaseOrders, setPurchaseOrders]     = useState([])
  const [filteredOrders, setFilteredOrders]     = useState([])
  const [loading, setLoading]                   = useState(true)
  const [selectedPO, setSelectedPO]             = useState(null)
  const [mode, setMode]                         = useState('list')
  const [searchTerm, setSearchTerm]             = useState('')
  const [selectedStatus, setSelectedStatus]     = useState('all')
  const [statusDropdownId, setStatusDropdownId] = useState(null)

  const themeClasses    = themeManager.getClasses()
  const isDark          = themeManager.isDark()
  const canCreate       = permissionManager.hasPermission('PO_CREATE') || authManager.getRole() === 'admin'
  const canManageStatus = permissionManager.hasPermission('PO_EDIT')   || authManager.getRole() === 'admin'

  useEffect(() => {
    if (!authManager.isLoggedIn()) { router.push('/'); return }
    const userData = authManager.getCurrentUser()
    setUser(userData)
    if (userData?.id) loadPurchaseOrders(userData.id)
  }, [router])

  const loadPurchaseOrders = async (userId) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('purchase_orders')
        .select('*, suppliers(id, name), purchase_order_items(id, quantity, received_quantity)')
        .eq('user_id', userId)
        .order('po_date', { ascending: false })
      if (error) throw error
      setPurchaseOrders(data || [])
    } catch { /* silently ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let list = purchaseOrders
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(po =>
        po.po_number?.toLowerCase().includes(q) ||
        po.suppliers?.name?.toLowerCase().includes(q)
      )
    }
    if (selectedStatus !== 'all') list = list.filter(po => po.status === selectedStatus)
    setFilteredOrders(list)
  }, [searchTerm, selectedStatus, purchaseOrders])

  useEffect(() => {
    if (selectedPO) {
      const updated = purchaseOrders.find(po => po.id === selectedPO.id)
      if (updated) setSelectedPO(updated)
    }
  }, [purchaseOrders])

  const stats = {
    total:    purchaseOrders.length,
    draft:    purchaseOrders.filter(p => p.status === 'draft').length,
    sent:     purchaseOrders.filter(p => p.status === 'sent').length,
    received: purchaseOrders.filter(p => p.status === 'received').length,
    partial:  purchaseOrders.filter(p => p.status === 'partial').length,
  }

  const refresh = async () => { if (user?.id) await loadPurchaseOrders(user.id) }

  const quickStatusChange = async (po, newStatus, e) => {
    e.stopPropagation()
    try {
      const { error } = await supabase
        .from('purchase_orders').update({ status: newStatus }).eq('id', po.id)
      if (error) throw error
      await refresh()
    } catch { /* ignore */ }
  }

  if (!user) return <div className={`h-screen w-screen ${themeClasses.background}`} />

  return (
    <ProtectedPage permissionKey="PURCHASE_ORDERS" pageName="Purchase Orders">
      <NotificationSystem />
      <div className={`h-screen flex flex-col ${themeClasses.background} overflow-hidden`}>

        {/* ── TOP TAB BAR ── */}
        <div className="bg-gradient-to-r from-teal-500 via-cyan-500 to-blue-600 flex-shrink-0 px-4 pt-3 pb-0">
          <div className="flex items-center gap-4">
            <motion.button
              whileHover={{ x: -2 }} whileTap={{ scale: 0.97 }}
              onClick={() => router.push('/dashboard')}
              className="flex items-center gap-2 text-white/90 hover:text-white transition-colors flex-shrink-0"
            >
              <div className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                <ArrowLeft className="w-4 h-4" />
              </div>
              <span className="text-sm font-medium">Dashboard</span>
            </motion.button>

            <div className="flex items-end gap-1">
              {TABS.map(({ key, label, Icon }) => (
                <button
                  key={key}
                  onClick={() => { setActiveTab(key); setMode('list') }}
                  className={`flex items-center gap-2 px-4 py-2 rounded-t-xl text-sm font-semibold transition-all ${
                    activeTab === key
                      ? 'bg-white text-teal-700 shadow-sm'
                      : 'text-white/80 hover:text-white hover:bg-white/15'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── TAB CONTENT ── */}
        <div className="flex-1 overflow-hidden flex">

          {/* ── PURCHASE ORDERS TAB ── */}
          {activeTab === 'orders' && (
            <>
              {/* Left panel */}
              <div
                className={`w-80 flex-shrink-0 flex flex-col h-full border-r ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}
                onClick={() => setStatusDropdownId(null)}
              >
                {/* Stats + search */}
                <div className={`px-4 pt-3 pb-3 flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/40' : 'border-gray-100 bg-gray-50/60'}`}>
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {[
                      { label: 'Total',     value: stats.total,    cls: themeClasses.textPrimary },
                      { label: 'Draft',     value: stats.draft,    cls: 'text-yellow-500' },
                      { label: 'Confirmed', value: stats.sent,     cls: 'text-blue-500'   },
                      { label: 'Received',  value: stats.received, cls: 'text-green-500'  },
                      { label: 'Partial',   value: stats.partial,  cls: 'text-orange-500' },
                    ].map(({ label, value, cls }) => (
                      <div key={label} className={`text-center rounded-lg py-2 ${isDark ? 'bg-gray-700/60' : 'bg-white border border-gray-100'}`}>
                        <p className={`text-sm font-bold ${cls}`}>{value}</p>
                        <p className={`text-[9px] font-medium ${themeClasses.textSecondary}`}>{label}</p>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                      <input
                        type="text" placeholder="Search PO# or supplier..."
                        value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                        className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-teal-500 ${
                          isDark
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                            : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                        }`}
                      />
                    </div>
                    {canCreate && (
                      <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={() => { setSelectedPO(null); setMode('create') }}
                        className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${
                          mode === 'create'
                            ? 'bg-teal-600 text-white'
                            : isDark
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200'
                        }`}
                      >
                        <Plus className="w-4 h-4" /> New PO
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* Status filters */}
                <div className={`flex gap-1.5 px-3 py-2.5 flex-wrap flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
                  {['all', 'draft', 'sent', 'received', 'partial', 'cancelled'].map(status => (
                    <button
                      key={status}
                      onClick={() => setSelectedStatus(status)}
                      className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                        selectedStatus === status
                          ? 'bg-teal-600 text-white shadow-sm'
                          : isDark
                            ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                            : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                      }`}
                    >
                      {STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1)}
                    </button>
                  ))}
                </div>

                {/* PO list */}
                <div className="flex-1 overflow-y-auto py-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-teal-500" />
                    </div>
                  ) : filteredOrders.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-16 px-4 text-center ${themeClasses.textSecondary}`}>
                      <ShoppingCart className="w-10 h-10 mb-3 opacity-30" />
                      <p className="text-sm font-medium">No purchase orders</p>
                      <p className="text-xs mt-1 opacity-70">
                        {selectedStatus !== 'all' ? 'Try a different filter' : 'Create your first PO'}
                      </p>
                    </div>
                  ) : (
                    filteredOrders.map(po => {
                      const s            = STATUS_STYLES[po.status] || STATUS_STYLES.draft
                      const isSelected   = selectedPO?.id === po.id && mode !== 'create'
                      const dropdownOpen = statusDropdownId === po.id
                      const canToggle    = canManageStatus && (po.status === 'draft' || po.status === 'sent')

                      return (
                        <motion.div
                          key={po.id} whileHover={{ x: 2 }}
                          className={`w-full border-b transition-all relative ${
                            isSelected
                              ? isDark ? 'bg-teal-900/40 border-l-2 border-l-teal-500' : 'bg-teal-50 border-l-2 border-l-teal-500'
                              : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                          }`}
                        >
                          <button
                            onClick={() => { setStatusDropdownId(null); setSelectedPO(po); setMode('view') }}
                            className="w-full px-4 py-3 text-left"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-semibold text-sm ${themeClasses.textPrimary}`}>{po.po_number}</span>
                              {canToggle ? (
                                <button
                                  onClick={e => { e.stopPropagation(); setStatusDropdownId(dropdownOpen ? null : po.id) }}
                                  className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full hover:opacity-80 ${s.badge}`}
                                >
                                  {STATUS_LABELS[po.status] || po.status.toUpperCase()}
                                  <ChevronDown className="w-2.5 h-2.5" />
                                </button>
                              ) : (
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
                                  {STATUS_LABELS[po.status] || po.status.toUpperCase()}
                                </span>
                              )}
                            </div>
                            <p className={`text-xs ${themeClasses.textSecondary} truncate`}>{po.suppliers?.name}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className={`text-xs ${themeClasses.textSecondary}`}>
                                {new Date(po.po_date).toLocaleDateString('en-PK')}
                              </span>
                              <span className={`text-sm font-bold ${themeClasses.textPrimary}`}>
                                Rs.&nbsp;{(po.grand_total || 0).toFixed(0)}
                              </span>
                            </div>
                          </button>

                          {dropdownOpen && (
                            <div className={`absolute right-4 top-8 z-20 rounded-xl shadow-xl border overflow-hidden min-w-[150px] ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
                              <div className={`px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider border-b ${isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'}`}>
                                Change Status
                              </div>
                              {[
                                { value: 'draft', label: 'Draft',     cls: 'text-gray-500' },
                                { value: 'sent',  label: 'Confirmed', cls: 'text-blue-600' },
                              ].map(opt => (
                                <button
                                  key={opt.value}
                                  onClick={e => { e.stopPropagation(); quickStatusChange(po, opt.value, e); setStatusDropdownId(null) }}
                                  disabled={po.status === opt.value}
                                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium text-left transition-colors ${
                                    po.status === opt.value
                                      ? isDark ? 'bg-gray-700/50 text-gray-500 cursor-default' : 'bg-gray-50 text-gray-400 cursor-default'
                                      : isDark ? `hover:bg-gray-700 ${opt.cls}` : `hover:bg-gray-50 ${opt.cls}`
                                  }`}
                                >
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${po.status === opt.value ? 'bg-current' : 'border border-current'}`} />
                                  {opt.label}
                                  {po.status === opt.value && <span className="ml-auto text-[10px] opacity-60">current</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </motion.div>
                      )
                    })
                  )}
                </div>
              </div>

              {/* Right panel */}
              <div className={`flex-1 h-full overflow-hidden ${isDark ? 'bg-gray-900' : 'bg-gray-50/50'}`}>
                <AnimatePresence mode="wait">
                  {mode === 'create' && (
                    <motion.div key="create" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full">
                      <CreatePurchaseOrderPanel
                        onClose={() => setMode('list')}
                        onCreated={async (data) => { await refresh(); setSelectedPO(data); setMode('view') }}
                      />
                    </motion.div>
                  )}
                  {mode === 'view' && selectedPO && (
                    <motion.div key={`view-${selectedPO.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full">
                      <ViewPurchaseOrderPanel
                        purchaseOrder={selectedPO}
                        onBack={() => { setSelectedPO(null); setMode('list') }}
                        onEdit={() => setMode('edit')}
                        onDeleted={() => { setSelectedPO(null); setMode('list'); refresh() }}
                        onUpdated={refresh}
                      />
                    </motion.div>
                  )}
                  {mode === 'edit' && selectedPO && (
                    <motion.div key={`edit-${selectedPO.id}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }} className="h-full">
                      <EditPurchaseOrderPanel
                        purchaseOrder={selectedPO}
                        onBack={() => setMode('view')}
                        onUpdated={() => { refresh(); setMode('view') }}
                      />
                    </motion.div>
                  )}
                  {mode === 'list' && (
                    <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="h-full flex flex-col items-center justify-center">
                      <div className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                        <ShoppingCart className={`w-10 h-10 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                      </div>
                      <p className={`text-lg font-semibold ${themeClasses.textPrimary}`}>No order selected</p>
                      <p className={`text-sm mt-1 ${themeClasses.textSecondary}`}>
                        Pick a PO from the list
                        {canCreate && (
                          <>, or{' '}
                            <button onClick={() => setMode('create')} className="text-teal-600 hover:text-teal-500 font-semibold underline underline-offset-2">
                              create a new one
                            </button>
                          </>
                        )}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </>
          )}

          {/* ── PURCHASE RETURNS TAB ── */}
          {activeTab === 'returns' && user && <PurchaseReturnsTab user={user} />}

          {/* ── STOCK TRANSACTIONS TAB ── */}
          {activeTab === 'transactions' && user && <StockTransactionsTab user={user} />}

        </div>
      </div>
    </ProtectedPage>
  )
}
