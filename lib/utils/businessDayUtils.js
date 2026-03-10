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

export default {
  getBusinessDate,
  getTodaysBusinessDate,
  isInTodaysBusinessDay,
  getBusinessDayRange,
  filterOrdersByBusinessDate
};
