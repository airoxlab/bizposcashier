'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, PrinterCheck, Signal, FileText, Loader2 } from 'lucide-react'
import { printerManager } from '../lib/printerManager'
import { authManager } from '../lib/authManager'

/**
 * Mini printer status badge for the dashboard header.
 *
 * Behavior:
 *  - On mount (login, page refresh, app reopen) auto-resolves the default/last
 *    connected printer via printerManager.checkConnection() and pings it.
 *  - Re-checks every 30 s, on window focus, and on the `online` event.
 *  - Hover reveals a mini panel with Test (connection ping) and Print
 *    (one-line raw test print) buttons — reuses the same IPC handlers as the
 *    full Printer Settings page so behavior stays identical.
 *  - Hidden when not running inside Electron.
 */
export default function PrinterStatusBadge({
  className = '',
  buttonClassName = '',
  iconClassName = '',
  onClick,
  disabled = false
}) {
  const [state, setState] = useState({
    loading: true,
    connected: false,
    configured: false,
    printer: null,
    error: null,
    checkedAt: null
  })
  const [hovered, setHovered] = useState(false)
  const [busy, setBusy] = useState(null) // 'test' | 'print' | null
  const [actionResult, setActionResult] = useState(null) // { ok, msg }
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 })
  const checkingRef = useRef(false)
  const hoverTimerRef = useRef(null)
  const anchorRef = useRef(null)

  // Position the portal panel below the badge, right-aligned
  const PANEL_WIDTH = 288 // w-72
  const updatePos = () => {
    const el = anchorRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const top = r.bottom + 8
    let left = r.right - PANEL_WIDTH
    if (left < 8) left = 8
    if (left + PANEL_WIDTH > window.innerWidth - 8) {
      left = window.innerWidth - PANEL_WIDTH - 8
    }
    setPanelPos({ top, left })
  }

  useLayoutEffect(() => {
    if (!hovered) return
    updatePos()
    window.addEventListener('resize', updatePos)
    window.addEventListener('scroll', updatePos, true)
    return () => {
      window.removeEventListener('resize', updatePos)
      window.removeEventListener('scroll', updatePos, true)
    }
  }, [hovered])

  const runCheck = async () => {
    if (checkingRef.current) return
    checkingRef.current = true
    try {
      const userId = authManager.getCurrentUser()?.id
      if (userId) {
        if (printerManager.currentUserId !== userId) printerManager.setUserId(userId)
      }
      const result = await printerManager.checkConnection()
      setState({
        loading: false,
        connected: !!result.connected,
        configured: !!result.configured,
        printer: result.printer || null,
        error: result.error || null,
        checkedAt: new Date()
      })
    } finally {
      checkingRef.current = false
    }
  }

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.electronAPI?.isElectron) return

    runCheck()
    const interval = setInterval(runCheck, 30000)
    const onFocus = () => runCheck()
    const onOnline = () => runCheck()
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  // Auto-clear action result after a few seconds
  useEffect(() => {
    if (!actionResult) return
    const t = setTimeout(() => setActionResult(null), 3000)
    return () => clearTimeout(t)
  }, [actionResult])

  if (typeof window !== 'undefined' && !window.electronAPI?.isElectron) return null

  const { loading, connected, configured, printer, error, checkedAt } = state

  const typeLabel = (p) => {
    if (!p) return ''
    if (p.connection_type === 'windows_usb') return `Windows USB · ${p.usb_printer_name || ''}`
    if (p.connection_type === 'usb') return `USB · ${p.usb_port || p.usb_device_path || ''}`
    return `IP · ${p.ip_address || ''}:${p.port || 9100}`
  }

  let Icon = Printer
  let color = 'text-gray-400'
  let dot = 'bg-gray-400'
  let label = 'Checking printer…'

  if (!loading) {
    if (!configured) {
      Icon = Printer
      color = 'text-gray-400'
      dot = 'bg-gray-400'
      label = 'No printer configured'
    } else if (connected) {
      Icon = PrinterCheck
      color = 'text-green-500'
      dot = 'bg-green-500'
      label = `Printer connected — ${printer?.name || ''} (${typeLabel(printer)})`
    } else {
      Icon = Printer
      color = 'text-red-500'
      dot = 'bg-red-500'
      label = `Printer disconnected — ${printer?.name || ''} (${typeLabel(printer)})${error ? ` · ${error}` : ''}`
    }
  }

  const tooltip = checkedAt
    ? `${label}\nLast checked: ${checkedAt.toLocaleTimeString()}\nClick to recheck`
    : label

  // Mini "Test" — same as printerManager.checkConnection() (no paper used)
  const handleTest = async () => {
    if (busy) return
    setBusy('test')
    setActionResult(null)
    try {
      await runCheck()
      // Read latest state via promise: runCheck already updated state, but state
      // is async — derive result from a fresh checkConnection call for clarity.
      const r = await printerManager.checkConnection()
      setActionResult({
        ok: !!r.connected,
        msg: r.connected ? 'Connected' : (r.error || 'Disconnected')
      })
    } catch (e) {
      setActionResult({ ok: false, msg: e.message || 'Test failed' })
    } finally {
      setBusy(null)
    }
  }

  // Mini "Print" — one-line raw test print, same IPC as the Printer Settings page
  const handlePrint = async () => {
    if (busy) return
    if (!configured || !printer) {
      setActionResult({ ok: false, msg: 'No printer configured' })
      return
    }
    setBusy('print')
    setActionResult(null)
    try {
      const effectiveType =
        printer.connection_type === 'windows_usb'
          ? 'windows_usb'
          : (printer.printer_type || printer.connection_type || 'ip')

      let result
      if (effectiveType === 'windows_usb') {
        if (!printer.usb_printer_name) {
          throw new Error('No Windows printer name')
        }
        result = await window.electronAPI.printerTestWindowsUSB({
          printerName: printer.usb_printer_name
        })
      } else if (effectiveType === 'usb') {
        const port = printer.usb_port || printer.usb_device_path
        if (!port) throw new Error('No USB port')
        result = await window.electronAPI.printerTestUSB({ port })
      } else {
        const ip = printer.ip_address || printer.ip
        if (!ip) throw new Error('No IP address')
        result = await window.electronAPI.printerRawTest({
          ip,
          port: String(printer.port || 9100)
        })
      }

      if (result?.success) {
        setActionResult({ ok: true, msg: 'Test print sent' })
        if (printer.id) {
          try { await printerManager.updateConnectionStatus(printer.id, true) } catch {}
        }
      } else {
        setActionResult({ ok: false, msg: result?.error || 'Print failed' })
      }
    } catch (e) {
      setActionResult({ ok: false, msg: e.message || 'Print failed' })
    } finally {
      setBusy(null)
    }
  }

  const openPanel = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    setHovered(true)
  }
  const closePanel = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current)
    hoverTimerRef.current = setTimeout(() => setHovered(false), 150)
  }

  const panel = hovered && typeof document !== 'undefined' ? createPortal(
    <div
      onMouseEnter={openPanel}
      onMouseLeave={closePanel}
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: PANEL_WIDTH,
        zIndex: 2147483000
      }}
      className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-2xl p-3"
    >
      {configured && printer ? (
        <>
          <div className="flex items-start gap-2 mb-2">
            <div className={`mt-1 w-2 h-2 rounded-full ${dot}`} />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">
                {printer.name || 'Printer'}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {typeLabel(printer)}
              </div>
              <div className={`text-[11px] mt-0.5 ${connected ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
                {connected ? 'Connected' : (error || 'Disconnected')}
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleTest}
              disabled={!!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-100 disabled:opacity-50"
            >
              {busy === 'test'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <Signal className="w-3.5 h-3.5" />}
              <span>Test</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!!busy}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50"
            >
              {busy === 'print'
                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                : <FileText className="w-3.5 h-3.5" />}
              <span>Print</span>
            </button>
          </div>

          {actionResult && (
            <div className={`mt-2 text-[11px] ${actionResult.ok ? 'text-green-600 dark:text-green-400' : 'text-red-500'}`}>
              {actionResult.msg}
            </div>
          )}

          {checkedAt && (
            <div className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
              Last checked {checkedAt.toLocaleTimeString()}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
            No printer configured
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Add a thermal printer in Settings → Printer to enable receipt printing.
          </div>
        </>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div
      ref={anchorRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={openPanel}
      onMouseLeave={closePanel}
    >
      <button
        type="button"
        onClick={(e) => {
          if (disabled) return
          if (typeof onClick === 'function') onClick(e)
          else runCheck()
        }}
        title={tooltip}
        aria-label={label}
        disabled={disabled}
        className={
          buttonClassName ||
          'relative inline-flex items-center justify-center w-9 h-9 rounded-lg transition-colors hover:bg-black/5 dark:hover:bg-white/10'
        }
      >
        <Icon className={`${iconClassName || 'w-5 h-5'} ${color} ${loading ? 'animate-pulse' : ''}`} />
        <span
          className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-white dark:ring-gray-900 ${dot} ${connected ? 'animate-pulse' : ''}`}
        />
      </button>
      {panel}
    </div>
  )
}
