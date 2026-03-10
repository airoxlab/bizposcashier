
// lib/utils/rateLimiter.js
export class RateLimiter {
  constructor() {
    this.requests = new Map()
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000) // Cleanup every minute
  }

  isAllowed(key, limit = SecurityConfig.RATE_LIMIT.PRINT_REQUESTS_PER_MINUTE) {
    const now = Date.now()
    const minute = Math.floor(now / 60000)
    const requestKey = `${key}:${minute}`
    
    const currentCount = this.requests.get(requestKey) || 0
    
    if (currentCount >= limit) {
      return false
    }
    
    this.requests.set(requestKey, currentCount + 1)
    return true
  }

  cleanup() {
    const now = Date.now()
    const currentMinute = Math.floor(now / 60000)
    
    // Remove entries older than 2 minutes
    for (const [key] of this.requests) {
      const keyMinute = parseInt(key.split(':')[1])
      if (currentMinute - keyMinute > 2) {
        this.requests.delete(key)
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
    }
  }
}

export const rateLimiter = new RateLimiter()

export default { PrinterConfig, SecurityConfig, ConfigValidator, RateLimiter }