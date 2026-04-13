/**
 * Receipt Image Generator
 * Generates professional HD receipt images using node-canvas at 2x resolution.
 * Returns a temporary file path for sending via WhatsApp.
 */

const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const os = require('os');
const log = require('electron-log');
const https = require('https');
const http = require('http');

// ── Logo cache (avoids re-downloading for bulk sends) ──
let _logoCache = { url: null, buffer: null };

/**
 * Download an image URL and return a canvas Image object.
 * Returns null on any failure (network, invalid image, etc.)
 */
async function fetchLogo(url) {
  if (!url) return null;
  try {
    // Return cached version if same URL
    if (_logoCache.url === url && _logoCache.buffer) {
      return await loadImage(_logoCache.buffer);
    }

    const buffer = await new Promise((resolve, reject) => {
      const client = url.startsWith('https') ? https : http;
      client.get(url, { timeout: 8000 }, (res) => {
        if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });

    _logoCache = { url, buffer };
    return await loadImage(buffer);
  } catch (e) {
    log.warn('[Receipt] Failed to load logo:', e.message);
    return null;
  }
}

// ── HD 2x resolution constants ──
const SCALE = 2;
const WIDTH = 650 * SCALE;       // 1300px actual
const PAD = 50 * SCALE;
const RIGHT = WIDTH - PAD;
const COL_W = WIDTH - PAD * 2;
const CENTER = WIDTH / 2;

// Colors
const C = {
  bg:         '#FFFFFF',
  cardBg:     '#F8FAFC',
  text:       '#1E293B',
  textMuted:  '#64748B',
  textLight:  '#94A3B8',
  border:     '#E2E8F0',
  borderLight:'#F1F5F9',
  accent:     '#0F172A',
  accentSoft: '#334155',
  green:      '#16A34A',
  red:        '#DC2626',
  totalBg:    '#0F172A',
  totalText:  '#FFFFFF',
  balanceBg:  '#F8FAFC',
  balanceBdr: '#CBD5E1',
  headerLine: '#0F172A',
  tableHead:  '#F1F5F9',
  tableHeadT: '#475569',
};

function fmt(n) {
  return 'Rs ' + Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function s(px) { return px * SCALE; }

/**
 * Generate a professional HD receipt image.
 */
async function generateReceiptImage(data) {
  log.info('[Receipt] Generating HD receipt with data:', JSON.stringify({
    businessName: data.businessName,
    orderNumber: data.orderNumber,
    itemsCount: data.items?.length,
    items: data.items,
    total: data.total,
    previousBalance: data.previousBalance,
    newBalance: data.newBalance,
  }));

  const items = data.items || [];

  // ── Load logo if provided ──
  const logoImg = await fetchLogo(data.logoUrl);
  const LOGO_MAX_H = 60; // max logo height in design pixels
  let logoDrawH = 0;
  let logoDrawW = 0;
  if (logoImg) {
    const aspect = logoImg.width / logoImg.height;
    logoDrawH = LOGO_MAX_H;
    logoDrawW = LOGO_MAX_H * aspect;
    if (logoDrawW > 180) { logoDrawW = 180; logoDrawH = logoDrawW / aspect; }
  }

  // ── Calculate total height ──
  let h = 0;
  h += s(50);   // top padding
  if (logoImg) { h += s(logoDrawH + 16); } // logo + gap
  h += s(42);   // business name
  h += s(8);    // gap
  h += s(18);   // tagline
  h += s(30);   // gap before divider
  h += s(3);    // divider
  h += s(28);   // gap after divider

  // Order info section
  h += s(28) * 4;  // 4 info rows
  if (data.customerPhone) h += s(28);
  h += s(28);   // gap before items

  // Items table
  h += s(40);   // table header
  h += s(2);    // header line
  if (items.length === 0) {
    h += s(36);
  } else {
    h += items.length * s(52);  // each item row
  }
  h += s(24);   // gap after items

  // Totals section
  h += s(2);    // separator
  h += s(20);   // gap
  h += s(28);   // subtotal
  if (data.discount > 0) h += s(28);
  if (data.serviceCharge > 0) h += s(28);
  if (data.deliveryCharges > 0) h += s(28);
  if (data.loyaltyPoints > 0) h += s(28);
  h += s(20);   // gap

  // Grand total bar
  h += s(64);   // total bar height
  h += s(28);   // gap

  // Balance card
  h += s(120);  // balance card
  h += s(28);   // gap

  // Footer
  h += s(22);   // payment method
  h += s(12);   // gap
  h += s(20);   // thank you
  h += s(50);   // bottom padding

  // ── Create canvas ──
  const canvas = createCanvas(WIDTH, h);
  const ctx = canvas.getContext('2d');

  // Enable antialiasing
  ctx.antialias = 'subpixel';

  // White background
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, h);

  let y = s(50);

  // ── Helpers ──
  function setFont(size, weight = '400', family = 'Arial, Helvetica, sans-serif') {
    ctx.font = `${weight} ${s(size)}px ${family}`;
  }

  function drawText(str, x, yPos, { size = 14, weight = '400', color = C.text, align = 'left' } = {}) {
    ctx.fillStyle = color;
    setFont(size, weight);
    ctx.textAlign = align;
    let drawX = x;
    if (align === 'center') drawX = CENTER;
    else if (align === 'right') drawX = x || RIGHT;
    ctx.fillText(String(str || ''), drawX, yPos);
  }

  function drawLine(yPos, color = C.border, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s(width);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD, yPos);
    ctx.lineTo(RIGHT, yPos);
    ctx.stroke();
  }

  function drawDashedLine(yPos, color = C.border) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s(1);
    ctx.setLineDash([s(6), s(4)]);
    ctx.beginPath();
    ctx.moveTo(PAD, yPos);
    ctx.lineTo(RIGHT, yPos);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function roundRect(rx, ry, w, rh, radius) {
    const r = s(radius);
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + w - r, ry);
    ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
    ctx.lineTo(rx + w, ry + rh - r);
    ctx.quadraticCurveTo(rx + w, ry + rh, rx + w - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
  }

  function infoRow(label, value, yPos, { labelColor = C.textMuted, valueColor = C.text, valueWeight = '600', size = 14 } = {}) {
    drawText(label, PAD, yPos, { size, weight: '500', color: labelColor });
    drawText(value, RIGHT, yPos, { size, weight: valueWeight, color: valueColor, align: 'right' });
  }

  // ════════════════════════════════════════════════════════════
  //  HEADER
  // ════════════════════════════════════════════════════════════

  // Logo (centered above business name)
  if (logoImg) {
    const lw = s(logoDrawW);
    const lh = s(logoDrawH);
    const lx = CENTER - lw / 2;
    ctx.drawImage(logoImg, lx, y - s(10), lw, lh);
    y += s(logoDrawH + 16);
  }

  // Business name — large, bold, centered
  drawText(
    (data.businessName || 'BIZPOS').toLowerCase(),
    0, y,
    { align: 'center', size: 32, weight: '800', color: C.accent }
  );
  y += s(8);

  // Tagline
  y += s(18);
  drawText('Customer Account Receipt', 0, y, { align: 'center', size: 12, weight: '500', color: C.textLight });
  y += s(30);

  // Header divider — thick accent line
  drawLine(y, C.headerLine, 2.5);
  y += s(28);

  // ════════════════════════════════════════════════════════════
  //  ORDER INFO
  // ════════════════════════════════════════════════════════════

  infoRow('Order:', data.orderNumber || 'N/A', y, { valueWeight: '700' });
  y += s(28);
  infoRow('Date:', data.orderDate || '', y);
  y += s(28);
  infoRow('Type:', (data.orderType || 'walkin').toUpperCase(), y);
  y += s(28);
  infoRow('Customer:', data.customerName || 'Guest', y, { valueWeight: '700', valueColor: C.accent });
  y += s(28);
  if (data.customerPhone) {
    infoRow('Phone:', data.customerPhone, y, { valueColor: C.textMuted, valueWeight: '500' });
    y += s(28);
  }

  y += s(12);
  drawDashedLine(y);
  y += s(16);

  // ════════════════════════════════════════════════════════════
  //  ITEMS TABLE
  // ════════════════════════════════════════════════════════════

  // Table header background
  roundRect(PAD, y - s(10), COL_W, s(38), 6);
  ctx.fillStyle = C.tableHead;
  ctx.fill();

  const colItem = PAD + s(12);
  const colQty = PAD + s(310);
  const colPrice = PAD + s(400);
  const colTotal = RIGHT - s(12);

  drawText('ITEM', colItem, y + s(4), { size: 11, weight: '700', color: C.tableHeadT });
  drawText('QTY', colQty, y + s(4), { size: 11, weight: '700', color: C.tableHeadT });
  drawText('PRICE', colPrice, y + s(4), { size: 11, weight: '700', color: C.tableHeadT });
  drawText('TOTAL', colTotal, y + s(4), { size: 11, weight: '700', color: C.tableHeadT, align: 'right' });

  y += s(38);
  drawLine(y, C.border, 1);
  y += s(4);

  if (items.length === 0) {
    y += s(18);
    drawText('No items available', 0, y, { size: 13, color: C.textLight, align: 'center' });
    y += s(18);
  } else {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const itemName = item.name || item.product_name || 'Item';
      const qty = item.quantity || 1;
      const price = Number(item.price || item.unit_price || 0);
      const total = Number(item.total || item.total_price || price * qty);

      // Alternating row background
      if (i % 2 === 1) {
        ctx.fillStyle = C.borderLight;
        ctx.fillRect(PAD, y, COL_W, s(48));
      }

      const rowCenter = y + s(30);

      // Item name — truncate if too long
      let displayName = itemName;
      setFont(13, '600');
      const maxNameW = colQty - colItem - s(16);
      while (ctx.measureText(displayName).width > maxNameW && displayName.length > 3) {
        displayName = displayName.slice(0, -1);
      }
      if (displayName !== itemName) displayName = displayName.trim() + '..';

      drawText(displayName, colItem, rowCenter, { size: 13, weight: '600', color: C.text });

      // Qty
      drawText(qty.toString(), colQty, rowCenter, { size: 13, weight: '500', color: C.textMuted });

      // Price
      drawText(fmt(price), colPrice, rowCenter, { size: 13, weight: '500', color: C.textMuted });

      // Total — right aligned
      drawText(fmt(total), colTotal, rowCenter, { size: 13, weight: '700', color: C.text, align: 'right' });

      y += s(52);
    }
  }

  y += s(8);

  // ════════════════════════════════════════════════════════════
  //  TOTALS
  // ════════════════════════════════════════════════════════════

  drawLine(y, C.border, 1);
  y += s(20);

  infoRow('Subtotal:', fmt(data.subtotal || data.total), y, { size: 13, valueWeight: '600' });
  y += s(28);

  if (data.discount > 0) {
    infoRow('Discount:', `- ${fmt(data.discount)}`, y, { size: 13, valueColor: C.red, valueWeight: '600' });
    y += s(28);
  }
  if (data.serviceCharge > 0) {
    infoRow('Service Charge:', `+ ${fmt(data.serviceCharge)}`, y, { size: 13, valueColor: C.textMuted, valueWeight: '600' });
    y += s(28);
  }
  if (data.deliveryCharges > 0) {
    infoRow('Delivery:', `+ ${fmt(data.deliveryCharges)}`, y, { size: 13, valueColor: C.textMuted, valueWeight: '600' });
    y += s(28);
  }
  if (data.loyaltyPoints > 0) {
    infoRow('Loyalty Points:', String(data.loyaltyPoints), y, { size: 13, valueColor: C.green, valueWeight: '600' });
    y += s(28);
  }

  y += s(12);

  // ── Grand total bar ──
  const totalBarH = s(56);
  roundRect(PAD, y, COL_W, totalBarH, 10);
  ctx.fillStyle = C.totalBg;
  ctx.fill();

  const totalTextY = y + totalBarH / 2 + s(8);
  drawText('TOTAL', PAD + s(24), totalTextY, { size: 20, weight: '800', color: C.totalText });
  drawText(fmt(data.total), RIGHT - s(24), totalTextY, { size: 22, weight: '800', color: C.totalText, align: 'right' });

  y += totalBarH + s(28);

  // ════════════════════════════════════════════════════════════
  //  BALANCE CARD
  // ════════════════════════════════════════════════════════════

  const balCardH = s(110);
  roundRect(PAD, y, COL_W, balCardH, 10);
  ctx.fillStyle = C.balanceBg;
  ctx.fill();
  ctx.strokeStyle = C.balanceBdr;
  ctx.lineWidth = s(1.5);
  ctx.stroke();

  // Title
  y += s(28);
  drawText('ACCOUNT BALANCE', 0, y, { align: 'center', size: 11, weight: '700', color: C.textLight });
  y += s(8);

  // Divider inside card
  y += s(6);
  ctx.strokeStyle = C.border;
  ctx.lineWidth = s(0.5);
  ctx.beginPath();
  ctx.moveTo(PAD + s(40), y);
  ctx.lineTo(RIGHT - s(40), y);
  ctx.stroke();
  y += s(18);

  // Previous balance
  drawText('Previous:', PAD + s(24), y, { size: 13, weight: '500', color: C.textMuted });
  drawText(fmt(data.previousBalance), RIGHT - s(24), y, { size: 14, weight: '600', color: C.textMuted, align: 'right' });
  y += s(28);

  // Current balance
  const newBal = Number(data.newBalance || 0);
  const balColor = newBal > 0 ? C.red : C.green;
  drawText('Current:', PAD + s(24), y, { size: 14, weight: '700', color: C.accent });
  drawText(fmt(data.newBalance), RIGHT - s(24), y, { size: 16, weight: '800', color: balColor, align: 'right' });
  y += s(30);

  // ════════════════════════════════════════════════════════════
  //  FOOTER
  // ════════════════════════════════════════════════════════════

  y += s(6);
  drawText(`Payment Method: ${data.paymentMethod || 'Customer Account'}`, 0, y, { align: 'center', size: 11, weight: '500', color: C.textLight });
  y += s(22);
  drawText('Thank you for your business!', 0, y, { align: 'center', size: 13, weight: '600', color: C.textMuted });

  // ── Save to temp file ──
  const tmpDir = path.join(os.tmpdir(), 'bizpos-receipts');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const fileName = `receipt_${data.orderNumber || 'unknown'}_${Date.now()}.png`;
  const filePath = path.join(tmpDir, fileName);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  log.info(`[Receipt] Generated HD: ${filePath} (${buffer.length} bytes, ${WIDTH}x${h}px, ${items.length} items)`);
  return filePath;
}

/**
 * Generate a clean balance statement image (for manual/bulk sends).
 * Shows only business name, customer info, date, and outstanding balance.
 */
async function generateBalanceImage(data) {
  log.info('[Receipt] Generating balance statement with data:', JSON.stringify({
    businessName: data.businessName,
    customerName: data.customerName,
    balance: data.balance,
  }));

  // ── Load logo if provided ──
  const logoImg = await fetchLogo(data.logoUrl);
  const LOGO_MAX_H = 60;
  let logoDrawH = 0;
  let logoDrawW = 0;
  if (logoImg) {
    const aspect = logoImg.width / logoImg.height;
    logoDrawH = LOGO_MAX_H;
    logoDrawW = LOGO_MAX_H * aspect;
    if (logoDrawW > 180) { logoDrawW = 180; logoDrawH = logoDrawW / aspect; }
  }

  // ── Calculate total height ──
  let h = 0;
  h += s(50);   // top padding
  if (logoImg) { h += s(logoDrawH + 16); } // logo + gap
  h += s(42);   // business name
  h += s(8);
  h += s(18);   // tagline
  h += s(30);   // gap before divider
  h += s(3);    // divider
  h += s(28);   // gap after divider

  // Customer info (3 rows + optional phone)
  h += s(28) * 3;
  if (data.customerPhone) h += s(28);
  h += s(24);   // gap

  // Balance card
  h += s(140);  // balance card (bigger for emphasis)
  h += s(28);   // gap

  // Footer
  h += s(20);   // thank you
  h += s(50);   // bottom padding

  // ── Create canvas ──
  const canvas = createCanvas(WIDTH, h);
  const ctx = canvas.getContext('2d');
  ctx.antialias = 'subpixel';

  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, WIDTH, h);

  let y = s(50);

  // ── Helpers (same as receipt) ──
  function setFont(size, weight = '400', family = 'Arial, Helvetica, sans-serif') {
    ctx.font = `${weight} ${s(size)}px ${family}`;
  }

  function drawText(str, x, yPos, { size = 14, weight = '400', color = C.text, align = 'left' } = {}) {
    ctx.fillStyle = color;
    setFont(size, weight);
    ctx.textAlign = align;
    let drawX = x;
    if (align === 'center') drawX = CENTER;
    else if (align === 'right') drawX = x || RIGHT;
    ctx.fillText(String(str || ''), drawX, yPos);
  }

  function drawLine(yPos, color = C.border, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = s(width);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(PAD, yPos);
    ctx.lineTo(RIGHT, yPos);
    ctx.stroke();
  }

  function roundRect(rx, ry, w, rh, radius) {
    const r = s(radius);
    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + w - r, ry);
    ctx.quadraticCurveTo(rx + w, ry, rx + w, ry + r);
    ctx.lineTo(rx + w, ry + rh - r);
    ctx.quadraticCurveTo(rx + w, ry + rh, rx + w - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
  }

  function infoRow(label, value, yPos, { labelColor = C.textMuted, valueColor = C.text, valueWeight = '600', size = 14 } = {}) {
    drawText(label, PAD, yPos, { size, weight: '500', color: labelColor });
    drawText(value, RIGHT, yPos, { size, weight: valueWeight, color: valueColor, align: 'right' });
  }

  // ════════════════════════════════════════════════════════════
  //  HEADER
  // ════════════════════════════════════════════════════════════

  // Logo (centered above business name)
  if (logoImg) {
    const lw = s(logoDrawW);
    const lh = s(logoDrawH);
    const lx = CENTER - lw / 2;
    ctx.drawImage(logoImg, lx, y - s(10), lw, lh);
    y += s(logoDrawH + 16);
  }

  drawText(
    (data.businessName || 'BIZPOS').toLowerCase(),
    0, y,
    { align: 'center', size: 32, weight: '800', color: C.accent }
  );
  y += s(8);
  y += s(18);
  drawText('Account Balance Statement', 0, y, { align: 'center', size: 12, weight: '500', color: C.textLight });
  y += s(30);

  drawLine(y, C.headerLine, 2.5);
  y += s(28);

  // ════════════════════════════════════════════════════════════
  //  CUSTOMER INFO
  // ════════════════════════════════════════════════════════════

  infoRow('Customer:', data.customerName || 'Customer', y, { valueWeight: '700', valueColor: C.accent });
  y += s(28);
  if (data.customerPhone) {
    infoRow('Phone:', data.customerPhone, y, { valueColor: C.textMuted, valueWeight: '500' });
    y += s(28);
  }
  infoRow('Date:', data.date || new Date().toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' }), y);
  y += s(28);
  infoRow('Status:', 'Outstanding', y, { valueColor: C.red, valueWeight: '700' });
  y += s(28);

  y += s(8);

  // ════════════════════════════════════════════════════════════
  //  BALANCE CARD (large, prominent)
  // ════════════════════════════════════════════════════════════

  const balCardH = s(120);
  roundRect(PAD, y, COL_W, balCardH, 12);
  ctx.fillStyle = C.totalBg;
  ctx.fill();

  // "Outstanding Balance" label
  const labelY = y + s(38);
  drawText('OUTSTANDING BALANCE', 0, labelY, { align: 'center', size: 12, weight: '600', color: '#94A3B8' });

  // Big balance amount
  const balance = Number(data.balance || 0);
  const amountY = y + s(80);
  drawText(fmt(balance), 0, amountY, { align: 'center', size: 32, weight: '800', color: balance > 0 ? '#FCA5A5' : '#86EFAC' });

  y += balCardH + s(28);

  // ════════════════════════════════════════════════════════════
  //  FOOTER
  // ════════════════════════════════════════════════════════════

  drawText('Please arrange payment at your earliest convenience.', 0, y, { align: 'center', size: 12, weight: '500', color: C.textMuted });
  y += s(24);
  drawText('Thank you for your business!', 0, y, { align: 'center', size: 13, weight: '600', color: C.textMuted });

  // ── Save to temp file ──
  const tmpDir = path.join(os.tmpdir(), 'bizpos-receipts');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const fileName = `balance_${(data.customerName || 'unknown').replace(/\s+/g, '_')}_${Date.now()}.png`;
  const filePath = path.join(tmpDir, fileName);

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(filePath, buffer);

  log.info(`[Receipt] Generated balance statement: ${filePath} (${buffer.length} bytes, ${WIDTH}x${h}px)`);
  return filePath;
}

module.exports = { generateReceiptImage, generateBalanceImage };
