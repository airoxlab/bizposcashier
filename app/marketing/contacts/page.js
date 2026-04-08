'use client'

import { useState, useEffect } from 'react'
import {
  Users, Search, RefreshCw, Shield, ShieldOff, Loader2,
  Phone, User, AlertCircle, CheckCircle, X, Filter,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import { notify } from '../../../components/ui/NotificationSystem'
import ProtectedPage from '../../../components/ProtectedPage'

function ContactsPage() {
  const userId = authManager.getCurrentUser()?.id
  const [customers, setCustomers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all') // all | active | blocked
  const [togglingId, setTogglingId] = useState(null)

  // Block reason modal
  const [blockModal, setBlockModal] = useState(null) // { customer }
  const [blockReason, setBlockReason] = useState('')

  useEffect(() => { if (userId) loadContacts() }, [userId])

  async function loadContacts() {
    setLoading(true)
    try {
      // Get all customers for this user
      const { data: custs, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, email, created_at')
        .eq('user_id', userId)
        .order('full_name', { ascending: true })

      if (error) throw error

      // Get block status from whatsapp_contacts
      const { data: contacts } = await supabase
        .from('whatsapp_contacts')
        .select('customer_id, is_blocked, block_reason, blocked_at')
        .eq('user_id', userId)

      const contactMap = {}
      ;(contacts || []).forEach(c => { contactMap[c.customer_id] = c })

      const enriched = (custs || []).map(c => ({
        ...c,
        is_blocked: contactMap[c.id]?.is_blocked || false,
        block_reason: contactMap[c.id]?.block_reason || null,
        blocked_at: contactMap[c.id]?.blocked_at || null,
      }))

      setCustomers(enriched)
    } catch {
      notify.error('Failed to load contacts')
    } finally {
      setLoading(false)
    }
  }

  async function toggleBlock(customer) {
    if (!customer.is_blocked) {
      // Show reason modal before blocking
      setBlockModal({ customer })
      setBlockReason('')
      return
    }
    // Unblock directly
    await setBlocked(customer.id, false, null)
  }

  async function confirmBlock() {
    if (!blockModal) return
    await setBlocked(blockModal.customer.id, true, blockReason || null)
    setBlockModal(null)
    setBlockReason('')
  }

  async function setBlocked(customerId, isBlocked, reason) {
    setTogglingId(customerId)
    try {
      const { error } = await supabase
        .from('whatsapp_contacts')
        .upsert({
          user_id: userId,
          customer_id: customerId,
          is_blocked: isBlocked,
          block_reason: reason,
          blocked_at: isBlocked ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,customer_id' })

      if (error) throw error

      setCustomers(prev => prev.map(c =>
        c.id === customerId
          ? { ...c, is_blocked: isBlocked, block_reason: reason, blocked_at: isBlocked ? new Date().toISOString() : null }
          : c
      ))

      notify.success(isBlocked ? 'Customer opted out from WhatsApp messages' : 'Customer opted back in')
    } catch {
      notify.error('Failed to update contact')
    } finally {
      setTogglingId(null)
    }
  }

  const filtered = customers.filter(c => {
    const q = search.toLowerCase()
    const matchesSearch =
      (c.full_name || '').toLowerCase().includes(q) ||
      (c.phone || '').includes(q) ||
      (c.email || '').toLowerCase().includes(q)
    const matchesFilter =
      filter === 'all' ||
      (filter === 'blocked' && c.is_blocked) ||
      (filter === 'active' && !c.is_blocked)
    return matchesSearch && matchesFilter
  })

  const blockedCount = customers.filter(c => c.is_blocked).length
  const activeCount = customers.length - blockedCount

  function fmt(dt) {
    if (!dt) return null
    return new Date(dt).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Users size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Contacts</h1>
          <p className="text-gray-400 text-sm">Manage customers and control who receives WhatsApp messages</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Total Customers', value: customers.length, color: 'from-purple-500 to-blue-500' },
          { label: 'Active (will receive)', value: activeCount, color: 'from-green-500 to-emerald-600' },
          { label: 'Opted Out', value: blockedCount, color: 'from-red-500 to-red-600' },
        ].map(s => (
          <div key={s.label} className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4 text-center">
            <p className={`text-2xl font-bold bg-gradient-to-r ${s.color} bg-clip-text text-transparent`}>{s.value}</p>
            <p className="text-gray-400 text-xs mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl mb-4">
        <AlertCircle size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <p className="text-blue-400 text-xs leading-relaxed">
          Opted-out customers will be skipped in both <strong>campaigns</strong> and <strong>auto thank-you messages</strong>.
          You don't need to manually check if a customer is registered on WhatsApp — just opt out anyone who requests it.
        </p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2">
          <Search size={14} className="text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name, phone or email..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
          />
          {search && (
            <button onClick={() => setSearch('')}>
              <X size={13} className="text-gray-500 hover:text-white" />
            </button>
          )}
        </div>
        <div className="flex rounded-xl border border-gray-700/50 overflow-hidden">
          {[['all','All'], ['active','Active'], ['blocked','Opted Out']].map(([v, l]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`px-4 py-2 text-xs font-semibold transition-colors ${
                filter === v
                  ? 'bg-purple-500/20 text-purple-400'
                  : 'text-gray-400 hover:text-white bg-gray-800/60'
              }`}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          onClick={loadContacts}
          className="p-2 rounded-xl bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Customer list */}
      <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 border-b border-gray-700/50 bg-gray-900/30">
          {[['Customer', 4], ['Phone', 3], ['Email', 2], ['Status', 1], ['Action', 2]].map(([h, span]) => (
            <div key={h} className={`col-span-${span} text-gray-500 text-[10px] font-semibold uppercase tracking-wider`}>{h}</div>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={22} className="animate-spin text-gray-500" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16">
            <Users size={36} className="mx-auto text-gray-600 mb-3" />
            <p className="text-gray-400 font-semibold">No customers found</p>
          </div>
        ) : (
          filtered.map(c => (
            <div
              key={c.id}
              className={`grid grid-cols-12 gap-3 px-5 py-3.5 border-b border-gray-700/20 last:border-0 items-center hover:bg-gray-700/20 transition-colors ${
                c.is_blocked ? 'opacity-60' : ''
              }`}
            >
              {/* Customer */}
              <div className="col-span-4 flex items-center gap-3 min-w-0">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                  c.is_blocked ? 'bg-red-500/15' : 'bg-purple-500/15'
                }`}>
                  <User size={14} className={c.is_blocked ? 'text-red-400' : 'text-purple-400'} />
                </div>
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{c.full_name || 'Unknown'}</p>
                  {c.is_blocked && c.blocked_at && (
                    <p className="text-red-400 text-[10px]">Opted out {fmt(c.blocked_at)}</p>
                  )}
                  {c.is_blocked && c.block_reason && (
                    <p className="text-gray-500 text-[10px] truncate" title={c.block_reason}>{c.block_reason}</p>
                  )}
                </div>
              </div>

              {/* Phone */}
              <div className="col-span-3">
                <p className="text-gray-300 text-sm font-mono">{c.phone || '—'}</p>
              </div>

              {/* Email */}
              <div className="col-span-2 min-w-0">
                <p className="text-gray-400 text-sm truncate">{c.email || '—'}</p>
              </div>

              {/* Status */}
              <div className="col-span-1">
                {c.is_blocked ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/20 text-red-400">
                    <ShieldOff size={9} /> Opted Out
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400">
                    <CheckCircle size={9} /> Active
                  </span>
                )}
              </div>

              {/* Action */}
              <div className="col-span-2">
                <button
                  onClick={() => toggleBlock(c)}
                  disabled={togglingId === c.id}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    c.is_blocked
                      ? 'bg-green-500/10 border border-green-500/25 text-green-400 hover:bg-green-500/20'
                      : 'bg-red-500/10 border border-red-500/25 text-red-400 hover:bg-red-500/20'
                  } disabled:opacity-50`}
                >
                  {togglingId === c.id
                    ? <Loader2 size={11} className="animate-spin" />
                    : c.is_blocked ? <><CheckCircle size={11} /> Opt In</> : <><ShieldOff size={11} /> Opt Out</>
                  }
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Block reason modal */}
      {blockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
                <ShieldOff size={18} className="text-red-400" />
              </div>
              <div>
                <h3 className="text-white font-bold">Opt Out Customer</h3>
                <p className="text-gray-400 text-xs">{blockModal.customer.full_name || blockModal.customer.phone}</p>
              </div>
            </div>

            <p className="text-gray-400 text-sm mb-3">
              This customer will be opted out from all WhatsApp messages. Reason (optional):
            </p>
            <input
              value={blockReason}
              onChange={e => setBlockReason(e.target.value)}
              placeholder="e.g. Customer requested no messages"
              className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-red-500/60 mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && confirmBlock()}
            />

            <div className="flex gap-3">
              <button
                onClick={() => setBlockModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-600/50 text-gray-300 text-sm font-semibold hover:bg-gray-700/50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBlock}
                className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm font-bold hover:bg-red-500/30 transition-colors"
              >
                Opt Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function Contacts() {
  return <ProtectedPage permissionKey="MARKETING_CONTACTS" pageName="Contacts"><ContactsPage /></ProtectedPage>
}
