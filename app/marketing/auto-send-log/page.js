'use client'

import { useState, useEffect } from 'react'
import {
  Zap, Search, RefreshCw, CheckCircle, XCircle, AlertCircle,
  Loader2, Phone, Calendar, Filter, ChevronDown,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import { notify } from '../../../components/ui/NotificationSystem'
import ProtectedPage from '../../../components/ProtectedPage'

const STATUS_CFG = {
  sent:    { label: 'Sent',    color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20',   icon: CheckCircle },
  failed:  { label: 'Failed',  color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',        icon: XCircle },
  skipped: { label: 'Skipped', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20',  icon: AlertCircle },
  pending: { label: 'Pending', color: 'text-gray-400',   bg: 'bg-gray-500/10 border-gray-500/20',      icon: AlertCircle },
}

const SKIP_LABELS = {
  no_customer:      'No customer linked to order',
  no_phone:         'Customer has no phone number',
  blocked:          'Customer is blocked',
  already_sent:     'Already sent (duplicate prevention)',
  wa_disconnected:  'WhatsApp not connected',
  order_type_disabled: 'Order type disabled in settings',
  invalid_phone:    'Invalid phone number format',
}

function AutoSendLogPage() {
  const userId = authManager.getCurrentUser()?.id
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [orderTypeFilter, setOrderTypeFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const PAGE_SIZE = 50

  // Summary counts
  const [summary, setSummary] = useState({ sent: 0, failed: 0, skipped: 0, total: 0 })

  useEffect(() => { if (userId) { setPage(0); loadLogs(0) } }, [userId, statusFilter, orderTypeFilter])

  async function loadLogs(pageNum = 0) {
    setLoading(true)
    try {
      let query = supabase
        .from('whatsapp_auto_send_logs')
        .select(`
          id, order_id, phone_sent_to, order_type,
          message_sent, status, skip_reason, error_message, sent_at, created_at,
          orders ( order_number, total_amount ),
          customers ( full_name, phone )
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1)

      if (statusFilter !== 'all') query = query.eq('status', statusFilter)
      if (orderTypeFilter !== 'all') query = query.eq('order_type', orderTypeFilter)

      const { data, error } = await query
      if (error) throw error

      setLogs(pageNum === 0 ? (data || []) : prev => [...prev, ...(data || [])])
      setHasMore((data || []).length === PAGE_SIZE)

      // Summary (only on first load)
      if (pageNum === 0) loadSummary()
    } catch {
      notify.error('Failed to load auto-send logs')
    } finally {
      setLoading(false)
    }
  }

  async function loadSummary() {
    let query = supabase
      .from('whatsapp_auto_send_logs')
      .select('status')
      .eq('user_id', userId)
    if (statusFilter !== 'all') query = query.eq('status', statusFilter)
    if (orderTypeFilter !== 'all') query = query.eq('order_type', orderTypeFilter)

    const { data } = await query
    if (data) {
      const counts = { sent: 0, failed: 0, skipped: 0, total: data.length }
      data.forEach(r => { if (counts[r.status] !== undefined) counts[r.status]++ })
      setSummary(counts)
    }
  }

  function loadMore() {
    const next = page + 1
    setPage(next)
    loadLogs(next)
  }

  const filtered = logs.filter(l => {
    const q = search.toLowerCase()
    const name = l.customers?.full_name?.toLowerCase() || ''
    const phone = l.phone_sent_to || l.customers?.phone || ''
    const order = l.orders?.order_number || ''
    return name.includes(q) || phone.includes(q) || order.toLowerCase().includes(q)
  })

  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Zap size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Auto-Send Log</h1>
          <p className="text-gray-400 text-sm">Messages sent automatically when orders are completed</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Total',   value: summary.total,   color: 'from-purple-500 to-blue-500' },
          { label: 'Sent',    value: summary.sent,    color: 'from-green-400 to-emerald-500' },
          { label: 'Failed',  value: summary.failed,  color: 'from-red-400 to-red-500' },
          { label: 'Skipped', value: summary.skipped, color: 'from-yellow-400 to-orange-400' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4 text-center">
            <p className={`text-3xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
            <p className="text-gray-400 text-xs mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2">
          <Search size={14} className="text-gray-500 flex-shrink-0" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or order number..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => { setStatusFilter(e.target.value); setPage(0) }}
          className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="all">All Status</option>
          <option value="sent">Sent</option>
          <option value="failed">Failed</option>
          <option value="skipped">Skipped</option>
        </select>
        <select
          value={orderTypeFilter}
          onChange={e => { setOrderTypeFilter(e.target.value); setPage(0) }}
          className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="all">All Types</option>
          <option value="walkin">Dine-In</option>
          <option value="takeaway">Takeaway</option>
          <option value="delivery">Delivery</option>
        </select>
        <button
          onClick={() => { setPage(0); loadLogs(0) }}
          className="p-2 rounded-xl bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 overflow-hidden">
        {loading && page === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Zap size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 font-semibold">No auto-send logs yet</p>
            <p className="text-gray-500 text-sm mt-1">Logs appear here when orders are completed</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-gray-700/50 bg-gray-900/40">
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap w-24">Status</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap">Customer</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap">Phone Sent</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap">Order</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap w-24">Type</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap">Reason / Error</th>
                    <th className="text-left text-[10px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 whitespace-nowrap">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((log) => {
                    const cfg = STATUS_CFG[log.status] || STATUS_CFG.pending
                    const StatusIcon = cfg.icon
                    const reasonText = log.skip_reason
                      ? (SKIP_LABELS[log.skip_reason] || log.skip_reason)
                      : log.error_message || null

                    return (
                      <tr
                        key={log.id}
                        className="border-b border-gray-700/20 last:border-0 hover:bg-gray-700/20 transition-colors"
                      >
                        {/* Status */}
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color}`}>
                            <StatusIcon size={10} />
                            {cfg.label}
                          </span>
                        </td>
                        {/* Customer */}
                        <td className="px-4 py-3 max-w-[150px]">
                          <p className="text-white text-xs font-medium truncate">{log.customers?.full_name || '—'}</p>
                        </td>
                        {/* Phone */}
                        <td className="px-4 py-3">
                          <p className="text-gray-300 text-xs font-mono whitespace-nowrap">{log.phone_sent_to || '—'}</p>
                        </td>
                        {/* Order */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-gray-200 text-xs">{log.orders?.order_number || '—'}</p>
                          {log.orders?.total_amount && (
                            <p className="text-gray-500 text-[10px] mt-0.5">Rs. {Number(log.orders.total_amount).toLocaleString()}</p>
                          )}
                        </td>
                        {/* Type */}
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium capitalize px-2 py-0.5 rounded-md ${
                            log.order_type === 'walkin'   ? 'bg-blue-500/10 text-blue-400' :
                            log.order_type === 'takeaway' ? 'bg-purple-500/10 text-purple-400' :
                            log.order_type === 'delivery' ? 'bg-orange-500/10 text-orange-400' :
                            'bg-gray-500/10 text-gray-400'
                          }`}>
                            {log.order_type === 'walkin' ? 'Dine-In' : log.order_type || '—'}
                          </span>
                        </td>
                        {/* Reason / Error */}
                        <td className="px-4 py-3 max-w-[200px]">
                          {reasonText ? (
                            <p
                              className={`text-[11px] truncate ${log.skip_reason ? 'text-yellow-400' : 'text-red-400'}`}
                              title={reasonText}
                            >
                              {reasonText}
                            </p>
                          ) : (
                            <span className="text-gray-600 text-xs">—</span>
                          )}
                        </td>
                        {/* Time */}
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="text-gray-400 text-xs">{fmt(log.sent_at || log.created_at)}</p>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Load more */}
            {hasMore && (
              <div className="p-4 text-center border-t border-gray-700/50">
                <button
                  onClick={loadMore}
                  disabled={loading}
                  className="flex items-center gap-2 mx-auto px-4 py-2 rounded-xl bg-gray-700/50 text-gray-300 text-sm hover:bg-gray-700 transition-colors disabled:opacity-60"
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default function AutoSendLog() {
  return <ProtectedPage permissionKey="MARKETING_AUTO_SEND_LOG" pageName="Auto-Send Log"><AutoSendLogPage /></ProtectedPage>
}
