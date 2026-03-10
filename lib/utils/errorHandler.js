// // lib/utils/errorHandler.js
// export class PrinterErrorHandler {
//   constructor() {
//     this.retryAttempts = 3
//     this.retryDelay = 1000 // 1 second
//   }

//   // Retry function with exponential backoff
//   async retryOperation(operation, maxAttempts = this.retryAttempts) {
//     let lastError
    
//     for (let attempt = 1; attempt <= maxAttempts; attempt++) {
//       try {
//         const result = await operation()
//         if (result.success) return result
        
//         lastError = new Error(result.message || 'Operation failed')
        
//         if (attempt < maxAttempts) {
//           await this.delay(this.retryDelay * attempt) // Exponential backoff
//         }
//       } catch (error) {
//         lastError = error
        
//         if (attempt < maxAttempts) {
//           await this.delay(this.retryDelay * attempt)
//         }
//       }
//     }
    
//     throw lastError
//   }

//   // Delay helper
//   delay(ms) {
//     return new Promise(resolve => setTimeout(resolve, ms))
//   }

//   // Handle printer errors with user-friendly messages
//   handlePrinterError(error, printerName = 'Printer') {
//     const errorMap = {
//       'ECONNREFUSED': `${printerName} is not responding. Check if it's powered on and connected.`,
//       'ETIMEDOUT': `${printerName} connection timed out. Check network connection.`,
//       'ENOTFOUND': `Cannot find ${printerName} at this IP address. Verify printer settings.`,
//       'ECONNRESET': `${printerName} connection was reset. Try again.`,
//       'EPIPE': `${printerName} disconnected unexpectedly. Check printer status.`
//     }

//     const errorCode = error.code || error.message?.split(':')[0]
//     return errorMap[errorCode] || `${printerName} error: ${error.message}`
//   }

//   // Validate printer configuration
//   validatePrinterConfig(printer) {
//     const errors = []

//     if (!printer.ip_address) errors.push('IP address is required')
//     if (!printer.port || printer.port < 1 || printer.port > 65535) {
//       errors.push('Valid port number (1-65535) is required')
//     }
//     if (!printer.name?.trim()) errors.push('Printer name is required')

//     // IP address validation
//     const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
//     if (printer.ip_address && !ipRegex.test(printer.ip_address)) {
//       errors.push('Invalid IP address format')
//     }

//     return {
//       isValid: errors.length === 0,
//       errors
//     }
//   }

//   // Get printer health status
//   async getPrinterHealth(printer) {
//     try {
//       const response = await fetch('/api/printer/test', {
//         method: 'POST',
//         headers: { 'Content-Type': 'application/json' },
//         body: JSON.stringify({
//           ip: printer.ip_address,
//           port: printer.port,
//           timeout: 5000
//         })
//       })

//       const result = await response.json()
      
//       return {
//         healthy: result.overall,
//         responseTime: result.tested?.find(t => t.success)?.responseTime,
//         status: result.overall ? 'online' : 'offline',
//         message: result.message,
//         lastChecked: new Date().toISOString()
//       }
//     } catch (error) {
//       return {
//         healthy: false,
//         responseTime: null,
//         status: 'error',
//         message: this.handlePrinterError(error, printer.name),
//         lastChecked: new Date().toISOString()
//       }
//     }
//   }
// }

// export const printerErrorHandler = new PrinterErrorHandler()
// export default printerErrorHandler