// lib/utils/printNotifications.js - Complete version
export class PrintNotificationManager {
  constructor() {
    this.activeNotifications = new Map()
    this.soundEnabled = true
  }

  // Play sound based on status
  playStatusSound(status) {
    if (!this.soundEnabled) return

    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)()
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()
      
      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)
      
      // Different sounds for different statuses
      const soundConfig = {
        'printing': { frequency: 800, duration: 0.2 },
        'success': { frequency: 600, duration: 0.3 },
        'error': { frequency: 300, duration: 0.5 },
        'retry': { frequency: 400, duration: 0.3 },
        'fallback': { frequency: 500, duration: 0.4 }
      }
      
      const config = soundConfig[status] || soundConfig.success
      
      oscillator.frequency.setValueAtTime(config.frequency, audioContext.currentTime)
      oscillator.type = 'sine'
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime)
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration)
      
      oscillator.start(audioContext.currentTime)
      oscillator.stop(audioContext.currentTime + config.duration)
      
    } catch (error) {
      console.log('Sound playback failed:', error)
    }
  }

  // Create print notification with enhanced options
  createPrintNotification(type, message, options = {}) {
    const notificationData = {
      type,
      message,
      duration: options.duration || this.getDefaultDuration(type),
      actions: options.actions || [],
      icon: this.getStatusIcon(type),
      timestamp: Date.now()
    }

    if (options.playSound !== false) {
      this.playStatusSound(type)
    }

    return notificationData
  }

  // Get icon for notification type
  getStatusIcon(type) {
    const icons = {
      'printing': '🖨️',
      'success': '✅',
      'error': '❌',
      'retry': '🔄',
      'fallback': '⚠️',
      'offline': '📱'
    }
    return icons[type] || 'ℹ️'
  }

  // Get default duration for different types
  getDefaultDuration(type) {
    const durations = {
      'printing': 0, // Loading notification
      'success': 3000,
      'error': 8000,
      'retry': 5000,
      'fallback': 6000,
      'offline': 5000
    }
    return durations[type] || 4000
  }

  // Toggle sound on/off
  toggleSound() {
    this.soundEnabled = !this.soundEnabled
    return this.soundEnabled
  }
}

// Enhanced print manager with notifications
export class EnhancedPrintManager {
  constructor() {
    this.notifications = new PrintNotificationManager()
    this.retryAttempts = 3
    this.retryDelay = 1000
  }

  // Main print function with full notification support
  async printReceipt(orderData, userProfile, options = {}) {
    let printingNotification = null
    
    try {
      // Show printing notification
      printingNotification = this.notifications.createPrintNotification('printing', 'Sending receipt to printer...', {
        playSound: false
      })
      
      if (options.onNotification) {
        options.onNotification(printingNotification)
      }

      // Attempt to print
      const result = await this.attemptPrint(orderData, userProfile)
      
      // Remove printing notification
      if (options.onRemoveNotification && printingNotification) {
        options.onRemoveNotification(printingNotification)
      }

      if (result.success) {
        // Success notification
        const successNotification = this.notifications.createPrintNotification('success', 
          `Receipt printed on ${result.printer.name}`, {
          duration: 3000
        })
        
        if (options.onNotification) {
          options.onNotification(successNotification)
        }

        return result
      } else {
        // Error notification with actions
        const errorNotification = this.notifications.createPrintNotification('error', 
          result.message, {
          duration: 8000,
          actions: [
            {
              label: 'Retry Print',
              onClick: () => this.printReceipt(orderData, userProfile, options)
            },
            {
              label: 'Browser Print',
              onClick: options.onFallback
            }
          ]
        })
        
        if (options.onNotification) {
          options.onNotification(errorNotification)
        }

        return result
      }

    } catch (error) {
      // Remove printing notification on error
      if (options.onRemoveNotification && printingNotification) {
        options.onRemoveNotification(printingNotification)
      }

      // Show error notification
      const errorNotification = this.notifications.createPrintNotification('error', 
        `Print failed: ${error.message}`, {
        duration: 8000,
        actions: [
          {
            label: 'Browser Print',
            onClick: options.onFallback
          }
        ]
      })
      
      if (options.onNotification) {
        options.onNotification(errorNotification)
      }

      return {
        success: false,
        message: error.message,
        error: error
      }
    }
  }

  // Attempt print with error handling
  async attemptPrint(orderData, userProfile) {
    try {
      const response = await fetch('/api/printer/print-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderData, userProfile })
      })

      const result = await response.json()

      if (response.ok) {
        return {
          success: true,
          message: result.message,
          printer: result.printer
        }
      } else {
        return {
          success: false,
          message: result.message || result.error,
          printer: result.printer
        }
      }

    } catch (error) {
      throw new Error(`Network error: ${error.message}`)
    }
  }
}

export const enhancedPrintManager = new EnhancedPrintManager()
export default enhancedPrintManager