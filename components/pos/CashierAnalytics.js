'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion } from 'framer-motion'
import {
  X, BarChart2, TrendingUp, ShoppingBag,
  Banknote, Smartphone, CreditCard, Building2,
  Clock, AlertCircle, RefreshCw, Delete,
  Wallet, Layers
} from 'lucide-react'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { supabase } from '../../lib/supabase'
import { getTodaysBusinessDate, getBusinessDayRange } from '../../lib/utils/businessDayUtils'

// ─── helpers ────────────────────────────────────────────────────────────────

function getProfile() {
  try { return JSON.parse(localStorage.getItem('user_profile') || '{}') } catch { return {} }
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(n).toLocaleString('en-PK')
}

const METHOD_META = {
  Cash:      { icon: <Banknote   className="w-3.5 h-3.5" />, color: 'text-green-500',   bg: 'bg-green-500/10'   },
  EasyPaisa: { icon: <Smartphone className="w-3.5 h-3.5" />, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  JazzCash:  { icon: <Smartphone className="w-3.5 h-3.5" />, color: 'text-red-500',     bg: 'bg-red-500/10'     },
  Bank:      { icon: <Building2  className="w-3.5 h-3.5" />, color: 'text-blue-500',    bg: 'bg-blue-500/10'    },
  Account:   { icon: <CreditCard className="w-3.5 h-3.5" />, color: 'text-purple-500',  bg: 'bg-purple-500/10'  },
  Unpaid:    { icon: <AlertCircle className="w-3.5 h-3.5"/>, color: 'text-orange-500',  bg: 'bg-orange-500/10'  },
  Split:     { icon: <Layers     className="w-3.5 h-3.5" />, color: 'text-indigo-500',  bg: 'bg-indigo-500/10'  },
}

function computeStats(orders, splitByMethod) {
  const nonCancelled = orders.filter(o => !['Cancelled', 'cancelled'].includes(o.order_status))
  const cancelled    = orders.filter(o =>  ['Cancelled', 'cancelled'].includes(o.order_status))
  const pending      = nonCancelled.filter(o => ['Pending','Preparing','Ready','Dispatched'].includes(o.order_status))

  const totalRevenue = nonCancelled.reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)

  const byMethod = {}
  Object.keys(METHOD_META).forEach(m => {
    byMethod[m] = nonCancelled
      .filter(o => o.payment_method === m)
      .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
  })

  return {
    totalRevenue,
    totalOrders:    nonCancelled.length,
    cancelledOrders: cancelled.length,
    pendingOrders:  pending.length,
    byMethod,
    splitByMethod,
  }
}

// ─── Calculator ─────────────────────────────────────────────────────────────

function Calculator({ isDark }) {
  const [display, setDisplay] = useState('0')
  const [prev, setPrev]       = useState('')
  const [op, setOp]           = useState(null)
  const [resetNext, setReset] = useState(false)

  // Use refs so keyboard handler always has fresh state
  const stateRef = useRef({ display: '0', prev: '', op: null, resetNext: false })
  useEffect(() => { stateRef.current = { display, prev, op, resetNext } }, [display, prev, op, resetNext])

  const input = useCallback((val) => {
    setDisplay(d => {
      const r = stateRef.current.resetNext
      if (r) { setReset(false); return val === '.' ? '0.' : val }
      if (d === '0' && val !== '.') return val
      if (val === '.' && d.includes('.')) return d
      return d + val
    })
  }, [])

  const operation = useCallback((o) => {
    setPrev(stateRef.current.display)
    setOp(o)
    setReset(true)
  }, [])

  const equals = useCallback(() => {
    const { op: curOp, prev: curPrev, display: curDisplay } = stateRef.current
    if (!curOp || !curPrev) return
    const a = parseFloat(curPrev), b = parseFloat(curDisplay)
    let res
    switch (curOp) {
      case '+': res = a + b; break
      case '−': res = a - b; break
      case '×': res = a * b; break
      case '÷': res = b !== 0 ? a / b : 'Error'; break
      default: return
    }
    const str = typeof res === 'number'
      ? (Number.isInteger(res) ? res.toString() : parseFloat(res.toFixed(8)).toString())
      : res
    setDisplay(str); setPrev(''); setOp(null); setReset(true)
  }, [])

  const clear   = useCallback(() => { setDisplay('0'); setPrev(''); setOp(null); setReset(false) }, [])
  const back    = useCallback(() => setDisplay(d => d.length <= 1 || d === 'Error' ? '0' : d.slice(0, -1)), [])
  const percent = useCallback(() => setDisplay(d => (parseFloat(d) / 100).toString()), [])

  // Keyboard support
  useEffect(() => {
    const handler = (e) => {
      if (e.key >= '0' && e.key <= '9') { e.preventDefault(); input(e.key); return }
      if (e.key === '.') { e.preventDefault(); input('.'); return }
      if (e.key === '+') { e.preventDefault(); operation('+'); return }
      if (e.key === '-') { e.preventDefault(); operation('−'); return }
      if (e.key === '*') { e.preventDefault(); operation('×'); return }
      if (e.key === '/') { e.preventDefault(); operation('÷'); return }
      if (e.key === 'Enter' || e.key === '=') { e.preventDefault(); equals(); return }
      if (e.key === 'Backspace') { e.preventDefault(); back(); return }
      if (e.key === 'Escape' || e.key === 'Delete') { e.preventDefault(); clear(); return }
      if (e.key === '%') { e.preventDefault(); percent(); return }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [input, operation, equals, back, clear, percent])

  const numBtn = isDark ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-white hover:bg-gray-50 text-gray-900 border border-gray-200'
  const opBtn  = (active) => active
    ? 'bg-indigo-500 text-white'
    : isDark ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500/30' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 border border-indigo-200'
  const cardBg = isDark ? 'bg-gray-800' : 'bg-gray-50'
  const border = isDark ? 'border-gray-700' : 'border-gray-200'
  const text   = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec= isDark ? 'text-gray-400' : 'text-gray-500'

  const shortDisplay = display.length > 14 ? parseFloat(display).toExponential(4) : display

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-2">
        <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Calculator</p>
        <p className={`text-[10px] ${textSec}`}>keyboard ready</p>
      </div>

      {/* Display */}
      <div className={`${cardBg} rounded-xl p-3 mb-3 border ${border} flex flex-col items-end justify-end`} style={{ minHeight: 68 }}>
        {prev && op && (
          <p className={`text-[11px] ${textSec} mb-0.5`}>{prev} {op}</p>
        )}
        <p className={`text-3xl font-bold ${text} break-all text-right leading-tight`}>{shortDisplay}</p>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-4 gap-2 flex-1">
        <button onClick={clear}  className="col-span-2 py-3 rounded-xl text-sm font-semibold bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors">AC</button>
        <button onClick={back}   className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors flex items-center justify-center`}><Delete className="w-4 h-4" /></button>
        <button onClick={() => operation('÷')} className={`py-3 rounded-xl text-sm font-bold ${opBtn(op==='÷')} transition-colors`}>÷</button>

        {['7','8','9'].map(d => <button key={d} onClick={() => input(d)} className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>{d}</button>)}
        <button onClick={() => operation('×')} className={`py-3 rounded-xl text-sm font-bold ${opBtn(op==='×')} transition-colors`}>×</button>

        {['4','5','6'].map(d => <button key={d} onClick={() => input(d)} className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>{d}</button>)}
        <button onClick={() => operation('−')} className={`py-3 rounded-xl text-sm font-bold ${opBtn(op==='−')} transition-colors`}>−</button>

        {['1','2','3'].map(d => <button key={d} onClick={() => input(d)} className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>{d}</button>)}
        <button onClick={() => operation('+')} className={`py-3 rounded-xl text-sm font-bold ${opBtn(op==='+')} transition-colors`}>+</button>

        <button onClick={percent}          className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>%</button>
        <button onClick={() => input('0')} className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>0</button>
        <button onClick={() => input('.')} className={`py-3 rounded-xl text-sm font-semibold ${numBtn} transition-colors`}>.</button>
        <button onClick={equals}           className="py-3 rounded-xl text-sm font-bold bg-indigo-500 hover:bg-indigo-600 text-white transition-colors">=</button>
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function CashierAnalytics({ isOpen, onClose, isDark }) {
  const [stats, setStats]     = useState(null)
  const [loading, setLoading] = useState(false)
  const [bizRange, setBizRange] = useState(null)

  const fetchStats = useCallback(async () => {
    setLoading(true)
    try {
      const cashier = authManager.getCashier()
      const user    = authManager.getCurrentUser()
      const cashierId = cashier?.id
      const userId    = user?.id

      const profile   = getProfile()
      const startTime = profile.business_start_time || '10:00'
      const endTime   = profile.business_end_time   || '03:00'

      const todayBiz = getTodaysBusinessDate(startTime, endTime)
      const { startDateTime, endDateTime } = getBusinessDayRange(todayBiz, startTime, endTime)
      setBizRange({ startDateTime, endDateTime, todayBiz })

      const startTs = new Date(startDateTime)
      const endTs   = new Date(endDateTime)

      // Start from cache
      let orders = (cacheManager.cache?.orders || []).filter(o => {
        if (cashierId && o.cashier_id !== cashierId) return false
        const ts = new Date(o.created_at)
        return ts >= startTs && ts < endTs
      })

      let splitByMethod = {}

      // If online, get fresh DB data
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          let query = supabase
            .from('orders')
            .select('id,cashier_id,order_status,payment_method,payment_status,total_amount,created_at')
            .eq('user_id', userId)
            .gte('created_at', startDateTime)
            .lt('created_at', endDateTime)

          if (cashierId) query = query.eq('cashier_id', cashierId)

          const { data, error } = await query
          if (!error && data) orders = data

          // Split payment breakdown via order_payment_transactions
          const splitIds = orders.filter(o => o.payment_method === 'Split').map(o => o.id)
          if (splitIds.length > 0) {
            const { data: txs } = await supabase
              .from('order_payment_transactions')
              .select('payment_method,amount')
              .in('order_id', splitIds)
            ;(txs || []).forEach(tx => {
              splitByMethod[tx.payment_method] = (splitByMethod[tx.payment_method] || 0) + parseFloat(tx.amount)
            })
          }
        } catch {
          // fall through to cached result
        }
      }

      setStats(computeStats(orders, splitByMethod))
    } catch (err) {
      console.error('[CashierAnalytics] error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isOpen) fetchStats()
  }, [isOpen, fetchStats])

  if (!isOpen) return null

  // Theme tokens
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const divider = isDark ? 'divide-gray-700' : 'divide-gray-100'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'

  // Format business window label
  let bizLabel = 'Today\'s business day'
  if (bizRange) {
    const s = new Date(bizRange.startDateTime)
    const e = new Date(bizRange.endDateTime)
    const fmt2 = (d) => d.toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    bizLabel = `${fmt2(s)} → ${fmt2(e)}`
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className={`w-full max-w-4xl ${bg} rounded-2xl shadow-2xl border ${border} overflow-hidden`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${border}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/15">
              <BarChart2 className="w-4.5 h-4.5 text-indigo-500" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className={`text-sm font-bold ${text}`}>My Shift Analytics</h2>
              <p className={`text-[11px] ${textSec}`}>{bizLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              disabled={loading}
              className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg transition-colors ${isDark ? 'bg-indigo-900/40 text-indigo-300 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={onClose}
              className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex" style={{ height: 520 }}>
          {/* ── Left: Stats 60% ── */}
          <div className={`border-r ${border} overflow-y-auto p-4 space-y-2.5`} style={{ width: '60%' }}>
            {loading && !stats ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-400 border-t-transparent" />
              </div>
            ) : stats ? (
              <>
                {/* Revenue + Orders */}
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                    label="Total Revenue"
                    value={`Rs ${fmt(stats.totalRevenue)}`}
                    valueColor="text-emerald-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                  <StatCard
                    icon={<ShoppingBag className="w-4 h-4 text-blue-500" />}
                    label="Orders Processed"
                    value={stats.totalOrders}
                    valueColor="text-blue-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                </div>

                {/* Pending + Cancelled */}
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    icon={<Clock className="w-4 h-4 text-amber-500" />}
                    label="Pending / Active"
                    value={stats.pendingOrders}
                    valueColor="text-amber-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                  <StatCard
                    icon={<X className="w-4 h-4 text-red-500" />}
                    label="Cancelled"
                    value={stats.cancelledOrders}
                    valueColor="text-red-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                </div>

                {/* Payment breakdown */}
                <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2.5`}>Payment Breakdown</p>
                  <div className="space-y-1.5">
                    {Object.entries(stats.byMethod).map(([method, amount]) => {
                      const meta = METHOD_META[method] || { icon: <Wallet className="w-3.5 h-3.5" />, color: textSec, bg: '' }
                      return (
                        <div key={method} className="flex items-center justify-between">
                          <div className={`flex items-center gap-2 ${meta.color}`}>
                            {meta.icon}
                            <span className={`text-xs font-medium ${text}`}>{method}</span>
                          </div>
                          <span className={`text-xs font-bold ${amount > 0 ? text : textSec}`}>
                            {amount > 0 ? `Rs ${fmt(amount)}` : '—'}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Split detail (online only) */}
                {Object.keys(stats.splitByMethod).length > 0 && (
                  <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                    <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2`}>Split Payment Detail</p>
                    <div className="space-y-1.5">
                      {Object.entries(stats.splitByMethod).map(([method, amount]) => {
                        const meta = METHOD_META[method] || { icon: <Wallet className="w-3.5 h-3.5" />, color: textSec }
                        return (
                          <div key={method} className="flex items-center justify-between">
                            <div className={`flex items-center gap-2 ${meta.color}`}>
                              {meta.icon}
                              <span className={`text-xs ${text}`}>{method}</span>
                            </div>
                            <span className={`text-xs font-semibold ${text}`}>Rs {fmt(amount)}</span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className={`flex items-center justify-center h-full text-sm ${textSec}`}>No data</div>
            )}
          </div>

          {/* ── Right: Calculator 40% ── */}
          <div className="p-4 flex flex-col" style={{ width: '40%' }}>
            <Calculator isDark={isDark} />
          </div>
        </div>
      </motion.div>
    </div>
  )
}

function StatCard({ icon, label, value, valueColor, bg, border, text, textSec }) {
  return (
    <div className={`${bg} rounded-xl p-3 border ${border}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>{label}</span>
      </div>
      <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
    </div>
  )
}
