'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Download, RefreshCw, AlertTriangle } from 'lucide-react';
import { isAutoUpdateEnabled } from '../lib/updatePrefs';

/**
 * Dashboard update button — real Electron auto-updater logic.
 *
 * Lives in the dashboard header (left of the clock). Renders nothing until the
 * main process reports an update is available, then:
 *   - available   → "Update" button; click starts the download
 *   - downloading → shows "%", thin progress bar pinned to bottom of the header
 *   - downloaded  → "Restart" button; click installs and relaunches
 *   - error       → "Retry" button
 *
 * Mirrors the behaviour of components/UpdateNotification.jsx (the old top banner)
 * but as a compact header button. Renders nothing in the browser (no electronAPI).
 */
export default function DashboardUpdateButton() {
  const [state, setState] = useState({
    phase: 'idle',   // idle | available | downloading | downloaded | error
    version: null,
    percent: 0,
    error: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const disposers = [
      window.electronAPI.onUpdateAvailable((d) =>
        setState((s) => {
          if (s.phase === 'downloaded' || s.phase === 'downloading') {
            return { ...s, version: d?.version || s.version };
          }
          // Auto-download only if the user opted in; otherwise wait for a click.
          if (isAutoUpdateEnabled()) {
            window.electronAPI.downloadUpdate?.();
            return { ...s, phase: 'downloading', version: d?.version || s.version, percent: 0 };
          }
          return { ...s, phase: 'available', version: d?.version || s.version };
        })),

      window.electronAPI.onUpdateDownloadProgress((d) =>
        setState((s) => (s.phase === 'downloaded' ? s : {
          ...s,
          phase: 'downloading',
          percent: Math.round(d?.percent || 0),
        }))),

      window.electronAPI.onUpdateDownloaded((d) =>
        setState((s) => ({ ...s, phase: 'downloaded', version: d?.version || s.version, percent: 100 }))),

      window.electronAPI.onUpdateError((d) =>
        setState((s) => {
          if (s.phase === 'downloaded') return s;
          const msg = (d?.message || '').toLowerCase();
          // "No published versions on GitHub" just means there's nothing to update — not a real error.
          if (msg.includes('no published versions') || msg.includes('latest.yml') || msg.includes('no releases')) return s;
          return { ...s, phase: 'error', error: d?.message || 'Update failed' };
        })),
    ].filter((fn) => typeof fn === 'function');

    return () => disposers.forEach((dispose) => dispose());
  }, []);

  if (state.phase === 'idle') return null;

  const ver = state.version ? `v${state.version}` : '';
  const download = () => {
    window.electronAPI?.downloadUpdate?.();
    setState((s) => ({ ...s, phase: 'downloading', percent: 0 }));
  };
  const restart = () => window.electronAPI?.installUpdate?.();

  // ── Error — click to retry ───────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={download}
        title={`Update failed: ${state.error}. Click to retry.`}
        className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-red-500 to-rose-500 hover:shadow-lg transition-all"
      >
        <AlertTriangle className="w-4 h-4" />
        Retry
      </motion.button>
    );
  }

  // ── Downloaded — restart to install ──────────────────────────────────────
  if (state.phase === 'downloaded') {
    return (
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={restart}
        title={`Update ${ver} is ready — click to restart and install`}
        className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-emerald-500 to-green-500 hover:shadow-lg transition-all"
      >
        <RefreshCw className="w-4 h-4" />
        Restart
      </motion.button>
    );
  }

  // ── Available / Downloading ──────────────────────────────────────────────
  const downloading = state.phase === 'downloading';
  return (
    <>
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={downloading ? undefined : download}
        disabled={downloading}
        title={downloading ? `Downloading update ${ver}… ${state.percent}%` : `Update ${ver} available — click to download`}
        className="relative flex items-center gap-1.5 px-3 py-2 rounded-xl font-semibold text-sm text-white bg-gradient-to-r from-blue-500 to-indigo-500 hover:shadow-lg transition-all disabled:cursor-default"
      >
        <Download className={`w-4 h-4 ${downloading ? 'animate-pulse' : ''}`} />
        {downloading ? `${state.percent}%` : 'Update'}
        {!downloading && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-white" />
        )}
      </motion.button>

      {/* Thin progress bar pinned to the bottom of the dashboard header.
          Relies on the <header> being position:relative. */}
      {downloading && (
        <div className="absolute left-0 right-0 bottom-0 h-1 bg-blue-900/20 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-150"
            style={{ width: `${state.percent}%` }}
          />
        </div>
      )}
    </>
  );
}
