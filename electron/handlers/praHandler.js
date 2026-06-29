const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const os = require('os');
const fs = require('fs');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://gmmjefeojrpazhacqihk.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdtbWplZmVvanJwYXpoYWNxaWhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ0OTIzOTcsImV4cCI6MjA3MDA2ODM5N30.3lu4RPAt3z1Ux-qRtqqNLeCAcf8tAU4aywHIjfEA3JE';
const supabase = createClient(supabaseUrl, supabaseKey);

const PRA_ENDPOINTS = {
  sandbox: 'https://ims.pral.com.pk/ims/sandbox/api/Live/PostData',
  production: 'https://ims.pral.com.pk/ims/production/api/Live/PostData',
};

function getQrPath(invoiceNumber) {
  const safe = String(invoiceNumber).replace(/[/\\:*?"<>|]/g, '-');
  return path.join(os.tmpdir(), 'bizpos-pra-qr', `${safe}.png`);
}

async function ensureQrFile(invoiceNumber) {
  const QRCode = require('qrcode');
  const qrDir = path.join(os.tmpdir(), 'bizpos-pra-qr');
  if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir, { recursive: true });
  const qrPath = getQrPath(invoiceNumber);
  const qrUrl = `https://reg.pra.punjab.gov.pk/IMSFiscalReport/SearchPOSInvoice_Report.aspx?PRAInvNo=${invoiceNumber}`;
  if (!fs.existsSync(qrPath)) {
    await QRCode.toFile(qrPath, qrUrl, { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  }
  return qrPath;
}

// ---------------------------------------------------------------------------
// Shared PRA amount calculation — single source of truth for BOTH the live
// submission (pra:submit) and the proforma preview (pra:preview) so the
// proforma always shows exactly what PRA will be charged.
//
// General rule applied: the restaurant SERVICE CHARGE is part of the value of
// supply, so it is included in the taxable value and taxed. Because the PRA
// payload is item-based (and PRA validates that the item amounts sum to the
// header totals), the service charge is distributed across the line items in
// proportion to each item's base sale value.
// ---------------------------------------------------------------------------
function buildPraItemsAndTotals(orderItems, serviceChargeAmount, taxRate) {
  const items = orderItems || [];
  const round2 = n => Math.round((n + Number.EPSILON) * 100) / 100;

  // Base sale value per item = line total - per-item discount.
  const bases = items.map(item => {
    const lineTotal = parseFloat(item.total_price || 0);
    const itemDisc = parseFloat(item.item_discount_amount || 0);
    return Math.max(0, round2(lineTotal - itemDisc));
  });
  const baseSubtotal = round2(bases.reduce((s, v) => s + v, 0));
  const svc = parseFloat(serviceChargeAmount || 0);

  // Distribute the service charge proportionally; assign any rounding remainder
  // to the last item so the shares sum EXACTLY to the service charge.
  const shares = bases.map(b => (baseSubtotal > 0 ? round2(svc * b / baseSubtotal) : 0));
  if (svc > 0 && shares.length > 0) {
    const allocated = round2(shares.reduce((s, v) => s + v, 0));
    shares[shares.length - 1] = round2(shares[shares.length - 1] + (svc - allocated));
  }

  const payloadItems = items.map((item, idx) => {
    const saleVal = round2(bases[idx] + shares[idx]);
    const taxCharged = round2(saleVal * taxRate / 100);
    const totalAmt = round2(saleVal + taxCharged);
    return {
      ItemCode: item.product_id,
      ItemName: item.product_name,
      Quantity: item.quantity,
      PCTCode: (item.products?.pct_code || '').replace(/\./g, ''),
      TaxRate: taxRate,
      SaleValue: saleVal,
      TaxCharged: taxCharged,
      TotalAmount: totalAmt,
      Discount: parseFloat(item.item_discount_amount || 0),
      FurtherTax: 0,
      InvoiceType: 1,
      RefUSIN: null,
    };
  });

  const totalSaleValue = round2(payloadItems.reduce((s, i) => s + i.SaleValue, 0));
  const totalTaxCharged = round2(payloadItems.reduce((s, i) => s + i.TaxCharged, 0));
  const totalBillAmount = round2(payloadItems.reduce((s, i) => s + i.TotalAmount, 0));
  const totalQuantity = items.reduce((s, i) => s + (parseInt(i.quantity) || 0), 0);

  return {
    items: payloadItems,
    baseSubtotal,        // items only, before service charge (for receipt Subtotal line)
    serviceCharge: svc,  // service charge folded into the taxable value
    totalSaleValue,      // taxable value = items + service charge
    totalTaxCharged,
    totalBillAmount,     // taxable value + tax
    totalQuantity,
  };
}

function registerPRAHandlers(ipcMain) {
  // Main submission handler — bearer token NEVER leaves this process
  ipcMain.handle('pra:submit', async (_event, { order_id, user_id, payment_mode }) => {
    try {
      // 1. Read PRA settings fresh from DB on every call — never cached
      const { data: pra, error: praErr } = await supabase
        .from('pra_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();

      if (praErr || !pra) {
        return { success: false, error: 'PRA settings not found. Configure PRA e-IMS in admin settings first.' };
      }
      if (!pra.is_enabled) {
        return { success: false, error: 'PRA integration is disabled.' };
      }
      if (!pra.bearer_token) {
        return { success: false, error: 'PRA bearer token not configured in admin settings.' };
      }

      // 2. Duplicate guard — read from DB, not from any cache
      const { data: existingOrder, error: checkErr } = await supabase
        .from('orders')
        .select('id, pra_invoice_number, pra_status')
        .eq('id', order_id)
        .single();

      if (checkErr) {
        return { success: false, error: 'Could not verify order status.' };
      }
      if (existingOrder?.pra_invoice_number) {
        return {
          success: false,
          already_filed: true,
          error: 'This order has already been filed with PRA.',
          invoice_number: existingOrder.pra_invoice_number,
        };
      }
      if (existingOrder?.pra_status === 'pending') {
        return { success: false, error: 'PRA filing is already in progress for this order.' };
      }

      // 3. Fetch full order with items and PCT codes — fresh from DB
      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select(`
          id, order_number, created_at, order_date, order_time,
          subtotal, total_amount, discount_amount, service_charge_amount, delivery_charges,
          payment_method,
          customers ( full_name, phone ),
          order_items (
            id, product_id, product_name, quantity, final_price, total_price,
            item_discount_amount,
            products ( pct_code )
          )
        `)
        .eq('id', order_id)
        .single();

      if (orderErr || !order) {
        return { success: false, error: 'Could not fetch order details.' };
      }

      // 4. Validate every item has a PCT code before consuming a USIN
      const missingPCT = (order.order_items || []).filter(i => !i.products?.pct_code);
      if (missingPCT.length > 0) {
        const names = missingPCT.map(i => i.product_name).join(', ');
        return {
          success: false,
          error: `Missing PCT code for: ${names}. Update products in admin → Products first.`,
        };
      }

      // 5. Atomically generate USIN via RPC — increments counter in pra_settings
      const { data: usin, error: usinErr } = await supabase.rpc('next_pra_usin', { p_user_id: user_id });
      if (usinErr || !usin) {
        return { success: false, error: `Failed to generate invoice number: ${usinErr?.message || 'unknown error'}` };
      }

      // 6. Mark order as pending to prevent double-submission
      await supabase
        .from('orders')
        .update({ pra_usin: usin, pra_status: 'pending', pra_payment_mode: payment_mode })
        .eq('id', order_id);

      // 7. Build PRA payload — service charge is folded into the taxable value
      //    via the shared helper (same math the proforma preview uses).
      const taxRate = payment_mode === 2
        ? parseFloat(pra.card_tax_rate || 5)
        : parseFloat(pra.cash_tax_rate || 16);

      const dt = new Date(order.created_at || `${order.order_date}T${order.order_time}`);
      const pad = n => String(n).padStart(2, '0');
      const dateTime = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())} ${pad(dt.getHours())}:${pad(dt.getMinutes())}:${pad(dt.getSeconds())}`;

      const built = buildPraItemsAndTotals(order.order_items, order.service_charge_amount, taxRate);
      const items = built.items;
      const totalSaleValue = built.totalSaleValue;
      const totalTaxCharged = built.totalTaxCharged;
      const totalBillAmount = built.totalBillAmount;
      const totalQuantity = built.totalQuantity;

      const payload = {
        InvoiceNumber: '',
        POSID: parseInt(pra.pos_id),
        USIN: usin,
        DateTime: dateTime,
        BuyerName: order.customers?.full_name || 'Walk In Customer',
        BuyerCNIC: '',
        BuyerPNTN: '',
        BuyerPhoneNumber: order.customers?.phone || '',
        TotalSaleValue: totalSaleValue,
        TotalTaxCharged: totalTaxCharged,
        TotalBillAmount: totalBillAmount,
        TotalQuantity: totalQuantity,
        Discount: parseFloat(order.discount_amount || 0),
        FurtherTax: 0,
        PaymentMode: payment_mode,
        RefUSIN: null,
        InvoiceType: 1,
        Items: items,
      };

      // 8. POST to PRA API — token never visible to renderer
      const endpoint = pra.environment === 'production' ? PRA_ENDPOINTS.production : PRA_ENDPOINTS.sandbox;
      let praResponse;
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pra.bearer_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        praResponse = await res.json();
      } catch (fetchErr) {
        await supabase.from('orders')
          .update({ pra_status: 'failed', pra_error: fetchErr.message })
          .eq('id', order_id);
        return { success: false, error: `Network error reaching PRA: ${fetchErr.message}` };
      }

      if (String(praResponse.Code) !== '100') {
        const errMsg = praResponse.Response || praResponse.Message || `Code: ${praResponse.Code}`;
        await supabase.from('orders')
          .update({ pra_status: 'failed', pra_error: errMsg })
          .eq('id', order_id);
        return { success: false, error: `PRA rejected invoice: ${errMsg}`, pra_code: praResponse.Code };
      }

      // 9. Success — generate QR PNG encoding the PRA verification URL
      const fiscalNumber = praResponse.InvoiceNumber;
      const qrPath = await ensureQrFile(fiscalNumber);

      // 10. Persist filed status — two updates so pra_invoice_number is always
      //     saved even if migration 016 (receipt amount columns) hasn't run yet.
      await supabase
        .from('orders')
        .update({
          pra_invoice_number: fiscalNumber,
          pra_status: 'filed',
          pra_submitted_at: new Date().toISOString(),
          pra_error: null,
        })
        .eq('id', order_id);

      // Persist receipt amounts (requires migration 016 columns). Failure here is
      // non-fatal: the receipt can still print fiscal number + recalculate amounts
      // from the order. Log but do not bubble up.
      await supabase
        .from('orders')
        .update({
          pra_sale_value: totalSaleValue,
          pra_tax_rate: taxRate,
          pra_tax_charged: totalTaxCharged,
          pra_bill_amount: totalBillAmount,
        })
        .eq('id', order_id)
        .then(({ error }) => {
          if (error) console.warn('[PRA] Could not save receipt amounts (run migration 016):', error.message);
        });

      return {
        success: true,
        invoice_number: fiscalNumber,
        qr_path: qrPath,
        tax_rate: taxRate,
        total_sale_value: totalSaleValue,
        total_tax_charged: totalTaxCharged,
        total_bill_amount: totalBillAmount,
      };

    } catch (err) {
      console.error('[PRA] Handler error:', err);
      try {
        await supabase.from('orders')
          .update({ pra_status: 'failed', pra_error: err.message })
          .eq('id', order_id);
      } catch (_) {}
      return { success: false, error: err.message };
    }
  });

  // Proforma preview — computes the SAME amounts pra:submit would, WITHOUT
  // filing anything (no USIN consumed, no DB writes, no API call). Used by the
  // proforma print so the preview matches the eventual PRA receipt to the rupee.
  ipcMain.handle('pra:preview', async (_event, { order_id, user_id, payment_mode }) => {
    try {
      const { data: pra, error: praErr } = await supabase
        .from('pra_settings')
        .select('*')
        .eq('user_id', user_id)
        .single();
      if (praErr || !pra) {
        return { success: false, error: 'PRA settings not found.' };
      }

      const { data: order, error: orderErr } = await supabase
        .from('orders')
        .select(`
          id, subtotal, discount_amount, service_charge_amount,
          order_items (
            id, product_id, product_name, quantity, final_price, total_price,
            item_discount_amount,
            products ( pct_code )
          )
        `)
        .eq('id', order_id)
        .single();
      if (orderErr || !order) {
        return { success: false, error: 'Could not fetch order details.' };
      }

      const taxRate = payment_mode === 2
        ? parseFloat(pra.card_tax_rate || 5)
        : parseFloat(pra.cash_tax_rate || 16);

      const built = buildPraItemsAndTotals(order.order_items, order.service_charge_amount, taxRate);

      return {
        success: true,
        tax_rate: taxRate,
        subtotal: built.baseSubtotal,
        service_charge: built.serviceCharge,
        total_sale_value: built.totalSaleValue,
        total_tax_charged: built.totalTaxCharged,
        total_bill_amount: built.totalBillAmount,
      };
    } catch (err) {
      console.error('[PRA] Preview error:', err);
      return { success: false, error: err.message };
    }
  });

  // QR ensure handler — regenerates QR if missing (app restart, different machine)
  ipcMain.handle('pra:ensure-qr', async (_event, { invoice_number }) => {
    try {
      const qrPath = await ensureQrFile(invoice_number);
      return qrPath;
    } catch (err) {
      console.error('[PRA] QR generation error:', err);
      return null;
    }
  });
}

module.exports = { registerPRAHandlers };
