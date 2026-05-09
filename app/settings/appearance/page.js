'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sun, Moon, Check } from 'lucide-react'
import themeManager from '../../../lib/themeManager'

export function AppearancePanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const themes = themeManager.getAllThemes()
  const [currentTheme, setCurrentTheme] = useState(() => themeManager.currentTheme || 'light')
  const [isTransitioning, setIsTransitioning] = useState(false)

  const handleThemeChange = (themeName) => {
    if (isTransitioning) return
    setIsTransitioning(true)
    setCurrentTheme(themeName)
    themeManager.setTheme(themeName)
    setTimeout(() => setIsTransitioning(false), 300)
  }

  return (
    <motion.div
      key="appearance"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-xl p-5`}>
        <h3 className={`text-sm font-semibold ${classes.textPrimary} mb-3`}>Color Scheme</h3>
        <div className="grid grid-cols-1 gap-3">
          {Object.entries(themes).map(([themeKey, theme]) => (
            <motion.button
              key={themeKey}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => handleThemeChange(themeKey)}
              disabled={isTransitioning}
              className={`relative p-4 rounded-xl border-2 text-left transition-all duration-300 ${
                themeKey === currentTheme
                  ? 'border-purple-500 shadow-md bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950/60 dark:to-pink-950/60'
                  : `${classes.border} hover:border-purple-300`
              } ${isTransitioning ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`flex items-center justify-center w-10 h-10 rounded-lg ${
                  themeKey === 'light'
                    ? 'bg-gradient-to-br from-yellow-400 to-orange-500'
                    : 'bg-gradient-to-br from-indigo-600 to-purple-700'
                }`}>
                  {themeKey === 'light' ? (
                    <Sun className="w-5 h-5 text-white" />
                  ) : (
                    <Moon className="w-5 h-5 text-white" />
                  )}
                </div>
                <div className="text-left flex-1">
                  <div className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-gray-900'}`}>{theme.name}</div>
                  <div className={`text-xs ${isDark ? 'text-gray-300' : 'text-gray-500'}`}>
                    {themeKey === 'light' ? 'Bright interface' : 'Dark interface'}
                  </div>
                </div>
                {currentTheme === themeKey && (
                  <div className="flex items-center justify-center w-6 h-6 rounded-full bg-purple-500">
                    <Check className="w-4 h-4 text-white" />
                  </div>
                )}
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
