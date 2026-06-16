'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '../../../lib/supabase'
import { authManager } from '../../../lib/authManager'
import {
  Fingerprint, Loader2, Save, Volume2,
  CheckCircle, User, ShieldCheck, RotateCcw, Trash2,
  SlidersHorizontal, Clock, RefreshCw, Users, LogOut,
} from 'lucide-react'
import toast from 'react-hot-toast'
import ConfirmModal from '../../../components/ui/ConfirmModal'
import { getTodaysBusinessDate } from '../../../lib/utils/businessDayUtils'

// ─── Shared helpers ─────────────────────────────────────────────────────────
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
  return typeof window !== 'undefined' && !!window.electronAPI?.enrollStart
}
function getInitials(name) {
  return name ? name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : '?'
}
const PERSON_TYPES = [
  { key: 'employee',    label: 'Employees' },
  { key: 'admin_staff', label: 'Admin Staff' },
  { key: 'owner',       label: 'Owner (Admin)' },
]
const TYPE_LABEL = { employee: 'Employee', admin_staff: 'Staff', owner: 'Owner' }
const TYPE_COLOR = {
  employee:    'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  admin_staff: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  owner:       'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
}
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
const ENROLL_TARGET = 4

function todayRangePKT() {
  const pktNow = new Date(Date.now() + 5 * 3600000)
  const y = pktNow.getUTCFullYear()
  const m = String(pktNow.getUTCMonth() + 1).padStart(2, '0')
  const d = String(pktNow.getUTCDate()).padStart(2, '0')
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  return {
    start: `${y}-${m}-${d}T00:00:00+05:00`,
    end:   `${y}-${m}-${d}T23:59:59.999+05:00`,
    label: `${d} ${MONTHS[pktNow.getUTCMonth()]} ${y}`,
  }
}
function fmtTime(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit', hour12: true })
}
function fmtDuration(mins) {
  if (mins == null) return '—'
  const h = Math.floor(mins / 60), m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

// ─── Status Tab ─────────────────────────────────────────────────────────────
function StatusTab({ userId }) {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateLabel, setDateLabel] = useState('')
  const [checkoutTarget, setCheckoutTarget] = useState(null)
  const [checkingOut, setCheckingOut] = useState(false)

  const load = useCallback(async () => {
    if (!userId) return
    setLoading(true)
    try {
      setDateLabel(todayRangePKT().label)
      const [{ data: emps }, { data: staff }, { data: owner }] = await Promise.all([
        supabase.from('payroll_employees').select('id, name, designation').eq('user_id', userId).eq('is_active', true),
        supabase.from('admin_staff').select('id, name').eq('user_id', userId).eq('is_active', true),
        supabase.from('users').select('id, customer_name, store_name, business_start_time, business_end_time').eq('id', userId).single(),
      ])
      // Filter by the SAME business_date the kiosk wrote (handles overnight shifts).
      const bd = getTodaysBusinessDate(owner?.business_start_time || '10:00', owner?.business_end_time || '03:00')
      const { data: attn } = await supabase.from('employee_attendance')
        .select('id, person_type, person_id, check_in_time, check_out_time, check_in_method, check_out_method, status')
        .eq('user_id', userId).eq('business_date', bd)
        .order('check_in_time', { ascending: false })
      const allPeople = [
        ...(emps  || []).map(r => makePerson('employee', r)),
        ...(staff || []).map(r => makePerson('admin_staff', r)),
        ...(owner ? [makePerson('owner', owner)] : []),
      ]
      const nameMap = new Map(allPeople.map(p => [p.key, p]))
      setRecords((attn || []).map(r => {
        const key = `${r.person_type}:${r.person_id}`
        const p = nameMap.get(key)
        const durMins = r.check_in_time && r.check_out_time
          ? Math.max(0, Math.round((new Date(r.check_out_time) - new Date(r.check_in_time)) / 60000))
          : null
        return { ...r, key, durMins, name: p?.name || 'Unknown', designation: p?.designation || '' }
      }))
    } catch { toast.error('Failed to load attendance') }
    finally { setLoading(false) }
  }, [userId])

  useEffect(() => { load() }, [load])

  async function checkOut() {
    const row = checkoutTarget
    if (!row) return
    setCheckingOut(true)
    try {
      const { data, error } = await supabase.rpc('check_out_attendance', {
        p_user_id:       userId,
        p_attendance_id: row.id,
        p_now:           new Date().toISOString(),
        p_method:        'manual',
      })
      if (error) throw error
      const res = Array.isArray(data) ? data[0] : data
      if (!res?.success) { toast.error(res?.message || 'Could not check out') }
      else { toast.success(`Checked out ${row.name}`) }
      setCheckoutTarget(null)
      await load()
    } catch { toast.error('Failed to check out') }
    finally { setCheckingOut(false) }
  }

  const currentlyIn = records.filter(r => !r.check_out_time)
  const checkedOut  = records.filter(r =>  r.check_out_time)

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 p-4">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading attendance…
    </div>
  )

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-bold text-gray-900 dark:text-white text-base">Today's Attendance</h3>
          <p className="text-xs text-gray-500 dark:text-slate-400">{dateLabel}</p>
        </div>
        <button onClick={load}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 transition-colors">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700/50">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{records.length}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Total scans</p>
        </div>
        <div className="rounded-xl p-4 border bg-emerald-50 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/40">
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{currentlyIn.length}</p>
          <p className="text-[11px] text-emerald-700 dark:text-emerald-500 mt-0.5">Currently in</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl p-4 shadow-sm border border-gray-100 dark:border-slate-700/50">
          <p className="text-2xl font-bold text-gray-500 dark:text-slate-400">{checkedOut.length}</p>
          <p className="text-[11px] text-gray-500 dark:text-slate-400 mt-0.5">Checked out</p>
        </div>
      </div>

      {/* Currently in */}
      {currentlyIn.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Currently In
          </p>
          <div className="space-y-2">
            {currentlyIn.map(r => (
              <div key={r.id}
                className="flex items-center gap-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-800/30 rounded-xl px-4 py-3">
                <div className="relative flex-shrink-0">
                  <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center">
                    <span className="text-white text-sm font-bold">{getInitials(r.name)}</span>
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white dark:border-slate-800 animate-pulse" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{r.designation}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${TYPE_COLOR[r.person_type]}`}>
                  {TYPE_LABEL[r.person_type]}
                </span>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{fmtTime(r.check_in_time)}</p>
                  <p className="text-[10px] text-gray-400 dark:text-slate-500">Checked in</p>
                </div>
                <button onClick={() => setCheckoutTarget(r)} title={`Check out ${r.name}`}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors">
                  <LogOut className="w-3.5 h-3.5" /> Out
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Checked out */}
      {checkedOut.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
            Checked Out
          </p>
          <div className="space-y-2">
            {checkedOut.map(r => (
              <div key={r.id}
                className="flex items-center gap-3 bg-white dark:bg-slate-800 rounded-xl px-4 py-3 shadow-sm border border-gray-100 dark:border-slate-700/50">
                <div className="w-10 h-10 rounded-full bg-slate-400 dark:bg-slate-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-sm font-bold">{getInitials(r.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{r.name}</p>
                  <p className="text-xs text-gray-500 dark:text-slate-400">{r.designation}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold flex-shrink-0 ${TYPE_COLOR[r.person_type]}`}>
                  {TYPE_LABEL[r.person_type]}
                </span>
                <div className="grid grid-cols-3 gap-4 text-center text-xs flex-shrink-0">
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-slate-300">{fmtTime(r.check_in_time)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">In</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-slate-300">{fmtTime(r.check_out_time)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">Out</p>
                  </div>
                  <div>
                    <p className="font-semibold text-gray-700 dark:text-slate-300">{fmtDuration(r.durMins)}</p>
                    <p className="text-[10px] text-gray-400 dark:text-slate-500">Dur</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {records.length === 0 && (
        <div className="text-center py-16 text-gray-400 dark:text-slate-600">
          <Clock className="w-12 h-12 mx-auto mb-3 opacity-25" />
          <p className="text-sm font-medium">No attendance records today</p>
          <p className="text-xs mt-1 opacity-70">Records appear once the kiosk scans a registered fingerprint</p>
        </div>
      )}

      <ConfirmModal
        isOpen={!!checkoutTarget}
        onClose={() => { if (!checkingOut) setCheckoutTarget(null) }}
        onConfirm={checkOut}
        title="Check Out"
        message={checkoutTarget ? `Check out ${checkoutTarget.name}? This ends their attendance for today — they can't check in again until the next business day.` : ''}
        confirmText="Check Out"
        type="warning"
        isLoading={checkingOut}
        loadingText="Checking out…"
      />
    </div>
  )
}

// ─── Enroll Tab ─────────────────────────────────────────────────────────────
function EnrollTab({ userId, onEnrolledChange }) {
  const [readerStatus, setReaderStatus] = useState('loading')
  const [personType, setPersonType]     = useState('employee')
  const [employees, setEmployees]       = useState([])
  const [selectedEmp, setSelectedEmp]   = useState(null)
  const [existing, setExisting]         = useState(null)
  const [samplesCount, setSamplesCount] = useState(0)
  const [enrollActive, setEnrollActive] = useState(false)
  const [enrollSaving, setEnrollSaving] = useState(false)
  const [nativeOk, setNativeOk]         = useState(true)
  const [enrolledList, setEnrolledList] = useState([])
  const [log, setLog]                   = useState([])
  const [confirmDelete, setConfirmDelete] = useState(null) // person pending removal
  const [deleting, setDeleting]         = useState(false)

  const readerRef       = useRef(null)
  const sdkRef          = useRef(null)
  const peopleRef       = useRef({ employee: [], admin_staff: [], owner: [] })
  const fpTemplatesRef  = useRef([])
  const userIdRef       = useRef(userId)
  const enrollActiveRef = useRef(false)
  const samplesRef      = useRef(0)
  const selectedEmpRef  = useRef(null)
  const activeDeviceRef = useRef(null)
  const personTypeRef   = useRef('employee')
  const scanningRef     = useRef(false)

  const addLog = (msg) => setLog(prev => [`${new Date().toLocaleTimeString('en-PK')} — ${msg}`, ...prev].slice(0, 30))

  useEffect(() => { selectedEmpRef.current = selectedEmp }, [selectedEmp])
  useEffect(() => {
    personTypeRef.current = personType
    setEmployees(peopleRef.current[personType] || [])
    setSelectedEmp(null); setExisting(null)
  }, [personType])

  useEffect(() => {
    userIdRef.current = userId
    setNativeOk(hasNativeFp())
    window.dispatchEvent(new CustomEvent('fp:ui-mode', { detail: { active: true } }))
    const setup = async () => { await loadPeople(); await loadFingerprints() }
    setup(); initReader()
    return () => {
      try { readerRef.current?.off?.() } catch {}
      try { readerRef.current?.stopAcquisition?.() } catch {}
      try { window.electronAPI?.enrollCancel?.() } catch {}
      window.dispatchEvent(new CustomEvent('fp:ui-mode', { detail: { active: false } }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function initReader() {
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
        activeDeviceRef.current = activeDeviceRef.current || id
        setReaderStatus(s => ['loading', 'no_reader'].includes(s) ? 'ready' : s)
      })
      reader.on('DeviceDisconnected', () => { addLog('Reader disconnected'); setReaderStatus('no_reader'); scanningRef.current = false })
      reader.on('AcquisitionStopped', () => { scanningRef.current = false })
      reader.on('SamplesAcquired', onSamplesAcquired)
      reader.on('ErrorOccurred', e => { addLog(`Error: ${JSON.stringify(e.error ?? e)}`); setReaderStatus('error') })
      const devs = await reader.enumerateDevices()
      if (!devs.length) { setReaderStatus('no_reader'); return }
      activeDeviceRef.current = devs[0]
      setReaderStatus('ready')
      addLog(`Reader ready — ${devs.length} device(s)`)
    } catch (err) {
      addLog(`SDK init: ${err.message}`)
      setReaderStatus(err.message?.includes('not found') ? 'no_sdk' : 'error')
    }
  }

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
    const uid = userIdRef.current
    if (!uid) return
    const { data } = await supabase.from('employee_fingerprints')
      .select('person_type, person_id, template, enrolled_at')
      .eq('user_id', uid).eq('is_active', true)
    const all = [...peopleRef.current.employee, ...peopleRef.current.admin_staff, ...peopleRef.current.owner]
    const nameMap = new Map(all.map(p => [p.key, p]))
    fpTemplatesRef.current = (data || []).map(fp => {
      const key = `${fp.person_type}:${fp.person_id}`
      const p = nameMap.get(key)
      return { key, person_type: fp.person_type, person_id: fp.person_id, name: p?.name || 'Unknown', designation: p?.designation || '', enrolled_at: fp.enrolled_at, template: fp.template }
    })
    setEnrolledList([...fpTemplatesRef.current])
    onEnrolledChange?.(fpTemplatesRef.current.length)
    addLog(`Loaded ${fpTemplatesRef.current.length} template(s)`)
  }

  const onSamplesAcquired = useCallback(async (e) => {
    const raw = extractSampleData(e.samples?.[0])
    if (!raw) { addLog('Empty sample — skipping'); return }
    addLog(`Sample received — ${raw.length} chars`)
    await handleEnrollSample(raw)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!selectedEmp) { setExisting(null); return }
    const local = fpTemplatesRef.current.find(fp => fp.key === selectedEmp.key)
    if (local) { setExisting({ enrolled_at: local.enrolled_at }); return }
    supabase.from('employee_fingerprints').select('id, enrolled_at')
      .eq('person_type', selectedEmp.person_type).eq('person_id', selectedEmp.person_id).eq('is_active', true).maybeSingle()
      .then(({ data }) => setExisting(data))
  }, [selectedEmp])

  async function startEnroll() {
    if (!selectedEmp || !readerRef.current || !sdkRef.current || !activeDeviceRef.current) return
    if (!hasNativeFp()) { toast.error('Desktop app required for enrollment'); return }
    const res = await window.electronAPI.enrollStart()
    if (!res?.ok) { addLog(`Start failed: ${res?.error || 'unknown'}`); toast.error('Could not start enrollment'); return }
    setSamplesCount(0); samplesRef.current = 0
    enrollActiveRef.current = true; setEnrollActive(true)
    addLog(`Enrollment started for ${selectedEmp.name}`)
    try {
      await readerRef.current.startAcquisition(sdkRef.current.SampleFormat.Intermediate)
      scanningRef.current = true; setReaderStatus('capturing')
      addLog(`Place finger — scan 1 of ~${ENROLL_TARGET}…`)
    } catch (err) { addLog(`Start failed: ${err.message}`); cancelEnroll() }
  }

  async function handleEnrollSample(sample) {
    if (!enrollActiveRef.current) return
    let res
    try { res = await window.electronAPI.enrollAdd(sample) }
    catch (err) { addLog(`Add error: ${err.message}`); cancelEnroll(); return }
    if (!res?.ok) { addLog(`Enroll failed: ${res?.error}`); toast.error('Enrollment failed'); cancelEnroll(); return }
    if (res.rejected) { addLog(`Not usable (${res.reason || 'low quality'}) — place finger again`); return }
    if (res.done) {
      try { await readerRef.current?.stopAcquisition?.() } catch {}
      scanningRef.current = false; setSamplesCount(ENROLL_TARGET)
      await persistTemplate(res.template, res.templateBytes); return
    }
    samplesRef.current = res.count; setSamplesCount(res.count)
    addLog(`Captured ${res.count} — lift and place same finger again…`)
  }

  async function persistTemplate(template, templateBytes) {
    const emp = selectedEmpRef.current
    if (!emp || !userIdRef.current) { cancelEnroll(); return }
    setEnrollSaving(true)
    try {
      addLog(`Template built — ${templateBytes} bytes (REG)`)
      await supabase.from('employee_fingerprints').update({ is_active: false })
        .eq('person_type', emp.person_type).eq('person_id', emp.person_id).eq('user_id', userIdRef.current)
      const { error } = await supabase.from('employee_fingerprints').insert({
        user_id: userIdRef.current, person_type: emp.person_type, person_id: emp.person_id,
        employee_id: emp.person_type === 'employee' ? emp.person_id : null,
        template, finger_label: 'primary', enrolled_by: userIdRef.current,
        device_id: activeDeviceRef.current, is_active: true,
      })
      if (error) throw error
      setReaderStatus('done'); enrollActiveRef.current = false; setEnrollActive(false)
      addLog(`Saved for ${emp.name}`); toast.success(`Enrolled: ${emp.name}`)
      setExisting({ enrolled_at: new Date().toISOString() })
      await loadFingerprints()
    } catch (err) { addLog(`Save failed: ${err.message}`); toast.error('Failed to save fingerprint'); cancelEnroll() }
    finally { setEnrollSaving(false) }
  }

  function cancelEnroll() {
    try { readerRef.current?.stopAcquisition?.() } catch {}
    try { window.electronAPI?.enrollCancel?.() } catch {}
    scanningRef.current = false; samplesRef.current = 0
    setSamplesCount(0); enrollActiveRef.current = false; setEnrollActive(false)
    setReaderStatus('ready'); addLog('Cancelled')
  }

  function resetEnroll() {
    selectedEmpRef.current = null
    setSelectedEmp(null); setExisting(null)
    setSamplesCount(0); enrollActiveRef.current = false; setEnrollActive(false)
    setReaderStatus('ready')
  }

  // Opens the custom confirm modal; actual deletion runs in performDelete().
  function deleteFingerprint(person) {
    setConfirmDelete(person)
  }

  async function performDelete() {
    const person = confirmDelete
    if (!person) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('employee_fingerprints').update({ is_active: false })
        .eq('person_type', person.person_type).eq('person_id', person.person_id)
        .eq('user_id', userIdRef.current).eq('is_active', true)
      if (error) throw error
      addLog(`Removed ${person.name}`); toast.success(`Removed: ${person.name}`)
      if (selectedEmpRef.current?.key === person.key) setExisting(null)
      await loadFingerprints()
      setConfirmDelete(null)
    } catch { toast.error('Failed to remove fingerprint') }
    finally { setDeleting(false) }
  }

  const statusLabel =
    readerStatus === 'no_sdk'    ? 'SDK not installed'  :
    readerStatus === 'no_reader' ? 'No reader detected' :
    readerStatus === 'scanning'  ? 'Scanning…'          :
    readerStatus === 'capturing' ? 'Enrolling…'         :
    readerStatus === 'loading'   ? 'Initializing…'      :
    readerStatus === 'error'     ? 'Reader error'       :
    readerStatus === 'done'      ? 'Enrolled!'          : 'Reader ready'
  const statusDot =
    readerStatus === 'scanning' || readerStatus === 'capturing' ? 'bg-blue-500 animate-pulse' :
    readerStatus === 'ready'    || readerStatus === 'done'      ? 'bg-green-500' :
    readerStatus === 'loading'                                  ? 'bg-amber-400 animate-pulse' : 'bg-red-500'

  return (
    <div className="space-y-4">
      {/* Reader status */}
      <div className="flex items-center gap-2.5 px-4 py-2.5 bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50">
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot}`} />
        <span className="text-sm text-gray-600 dark:text-slate-300 font-medium">{statusLabel}</span>
        <span className="ml-auto text-xs text-gray-400 dark:text-slate-500">{enrolledList.length} enrolled</span>
      </div>

      {readerStatus === 'no_sdk' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-300">
          <p className="font-semibold mb-1">SDK not installed</p>
          <p className="text-xs opacity-80">Run <code className="bg-white/50 px-1 rounded">npm install @digitalpersona/devices</code>, then copy WebSdk to public/sdk/.</p>
        </div>
      )}
      {readerStatus === 'no_reader' && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-700 p-3 text-sm text-red-800 dark:text-red-300">
          <p className="font-semibold">No reader detected</p>
          <p className="text-xs opacity-80 mt-0.5">Plug in the U.are.U 4500 and make sure DpHost service is running.</p>
        </div>
      )}
      {!nativeOk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 dark:border-amber-700 p-3 text-xs text-amber-800 dark:text-amber-300">
          Browser mode — enrollment requires the desktop (Electron) app.
        </div>
      )}

      {/* Two-column layout: selector left, list right */}
      <div className="grid grid-cols-2 gap-4">
        {/* Person selector + enrollment panel */}
        <div className="space-y-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Type</label>
              <select value={personType} onChange={e => setPersonType(e.target.value)} disabled={enrollActive}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-900 dark:text-white disabled:opacity-50">
                {PERSON_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">Person</label>
              <select value={selectedEmp?.key || ''} onChange={e => setSelectedEmp(employees.find(p => p.key === e.target.value) || null)} disabled={enrollActive}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-900 dark:text-white disabled:opacity-50">
                <option value="">Select person…</option>
                {employees.map(p => {
                  const isEnrolled = fpTemplatesRef.current.some(fp => fp.key === p.key)
                  return <option key={p.key} value={p.key}>{isEnrolled ? '✓ ' : ''}{p.name}{p.designation ? ` — ${p.designation}` : ''}</option>
                })}
              </select>
            </div>
            {selectedEmp && existing && (
              <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" />
                Enrolled{existing.enrolled_at ? ` ${new Date(existing.enrolled_at).toLocaleDateString('en-PK')}` : ''} — re-enroll replaces it
              </p>
            )}
            {selectedEmp && !existing && (
              <p className="text-xs text-gray-400 dark:text-slate-500 flex items-center gap-1">
                <User className="w-3.5 h-3.5" /> Not enrolled yet
              </p>
            )}
          </div>

          {/* Enrollment panel */}
          {selectedEmp && (
            <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-violet-600 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{getInitials(selectedEmp.name)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{selectedEmp.name}</p>
                  {selectedEmp.designation && <p className="text-xs text-gray-400 dark:text-slate-500">{selectedEmp.designation}</p>}
                </div>
                {existing && !enrollActive && readerStatus !== 'done' && (
                  <button onClick={() => deleteFingerprint(selectedEmp)} title="Remove fingerprint"
                    className="p-1.5 rounded-lg text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div>
                <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
                  {readerStatus === 'done' ? 'Enrollment complete!' :
                   enrollSaving ? 'Building template…' :
                   enrollActive ? `Place same finger again (${samplesCount}/~${ENROLL_TARGET})` :
                   `Scan same finger ~${ENROLL_TARGET} times`}
                </p>
                <div className="flex gap-1.5">
                  {Array.from({ length: Math.max(ENROLL_TARGET, samplesCount) }).map((_, i) => (
                    <div key={i} className={`flex-1 h-8 rounded-lg flex items-center justify-center transition-all text-xs font-bold ${
                      i < samplesCount
                        ? 'bg-emerald-500 text-white'
                        : enrollActive && i === samplesCount
                          ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-400 animate-pulse text-blue-500'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-300 dark:text-slate-600'
                    }`}>
                      {i < samplesCount ? <CheckCircle className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                  ))}
                </div>
              </div>

              {readerStatus === 'done' ? (
                <button onClick={resetEnroll} className="w-full py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium">
                  Enroll Another
                </button>
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
                  {existing ? 'Re-enroll' : 'Start Enrollment'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: enrolled list + log */}
        <div className="space-y-3">
          {/* Enrolled list */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-4">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">
              Enrolled ({enrolledList.length})
            </p>
            {enrolledList.length === 0 ? (
              <div className="text-center py-6 text-gray-400 dark:text-slate-600">
                <Fingerprint className="w-8 h-8 mx-auto mb-1.5 opacity-25" />
                <p className="text-xs">No fingerprints enrolled</p>
              </div>
            ) : (
              <div className="space-y-1.5 max-h-56 overflow-y-auto">
                {enrolledList.map(fp => (
                  <div key={fp.key} className="flex items-center gap-2.5 py-2 px-2.5 rounded-xl bg-gray-50 dark:bg-slate-700/40 group">
                    <div className="w-8 h-8 rounded-full bg-violet-500 flex items-center justify-center flex-shrink-0">
                      <span className="text-white text-[11px] font-bold">{getInitials(fp.name)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 dark:text-slate-200 font-medium truncate">{fp.name}</p>
                      <p className="text-[10px] text-gray-400 dark:text-slate-500 truncate">{fp.designation || TYPE_LABEL[fp.person_type]}</p>
                    </div>
                    <button onClick={() => deleteFingerprint(fp)} title="Remove"
                      className="p-1.5 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Log */}
          <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-100 dark:border-slate-700/50 p-3">
            <p className="text-[10px] font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider mb-2">Log</p>
            <div className="font-mono text-[11px] text-gray-500 dark:text-slate-400 space-y-1 max-h-32 overflow-y-auto">
              {log.length === 0
                ? <p className="italic text-gray-400">No events…</p>
                : log.map((l, i) => <p key={i} className="leading-snug">{l}</p>)}
            </div>
          </div>
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

// ─── Settings Tab ────────────────────────────────────────────────────────────
function SettingsTab({ userId }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [cfg, setCfg] = useState({
    fingerprint_attendance_enabled:       false,
    fingerprint_enable_checkout:          true,
    fingerprint_checkout_min_gap_minutes: 30,
    fingerprint_popup_seconds:            3,
    fingerprint_sound_enabled:            true,
  })

  useEffect(() => {
    if (!userId) { setLoading(false); return }
    supabase.from('users')
      .select('fingerprint_attendance_enabled, fingerprint_enable_checkout, fingerprint_checkout_min_gap_minutes, fingerprint_popup_seconds, fingerprint_sound_enabled')
      .eq('id', userId).single()
      .then(({ data }) => {
        if (data) setCfg({
          fingerprint_attendance_enabled:       !!data.fingerprint_attendance_enabled,
          fingerprint_enable_checkout:          data.fingerprint_enable_checkout ?? true,
          fingerprint_checkout_min_gap_minutes: data.fingerprint_checkout_min_gap_minutes ?? 30,
          fingerprint_popup_seconds:            data.fingerprint_popup_seconds ?? 3,
          fingerprint_sound_enabled:            data.fingerprint_sound_enabled ?? true,
        })
        setLoading(false)
      }, () => setLoading(false))
  }, [userId])

  async function save() {
    if (!userId) return
    setSaving(true)
    try {
      const { error } = await supabase.from('users').update({
        fingerprint_attendance_enabled:       cfg.fingerprint_attendance_enabled,
        fingerprint_enable_checkout:          cfg.fingerprint_enable_checkout,
        fingerprint_checkout_min_gap_minutes: Math.max(0, parseInt(cfg.fingerprint_checkout_min_gap_minutes) || 0),
        fingerprint_popup_seconds:            Math.min(15, Math.max(1, parseInt(cfg.fingerprint_popup_seconds) || 3)),
        fingerprint_sound_enabled:            cfg.fingerprint_sound_enabled,
      }).eq('id', userId)
      if (error) throw error
      toast.success('Settings saved')
    } catch { toast.error('Failed to save settings') }
    finally { setSaving(false) }
  }

  const Toggle = ({ checked, onChange, disabled }) => (
    <button onClick={() => !disabled && onChange(!checked)} type="button" disabled={disabled}
      className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-violet-600' : 'bg-gray-300 dark:bg-slate-600'} ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
    </button>
  )

  if (loading) return (
    <div className="flex items-center gap-2 text-gray-500 dark:text-slate-400 p-4">
      <Loader2 className="w-4 h-4 animate-spin" /> Loading…
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Enable kiosk — full width, prominent */}
      <div className={`rounded-xl border-2 p-4 flex items-center justify-between gap-4 transition-colors ${
        cfg.fingerprint_attendance_enabled
          ? 'border-violet-300 bg-violet-50 dark:bg-violet-900/10 dark:border-violet-700/50'
          : 'border-gray-200 bg-white dark:bg-slate-800 dark:border-slate-700/50'
      }`}>
        <div>
          <p className="font-semibold text-gray-900 dark:text-white text-sm">Enable attendance kiosk</p>
          <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">The reader scans on every page and records attendance automatically.</p>
        </div>
        <Toggle checked={cfg.fingerprint_attendance_enabled} onChange={v => setCfg(c => ({ ...c, fingerprint_attendance_enabled: v }))} />
      </div>

      {/* Two-column grid for remaining settings */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-gray-900 dark:text-white text-sm">Second scan checks out</p>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">If off, a second scan shows "Already marked".</p>
            </div>
            <Toggle checked={cfg.fingerprint_enable_checkout} onChange={v => setCfg(c => ({ ...c, fingerprint_enable_checkout: v }))} />
          </div>

          <div className={`bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-4 ${!cfg.fingerprint_enable_checkout ? 'opacity-50' : ''}`}>
            <p className="font-medium text-gray-900 dark:text-white text-sm">Minimum gap before check-out</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 mb-3">Scans within this window after check-in show "Already marked".</p>
            <div className="flex items-center gap-2">
              <input type="number" min="0" max="720" value={cfg.fingerprint_checkout_min_gap_minutes}
                disabled={!cfg.fingerprint_enable_checkout}
                onChange={e => setCfg(c => ({ ...c, fingerprint_checkout_min_gap_minutes: e.target.value }))}
                className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-900 dark:text-white" />
              <span className="text-sm text-gray-500 dark:text-slate-400">minutes</span>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-4">
            <p className="font-medium text-gray-900 dark:text-white text-sm">Popup duration</p>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 mb-3">How long the check-in/out popup stays on screen.</p>
            <div className="flex items-center gap-2">
              <input type="number" min="1" max="15" value={cfg.fingerprint_popup_seconds}
                onChange={e => setCfg(c => ({ ...c, fingerprint_popup_seconds: e.target.value }))}
                className="w-24 px-3 py-2 rounded-lg border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-sm text-gray-900 dark:text-white" />
              <span className="text-sm text-gray-500 dark:text-slate-400">seconds</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-100 dark:border-slate-700/50 shadow-sm p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                <Volume2 className="w-4 h-4 text-gray-500 dark:text-slate-400" />
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white text-sm">Beep on mark</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">Play a sound when attendance is recorded.</p>
              </div>
            </div>
            <Toggle checked={cfg.fingerprint_sound_enabled} onChange={v => setCfg(c => ({ ...c, fingerprint_sound_enabled: v }))} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end pt-1">
        <button onClick={save} disabled={saving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold disabled:opacity-50 shadow-sm">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Settings
        </button>
      </div>
    </div>
  )
}

// ─── Sidebar nav definition ──────────────────────────────────────────────────
const NAV = [
  { key: 'settings', label: 'Settings',  desc: 'Kiosk configuration',  icon: SlidersHorizontal },
  { key: 'enroll',   label: 'Enroll',    desc: 'Manage fingerprints',   icon: Fingerprint },
  { key: 'status',   label: 'Status',    desc: "Today's check-in/out",  icon: Clock },
]

// ─── Main panel ──────────────────────────────────────────────────────────────
export function FingerprintPanel() {
  const [activeSection, setActiveSection] = useState('settings')
  const [readerConnected, setReaderConnected] = useState(false)
  const [enrolledCount, setEnrolledCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  const u = authManager.getCurrentUser()
  const userId = u?.user_id || u?.id

  useEffect(() => {
    setMounted(true)
    setReaderConnected(!!window.__fpDeviceConnected)
    const onStatus = (e) => setReaderConnected(!!e.detail?.connected)
    window.addEventListener('fp:device-status', onStatus)
    return () => window.removeEventListener('fp:device-status', onStatus)
  }, [])

  useEffect(() => {
    if (!userId) return
    supabase.from('employee_fingerprints')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId).eq('is_active', true)
      .then(({ count }) => setEnrolledCount(count || 0))
  }, [userId])

  return (
    <div className="flex" style={{ minHeight: '100%' }}>
      {/* ── Mini sidebar ── */}
      <div className="w-52 flex-shrink-0 flex flex-col border-r border-gray-200 dark:border-slate-700/60 bg-white dark:bg-slate-800/40">
        {/* Header */}
        <div className="px-4 pt-6 pb-4 border-b border-gray-100 dark:border-slate-700/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-violet-600 flex items-center justify-center flex-shrink-0 shadow-sm">
              <Fingerprint className="w-[18px] h-[18px] text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-900 dark:text-white text-sm leading-tight">Fingerprint</p>
              <p className="text-[10px] text-gray-500 dark:text-slate-400 leading-tight">Attendance System</p>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-2.5 space-y-0.5">
          {NAV.map(item => {
            const active = activeSection === item.key
            return (
              <button key={item.key} onClick={() => setActiveSection(item.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left transition-all ${
                  active
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-slate-700/50 hover:text-gray-900 dark:hover:text-white'
                }`}>
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold leading-tight">{item.label}</p>
                  <p className={`text-[10px] leading-tight mt-0.5 truncate ${active ? 'text-violet-200' : 'text-gray-400 dark:text-slate-500'}`}>
                    {item.desc}
                  </p>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Bottom status */}
        <div className="p-3 border-t border-gray-100 dark:border-slate-700/60 space-y-1.5">
          {mounted && (
            <div className={`flex items-center gap-2 px-2.5 py-2 rounded-lg ${
              readerConnected ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-gray-50 dark:bg-slate-700/40'
            }`}>
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${readerConnected ? 'bg-emerald-500' : 'bg-gray-400 dark:bg-slate-500'}`} />
              <span className={`text-[11px] font-medium truncate ${readerConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-slate-400'}`}>
                {readerConnected ? 'Reader connected' : 'No reader'}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2 px-2.5 py-1.5">
            <Users className="w-3 h-3 text-gray-400 dark:text-slate-500 flex-shrink-0" />
            <span className="text-[11px] text-gray-500 dark:text-slate-400">{enrolledCount} enrolled</span>
          </div>
        </div>
      </div>

      {/* ── Content area ── */}
      <div className="flex-1 min-w-0 overflow-y-auto p-6">
        {activeSection === 'settings' && <SettingsTab userId={userId} />}
        {activeSection === 'enroll'   && <EnrollTab   userId={userId} onEnrolledChange={setEnrolledCount} />}
        {activeSection === 'status'   && <StatusTab   userId={userId} />}
      </div>
    </div>
  )
}

export default function FingerprintSettingsPage() {
  return <FingerprintPanel />
}
