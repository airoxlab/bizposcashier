'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import {
  Fingerprint, CheckCircle, Loader2, WifiOff,
  Camera, RotateCcw, ChevronLeft, User, ShieldCheck, X, Trash2, Zap,
} from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { authManager } from '@/lib/authManager'
import ConfirmModal from '@/components/ui/ConfirmModal'

// ─── Constants ────────────────────────────────────────────────────────────────
// Visible tabs. 'attendance' is intentionally hidden for now — its logic is kept
// below and shares the same compare engine, so it can be re-added by listing it
// here again later.
const TABS         = ['enroll', 'compare', 'test']
const ENROLL_TARGET = 4           // DigitalPersona usually wants 4 good captures;
                                  // the engine decides the real count at runtime
const COMPARE_COOLDOWN_MS = 1200  // pause between compare scans

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

function getInitials(name) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
}

// Extract the raw base64 string from whatever shape the SDK returns.
// The sample can be a plain string, a { Data, Format } object, or URL-safe
// base64 (uses - and _ instead of + and /). Normalise to standard base64.
function extractSampleData(sample) {
  if (!sample) return null
  const raw = typeof sample === 'string' ? sample : (sample?.Data ?? sample?.data ?? null)
  if (!raw) return null
  return String(raw).replace(/-/g, '+').replace(/_/g, '/')
}

function hasNativeFp() {
  return typeof window !== 'undefined' && !!window.electronAPI?.enrollStart
}

// Person types that can be enrolled (locked: employees + admin staff + owner).
const PERSON_TYPES = [
  { key: 'employee',    label: 'Employees' },
  { key: 'admin_staff', label: 'Admin Staff' },
  { key: 'owner',       label: 'Owner (Admin)' },
]
function personName(type, row) {
  if (type === 'owner') return row.customer_name || row.store_name || 'Owner'
  return row.name || 'Unknown'
}
function personSubtitle(type, row) {
  if (type === 'employee')    return row.designation || 'Employee'
  if (type === 'admin_staff') return 'Admin staff'
  return 'Owner'
}
function makePerson(type, row) {
  return { person_type: type, person_id: row.id, key: `${type}:${row.id}`, name: personName(type, row), designation: personSubtitle(type, row) }
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function FingerprintPage() {
  const [tab, setTab]                   = useState('enroll')
  const [readerStatus, setReaderStatus] = useState('loading')
  // loading | no_sdk | no_reader | ready | scanning | capturing | done | error

  // ── Shared ──
  const [employees, setEmployees]   = useState([])     // person list for the selected type
  const [personType, setPersonType] = useState('employee') // 'employee' | 'admin_staff' | 'owner'
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [devices, setDevices]       = useState([])
  const [activeDevice, setActiveDevice] = useState(null)
  const [log, setLog]               = useState([])
  const [nativeOk, setNativeOk]     = useState(true)

  // ── Enroll state ──
  const [selectedEmp, setSelectedEmp] = useState(null)
  const [existing, setExisting]     = useState(null)
  const [samplesCount, setSamplesCount] = useState(0)
  const [enrollActive, setEnrollActive] = useState(false)
  const [enrollSaving, setEnrollSaving] = useState(false)

  // ── Compare state ──
  const [compareEmp, setCompareEmp] = useState(null) // null → identify (1:N)
  const [compareResult, setCompareResult] = useState(null) // { matched, name, score, ms }

  // ── Test state ──
  const [capturedImg, setCapturedImg] = useState(null)
  const [quality, setQuality]       = useState(null)

  // ── Delete confirm ──
  const [confirmDelete, setConfirmDelete] = useState(null)
  const [deleting, setDeleting]     = useState(false)

  // ── Refs ──
  const readerRef      = useRef(null)
  const sdkRef         = useRef(null)
  const fpTemplatesRef = useRef([])     // [{key, person_type, person_id, name, designation, enrolled_at, template}]
  const peopleRef      = useRef({ employee: [], admin_staff: [], owner: [] }) // raw person lists by type
  const userIdRef      = useRef(null)
  const samplesCollectedRef = useRef([]) // raw base64 samples for the active enrollment
  const samplesRef       = useRef(0)
  const enrollActiveRef  = useRef(false)
  const selectedEmpRef   = useRef(null)
  const activeDeviceRef  = useRef(null)
  const compareEmpRef    = useRef(null)
  const personTypeRef    = useRef('employee')
  const tabRef         = useRef('enroll')
  const scanningRef    = useRef(false)
  const compareBusyRef = useRef(false)

  const addLog = (msg) =>
    setLog(prev => [`${new Date().toLocaleTimeString('en-PK')} — ${msg}`, ...prev].slice(0, 60))

  // ── Keep refs in sync (avoid stale closures inside SDK callbacks) ──
  useEffect(() => { selectedEmpRef.current = selectedEmp }, [selectedEmp])
  useEffect(() => { activeDeviceRef.current = activeDevice }, [activeDevice])
  useEffect(() => { compareEmpRef.current = compareEmp }, [compareEmp])
  useEffect(() => { tabRef.current = tab }, [tab])
  // Switching person type repopulates the dropdown and clears the selection.
  useEffect(() => {
    personTypeRef.current = personType
    setEmployees(peopleRef.current[personType] || [])
    setSelectedEmp(null); setExisting(null)
  }, [personType])

  // ── Init ──
  useEffect(() => {
    const userData = authManager.getCurrentUser()
    userIdRef.current = userData?.user_id || userData?.id
    setNativeOk(hasNativeFp())
    init()
    return () => {
      try { readerRef.current?.off?.() } catch {}
    }
  }, [])

  async function init() {
    await Promise.all([loadSdk(), loadMeta()])
    if (hasNativeFp()) {
      try {
        const st = await window.electronAPI.fingerprintSelfTest()
        addLog(`dpfj selftest: ${st.ok ? 'loaded' : 'FAILED — ' + st.error}`)
        if (st.ok) addLog(`symbols: ${Object.entries(st.symbols).filter(([,v]) => v).map(([k]) => k.replace('dpfj_','')).join(', ')}`)
      } catch (e) { addLog(`selftest error: ${e.message}`) }
    } else {
      addLog('Not running in Electron — fingerprint matching is unavailable in the browser')
    }
  }

  async function loadMeta() {
    if (!userIdRef.current) return
    await loadPeople()          // populate the person lists first…
    await loadFingerprints()    // …so templates can resolve names
  }

  // Load the rosters for all three person types into peopleRef + the active list.
  async function loadPeople() {
    const uid = userIdRef.current
    if (!uid) return
    const [{ data: emps }, { data: staff }, { data: owner }] = await Promise.all([
      supabase.from('payroll_employees').select('id, name, designation').eq('user_id', uid).eq('is_active', true).order('name'),
      supabase.from('admin_staff').select('id, name').eq('user_id', uid).eq('is_active', true).order('name'),
      supabase.from('users').select('id, customer_name, store_name').eq('id', uid).single(),
    ])
    peopleRef.current = {
      employee:    (emps  || []).map(r => makePerson('employee', r)),
      admin_staff: (staff || []).map(r => makePerson('admin_staff', r)),
      owner:       owner ? [makePerson('owner', owner)] : [],
    }
    setEmployees(peopleRef.current[personTypeRef.current] || [])
  }

  async function loadFingerprints() {
    if (!userIdRef.current) return
    const { data } = await supabase
      .from('employee_fingerprints')
      .select('person_type, person_id, template, enrolled_at')
      .eq('user_id', userIdRef.current)
      .eq('is_active', true)
    const all = [...peopleRef.current.employee, ...peopleRef.current.admin_staff, ...peopleRef.current.owner]
    const nameMap = new Map(all.map(p => [p.key, p]))
    fpTemplatesRef.current = (data || []).map(fp => {
      const key = `${fp.person_type}:${fp.person_id}`
      const p = nameMap.get(key)
      return {
        key, person_type: fp.person_type, person_id: fp.person_id,
        name: p?.name || 'Unknown', designation: p?.designation || '',
        enrolled_at: fp.enrolled_at, template: fp.template,
      }
    })
    setEnrolledCount(fpTemplatesRef.current.length)
    addLog(`Loaded ${fpTemplatesRef.current.length} enrolled template(s)`)
  }

  // ── SDK ──
  async function loadSdk() {
    try {
      await loadWebSdkScript()
      const sdk = await import('@digitalpersona/devices')
      sdkRef.current = sdk
      const reader = new sdk.FingerprintReader()
      readerRef.current = reader

      reader.on('DeviceConnected', e => {
        const id = e.deviceId
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
      reader.on('QualityReported', e => { setQuality(e.quality); addLog(`Quality: ${e.quality}`) })
      reader.on('AcquisitionStopped', () => { scanningRef.current = false })
      reader.on('SamplesAcquired', onSamplesAcquired)
      reader.on('ErrorOccurred', e => { addLog(`Error: ${JSON.stringify(e.error ?? e)}`); setReaderStatus('error') })

      const devs = await reader.enumerateDevices()
      if (!devs.length) { setReaderStatus('no_reader'); return }
      setDevices(devs); setActiveDevice(devs[0])
      setReaderStatus('ready')
      addLog(`Reader ready — device: ${JSON.stringify(devs[0])}`)
    } catch (err) {
      addLog(`SDK init: ${err.message}`)
      setReaderStatus(err.message?.includes('not found') ? 'no_sdk' : 'error')
    }
  }

  // ── Central sample handler — routes to the active tab's logic ──
  const onSamplesAcquired = useCallback(async (e) => {
    const raw = extractSampleData(e.samples?.[0])
    if (!raw) { addLog('Empty sample — skipping'); return }
    addLog(`Sample received — ${raw.length} chars`)
    const currentTab = tabRef.current
    if (currentTab === 'enroll')       await handleEnrollSample(raw)
    else if (currentTab === 'compare') await handleCompareSample(raw)
    else if (currentTab === 'test')    handleTestSample(raw)
  }, [])

  // ── Switch tab ──
  async function switchTab(newTab) {
    try { await readerRef.current?.stopAcquisition?.() } catch {}
    scanningRef.current = false
    if (enrollActiveRef.current) cancelEnroll()
    setCapturedImg(null); setQuality(null)
    setCompareResult(null); compareBusyRef.current = false
    tabRef.current = newTab
    setTab(newTab)

    if (!readerRef.current || !sdkRef.current || !activeDevice) return
    if (newTab === 'compare') startCompareScan()
    else if (newTab === 'test') {
      try {
        await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.PngImage)
        scanningRef.current = true
        setReaderStatus('scanning')
      } catch (err) { addLog(`Capture failed: ${err.message}`) }
    }
    // Enroll starts manually.
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ENROLL
  // ════════════════════════════════════════════════════════════════════════════
  useEffect(() => {
    if (!selectedEmp) { setExisting(null); return }
    const local = fpTemplatesRef.current.find(fp => fp.key === selectedEmp.key)
    if (local) { setExisting({ enrolled_at: local.enrolled_at }); return }
    supabase.from('employee_fingerprints').select('id, enrolled_at')
      .eq('person_type', selectedEmp.person_type).eq('person_id', selectedEmp.person_id).eq('is_active', true).maybeSingle()
      .then(({ data }) => setExisting(data))
  }, [selectedEmp])

  async function startEnroll() {
    if (!selectedEmp || !readerRef.current || !sdkRef.current || !activeDevice) return
    if (!hasNativeFp()) { toast.error('Fingerprint matching only works in the desktop app'); return }
    const res = await window.electronAPI.enrollStart()
    if (!res?.ok) { addLog(`Enroll start failed: ${res?.error || 'unknown'}`); toast.error('Could not start enrollment'); return }
    setSamplesCount(0); samplesRef.current = 0
    enrollActiveRef.current = true
    setEnrollActive(true)
    addLog(`Enrollment started for ${selectedEmp.name}`)
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
      scanningRef.current = true
      setReaderStatus('capturing')
      addLog(`Place finger — scan 1 of ~${ENROLL_TARGET}…`)
    } catch (err) {
      addLog(`Enroll start failed: ${err.message}`)
      cancelEnroll()
    }
  }

  // Feed each capture to the native enrollment session. The engine decides when
  // it has enough (done:true → template ready); until then it asks for more.
  async function handleEnrollSample(sample) {
    if (!enrollActiveRef.current) return
    let res
    try { res = await window.electronAPI.enrollAdd(sample) }
    catch (err) { addLog(`Enroll add error: ${err.message}`); cancelEnroll(); return }

    if (!res?.ok) { addLog(`Enroll failed: ${res?.error || 'unknown'}`); toast.error(`Enrollment failed: ${res?.error || 'reader error'}`); cancelEnroll(); return }

    if (res.rejected) {
      addLog(`Scan not usable (${res.reason || 'low quality'}) — place finger again`)
      return // keep scanning; session still open
    }
    if (res.done) {
      try { await readerRef.current?.stopAcquisition?.() } catch {}
      scanningRef.current = false
      setSamplesCount(ENROLL_TARGET)
      await persistTemplate(res.template, res.templateBytes)
      return
    }
    // Accepted but needs more.
    samplesRef.current = res.count
    setSamplesCount(res.count)
    addLog(`Captured ${res.count} — lift and place the same finger again…`)
  }

  async function persistTemplate(template, templateBytes) {
    const emp = selectedEmpRef.current
    if (!emp || !userIdRef.current) { addLog('Save skipped: no person selected'); cancelEnroll(); return }
    setEnrollSaving(true)
    try {
      addLog(`Template built — ${templateBytes} bytes (REG)`)
      // Deactivate any previous template for this person, then store the new one.
      await supabase.from('employee_fingerprints').update({ is_active: false })
        .eq('person_type', emp.person_type).eq('person_id', emp.person_id).eq('user_id', userIdRef.current)
      const { error } = await supabase.from('employee_fingerprints').insert({
        user_id: userIdRef.current,
        person_type: emp.person_type, person_id: emp.person_id,
        employee_id: emp.person_type === 'employee' ? emp.person_id : null,
        template, finger_label: 'primary', enrolled_by: userIdRef.current,
        device_id: activeDeviceRef.current, is_active: true,
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
      cancelEnroll()
    } finally { setEnrollSaving(false) }
  }

  function cancelEnroll() {
    try { readerRef.current?.stopAcquisition?.() } catch {}
    try { window.electronAPI?.enrollCancel?.() } catch {}
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

  // Opens the custom confirm modal; actual deletion runs in performDelete().
  function deleteFingerprint(person) {
    if (!userIdRef.current) return
    setConfirmDelete(person)
  }

  async function performDelete() {
    const person = confirmDelete
    if (!person || !userIdRef.current) return
    const name = person.name
    setDeleting(true)
    try {
      const { error } = await supabase.from('employee_fingerprints')
        .update({ is_active: false })
        .eq('person_type', person.person_type).eq('person_id', person.person_id)
        .eq('user_id', userIdRef.current).eq('is_active', true)
      if (error) throw error
      addLog(`Fingerprint removed for ${name}`)
      toast.success(`Removed: ${name}`)
      if (selectedEmpRef.current?.key === person.key) setExisting(null)
      await loadFingerprints()
      setConfirmDelete(null)
    } catch (err) {
      addLog(`Delete failed: ${err.message}`)
      toast.error('Failed to remove fingerprint')
    } finally { setDeleting(false) }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // COMPARE  (1:N identify by default; 1:1 verify when an employee is chosen)
  // ════════════════════════════════════════════════════════════════════════════
  async function startCompareScan() {
    if (scanningRef.current) return
    if (!readerRef.current || !sdkRef.current) return
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
      scanningRef.current = true
      setReaderStatus('scanning')
      addLog('Compare mode — place a finger…')
    } catch (err) {
      addLog(`Compare scan failed: ${err.message}`)
      setReaderStatus('error')
    }
  }

  async function handleCompareSample(sample) {
    if (compareBusyRef.current) return
    if (!hasNativeFp()) { setCompareResult({ matched: false, error: 'Desktop app required' }); return }
    compareBusyRef.current = true
    const t0 = performance.now()
    try {
      const emp = compareEmpRef.current
      let result
      if (emp) {
        const fp = fpTemplatesRef.current.find(f => f.key === emp.key)
        if (!fp) { setCompareResult({ matched: false, error: `${emp.name} is not enrolled` }); return }
        const r = await window.electronAPI.compareFingerprints(fp.template, sample)
        result = { matched: r.matched, name: emp.name, score: r.score, error: r.error }
      } else {
        if (!fpTemplatesRef.current.length) { setCompareResult({ matched: false, error: 'No enrolled fingerprints yet' }); return }
        const r = await window.electronAPI.identifyFingerprint(
          sample,
          fpTemplatesRef.current.map(f => ({ id: f.key, name: f.name, template: f.template })),
        )
        result = { matched: r.matched, name: r.name, score: r.score, error: r.error }
      }
      const ms = Math.round(performance.now() - t0)
      setCompareResult({ ...result, ms })
      addLog(`Compare: ${result.matched ? `MATCH ${result.name}` : (result.error || 'no match')} score=${result.score ?? '—'} (${ms}ms)`)
    } catch (err) {
      addLog(`Compare error: ${err.message}`)
      setCompareResult({ matched: false, error: err.message })
    } finally {
      // Brief cooldown, then resume scanning so the next finger is read.
      setTimeout(async () => {
        compareBusyRef.current = false
        if (tabRef.current === 'compare') {
          try { await readerRef.current?.stopAcquisition?.() } catch {}
          scanningRef.current = false
          startCompareScan()
        }
      }, COMPARE_COOLDOWN_MS)
    }
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
  const TAB_LABELS = { enroll: 'Enroll', compare: 'Compare', test: 'Test' }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 flex flex-col">

      {/* ── Header ── */}
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
               'Reader ready'} · {enrolledCount} enrolled
            </p>
          </div>
        </div>
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          readerStatus === 'scanning' || readerStatus === 'capturing' ? 'bg-blue-500 animate-pulse' :
          readerStatus === 'ready' || readerStatus === 'done' ? 'bg-green-500' :
          readerStatus === 'loading' ? 'bg-amber-400 animate-pulse' : 'bg-red-500'
        }`} />
      </div>

      {/* ── Tabs ── */}
      <div className="flex border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        {TABS.map(key => (
          <button key={key} onClick={() => switchTab(key)}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === key
                ? 'border-violet-600 text-violet-600 dark:text-violet-400 dark:border-violet-400'
                : 'border-transparent text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300'
            }`}>
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {/* ── Banners ── */}
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
      {!nativeOk && (
        <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-xs text-amber-800 dark:text-amber-300">
          Running in the browser — capture works, but enrollment & matching require the desktop (Electron) app where <code>dpfj.dll</code> is available.
        </div>
      )}

      {/* ══ ENROLL TAB ══ */}
      {tab === 'enroll' && (
        <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">

          {/* Person selector (type + person) */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Type</label>
            <select value={personType} onChange={e => setPersonType(e.target.value)} disabled={enrollActive}
              className="w-full mb-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white disabled:opacity-50">
              {PERSON_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1">Select Person</label>
            <select value={selectedEmp?.key || ''} onChange={e => setSelectedEmp(employees.find(p => p.key === e.target.value) || null)} disabled={enrollActive}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white disabled:opacity-50">
              <option value="">Select person…</option>
              {employees.map(p => {
                const isEnrolled = fpTemplatesRef.current.some(fp => fp.key === p.key)
                return <option key={p.key} value={p.key}>{p.name}{p.designation ? ` — ${p.designation}` : ''}{isEnrolled ? ' ✓' : ''}</option>
              })}
            </select>
            {selectedEmp && existing && (
              <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Enrolled{existing.enrolled_at ? ` on ${new Date(existing.enrolled_at).toLocaleDateString('en-PK')}` : ''} — re-enrolling replaces it
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
                <div className="flex-1">
                  <p className="font-semibold text-gray-900 dark:text-white">{selectedEmp.name}</p>
                  {selectedEmp.designation && <p className="text-xs text-gray-500 dark:text-slate-400">{selectedEmp.designation}</p>}
                </div>
                {existing && !enrollActive && readerStatus !== 'done' && (
                  <button onClick={() => deleteFingerprint(selectedEmp)} title="Remove fingerprint"
                    className="p-2 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {/* Sample dots */}
              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                  {readerStatus === 'done' ? 'Enrollment complete!' :
                   enrollSaving ? 'Building template…' :
                   enrollActive ? `Lift and re-place the same finger (${samplesCount}/~${ENROLL_TARGET})` :
                   `Place the same finger ~${ENROLL_TARGET} times to build the template`}
                </p>
                <div className="flex gap-2">
                  {Array.from({ length: Math.max(ENROLL_TARGET, samplesCount) }).map((_, i) => (
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
                <button onClick={startEnroll} disabled={!['ready', 'error'].includes(readerStatus) || !nativeOk}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50">
                  <Fingerprint className="w-4 h-4" />
                  {existing ? 'Re-enroll Fingerprint' : 'Start Enrollment'}
                </button>
              )}
            </div>
          )}

          {/* Enrolled list (manage / delete) */}
          {fpTemplatesRef.current.length > 0 && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow p-4">
              <p className="text-xs font-semibold text-gray-500 dark:text-slate-400 mb-2">Enrolled ({fpTemplatesRef.current.length})</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {fpTemplatesRef.current.map(fp => (
                  <div key={fp.key} className="flex items-center gap-2 py-1.5 px-2 rounded-lg bg-gray-50 dark:bg-slate-700/40">
                    <div className="w-7 h-7 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[10px] font-bold">{getInitials(fp.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-slate-200 truncate">{fp.name}</p>
                      {fp.designation && <p className="text-[10px] text-gray-400 truncate">{fp.designation}</p>}
                    </div>
                    <button onClick={() => deleteFingerprint(fp)} title="Remove"
                      className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
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

      {/* ══ COMPARE TAB ══ */}
      {tab === 'compare' && (
        <div className="flex-1 flex flex-col items-center p-5 gap-4 overflow-y-auto">

          {/* Mode selector */}
          <div className="w-full max-w-sm bg-white dark:bg-slate-800 rounded-xl shadow p-4">
            <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">Match against</label>
            <select
              value={compareEmp?.key || ''}
              onChange={e => { setCompareEmp(fpTemplatesRef.current.find(fp => fp.key === e.target.value) || null); setCompareResult(null) }}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-sm text-gray-900 dark:text-white"
            >
              <option value="">Anyone — identify who it is (1:N)</option>
              {fpTemplatesRef.current.map(fp => (
                <option key={fp.key} value={fp.key}>{fp.name}{fp.designation ? ` (${fp.designation})` : ''}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-400">
              {compareEmp ? `Verifies the finger only against ${compareEmp.name} (1:1).` : 'Scans all enrolled templates and tells you who matched.'}
            </p>
          </div>

          {/* Scanner visual */}
          <div className={`w-40 h-40 rounded-full flex items-center justify-center transition-all duration-300 ${
            compareResult ? (compareResult.matched ? 'bg-emerald-500 shadow-lg shadow-emerald-500/40' : 'bg-red-500 shadow-lg shadow-red-500/30') :
            readerStatus === 'scanning' ? 'bg-violet-600 shadow-lg shadow-violet-500/40 animate-pulse' :
            readerStatus === 'ready'    ? 'bg-gray-200 dark:bg-slate-700' :
            'bg-red-100 dark:bg-red-900/30'
          }`}>
            {readerStatus === 'loading' ? <Loader2 className="w-14 h-14 text-gray-400 animate-spin" /> :
             readerStatus === 'no_reader' ? <WifiOff className="w-14 h-14 text-red-400" /> :
             compareResult ? (compareResult.matched ? <CheckCircle className="w-16 h-16 text-white" /> : <X className="w-16 h-16 text-white" />) :
             <Fingerprint className={`w-14 h-14 ${readerStatus === 'scanning' ? 'text-white' : 'text-gray-500 dark:text-slate-400'}`} />}
          </div>

          {/* Result */}
          <div className="text-center min-h-[64px]">
            {compareResult ? (
              compareResult.matched ? (
                <>
                  <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">Matched</p>
                  <p className="text-gray-700 dark:text-slate-200 font-medium">{compareResult.name}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{compareResult.score != null ? `score ${compareResult.score} · ` : ''}{compareResult.ms}ms</p>
                </>
              ) : (
                <>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{compareResult.error ? 'Cannot compare' : 'No match'}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {compareResult.error || `${compareEmp ? `Not ${compareEmp.name}` : 'No enrolled finger matched'}${compareResult.score != null ? ` · score ${compareResult.score}` : ''}${compareResult.ms != null ? ` · ${compareResult.ms}ms` : ''}`}
                  </p>
                </>
              )
            ) : (
              <p className="text-sm text-gray-500 dark:text-slate-400 flex items-center justify-center gap-1.5">
                <Zap className="w-4 h-4 text-violet-500" />
                {readerStatus === 'scanning' ? 'Place a finger on the reader…' : 'Initializing reader…'}
              </p>
            )}
          </div>

          {compareResult && (
            <button onClick={() => { setCompareResult(null); if (!scanningRef.current) startCompareScan() }}
              className="px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-medium">
              Scan Again
            </button>
          )}
        </div>
      )}

      {/* ══ TEST TAB ══ */}
      {tab === 'test' && (
        <div className="flex-1 p-4 max-w-lg mx-auto w-full space-y-4">
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

      {/* ── Event log ── */}
      <div className="border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Log</p>
        <div className="font-mono text-[11px] text-gray-500 dark:text-slate-400 space-y-0.5 max-h-28 overflow-y-auto">
          {log.length === 0 ? <p className="italic text-gray-400">No events…</p> : log.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      </div>

      <ConfirmModal
        isOpen={!!confirmDelete}
        onClose={() => { if (!deleting) setConfirmDelete(null) }}
        onConfirm={performDelete}
        title="Remove Fingerprint"
        message={confirmDelete ? `Remove the enrolled fingerprint for ${confirmDelete.name}? They will no longer be recognized until re-enrolled.` : ''}
        confirmText="Remove"
        type="danger"
        isLoading={deleting}
      />
    </div>
  )
}
