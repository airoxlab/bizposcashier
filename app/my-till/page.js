'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Wallet,
  DollarSign,
  Smartphone,
  Building,
  CreditCard,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  Banknote,
  User,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'
import { notify } from '../../components/ui/NotificationSystem'
import { themeManager } from '../../lib/themeManager'

const ICON_MAP = { Wallet, Banknote, Smartphone, Building, CreditCard, DollarSign }
const getIconComponent = (name) => ICON_MAP[name] || Wallet

const SOURCE_LABELS = {
  order:            'Order Payment',
  order_reversal:   'Order Reversal',
  expense:          'Expense',
  supplier_payment: 'Supplier Payment',
  transfer_in:      'Transfer In (Float)',
  transfer_out:     'Transfer Out (Settlement)',
  opening_balance:  'Opening Balance',
  manual:           'Manual Entry',
  adjustment:       'Adjustment',
}


function MyTillContent() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [cashier, setCashier] = useState(null)
  const [loading, setLoading] = useState(true)
  const [accounts, setAccounts] = useState([])
  const [ledgerEntries, setLedgerEntries] = useState([])
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState('all')
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0])
  const [typeFilter, setTypeFilter] = useState('all')
  const [expandedEntry, setExpandedEntry] = useState(null)

  useEffect(() => {
    initializePage()
  }, [])

  const initializePage = async () => {
    try {
      const currentUser = authManager.getCurrentUser()
      const currentCashier = authManager.getCashier()

      if (!currentUser) {
        router.push('/')
        return
      }


      setUser(currentUser)
      setCashier(currentCashier)

      if (currentCashier?.id) {
        await fetchAccounts(currentUser.id, currentCashier.id)
      } else {
        // Admin viewing their own accounts (cashier_id IS NULL)
        await fetchAdminAccounts(currentUser.id)
      }
    } catch (err) {
      console.error('Till init error:', err)
      notify.error('Failed to load till data')
    } finally {
      setLoading(false)
    }
  }

  const fetchAccounts = async (userId, cashierId) => {
    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('cashier_id', cashierId)
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Fetch accounts error:', err)
      notify.error('Failed to load accounts')
    }
  }

  const fetchAdminAccounts = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('payment_accounts')
        .select('*')
        .eq('user_id', userId)
        .is('cashier_id', null)
        .eq('is_active', true)
        .order('sort_order')
      if (error) throw error
      setAccounts(data || [])
    } catch (err) {
      console.error('Fetch admin accounts error:', err)
    }
  }

  const fetchLedger = useCallback(async () => {
    if (!accounts.length) return
    setLedgerLoading(true)
    try {
      let accountIds = accounts.map(a => a.id)
      if (selectedAccountId !== 'all') accountIds = [selectedAccountId]

      let query = supabase
        .from('payment_account_ledger')
        .select('*, payment_accounts(id, name, icon, color)')
        .in('account_id', accountIds)
        .eq('transaction_date', selectedDate)
        .order('created_at', { ascending: false })

      if (typeFilter !== 'all') query = query.eq('transaction_type', typeFilter)

      const { data, error } = await query
      if (error) throw error
      setLedgerEntries(data || [])
    } catch (err) {
      console.error('Fetch ledger error:', err)
      notify.error('Failed to load ledger')
    } finally {
      setLedgerLoading(false)
    }
  }, [accounts, selectedAccountId, selectedDate, typeFilter])

  const today = new Date().toISOString().split('T')[0]
  const isToday = selectedDate === today

  const goToPrevDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() - 1)
    setSelectedDate(d.toISOString().split('T')[0])
  }

  const goToNextDay = () => {
    const d = new Date(selectedDate + 'T12:00:00')
    d.setDate(d.getDate() + 1)
    const next = d.toISOString().split('T')[0]
    if (next <= today) setSelectedDate(next)
  }

  useEffect(() => {
    if (accounts.length) fetchLedger()
  }, [fetchLedger])

  const totalBalance = accounts.reduce((s, a) => s + parseFloat(a.current_balance || 0), 0)
  const totalCredit  = ledgerEntries.filter(e => e.transaction_type === 'credit').reduce((s, e) => s + parseFloat(e.amount), 0)
  const totalDebit   = ledgerEntries.filter(e => e.transaction_type === 'debit').reduce((s, e) => s + parseFloat(e.amount), 0)

  const isDark = themeManager.isDark()

  if (loading) {
    return (
      <div className={`h-screen flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-gray-50'}`}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-600 border-t-transparent mx-auto mb-4"></div>
          <p className={isDark ? 'text-gray-400' : 'text-gray-600'}>Loading till...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={`h-screen flex flex-col ${isDark ? 'bg-slate-900' : 'bg-gray-100'}`}>

      {/* ── Header ── */}
      <div className={`${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'} border-b px-5 py-3 flex items-center gap-3 flex-shrink-0`}>
        <button
          onClick={() => router.push('/dashboard')}
          className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'} transition-colors`}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <Wallet className="w-5 h-5 text-indigo-500" />
        <div className="flex-1">
          <h1 className={`text-base font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>My Till</h1>
          {cashier && (
            <p className={`text-xs flex items-center gap-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              <User className="w-3 h-3" />{cashier.name || 'Cashier'}
            </p>
          )}
        </div>
        <button
          onClick={() => {
            if (cashier?.id) fetchAccounts(user?.id, cashier.id)
            else if (user?.id) fetchAdminAccounts(user.id)
            fetchLedger()
          }}
          className={`p-2 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'} transition-colors`}
          title="Refresh"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* ── Two-panel body ── */}
      <div className="flex flex-1 overflow-hidden gap-0">

        {/* ── LEFT PANEL: Balance + Accounts ── */}
        <div className={`w-80 flex-shrink-0 flex flex-col gap-4 p-4 overflow-y-auto border-r ${isDark ? 'border-slate-700' : 'border-gray-200'}`}>

          {/* Total balance hero */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-5 text-white shadow-lg"
          >
            <p className="text-indigo-200 text-xs font-medium uppercase tracking-wide">Total Till Balance</p>
            <p className="text-3xl font-bold mt-1 tabular-nums">
              PKR {totalBalance.toLocaleString('en-PK', { minimumFractionDigits: 0 })}
            </p>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-white/20 text-xs">
              <span className="flex items-center gap-1 text-green-300">
                <TrendingUp className="w-3.5 h-3.5" />
                PKR {totalCredit.toLocaleString()}
              </span>
              <span className={`text-white/30`}>|</span>
              <span className="flex items-center gap-1 text-red-300">
                <TrendingDown className="w-3.5 h-3.5" />
                PKR {totalDebit.toLocaleString()}
              </span>
            </div>
          </motion.div>

          {/* Account cards */}
          {accounts.length === 0 ? (
            <div className={`flex-1 rounded-xl p-6 text-center border-2 border-dashed ${isDark ? 'border-slate-700 text-gray-500' : 'border-gray-300 text-gray-400'}`}>
              <Wallet className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium text-sm">No till accounts</p>
              <p className="text-xs mt-1">Ask your admin to set up your till accounts.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {accounts.map((account, i) => {
                const IconComponent = getIconComponent(account.icon)
                const baseColor = (account.color || '#6366f1').slice(0, 7)
                const balance = parseFloat(account.current_balance || 0)
                const isSelected = selectedAccountId === account.id
                return (
                  <motion.div
                    key={account.id}
                    initial={{ opacity: 0, scale: 0.92 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.05 }}
                    onClick={() => setSelectedAccountId(isSelected ? 'all' : account.id)}
                    style={{ background: `linear-gradient(135deg, ${baseColor}, ${baseColor}cc)` }}
                    className={`rounded-xl p-3.5 text-white cursor-pointer shadow-md transition-all active:scale-95 ${
                      isSelected ? 'ring-2 ring-white/70 ring-offset-2 ring-offset-transparent scale-[1.02]' : 'hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="w-7 h-7 bg-white/20 rounded-lg flex items-center justify-center">
                        <IconComponent className="w-4 h-4" />
                      </div>
                      {isSelected && (
                        <span className="text-[10px] bg-white/25 px-1.5 py-0.5 rounded-full font-medium">✓</span>
                      )}
                    </div>
                    <p className="text-[11px] opacity-80 truncate font-medium">{account.name}</p>
                    <p className="text-lg font-bold mt-0.5 tabular-nums leading-tight">
                      {balance.toLocaleString('en-PK', { minimumFractionDigits: 0 })}
                    </p>
                    <p className="text-[10px] opacity-60">PKR</p>
                  </motion.div>
                )
              })}
            </div>
          )}

          {/* Account filter hint */}
          {accounts.length > 0 && (
            <p className={`text-center text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
              {selectedAccountId === 'all' ? 'Tap an account to filter ledger' : 'Tap again to show all'}
            </p>
          )}
        </div>

        {/* ── RIGHT PANEL: Ledger ── */}
        <div className="flex-1 flex flex-col overflow-hidden">

          {/* Ledger toolbar */}
          <div className={`flex items-center gap-2 px-4 py-3 border-b flex-shrink-0 ${isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-gray-200'}`}>
            <BookOpen className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>
              Ledger
              {ledgerEntries.length > 0 && (
                <span className={`ml-2 text-xs font-normal px-1.5 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-gray-300' : 'bg-gray-100 text-gray-500'}`}>
                  {ledgerEntries.length}
                </span>
              )}
            </span>

            {/* Day navigator */}
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={goToPrevDay}
                className={`p-1.5 rounded-lg ${isDark ? 'text-gray-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'} transition-colors`}
                title="Previous day"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className={`text-xs font-medium px-2 py-1 rounded-lg min-w-[80px] text-center ${isDark ? 'bg-slate-700 text-gray-200' : 'bg-gray-100 text-gray-700'}`}>
                {isToday ? 'Today' : selectedDate}
              </span>
              <button
                onClick={goToNextDay}
                disabled={isToday}
                className={`p-1.5 rounded-lg transition-colors ${
                  isToday
                    ? isDark ? 'text-slate-600 cursor-not-allowed' : 'text-gray-300 cursor-not-allowed'
                    : isDark ? 'text-gray-400 hover:text-white hover:bg-slate-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                }`}
                title="Next day"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              {!isToday && (
                <button
                  onClick={() => setSelectedDate(today)}
                  className={`text-xs px-2 py-1 rounded-lg font-medium transition-colors ${isDark ? 'bg-indigo-900/40 text-indigo-400 hover:bg-indigo-900/60' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100'}`}
                >
                  Today
                </button>
              )}
            </div>

            {/* Type filter */}
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className={`text-xs px-2 py-1.5 rounded-lg border ${
                isDark ? 'bg-slate-700 border-slate-600 text-white' : 'bg-gray-50 border-gray-300 text-gray-900'
              } focus:outline-none focus:border-indigo-500 transition-colors`}
            >
              <option value="all">All</option>
              <option value="credit">In</option>
              <option value="debit">Out</option>
            </select>
            {ledgerLoading && <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin flex-shrink-0" />}
          </div>

          {/* Ledger entries — scrollable */}
          <div className={`flex-1 overflow-y-auto divide-y ${isDark ? 'divide-slate-700/60' : 'divide-gray-100'}`}>
            {ledgerLoading && !ledgerEntries.length ? (
              <div className="flex flex-col items-center justify-center h-full gap-3">
                <div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent"></div>
                <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Loading ledger…</p>
              </div>
            ) : ledgerEntries.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full gap-2">
                <BookOpen className={`w-12 h-12 opacity-20 ${isDark ? 'text-gray-400' : 'text-gray-400'}`} />
                <p className={`text-sm font-medium ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>No transactions</p>
                <p className={`text-xs ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                  {isToday ? 'No activity today' : `No activity on ${selectedDate}`}
                </p>
              </div>
            ) : (
              ledgerEntries.map((entry) => {
                const isCredit = entry.transaction_type === 'credit'
                const isExpanded = expandedEntry === entry.id
                const IconComponent = getIconComponent(entry.payment_accounts?.icon)
                const sourceLabel = SOURCE_LABELS[entry.source_type] || entry.source_type || 'Transaction'

                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setExpandedEntry(isExpanded ? null : entry.id)}
                    className={`px-4 py-3 cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-slate-800/60' : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Direction icon */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isCredit ? isDark ? 'bg-green-900/40' : 'bg-green-100' : isDark ? 'bg-red-900/40' : 'bg-red-100'
                      }`}>
                        {isCredit
                          ? <ArrowDownLeft className="w-4 h-4 text-green-500" />
                          : <ArrowUpRight className="w-4 h-4 text-red-500" />
                        }
                      </div>

                      {/* Description + meta */}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isDark ? 'text-white' : 'text-gray-900'}`}>
                          {entry.description || sourceLabel}
                        </p>
                        <p className={`text-xs flex items-center gap-1.5 mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                          <Clock className="w-3 h-3" />
                          {entry.transaction_date}
                          {entry.payment_accounts?.name && (
                            <>
                              <span className="opacity-40">·</span>
                              <IconComponent className="w-3 h-3" />
                              {entry.payment_accounts.name}
                            </>
                          )}
                        </p>
                      </div>

                      {/* Amount + balance */}
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold tabular-nums ${isCredit ? 'text-green-500' : 'text-red-500'}`}>
                          {isCredit ? '+' : '-'}PKR {parseFloat(entry.amount).toLocaleString()}
                        </p>
                        {entry.balance_after != null && (
                          <p className={`text-xs tabular-nums ${isDark ? 'text-gray-600' : 'text-gray-400'}`}>
                            Bal {parseFloat(entry.balance_after).toLocaleString()}
                          </p>
                        )}
                      </div>

                      <ChevronDown className={`w-3.5 h-3.5 flex-shrink-0 transition-transform ${isDark ? 'text-gray-600' : 'text-gray-300'} ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>

                    {/* Expanded detail */}
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="overflow-hidden"
                        >
                          <div className={`mt-2 pt-2 border-t text-xs space-y-1.5 ${isDark ? 'border-slate-700 text-gray-400' : 'border-gray-100 text-gray-500'}`}>
                            <div className="flex justify-between">
                              <span>Type</span>
                              <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{sourceLabel}</span>
                            </div>
                            <div className="flex justify-between">
                              <span>Account</span>
                              <span className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{entry.payment_accounts?.name || '—'}</span>
                            </div>
                            {entry.notes && (
                              <div className="flex justify-between gap-4">
                                <span>Notes</span>
                                <span className={`font-medium text-right ${isDark ? 'text-gray-200' : 'text-gray-700'}`}>{entry.notes}</span>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function MyTillPage() {
  return (
    <ProtectedPage permissionKey="MY_TILL" pageName="My Till">
      <MyTillContent />
    </ProtectedPage>
  )
}
