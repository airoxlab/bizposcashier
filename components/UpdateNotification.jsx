'use client';

import { useEffect, useState } from 'react';
import { Download, RefreshCw, AlertTriangle, X } from 'lucide-react';
import { isAutoUpdateEnabled } from '../lib/updatePrefs';

// Thin, screen-fixed banner for app updates. The Electron main process never
// downloads on its own — when a release is found this banner either downloads
// automatically (if the user enabled "Automatic Updates" in Settings) or waits
// for the user to click "Download". The restart/install is always the user's
// choice. Renders nothing in the browser or when there is no update.
export default function UpdateNotification() {
  const [state, setState] = useState({
    phase: 'idle',     // idle | available | downloading | downloaded | error
    version: null,
    percent: 0,
    transferred: 0,
    total: 0,
    speed: 0,
    error: null,
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.electronAPI) return;

    const disposers = [
      window.electronAPI.onUpdateAvailable((d) =>
        setState(s => {
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
        setState(s => (s.phase === 'downloaded' ? s : {
          ...s,
          phase: 'downloading',
          percent: Math.round(d?.percent || 0),
          transferred: d?.transferred || 0,
          total: d?.total || 0,
          speed: d?.bytesPerSecond || 0,
        }))),

      window.electronAPI.onUpdateDownloaded((d) =>
        setState(s => ({ ...s, phase: 'downloaded', version: d?.version || s.version, percent: 100 }))),

      window.electronAPI.onUpdateError((d) =>
        setState(s => {
          if (s.phase === 'downloaded') return s;
          const msg = (d?.message || '').toLowerCase();
          // "No published versions on GitHub" just means there's nothing to update — not a real error.
          if (msg.includes('no published versions') || msg.includes('latest.yml') || msg.includes('no releases')) return s;
          return { ...s, phase: 'error', error: d?.message || 'Update failed' };
        })),
    ].filter(fn => typeof fn === 'function');

    return () => disposers.forEach(dispose => dispose());
  }, []);

  const fmt = (b) => {
    if (!b) return '0 MB';
    const mb = b / (1024 * 1024);
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb.toFixed(1)} MB`;
  };

  const download = () => {
    window.electronAPI?.downloadUpdate?.();
    setState(s => ({ ...s, phase: 'downloading', percent: 0 }));
  };
  const restart = () => window.electronAPI?.installUpdate?.();
  const dismiss = () => setState(s => ({ ...s, phase: 'idle' }));

  if (state.phase === 'idle') return null;

  const ver = state.version ? `v${state.version}` : '';

  // ── Error — dismissible ──────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="fixed top-0 inset-x-0 z-[9998] flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm shadow-md">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 truncate">Update failed: {state.error}</span>
        <button onClick={dismiss} className="p-1 rounded hover:bg-white/20 transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Available — waiting for the user to start the download ───────────────
  if (state.phase === 'available') {
    return (
      <div className="fixed top-0 inset-x-0 z-[9998] flex items-center gap-3 px-4 py-2 bg-blue-600 text-white text-sm shadow-md">
        <Download className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 truncate">
          <strong>Update {ver} available.</strong>{' '}
          <span className="text-white/80">Download it whenever you have a moment.</span>
        </span>
        <button
          onClick={download}
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white text-blue-700 font-semibold hover:bg-blue-50 transition-colors"
        >
          Download
        </button>
        <button onClick={dismiss} className="p-1 rounded hover:bg-white/20 transition-colors" title="Remind me later">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // ── Downloaded — persistent until the cashier restarts ───────────────────
  if (state.phase === 'downloaded') {
    return (
      <div className="fixed top-0 inset-x-0 z-[9998] flex items-center gap-3 px-4 py-2 bg-emerald-600 text-white text-sm shadow-md">
        <RefreshCw className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 truncate">
          <strong>Update {ver} is ready.</strong>{' '}
          <span className="text-white/80">Restart to install — you can finish your current sale first.</span>
        </span>
        <button
          onClick={restart}
          className="flex-shrink-0 px-3 py-1 rounded-md bg-white text-emerald-700 font-semibold hover:bg-emerald-50 transition-colors"
        >
          Update &amp; Restart
        </button>
      </div>
    );
  }

  // ── Downloading — thin progress bar ──────────────────────────────────────
  return (
    <div className="fixed top-0 inset-x-0 z-[9998] bg-blue-600 text-white text-xs shadow-md">
      <div className="flex items-center gap-2 px-4 py-1.5">
        <Download className="w-3.5 h-3.5 flex-shrink-0 animate-pulse" />
        <span className="flex-1 truncate">
          Downloading update {ver} — {state.percent}%
          <span className="text-white/70">
            {' '}· {fmt(state.transferred)} / {fmt(state.total)} · {fmt(state.speed)}/s
          </span>
        </span>
      </div>
      {/* thin progress line */}
      <div className="h-0.5 bg-blue-900/50 overflow-hidden">
        <div
          className="h-full bg-white transition-all duration-300"
          style={{ width: `${state.percent}%` }}
        />
      </div>
    </div>
  );
}
