"use client";

import { useEffect, useState } from "react";
import { Info, CheckCircle2, AlertTriangle, AlertOctagon, X, ExternalLink } from "lucide-react";
import { platformNotices } from "@/lib/platformNotices";

const DISMISS_KEY = "bizpos_notice_dismissed";

const STYLE = {
  info:     { bg: "bg-blue-600",    icon: Info },
  success:  { bg: "bg-emerald-600", icon: CheckCircle2 },
  warning:  { bg: "bg-amber-500",   icon: AlertTriangle },
  critical: { bg: "bg-red-600",     icon: AlertOctagon },
};

function readDismissed() {
  try { return new Set(JSON.parse(localStorage.getItem(DISMISS_KEY) || "[]")); }
  catch { return new Set(); }
}

// Dismissals are keyed by id + revision so a super-admin "Re-show" (revision
// bump) makes a previously-dismissed banner reappear.
const keyOf = (b) => `${b.id}:${b.revision ?? 0}`;

// Stacked announcement bars driven by the shared platformNotices singleton.
// The singleton is started by MaintenanceGate; this component only reads.
export default function PlatformBanner() {
  const [banners, setBanners]     = useState([]);
  const [dismissed, setDismissed] = useState(() =>
    typeof window !== "undefined" ? readDismissed() : new Set()
  );

  useEffect(() => {
    const sync = () => setBanners(platformNotices.getBanners());
    sync();
    window.addEventListener("platformnotices:loaded", sync);
    return () => window.removeEventListener("platformnotices:loaded", sync);
  }, []);

  const dismiss = (key) => {
    const next = new Set(dismissed);
    next.add(key);
    setDismissed(next);
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify([...next])); } catch {}
  };

  const visible = banners.filter((b) => !dismissed.has(keyOf(b)));
  if (visible.length === 0) return null;

  return (
    <div className="w-full">
      {visible.map((b) => {
        const s = STYLE[b.severity] || STYLE.info;
        const Icon = s.icon;
        return (
          <div key={b.id} className={`w-full px-4 py-2 flex items-center justify-center gap-3 text-xs sm:text-sm font-medium text-white ${s.bg}`}>
            <Icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-center">
              {b.title && <span className="font-bold">{b.title} </span>}
              {b.message}
            </span>
            {b.cta_url && (
              <a
                href={b.cta_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/20 hover:bg-white/30 text-[11px] font-semibold flex-shrink-0 transition-colors"
              >
                {b.cta_label || "Open"} <ExternalLink className="w-3 h-3" />
              </a>
            )}
            {b.dismissible && (
              <button
                onClick={() => dismiss(keyOf(b))}
                className="ml-1 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/20 flex-shrink-0 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
