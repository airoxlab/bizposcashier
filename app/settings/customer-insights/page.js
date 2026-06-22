'use client'

import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Search, RefreshCw, X, Star, ChevronRight,
  ShoppingBag, TrendingUp, Award, CreditCard, Users,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { supabase } from '../../../lib/supabase'
import { notify } from '../../../components/ui/NotificationSystem'

// ─── helpers ─────────────────────────────────────────────────────────────────
const fmt = (n) =>
  'Rs ' + (n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

const fmtDate = (d) => {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })
}

function tierBadgeClass(tier, isDark) {
  const map = {
    GOLD:   isDark ? 'text-yellow-400 bg-yellow-900/20 border-yellow-700/40' : 'text-yellow-700 bg-yellow-50 border-yellow-200',
    SILVER: isDark ? 'text-slate-300 bg-slate-700/40 border-slate-600/40'    : 'text-slate-600 bg-slate-100 border-slate-300',
    BRONZE: isDark ? 'text-amber-400 bg-amber-900/20 border-amber-700/40'    : 'text-amber-700 bg-amber-50 border-amber-200',
  }
  return map[tier] || ''
}

function tierTextClass(tier, isDark) {
  const map = {
    GOLD:   isDark ? 'text-yellow-400' : 'text-yellow-700',
    SILVER: isDark ? 'text-slate-300'  : 'text-slate-600',
    BRONZE: isDark ? 'text-amber-400'  : 'text-amber-700',
  }
  return map[tier] || ''
}

const STAT_CARD = [
  { key: 'orders',  label: 'Total Orders',    icon: ShoppingBag, color: 'purple' },
  { key: 'spent',   label: 'Net Spent',        icon: TrendingUp,  color: 'green'  },
  { key: 'loyalty', label: 'Loyalty Points',   icon: Award,       color: 'amber'  },
  { key: 'balance', label: 'Account Balance',  icon: CreditCard,  color: 'blue'   },
]

const iconBg = {
  purple: 'bg-purple-100 text-purple-600',
  green:  'bg-green-100 text-green-600',
  amber:  'bg-amber-100 text-amber-600',
  blue:   'bg-blue-100 text-blue-600',
}
const iconBgDark = {
  purple: 'bg-purple-900/30 text-purple-400',
  green:  'bg-green-900/30 text-green-400',
  amber:  'bg-amber-900/30 text-amber-400',
  blue:   'bg-blue-900/30 text-blue-400',
}

// ─── main component ───────────────────────────────────────────────────────────
export function CustomerInsightsPanel() {
  const classes = themeManager.getClasses()
  const isDark  = themeManager.isDark()

  // list state
  const [loading, setLoading]       = useState(false)
  const [customers, setCustomers]   = useState([])
  const [orderStats, setOrderStats] = useState({})
  const [loyaltyMap, setLoyaltyMap] = useState({})
  const [search, setSearch]         = useState('')
  const [sortBy, setSortBy]         = useState('netSpent')

  // detail state
  const [selected, setSelected]           = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [detailOrders, setDetailOrders]   = useState([])
  const [detailLoyLog, setDetailLoyLog]   = useState([])
  const [detailLedger, setDetailLedger]   = useState([])
  const [detailReviews, setDetailReviews] = useState([])
  const [detailTab, setDetailTab]         = useState('orders')

  // ── load list data ──────────────────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true)
    try {
      const uid = authManager.getCurrentUser()?.id
      const [custRes, ordRes, loyRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id,full_name,phone,email,account_balance,credit_limit,created_at')
          .eq('user_id', uid)
          .order('full_name'),
        supabase
          .from('orders')
          .select('customer_id,total_amount,order_date,order_type,order_status,payment_status')
          .eq('user_id', uid)
          .not('customer_id', 'is', null),
        supabase
          .from('customer_loyalty_points')
          .select('customer_id,current_balance,total_points_earned,points_redeemed,loyalty_tier,last_earned_at')
          .eq('user_id', uid),
      ])
      if (custRes.error) throw custRes.error

      // build order aggregates in JS (avoids N+1)
      const stats = {}
      for (const o of (ordRes.data || [])) {
        if (!o.customer_id) continue
        if (!stats[o.customer_id]) stats[o.customer_id] = { count: 0, netSpent: 0, lastDate: null, firstDate: null }
        const s = stats[o.customer_id]
        s.count++
        s.netSpent += Number(o.total_amount || 0)
        const d = o.order_date
        if (!s.lastDate  || d > s.lastDate)  s.lastDate  = d
        if (!s.firstDate || d < s.firstDate) s.firstDate = d
      }
      for (const id in stats) {
        stats[id].avgOrder = stats[id].count ? stats[id].netSpent / stats[id].count : 0
      }

      const lMap = {}
      for (const l of (loyRes.data || [])) lMap[l.customer_id] = l

      setCustomers(custRes.data || [])
      setOrderStats(stats)
      setLoyaltyMap(lMap)
    } catch {
      notify.error('Failed to load customer insights')
    } finally {
      setLoading(false)
    }
  }

  // ── load single-customer detail ─────────────────────────────────────────────
  const loadDetail = async (customer) => {
    setDetailLoading(true)
    setDetailOrders([])
    setDetailLoyLog([])
    setDetailLedger([])
    setDetailReviews([])
    try {
      const [ordRes, loyLogRes, ledRes, revRes] = await Promise.all([
        supabase
          .from('orders')
          .select('id,order_number,order_type,total_amount,payment_method,payment_status,order_status,order_date,service_charge_amount,discount_amount,loyalty_discount_amount')
          .eq('customer_id', customer.id)
          .order('order_date', { ascending: false })
          .limit(50),
        supabase
          .from('loyalty_points_log')
          .select('id,transaction_type,points,balance_before,balance_after,rule_name,notes,order_total,created_at')
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(50),
        supabase
          .from('customer_ledger')
          .select('id,transaction_type,transaction_date,amount,balance_before,balance_after,description,notes')
          .eq('customer_id', customer.id)
          .order('transaction_date', { ascending: false })
          .limit(50),
        supabase
          .from('order_reviews')
          .select('overall_rating,comment,reviewed_at')
          .eq('customer_id', customer.id)
          .eq('is_reviewed', true)
          .order('reviewed_at', { ascending: false })
          .limit(30),
      ])
      setDetailOrders(ordRes.data    || [])
      setDetailLoyLog(loyLogRes.data || [])
      setDetailLedger(ledRes.data    || [])
      setDetailReviews(revRes.data   || [])
    } catch {
      notify.error('Failed to load customer details')
    } finally {
      setDetailLoading(false)
    }
  }

  useEffect(() => { loadData() }, [])

  const openDetail = (c) => {
    setSelected(c)
    setDetailTab('orders')
    loadDetail(c)
  }

  // ── enriched list (filtered + sorted) ──────────────────────────────────────
  const enriched = useMemo(() => {
    const q = search.toLowerCase()
    return customers
      .map(c => ({
        ...c,
        stat:    orderStats[c.id] || { count: 0, netSpent: 0, avgOrder: 0, lastDate: null, firstDate: null },
        loyalty: loyaltyMap[c.id] || null,
      }))
      .filter(c =>
        !q ||
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.email || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortBy === 'netSpent')     return (b.stat.netSpent || 0) - (a.stat.netSpent || 0)
        if (sortBy === 'totalOrders')  return (b.stat.count || 0) - (a.stat.count || 0)
        if (sortBy === 'loyalty')      return (b.loyalty?.current_balance || 0) - (a.loyalty?.current_balance || 0)
        return (a.full_name || a.phone || '').localeCompare(b.full_name || b.phone || '')
      })
  }, [customers, orderStats, loyaltyMap, search, sortBy])

  // ── selected-customer helpers ───────────────────────────────────────────────
  const selStat    = selected ? orderStats[selected.id]  || {} : {}
  const selLoyalty = selected ? loyaltyMap[selected.id]  || null : null
  const avgRating  = detailReviews.length
    ? (detailReviews.reduce((s, r) => s + (r.overall_rating || 0), 0) / detailReviews.length).toFixed(1)
    : null

  const statValues = selected
    ? {
        orders:  selStat.count ?? 0,
        spent:   fmt(selStat.netSpent),
        loyalty: selLoyalty?.current_balance ?? 0,
        balance: fmt(selected.account_balance),
      }
    : {}

  // ── tabs ────────────────────────────────────────────────────────────────────
  const TABS = [
    { id: 'orders',  label: 'Orders',  count: detailOrders.length  },
    { id: 'loyalty', label: 'Loyalty', count: detailLoyLog.length  },
    { id: 'ledger',  label: 'Ledger',  count: detailLedger.length  },
    { id: 'reviews', label: 'Reviews', count: detailReviews.length },
  ]

  return (
    <motion.div
      key="customer-insights"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      {/* ── toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <span className={`text-sm ${classes.textSecondary}`}>
          {enriched.length} customer{enriched.length !== 1 ? 's' : ''}
          {enriched.length > 0 && ` · Rs ${enriched.reduce((s, c) => s + (c.stat.netSpent || 0), 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })} total revenue`}
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <Search className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search name, phone or email..."
              className={`text-xs bg-transparent outline-none w-48 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
            />
            {search && (
              <button onClick={() => setSearch('')} className={isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className={`text-xs px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200' : 'bg-white border-gray-200 text-gray-700'}`}
          >
            <option value="netSpent">Sort: Net Spent</option>
            <option value="totalOrders">Sort: Total Orders</option>
            <option value="loyalty">Sort: Loyalty Points</option>
            <option value="name">Sort: Name A–Z</option>
          </select>
          <button
            onClick={loadData}
            className={`p-2 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── customer list ─────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex justify-center py-14">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
        </div>
      ) : enriched.length === 0 ? (
        <div className={`rounded-xl border py-14 text-center ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <Users className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
          <p className={`text-sm ${classes.textSecondary}`}>
            {search ? 'No customers match your search' : 'No customers yet'}
          </p>
        </div>
      ) : (
        <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <table className="w-full text-xs">
            <thead>
              <tr className={`border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                {['Customer', 'Orders', 'Net Spent', 'Avg Order', 'Loyalty', 'Balance', 'Last Order', ''].map(h => (
                  <th key={h} className={`px-3 py-2 text-left font-semibold text-[10px] uppercase tracking-wide ${classes.textSecondary}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((c, i) => (
                <tr
                  key={c.id}
                  onClick={() => openDetail(c)}
                  className={`border-b cursor-pointer transition-colors ${
                    isDark ? 'border-gray-700/50 hover:bg-purple-900/10' : 'border-gray-100 hover:bg-purple-50/40'
                  } ${i % 2 === 1 ? isDark ? 'bg-gray-800/20' : 'bg-gray-50/30' : ''}`}
                >
                  <td className="px-3 py-2.5">
                    <div className={`font-semibold ${classes.textPrimary}`}>{c.full_name || '—'}</div>
                    <div className={`text-[10px] ${classes.textSecondary}`}>{c.phone || '—'}</div>
                  </td>
                  <td className={`px-3 py-2.5 font-medium ${classes.textPrimary}`}>{c.stat.count}</td>
                  <td className={`px-3 py-2.5 font-semibold ${c.stat.netSpent > 0 ? 'text-green-600' : classes.textSecondary}`}>
                    {c.stat.netSpent > 0 ? fmt(c.stat.netSpent) : '—'}
                  </td>
                  <td className={`px-3 py-2.5 ${classes.textSecondary}`}>
                    {c.stat.avgOrder > 0 ? fmt(c.stat.avgOrder) : '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    {c.loyalty?.loyalty_tier ? (
                      <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${tierBadgeClass(c.loyalty.loyalty_tier, isDark)}`}>
                        {c.loyalty.loyalty_tier}
                      </span>
                    ) : c.loyalty?.current_balance > 0 ? (
                      <span className={`text-[10px] ${classes.textSecondary}`}>{c.loyalty.current_balance} pts</span>
                    ) : (
                      <span className={`text-[10px] ${classes.textSecondary}`}>—</span>
                    )}
                  </td>
                  <td className={`px-3 py-2.5 text-[11px] ${(c.account_balance || 0) !== 0 ? 'text-blue-500 font-medium' : classes.textSecondary}`}>
                    {(c.account_balance || 0) !== 0 ? fmt(c.account_balance) : '—'}
                  </td>
                  <td className={`px-3 py-2.5 text-[10px] ${classes.textSecondary}`}>{fmtDate(c.stat.lastDate)}</td>
                  <td className="px-3 py-2.5">
                    <ChevronRight className={`w-3.5 h-3.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── detail slide-over ─────────────────────────────────────────────────── */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40"
            onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}
          >
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={`w-full max-w-2xl flex flex-col shadow-2xl ${isDark ? 'bg-gray-900' : 'bg-white'}`}
            >
              {/* header */}
              <div className={`px-5 py-4 border-b flex-shrink-0 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h2 className={`text-base font-bold ${classes.textPrimary}`}>
                      {selected.full_name || selected.phone}
                    </h2>
                    <div className={`flex flex-wrap gap-x-3 text-[11px] mt-0.5 ${classes.textSecondary}`}>
                      {selected.phone   && <span>{selected.phone}</span>}
                      {selected.email   && <span>{selected.email}</span>}
                      {selected.created_at && <span>Since {fmtDate(selected.created_at)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className={`p-1.5 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* stat cards */}
                <div className="grid grid-cols-4 gap-2">
                  {STAT_CARD.map(({ key, label, icon: Icon, color }) => (
                    <div key={key} className={`rounded-xl p-2.5 ${isDark ? 'bg-gray-700/60' : 'bg-white border border-gray-200'}`}>
                      <div className={`w-6 h-6 rounded-lg flex items-center justify-center mb-1.5 ${isDark ? iconBgDark[color] : iconBg[color]}`}>
                        <Icon className="w-3 h-3" />
                      </div>
                      <div className={`text-sm font-bold leading-tight ${classes.textPrimary}`}>{String(statValues[key] ?? '—')}</div>
                      <div className={`text-[10px] mt-0.5 ${classes.textSecondary}`}>{label}</div>
                    </div>
                  ))}
                </div>

                {/* secondary info row */}
                <div className={`flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t text-[11px] ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                  {selStat.avgOrder > 0 && (
                    <span className={classes.textSecondary}>Avg order: <b className={classes.textPrimary}>{fmt(selStat.avgOrder)}</b></span>
                  )}
                  {selLoyalty?.loyalty_tier && (
                    <span className={classes.textSecondary}>
                      Tier: <b className={tierTextClass(selLoyalty.loyalty_tier, isDark)}>{selLoyalty.loyalty_tier}</b>
                    </span>
                  )}
                  {selLoyalty?.total_points_earned > 0 && (
                    <span className={classes.textSecondary}>Lifetime pts: <b className={classes.textPrimary}>{selLoyalty.total_points_earned}</b></span>
                  )}
                  {selLoyalty?.points_redeemed > 0 && (
                    <span className={classes.textSecondary}>Redeemed: <b className={classes.textPrimary}>{selLoyalty.points_redeemed}</b></span>
                  )}
                  {avgRating && (
                    <span className={classes.textSecondary}>Avg rating: <b className="text-yellow-500">{avgRating} ★</b></span>
                  )}
                  {selStat.firstDate && (
                    <span className={classes.textSecondary}>First order: <b className={classes.textPrimary}>{fmtDate(selStat.firstDate)}</b></span>
                  )}
                  {selected.credit_limit > 0 && (
                    <span className={classes.textSecondary}>Credit limit: <b className={classes.textPrimary}>{fmt(selected.credit_limit)}</b></span>
                  )}
                </div>
              </div>

              {/* tabs */}
              <div className={`flex flex-shrink-0 border-b text-xs font-semibold ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                {TABS.map(tab => (
                  <button
                    key={tab.id}
                    onClick={() => setDetailTab(tab.id)}
                    className={`px-4 py-2.5 border-b-2 transition-colors flex items-center gap-1.5 ${
                      detailTab === tab.id
                        ? `border-purple-500 ${isDark ? 'text-purple-400' : 'text-purple-600'}`
                        : `border-transparent ${classes.textSecondary} hover:text-gray-700`
                    }`}
                  >
                    {tab.label}
                    {tab.count > 0 && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${
                        detailTab === tab.id
                          ? isDark ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-100 text-purple-700'
                          : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* tab content */}
              <div className="flex-1 overflow-y-auto p-4">
                {detailLoading ? (
                  <div className="flex justify-center py-12">
                    <RefreshCw className="w-5 h-5 animate-spin text-purple-500" />
                  </div>
                ) : (
                  <>
                    {/* ── orders ── */}
                    {detailTab === 'orders' && (
                      detailOrders.length === 0 ? (
                        <p className={`text-center py-10 text-sm ${classes.textSecondary}`}>No orders found</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                              {['Order #', 'Date', 'Type', 'Amount', 'Method', 'Status'].map(h => (
                                <th key={h} className={`pb-2 text-left text-[10px] font-semibold uppercase tracking-wide ${classes.textSecondary}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailOrders.map(o => (
                              <tr key={o.id} className={`border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                                <td className={`py-2 pr-2 font-mono text-[10px] ${classes.textPrimary}`}>{o.order_number}</td>
                                <td className={`py-2 pr-2 ${classes.textSecondary}`}>{fmtDate(o.order_date)}</td>
                                <td className="py-2 pr-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium capitalize ${
                                    o.order_type === 'delivery' ? (isDark ? 'bg-orange-900/30 text-orange-400' : 'bg-orange-50 text-orange-600') :
                                    o.order_type === 'takeaway' ? (isDark ? 'bg-green-900/30 text-green-400'  : 'bg-green-50 text-green-600') :
                                    (isDark ? 'bg-blue-900/30 text-blue-400' : 'bg-blue-50 text-blue-600')
                                  }`}>{o.order_type}</span>
                                </td>
                                <td className={`py-2 pr-2 font-semibold ${classes.textPrimary}`}>{fmt(o.total_amount)}</td>
                                <td className={`py-2 pr-2 text-[10px] capitalize ${classes.textSecondary}`}>{o.payment_method}</td>
                                <td className="py-2">
                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${
                                    o.order_status === 'Completed' ? (isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600') :
                                    o.order_status === 'Cancelled' ? (isDark ? 'bg-red-900/30 text-red-400'   : 'bg-red-50 text-red-500')   :
                                    (isDark ? 'bg-yellow-900/30 text-yellow-400' : 'bg-yellow-50 text-yellow-600')
                                  }`}>{o.order_status}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}

                    {/* ── loyalty ── */}
                    {detailTab === 'loyalty' && (
                      <>
                        {selLoyalty ? (
                          <div className={`grid grid-cols-3 gap-3 mb-4 p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-amber-50 border border-amber-100'}`}>
                            <div>
                              <div className={`text-[10px] mb-0.5 ${classes.textSecondary}`}>Current Balance</div>
                              <div className={`text-lg font-bold ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>{selLoyalty.current_balance} pts</div>
                            </div>
                            <div>
                              <div className={`text-[10px] mb-0.5 ${classes.textSecondary}`}>Total Earned</div>
                              <div className={`text-base font-bold ${classes.textPrimary}`}>{selLoyalty.total_points_earned}</div>
                            </div>
                            <div>
                              <div className={`text-[10px] mb-0.5 ${classes.textSecondary}`}>Redeemed</div>
                              <div className={`text-base font-bold ${classes.textPrimary}`}>{selLoyalty.points_redeemed}</div>
                            </div>
                          </div>
                        ) : (
                          <div className={`mb-4 p-3 rounded-xl text-center text-xs ${isDark ? 'bg-gray-800 text-gray-500' : 'bg-gray-50 text-gray-400 border border-gray-200'}`}>
                            No loyalty account for this customer
                          </div>
                        )}
                        {detailLoyLog.length === 0 ? (
                          <p className={`text-center py-8 text-sm ${classes.textSecondary}`}>No loyalty transactions</p>
                        ) : (
                          <table className="w-full text-xs">
                            <thead>
                              <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                                {['Date', 'Type', 'Points', 'Balance After', 'Rule / Note'].map(h => (
                                  <th key={h} className={`pb-2 text-left text-[10px] font-semibold uppercase ${classes.textSecondary}`}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {detailLoyLog.map(l => (
                                <tr key={l.id} className={`border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                                  <td className={`py-2 pr-2 ${classes.textSecondary}`}>{fmtDate(l.created_at)}</td>
                                  <td className="py-2 pr-2">
                                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium capitalize ${
                                      l.transaction_type === 'earn'
                                        ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
                                        : isDark ? 'bg-red-900/30 text-red-400'     : 'bg-red-50 text-red-500'
                                    }`}>{l.transaction_type}</span>
                                  </td>
                                  <td className={`py-2 pr-2 font-semibold ${l.points > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                    {l.points > 0 ? '+' : ''}{l.points}
                                  </td>
                                  <td className={`py-2 pr-2 ${classes.textSecondary}`}>{l.balance_after ?? '—'}</td>
                                  <td className={`py-2 ${classes.textSecondary} text-[10px]`}>{l.rule_name || l.notes || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </>
                    )}

                    {/* ── ledger ── */}
                    {detailTab === 'ledger' && (
                      detailLedger.length === 0 ? (
                        <p className={`text-center py-8 text-sm ${classes.textSecondary}`}>No ledger entries</p>
                      ) : (
                        <table className="w-full text-xs">
                          <thead>
                            <tr className={`border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                              {['Date', 'Type', 'Amount', 'Balance After', 'Description'].map(h => (
                                <th key={h} className={`pb-2 text-left text-[10px] font-semibold uppercase ${classes.textSecondary}`}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {detailLedger.map(l => (
                              <tr key={l.id} className={`border-b ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                                <td className={`py-2 pr-2 ${classes.textSecondary}`}>{fmtDate(l.transaction_date)}</td>
                                <td className="py-2 pr-2">
                                  <span className={`text-[9px] px-1.5 py-0.5 rounded font-medium capitalize ${
                                    l.transaction_type === 'credit'
                                      ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-50 text-green-600'
                                      : isDark ? 'bg-red-900/30 text-red-400'     : 'bg-red-50 text-red-500'
                                  }`}>{l.transaction_type}</span>
                                </td>
                                <td className={`py-2 pr-2 font-semibold ${l.transaction_type === 'credit' ? 'text-green-500' : 'text-red-500'}`}>
                                  {fmt(l.amount)}
                                </td>
                                <td className={`py-2 pr-2 ${classes.textSecondary}`}>{fmt(l.balance_after)}</td>
                                <td className={`py-2 ${classes.textSecondary} text-[10px] max-w-[180px]`}>
                                  <span className="truncate block">{l.description}</span>
                                  {l.notes && <span className={`block mt-0.5 ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>{l.notes}</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )
                    )}

                    {/* ── reviews ── */}
                    {detailTab === 'reviews' && (
                      detailReviews.length === 0 ? (
                        <p className={`text-center py-8 text-sm ${classes.textSecondary}`}>No reviews yet</p>
                      ) : (
                        <div className="space-y-3">
                          {avgRating && (
                            <div className={`flex items-center gap-2 p-3 rounded-xl mb-2 ${isDark ? 'bg-gray-800' : 'bg-yellow-50 border border-yellow-100'}`}>
                              <Star className="w-5 h-5 text-yellow-500 fill-yellow-400 flex-shrink-0" />
                              <span className={`text-xl font-bold ${isDark ? 'text-yellow-400' : 'text-yellow-600'}`}>{avgRating}</span>
                              <span className={`text-xs ${classes.textSecondary}`}>
                                avg across {detailReviews.length} review{detailReviews.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                          )}
                          {detailReviews.map((r, i) => (
                            <div
                              key={i}
                              className={`p-3 rounded-xl ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-gray-50 border border-gray-200'}`}
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex gap-0.5">
                                  {[1, 2, 3, 4, 5].map(s => (
                                    <Star
                                      key={s}
                                      className={`w-3.5 h-3.5 ${
                                        s <= (r.overall_rating || 0)
                                          ? 'text-yellow-400 fill-yellow-400'
                                          : isDark ? 'text-gray-700' : 'text-gray-200'
                                      }`}
                                    />
                                  ))}
                                </div>
                                <span className={`text-[10px] ${classes.textSecondary}`}>{fmtDate(r.reviewed_at)}</span>
                              </div>
                              {r.comment && <p className={`text-xs mt-1 ${classes.textSecondary}`}>{r.comment}</p>}
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function Page() { return null }
