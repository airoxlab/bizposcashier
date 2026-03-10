// components/ui/EnhancedModal.js
'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, CheckCircle, Info, AlertCircle } from 'lucide-react'
import { themeManager } from '../../lib/themeManager'

const iconMap = {
  error: AlertTriangle,
  success: CheckCircle,
  info: Info,
  warning: AlertCircle
}

const colorMap = {
  error: 'text-red-600',
  success: 'text-green-600', 
  info: 'text-blue-600',
  warning: 'text-orange-600'
}

const bgColorMap = {
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  warning: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
}

export default function EnhancedModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  type = 'info',
  showCloseButton = true,
  maxWidth = 'max-w-md',
  actions = null
}) {
  const classes = themeManager.getClasses()
  const Icon = iconMap[type]

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
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", duration: 0.3 }}
            className={`relative ${maxWidth} w-full ${classes.modal} rounded-2xl shadow-2xl border ${classes.border} overflow-hidden`}
          >
            {/* Header */}
            {(title || showCloseButton) && (
              <div className={`px-6 py-4 border-b ${classes.border} ${bgColorMap[type]}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    {Icon && (
                      <div className={`w-8 h-8 rounded-full bg-white/20 flex items-center justify-center`}>
                        <Icon className={`w-5 h-5 ${colorMap[type]}`} />
                      </div>
                    )}
                    {title && (
                      <h3 className={`text-lg font-bold ${classes.textPrimary}`}>
                        {title}
                      </h3>
                    )}
                  </div>
                  
                  {showCloseButton && (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={onClose}
                      className={`p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${classes.textSecondary} hover:${classes.textPrimary}`}
                    >
                      <X className="w-5 h-5" />
                    </motion.button>
                  )}
                </div>
              </div>
            )}
            
            {/* Content */}
            <div className="px-6 py-6">
              {children}
            </div>
            
            {/* Actions */}
            {actions && (
              <div className={`px-6 py-4 border-t ${classes.border} bg-gray-50 dark:bg-gray-800`}>
                <div className="flex justify-end space-x-3">
                  {actions}
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

// Error Modal Component
export function ErrorModal({ isOpen, onClose, title = "Error", message, onRetry = null }) {
  const classes = themeManager.getClasses()
  
  const actions = (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClose}
        className={`px-4 py-2 border ${classes.border} ${classes.textSecondary} font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
      >
        Close
      </motion.button>
      {onRetry && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onRetry}
          className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-medium rounded-lg transition-colors"
        >
          Try Again
        </motion.button>
      )}
    </>
  )

  return (
    <EnhancedModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      type="error"
      actions={actions}
    >
      <p className={classes.textSecondary}>{message}</p>
    </EnhancedModal>
  )
}

// Success Modal Component
export function SuccessModal({ isOpen, onClose, title = "Success", message }) {
  const classes = themeManager.getClasses()
  
  const actions = (
    <motion.button
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClose}
      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
    >
      OK
    </motion.button>
  )

  return (
    <EnhancedModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      type="success"
      actions={actions}
    >
      <p className={classes.textSecondary}>{message}</p>
    </EnhancedModal>
  )
}

// Confirmation Modal Component
export function ConfirmationModal({ isOpen, onClose, title = "Confirm Action", message, onConfirm, confirmText = "Confirm", cancelText = "Cancel" }) {
  const classes = themeManager.getClasses()
  
  const actions = (
    <>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onClose}
        className={`px-4 py-2 border ${classes.border} ${classes.textSecondary} font-medium rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
      >
        {cancelText}
      </motion.button>
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={onConfirm}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-colors"
      >
        {confirmText}
      </motion.button>
    </>
  )

  return (
    <EnhancedModal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      type="warning"
      actions={actions}
    >
      <p className={classes.textSecondary}>{message}</p>
    </EnhancedModal>
  )
}