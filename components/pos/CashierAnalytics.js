'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, BarChart2, TrendingUp, ShoppingBag,
  Banknote, Smartphone, CreditCard, Building2, Building, DollarSign,
  Clock, AlertCircle, RefreshCw, Delete, WifiOff,
  Wallet, Layers, Gift, Printer, Receipt, User, ArrowLeft
} from 'lucide-react'
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
// the accounts list matches the till visually.
const ICON_MAP = { Wallet, Banknote, Smartphone, Building, Building2, CreditCard, DollarSign, Layers, Gift, AlertCircle }
const getAccountIcon = (name) => ICON_MAP[name] || Wallet

// ── Collective order stats (whole business, informational only) ─────────────
// Credit  = orders put on the customer's account (khata). They never credit a
//           finance account, so they are info-only here.
// Pending = orders not yet completed/paid (active statuses) plus "Unpaid" tabs.
//           Also info-only — the finance trigger only posts on completion.
function computeOrderStats(orders) {
  const lc  = (v) => (v || '').toLowerCase()
  const amt = (o) => parseFloat(o.total_amount || 0)
  const nonCancelled = orders.filter(o => lc(o.order_status) !== 'cancelled')
  const ACTIVE = ['pending', 'preparing', 'ready', 'dispatched']
  const pendingRows = nonCancelled.filter(o => ACTIVE.includes(lc(o.order_status)) || lc(o.payment_method) === 'unpaid')
  const creditRows  = nonCancelled.filter(o => lc(o.payment_method) === 'account')
  return {
    totalOrders:     nonCancelled.length,
    cancelledOrders: orders.length - nonCancelled.length,
    pendingCount:    pendingRows.length,
    pendingAmount:   pendingRows.reduce((s, o) => s + amt(o), 0),
    creditCount:     creditRows.length,
    creditAmount:    creditRows.reduce((s, o) => s + amt(o), 0),
    totalSales:      nonCancelled.filter(o => lc(o.payment_method) !== 'complimentary').reduce((s, o) => s + amt(o), 0),
    totalDiscounts:  nonCancelled.reduce((s, o) => s + (parseFloat(o.discount_amount || 0) + parseFloat(o.loyalty_discount_amount || 0)), 0),
  }
}

// ── Collective finance figures from the account ledger ──────────────────────
// The finance accounts are the single source of truth: every rupee in or out
// today is a payment_account_ledger row. Buckets:
//   credits → sales (source 'order', net of order_reversal debits),
//             customer khata payments (manual + "Customer Payment…" description,
//             the exact description migrations 019/023/024 write), other receipts.
//   debits  → expenses, payorders (supplier_payment), withdrawals,
//             customer refunds (manual + "Customer refund…"), other payouts.
// Internal transfers (transfer_in/transfer_out) move money BETWEEN our own
// accounts, so they are surfaced separately and excluded from received/paid —
// but they stay inside totalIn/totalOut so the opening-balance math ties:
//   Opening = Available Balance − (totalIn − totalOut)   … exact, because
// current_balance is the running result of this same ledger.
function computeFinance(accounts, ledger) {
  const accountsBalance = accounts.reduce((s, a) => s + (parseFloat(a.current_balance) || 0), 0)
  let salesIn = 0, customerIn = 0, otherIn = 0, transferIn = 0
  let expensesOut = 0, payordersOut = 0, withdrawalsOut = 0, refundsOut = 0, otherOut = 0, transferOut = 0, orderReversals = 0
  let totalIn = 0, totalOut = 0
  const perAccount = {}

  ledger.forEach(e => {
    const amt  = parseFloat(e.amount) || 0
    const src  = e.source_type || ''
    const desc = (e.description || '').toLowerCase()
    if (e.transaction_type === 'credit') {
      totalIn += amt
      perAccount[e.account_id] = (perAccount[e.account_id] || 0) + amt
      if (src === 'order') salesIn += amt
      else if (src === 'transfer_in') transferIn += amt
      else if (src === 'manual' && desc.startsWith('customer payment')) customerIn += amt
      else otherIn += amt
    } else if (e.transaction_type === 'debit') {
      totalOut += amt
      perAccount[e.account_id] = (perAccount[e.account_id] || 0) - amt
      if (src === 'expense') expensesOut += amt
      else if (src === 'supplier_payment') payordersOut += amt
      else if (src === 'withdrawal') withdrawalsOut += amt
      else if (src === 'transfer_out') transferOut += amt
      else if (src === 'order_reversal') orderReversals += amt
      else if (src === 'manual' && desc.startsWith('customer refund')) refundsOut += amt
      else otherOut += amt
    }
  })

  return {
    accountsBalance,
    activeCount: accounts.length,
    accounts: accounts.map(a => ({ ...a, todayNet: perAccount[a.id] || 0 })),
    opening: accountsBalance - (totalIn - totalOut),
    salesNet: salesIn - orderReversals,   // cancelled-order reversals net out of sales
    customerIn, otherIn,
    expensesOut, payordersOut, withdrawalsOut, refundsOut, otherOut,
    transferMoved: Math.max(transferIn, transferOut),
    transferNet:   transferIn - transferOut,   // ≠0 only when a leg left our scope (e.g. cashier drawer)
    netToday: totalIn - totalOut,
  }
}

// Rows for the printed report — preformatted app-side so the Electron ESC/POS
// template stays dumb (it just renders label/value lines, dividers, headings).
// Plain ASCII '+'/'-' only: thermal charsets don't have '−'.
function buildReportRows(os, fin, printedBy, bizLabel) {
  const money = (n) => `Rs ${fmt(n)}`
  const rows = []
  rows.push({ t: 'row', label: 'Printed by:', value: printedBy })
  rows.push({ t: 'row', label: 'Business Day:', value: bizLabel })
  rows.push({ t: 'div' })
  rows.push({ t: 'head', text: 'ORDERS' })
  rows.push({ t: 'row', label: 'Total Orders:', value: String(os.totalOrders) })
  rows.push({ t: 'row', label: 'Total Sales:', value: money(os.totalSales) })
  rows.push({ t: 'row', label: 'Pending Orders:', value: `${os.pendingCount} (${money(os.pendingAmount)})` })
  rows.push({ t: 'row', label: 'Credit Orders:', value: `${os.creditCount} (${money(os.creditAmount)})` })
  rows.push({ t: 'row', label: 'Total Discounts:', value: money(os.totalDiscounts) })
  rows.push({ t: 'div' })
  rows.push({ t: 'head', text: 'FINANCE - TODAY' })
  rows.push({ t: 'row', label: 'Opening Balance:', value: money(fin.opening) })
  rows.push({ t: 'row', label: 'Sales Received:', value: '+ ' + money(fin.salesNet) })
  if (fin.customerIn > 0)     rows.push({ t: 'row', label: 'Customer Payments:', value: '+ ' + money(fin.customerIn) })
  if (fin.otherIn > 0)        rows.push({ t: 'row', label: 'Other Receipts:', value: '+ ' + money(fin.otherIn) })
  rows.push({ t: 'row', label: 'Expenses:', value: '- ' + money(fin.expensesOut) })
  rows.push({ t: 'row', label: 'Payorders:', value: '- ' + money(fin.payordersOut) })
  if (fin.withdrawalsOut > 0) rows.push({ t: 'row', label: 'Withdrawals:', value: '- ' + money(fin.withdrawalsOut) })
  if (fin.refundsOut > 0)     rows.push({ t: 'row', label: 'Customer Refunds:', value: '- ' + money(fin.refundsOut) })
  if (fin.otherOut > 0)       rows.push({ t: 'row', label: 'Other Payouts:', value: '- ' + money(fin.otherOut) })
  if (fin.transferMoved > 0)  rows.push({ t: 'row', label: 'Internal Transfers:', value: money(fin.transferMoved) })
  if (Math.abs(fin.transferNet) > 0.5) rows.push({ t: 'row', label: 'Transfers Net:', value: (fin.transferNet >= 0 ? '+ ' : '- ') + money(Math.abs(fin.transferNet)) })
  rows.push({ t: 'rowb', label: 'Net Today:', value: (fin.netToday >= 0 ? '+ ' : '- ') + money(Math.abs(fin.netToday)) })
  rows.push({ t: 'div' })
  rows.push({ t: 'head', text: 'ACCOUNT BALANCES' })
  fin.accounts.forEach(a => rows.push({ t: 'row', label: `${a.name}:`, value: money(a.current_balance) }))
  return rows
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

  // Keyboard support. Only while `active` (the cash-report overlay suspends it),
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
// ONE collective Cash Analytics for the whole business — no per-cashier views.
// Admin, cashier 1 or cashier 2: everyone sees the same real-time picture,
// driven by the finance accounts (single source of truth). Access to the
// module itself is controlled by permissions outside this component.

export default function CashierAnalytics({ isOpen, onClose, isDark }) {
  const [online, setOnline]         = useState(true)
  const [loading, setLoading]       = useState(false)
  const [bizRange, setBizRange]     = useState(null)
  const [orderStats, setOrderStats] = useState(null)   // whole-business order info (info-only)
  const [finance, setFinance]       = useState(null)   // ledger-driven money figures
  const [live, setLive]             = useState(false)  // realtime channel subscribed
  const [reportOpen, setReportOpen] = useState(false)
  const [saving, setSaving]         = useState(false)
  const debounceRef = useRef(null)

  // Fetch everything: today's orders (info) + active company accounts +
  // today's ledger (the money truth). Online-only by design — the ledger and
  // balances aren't cached, and a half report is worse than no report.
  const fetchAll = useCallback(async (opts = {}) => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) { setOnline(false); return }
    setOnline(true)
    const user = authManager.getCurrentUser()
    if (!user?.id) return
    if (!opts.silent) setLoading(true)
    try {
      const profile   = getProfile()
      const startTime = profile.business_start_time || '10:00'
      const endTime   = profile.business_end_time   || '03:00'
      const todayBiz  = getTodaysBusinessDate(startTime, endTime)
      const { startDateTime, endDateTime } = getBusinessDayRange(todayBiz, startTime, endTime)
      setBizRange({ startDateTime, endDateTime, todayBiz })
      const nowISO = new Date().toISOString()

      const [ordersRes, accountsRes] = await Promise.all([
        supabase
          .from('orders')
          .select('order_status,payment_method,total_amount,discount_amount,loyalty_discount_amount,created_at')
          .eq('user_id', user.id)
          .gte('created_at', startDateTime)
          .lt('created_at', endDateTime),
        supabase
          .from('payment_accounts')
          .select('id,name,payment_method_key,icon,color,sort_order,current_balance')
          .eq('user_id', user.id)
          .is('cashier_id', null)      // main finance accounts (not cashier drawers)
          .eq('is_active', true)       // exclude disabled accounts
          .order('sort_order'),
      ])
      const orders   = ordersRes.data || []
      const accounts = accountsRes.data || []

      let ledger = []
      const ids = accounts.map(a => a.id)
      if (ids.length > 0) {
        const { data: led } = await supabase
          .from('payment_account_ledger')
          .select('account_id,transaction_type,amount,source_type,description,created_at')
          .in('account_id', ids)
          .gte('created_at', startDateTime)
          .lt('created_at', nowISO)
        ledger = led || []
      }

      setOrderStats(computeOrderStats(orders))
      setFinance(computeFinance(accounts, ledger))
    } catch (err) {
      console.error('[CashierAnalytics] fetch error:', err)
    } finally {
      if (!opts.silent) setLoading(false)
    }
  }, [])

  // While open: initial fetch, realtime push on ledger/orders/balances, a 60s
  // polling fallback (in case realtime isn't enabled on a table), and
  // online/offline transitions.
  useEffect(() => {
    if (!isOpen) return
    fetchAll()

    const user = authManager.getCurrentUser()
    let channel = null
    if (user?.id) {
      const bump = () => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => fetchAll({ silent: true }), 1200)
      }
      try {
        channel = supabase
          .channel(`cash_analytics_${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_account_ledger', filter: `user_id=eq.${user.id}` }, bump)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'orders',                 filter: `user_id=eq.${user.id}` }, bump)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'payment_accounts',       filter: `user_id=eq.${user.id}` }, bump)
          .subscribe((status) => setLive(status === 'SUBSCRIBED'))
      } catch (e) {
        console.warn('[CashierAnalytics] realtime unavailable, polling only:', e?.message)
      }
    }

    const poll = setInterval(() => fetchAll({ silent: true }), 60000)
    const goOnline  = () => fetchAll()
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)

    return () => {
      clearInterval(poll)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      if (channel) { try { supabase.removeChannel(channel) } catch {} }
      setLive(false)
    }
  }, [isOpen, fetchAll])

  // ── Print the collective business report. Same for everyone; nothing is
  //    persisted — the finance ledger IS the record, the print is a paper copy.
  const doPrint = useCallback(async () => {
    if (!orderStats || !finance) return
    setSaving(true)
    try {
      const user      = authManager.getCurrentUser()
      const profile   = getProfile()
      const printedBy = authManager.getDisplayName() || authManager.getCashier()?.name || 'Staff'

      const fmt2 = (d) => new Date(d).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
      const bizLabel = bizRange ? `${fmt2(bizRange.startDateTime)} - now` : 'Today'

      const reportData = {
        title: 'CASH REPORT',
        subtitle: 'BUSINESS SUMMARY',
        storeName: profile.store_name || profile.customer_name || '',
        printedAt: new Date().toISOString(),
        currency: 'Rs',
        reportRows: buildReportRows(orderStats, finance, printedBy, bizLabel),
        cashInHand: finance.accountsBalance,
        cashInHandLabel: 'CASH IN HAND (ALL ACCOUNTS)',
      }

      try {
        if (user?.id && !printerManager.currentUserId) printerManager.setUserId(user.id)
        const printerConfig = await printerManager.getPrinterForPrinting()
        if (!printerConfig) {
          notify.error(printerManager.isElectron() ? 'No thermal printer configured' : 'Printing only available in the desktop app')
        } else {
          const res = await printerManager.printCashReport(reportData, getProfile(), printerConfig)
          if (res?.success) { notify.success('Cash report printed'); setReportOpen(false) }
          else notify.error('Print failed: ' + (res?.error || res?.message || 'unknown'))
        }
      } catch (e) {
        notify.error('Print error: ' + (e?.message || e))
      }
    } finally {
      setSaving(false)
    }
  }, [orderStats, finance, bizRange])

  if (!isOpen) return null

  // Theme tokens
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
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

  const canPrint = online && !!orderStats && !!finance

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
              <h2 className={`text-sm font-bold ${text} flex items-center gap-2`}>
                Cash Analytics · Whole Business
                {online && live && (
                  <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-500">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    LIVE
                  </span>
                )}
              </h2>
              <p className={`text-[11px] ${textSec}`}>{bizLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setReportOpen(true)}
              disabled={!canPrint}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed text-white"
              title="Print the collective business cash report"
            >
              <Printer className="w-3.5 h-3.5" />
              Cash Report
            </button>
            <button
              onClick={() => fetchAll()}
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
            {!online ? (
              /* Friendly offline notice — no broken/half report */
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className={`p-3 rounded-2xl mb-3 ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`}>
                  <WifiOff className={`w-7 h-7 ${textSec}`} />
                </div>
                <p className={`text-sm font-semibold ${text} mb-1`}>Cash Analytics is available online</p>
                <p className={`text-xs ${textSec} max-w-xs mb-4`}>
                  Live figures come straight from your finance accounts, which need an internet
                  connection. Reconnect and they will appear automatically.
                </p>
                <button
                  onClick={() => fetchAll()}
                  className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-medium bg-indigo-500 hover:bg-indigo-600 text-white transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Try again
                </button>
              </div>
            ) : loading && !finance ? (
              <div className="flex items-center justify-center h-full">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-400 border-t-transparent" />
              </div>
            ) : orderStats && finance ? (
              <>
                {/* Orders — whole business, informational */}
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    icon={<TrendingUp className="w-4 h-4 text-emerald-500" />}
                    label="Total Sales (Today)"
                    value={`Rs ${fmt(orderStats.totalSales)}`}
                    valueColor="text-emerald-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                  <StatCard
                    icon={<ShoppingBag className="w-4 h-4 text-blue-500" />}
                    label="Total Orders"
                    value={orderStats.totalOrders}
                    valueColor="text-blue-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <StatCard
                    icon={<Clock className="w-4 h-4 text-amber-500" />}
                    label="Pending Orders"
                    value={orderStats.pendingCount}
                    sub={`Rs ${fmt(orderStats.pendingAmount)}`}
                    valueColor="text-amber-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                  <StatCard
                    icon={<CreditCard className="w-4 h-4 text-purple-500" />}
                    label="Credit Orders (Khata)"
                    value={orderStats.creditCount}
                    sub={`Rs ${fmt(orderStats.creditAmount)}`}
                    valueColor="text-purple-500"
                    bg={cardBg} border={border} text={text} textSec={textSec}
                  />
                </div>
                <div className={`${cardBg} rounded-xl p-3 border ${border} space-y-1.5`}>
                  <SumRow label="Cancelled Orders" value={orderStats.cancelledOrders}                text={text} textSec={textSec} />
                  <SumRow label="Total Discounts"  value={`Rs ${fmt(orderStats.totalDiscounts)}`}    text={text} textSec={textSec} />
                  <p className={`text-[10px] ${textSec} pt-0.5`}>
                    Pending &amp; credit orders are info only — they haven't touched the finance accounts yet.
                  </p>
                </div>

                {/* Finance — TODAY. The single source of truth: every rupee in or
                    out of the finance accounts, reconciling opening → available. */}
                <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                  <div className="flex items-center justify-between mb-2.5">
                    <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Finance · Today</p>
                    <span className={`text-[10px] ${textSec}`}>{finance.activeCount} active account{finance.activeCount !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="space-y-1.5">
                    <SumRow label="Opening Balance (day start)" value={`Rs ${fmt(finance.opening)}`} text={text} textSec={textSec} />
                    <SumRow label="Sales Received"     value={`+ Rs ${fmt(finance.salesNet)}`}       valueColor="text-emerald-500" text={text} textSec={textSec} />
                    {finance.customerIn > 0 && (
                      <SumRow label="Customer Payments (khata)" value={`+ Rs ${fmt(finance.customerIn)}`} valueColor="text-emerald-500" text={text} textSec={textSec} />
                    )}
                    {finance.otherIn > 0 && (
                      <SumRow label="Other Receipts"   value={`+ Rs ${fmt(finance.otherIn)}`}        valueColor="text-emerald-500" text={text} textSec={textSec} />
                    )}
                    <SumRow label="Expenses"           value={`− Rs ${fmt(finance.expensesOut)}`}    valueColor="text-red-500" text={text} textSec={textSec} />
                    <SumRow label="Payorders"          value={`− Rs ${fmt(finance.payordersOut)}`}   valueColor="text-red-500" text={text} textSec={textSec} />
                    {finance.withdrawalsOut > 0 && (
                      <SumRow label="Withdrawals"      value={`− Rs ${fmt(finance.withdrawalsOut)}`} valueColor="text-red-500" text={text} textSec={textSec} />
                    )}
                    {finance.refundsOut > 0 && (
                      <SumRow label="Customer Refunds" value={`− Rs ${fmt(finance.refundsOut)}`}     valueColor="text-red-500" text={text} textSec={textSec} />
                    )}
                    {finance.otherOut > 0 && (
                      <SumRow label="Other Payouts"    value={`− Rs ${fmt(finance.otherOut)}`}       valueColor="text-red-500" text={text} textSec={textSec} />
                    )}
                    {finance.transferMoved > 0 && (
                      <SumRow label="Internal Transfers (between accounts)" value={`Rs ${fmt(finance.transferMoved)}`} text={text} textSec={textSec} />
                    )}
                    {Math.abs(finance.transferNet) > 0.5 && (
                      <SumRow label="Transfers Net" value={`${finance.transferNet >= 0 ? '+' : '−'} Rs ${fmt(Math.abs(finance.transferNet))}`} valueColor={finance.transferNet >= 0 ? 'text-emerald-500' : 'text-red-500'} text={text} textSec={textSec} />
                    )}
                    <div className={`flex items-center justify-between pt-2 mt-1 border-t ${border}`}>
                      <span className={`text-sm font-bold ${text}`}>Cash in Hand (All Accounts)</span>
                      <span className="text-xl font-bold text-emerald-500 tabular-nums">Rs {fmt(finance.accountsBalance)}</span>
                    </div>
                    <p className={`text-[10px] ${textSec} pt-0.5`}>
                      Real balance across all finance accounts · today's net {finance.netToday >= 0 ? '+' : '−'} Rs {fmt(Math.abs(finance.netToday))}
                    </p>
                  </div>
                </div>

                {/* Per-account balances + today's movement */}
                <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                  <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec} mb-2.5`}>Accounts</p>
                  <div className="space-y-1.5">
                    {finance.accounts.length === 0 && (
                      <p className={`text-xs ${textSec}`}>No payment accounts configured.</p>
                    )}
                    {finance.accounts.map((acc) => {
                      const Icon = getAccountIcon(acc.icon)
                      return (
                        <div key={acc.id} className="flex items-center justify-between">
                          <div className="flex items-center gap-2" style={{ color: acc.color || '#6366f1' }}>
                            <Icon className="w-3.5 h-3.5" />
                            <span className={`text-xs font-medium ${text}`}>{acc.name}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            {Math.abs(acc.todayNet) > 0.5 && (
                              <span className={`text-[10px] tabular-nums ${acc.todayNet >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {acc.todayNet >= 0 ? '+' : '−'} Rs {fmt(Math.abs(acc.todayNet))}
                              </span>
                            )}
                            <span className={`text-xs font-bold tabular-nums ${text}`}>Rs {fmt(acc.current_balance)}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
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

        {/* ── Cash Report overlay (collective business summary) ── */}
        <AnimatePresence>
          {reportOpen && (
            <CashReportPanel
              isDark={isDark}
              saving={saving}
              orderStats={orderStats}
              finance={finance}
              bizRange={bizRange}
              onClose={() => setReportOpen(false)}
              onPrint={doPrint}
            />
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

function StatCard({ icon, label, value, sub, valueColor, bg, border, text, textSec }) {
  return (
    <div className={`${bg} rounded-xl p-3 border ${border}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
        {sub && <p className={`text-[11px] font-semibold tabular-nums ${textSec}`}>{sub}</p>}
      </div>
    </div>
  )
}

// One label/value line of a summary card.
function SumRow({ label, value, text, textSec, valueColor }) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${textSec}`}>{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${valueColor || text}`}>{value}</span>
    </div>
  )
}

// ─── Cash Report panel (collective business summary) ─────────────────────────
// Mirrors exactly what prints — the same on-screen figures, nothing persisted.
// The finance ledger is the permanent record; this is a paper copy of it.

function CashReportPanel({ isDark, saving, orderStats, finance, bizRange, onClose, onPrint }) {
  const bg      = isDark ? 'bg-gray-900' : 'bg-white'
  const border  = isDark ? 'border-gray-700' : 'border-gray-200'
  const text    = isDark ? 'text-gray-100' : 'text-gray-900'
  const textSec = isDark ? 'text-gray-400' : 'text-gray-500'
  const cardBg  = isDark ? 'bg-gray-800/60' : 'bg-gray-50'
  const money   = (n) => `Rs ${fmt(n)}`

  const fmtTime = (iso) => {
    try { return new Date(iso).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true }) }
    catch { return '' }
  }

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
            <h2 className={`text-sm font-bold ${text}`}>Cash Report · Whole Business</h2>
            <p className={`text-[11px] ${textSec} flex items-center gap-1.5`}>
              <User className="w-3 h-3" />
              {authManager.getDisplayName() || authManager.getCashier()?.name || 'Staff'}
              {bizRange && (
                <>
                  <span className="opacity-40">·</span>
                  {fmtTime(bizRange.startDateTime)} → now
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
        {!orderStats || !finance ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-emerald-400 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* Order counts — info only */}
            <div className="grid grid-cols-3 gap-2">
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Total Orders</p>
                <p className={`text-xl font-bold ${text}`}>{orderStats.totalOrders}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Pending</p>
                <p className="text-xl font-bold text-amber-500">{orderStats.pendingCount}</p>
              </div>
              <div className={`${cardBg} rounded-xl p-3 border ${border}`}>
                <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Credit (Khata)</p>
                <p className="text-xl font-bold text-purple-500">{orderStats.creditCount}</p>
              </div>
            </div>

            {/* Finance summary — mirrors the printed template exactly */}
            <div className={`${cardBg} rounded-xl p-3 border ${border} space-y-1.5`}>
              <Line label="Total Sales (orders)"  value={money(orderStats.totalSales)} />
              <Line label="Pending Amount"        value={money(orderStats.pendingAmount)} />
              <Line label="Credit Amount (khata)" value={money(orderStats.creditAmount)} />
              <div className={`pt-2 mt-1 border-t ${border}`} />
              <Line label="Opening Balance"       value={money(finance.opening)} />
              <Line label="Sales Received"        value={`+ ${money(finance.salesNet)}`} />
              {finance.customerIn > 0 &&     <Line label="Customer Payments" value={`+ ${money(finance.customerIn)}`} />}
              {finance.otherIn > 0 &&        <Line label="Other Receipts"    value={`+ ${money(finance.otherIn)}`} />}
              <Line label="Expenses"              value={`− ${money(finance.expensesOut)}`} />
              <Line label="Payorders"             value={`− ${money(finance.payordersOut)}`} />
              {finance.withdrawalsOut > 0 && <Line label="Withdrawals"       value={`− ${money(finance.withdrawalsOut)}`} />}
              {finance.refundsOut > 0 &&     <Line label="Customer Refunds"  value={`− ${money(finance.refundsOut)}`} />}
              {finance.otherOut > 0 &&       <Line label="Other Payouts"     value={`− ${money(finance.otherOut)}`} />}
              {finance.transferMoved > 0 &&  <Line label="Internal Transfers" value={money(finance.transferMoved)} />}
              <Line label="Cash in Hand (All Accounts)" value={money(finance.accountsBalance)} strong />
            </div>

            {/* Per-account balances */}
            <div className={`${cardBg} rounded-xl p-3 border ${border} space-y-1.5`}>
              <p className={`text-[10px] uppercase tracking-wide font-semibold ${textSec}`}>Account Balances</p>
              {finance.accounts.map(acc => (
                <Line key={acc.id} label={acc.name} value={money(acc.current_balance)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Footer */}
      <div className={`flex-shrink-0 px-4 py-3 border-t ${border} flex items-center gap-3`}>
        <p className={`text-[11px] flex-1 ${textSec}`}>
          Prints the collective business report on the thermal printer. It does not log you out or move money.
        </p>
        <button
          onClick={onPrint}
          disabled={saving || !orderStats || !finance}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 disabled:cursor-not-allowed text-white transition-colors"
        >
          {saving
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Printer className="w-4 h-4" />}
          Print
        </button>
      </div>
    </motion.div>
  )
}
