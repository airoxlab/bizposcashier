/**
 * Customer Ledger Tab Component
 * Displays customer account ledger with payments and outstanding balances
 */

import { useState, useEffect } from 'react';
import { Search, DollarSign, Calendar, FileText, Plus, Download, User, CreditCard } from 'lucide-react';
import { ledgerManager } from '../../lib/ledgerManager';
import { notify } from '../ui/NotificationSystem';
import RecordPaymentModal from './RecordPaymentModal';
import { themeManager } from '../../lib/themeManager';

export default function LedgerTab({ userId, startDate, endDate }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [customers, setCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [ledgerData, setLedgerData] = useState([]);
  const [customerSummary, setCustomerSummary] = useState(null);
  const [unpaidOrders, setUnpaidOrders] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showLedgerDetails, setShowLedgerDetails] = useState(false);

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);

  // Time period filter
  const [timePeriod, setTimePeriod] = useState('lifetime');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Fetch all customers on component mount
  useEffect(() => {
    if (userId) {
      fetchCustomers();
    }
  }, [userId]);

  // Fetch ledger when customer is selected or time period changes
  useEffect(() => {
    if (selectedCustomer && userId) {
      fetchCustomerLedger();
    }
  }, [selectedCustomer, userId, timePeriod, customStartDate, customEndDate]);

  const fetchCustomers = async () => {
    const result = await ledgerManager.getAllCustomersForLedger(userId);
    if (result.success) {
      setCustomers(result.data || []);
    } else {
      notify.error('Failed to load customers');
    }
  };

  const fetchCustomerLedger = async () => {
    setIsLoading(true);
    try {
      // Get date range based on time period filter
      const dateRange = getDateRange();
      const filterStartDate = dateRange.start ? dateRange.start.toISOString().split('T')[0] : null;
      const filterEndDate = dateRange.end ? dateRange.end.toISOString().split('T')[0] : null;

      // Fetch ledger summary
      const summaryResult = await ledgerManager.getCustomerLedgerSummary(userId, selectedCustomer.id);
      if (summaryResult.success) {
        setCustomerSummary(summaryResult.data);
      }

      // Fetch ledger transactions with time filter
      const ledgerResult = await ledgerManager.getCustomerLedger(userId, selectedCustomer.id, filterStartDate, filterEndDate);
      if (ledgerResult.success) {
        setLedgerData(ledgerResult.data || []);
      }

      // Fetch unpaid orders
      const unpaidResult = await ledgerManager.getUnpaidOrders(userId, selectedCustomer.id);
      if (unpaidResult.success) {
        setUnpaidOrders(unpaidResult.data || []);
      }
    } catch (error) {
      notify.error('Failed to load ledger data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCustomerSelect = (customer) => {
    // Normalize customer object (view returns customer_id, direct query returns id)
    const normalizedCustomer = {
      ...customer,
      id: customer.customer_id || customer.id
    };
    setSelectedCustomer(normalizedCustomer);
    setSearchTerm('');
    setShowLedgerDetails(true);
  };

  const handleBackToOverview = () => {
    setSelectedCustomer(null);
    setShowLedgerDetails(false);
    setLedgerData([]);
    setCustomerSummary(null);
    setUnpaidOrders([]);
  };

  const handlePaymentRecorded = () => {
    fetchCustomerLedger();
    fetchCustomers(); // Refresh customer list to update last payment info
    setShowPaymentModal(false);
    notify.success('Payment recorded successfully');
  };

  // Helper function to get date range based on time period
  const getDateRange = () => {
    const today = new Date();
    const startOfToday = new Date(today.setHours(0, 0, 0, 0));
    const endOfToday = new Date(today.setHours(23, 59, 59, 999));

    switch (timePeriod) {
      case 'today':
        return { start: startOfToday, end: endOfToday };
      case 'yesterday':
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        return { start: new Date(yesterday.setHours(0, 0, 0, 0)), end: new Date(yesterday.setHours(23, 59, 59, 999)) };
      case 'week':
        const weekStart = new Date(today);
        weekStart.setDate(weekStart.getDate() - 7);
        return { start: weekStart, end: endOfToday };
      case 'month':
        const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
        return { start: monthStart, end: endOfToday };
      case 'custom':
        return {
          start: customStartDate ? new Date(customStartDate) : null,
          end: customEndDate ? new Date(customEndDate) : null
        };
      case 'lifetime':
      default:
        return { start: null, end: null };
    }
  };

  // Helper function to get effective balance from ledger (single source of truth)
  const getEffectiveBalance = (customer) => {
    // Ledger balance is the single source of truth
    return customer.account_balance || 0;
  };

  // Sort customers: With history first, then alphabetically
  const sortedCustomers = [...customers].sort((a, b) => {
    const aHasHistory = getEffectiveBalance(a) !== 0 || (a.last_payment_amount || 0) > 0 || (a.unpaid_orders_count || 0) > 0;
    const bHasHistory = getEffectiveBalance(b) !== 0 || (b.last_payment_amount || 0) > 0 || (b.unpaid_orders_count || 0) > 0;

    // Customers with history come first
    if (aHasHistory && !bHasHistory) return -1;
    if (!aHasHistory && bHasHistory) return 1;

    // Within same group, sort by name
    return (a.full_name || '').localeCompare(b.full_name || '');
  });

  const filteredCustomers = sortedCustomers.filter(c =>
    c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    c.phone?.includes(searchTerm)
  );

  // Pagination logic
  const totalPages = Math.ceil(filteredCustomers.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCustomers = filteredCustomers.slice(startIndex, endIndex);

  const formatCurrency = (amount) => {
    const num = Number(amount || 0);
    // Credit balance should be shown as positive with "Credit" label
    return `Rs ${Math.abs(num).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  const getBalanceDisplay = (balance) => {
    const num = Number(balance || 0);
    if (num > 0) {
      // Customer owes money
      return { amount: formatCurrency(num), type: 'debit', color: isDark ? 'text-red-400' : 'text-red-600' };
    } else if (num < 0) {
      // Customer has credit (advance payment)
      return { amount: formatCurrency(num), type: 'credit', color: isDark ? 'text-green-400' : 'text-green-600' };
    } else {
      return { amount: formatCurrency(0), type: 'clear', color: isDark ? 'text-gray-400' : 'text-gray-500' };
    }
  };

  // Export ledger statement to CSV
  const exportLedgerToCSV = () => {
    if (!selectedCustomer || !ledgerData || ledgerData.length === 0) {
      notify.error('No ledger data to export');
      return;
    }

    // Prepare CSV content
    const headers = ['Date', 'Description', 'Order #', 'Debit (Dr)', 'Credit (Cr)', 'Balance'];

    const rows = ledgerData.map(entry => {
      const date = formatDate(entry.created_at);
      const description = entry.description || '';
      const orderNumber = entry.order?.order_number || '-';
      const debit = entry.transaction_type === 'debit' ? Number(entry.amount || 0) : '';
      const credit = entry.transaction_type === 'credit' ? Number(entry.amount || 0) : '';
      const balance = Number(entry.balance_after || 0);

      return [date, `"${description}"`, orderNumber, debit, credit, balance];
    });

    // Add summary at the end
    const accountBalance = Number(customerSummary?.account_balance || 0);
    const totalUnpaid = Number(customerSummary?.total_unpaid_amount || 0);
    rows.push([]);
    rows.push(['--- Summary ---']);
    rows.push(['Customer Name', `"${selectedCustomer.full_name || ''}"`]);
    rows.push(['Phone', selectedCustomer.phone || '']);
    rows.push(['Account Balance', '', '', '', '', accountBalance]);
    rows.push(['Total Unpaid Orders', '', '', '', '', totalUnpaid]);

    // Create CSV string
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    // Create and download file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `Ledger_${selectedCustomer.full_name?.replace(/\s+/g, '_') || 'Customer'}_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    notify.success('Ledger exported successfully');
  };

  const styles = themeManager.getComponentStyles();
  const classes = themeManager.getClasses();
  const isDark = themeManager.isDark();

  return (
    <div className="space-y-8 pb-8">
      {!showLedgerDetails ? (
        /* Customer Overview Table */
        <div className={styles.cardWrapper + " overflow-hidden"}>
          {/* Header with Search and Filters */}
          <div className={`p-6 border-b ${classes.border}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className={`${styles.heading2} flex items-center gap-2`}>
                  <User className="w-6 h-6" />
                  Customer Ledger Overview
                </h3>
                <p className={`${classes.textSecondary} text-sm mt-1`}>
                  Customers with ledger history shown first
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-4 py-2 ${themeManager.isDark() ? 'bg-purple-900/30' : 'bg-purple-100'} text-purple-700 dark:text-purple-300 rounded-lg font-semibold`}>
                  Total: {filteredCustomers.length} of {customers.length}
                </span>
              </div>
            </div>

            {/* Search and Filter Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Search Bar */}
              <div className="relative md:col-span-2">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${themeManager.getIconColor('secondary')} w-5 h-5`} />
                <input
                  type="text"
                  placeholder="Search by customer name or phone number..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className={styles.formInput + " pl-10"}
                />
              </div>

              {/* Time Period Filter */}
              <div className="relative">
                <Calendar className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${themeManager.getIconColor('secondary')} w-5 h-5`} />
                <select
                  value={timePeriod}
                  onChange={(e) => setTimePeriod(e.target.value)}
                  className={styles.formInput + " pl-10"}
                >
                  <option value="lifetime">All Time</option>
                  <option value="today">Today</option>
                  <option value="yesterday">Yesterday</option>
                  <option value="week">This Week</option>
                  <option value="month">This Month</option>
                  <option value="custom">Custom Range</option>
                </select>
              </div>
            </div>

            {/* Custom Date Range */}
            {timePeriod === 'custom' && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                <div>
                  <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>Start Date</label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
                <div>
                  <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>End Date</label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className={styles.formInput}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Customer Table */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={themeManager.isDark() ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={styles.tableHeader}>Customer Name</th>
                  <th className={styles.tableHeader}>Phone</th>
                  <th className={`${styles.tableHeader} text-right`}>Outstanding</th>
                  <th className={`${styles.tableHeader} text-center`}>Status</th>
                  <th className={`${styles.tableHeader} text-right`}>Last Payment</th>
                  <th className={`${styles.tableHeader} text-center`}>Actions</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${classes.border}`}>
                {isLoading ? (
                  <tr>
                    <td colSpan="6" className={`px-6 py-8 text-center ${classes.textSecondary}`}>
                      Loading customers...
                    </td>
                  </tr>
                ) : paginatedCustomers.length === 0 ? (
                  <tr>
                    <td colSpan="6" className={`px-6 py-8 text-center ${classes.textSecondary}`}>
                      {searchTerm ? 'No customers found matching your search' : 'No customers found'}
                    </td>
                  </tr>
                ) : (
                  paginatedCustomers.map((customer) => {
                    const effectiveBalance = getEffectiveBalance(customer);
                    const balanceInfo = getBalanceDisplay(effectiveBalance);
                    const hasHistory = effectiveBalance !== 0 || (customer.last_payment_amount || 0) > 0 || (customer.unpaid_orders_count || 0) > 0;

                    return (
                      <tr key={customer.customer_id || customer.id} className={`${classes.hover} ${hasHistory ? isDark ? 'bg-purple-900/10' : 'bg-purple-50/30' : ''}`}>
                        <td className={`${styles.tableCell} font-medium`}>
                          <div className="flex items-center gap-2">
                            <div className={`w-10 h-10 rounded-full ${hasHistory ? isDark ? 'bg-purple-900/40' : 'bg-purple-100' : isDark ? 'bg-gray-700' : 'bg-gray-100'} flex items-center justify-center`}>
                              <User className={`w-5 h-5 ${hasHistory ? isDark ? 'text-purple-400' : 'text-purple-600' : isDark ? 'text-gray-500' : 'text-gray-400'}`} />
                            </div>
                            <div>
                              <p className={isDark ? 'text-gray-100' : 'text-gray-900'}>{customer.full_name || 'N/A'}</p>
                              {hasHistory && (
                                <p className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>Has Ledger History</p>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className={styles.tableCell}>
                          {customer.phone || 'N/A'}
                        </td>
                        <td className={`${styles.tableCell} text-right`}>
                          <div>
                            <p className={`font-bold ${balanceInfo.color}`}>
                              {balanceInfo.amount}
                            </p>
                            {balanceInfo.type === 'credit' && (
                              <p className={`text-xs ${isDark ? 'text-green-400' : 'text-green-600'}`}>Credit Balance</p>
                            )}
                            {balanceInfo.type === 'debit' && (
                              <p className={`text-xs ${isDark ? 'text-red-400' : 'text-red-600'}`}>Outstanding</p>
                            )}
                          </div>
                        </td>
                        <td className={`${styles.tableCell} text-center`}>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            balanceInfo.type === 'debit'
                              ? isDark ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                              : balanceInfo.type === 'credit'
                              ? isDark ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                              : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {balanceInfo.type === 'debit' ? 'Has Due' : balanceInfo.type === 'credit' ? 'Credit' : 'Clear'}
                          </span>
                        </td>
                        <td className={`${styles.tableCell} text-right`}>
                          <div>
                            <p className={`font-medium ${isDark ? 'text-gray-200' : 'text-gray-900'}`}>{formatCurrency(customer.last_payment_amount || 0)}</p>
                            <p className={`text-xs ${classes.textSecondary}`}>
                              {customer.last_payment_date ? formatDate(customer.last_payment_date) : 'Never'}
                            </p>
                          </div>
                        </td>
                        <td className={`${styles.tableCell} text-center`}>
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleCustomerSelect(customer)}
                              className="px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg text-sm font-medium transition-all hover:scale-105 shadow-md flex items-center gap-1"
                            >
                              <FileText className="w-4 h-4" />
                              View Ledger
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className={`p-4 border-t ${classes.border} flex items-center justify-between`}>
              <div className={classes.textSecondary}>
                Showing {startIndex + 1} to {Math.min(endIndex, filteredCustomers.length)} of {filteredCustomers.length} customers
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className={`px-4 py-2 rounded-lg ${classes.button} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Previous
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    // Show first page, last page, current page, and pages around current
                    if (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 1 && page <= currentPage + 1)
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`px-3 py-1 rounded-lg transition-colors ${
                            page === currentPage
                              ? 'bg-purple-600 text-white'
                              : `${classes.button} hover:bg-purple-100 dark:hover:bg-purple-900/30`
                          }`}
                        >
                          {page}
                        </button>
                      );
                    } else if (page === currentPage - 2 || page === currentPage + 2) {
                      return <span key={page} className="px-2">...</span>;
                    }
                    return null;
                  })}
                </div>
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className={`px-4 py-2 rounded-lg ${classes.button} transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Ledger Details View */
        <div className="space-y-8">
          {/* Back Button */}
          <button
            onClick={handleBackToOverview}
            className={`flex items-center gap-2 px-4 py-2 ${classes.button} rounded-lg transition-colors`}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back to Customer Overview
          </button>

      {/* Customer Summary Card */}
      {selectedCustomer && customerSummary && (
        <div className={`${styles.cardWrapper} rounded-xl shadow-lg p-8 border-l-4 ${
          (customerSummary.total_unpaid_amount || 0) > 0
            ? 'border-l-red-500'
            : (customerSummary.account_balance || 0) < 0
            ? 'border-l-green-500'
            : 'border-l-gray-400'
        }`}>
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className={`text-3xl font-bold mb-1 ${classes.textPrimary}`}>{selectedCustomer.full_name}</h2>
              <p className={`${classes.textSecondary} text-lg`}>{selectedCustomer.phone}</p>
            </div>
            <button
              onClick={() => setShowPaymentModal(true)}
              className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-500 text-white px-6 py-3 rounded-lg font-semibold hover:opacity-90 flex items-center gap-2 transition-all hover:scale-105 shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Record Payment
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Balance Card - Shows Net Balance (Outstanding or Credit) */}
            <div className={`${styles.cardWrapper} border ${classes.border} rounded-lg p-5`}>
              {(() => {
                const accountBalance = Number(customerSummary.account_balance || 0);

                // Ledger balance is the single source of truth
                const netBalance = accountBalance;

                let displayLabel = 'Account Balance';
                let displayColor = classes.textPrimary;
                let displaySubtext = 'All Clear';
                let subtextColor = classes.textSecondary;

                if (netBalance > 0) {
                  // Customer owes money (debit balance)
                  displayLabel = 'Net Outstanding';
                  displayColor = 'text-red-600';
                  subtextColor = 'text-red-500';
                  displaySubtext = 'Amount owed';
                } else if (netBalance < 0) {
                  // Customer has overpaid (credit balance)
                  displayLabel = 'Credit Available';
                  displayColor = 'text-green-600';
                  subtextColor = 'text-green-500';
                  displaySubtext = 'Available for future orders';
                } else {
                  // Balance is exactly zero
                  displayLabel = 'Account Balance';
                  displayColor = classes.textPrimary;
                  displaySubtext = 'All Clear';
                }

                return (
                  <>
                    <p className={`${classes.textSecondary} text-sm mb-2 font-medium`}>{displayLabel}</p>
                    <p className={`text-3xl font-bold ${displayColor}`}>{formatCurrency(netBalance)}</p>
                    <p className={`text-xs ${subtextColor} mt-1`}>{displaySubtext}</p>
                  </>
                );
              })()}
            </div>
            {/* Credit Limit Card */}
            <div className={`${styles.cardWrapper} border ${classes.border} rounded-lg p-5`}>
              {(() => {
                const creditLimit = Number(customerSummary.credit_limit || 0);
                const accountBalance = Number(customerSummary.account_balance || 0);
                const availableCredit = creditLimit > 0 ? Math.max(0, creditLimit - accountBalance) : 0;

                return (
                  <>
                    <p className={`${classes.textSecondary} text-sm mb-2 font-medium`}>Credit Limit</p>
                    <p className={`text-3xl font-bold ${classes.textPrimary}`}>
                      {formatCurrency(creditLimit)}
                    </p>
                    <p className={`text-xs ${classes.textSecondary} mt-1`}>
                      {creditLimit > 0 ? `Available: ${formatCurrency(availableCredit)}` : 'No credit limit set'}
                    </p>
                  </>
                );
              })()}
            </div>
            <div className={`${styles.cardWrapper} border ${classes.border} rounded-lg p-5`}>
              <p className={`${classes.textSecondary} text-sm mb-2 font-medium`}>Last Payment</p>
              <p className={`text-2xl font-bold ${classes.textPrimary}`}>{formatCurrency(customerSummary.last_payment_amount || 0)}</p>
              <p className={`text-xs ${classes.textSecondary} mt-1`}>{customerSummary.last_payment_date ? formatDate(customerSummary.last_payment_date) : 'Never'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Statement Table */}
      {selectedCustomer && (
        <div className={styles.cardWrapper + " overflow-hidden"}>
          <div className={`p-6 border-b ${classes.border} flex justify-between items-center`}>
            <h3 className={`${styles.heading3} flex items-center gap-2`}>
              <FileText className="w-5 h-5" />
              Ledger Statement
            </h3>
            <button
              onClick={exportLedgerToCSV}
              className={`flex items-center gap-2 px-4 py-2 border ${classes.border} rounded-lg ${classes.hover} transition-colors`}
            >
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className={themeManager.isDark() ? 'bg-gray-700' : 'bg-gray-50'}>
                <tr>
                  <th className={styles.tableHeader}>Date</th>
                  <th className={styles.tableHeader}>Description</th>
                  <th className={styles.tableHeader}>Order #</th>
                  <th className={`${styles.tableHeader} text-right`}>Debit (Dr)</th>
                  <th className={`${styles.tableHeader} text-right`}>Credit (Cr)</th>
                  <th className={`${styles.tableHeader} text-right`}>Balance</th>
                </tr>
              </thead>
              <tbody className={`divide-y ${classes.border}`}>
                {ledgerData.length === 0 ? (
                  <tr>
                    <td colSpan="6" className={`px-6 py-8 text-center ${classes.textSecondary}`}>
                      No transactions found
                    </td>
                  </tr>
                ) : (
                  ledgerData.map((entry) => (
                    <tr key={entry.id} className={classes.hover}>
                      <td className={`${styles.tableCell}`}>
                        {formatDate(entry.transaction_date)}
                      </td>
                      <td className={`${styles.tableCell}`}>
                        {entry.description}
                        {entry.notes && (
                          <p className={`text-xs ${classes.textSecondary} mt-1`}>{entry.notes}</p>
                        )}
                      </td>
                      <td className={`${styles.tableCell}`}>
                        {entry.order?.order_number || '-'}
                      </td>
                      <td className={`${styles.tableCell} text-right font-medium text-red-600`}>
                        {entry.transaction_type === 'debit' ? formatCurrency(entry.amount) : '-'}
                      </td>
                      <td className={`${styles.tableCell} text-right font-medium text-green-600`}>
                        {entry.transaction_type === 'credit' ? formatCurrency(entry.amount) : '-'}
                      </td>
                      <td className={`${styles.tableCell} text-right font-bold`}>
                        {(() => {
                          const balance = Number(entry.balance_after || 0);
                          if (balance > 0) {
                            // Customer owes money (debit balance)
                            return <span className="text-red-600">{formatCurrency(balance)}</span>;
                          } else if (balance < 0) {
                            // Customer has credit (negative balance)
                            return <span className="text-green-600">{formatCurrency(Math.abs(balance))} Cr</span>;
                          } else {
                            // Zero balance
                            return <span className={classes.textPrimary}>{formatCurrency(0)}</span>;
                          }
                        })()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Note: Unpaid Orders section removed - Customer Account orders are tracked via ledger balance only */}
        </div>
      )}

      {/* Record Payment Modal */}
      {showPaymentModal && (
        <RecordPaymentModal
          customer={selectedCustomer}
          unpaidOrders={unpaidOrders}
          customerSummary={customerSummary}
          userId={userId}
          onClose={() => setShowPaymentModal(false)}
          onPaymentRecorded={handlePaymentRecorded}
        />
      )}
    </div>
  );
}
