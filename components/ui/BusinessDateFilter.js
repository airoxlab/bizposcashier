'use client'

// Reusable BUSINESS-HOURS-aware date range filter.
//
// Renders a compact preset dropdown (Today / Yesterday / This Week / This Month /
// Last Month / Custom Range) and, on "Custom", two date inputs. Presets map to the
// BUSINESS day (overnight-safe) — not the calendar date — so "Today" is the current
// business day, matching the shift analytics / expenses. Emits on every change:
//
//   onChange({ preset, from, to, startISO, endISO, label })
//
// `from`/`to` are business-date strings (YYYY-MM-DD); `startISO`/`endISO` are the
// exact created_at timestamp bounds to filter by. Default preset = 'today'.
//
// This is the shared date filter for the software — drop it into any page (orders,
// reports, …): pass the business hours + a handler that stores the range & refetches.
// (Note: the older calendar-based `DateRangeFilter` is a separate component.)

import { useState, useEffect, useRef } from 'react'
import { Clock, ChevronDown } from 'lucide-react'
import { getContiguousBusinessDateRangeForPreset, DATE_PRESETS } from '../../lib/utils/businessDayUtils'

export default function BusinessDateFilter({
  startTime = '10:00',
  endTime = '03:00',
  defaultPreset = 'today',
  isDark = false,
  onChange,
  className = '',
  selectClassName = '',
  inputClassName = '',
}) {
  const [preset, setPreset] = useState(defaultPreset)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const onChangeRef = useRef(onChange)
  useEffect(() => { onChangeRef.current = onChange })

  // Seed from/to once so the custom inputs are pre-filled with the active range.
  useEffect(() => {
    const r = getContiguousBusinessDateRangeForPreset(defaultPreset, startTime, endTime)
    setFrom(r.from)
    setTo(r.to)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Emit the resolved range whenever the selection or business hours change.
  useEffect(() => {
    const range = getContiguousBusinessDateRangeForPreset(preset, startTime, endTime, from, to)
    onChangeRef.current?.({ preset, ...range })
  }, [preset, from, to, startTime, endTime])

  const changePreset = (p) => {
    setPreset(p)
    // Populate the range for the chosen preset (for custom, seed with today so the
    // date inputs aren't empty).
    const r = getContiguousBusinessDateRangeForPreset(p === 'custom' ? 'today' : p, startTime, endTime, from, to)
    setFrom(r.from)
    setTo(r.to)
  }

  const selCls = selectClassName ||
    `w-full appearance-none pl-8 pr-7 py-1.5 text-xs rounded-lg border cursor-pointer focus:outline-none focus:ring-1 focus:ring-indigo-400 ${
      isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'
    }`
  const inpCls = inputClassName ||
    `text-xs rounded-lg border px-2 py-1.5 ${isDark ? 'bg-gray-700 border-gray-600 text-gray-200' : 'bg-white border-gray-300 text-gray-800'}`

  return (
    <div className={className}>
      <div className="relative">
        <Clock className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-purple-500 pointer-events-none z-10" />
        <select value={preset} onChange={(e) => changePreset(e.target.value)} className={selCls}>
          {DATE_PRESETS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>

      {preset === 'custom' && (
        <div className="grid grid-cols-2 gap-1.5 mt-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            style={{ colorScheme: isDark ? 'dark' : 'light' }} className={inpCls} />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            style={{ colorScheme: isDark ? 'dark' : 'light' }} className={inpCls} />
        </div>
      )}
    </div>
  )
}
