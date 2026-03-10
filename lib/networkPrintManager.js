// lib/networkPrintManager.js
// Manages network printing - sending print jobs to remote terminals

import { supabase } from './supabaseClient'

class NetworkPrintManager {
  constructor() {
    this.sharePrinterMode = false
    this.isServer = false
    this.loadSettings()
  }

  // Load settings from localStorage
  loadSettings() {
    if (typeof window === 'undefined') return

    const shareModeStr = localStorage.getItem('share_printer_mode')
    const isServerStr = localStorage.getItem('is_print_server')

    this.sharePrinterMode = shareModeStr === 'true'
    this.isServer = isServerStr === 'true'
  }

  // Check if we should send to network (share mode ON and server mode OFF)
  shouldUseNetwork() {
    this.loadSettings() // Reload settings in case they changed
    return this.sharePrinterMode && !this.isServer
  }

  // Check if this terminal is a print server (only needs "I am Server" ON)
  isPrintServer() {
    this.loadSettings()
    return this.isServer
  }

  /**
   * Send print job to network
   * @param {Object} printData - The receipt print data
   * @param {String} userId - The user ID
   * @returns {Promise<Object>} Result with success status
   */
  async sendPrintJobToNetwork(printData, userId) {
    try {
      console.log('🌐 Sending print job to network...')

      // Insert print job into database (will trigger realtime event)
      const { data, error } = await supabase
        .from('network_print_jobs')
        .insert({
          user_id: userId,
          print_data: printData,
          status: 'pending'
        })
        .select()
        .single()

      if (error) {
        console.error('❌ Failed to send print job:', error)
        return {
          success: false,
          error: error.message
        }
      }

      console.log('✅ Print job sent to network:', data.id)

      // Wait a bit for server to process (optional - could poll for status)
      await new Promise(resolve => setTimeout(resolve, 2000))

      // Check if job was completed
      const { data: jobStatus } = await supabase
        .from('network_print_jobs')
        .select('status, error_message')
        .eq('id', data.id)
        .single()

      if (jobStatus?.status === 'completed') {
        console.log('✅ Print job completed by server')
        return { success: true }
      } else if (jobStatus?.status === 'failed') {
        console.error('❌ Print job failed:', jobStatus.error_message)
        return {
          success: false,
          error: jobStatus.error_message || 'Print job failed on server'
        }
      } else {
        // Still pending/processing
        console.log('⏳ Print job is being processed...')
        return {
          success: true,
          message: 'Print job sent successfully'
        }
      }

    } catch (error) {
      console.error('❌ Network print error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Clean up old print jobs
   * @param {String} userId - The user ID
   */
  async cleanupOldJobs(userId) {
    try {
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

      const { error } = await supabase
        .from('network_print_jobs')
        .delete()
        .eq('user_id', userId)
        .in('status', ['completed', 'failed'])
        .lt('created_at', oneHourAgo)

      if (error) {
        console.error('❌ Failed to cleanup old jobs:', error)
      } else {
        console.log('🗑️ Cleaned up old print jobs')
      }
    } catch (error) {
      console.error('❌ Cleanup error:', error)
    }
  }
}

// Export singleton instance
export const networkPrintManager = new NetworkPrintManager()
