
// lib/config/securityConfig.js
export const SecurityConfig = {
  // Rate limiting for print requests
  RATE_LIMIT: {
    PRINT_REQUESTS_PER_MINUTE: 30,
    CONNECTION_TESTS_PER_MINUTE: 10,
    MAX_CONCURRENT_PRINTS: 5
  },

  // Input validation
  VALIDATION: {
    MAX_RECEIPT_SIZE: 10000, // bytes
    MAX_ORDER_ITEMS: 100,
    MAX_CUSTOMER_NAME_LENGTH: 100,
    MAX_INSTRUCTION_LENGTH: 500
  },

  // Network security
  NETWORK: {
    ALLOWED_IP_RANGES: [
      '192.168.0.0/16',
      '10.0.0.0/8', 
      '172.16.0.0/12'
    ],
    BLOCKED_PORTS: [22, 23, 25, 53, 80, 443, 993, 995],
    CONNECTION_TIMEOUT: 5000
  }
}