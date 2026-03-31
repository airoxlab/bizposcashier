import { supabase } from './supabase'

class CustomerLedgerManager {
  constructor() {
    this.userId = null
  }

  setUserId(userId) {
    this.userId = userId
  }

  /** Cache customer balance in localStorage for offline access */
  _cacheBalance(customerId, balance) {
    try {
      if (typeof localStorage === 'undefined') return
      const cached = JSON.parse(localStorage.getItem('customer_ledger_balances') || '{}')
      cached[customerId] = { balance, updatedAt: new Date().toISOString() }
      localStorage.setItem('customer_ledger_balances', JSON.stringify(cached))
    } catch (_) {}
  }

  /** Retrieve last-known cached balance (used when offline) */
  _getCachedBalance(customerId) {
    try {
      if (typeof localStorage === 'undefined') return 0
      const cached = JSON.parse(localStorage.getItem('customer_ledger_balances') || '{}')
      return cached[customerId]?.balance ?? 0
    } catch (_) {
      return 0
    }
  }

  /**
   * Get customer's current ledger balance.
   * When online: queries Supabase and caches result.
   * When offline: returns last-known cached balance.
   */
  async getCustomerBalance(customerId) {
    // NOTE: We do NOT use navigator.onLine here — it's unreliable in packaged Electron
    // (can return false even when internet is available). Instead we just try the fetch
    // and fall back to cached balance on any error.

    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      // Get the most recent ledger entry to find current balance
      const { data, error } = await supabase
        .from('customer_ledger')
        .select('balance_after')
        .eq('customer_id', customerId)
        .eq('user_id', this.userId)
        .order('transaction_date', { ascending: false })
        .order('transaction_time', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('Error fetching customer balance:', error)
        return this._getCachedBalance(customerId) // fallback to cache
      }

      const balance = data?.balance_after || 0
      this._cacheBalance(customerId, balance) // keep cache fresh
      return balance
    } catch (error) {
      console.error('Error in getCustomerBalance:', error)
      return this._getCachedBalance(customerId) // fallback to cache
    }
  }

  /**
   * Create a debit entry (customer owes money)
   */
  async createDebitEntry(customerId, orderId, amount, description, notes = null) {
    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      if (!customerId) {
        throw new Error('Customer ID is required for ledger entry')
      }

      // Get current balance
      const balanceBefore = await this.getCustomerBalance(customerId)
      const balanceAfter = balanceBefore + amount // Debit increases what they owe

      console.log('💳 [Ledger] Creating debit entry:', {
        customerId,
        orderId,
        amount,
        balanceBefore,
        balanceAfter
      })

      // Create ledger entry
      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          user_id: this.userId,
          customer_id: customerId,
          transaction_type: 'debit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          order_id: orderId,
          description: description,
          notes: notes,
          created_by: this.userId
        })
        .select()
        .single()

      if (error) throw error

      console.log('✅ [Ledger] Debit entry created:', data)

      return {
        success: true,
        ledgerEntry: data,
        previousBalance: balanceBefore,
        newBalance: balanceAfter
      }
    } catch (error) {
      console.error('❌ [Ledger] Failed to create debit entry:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Create a credit entry (customer pays money)
   */
  async createCreditEntry(customerId, paymentId, amount, description, notes = null) {
    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      if (!customerId) {
        throw new Error('Customer ID is required for ledger entry')
      }

      // Get current balance
      const balanceBefore = await this.getCustomerBalance(customerId)
      const balanceAfter = balanceBefore - amount // Credit decreases what they owe

      console.log('💳 [Ledger] Creating credit entry:', {
        customerId,
        paymentId,
        amount,
        balanceBefore,
        balanceAfter
      })

      // Create ledger entry
      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          user_id: this.userId,
          customer_id: customerId,
          transaction_type: 'credit',
          amount: amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          payment_id: paymentId,
          transaction_date: new Date().toISOString().split('T')[0],
          description: description,
          notes: notes,
          created_by: this.userId
        })
        .select()
        .single()

      if (error) throw error

      console.log('✅ [Ledger] Credit entry created:', data)

      return {
        success: true,
        ledgerEntry: data,
        previousBalance: balanceBefore,
        newBalance: balanceAfter
      }
    } catch (error) {
      console.error('❌ [Ledger] Failed to create credit entry:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Create an adjustment entry (manual correction)
   */
  async createAdjustmentEntry(customerId, amount, isIncrease, description, notes = null) {
    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      if (!customerId) {
        throw new Error('Customer ID is required for ledger entry')
      }

      // Get current balance
      const balanceBefore = await this.getCustomerBalance(customerId)
      const balanceAfter = isIncrease ? balanceBefore + amount : balanceBefore - amount

      console.log('💳 [Ledger] Creating adjustment entry:', {
        customerId,
        amount,
        isIncrease,
        balanceBefore,
        balanceAfter
      })

      // Create ledger entry
      const { data, error } = await supabase
        .from('customer_ledger')
        .insert({
          user_id: this.userId,
          customer_id: customerId,
          transaction_type: 'adjustment',
          amount: Math.abs(amount),
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: description,
          notes: notes,
          created_by: this.userId
        })
        .select()
        .single()

      if (error) throw error

      console.log('✅ [Ledger] Adjustment entry created:', data)

      return {
        success: true,
        ledgerEntry: data,
        previousBalance: balanceBefore,
        newBalance: balanceAfter
      }
    } catch (error) {
      console.error('❌ [Ledger] Failed to create adjustment entry:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Get customer ledger history
   */
  async getCustomerLedger(customerId, limit = 50) {
    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      const { data, error } = await supabase
        .from('customer_ledger')
        .select('*')
        .eq('customer_id', customerId)
        .eq('user_id', this.userId)
        .order('transaction_date', { ascending: false })
        .order('transaction_time', { ascending: false })
        .limit(limit)

      if (error) throw error

      return {
        success: true,
        ledger: data || []
      }
    } catch (error) {
      console.error('❌ [Ledger] Failed to fetch customer ledger:', error)
      return {
        success: false,
        error: error.message,
        ledger: []
      }
    }
  }

  /**
   * Get ledger summary for a customer
   */
  async getCustomerLedgerSummary(customerId) {
    try {
      if (!this.userId) {
        throw new Error('User ID not set in CustomerLedgerManager')
      }

      // Get current balance
      const currentBalance = await this.getCustomerBalance(customerId)

      // Get total debits (what they owe)
      const { data: debitsData } = await supabase
        .from('customer_ledger')
        .select('amount')
        .eq('customer_id', customerId)
        .eq('user_id', this.userId)
        .eq('transaction_type', 'debit')

      const totalDebits = debitsData?.reduce((sum, entry) => sum + parseFloat(entry.amount), 0) || 0

      // Get total credits (what they paid)
      const { data: creditsData } = await supabase
        .from('customer_ledger')
        .select('amount')
        .eq('customer_id', customerId)
        .eq('user_id', this.userId)
        .eq('transaction_type', 'credit')

      const totalCredits = creditsData?.reduce((sum, entry) => sum + parseFloat(entry.amount), 0) || 0

      return {
        success: true,
        summary: {
          currentBalance,
          totalDebits,
          totalCredits,
          totalOrders: debitsData?.length || 0,
          totalPayments: creditsData?.length || 0
        }
      }
    } catch (error) {
      console.error('❌ [Ledger] Failed to fetch ledger summary:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }
}

// Create singleton instance
const customerLedgerManager = new CustomerLedgerManager()

export default customerLedgerManager
