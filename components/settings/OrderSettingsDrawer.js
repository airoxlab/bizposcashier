'use client'

import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, X } from 'lucide-react'
import { PosSettingsPanel } from '../../app/settings/pos-settings/page'

// Slide-in panel that lets a cashier open/change POS & Order Settings without
// leaving the order they're building (cart, table, customer, etc. all stay put).
// Reuses PosSettingsPanel as-is — same load/save/refresh logic as the full
// Settings page, so a save here applies instantly everywhere (cacheManager
// re-derives the pos_* localStorage keys + dispatches the events the order
// pages already listen for).
export default function OrderSettingsDrawer({ isOpen, onClose, isDark, classes }) {
  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[9997] flex justify-end">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Panel — slides in from the right */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className={`relative h-full w-[820px] max-w-[92vw] ${isDark ? 'bg-gray-900' : 'bg-gray-50'} shadow-2xl flex flex-col`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`flex items-center justify-between px-3 py-2.5 ${classes.border} border-b ${classes.card} flex-shrink-0`}>
              <motion.button
                whileHover={{ x: 2 }}
                whileTap={{ scale: 0.98 }}
                onClick={onClose}
                className={`flex items-center ${classes.textSecondary} hover:${classes.textPrimary} transition-colors group`}
              >
                <div className={`w-8 h-8 rounded-full ${classes.button} group-hover:${classes.shadow} group-hover:shadow-sm flex items-center justify-center mr-3 transition-colors`}>
                  <ArrowRight className="w-4 h-4" />
                </div>
                <span className="font-medium text-sm">Back to Order</span>
              </motion.button>

              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-200 text-gray-500'}`}
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body — the real Settings panel, unchanged */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              <PosSettingsPanel />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body
  )
}
