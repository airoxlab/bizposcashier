'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete, Lock, Shield } from 'lucide-react'
import themeManager from '../../lib/themeManager'

export default function PinPad({ pin, onPinChange, onSubmit, error }) {
  const numbers = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del']
  ]

  // Theme management
  const themeClasses = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [activeKey, setActiveKey] = useState(null)

  const handlePress = (key) => {
    if (key === 'del') {
      onPinChange(pin.slice(0, -1))
    } else if (key && pin.length < 6) {
      onPinChange(pin + key)
    }
  }

  const handleSubmit = () => {
    if (pin.length === 6) {
      onSubmit()
    }
  }

  // Keyboard input support
  useEffect(() => {
    const handleKeyDown = (e) => {
      let key = e.key

      if (/^[0-9]$/.test(key)) {
        handlePress(key)
        setActiveKey(key)
      } else if (key === 'Backspace' || key === 'Delete') {
        handlePress('del')
        setActiveKey('del')
      } else if (key === 'Enter') {
        handleSubmit()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [pin])

  // Clear activeKey after short delay
  useEffect(() => {
    if (activeKey) {
      const timeout = setTimeout(() => setActiveKey(null), 200)
      return () => clearTimeout(timeout)
    }
  }, [activeKey])

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-20 h-20 bg-gradient-to-r from-purple-500 to-blue-500 rounded-full flex items-center justify-center mx-auto mb-4">
          <Shield className="w-10 h-10 text-white" />
        </div>
        <h2 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Enter PIN</h2>
        <p className={themeClasses.textSecondary}>6-digit PIN required to access expenses</p>
      </div>

      {/* PIN Display */}
      <div className={`mb-8 p-6 ${themeClasses.card} rounded-2xl border-2 ${themeClasses.border}`}>
        <div className="flex justify-center items-center space-x-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <motion.div
              key={index}
              animate={{ scale: pin.length === index ? [1, 1.2, 1] : 1 }}
              transition={{ duration: 0.2 }}
              className={`w-4 h-4 rounded-full border-2 ${
                index < pin.length
                  ? 'bg-purple-500 border-purple-500'
                  : `bg-transparent ${isDark ? 'border-gray-500' : 'border-gray-300'}`
              }`}
            />
          ))}
        </div>
        {error && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-red-500 text-center text-sm mt-3"
          >
            {error}
          </motion.p>
        )}
      </div>

      {/* Number Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {numbers.flat().map((key, index) => (
          <motion.button
            key={`${key}-${index}`}
            whileHover={{ scale: key ? 1.05 : 1 }}
            whileTap={{ scale: key ? 0.95 : 1 }}
            animate={activeKey === key ? { scale: [1, 1.15, 1] } : {}}
            transition={{ duration: 0.2 }}
            onClick={() => handlePress(key)}
            disabled={!key}
            className={`
              h-16 rounded-2xl font-bold text-2xl transition-all duration-200 flex items-center justify-center
              ${!key 
                ? 'invisible' 
                : key === 'del'
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg' 
                : `${themeClasses.card} ${themeClasses.hover} ${themeClasses.textPrimary} ${themeClasses.shadow} hover:shadow-xl border-2 ${themeClasses.border} hover:border-purple-300`
              }
            `}
          >
            {key === 'del' ? (
              <Delete className="w-6 h-6" />
            ) : (
              key
            )}
          </motion.button>
        ))}
      </div>

      {/* Submit Button */}
      <motion.button
        whileHover={{ scale: pin.length === 6 ? 1.02 : 1 }}
        whileTap={{ scale: pin.length === 6 ? 0.98 : 1 }}
        onClick={handleSubmit}
        disabled={pin.length !== 6}
        className={`w-full py-4 rounded-2xl font-bold text-lg transition-all duration-200 flex items-center justify-center ${
          pin.length === 6
            ? 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white shadow-lg hover:shadow-xl'
            : `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
        }`}
      >
        <Lock className="w-5 h-5 mr-2" />
        Access Expenses
      </motion.button>
    </div>
  )
}
