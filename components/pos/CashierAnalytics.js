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

// Overall shift figures derived from ORDERS alone (no per-account split).
// "Credit" = money NOT collected this shift: customer-account (khata) sales +
// unpaid tabs. Complimentary orders are free, so they are excluded from both
// total sales and credit. total_amount is already net of discounts, so the
// discount total is informational and does not feed cash-in-hand.
function orderSummary(orders) {
  const nonCancelled = orders.filter(o => !['Cancelled', 'cancelled'].includes(o.order_status))
  const isCredit = (m) => { const x = (m || '').toLowerCase(); return x === 'account' || x === 'unpaid' }
  const isComp   = (m) => (m || '').toLowerCase() === 'complimentary'
  const amt      = (o) => parseFloat(o.total_amount || 0)
  const creditRows = nonCancelled.filter(o => isCredit(o.payment_method))
  return {
    totalOrders:    nonCancelled.length,
    creditOrders:   creditRows.length,
    totalSales:     nonCancelled.filter(o => !isComp(o.payment_method)).reduce((s, o) => s + amt(o), 0),
    creditSales:    creditRows.reduce((s, o) => s + amt(o), 0),
    totalDiscounts: nonCancelled.reduce((s, o) => s + (parseFloat(o.discount_amount || 0) + parseFloat(o.loyalty_discount_amount || 0)), 0),
  }
}

// Cash paid OUT this shift (overall): business expenses + supplier/PO payments
// ("payorders"). The Expenses-page "pay supplier" flow writes BOTH a
// supplier_payments row AND an expenses breadcrumb tagged source_type
// 'supplier_payment'; we count that cash once by EXCLUDING the breadcrumb from
// expenses (it is already captured under payorders). Attribution mirrors the
// orders scope so the on-screen figures and the printed report always agree.
async function fetchMoneyOut({ userId, subjectCashierId, ownerMode, startISO, endISO }) {
  let totalExpense = 0, payorders = 0
  try {
    let q = supabase.from('expenses')
      .select('amount,total_amount,source_type,cashier_id,created_at')
      .eq('user_id', userId)
      .gte('created_at', startISO)
      .lt('created_at', endISO)
    if (subjectCashierId) q = q.eq('cashier_id', subjectCashierId)
    else if (ownerMode)   q = q.is('cashier_id', null)
    const { data } = await q
    ;(data || []).forEach(ex => {
      if ((ex.source_type || '') === 'supplier_payment') return
      totalExpense += parseFloat(ex.total_amount ?? ex.amount ?? 0) || 0
    })
  } catch {}
  try {
    let q = supabase.from('supplier_payments')
      .select('amount_paid,paid_by_cashier_id,created_at')
      .eq('user_id', userId)
      .gte('created_at', startISO)
      .lt('created_at', endISO)
    if (subjectCashierId) q = q.eq('paid_by_cashier_id', subjectCashierId)
    else if (ownerMode)   q = q.is('paid_by_cashier_id', null)
    const { data } = await q
    ;(data || []).forEach(p => { payorders += parseFloat(p.amount_paid || 0) || 0 })
  } catch {}
  return { totalExpense, payorders }
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

  // Split money not itemized into an account line — legs never recorded (all
  // of them when offline) or matching no configured account. Surfaced so the
  // breakdown still ties to revenue.
  const allocatedLegs = accountTotals.reduce((s, a) => s + a.legs, 0)
  const splitUnallocated = Math.max(0, special.Split - allocatedLegs)

  return {
    ...orderSummary(orders),   // totalOrders, creditOrders, totalSales, creditSales, totalDiscounts
    totalRevenue,
    cancelledOrders: cancelled.length,
    pendingOrders:   pending.length,
    accountTotals,
    special,
    splitUnallocated,
    splitByMethod: splitByMethod || {},
  }
}

// ─── Calculator ─────────────────────────────────────────────────────────────

function Calculator({ isDark, active = true }) {
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

  // Keyboard support. Only while `active` (the cash-up overlay suspends it),
  // and never when the user is typing in a form field — a window-level
  // preventDefault would otherwise cancel text insertion into inputs.
  useEffect(() => {
    if (!active) return
    const handler = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
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
  }, [active, input, operation, equals, back, clear, percent])

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
  // Default view: an admin opens on the whole business ('All'); a cashier is
  // locked to their own ('me'). Admin can still switch to 'My Orders' (their own
  // unattributed punches) or a specific cashier.
  const [viewFilter, setViewFilter] = useState(() => authManager.isAdmin() ? 'all' : 'me') // 'all' | 'me' | cashier UUID
  const [cashierList, setCashierList] = useState([])
  const [accounts, setAccounts] = useState([])       // company tender accounts (dynamic)

  // Simple Cash Report state — an OVERALL shift summary (no per-account drawer
  // setup, no counted-cash reconciliation). Works whether cashier-drawer mode
  // is on or off because it is derived purely from orders/expenses/payorders.
  const [reportOpen, setReportOpen] = useState(false)
  const [reportLoading, setReportLoading] = useState(false)
  const [report, setReport] = useState(null)
  const [saving, setSaving] = useState(false)
  // Money paid out (expenses + payorders), scoped to the current view — feeds
  // the on-screen Shift Summary's Total Expense / Payorders / Cash in Hand.
  const [moneyOut, setMoneyOut] = useState({ totalExpense: 0, payorders: 0 })

  const stats = useMemo(
    () => (raw ? computeStats(raw.orders, raw.splitByMethod, accounts) : null),
    [raw, accounts]
  )

  // Load dynamic tender accounts. Returns the list so callers that need the
  // data immediately (openCashReport) don't race the state update.
  const loadAccounts = useCallback(async () => {
    const user = authManager.getCurrentUser()
    if (!user?.id) return []
    const cacheKey = `pos_analytics_accounts_${user.id}`
    const online = typeof navigator !== 'undefined' && navigator.onLine
    const fromCache = () => {
      try { return JSON.parse(localStorage.getItem(cacheKey) || 'null') || [] } catch { return [] }
    }
    if (!online) {
      const c = fromCache()
      setAccounts(c)
      return c
    }
    try {
      const { data } = await supabase
        .from('payment_accounts')
        .select('id,name,payment_method_key,icon,color,sort_order')
        .eq('user_id', user.id)
        .is('cashier_id', null)
        .eq('is_active', true)
        .order('sort_order')
      const list = data || []
      setAccounts(list)
      localStorage.setItem(cacheKey, JSON.stringify(list))
      return list
    } catch {
      const c = fromCache()
      setAccounts(c)
      return c
    }
  }, [])

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

    // Only admins can switch views, so only they need the cashier list. A
    // cashier never pulls the roster — it isn't shown to them anyway.
    if (authManager.isAdmin()) fetchCashiers()
    loadAccounts()
  }, [isOpen, loadAccounts])

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

      // Determine the scope.
      //  • 'all'             → whole business (no filter).
      //  • 'me' as a cashier → that cashier's own orders (cashier_id / order_taker_id).
      //  • 'me' as an admin  → the owner's OWN punches only. An admin isn't a
      //    cashier, so their orders carry NO cashier_id and NO order_taker_id —
      //    filter to that unattributed bucket, NOT everything. (The bug was that
      //    admin "My Orders" fell through to no-filter and showed every cashier's
      //    orders too.)
      //  • specific UUID     → that cashier.
      const isAdmin = authManager.isAdmin()
      const ownerMode = isAdmin && activeFilter === 'me'
      const filterCashierId = activeFilter === 'all' ? null
        : activeFilter === 'me' ? (isAdmin ? null : myCashierId)
        : activeFilter // specific cashier UUID

      // Start from cache
      let orders = (cacheManager.cache?.orders || []).filter(o => {
        if (ownerMode) {
          if (o.cashier_id || o.order_taker_id) return false
        } else if (filterCashierId && o.cashier_id !== filterCashierId && o.order_taker_id !== filterCashierId) {
          return false
        }
        const ts = new Date(o.created_at)
        return ts >= startTs && ts < endTs
      })

      let splitByMethod = {}

      // If online, get fresh DB data
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        try {
          let query = supabase
            .from('orders')
            .select('id,cashier_id,order_taker_id,order_status,payment_method,payment_status,total_amount,discount_amount,loyalty_discount_amount,created_at')
            .eq('user_id', userId)
            .gte('created_at', startDateTime)
            .lt('created_at', endDateTime)

          if (ownerMode) {
            query = query.is('cashier_id', null).is('order_taker_id', null)
          } else if (filterCashierId) {
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

      // Money paid out this view (expenses + payorders) for the Shift Summary.
      // Online-only, same source/scope as the printed Cash Report so the two
      // never disagree. Offline shows Rs 0 (these tables aren't cached).
      if (typeof navigator !== 'undefined' && navigator.onLine && userId) {
        const mo = await fetchMoneyOut({
          userId,
          subjectCashierId: filterCashierId,
          ownerMode,
          startISO: startDateTime,
          endISO: endDateTime,
        })
        setMoneyOut(mo)
      } else {
        setMoneyOut({ totalExpense: 0, payorders: 0 })
      }
    } catch (err) {
      console.error('[CashierAnalytics] error:', err)
    } finally {
      setLoading(false)
    }
  }, [viewFilter])

  useEffect(() => {
    if (isOpen) fetchStats()
  }, [isOpen, fetchStats])

  // ── Cash Report: gather the subject's overall shift figures + open panel ──
  const openCashReport = useCallback(async () => {
    const user         = authManager.getCurrentUser()
    const loginCashier = authManager.getCashier()   // null for an admin/owner login
    if (!user?.id) { notify.error('Please log in first'); return }

    // Resolve WHO the report is for ("the subject"), matching the analytics view
    // so "what you see is what you print":
    //  • Cashier login          → always themselves; the snapshot is saved so the
    //    admin can reconcile it later (save block gated on the LOGIN cashier).
    //  • Admin, a cashier chosen → that cashier's shift.
    //  • Admin, 'My Orders'      → the owner's OWN punches only (unattributed:
    //    no cashier_id, no order_taker_id) — NOT the whole business.
    //  • Admin, 'All'            → the whole business day.
    //  Admin prints for their records but never persists a cashier snapshot
    //  (only a cashier login saves its own row).
    let subjectCashierId = null   // set ⇒ scope to exactly one cashier
    let ownerMode = false         // admin 'My Orders' ⇒ owner's unattributed orders
    let subjectName
    if (loginCashier?.id) {
      subjectCashierId = loginCashier.id
      subjectName      = loginCashier.name || 'Cashier'
    } else if (viewFilter && viewFilter !== 'all' && viewFilter !== 'me') {
      subjectCashierId = viewFilter
      subjectName      = cashierList.find(c => c.id === viewFilter)?.name || 'Cashier'
    } else if (viewFilter === 'me') {
      ownerMode   = true
      subjectName = authManager.getDisplayName() || 'Owner'
    } else {
      subjectName = authManager.getDisplayName() || 'Owner'   // 'All' ⇒ whole business
    }
    const canSave = !!loginCashier?.id   // only a cashier's own count is persisted

    setReportLoading(true)
    setReportOpen(true)
    try {
      const online = typeof navigator !== 'undefined' && navigator.onLine

      // Shift window = the subject's current BUSINESS DAY (start → now) — the
      // same window the analytics panel shows, so "what you see is what you
      // print". Independent of cashier-drawer mode: it's derived purely from
      // orders + expenses + payorders, so it works with the drawer on or off.
      const profile   = getProfile()
      const startTime = profile.business_start_time || '10:00'
      const endTime   = profile.business_end_time   || '03:00'
      const todayBiz  = getTodaysBusinessDate(startTime, endTime)
      const { startDateTime } = getBusinessDayRange(todayBiz, startTime, endTime)
      const shiftStart = startDateTime
      const shiftEnd   = new Date().toISOString()

      // Reference the active session id (for the saved snapshot only), if any.
      let sessionId = null
      if (online && subjectCashierId) {
        try {
          const { data: sess } = await supabase
            .from('cashier_sessions')
            .select('id')
            .eq('cashier_id', subjectCashierId)
            .eq('is_active', true)
            .order('login_time', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (sess?.id) sessionId = sess.id
        } catch {}
      }

      // Orders inside the shift window. Per-cashier attribution is EXCLUSIVE so
      // the same order can never land in two cashiers' reports — it belongs to
      // the cashier who cashiered it; order_taker_id only counts when none is
      // set. Whole-business subject (admin 'All'): every order for the day.
      let orders = []
      if (online) {
        let q = supabase
          .from('orders')
          .select('id,cashier_id,order_taker_id,order_status,payment_method,total_amount,discount_amount,loyalty_discount_amount,created_at')
          .eq('user_id', user.id)
          .gte('created_at', shiftStart)
          .lt('created_at', shiftEnd)
        if (subjectCashierId) {
          q = q.or(`cashier_id.eq.${subjectCashierId},and(cashier_id.is.null,order_taker_id.eq.${subjectCashierId})`)
        } else if (ownerMode) {
          q = q.is('cashier_id', null).is('order_taker_id', null)
        }
        const { data } = await q
        orders = data || []
      } else {
        const s = new Date(shiftStart), e = new Date(shiftEnd)
        orders = (cacheManager.cache?.orders || []).filter(o => {
          if (subjectCashierId) {
            const mine = o.cashier_id === subjectCashierId || (!o.cashier_id && o.order_taker_id === subjectCashierId)
            if (!mine) return false
          } else if (ownerMode) {
            if (o.cashier_id || o.order_taker_id) return false
          }
          const ts = new Date(o.created_at)
          return ts >= s && ts < e
        })
      }

      // Overall figures — no per-account split, no drawer count. Simple.
      const summ = orderSummary(orders)
      const mo   = online
        ? await fetchMoneyOut({ userId: user.id, subjectCashierId, ownerMode, startISO: shiftStart, endISO: shiftEnd })
        : { totalExpense: 0, payorders: 0 }
      // Collective / cash in hand = collected sales (Total − Credit) less the
      // cash paid out (expenses + supplier/PO payments). Discounts are already
      // netted into total_amount, so they don't subtract here.
      const cashInHand = summ.totalSales - summ.creditSales - mo.totalExpense - mo.payorders

      setReport({
        shiftStart, shiftEnd, sessionId,
        cashierName: subjectName,
        canSave,
        storeName: profile.store_name || profile.customer_name || '',
        offline: !online,
        ...summ,
        totalExpense: mo.totalExpense,
        payorders:    mo.payorders,
        cashInHand,
      })
    } catch (err) {
      console.error('[CashierAnalytics] cash report error:', err)
      notify.error('Failed to build cash report')
      setReportOpen(false)
    } finally {
      setReportLoading(false)
    }
  }, [viewFilter, cashierList])

  const doPrintAndSave = useCallback(async () => {
    if (!report) return
    setSaving(true)
    try {
      const user    = authManager.getCurrentUser()
      const cashier = authManager.getCashier()

      const reportData = {
        title: 'CASH REPORT',
        subtitle: 'SHIFT SUMMARY',
        storeName: report.storeName,
        cashierName: report.cashierName,
        shiftStart: report.shiftStart,
        shiftEnd: report.shiftEnd,
        printedAt: new Date().toISOString(),
        offline: !!report.offline,
        currency: 'Rs',
        totalOrders:    report.totalOrders,
        creditOrders:   report.creditOrders,
        totalSales:     report.totalSales,
        creditSales:    report.creditSales,
        totalDiscounts: report.totalDiscounts,
        totalExpense:   report.totalExpense,
        payorders:      report.payorders,
        cashInHand:     report.cashInHand,
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

      // ── Save a simple snapshot (cashier login, online only). One row per
      //    cashier per shift (upsert on shift_start) so a reprint updates the
      //    row instead of duplicating. There's no counted-cash reconciliation
      //    here, so the counted/over-short columns stay null — the summary lives
      //    in `breakdown`. Admin/owner prints don't persist a cashier row. ──
      if (report.canSave && typeof navigator !== 'undefined' && navigator.onLine && user?.id && cashier?.id) {
        try {
          const payload = {
            user_id: user.id,
            cashier_id: cashier.id,
            session_id: report.sessionId || null,
            shift_start: report.shiftStart,
            shift_end: report.shiftEnd,
            opening_float: 0,
            breakdown: {
              total_orders:    report.totalOrders,
              credit_orders:   report.creditOrders,
              total_sales:     report.totalSales,
              credit_sales:    report.creditSales,
              total_discounts: report.totalDiscounts,
              total_expense:   report.totalExpense,
              payorders:       report.payorders,
              cash_in_hand:    report.cashInHand,
            },
            total_collected: report.totalSales - report.creditSales,
            total_expected_cash: report.cashInHand,
            total_counted_cash: null,
            cash_over_short: null,
            order_count: report.totalOrders,
          }
          const { data: existing } = await supabase
            .from('cashier_cashups')
            .select('id')
            .eq('cashier_id', cashier.id)
            .eq('shift_start', report.shiftStart)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const { error: saveErr } = existing?.id
            ? await supabase.from('cashier_cashups').update(payload).eq('id', existing.id)
            : await supabase.from('cashier_cashups').insert(payload)
          if (saveErr) throw saveErr
        } catch (e) {
          console.warn('[CashierAnalytics] cash report save failed (non-blocking):', e?.message)
          notify.error('Snapshot NOT saved — tell your admin (report still printed)')
        }
      } else if (report.offline) {
        notify.warning('Offline — report printed but the snapshot was not saved')
      }

      if (printed) setReportOpen(false)
    } finally {
      setSaving(false)
    }
  }, [report])

  if (!isOpen) return null

  // Theme tokens
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'

  // Cash Report is available to any logged-in user. A cashier reports on their
  // own shift (and saves the snapshot); an admin/owner prints for the currently
  // selected view (a chosen cashier, or the whole business day).
  const canShowCashReport = !!authManager.getCurrentUser()?.id

  // Only an admin/owner may switch the view (whole business or another cashier).
  // A cashier is locked to their own sales — they must never see the overall
  // figures or a colleague's numbers, even with VIEW_SALES_ANALYTICS granted.
  const isAdminUser = authManager.isAdmin()

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
            {canShowCashReport && (
              <button
                onClick={openCashReport}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-emerald-500 hover:bg-emerald-600 text-white"
                title="Print end-of-shift cash report"
              >
                <Printer className="w-3.5 h-3.5" />
                Cash Report
              </button>
            )}
            {isAdminUser && (
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
            )}
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

                {/* Shift Summary — the exact figures printed on the Cash Report */}
                <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2.5`}>Shift Summary</p>
                  <div className="space-y-1.5">
                    <SumRow label="Total Orders"     value={stats.totalOrders}                        text={text} textSec={textSec} />
                    <SumRow label="Credit Orders"    value={stats.creditOrders}                       text={text} textSec={textSec} />
                    <SumRow label="Total Sales"      value={`Rs ${fmt(stats.totalSales)}`}            text={text} textSec={textSec} />
                    <SumRow label="Credit Sales"     value={`Rs ${fmt(stats.creditSales)}`}           text={text} textSec={textSec} />
                    <SumRow label="Total Discounts"  value={`Rs ${fmt(stats.totalDiscounts)}`}        text={text} textSec={textSec} />
                    <SumRow label="Total Expense"    value={`Rs ${fmt(moneyOut.totalExpense)}`}       text={text} textSec={textSec} />
                    <SumRow label="Payorders Amount" value={`Rs ${fmt(moneyOut.payorders)}`}          text={text} textSec={textSec} />
                    <div className={`flex items-center justify-between pt-2 mt-1 border-t ${border}`}>
                      <span className={`text-sm font-bold ${text}`}>Cash in Hand</span>
                      <span className="text-sm font-bold text-emerald-500 tabular-nums">
                        Rs {fmt(stats.totalSales - stats.creditSales - moneyOut.totalExpense - moneyOut.payorders)}
                      </span>
                    </div>
                  </div>
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

                    {/* Split money with no recorded legs (e.g. offline) */}
                    {stats.splitUnallocated > 0.5 && (
                      <div className={`flex items-center justify-between pt-1.5 mt-1.5 border-t ${border}`}>
                        <div className={`flex items-center gap-2 ${METHOD_META.Split.color}`}>
                          {METHOD_META.Split.icon}
                          <span className={`text-xs font-medium ${text}`}>Split (unallocated)</span>
                        </div>
                        <span className={`text-xs font-bold ${text}`}>Rs {fmt(stats.splitUnallocated)}</span>
                      </div>
                    )}

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
            <Calculator isDark={isDark} active={!reportOpen} />
          </div>
        </div>

        {/* ── Simple Cash Report overlay (overall summary — no drawer setup) ── */}
        <AnimatePresence>
          {reportOpen && (
            <CashReportPanel
              isDark={isDark}
              loading={reportLoading}
              saving={saving}
              report={report}
              fmtTime={fmtTime}
              onClose={() => setReportOpen(false)}
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

// One label/value line of the on-screen Shift Summary card.
function SumRow({ label, value, text, textSec }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${textSec}`}>{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${text}`}>{value}</span>
    </div>
  )
}

// ─── Cash Report panel (simple overall shift summary) ────────────────────────
// A read-only summary — NO drawer setup, NO counted-cash reconciliation. Shows
// exactly what prints, and prints whether cashier-drawer mode is on or off.

function CashReportPanel({ isDark, loading, saving, report, fmtTime, onClose, onPrint }) {
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'
  const money   = (n) => `Rs ${fmt(n)}`

  // One label/value row of the summary. Strong = the emphasised final line.
  const Line = ({ label, value, strong }) => (
    <div className={`flex items-center justify-between ${strong ? 'pt-2 mt-1 border-t ' + border : ''}`}>
      <span className={`${strong ? 'text-sm font-bold ' + text : 'text-xs ' + textSec}`}>{label}</span>
      <span className={`${strong ? 'text-sm font-bold' : 'text-xs font-semibold'} tabular-nums ${strong ? 'text-emerald-500' : text}`}>{value}</span>
    </div>
  )

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
            <h2 className={`text-sm font-bold ${text}`}>Cash Report</h2>
            <p className={`text-[11px] ${textSec} flex items-center gap-1.5`}>
              {report && (
                <>
                  <User className="w-3 h-3" />{report.cashierName}
                  <span className="opacity-40">·</span>
                  {fmtTime(report.shiftStart)} → {fmtTime(report.shiftEnd)}
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
        {loading || !report ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Offline = expenses & payorders unavailable → cash-in-hand is partial */}
            {report.offline && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs font-medium bg-amber-500/15 border-amber-500/40 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Offline — expenses and payorders are unavailable, so Cash in Hand is partial. This report will not be saved.
              </div>
            )}

            {/* Counts */}
            <div className="grid grid-cols-2 gap-2">
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Total Orders</p>
                <p className={`text-xl font-bold ${text}`}>{report.totalOrders}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Credit Orders</p>
                <p className={`text-xl font-bold text-purple-500`}>{report.creditOrders}</p>
              </div>
            </div>

            {/* Money summary — mirrors the printed template exactly */}
            <div className={`${cardBg} rounded-xl p-3 border ${border} space-y-1.5`}>
              <Line label="Total Sales"      value={money(report.totalSales)} />
              <Line label="Credit Sales"     value={money(report.creditSales)} />
              <Line label="Total Discounts"  value={money(report.totalDiscounts)} />
              <Line label="Total Expense"    value={money(report.totalExpense)} />
              <Line label="Payorders Amount" value={money(report.payorders)} />
              <Line label="Collective / Cash in Hand" value={money(report.cashInHand)} strong />
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 px-4 py-3 border-t ${border} flex items-center gap-3`}>
        <p className={`text-[11px] flex-1 ${textSec}`}>
          {report?.canSave === false
            ? 'Prints on the thermal printer for your records. It does not log you out or move money.'
            : 'Prints on the thermal printer and saves a snapshot your admin can see. It does not log you out or move money.'}
        </p>
        <button
          onClick={onPrint}
          disabled={saving || loading || !report}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
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
