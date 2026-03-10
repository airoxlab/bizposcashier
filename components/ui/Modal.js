'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'
import themeManager from '../../lib/themeManager'

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-md' }) {
  const themeClasses = themeManager.getClasses()

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />

          {/* Modal Content */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', duration: 0.3 }}
            className={`relative w-full ${maxWidth} max-h-[90vh] ${themeClasses.modal} rounded-2xl ${themeClasses.shadow} overflow-hidden flex flex-col`}
          >
            {/* Header */}
            <div
              className={`flex items-center justify-between p-6 border-b ${themeClasses.border} flex-shrink-0`}
            >
              <h3 className={`text-xl font-semibold ${themeClasses.textPrimary}`}>
                {title}
              </h3>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg transition-colors ${themeClasses.hover}`}
              >
                <X className={`w-5 h-5 ${themeManager.getIconColor('secondary')}`} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 overflow-y-auto flex-1">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
