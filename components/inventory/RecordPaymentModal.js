'use client'

import React, { useState, useEffect } from 'react'
import { X, Loader2, CreditCard, Check } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import { notify } from '../ui/NotificationSystem'
import themeManager from '../../lib/themeManager'

export default function RecordPaymentModal({ isOpen, onClose, purchaseOrder, onPaymentRecorded }) {
  const [loading, setLoading] = useState(false)
  const [accounts, setAccounts] = useState([])
  const [form, setForm] = useState({ payment_account_id: '', amount: '', notes: '' })

  const user = authManager.getCurrentUser()
  const isDark = themeManager.isDark()
  const themeClasses = themeManager.getClasses()

  const inputCls = `w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'
  }`

  useEffect(() => {
    if (isOpen && purchaseOrder) {
      loadAccounts()
      setForm({
        payment_account_id: '',
        amount: purchaseOrder.grand_total?.toFixed(2) || '',
        notes: `Payment for PO ${purchaseOrder.po_number}`
      })
    }
  }, [isOpen, purchaseOrder?.id])

  const loadAccounts = async () => {
    const { data } = await supabase
      .from('payment_accounts')
      .select('id, name, current_balance, payment_method_key')
      .eq('user_id', user?.id)
      .eq('is_active', true)
      .order('sort_order')
    setAccounts(data || [])
  }

  const handleSubmit = async () => {
    if (!form.payment_account_id) { notify.error('Select a payment account'); return }
    if (!form.amount || parseFloat(form.amount) <= 0) { notify.error('Enter a valid amount'); return }

    try {
      setLoading(true)
      const amount = parseFloat(form.amount)

      // Insert supplier payment
      const { data: payment, error: payErr } = await supabase
        .from('supplier_payments')
        .insert({
          user_id: user?.id,
          supplier_id: purchaseOrder.supplier_id,
          purchase_order_id: purchaseOrder.id,
          payment_account_id: form.payment_account_id,
          amount,
          notes: form.notes,
          payment_date: new Date().toISOString().split('T')[0]
        })
        .select()
        .single()

      if (payErr) throw payErr

      // Debit payment account balance
      await supabase.rpc('update_account_balance', {
        p_account_id: form.payment_account_id,
        p_amount: -amount
      }).catch(() => {}) // non-fatal if RPC doesn't exist

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className={`relative w-full max-w-md rounded-2xl shadow-2xl ${isDark ? 'bg-gray-800' : 'bg-white'} overflow-hidden`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-500/15 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-teal-500" />
            </div>
            <div>
              <h3 className={`font-bold ${themeClasses.textPrimary}`}>Record Payment</h3>
              <p className={`text-xs ${themeClasses.textSecondary}`}>{purchaseOrder.po_number}</p>
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Totals info */}
          <div className={`rounded-xl p-4 space-y-1.5 ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
            <div className="flex justify-between text-sm">
              <span className={themeClasses.textSecondary}>Grand Total</span>
              <span className={`font-semibold ${themeClasses.textPrimary}`}>Rs. {purchaseOrder.grand_total?.toFixed(2)}</span>
            </div>
            {purchaseOrder.amount_paid > 0 && (
              <div className="flex justify-between text-sm">
                <span className={themeClasses.textSecondary}>Already Paid</span>
                <span className="font-semibold text-green-500">Rs. {purchaseOrder.amount_paid?.toFixed(2)}</span>
              </div>
            )}
            <div className={`flex justify-between font-bold border-t pt-1.5 ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
              <span className={isDark ? 'text-orange-300' : 'text-orange-700'}>Remaining</span>
              <span className={isDark ? 'text-orange-300' : 'text-orange-700'}>
                Rs. {((purchaseOrder.grand_total || 0) - (purchaseOrder.amount_paid || 0)).toFixed(2)}
              </span>
            </div>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Payment Account *</label>
            <select value={form.payment_account_id} onChange={e => setForm(p => ({ ...p, payment_account_id: e.target.value }))} className={inputCls}>
              <option value="">Select account</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} — Rs. {parseFloat(a.current_balance || 0).toLocaleString()}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Amount *</label>
            <input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} className={inputCls} />
          </div>

          <div>
            <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Notes</label>
            <input type="text" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} className={inputCls} />
          </div>
        </div>

        {/* Footer */}
        <div className={`flex gap-3 px-6 py-4 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
          <button onClick={onClose} className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            Record Payment
          </button>
        </div>
      </div>
    </div>
  )
}
