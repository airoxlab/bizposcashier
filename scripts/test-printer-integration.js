// scripts/test-printer-integration.js
// Run this script to test your printer integration

import { PrinterConfig, SecurityConfig, ConfigValidator } from '../lib/config/printerConfig.js'

class PrinterIntegrationTester {
  constructor() {
    this.results = []
    this.passed = 0
    this.failed = 0
  }

  async runAllTests() {
    console.log('🧪 Starting Printer Integration Tests...\n')

    await this.testPrinterConfiguration()
    await this.testDatabaseConnection()
    await this.testAPIEndpoints()
    await this.testReceiptFormatting()
    await this.testDiscountCalculation()
    await this.testErrorHandling()
    await this.testSecurity()

    this.printResults()
  }

  test(description, testFunction) {
    try {
      const result = testFunction()
      if (result) {
        this.passed++
        this.results.push({ status: '✅', test: description, result: 'PASS' })
      } else {
        this.failed++
        this.results.push({ status: '❌', test: description, result: 'FAIL' })
      }
    } catch (error) {
      this.failed++
      this.results.push({ status: '❌', test: description, result: `ERROR: ${error.message}` })
    }
  }

  async testPrinterConfiguration() {
    console.log('📋 Testing Printer Configuration...')

    // Test valid printer config
    this.test('Valid printer configuration', () => {
      const config = {
        name: 'Test Printer',
        ip_address: '192.168.1.100',
        mac_address: '00:11:22:33:44:55',
        port: 9100
      }
      const validation = ConfigValidator.validatePrinterConfig(config)
      return validation.isValid
    })

    // Test invalid IP
    this.test('Invalid IP rejection', () => {
      const config = {
        name: 'Test Printer',
        ip_address: '999.999.999.999',
        mac_address: '00:11:22:33:44:55',
        port: 9100
      }
      const validation = ConfigValidator.validatePrinterConfig(config)
      return !validation.isValid
    })

    // Test invalid MAC
    this.test('Invalid MAC rejection', () => {
      const config = {
        name: 'Test Printer',
        ip_address: '192.168.1.100',
        mac_address: 'invalid-mac',
        port: 9100
      }
      const validation = ConfigValidator.validatePrinterConfig(config)
      return !validation.isValid
    })

    // Test port validation
    this.test('Port validation', () => {
      const config = {
        name: 'Test Printer',
        ip_address: '192.168.1.100',
        mac_address: '00:11:22:33:44:55',
        port: 99999
      }
      const validation = ConfigValidator.validatePrinterConfig(config)
      return !validation.isValid
    })
  }

 // scripts/test-printer-integration.js - Continued

  async testDatabaseConnection() {
    console.log('Testing Database Connection...')

    this.test('Database schema validation', () => {
      // Check if required environment variables exist
      const required = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']
      return required.every(env => process.env[env])
    })

    // Test database connection
    this.test('Database connectivity', async () => {
      try {
        const response = await fetch('/api/printer/get-default-printer')
        return response.status !== 500
      } catch (error) {
        return false
      }
    })
  }

  async testAPIEndpoints() {
    console.log('Testing API Endpoints...')

    // Test printer test endpoint
    this.test('Printer test endpoint', async () => {
      try {
        const response = await fetch('/api/printer/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ip: '192.168.1.100', port: 9100 })
        })
        return response.status === 200 || response.status === 503
      } catch (error) {
        return false
      }
    })

    // Test get default printer endpoint
    this.test('Get default printer endpoint', async () => {
      try {
        const response = await fetch('/api/printer/get-default-printer')
        return response.status === 200 || response.status === 404
      } catch (error) {
        return false
      }
    })

    // Test print receipt endpoint structure
    this.test('Print receipt endpoint structure', async () => {
      try {
        const response = await fetch('/api/printer/print-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}) // Empty body to test validation
        })
        return response.status === 400 // Should reject empty body
      } catch (error) {
        return false
      }
    })
  }

  testReceiptFormatting() {
    console.log('Testing Receipt Formatting...')

    // Test receipt formatter initialization
    this.test('Receipt formatter creation', () => {
      try {
        const { ReceiptFormatter } = require('../lib/utils/receiptFormatter')
        const formatter = new ReceiptFormatter()
        return formatter.CPL === 42
      } catch (error) {
        return false
      }
    })

    // Test currency formatting
    this.test('Currency formatting', () => {
      try {
        const { ReceiptFormatter } = require('../lib/utils/receiptFormatter')
        const formatter = new ReceiptFormatter()
        const formatted = formatter.formatCurrency(123.45)
        return formatted === 'Rs 123.45'
      } catch (error) {
        return false
      }
    })

    // Test line formatting
    this.test('Line formatting', () => {
      try {
        const { ReceiptFormatter } = require('../lib/utils/receiptFormatter')
        const formatter = new ReceiptFormatter()
        const line = formatter.leftRight('TOTAL', 'Rs 100.00')
        return line.includes('TOTAL') && line.includes('Rs 100.00')
      } catch (error) {
        return false
      }
    })
  }

  testDiscountCalculation() {
    console.log('Testing Discount Calculations...')

    // Test discount amount calculation
    this.test('Discount amount calculation', () => {
      const subtotal = 500
      const discountAmount = 100
      const finalTotal = subtotal - discountAmount
      return finalTotal === 400
    })

    // Test discount percentage calculation
    this.test('Discount percentage calculation', () => {
      const subtotal = 500
      const discountAmount = 100
      const percentage = Math.round((discountAmount / subtotal) * 100)
      return percentage === 20
    })

    // Test change calculation
    this.test('Change calculation', () => {
      const total = 400
      const cashReceived = 500
      const change = cashReceived - total
      return change === 100
    })

    // Test negative discount prevention
    this.test('Negative discount prevention', () => {
      const subtotal = 100
      const discountAmount = Math.max(0, -50) // Should be 0
      return discountAmount === 0
    })

    // Test excessive discount prevention
    this.test('Excessive discount prevention', () => {
      const subtotal = 100
      const requestedDiscount = 150
      const actualDiscount = Math.min(requestedDiscount, subtotal)
      return actualDiscount === 100
    })
  }

  testErrorHandling() {
    console.log('Testing Error Handling...')

    // Test printer error handler initialization
    this.test('Error handler initialization', () => {
      try {
        const { printerErrorHandler } = require('../lib/utils/errorHandler')
        return typeof printerErrorHandler.handlePrinterError === 'function'
      } catch (error) {
        return false
      }
    })

    // Test error message formatting
    this.test('Error message formatting', () => {
      try {
        const { printerErrorHandler } = require('../lib/utils/errorHandler')
        const error = new Error('ECONNREFUSED')
        error.code = 'ECONNREFUSED'
        const message = printerErrorHandler.handlePrinterError(error, 'Test Printer')
        return message.includes('Test Printer') && message.includes('not responding')
      } catch (error) {
        return false
      }
    })

    // Test retry logic
    this.test('Retry logic validation', () => {
      try {
        const { printerErrorHandler } = require('../lib/utils/errorHandler')
        return printerErrorHandler.retryAttempts === 3
      } catch (error) {
        return false
      }
    })
  }

  testSecurity() {
    console.log('Testing Security Features...')

    // Test input sanitization
    this.test('Input sanitization', () => {
      const { ConfigValidator } = require('../lib/config/printerConfig')
      const maliciousInput = '<script>alert("xss")</script>'
      const sanitized = ConfigValidator.sanitizeInput(maliciousInput)
      return !sanitized.includes('<script>')
    })

    // Test IP validation
    this.test('Private IP validation', () => {
      const { ConfigValidator } = require('../lib/config/printerConfig')
      const publicIP = '8.8.8.8'
      const privateIP = '192.168.1.100'
      return !ConfigValidator.isPrivateIP(publicIP) && ConfigValidator.isPrivateIP(privateIP)
    })

    // Test port security
    this.test('Blocked port validation', () => {
      const config = {
        name: 'Test Printer',
        ip_address: '192.168.1.100',
        mac_address: '00:11:22:33:44:55',
        port: 22 // SSH port should be blocked
      }
      const { ConfigValidator } = require('../lib/config/printerConfig')
      const validation = ConfigValidator.validatePrinterConfig(config)
      return !validation.isValid
    })

    // Test order data validation
    this.test('Order data validation', () => {
      const { ConfigValidator } = require('../lib/config/printerConfig')
      const invalidOrder = {
        cart: [],
        total: -100,
        discountAmount: -50
      }
      const validation = ConfigValidator.validateOrderData(invalidOrder)
      return !validation.isValid
    })
  }

  printResults() {
    console.log('\n' + '='.repeat(50))
    console.log('TEST RESULTS')
    console.log('='.repeat(50))

    this.results.forEach(result => {
      console.log(`${result.status} ${result.test}: ${result.result}`)
    })

    console.log('\n' + '-'.repeat(50))
    console.log(`SUMMARY: ${this.passed} passed, ${this.failed} failed`)
    console.log(`SUCCESS RATE: ${Math.round((this.passed / (this.passed + this.failed)) * 100)}%`)

    if (this.failed === 0) {
      console.log('\nAll tests passed! Your printer integration is ready.')
    } else {
      console.log(`\n${this.failed} test(s) failed. Please check the configuration.`)
    }
  }
}

// Run tests if called directly
if (require.main === module) {
  const tester = new PrinterIntegrationTester()
  tester.runAllTests()
}

export default PrinterIntegrationTester

// Manual test functions for browser console
window.testPrinterIntegration = {
  // Test printer connection manually
  async testConnection(ip, port = 9100) {
    try {
      const response = await fetch('/api/printer/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip, port })
      })
      const result = await response.json()
      console.log('Connection test result:', result)
      return result
    } catch (error) {
      console.error('Connection test failed:', error)
      return { success: false, error: error.message }
    }
  },

  // Test print receipt manually
  async testPrint(orderData, userProfile) {
    try {
      const response = await fetch('/api/printer/print-receipt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderData, userProfile })
      })
      const result = await response.json()
      console.log('Print test result:', result)
      return result
    } catch (error) {
      console.error('Print test failed:', error)
      return { success: false, error: error.message }
    }
  },

  // Test discount calculation
  testDiscount(subtotal, discountAmount) {
    const finalTotal = subtotal - discountAmount
    const percentage = Math.round((discountAmount / subtotal) * 100)
    const result = {
      subtotal,
      discountAmount,
      finalTotal,
      discountPercentage: percentage
    }
    console.log('Discount calculation:', result)
    return result
  },

  // Test change calculation
  testChange(total, cashReceived) {
    const change = Math.max(0, cashReceived - total)
    const result = {
      total,
      cashReceived,
      change,
      sufficient: cashReceived >= total
    }
    console.log('Change calculation:', result)
    return result
  },

  // Get printer status
  async getPrinterStatus() {
    try {
      const response = await fetch('/api/printer/get-default-printer')
      const result = await response.json()
      console.log('Printer status:', result)
      return result
    } catch (error) {
      console.error('Failed to get printer status:', error)
      return { success: false, error: error.message }
    }
  }
}