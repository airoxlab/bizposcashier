'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  History, ChevronDown, ChevronRight, RefreshCw, Search,
  CheckCircle, XCircle, AlertCircle, Clock, Users,
  Loader2, MessageSquare, Calendar, Send,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import { notify } from '../../../components/ui/NotificationSystem'
import ProtectedPage from '../../../components/ProtectedPage'

const STATUS_CONFIG = {
  completed: { label: 'Completed', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', icon: CheckCircle },
  running:   { label: 'Running',   color: 'text-blue-400',  bg: 'bg-blue-500/10 border-blue-500/20',   icon: Clock },
  cancelled: { label: 'Cancelled', color: 'text-yellow-400',bg: 'bg-yellow-500/10 border-yellow-500/20',icon: AlertCircle },
  failed:    { label: 'Failed',    color: 'text-red-400',   bg: 'bg-red-500/10 border-red-500/20',      icon: XCircle },
  draft:     { label: 'Draft',     color: 'text-gray-400',  bg: 'bg-gray-500/10 border-gray-500/20',    icon: MessageSquare },
}

const MSG_STATUS = {
  sent:    { label: 'Sent',    color: 'text-green-400', bg: 'bg-green-500/10' },
  failed:  { label: 'Failed',  color: 'text-red-400',   bg: 'bg-red-500/10' },
  skipped: { label: 'Skipped', color: 'text-yellow-400',bg: 'bg-yellow-500/10' },
  pending: { label: 'Pending', color: 'text-gray-400',  bg: 'bg-gray-500/10' },
}

function CampaignLogPage() {
  const userId = authManager.getCurrentUser()?.id
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)
  const [messages, setMessages] = useState({}) // campaignId → messages[]
  const [loadingMessages, setLoadingMessages] = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => { if (userId) loadCampaigns() }, [userId])

  async function loadCampaigns() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('whatsapp_campaigns')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
      if (error) throw error
      setCampaigns(data || [])
    } catch {
      notify.error('Failed to load campaigns')
    } finally {
      setLoading(false)
    }
  }

  async function loadMessages(campaignId) {
    if (messages[campaignId]) return
    setLoadingMessages(campaignId)
    try {
      const { data, error } = await supabase
        .from('whatsapp_campaign_messages')
        .select('id, phone, customer_name, status, skip_reason, error_message, sent_at')
        .eq('campaign_id', campaignId)
        .eq('user_id', userId)
        .order('created_at', { ascending: true })
      if (error) throw error
      setMessages(prev => ({ ...prev, [campaignId]: data || [] }))
    } catch {
      notify.error('Failed to load messages')
    } finally {
      setLoadingMessages(null)
    }
  }

  function toggleExpand(id) {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      loadMessages(id)
    }
  }

  const filtered = campaigns.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || c.status === statusFilter
    return matchesSearch && matchesStatus
  })

  function fmt(dt) {
    if (!dt) return '—'
    return new Date(dt).toLocaleString('en-PK', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <History size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Campaign Log</h1>
          <p className="text-gray-400 text-sm">History of all WhatsApp campaigns you have sent</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex-1 flex items-center gap-2 bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2">
          <Search size={14} className="text-gray-500" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search campaigns..."
            className="flex-1 bg-transparent text-white text-sm placeholder-gray-500 focus:outline-none"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-gray-800/60 border border-gray-700/50 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
        >
          <option value="all">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button
          onClick={loadCampaigns}
          className="p-2 rounded-xl bg-gray-800/60 border border-gray-700/50 text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin text-gray-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <History size={40} className="mx-auto text-gray-600 mb-3" />
          <p className="text-gray-400 font-semibold">No campaigns yet</p>
          <p className="text-gray-500 text-sm mt-1">Create your first campaign to see it here</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(campaign => {
            const cfg = STATUS_CONFIG[campaign.status] || STATUS_CONFIG.draft
            const StatusIcon = cfg.icon
            const isExp = expanded === campaign.id
            const successRate = campaign.total_recipients > 0
              ? Math.round((campaign.sent_count / campaign.total_recipients) * 100)
              : 0

            return (
              <motion.div
                key={campaign.id}
                layout
                className="rounded-2xl border border-gray-700/50 bg-gray-800/60 overflow-hidden"
              >
                {/* Campaign row */}
                <button
                  onClick={() => toggleExpand(campaign.id)}
                  className="w-full flex items-center gap-4 px-5 py-4 hover:bg-gray-700/20 transition-colors text-left"
                >
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.bg} ${cfg.color} flex-shrink-0`}>
                    <StatusIcon size={11} />
                    {cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{campaign.name}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-gray-400 text-xs flex items-center gap-1">
                        <Calendar size={10} /> {fmt(campaign.created_at)}
                      </span>
                      <span className="text-gray-400 text-xs flex items-center gap-1">
                        <Users size={10} /> {campaign.total_recipients} recipients
                      </span>
                    </div>
                  </div>
                  {/* Mini stats */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <div className="text-center">
                      <p className="text-green-400 font-bold text-sm">{campaign.sent_count}</p>
                      <p className="text-gray-500 text-[10px]">Sent</p>
                    </div>
                    <div className="text-center">
                      <p className="text-red-400 font-bold text-sm">{campaign.failed_count}</p>
                      <p className="text-gray-500 text-[10px]">Failed</p>
                    </div>
                    <div className="text-center">
                      <p className="text-yellow-400 font-bold text-sm">{campaign.skipped_count}</p>
                      <p className="text-gray-500 text-[10px]">Skipped</p>
                    </div>
                    {campaign.status === 'completed' && (
                      <div className="w-10 h-10 relative flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-10 h-10 -rotate-90">
                          <circle cx="18" cy="18" r="15" fill="none" stroke="#374151" strokeWidth="3" />
                          <circle cx="18" cy="18" r="15" fill="none" stroke="#22c55e" strokeWidth="3"
                            strokeDasharray={`${successRate * 0.942} 100`} strokeLinecap="round" />
                        </svg>
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-green-400">
                          {successRate}%
                        </span>
                      </div>
                    )}
                    {isExp ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
                  </div>
                </button>

                {/* Expanded messages */}
                <AnimatePresence>
                  {isExp && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden border-t border-gray-700/50"
                    >
                      <div className="px-5 py-3">
                        {/* Template preview */}
                        <div className="bg-gray-900/50 rounded-xl p-3 mb-3 border border-gray-700/30">
                          <p className="text-gray-500 text-[10px] font-semibold uppercase tracking-wider mb-1">Message Template</p>
                          <p className="text-gray-300 text-xs whitespace-pre-wrap leading-relaxed">{campaign.message_template}</p>
                        </div>

                        {loadingMessages === campaign.id ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 size={18} className="animate-spin text-gray-500" />
                          </div>
                        ) : (
                          <div className="max-h-60 overflow-y-auto space-y-1">
                            {(messages[campaign.id] || []).map(msg => {
                              const ms = MSG_STATUS[msg.status] || MSG_STATUS.pending
                              return (
                                <div key={msg.id} className="flex items-center gap-3 py-1.5 border-b border-gray-700/20 last:border-0">
                                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ms.bg} ${ms.color} flex-shrink-0`}>
                                    {ms.label}
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-medium truncate">{msg.customer_name || msg.phone}</p>
                                    <p className="text-gray-500 text-[10px]">{msg.phone}</p>
                                  </div>
                                  {msg.sent_at && <p className="text-gray-500 text-[10px] flex-shrink-0">{fmt(msg.sent_at)}</p>}
                                  {msg.skip_reason && <p className="text-yellow-500 text-[10px] flex-shrink-0">{msg.skip_reason}</p>}
                                  {msg.error_message && <p className="text-red-400 text-[10px] flex-shrink-0 truncate max-w-32" title={msg.error_message}>{msg.error_message}</p>}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function CampaignLog() {
  return <ProtectedPage permissionKey="MARKETING_CAMPAIGN_LOG" pageName="Campaign Log"><CampaignLogPage /></ProtectedPage>
}
