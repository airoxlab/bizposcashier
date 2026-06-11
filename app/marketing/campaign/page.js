'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Megaphone, Users, Search, CheckSquare, Square, FileImage,
  FileVideo, FileText, X, Send, Loader2, ChevronDown,
  AlertCircle, CheckCircle, XCircle, Clock, Wifi, WifiOff,
  Phone, User, Upload, Trash2, Play, Pause, RotateCcw, Info,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import { notify } from '../../../components/ui/NotificationSystem'
import ProtectedPage from '../../../components/ProtectedPage'
import whatsappQueue from '../../../lib/whatsappQueue'

const TEMPLATE_VARS = ['{full_name}', '{phone}']

function CampaignPage() {
  const userId = authManager.getCurrentUser()?.id
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.whatsapp

  // ── State ──────────────────────────────────────────────────
  const [customers, setCustomers] = useState([])
  const [filteredCustomers, setFilteredCustomers] = useState([])
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [search, setSearch] = useState('')
  const [loadingCustomers, setLoadingCustomers] = useState(true)

  const [campaignName, setCampaignName] = useState('')
  const [message, setMessage] = useState('')
  const [mediaFile, setMediaFile] = useState(null) // { name, path, type }
  const fileInputRef = useRef(null)

  const [waStatus, setWaStatus] = useState('disconnected')
  const [isSending, setIsSending] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [progress, setProgress] = useState(null)
  // progress: { total, sent, failed, skipped, current }

  const pauseRef = useRef(false)
  const stopRef = useRef(false)
  const msgRef = useRef(null)

  // ── Load data ──────────────────────────────────────────────
  useEffect(() => {
    if (userId) loadCustomers()
  }, [userId])

  // Listen to centralized WA status (server-side socket, shared across PCs)
  useEffect(() => {
    if (!userId) return
    const unsub = whatsappQueue.subscribeConnection(userId, (conn) => setWaStatus(conn.status || 'disconnected'))
    return () => unsub()
  }, [userId])

  // Filter customers
  useEffect(() => {
    const q = search.toLowerCase()
    setFilteredCustomers(
      customers.filter(c =>
        (c.full_name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q)
      )
    )
  }, [search, customers])

  async function loadCustomers() {
    setLoadingCustomers(true)
    try {
      // Get all customers for this user
      const { data: all, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, created_at')
        .eq('user_id', userId)
        .not('phone', 'is', null)
        .order('full_name', { ascending: true })

      if (error) throw error

      // Get blocked customer IDs
      const { data: blocked } = await supabase
        .from('whatsapp_contacts')
        .select('customer_id')
        .eq('user_id', userId)
        .eq('is_blocked', true)

      const blockedSet = new Set((blocked || []).map(b => b.customer_id))
      const enriched = (all || []).map(c => ({ ...c, is_blocked: blockedSet.has(c.id) }))
      setCustomers(enriched)
      setFilteredCustomers(enriched)
    } catch (e) {
      notify.error('Failed to load customers')
    } finally {
      setLoadingCustomers(false)
    }
  }

  // ── Selection helpers ──────────────────────────────────────
  const activeCustomers = customers.filter(c => !c.is_blocked && c.phone)
  const allSelected = activeCustomers.length > 0 && activeCustomers.every(c => selectedIds.has(c.id))

  function toggleAll() {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(activeCustomers.map(c => c.id)))
    }
  }

  function toggleOne(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // ── Media file picker ──────────────────────────────────────
  async function pickFile() {
    if (isElectron && window.electronAPI?.pickFile) {
      const result = await window.electronAPI.pickFile({
        filters: [
          { name: 'Media', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'pdf'] }
        ]
      })
      if (result) setMediaFile(result)
    } else {
      fileInputRef.current?.click()
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    const type = ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image'
      : ['mp4','mov'].includes(ext) ? 'video'
      : ext === 'pdf' ? 'pdf' : 'other'
    setMediaFile({ name: file.name, path: file.path || file.name, type, size: file.size })
  }

  function insertVar(v) {
    const ta = msgRef.current
    if (!ta) return
    const start = ta.selectionStart
    const newMsg = message.slice(0, start) + v + message.slice(ta.selectionEnd)
    setMessage(newMsg)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + v.length, start + v.length)
    }, 10)
  }

  // ── Send campaign ─────────────────────────────────────────
  async function startCampaign() {
    if (!campaignName.trim()) return notify.error('Enter a campaign name')
    if (!message.trim()) return notify.error('Enter a message')
    if (selectedIds.size === 0) return notify.error('Select at least one customer')
    if (mediaFile && !isElectron) return notify.error('Sending media requires the desktop app')
    if (waStatus !== 'connected') return notify.error('WhatsApp is not connected. Go to Settings → WhatsApp to connect.')

    const recipients = customers.filter(c => selectedIds.has(c.id) && !c.is_blocked && c.phone)
    if (recipients.length === 0) return notify.error('No valid recipients selected')

    // Load send delay settings
    const { data: waSetting } = await supabase
      .from('whatsapp_settings')
      .select('campaign_send_delay_min, campaign_send_delay_max')
      .eq('user_id', userId)
      .single()

    const delayMin = (waSetting?.campaign_send_delay_min || 3) * 1000
    const delayMax = (waSetting?.campaign_send_delay_max || 8) * 1000

    // Create campaign record
    const { data: campaign, error: campErr } = await supabase
      .from('whatsapp_campaigns')
      .insert({
        user_id: userId,
        name: campaignName,
        message_template: message,
        media_type: mediaFile?.type || null,
        media_name: mediaFile?.name || null,
        status: 'running',
        total_recipients: recipients.length,
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (campErr || !campaign?.id) return notify.error('Failed to create campaign')
    const campaignId = campaign.id

    // Insert pending rows
    const { error: msgInsertErr } = await supabase.from('whatsapp_campaign_messages').insert(
      recipients.map(c => ({
        user_id: userId,
        campaign_id: campaignId,
        customer_id: c.id,
        phone: c.phone,
        customer_name: c.full_name || '',
        status: 'pending',
      }))
    )
    if (msgInsertErr) {
      notify.error('Failed to create campaign records')
      await supabase.from('whatsapp_campaigns').delete().eq('id', campaignId)
      return
    }

    // Upload the campaign attachment ONCE (reused for every recipient) ──
    let campaignMedia = null
    if (mediaFile?.path) {
      try {
        const rf = await window.electronAPI.whatsapp.readFileBase64({ path: mediaFile.path })
        if (rf?.success) {
          const filename = mediaFile.name || 'media'
          const mime = whatsappQueue.guessMime(filename)
          const kind = mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'document'
          const mediaPath = await whatsappQueue.uploadMediaBase64(userId, rf.base64, mime, filename)
          campaignMedia = { mediaPath, mime, filename, kind }
        } else {
          throw new Error(rf?.error || 'read failed')
        }
      } catch (e) {
        notify.error('Failed to upload campaign media')
        await supabase.from('whatsapp_campaigns').delete().eq('id', campaignId)
        return
      }
    }

    // Start sending loop
    setIsSending(true)
    stopRef.current = false
    pauseRef.current = false
    setProgress({ total: recipients.length, sent: 0, failed: 0, skipped: 0, current: null })

    let sent = 0, failed = 0, skipped = 0

    for (let i = 0; i < recipients.length; i++) {
      if (stopRef.current) break

      while (pauseRef.current) {
        await new Promise(r => setTimeout(r, 500))
      }

      const c = recipients[i]
      setProgress(p => ({ ...p, current: c.full_name || c.phone }))

      const finalMsg = message
        .replace(/\{full_name\}/g, c.full_name || '')
        .replace(/\{phone\}/g, c.phone || '')

      try {
        const result = campaignMedia
          ? await whatsappQueue.enqueueExistingMediaAndWait({
              restaurantId: userId,
              phone: c.phone,
              message: finalMsg,
              mediaPath: campaignMedia.mediaPath,
              mime: campaignMedia.mime,
              filename: campaignMedia.filename,
              kind: campaignMedia.kind,
            })
          : await whatsappQueue.enqueueTextAndWait({ restaurantId: userId, phone: c.phone, message: finalMsg })

        if (result.success) {
          sent++
          await supabase.from('whatsapp_campaign_messages')
            .update({ status: 'sent', message_sent: finalMsg, sent_at: new Date().toISOString() })
            .eq('campaign_id', campaignId).eq('customer_id', c.id)
        } else if (result.skipped) {
          skipped++
          await supabase.from('whatsapp_campaign_messages')
            .update({ status: 'skipped', skip_reason: result.skipReason })
            .eq('campaign_id', campaignId).eq('customer_id', c.id)
        } else {
          failed++
          await supabase.from('whatsapp_campaign_messages')
            .update({ status: 'failed', error_message: result.error })
            .eq('campaign_id', campaignId).eq('customer_id', c.id)
        }
      } catch (err) {
        failed++
        await supabase.from('whatsapp_campaign_messages')
          .update({ status: 'failed', error_message: err.message })
          .eq('campaign_id', campaignId).eq('customer_id', c.id)
      }

      setProgress({ total: recipients.length, sent, failed, skipped, current: null })

      // Random delay between sends (skip delay for last message)
      if (i < recipients.length - 1 && !stopRef.current) {
        const delay = delayMin + Math.random() * (delayMax - delayMin)
        await new Promise(r => setTimeout(r, delay))
      }
    }

    // Mark campaign complete
    const finalStatus = stopRef.current ? 'cancelled' : 'completed'
    await supabase.from('whatsapp_campaigns')
      .update({
        status: finalStatus,
        sent_count: sent,
        failed_count: failed,
        skipped_count: skipped,
        completed_at: new Date().toISOString(),
      })
      .eq('id', campaignId)

    setIsSending(false)
    stopRef.current = false
    notify.success(`Campaign ${finalStatus}! Sent: ${sent}, Failed: ${failed}, Skipped: ${skipped}`)
  }

  function pauseResume() {
    pauseRef.current = !pauseRef.current
    setIsPaused(pauseRef.current)
  }

  function stopCampaign() {
    stopRef.current = true
    pauseRef.current = false
    setIsPaused(false)
  }

  const mediaIcon = mediaFile?.type === 'image' ? FileImage
    : mediaFile?.type === 'video' ? FileVideo : FileText

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <Megaphone size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-white font-bold text-lg leading-tight">Campaign</h1>
          <p className="text-gray-400 text-sm">Create and send bulk WhatsApp messages to your customers</p>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-5">

        {/* ── Left: Customer Selection ── */}
        <div className="col-span-2 space-y-3">
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 overflow-hidden">
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-700/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Users size={15} className="text-purple-400" />
                <span className="text-white font-semibold text-sm">Recipients</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 font-semibold">
                  {selectedIds.size} selected
                </span>
              </div>
              <button
                onClick={toggleAll}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
              >
                {allSelected
                  ? <CheckSquare size={13} className="text-purple-400" />
                  : <Square size={13} />
                }
                {allSelected ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* Search */}
            <div className="px-3 py-2 border-b border-gray-700/50">
              <div className="flex items-center gap-2 bg-gray-900/50 border border-gray-600/40 rounded-xl px-3 py-2">
                <Search size={13} className="text-gray-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search by name or phone..."
                  className="flex-1 bg-transparent text-white text-xs placeholder-gray-500 focus:outline-none"
                />
              </div>
            </div>

            {/* List */}
            <div className="overflow-y-auto max-h-[calc(100vh-340px)]">
              {loadingCustomers ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-gray-500" />
                </div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-10 text-gray-500 text-sm">No customers found</div>
              ) : (
                filteredCustomers.map(c => (
                  <div
                    key={c.id}
                    onClick={() => !c.is_blocked && toggleOne(c.id)}
                    className={`flex items-center gap-3 px-4 py-2.5 border-b border-gray-700/30 transition-colors ${
                      c.is_blocked
                        ? 'opacity-40 cursor-not-allowed'
                        : 'cursor-pointer hover:bg-gray-700/30'
                    }`}
                  >
                    <div className={`flex-shrink-0 ${c.is_blocked ? '' : 'cursor-pointer'}`}>
                      {selectedIds.has(c.id)
                        ? <CheckSquare size={15} className="text-purple-400" />
                        : <Square size={15} className="text-gray-500" />
                      }
                    </div>
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-purple-500/20 flex items-center justify-center flex-shrink-0">
                      <User size={13} className="text-purple-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-xs font-semibold truncate">{c.full_name || 'Unknown'}</p>
                      <p className="text-gray-400 text-[11px]">{c.phone}</p>
                    </div>
                    {c.is_blocked && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Blocked</span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Campaign Builder ── */}
        <div className="col-span-3 space-y-4">
          {/* WA status warning */}
          {waStatus !== 'connected' && (
            <div className="flex items-center gap-3 p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
              <WifiOff size={15} className="text-red-400 flex-shrink-0" />
              <p className="text-red-400 text-xs">
                WhatsApp is not connected. <a href="/settings/whatsapp" className="underline font-semibold">Connect in Settings</a> before sending.
              </p>
            </div>
          )}

          {/* Campaign name */}
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4 space-y-3">
            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider">Campaign Name</label>
            <input
              value={campaignName}
              onChange={e => setCampaignName(e.target.value)}
              placeholder="e.g. Eid Special Offer"
              className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/60"
            />
          </div>

          {/* Message */}
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-gray-400 text-xs font-semibold uppercase tracking-wider">Message</label>
              <div className="flex gap-1.5">
                {TEMPLATE_VARS.map(v => (
                  <button
                    key={v}
                    onClick={() => insertVar(v)}
                    className="px-2 py-1 rounded-lg bg-purple-500/15 border border-purple-500/25 text-purple-300 text-[11px] font-mono hover:bg-purple-500/25 transition-all"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <textarea
              ref={msgRef}
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={6}
              placeholder="Type your campaign message..."
              className="w-full bg-gray-900/60 border border-gray-600/40 rounded-xl px-4 py-3 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500/60 resize-none font-mono leading-relaxed"
            />
            <p className="text-gray-500 text-xs">{message.length} characters</p>
          </div>

          {/* Media attachment */}
          <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4">
            <label className="block text-gray-400 text-xs font-semibold uppercase tracking-wider mb-3">
              Attachment (Optional)
            </label>
            {mediaFile ? (
              <div className="flex items-center gap-3 p-3 bg-gray-700/40 border border-gray-600/30 rounded-xl">
                {mediaFile.type === 'image' ? <FileImage size={18} className="text-blue-400" />
                  : mediaFile.type === 'video' ? <FileVideo size={18} className="text-purple-400" />
                  : <FileText size={18} className="text-red-400" />}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm truncate">{mediaFile.name}</p>
                  <p className="text-gray-400 text-xs capitalize">{mediaFile.type}</p>
                </div>
                <button onClick={() => setMediaFile(null)} className="p-1.5 hover:bg-gray-600/50 rounded-lg transition-colors">
                  <X size={14} className="text-gray-400" />
                </button>
              </div>
            ) : (
              <button
                onClick={pickFile}
                className="w-full flex flex-col items-center gap-2 py-6 border-2 border-dashed border-gray-600/40 rounded-xl hover:border-purple-500/40 hover:bg-purple-500/5 transition-all"
              >
                <Upload size={20} className="text-gray-500" />
                <p className="text-gray-400 text-sm">Click to attach image, video or PDF</p>
                <p className="text-gray-500 text-xs">Max 16MB for video, 100MB for PDF</p>
              </button>
            )}
            <input ref={fileInputRef} type="file" accept="image/*,video/mp4,.pdf" className="hidden" onChange={handleFileChange} />
          </div>

          {/* Send button / progress */}
          {!isSending ? (
            <button
              onClick={startCampaign}
              disabled={selectedIds.size === 0 || !message.trim() || !campaignName.trim() || waStatus !== 'connected'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold text-sm hover:shadow-lg hover:shadow-purple-500/25 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Send size={16} />
              Send to {selectedIds.size} {selectedIds.size === 1 ? 'customer' : 'customers'}
            </button>
          ) : (
            <div className="rounded-2xl border border-gray-700/50 bg-gray-800/60 p-4 space-y-3">
              {/* Progress bar */}
              {progress && (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">
                      Sending{progress.current ? ` to ${progress.current}` : '...'}
                    </span>
                    <span className="text-white font-semibold">
                      {progress.sent + progress.failed + progress.skipped} / {progress.total}
                    </span>
                  </div>
                  <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-purple-500 to-blue-500 rounded-full transition-all duration-300"
                      style={{ width: `${((progress.sent + progress.failed + progress.skipped) / progress.total) * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-4 text-xs">
                    <span className="flex items-center gap-1 text-green-400">
                      <CheckCircle size={12} /> {progress.sent} sent
                    </span>
                    <span className="flex items-center gap-1 text-red-400">
                      <XCircle size={12} /> {progress.failed} failed
                    </span>
                    <span className="flex items-center gap-1 text-yellow-400">
                      <AlertCircle size={12} /> {progress.skipped} skipped
                    </span>
                  </div>
                </>
              )}
              <div className="flex gap-2">
                <button
                  onClick={pauseResume}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-yellow-500/15 border border-yellow-500/30 text-yellow-400 text-sm font-semibold hover:bg-yellow-500/25 transition-all"
                >
                  {isPaused ? <><Play size={14} /> Resume</> : <><Pause size={14} /> Pause</>}
                </button>
                <button
                  onClick={stopCampaign}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-red-500/15 border border-red-500/30 text-red-400 text-sm font-semibold hover:bg-red-500/25 transition-all"
                >
                  <X size={14} /> Stop
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function Campaign() {
  return <ProtectedPage permissionKey="MARKETING_CAMPAIGN" pageName="Campaigns"><CampaignPage /></ProtectedPage>
}
