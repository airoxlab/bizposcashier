'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BarChart2, TrendingUp, ShoppingBag,
  Banknote, Smartphone, CreditCard, Building2, Building, DollarSign,
  Clock, AlertCircle, RefreshCw, Delete,
  Wallet, Layers, Gift, Printer, Receipt, User, ArrowLeft, ShieldCheck
} from 'lucide-react'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { supabase } from '../../lib/supabase'
import { printerManager } from '../../lib/printerManager'
import { notify } from '../ui/NotificationSystem'
import { getTodaysBusinessDate, getBusinessDayRange } from '../../lib/utils/businessDayUtils'
import OwnerFingerprintUnlock from '../ui/OwnerFingerprintUnlock'

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

  // Split money not itemized into an account line — legs never recorded (all
  // of them when offline) or matching no configured account. Surfaced so the
  // breakdown still ties to revenue.
  const allocatedLegs = accountTotals.reduce((s, a) => s + a.legs, 0)
  const splitUnallocated = Math.max(0, special.Split - allocatedLegs)

  return {
    totalRevenue,
    totalOrders:     nonCancelled.length,
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
  const [viewFilter, setViewFilter] = useState('me') // 'all' | 'me' | cashier UUID
  const [cashierList, setCashierList] = useState([])
  const [accounts, setAccounts] = useState([])       // company tender accounts (dynamic)

  // Cash-up / Z-report state
  const [cashupOpen, setCashupOpen] = useState(false)
  const [cashupLoading, setCashupLoading] = useState(false)
  const [cashup, setCashup] = useState(null)
  const [saving, setSaving] = useState(false)
  // Owner-fingerprint gate (payroll_settings.require_fingerprint_shift_close)
  const [fpStatus, setFpStatus] = useState(null)      // OwnerFingerprintUnlock status
  const [fpVerified, setFpVerified] = useState(false)

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

    fetchCashiers()
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

    setCashupLoading(true)
    setCashupOpen(true)
    setFpVerified(false)
    setFpStatus(null)
    try {
      const online = typeof navigator !== 'undefined' && navigator.onLine

      // Accounts may still be in flight right after the modal opened — fetch
      // inline rather than failing with a bogus "not configured" error.
      let accts = accounts
      if (!accts.length) accts = await loadAccounts()
      if (!accts.length) {
        notify.error('No payment accounts configured yet')
        setCashupOpen(false)
        return
      }

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

      // 1b) Admin policy: require the OWNER's fingerprint before this report
      //     can be printed (payroll settings in bizpos-admin). The gate is
      //     enforced only where it can physically work — the unlock component
      //     reports 'unsupported' (browser) / 'not_enrolled' and we fail open.
      let requireFp = false
      if (online) {
        try {
          const { data: ps } = await supabase
            .from('payroll_settings')
            .select('require_fingerprint_shift_close')
            .eq('user_id', user.id)
            .maybeSingle()
          requireFp = !!ps?.require_fingerprint_shift_close
        } catch {}
      }

      // 2) This cashier's orders inside the shift window.
      //    Attribution is EXCLUSIVE so the same order can never appear in two
      //    cashiers' drawers: it belongs to the cashier who cashiered it
      //    (cashier_id); order_taker_id only counts when no cashier is set.
      let orders = []
      if (online) {
        const { data } = await supabase
          .from('orders')
          .select('id,cashier_id,order_taker_id,order_status,payment_method,total_amount,created_at')
          .eq('user_id', user.id)
          .gte('created_at', shiftStart)
          .lt('created_at', shiftEnd)
          .or(`cashier_id.eq.${cashier.id},and(cashier_id.is.null,order_taker_id.eq.${cashier.id})`)
        orders = data || []
      } else {
        const s = new Date(shiftStart), e = new Date(shiftEnd)
        orders = (cacheManager.cache?.orders || []).filter(o => {
          const mine = o.cashier_id === cashier.id || (!o.cashier_id && o.order_taker_id === cashier.id)
          if (!mine) return false
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

      // 4) Money OUT this shift — expenses paid by this cashier, keyed by the
      //    account they were paid from (expenses.payment_method = account name).
      //    Every account gets its own OUT figure, not just the cash drawer.
      const payoutsByMethod = {}
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
            const k = (ex.payment_method || '').toLowerCase().trim()
            if (!k) return
            payoutsByMethod[k] = (payoutsByMethod[k] || 0) + (parseFloat(ex.total_amount ?? ex.amount ?? 0) || 0)
          })
        } catch {}
      }

      // 4b) Money IN outside orders — customer-account (ledger) payments this
      //     cashier collected, keyed by the account they were received into
      //     (customer_payments.payment_method = account name). Not order sales,
      //     but real money entering each account this shift.
      //     customer_payments has no cashier FK — attribution is by the
      //     collected_by_name/role stamped at record time (RecordPaymentModal
      //     writes authManager.getDisplayName()/getRole()).
      const payInByMethod = {}
      if (online) {
        try {
          const { data: pays } = await supabase
            .from('customer_payments')
            .select('amount_received,payment_method,collected_by_name,collected_by_role')
            .eq('user_id', user.id)
            .gte('created_at', shiftStart)
            .lt('created_at', shiftEnd)
          const myNames = [cashier.name, authManager.getDisplayName()]
            .filter(Boolean).map(n => n.toLowerCase().trim())
          ;(pays || []).forEach(p => {
            const who  = (p.collected_by_name || '').toLowerCase().trim()
            const role = (p.collected_by_role || '').toLowerCase()
            if (!who || !myNames.includes(who)) return
            if (role && role !== 'cashier') return
            const k = (p.payment_method || '').toLowerCase().trim()
            if (!k) return
            payInByMethod[k] = (payInByMethod[k] || 0) + (parseFloat(p.amount_received) || 0)
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

      // 6) Per-account sales this shift (direct + split legs).
      //    Only the FIRST cash-like account (by sort_order) is the physical
      //    drawer — it alone gets the float/payout math. Any other cash-like
      //    account ("Petty Cash", a second till…) is itemized as a normal
      //    tender; treating them all as drawers would double-count the float
      //    and hide every line after the first from the report.
      let drawerTaken = false
      let allocatedLegs = 0
      const lines = accts.map(acc => {
        const isCash = isCashAccount(acc) && !drawerTaken
        if (isCash) drawerTaken = true
        const direct = nonCancelled
          .filter(o => o.payment_method !== 'Split' && methodMatchesAccount(o.payment_method, acc))
          .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
        const legs = splitLegsForAccount(splitByMethod, acc)
        allocatedLegs += legs
        const sales  = direct + legs
        // Per-account movement: ledger payments received INTO this account and
        // expenses paid FROM it (splitLegsForAccount is a generic
        // method-map→account matcher, reused for both).
        const payIn  = splitLegsForAccount(payInByMethod, acc)
        const payOut = splitLegsForAccount(payoutsByMethod, acc)
        // Non-cash tenders default counted = expected; cash starts blank —
        // cashupCalc keeps it null (blocks Print & Save) until really counted.
        return {
          id: acc.id, name: acc.name, key: acc.payment_method_key,
          icon: acc.icon, color: acc.color || '#6366f1', isCash,
          sales, payIn, payOut,
          counted: isCash ? '' : String(Math.round(sales + payIn - payOut)),
        }
      })

      // 7) Split remainder: split-order money not itemized above — legs that
      //    were never recorded (all of them when offline) plus legs whose
      //    method matches no configured account. Shown as its own line so the
      //    tender sum still ties to what was actually rung up instead of
      //    silently dropping the difference.
      const splitTotal = nonCancelled
        .filter(o => o.payment_method === 'Split')
        .reduce((s, o) => s + parseFloat(o.total_amount || 0), 0)
      const splitGap = splitTotal - allocatedLegs
      if (splitGap > 0.5) {
        lines.push({
          id: 'split-unallocated', name: 'Split (unallocated)', key: null,
          icon: 'Layers', color: '#6366f1', isCash: false,
          sales: splitGap, payIn: 0, payOut: 0, counted: String(Math.round(splitGap)),
        })
      }

      // 7b) Movements whose method matches NO configured account: cash-like
      //     ones belong to the drawer; the rest get their own line so the
      //     in/out totals still tie to what actually happened.
      const matchedAnywhere = (k) => accts.some(a => methodMatchesAccount(k, a))
      const cashLike = (k) => k === 'cash' || /(^|\s)cash(\s|$)/.test(k)
      let leftIn = { cash: 0, other: 0 }, leftOut = { cash: 0, other: 0 }
      Object.entries(payInByMethod).forEach(([k, v]) => {
        if (!matchedAnywhere(k)) leftIn[cashLike(k) ? 'cash' : 'other'] += v
      })
      Object.entries(payoutsByMethod).forEach(([k, v]) => {
        if (!matchedAnywhere(k)) leftOut[cashLike(k) ? 'cash' : 'other'] += v
      })
      const drawer = lines.find(l => l.isCash)
      if (drawer) { drawer.payIn += leftIn.cash; drawer.payOut += leftOut.cash }
      else { leftIn.other += leftIn.cash; leftOut.other += leftOut.cash }
      if (leftIn.other > 0.5 || leftOut.other > 0.5) {
        lines.push({
          id: 'movement-unmatched', name: 'Other methods', key: null,
          icon: 'Wallet', color: '#64748b', isCash: false,
          sales: 0, payIn: leftIn.other, payOut: leftOut.other,
          counted: String(Math.round(leftIn.other - leftOut.other)),
        })
      }

      setCashup({
        shiftStart, shiftEnd, sessionId,
        cashierName: cashier.name || 'Cashier',
        storeName: profile.store_name || profile.customer_name || '',
        orderCount: nonCancelled.length,
        openingFloat: String(Math.round(openingFloat)),
        offline: !online,
        requireFp,
        ownerUserId: user.id,
        lines,
      })
    } catch (err) {
      console.error('[CashierAnalytics] cash-up error:', err)
      notify.error('Failed to build cash report')
      setCashupOpen(false)
    } finally {
      setCashupLoading(false)
    }
  }, [accounts, loadAccounts])

  const setCounted = (id, val) => {
    setCashup(c => c ? { ...c, lines: c.lines.map(l => l.id === id ? { ...l, counted: val } : l) } : c)
  }
  const setOpeningFloat = (val) => setCashup(c => c ? { ...c, openingFloat: val } : c)

  // Derived cash-up numbers for render + save. Every account line is a
  // movement statement: sales IN + ledger payments IN − expense payouts OUT
  // (the drawer additionally starts from the opening float).
  const cashupCalc = useMemo(() => {
    if (!cashup) return null
    const of = parseFloat(cashup.openingFloat) || 0
    const lines = cashup.lines.map(l => {
      const expected = (l.isCash ? of : 0) + l.sales + (l.payIn || 0) - (l.payOut || 0)
      const blank = l.counted === '' || l.counted == null
      // The drawer must be PHYSICALLY counted: blank stays null (and blocks
      // Print & Save) instead of silently assuming expected, which printed a
      // fake "BALANCED" report. Non-cash tenders keep the expected default.
      const counted = blank ? (l.isCash ? null : expected) : (parseFloat(l.counted) || 0)
      return { ...l, expected, counted, overShort: counted == null ? null : counted - expected }
    })
    const cashLine = lines.find(l => l.isCash) || null
    const totalCollected = lines.reduce((s, l) => s + l.sales, 0)
    const totalPayIn     = lines.reduce((s, l) => s + (l.payIn  || 0), 0)
    const totalPayOut    = lines.reduce((s, l) => s + (l.payOut || 0), 0)
    const canPrint = !cashLine || cashLine.counted != null
    return { of, lines, cashLine, totalCollected, totalPayIn, totalPayOut, canPrint }
  }, [cashup])

  // The owner-fingerprint gate blocks printing only where it can work:
  // 'unsupported' (browser, no native dpfj) and 'not_enrolled' fail OPEN so a
  // shift can always be closed; a missing/denied reader keeps the gate shut.
  const fpGateActive = !!cashup?.requireFp && !fpVerified &&
    !['unsupported', 'not_enrolled'].includes(fpStatus)

  const doPrintAndSave = useCallback(async () => {
    if (!cashup || !cashupCalc) return
    if (!cashupCalc.canPrint) {
      notify.warning('Count the drawer first — enter the counted cash to print')
      return
    }
    if (fpGateActive) {
      notify.warning('Owner fingerprint required — place the owner’s finger on the reader')
      return
    }
    setSaving(true)
    try {
      const user    = authManager.getCurrentUser()
      const cashier = authManager.getCashier()
      const { of, lines, cashLine, totalCollected, totalPayIn, totalPayOut } = cashupCalc

      const reportData = {
        title: 'CASH REPORT',
        subtitle: 'SHIFT CLOSE',
        storeName: cashup.storeName,
        cashierName: cashup.cashierName,
        shiftStart: cashup.shiftStart,
        shiftEnd: cashup.shiftEnd,
        orderCount: cashup.orderCount,
        openingFloat: of,
        // Drawer-scoped movement (for the CASH (DRAWER) section)
        cashPayouts: cashLine ? (cashLine.payOut || 0) : 0,
        accountCashPayments: cashLine ? (cashLine.payIn || 0) : 0,
        // Across ALL accounts (for the totals section)
        totalPayIn, totalPayOut,
        offline: !!cashup.offline,
        cashSales: cashLine ? cashLine.sales : 0,
        totalCollected,
        currency: 'Rs',
        lines: lines.map(l => ({
          name: l.name, isCash: l.isCash,
          sales: l.sales, payIn: l.payIn || 0, payOut: l.payOut || 0,
          expected: l.expected, counted: l.counted, overShort: l.overShort,
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

      // ── Save snapshot (online only). One row per cashier per shift: an
      //    existing row for this shift_start is UPDATED, so a failed print
      //    retried (or a mid-shift re-count) can't pile up duplicates that
      //    pollute the admin settlement view. ──
      if (typeof navigator !== 'undefined' && navigator.onLine && user?.id && cashier?.id) {
        try {
          const payload = {
            user_id: user.id,
            cashier_id: cashier.id,
            session_id: cashup.sessionId || null,
            shift_start: cashup.shiftStart,
            shift_end: cashup.shiftEnd,
            opening_float: of,
            breakdown: lines.map(l => ({
              account: l.name, key: l.key, is_cash: l.isCash,
              sales: l.sales, payments_in: l.payIn || 0, payouts: l.payOut || 0,
              expected: l.expected, counted: l.counted, over_short: l.overShort,
            })),
            total_collected: totalCollected,
            total_expected_cash: cashLine ? cashLine.expected : 0,
            total_counted_cash: cashLine ? cashLine.counted : 0,
            cash_over_short: cashLine ? cashLine.overShort : 0,
            order_count: cashup.orderCount,
          }
          const { data: existing } = await supabase
            .from('cashier_cashups')
            .select('id')
            .eq('cashier_id', cashier.id)
            .eq('shift_start', cashup.shiftStart)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          const { error: saveErr } = existing?.id
            ? await supabase.from('cashier_cashups').update(payload).eq('id', existing.id)
            : await supabase.from('cashier_cashups').insert(payload)
          if (saveErr) throw saveErr
        } catch (e) {
          console.warn('[CashierAnalytics] cash-up save failed (non-blocking):', e?.message)
          // The paper printed but the admin will never see this count — say so.
          notify.error('Cash-up snapshot NOT saved — tell your admin (report still printed)')
        }
      } else if (cashup.offline) {
        notify.warning('Offline — report printed but the snapshot was not saved')
      }

      if (printed) setCashupOpen(false)
    } finally {
      setSaving(false)
    }
  }, [cashup, cashupCalc, fpGateActive])

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
            <Calculator isDark={isDark} active={!cashupOpen} />
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
              fpGate={cashup?.requireFp ? { active: fpGateActive, status: fpStatus, verified: fpVerified } : null}
              onCounted={setCounted}
              onOpeningFloat={setOpeningFloat}
              onClose={() => setCashupOpen(false)}
              onPrint={doPrintAndSave}
            />
          )}
        </AnimatePresence>

        {/* Owner-fingerprint verification engine for the shift-close gate.
            Compact = no UI of its own; unmounts once verified (or panel closed)
            so the attendance kiosk gets the reader back. */}
        {cashupOpen && cashup?.requireFp && !fpVerified && (
          <OwnerFingerprintUnlock
            compact
            userId={cashup.ownerUserId}
            onUnlock={() => setFpVerified(true)}
            onStatusChange={setFpStatus}
          />
        )}
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

function CashUpPanel({ isDark, loading, saving, cashup, calc, fmtTime, fpGate, onCounted, onOpeningFloat, onClose, onPrint }) {
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'
  const inputCls = `w-28 text-right text-xs px-2 py-1 rounded-lg border tabular-nums ${isDark ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-300 text-gray-900'} focus:outline-none focus:border-indigo-500`

  const money = (n) => `Rs ${fmt(n)}`
  // null = not counted yet (drawer only) — neutral, never "Balanced"
  const overShortColor = (v) => (v == null || v === 0) ? textSec : v > 0 ? 'text-blue-500' : 'text-red-500'
  const overShortLabel = (v) => v == null ? 'Enter counted cash' : v === 0 ? 'Balanced' : v > 0 ? `Over ${money(v)}` : `Short ${money(Math.abs(v))}`
  // Chip + input tones: amber = not counted, green = balanced, blue = over, red = short
  const overShortChip = (v) =>
    v == null ? 'bg-amber-500/15 text-amber-500' :
    v === 0   ? 'bg-emerald-500/15 text-emerald-500' :
    v > 0     ? 'bg-blue-500/15 text-blue-500' :
                'bg-red-500/15 text-red-500'
  const inputToned = (v) => `w-28 text-right text-xs px-2 py-1 rounded-lg border-2 tabular-nums focus:outline-none ${isDark ? 'bg-gray-800 text-gray-100' : 'bg-white text-gray-900'} ${
    v == null ? 'border-amber-400/70 focus:border-amber-500' :
    v === 0   ? 'border-emerald-500/70 focus:border-emerald-500' :
    v > 0     ? 'border-blue-500/70 focus:border-blue-500' :
                'border-red-500/70 focus:border-red-500'
  }`

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
                  {fmtTime(cashup.shiftStart)} → {fmtTime(cashup.shiftEnd)}
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
            {/* Offline = partial data — say it, don't print a normal-looking report */}
            {cashup.offline && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs font-medium bg-amber-500/15 border-amber-500/40 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                Offline — split-payment detail, cash payouts, account collections and opening float are unavailable. This report is partial and will not be saved.
              </div>
            )}

            {/* Owner-fingerprint shift-close gate (admin payroll setting) */}
            {fpGate && (
              <div className={`flex items-center gap-2 rounded-xl px-3 py-2 border text-xs font-medium ${
                fpGate.verified
                  ? 'bg-emerald-500/15 border-emerald-500/40 ' + (isDark ? 'text-emerald-400' : 'text-emerald-600')
                  : fpGate.active
                    ? 'bg-violet-500/15 border-violet-500/40 ' + (isDark ? 'text-violet-300' : 'text-violet-700')
                    : 'bg-gray-500/10 border-gray-400/30 ' + (isDark ? 'text-gray-400' : 'text-gray-500')
              }`}>
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                {fpGate.verified
                  ? 'Owner verified — printing unlocked.'
                  : fpGate.active
                    ? (fpGate.status === 'denied'
                        ? 'Not the owner — only the owner’s fingerprint can authorize shift close.'
                        : fpGate.status === 'no_reader'
                          ? 'Owner fingerprint required, but no reader detected — plug in the reader to continue.'
                          : 'Owner fingerprint required to close the shift — place the owner’s finger on the reader.')
                    : 'Owner fingerprint requirement skipped (not available on this terminal).'}
              </div>
            )}

            {/* Meta strip — shift movement across ALL accounts, not just cash */}
            <div className="grid grid-cols-4 gap-2">
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Orders</p>
                <p className={`text-sm font-bold ${text}`}>{cashup.orderCount}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Total In</p>
                <p className={`text-sm font-bold text-emerald-500`}>{money(calc.totalCollected + calc.totalPayIn)}</p>
                <p className={`text-[9px] ${textSec}`}>sales {fmt(calc.totalCollected)} · pay {fmt(calc.totalPayIn)}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Total Out</p>
                <p className={`text-sm font-bold text-red-500`}>{money(calc.totalPayOut)}</p>
                <p className={`text-[9px] ${textSec}`}>expenses paid</p>
              </div>
              <div className={`${cardBg} rounded-xl p-2.5 border ${border}`}>
                <p className={`text-[10px] uppercase ${textSec}`}>Net</p>
                <p className={`text-sm font-bold ${text}`}>{money(calc.totalCollected + calc.totalPayIn - calc.totalPayOut)}</p>
                <p className={`text-[9px] ${textSec}`}>in − out, all accounts</p>
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
                      type="number" inputMode="decimal" min="0" value={cashup.openingFloat}
                      onChange={(e) => onOpeningFloat(e.target.value)}
                      className={inputCls}
                    />
                  </Row>
                  <Row label="+ Cash sales" textSec={textSec}><span className={calc.cashLine.sales > 0 ? text : textSec}>{money(calc.cashLine.sales)}</span></Row>
                  {/* Always visible so a zero is a visible fact, not a hidden one:
                      cash collected on customer accounts and cash paid out on
                      expenses both move the physical drawer. */}
                  <Row label="+ Account payments (cash)" textSec={textSec}>
                    <span className={(calc.cashLine.payIn || 0) > 0 ? 'text-emerald-500 font-semibold' : textSec}>{money(calc.cashLine.payIn || 0)}</span>
                  </Row>
                  <Row label="− Cash payouts (expenses)" textSec={textSec}>
                    <span className={(calc.cashLine.payOut || 0) > 0 ? 'text-red-500 font-semibold' : textSec}>{money(calc.cashLine.payOut || 0)}</span>
                  </Row>
                  <div className={`flex items-center justify-between pt-1.5 border-t ${border}`}>
                    <span className={`font-semibold ${text}`}>= Expected in drawer</span>
                    <span className={`font-bold ${text}`}>{money(calc.cashLine.expected)}</span>
                  </div>
                  <Row label="Counted cash" textSec={textSec}>
                    <div className="flex items-center gap-1.5">
                      {/* One-tap fill: an explicit confirmation that the drawer
                          held exactly the expected amount (unlike the old silent
                          blank-means-balanced behavior). */}
                      <button
                        type="button"
                        onClick={() => onCounted(calc.cashLine.id, String(Math.round(calc.cashLine.expected)))}
                        title="Fill with the expected amount"
                        className={`text-[10px] px-2 py-1 rounded-lg font-semibold transition-colors ${isDark ? 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-200'}`}
                      >
                        = {fmt(calc.cashLine.expected)}
                      </button>
                      <input
                        type="number" inputMode="decimal" min="0" value={cashup.lines.find(l => l.id === calc.cashLine.id)?.counted ?? ''}
                        placeholder="count drawer" onChange={(e) => onCounted(calc.cashLine.id, e.target.value)}
                        className={inputToned(calc.cashLine.overShort)}
                      />
                    </div>
                  </Row>
                  <div className={`flex items-center justify-between pt-1.5 border-t ${border}`}>
                    <span className={`font-semibold ${text}`}>Over / (Short)</span>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-bold ${overShortChip(calc.cashLine.overShort)}`}>{overShortLabel(calc.cashLine.overShort)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Non-cash tenders */}
            <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
              <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2`}>Other Accounts (sales + in − out)</p>
              <div className="space-y-2">
                {calc.lines.filter(l => !l.isCash).length === 0 && (
                  <p className={`text-xs ${textSec}`}>No non-cash tenders this shift.</p>
                )}
                {calc.lines.filter(l => !l.isCash).map((l) => {
                  const Icon = getAccountIcon(l.icon)
                  const rawCounted = cashup.lines.find(x => x.id === l.id)?.counted ?? ''
                  const hasMovement = (l.payIn || 0) > 0 || (l.payOut || 0) > 0
                  return (
                    <div key={l.id} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0" style={{ color: l.color }}>
                        <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                        <div className="min-w-0">
                          <span className={`block text-xs font-medium truncate ${text}`}>{l.name}</span>
                          {hasMovement && (
                            <span className={`block text-[10px] truncate ${textSec}`}>
                              sales {fmt(l.sales)}
                              {(l.payIn  || 0) > 0 && <> · <span className="text-emerald-500">in {fmt(l.payIn)}</span></>}
                              {(l.payOut || 0) > 0 && <> · <span className="text-red-500">out {fmt(l.payOut)}</span></>}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-xs ${textSec}`}>Exp {money(l.expected)}</span>
                        <input
                          type="number" inputMode="decimal" min="0" value={rawCounted}
                          onChange={(e) => onCounted(l.id, e.target.value)}
                          className={l.overShort === 0 ? inputCls : inputToned(l.overShort)}
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
        <p className={`text-[11px] flex-1 ${(calc && !calc.canPrint) || fpGate?.active ? 'text-amber-500 font-medium' : textSec}`}>
          {calc && !calc.canPrint
            ? 'Count the drawer and enter the counted cash to enable Print & Save.'
            : fpGate?.active
              ? 'Owner fingerprint required — place the owner’s finger on the reader to unlock printing.'
              : 'Prints on the thermal printer and saves a snapshot your admin can reconcile. It does not log you out or move money.'}
        </p>
        <button
          onClick={onPrint}
          disabled={saving || loading || !calc || !calc.canPrint || fpGate?.active}
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

function Row({ label, children, textSec }) {
  return (
    <div className="flex items-center justify-between">
      <span className={textSec}>{label}</span>
      {children}
    </div>
  )
}
