'use client'

import React, { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Plus, Search, Edit2, Trash2, Loader2, X, Check, Phone, Mail, MapPin } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'
import { authManager } from '../../lib/authManager'
import ProtectedPage from '../../components/ProtectedPage'
import NotificationSystem, { notify } from '../../components/ui/NotificationSystem'
import Modal from '../../components/ui/Modal'
import themeManager from '../../lib/themeManager'

export default function SuppliersPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [suppliers, setSuppliers] = useState([])
  const [filteredSuppliers, setFilteredSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedSupplier, setSelectedSupplier] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')

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
          <div className="bg-gradient-to-br from-amber-500 via-orange-500 to-red-600 px-4 pt-4 pb-5 flex-shrink-0">
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
                <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
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
                  onClick={() => setSelectedSupplier(supplier)}
                  className={`w-full px-4 py-3 text-left border-b transition-all ${
                    selectedSupplier?.id === supplier.id
                      ? isDark ? 'bg-amber-900/40 border-l-2 border-l-amber-500' : 'bg-amber-50 border-l-2 border-l-amber-500'
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
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence>
            {selectedSupplier ? (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                className={`${themeClasses.card} rounded-2xl p-6 ${themeClasses.shadow} ${themeClasses.border} border max-w-2xl`}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className={`text-2xl font-bold ${themeClasses.textPrimary}`}>{selectedSupplier.name}</h2>
                  <button
                    onClick={() => setSelectedSupplier(null)}
                    className={`${themeClasses.button} border rounded-lg p-2`}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className={`${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded-lg p-4 mb-6 space-y-3`}>
                  {selectedSupplier.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                      <span className={themeClasses.textPrimary}>{selectedSupplier.phone}</span>
                    </div>
                  )}
                  {selectedSupplier.email && (
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                      <span className={themeClasses.textPrimary}>{selectedSupplier.email}</span>
                    </div>
                  )}
                  {selectedSupplier.address && (
                    <div className="flex items-start gap-3">
                      <MapPin className={`w-4 h-4 ${themeClasses.textSecondary} mt-0.5`} />
                      <span className={themeClasses.textPrimary}>{selectedSupplier.address}</span>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2 flex-wrap">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => openEditModal(selectedSupplier)}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                  >
                    <Edit2 className="w-4 h-4" /> Edit
                  </motion.button>

                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" /> Delete
                  </motion.button>
                </div>
              </motion.div>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center h-full"
              >
                <p className={`text-lg ${themeClasses.textSecondary}`}>Select a supplier to view details</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Add Modal */}
      <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} size="sm">
        <div className="p-6 space-y-4">
          <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>Add Supplier</h2>

          <input
            type="text"
            placeholder="Supplier Name *"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <textarea
            placeholder="Address"
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            rows={2}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowAddModal(false)}
              className={`px-4 py-2 rounded-lg font-medium ${themeClasses.button} border`}
            >
              Cancel
            </button>
            <button
              onClick={handleAddSupplier}
              disabled={submitting}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Add
            </button>
          </div>
        </div>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={showEditModal} onClose={() => setShowEditModal(false)} size="sm">
        <div className="p-6 space-y-4">
          <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>Edit Supplier</h2>

          <input
            type="text"
            placeholder="Supplier Name"
            value={formData.name}
            onChange={(e) => setFormData({...formData, name: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <input
            type="tel"
            placeholder="Phone"
            value={formData.phone}
            onChange={(e) => setFormData({...formData, phone: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <input
            type="email"
            placeholder="Email"
            value={formData.email}
            onChange={(e) => setFormData({...formData, email: e.target.value})}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <textarea
            placeholder="Address"
            value={formData.address}
            onChange={(e) => setFormData({...formData, address: e.target.value})}
            rows={2}
            className={`w-full px-3 py-2 border ${themeClasses.border} rounded-lg ${themeClasses.input}`}
          />

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowEditModal(false)}
              className={`px-4 py-2 rounded-lg font-medium ${themeClasses.button} border`}
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateSupplier}
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-medium flex items-center gap-2"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Save
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal isOpen={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} size="sm">
        <div className="p-6 space-y-4">
          <h2 className={`text-lg font-bold ${themeClasses.textPrimary}`}>Delete Supplier?</h2>
          <p className={`${themeClasses.textSecondary}`}>
            Are you sure you want to delete {selectedSupplier?.name}? This action cannot be undone.
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className={`px-4 py-2 rounded-lg font-medium ${themeClasses.button} border`}
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteSupplier}
              disabled={submitting}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-400 text-white rounded-lg font-medium"
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </ProtectedPage>
  )
}
