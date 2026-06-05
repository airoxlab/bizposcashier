'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, PlusCircle, X, Search, DollarSign,
  Save, Users, Clock, Wallet
} from 'lucide-react'
import ProtectedPage from '../../components/ProtectedPage'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import themeManager from '../../lib/themeManager'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'

const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-PK', { style: 'currency', currency: 'PKR', minimumFractionDigits: 0 }).format(amount || 0)

const REPAYMENT_TYPES = [
  { value: 'next_payroll', label: 'Deduct from Next Payroll' },
  { value: 'installments', label: 'Installments' },
  { value: 'manual',       label: 'Manual Repayment' },
]

const EMPTY_FORM = {
  employee_id: '',
  amount: '',
  reason: '',
  repayment_type: 'next_payroll',
  installment_amount: '',
  payment_account_id: '',
  notes: '',
}

function InitialsAvatar({ name }) {
  const initials = (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <div className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center shrink-0">
      <span className="text-xs font-bold text-blue-700 dark:text-blue-300">{initials}</span>
    </div>
  )
}

function PayrollPageInner() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [employees, setEmployees] = useState([])
  const [paymentAccounts, setPaymentAccounts] = useState([])

  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ ...EMPTY_FORM })
  const [saving, setSaving] = useState(false)
  const [employeeSearch, setEmployeeSearch] = useState('')

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (!userData) { router.push('/'); return }
    try { setUser(JSON.parse(userData)) } catch { router.push('/') }
    themeManager.applyTheme()
  }, [router])

  useEffect(() => {
    if (user?.id) fetchAll()
  }, [user])

  const fetchAll = async () => {
    setLoading(true)
    try {
      await Promise.all([fetchEmployees(), fetchPaymentAccounts()])
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    const { data } = await supabase
      .from('payroll_employees')
      .select('id, name, designation, is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
    setEmployees(data || [])
  }

  const fetchPaymentAccounts = async () => {
    const isAdmin = authManager.getRole() === 'admin'
    const cashier = authManager.getCashier()
    const drawerEnabled = !isAdmin && (
      user?.use_cashier_drawer === true ||
      (() => { try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false } })()
    )
    let q = supabase
      .from('payment_accounts')
      .select('id, name, current_balance')
      .eq('user_id', user.id)
      .eq('is_active', true)
    if (drawerEnabled && cashier?.id) q = q.eq('cashier_id', cashier.id)
    else q = q.is('cashier_id', null)
    const { data } = await q.order('sort_order', { ascending: true })
    setPaymentAccounts(data || [])
  }

  const openModal = () => {
    setForm({ ...EMPTY_FORM })
    setEmployeeSearch('')
    setShowModal(true)
  }

  const handleGiveAdvance = async () => {
    if (!user?.id) return notify.error('Not authenticated')
    if (!form.employee_id) return notify.error('Select an employee')
    const amount = parseFloat(form.amount)
    if (!amount || isNaN(amount) || amount <= 0) return notify.error('Enter a valid amount')
    if (!form.reason.trim()) return notify.error('Reason is required')
    if (!form.payment_account_id) return notify.error('Select a payment account')
    if (form.repayment_type === 'installments') {
      const installAmt = parseFloat(form.installment_amount)
      if (!form.installment_amount || isNaN(installAmt) || installAmt <= 0) {
        return notify.error('Installment amount must be a positive number')
      }
    }

    setSaving(true)
    let insertedId = null
    try {
      const cashier = authManager.getCashier()
      const cashierTag = cashier?.name ? `Given by cashier: ${cashier.name}` : 'Given via cashier app'
      const fullNotes = form.notes.trim() ? `${form.notes.trim()} — ${cashierTag}` : cashierTag

      const { data: inserted, error: insErr } = await supabase
        .from('payroll_advances')
        .insert({
          user_id: user.id,
          employee_id: form.employee_id,
          amount,
          reason: form.reason.trim(),
          repayment_type: form.repayment_type,
          installment_amount: form.repayment_type === 'installments'
            ? parseFloat(form.installment_amount) : null,
          notes: fullNotes,
          status: 'pending',
          total_repaid: 0,
        })
        .select()
        .single()
      if (insErr) throw insErr
      insertedId = inserted.id

      const { data: result, error: rpcErr } = await supabase.rpc('approve_salary_advance', {
        p_advance_id: inserted.id,
        p_user_id: user.id,
        p_payment_account_id: form.payment_account_id,
        p_approved_by: user.id,
      })
      if (rpcErr) throw rpcErr
      if (!result?.success) throw new Error(result?.error || 'Disbursement failed')

      const empName = employees.find(e => e.id === form.employee_id)?.name || 'employee'
      notify.success(`${formatCurrency(amount)} advance paid to ${empName}`)
      setShowModal(false)
    } catch (err) {
      if (insertedId) {
        await supabase.from('payroll_advances').delete().eq('id', insertedId).eq('status', 'pending')
      }
      notify.error(err.message || 'Failed to give advance')
    } finally {
      setSaving(false)
    }
  }

  const selectedEmployee = employees.find(e => e.id === form.employee_id)
  const filteredEmployees = employees.filter(e =>
    !employeeSearch ||
    e.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    e.designation?.toLowerCase().includes(employeeSearch.toLowerCase())
  )

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 p-4 sm:p-6">
      <NotificationSystem />

      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className="p-2 rounded-lg bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">Payroll</h1>
            <p className="text-sm text-gray-500 dark:text-slate-400">Give salary advances to employees</p>
          </div>
        </div>
        <button
          onClick={openModal}
          disabled={loading}
          className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow-sm disabled:opacity-60"
        >
          <PlusCircle className="w-4 h-4" /> Give Advance
        </button>
      </div>

      {/* Centered prompt */}
      <div className="flex flex-col items-center justify-center py-24">
        <div className="p-5 rounded-full bg-blue-50 dark:bg-blue-900/20 mb-4">
          <Wallet className="w-10 h-10 text-blue-500 dark:text-blue-400" />
        </div>
        <p className="text-gray-700 dark:text-slate-300 font-medium mb-1">Give a salary advance</p>
        <p className="text-sm text-gray-400 dark:text-slate-500 mb-5 text-center max-w-xs">
          Select an employee, enter the amount and payment account, then confirm.
        </p>
        <button
          onClick={openModal}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium shadow disabled:opacity-60"
        >
          <PlusCircle className="w-4 h-4" /> Give Advance
        </button>
      </div>

      {/* Give Advance Modal */}
      <AnimatePresence>
        {showModal && (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => !saving && setShowModal(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }}
              className="relative bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-3xl border border-gray-200 dark:border-slate-700 flex flex-col max-h-[92vh]"
            >
              <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-slate-700">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Give Salary Advance</h2>
                <button onClick={() => !saving && setShowModal(false)} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-400">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {employees.length === 0 ? (
                <div className="text-center py-12 px-6">
                  <Users className="w-10 h-10 text-gray-300 dark:text-slate-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-slate-400">
                    No active employees found. Add employees in the admin panel first.
                  </p>
                </div>
              ) : (
                <div className="flex-1 flex overflow-hidden min-h-0">

                  {/* ── Left: searchable employee list ── */}
                  <div className="w-64 flex-shrink-0 border-r border-gray-200 dark:border-slate-700 flex flex-col">
                    <div className="p-3 border-b border-gray-200 dark:border-slate-700">
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                        Employee <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                          value={employeeSearch}
                          onChange={e => setEmployeeSearch(e.target.value)}
                          placeholder="Search employee…"
                          className="w-full pl-8 pr-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {filteredEmployees.length === 0 ? (
                        <p className="text-xs text-gray-400 dark:text-slate-500 text-center py-8">No employee found</p>
                      ) : filteredEmployees.map(e => (
                        <button
                          key={e.id}
                          type="button"
                          onClick={() => f('employee_id', e.id)}
                          className={`w-full flex items-center gap-2.5 p-2 rounded-lg text-left transition-all ${
                            form.employee_id === e.id
                              ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-500'
                              : 'border border-transparent hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}
                        >
                          <InitialsAvatar name={e.name} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{e.name}</p>
                            {e.designation && (
                              <p className="text-xs text-gray-500 dark:text-slate-400 truncate">{e.designation}</p>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* ── Right: advance details ── */}
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">
                    {/* Amount */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Amount (PKR) <span className="text-red-500">*</span></label>
                      <input
                        type="number" min="1" value={form.amount}
                        onChange={e => f('amount', e.target.value)}
                        onWheel={e => e.target.blur()}
                        placeholder="0"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                      />
                    </div>

                    {/* Reason */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Reason <span className="text-red-500">*</span></label>
                      <textarea
                        rows={2} value={form.reason}
                        onChange={e => f('reason', e.target.value)}
                        placeholder="State the reason for advance…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm resize-none"
                      />
                    </div>

                    {/* Repayment Type */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Repayment Method</label>
                      <div className="grid grid-cols-3 gap-2">
                        {REPAYMENT_TYPES.map(rt => (
                          <label key={rt.value} className={`flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-all ${
                            form.repayment_type === rt.value
                              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                              : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                          }`}>
                            <input
                              type="radio" name="repayment_type" value={rt.value}
                              checked={form.repayment_type === rt.value}
                              onChange={e => f('repayment_type', e.target.value)}
                              className="accent-blue-600"
                            />
                            <span className={`text-xs font-medium ${form.repayment_type === rt.value ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-slate-300'}`}>
                              {rt.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Installment Amount */}
                    {form.repayment_type === 'installments' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Installment Amount (PKR) <span className="text-red-500">*</span></label>
                        <input
                          type="number" min="1" value={form.installment_amount}
                          onChange={e => f('installment_amount', e.target.value)}
                          onWheel={e => e.target.blur()}
                          placeholder="Per-period deduction"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm"
                        />
                      </div>
                    )}

                    {/* Payment Account */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Pay From Account <span className="text-red-500">*</span></label>
                      {paymentAccounts.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-slate-500">No payment accounts available</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {paymentAccounts.map(pa => {
                            const lowBal = pa.current_balance != null && pa.current_balance < parseFloat(form.amount || 0)
                            return (
                              <label key={pa.id} onClick={() => f('payment_account_id', pa.id)} className={`flex flex-col gap-1 p-2.5 rounded-lg border cursor-pointer transition-all ${
                                form.payment_account_id === pa.id
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                                  : 'border-gray-200 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                              }`}>
                                <div className="flex items-center gap-2">
                                  <input
                                    type="radio" name="payment_account" value={pa.id}
                                    checked={form.payment_account_id === pa.id}
                                    onChange={() => f('payment_account_id', pa.id)}
                                    className="accent-blue-600 shrink-0"
                                  />
                                  <span className={`text-sm font-medium truncate ${form.payment_account_id === pa.id ? 'text-blue-700 dark:text-blue-300' : 'text-gray-700 dark:text-slate-300'}`}>
                                    {pa.name}
                                  </span>
                                </div>
                                {pa.current_balance != null && (
                                  <span className={`text-xs font-semibold pl-5 ${lowBal ? 'text-red-500' : 'text-emerald-600 dark:text-emerald-400'}`}>
                                    {formatCurrency(pa.current_balance)}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {/* Notes */}
                    <div>
                      <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Additional Notes</label>
                      <textarea
                        rows={2} value={form.notes}
                        onChange={e => f('notes', e.target.value)}
                        placeholder="Optional…"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm resize-none"
                      />
                    </div>

                    {selectedEmployee && form.amount && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-900/30">
                        <p className="text-xs text-blue-800 dark:text-blue-300">
                          <span className="font-semibold">{formatCurrency(parseFloat(form.amount) || 0)}</span> will be paid to{' '}
                          <span className="font-semibold">{selectedEmployee.name}</span> and debited from the selected account.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="p-5 border-t border-gray-200 dark:border-slate-700 flex justify-end gap-3">
                <button
                  onClick={() => !saving && setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-sm text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Cancel
                </button>
                <button
                  onClick={handleGiveAdvance}
                  disabled={saving || employees.length === 0}
                  className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium disabled:opacity-60"
                >
                  {saving ? <Clock className="w-4 h-4 animate-spin" /> : <DollarSign className="w-4 h-4" />}
                  {saving ? 'Paying…' : 'Pay Advance'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function PayrollPage() {
  return (
    <ProtectedPage permissionKey="PAYROLL" pageName="Payroll">
      <PayrollPageInner />
    </ProtectedPage>
  )
}
