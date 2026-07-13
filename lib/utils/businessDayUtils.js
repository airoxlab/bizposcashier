/**
 * Business Day Utilities
 * Handles business day calculations based on custom start/end times
 *
 * Example: If business starts at 10:00 AM and ends at 3:00 AM next day,
 * orders from 10:00 AM Jan 20 to 2:59 AM Jan 21 are considered "Jan 20" orders
 */

/**
 * Converts a time string (HH:mm) to minutes since midnight
 * @param {string} timeString - Time in format "HH:mm" (e.g., "10:00", "03:00")
 * @returns {number} Minutes since midnight
 */
function timeToMinutes(timeString) {
  if (!timeString) return 0;
  const [hours, minutes] = timeString.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Calculate the business date for a given timestamp based on business hours
 * @param {Date|string} timestamp - The order timestamp
 * @param {string} businessStartTime - Business day start time (e.g., "10:00")
 * @param {string} businessEndTime - Business day end time (e.g., "03:00")
 * @returns {string} Business date in YYYY-MM-DD format
 */
export function getBusinessDate(timestamp, businessStartTime = '10:00', businessEndTime = '03:00') {
  const orderDate = new Date(timestamp);
  const orderHours = orderDate.getHours();
  const orderMinutes = orderDate.getMinutes();
  const orderTimeInMinutes = orderHours * 60 + orderMinutes;

  const startMinutes = timeToMinutes(businessStartTime);
  const endMinutes = timeToMinutes(businessEndTime);

  // Case 1: End time is after start time (normal same-day hours)
  // e.g., 09:00 to 21:00 (9 AM to 9 PM)
  if (endMinutes > startMinutes) {
    // If current time is before start time, it belongs to previous day
    if (orderTimeInMinutes < startMinutes) {
      const prevDay = new Date(orderDate);
      prevDay.setDate(prevDay.getDate() - 1);
      return formatDate(prevDay);
    }
    // If current time is after end time, it belongs to next day
    if (orderTimeInMinutes >= endMinutes) {
      const nextDay = new Date(orderDate);
      nextDay.setDate(nextDay.getDate() + 1);
      return formatDate(nextDay);
    }
    // Otherwise, it's the current day
    return formatDate(orderDate);
  }

  // Case 2: End time is before start time (spans midnight)
  // e.g., 10:00 to 03:00 (10 AM to 3 AM next day)
  else {
    // If current time is before end time (early morning hours), it belongs to previous day
    if (orderTimeInMinutes < endMinutes) {
      const prevDay = new Date(orderDate);
      prevDay.setDate(prevDay.getDate() - 1);
      return formatDate(prevDay);
    }
    // If current time is before start time (between end and start), it belongs to current day
    if (orderTimeInMinutes < startMinutes) {
      return formatDate(orderDate);
    }
    // If current time is after start time, it's the current day
    return formatDate(orderDate);
  }
}

/**
 * Format a date object to YYYY-MM-DD
 * @param {Date} date - The date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Get today's business date
 * @param {string} businessStartTime - Business day start time (e.g., "10:00")
 * @param {string} businessEndTime - Business day end time (e.g., "03:00")
 * @returns {string} Today's business date in YYYY-MM-DD format
 */
export function getTodaysBusinessDate(businessStartTime = '10:00', businessEndTime = '03:00') {
  return getBusinessDate(new Date(), businessStartTime, businessEndTime);
}

/**
 * Check if a timestamp falls within today's business day
 * @param {Date|string} timestamp - The order timestamp
 * @param {string} businessStartTime - Business day start time (e.g., "10:00")
 * @param {string} businessEndTime - Business day end time (e.g., "03:00")
 * @returns {boolean} True if the timestamp is in today's business day
 */
export function isInTodaysBusinessDay(timestamp, businessStartTime = '10:00', businessEndTime = '03:00') {
  const businessDate = getBusinessDate(timestamp, businessStartTime, businessEndTime);
  const todaysBusinessDate = getTodaysBusinessDate(businessStartTime, businessEndTime);
  return businessDate === todaysBusinessDate;
}

/**
 * Get the start and end datetime for a specific business date
 * @param {string} businessDate - Business date in YYYY-MM-DD format
 * @param {string} businessStartTime - Business day start time (e.g., "10:00")
 * @param {string} businessEndTime - Business day end time (e.g., "03:00")
 * @returns {object} Object with startDateTime and endDateTime
 */
export function getBusinessDayRange(businessDate, businessStartTime = '10:00', businessEndTime = '03:00') {
  const startMinutes = timeToMinutes(businessStartTime);
  const endMinutes = timeToMinutes(businessEndTime);

  // Parse the business date
  const [year, month, day] = businessDate.split('-').map(Number);

  // Start datetime is the business date at start time
  const startDateTime = new Date(year, month - 1, day);
  startDateTime.setHours(Math.floor(startMinutes / 60));
  startDateTime.setMinutes(startMinutes % 60);
  startDateTime.setSeconds(0);
  startDateTime.setMilliseconds(0);

  // End datetime calculation depends on whether it crosses midnight
  const endDateTime = new Date(year, month - 1, day);

  if (endMinutes <= startMinutes) {
    // End time is next day
    endDateTime.setDate(endDateTime.getDate() + 1);
  }

  endDateTime.setHours(Math.floor(endMinutes / 60));
  endDateTime.setMinutes(endMinutes % 60);
  endDateTime.setSeconds(0);
  endDateTime.setMilliseconds(0);

  return {
    startDateTime: startDateTime.toISOString(),
    endDateTime: endDateTime.toISOString()
  };
}

/**
 * CONTIGUOUS business-day window: [this day's opening, NEXT day's opening).
 *
 * The plain getBusinessDayRange() window is [open, close] — e.g. 12:00 PM → 6:00 AM.
 * That leaves the closed gap (6:00 AM → next 12:00 PM) belonging to no day, so a
 * transaction at 6:01 AM is silently dropped from every report. This window closes
 * that hole: every minute from one opening to the next belongs to exactly one
 * business day. Anything after the "close" time is after-hours of the SAME day.
 *
 * @returns {{ openISO:string, closeISO:string, nextOpenISO:string }}
 *   openISO      → this business day's opening (inclusive lower bound)
 *   closeISO     → this business day's closing time (start of the after-hours tail)
 *   nextOpenISO  → next day's opening (EXCLUSIVE upper bound of the contiguous window)
 */
export function getContiguousBusinessWindow(businessDate, businessStartTime = '10:00', businessEndTime = '03:00') {
  const cur = getBusinessDayRange(businessDate, businessStartTime, businessEndTime);
  const [y, m, d] = businessDate.split('-').map(Number);
  const nextDay = new Date(y, m - 1, d);
  nextDay.setDate(nextDay.getDate() + 1);
  const nxt = getBusinessDayRange(formatDate(nextDay), businessStartTime, businessEndTime);
  return {
    openISO: cur.startDateTime,       // this day's opening
    closeISO: cur.endDateTime,        // this day's closing (end of open hours)
    nextOpenISO: nxt.startDateTime,   // next day's opening = exclusive end of the contiguous window
  };
}

/**
 * The CURRENT contiguous business date = the most recent opening on/before now.
 * Unlike getTodaysBusinessDate (which uses the close time), this rolls the closed
 * gap into the day that was just open: at 8:00 AM (business 12PM–6AM) it still
 * returns yesterday, because today has not opened yet.
 *
 * @returns {string} business date YYYY-MM-DD
 */
export function getCurrentContiguousBusinessDate(businessStartTime = '10:00', businessEndTime = '03:00') {
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const startMin = timeToMinutes(businessStartTime);
  const d = new Date(now);
  if (nowMin < startMin) d.setDate(d.getDate() - 1); // before today's opening → still yesterday's day
  return formatDate(d);
}

/**
 * Shift a YYYY-MM-DD business-date string by n days (calendar-safe).
 */
export function shiftBusinessDate(dateStr, n) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return formatDate(dt);
}

/**
 * Filter orders by business date
 * @param {Array} orders - Array of order objects with created_at or order_date
 * @param {string} businessDate - Business date in YYYY-MM-DD format
 * @param {string} businessStartTime - Business day start time (e.g., "10:00")
 * @param {string} businessEndTime - Business day end time (e.g., "03:00")
 * @returns {Array} Filtered orders
 */
export function filterOrdersByBusinessDate(orders, businessDate, businessStartTime = '10:00', businessEndTime = '03:00') {
  return orders.filter(order => {
    const orderTimestamp = order.created_at || order.order_date;
    const orderBusinessDate = getBusinessDate(orderTimestamp, businessStartTime, businessEndTime);
    return orderBusinessDate === businessDate;
  });
}

/**
 * Preset labels for the shared date-range dropdown.
 */
export const DATE_PRESETS = [
  { value: 'today',      label: 'Today' },
  { value: 'yesterday',  label: 'Yesterday' },
  { value: 'this_week',  label: 'This Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'custom',     label: 'Custom Range' },
];

/**
 * Resolve a named preset (today / yesterday / this_week / this_month / last_month
 * / custom) to a BUSINESS-day range. "Today" is anchored to the current business
 * day (overnight-safe), and the from/to business dates are converted to precise
 * created_at timestamp bounds so callers can filter `created_at` the same way the
 * shift analytics do — never the raw calendar date.
 *
 * @returns {{ from:string, to:string, startISO:string, endISO:string, label:string }}
 */
export function getBusinessDateRangeForPreset(
  preset, businessStartTime = '10:00', businessEndTime = '03:00', customFrom = '', customTo = ''
) {
  const todayBiz = getTodaysBusinessDate(businessStartTime, businessEndTime);
  const [ty, tm, td] = todayBiz.split('-').map(Number);
  const anchor = new Date(ty, tm - 1, td);
  const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

  let from, to;
  switch (preset) {
    case 'today':      from = todayBiz; to = todayBiz; break;
    case 'yesterday':  { const y = shift(anchor, -1); from = formatDate(y); to = formatDate(y); break; }
    case 'this_week':  { const dow = anchor.getDay(); const mon = shift(anchor, -(dow === 0 ? 6 : dow - 1)); from = formatDate(mon); to = todayBiz; break; }
    case 'this_month': { from = formatDate(new Date(ty, tm - 1, 1)); to = todayBiz; break; }
    case 'last_month': {
      const firstThis = new Date(ty, tm - 1, 1);
      const lastLast = new Date(firstThis); lastLast.setDate(0);
      const firstLast = new Date(lastLast.getFullYear(), lastLast.getMonth(), 1);
      from = formatDate(firstLast); to = formatDate(lastLast); break;
    }
    case 'custom':     from = customFrom || todayBiz; to = customTo || todayBiz; break;
    default:           from = todayBiz; to = todayBiz;
  }

  const { startDateTime: startISO } = getBusinessDayRange(from, businessStartTime, businessEndTime);
  const { endDateTime: endISO }     = getBusinessDayRange(to,   businessStartTime, businessEndTime);
  const label = (DATE_PRESETS.find(p => p.value === preset) || {}).label || 'Range';
  return { from, to, startISO, endISO, label };
}

/**
 * CONTIGUOUS drop-in for getBusinessDateRangeForPreset — same shape, but the
 * bounds run opening → NEXT opening so the closed-hours gap (after close, before
 * the next opening) is never dropped, and "today" is the most-recent-opening day
 * (getCurrentContiguousBusinessDate). Callers filter `created_at` with
 * `>= startISO AND < endISO` exactly as before; endISO is now the half-open
 * next-opening bound (also exposed as endExclusiveISO).
 *
 * @returns {{ from, to, startISO, endISO, endExclusiveISO, label }}
 */
export function getContiguousBusinessDateRangeForPreset(
  preset, businessStartTime = '10:00', businessEndTime = '03:00', customFrom = '', customTo = ''
) {
  const todayBiz = getCurrentContiguousBusinessDate(businessStartTime, businessEndTime);
  const [ty, tm, td] = todayBiz.split('-').map(Number);
  const anchor = new Date(ty, tm - 1, td);
  const shift = (base, days) => { const d = new Date(base); d.setDate(d.getDate() + days); return d; };

  let from, to;
  switch (preset) {
    case 'today':      from = todayBiz; to = todayBiz; break;
    case 'yesterday':  { const y = shift(anchor, -1); from = formatDate(y); to = formatDate(y); break; }
    case 'this_week':  { const dow = anchor.getDay(); const mon = shift(anchor, -(dow === 0 ? 6 : dow - 1)); from = formatDate(mon); to = todayBiz; break; }
    case 'this_month': { from = formatDate(new Date(ty, tm - 1, 1)); to = todayBiz; break; }
    case 'last_month': {
      const firstThis = new Date(ty, tm - 1, 1);
      const lastLast = new Date(firstThis); lastLast.setDate(0);
      const firstLast = new Date(lastLast.getFullYear(), lastLast.getMonth(), 1);
      from = formatDate(firstLast); to = formatDate(lastLast); break;
    }
    case 'custom':     from = customFrom || todayBiz; to = customTo || todayBiz; break;
    default:           from = todayBiz; to = todayBiz;
  }

  const { openISO: startISO }   = getContiguousBusinessWindow(from, businessStartTime, businessEndTime);
  const { nextOpenISO: endISO } = getContiguousBusinessWindow(to,   businessStartTime, businessEndTime);
  const label = (DATE_PRESETS.find(p => p.value === preset) || {}).label || 'Range';
  return { from, to, startISO, endISO, endExclusiveISO: endISO, label };
}

/**
 * "HH:MM:SS" / "HH:MM" (24h) or an ISO/Date → "h:MM AM/PM".
 */
export function formatTime12(t) {
  if (!t) return '';
  // ISO timestamp / Date → read local clock parts.
  if (typeof t !== 'string' || t.includes('T') || t.length > 8) {
    const d = new Date(t);
    if (isNaN(d.getTime())) return typeof t === 'string' ? t : '';
    return d.toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const parts = t.split(':');
  let h = parseInt(parts[0], 10);
  if (isNaN(h)) return t;
  const m = (parts[1] || '00').padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

export default {
  getBusinessDate,
  getTodaysBusinessDate,
  isInTodaysBusinessDay,
  getBusinessDayRange,
  getContiguousBusinessWindow,
  getCurrentContiguousBusinessDate,
  getContiguousBusinessDateRangeForPreset,
  shiftBusinessDate,
  filterOrdersByBusinessDate,
  getBusinessDateRangeForPreset,
  formatTime12,
  DATE_PRESETS
};
