'use client'

import { motion } from 'framer-motion'
import { Smartphone, Clock } from 'lucide-react'
import themeManager from '../../../lib/themeManager'

export function MobilePanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  return (
    <motion.div
      key="mobile"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-xl p-8`}>
        <div className="text-center py-12">
          <div className="flex justify-center mb-6">
            <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
              isDark ? 'bg-gradient-to-br from-purple-900/30 to-pink-900/30' : 'bg-gradient-to-br from-purple-100 to-pink-100'
            }`}>
              <Smartphone className={`w-12 h-12 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
            </div>
          </div>

          <h3 className={`text-2xl font-bold ${classes.textPrimary} mb-3`}>Mobile App Integration</h3>

          <div className="inline-flex items-center px-4 py-2 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-sm font-semibold mb-6">
            <Clock className="w-4 h-4 mr-2" />
            Coming Soon
          </div>

          <p className={`${classes.textSecondary} leading-relaxed max-w-md mx-auto mb-8`}>
            We&apos;re working on an amazing mobile app experience that will allow you to manage your POS system on the go.
            Stay tuned for updates!
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-2xl mx-auto">
            {[
              { title: 'Real-time Sync', desc: 'Instant data synchronization across devices' },
              { title: 'Order Management', desc: 'Manage orders from anywhere' },
              { title: 'Sales Analytics', desc: 'View reports and insights on mobile' },
              { title: 'Notifications', desc: 'Get instant alerts for new orders' },
            ].map((feature, index) => (
              <div
                key={index}
                className={`p-4 rounded-xl border ${
                  isDark ? 'bg-gray-800/50 border-gray-700' : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="flex items-start space-x-3">
                  <div className={`w-2 h-2 rounded-full mt-2 ${isDark ? 'bg-purple-400' : 'bg-purple-600'}`} />
                  <div className="text-left flex-1">
                    <p className={`font-semibold text-sm ${classes.textPrimary}`}>{feature.title}</p>
                    <p className={`text-xs ${classes.textSecondary} mt-1`}>{feature.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
