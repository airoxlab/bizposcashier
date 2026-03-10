// components/ui/NotificationSystem.js
'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  CheckCircle, 
  AlertCircle, 
  XCircle, 
  Info, 
  X,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertTriangle
} from 'lucide-react'

let notificationId = 0

class NotificationManager {
  constructor() {
    this.notifications = []
    this.listeners = []
  }

  addListener(listener) {
    this.listeners.push(listener)
  }

  removeListener(listener) {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  notify() {
    this.listeners.forEach(listener => listener(this.notifications))
  }

  success(message, options = {}) {
    return this.add({
      type: 'success',
      message,
      ...options
    })
  }

  error(message, options = {}) {
    return this.add({
      type: 'error',
      message,
      ...options
    })
  }

  warning(message, options = {}) {
    return this.add({
      type: 'warning',
      message,
      ...options
    })
  }

  info(message, options = {}) {
    return this.add({
      type: 'info',
      message,
      ...options
    })
  }

  loading(message, options = {}) {
    return this.add({
      type: 'loading',
      message,
      duration: 0, // Don't auto-dismiss loading notifications
      ...options
    })
  }

  add(notification) {
    const id = ++notificationId
    const newNotification = {
      id,
      timestamp: Date.now(),
      duration: 4000,
      dismissible: true,
      ...notification
    }

    this.notifications.push(newNotification)
    this.notify()

    // Auto-dismiss if duration is set
    if (newNotification.duration > 0) {
      setTimeout(() => {
        this.remove(id)
      }, newNotification.duration)
    }

    return id
  }

  remove(id) {
    this.notifications = this.notifications.filter(n => n.id !== id)
    this.notify()
  }

  update(id, updates) {
    this.notifications = this.notifications.map(n => 
      n.id === id ? { ...n, ...updates } : n
    )
    this.notify()
  }

  clear() {
    this.notifications = []
    this.notify()
  }

  // Specific notification types for POS system
  cacheLoading() {
    return this.loading('Loading menu data...', {
      icon: RefreshCw,
      className: 'animate-spin'
    })
  }

  cacheReady(stats) {
    return this.success(`Menu loaded: ${stats.categories} categories, ${stats.products} products`, {
      duration: 3000
    })
  }

  cacheError() {
    return this.error('Failed to load menu data. Please check your connection.', {
      duration: 6000,
      action: {
        label: 'Retry',
        onClick: () => window.location.reload()
      }
    })
  }

  offline() {
    return this.warning('Working offline - orders will sync when connection is restored', {
      icon: WifiOff,
      duration: 0,
      persistent: true
    })
  }

  online() {
    // Remove offline notification
    this.notifications = this.notifications.filter(n => !n.persistent)
    this.notify()
    
    return this.success('Connection restored', {
      icon: Wifi,
      duration: 2000
    })
  }

  orderSaved(orderNumber, isOffline = false) {
    if (isOffline) {
      return this.warning(`Order ${orderNumber} saved offline - will sync when online`, {
        duration: 5000
      })
    } else {
      return this.success(`Order ${orderNumber} created successfully`, {
        duration: 3000
      })
    }
  }

  customerError(message) {
    return this.error(message, {
      duration: 4000
    })
  }

  invalidInput(message) {
    return this.warning(message, {
      duration: 3000
    })
  }
}

const notificationManager = new NotificationManager()

// React component for displaying notifications
export default function NotificationSystem() {
  const [notifications, setNotifications] = useState([])

  useEffect(() => {
    const listener = (newNotifications) => {
      setNotifications([...newNotifications])
    }

    notificationManager.addListener(listener)
    return () => notificationManager.removeListener(listener)
  }, [])

  const getNotificationIcon = (type, customIcon) => {
    if (customIcon) return customIcon

    switch (type) {
      case 'success': return CheckCircle
      case 'error': return XCircle
      case 'warning': return AlertTriangle
      case 'info': return Info
      case 'loading': return RefreshCw
      default: return Info
    }
  }

  const getNotificationStyle = (type) => {
    switch (type) {
      case 'success':
        return {
          bg: 'bg-green-50 dark:bg-green-900/20',
          border: 'border-green-200 dark:border-green-800',
          icon: 'text-green-600 dark:text-green-400',
          text: 'text-green-800 dark:text-green-200'
        }
      case 'error':
        return {
          bg: 'bg-red-50 dark:bg-red-900/20',
          border: 'border-red-200 dark:border-red-800',
          icon: 'text-red-600 dark:text-red-400',
          text: 'text-red-800 dark:text-red-200'
        }
      case 'warning':
        return {
          bg: 'bg-yellow-50 dark:bg-yellow-900/20',
          border: 'border-yellow-200 dark:border-yellow-800',
          icon: 'text-yellow-600 dark:text-yellow-400',
          text: 'text-yellow-800 dark:text-yellow-200'
        }
      case 'info':
        return {
          bg: 'bg-blue-50 dark:bg-blue-900/20',
          border: 'border-blue-200 dark:border-blue-800',
          icon: 'text-blue-600 dark:text-blue-400',
          text: 'text-blue-800 dark:text-blue-200'
        }
      case 'loading':
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          icon: 'text-gray-600 dark:text-gray-400',
          text: 'text-gray-800 dark:text-gray-200'
        }
      default:
        return {
          bg: 'bg-gray-50 dark:bg-gray-900/20',
          border: 'border-gray-200 dark:border-gray-800',
          icon: 'text-gray-600 dark:text-gray-400',
          text: 'text-gray-800 dark:text-gray-200'
        }
    }
  }

  return (
    <div className="fixed top-4 right-4 z-[9999] space-y-2 max-w-sm w-full">
      <AnimatePresence>
        {notifications.map((notification) => {
          const Icon = getNotificationIcon(notification.type, notification.icon)
          const styles = getNotificationStyle(notification.type)
          
          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: 300, scale: 0.9 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 300, scale: 0.9 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className={`${styles.bg} ${styles.border} border rounded-lg shadow-lg backdrop-blur-sm`}
            >
              <div className="p-4">
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <Icon className={`h-5 w-5 ${styles.icon} ${notification.className || ''}`} />
                  </div>
                  <div className="ml-3 w-0 flex-1">
                    <p className={`text-sm font-medium ${styles.text}`}>
                      {notification.message}
                    </p>
                    {notification.description && (
                      <p className={`mt-1 text-xs ${styles.text} opacity-75`}>
                        {notification.description}
                      </p>
                    )}
                    {notification.action && (
                      <div className="mt-2">
                        <button
                          onClick={notification.action.onClick}
                          className={`text-xs font-medium ${styles.icon} hover:opacity-75 transition-opacity`}
                        >
                          {notification.action.label}
                        </button>
                      </div>
                    )}
                  </div>
                  {notification.dismissible && (
                    <div className="ml-4 flex-shrink-0">
                      <button
                        onClick={() => notificationManager.remove(notification.id)}
                        className={`inline-flex rounded-md ${styles.text} hover:opacity-75 transition-opacity`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>
    </div>
  )
}

// Export the notification manager for use in other components
export { notificationManager }

// Helper functions to replace alerts
export const notify = {
  success: (message, options) => notificationManager.success(message, options),
  error: (message, options) => notificationManager.error(message, options),
  warning: (message, options) => notificationManager.warning(message, options),
  info: (message, options) => notificationManager.info(message, options),
  loading: (message, options) => notificationManager.loading(message, options),
  
  // POS-specific notifications
  cacheLoading: () => notificationManager.cacheLoading(),
  cacheReady: (stats) => notificationManager.cacheReady(stats),
  cacheError: () => notificationManager.cacheError(),
  offline: () => notificationManager.offline(),
  online: () => notificationManager.online(),
  orderSaved: (orderNumber, isOffline) => notificationManager.orderSaved(orderNumber, isOffline),
  customerError: (message) => notificationManager.customerError(message),
  invalidInput: (message) => notificationManager.invalidInput(message),
  
  // Utility functions
  remove: (id) => notificationManager.remove(id),
  update: (id, updates) => notificationManager.update(id, updates),
  clear: () => notificationManager.clear()
}