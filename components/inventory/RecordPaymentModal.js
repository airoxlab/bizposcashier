'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, CreditCard, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { permissionManager } from '../../lib/permissionManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

const VALID_METHODS = ['Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Cheque']
const resolvePaymentMethod = (key) => {
  if (!key) return 'Cash'
  return VALID_METHODS.find(v => v.toLowerCase() === key.toLowerCase().trim()) || 'Cash'
}

export default function RecordPaymentModal({ isOpen, onClose, purchaseOrder, onPaymentRecorded }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [alreadyPaid, setAlreadyPaid] = useState(0)
  const [form, setForm] = useState({ payment_account_id: '', amount: '', notes: '' })

  const user    = authManager.getCurrentUser()
  const cashier = authManager.getCashier()
  const isAdmin = authManager.getRole() === 'admin'
  const isDark  = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`

  useEffect(() => {
    if (isOpen && purchaseOrder) {
      loadAccounts()
      loadPaidTotal()
    }
  }, [isOpen, purchaseOrder?.id])

  // purchase_orders has no amount_paid column — the real total paid must be
  // summed from supplier_payments for this PO.
  const loadPaidTotal = async () => {
    const { data } = await supabase
      .from('supplier_payments')
      .select('amount_paid')
      .eq('purchase_order_id', purchaseOrder.id)
    const paid = (data || []).reduce((s, p) => s + parseFloat(p.amount_paid || 0), 0)
    setAlreadyPaid(paid)
    const remaining = (purchaseOrder.grand_total || 0) - paid
    setForm({
      payment_account_id: '',
      amount: remaining > 0 ? remaining.toFixed(2) : '',
      notes: `Payment for PO ${purchaseOrder.po_number}`,
    })
  }

  const drawerEnabled = !isAdmin && (
    user?.use_cashier_drawer === true ||
    (() => { try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false } })()
  )

  const loadAccounts = async () => {
    let q = supabase
      .from('payment_accounts')
      .select('id, name, current_balance, payment_method_key')
      .eq('user_id', user?.id)
      .eq('is_active', true)

    if (drawerEnabled && cashier?.id) {
      q = q.eq('cashier_id', cashier.id)
    } else {
      q = q.is('cashier_id', null)
    }

    const { data } = await q.order('sort_order')
    setAccounts(data || [])
  }

  const handleSubmit = async () => {
    if (!form.payment_account_id) { notify.error('Select a payment account'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { notify.error('Enter a valid amount'); return }
    if (!purchaseOrder.supplier_id) { notify.error('Purchase order has no supplier'); return }
    const remainingDue = (purchaseOrder.grand_total || 0) - alreadyPaid
    if (parseFloat(form.amount) > remainingDue + 0.01) {
      notify.error(`Amount exceeds the remaining balance of Rs. ${remainingDue.toFixed(2)}`)
      return
    }

    try {
      setLoading(true)
      const amount = parseFloat(form.amount)
      const today  = new Date().toISOString().split('T')[0]

      const selectedAccount = accounts.find(a => a.id === form.payment_account_id)
      const paymentMethod   = resolvePaymentMethod(selectedAccount?.payment_method_key)

      // Insert supplier payment
      const { data: payment, error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          user_id:             user?.id,
          supplier_id:         purchaseOrder.supplier_id,
          purchase_order_id:   purchaseOrder.id,
          payment_account_id:  form.payment_account_id,
          amount_paid:         amount,
          amount_settled:      amount,
          amount_unapplied:    0,
          payment_method:      paymentMethod,
          payment_date:        today,
          notes:               form.notes,
          // Attribution: track admin vs cashier
          paid_by:             isAdmin ? user?.id : null,
          paid_by_cashier_id:  isAdmin ? null : cashier?.id ?? null,
        })
        .select()
        .single()

      if (payErr) throw payErr

      // Create supplier ledger credit entry to reduce the outstanding balance
      const { data: lastEntry } = await supabase
        .from('supplier_ledger')
        .select('balance_after')
        .eq('supplier_id', purchaseOrder.supplier_id)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const balanceBefore = lastEntry?.balance_after ?? 0
      const balanceAfter  = Math.max(0, balanceBefore - amount)

      await supabase.from('supplier_ledger').insert({
        user_id:           user?.id,
        supplier_id:       purchaseOrder.supplier_id,
        purchase_order_id: purchaseOrder.id,
        payment_id:        payment.id,
        transaction_type:  'credit',
        transaction_date:  today,
        amount:            amount,
        balance_before:    balanceBefore,
        balance_after:     balanceAfter,
        description:       `Payment for ${purchaseOrder.po_number}`,
        created_by:        user?.id,
      })

      // Balance deduction is handled automatically by the
      // auto_debit_payment_account_from_supplier_payment trigger on INSERT.

      // Get all payments for this PO to update payment status
      const { data: payments } = await supabase
        .from('supplier_payments')
        .select('amount_paid')
        .eq('purchase_order_id', purchaseOrder.id)

      const totalPaid = (payments || []).reduce((sum, p) => sum + (p.amount_paid || 0), 0)
      const newPaymentStatus = totalPaid >= purchaseOrder.grand_total ? 'paid' : totalPaid > 0 ? 'partial' : 'unpaid'

      // Update the purchase order payment status
      await supabase
        .from('purchase_orders')
        .update({ payment_status: newPaymentStatus })
        .eq('id', purchaseOrder.id)

      notify.success(`Payment of Rs. ${amount.toFixed(2)} recorded`)
      onPaymentRecorded?.()
      onClose()
    } catch (err) {
      notify.error(err.message || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !purchaseOrder) return null

  const remaining = (purchaseOrder.grand_total || 0) - alreadyPaid

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'} overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-indigo-500" />
            </div>
            <div>
              <h3 className={`font-bold ${themeClasses.textPrimary}`}>Record Payment</h3>
              <p className={`text-xs ${themeClasses.textSecondary}`}>
                {purchaseOrder.po_number}
                {drawerEnabled && cashier?.name && (
                  <span className="ml-1.5 text-indigo-500 font-medium">· {cashier.name}'s account</span>
                )}
              </p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Totals */}
          <div className={`rounded-xl p-4 space-y-1.5 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="flex justify-between text-sm">
              <span className={themeClasses.textSecondary}>Grand Total</span>
              <span className={`font-semibold ${themeClasses.textPrimary}`}>Rs. {(purchaseOrder.grand_total || 0).toFixed(2)}</span>
            </div>
            {alreadyPaid > 0 && (
              <div className="flex justify-between text-sm">
                <span className={themeClasses.textSecondary}>Already Paid</span>
                <span className="font-semibold text-green-500">Rs. {alreadyPaid.toFixed(2)}</span>
              </div>
            )}
            <div className={`flex justify-between font-bold border-t pt-1.5 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
              <span className={isDark ? 'text-orange-300' : 'text-orange-700'}>Remaining</span>
              <span className={isDark ? 'text-orange-300' : 'text-orange-700'}>Rs. {remaining.toFixed(2)}</span>
            </div>
          </div>

          {accounts.length === 0 ? (
            <div className={`rounded-xl p-4 text-center text-sm ${isDark ? 'bg-gray-700/40 text-gray-400' : 'bg-amber-50 text-amber-700'}`}>
              {drawerEnabled
                ? 'No cashier accounts set up. Ask admin to create accounts in Finance → Cashier Accounts.'
                : 'No admin payment accounts found. Set up accounts in Finance → Accounts.'}
            </div>
          ) : (
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>
                Payment Account * {drawerEnabled && <span className="text-indigo-500">(Cashier Account)</span>}
              </label>
              <select
                value={form.payment_account_id}
                onChange={e => setForm(p => ({ ...p, payment_account_id: e.target.value }))}
                className={inputCls}
              >
                <option value="">Select account</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} — Rs. {parseFloat(a.current_balance || 0).toLocaleString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Amount *</label>
            <input
              type="number" step="0.01" min="0"
              value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))}
              className={inputCls}
            />
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Notes</label>
            <input
              type="text"
              value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
              className={inputCls}
            />
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-3 px-6 py-4 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
          <button
            onClick={onClose}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || accounts.length === 0}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  )
}
