'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { Calendar, ChevronDown, X } from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// DateRangeFilter — reusable date-range dropdown + custom range picker.
//
// Emits onChange({ preset, from, to }) where `from`/`to` are 'YYYY-MM-DD'
// strings (inclusive) or null (meaning unbounded / "All Time"). Preset ranges
// fire immediately on select; "Custom Range" fires only when Apply is pressed.
//
// Layout: a single horizontal row (label + dropdown + — when custom — From/To/
// Apply/Cancel). The whole thing is meant to live inside an `overflow-x-auto`
// container so it scrolls sideways on narrow panels; the preset menu is
// fixed-positioned so it is never clipped by that scroll container.
//
// onCustomToggle(isCustom) lets the parent react to entering/leaving custom mode
// (e.g. hide a Sort button while the custom inputs are showing).
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0')
const toYMD = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }

// Resolve a preset key → { from, to } as inclusive 'YYYY-MM-DD' strings.
// 'all'/'custom'/unknown → { from: null, to: null }.
export function resolveDateRange(preset, now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today':     return { from: toYMD(today), to: toYMD(today) }
    case 'yesterday': { const y = addDays(today, -1); return { from: toYMD(y), to: toYMD(y) } }
    case 'last7':     return { from: toYMD(addDays(today, -6)),  to: toYMD(today) }
    case 'last30':    return { from: toYMD(addDays(today, -29)), to: toYMD(today) }
    case 'thisMonth': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1)
      const end   = new Date(today.getFullYear(), today.getMonth() + 1, 0)
      return { from: toYMD(start), to: toYMD(end) }
    }
    case 'lastMonth': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1)
      const end   = new Date(today.getFullYear(), today.getMonth(), 0)
      return { from: toYMD(start), to: toYMD(end) }
    }
    default:          return { from: null, to: null }
  }
}

const BASE_PRESETS = [
  { value: 'today',     label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last7',     label: 'Last 7 Days' },
  { value: 'last30',    label: 'Last 30 Days' },
  { value: 'thisMonth', label: 'This Month' },
  { value: 'lastMonth', label: 'Last Month' },
  { value: 'custom',    label: 'Custom Range' },
]

export default function DateRangeFilter({
  onChange,
  onCustomToggle,
  defaultPreset = 'all',
  includeAllOption = true,
  isDark = false,
  label = 'Date Range',
  className = '',
}) {
  const presets = useMemo(
    () => (includeAllOption ? [{ value: 'all', label: 'All Time' }, ...BASE_PRESETS] : BASE_PRESETS),
    [includeAllOption]
  )

  const [preset, setPreset]         = useState(defaultPreset)
  const [open, setOpen]             = useState(false)
  const [menuRect, setMenuRect]     = useState(null)
  const [customFrom, setCustomFrom] = useState(toYMD(new Date()))
  const [customTo, setCustomTo]     = useState(toYMD(new Date()))
  const wrapRef = useRef(null)
  const btnRef  = useRef(null)
  const didInit = useRef(false)
  const prevPresetRef = useRef(defaultPreset)  // preset to restore when custom is cancelled

  // Emit the initial range once on mount so the parent's filter matches the
  // displayed preset out of the box (skip 'custom' — that waits for Apply).
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    if (defaultPreset && defaultPreset !== 'custom') {
      const { from, to } = resolveDateRange(defaultPreset)
      onChange?.({ preset: defaultPreset, from, to })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDoc = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  // The menu is position:fixed, so close it if anything scrolls/resizes to avoid
  // it floating detached from the button.
  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  const toggleMenu = () => {
    if (open) { setOpen(false); return }
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setMenuRect({ top: r.bottom + 4, left: r.left, width: r.width })
    setOpen(true)
  }

  const selectPreset = (p) => {
    if (p === 'custom' && preset !== 'custom') prevPresetRef.current = preset
    setPreset(p)
    setOpen(false)
    onCustomToggle?.(p === 'custom')
    // Custom waits for Apply; everything else applies immediately.
    if (p === 'custom') return
    const { from, to } = resolveDateRange(p)
    onChange?.({ preset: p, from, to })
  }

  const applyCustom = () => {
    let from = customFrom || null
    let to   = customTo   || null
    if (from && to && from > to) { const t = from; from = to; to = t } // tolerate reversed dates
    onChange?.({ preset: 'custom', from, to })
  }

  // Cancel the custom range: restore the preset that was active before custom
  // (falls back to "All Time" when available, else "Today").
  const cancelCustom = () => {
    const back = prevPresetRef.current && prevPresetRef.current !== 'custom'
      ? prevPresetRef.current
      : (includeAllOption ? 'all' : 'today')
    setPreset(back)
    onCustomToggle?.(false)
    const { from, to } = resolveDateRange(back)
    onChange?.({ preset: back, from, to })
  }

  const currentLabel = presets.find((o) => o.value === preset)?.label || 'Select'

  const labelCls = `text-xs font-semibold whitespace-nowrap shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`
  const fieldCls = `px-2.5 py-1.5 text-sm rounded-lg border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
    isDark ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-800'
  }`

  return (
    <div ref={wrapRef} className={`flex flex-col gap-2 w-full ${className}`}>
      {/* Preset row */}
      <div className="flex items-center gap-2">
        {label && <span className={labelCls}>{label}:</span>}

        {/* Preset dropdown — menu is fixed-positioned (escapes any scroll container) */}
        <div className="relative">
          <button
            ref={btnRef}
            type="button"
            onClick={toggleMenu}
            className={`flex items-center justify-between gap-2 min-w-[150px] ${fieldCls}`}
          >
            <span className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 opacity-70" />
              {currentLabel}
            </span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>

          {open && menuRect && (
            <div
              style={{
                position: 'fixed',
                top: menuRect.top,
                left: menuRect.left,
                width: Math.min(Math.max(menuRect.width, 180), 240),
              }}
              className={`z-50 rounded-lg border shadow-lg overflow-hidden ${
                isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
              }`}
            >
              {presets.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => selectPreset(o.value)}
                  className={`w-full text-left px-3 py-1.5 text-sm transition-colors ${
                    preset === o.value
                      ? isDark ? 'bg-indigo-900/50 text-indigo-300 font-semibold' : 'bg-indigo-50 text-indigo-700 font-semibold'
                      : isDark ? 'text-gray-200 hover:bg-gray-700' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Apply / cancel share the dropdown row when custom is active */}
        {preset === 'custom' && (
          <div className="flex items-center gap-2 ml-auto shrink-0">
            <button
              type="button"
              onClick={applyCustom}
              className="px-3.5 py-1.5 rounded-lg text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors"
            >
              Apply
            </button>
            <button
              type="button"
              onClick={cancelCustom}
              title="Cancel custom range"
              aria-label="Cancel custom range"
              className={`p-1.5 rounded-lg transition-colors ${
                isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Custom range — From / To on a second row (always visible, no scroll) */}
      {preset === 'custom' && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={labelCls}>From</span>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              style={{ colorScheme: isDark ? 'dark' : 'light' }}
              className={`flex-1 min-w-0 ${fieldCls}`}
            />
          </div>
          <div className="flex items-center gap-1.5 flex-1 min-w-0">
            <span className={labelCls}>To</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              style={{ colorScheme: isDark ? 'dark' : 'light' }}
              className={`flex-1 min-w-0 ${fieldCls}`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
