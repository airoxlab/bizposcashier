/**
 * Daily Serial Number Manager
 * Generates and manages daily-resetting serial numbers for orders.
 * Serial numbers start from 1 each business day and reset at the business day end time.
 *
 * The DB column `orders.daily_serial` is the source of truth for SYNCED orders
 * (assigned gap-free under an advisory lock, per user + business day). This manager
 * only produces an INSTANT local number for a freshly punched order and keeps every
 * terminal's display in step with the DB. It must therefore be:
 *   - monotonic  (a number, once shown, is never reused on the same day)
 *   - collision-free (two order_numbers never map to the same serial)
 *   - reset-safe (never resets the counter because of a momentarily-missing profile)
 */

import { getTodaysBusinessDate } from './businessDayUtils'

const DEFAULT_BIZ_HOURS = { startTime: '10:00', endTime: '03:00' }

class DailySerialManager {
  constructor() {
    this.storageKey = 'daily_serial_data';
    // Last business hours we successfully read from the profile. Used as a fallback
    // so a transient missing/blank profile can't flip the computed business date and
    // trigger a spurious mid-shift counter reset.
    this._lastBizHours = null;
    // Only initialize on client-side (browser)
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      this.initialize();
    }
  }

  /**
   * Read business hours from user_profile in localStorage.
   * Robust: if the profile is missing/unparseable this session, reuse the last
   * business hours we saw (in-memory, then the ones persisted in the serial data)
   * instead of snapping to hardcoded defaults — a default flip changes the business
   * date and would wrongly reset the daily counter.
   */
  getBusinessHours() {
    try {
      const profile = JSON.parse(localStorage.getItem('user_profile') || '{}')
      if (profile.business_start_time || profile.business_end_time) {
        const hours = {
          startTime: profile.business_start_time
            ? profile.business_start_time.substring(0, 5)   // "HH:MM:SS" → "HH:MM"
            : DEFAULT_BIZ_HOURS.startTime,
          endTime: profile.business_end_time
            ? profile.business_end_time.substring(0, 5)
            : DEFAULT_BIZ_HOURS.endTime,
        }
        this._lastBizHours = hours
        return hours
      }
    } catch {
      // fall through to the fallbacks below
    }

    // Profile unavailable — reuse the last known-good hours before defaulting,
    // so the business date (and the counter) stays stable.
    if (this._lastBizHours) return this._lastBizHours
    try {
      const stored = this.getStoredData()
      if (stored?.bizHours?.startTime) {
        this._lastBizHours = stored.bizHours
        return stored.bizHours
      }
    } catch { /* ignore */ }
    return DEFAULT_BIZ_HOURS
  }

  /**
   * Initialize or reset the daily serial counter
   */
  initialize() {
    // Skip on server-side
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;

    const today = this.getTodayDate();
    const data = this.getStoredData();

    // Reset ONLY when we have prior data for a genuinely different business day.
    if (!data) {
      this.resetForNewDay(today);
    } else if (data.date !== today) {
      this.resetForNewDay(today);
    } else {
      // Same day — make sure the counter can never sit below an already-issued
      // serial (guards against legacy/ drifted data producing duplicates).
      this.normalize(data, true);
    }
  }

  /**
   * Get today's business date in YYYY-MM-DD format
   * Uses business_start_time / business_end_time from user profile
   */
  getTodayDate() {
    const { startTime, endTime } = this.getBusinessHours()
    return getTodaysBusinessDate(startTime, endTime)
  }

  /**
   * Get stored data from localStorage
   */
  getStoredData() {
    try {
      if (typeof localStorage === 'undefined') return null;
      const stored = localStorage.getItem(this.storageKey);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('Error reading daily serial data:', error);
      return null;
    }
  }

  /**
   * Save data to localStorage
   */
  saveData(data) {
    try {
      if (typeof localStorage === 'undefined') return;
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving daily serial data:', error);
    }
  }

  /**
   * Highest serial currently issued today (counter or any value in the map).
   */
  maxIssued(data) {
    if (!data) return 0
    let max = data.counter || 0
    const map = data.orderMap || {}
    for (const k in map) {
      const v = map[k]
      if (typeof v === 'number' && v > max) max = v
    }
    return max
  }

  /**
   * Force the counter to be at least the highest issued serial (monotonic guarantee).
   * @param {object} data
   * @param {boolean} persist - write back if the counter changed
   */
  normalize(data, persist = false) {
    if (!data) return data
    const max = this.maxIssued(data)
    if ((data.counter || 0) < max) {
      data.counter = max
      if (persist) this.saveData(data)
    }
    return data
  }

  /**
   * Reset counter for a new day
   */
  resetForNewDay(date) {
    const data = {
      date: date,
      counter: 0,
      orderMap: {}, // Maps order_number to serial number
      bizHours: this._lastBizHours || this.getBusinessHours(),
    };
    this.saveData(data);
  }

  /**
   * Generate next serial number for a new order
   * @param {string} orderNumber - The actual order number (ORD...)
   * @returns {number} The daily serial number
   */
  getNextSerial(orderNumber) {
    this.initialize(); // Ensure we're on the correct day

    const data = this.getStoredData();
    if (!data) return 1; // localStorage unavailable or write failed during initialize

    // Check if this order already has a serial (in case of re-rendering)
    if (data.orderMap[orderNumber]) {
      return data.orderMap[orderNumber];
    }

    // Monotonic: always one above the highest serial issued today, so a reset or
    // drifted counter can never hand out a number that's already on screen.
    const next = this.maxIssued(data) + 1;
    data.counter = next;
    data.orderMap[orderNumber] = next;

    this.saveData(data);

    return next;
  }

  /**
   * Get serial number for an existing order
   * @param {string} orderNumber - The actual order number (ORD...)
   * @returns {number|null} The serial number or null if not found
   */
  getSerial(orderNumber) {
    this.initialize();

    const data = this.getStoredData();
    if (!data || !data.orderMap) return null;
    return data.orderMap[orderNumber] || null;
  }

  /**
   * Store a DB-assigned serial so this device's localStorage stays in sync.
   * Called after the Supabase RPC returns the authoritative serial number.
   * Collision-safe: if another order_number currently holds this serial (a stale
   * local guess), that mapping is dropped so the DB value stays unique on screen.
   * @param {string} orderNumber
   * @param {number} serial
   */
  setSerial(orderNumber, serial) {
    this.initialize();
    const data = this.getStoredData();
    if (!data) return;
    if (!data.orderMap) data.orderMap = {};
    if (serial == null) return;

    // Drop any OTHER order that is currently showing this serial — the DB value is
    // authoritative and must be unique; the displaced order will be re-derived
    // (its own DB serial, or a fresh local number above the high-water mark).
    for (const key in data.orderMap) {
      if (key !== orderNumber && data.orderMap[key] === serial) {
        delete data.orderMap[key];
      }
    }

    data.orderMap[orderNumber] = serial;
    // Keep counter at least as high as the highest known serial
    if (serial > (data.counter || 0)) data.counter = serial;
    this.saveData(data);
  }

  /**
   * Get serial number for an order, or generate if doesn't exist
   * @param {string} orderNumber - The actual order number (ORD...)
   * @returns {number} The serial number
   */
  getOrCreateSerial(orderNumber) {
    const existing = this.getSerial(orderNumber);
    if (existing) {
      return existing;
    }
    return this.getNextSerial(orderNumber);
  }

  /**
   * Batch assign serial numbers to multiple orders in chronological order
   * This ensures sequential assignment based on creation time
   * @param {Array} orderNumbers - Array of order numbers in chronological order
   * @returns {Object} Map of order_number to serial number
   */
  batchAssignSerials(orderNumbers) {
    if (!Array.isArray(orderNumbers) || orderNumbers.length === 0) {
      return {};
    }

    this.initialize();
    const data = this.getStoredData();
    if (!data) return {};
    if (!data.orderMap) data.orderMap = {};
    const assignments = {};

    // Track the running high-water mark so assignments stay monotonic within the batch.
    let running = this.maxIssued(data);

    // Process each order number
    orderNumbers.forEach(orderNumber => {
      if (!orderNumber) return;

      // Check if already has a serial
      if (data.orderMap[orderNumber]) {
        assignments[orderNumber] = data.orderMap[orderNumber];
      } else {
        // Assign next serial above the high-water mark (never reuse a shown number)
        running += 1;
        data.orderMap[orderNumber] = running;
        assignments[orderNumber] = running;
      }
    });

    data.counter = Math.max(data.counter || 0, running);

    // Save all changes at once
    this.saveData(data);

    return assignments;
  }

  /**
   * Format serial number for display
   * @param {number} serial - The serial number
   * @returns {string} Formatted serial (e.g., "#001")
   */
  formatSerial(serial) {
    if (!serial) return '';
    return `#${serial.toString().padStart(3, '0')}`;
  }

  /**
   * Get full display string with both serial and order number
   * @param {string} orderNumber - The actual order number (ORD...)
   * @param {number} serial - The serial number (optional, will fetch if not provided)
   * @returns {string} Formatted string (e.g., "#001 - ORD123456")
   */
  getFullDisplay(orderNumber, serial = null) {
    if (!orderNumber) return '';

    const serialNum = serial || this.getOrCreateSerial(orderNumber);
    const formattedSerial = this.formatSerial(serialNum);

    return `${formattedSerial} - ${orderNumber}`;
  }

  /**
   * Get current counter value (for debugging)
   */
  getCurrentCounter() {
    const data = this.getStoredData();
    return data ? data.counter : 0;
  }

  /**
   * Manually reset (for testing purposes)
   */
  manualReset() {
    const today = this.getTodayDate();
    this.resetForNewDay(today);
    console.log('✅ Daily serial counter has been reset to 0');
  }

  /**
   * Seed the local counter from the DB so all terminals stay in sync.
   * Call once on startup when online. Queries today's orders for this user,
   * syncs all known DB serials into the local orderMap, and advances the
   * counter to at least the highest DB serial seen.
   *
   * @param {Object} supabaseClient - Supabase client instance
   * @param {string} userId - Current user's ID
   */
  async initFromDB(supabaseClient, userId) {
    if (typeof window === 'undefined' || !supabaseClient || !userId) return;
    try {
      const today = this.getTodayDate();

      // Fetch ALL today's orders — we need the total count even if daily_serial is null
      const { data, error } = await supabaseClient
        .from('orders')
        .select('order_number, daily_serial')
        .eq('user_id', userId)
        .eq('order_date', today);

      if (error) return;

      const totalTodayOrders = data?.length || 0;
      if (totalTodayOrders === 0) return;

      // Ensure stored data is for today (reset if it's a new day)
      let storedData = this.getStoredData();
      if (!storedData || storedData.date !== today) {
        storedData = { date: today, counter: 0, orderMap: {}, bizHours: this._lastBizHours || this.getBusinessHours() };
      }
      if (!storedData.orderMap) storedData.orderMap = {};

      let maxSerial = storedData.counter || 0;
      (data || []).forEach(order => {
        if (order.order_number && order.daily_serial != null) {
          // DB serials are unique per user+day — drop any stale local guess holding
          // this number so two orders can't share it after seeding.
          for (const key in storedData.orderMap) {
            if (key !== order.order_number && storedData.orderMap[key] === order.daily_serial) {
              delete storedData.orderMap[key];
            }
          }
          storedData.orderMap[order.order_number] = order.daily_serial;
          if (order.daily_serial > maxSerial) maxSerial = order.daily_serial;
        }
      });

      // Counter must be at least the total number of orders placed today —
      // covers orders from other terminals/apps that have daily_serial = null in DB
      storedData.counter = Math.max(maxSerial, totalTodayOrders);
      this.saveData(storedData);
      console.log(`🔢 [DailySerial] Counter seeded from DB: ${storedData.counter} (${totalTodayOrders} orders today, ${maxSerial} max serial in DB)`);
    } catch (err) {
      console.warn('⚠️ [DailySerial] Could not seed counter from DB:', err);
    }
  }

  /**
   * Debug: Log current state
   */
  debugState() {
    this.initialize();
    const data = this.getStoredData();
    if (!data) {
      console.log('📊 Daily Serial Manager State: <no data / storage unavailable>');
      return null;
    }
    console.log('📊 Daily Serial Manager State:');
    console.log('  Date:', data.date);
    console.log('  Counter:', data.counter);
    console.log('  Total Orders Mapped:', Object.keys(data.orderMap || {}).length);
    console.log('  Order Map:', data.orderMap);
    return data;
  }
}

// Export singleton instance
const dailySerialManager = new DailySerialManager();

export default dailySerialManager;
