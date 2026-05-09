'use client'

import { motion } from 'framer-motion'
import { CheckCircle, Star, Phone, MessageSquare, TrendingUp, Users } from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { planManager } from '../../../lib/planManager'

const PLAN_DEFS = [
  {
    slug: 'starter',
    name: 'Starter',
    price: 'PKR 4,999',
    color: 'emerald',
    colorClasses: {
      icon: 'text-emerald-500',
    },
    features: [
      'Walk-in, Takeaway & Dine-in',
      'Delivery orders',
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
    popular: true,
    colorClasses: {
      icon: 'text-blue-500',
    },
    features: [
      'Everything in Starter',
      'Loyalty points & redemption',
      'Customer credit ledger',
      'KDS (Kitchen Display)',
      'Rider management',
      'WhatsApp receipts',
      'Inventory & stock history',
      'Purchase orders & suppliers',
      'Staff permissions & audit logs',
      'Up to 10 cashiers',
    ],
  },
  {
    slug: 'business',
    name: 'Business',
    price: 'PKR 14,999',
    colorClasses: {
      icon: 'text-rose-500',
    },
    features: [
      'Everything in Growth',
      'Multi-branch support',
      'Payroll system',
      'Petty cash',
      'Advanced analytics',
      'Tablet ordering',
      'Customer & custom website',
      'Unlimited staff',
      'All add-ons included free',
    ],
  },
]

export function PlanPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const plan = planManager.getPlan()
  const planSlug = planManager.getPlanSlug()
  const status = planManager.getStatus()
  const isExpired = planManager.isExpired()

  const statusColor = isExpired
    ? 'bg-red-100 text-red-700 border-red-200'
    : status === 'trial'
    ? 'bg-amber-100 text-amber-700 border-amber-200'
    : 'bg-green-100 text-green-700 border-green-200'

  const expiresText = plan?.expires_at
    ? `Expires ${new Date(plan.expires_at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'No expiry set'

  return (
    <motion.div
      key="plan"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* Current plan */}
      <div className={`rounded-2xl border-2 p-6 ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <p className={`text-xs font-semibold uppercase tracking-wider mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Current Plan</p>
            <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{plan?.name || 'Starter'}</h2>
            <p className={`text-sm mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{plan?.description || 'For small shops & single counter businesses'}</p>
          </div>
          <div className={`flex-shrink-0 px-3 py-1 rounded-full border text-xs font-semibold ${statusColor}`}>
            {isExpired ? 'Expired' : status === 'trial' ? 'Trial' : 'Active'}
          </div>
        </div>
        <div className={`flex items-center gap-4 pt-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
          <div>
            <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>
              {plan ? `PKR ${plan.price_monthly?.toLocaleString()}` : 'PKR 4,999'}
            </span>
            <span className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>/month</span>
          </div>
          <div className={`ml-auto text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{expiresText}</div>
        </div>
      </div>

      {/* Cashier quota */}
      <div className={`rounded-xl border p-4 ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-gray-900'}`}>Cashier Accounts</p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
              Limit: {planManager.getLimit('max_cashiers') === Infinity ? 'Unlimited' : planManager.getLimit('max_cashiers')} cashier{planManager.getLimit('max_cashiers') !== 1 ? 's' : ''}
            </p>
          </div>
          <div className={`w-10 h-10 rounded-xl ${isDark ? 'bg-purple-900/30' : 'bg-purple-50'} flex items-center justify-center`}>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Compare Plans</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {PLAN_DEFS.map(p => {
            const isCurrent = p.slug === planSlug
            return (
              <div
                key={p.slug}
                className={`relative rounded-xl border p-5 flex flex-col transition-all ${
                  isCurrent
                    ? `${isDark ? 'bg-gray-700/60 border-purple-500' : 'bg-purple-50 border-purple-400'} ring-2 ${isDark ? 'ring-purple-500/40' : 'ring-purple-200'} shadow-md`
                    : isDark ? 'bg-gray-800 border-gray-700 hover:border-gray-600' : 'bg-white border-gray-200 hover:border-gray-300'
                }`}
              >
                {p.popular && !isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full bg-blue-500 text-white uppercase tracking-wider">Popular</span>
                )}
                {isCurrent && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 text-[10px] font-bold px-3 py-0.5 rounded-full bg-purple-500 text-white uppercase tracking-wider">Current</span>
                )}
                <div className="text-center mb-4 pb-4 border-b border-dashed border-gray-200 dark:border-gray-700">
                  <h4 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{p.name}</h4>
                  <div className="mt-2">
                    <span className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{p.price}</span>
                    <span className={`text-xs font-normal ml-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>/mo</span>
                  </div>
                </div>
                <ul className="flex-1 space-y-2 mb-4">
                  {p.features.map(f => (
                    <li key={f} className="flex items-start gap-2">
                      <CheckCircle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${p.colorClasses.icon}`} />
                      <span className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>{f}</span>
                    </li>
                  ))}
                </ul>
                {!isCurrent ? (
                  <div className={`flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg ${isDark ? 'bg-gray-700 text-purple-400' : 'bg-purple-50 text-purple-600'} font-semibold`}>
                    <TrendingUp className="w-3.5 h-3.5" />
                    <span>Upgrade to {p.name}</span>
                  </div>
                ) : (
                  <div className={`flex items-center justify-center gap-1.5 text-xs py-2 rounded-lg ${isDark ? 'bg-purple-900/30 text-purple-300' : 'bg-purple-100 text-purple-700'} font-semibold`}>
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Your Plan</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Contact CTA */}
      <div className={`rounded-xl border p-5 text-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gradient-to-br from-purple-50 to-blue-50 border-purple-200'}`}>
        <Star className={`w-8 h-8 mx-auto mb-2 ${isDark ? 'text-purple-400' : 'text-purple-500'}`} />
        <p className={`font-semibold mb-1 ${isDark ? 'text-white' : 'text-gray-900'}`}>Want to upgrade?</p>
        <p className={`text-xs mb-3 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Contact our support team to upgrade your plan or add extra cashier accounts.</p>
        <div className="flex items-center justify-center gap-2 text-xs">
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
            <Phone className="w-3 h-3 text-purple-500" />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>Call Support</span>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
            <MessageSquare className="w-3 h-3 text-green-500" />
            <span className={isDark ? 'text-gray-300' : 'text-gray-700'}>WhatsApp</span>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
