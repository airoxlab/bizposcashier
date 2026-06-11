'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Fingerprint, CheckCircle, AlertCircle, Loader2, WifiOff,
  Camera, RotateCcw, ChevronLeft, LogIn, LogOut, User,
  ShieldCheck, X, Save
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { authManager } from '@/lib/authManager'

// ─── Constants ────────────────────────────────────────────────────────────────
const TABS         = ['attendance', 'enroll', 'test']
const SAMPLES_NEED = 4
const COOLDOWN_MS  = 8000

// ─── Helpers ──────────────────────────────────────────────────────────────────
function loadWebSdkScript() {
  return new Promise((resolve, reject) => {
    if (window.WebSdk) { resolve(); return }
    const existing = document.querySelector('script[src="/sdk/WebSdk.client.min.js"]')
    if (existing) { existing.addEventListener('load', resolve); existing.addEventListener('error', reject); return }
    const s = document.createElement('script')
    s.src = '/sdk/WebSdk.client.min.js'
    s.onload = resolve
    s.onerror = () => reject(new Error('SDK not found at /sdk/WebSdk.client.min.js'))
    document.head.appendChild(s)
  })
}

function getBusinessDate(startTime, endTime, nowUtc = new Date()) {
  const PKT = 5 * 3600000
  const pkt = new Date(nowUtc.getTime() + PKT)
  const [sh, sm] = (startTime || '00:00').split(':').map(Number)
  const [eh, em] = (endTime   || '23:59').split(':').map(Number)
  const cur = pkt.getUTCHours() * 60 + pkt.getUTCMinutes()
  const end = eh * 60 + em
  const sta = sh * 60 + sm
  const overnight = end <= sta
  const today     = pkt.toISOString().slice(0, 10)
  const yesterday = new Date(pkt.getTime() - 86400000).toISOString().slice(0, 10)
  return (overnight && cur < end) ? yesterday : today
}

function getInitials(name) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
}

function fmtTime(iso) {
  return iso ? new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' }) : '—'
}

// Extract the raw base64 string from whatever shape the SDK returns.
// The sample can be a plain string, a { Data: "...", Format: n } object,
// or URL-safe base64 (uses - and _ instead of + and /).
function extractSampleData(sample) {
  if (!sample) return null
  const raw = typeof sample === 'string' ? sample : (sample?.Data ?? sample?.data ?? null)
  if (!raw) return null
  // Normalise URL-safe base64 → standard base64
  return String(raw).replace(/-/g, '+').replace(/_/g, '/')
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FingerprintPage() {
  const [tab, setTab]               = useState('attendance')
  const [readerStatus, setReaderStatus] = useState('loading')
  // loading | no_sdk | no_reader | ready | scanning | capturing | done | error

  // ── Attendance state ────────────────────────────────────────────────────────
  const [popup, setPopup]           = useState(null)
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [todayCount, setTodayCount] = useState(0)
  const [attendanceEmp, setAttendanceEmp] = useState(null)

  // ── Enroll state ────────────────────────────────────────────────────────────
  const [employees, setEmployees]   = useState([])
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [existing, setExisting]     = useState(null)
  const [samplesCount, setSamplesCount] = useState(0)
  const [enrollActive, setEnrollActive] = useState(false)
  const [enrollSaving, setEnrollSaving] = useState(false)

  // ── Test state ──────────────────────────────────────────────────────────────
  const [capturedImg, setCapturedImg] = useState(null)
  const [quality, setQuality]       = useState(null)

  // ── Shared ──────────────────────────────────────────────────────────────────
  const [devices, setDevices]       = useState([])
  const [activeDevice, setActiveDevice] = useState(null)
  const [log, setLog]               = useState([])

  // ── Refs ────────────────────────────────────────────────────────────────────
  const readerRef      = useRef(null)
  const sdkRef         = useRef(null)
  const fpTemplatesRef = useRef([])     // [{employee_id, employee_name, designation, template}]
  const businessRef    = useRef({ start: '00:00', end: '23:59' })
  const userIdRef      = useRef(null)
  const cooldownRef    = useRef({})     // employee_id → last scan ms
  const popupTimer     = useRef(null)
  const samplesCollectedRef = useRef([]) // [{sample, quality}] — manual accumulator
  const lastQualityRef   = useRef(50)   // quality from last QualityReported event
  const samplesRef       = useRef(0)    // ref mirror of samplesCount
  const enrollActiveRef  = useRef(false)// ref mirror of enrollActive (avoids stale closure)
  const selectedEmpRef   = useRef(null) // ref mirror of selectedEmp (avoids stale closure)
  const activeDeviceRef  = useRef(null) // ref mirror of activeDevice (avoids stale closure)
  const attendanceEmpRef = useRef(null) // ref mirror of attendanceEmp (avoids stale closure)
  const tabRef         = useRef('attendance')
  const scanningRef    = useRef(false)

  const addLog = (msg) =>
    setLog(prev => [`${new Date().toLocaleTimeString('en-PK')} — ${msg}`, ...prev].slice(0, 60))

  // ── Init ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const userData = authManager.getCurrentUser()
    // For cashiers: user_id = owner's user_id; for admins: id IS the owner's user_id
    userIdRef.current = userData?.user_id || userData?.id
    init()
    return () => {
      try { readerRef.current?.off?.() } catch {}
      if (popupTimer.current) clearTimeout(popupTimer.current)
    }
  }, [])

  async function init() {
    await Promise.all([loadSdk(), loadMeta()])
    await fetchTodayCount()
  }

  async function loadMeta() {
    if (!userIdRef.current) return
    await Promise.all([loadBusinessHours(), loadFingerprints(), loadEmployees()])
  }

  async function loadBusinessHours() {
    const { data } = await supabase.from('users').select('business_start_time, business_end_time').eq('id', userIdRef.current).single()
    if (data) businessRef.current = { start: data.business_start_time || '00:00', end: data.business_end_time || '23:59' }
  }

  async function loadFingerprints() {
    if (!userIdRef.current) return
    const { data } = await supabase
      .from('employee_fingerprints')
      .select('employee_id, template, payroll_employees(name, designation)')
      .eq('user_id', userIdRef.current)
      .eq('is_active', true)
    fpTemplatesRef.current = (data || []).map(fp => ({
      employee_id:   fp.employee_id,
      employee_name: fp.payroll_employees?.name || 'Unknown',
      designation:   fp.payroll_employees?.designation || '',
      template:      fp.template,
    }))
    setEnrolledCount(fpTemplatesRef.current.length)
    addLog(`Loaded ${fpTemplatesRef.current.length} enrolled template(s)`)
  }

  async function loadEmployees() {
    if (!userIdRef.current) return
    const { data } = await supabase
      .from('payroll_employees')
      .select('id, name, designation, payroll_departments(name)')
      .eq('user_id', userIdRef.current)
      .eq('is_active', true)
      .order('name')
    setEmployees(data || [])
  }

  async function fetchTodayCount() {
    if (!userIdRef.current) return
    const bd = getBusinessDate(businessRef.current.start, businessRef.current.end)
    const { count } = await supabase.from('employee_attendance').select('*', { count: 'exact', head: true }).eq('user_id', userIdRef.current).eq('business_date', bd)
    setTodayCount(count || 0)
  }

  // ── SDK ─────────────────────────────────────────────────────────────────────
  async function loadSdk() {
    try {
      await loadWebSdkScript()
      const sdk = await import('@digitalpersona/devices')
      sdkRef.current = sdk
      const reader = new sdk.FingerprintReader()
      readerRef.current = reader

      reader.on('DeviceConnected', e => {
        const id = e.deviceId
        // DpHost fires spurious DeviceConnected with null UUID on every scan — ignore those
        if (!id || id === '00000000-0000-0000-0000-000000000000') return
        addLog(`Reader connected: ${id}`)
        setDevices(prev => prev.includes(id) ? prev : [...prev, id])
        setActiveDevice(d => d || id)
        setReaderStatus(s => ['loading', 'no_reader'].includes(s) ? 'ready' : s)
      })
      reader.on('DeviceDisconnected', e => {
        const id = e.deviceId
        if (!id || id === '00000000-0000-0000-0000-000000000000') return
        addLog(`Reader disconnected: ${id}`)
        setDevices(prev => { const n = prev.filter(d => d !== id); if (!n.length) { setReaderStatus('no_reader'); scanningRef.current = false } return n })
      })
      reader.on('QualityReported', e => { setQuality(e.quality); lastQualityRef.current = e.quality ?? 50; addLog(`Quality: ${e.quality}`) })
      reader.on('AcquisitionStopped', () => { scanningRef.current = false })
      reader.on('SamplesAcquired', onSamplesAcquired)
      reader.on('ErrorOccurred', e => { addLog(`Error: ${JSON.stringify(e.error ?? e)}`); setReaderStatus('error') })

      const devs = await reader.enumerateDevices()
      if (!devs.length) { setReaderStatus('no_reader'); return }
      setDevices(devs); setActiveDevice(devs[0])
      setReaderStatus('ready')
      addLog(`Reader ready — device: ${JSON.stringify(devs[0])}`)
      startAttendanceScan(sdk)
    } catch (err) {
      addLog(`SDK init: ${err.message}`)
      setReaderStatus(err.message?.includes('not found') ? 'no_sdk' : 'error')
    }
  }

  // ── Central sample handler — routes to the active tab's logic ────────────────
  const onSamplesAcquired = useCallback(async (e) => {
    const raw = extractSampleData(e.samples?.[0])
    if (!raw) { addLog('Empty sample — skipping'); return }
    addLog(`Sample received — ${raw.length} chars`)
    const currentTab = tabRef.current
    if (currentTab === 'attendance') await handleAttendanceSample(raw)
    else if (currentTab === 'enroll') await handleEnrollSample(raw)
    else if (currentTab === 'test')   handleTestSample(raw)
  }, [])

  // ── Switch tab ───────────────────────────────────────────────────────────────
  async function switchTab(newTab) {
    // Stop current acquisition, reset enroll state
    try { await readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
    if (enrollActive) { cancelEnroll() }
    setCapturedImg(null); setQuality(null)
    tabRef.current = newTab
    setTab(newTab)

    if (!readerRef.current || !sdkRef.current || !activeDevice) return
    const sdk = sdkRef.current

    if (newTab === 'attendance') {
      startAttendanceScan(sdk)
    } else if (newTab === 'test') {
      await readerRef.current.startAcquisition(sdk.SampleFormat.PngImage)
      scanningRef.current = true
      setReaderStatus('scanning')
    }
    // Enroll tab starts manually
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ATTENDANCE
  // ════════════════════════════════════════════════════════════════════════════
  async function startAttendanceScan(sdk) {
    if (scanningRef.current) return
    const s = sdk || sdkRef.current
    if (!s || !readerRef.current) return
    // Try Intermediate format first; fall back to PngImage if device rejects it
    for (const fmt of [s.SampleFormat.Intermediate, s.SampleFormat.PngImage]) {
      try {
        await readerRef.current.startAcquisition(fmt)
        scanningRef.current = true
        setReaderStatus('scanning')
        addLog(`Attendance mode (format ${fmt}) — place finger to record…`)
        return
      } catch (err) {
        addLog(`Format ${fmt} rejected: ${err.message}`)
      }
    }
    setReaderStatus('error')
    addLog('Could not start scan — no supported format found')
  }

  async function handleAttendanceSample(sample) {
    const emp = attendanceEmpRef.current
    if (!emp) {
      addLog('No employee selected — pick one from the dropdown')
      setTimeout(() => restartScan('attendance'), 1000)
      return
    }
    const fpRecord = fpTemplatesRef.current.find(fp => fp.employee_id === emp.id)
    if (!fpRecord) {
      addLog(`${emp.name} — not enrolled`)
      showNotEnrolledPopup(emp)
      setTimeout(() => restartScan('attendance'), 2000)
      return
    }
    addLog(`Verifying ${emp.name}…`)
    const matched = await matchSingleTemplate(sample, fpRecord)
    if (!matched) {
      addLog(`${emp.name} — fingerprint did not match`)
      showMismatchPopup(emp)
      setTimeout(() => restartScan('attendance'), 2000)
      return
    }
    const now = Date.now()
    const last = cooldownRef.current[emp.id]
    if (last && now - last < COOLDOWN_MS) {
      addLog(`${emp.name} — too soon, ignoring`)
      setTimeout(() => restartScan('attendance'), 1500)
      return
    }
    cooldownRef.current[emp.id] = now
    addLog(`Matched: ${emp.name}`)
    await recordAttendance(fpRecord)
    setTimeout(() => restartScan('attendance'), 2500)
  }

  async function matchSingleTemplate(sample, fp) {
    try {
      if (!window.electronAPI?.compareFingerprints) {
        addLog('compareFingerprints not available — not running in Electron')
        return false
      }
      const res = await window.electronAPI.compareFingerprints(fp.template, sample)
      addLog(`Compare: matched=${res.matched} status=${res.status} far=${res.far}${res.error ? ` error=${res.error}` : ''}`)
      return res.matched === true
    } catch (err) {
      addLog(`Match error: ${err.message}`)
      return false
    }
  }

  async function recordAttendance(emp) {
    if (!userIdRef.current) return
    const now = new Date()
    const bd  = getBusinessDate(businessRef.current.start, businessRef.current.end, now)
    const iso = now.toISOString()
    try {
      const { data: existing } = await supabase.from('employee_attendance').select('*').eq('employee_id', emp.employee_id).eq('business_date', bd).maybeSingle()
      if (!existing) {
        await supabase.from('employee_attendance').insert({ user_id: userIdRef.current, employee_id: emp.employee_id, business_date: bd, check_in_time: iso, status: 'present', check_in_method: 'fingerprint', fingerprint_scan_count: 1 })
        showPopup(emp, 'check_in', iso, null)
        addLog(`${emp.employee_name} — checked IN`)
      } else if (existing.check_in_time && !existing.check_out_time) {
        await supabase.from('employee_attendance').update({ check_out_time: iso, check_out_method: 'fingerprint', fingerprint_scan_count: (existing.fingerprint_scan_count || 1) + 1, updated_at: iso }).eq('id', existing.id)
        showPopup(emp, 'check_out', existing.check_in_time, iso)
        addLog(`${emp.employee_name} — checked OUT`)
      } else {
        await supabase.from('employee_attendance').update({ fingerprint_scan_count: (existing.fingerprint_scan_count || 2) + 1, updated_at: iso }).eq('id', existing.id)
        showPopup(emp, 'already', existing.check_in_time, existing.check_out_time)
        addLog(`${emp.employee_name} — already recorded`)
      }
      fetchTodayCount()
    } catch (err) { addLog(`DB: ${err.message}`) }
  }

  function showPopup(emp, action, checkIn, checkOut) {
    if (popupTimer.current) clearTimeout(popupTimer.current)
    setPopup({ emp, action, checkIn, checkOut })
    popupTimer.current = setTimeout(() => setPopup(null), 5000)
  }
  function showMismatchPopup(emp) {
    if (popupTimer.current) clearTimeout(popupTimer.current)
    setPopup({ mismatch: true, emp })
    popupTimer.current = setTimeout(() => setPopup(null), 3000)
  }
  function showNotEnrolledPopup(emp) {
    if (popupTimer.current) clearTimeout(popupTimer.current)
    setPopup({ notEnrolled: true, emp })
    popupTimer.current = setTimeout(() => setPopup(null), 3000)
  }

  async function restartScan(forTab) {
    if (tabRef.current !== forTab) return
    try { await readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
    if (forTab === 'attendance') startAttendanceScan()
    else if (forTab === 'test') {
      await readerRef.current?.startAcquisition?.(sdkRef.current.SampleFormat.PngImage)
      scanningRef.current = true
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ENROLL
  // ════════════════════════════════════════════════════════════════════════════
  // Keep refs in sync so stale closures (onSamplesAcquired → handleEnrollSample
  // → saveEnrollTemplate) always read the current employee and device.
  useEffect(() => { selectedEmpRef.current = selectedEmp }, [selectedEmp])
  useEffect(() => { activeDeviceRef.current = activeDevice }, [activeDevice])
  useEffect(() => { attendanceEmpRef.current = attendanceEmp }, [attendanceEmp])

  useEffect(() => {
    if (!selectedEmp) { setExisting(null); return }
    supabase.from('employee_fingerprints').select('id, enrolled_at').eq('employee_id', selectedEmp.id).eq('is_active', true).maybeSingle()
      .then(({ data }) => setExisting(data))
  }, [selectedEmp])

  async function startEnroll() {
    if (!selectedEmp || !readerRef.current || !sdkRef.current || !activeDevice) return
    setSamplesCount(0); samplesRef.current = 0
    samplesCollectedRef.current = []
    enrollActiveRef.current = true
    setEnrollActive(true)
    addLog(`Enrollment started for ${selectedEmp.name}`)
    // Do not pass device ID — DpHost picks the active reader automatically
    await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
    scanningRef.current = true
    setReaderStatus('capturing')
    addLog(`Scan 1/${SAMPLES_NEED} — place finger…`)
  }

  async function handleEnrollSample(sample) {
    if (!enrollActiveRef.current) return
    // Store the sample with its quality score so we can pick the best one
    samplesCollectedRef.current.push({ sample, quality: lastQualityRef.current ?? 50 })
    samplesRef.current += 1
    setSamplesCount(samplesRef.current)
    addLog(`Scan ${samplesRef.current}/${SAMPLES_NEED} — quality ${lastQualityRef.current ?? '?'}`)
    if (samplesRef.current >= SAMPLES_NEED) {
      await readerRef.current?.stopAcquisition?.()
      scanningRef.current = false
      // Pick the highest-quality sample as the stored biometric template
      const best = samplesCollectedRef.current.reduce((a, b) => b.quality > a.quality ? b : a)
      await saveEnrollTemplate(best.sample)
    } else {
      addLog(`Lift finger — ${SAMPLES_NEED - samplesRef.current} more…`)
    }
  }

  async function saveEnrollTemplate(template) {
    const emp = selectedEmpRef.current
    if (!emp || !userIdRef.current) {
      addLog('Save skipped: no employee or user selected')
      return
    }
    setEnrollSaving(true)
    try {
      await supabase.from('employee_fingerprints').update({ is_active: false }).eq('employee_id', emp.id).eq('user_id', userIdRef.current)
      const { error } = await supabase.from('employee_fingerprints').insert({
        user_id: userIdRef.current, employee_id: emp.id, template,
        finger_label: 'primary', enrolled_by: userIdRef.current, device_id: activeDeviceRef.current, is_active: true,
      })
      if (error) throw error
      setReaderStatus('done')
      enrollActiveRef.current = false
      setEnrollActive(false)
      addLog(`Fingerprint saved for ${emp.name}`)
      toast.success(`Enrolled: ${emp.name}`)
      setExisting({ enrolled_at: new Date().toISOString() })
      await loadFingerprints()
    } catch (err) {
      addLog(`Save failed: ${err.message}`)
      toast.error('Failed to save fingerprint')
      setReaderStatus('ready')
      enrollActiveRef.current = false
      setEnrollActive(false)
    } finally { setEnrollSaving(false) }
  }

  function cancelEnroll() {
    try { readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
    samplesCollectedRef.current = []
    setSamplesCount(0); samplesRef.current = 0
    enrollActiveRef.current = false
    setEnrollActive(false)
    setReaderStatus('ready')
    addLog('Enrollment cancelled')
  }

  function resetEnroll() {
    selectedEmpRef.current = null
    setSelectedEmp(null); setExisting(null)
    setSamplesCount(0); samplesRef.current = 0
    enrollActiveRef.current = false
    setEnrollActive(false); samplesCollectedRef.current = []
    setReaderStatus('ready')
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TEST
  // ════════════════════════════════════════════════════════════════════════════
  function handleTestSample(sample) {
    setCapturedImg(`data:image/png;base64,${sample}`)
    addLog('PNG sample captured')
    setReaderStatus('ready')
    scanningRef.current = false
  }

  async function testCapture() {
    if (!readerRef.current || !sdkRef.current) return
    setCapturedImg(null); setQuality(null)
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.PngImage)
      scanningRef.current = true
      setReaderStatus('scanning')
    } catch (err) { addLog(`Capture failed: ${err.message}`); setReaderStatus('error') }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────
  const bdToday = getBusinessDate(businessRef.current.start, businessRef.current.end)

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">

      {/* ── Attendance Popup overlay ─────────────────────────────────────────── */}
      {popup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <button onClick={() => { clearTimeout(popupTimer.current); setPopup(null) }} className="absolute top-4 right-4 text-white/60 hover:text-white">
            <X className="w-6 h-6" />
          </button>
          {popup.mismatch ? (
            <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-xs w-full border-4 border-red-400">
              <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                <X className="w-10 h-10 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Fingerprint Mismatch</h2>
              <p className="text-gray-500 text-sm">Does not match <span className="font-semibold text-gray-700">{popup.emp?.name}</span>. Try again or select the correct employee.</p>
            </div>
          ) : popup.notEnrolled ? (
            <div className="bg-white rounded-2xl shadow-2xl p-8 text-center max-w-xs w-full border-4 border-amber-400">
              <div className="w-20 h-20 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-4">
                <AlertCircle className="w-10 h-10 text-amber-500" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-1">Not Enrolled</h2>
              <p className="text-gray-500 text-sm"><span className="font-semibold text-gray-700">{popup.emp?.name}</span> has no fingerprint enrolled. Go to the Enroll tab first.</p>
            </div>
          ) : (
            <div className={`bg-white rounded-2xl shadow-2xl p-8 text-center max-w-sm w-full border-4 ${
              popup.action === 'check_in' ? 'border-green-400' : popup.action === 'check_out' ? 'border-blue-400' : 'border-amber-400'
            }`}>
              <div className={`w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-4 ${
                popup.action === 'check_in' ? 'bg-green-500' : popup.action === 'check_out' ? 'bg-blue-500' : 'bg-amber-400'
              }`}>
                <span className="text-white text-4xl font-bold">{getInitials(popup.emp?.employee_name)}</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-900 mb-0.5">{popup.emp?.employee_name}</h2>
              {popup.emp?.designation && <p className="text-gray-500 text-sm mb-3">{popup.emp.designation}</p>}
              <div className={`flex items-center justify-center gap-2 font-bold text-xl mb-3 ${
                popup.action === 'check_in' ? 'text-green-600' : popup.action === 'check_out' ? 'text-blue-600' : 'text-amber-600'
              }`}>
                {popup.action === 'check_in'  && <><LogIn  className="w-6 h-6" /> Check In</>}
                {popup.action === 'check_out' && <><LogOut className="w-6 h-6" /> Check Out</>}
                {popup.action === 'already'   && <><CheckCircle className="w-6 h-6" /> Already Recorded</>}
              </div>
              <div className="flex justify-center gap-6 text-sm text-gray-500">
                {popup.checkIn  && <div><p className="text-xs text-gray-400 uppercase">In</p><p className="font-semibold">{fmtTime(popup.checkIn)}</p></div>}
                {popup.checkOut && <div><p className="text-xs text-gray-400 uppercase">Out</p><p className="font-semibold">{fmtTime(popup.checkOut)}</p></div>}
              </div>
              <p className="text-xs text-gray-400 mt-3">{bdToday}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700 px-4 py-3 flex items-center gap-3">
        <Link href="/dashboard" className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
            <Fingerprint className="w-4 h-4 text-white" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold text-gray-900 dark:text-white truncate">Fingerprint System</h1>
            <p className="text-[11px] text-gray-400 dark:text-slate-500 truncate">
              {readerStatus === 'no_sdk'    ? 'SDK not installed'    :
               readerStatus === 'no_reader' ? 'No reader detected'   :
               readerStatus === 'scanning'  ? 'Scanning…'            :
               readerStatus === 'capturing' ? 'Enrolling…'           :
               readerStatus === 'loading'   ? 'Initializing…'        :
               readerStatus === 'error'     ? 'Reader error'         :
               readerStatus === 'done'      ? 'Enrolled!'            :
               'Reader ready'} · {bdToday}
            </p>
          </div>
        </div>
        {/* Reader status dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          readerStatus === 'scanning' || readerStatus === 'capturing' ? 'bg-blue-500 animate-pulse' :
          readerStatus === 'ready' || readerStatus === 'done' ? 'bg-green-500' :
          readerStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
        }`} />
      </div>

      {/* ── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {[
          { key: 'attendance', label: 'Attendance' },
          { key: 'enroll',     label: 'Enroll'     },
          { key: 'test',       label: 'Test'        },
        ].map(t => (
          <button key={t.key} onClick={() => switchTab(t.key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── SDK / reader error banners ───────────────────────────────────────── */}
      {readerStatus === 'no_sdk' && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold mb-1">SDK not installed</p>
          <ol className="list-decimal list-inside space-y-0.5 text-xs opacity-80">
            <li>Run <code className="bg-white/50 px-1 rounded">npm install @digitalpersona/devices</code> in bizposcashier/</li>
            <li>Copy <code className="bg-white/50 px-1 rounded">node_modules/@digitalpersona/devices/@types/WebSdk/index.js</code> → <code className="bg-white/50 px-1 rounded">public/sdk/WebSdk.client.min.js</code></li>
            <li>Restart dev server</li>
          </ol>
        </div>
      )}
      {readerStatus === 'no_reader' && (
        <div className="m-4 rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-4 text-sm text-red-800 dark:text-red-300">
          <p className="font-semibold mb-1">No reader detected</p>
          <p className="text-xs opacity-80">Plug in the U.are.U 4500 and ensure DpHost service is Running (<code>Get-Service DpHost</code>)</p>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ATTENDANCE TAB                                                        */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'attendance' && (
        <div className="flex-1 flex flex-col items-center p-5 gap-4 overflow-y-auto">

          {/* Stats row */}
          <div className="flex gap-3 w-full max-w-sm">
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Enrolled</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{enrolledCount}</p>
            </div>
            <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl shadow p-3 text-center">
              <p className="text-xs text-gray-400 mb-1">Today</p>
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{todayCount}</p>
            </div>
          </div>

          {/* Employee selector */}
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow p-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Select Employee</label>
            <select
              value={attendanceEmp?.id || ''}
              onChange={e => setAttendanceEmp(employees.find(emp => emp.id === e.target.value) || null)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white"
            >
              <option value="">— Select employee to mark attendance —</option>
              {employees.map(e => {
                const isEnrolled = fpTemplatesRef.current.some(fp => fp.employee_id === e.id)
                return (
                  <option key={e.id} value={e.id}>
                    {e.name}{e.designation ? ` (${e.designation})` : ''}{isEnrolled ? '' : ' — ⚠ not enrolled'}
                  </option>
                )
              })}
            </select>
            {attendanceEmp && (() => {
              const isEnrolled = fpTemplatesRef.current.some(fp => fp.employee_id === attendanceEmp.id)
              return isEnrolled ? (
                <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" /> Fingerprint enrolled — ready to verify
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" /> Not enrolled — go to Enroll tab first
                </p>
              )
            })()}
          </div>

          {/* Scanner visual */}
          <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${
            readerStatus === 'scanning' ? 'bg-violet-600 shadow-lg shadow-violet-500/40 animate-pulse' :
            readerStatus === 'ready'    ? 'bg-gray-200 dark:bg-slate-700' :
            'bg-red-100 dark:bg-red-900/30'
          }`}>
            {readerStatus === 'loading' ? <Loader2 className="w-14 h-14 text-gray-400 animate-spin" /> :
             readerStatus === 'no_reader' ? <WifiOff className="w-14 h-14 text-red-400" /> :
             <Fingerprint className={`w-14 h-14 ${readerStatus === 'scanning' ? 'text-white' : readerStatus === 'ready' ? 'text-gray-500 dark:text-slate-400' : 'text-red-400'}`} />}
          </div>

          <p className={`text-center font-medium text-sm ${readerStatus === 'scanning' ? 'text-violet-600 dark:text-violet-400' : 'text-gray-500 dark:text-slate-400'}`}>
            {!attendanceEmp
              ? 'Select an employee above to start'
              : readerStatus === 'scanning'
              ? `Place ${attendanceEmp.name}'s finger on the reader…`
              : readerStatus === 'ready' ? 'Reader ready'
              : readerStatus === 'loading' ? 'Initializing…' : ''}
          </p>

          {readerStatus === 'ready' && (
            <button onClick={() => startAttendanceScan()}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium">
              Start Scanning
            </button>
          )}
          {readerStatus === 'error' && (
            <button onClick={() => restartScan('attendance')}
              className="flex items-center gap-2 px-4 py-2 bg-gray-200 dark:bg-slate-700 rounded-xl text-sm text-gray-700 dark:text-white">
              <RotateCcw className="w-4 h-4" /> Retry
            </button>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* ENROLL TAB                                                            */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'enroll' && (
        <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">

          {/* Employee selector */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Select Employee</label>
            <select value={selectedEmp?.id || ''} onChange={e => setSelectedEmp(employees.find(emp => emp.id === e.target.value) || null)} disabled={enrollActive}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white disabled:opacity-50">
              <option value="">Select employee…</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.name}{e.designation ? ` — ${e.designation}` : ''}</option>)}
            </select>
            {selectedEmp && existing && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Enrolled on {new Date(existing.enrolled_at).toLocaleDateString('en-PK')} — re-enrolling will replace it
              </p>
            )}
            {selectedEmp && !existing && (
              <p className="mt-2 text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Not yet enrolled
              </p>
            )}
          </div>

          {/* Enrollment panel */}
          {selectedEmp && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-lg font-bold">{getInitials(selectedEmp.name)}</span>
                </div>
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedEmp.name}</p>
                  {selectedEmp.designation && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedEmp.designation}</p>}
                </div>
              </div>

              {/* Sample dots */}
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                  {readerStatus === 'done' ? 'Enrollment complete!' :
                   enrollActive ? `Lift and re-place finger (${samplesCount}/${SAMPLES_NEED})` :
                   `Place finger ${SAMPLES_NEED} times on the reader`}
                </p>
                <div className="flex gap-2">
                  {Array.from({ length: SAMPLES_NEED }).map((_, i) => (
                    <div key={i} className={`flex-1 h-10 rounded-lg flex items-center justify-center transition-all ${
                      i < samplesCount ? 'bg-emerald-500 text-white' :
                      enrollActive && i === samplesCount ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400 animate-pulse' :
                      'bg-gray-100 dark:bg-slate-700 text-gray-300 dark:text-slate-600'
                    }`}>
                      {i < samplesCount ? <CheckCircle className="w-5 h-5" /> : <span className="text-sm font-bold">{i + 1}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              {readerStatus === 'done' ? (
                <div className="space-y-2">
                  <p className="text-center text-emerald-600 dark:text-emerald-400 font-medium text-sm flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Fingerprint saved!
                  </p>
                  <button onClick={resetEnroll}
                    className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium">
                    Enroll Another
                  </button>
                </div>
              ) : enrollSaving ? (
                <div className="flex items-center justify-center gap-2 py-2 text-gray-500 dark:text-slate-400 text-sm">
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving…
                </div>
              ) : enrollActive ? (
                <button onClick={cancelEnroll}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-sm text-gray-700 dark:text-white">
                  <RotateCcw className="w-4 h-4" /> Cancel
                </button>
              ) : (
                <button onClick={startEnroll} disabled={!['ready', 'error'].includes(readerStatus)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                  <Fingerprint className="w-4 h-4" />
                  {existing ? 'Re-enroll Fingerprint' : 'Start Enrollment'}
                </button>
              )}
            </div>
          )}

          {/* Multi-device */}
          {devices.length > 1 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-3">
              <label className="text-xs font-medium text-gray-500 dark:text-slate-400 block mb-1">Active reader</label>
              <select value={activeDevice || ''} onChange={e => setActiveDevice(e.target.value)} disabled={enrollActive}
                className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white">
                {devices.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════ */}
      {/* TEST TAB                                                              */}
      {/* ══════════════════════════════════════════════════════════════════════ */}
      {tab === 'test' && (
        <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">
          {/* Capture button */}
          <div className="flex gap-2">
            {readerStatus !== 'scanning' && (
              <button onClick={testCapture} disabled={!['ready', 'done', 'error'].includes(readerStatus)}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-sm disabled:opacity-50">
                <Camera className="w-4 h-4" /> {capturedImg ? 'Capture Again' : 'Capture Fingerprint'}
              </button>
            )}
            {readerStatus === 'scanning' && (
              <button onClick={async () => { await readerRef.current?.stopAcquisition?.(); scanningRef.current = false; setReaderStatus('ready') }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gray-200 dark:bg-slate-700 text-gray-700 dark:text-white text-sm">
                Stop
              </button>
            )}
          </div>

          {quality !== null && (
            <p className="text-center text-sm text-gray-500 dark:text-slate-400">Quality: <span className="font-bold text-gray-900 dark:text-white">{quality}</span></p>
          )}

          {capturedImg && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4 text-center">
              <p className="text-xs font-medium text-gray-500 dark:text-slate-400 mb-3">Captured fingerprint (PNG)</p>
              <img src={capturedImg} alt="Fingerprint" className="mx-auto border-2 border-gray-200 dark:border-slate-600 rounded-lg max-w-[220px] w-full" />
            </div>
          )}
        </div>
      )}

      {/* ── Event log (shared, bottom of all tabs) ───────────────────────────── */}
      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Log</p>
        <div className="font-mono text-[11px] text-gray-500 dark:text-slate-400 space-y-0.5 max-h-28 overflow-y-auto">
          {log.length === 0 ? <p className="italic text-gray-400">No events…</p> : log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>

    </div>
  )
}
