/**
 * Customer Ledger Manager
 * Handles customer credit/debit accounts and payment allocations
 */

import { supabase } from './supabase';

const localDateStr = (d = new Date()) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

class LedgerManager {
  /**
   * Get customer ledger summary
   */
  async getCustomerLedgerSummary(userId, customerId) {
    try {
      let { data, error } = await supabase
        .from('v_customer_ledger_summary')
        .select('*')
        .eq('user_id', userId)
        .eq('customer_id', customerId)
        .single();

      // If view doesn't exist, build summary manually
      if (error && error.message.includes('does not exist')) {
        console.warn('View v_customer_ledger_summary does not exist, building summary manually');

        // Get customer data
        const { data: customer } = await supabase
          .from('customers')
          .select('*')
          .eq('id', customerId)
          .single();

        // SINGLE SOURCE OF TRUTH: customers.account_balance
        const currentBalance = Number(customer?.account_balance || 0);

        // Get unpaid orders count and total
        const { data: unpaidOrders } = await supabase
          .from('orders')
          .select('total_amount, amount_paid, amount_due')
          .eq('user_id', userId)
          .eq('customer_id', customerId)
          .in('payment_status', ['Pending', 'Partial']);

        const unpaid_orders_count = unpaidOrders?.length || 0;
        const total_unpaid_amount = unpaidOrders?.reduce((sum, o) => sum + (o.amount_due || (o.total_amount - (o.amount_paid || 0))), 0) || 0;

        data = {
          customer_id: customerId,
          user_id: userId,
          full_name: customer?.full_name,
          phone: customer?.phone,
          account_balance: currentBalance, // Use balance from customer_ledger
          credit_limit: customer?.credit_limit || 0,
          last_payment_date: customer?.last_payment_date,
          last_payment_amount: customer?.last_payment_amount || 0,
          unpaid_orders_count,
          total_unpaid_amount
        };
        error = null;
      }
      // NOTE: when the view exists we trust its account_balance (= customers.account_balance),
      // the single source of truth. We no longer override it from customer_ledger.balance_after.

      if (error) throw error;

      // Always fetch last payment for accuracy
      // Try customer_payments table first, then fall back to customer_ledger
      let { data: lastPayment } = await supabase
        .from('customer_payments')
        .select('amount_received, created_at')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // If no payment found, try customer_ledger table
      if (!lastPayment) {
        const { data: ledgerPayment } = await supabase
          .from('customer_ledger')
          .select('amount, created_at')
          .eq('customer_id', customerId)
          .eq('transaction_type', 'credit')
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (ledgerPayment) {
          lastPayment = {
            amount_received: ledgerPayment.amount,
            created_at: ledgerPayment.created_at
          };
        }
      }

      if (lastPayment) {
        data.last_payment_amount = lastPayment.amount_received;
        data.last_payment_date = lastPayment.created_at?.split('T')[0];
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error fetching customer ledger summary:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all customers with outstanding balances
   */
  async getCustomersWithBalance(userId) {
    try {
      const { data, error } = await supabase
        .from('v_customer_ledger_summary')
        .select('*')
        .eq('user_id', userId)
        .gt('account_balance', 0)
        .order('account_balance', { ascending: false });

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching customers with balance:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get customer ledger statement (all transactions)
   */
  async getCustomerLedger(userId, customerId, startDate = null, endDate = null) {
    try {
      let query = supabase
        .from('customer_ledger')
        .select(`
          *,
          order:orders(order_number, order_type),
          payment:customer_payments(payment_number, payment_method, collected_by_name, collected_by_role)
        `)
        .eq('user_id', userId)
        .eq('customer_id', customerId)
        .order('transaction_date', { ascending: true })
        .order('transaction_time', { ascending: true });

      if (startDate) {
        query = query.gte('transaction_date', startDate);
      }
      if (endDate) {
        query = query.lte('transaction_date', endDate);
      }

      const { data, error } = await query;

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error fetching customer ledger:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get unpaid orders for a customer (FIFO order)
   */
  async getUnpaidOrders(userId, customerId) {
    try {
      // Customer Account orders are marked as 'Pending' and tracked via ledger
      // We fetch them by payment_method = 'Account' AND payment_status IN ('Pending', 'Partial')
      let { data, error } = await supabase
        .from('orders')
        .select('*, customer:customers(full_name, phone)')
        .eq('user_id', userId)
        .eq('customer_id', customerId)
        .eq('payment_method', 'Account')  // Only Customer Account orders
        .in('payment_status', ['Pending', 'Partial'])  // Only orders with amount due
        .order('order_date', { ascending: true })
        .order('created_at', { ascending: true });

      // Calculate days_outstanding for each order
      if (data) {
        data = data.map(order => {
          const orderDate = new Date(order.order_date);
          const today = new Date();
          const diffTime = Math.abs(today - orderDate);
          const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

          return {
            ...order,
            days_outstanding: diffDays,
            full_name: order.customer?.full_name,
            phone: order.customer?.phone
          };
        });
      }

      if (error) throw error;
      return { success: true, data: data || [] };
    } catch (error) {
      console.error('Error fetching unpaid orders:', error);
      return { success: false, error: error.message, data: [] };
    }
  }

  /**
   * Create ledger entry (updates account_balance)
   * Use this for: advance payments, adjustments
   */
  async createLedgerEntry(userId, customerId, transactionType, amount, orderId = null, paymentId = null, description, notes = null, createdBy = null) {
    try {
      // Get current balance from the LATEST ledger entry (most accurate source of truth)
      const { data: latestEntry, error: ledgerError } = await supabase
        .from('customer_ledger')
        .select('balance_after')
        .eq('customer_id', customerId)
        .eq('user_id', userId)
        .order('transaction_date', { ascending: false })
        .order('transaction_time', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Use balance from latest ledger entry, or 0 if no entries exist
      const balanceBefore = latestEntry?.balance_after || 0;
      const balanceAfter = transactionType === 'debit'
        ? balanceBefore + amount
        : balanceBefore - amount;

      // Create ledger entry
      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          user_id: userId,
          customer_id: customerId,
          transaction_type: transactionType,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          order_id: orderId,
          payment_id: paymentId,
          description,
          notes,
          created_by: createdBy
        })
        .select()
        .single();

      if (error) throw error;

      // Update customer balance
      const { error: updateError } = await supabase
        .from('customers')
        .update({ account_balance: balanceAfter })
        .eq('id', customerId);

      if (updateError) throw updateError;

      return { success: true, data };
    } catch (error) {
      console.error('Error creating ledger entry:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Create ledger entry WITHOUT updating account_balance
   * Use this for: payments applied to orders (these offset order debits, not change net balance)
   */
  async createLedgerEntryWithoutBalanceUpdate(userId, customerId, transactionType, amount, orderId = null, paymentId = null, description, notes = null, createdBy = null) {
    try {
      // Get current customer balance (for display in ledger, but don't update it)
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('account_balance')
        .eq('id', customerId)
        .single();

      if (customerError) throw customerError;

      const balanceBefore = customer.account_balance || 0;
      // For order payments, balance stays the same (payment offsets order debt)
      const balanceAfter = balanceBefore;

      // Create ledger entry (for record keeping only)
      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          user_id: userId,
          customer_id: customerId,
          transaction_type: transactionType,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          order_id: orderId,
          payment_id: paymentId,
          description,
          notes,
          created_by: createdBy
        })
        .select()
        .single();

      if (error) throw error;

      // DO NOT update customer balance - this is just recording a payment against an order
      return { success: true, data };
    } catch (error) {
      console.error('Error creating ledger entry:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Record customer payment via the atomic record_customer_payment RPC.
   * The RPC does everything in ONE transaction (race-safe): payment row +
   * ledger credit + customer balance + last-payment cache + optional finance
   * account credit. Net account balance is the single source of truth — orders
   * are not individually settled.
   *
   * paymentData: {
   *   amount, paymentMethod, referenceNumber, notes,
   *   collectedByName, collectedByRole,   // who took the payment
   *   accountId                            // payment_accounts.id to credit (finance)
   * }
   * receivedBy: owner user_id (FK customer_payments.received_by -> users.id)
   */
  async recordPayment(userId, customerId, paymentData, receivedBy = null) {
    try {
      const {
        amount, paymentMethod, referenceNumber, notes,
        collectedByName = null, collectedByRole = null, accountId = null,
      } = paymentData;

      const { data, error } = await supabase.rpc('record_customer_payment', {
        p_user_id: userId,
        p_customer_id: customerId,
        p_amount: Number(amount),
        p_payment_method: paymentMethod,
        p_collected_by_name: collectedByName,
        p_collected_by_role: collectedByRole,
        p_received_by: receivedBy || userId,
        p_reference_number: referenceNumber || null,
        p_notes: notes || null,
        p_account_id: accountId || null,
        p_payment_date: localDateStr(),
      });

      if (error) throw error;
      const result = typeof data === 'string' ? JSON.parse(data) : data;
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to record payment');
      }

      return {
        success: true,
        data: {
          payment: { id: result.payment_id, payment_number: result.payment_number },
          balanceBefore: result.balance_before,
          balanceAfter: result.balance_after,
          totalSettled: Number(amount),
        }
      };
    } catch (error) {
      console.error('Error recording payment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get payment details with allocations
   */
  async getPaymentDetails(paymentId) {
    try {
      const { data: payment, error: paymentError } = await supabase
        .from('customer_payments')
        .select(`
          *,
          customer:customers(id, full_name, phone),
          received_by_user:users!received_by(customer_name)
        `)
        .eq('id', paymentId)
        .single();

      if (paymentError) throw paymentError;

      const { data: allocations, error: allocError } = await supabase
        .from('payment_allocations')
        .select(`
          *,
          order:orders(order_number, order_type, total_amount)
        `)
        .eq('payment_id', paymentId);

      if (allocError) throw allocError;

      return {
        success: true,
        data: {
          ...payment,
          allocations
        }
      };
    } catch (error) {
      console.error('Error fetching payment details:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Search customers by name or phone
   */
  async searchCustomers(userId, searchTerm) {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('id, full_name, phone, account_balance, credit_limit')
        .eq('user_id', userId)
        .or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)
        .order('full_name', { ascending: true })
        .limit(20);

      if (error) throw error;
      return { success: true, data };
    } catch (error) {
      console.error('Error searching customers:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all customers for ledger
   */
  async getAllCustomersForLedger(userId) {
    try {
      // Use the view which calculates total_unpaid_amount from actual orders
      let { data, error } = await supabase
        .from('v_customer_ledger_summary')
        .select('*')
        .eq('user_id', userId)
        .order('full_name', { ascending: true });

      // If view doesn't exist, fallback to customers table with manual calculation
      if (error && error.message.includes('does not exist')) {
        console.warn('View v_customer_ledger_summary does not exist, using fallback query');

        const { data: customers, error: customersError } = await supabase
          .from('customers')
          .select('id, full_name, phone, account_balance, credit_limit, last_payment_date, last_payment_amount, user_id')
          .eq('user_id', userId)
          .order('full_name', { ascending: true });

        if (customersError) throw customersError;

        // For each customer, calculate unpaid amount from orders AND get actual balance from customer_ledger
        const customersWithUnpaid = await Promise.all(
          customers.map(async (customer) => {
            // Get unpaid orders
            const { data: orders } = await supabase
              .from('orders')
              .select('total_amount, amount_paid, amount_due')
              .eq('user_id', userId)
              .eq('customer_id', customer.id)
              .in('payment_status', ['Pending', 'Partial']);

            const unpaid_orders_count = orders?.length || 0;
            const total_unpaid_amount = orders?.reduce((sum, o) => sum + (o.amount_due || (o.total_amount - (o.amount_paid || 0))), 0) || 0;

            return {
              customer_id: customer.id,
              user_id: customer.user_id,
              full_name: customer.full_name,
              phone: customer.phone,
              account_balance: customer.account_balance || 0, // SINGLE SOURCE: customers.account_balance
              credit_limit: customer.credit_limit || 0,
              last_payment_date: customer.last_payment_date,
              last_payment_amount: customer.last_payment_amount || 0,
              unpaid_orders_count,
              total_unpaid_amount
            };
          })
        );

        data = customersWithUnpaid;
        error = null;
      }

      if (error) throw error;

      // account_balance comes straight from the view / customers table — the SINGLE
      // SOURCE OF TRUTH. We intentionally do NOT re-derive it from
      // customer_ledger.balance_after (non-deterministic on timestamp ties, which made
      // this report disagree with the cart).

      // Fetch last payment for each customer
      // Try customer_payments table first, then fall back to customer_ledger
      if (data && data.length > 0) {
        const customerIds = data.map(c => c.customer_id || c.id).filter(id => id);

        if (customerIds.length > 0) {
          // Try getting from customer_payments table first
          let { data: payments, error: paymentsError } = await supabase
            .from('customer_payments')
            .select('customer_id, amount_received, created_at')
            .in('customer_id', customerIds)
            .order('created_at', { ascending: false });

          // If no payments found or error, try getting from customer_ledger table
          if (paymentsError || !payments || payments.length === 0) {
            const { data: ledgerPayments } = await supabase
              .from('customer_ledger')
              .select('customer_id, amount, created_at')
              .in('customer_id', customerIds)
              .eq('transaction_type', 'credit')
              .order('created_at', { ascending: false });

            if (ledgerPayments && ledgerPayments.length > 0) {
              // Convert to same format as customer_payments
              payments = ledgerPayments.map(p => ({
                customer_id: p.customer_id,
                amount_received: p.amount,
                created_at: p.created_at
              }));
            }
          }

          if (payments && payments.length > 0) {
            // Group by customer_id and get the most recent payment
            const lastPaymentByCustomer = {};
            for (const payment of payments) {
              if (!lastPaymentByCustomer[payment.customer_id]) {
                lastPaymentByCustomer[payment.customer_id] = payment;
              }
            }

            // Update data with last payment info
            data = data.map(customer => {
              const customerId = customer.customer_id || customer.id;
              const lastPayment = lastPaymentByCustomer[customerId];
              if (lastPayment) {
                return {
                  ...customer,
                  last_payment_amount: lastPayment.amount_received,
                  last_payment_date: lastPayment.created_at?.split('T')[0]
                };
              }
              return customer;
            });
          }
        }
      }

      return { success: true, data };
    } catch (error) {
      console.error('Error fetching customers:', error);
      return { success: false, error: error.message };
    }
  }
}

export const ledgerManager = new LedgerManager();
