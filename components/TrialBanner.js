"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { planManager } from "@/lib/planManager";

// Format a date value (ISO timestamp or "YYYY-MM-DD") as local "D Mon" with no UTC shift.
function fmtDate(d) {
  if (!d) return "";
  const s = String(d).split("T")[0];
  const [y, mo, day] = s.split("-").map(Number);
  return new Date(y, mo - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
  });
}

// Format a millisecond duration as human-readable remaining/elapsed time (minutes only).
function fmtDuration(ms) {
  const abs       = Math.abs(ms);
  const totalMins = Math.floor(abs / 60000);
  const days  = Math.floor(totalMins / 1440);
  const hours = Math.floor((totalMins % 1440) / 60);
  const mins  = totalMins % 60;

  if (days >= 1)  return `${days} day${days !== 1 ? "s" : ""}`;
  if (hours >= 1) return `${hours} hr ${mins} min`;
  if (mins >= 1)  return `${mins} min`;
  return "less than a minute";
}

function trialTimeLeft(expires_at) {
  if (!expires_at) return null;
  const ms = new Date(expires_at) - Date.now();
  if (ms <= 0) return null;
  return fmtDuration(ms);
}

// Dashboard-only banner. Snapshot of subscription/invoice state is captured
// once on mount and held stable until the dashboard remounts (login, logout,
// or hard refresh). No polling, no planManager event listeners — the bar
// must not flip values as the user navigates between pages.
export default function TrialBanner() {
  const pathname = usePathname();
  // next.config.js has trailingSlash: true, so production paths end with a
  // slash ("/dashboard/"). Strip it before comparing so dev and prod match.
  const normalized = (pathname || "").replace(/\/+$/, "") || "/";
  const isDashboard = normalized === "/dashboard";

  const [snapshot, setSnapshot] = useState(null);

  useEffect(() => {
    if (!isDashboard) {
      setSnapshot(null);
      return;
    }

    let captured = false;
    const capture = () => {
      if (captured) return;
      if (!planManager.isLoaded) return;
      const plan = planManager.getPlan();
      if (!plan) return;
      captured = true;
      setSnapshot({
        plan,
        state:       planManager.getSubscriptionState(),
        invoice:     planManager.getInvoice?.() ?? null,
        invoiceDays: planManager.getInvoiceDueDays?.() ?? null,
        hard:        planManager.getHardLockDate(),
        days:        planManager.daysUntilExpiry(),
      });
    };

    capture();
    if (captured) return;

    // planManager not ready yet — wait once for the initial load, then capture.
    window.addEventListener("planmanager:loaded", capture);
    return () => window.removeEventListener("planmanager:loaded", capture);
  }, [isDashboard]);

  if (!isDashboard || !snapshot) return null;

  const { plan, state, invoice, invoiceDays, hard, days } = snapshot;
  if (state === "app_blocked") return null; // TrialExpiredGate covers this

  let tone, message;

  // ── Invoice-based banner (takes priority) ────────────────────────────────
  if (invoice && invoice.status === "unpaid") {
    const amtStr = invoice.amount != null
      ? ` — Rs ${Number(invoice.amount).toLocaleString()}`
      : "";

    if (invoice.due_at) {
      const ms  = new Date(invoice.due_at) - Date.now();
      const dur = fmtDuration(ms);

      if (ms < 0) {
        tone = "red";
        message = `Invoice overdue by ${dur}${amtStr}. Please clear immediately.`;
      } else if (ms < 3600000) {
        tone = "red";
        message = `Invoice due in ${dur}${amtStr}. Please clear your payment now.`;
      } else if (ms < 86400000) {
        tone = "amber";
        message = `Invoice due in ${dur}${amtStr}. Please clear your payment.`;
      } else {
        tone = "teal";
        message = `Invoice due in ${dur}${amtStr}.`;
      }
    } else if (invoiceDays !== null) {
      if (invoiceDays < 0) {
        const overdue = Math.abs(invoiceDays);
        tone = "red";
        message = `Invoice overdue by ${overdue} day${overdue !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}. Please clear immediately.`;
      } else if (invoiceDays === 0) {
        tone = "red";
        message = `Invoice due today (${fmtDate(invoice.due_date)})${amtStr}. Please clear your payment.`;
      } else if (invoiceDays <= 5) {
        tone = "amber";
        message = `Invoice due in ${invoiceDays} day${invoiceDays !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}. Please clear your payment.`;
      } else {
        tone = "teal";
        message = `Invoice due in ${invoiceDays} day${invoiceDays !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}.`;
      }
    }
  }

  // ── Fallback: plan-level trial / expiry warnings ──────────────────────────
  if (!tone) {
    if (state === "order_blocked") {
      const graceLeft = hard
        ? Math.max(0, Math.ceil((hard - new Date()) / 86400000))
        : 0;
      tone = "red";
      message = `Your BizPOS subscription has expired — order taking is paused.${
        graceLeft > 0
          ? ` Please renew within ${graceLeft} day${graceLeft !== 1 ? "s" : ""} to avoid a full lockout.`
          : " Please renew now to restore access."
      }`;
    } else if (state === "due_soon") {
      tone = "amber";
      message = `Your BizPOS subscription is due ${
        days != null && days <= 0 ? "today" : `in ${days} day${days !== 1 ? "s" : ""}`
      } (${fmtDate(plan.expires_at)}). Please clear your payment to keep order taking uninterrupted.`;
    } else if (plan.status === "trial") {
      const tl = trialTimeLeft(plan.expires_at);
      if (!tl) return null;
      tone = "teal";
      message = `Trial — ${tl} on your ${plan.name} plan.`;
    } else {
      return null;
    }
  }

  const bg =
    tone === "red"
      ? "bg-red-500"
      : tone === "amber"
      ? "bg-amber-500"
      : "bg-teal-600";

  return (
    <div
      className={`w-screen overflow-hidden px-4 py-2 flex items-center justify-center gap-3 text-xs font-medium z-50 text-white ${bg}`}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse flex-shrink-0" />
      <span className="text-center">{message}</span>
    </div>
  );
}
