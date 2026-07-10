'use client'
// Attendance Rules panel for the CASHIER app — mirror of the admin
// bizpos-admin/app/admin/attendance/PolicyPanel.js. Both edit the SAME
// attendance_policy row (keyed by the owner's user_id), so rules set here show up
// in Admin and vice-versa. Classification itself is enforced server-side by the
// attendance_classify() trigger (migrations 022 + 034); this panel only edits the
// thresholds. The "cannot check out within N minutes" value lives on
// users.fingerprint_checkout_min_gap_minutes and is edited in the Settings tab, so
// it is intentionally NOT duplicated here.

import { useState, useEffect } from 'react'
import { supabase } from '../../../lib/supabase'
import toast from 'react-hot-toast'
import {
  Save, Loader2, Info, Clock, AlertTriangle,
  Timer, CheckCircle2, CalendarClock,
} from 'lucide-react'

const t5 = (t) => (t ? String(t).substring(0, 5) : '')   // 'HH:MM:SS' → 'HH:MM'
const orNull = (v) => (v === '' || v == null ? null : v)
const numOrNull = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n }

function fmt12(hhmm) {
  if (!hhmm) return null
  const [h, m] = hhmm.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const h12 = ((h + 11) % 12) + 1
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`
}

// Module scope so they don't remount (and drop focus) on each keystroke.
function TimeField({ label, value, onChange, help }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <input
        type="time" value={value} onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
      />
      <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{help}</p>
    </div>
  )
}

function NumField({ label, value, onChange, help, suffix }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="number" min={0} step="0.5" value={value} onChange={e => onChange(e.target.value)}
          placeholder="—"
          className="w-28 px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
        />
        {suffix && <span className="text-xs text-gray-500 dark:text-slate-400">{suffix}</span>}
      </div>
      <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">{help}</p>
    </div>
  )
}

export default function RulesPanel({ userId }) {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [enabled, setEnabled] = useState(false)
  const [lateAfter, setLateAfter] = useState('')
  const [halfDayAfter, setHalfDayAfter] = useState('')
  const [absentAfter, setAbsentAfter] = useState('')

  const [bizStart, setBizStart] = useState('')
  const [bizEnd, setBizEnd] = useState('')

  useEffect(() => {
    if (userId) fetchAll(userId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  async function fetchAll(uid) {
    setLoading(true)
    try {
      const [{ data: pol }, { data: u }] = await Promise.all([
        supabase.from('attendance_policy').select('*').eq('user_id', uid).maybeSingle(),
        supabase.from('users').select('business_start_time, business_end_time').eq('id', uid).single(),
      ])
      if (pol) {
        setEnabled(!!pol.enabled)
        setLateAfter(t5(pol.late_after_time))
        setHalfDayAfter(t5(pol.half_day_after_time))
        setAbsentAfter(t5(pol.absent_after_time))
      }
      if (u) {
        setBizStart(t5(u.business_start_time))
        setBizEnd(t5(u.business_end_time))
      }
    } catch { /* defaults are fine */ }
    finally { setLoading(false) }
  }

  async function handleSave() {
    if (!userId) return
    // Soft validation: thresholds usually escalate. Warn, never hard-block
    // (overnight shifts can legitimately wrap past midnight).
    const order = [lateAfter, halfDayAfter, absentAfter].filter(Boolean)
    for (let i = 1; i < order.length; i++) {
      if (order[i] <= order[i - 1]) {
        toast('Tip: Late → Half-day → Absent times usually increase in order.', { icon: '⚠️' })
        break
      }
    }

    setSaving(true)
    try {
      const policyRow = {
        user_id: userId,
        enabled,
        late_after_time: orNull(lateAfter),
        half_day_after_time: orNull(halfDayAfter),
        absent_after_time: orNull(absentAfter),
        // Retired (arrival-only model — checkout applies no rules).
        min_hours_full_day: null,
        min_hours_half_day: null,
        early_checkout_before_time: null,
        updated_at: new Date().toISOString(),
      }
      const { error } = await supabase
        .from('attendance_policy').upsert(policyRow, { onConflict: 'user_id' })
      if (error) throw error
      toast.success('Attendance rules saved')
    } catch (err) {
      toast.error(err.message || 'Failed to save rules')
    } finally { setSaving(false) }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="w-6 h-6 animate-spin text-violet-500" />
      </div>
    )
  }

  const dim = !enabled ? 'opacity-60 pointer-events-none select-none' : ''

  const summary = []
  if (lateAfter) summary.push(`Check in at or after ${fmt12(lateAfter)} → marked Late`)
  if (halfDayAfter) summary.push(`Check in at or after ${fmt12(halfDayAfter)} → marked Half Day`)
  if (absentAfter) summary.push(`Check in at or after ${fmt12(absentAfter)} → marked Absent`)

  return (
    <div>
      {/* Section header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-gray-900 dark:text-white text-base">Attendance Rules</h2>
          <p className="text-sm text-gray-500 dark:text-slate-400">
            Automatically classify each scan as Present / Late / Half Day / Absent
          </p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium disabled:opacity-60 transition-colors">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving…' : 'Save Rules'}
        </button>
      </div>

      <div className="space-y-4">

        {/* Master enable */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-700/30 overflow-hidden">
          <div className="p-4 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                Enable attendance rules
              </h2>
              <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                When off, every scan is simply recorded as Present (the original behaviour). Turn on to apply the thresholds below.
              </p>
            </div>
            <button type="button" onClick={() => setEnabled(v => !v)} role="switch" aria-checked={enabled}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                enabled ? 'bg-violet-600' : 'bg-gray-200 dark:bg-slate-600'
              }`}>
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition duration-200 ${
                enabled ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
          {(bizStart || bizEnd) && (
            <div className="px-4 pb-4">
              <div className="bg-gray-50 dark:bg-slate-700/50 rounded-lg px-3 py-2 text-xs text-gray-500 dark:text-slate-400 flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" />
                Business hours: <span className="font-medium text-gray-700 dark:text-slate-200">{fmt12(bizStart) || '—'} → {fmt12(bizEnd) || '—'}</span>
                <span className="opacity-70">· thresholds are absolute clock times, overnight-aware</span>
              </div>
            </div>
          )}
        </div>

        {/* Arrival thresholds */}
        <div className={`bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-700/30 overflow-hidden transition-opacity ${dim}`}>
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" /> Arrival rules
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Based on the check-in (first scan) time. Leave a field blank to skip that rule.
            </p>
          </div>
          <div className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <TimeField label="Late after" value={lateAfter} onChange={setLateAfter}
              help="e.g. 10:15 — arriving at/after this is Late" />
            <TimeField label="Half-day after" value={halfDayAfter} onChange={setHalfDayAfter}
              help="e.g. 14:00 — at/after this counts as Half Day" />
            <TimeField label="Absent after" value={absentAfter} onChange={setAbsentAfter}
              help="e.g. 16:00 — at/after this counts as Absent" />
          </div>
        </div>

        {/* Checkout — informational: no rules apply at checkout */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-700/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <Timer className="w-4 h-4 text-blue-500" /> Checkout
            </h2>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Status is decided at check-in only — checkout never changes it.
            </p>
          </div>
          <div className="p-4">
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 flex items-start gap-2">
              <Info className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                A second scan checks the person out (record only). The "cannot check out within N minutes" gap lives in the
                <strong> Settings</strong> tab. Anyone who doesn't check out is auto-closed at the end of the business day.
                Rules set here are shared with the admin panel.
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="bg-white dark:bg-slate-800 rounded-lg shadow dark:shadow-slate-700/30 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-slate-700">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-500" /> Active rules summary
            </h2>
          </div>
          <div className="p-4">
            {!enabled ? (
              <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-slate-400">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Rules are turned off — all scans record as Present.
              </div>
            ) : summary.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-slate-400">No thresholds set yet. Fill in the fields above.</p>
            ) : (
              <ul className="space-y-1.5">
                {summary.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700 dark:text-slate-300">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-violet-500 flex-shrink-0" />
                    {s}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 flex items-start gap-3">
          <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-amber-700 dark:text-amber-300">
            Rules apply to <strong>new and updated</strong> attendance records (including manual edits and the kiosk).
            Existing rows already saved keep their stored status until they're scanned or edited again.
          </p>
        </div>

      </div>
    </div>
  )
}
