// Printer status management utility
export class PrinterStatusManager {
  constructor() {
    this.statusCache = new Map()
    this.cacheTimeout = 30000 // 30 seconds
  }

  // Get cached printer status
  getCachedStatus(printerId) {
    const cached = this.statusCache.get(printerId)
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.status
    }
    return null
  }

  // Set printer status in cache
  setCachedStatus(printerId, status) {
    this.statusCache.set(printerId, {
      status,
      timestamp: Date.now()
    })
  }

  // Test printer connection with caching
  async testPrinterConnection(printer) {
    const cached = this.getCachedStatus(printer.id)
    if (cached) return cached

    try {
      const response = await fetch('/api/printer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: printer.ip_address,
          port: printer.port,
          timeout: 3000
        })
      })

      const result = await response.json()
      const status = {
        success: result.overall,
        message: result.message,
        responseTime: result.tested?.find(t => t.success)?.responseTime || null,
        lastChecked: new Date().toISOString()
      }

      this.setCachedStatus(printer.id, status)
      return status

    } catch (error) {
      const status = {
        success: false,
        message: 'Connection test failed: ' + error.message,
        responseTime: null,
        lastChecked: new Date().toISOString()
      }

      this.setCachedStatus(printer.id, status)
      return status
    }
  }

  // Get default printer with connection test
  async getDefaultPrinter() {
    try {
      const response = await fetch('/api/printer/get-default-printer')
      const result = await response.json()

      if (response.ok && result.printer) {
        // Test the printer connection
        const status = await this.testPrinterConnection(result.printer)
        return {
          printer: result.printer,
          status,
          isDefault: result.printer.is_default,
          message: result.message
        }
      }

      return {
        printer: null,
        status: { success: false, message: result.error || 'No printer found' },
        isDefault: false,
        message: result.error
      }

    } catch (error) {
      return {
        printer: null,
        status: { success: false, message: 'Failed to get printer: ' + error.message },
        isDefault: false,
        message: error.message
      }
    }
  }

  // Send print job to printer
  async printReceipt(orderData, userProfile) {
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
      return {
        success: false,
        message: 'Print request failed: ' + error.message,
        printer: null
      }
    }
  }

  // Clear status cache
  clearCache() {
    this.statusCache.clear()
  }

  // Get all cached statuses
  getAllCachedStatuses() {
    const statuses = {}
    for (const [printerId, cached] of this.statusCache.entries()) {
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        statuses[printerId] = cached.status
      }
    }
    return statuses
  }
}

// Singleton instance
export const printerStatusManager = new PrinterStatusManager()
export default printerStatusManager