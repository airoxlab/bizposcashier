'use client'

import React, { useState, useEffect, useRef } from 'react'
import { Search, X, ChevronDown, Plus } from 'lucide-react'

// Generic searchable dropdown — options: [{ id, label, sublabel? }]
// Mirrors the inline dropdown used in the purchase-order panels so the
// look/behaviour stays consistent across the app.
export default function SearchableDropdown({
  value, options, placeholder = 'Select...', onChange,
  onAddNew, canAddNew = false, addNewLabel = '+ Add New',
  isDark, triggerCls, panelWidth = 'w-64', searchPlaceholder = 'Search...'
}) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setSearch('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase()) ||
    (o.sublabel && o.sublabel.toLowerCase().includes(search.toLowerCase()))
  )
  const selected = options.find(o => o.id === value)

  const pick = (id) => { onChange(id); setOpen(false); setSearch('') }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { setOpen(p => !p); setSearch('') }}
        className={`${triggerCls} flex items-center justify-between gap-1 text-left w-full`}
      >
        <span className={`truncate ${!selected ? (isDark ? 'text-gray-500' : 'text-gray-400') : ''}`}>
          {selected
            ? (selected.sublabel ? `${selected.label} · ${selected.sublabel}` : selected.label)
            : placeholder}
        </span>
        <ChevronDown className={`w-3 h-3 flex-shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''} ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
      </button>

      {open && (
        <div className={`absolute z-40 top-full left-0 mt-1 ${panelWidth} rounded-xl shadow-2xl border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          {/* Search bar */}
          <div className={`flex items-center gap-2 px-3 py-2 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
            <Search className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              autoFocus
              type="text"
              placeholder={searchPlaceholder}
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && filtered.length > 0) pick(filtered[0].id)
                if (e.key === 'Escape') { setOpen(false); setSearch('') }
              }}
              className={`flex-1 text-xs bg-transparent focus:outline-none ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-900 placeholder-gray-400'}`}
            />
            {search && (
              <button type="button" onClick={() => setSearch('')} className={`${isDark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>

          {/* Options list */}
          <div className="max-h-52 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className={`px-3 py-3 text-xs text-center ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                No results{search ? ` for "${search}"` : ''}
              </p>
            ) : filtered.map(o => (
              <button
                key={o.id === '' ? '__none__' : o.id}
                type="button"
                onClick={() => pick(o.id)}
                className={`w-full text-left px-3 py-2 text-xs transition-colors flex items-center justify-between gap-2 ${
                  value === o.id
                    ? `font-semibold ${isDark ? 'bg-indigo-900/40 text-indigo-300' : 'bg-indigo-50 text-indigo-700'}`
                    : isDark ? 'text-gray-200 hover:bg-gray-700/60' : 'text-gray-800 hover:bg-gray-50'
                }`}
              >
                <span className="font-medium truncate">{o.label}</span>
                {o.sublabel && (
                  <span className={`ml-1.5 text-[10px] flex-shrink-0 font-semibold ${isDark ? 'text-red-400' : 'text-red-500'}`}>{o.sublabel}</span>
                )}
              </button>
            ))}
          </div>

          {/* Add new footer */}
          {canAddNew && (
            <div className={`border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
              <button
                type="button"
                onClick={() => { setOpen(false); setSearch(''); onAddNew() }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-xs font-semibold text-indigo-500 hover:text-indigo-400 transition-colors ${isDark ? 'hover:bg-gray-700/60' : 'hover:bg-indigo-50'}`}
              >
                <Plus className="w-3.5 h-3.5" /> {addNewLabel}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
