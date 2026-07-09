'use client'
// GlobalFingerprintListener — app-wide fingerprint attendance kiosk.
//
// Mounted once in the root layout. When enabled in settings, it keeps the
// reader listening on EVERY page; on a matched scan it records attendance via
// the record_fingerprint_scan() RPC and flashes a popup ("Checked in" /
// "Checked out" / "Already marked") for a few seconds, over whatever page is
// open (KDS, orders, etc.).
//
// Coordination: while the user is on the dedicated /fingerprint page (enroll /
// test), this listener PAUSES so it doesn't fight that page for the reader.
// Matching needs the native dpfj.dll, so it only runs in the Electron app.

import { useState, useEffect, useRef, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authManager } from '@/lib/authManager'
import { getTodaysBusinessDate } from '@/lib/utils/businessDayUtils'
import { CheckCircle, LogIn, LogOut, AlertCircle, X } from 'lucide-react'

const PER_PERSON_COOLDOWN_MS = 8000   // ignore the same person re-scanning this fast
const RESCAN_DELAY_MS        = 1500   // gap between attendance scans
const TEMPLATE_REFRESH_MS    = 60000  // re-pull enrolled templates periodically

function loadWebSdkScript() {
  return new Promise((resolve, reject) => {
    if (window.WebSdk) { resolve(); return }
    const existing = document.querySelector('script[src="/sdk/WebSdk.client.min.js"]')
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return }
    const s = document.createElement('script')
    s.src = '/sdk/WebSdk.client.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('SDK not found'))
    document.head.appendChild(s)
  })
}

function extractSampleData(sample) {
  if (!sample) return null
  const raw = typeof sample === 'string' ? sample : (sample?.Data ?? sample?.data ?? null)
  if (!raw) return null
  return String(raw).replace(/-/g, '+').replace(/_/g, '/')
}

function getInitials(name) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
}
function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—'
}

function isElectron() {
  return typeof window !== 'undefined' && !!window.electronAPI?.identifyFingerprint
}

// True when the local clock is inside the configured business window. Mirrors the
// overnight logic in businessDayUtils (uses the PC's local/PKT clock). Used only
// when the owner opts into "restrict scans to business hours".
function isWithinBusinessHours(start, end) {
  const [sh, sm] = String(start || '00:00').split(':').map(Number)
  const [eh, em] = String(end   || '23:59').split(':').map(Number)
  const s = sh * 60 + sm
  const e = eh * 60 + em
  if (s === e) return true                          // 24h business
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  return e > s ? (cur >= s && cur < e)              // same-day hours (e.g. 09:00→21:00)
               : (cur >= s || cur < e)              // overnight (e.g. 10:00→03:00)
}

export default function GlobalFingerprintListener() {
  const pathname = usePathname()
  const [popup, setPopup] = useState(null)

  const readerRef    = useRef(null)
  const sdkRef       = useRef(null)
  const userIdRef    = useRef(null)
  const settingsRef  = useRef({ enabled: false, popupSeconds: 3, sound: true, enableCheckout: true, gapMinutes: 30, restrictHours: false, start: '10:00', end: '03:00' })
  const templatesRef = useRef([])          // [{ person_type, person_id, name, subtitle, template }]
  const scanningRef  = useRef(false)
  const busyRef      = useRef(false)
  const cooldownRef  = useRef({})          // person key → last scan ms
  const pausedRef    = useRef(false)       // true while on /fingerprint page
  const fpUiRef     = useRef(false)        // true while settings enroll tab is open
  const popupTimer   = useRef(null)
  const startedRef   = useRef(false)
  const initedRef    = useRef(false)       // one-time init guard
  const initingRef   = useRef(false)

  // Initialise once a user is actually logged in (the component is mounted in the
  // root layout before login, so we can't init at mount time).
  const ensureInit = useCallback(async () => {
    if (initedRef.current || initingRef.current) return
    if (!isElectron()) return
    const user = authManager.getCurrentUser()
    const uid = user?.user_id || user?.id
    if (!uid) return
    initingRef.current = true
    try {
      userIdRef.current = uid
      await loadSettings()
      await loadTemplates()
      await initReader()
      initedRef.current = true
      maybeStart()
    } finally { initingRef.current = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Pause on the dedicated fingerprint page; otherwise (re)init + resume.
  useEffect(() => {
    const onFpPage = pathname === '/fingerprint'
    pausedRef.current = onFpPage
    if (onFpPage) { stopAcquire(); return }
    if (!initedRef.current) { ensureInit(); return }
    // Returning from the enroll page — refresh templates (new enrollments) and resume.
    loadTemplates().then(() => maybeStart())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Poll for login, then init once; afterwards refresh templates periodically.
  useEffect(() => {
    if (!isElectron()) return
    let cancelled = false
    let ticks = 0
    ensureInit()
    const tick = setInterval(() => {
      if (cancelled) return
      if (!initedRef.current) { ensureInit(); return }       // keep polling until logged in
      ticks++
      // ~every 60s: refresh templates, then (re)start scanning — without the
      // maybeStart() the kiosk stayed dormant after the FIRST-ever enrollment
      // because nothing kicked acquisition once templates appeared.
      if (!pausedRef.current && ticks % 15 === 0) loadTemplates().then(() => maybeStart())
    }, 4000)

    return () => {
      cancelled = true
      clearInterval(tick)
      if (popupTimer.current) clearTimeout(popupTimer.current)
      try { readerRef.current?.off?.() } catch {}
      stopAcquire()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadSettings() {
    const uid = userIdRef.current
    if (!uid) return
    const { data } = await supabase
      .from('users')
      .select('business_start_time, business_end_time, fingerprint_attendance_enabled, fingerprint_popup_seconds, fingerprint_sound_enabled, fingerprint_enable_checkout, fingerprint_checkout_min_gap_minutes, fingerprint_restrict_to_business_hours')
      .eq('id', uid).single()
    if (data) {
      settingsRef.current = {
        enabled:        !!data.fingerprint_attendance_enabled,
        popupSeconds:   data.fingerprint_popup_seconds ?? 3,
        sound:          data.fingerprint_sound_enabled ?? true,
        enableCheckout: data.fingerprint_enable_checkout ?? true,
        gapMinutes:     data.fingerprint_checkout_min_gap_minutes ?? 30,
        restrictHours:  !!data.fingerprint_restrict_to_business_hours,
        start:          data.business_start_time || '10:00',
        end:            data.business_end_time || '03:00',
      }
    }
  }

  // Load all active templates (employee / owner / admin_staff) and resolve names.
  async function loadTemplates() {
    const uid = userIdRef.current
    if (!uid) return
    const [{ data: fps }, { data: emps }, { data: staff }, { data: owner }] = await Promise.all([
      supabase.from('employee_fingerprints').select('person_type, person_id, template').eq('user_id', uid).eq('is_active', true),
      supabase.from('payroll_employees').select('id, name, designation').eq('user_id', uid),
      supabase.from('admin_staff').select('id, name').eq('user_id', uid),
      supabase.from('users').select('id, customer_name, store_name').eq('id', uid).single(),
    ])
    const empMap   = new Map((emps  || []).map(e => [e.id, e]))
    const staffMap = new Map((staff || []).map(s => [s.id, s]))
    templatesRef.current = (fps || []).map(fp => {
      let name = 'Unknown', subtitle = ''
      if (fp.person_type === 'employee')      { const e = empMap.get(fp.person_id);   name = e?.name || 'Employee'; subtitle = e?.designation || 'Employee' }
      else if (fp.person_type === 'admin_staff') { const s = staffMap.get(fp.person_id); name = s?.name || 'Admin staff'; subtitle = 'Admin staff' }
      else if (fp.person_type === 'owner')    { name = owner?.customer_name || owner?.store_name || 'Owner'; subtitle = 'Owner' }
      return { person_type: fp.person_type, person_id: fp.person_id, name, subtitle, template: fp.template }
    })
    // Auto-close any sessions whose business day already ended.
    const bd = getTodaysBusinessDate(settingsRef.current.start, settingsRef.current.end)
    supabase.rpc('auto_close_open_sessions', { p_user_id: uid, p_current_business_date: bd }).then(() => {}, () => {})
  }

  async function initReader() {
    if (readerRef.current) return
    await loadWebSdkScript()
    const sdk = await import('@digitalpersona/devices')
    sdkRef.current = sdk
    const reader = new sdk.FingerprintReader()
    readerRef.current = reader
    reader.on('SamplesAcquired', onSample)
    reader.on('DeviceConnected', () => {
      window.__fpDeviceConnected = true
      window.dispatchEvent(new CustomEvent('fp:device-status', { detail: { connected: true } }))
      maybeStart()
    })
    reader.on('DeviceDisconnected', () => {
      window.__fpDeviceConnected = false
      window.dispatchEvent(new CustomEvent('fp:device-status', { detail: { connected: false } }))
    })
    reader.on('AcquisitionStopped', () => { scanningRef.current = false })
    // A reader already plugged in at startup fires no DeviceConnected event —
    // surface it from the enumerate result so the settings panel / badges
    // don't show a false "No reader" while the kiosk toggle is off.
    try {
      const devs = await reader.enumerateDevices()
      if (devs?.length) {
        window.__fpDeviceConnected = true
        window.dispatchEvent(new CustomEvent('fp:device-status', { detail: { connected: true } }))
      }
    } catch {}
  }

  // Pause when any fingerprint UI (enroll tab in settings) takes the reader.
  useEffect(() => {
    const handler = (e) => {
      fpUiRef.current = !!e.detail?.active
      if (fpUiRef.current) { stopAcquire(); return }
      if (pausedRef.current || !initedRef.current) return
      // The enroll UI just closed — pull templates BEFORE resuming so a person
      // enrolled seconds ago is recognized (and so the very first enrollment
      // actually starts the kiosk instead of seeing an empty template list).
      loadTemplates().then(() => maybeStart())
    }
    window.addEventListener('fp:ui-mode', handler)
    return () => window.removeEventListener('fp:ui-mode', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Settings saved in the Fingerprint settings tab apply live — without this
  // the kiosk kept the values loaded at init until an app restart.
  useEffect(() => {
    const handler = () => {
      if (!initedRef.current) { ensureInit(); return }
      loadSettings().then(() => {
        if (!settingsRef.current.enabled) { stopAcquire(); return }
        loadTemplates().then(() => maybeStart())
      })
    }
    window.addEventListener('fp:settings-changed', handler)
    return () => window.removeEventListener('fp:settings-changed', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function maybeStart() {
    if (!isElectron()) return
    if (!settingsRef.current.enabled) return
    if (pausedRef.current) return
    if (fpUiRef.current) return
    if (!templatesRef.current.length) return
    startAcquire()
  }

  async function startAcquire() {
    if (scanningRef.current || !readerRef.current || !sdkRef.current) return
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
      scanningRef.current = true
      startedRef.current = true
      window.__fpDeviceConnected = true
      window.dispatchEvent(new CustomEvent('fp:device-status', { detail: { connected: true } }))
    } catch { scanningRef.current = false }
  }

  async function stopAcquire() {
    try { await readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
  }

  const onSample = useCallback(async (e) => {
    if (pausedRef.current || busyRef.current || fpUiRef.current) return
    if (!settingsRef.current.enabled) return
    const raw = extractSampleData(e.samples?.[0])
    if (!raw) return
    busyRef.current = true
    try {
      const templates = templatesRef.current
      if (!templates.length) return
      const r = await window.electronAPI.identifyFingerprint(
        raw,
        templates.map(t => ({ id: `${t.person_type}:${t.person_id}`, name: t.name, template: t.template })),
      )
      if (!r?.matched) { showResult({ noMatch: true }); return }
      const person = templates.find(t => `${t.person_type}:${t.person_id}` === r.id)
      if (!person) { showResult({ noMatch: true }); return }
      // Optional guard: ignore scans outside business hours (opt-in setting).
      const s = settingsRef.current
      if (s.restrictHours && !isWithinBusinessHours(s.start, s.end)) {
        showResult({ person, action: 'closed' })
        return
      }
      // Per-person cooldown to avoid hammering the RPC on a held finger.
      const now = Date.now()
      const last = cooldownRef.current[r.id]
      if (last && now - last < PER_PERSON_COOLDOWN_MS) return
      cooldownRef.current[r.id] = now
      const res = await recordScan(person)
      showResult({ person, ...res })
    } catch {
      // swallow — kiosk should never crash the app
    } finally {
      setTimeout(() => {
        busyRef.current = false
        // maybeStart (not startAcquire) so the restart respects the same
        // guards as everywhere else — enroll UI open, kiosk disabled, paused.
        if (!pausedRef.current) { stopAcquire().then(() => maybeStart()) }
      }, RESCAN_DELAY_MS)
    }
  }, [])

  async function recordScan(person) {
    const s = settingsRef.current
    const bd = getTodaysBusinessDate(s.start, s.end)
    const { data, error } = await supabase.rpc('record_fingerprint_scan', {
      p_user_id: userIdRef.current,
      p_person_type: person.person_type,
      p_person_id: person.person_id,
      p_business_date: bd,
      p_now: new Date().toISOString(),
      p_device: null,
      p_enable_checkout: s.enableCheckout,
      p_checkout_gap_minutes: s.gapMinutes,
    })
    if (error) {
      // Surface the real cause — otherwise the popup just says "Error" with no
      // hint. Almost always a DB/RPC issue (e.g. migration not applied). The
      // scan is NOT recorded when this happens.
      console.error('[FP] record_fingerprint_scan failed:', error.message, error)
      return { action: 'error', error: error.message }
    }
    const row = Array.isArray(data) ? data[0] : data
    return {
      action: row?.result_action || 'already',
      inTime: row?.in_time,
      outTime: row?.out_time,
      status: row?.att_status || null,        // present | late | half_day | absent (from rules)
      lateMinutes: row?.late_minutes || 0,
    }
  }

  function showResult(data) {
    if (popupTimer.current) clearTimeout(popupTimer.current)
    setPopup(data)
    if (settingsRef.current.sound) { try { beep(data.action) } catch {} }
    const ms = (settingsRef.current.popupSeconds || 3) * 1000
    popupTimer.current = setTimeout(() => setPopup(null), data.noMatch ? 2000 : ms)
  }

  function beep(action) {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator(); const g = ctx.createGain()
    o.connect(g); g.connect(ctx.destination)
    o.frequency.value = action === 'check_out' ? 520 : 760
    g.gain.value = 0.08
    o.start(); setTimeout(() => { o.stop(); ctx.close() }, 140)
  }

  if (!popup) return null

  // ── Popup overlay (renders over any page) ──
  const noMatch = popup.noMatch
  const action  = popup.action
  const accent =
    noMatch || action === 'error' ? 'red' :
    action === 'check_in' ? 'green' :
    action === 'check_out' ? 'blue' :
    action === 'completed' || action === 'closed' ? 'slate' : 'amber'
  const ring = { green: 'border-green-400', blue: 'border-blue-400', amber: 'border-amber-400', red: 'border-red-400', slate: 'border-slate-400' }[accent]
  const badge = { green: 'bg-green-500', blue: 'bg-blue-500', amber: 'bg-amber-400', red: 'bg-red-500', slate: 'bg-slate-500' }[accent]

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => { clearTimeout(popupTimer.current); setPopup(null) }}>
      {noMatch ? (
        <div className={`bg-white rounded-2xl shadow-2xl p-8 text-center max-w-xs w-full border-4 ${ring}`}>
          <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <X className="w-10 h-10 text-red-500" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-1">Not Recognized</h2>
          <p className="text-gray-500 text-sm">Fingerprint not enrolled. Try again or enroll first.</p>
        </div>
      ) : (
        <div className={`bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm w-full border-4 ${ring}`}>
          <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${badge}`}>
            <span className="text-white text-4xl font-bold">{getInitials(popup.person?.name)}</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-0.5">{popup.person?.name}</h2>
          {popup.person?.subtitle && <p className="text-gray-500 text-sm mb-3">{popup.person.subtitle}</p>}
          <div className={`flex items-center justify-center gap-2 font-bold text-xl mb-3 ${
            action === 'check_in' ? 'text-green-600' : action === 'check_out' ? 'text-blue-600' : action === 'error' ? 'text-red-600' : (action === 'completed' || action === 'closed') ? 'text-slate-600' : 'text-amber-600'
          }`}>
            {action === 'check_in'  && <><LogIn className="w-6 h-6" /> Checked In</>}
            {action === 'check_out' && <><LogOut className="w-6 h-6" /> Checked Out</>}
            {action === 'already'   && <><CheckCircle className="w-6 h-6" /> Already Marked</>}
            {action === 'completed' && <><CheckCircle className="w-6 h-6" /> Shift Complete</>}
            {action === 'closed'    && <><AlertCircle className="w-6 h-6" /> Business Closed</>}
            {action === 'error'     && <><AlertCircle className="w-6 h-6" /> Error</>}
          </div>
          {action === 'completed' && (
            <p className="text-xs text-slate-500 -mt-2 mb-3">Already checked out today — see you next shift</p>
          )}
          {action === 'closed' && (
            <p className="text-xs text-slate-500 -mt-2 mb-3">Attendance is only recorded during business hours</p>
          )}
          {action === 'error' && popup.error && (
            <p className="text-xs text-red-500 -mt-2 mb-3 px-2 break-words">{popup.error}</p>
          )}
          {/* Attendance rule result (late / half-day / absent) — only when rules flagged it. */}
          {popup.status && popup.status !== 'present' && action !== 'error' && (
            <div className="-mt-1 mb-3">
              <span className={`inline-block px-3 py-1 rounded-full text-sm font-semibold ${
                popup.status === 'late'     ? 'bg-amber-100 text-amber-700' :
                popup.status === 'half_day' ? 'bg-orange-100 text-orange-700' :
                popup.status === 'absent'   ? 'bg-red-100 text-red-700' :
                'bg-gray-100 text-gray-600'
              }`}>
                {popup.status === 'late'     && `Late${popup.lateMinutes ? ` by ${popup.lateMinutes} min` : ''}`}
                {popup.status === 'half_day' && 'Half Day'}
                {popup.status === 'absent'   && 'Marked Absent'}
              </span>
            </div>
          )}
          {(popup.inTime || popup.outTime) && (
            <div className="flex justify-center gap-6 text-sm text-gray-500">
              {popup.inTime  && <div><p className="text-xs text-gray-400 uppercase">In</p><p className="font-semibold">{fmtTime(popup.inTime)}</p></div>}
              {popup.outTime && <div><p className="text-xs text-gray-400 uppercase">Out</p><p className="font-semibold">{fmtTime(popup.outTime)}</p></div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
