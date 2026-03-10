
// lib/utils/configValidator.js
export class ConfigValidator {
  static validatePrinterConfig(config) {
    const errors = []

    // Validate IP address
    if (!config.ip_address) {
      errors.push('IP address is required')
    } else if (!PrinterConfig.VALIDATION.IP_REGEX.test(config.ip_address)) {
      errors.push(PrinterConfig.ERRORS.INVALID_IP)
    } else {
      // Check if IP is in private range (security check)
      const ip = config.ip_address
      const isPrivate = this.isPrivateIP(ip)
      if (!isPrivate) {
        errors.push('Only private IP addresses are allowed for security')
      }
    }

    // Validate MAC address
    if (!config.mac_address) {
      errors.push('MAC address is required')
    } else if (!PrinterConfig.VALIDATION.MAC_REGEX.test(config.mac_address)) {
      errors.push(PrinterConfig.ERRORS.INVALID_MAC)
    }

    // Validate port
    const port = parseInt(config.port)
    if (!port || port < PrinterConfig.VALIDATION.PORT_MIN || port > PrinterConfig.VALIDATION.PORT_MAX) {
      errors.push(PrinterConfig.ERRORS.INVALID_PORT)
    }

    // Check if port is in blocked list
    if (SecurityConfig.NETWORK.BLOCKED_PORTS.includes(port)) {
      errors.push(`Port ${port} is not allowed for security reasons`)
    }

    // Validate name
    if (!config.name?.trim()) {
      errors.push('Printer name is required')
    } else if (config.name.length > PrinterConfig.VALIDATION.NAME_MAX_LENGTH) {
      errors.push(`Printer name must be less than ${PrinterConfig.VALIDATION.NAME_MAX_LENGTH} characters`)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  static isPrivateIP(ip) {
    const parts = ip.split('.').map(Number)
    
    // 10.0.0.0/8
    if (parts[0] === 10) return true
    
    // 172.16.0.0/12
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
    
    // 192.168.0.0/16
    if (parts[0] === 192 && parts[1] === 168) return true
    
    // 127.0.0.0/8 (localhost)
    if (parts[0] === 127) return true
    
    return false
  }

  static validateOrderData(orderData) {
    const errors = []

    if (!orderData.cart || !Array.isArray(orderData.cart)) {
      errors.push('Invalid cart data')
    } else if (orderData.cart.length === 0) {
      errors.push('Cart cannot be empty')
    } else if (orderData.cart.length > SecurityConfig.VALIDATION.MAX_ORDER_ITEMS) {
      errors.push(`Too many items. Maximum ${SecurityConfig.VALIDATION.MAX_ORDER_ITEMS} allowed`)
    }

    // Validate amounts are positive numbers
    if (orderData.total && (isNaN(orderData.total) || orderData.total < 0)) {
      errors.push('Invalid total amount')
    }

    if (orderData.discountAmount && (isNaN(orderData.discountAmount) || orderData.discountAmount < 0)) {
      errors.push('Invalid discount amount')
    }

    // Validate string lengths
    if (orderData.orderInstructions && orderData.orderInstructions.length > SecurityConfig.VALIDATION.MAX_INSTRUCTION_LENGTH) {
      errors.push(`Instructions too long. Maximum ${SecurityConfig.VALIDATION.MAX_INSTRUCTION_LENGTH} characters`)
    }

    if (orderData.customer?.first_name && orderData.customer.first_name.length > SecurityConfig.VALIDATION.MAX_CUSTOMER_NAME_LENGTH) {
      errors.push(`Customer name too long. Maximum ${SecurityConfig.VALIDATION.MAX_CUSTOMER_NAME_LENGTH} characters`)
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  static sanitizeInput(input) {
    if (typeof input !== 'string') return input
    
    // Remove potentially dangerous characters
    return input
      .replace(/[<>]/g, '') // Remove HTML tags
      .replace(/[\r\n\t]/g, ' ') // Replace line breaks with spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim()
      .substring(0, 1000) // Limit length
  }
}