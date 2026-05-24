"use client";

import { useEffect, useState } from "react";
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
  const abs      = Math.abs(ms);
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

// Top banner: subscription invoice status + trial countdown + expiry warnings.
// Full-screen lock (past grace) is handled by TrialExpiredGate.
export default function TrialBanner() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("planmanager:loaded", refresh);
    // 60-second interval — minute-level precision is enough.
    const id = setInterval(refresh, 60000);
    return () => {
      window.removeEventListener("planmanager:loaded", refresh);
      clearInterval(id);
    };
  }, []);

  if (!planManager.isLoaded) return null;
  const plan = planManager.getPlan();
  if (!plan) return null;

  const state = planManager.getSubscriptionState();
  if (state === "app_blocked") return null; // TrialExpiredGate covers this

  let tone, message;

  // ── Invoice-based banner (takes priority) ────────────────────────────────
  const invoice = planManager.getInvoice();
  if (invoice && invoice.status === "unpaid") {
    const amtStr = invoice.amount != null
      ? ` — Rs ${Number(invoice.amount).toLocaleString()}`
      : "";

    if (invoice.due_at) {
      // Exact-timestamp mode: live countdown in minutes / seconds.
      const ms = new Date(invoice.due_at) - Date.now();
      const dur = fmtDuration(ms);

      if (ms < 0) {
        tone = "red";
        message = `Invoice overdue by ${dur}${amtStr}. Please clear immediately.`;
      } else if (ms < 3600000) {
        // under 1 hour — urgent
        tone = "red";
        message = `Invoice due in ${dur}${amtStr}. Please clear your payment now.`;
      } else if (ms < 86400000) {
        // under 24 hours
        tone = "amber";
        message = `Invoice due in ${dur}${amtStr}. Please clear your payment.`;
      } else {
        tone = "teal";
        message = `Invoice due in ${dur}${amtStr}.`;
      }
    } else {
      // Date-only mode: day-level precision (existing behaviour).
      const days = planManager.getInvoiceDueDays();
      if (days !== null) {
        if (days < 0) {
          const overdue = Math.abs(days);
          tone = "red";
          message = `Invoice overdue by ${overdue} day${overdue !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}. Please clear immediately.`;
        } else if (days === 0) {
          tone = "red";
          message = `Invoice due today (${fmtDate(invoice.due_date)})${amtStr}. Please clear your payment.`;
        } else if (days <= 5) {
          tone = "amber";
          message = `Invoice due in ${days} day${days !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}. Please clear your payment.`;
        } else {
          tone = "teal";
          message = `Invoice due in ${days} day${days !== 1 ? "s" : ""} (${fmtDate(invoice.due_date)})${amtStr}.`;
        }
      }
    }
  }

  // ── Fallback: plan-level trial / expiry warnings ──────────────────────────
  if (!tone) {
    if (state === "order_blocked") {
      const hard = planManager.getHardLockDate();
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
      const days = planManager.daysUntilExpiry();
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
