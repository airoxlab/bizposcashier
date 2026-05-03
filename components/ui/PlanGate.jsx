'use client'
// PlanGate — wraps any UI that requires a specific plan feature.
// Usage:
//   <PlanGate feature="kds">          ← full page gate
//   <PlanGate feature="kds" inline>   ← inline upgrade prompt

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Lock, ArrowRight, Zap, Star, Building2 } from 'lucide-react'
import { planManager } from '../../lib/planManager'
import { useRouter } from 'next/navigation'

const PLAN_META = {
  starter:  { icon: Zap,       label: 'Starter',  color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20',  border: 'border-emerald-200 dark:border-emerald-700' },
  growth:   { icon: Star,      label: 'Growth',   color: 'text-blue-500',    bg: 'bg-blue-50 dark:bg-blue-900/20',        border: 'border-blue-200 dark:border-blue-700'       },
  business: { icon: Building2, label: 'Business', color: 'text-rose-500',    bg: 'bg-rose-50 dark:bg-rose-900/20',        border: 'border-rose-200 dark:border-rose-700'       },
}

function UpgradeCard({ featureKey, inline, isDark }) {
  const router = useRouter()
  const reason = planManager.getLockedReason(featureKey)
  const requiredPlanName = reason.replace('Available on ', '').replace(' plan', '').toLowerCase()
  const meta = PLAN_META[requiredPlanName] || PLAN_META.growth
  const PlanIcon = meta.icon

  if (inline) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${meta.bg} ${meta.border} text-sm`}>
        <Lock className={`w-3.5 h-3.5 ${meta.color} flex-shrink-0`} />
        <span className={`${isDark ? 'text-gray-300' : 'text-gray-700'} flex-1`}>{reason}</span>
        <button
          onClick={() => router.push('/settings?tab=plan')}
          className={`${meta.color} font-semibold hover:underline whitespace-nowrap`}
        >
          Upgrade
        </button>
      </div>
    )
  }

  return (
    <div className={`min-h-screen w-full flex items-center justify-center p-6 ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25 }}
        className={`w-full max-w-sm rounded-2xl border shadow-xl p-8 text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
      >
        {/* Lock icon */}
        <div className={`mx-auto w-16 h-16 rounded-2xl ${meta.bg} ${meta.border} border flex items-center justify-center mb-5`}>
          <Lock className={`w-7 h-7 ${meta.color}`} />
        </div>

        <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>
          Feature Locked
        </h2>
        <p className={`text-sm mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{reason}</p>

        {/* Required plan chip */}
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full ${meta.bg} ${meta.border} border mt-2 mb-6`}>
          <PlanIcon className={`w-3.5 h-3.5 ${meta.color}`} />
          <span className={`text-xs font-semibold ${meta.color}`}>{meta.label} Plan</span>
        </div>

        <button
          onClick={() => router.push('/settings?tab=plan')}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold shadow-md hover:shadow-lg transition-all duration-200"
        >
          View Plans & Upgrade
          <ArrowRight className="w-4 h-4" />
        </button>

        <p className={`text-xs mt-4 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
          Contact support to upgrade your plan
        </p>
      </motion.div>
    </div>
  )
}

export default function PlanGate({ feature, children, inline = false, fallback = null }) {
  const [isDark, setIsDark] = useState(false)
  const [ready, setReady]     = useState(planManager.isLoaded)
  const [allowed, setAllowed] = useState(() => planManager.isLoaded && planManager.can(feature))

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains('dark'))
    const recheck = () => {
      setReady(true)
      setAllowed(planManager.can(feature))
    }
    if (planManager.isLoaded) recheck()
    window.addEventListener('planmanager:loaded', recheck)
    return () => window.removeEventListener('planmanager:loaded', recheck)
  }, [feature])

  // Don't render gate UI until plan is loaded — avoids flashing "Locked" on cold login
  if (!ready) return null

  if (allowed) return children

  if (fallback) return fallback

  return <UpgradeCard featureKey={feature} inline={inline} isDark={isDark} />
}

// Lightweight hook for conditional rendering without wrapping
export function usePlanCan(featureKey) {
  const [allowed, setAllowed] = useState(() => planManager.isLoaded && planManager.can(featureKey))
  useEffect(() => {
    const recheck = () => setAllowed(planManager.can(featureKey))
    if (planManager.isLoaded) recheck()
    window.addEventListener('planmanager:loaded', recheck)
    return () => window.removeEventListener('planmanager:loaded', recheck)
  }, [featureKey])
  return allowed
}

// Hook for quota limits
export function usePlanLimit(featureKey) {
  const [limit, setLimit] = useState(() => planManager.isLoaded ? planManager.getLimit(featureKey) : 0)
  useEffect(() => {
    const recheck = () => setLimit(planManager.getLimit(featureKey))
    if (planManager.isLoaded) recheck()
    window.addEventListener('planmanager:loaded', recheck)
    return () => window.removeEventListener('planmanager:loaded', recheck)
  }, [featureKey])
  return limit
}
