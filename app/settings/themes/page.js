'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { notify } from '../../../components/ui/NotificationSystem'

export function ThemesPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [layoutTheme, setLayoutTheme] = useState(() => {
    if (typeof window === 'undefined') return 'classic'
    const stored = localStorage.getItem('pos_layout_theme')
    return stored === 'classic' || stored === 'modern' ? stored : 'classic'
  })

  const handleLayoutThemeChange = async (theme) => {
    setLayoutTheme(theme)
    const result = await authManager.saveLayoutTheme(theme)
    if (result.success) {
      notify.success('Layout theme saved! Changes apply on next page load.')
    } else {
      notify.error('Failed to save layout preference. Please try again.')
    }
  }

  return (
    <motion.div
      key="themes"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-xl p-5`}>
        <h3 className={`text-sm font-semibold ${classes.textPrimary} mb-1`}>Layout Style</h3>
        <p className={`text-xs ${classes.textSecondary} mb-5`}>
          Select the layout that best fits your workflow. Changes apply on the next page load.
        </p>

        <div className="grid grid-cols-2 gap-4">
          {/* Classic Layout */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleLayoutThemeChange('classic')}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-300 w-full block ${
              layoutTheme === 'classic'
                ? 'border-purple-500 shadow-lg shadow-purple-500/20'
                : isDark ? 'border-gray-700 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {layoutTheme === 'classic' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <div className={`w-full h-36 rounded-lg overflow-hidden mb-3 border ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
              <div className="h-5 bg-gradient-to-r from-purple-600 to-blue-600 flex items-center px-2 gap-1">
                <div className="w-2 h-2 rounded-full bg-white/40" />
                <div className="flex-1 h-1.5 rounded bg-white/20" />
                <div className="w-4 h-1.5 rounded bg-white/30" />
              </div>
              <div className={`flex gap-1.5 p-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className="flex-1 h-10 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-sm bg-white/40" />
                </div>
                <div className="flex-1 h-10 rounded-md bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-sm bg-white/40" />
                </div>
                <div className="flex-1 h-10 rounded-md bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-sm bg-white/40" />
                </div>
              </div>
              <div className={`flex gap-1 px-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                {[...Array(5)].map((_, i) => (
                  <div key={i} className={`flex-1 h-8 rounded ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'} flex flex-col items-center justify-center gap-0.5`}>
                    <div className="w-2.5 h-2.5 rounded-sm bg-purple-400/60" />
                    <div className={`w-4 h-0.5 rounded ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  </div>
                ))}
              </div>
            </div>
            <p className={`text-sm font-semibold ${classes.textPrimary}`}>Classic</p>
            <p className={`text-xs ${classes.textSecondary} mt-0.5`}>Current layout with dashboard cards</p>
          </motion.button>

          {/* Modern Layout */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleLayoutThemeChange('modern')}
            className={`relative p-4 rounded-xl border-2 text-left transition-all duration-300 w-full block ${
              layoutTheme === 'modern'
                ? 'border-purple-500 shadow-lg shadow-purple-500/20'
                : isDark ? 'border-gray-700 hover:border-gray-500' : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            {layoutTheme === 'modern' && (
              <div className="absolute top-3 right-3 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </div>
            )}
            <div className={`w-full h-36 rounded-lg overflow-hidden mb-3 border ${isDark ? 'border-gray-600' : 'border-gray-200'} flex`}>
              <div className="w-9 bg-gradient-to-b from-indigo-900 to-purple-900 flex flex-col pt-1.5 px-1 gap-1">
                <div className="flex justify-between mb-0.5">
                  <div className="w-2.5 h-2.5 rounded bg-white/20" />
                  <div className="w-2.5 h-2.5 rounded bg-white/20" />
                </div>
                <div className="flex flex-col gap-0.5">
                  <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500" />
                  <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-orange-400 to-amber-400 opacity-40" />
                  <div className="w-full h-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 opacity-40" />
                </div>
                <div className="flex-1 flex flex-col gap-0.5 mt-0.5">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className={`w-full h-3.5 rounded ${i === 0 ? 'bg-white/20' : 'bg-white/10'}`} />
                  ))}
                </div>
              </div>
              <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                <div className={`h-5 ${isDark ? 'bg-gray-900' : 'bg-white'} border-b ${isDark ? 'border-gray-700' : 'border-gray-200'} flex items-center justify-center px-1 gap-0.5`}>
                  <div className="h-2.5 px-1.5 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500">
                    <div className="w-4 h-1 mt-0.5 rounded bg-white/60" />
                  </div>
                  <div className={`h-2.5 px-1 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`w-3 h-1 mt-0.5 rounded ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  </div>
                  <div className={`h-2.5 px-1 rounded-full ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                    <div className={`w-3 h-1 mt-0.5 rounded ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                  </div>
                </div>
                <div className="flex-1 p-1 grid grid-cols-3 gap-0.5">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className={`rounded ${isDark ? 'bg-gray-700' : 'bg-white'} border ${isDark ? 'border-gray-600' : 'border-gray-200'} flex items-center justify-center`}>
                      <div className="w-3 h-3 rounded-sm bg-purple-400/40" />
                    </div>
                  ))}
                </div>
              </div>
              <div className={`w-12 flex flex-col border-l ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
                <div className={`h-4 border-b px-1 flex items-center ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`flex-1 h-1 rounded ${isDark ? 'bg-gray-600' : 'bg-gray-300'}`} />
                </div>
                <div className="flex gap-0.5 p-1">
                  <div className={`flex-1 h-3 rounded border border-dashed ${isDark ? 'border-gray-600' : 'border-gray-300'}`} />
                  <div className={`flex-1 h-3 rounded border border-dashed ${isDark ? 'border-gray-600' : 'border-gray-300'}`} />
                </div>
                <div className="flex-1 px-1 space-y-0.5 py-0.5">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className={`h-3 rounded ${isDark ? 'bg-gray-800' : 'bg-gray-100'}`} />
                  ))}
                </div>
                <div className="p-1">
                  <div className="h-3.5 rounded bg-green-600" />
                </div>
              </div>
            </div>
            <p className={`text-sm font-semibold ${classes.textPrimary}`}>Modern</p>
            <p className={`text-xs ${classes.textSecondary} mt-0.5`}>Unified layout with inline customer & order tabs</p>
          </motion.button>
        </div>

        {layoutTheme === 'modern' && (
          <div className={`mt-4 p-3 rounded-lg text-xs ${isDark ? 'bg-blue-900/20 border border-blue-800 text-blue-300' : 'bg-blue-50 border border-blue-200 text-blue-700'}`}>
            Modern layout is selected. Reload the dashboard to apply the new layout.
          </div>
        )}
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
