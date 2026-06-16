'use client'
// OwnerFingerprintUnlock — unlock a gated page (Reports / Expenses) by scanning
// the OWNER's enrolled fingerprint, as an alternative to the 6-digit PIN.
//
// Security: it loads ONLY the owner's active template (person_type = 'owner',
// person_id = the logged-in user's id) and verifies the live finger 1:1 against
// it. No other enrolled person (employee / admin_staff) can unlock — their
// templates are never loaded here.
//
// Matching needs the native dpfj.dll, so it only works in the Electron desktop
// app. In the browser it renders nothing (the PIN remains the only option).
//
// Coordination: while this panel holds the reader it broadcasts `fp:ui-mode`
// {active:true} so the app-wide GlobalFingerprintListener releases the reader,
// and {active:false} on unmount so attendance scanning resumes.

import { useState, useEffect, useRef, useCallback } from 'react'
import { Fingerprint, CheckCircle, Loader2, X, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import themeManager from '../../lib/themeManager'

const SCAN_COOLDOWN_MS = 1200

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

function hasNativeFp() {
  return typeof window !== 'undefined' && !!window.electronAPI?.compareFingerprints
}

export default function OwnerFingerprintUnlock({
  userId, onUnlock, onStatusChange,
  label = 'Unlock with Owner Fingerprint',
  compact = false,   // when true, render no UI of its own — status is surfaced elsewhere (e.g. PinPad header)
}) {
  // idle | loading | no_reader | scanning | matched | denied | not_enrolled | unsupported
  const [status, setStatus] = useState('loading')

  // Surface status to the parent so it can render it (e.g. in the PinPad header).
  useEffect(() => { onStatusChange?.(status) }, [status, onStatusChange])

  const readerRef    = useRef(null)
  const sdkRef       = useRef(null)
  const templateRef  = useRef(null)     // owner's active template (base64)
  const scanningRef  = useRef(false)
  const busyRef      = useRef(false)
  const matchedRef   = useRef(false)
  const mountedRef   = useRef(true)
  const retryRef     = useRef(null)    // periodic re-attempt while reader isn't ready
  const failCountRef = useRef(0)       // consecutive failed start attempts (grace period)

  const themeClasses = themeManager.getClasses()

  // ── Init: load owner template + reader ──────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true
    if (!hasNativeFp()) { setStatus('unsupported'); return }

    // Ask the app-wide attendance listener to release the reader while we're here.
    window.dispatchEvent(new CustomEvent('fp:ui-mode', { detail: { active: true } }))

    let cancelled = false
    ;(async () => {
      try {
        await loadOwnerTemplate()
        if (cancelled) return
        if (!templateRef.current) { setStatus('not_enrolled'); return }
        await initReader()
        if (cancelled) return
        startScan()
        // Self-heal: the WebSDK's link to the DpHost service connects
        // asynchronously, so the reader may not be ready on the first try even
        // though it's plugged in. Keep re-attempting until acquisition starts,
        // instead of latching to "not detected".
        retryRef.current = setInterval(() => {
          if (!mountedRef.current || matchedRef.current || scanningRef.current) return
          startScan()
        }, 2500)
      } catch {
        if (!cancelled) setStatus('no_reader')
      }
    })()

    return () => {
      cancelled = true
      mountedRef.current = false
      if (retryRef.current) { clearInterval(retryRef.current); retryRef.current = null }
      stopScan()
      try { readerRef.current?.off?.() } catch {}
      // Let attendance scanning resume.
      window.dispatchEvent(new CustomEvent('fp:ui-mode', { detail: { active: false } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function loadOwnerTemplate() {
    if (!userId) return
    const { data } = await supabase
      .from('employee_fingerprints')
      .select('template')
      .eq('user_id', userId)
      .eq('person_type', 'owner')
      .eq('person_id', userId)
      .eq('is_active', true)
      .maybeSingle()
    templateRef.current = data?.template || null
  }

  async function initReader() {
    if (readerRef.current) return
    await loadWebSdkScript()
    const sdk = await import('@digitalpersona/devices')
    sdkRef.current = sdk
    const reader = new sdk.FingerprintReader()
    readerRef.current = reader
    reader.on('SamplesAcquired', onSample)
    reader.on('AcquisitionStopped', () => { scanningRef.current = false })
    // A device appearing (e.g. once the DpHost channel finishes connecting)
    // should immediately kick off scanning — this is the main race recovery.
    reader.on('DeviceConnected', () => { if (mountedRef.current && !matchedRef.current) startScan() })
    reader.on('DeviceDisconnected', () => { scanningRef.current = false; if (mountedRef.current && !matchedRef.current) setStatus('no_reader') })
    // Best-effort enumerate; do NOT fail hard if it races and returns empty —
    // startScan() + the retry loop + DeviceConnected will recover.
    try { await reader.enumerateDevices() } catch {}
  }

  async function startScan() {
    if (scanningRef.current || !readerRef.current || !sdkRef.current) return
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
      scanningRef.current = true
      failCountRef.current = 0
      if (mountedRef.current) setStatus('scanning')
    } catch {
      scanningRef.current = false
      failCountRef.current += 1
      // Don't cry "not detected" on the first racy attempts while the DpHost
      // channel is still connecting — stay quiet (loading) for a short grace
      // period, then surface the error only if it genuinely won't start.
      if (mountedRef.current && !matchedRef.current) {
        setStatus(failCountRef.current >= 3 ? 'no_reader' : 'loading')
      }
    }
  }

  async function stopScan() {
    try { await readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
  }

  const onSample = useCallback(async (e) => {
    if (busyRef.current) return
    const raw = extractSampleData(e.samples?.[0])
    if (!raw || !templateRef.current) return
    busyRef.current = true
    try {
      const r = await window.electronAPI.compareFingerprints(templateRef.current, raw)
      if (!mountedRef.current) return
      if (r?.matched) {
        matchedRef.current = true
        setStatus('matched')
        await stopScan()
        // brief success flash, then unlock
        setTimeout(() => { if (mountedRef.current) onUnlock?.() }, 450)
        return
      }
      setStatus('denied')
    } catch {
      if (mountedRef.current) setStatus('denied')
    } finally {
      // Resume scanning after a short cooldown (unless we matched/unmounted).
      setTimeout(async () => {
        busyRef.current = false
        if (mountedRef.current && !matchedRef.current && readerRef.current) {
          await stopScan()
          startScan()
        }
      }, SCAN_COOLDOWN_MS)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onUnlock])

  // Compact mode: the scanning engine keeps running but renders no UI —
  // the parent surfaces status itself (e.g. in the PinPad header).
  if (compact) return null

  // Don't show the option at all where it can't work.
  if (status === 'unsupported' || status === 'not_enrolled') return null

  const matched = status === 'matched'
  const denied  = status === 'denied'

  return (
    <div className="w-full max-w-sm mx-auto mt-6">
      {/* Divider */}
      <div className="flex items-center gap-3 mb-5">
        <div className={`flex-1 h-px ${themeClasses.border} border-t`} />
        <span className={`text-xs font-medium ${themeClasses.textSecondary}`}>or</span>
        <div className={`flex-1 h-px ${themeClasses.border} border-t`} />
      </div>

      <div className={`p-5 ${themeClasses.card} rounded-2xl border-2 ${themeClasses.border} text-center`}>
        {/* Scanner visual */}
        <div className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-3 transition-all duration-300 ${
          matched ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' :
          denied  ? 'bg-red-500 shadow-lg shadow-red-500/30' :
          status === 'scanning' ? 'bg-gradient-to-r from-purple-500 to-blue-500 shadow-lg shadow-purple-500/40 animate-pulse' :
          'bg-gray-200 dark:bg-slate-700'
        }`}>
          {status === 'loading'   ? <Loader2 className="w-9 h-9 text-gray-400 animate-spin" /> :
           matched                ? <CheckCircle className="w-10 h-10 text-white" /> :
           denied                 ? <X className="w-10 h-10 text-white" /> :
           <Fingerprint className={`w-9 h-9 ${status === 'scanning' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />}
        </div>

        {/* Status text */}
        <p className={`font-semibold ${
          matched ? 'text-emerald-600 dark:text-emerald-400' :
          denied  ? 'text-red-600 dark:text-red-400' :
          themeClasses.textPrimary
        }`}>
          {status === 'loading'   ? 'Preparing reader…' :
           status === 'no_reader' ? 'No reader detected' :
           matched                ? 'Owner verified' :
           denied                 ? 'Not the owner' :
           label}
        </p>
        <p className={`text-xs mt-1 ${themeClasses.textSecondary} flex items-center justify-center gap-1`}>
          {status === 'no_reader' ? (
            'Plug in the fingerprint reader and reopen this page'
          ) : matched ? (
            'Unlocking…'
          ) : denied ? (
            'Only the owner’s fingerprint can unlock this page — try again'
          ) : status === 'scanning' ? (
            <><ShieldCheck className="w-3.5 h-3.5 text-purple-500" /> Place the owner’s finger on the reader</>
          ) : null}
        </p>
      </div>
    </div>
  )
}
