'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, CheckCircle, TrendingUp, Star, Phone,
  MessageSquare, Users, Crown, Zap, Building2,
  Calendar, ShieldCheck, PhoneCall, Clock, Sparkles,
  Mail, HelpCircle, Award, Activity
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { planManager } from '../../lib/planManager'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'

const PLAN_DEFS = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 'PKR 4,999',
    tagline: 'For new shops getting started',
    icon: Zap,
    gradient: 'from-emerald-400 to-teal-500',
    ring: 'ring-emerald-400/40',
    badgeBg: 'bg-emerald-500',
    iconColor: 'text-emerald-500',
    darkIconBg: 'bg-emerald-500/15',
    lightIconBg: 'bg-emerald-50',
    features: [
      'Walk-in, Takeaway & Dine-in',
      'Delivery orders',
      'Rider management',
      'Petty cash tracking',
      'Billing & split payments',
      'Full expense tracking',
      'Reports & analytics',
      'Thermal printing',
      'Offline mode',
      '1 Admin + 1 Cashier',
    ],
  },
  {
    slug: 'growth',
    name: 'Growth',
    price: 'PKR 9,999',
    tagline: 'Scale your operations',
    icon: Star,
    gradient: 'from-blue-500 to-indigo-600',
    ring: 'ring-blue-400/40',
    badgeBg: 'bg-blue-500',
    iconColor: 'text-blue-500',
    darkIconBg: 'bg-blue-500/15',
    lightIconBg: 'bg-blue-50',
    popular: true,
    features: [
      'Everything in Starter',
      'Loyalty points & redemption',
      'Customer credit ledger',
      'KDS (Kitchen Display)',
      'WhatsApp receipts',
      'Inventory & stock history',
      'Purchase orders & suppliers',
      'Marketing module',
      'Staff permissions & audit logs',
      'Up to 10 cashiers',
    ],
  },
  {
    slug: 'business',
    name: 'Business',
    price: 'PKR 14,999',
    tagline: 'Multi-branch enterprises',
    icon: Building2,
    gradient: 'from-violet-500 to-purple-600',
    ring: 'ring-violet-400/40',
    badgeBg: 'bg-violet-500',
    iconColor: 'text-violet-500',
    darkIconBg: 'bg-violet-500/15',
    lightIconBg: 'bg-violet-50',
    features: [
      'Everything in Growth',
      'Multi-branch support',
      'Payroll system',
      'Advanced analytics',
      'Tablet ordering',
      'Customer website',
      'Unlimited staff',
      'All add-ons included',
    ],
  },
]

export default function PlanPage() {
  const router = useRouter()
  const [isDark, setIsDark] = useState(false)
  const [plan, setPlan]     = useState(null)
  const [planSlug, setPlanSlug] = useState('starter')
  const [status, setStatus] = useState('active')
  const [isExpired, setIsExpired] = useState(false)
  const [cashierLimit, setCashierLimit] = useState(0)

  useEffect(() => {
    if (!authManager.isLoggedIn()) { router.push('/'); return }
    themeManager.applyTheme()
    setIsDark(themeManager.isDark())

    const load = () => {
      setPlan(planManager.getPlan())
      setPlanSlug(planManager.getPlanSlug())
      setStatus(planManager.getStatus())
      setIsExpired(planManager.isExpired())
      const lim = planManager.getLimit('max_cashiers')
      setCashierLimit(lim === Infinity ? '∞' : lim)
    }

    if (planManager.isLoaded) { load() }
    else { window.addEventListener('planmanager:loaded', load) }
    return () => window.removeEventListener('planmanager:loaded', load)
  }, [router])

  const expiresText = plan?.expires_at
    ? new Date(plan.expires_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const startedText = plan?.started_at
    ? new Date(plan.started_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })
    : null

  const daysRemaining = plan?.expires_at
    ? Math.max(0, Math.ceil((new Date(plan.expires_at) - new Date()) / (1000 * 60 * 60 * 24)))
    : null

  const statusBadge = isExpired
    ? { label: 'Expired',  cls: isDark ? 'bg-red-500/15 text-red-400 border-red-500/30' : 'bg-red-50 text-red-600 border-red-200' }
    : status === 'trial'
    ? { label: 'Trial',    cls: isDark ? 'bg-amber-500/15 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-600 border-amber-200' }
    : { label: 'Active',   cls: isDark ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-600 border-emerald-200' }

  const currentDef = PLAN_DEFS.find(p => p.slug === planSlug) || PLAN_DEFS[0]
  const PlanIcon = currentDef.icon

  const card  = isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'
  const text  = isDark ? 'text-white' : 'text-gray-900'
  const muted = isDark ? 'text-gray-400' : 'text-gray-500'
  const divider = isDark ? 'border-gray-700' : 'border-gray-100'
  const subtleBg = isDark ? 'bg-gray-800/40' : 'bg-gray-50'

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>

      {/* ── Header ── */}
      <div className={`sticky top-0 z-10 border-b ${isDark ? 'bg-gray-900/95 border-gray-800' : 'bg-white/95 border-gray-200'} backdrop-blur-sm`}>
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push('/dashboard')}
            className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-colors ${isDark ? 'border-gray-700 hover:bg-gray-800 text-gray-400 hover:text-white' : 'border-gray-200 hover:bg-gray-100 text-gray-500 hover:text-gray-900'}`}
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex-1">
            <h1 className={`text-base font-bold leading-tight ${text}`}>Plan & Billing</h1>
            <p className={`text-xs ${muted}`}>Your subscription & features</p>
          </div>
          <span className={`hidden sm:inline-flex px-3 py-1 rounded-full border text-xs font-semibold ${statusBadge.cls}`}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-6">

        {/* ── Hero: Current plan + Quick stats sidebar ── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

          {/* Current plan card (spans 2 cols on desktop) */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className={`lg:col-span-2 rounded-2xl border overflow-hidden ${card}`}
          >
            {/* Gradient banner */}
            <div className={`relative bg-gradient-to-r ${currentDef.gradient} px-6 py-6 overflow-hidden`}>
              <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10 blur-2xl" />
              <div className="absolute -right-12 -bottom-12 w-48 h-48 rounded-full bg-white/10 blur-3xl" />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center ring-1 ring-white/30">
                    <PlanIcon className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="text-white/80 text-xs font-semibold uppercase tracking-wider">Current Plan</p>
                    <p className="text-white text-3xl font-bold leading-tight">{plan?.name || 'Starter'}</p>
                    <p className="text-white/80 text-xs mt-0.5">{currentDef.tagline}</p>
                  </div>
                </div>
                <span className={`sm:hidden px-3 py-1 rounded-full border text-xs font-semibold ${statusBadge.cls}`}>
                  {statusBadge.label}
                </span>
              </div>
            </div>

            {/* Plan details row */}
            <div className={`px-6 py-5 grid grid-cols-2 sm:grid-cols-4 gap-4 border-t ${divider}`}>
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-semibold ${muted}`}>Monthly Price</p>
                <p className={`text-lg font-bold mt-1 ${text}`}>
                  {plan ? `PKR ${Number(plan.price_monthly).toLocaleString()}` : 'PKR 4,999'}
                </p>
              </div>
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-semibold ${muted}`}>Cashier Limit</p>
                <p className={`text-lg font-bold mt-1 ${text}`}>
                  {cashierLimit} <span className={`text-xs font-normal ${muted}`}>{cashierLimit !== '∞' && cashierLimit <= 1 ? 'seat' : 'seats'}</span>
                </p>
              </div>
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-semibold ${muted}`}>Started</p>
                <p className={`text-lg font-bold mt-1 ${text}`}>{startedText || '—'}</p>
              </div>
              <div>
                <p className={`text-[11px] uppercase tracking-wider font-semibold ${muted}`}>{isExpired ? 'Expired On' : 'Renews On'}</p>
                <p className={`text-lg font-bold mt-1 ${isExpired ? 'text-red-500' : text}`}>{expiresText || '—'}</p>
              </div>
            </div>

            {/* Plan benefits preview */}
            <div className={`px-6 py-5 border-t ${divider}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-semibold uppercase tracking-widest ${muted}`}>What's included</p>
                <div className={`flex items-center gap-1.5 text-xs font-semibold ${currentDef.iconColor}`}>
                  <Sparkles className="w-3.5 h-3.5" />
                  {currentDef.features.length} features
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                {currentDef.features.map(f => (
                  <div key={f} className="flex items-start gap-2">
                    <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${currentDef.iconColor}`} />
                    <span className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-700'}`}>{f}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Sidebar — quick stats */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
            className="space-y-4"
          >
            {/* Days remaining */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-semibold uppercase tracking-wider ${muted}`}>Days Remaining</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-amber-500/20' : 'bg-amber-50'}`}>
                  <Clock className="w-4 h-4 text-amber-500" />
                </div>
              </div>
              <p className={`text-3xl font-bold ${isExpired ? 'text-red-500' : text}`}>
                {daysRemaining !== null ? daysRemaining : '∞'}
                <span className={`text-sm font-normal ml-1 ${muted}`}>days</span>
              </p>
              {expiresText && (
                <p className={`text-xs mt-1 ${muted}`}>
                  {isExpired ? `Expired on ${expiresText}` : `Until ${expiresText}`}
                </p>
              )}
              {!expiresText && (
                <p className={`text-xs mt-1 ${muted}`}>No expiry date set</p>
              )}
            </div>

            {/* Cashier seats */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-semibold uppercase tracking-wider ${muted}`}>Cashier Seats</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-purple-500/20' : 'bg-purple-50'}`}>
                  <Users className="w-4 h-4 text-purple-500" />
                </div>
              </div>
              <p className={`text-3xl font-bold ${text}`}>
                {cashierLimit}
                <span className={`text-sm font-normal ml-1 ${muted}`}>{cashierLimit !== '∞' && cashierLimit <= 1 ? 'seat' : 'seats'}</span>
              </p>
              <p className={`text-xs mt-1 ${muted}`}>Included with {plan?.name || 'Starter'}</p>
            </div>

            {/* Status */}
            <div className={`rounded-2xl border p-5 ${card}`}>
              <div className="flex items-center justify-between mb-3">
                <p className={`text-xs font-semibold uppercase tracking-wider ${muted}`}>Status</p>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-50'}`}>
                  <Activity className="w-4 h-4 text-emerald-500" />
                </div>
              </div>
              <p className={`text-2xl font-bold ${text}`}>{statusBadge.label}</p>
              <p className={`text-xs mt-1 ${muted}`}>
                {isExpired ? 'Renew to continue' : status === 'trial' ? 'Trial period active' : 'Subscription active'}
              </p>
            </div>
          </motion.div>
        </div>

        {/* ── Plan comparison ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-widest ${muted}`}>Compare Plans</p>
              <h2 className={`text-xl font-bold mt-0.5 ${text}`}>Choose what fits your business</h2>
            </div>
            <div className={`hidden sm:flex items-center gap-1.5 text-xs ${muted}`}>
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              All plans include offline mode
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {PLAN_DEFS.map((p, i) => {
              const isCurrent = p.slug === planSlug
              const Icon = p.icon
              return (
                <motion.div
                  key={p.slug}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 + i * 0.06 }}
                  className={`relative rounded-2xl border flex flex-col transition-all ${
                    isCurrent
                      ? `ring-2 ${p.ring} ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'} shadow-xl`
                      : `${isDark ? 'bg-gray-800/60 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-300'} hover:shadow-md`
                  }`}
                >
                  {p.popular && !isCurrent && (
                    <span className={`absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full ${p.badgeBg} text-white uppercase tracking-wide shadow-sm`}>
                      Popular
                    </span>
                  )}
                  {isCurrent && (
                    <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full bg-purple-500 text-white uppercase tracking-wide shadow-sm">
                      Your Plan
                    </span>
                  )}

                  {/* Card header */}
                  <div className={`px-6 pt-7 pb-5 border-b ${divider} text-center`}>
                    <div className={`w-12 h-12 rounded-2xl mx-auto mb-3 flex items-center justify-center bg-gradient-to-br ${p.gradient} shadow-lg`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <p className={`font-bold text-lg ${text}`}>{p.name}</p>
                    <p className={`text-xs mt-0.5 ${muted}`}>{p.tagline}</p>
                    <p className={`text-2xl font-extrabold mt-3 ${text}`}>
                      {p.price}
                      <span className={`text-xs font-normal ml-0.5 ${muted}`}>/mo</span>
                    </p>
                  </div>

                  {/* Features */}
                  <ul className="flex-1 px-6 py-5 space-y-2.5">
                    {p.features.map(f => (
                      <li key={f} className="flex items-start gap-2.5">
                        <CheckCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${p.iconColor}`} />
                        <span className={`text-sm leading-relaxed ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Footer */}
                  <div className="px-6 pb-5 pt-2">
                    {isCurrent ? (
                      <div className={`flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-semibold ${isDark ? 'bg-purple-500/20 text-purple-300' : 'bg-purple-100 text-purple-700'}`}>
                        <ShieldCheck className="w-4 h-4" />
                        Active Plan
                      </div>
                    ) : (
                      <div className={`flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-xl font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                        <TrendingUp className="w-4 h-4" />
                        Upgrade to {p.name}
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </div>
        </motion.div>

        {/* ── Help / Contact section ── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <div className="flex items-end justify-between mb-4">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-widest ${muted}`}>Need a hand?</p>
              <h2 className={`text-xl font-bold mt-0.5 ${text}`}>Get help upgrading or with billing</h2>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Call */}
            <a
              href="tel:+923001234567"
              className={`group rounded-2xl border p-5 flex items-center gap-4 transition-all ${isDark ? 'bg-gray-800 border-gray-700 hover:border-purple-500/50' : 'bg-white border-gray-200 hover:border-purple-300 hover:shadow-md'}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'} group-hover:scale-105 transition-transform`}>
                <PhoneCall className="w-5 h-5 text-purple-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${text}`}>Call Us</p>
                <p className={`text-xs ${muted} truncate`}>+92 300 123 4567</p>
              </div>
              <ArrowLeft className={`w-4 h-4 rotate-180 ${muted} group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all`} />
            </a>

            {/* WhatsApp */}
            <a
              href="https://wa.me/923001234567"
              target="_blank"
              rel="noopener noreferrer"
              className={`group rounded-2xl border p-5 flex items-center gap-4 transition-all ${isDark ? 'bg-gray-800 border-gray-700 hover:border-green-500/50' : 'bg-white border-gray-200 hover:border-green-300 hover:shadow-md'}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-green-500/20' : 'bg-green-100'} group-hover:scale-105 transition-transform`}>
                <MessageSquare className="w-5 h-5 text-green-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${text}`}>WhatsApp</p>
                <p className={`text-xs ${muted} truncate`}>Chat with support</p>
              </div>
              <ArrowLeft className={`w-4 h-4 rotate-180 ${muted} group-hover:text-green-500 group-hover:translate-x-0.5 transition-all`} />
            </a>

            {/* Email */}
            <a
              href="mailto:support@bizpos.pk"
              className={`group rounded-2xl border p-5 flex items-center gap-4 transition-all ${isDark ? 'bg-gray-800 border-gray-700 hover:border-blue-500/50' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'}`}
            >
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-blue-500/20' : 'bg-blue-100'} group-hover:scale-105 transition-transform`}>
                <Mail className="w-5 h-5 text-blue-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`font-bold text-sm ${text}`}>Email</p>
                <p className={`text-xs ${muted} truncate`}>support@bizpos.pk</p>
              </div>
              <ArrowLeft className={`w-4 h-4 rotate-180 ${muted} group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all`} />
            </a>
          </div>

          {/* Upgrade banner */}
          <div className={`mt-5 rounded-2xl border p-5 ${isDark ? 'bg-gradient-to-r from-purple-500/10 to-blue-500/10 border-purple-500/20' : 'bg-gradient-to-r from-purple-50 to-blue-50 border-purple-100'}`}>
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-purple-500/20' : 'bg-purple-100'}`}>
                <Crown className="w-6 h-6 text-purple-500" />
              </div>
              <div className="flex-1 text-center sm:text-left">
                <p className={`font-bold ${text}`}>Ready to unlock more features?</p>
                <p className={`text-xs mt-0.5 ${muted}`}>Contact our support team to upgrade your plan or add extra cashier accounts.</p>
              </div>
              <a
                href="https://wa.me/923001234567"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-purple-500 to-blue-500 hover:from-purple-600 hover:to-blue-600 text-white shadow-lg shadow-purple-500/20 transition-all hover:shadow-xl hover:shadow-purple-500/30"
              >
                <Sparkles className="w-4 h-4" />
                Upgrade Plan
              </a>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  )
}
