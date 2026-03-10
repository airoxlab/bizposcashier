// lib/pettyCashManager.js
import { supabase } from './supabase'
import { authManager } from './authManager'

class PettyCashManager {
  constructor() {
    this.currentUser = null
  }

  async initialize() {
    this.currentUser = authManager.getCurrentUser()
    return this.currentUser
  }

  /**
   * ACCOUNT MANAGEMENT
   */

  // Create new petty cash account
  async createAccount(accountData) {
    const user = await this.ensureUser()

    const { data, error } = await supabase
      .from('petty_cash_accounts')
      .insert({
        user_id: user.id,
        assigned_to_user_id: accountData.assignedToUserId,
        assigned_to_cashier_id: accountData.assignedToCashierId,
        account_name: accountData.accountName,
        account_code: accountData.accountCode,
        opening_balance: accountData.openingBalance,
        current_balance: accountData.openingBalance,
        daily_limit: accountData.dailyLimit,
        transaction_limit: accountData.transactionLimit,
        approval_threshold: accountData.approvalThreshold,
        minimum_balance: accountData.minimumBalance,
        description: accountData.description,
        created_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    // Create initial allocation transaction
    if (accountData.openingBalance > 0) {
      await this.createTransaction({
        pettyCashAccountId: data.id,
        transactionType: 'allocation',
        amount: accountData.openingBalance,
        description: 'Initial allocation',
        balanceBefore: 0,
        requiresApproval: false,
        approvalStatus: 'approved'
      })
    }

    return data
  }

  // Get all accounts (with brand filter support)
  async getAccounts(filters = {}) {
    const user = await this.ensureUser()

    let query = supabase
      .from('petty_cash_accounts')
      .select(`
        *,
        assigned_user:assigned_to_user_id(id, store_name),
        assigned_cashier:assigned_to_cashier_id(id, name, email)
      `)

    // Apply brand filter if provided
    if (filters.userIds && filters.userIds.length > 0) {
      query = query.in('user_id', filters.userIds)
    } else {
      query = query.eq('user_id', user.id)
    }

    // Apply status filter
    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    // Active accounts only
    if (filters.activeOnly) {
      query = query.eq('is_active', true)
    }

    query = query.order('created_at', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    return data
  }

  // Get single account with full details
  async getAccountById(accountId) {
    const { data, error } = await supabase
      .from('petty_cash_accounts')
      .select(`
        *,
        assigned_user:assigned_to_user_id(id, store_name, email),
        assigned_cashier:assigned_to_cashier_id(id, name, email, phone)
      `)
      .eq('id', accountId)
      .single()

    if (error) throw error
    return data
  }

  // Get user's assigned account
  async getMyAccount() {
    const user = await this.ensureUser()

    // Check if user is a cashier (has cashier_id) or regular user
    const cashierId = user.cashier_id || user.id
    const isCashier = !!user.cashier_id

    // Try to find account assigned to this cashier/user
    let query = supabase
      .from('petty_cash_accounts')
      .select('*')
      .eq('is_active', true)

    // If cashier, look by cashier_id, otherwise by user_id
    if (isCashier) {
      query = query.eq('assigned_to_cashier_id', cashierId)
    } else {
      query = query.or(`assigned_to_user_id.eq.${user.id},assigned_to_cashier_id.eq.${user.id}`)
    }

    const { data, error } = await query.single()

    if (error && error.code !== 'PGRST116') throw error // Ignore "not found"
    return data
  }

  // Update account
  async updateAccount(accountId, updates) {
    const { data, error } = await supabase
      .from('petty_cash_accounts')
      .update(updates)
      .eq('id', accountId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Suspend account
  async suspendAccount(accountId, reason) {
    return this.updateAccount(accountId, {
      status: 'suspended',
      is_active: false,
      notes: reason
    })
  }

  // Close account
  async closeAccount(accountId, reason) {
    const user = await this.ensureUser()

    return this.updateAccount(accountId, {
      status: 'closed',
      is_active: false,
      closed_at: new Date().toISOString(),
      closed_by: user.id,
      notes: reason
    })
  }

  /**
   * TRANSACTION MANAGEMENT
   */

  // Create transaction
  async createTransaction(transactionData) {
    const user = await this.ensureUser()

    // Get account to check balance
    const account = await this.getAccountById(transactionData.pettyCashAccountId)

    // Calculate balance_before and balance_after
    const balanceBefore = transactionData.balanceBefore !== undefined ? transactionData.balanceBefore : account.current_balance
    let balanceAfter = balanceBefore

    // Calculate balance_after based on transaction type
    switch (transactionData.transactionType) {
      case 'allocation':
      case 'replenishment':
        balanceAfter = balanceBefore + transactionData.amount
        break
      case 'expense':
        balanceAfter = balanceBefore - transactionData.amount
        break
      case 'adjustment':
        balanceAfter = transactionData.amount // Direct balance set
        break
      case 'reconciliation':
        balanceAfter = balanceBefore // No change for reconciliation record
        break
      default:
        balanceAfter = balanceBefore
    }

    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .insert({
        petty_cash_account_id: transactionData.pettyCashAccountId,
        user_id: user.id,
        transaction_type: transactionData.transactionType,
        transaction_date: transactionData.transactionDate || new Date().toISOString().split('T')[0],
        transaction_time: transactionData.transactionTime || new Date().toTimeString().split(' ')[0],
        amount: transactionData.amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        expense_id: transactionData.expenseId,
        expense_category_id: transactionData.categoryId,
        expense_subcategory_id: transactionData.subcategoryId,
        payment_method: transactionData.paymentMethod || 'Cash',
        tax_rate: transactionData.taxRate || 0,
        tax_amount: transactionData.taxAmount || 0,
        receipt_image_url: transactionData.receiptImageUrl,
        requires_approval: transactionData.requiresApproval || false,
        approval_status: transactionData.approvalStatus || (transactionData.requiresApproval ? 'pending' : 'approved'),
        reconciliation_id: transactionData.reconciliationId || null,
        description: transactionData.description,
        notes: transactionData.notes,
        reference_number: transactionData.referenceNumber,
        recorded_by: user.id
      })
      .select()
      .single()

    if (error) throw error

    // Update account balance (if approved or doesn't require approval)
    const isApproved = !transactionData.requiresApproval || transactionData.approvalStatus === 'approved'
    if (isApproved && transactionData.transactionType !== 'reconciliation') {
      await this.updateAccount(transactionData.pettyCashAccountId, {
        current_balance: balanceAfter
      })
    }

    return data
  }

  // Record expense from petty cash
  async recordExpense(expenseData) {
    const user = await this.ensureUser()
    const account = await this.getAccountById(expenseData.pettyCashAccountId)

    // Validation
    await this.validateExpense(account, expenseData.amount)

    // Determine if approval required
    const requiresApproval = expenseData.amount > account.approval_threshold

    // Create expense in expenses table
    const { data: expense, error: expenseError } = await supabase
      .from('expenses')
      .insert({
        user_id: user.id,
        amount: expenseData.amount,
        payment_method: 'Petty Cash',
        category_id: expenseData.categoryId,
        subcategory_id: expenseData.subcategoryId,
        description: expenseData.description,
        receipt_image_url: expenseData.receiptImageUrl,
        expense_date: expenseData.expenseDate || new Date().toISOString().split('T')[0],
        tax_rate: expenseData.taxRate || 0,
        tax_amount: expenseData.taxAmount || 0,
        total_amount: expenseData.amount + (expenseData.taxAmount || 0)
      })
      .select()
      .single()

    if (expenseError) throw expenseError

    // Create petty cash transaction
    const transaction = await this.createTransaction({
      pettyCashAccountId: expenseData.pettyCashAccountId,
      transactionType: 'expense',
      amount: expenseData.amount,
      balanceBefore: account.current_balance,
      expenseId: expense.id,
      categoryId: expenseData.categoryId,
      subcategoryId: expenseData.subcategoryId,
      taxRate: expenseData.taxRate,
      taxAmount: expenseData.taxAmount,
      receiptImageUrl: expenseData.receiptImageUrl,
      description: expenseData.description,
      requiresApproval: requiresApproval
    })

    return { expense, transaction, requiresApproval }
  }

  // Validate expense
  async validateExpense(account, amount) {
    if (!account.is_active || account.status !== 'active') {
      throw new Error('Petty cash account is not active')
    }

    if (account.current_balance < amount) {
      throw new Error(`Insufficient balance. Available: ${account.current_balance}`)
    }

    if (account.transaction_limit && amount > account.transaction_limit) {
      throw new Error(`Amount exceeds transaction limit of ${account.transaction_limit}`)
    }

    // Check daily limit
    if (account.daily_limit) {
      const todayTotal = await this.getTodayExpenseTotal(account.id)
      if ((todayTotal + amount) > account.daily_limit) {
        throw new Error(`Daily limit of ${account.daily_limit} exceeded`)
      }
    }

    return true
  }

  // Get today's expense total
  async getTodayExpenseTotal(accountId) {
    const today = new Date().toISOString().split('T')[0]

    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .select('amount')
      .eq('petty_cash_account_id', accountId)
      .eq('transaction_type', 'expense')
      .eq('transaction_date', today)
      .eq('approval_status', 'approved')

    if (error) throw error

    return data.reduce((sum, t) => sum + parseFloat(t.amount), 0)
  }

  // Get transactions
  async getTransactions(filters = {}) {
    let query = supabase
      .from('petty_cash_transactions')
      .select(`
        *,
        category:expense_category_id!left(name),
        subcategory:expense_subcategory_id!left(name),
        approver:approved_by!left(store_name),
        recorder:recorded_by!left(store_name)
      `)

    if (filters.accountId) {
      query = query.eq('petty_cash_account_id', filters.accountId)
    }

    if (filters.transactionType) {
      query = query.eq('transaction_type', filters.transactionType)
    }

    if (filters.dateFrom) {
      query = query.gte('transaction_date', filters.dateFrom)
    }

    if (filters.dateTo) {
      query = query.lte('transaction_date', filters.dateTo)
    }

    if (filters.approvalStatus) {
      query = query.eq('approval_status', filters.approvalStatus)
    }

    query = query.order('transaction_date', { ascending: false })
      .order('transaction_time', { ascending: false })

    if (filters.limit) {
      query = query.limit(filters.limit)
    }

    const { data, error } = await query
    if (error) throw error

    return data
  }

  /**
   * APPROVAL MANAGEMENT
   */

  // Get pending approvals
  async getPendingApprovals(filters = {}) {
    const user = await this.ensureUser()

    let query = supabase
      .from('petty_cash_transactions')
      .select(`
        *,
        account:petty_cash_account_id!left(account_name, account_code),
        category:expense_category_id!left(name),
        subcategory:expense_subcategory_id!left(name),
        recorder:recorded_by!left(store_name)
      `)
      .eq('requires_approval', true)
      .eq('approval_status', 'pending')

    // Only show approvals for accounts owned by current user
    if (filters.userIds && filters.userIds.length > 0) {
      // Apply brand filter
      const accounts = await this.getAccounts({ userIds: filters.userIds })
      const accountIds = accounts.map(a => a.id)
      query = query.in('petty_cash_account_id', accountIds)
    } else {
      query = query.eq('user_id', user.id)
    }

    query = query.order('created_at', { ascending: true })

    const { data, error } = await query
    if (error) throw error

    return data
  }

  // Approve transaction
  async approveTransaction(transactionId, approverNotes = null) {
    const user = await this.ensureUser()

    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .update({
        approval_status: 'approved',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: approverNotes
      })
      .eq('id', transactionId)
      .select()
      .single()

    if (error) throw error

    // Trigger will update account balance automatically
    return data
  }

  // Reject transaction
  async rejectTransaction(transactionId, rejectionReason) {
    const user = await this.ensureUser()

    const { data, error } = await supabase
      .from('petty_cash_transactions')
      .update({
        approval_status: 'rejected',
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        rejection_reason: rejectionReason
      })
      .eq('id', transactionId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  /**
   * RECONCILIATION
   */

  // Initiate reconciliation
  async createReconciliation(reconciliationData) {
    const user = await this.ensureUser()
    const account = await this.getAccountById(reconciliationData.pettyCashAccountId)

    // Get transactions for period
    const transactions = await this.getTransactions({
      accountId: reconciliationData.pettyCashAccountId,
      dateFrom: reconciliationData.periodStartDate,
      dateTo: reconciliationData.periodEndDate
    })

    // Calculate summary
    const receipts = transactions
      .filter(t => ['allocation', 'replenishment'].includes(t.transaction_type))
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)

    const payments = transactions
      .filter(t => t.transaction_type === 'expense')
      .reduce((sum, t) => sum + parseFloat(t.amount), 0)

    const variance = reconciliationData.actualBalance - reconciliationData.expectedBalance

    const { data, error } = await supabase
      .from('petty_cash_reconciliations')
      .insert({
        petty_cash_account_id: reconciliationData.pettyCashAccountId,
        user_id: user.id,
        reconciliation_date: reconciliationData.reconciliationDate || new Date().toISOString().split('T')[0],
        period_start_date: reconciliationData.periodStartDate,
        period_end_date: reconciliationData.periodEndDate,
        opening_balance: reconciliationData.openingBalance,
        expected_balance: reconciliationData.expectedBalance,
        actual_balance: reconciliationData.actualBalance,
        variance: variance,
        total_receipts: receipts,
        total_payments: payments,
        transaction_count: transactions.length,
        status: variance === 0 ? 'completed' : 'pending',
        variance_reason: reconciliationData.varianceReason,
        reconciled_by: user.id,
        notes: reconciliationData.notes
      })
      .select()
      .single()

    if (error) throw error

    // Mark transactions as reconciled
    await supabase
      .from('petty_cash_transactions')
      .update({
        reconciliation_id: data.id,
        is_reconciled: true
      })
      .eq('petty_cash_account_id', reconciliationData.pettyCashAccountId)
      .gte('transaction_date', reconciliationData.periodStartDate)
      .lte('transaction_date', reconciliationData.periodEndDate)

    // If variance, create adjustment transaction
    if (variance !== 0) {
      await this.createTransaction({
        pettyCashAccountId: reconciliationData.pettyCashAccountId,
        transactionType: 'reconciliation',
        amount: Math.abs(variance),
        balanceBefore: account.current_balance,
        description: `Reconciliation adjustment: ${variance > 0 ? 'surplus' : 'shortage'}`,
        notes: reconciliationData.varianceReason,
        requiresApproval: variance < 0, // Shortages need approval
        reconciliationId: data.id
      })
    }

    return data
  }

  // Get reconciliations
  async getReconciliations(filters = {}) {
    let query = supabase
      .from('petty_cash_reconciliations')
      .select(`
        *,
        account:petty_cash_account_id(account_name, account_code),
        reconciler:reconciled_by(store_name),
        approver:approved_by(store_name)
      `)

    if (filters.accountId) {
      query = query.eq('petty_cash_account_id', filters.accountId)
    }

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    query = query.order('reconciliation_date', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    return data
  }

  /**
   * REPLENISHMENT
   */

  // Request replenishment
  async requestReplenishment(replenishmentData) {
    const user = await this.ensureUser()
    const account = await this.getAccountById(replenishmentData.pettyCashAccountId)

    const { data, error } = await supabase
      .from('petty_cash_replenishments')
      .insert({
        petty_cash_account_id: replenishmentData.pettyCashAccountId,
        user_id: user.id,
        requested_amount: replenishmentData.requestedAmount,
        current_balance: account.current_balance,
        justification: replenishmentData.justification,
        requested_by: user.id,
        notes: replenishmentData.notes
      })
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Approve replenishment
  async approveReplenishment(replenishmentId, approvedAmount, notes = null) {
    const user = await this.ensureUser()

    // Get replenishment details first
    const { data: replenishment } = await supabase
      .from('petty_cash_replenishments')
      .select('*, account:petty_cash_account_id(*)')
      .eq('id', replenishmentId)
      .single()

    if (!replenishment) {
      throw new Error('Replenishment not found')
    }

    // Create replenishment transaction to add money to account
    const transaction = await this.createTransaction({
      pettyCashAccountId: replenishment.petty_cash_account_id,
      transactionType: 'replenishment',
      amount: approvedAmount,
      balanceBefore: replenishment.account.current_balance,
      description: `Replenishment approved: ${replenishment.justification}`,
      requiresApproval: false,
      approvalStatus: 'approved',
      notes: notes
    })

    // Update replenishment record to completed status
    const { data, error } = await supabase
      .from('petty_cash_replenishments')
      .update({
        status: 'completed',
        approved_amount: approvedAmount,
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        disbursed_by: user.id,
        disbursed_at: new Date().toISOString(),
        transaction_id: transaction.id,
        notes: notes
      })
      .eq('id', replenishmentId)
      .select()
      .single()

    if (error) throw error
    return data
  }

  // Disburse replenishment
  async disburseReplenishment(replenishmentId, disbursementData) {
    const user = await this.ensureUser()

    // Get replenishment details
    const { data: replenishment } = await supabase
      .from('petty_cash_replenishments')
      .select('*, account:petty_cash_account_id(*)')
      .eq('id', replenishmentId)
      .single()

    if (replenishment.status !== 'approved') {
      throw new Error('Replenishment must be approved first')
    }

    // Create replenishment transaction
    const transaction = await this.createTransaction({
      pettyCashAccountId: replenishment.petty_cash_account_id,
      transactionType: 'replenishment',
      amount: replenishment.approved_amount,
      balanceBefore: replenishment.account.current_balance,
      description: `Replenishment: ${replenishment.justification}`,
      referenceNumber: disbursementData.referenceNumber,
      requiresApproval: false,
      approvalStatus: 'approved'
    })

    // Update replenishment record
    const { data, error } = await supabase
      .from('petty_cash_replenishments')
      .update({
        status: 'completed',
        disbursed_by: user.id,
        disbursed_at: new Date().toISOString(),
        disbursement_method: disbursementData.disbursementMethod,
        reference_number: disbursementData.referenceNumber,
        transaction_id: transaction.id
      })
      .eq('id', replenishmentId)
      .select()
      .single()

    if (error) throw error
    return { replenishment: data, transaction }
  }

  // Get replenishments
  async getReplenishments(filters = {}) {
    let query = supabase
      .from('petty_cash_replenishments')
      .select(`
        *,
        account:petty_cash_account_id(account_name, account_code),
        requester:requested_by(store_name),
        approver:approved_by(store_name),
        disburser:disbursed_by(store_name)
      `)

    if (filters.accountId) {
      query = query.eq('petty_cash_account_id', filters.accountId)
    }

    if (filters.status) {
      query = query.eq('status', filters.status)
    }

    query = query.order('request_date', { ascending: false })

    const { data, error } = await query
    if (error) throw error

    return data
  }

  /**
   * REPORTS & ANALYTICS
   */

  // Get account summary
  async getAccountSummary(accountId, dateFrom, dateTo) {
    const account = await this.getAccountById(accountId)
    const transactions = await this.getTransactions({
      accountId,
      dateFrom,
      dateTo
    })

    const summary = {
      account,
      period: { from: dateFrom, to: dateTo },
      transactions: transactions.length,
      totalAllocated: transactions
        .filter(t => t.transaction_type === 'allocation')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0),
      totalExpenses: transactions
        .filter(t => t.transaction_type === 'expense')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0),
      totalReplenished: transactions
        .filter(t => t.transaction_type === 'replenishment')
        .reduce((sum, t) => sum + parseFloat(t.amount), 0),
      pendingApprovals: transactions
        .filter(t => t.requires_approval && t.approval_status === 'pending').length,
      categoryBreakdown: this.groupByCategory(transactions),
      dailyTrend: this.groupByDate(transactions)
    }

    return summary
  }

  // Group transactions by category
  groupByCategory(transactions) {
    const expenses = transactions.filter(t => t.transaction_type === 'expense')
    const grouped = {}

    expenses.forEach(t => {
      const categoryName = t.category?.name || 'Uncategorized'
      if (!grouped[categoryName]) {
        grouped[categoryName] = {
          count: 0,
          total: 0,
          icon: t.category?.icon,
          color: t.category?.color
        }
      }
      grouped[categoryName].count++
      grouped[categoryName].total += parseFloat(t.amount)
    })

    return Object.entries(grouped).map(([name, data]) => ({
      name,
      ...data
    }))
  }

  // Group transactions by date
  groupByDate(transactions) {
    const grouped = {}

    transactions.forEach(t => {
      const date = t.transaction_date
      if (!grouped[date]) {
        grouped[date] = {
          allocations: 0,
          expenses: 0,
          replenishments: 0
        }
      }

      if (t.transaction_type === 'allocation') {
        grouped[date].allocations += parseFloat(t.amount)
      } else if (t.transaction_type === 'expense') {
        grouped[date].expenses += parseFloat(t.amount)
      } else if (t.transaction_type === 'replenishment') {
        grouped[date].replenishments += parseFloat(t.amount)
      }
    })

    return Object.entries(grouped).map(([date, data]) => ({
      date,
      ...data
    }))
  }

  // Get alerts
  async getAlerts(userIds = []) {
    const user = await this.ensureUser()
    const accounts = await this.getAccounts({
      userIds: userIds.length > 0 ? userIds : [user.id],
      activeOnly: true
    })

    const alerts = []

    for (const account of accounts) {
      // Low balance alert
      if (account.minimum_balance && account.current_balance < account.minimum_balance) {
        alerts.push({
          type: 'low_balance',
          severity: 'warning',
          accountId: account.id,
          accountName: account.account_name,
          message: `Balance ${account.current_balance} is below minimum ${account.minimum_balance}`,
          currentBalance: account.current_balance,
          minimumBalance: account.minimum_balance
        })
      }

      // Pending reconciliation
      const { data: lastReconciliation } = await supabase
        .from('petty_cash_reconciliations')
        .select('reconciliation_date')
        .eq('petty_cash_account_id', account.id)
        .order('reconciliation_date', { ascending: false })
        .limit(1)
        .single()

      if (!lastReconciliation) {
        alerts.push({
          type: 'no_reconciliation',
          severity: 'info',
          accountId: account.id,
          accountName: account.account_name,
          message: 'No reconciliation performed yet'
        })
      }
    }

    return alerts
  }

  /**
   * UTILITIES
   */

  async ensureUser() {
    if (!this.currentUser) {
      this.currentUser = authManager.getCurrentUser()
    }
    if (!this.currentUser) {
      throw new Error('User not authenticated')
    }
    return this.currentUser
  }
}

// Export singleton instance
const pettyCashManager = new PettyCashManager()
export default pettyCashManager
