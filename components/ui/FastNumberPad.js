'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Plus, Delete, Phone } from 'lucide-react'
import themeManager from '../../lib/themeManager'

export default function FastNumberPad({ value, onChange, onSubmit }) {
  const numbers = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['+', '0', 'del']
  ]

  // Theme management
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [activeKey, setActiveKey] = useState(null)

  const handlePress = (key) => {
    if (key === 'del') {
      onChange(value.slice(0, -1))
    } else if (key === '+') {
      if (!value.startsWith('+')) {
        onChange('+' + value)
      }
    } else {
      onChange(value + key)
    }
  }

  const handleSubmit = () => {
    if (value) {
      onSubmit()
    }
  }

  // Global keyboard support
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        handlePress(e.key)
        setActiveKey(e.key)
      } else if (e.key === '+') {
        handlePress('+')
        setActiveKey('+')
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        handlePress('del')
        setActiveKey('del')
      } else if (e.key === 'Enter') {
        handleSubmit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [value])

  // Reset activeKey quickly for animation
  useEffect(() => {
    if (activeKey) {
      const timeout = setTimeout(() => setActiveKey(null), 200)
      return () => clearTimeout(timeout)
    }
  }, [activeKey])

  return (
    <div className="w-full max-w-xs mx-auto">
      {/* Display */}
      <div
        className={`mb-6 p-4 ${themeClasses.card} rounded-2xl border-2 ${themeClasses.border} 
        focus-within:border-blue-500 transition-colors`}
      >
        <div className="text-center">
          <Phone className="w-8 h-8 text-blue-600 mx-auto mb-2" />
          <div
            className={`text-2xl font-mono ${themeClasses.textPrimary} min-h-[2rem] tracking-wider break-all`}
          >
            {value || (
              <span className={`${themeClasses.textSecondary} text-lg`}>
                Enter phone number
              </span>
            )}
          </div>
          <div className={`text-xs ${themeClasses.textSecondary} mt-1`}>
            {value ? `${value.length} digits` : 'Start typing...'}
          </div>
        </div>
      </div>

      {/* Number Grid */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {numbers.flat().map((key) => (
          <motion.button
            key={key}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            animate={activeKey === key ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.2 }}
            onClick={() => handlePress(key)}
            className={`
              h-14 rounded-2xl font-bold text-xl transition-all duration-100 shadow-sm
              ${key === 'del' 
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-red-200' 
                : key === '+' 
                ? 'bg-green-500 hover:bg-green-600 text-white shadow-green-200'
                : `${themeClasses.card} ${themeClasses.hover} ${themeClasses.textPrimary} border-2 ${themeClasses.border} hover:border-blue-300`
              }
            `}
          >
            {key === 'del' ? (
              <Delete className="w-6 h-6 mx-auto" />
            ) : key === '+' ? (
              <Plus className="w-6 h-6 mx-auto" />
            ) : (
              key
            )}
          </motion.button>
        ))}
      </div>

      {/* Action Buttons */}
      <div className="space-y-3">
        <motion.button
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.99 }}
          onClick={handleSubmit}
          disabled={!value || value.length < 10}
          className={`w-full py-4 font-bold rounded-2xl transition-all duration-150 shadow-lg ${
            !value || value.length < 10
              ? `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-400 text-gray-500'} cursor-not-allowed`
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {!value
            ? 'Enter Phone Number'
            : value.length < 10
            ? `Need ${10 - value.length} more digits`
            : 'Continue'}
        </motion.button>

        {value && (
          <motion.button
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onChange('')}
            className={`w-full py-3 ${themeClasses.button} font-semibold rounded-2xl transition-all duration-150`}
          >
            Clear All
          </motion.button>
        )}
      </div>

      {/* Keyboard Hint */}
      <div className="mt-4 text-center">
        <p className={`text-xs ${themeClasses.textSecondary}`}>
          💡 You can also use your keyboard to type
        </p>
      </div>
    </div>
  )
}
