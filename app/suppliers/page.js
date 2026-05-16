'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Search, Edit2, Trash2, Loader2, X, Check, Phone, Mail, MapPin, CreditCard, TrendingDown, TrendingUp, BookOpen } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import SupplierPaymentModal from '../../components/inventory/SupplierPaymentModal'
import themeManager from '../../lib/themeManager'

export default function SuppliersPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [filteredSuppliers, setFilteredSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

  // Ledger state for selected supplier
  const [supplierLedger, setSupplierLedger]       = useState([])
  const [ledgerLoading, setLedgerLoading]         = useState(false)
  const [showPaymentModal, setShowPaymentModal]   = useState(false)

  // Modal states
  const [showAddModal, setShowAddModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [formData, setFormData] = useState({ name: '', phone: '', email: '', address: '', opening_amount: 0 })
  const [submitting, setSubmitting] = useState(false)

  // Theme
  const themeClasses = themeManager.getClasses()
  const componentStyles = themeManager.getComponentStyles()
  const isDark = themeManager.isDark()

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }
    const userData = authManager.getCurrentUser()
    setUser(userData)
    if (userData?.id) loadSuppliers(userData.id)
  }, [router])

  const loadSuppliers = async (userId) => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('suppliers')
        .select('*')
        .eq('user_id', userId)
        .order('name')

      if (error) throw error
      setSuppliers(data || [])
      filterSuppliers(data || [], searchTerm)
    } catch (error) {
      console.error('Error loading suppliers:', error)
      notify.error('Failed to load suppliers')
    } finally {
      setLoading(false)
    }
  }

  const filterSuppliers = (suppliers, search) => {
    let filtered = suppliers
    if (search.trim()) {
      filtered = filtered.filter(s =>
        s.name?.toLowerCase().includes(search.toLowerCase()) ||
        s.phone?.includes(search) ||
        s.email?.toLowerCase().includes(search.toLowerCase())
      )
    }
    setFilteredSuppliers(filtered)
  }

  useEffect(() => {
    filterSuppliers(suppliers, searchTerm)
  }, [searchTerm, suppliers])

  const handleAddSupplier = async () => {
    if (!formData.name.trim()) {
      notify.error('Supplier name is required')
      return
    }

    try {
      setSubmitting(true)
      const { error } = await supabase
        .from('suppliers')
        .insert([{ ...formData, user_id: user.id }])

      if (error) throw error

      notify.success('Supplier added successfully')
      resetForm()
      setShowAddModal(false)
      if (user?.id) loadSuppliers(user.id)
    } catch (error) {
      console.error('Error adding supplier:', error)
      notify.error(error.message || 'Failed to add supplier')
    } finally {
      setSubmitting(false)
    }
  }

  const handleUpdateSupplier = async () => {
    if (!selectedSupplier) return

    try {
      setSubmitting(true)
      const { error } = await supabase
        .from('suppliers')
        .update(formData)
        .eq('id', selectedSupplier.id)

      if (error) throw error

      notify.success('Supplier updated successfully')
      setShowEditModal(false)
      if (user?.id) loadSuppliers(user.id)
      setSelectedSupplier(null)
    } catch (error) {
      console.error('Error updating supplier:', error)
      notify.error(error.message || 'Failed to update supplier')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteSupplier = async () => {
    if (!selectedSupplier) return

    try {
      setSubmitting(true)
      // Use the delete_supplier RPC — it atomically clears every FK dependency
      // (ledger, payments, purchase returns, fixed assets, POs, inventory).
      // A raw delete fails on suppliers that have purchase returns / assets.
      const { data, error } = await supabase.rpc('delete_supplier', {
        p_user_id: user.id,
        p_supplier_id: selectedSupplier.id,
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.error || 'Failed to delete supplier')

      notify.success('Supplier deleted successfully')
      setShowDeleteConfirm(false)
      if (user?.id) loadSuppliers(user.id)
      setSelectedSupplier(null)
    } catch (error) {
      console.error('Error deleting supplier:', error)
      notify.error(error.message || 'Failed to delete supplier')
    } finally {
      setSubmitting(false)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', phone: '', email: '', address: '', opening_amount: 0 })
  }

  const loadSupplierLedger = async (supplierId) => {
    try {
      setLedgerLoading(true)
      const { data } = await supabase
        .from('supplier_ledger')
        .select('*')
        .eq('supplier_id', supplierId)
        .order('transaction_date', { ascending: false })
        .limit(10)
      setSupplierLedger(data || [])
    } catch { /* silent */ }
    finally { setLedgerLoading(false) }
  }

  const handleSelectSupplier = (supplier) => {
    setSelectedSupplier(supplier)
    if (supplier?.id) loadSupplierLedger(supplier.id)
    else setSupplierLedger([])
  }

  const openEditModal = (supplier) => {
    setSelectedSupplier(supplier)
    setFormData({
      name: supplier.name,
      phone: supplier.phone || '',
      email: supplier.email || '',
      address: supplier.address || '',
      opening_amount: supplier.opening_amount || 0
    })
    setShowEditModal(true)
  }

  if (!user) return <div className={`h-screen w-screen ${themeClasses.background}`} />

  return (
    <ProtectedPage permissionKey="SUPPLIERS" pageName="Suppliers">
      <NotificationSystem />
      <div className={`h-screen flex ${themeClasses.background} overflow-hidden text-sm`}>
        {/* LEFT PANEL */}
        <div className={`w-80 flex-shrink-0 flex flex-col h-full border-r ${isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'}`}>
          {/* Header */}
          <div className="bg-gradient-to-br from-blue-500 via-indigo-500 to-purple-600 px-4 pt-4 pb-5 flex-shrink-0">
            <div className="flex items-center justify-between mb-3">
              <motion.button
                whileHover={{ x: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => router.push('/dashboard')}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-white/20 hover:bg-white/30 flex items-center justify-center transition-all">
                  <ArrowLeft className="w-4 h-4" />
                </div>
                <span className="text-sm font-medium">Dashboard</span>
              </motion.button>
            </div>
            <h1 className="text-xl font-bold text-white">Suppliers</h1>

            {/* Search + Add */}
            <div className="flex items-center gap-2 mt-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-300 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-sm bg-white/90 border-white/20 text-gray-800 rounded-lg focus:ring-1 focus:ring-white/30 border"
                />
              </div>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  resetForm()
                  setShowAddModal(true)
                }}
                className="px-3 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-all"
              >
                <Plus className="w-4 h-4 text-white" />
              </motion.button>
            </div>
          </div>

          {/* Stats */}
          <div className={`flex gap-1.5 px-3 py-2 flex-shrink-0 border-b ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
            <div className="flex-1 text-center">
              <p className={`text-xs font-medium ${themeClasses.textSecondary}`}>Total</p>
              <p className={`text-lg font-bold ${themeClasses.textPrimary}`}>{suppliers.length}</p>
            </div>
          </div>

          {/* List */}
          <div className="flex-1 overflow-y-auto py-1">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <p className={`text-sm font-medium ${themeClasses.textSecondary}`}>No suppliers found</p>
              </div>
            ) : (
              filteredSuppliers.map((supplier) => (
                <motion.button
                  key={supplier.id}
                  whileHover={{ x: 2 }}
                  onClick={() => handleSelectSupplier(supplier)}
                  className={`w-full px-4 py-3 text-left border-b transition-all ${
                    selectedSupplier?.id === supplier.id
                      ? isDark ? 'bg-indigo-900/40 border-l-2 border-l-indigo-500' : 'bg-indigo-50 border-l-2 border-l-indigo-500'
                      : isDark ? 'border-gray-800 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-gray-50'
                  }`}
                >
                  <p className={`font-semibold ${themeClasses.textPrimary}`}>{supplier.name}</p>
                  {supplier.phone && <p className={`text-xs ${themeClasses.textSecondary}`}>{supplier.phone}</p>}
                </motion.button>
              ))
            )}
          </div>
        </div>

        {/* RIGHT PANEL */}
        <div className="flex-1 h-full overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            {selectedSupplier ? (
              <motion.div
                key={selectedSupplier.id}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                className="space-y-4"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className={`text-base font-bold ${themeClasses.textPrimary}`}>{selectedSupplier.name}</h2>
                    {selectedSupplier.phone && (
                      <p className={`text-xs mt-0.5 ${themeClasses.textSecondary}`}>{selectedSupplier.phone}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setShowPaymentModal(true)}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                    >
                      <CreditCard className="w-4 h-4" /> Record Payment
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => openEditModal(selectedSupplier)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-white hover:bg-gray-100 text-gray-700 border border-gray-200'}`}
                    >
                      <Edit2 className="w-3.5 h-3.5" /> Edit
                    </motion.button>
                    <motion.button
                      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                      onClick={() => setShowDeleteConfirm(true)}
                      className={`p-2 rounded-xl ${isDark ? 'bg-gray-700 hover:bg-red-900/40 text-gray-400 hover:text-red-400' : 'bg-white hover:bg-red-50 text-gray-400 hover:text-red-500 border border-gray-200'}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>

                {/* Info cards — same pattern as ledger summary cards */}
                <div className="grid grid-cols-4 gap-3">
                  {[
                    { label: 'Phone',    value: selectedSupplier.phone   || '—', Icon: Phone,   cls: themeClasses.textPrimary },
                    { label: 'Email',    value: selectedSupplier.email   || '—', Icon: Mail,    cls: themeClasses.textPrimary },
                    { label: 'Address',  value: selectedSupplier.address || '—', Icon: MapPin,  cls: themeClasses.textPrimary },
                    { label: 'Opening Balance', value: `Rs. ${parseFloat(selectedSupplier.opening_amount || 0).toFixed(0)}`, Icon: TrendingDown, cls: 'text-amber-600 dark:text-amber-400' },
                  ].map(({ label, value, Icon, cls }) => (
                    <motion.div
                      key={label}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                      className={`${themeClasses.card} rounded-xl p-3.5 border ${themeClasses.border} flex items-center gap-3`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isDark ? 'bg-gray-700' : 'bg-gray-100'}`}>
                        <Icon className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                      </div>
                      <div className="min-w-0">
                        <p className={`text-[10px] font-medium ${themeClasses.textSecondary}`}>{label}</p>
                        <p className={`text-xs font-semibold truncate ${cls}`}>{value}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>

                {/* Transactions table — same style as ledger */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  className={`${themeClasses.card} rounded-xl border ${themeClasses.border} overflow-hidden`}
                >
                  <div className={`flex items-center justify-between px-4 py-3 border-b ${themeClasses.border} ${isDark ? 'bg-gray-800/50' : 'bg-gray-50'}`}>
                    <p className={`text-sm font-semibold ${themeClasses.textPrimary}`}>Recent Transactions</p>
                    <button
                      onClick={() => router.push('/ledgers')}
                      className="text-xs font-medium text-amber-500 hover:text-amber-400"
                    >
                      View All →
                    </button>
                  </div>
                  {ledgerLoading ? (
                    <div className="flex items-center justify-center py-10">
                      <Loader2 className="w-5 h-5 animate-spin text-indigo-500" />
                    </div>
                  ) : supplierLedger.length === 0 ? (
                    <div className={`flex flex-col items-center justify-center py-10 ${themeClasses.textSecondary}`}>
                      <BookOpen className="w-8 h-8 mb-2 opacity-25" />
                      <p className="text-xs">No transactions yet</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className={`border-b ${themeClasses.border} ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                            {['Date', 'Type', 'Description', 'Amount'].map(h => (
                              <th key={h} className={`px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide ${themeClasses.textSecondary}`}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className={`divide-y ${isDark ? 'divide-gray-700/60' : 'divide-gray-100'}`}>
                          {supplierLedger.map(entry => {
                            const isDebit = entry.transaction_type === 'debit' || entry.transaction_type === 'purchase'
                            return (
                              <tr key={entry.id} className={`transition-colors ${isDark ? 'hover:bg-gray-700/40' : 'hover:bg-gray-50'}`}>
                                <td className={`px-4 py-2.5 text-xs ${themeClasses.textSecondary} whitespace-nowrap`}>
                                  {new Date(entry.transaction_date).toLocaleDateString('en-PK')}
                                </td>
                                <td className="px-4 py-2.5">
                                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${
                                    isDebit
                                      ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'
                                      : 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400'
                                  }`}>
                                    {isDebit ? '↓ Purchase' : '↑ Payment'}
                                  </span>
                                </td>
                                <td className={`px-4 py-2.5 text-xs ${themeClasses.textSecondary} max-w-[220px] truncate`}>
                                  {entry.description || '—'}
                                </td>
                                <td className={`px-4 py-2.5 text-sm text-right font-bold ${isDebit ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                                  {isDebit ? '−' : '+'} Rs.&nbsp;{parseFloat(entry.amount || 0).toFixed(0)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-full"
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 ${isDark ? 'bg-gray-800' : 'bg-white'} shadow-lg`}>
                  <BookOpen className={`w-8 h-8 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
                </div>
                <p className={`text-base font-semibold ${themeClasses.textPrimary}`}>No supplier selected</p>
                <p className={`text-sm mt-1 ${themeClasses.textSecondary}`}>Pick a supplier from the list</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add / Edit Supplier Modal — shared layout */}
      {(showAddModal || showEditModal) && (() => {
        const isEdit = showEditModal
        const onClose = () => isEdit ? setShowEditModal(false) : setShowAddModal(false)
        const onSubmit = isEdit ? handleUpdateSupplier : handleAddSupplier
        const inputCls = `w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
          isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-200 text-gray-900 placeholder-gray-400'
        }`
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className={`relative w-full max-w-md rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isEdit ? 'bg-blue-500/15' : 'bg-indigo-500/15'}`}>
                    {isEdit ? <Edit2 className="w-4 h-4 text-blue-500" /> : <Plus className="w-4 h-4 text-indigo-500" />}
                  </div>
                  <h3 className={`font-bold ${themeClasses.textPrimary}`}>{isEdit ? 'Edit Supplier' : 'Add Supplier'}</h3>
                </div>
                <button onClick={onClose} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}>
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="p-6 space-y-3">
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Supplier Name *</label>
                  <input type="text" placeholder="e.g. ABC Traders" value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Phone</label>
                  <input type="tel" placeholder="e.g. 03001234567" value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Email</label>
                  <input type="email" placeholder="e.g. supplier@email.com" value={formData.email}
                    onChange={e => setFormData({ ...formData, email: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Address</label>
                  <textarea placeholder="Street, City..." value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    rows={2} className={inputCls} />
                </div>
                {!isEdit && (
                  <div>
                    <label className={`block text-xs font-semibold mb-1.5 ${themeClasses.textSecondary}`}>Opening Balance</label>
                    <input type="number" placeholder="0" value={formData.opening_amount}
                      onChange={e => setFormData({ ...formData, opening_amount: e.target.value })} className={inputCls} />
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex gap-3 px-6 py-4 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
                <button onClick={onClose}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                  Cancel
                </button>
                <button onClick={onSubmit} disabled={submitting}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:bg-gray-400 ${isEdit ? 'bg-blue-600 hover:bg-blue-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}>
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  {isEdit ? 'Save Changes' : 'Add Supplier'}
                </button>
              </div>
            </motion.div>
          </div>
        )
      })()}

      {/* Supplier Payment Modal */}
      {selectedSupplier && (
        <SupplierPaymentModal
          isOpen={showPaymentModal}
          onClose={() => setShowPaymentModal(false)}
          supplier={selectedSupplier}
          onPaymentRecorded={() => {
            setShowPaymentModal(false)
            if (selectedSupplier?.id) loadSupplierLedger(selectedSupplier.id)
          }}
        />
      )}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className={`relative w-full max-w-sm rounded-2xl shadow-2xl overflow-hidden ${isDark ? 'bg-gray-800' : 'bg-white'}`}
          >
            <div className={`flex items-center justify-between px-6 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-100'}`}>
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-500" />
                </div>
                <h3 className={`font-bold ${themeClasses.textPrimary}`}>Delete Supplier</h3>
              </div>
              <button onClick={() => setShowDeleteConfirm(false)} className={`p-2 rounded-lg ${isDark ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-400'}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5">
              <p className={`text-sm ${themeClasses.textSecondary}`}>
                Are you sure you want to delete <span className={`font-semibold ${themeClasses.textPrimary}`}>{selectedSupplier?.name}</span>? This action cannot be undone.
              </p>
            </div>
            <div className={`flex gap-3 px-6 py-4 border-t ${isDark ? 'border-gray-700 bg-gray-800/50' : 'border-gray-100 bg-gray-50'}`}>
              <button onClick={() => setShowDeleteConfirm(false)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-200' : 'bg-gray-100 hover:bg-gray-200 text-gray-700'}`}>
                Cancel
              </button>
              <button onClick={handleDeleteSupplier} disabled={submitting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white flex items-center justify-center gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </ProtectedPage>
  )
}
