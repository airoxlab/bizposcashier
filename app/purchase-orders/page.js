'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Plus, Search, Loader2, ShoppingCart,
  ChevronDown, RotateCcw, Activity, ArrowUpDown, Filter, FileClock
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
import { poDraft } from '../../lib/poDraft'

// "x minutes ago" for the unfinished-PO prompt
const timeAgo = (ts) => {
  if (!ts) return ''
  const s = Math.floor((Date.now() - ts) / 1000)
  if (s < 60)    return 'just now'
  if (s < 3600)  return `${Math.floor(s / 60)} min ago`
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`
  return `${Math.floor(s / 86400)} day(s) ago`
}

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
  const [sortBy, setSortBy]                     = useState('date')  // 'date' | 'po_number' | 'amount'
  const [sortOrder, setSortOrder]               = useState('desc')  // 'asc' | 'desc'
  const [showSortMenu, setShowSortMenu]         = useState(false)
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState('all')
  const [showDraftPrompt, setShowDraftPrompt]   = useState(false)
  const [restoreDraft, setRestoreDraft]         = useState(false)
  const [draftMeta, setDraftMeta]               = useState(null)  // { savedAt, itemCount }

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
        .select('*, suppliers(id, name), purchase_order_items(id, quantity, received_quantity, suppliers:supplier_id(id, name))')
        .eq('user_id', userId)
        .order('po_date', { ascending: false })
      if (error) throw error
      setPurchaseOrders(data || [])
    } catch { /* silently ignore */ }
    finally { setLoading(false) }
  }

  useEffect(() => {
    let list = purchaseOrders

    // Search filter
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase()
      list = list.filter(po =>
        po.po_number?.toLowerCase().includes(q) ||
        po.suppliers?.name?.toLowerCase().includes(q)
      )
    }

    // Status filter
    if (selectedStatus !== 'all') list = list.filter(po => po.status === selectedStatus)

    // Payment status filter
    if (selectedPaymentStatus !== 'all') list = list.filter(po => po.payment_status === selectedPaymentStatus)

    // Sorting
    list.sort((a, b) => {
      let aVal, bVal, result

      if (sortBy === 'date') {
        aVal = new Date(a.po_date).getTime()
        bVal = new Date(b.po_date).getTime()
        result = sortOrder === 'asc' ? aVal - bVal : bVal - aVal

        // If dates are equal, sort by PO number descending (newest PO numbers first)
        if (result === 0) {
          const aPONum = parseInt(a.po_number?.replace(/\D/g, '') || 0)
          const bPONum = parseInt(b.po_number?.replace(/\D/g, '') || 0)
          return bPONum - aPONum
        }
        return result
      } else if (sortBy === 'po_number') {
        const aPONum = parseInt(a.po_number?.replace(/\D/g, '') || 0)
        const bPONum = parseInt(b.po_number?.replace(/\D/g, '') || 0)
        result = sortOrder === 'asc' ? aPONum - bPONum : bPONum - aPONum
      } else if (sortBy === 'amount') {
        aVal = parseFloat(a.grand_total || 0)
        bVal = parseFloat(b.grand_total || 0)
        result = sortOrder === 'asc' ? aVal - bVal : bVal - aVal
      }

      return result || 0
    })

    setFilteredOrders(list)
  }, [searchTerm, selectedStatus, selectedPaymentStatus, purchaseOrders, sortBy, sortOrder])

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

  // Keep the unfinished-draft indicator in sync whenever we land on the list
  const syncDraftMeta = () => {
    if (!user?.id) { setDraftMeta(null); return }
    const d = poDraft.load(user.id)
    setDraftMeta(d ? { savedAt: d.savedAt, itemCount: (d.rows || []).filter(r => r.inventory_item_id).length } : null)
  }
  useEffect(() => { if (mode === 'list') syncDraftMeta() }, [mode, user])

  // "New PO" — resume an unfinished draft or start fresh
  const openCreate = (resume) => {
    setRestoreDraft(resume)
    setSelectedPO(null)
    setShowDraftPrompt(false)
    setMode('create')
  }
  const handleNewPO = () => {
    if (user?.id && poDraft.exists(user.id)) {
      syncDraftMeta()
      setShowDraftPrompt(true)
    } else {
      openCreate(false)
    }
  }
  const startFreshPO = () => {
    if (user?.id) poDraft.clear(user.id)
    setDraftMeta(null)
    openCreate(false)
  }

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
        <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 flex-shrink-0 px-4 pt-3 pb-0">
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
                      ? 'bg-white text-indigo-700 shadow-sm'
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
                        className={`w-full pl-9 pr-3 py-2 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          isDark
                            ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                            : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                        }`}
                      />
                    </div>
                    {canCreate && (
                      <motion.button
                        whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                        onClick={handleNewPO}
                        className={`relative px-3 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-1 flex-shrink-0 ${
                          mode === 'create'
                            ? 'bg-indigo-600 text-white'
                            : isDark
                              ? 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                              : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                        }`}
                      >
                        <Plus className="w-4 h-4" /> New PO
                        {draftMeta && mode !== 'create' && (
                          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-500 ring-2 ring-white dark:ring-gray-900" title="Unfinished PO draft saved" />
                        )}
                      </motion.button>
                    )}
                  </div>
                </div>

                {/* Status & Payment filters + Sort */}
                <div className={`flex flex-col gap-2 px-3 py-2.5 flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
                  {/* PO Status filters */}
                  <div className="flex gap-1.5 flex-wrap items-center">
                    <span className={`text-xs font-semibold ${themeClasses.textSecondary}`}>Status:</span>
                    {['all', 'draft', 'sent', 'received', 'partial', 'cancelled'].map(status => (
                      <button
                        key={status}
                        onClick={() => setSelectedStatus(status)}
                        className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                          selectedStatus === status
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : isDark
                              ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                              : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        {STATUS_LABELS[status] || status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    ))}
                  </div>

                  {/* Payment Status & Sort */}
                  <div className="flex gap-2 flex-wrap items-center">
                    <div className="flex gap-1.5 items-center">
                      <span className={`text-xs font-semibold ${themeClasses.textSecondary}`}>Payment:</span>
                      {['all', 'paid', 'partial', 'unpaid'].map(status => (
                        <button
                          key={status}
                          onClick={() => setSelectedPaymentStatus(status)}
                          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                            selectedPaymentStatus === status
                              ? 'bg-blue-600 text-white shadow-sm'
                              : isDark
                                ? 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                                : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                          }`}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                      ))}
                    </div>

                    {/* Sort Menu */}
                    <div className="relative ml-auto">
                      <button
                        onClick={() => setShowSortMenu(!showSortMenu)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-all ${
                          showSortMenu
                            ? isDark ? 'bg-gray-600 text-white' : 'bg-gray-200 text-gray-700'
                            : isDark ? 'bg-gray-700 text-gray-400 hover:bg-gray-600' : 'bg-white text-gray-500 hover:bg-gray-100 border border-gray-200'
                        }`}
                      >
                        <ArrowUpDown className="w-3.5 h-3.5" />
                        <span>Sort</span>
                      </button>

                      {showSortMenu && (
                        <div className={`absolute top-full right-0 mt-1 z-20 rounded-lg shadow-lg border overflow-hidden min-w-[180px] ${
                          isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
                        }`}>
                          {[
                            { value: 'date', label: 'Date (Newest)' },
                            { value: 'po_number', label: 'PO Number' },
                            { value: 'amount', label: 'Amount' },
                          ].map(opt => (
                            <button
                              key={opt.value}
                              onClick={() => {
                                if (sortBy === opt.value) {
                                  setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')
                                } else {
                                  setSortBy(opt.value)
                                  setSortOrder('desc')
                                }
                                setShowSortMenu(false)
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-left transition-colors ${
                                sortBy === opt.value
                                  ? isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
                                  : isDark ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-50 text-gray-700'
                              }`}
                            >
                              <span>{opt.label}</span>
                              {sortBy === opt.value && (
                                <span className="text-xs">
                                  {sortOrder === 'desc' ? '↓' : '↑'}
                                </span>
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* PO list */}
                <div className="flex-1 overflow-y-auto py-2">
                  {loading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
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

                      // Get supplier name: from main supplier or from items if items have suppliers
                      let supplierName = po.suppliers?.name
                      if (!supplierName && po.purchase_order_items?.length > 0) {
                        const uniqueSuppliers = [...new Set(po.purchase_order_items.map(item => item.suppliers?.name).filter(Boolean))]
                        if (uniqueSuppliers.length === 1) {
                          supplierName = uniqueSuppliers[0]
                        } else if (uniqueSuppliers.length > 1) {
                          supplierName = `${uniqueSuppliers.length} Suppliers`
                        }
                      }

                      return (
                        <motion.div
                          key={po.id} whileHover={{ x: 2 }}
                          className={`w-full border-b transition-all relative ${
                            isSelected
                              ? isDark ? 'bg-indigo-900/40 border-l-2 border-l-indigo-500' : 'bg-indigo-50 border-l-2 border-l-indigo-500'
                              : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                          }`}
                        >
                          <button
                            onClick={() => { setStatusDropdownId(null); setSelectedPO(po); setMode('view') }}
                            className="w-full px-4 py-3 text-left"
                          >
                            <div className="flex items-center justify-between mb-1">
                              <span className={`font-semibold text-sm ${themeClasses.textPrimary}`}>{po.po_number}</span>
                              <div className="flex gap-1 items-center">
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${s.badge}`}>
                                  {STATUS_LABELS[po.status] || po.status.toUpperCase()}
                                </span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                                  po.payment_status === 'paid'
                                    ? 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                    : po.payment_status === 'partial'
                                      ? 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300'
                                      : 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300'
                                }`}>
                                  {po.payment_status ? po.payment_status.charAt(0).toUpperCase() + po.payment_status.slice(1) : 'Unpaid'}
                                </span>
                              </div>
                            </div>
                            <p className={`text-xs ${themeClasses.textSecondary} truncate`}>{supplierName || '—'}</p>
                            <div className="flex items-center justify-between mt-1">
                              <span className={`text-xs ${themeClasses.textSecondary}`}>
                                {new Date(po.po_date).toLocaleDateString('en-PK')}
                              </span>
                              <span className={`text-sm font-bold ${themeClasses.textPrimary}`}>
                                Rs.&nbsp;{(po.grand_total || 0).toFixed(0)}
                              </span>
                            </div>
                          </button>
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
                        restoreDraft={restoreDraft}
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
                            <button onClick={handleNewPO} className="text-indigo-600 hover:text-indigo-500 font-semibold underline underline-offset-2">
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

      {/* ── Unfinished PO draft prompt ── */}
      <AnimatePresence>
        {showDraftPrompt && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="absolute inset-0 bg-black/60" onClick={() => setShowDraftPrompt(false)} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-sm rounded-2xl shadow-2xl border p-6 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center flex-shrink-0">
                  <FileClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <h3 className={`font-bold text-base ${themeClasses.textPrimary}`}>Unfinished Purchase Order</h3>
                  <p className={`text-xs mt-0.5 ${themeClasses.textSecondary}`}>
                    You have a saved draft
                    {draftMeta?.itemCount ? ` with ${draftMeta.itemCount} item${draftMeta.itemCount !== 1 ? 's' : ''}` : ''}
                    {draftMeta?.savedAt ? ` · edited ${timeAgo(draftMeta.savedAt)}` : ''}.
                  </p>
                </div>
              </div>
              <p className={`text-sm mb-5 ${themeClasses.textSecondary}`}>
                Continue where you left off, or discard it and start a new purchase order?
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => openCreate(true)}
                  className="w-full py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
                >
                  Continue Last PO
                </button>
                <button
                  onClick={startFreshPO}
                  className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                  }`}
                >
                  Discard &amp; Start New
                </button>
                <button
                  onClick={() => setShowDraftPrompt(false)}
                  className={`w-full py-2 text-xs font-medium ${themeClasses.textSecondary} hover:underline`}
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </ProtectedPage>
  )
}
