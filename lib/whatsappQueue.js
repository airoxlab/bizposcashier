/**
 * whatsappQueue.js
 *
 * Client-side bridge to the CENTRALIZED WhatsApp sender.
 *
 * The WhatsApp socket no longer lives on this PC — it runs once per restaurant
 * on the Railway admin server. From here we only:
 *   - read connection status / QR from `whatsapp_connection`
 *   - ask the server to connect/disconnect (request flags)
 *   - drop outgoing messages into `whatsapp_outbox` and (optionally) wait for
 *     the server to mark them sent/failed
 *
 * `restaurantId` is always the business owner's user id
 * (authManager.getCurrentUser()?.id resolves to it for both admins and cashiers).
 */

import { supabase } from './supabase'

const MEDIA_BUCKET = 'whatsapp-media'

// ── Phone normalisation (mirrors the other senders) ──────────────────────────
export function formatPhone(phone) {
  if (!phone || typeof phone !== 'string') return null
  let p = phone.trim().replace(/[\s\-\.\(\)]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('00')) p = p.slice(2)
  if (!/^\d+$/.test(p)) return null
  if (p.startsWith('0') && p.length === 11) p = '92' + p.slice(1)
  if (p.length < 10 || p.length > 15) return null
  if (p.startsWith('0')) return null
  return p
}

// ── Connection status ────────────────────────────────────────────────────────
export async function getStatus(restaurantId) {
  if (!restaurantId) return { status: 'disconnected' }
  const { data } = await supabase
    .from('whatsapp_connection')
    .select('status, qr_string, connected_phone')
    .eq('restaurant_id', restaurantId)
    .maybeSingle()
  return data || { status: 'disconnected' }
}

export async function isConnected(restaurantId) {
  return (await getStatus(restaurantId)).status === 'connected'
}

export async function requestConnect(restaurantId) {
  if (!restaurantId) return
  await supabase.from('whatsapp_connection').upsert(
    {
      restaurant_id: restaurantId,
      connect_request: true,
      disconnect_request: false,
      status: 'connecting',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'restaurant_id' }
  )
}

export async function requestDisconnect(restaurantId) {
  if (!restaurantId) return
  await supabase.from('whatsapp_connection').upsert(
    {
      restaurant_id: restaurantId,
      disconnect_request: true,
      connect_request: false,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'restaurant_id' }
  )
}

/**
 * Poll the connection row and call cb on every tick. Returns an unsubscribe fn.
 */
export function subscribeConnection(restaurantId, cb, intervalMs = 2000) {
  let stopped = false
  async function tick() {
    if (stopped || !restaurantId) return
    const data = await getStatus(restaurantId)
    if (!stopped) cb(data)
  }
  tick()
  const timer = setInterval(tick, intervalMs)
  return () => {
    stopped = true
    clearInterval(timer)
  }
}

// ── Outbox ───────────────────────────────────────────────────────────────────
async function insertOutbox(row) {
  const { data, error } = await supabase
    .from('whatsapp_outbox')
    .insert(row)
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

/**
 * Poll an outbox row until it reaches a terminal state.
 * Returns { success, error?, skipped?, skipReason? }.
 */
export async function waitForResult(id, timeoutMs = 60_000, pollMs = 1500) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await supabase
      .from('whatsapp_outbox')
      .select('status, error, skip_reason')
      .eq('id', id)
      .maybeSingle()
    if (data) {
      if (data.status === 'sent') return { success: true }
      if (data.status === 'failed') return { success: false, error: data.error || 'Send failed' }
      if (data.status === 'skipped')
        return { success: false, skipped: true, skipReason: data.skip_reason }
    }
    await new Promise((r) => setTimeout(r, pollMs))
  }
  return { success: false, error: 'Timed out waiting for WhatsApp to send' }
}

// ── Storage upload helpers ───────────────────────────────────────────────────
function dataUrlToBytes(dataUrl) {
  const base64 = dataUrl.split(',')[1] || ''
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function base64ToBytes(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
}

function guessMime(filename = '') {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime',
    pdf: 'application/pdf',
  }
  return map[ext] || 'application/octet-stream'
}

async function uploadBytes(restaurantId, bytes, { contentType, ext = 'bin' }) {
  const path = `${restaurantId}/${Date.now()}_${Math.floor(Math.random() * 1e9)}.${ext}`
  const { error } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, bytes, { contentType, upsert: false })
  if (error) throw error
  return path
}

/** Upload media once (e.g. a campaign attachment reused for many recipients). */
export async function uploadMediaBase64(restaurantId, base64, mime, filename) {
  const ext = filename?.split('.').pop()?.toLowerCase() || 'bin'
  return uploadBytes(restaurantId, base64ToBytes(base64), { contentType: mime, ext })
}

// ── Enqueue: text ────────────────────────────────────────────────────────────
export async function enqueueText({ restaurantId, phone, message, sendAfter }) {
  const formatted = formatPhone(phone)
  if (!formatted) return { id: null, skipped: true, skipReason: 'invalid_phone' }
  const id = await insertOutbox({
    restaurant_id: restaurantId,
    to_phone: formatted,
    kind: 'text',
    body: message || '',
    send_after: sendAfter || new Date().toISOString(),
  })
  return { id, phoneSent: formatted }
}

// ── Enqueue: image (from a rendered data URL) ────────────────────────────────
export async function enqueueImage({ restaurantId, phone, message, dataUrl, filename = 'receipt.png', sendAfter }) {
  const formatted = formatPhone(phone)
  if (!formatted) return { id: null, skipped: true, skipReason: 'invalid_phone' }
  const path = await uploadBytes(restaurantId, dataUrlToBytes(dataUrl), {
    contentType: 'image/png',
    ext: 'png',
  })
  const id = await insertOutbox({
    restaurant_id: restaurantId,
    to_phone: formatted,
    kind: 'image',
    body: message || '',
    media_path: path,
    media_mime: 'image/png',
    media_filename: filename,
    send_after: sendAfter || new Date().toISOString(),
  })
  return { id, phoneSent: formatted }
}

// ── Enqueue: media already uploaded to storage (shared attachment) ───────────
export async function enqueueExistingMedia({ restaurantId, phone, message, mediaPath, mime, filename, kind, sendAfter }) {
  const formatted = formatPhone(phone)
  if (!formatted) return { id: null, skipped: true, skipReason: 'invalid_phone' }
  const id = await insertOutbox({
    restaurant_id: restaurantId,
    to_phone: formatted,
    kind: kind || (mime?.startsWith('image/') ? 'image' : 'document'),
    body: message || '',
    media_path: mediaPath,
    media_mime: mime || guessMime(filename),
    media_filename: filename || 'file',
    send_after: sendAfter || new Date().toISOString(),
  })
  return { id, phoneSent: formatted }
}

// ── Convenience: enqueue + wait for terminal result ──────────────────────────
function normalizeEnqueueResult(r) {
  if (r.skipped) return { ok: false, result: { success: false, skipped: true, skipReason: r.skipReason } }
  if (!r.id) return { ok: false, result: { success: false, error: 'Failed to enqueue message' } }
  return { ok: true, id: r.id, phoneSent: r.phoneSent }
}

export async function enqueueTextAndWait(args, timeoutMs = 60_000) {
  const n = normalizeEnqueueResult(await enqueueText(args))
  if (!n.ok) return n.result
  return { ...(await waitForResult(n.id, timeoutMs)), phoneSent: n.phoneSent }
}

export async function enqueueImageAndWait(args, timeoutMs = 120_000) {
  const n = normalizeEnqueueResult(await enqueueImage(args))
  if (!n.ok) return n.result
  return { ...(await waitForResult(n.id, timeoutMs)), phoneSent: n.phoneSent }
}

export async function enqueueExistingMediaAndWait(args, timeoutMs = 120_000) {
  const n = normalizeEnqueueResult(await enqueueExistingMedia(args))
  if (!n.ok) return n.result
  return { ...(await waitForResult(n.id, timeoutMs)), phoneSent: n.phoneSent }
}

const whatsappQueue = {
  formatPhone,
  getStatus,
  isConnected,
  requestConnect,
  requestDisconnect,
  subscribeConnection,
  waitForResult,
  uploadMediaBase64,
  enqueueText,
  enqueueImage,
  enqueueExistingMedia,
  enqueueTextAndWait,
  enqueueImageAndWait,
  enqueueExistingMediaAndWait,
  guessMime,
}

export default whatsappQueue
