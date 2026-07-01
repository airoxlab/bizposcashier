'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BarChart2, TrendingUp, ShoppingBag,
  Banknote, Smartphone, CreditCard, Building2, Building, DollarSign,
  Clock, AlertCircle, RefreshCw, Delete,
  Wallet, Layers, Gift, Printer, Receipt, User, ArrowLeft
} from 'lucide-react'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { supabase } from '../../lib/supabase'
import { printerManager } from '../../lib/printerManager'
import { notify } from '../ui/NotificationSystem'
import { getTodaysBusinessDate, getBusinessDayRange } from '../../lib/utils/businessDayUtils'

// ─── helpers ────────────────────────────────────────────────────────────────

function getProfile() {
  try { return JSON.parse(localStorage.getItem('user_profile') || localStorage.getItem('user') || '{}') } catch { return {} }
}

function fmt(n) {
  if (n == null || isNaN(n)) return '0'
  return Math.round(n).toLocaleString('en-PK')
}

// Icon map keyed by payment_accounts.icon — same set the My Till page uses so
// the analytics breakdown matches the till visually.
const ICON_MAP = { Wallet, Banknote, Smartphone, Building, Building2, CreditCard, DollarSign, Layers, Gift, AlertCircle }
const getAccountIcon = (name) => ICON_MAP[name] || Wallet

// Fallback icons/colors for the order-STATE buckets (not real till accounts).
const METHOD_META = {
  Account:       { icon: <CreditCard  className="w-3.5 h-3.5" />, color: 'text-purple-500' },
  Unpaid:        { icon: <AlertCircle className="w-3.5 h-3.5" />, color: 'text-orange-500' },
  Split:         { icon: <Layers      className="w-3.5 h-3.5" />, color: 'text-indigo-500' },
  Complimentary: { icon: <Gift        className="w-3.5 h-3.5" />, color: 'text-pink-500'   },
}

// Case-insensitive match of an order/leg payment_method to a till account —
// identical rule to the DB trigger auto_credit_payment_account_from_order_complete
// (LOWER(payment_method_key) = LOWER(method) OR LOWER(name) = LOWER(method)).
function methodMatchesAccount(method, acc) {
  const m = (method || '').toLowerCase().trim()
  if (!m) return false
  const key = (acc.payment_method_key || '').toLowerCase().trim()
  const name = (acc.name || '').toLowerCase().trim()
  return m === key || m === name
}

// Physical cash drawer detection. Uses the canonical 'cash' key, or the whole
// word "cash" in the name (so "Captain Sahb Cash" counts) — but NOT substrings
// like "JazzCash", which is a mobile wallet, not a cash drawer.
function isCashAccount(acc) {
  const key = (acc.payment_method_key || '').toLowerCase().trim()
  if (key === 'cash') return true
  const name = (acc.name || '').toLowerCase()
  return /(^|\s)cash(\s|$)/.test(name)
}

// Sum split-payment legs (keyed by lowercased method) that map to an account.
function splitLegsForAccount(splitByMethod, acc) {
  let total = 0
  Object.entries(splitByMethod || {}).forEach(([m, amt]) => {
    if (methodMatchesAccount(m, acc)) total += parseFloat(amt) || 0
  })
  return total
}

function computeStats(orders, splitByMethod, accounts) {
  const nonCancelled = orders.filter(o => !['Cancelled', 'cancelled'].includes(o.order_status))
  const cancelled    = orders.filter(o =>  ['Cancelled', 'cancelled'].includes(o.order_status))
  const pending      = nonCancelled.filter(o => ['Pending','Preparing','Ready','Dispatched'].includes(o.order_status))

  const totalRevenue = nonCancelled
    .filter(o => (o.payment_method || '').toLowerCase() !== 'complimentary')
    .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)

  // Per configured account: direct (non-split) orders + matching split legs = tender total.
  const accountTotals = (accounts || []).map(acc => {
    const direct = nonCancelled
      .filter(o => o.payment_method !== 'Split' && methodMatchesAccount(o.payment_method, acc))
      .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
    const legs = splitLegsForAccount(splitByMethod, acc)
    return {
      id: acc.id,
      name: acc.name,
      key: acc.payment_method_key,
      icon: acc.icon,
      color: acc.color || '#6366f1',
      isCash: isCashAccount(acc),
      direct,
      legs,
      tender: direct + legs,
    }
  })

  // Order-state buckets (not till accounts): credit / unpaid / complimentary / split.
  const bucketTotal = (name) => nonCancelled
    .filter(o => (o.payment_method || '').toLowerCase() === name)
    .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)

  const special = {
    Account:       bucketTotal('account'),
    Unpaid:        bucketTotal('unpaid'),
    Complimentary: bucketTotal('complimentary'),
    Split:         bucketTotal('split'),
  }

  return {
    totalRevenue,
    totalOrders:     nonCancelled.length,
    cancelledOrders: cancelled.length,
    pendingOrders:   pending.length,
    accountTotals,
    special,
    splitByMethod: splitByMethod || {},
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
  const [raw, setRaw]         = useState(null)   // { orders, splitByMethod }
  const [loading, setLoading] = useState(false)
  const [bizRange, setBizRange] = useState(null)
  const [viewFilter, setViewFilter] = useState('me') // 'all' | 'me' | cashier UUID
  const [cashierList, setCashierList] = useState([])
  const [accounts, setAccounts] = useState([])       // company tender accounts (dynamic)

  // Cash-up / Z-report state
  const [cashupOpen, setCashupOpen] = useState(false)
  const [cashupLoading, setCashupLoading] = useState(false)
  const [cashup, setCashup] = useState(null)
  const [saving, setSaving] = useState(false)

  const stats = useMemo(
    () => (raw ? computeStats(raw.orders, raw.splitByMethod, accounts) : null),
    [raw, accounts]
  )

  // Fetch cashier list + dynamic tender accounts once when opened
  useEffect(() => {
    if (!isOpen) return
    const user = authManager.getCurrentUser()
    if (!user?.id) return

    const fetchCashiers = async () => {
      try {
        const { data } = await supabase
          .from('cashiers')
          .select('id, name')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('name')
        setCashierList(data || [])
      } catch {}
    }

    const fetchAccounts = async () => {
      const cacheKey = `pos_analytics_accounts_${user.id}`
      const online = typeof navigator !== 'undefined' && navigator.onLine
      if (!online) {
        try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c) setAccounts(c) } catch {}
        return
      }
      try {
        const { data } = await supabase
          .from('payment_accounts')
          .select('id,name,payment_method_key,icon,color,sort_order')
          .eq('user_id', user.id)
          .is('cashier_id', null)
          .eq('is_active', true)
          .order('sort_order')
        setAccounts(data || [])
        localStorage.setItem(cacheKey, JSON.stringify(data || []))
      } catch {
        try { const c = JSON.parse(localStorage.getItem(cacheKey) || 'null'); if (c) setAccounts(c) } catch {}
      }
    }

    fetchCashiers()
    fetchAccounts()
  }, [isOpen])

  const fetchStats = useCallback(async (filterOverride) => {
    setLoading(true)
    const activeFilter = filterOverride !== undefined ? filterOverride : viewFilter
    try {
      const cashier = authManager.getCashier()
      const user    = authManager.getCurrentUser()
      const myCashierId = cashier?.id
      const userId    = user?.id

      const profile   = getProfile()
      const startTime = profile.business_start_time || '10:00'
      const endTime   = profile.business_end_time   || '03:00'

      const todayBiz = getTodaysBusinessDate(startTime, endTime)
      const { startDateTime, endDateTime } = getBusinessDayRange(todayBiz, startTime, endTime)
      setBizRange({ startDateTime, endDateTime, todayBiz })

      const startTs = new Date(startDateTime)
      const endTs   = new Date(endDateTime)

      // Determine which cashier to filter by
      const filterCashierId = activeFilter === 'all' ? null
        : activeFilter === 'me' ? myCashierId
        : activeFilter // specific cashier UUID

      // Start from cache
      let orders = (cacheManager.cache?.orders || []).filter(o => {
        if (filterCashierId && o.cashier_id !== filterCashierId && o.order_taker_id !== filterCashierId) return false
        const ts = new Date(o.created_at)
        return ts >= startTs && ts < endTs
      })

      let splitByMethod = {}

      // If online, get fresh DB data
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          let query = supabase
            .from('orders')
            .select('id,cashier_id,order_taker_id,order_status,payment_method,payment_status,total_amount,created_at')
            .eq('user_id', userId)
            .gte('created_at', startDateTime)
            .lt('created_at', endDateTime)

          if (filterCashierId) {
            query = query.or(`cashier_id.eq.${filterCashierId},order_taker_id.eq.${filterCashierId}`)
          }

          const { data, error } = await query
          if (!error && data) orders = data

          // Split payment breakdown via order_payment_transactions (keyed lowercased)
          const splitIds = orders.filter(o => o.payment_method === 'Split').map(o => o.id)
          if (splitIds.length > 0) {
            const { data: txs } = await supabase
              .from('order_payment_transactions')
              .select('payment_method,amount')
              .in('order_id', splitIds)
            ;(txs || []).forEach(tx => {
              const k = (tx.payment_method || '').toLowerCase()
              splitByMethod[k] = (splitByMethod[k] || 0) + (parseFloat(tx.amount) || 0)
            })
          }
        } catch {
          // fall through to cached result
        }
      }

      setRaw({ orders, splitByMethod })
    } catch (err) {
      console.error('[CashierAnalytics] error:', err)
    } finally {
      setLoading(false)
    }
  }, [viewFilter])

  useEffect(() => {
    if (isOpen) fetchStats()
  }, [isOpen, fetchStats])

  // ── Cash-up: gather this cashier's shift figures and open the panel ──
  const openCashReport = useCallback(async () => {
    const cashier = authManager.getCashier()
    const user    = authManager.getCurrentUser()
    if (!cashier?.id || !user?.id) { notify.error('Cash report is only for cashier logins'); return }
    if (!accounts.length)          { notify.error('No payment accounts configured yet'); return }

    setCashupLoading(true)
    setCashupOpen(true)
    try {
      const online = typeof navigator !== 'undefined' && navigator.onLine

      // 1) Shift window = this cashier's current BUSINESS DAY (start → now).
      //    We scope to the same business-day window the analytics already shows —
      //    NOT the raw login session — because re-logins spawn fresh sessions and
      //    any order punched before the latest login would otherwise be dropped
      //    (that mismatch is why the report could read 0 while analytics showed 1).
      //    It stays a per-cashier figure because the orders query filters to this
      //    cashier below.
      const profile   = getProfile()
      const startTime = profile.business_start_time || '10:00'
      const endTime   = profile.business_end_time   || '03:00'
      const todayBiz  = getTodaysBusinessDate(startTime, endTime)
      const { startDateTime } = getBusinessDayRange(todayBiz, startTime, endTime)
      const shiftStart = startDateTime
      const shiftEnd   = new Date().toISOString()

      // Reference the active session id (only for the saved snapshot), if any.
      let sessionId = null
      if (online) {
        try {
          const { data: sess } = await supabase
            .from('cashier_sessions')
            .select('id')
            .eq('cashier_id', cashier.id)
            .eq('is_active', true)
            .order('login_time', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (sess?.id) sessionId = sess.id
        } catch {}
      }

      // 2) This cashier's orders inside the shift window
      let orders = []
      if (online) {
        const { data } = await supabase
          .from('orders')
          .select('id,cashier_id,order_taker_id,order_status,payment_method,total_amount,created_at')
          .eq('user_id', user.id)
          .gte('created_at', shiftStart)
          .lt('created_at', shiftEnd)
          .or(`cashier_id.eq.${cashier.id},order_taker_id.eq.${cashier.id}`)
        orders = data || []
      } else {
        const s = new Date(shiftStart), e = new Date(shiftEnd)
        orders = (cacheManager.cache?.orders || []).filter(o => {
          if (o.cashier_id !== cashier.id && o.order_taker_id !== cashier.id) return false
          const ts = new Date(o.created_at)
          return ts >= s && ts < e
        })
      }
      const nonCancelled = orders.filter(o => !['Cancelled', 'cancelled'].includes(o.order_status))

      // 3) Split legs for split orders (keyed lowercased)
      let splitByMethod = {}
      const splitIds = nonCancelled.filter(o => o.payment_method === 'Split').map(o => o.id)
      if (online && splitIds.length) {
        const { data: txs } = await supabase
          .from('order_payment_transactions')
          .select('payment_method,amount')
          .in('order_id', splitIds)
        ;(txs || []).forEach(tx => {
          const k = (tx.payment_method || '').toLowerCase()
          splitByMethod[k] = (splitByMethod[k] || 0) + (parseFloat(tx.amount) || 0)
        })
      }

      // 4) Cash paid out (expenses paid in cash by this cashier this shift)
      let cashPayouts = 0
      if (online) {
        try {
          const { data: exps } = await supabase
            .from('expenses')
            .select('amount,total_amount,payment_method,created_at,cashier_id')
            .eq('user_id', user.id)
            .eq('cashier_id', cashier.id)
            .gte('created_at', shiftStart)
            .lt('created_at', shiftEnd)
          ;(exps || []).forEach(ex => {
            const m = (ex.payment_method || '').toLowerCase()
            if (m === 'cash' || /(^|\s)cash(\s|$)/.test(m)) {
              cashPayouts += parseFloat(ex.total_amount ?? ex.amount ?? 0) || 0
            }
          })
        } catch {}
      }

      // 5) Opening float default = counted cash from a PRIOR business day's cash-up
      //    (yesterday's closing float carries into today). We deliberately skip
      //    cash-ups from earlier the SAME day — reusing today's counted cash as the
      //    float would double-count today's cash sales.
      let openingFloat = 0
      if (online) {
        try {
          const { data: last } = await supabase
            .from('cashier_cashups')
            .select('total_counted_cash, created_at')
            .eq('cashier_id', cashier.id)
            .lt('created_at', shiftStart)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (last?.total_counted_cash != null) openingFloat = parseFloat(last.total_counted_cash) || 0
        } catch {}
      }

      // 6) Per-account sales this shift (direct + split legs)
      const lines = accounts.map(acc => {
        const isCash = isCashAccount(acc)
        const direct = nonCancelled
          .filter(o => o.payment_method !== 'Split' && methodMatchesAccount(o.payment_method, acc))
          .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
        const legs = splitLegsForAccount(splitByMethod, acc)
        const sales = direct + legs
        // Non-cash tenders default counted = expected; cash starts blank to force a real count.
        const expected = isCash ? (openingFloat + sales - cashPayouts) : sales
        return {
          id: acc.id, name: acc.name, key: acc.payment_method_key,
          icon: acc.icon, color: acc.color || '#6366f1', isCash,
          sales, counted: isCash ? '' : String(Math.round(expected)),
        }
      })

      setCashup({
        shiftStart, shiftEnd, sessionId,
        cashierName: cashier.name || 'Cashier',
        storeName: profile.store_name || profile.customer_name || '',
        orderCount: nonCancelled.length,
        openingFloat: String(Math.round(openingFloat)),
        cashPayouts,
        lines,
      })
    } catch (err) {
      console.error('[CashierAnalytics] cash-up error:', err)
      notify.error('Failed to build cash report')
      setCashupOpen(false)
    } finally {
      setCashupLoading(false)
    }
  }, [accounts])

  const setCounted = (id, val) => {
    setCashup(c => c ? { ...c, lines: c.lines.map(l => l.id === id ? { ...l, counted: val } : l) } : c)
  }
  const setOpeningFloat = (val) => setCashup(c => c ? { ...c, openingFloat: val } : c)

  // Derived cash-up numbers for render + save
  const cashupCalc = useMemo(() => {
    if (!cashup) return null
    const of = parseFloat(cashup.openingFloat) || 0
    const lines = cashup.lines.map(l => {
      const expected = l.isCash ? (of + l.sales - cashup.cashPayouts) : l.sales
      const counted  = (l.counted === '' || l.counted == null) ? expected : (parseFloat(l.counted) || 0)
      return { ...l, expected, counted, overShort: counted - expected }
    })
    const cashLine = lines.find(l => l.isCash) || null
    const totalCollected = lines.reduce((s, l) => s + l.sales, 0)
    return { of, lines, cashLine, totalCollected }
  }, [cashup])

  const doPrintAndSave = useCallback(async () => {
    if (!cashup || !cashupCalc) return
    setSaving(true)
    try {
      const user    = authManager.getCurrentUser()
      const cashier = authManager.getCashier()
      const { of, lines, cashLine, totalCollected } = cashupCalc

      const reportData = {
        title: 'CASH REPORT',
        subtitle: 'SHIFT CLOSE',
        storeName: cashup.storeName,
        cashierName: cashup.cashierName,
        shiftStart: cashup.shiftStart,
        shiftEnd: cashup.shiftEnd,
        orderCount: cashup.orderCount,
        openingFloat: of,
        cashPayouts: cashup.cashPayouts,
        cashSales: cashLine ? cashLine.sales : 0,
        totalCollected,
        currency: 'Rs',
        lines: lines.map(l => ({
          name: l.name, isCash: l.isCash,
          sales: l.sales, expected: l.expected, counted: l.counted, overShort: l.overShort,
        })),
        printedAt: new Date().toISOString(),
      }

      // ── Print ──
      let printed = false
      try {
        if (user?.id && !printerManager.currentUserId) printerManager.setUserId(user.id)
        const printerConfig = await printerManager.getPrinterForPrinting()
        if (!printerConfig) {
          notify.error(printerManager.isElectron() ? 'No thermal printer configured' : 'Printing only available in the desktop app')
        } else {
          const userProfile = getProfile()
          const res = await printerManager.printCashReport(reportData, userProfile, printerConfig)
          if (res?.success) { printed = true; notify.success('Cash report printed') }
          else notify.error('Print failed: ' + (res?.error || res?.message || 'unknown'))
        }
      } catch (e) {
        notify.error('Print error: ' + (e?.message || e))
      }

      // ── Save snapshot (best effort, online only) ──
      if (typeof navigator !== 'undefined' && navigator.onLine && user?.id && cashier?.id) {
        try {
          await supabase.from('cashier_cashups').insert({
            user_id: user.id,
            cashier_id: cashier.id,
            session_id: cashup.sessionId || null,
            shift_start: cashup.shiftStart,
            shift_end: cashup.shiftEnd,
            opening_float: of,
            breakdown: lines.map(l => ({
              account: l.name, key: l.key, is_cash: l.isCash,
              expected: l.expected, counted: l.counted, over_short: l.overShort,
            })),
            total_collected: totalCollected,
            total_expected_cash: cashLine ? cashLine.expected : 0,
            total_counted_cash: cashLine ? cashLine.counted : 0,
            cash_over_short: cashLine ? cashLine.overShort : 0,
            order_count: cashup.orderCount,
          })
        } catch (e) {
          console.warn('[CashierAnalytics] cash-up save failed (non-blocking):', e?.message)
        }
      }

      if (printed) setCashupOpen(false)
    } finally {
      setSaving(false)
    }
  }, [cashup, cashupCalc])

  if (!isOpen) return null

  // Theme tokens
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'

  const isCashier = !!authManager.getCashier()?.id

  // Format business window label
  let bizLabel = 'Today\'s business day'
  if (bizRange) {
    const s = new Date(bizRange.startDateTime)
    const e = new Date(bizRange.endDateTime)
    const fmt2 = (d) => d.toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
    bizLabel = `${fmt2(s)} → ${fmt2(e)}`
  }

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) }
    catch { return '' }
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className={`relative w-full max-w-4xl ${bg} rounded-2xl shadow-2xl border ${border} overflow-hidden`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-3.5 border-b ${border}`}>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/15">
              <BarChart2 className="w-4.5 h-4.5 text-indigo-500" style={{ width: 18, height: 18 }} />
            </div>
            <div>
              <h2 className={`text-sm font-bold ${text}`}>
                {viewFilter === 'all' ? 'Overall Sales' : viewFilter === 'me' ? 'My Shift Analytics' : `${cashierList.find(c => c.id === viewFilter)?.name || 'Cashier'}'s Sales`}
              </h2>
              <p className={`text-[11px] ${textSec}`}>{bizLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isCashier && (
              <button
                onClick={openCashReport}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-emerald-500 hover:bg-emerald-600 text-white"
                title="Print end-of-shift cash report"
              >
                <Printer className="w-3.5 h-3.5" />
                Cash Report
              </button>
            )}
            <select
              value={viewFilter}
              onChange={(e) => {
                const val = e.target.value
                setViewFilter(val)
                fetchStats(val)
              }}
              className={`text-xs px-2 py-1.5 rounded-lg border transition-colors ${isDark ? 'bg-gray-800 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-700'}`}
            >
              <option value="all">All (Overall)</option>
              <option value="me">My Orders</option>
              {cashierList.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={() => fetchStats()}
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

                {/* Payment breakdown — dynamic accounts */}
                <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2.5`}>Payment Breakdown</p>
                  <div className="space-y-1.5">
                    {stats.accountTotals.length === 0 && (
                      <p className={`text-xs ${textSec}`}>No payment accounts configured.</p>
                    )}
                    {stats.accountTotals.map((acc) => {
                      const Icon = getAccountIcon(acc.icon)
                      return (
                        <div key={acc.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2" style={{ color: acc.color }}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className={`text-xs font-medium ${text}`}>{acc.name}</span>
                          </div>
                          <span className={`text-xs font-bold ${acc.tender > 0 ? text : textSec}`}>
                            {acc.tender > 0 ? `Rs ${fmt(acc.tender)}` : '—'}
                          </span>
                        </div>
                      )
                    })}

                    {/* Order-state buckets (only when non-zero) */}
                    {['Account', 'Unpaid', 'Complimentary'].map((k) => {
                      const amount = stats.special[k] || 0
                      if (amount <= 0) return null
                      const meta = METHOD_META[k]
                      return (
                        <div key={k} className={`flex items-center justify-between pt-1.5 mt-1.5 border-t ${border}`}>
                          <div className={`flex items-center gap-2 ${meta.color}`}>
                            {meta.icon}
                            <span className={`text-xs font-medium ${text}`}>{k === 'Account' ? 'Account (Credit)' : k}</span>
                          </div>
                          <span className={`text-xs font-bold ${text}`}>Rs {fmt(amount)}</span>
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
                      {Object.entries(stats.splitByMethod).map(([method, amount]) => (
                        <div key={method} className="flex items-center justify-between">
                          <div className={`flex items-center gap-2 ${textSec}`}>
                            <Layers className="w-3.5 h-3.5" />
                            <span className={`text-xs capitalize ${text}`}>{method}</span>
                          </div>
                          <span className={`text-xs font-semibold ${text}`}>Rs {fmt(amount)}</span>
                        </div>
                      ))}
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

        {/* ── Cash-up / Z-report overlay ── */}
        <AnimatePresence>
          {cashupOpen && (
            <CashUpPanel
              isDark={isDark}
              loading={cashupLoading}
              saving={saving}
              cashup={cashup}
              calc={cashupCalc}
              fmtTime={fmtTime}
              onCounted={setCounted}
              onOpeningFloat={setOpeningFloat}
              onClose={() => setCashupOpen(false)}
              onPrint={doPrintAndSave}
            />
          )}
        </AnimatePresence>
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

// ─── Cash-Up panel (shift close / Z-report) ──────────────────────────────────

function CashUpPanel({ isDark, loading, saving, cashup, calc, fmtTime, onCounted, onOpeningFloat, onClose, onPrint }) {
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'
  const inputCls = `w-28 text-right text-xs px-2 py-1 rounded-lg border tabular-nums ${isDark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:border-indigo-500`

  const money = (n) => `Rs ${fmt(n)}`
  const overShortColor = (v) => v === 0 ? textSec : v > 0 ? 'text-blue-500' : 'text-red-500'
  const overShortLabel = (v) => v === 0 ? 'Balanced' : v > 0 ? `Over ${money(v)}` : `Short ${money(Math.abs(v))}`

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`absolute inset-0 z-10 flex flex-col ${bg}`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-5 py-3.5 border-b ${border}`}>
        <div className="flex items-center gap-2.5">
          <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="p-2 rounded-xl bg-emerald-500/15">
            <Receipt className="w-4.5 h-4.5 text-emerald-500" style={{ width: 18, height: 18 }} />
          </div>
          <div>
            <h2 className={`text-sm font-bold ${text}`}>Cash Report — Shift Close</h2>
            <p className={`text-[11px] ${textSec} flex items-center gap-1.5`}>
              {cashup && (
                <>
                  <User className="w-3 h-3" />{cashup.cashierName}
                  <span className="opacity-40">·</span>
                  {fmtTime(cashup.shiftStart)} → now
                </>
              )}
            </p>
          </div>
        </div>
        <button onClick={onClose} className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 470 }}>
        {loading || !calc ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Meta strip */}
            <div className="grid grid-cols-3 gap-2">
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Orders</p>
                <p className={`text-sm font-bold ${text}`}>{cashup.orderCount}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Collected</p>
                <p className={`text-sm font-bold text-emerald-500`}>{money(calc.totalCollected)}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Cash Payouts</p>
                <p className={`text-sm font-bold text-red-500`}>{money(cashup.cashPayouts)}</p>
              </div>
            </div>

            {/* Cash drawer block */}
            {calc.cashLine && (
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Banknote className="w-4 h-4 text-green-500" />
                  <span className={`text-xs font-bold ${text}`}>{calc.cashLine.name} (Drawer)</span>
                </div>
                <div className="space-y-1.5 text-xs">
                  <Row label="Opening float" textSec={textSec}>
                    <input
                      type="number" inputMode="decimal" value={cashup.openingFloat}
                      onChange={(e) => onOpeningFloat(e.target.value)}
                      className={inputCls}
                    />
                  </Row>
                  <Row label="+ Cash sales" textSec={textSec}><span className={text}>{money(calc.cashLine.sales)}</span></Row>
                  <Row label="− Cash payouts" textSec={textSec}><span className={text}>{money(cashup.cashPayouts)}</span></Row>
                  <div className={`flex items-center justify-between pt-1.5 border-t ${border}`}>
                    <span className={`font-semibold ${text}`}>= Expected in drawer</span>
                    <span className={`font-bold ${text}`}>{money(calc.cashLine.expected)}</span>
                  </div>
                  <Row label="Counted cash" textSec={textSec}>
                    <input
                      type="number" inputMode="decimal" value={cashup.lines.find(l => l.id === calc.cashLine.id)?.counted ?? ''}
                      placeholder="0" onChange={(e) => onCounted(calc.cashLine.id, e.target.value)}
                      className={inputCls}
                    />
                  </Row>
                  <div className={`flex items-center justify-between pt-1.5 border-t ${border}`}>
                    <span className={`font-semibold ${text}`}>Over / (Short)</span>
                    <span className={`font-bold ${overShortColor(calc.cashLine.overShort)}`}>{overShortLabel(calc.cashLine.overShort)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Non-cash tenders */}
            <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
              <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2`}>Other Tenders (reconciliation)</p>
              <div className="space-y-2">
                {calc.lines.filter(l => !l.isCash).length === 0 && (
                  <p className={`text-xs ${textSec}`}>No non-cash tenders this shift.</p>
                )}
                {calc.lines.filter(l => !l.isCash).map((l) => {
                  const Icon = getAccountIcon(l.icon)
                  const rawCounted = cashup.lines.find(x => x.id === l.id)?.counted ?? ''
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0" style={{ color: l.color }}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <span className={`text-xs font-medium truncate ${text}`}>{l.name}</span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs ${textSec}`}>Exp {money(l.expected)}</span>
                        <input
                          type="number" inputMode="decimal" value={rawCounted}
                          onChange={(e) => onCounted(l.id, e.target.value)}
                          className={inputCls}
                        />
                        <span className={`text-[11px] w-20 text-right font-semibold ${overShortColor(l.overShort)}`}>
                          {l.overShort === 0 ? '✓' : (l.overShort > 0 ? '+' : '') + fmt(l.overShort)}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 px-4 py-3 border-t ${border} flex items-center gap-3`}>
        <p className={`text-[11px] ${textSec} flex-1`}>
          Prints on the thermal printer and saves a snapshot your admin can reconcile. It does not log you out or move money.
        </p>
        <button
          onClick={onPrint}
          disabled={saving || loading || !calc}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 text-white transition-colors"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Printer className="w-4 h-4" />}
          Print &amp; Save
        </button>
      </div>
    </motion.div>
  )
}

function Row({ label, children, textSec }) {
  return (
    <div className="flex items-center justify-between">
      <span className={textSec}>{label}</span>
      {children}
    </div>
  )
}
