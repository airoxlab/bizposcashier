/**
 * Phone number formatter for WhatsApp
 * WhatsApp requires international format without + sign: 923001234567
 *
 * Handles all edge cases:
 *  - Local Pakistan format:   03001234567    → 923001234567
 *  - With + prefix:           +923001234567  → 923001234567
 *  - Already international:   923001234567   → 923001234567
 *  - Spaces / dashes / dots:  0300-123 4567  → 923001234567
 *  - Parentheses:             (0300)1234567  → 923001234567
 *  - Double zero prefix:      00923001234567 → 923001234567
 *  - Too short / too long:    → null (invalid)
 *  - Contains letters/garbage → null (invalid)
 */
function formatPhoneForWhatsApp(phone) {
  if (!phone || typeof phone !== 'string') return null;

  // Step 1: Strip whitespace, dashes, dots, parentheses
  let cleaned = phone.trim().replace(/[\s\-\.\(\)]/g, '');

  // Step 2: Strip leading +
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.slice(1);
  }

  // Step 3: Strip double-zero international prefix (00923... → 923...)
  if (cleaned.startsWith('00')) {
    cleaned = cleaned.slice(2);
  }

  // Step 4: Must be all digits at this point
  if (!/^\d+$/.test(cleaned)) return null;

  // Step 5: Pakistan local format 03XXXXXXXXX (11 digits starting with 0)
  if (cleaned.startsWith('0') && cleaned.length === 11) {
    cleaned = '92' + cleaned.slice(1);
  }

  // Step 6: Length check — valid international numbers: 10–15 digits
  if (cleaned.length < 10 || cleaned.length > 15) return null;

  // Step 7: Must not start with 0 (already handled above, safety check)
  if (cleaned.startsWith('0')) return null;

  return cleaned;
}

module.exports = { formatPhoneForWhatsApp };
