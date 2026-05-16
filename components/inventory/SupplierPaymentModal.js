'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, CreditCard, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

export default function SupplierPaymentModal({ isOpen, onClose, supplier, onPaymentRecorded }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ payment_account_id: '', amount: '', notes: '' })

  const user     = authManager.getCurrentUser()
  const cashier  = authManager.getCashier()
  const isAdmin  = authManager.getRole() === 'admin'
  const isDark   = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const drawerEnabled = !isAdmin && (
    user?.use_cashier_drawer === true ||
    (() => { try { return JSON.parse(localStorage.getItem('pos_cashier_drawer_enabled') || 'false') } catch { return false } })()
  )

  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`

  useEffect(() => {
    if (isOpen && supplier) {
      loadAccounts()
      setForm({ payment_account_id: '', amount: '', notes: `Payment to ${supplier.name}` })
    }
  }, [isOpen, supplier?.id])

  const loadAccounts = async () => {
    let q = supabase
      .from('payment_accounts')
      .select('id, name, current_balance, payment_method_key')
      .eq('user_id', user?.id)
      .eq('is_active', true)
    if (drawerEnabled && cashier?.id) q = q.eq('cashier_id', cashier.id)
    else q = q.is('cashier_id', null)
    const { data } = await q.order('sort_order')
    setAccounts(data || [])
  }

  const handleSubmit = async () => {
    if (!form.payment_account_id) { notify.error('Select a payment account'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { notify.error('Enter a valid amount'); return }

    try {
      setLoading(true)
      const amount = parseFloat(form.amount)
      const today  = new Date().toISOString().split('T')[0]

      const { data: payment, error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          user_id:            user?.id,
          supplier_id:        supplier.id,
          purchase_order_id:  null,
          payment_account_id: form.payment_account_id,
          amount_paid:        amount,
          amount_settled:     amount,
          amount_unapplied:   0,
          payment_date:       today,
          notes:              form.notes,
          paid_by:            isAdmin ? user?.id : null,
          paid_by_cashier_id: isAdmin ? null : cashier?.id ?? null,
        })
        .select().single()

      if (payErr) throw payErr

      const { data: lastEntry } = await supabase
        .from('supplier_ledger')
        .select('balance_after')
        .eq('supplier_id', supplier.id)
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false })
        .limit(1).maybeSingle()

      const balanceBefore = parseFloat(lastEntry?.balance_after ?? 0)
      const balanceAfter  = Math.max(0, balanceBefore - amount)

      await supabase.from('supplier_ledger').insert({
        user_id:           user?.id,
        supplier_id:       supplier.id,
        purchase_order_id: null,
        payment_id:        payment.id,
        transaction_type:  'credit',
        transaction_date:  today,
        amount,
        balance_before:    balanceBefore,
        balance_after:     balanceAfter,
        description:       form.notes || `Payment to ${supplier.name}`,
        created_by:        user?.id,
      })

      notify.success(`Payment of Rs. ${amount.toFixed(2)} recorded`)
      onPaymentRecorded?.()
      onClose()
    } catch (err) {
      notify.error(err.message || 'Failed to record payment')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen || !supplier) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}>

        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h3 className={`font-bold ${themeClasses.textPrimary}`}>Record Payment</h3>
              <p className={`text-xs ${themeClasses.textSecondary}`}>{supplier.name}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {accounts.length === 0 ? (
            <div className={`rounded-xl p-4 text-center text-sm ${isDark ? 'bg-gray-700/40 text-gray-400' : 'bg-amber-50 text-amber-700'}`}>
              {drawerEnabled
                ? 'No cashier accounts found. Ask admin to create accounts in Finance → Cashier Accounts.'
                : 'No payment accounts found. Set up accounts in Finance → Accounts.'}
            </div>
          ) : (
            <div>
              <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>
                Payment Account * {drawerEnabled && <span className="text-blue-500">(Cashier Account)</span>}
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
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  )
}
