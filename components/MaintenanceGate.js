"use client";

import { useEffect, useState } from "react";
import { Wrench, Clock, RefreshCw, Download, Loader2, AlertTriangle } from "lucide-react";
import { platformNotices } from "@/lib/platformNotices";
import useElectronUpdate from "@/hooks/useElectronUpdate";

function fmt(dt) {
  if (!dt) return null;
  return new Date(dt).toLocaleString("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

// Full-screen lock shown while the super-admin has a maintenance notice live for
// the cashier app. Reads the shared platformNotices singleton (polls every 60s),
// so the lock lifts on its own once maintenance ends. Fails open when offline /
// unreachable so the POS is never locked by a stale block.
export default function MaintenanceGate({ children }) {
  const [maint, setMaint] = useState(() =>
    platformNotices.isLoaded ? platformNotices.getMaintenance() : null
  );
  const upd = useElectronUpdate();

  useEffect(() => {
    platformNotices.start();
    const sync = () => setMaint(platformNotices.getMaintenance());
    sync();
    window.addEventListener("platformnotices:loaded", sync);
    return () => window.removeEventListener("platformnotices:loaded", sync);
  }, []);

  if (!maint) return <>{children}</>;

  const back = fmt(maint.ends_at);

  return (
    <div className="fixed inset-0 z-[9999] min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-20 h-20 rounded-2xl bg-white/10 flex items-center justify-center mb-6 ring-1 ring-white/15">
        <Wrench className="w-9 h-9 text-amber-300" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
        {maint.title || "Under Maintenance"}
      </h1>

      <p className="mt-3 text-slate-300 max-w-md leading-relaxed">{maint.message}</p>

      {back && (
        <div className="mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 ring-1 ring-white/15 text-sm text-slate-200">
          <Clock className="w-4 h-4 text-amber-300" />
          Expected back by <span className="font-semibold text-white">{back}</span>
        </div>
      )}

      {/* Software update — shown when the desktop app has a newer version ready */}
      {upd.hasUpdate && (
        <div className="mt-7 flex flex-col items-center gap-2">
          {upd.phase === "downloaded" ? (
            <button
              onClick={upd.restart}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-semibold shadow-lg shadow-emerald-500/25 transition-colors"
            >
              <RefreshCw className="w-4 h-4" /> Update ready — Restart now
            </button>
          ) : upd.phase === "downloading" ? (
            <button
              disabled
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500/80 text-white text-sm font-semibold cursor-wait"
            >
              <Loader2 className="w-4 h-4 animate-spin" /> Downloading update… {upd.percent}%
            </button>
          ) : upd.phase === "error" ? (
            <button
              onClick={upd.download}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold shadow-lg shadow-amber-500/25 transition-colors"
            >
              <AlertTriangle className="w-4 h-4" /> Update failed — Retry
            </button>
          ) : (
            <button
              onClick={upd.download}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-blue-500 hover:bg-blue-600 text-white text-sm font-semibold shadow-lg shadow-blue-500/25 transition-colors"
            >
              <Download className="w-4 h-4" /> Update available — Download &amp; install
            </button>
          )}
          <p className="text-[11px] text-slate-500">
            {upd.version ? `Version ${upd.version} is ready.` : "A new version of the software is available."}
          </p>
        </div>
      )}

      <button
        onClick={() => window.location.reload()}
        className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-sm font-medium ring-1 ring-white/15 transition-colors"
      >
        <RefreshCw className="w-4 h-4" /> Check again
      </button>

      <p className="mt-10 text-xs text-slate-500">Powered by BizPOS</p>
    </div>
  );
}
