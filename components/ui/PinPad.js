'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Delete, Lock, Shield, Fingerprint, CheckCircle, X } from 'lucide-react'
import themeManager from '../../lib/themeManager'

export default function PinPad({
  pin, onPinChange, onSubmit, error,
  subtitle = '6-digit PIN required to access expenses',
  buttonLabel = 'Access Expenses',
  fpStatus = null,   // null | 'loading' | 'scanning' | 'matched' | 'denied' | 'no_reader'
  fpActive = false,  // true when owner-fingerprint unlock is available on this page
}) {
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

  // Fingerprint-driven header state
  const fpMatched  = fpStatus === 'matched'
  const fpDenied   = fpStatus === 'denied'
  const fpScanning = fpStatus === 'scanning'
  const HeaderIcon = fpMatched ? CheckCircle : fpDenied ? X : fpScanning ? Fingerprint : Shield

  return (
    <div className="w-full max-w-sm mx-auto">
      {/* Header — icon reflects fingerprint status when available */}
      <div className="text-center mb-8">
        <div className="relative w-20 h-20 mx-auto mb-4">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center bg-gradient-to-r transition-all duration-300 ${
            fpMatched ? 'from-emerald-500 to-green-500 shadow-lg shadow-emerald-500/40' :
            fpDenied  ? 'from-red-500 to-pink-500 shadow-lg shadow-red-500/30' :
            fpScanning ? 'from-purple-500 to-blue-500 shadow-lg shadow-purple-500/40 animate-pulse' :
            'from-purple-500 to-blue-500'
          }`}>
            <HeaderIcon className="w-10 h-10 text-white" />
          </div>
          {/* Idle "fingerprint available" badge */}
          {fpActive && !fpMatched && !fpDenied && !fpScanning && (
            <div className={`absolute -bottom-1 -right-1 w-8 h-8 rounded-full ${themeClasses.card} border-2 border-purple-400 flex items-center justify-center shadow-md`}>
              <Fingerprint className="w-4 h-4 text-purple-500" />
            </div>
          )}
        </div>
        <h2 className={`text-2xl font-bold ${themeClasses.textPrimary} mb-2`}>Enter PIN</h2>
        <p className={themeClasses.textSecondary}>{subtitle}</p>

        {/* Fingerprint status line (so the user doesn't have to scroll) */}
        {fpActive && (
          <p className={`mt-2 text-sm font-medium flex items-center justify-center gap-1.5 ${
            fpMatched ? 'text-emerald-600 dark:text-emerald-400' :
            fpDenied  ? 'text-red-600 dark:text-red-400' :
            fpStatus === 'no_reader' ? 'text-amber-600 dark:text-amber-400' :
            'text-purple-600 dark:text-purple-400'
          }`}>
            <Fingerprint className="w-4 h-4" />
            {fpMatched ? 'Owner verified — unlocking…' :
             fpDenied  ? 'Not the owner — try again' :
             fpStatus === 'no_reader' ? 'Fingerprint reader not detected' :
             'Or place the owner’s finger to unlock'}
          </p>
        )}
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
        {buttonLabel}
      </motion.button>
    </div>
  )
}
