'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Trash2, X } from 'lucide-react'
import themeManager from '../../lib/themeManager'

export default function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed?',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  type = 'danger', // 'danger', 'warning', 'info'
  isLoading = false
}) {
  const themeClasses = themeManager.getClasses()

  const typeStyles = {
    danger: {
      icon: Trash2,
      iconBg: 'bg-red-100 dark:bg-red-900/30',
      iconColor: 'text-red-600 dark:text-red-400',
      confirmBg: 'bg-red-600 hover:bg-red-700',
      confirmText: 'text-white'
    },
    warning: {
      icon: AlertTriangle,
      iconBg: 'bg-amber-100 dark:bg-amber-900/30',
      iconColor: 'text-amber-600 dark:text-amber-400',
      confirmBg: 'bg-amber-600 hover:bg-amber-700',
      confirmText: 'text-white'
    },
    info: {
      icon: AlertTriangle,
      iconBg: 'bg-blue-100 dark:bg-blue-900/30',
      iconColor: 'text-blue-600 dark:text-blue-400',
      confirmBg: 'bg-blue-600 hover:bg-blue-700',
      confirmText: 'text-white'
    }
  }

  const style = typeStyles[type] || typeStyles.danger
  const IconComponent = style.icon

  const handleConfirm = async () => {
    if (onConfirm) {
      await onConfirm()
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
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
            className={`relative w-full max-w-sm ${themeClasses.modal} rounded-2xl ${themeClasses.shadow} overflow-hidden`}
          >
            {/* Close button */}
            <button
              onClick={onClose}
              disabled={isLoading}
              className={`absolute top-4 right-4 p-1.5 rounded-lg transition-colors ${themeClasses.hover} disabled:opacity-50`}
            >
              <X className={`w-4 h-4 ${themeManager.getIconColor('secondary')}`} />
            </button>

            {/* Content */}
            <div className="p-6 pt-8 text-center">
              {/* Icon */}
              <div className={`mx-auto w-14 h-14 rounded-full ${style.iconBg} flex items-center justify-center mb-4`}>
                <IconComponent className={`w-7 h-7 ${style.iconColor}`} />
              </div>

              {/* Title */}
              <h3 className={`text-lg font-semibold ${themeClasses.textPrimary} mb-2`}>
                {title}
              </h3>

              {/* Message */}
              <p className={`text-sm ${themeClasses.textSecondary} mb-6`}>
                {message}
              </p>

              {/* Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onClose}
                  disabled={isLoading}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors
                    ${themeClasses.border} border ${themeClasses.textSecondary} ${themeClasses.hover}
                    disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {cancelText}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className={`flex-1 px-4 py-2.5 rounded-xl font-medium transition-colors
                    ${style.confirmBg} ${style.confirmText}
                    disabled:opacity-50 disabled:cursor-not-allowed
                    flex items-center justify-center gap-2`}
                >
                  {isLoading ? (
                    <>
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    confirmText
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
