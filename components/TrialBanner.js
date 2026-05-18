"use client";

import { useEffect, useState } from "react";
import { planManager } from "@/lib/planManager";

function fmtDate(d) {
  if (!d) return "";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

function trialTimeLeft(expires_at) {
  if (!expires_at) return null;
  const diff = new Date(expires_at) - new Date();
  if (diff <= 0) return null;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} left`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? "s" : ""} left`;
  return `${days} day${days !== 1 ? "s" : ""} left`;
}

// Top banner: trial countdown + subscription due / expired warnings.
// The full-screen lock (past grace) is handled by TrialExpiredGate.
export default function TrialBanner() {
  const [, setTick] = useState(0);

  useEffect(() => {
    const refresh = () => setTick((t) => t + 1);
    window.addEventListener("planmanager:loaded", refresh);
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
  if (state === "app_blocked") return null; // gate covers this

  let tone, message;

  if (state === "order_blocked") {
    const hard = planManager.getHardLockDate();
    const graceLeft = hard ? Math.max(0, Math.ceil((hard - new Date()) / 86400000)) : 0;
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

  const bg = tone === "red" ? "bg-red-500" : tone === "amber" ? "bg-amber-500" : "bg-teal-600";

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-center gap-3 text-xs font-medium z-50 text-white ${bg}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
