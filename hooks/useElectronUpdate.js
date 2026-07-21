"use client";

import { useEffect, useState, useCallback } from "react";

// Shared Electron auto-update state machine — mirrors DashboardUpdateButton so
// any screen (e.g. the maintenance blocker) can offer an update + restart.
// No-ops safely in the browser / static-export prerender where the Electron
// bridge is absent, so `phase` simply stays 'idle' and callers render nothing.
export default function useElectronUpdate() {
  const [phase, setPhase]     = useState("idle"); // idle|available|downloading|downloaded|error
  const [percent, setPercent] = useState(0);
  const [version, setVersion] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.electronAPI) return;
    const disposers = [];
    disposers.push(
      window.electronAPI.onUpdateAvailable?.((info) => {
        setVersion(info?.version || null);
        setPhase((p) => (p === "downloading" || p === "downloaded" ? p : "available"));
      })
    );
    disposers.push(
      window.electronAPI.onUpdateDownloadProgress?.((p) => {
        setPercent(Math.round(p?.percent || 0));
        setPhase("downloading");
      })
    );
    disposers.push(
      window.electronAPI.onUpdateDownloaded?.((info) => {
        setVersion(info?.version || null);
        setPercent(100);
        setPhase("downloaded");
      })
    );
    disposers.push(
      window.electronAPI.onUpdateError?.(() =>
        setPhase((p) => (p === "idle" ? "idle" : "error"))
      )
    );
    return () => disposers.forEach((d) => { try { d && d(); } catch {} });
  }, []);

  const download = useCallback(() => {
    setPhase("downloading");
    window.electronAPI?.downloadUpdate?.();
  }, []);

  const restart = useCallback(() => {
    window.electronAPI?.installUpdate?.();
  }, []);

  // 'available' fires as soon as an update exists; everything past idle means
  // there is something to act on.
  return { phase, percent, version, download, restart, hasUpdate: phase !== "idle" };
}
