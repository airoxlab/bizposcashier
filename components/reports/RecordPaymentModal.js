/**
 * Record Payment Modal
 * Modal for recording customer payments with FIFO allocation
 */

import { useState } from 'react';
import { X, DollarSign, CreditCard, Calendar, FileText, Check } from 'lucide-react';
import { ledgerManager } from '../../lib/ledgerManager';
import { notify } from '../ui/NotificationSystem';
import { authManager } from '../../lib/authManager';
import { themeManager } from '../../lib/themeManager';

export default function RecordPaymentModal({ customer, unpaidOrders, customerSummary, userId, onClose, onPaymentRecorded }) {
  const [amount, setAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const paymentMethods = ['Cash', 'EasyPaisa', 'JazzCash', 'Bank', 'Card'];

  const handleAmountChange = (value) => {
    setAmount(value);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!amount || Number(amount) <= 0) {
      notify.error('Please enter a valid amount');
      return;
    }

    setIsProcessing(true);

    try {
      const currentUser = authManager.getCurrentUser();

      const paymentData = {
        amount: Number(amount),
        paymentMethod,
        referenceNumber: referenceNumber || null,
        notes: notes || null
      };

      const result = await ledgerManager.recordPayment(
        userId,
        customer.id,
        paymentData,
        currentUser?.id
      );

      if (result.success) {
        notify.success(`Payment of Rs ${Number(amount).toLocaleString()} recorded successfully`);
        onPaymentRecorded(result.data);
      } else {
        notify.error(result.error || 'Failed to record payment');
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      notify.error('An error occurred while recording payment');
    } finally {
      setIsProcessing(false);
    }
  };

  const formatCurrency = (amount) => {
    return `Rs ${Number(amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' });
  };

  // Calculate totals considering credit
  const totalUnpaidOrders = unpaidOrders.reduce((sum, order) => sum + order.amount_due, 0);
  const accountBalance = Number(customerSummary?.account_balance || 0);
  const creditAvailable = accountBalance < 0 ? Math.abs(accountBalance) : 0;
  // Net outstanding is just the account balance (positive = owes, negative = has credit)
  const netOutstanding = Math.max(0, accountBalance);

  const styles = themeManager.getComponentStyles();
  const classes = themeManager.getClasses();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={`${classes.modal} rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden`}>
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-500 to-purple-600 p-6 text-white flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Record Payment</h2>
            <p className="text-purple-100">{customer.full_name} - {customer.phone}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {/* Payment Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Amount */}
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                <DollarSign className="w-4 h-4 inline mr-1" />
                Payment Amount *
              </label>
              <input
                type="number"
                step="0.01"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                placeholder="Enter amount"
                className={`${styles.formInput} text-lg font-semibold`}
                required
              />
              <div className={`text-xs ${classes.textSecondary} mt-1 space-y-1`}>
                <p className="font-medium text-red-600">
                  Net Outstanding: {formatCurrency(netOutstanding)}
                </p>
                {creditAvailable > 0 && (
                  <p className="text-green-600">
                    Credit Available: {formatCurrency(creditAvailable)} (auto-applied)
                  </p>
                )}
                {creditAvailable > 0 && (
                  <p className={classes.textSecondary}>
                    Orders Total: {formatCurrency(totalUnpaidOrders)} − Credit: {formatCurrency(creditAvailable)}
                  </p>
                )}
              </div>
            </div>

            {/* Payment Method */}
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                <CreditCard className="w-4 h-4 inline mr-1" />
                Payment Method *
              </label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value)}
                className={styles.formInput}
                required
              >
                {paymentMethods.map((method) => (
                  <option key={method} value={method}>{method}</option>
                ))}
              </select>
            </div>

            {/* Reference Number */}
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                <FileText className="w-4 h-4 inline mr-1" />
                Reference Number
              </label>
              <input
                type="text"
                value={referenceNumber}
                onChange={(e) => setReferenceNumber(e.target.value)}
                placeholder="Cheque/Transaction number (optional)"
                className={styles.formInput}
              />
            </div>

            {/* Notes */}
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                Notes
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes (optional)"
                className={styles.formInput}
              />
            </div>
          </div>

          {/* Current Balance Summary */}
          {amount && Number(amount) > 0 && (
            <div className={`mb-6 ${themeManager.isDark() ? 'bg-blue-900/20 border-blue-700/30' : 'bg-blue-50 border-blue-200'} border rounded-lg p-4`}>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className={classes.textSecondary}>Current Balance:</span>
                  <span className={`font-semibold ${accountBalance > 0 ? 'text-red-600' : accountBalance < 0 ? 'text-green-600' : classes.textPrimary}`}>
                    {formatCurrency(accountBalance)}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className={classes.textSecondary}>Payment Amount:</span>
                  <span className={`font-semibold ${classes.textPrimary}`}>{formatCurrency(Number(amount))}</span>
                </div>
                <div className={`flex justify-between text-sm font-medium border-t ${classes.border} pt-2 mt-2`}>
                  <span className={classes.textSecondary}>New Balance:</span>
                  <span className={`font-semibold ${(accountBalance - Number(amount)) > 0 ? 'text-red-600' : (accountBalance - Number(amount)) < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                    {formatCurrency(accountBalance - Number(amount))}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className={`flex-1 px-6 py-3 border ${classes.border} ${classes.textPrimary} rounded-lg ${classes.hover} font-medium transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProcessing || !amount || Number(amount) <= 0}
              className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isProcessing ? 'Processing...' : `Record Payment of ${formatCurrency(Number(amount) || 0)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
