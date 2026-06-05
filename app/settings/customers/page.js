'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Users, Search, Plus, RefreshCw, X, Check,
  Edit2, MapPin, Trash2, Home, Building2,
  Upload, FileText, AlertCircle, CheckCircle2, Download,
} from 'lucide-react'
import * as XLSX from 'xlsx'
import themeManager from '../../../lib/themeManager'
import { authManager } from '../../../lib/authManager'
import { supabase } from '../../../lib/supabase'
import { notify } from '../../../components/ui/NotificationSystem'

const blankForm = { full_name: '', phone: '', email: '', addressline: '', credit_limit: 0 }

const CSV_COLUMNS = ['full_name', 'phone', 'email', 'addressline', 'credit_limit']
const CSV_LABELS  = ['Full Name', 'Phone', 'Email', 'Address', 'Credit Limit']

function parseCsv(text) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim())
  return lines.map(line => {
    const cols = []
    let cur = '', inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') { inQ = !inQ }
      else if (ch === ',' && !inQ) { cols.push(cur.trim()); cur = '' }
      else { cur += ch }
    }
    cols.push(cur.trim())
    return cols
  })
}

function parseXlsx(buffer) {
  const wb = XLSX.read(buffer, { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    .map(row => row.map(cell => String(cell ?? '').trim()))
    .filter(row => row.some(c => c !== ''))
}

function validateCsvRows(rows) {
  if (rows.length === 0) return { headerError: 'File is empty.', parsed: [] }

  const header = rows[0].map(h => h.toLowerCase().trim())
  const expected = CSV_COLUMNS.map(c => c.toLowerCase())
  if (header.join(',') !== expected.join(',')) {
    return {
      headerError: `Incorrect column order. Expected: ${CSV_LABELS.join(', ')}. Got: ${rows[0].join(', ')}`,
      parsed: [],
    }
  }

  const parsed = []
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const errors = []
    const [full_name = '', phone = '', email = '', addressline = '', credit_limit_raw = ''] = row

    if (!full_name.trim() && !phone.trim()) errors.push('Full Name or Phone is required')
    if (credit_limit_raw.trim() && (isNaN(parseFloat(credit_limit_raw)) || parseFloat(credit_limit_raw) < 0)) errors.push('Credit Limit must be a positive number')

    parsed.push({
      rowNum: i + 1,
      full_name: full_name.trim(),
      phone: phone.trim(),
      email: email.trim() || null,
      addressline: addressline.trim() || null,
      credit_limit: credit_limit_raw.trim() ? parseFloat(credit_limit_raw) || 0 : 0,
      errors,
    })
  }
  return { headerError: null, parsed }
}

export function CustomersPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [customers, setCustomers] = useState([])
  const [customerSearch, setCustomerSearch] = useState('')
  const [customersLoading, setCustomersLoading] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [showAddCustomer, setShowAddCustomer] = useState(false)
  const [customerForm, setCustomerForm] = useState(blankForm)
  const [customerFormSaving, setCustomerFormSaving] = useState(false)
  const [addressModalCustomer, setAddressModalCustomer] = useState(null)
  const [customerAddresses, setCustomerAddresses] = useState([])
  const [addressesLoading, setAddressesLoading] = useState(false)
  const [newAddressForm, setNewAddressForm] = useState({ address_line: '', label: 'Home', is_default: false })
  const [addingAddress, setAddingAddress] = useState(false)

  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvHeaderError, setCsvHeaderError] = useState(null)
  const [csvRows, setCsvRows] = useState([])
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvDone, setCsvDone] = useState(null)
  const csvFileRef = useRef(null)
  const loadCustomers = async () => {
    setCustomersLoading(true)
    try {
      const user = authManager.getCurrentUser()
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('user_id', user.id)
        .order('full_name', { ascending: true })
      if (error) throw error
      setCustomers(data || [])
    } catch {
      notify.error('Failed to load customers')
    } finally {
      setCustomersLoading(false)
    }
  }

  useEffect(() => { loadCustomers() }, [])

  const handleSaveCustomer = async () => {
    if (!customerForm.full_name.trim() && !customerForm.phone.trim()) {
      notify.error('Name or phone required')
      return
    }
    setCustomerFormSaving(true)
    try {
      const user = authManager.getCurrentUser()
      const payload = {
        full_name: customerForm.full_name.trim(),
        phone: customerForm.phone.trim(),
        email: customerForm.email.trim() || null,
        addressline: customerForm.addressline.trim() || null,
        credit_limit: parseFloat(customerForm.credit_limit) || 0,
      }
      if (editingCustomer) {
        const { error } = await supabase
          .from('customers')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', editingCustomer.id)
        if (error) throw error
        notify.success('Customer updated')
      } else {
        const { error } = await supabase
          .from('customers')
          .insert({ ...payload, user_id: user.id, login_type: 'software' })
        if (error) throw error
        notify.success('Customer added')
      }
      setEditingCustomer(null)
      setShowAddCustomer(false)
      setCustomerForm(blankForm)
      loadCustomers()
    } catch (err) {
      notify.error(err.message || 'Failed to save')
    } finally {
      setCustomerFormSaving(false)
    }
  }

  const handleDeleteCustomer = async (customer) => {
    if (!window.confirm('Delete ' + (customer.full_name || customer.phone) + '? Cannot be undone.')) return
    try {
      const { error } = await supabase.from('customers').delete().eq('id', customer.id)
      if (error) throw error
      notify.success('Customer deleted')
      setCustomers(prev => prev.filter(c => c.id !== customer.id))
    } catch (err) {
      notify.error(err.message || 'Failed to delete')
    }
  }

  const openEditCustomer = (c) => {
    setEditingCustomer(c)
    setCustomerForm({ full_name: c.full_name || '', phone: c.phone || '', email: c.email || '', addressline: c.addressline || '', credit_limit: c.credit_limit || 0 })
    setShowAddCustomer(true)
  }

  const openAddressModal = async (customer) => {
    setAddressModalCustomer(customer)
    setAddressesLoading(true)
    try {
      const { data, error } = await supabase
        .from('customer_addresses')
        .select('*')
        .eq('customer_id', customer.id)
        .order('is_default', { ascending: false })
      if (error) throw error
      setCustomerAddresses(data || [])
    } catch {
      notify.error('Failed to load addresses')
    } finally {
      setAddressesLoading(false)
    }
  }

  const handleAddAddress = async () => {
    if (!newAddressForm.address_line.trim()) { notify.error('Address is required'); return }
    setAddingAddress(true)
    try {
      const { error } = await supabase.from('customer_addresses').insert({
        customer_id: addressModalCustomer.id,
        address_line: newAddressForm.address_line.trim(),
        label: newAddressForm.label || 'Home',
        is_default: newAddressForm.is_default,
      })
      if (error) throw error
      notify.success('Address added')
      setNewAddressForm({ address_line: '', label: 'Home', is_default: false })
      openAddressModal(addressModalCustomer)
    } catch (err) {
      notify.error(err.message || 'Failed to add')
    } finally {
      setAddingAddress(false)
    }
  }

  const handleDeleteAddress = async (addressId) => {
    try {
      const { error } = await supabase.from('customer_addresses').delete().eq('id', addressId)
      if (error) throw error
      setCustomerAddresses(prev => prev.filter(a => a.id !== addressId))
      notify.success('Address removed')
    } catch {
      notify.error('Failed to remove')
    }
  }

  const handleSetDefaultAddress = async (address) => {
    try {
      await supabase.from('customer_addresses').update({ is_default: false }).eq('customer_id', addressModalCustomer.id)
      await supabase.from('customer_addresses').update({ is_default: true }).eq('id', address.id)
      setCustomerAddresses(prev => prev.map(a => ({ ...a, is_default: a.id === address.id })))
      notify.success('Default updated')
    } catch {
      notify.error('Failed to update')
    }
  }

  const closeForm = () => { setShowAddCustomer(false); setEditingCustomer(null); setCustomerForm(blankForm) }

  const openCsvModal = () => {
    setCsvHeaderError(null); setCsvRows([]); setCsvDone(null)
    setShowCsvModal(true)
  }

  const handleCsvFile = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const rows = isXlsx ? parseXlsx(ev.target.result) : parseCsv(ev.target.result)
      const { headerError, parsed } = validateCsvRows(rows)
      setCsvHeaderError(headerError)
      setCsvRows(parsed)
      setCsvDone(null)
    }
    if (isXlsx) reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
    e.target.value = ''
  }

  const handleImportCsv = async () => {
    const valid = csvRows.filter(r => r.errors.length === 0)
    if (valid.length === 0) { notify.error('No valid rows to import'); return }
    setCsvImporting(true)
    try {
      const user = authManager.getCurrentUser()
      const payload = valid.map(r => ({
        full_name: r.full_name || null,
        phone: r.phone || null,
        email: r.email || null,
        addressline: r.addressline || null,
        credit_limit: r.credit_limit,
        user_id: user.id,
        login_type: 'software',
      }))
      const { error } = await supabase.from('customers').insert(payload)
      if (error) throw error
      setCsvDone({ imported: valid.length, skipped: csvRows.length - valid.length })
      notify.success(`${valid.length} customer${valid.length !== 1 ? 's' : ''} imported`)
      loadCustomers()
    } catch (err) {
      notify.error(err.message || 'Import failed')
    } finally {
      setCsvImporting(false)
    }
  }

  const downloadTemplate = () => {
    const header = CSV_COLUMNS.join(',')
    const example = 'Ahmed Ali,03001234567,ahmed@email.com,House 5 Block B,0'
    const blob = new Blob([header + '\n' + example], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = 'customers_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <motion.div
      key="customers"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        <span className={`text-sm ${classes.textSecondary}`}>{customers.length} customer{customers.length !== 1 ? 's' : ''}</span>
        <div className="flex gap-2">
          <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}>
            <Search className={`w-3.5 h-3.5 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <input
              value={customerSearch}
              onChange={e => setCustomerSearch(e.target.value)}
              placeholder="Search name or phone..."
              className={`text-xs bg-transparent outline-none w-44 ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
            />
          </div>
          <button
            onClick={openCsvModal}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${isDark ? 'bg-gray-800 border-gray-700 text-gray-200 hover:bg-gray-700' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50'}`}
          >
            <Upload className="w-3.5 h-3.5" /> Import CSV
          </button>
          <button
            onClick={() => { setEditingCustomer(null); setCustomerForm(blankForm); setShowAddCustomer(true) }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Add Customer
          </button>
          <button
            onClick={loadCustomers}
            className={`p-2 rounded-lg border ${isDark ? 'bg-gray-800 border-gray-700 text-gray-300' : 'bg-white border-gray-200 text-gray-600'}`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${customersLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Add / Edit form */}
      <AnimatePresence>
        {showAddCustomer && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className={`mb-4 rounded-xl border p-4 overflow-hidden ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-sm font-semibold ${classes.textPrimary}`}>{editingCustomer ? 'Edit Customer' : 'New Customer'}</h3>
              <button onClick={closeForm} className={isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              {[
                ['full_name', 'Full Name', 'text'],
                ['phone', 'Phone Number', 'tel'],
                ['email', 'Email', 'email'],
                ['addressline', 'Default Address', 'text'],
              ].map(([k, lbl, t]) => (
                <div key={k}>
                  <label className={`block text-xs font-medium mb-1 ${classes.textSecondary}`}>{lbl}</label>
                  <input
                    type={t}
                    value={customerForm[k]}
                    onChange={e => setCustomerForm(p => ({ ...p, [k]: e.target.value }))}
                    className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-gray-50 border-gray-300 text-gray-800 focus:border-purple-400'}`}
                  />
                </div>
              ))}
              <div>
                <label className={`block text-xs font-medium mb-1 ${classes.textSecondary}`}>Credit Limit (Rs)</label>
                <input
                  type="number"
                  min="0"
                  value={customerForm.credit_limit}
                  onChange={e => setCustomerForm(p => ({ ...p, credit_limit: e.target.value }))}
                  className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white focus:border-purple-500' : 'bg-gray-50 border-gray-300 text-gray-800 focus:border-purple-400'}`}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={closeForm}
                className={`px-3 py-1.5 text-xs rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveCustomer}
                disabled={customerFormSaving}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white flex items-center gap-1.5"
              >
                {customerFormSaving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                {editingCustomer ? 'Save Changes' : 'Add Customer'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Address modal */}
      <AnimatePresence>
        {addressModalCustomer && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={e => { if (e.target === e.currentTarget) { setAddressModalCustomer(null); setCustomerAddresses([]) } }}
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className={`w-full max-w-md rounded-2xl shadow-2xl p-5 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`font-bold text-sm ${classes.textPrimary}`}>
                  Addresses — {addressModalCustomer.full_name || addressModalCustomer.phone}
                </h3>
                <button
                  onClick={() => { setAddressModalCustomer(null); setCustomerAddresses([]) }}
                  className={isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {addressesLoading ? (
                <div className="flex justify-center py-8">
                  <RefreshCw className="w-5 h-5 animate-spin text-purple-500" />
                </div>
              ) : (
                <div className="space-y-2 mb-4 max-h-52 overflow-y-auto">
                  {customerAddresses.length === 0 && (
                    <p className={`text-xs ${classes.textSecondary} text-center py-6`}>No addresses yet</p>
                  )}
                  {customerAddresses.map(addr => (
                    <div key={addr.id} className={`flex items-start justify-between p-2.5 rounded-lg ${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                      <div className="flex-1 mr-2">
                        <div className="flex items-center gap-1.5 mb-0.5">
                          {addr.label === 'Home' ? <Home className="w-3 h-3 text-blue-500" /> : <Building2 className="w-3 h-3 text-orange-500" />}
                          <span className={`text-xs font-medium ${classes.textPrimary}`}>{addr.label}</span>
                          {addr.is_default && <span className="text-[9px] px-1 py-0.5 rounded bg-green-100 text-green-700 font-medium">Default</span>}
                        </div>
                        <p className={`text-xs ${classes.textSecondary}`}>{addr.address_line}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {!addr.is_default && (
                          <button onClick={() => handleSetDefaultAddress(addr)} className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 hover:bg-green-200 text-green-700">Default</button>
                        )}
                        <button onClick={() => handleDeleteAddress(addr.id)} className={`p-1 rounded ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className={`border-t pt-3 ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <p className={`text-xs font-semibold mb-2 ${classes.textPrimary}`}>Add New Address</p>
                <div className="flex flex-wrap gap-1 mb-2">
                  {['Home', 'Office', 'House 1', 'House 2', 'Other'].map(lbl => (
                    <button
                      key={lbl}
                      onClick={() => setNewAddressForm(p => ({ ...p, label: lbl }))}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                        newAddressForm.label === lbl
                          ? 'bg-purple-600 text-white border-purple-600'
                          : isDark ? 'bg-gray-700 border-gray-600 text-gray-400' : 'bg-white border-gray-300 text-gray-500'
                      }`}
                    >
                      {lbl}
                    </button>
                  ))}
                </div>
                <input
                  value={newAddressForm.address_line}
                  onChange={e => setNewAddressForm(p => ({ ...p, address_line: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleAddAddress()}
                  placeholder="Enter full address..."
                  className={`w-full text-xs px-2 py-1.5 rounded-lg border outline-none mb-2 ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500' : 'bg-white border-gray-300 text-gray-800'}`}
                />
                <label className="flex items-center gap-1.5 text-xs mb-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newAddressForm.is_default}
                    onChange={e => setNewAddressForm(p => ({ ...p, is_default: e.target.checked }))}
                    className="rounded"
                  />
                  <span className={classes.textSecondary}>Set as default address</span>
                </label>
                <button
                  onClick={handleAddAddress}
                  disabled={addingAddress}
                  className="w-full py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white flex items-center justify-center gap-1.5"
                >
                  {addingAddress ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                  Add Address
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CSV Import modal */}
      <AnimatePresence>
        {showCsvModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setShowCsvModal(false) }}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 10 }}
              className={`w-full max-w-2xl rounded-2xl shadow-2xl p-5 ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" />
                  <h3 className={`font-bold text-sm ${classes.textPrimary}`}>Import Customers from CSV / Excel</h3>
                </div>
                <button onClick={() => setShowCsvModal(false)} className={isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Guide */}
              <div className={`rounded-xl p-3 mb-4 ${isDark ? 'bg-gray-700/60' : 'bg-purple-50'}`}>
                <p className={`text-xs font-semibold mb-2 ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>Required CSV Column Order</p>
                <div className="flex flex-wrap gap-2 mb-2">
                  {CSV_LABELS.map((lbl, i) => (
                    <span key={lbl} className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border ${isDark ? 'bg-gray-600 border-gray-500 text-gray-200' : 'bg-white border-purple-200 text-purple-700'}`}>
                      <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold ${isDark ? 'bg-purple-600 text-white' : 'bg-purple-600 text-white'}`}>{i + 1}</span>
                      {lbl}
                      {(lbl === 'Full Name' || lbl === 'Phone') && <span className="text-red-400">*</span>}
                    </span>
                  ))}
                </div>
                <p className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                  * At least one of Full Name or Phone is required per row. Email, Address, Credit Limit are optional.
                  The first row must be the header exactly as shown. For Excel files, data must be on the first sheet.
                </p>
                <button
                  onClick={downloadTemplate}
                  className={`mt-2 flex items-center gap-1 text-[10px] font-semibold ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-800'}`}
                >
                  <Download className="w-3 h-3" /> Download template CSV
                </button>
              </div>

              {/* Upload */}
              <input ref={csvFileRef} type="file" accept=".csv,.xlsx,.xls,text/csv" className="hidden" onChange={handleCsvFile} />
              <button
                onClick={() => csvFileRef.current?.click()}
                className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed text-xs font-semibold mb-4 transition-colors ${isDark ? 'border-gray-600 text-gray-300 hover:border-purple-500 hover:text-purple-300' : 'border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600'}`}
              >
                <Upload className="w-4 h-4" />
                {csvRows.length > 0 || csvHeaderError ? 'Choose a different file' : 'Choose CSV or Excel file (.csv, .xlsx)'}
              </button>

              {/* Header error */}
              {csvHeaderError && (
                <div className="flex items-start gap-2 mb-4 p-3 rounded-xl bg-red-50 border border-red-200">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-red-700">{csvHeaderError}</p>
                </div>
              )}

              {/* Preview table */}
              {csvRows.length > 0 && !csvHeaderError && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className={`text-xs font-semibold ${classes.textPrimary}`}>
                      Preview — {csvRows.length} row{csvRows.length !== 1 ? 's' : ''} &nbsp;
                      <span className="text-green-600">{csvRows.filter(r => r.errors.length === 0).length} valid</span>
                      {csvRows.some(r => r.errors.length > 0) && (
                        <span className="text-red-500"> · {csvRows.filter(r => r.errors.length > 0).length} with errors (will be skipped)</span>
                      )}
                    </p>
                  </div>
                  <div className={`rounded-xl border overflow-hidden max-h-48 overflow-y-auto ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                    <table className="w-full text-[10px]">
                      <thead>
                        <tr className={`${isDark ? 'bg-gray-700' : 'bg-gray-50'}`}>
                          <th className={`px-2 py-1.5 text-left font-semibold ${classes.textSecondary}`}>#</th>
                          {CSV_LABELS.map(lbl => (
                            <th key={lbl} className={`px-2 py-1.5 text-left font-semibold ${classes.textSecondary}`}>{lbl}</th>
                          ))}
                          <th className={`px-2 py-1.5 text-left font-semibold ${classes.textSecondary}`}>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {csvRows.map(row => {
                          const hasErr = row.errors.length > 0
                          return (
                            <tr key={row.rowNum} className={`border-t ${isDark ? 'border-gray-700/50' : 'border-gray-100'} ${hasErr ? isDark ? 'bg-red-900/10' : 'bg-red-50/60' : ''}`}>
                              <td className={`px-2 py-1.5 ${classes.textSecondary}`}>{row.rowNum}</td>
                              <td className={`px-2 py-1.5 ${classes.textPrimary}`}>{row.full_name || '—'}</td>
                              <td className={`px-2 py-1.5 ${classes.textSecondary}`}>{row.phone || '—'}</td>
                              <td className={`px-2 py-1.5 ${classes.textSecondary}`}>{row.email || '—'}</td>
                              <td className={`px-2 py-1.5 ${classes.textSecondary} max-w-[120px]`}>
                                <span className="truncate block">{row.addressline || '—'}</span>
                              </td>
                              <td className={`px-2 py-1.5 ${classes.textSecondary}`}>{row.credit_limit}</td>
                              <td className="px-2 py-1.5">
                                {hasErr
                                  ? <span className="flex items-center gap-1 text-red-500"><AlertCircle className="w-3 h-3" />{row.errors[0]}</span>
                                  : <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" />OK</span>
                                }
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Done banner */}
              {csvDone && (
                <div className={`flex items-center gap-2 mb-4 p-3 rounded-xl ${isDark ? 'bg-green-900/30 border border-green-700' : 'bg-green-50 border border-green-200'}`}>
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <p className={`text-xs font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
                    {csvDone.imported} customer{csvDone.imported !== 1 ? 's' : ''} imported successfully
                    {csvDone.skipped > 0 && ` · ${csvDone.skipped} row${csvDone.skipped !== 1 ? 's' : ''} skipped due to errors`}.
                  </p>
                </div>
              )}

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowCsvModal(false)}
                  className={`px-3 py-1.5 text-xs rounded-lg border ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}
                >
                  {csvDone ? 'Close' : 'Cancel'}
                </button>
                {csvRows.filter(r => r.errors.length === 0).length > 0 && !csvDone && (
                  <button
                    onClick={handleImportCsv}
                    disabled={csvImporting}
                    className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white flex items-center gap-1.5"
                  >
                    {csvImporting ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                    Import {csvRows.filter(r => r.errors.length === 0).length} Customer{csvRows.filter(r => r.errors.length === 0).length !== 1 ? 's' : ''}
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Customer list */}
      {customersLoading ? (
        <div className="flex justify-center py-12">
          <RefreshCw className="w-6 h-6 animate-spin text-purple-500" />
        </div>
      ) : (() => {
        const q = customerSearch.toLowerCase()
        const filtered = customers.filter(c =>
          !q || (c.full_name || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.email || '').toLowerCase().includes(q)
        )
        if (filtered.length === 0) return (
          <div className={`rounded-xl border py-12 text-center ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <Users className={`w-10 h-10 mx-auto mb-3 ${isDark ? 'text-gray-600' : 'text-gray-300'}`} />
            <p className={`text-sm ${classes.textSecondary}`}>
              {customerSearch ? 'No customers match your search' : 'No customers yet — click Add Customer to get started'}
            </p>
          </div>
        )
        return (
          <div className={`rounded-xl border overflow-hidden ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
            <table className="w-full text-xs">
              <thead>
                <tr className={`border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  {['Name', 'Phone', 'Email', 'Address', 'Credit Limit', 'Actions'].map(h => (
                    <th key={h} className={`px-3 py-2 text-left font-semibold text-[11px] uppercase tracking-wide ${classes.textSecondary}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr key={c.id} className={`border-b transition-colors ${isDark ? 'border-gray-700/50 hover:bg-gray-800/60' : 'border-gray-100 hover:bg-purple-50/40'} ${i % 2 === 1 ? isDark ? 'bg-gray-800/20' : 'bg-gray-50/40' : ''}`}>
                    <td className={`px-3 py-2.5 font-medium ${classes.textPrimary}`}>{c.full_name || '—'}</td>
                    <td className={`px-3 py-2.5 ${classes.textSecondary}`}>{c.phone || '—'}</td>
                    <td className={`px-3 py-2.5 ${classes.textSecondary}`}>{c.email || '—'}</td>
                    <td className={`px-3 py-2.5 ${classes.textSecondary} max-w-xs`}>
                      <span className="truncate block max-w-32" title={c.addressline}>{c.addressline || '—'}</span>
                    </td>
                    <td className={`px-3 py-2.5 ${classes.textSecondary}`}>Rs {(c.credit_limit || 0).toFixed(0)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditCustomer(c)} title="Edit" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-600'}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openAddressModal(c)} title="Manage Addresses" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-600'}`}>
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteCustomer(c)} title="Delete" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })()}
    </motion.div>
  )
}

export default function Page() { return null }
