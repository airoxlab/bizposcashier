// lib/networkPrintListener.js
// Global singleton service for network print listening
// Follows the webOrderNotificationManager pattern for background listening

import { supabase } from './supabaseClient'
import { printerManager } from './printerManager'

class NetworkPrintListener {
  constructor() {
    this.channel = null
    this.userId = null
    this.isServer = false
  }

  setUserId(userId) {
    this.userId = userId
  }

  setIsServer(isServer) {
    this.isServer = isServer
    console.log(`🌐 Network Print Listener: Server mode ${isServer ? 'ON' : 'OFF'}`)
  }

  async startListening(onPrintJob = null) {
    if (!this.userId) {
      console.error('❌ Cannot start network print listener: User ID not set')
      return
    }

    if (!this.isServer) {
      console.log('⏹️ Not a print server, skipping listener setup')
      return
    }

    if (this.channel) {
      console.log('⚠️ Network print listener already active')
      return
    }

    console.log('🌐 Starting network print listener as SERVER')

    this.channel = supabase
      .channel(`print-jobs-${this.userId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'network_print_jobs',
        filter: `user_id=eq.${this.userId}`,
      }, async (payload) => {
        console.log('📥 Received print job:', payload.new.id)
        await this.processPrintJob(payload.new)

        if (onPrintJob) {
          onPrintJob(payload.new)
        }
      })
      .subscribe()
  }

  async processPrintJob(printJob) {
    try {
      console.log('🖨️ Processing print job:', printJob.id)

      // Parse print data (handle both string and object)
      const printData = typeof printJob.print_data === 'string'
        ? JSON.parse(printJob.print_data)
        : printJob.print_data

      console.log('📦 Print data structure:', {
        hasOrderData: !!printData.orderData,
        hasUserProfile: !!printData.userProfile,
        hasPrinterConfig: !!printData.printerConfig,
        printType: printData.printType || 'receipt'
      })

      // Get printer configuration
      printerManager.setUserId(this.userId)
      const printerConfig = await printerManager.getPrinterForPrinting()

      if (!printerConfig) {
        throw new Error('No printer configured on this server')
      }

      // Determine print type and execute
      const printType = printData.printType || 'receipt'
      let result

      if (printType === 'kitchen_token') {
        console.log('🍳 Printing kitchen token...')
        result = await printerManager.printKitchenToken(
          printData.orderData,
          printData.userProfile,
          printerConfig
        )
      } else {
        console.log('🧾 Printing receipt...')
        result = await printerManager.printReceipt(
          printData.orderData,
          printData.userProfile,
          printerConfig
        )
      }

      // Update job status
      if (result.success) {
        console.log('✅ Print job completed successfully')
        await supabase
          .from('network_print_jobs')
          .update({
            status: 'completed',
            completed_at: new Date().toISOString()
          })
          .eq('id', printJob.id)
      } else {
        console.error('❌ Print job failed:', result.error)
        await supabase
          .from('network_print_jobs')
          .update({
            status: 'failed',
            error_message: result.error || 'Unknown error'
          })
          .eq('id', printJob.id)
      }
    } catch (error) {
      console.error('❌ Error processing print job:', error)
      await supabase
        .from('network_print_jobs')
        .update({
          status: 'failed',
          error_message: error.message
        })
        .eq('id', printJob.id)
    }
  }

  stopListening() {
    if (this.channel) {
      supabase.removeChannel(this.channel)
      this.channel = null
      console.log('🔌 Disconnected from print jobs channel')
    }
  }

  // Check if currently listening
  isListening() {
    return this.channel !== null
  }
}

export const networkPrintListener = new NetworkPrintListener()
