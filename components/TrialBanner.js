"use client";

import { useEffect, useState } from "react";
import { planManager } from "@/lib/planManager";

function getTimeLeft(expires_at) {
  if (!expires_at) return null;
  const diff = new Date(expires_at) - new Date();
  if (diff <= 0) return { label: "Trial Expired", expired: true };
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins < 60)  return { label: `${mins} minute${mins !== 1 ? "s" : ""} left`, expired: false, urgent: true };
  if (hours < 24) return { label: `${hours} hour${hours !== 1 ? "s" : ""} left`, expired: false, urgent: true };
  return               { label: `${days} day${days !== 1 ? "s" : ""} left`,  expired: false, urgent: days <= 3 };
}

export default function TrialBanner() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    const check = () => {
      const plan = planManager.getPlan();
      if (!plan || plan.status !== "trial") { setInfo(null); return; }
      setInfo({ expires_at: plan.expires_at, planName: plan.name });
    };

    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, []);

  if (!info) return null;

  const tl = getTimeLeft(info.expires_at);
  if (!tl) return null;

  return (
    <div className={`w-full px-4 py-2 flex items-center justify-center gap-3 text-xs font-medium z-50 ${
      tl.expired
        ? "bg-red-500 text-white"
        : tl.urgent
        ? "bg-amber-500 text-white"
        : "bg-teal-600 text-white"
    }`}>
      <span className="w-1.5 h-1.5 rounded-full bg-white/70 animate-pulse flex-shrink-0" />
      <span>
        {tl.expired
          ? `Your ${info.planName} trial has expired. Contact support to continue.`
          : `Trial — ${tl.label} on your ${info.planName} plan.`}
      </span>
      {!tl.expired && (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/20">
          TRIAL
        </span>
      )}
    </div>
  );
}