"use client";

import { useEffect, useState } from "react";
import { Clock, PhoneCall, LogOut, Zap, Check, Star } from "lucide-react";
import { planManager } from "@/lib/planManager";
import { supabase } from "@/lib/supabase";
import { authManager } from "@/lib/authManager";

const PLAN_COLORS = {
  starter:  { ring: "ring-emerald-400", badge: "bg-emerald-500", button: "bg-emerald-500 hover:bg-emerald-600" },
  growth:   { ring: "ring-blue-400",    badge: "bg-blue-500",    button: "bg-blue-500 hover:bg-blue-600",    popular: true },
  business: { ring: "ring-violet-400",  badge: "bg-violet-500",  button: "bg-violet-500 hover:bg-violet-600" },
};

function PlanCard({ plan }) {
  const color = PLAN_COLORS[plan.slug] || PLAN_COLORS.starter;
  return (
    <div className={`relative flex flex-col bg-white rounded-2xl shadow-lg border-2 p-6 ${color.popular ? "ring-2 " + color.ring + " border-transparent scale-105" : "border-gray-100"}`}>
      {color.popular && (
        <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-[11px] font-bold text-white flex items-center gap-1 ${color.badge}`}>
          <Star className="w-3 h-3" /> Most Popular
        </div>
      )}
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{plan.name}</p>
      <div className="flex items-end gap-1 mb-3">
        <span className="text-3xl font-extrabold text-gray-900">
          {plan.price_monthly ? `Rs ${Number(plan.price_monthly).toLocaleString()}` : "Custom"}
        </span>
        {plan.price_monthly && <span className="text-sm text-gray-400 mb-1">/mo</span>}
      </div>
      {plan.description && (
        <p className="text-xs text-gray-500 leading-relaxed">{plan.description}</p>
      )}
    </div>
  );
}

export default function TrialExpiredGate({ children }) {
  const [expired, setExpired] = useState(() =>
    planManager.isLoaded && planManager.getStatus() === "expired"
  );
  const [planInfo, setPlanInfo] = useState(null);
  const [plans, setPlans]       = useState([]);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    const check = () => {
      if (!planManager.isLoaded) return;
      const isExp = planManager.getStatus() === "expired";
      setExpired(isExp);
      if (isExp) setPlanInfo(planManager.getPlan());
    };
    check();
    // Instant check when planManager finishes loading (catches post-login expiry with no flash)
    window.addEventListener("planmanager:loaded", check);
    // Fallback poll every 30s for real-time expiry during active session
    const id = setInterval(check, 30000);
    return () => {
      window.removeEventListener("planmanager:loaded", check);
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!expired) return;
    supabase
      .from("plans")
      .select("id, slug, name, description, price_monthly")
      .order("price_monthly", { ascending: true })
      .then(({ data }) => setPlans(data || []));
  }, [expired]);

  const handleLogout = async () => {
    setLoggingOut(true);
    try { await authManager.logout(); } catch {}
    window.location.href = "/";
  };

  if (!expired) return <>{children}</>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-gray-100 flex flex-col items-center justify-center p-4">
      {/* Icon */}
      <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mb-5 shadow-lg shadow-red-100">
        <Clock className="w-10 h-10 text-red-500" />
      </div>

      {/* Heading */}
      <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">Trial Expired</h1>
      <p className="mt-2 text-gray-500 text-center max-w-sm">
        Your <span className="font-semibold text-gray-700">{planInfo?.name || "trial"}</span> period has ended.
        Upgrade to keep using BizPOS without interruption.
      </p>

      {/* Plan cards */}
      {plans.length > 0 && (
        <div className={`mt-8 grid gap-4 w-full max-w-3xl ${plans.length === 1 ? "max-w-xs" : plans.length === 2 ? "grid-cols-2" : "grid-cols-1 sm:grid-cols-3"}`}>
          {plans.map((p) => <PlanCard key={p.id} plan={p} />)}
        </div>
      )}

      {/* CTAs */}
      <div className="mt-8 flex flex-col sm:flex-row items-center gap-3">
        <a
          href="tel:+923001234567"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gray-900 text-white font-semibold text-sm hover:bg-gray-800 transition-colors shadow-md"
        >
          <PhoneCall className="w-4 h-4" /> Contact Support to Upgrade
        </a>
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-gray-300 text-gray-600 font-semibold text-sm hover:bg-gray-100 transition-colors disabled:opacity-50"
        >
          <LogOut className="w-4 h-4" />
          {loggingOut ? "Logging out…" : "Logout"}
        </button>
      </div>

      <p className="mt-6 text-xs text-gray-400">
        Already upgraded? Log out and log back in to refresh your plan.
      </p>
    </div>
  );
}
