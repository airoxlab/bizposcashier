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

const blankForm = { full_name: '', phone: '', email: '', addressline: '', account_balance: 0 }

const CUSTOMER_FIELDS = [
  { key: 'phone',           label: 'Phone',    required: true  },
  { key: 'full_name',       label: 'Full Name', required: false },
  { key: 'email',           label: 'Email',     required: false },
  { key: 'addressline',     label: 'Address',   required: false },
  { key: 'account_balance', label: 'Balance',   required: false },
]

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

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [showCsvModal, setShowCsvModal] = useState(false)
  const [csvStep, setCsvStep] = useState('upload') // upload | map | done
  const [csvData, setCsvData] = useState({ headers: [], rows: [] })
  const [csvMapping, setCsvMapping] = useState({})
  const [csvImporting, setCsvImporting] = useState(false)
  const [csvProgress, setCsvProgress] = useState('')
  const [csvResult, setCsvResult] = useState(null)
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
        account_balance: parseFloat(customerForm.account_balance) || 0,
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

  const handleDeleteCustomer = async () => {
    if (!deleteTarget) return
    try {
      const { error } = await supabase.from('customers').delete().eq('id', deleteTarget.id)
      if (error) throw error
      notify.success('Customer deleted')
      setCustomers(prev => prev.filter(c => c.id !== deleteTarget.id))
    } catch (err) {
      notify.error(err.message || 'Failed to delete')
    } finally {
      setDeleteTarget(null)
    }
  }

  const openEditCustomer = (c) => {
    setEditingCustomer(c)
    setCustomerForm({ full_name: c.full_name || '', phone: c.phone || '', email: c.email || '', addressline: c.addressline || '', account_balance: c.account_balance || 0 })
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
    setCsvStep('upload'); setCsvData({ headers: [], rows: [] })
    setCsvMapping({}); setCsvResult(null)
    setShowCsvModal(true)
  }

  const handleCsvFile = (file) => {
    if (!file) return
    const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
    const reader = new FileReader()
    reader.onload = (ev) => {
      const raw = isXlsx ? parseXlsx(ev.target.result) : parseCsv(ev.target.result)
      if (raw.length < 1) { notify.error('File appears to be empty'); return }
      const headers = raw[0]
      const rows = raw.slice(1).filter(r => r.some(c => c !== ''))
      setCsvData({ headers, rows })
      // Auto-map by fuzzy header match
      const autoMap = {}
      CUSTOMER_FIELDS.forEach(f => {
        const match = headers.find(h => {
          const hn = h.toLowerCase().replace(/[^a-z]/g, '')
          const fk = f.key.replace(/_/g, '')
          const fl = f.label.toLowerCase().replace(/[^a-z]/g, '')
          return hn.includes(fk) || hn.includes(fl) || fk.includes(hn)
        })
        if (match) autoMap[f.key] = match
      })
      setCsvMapping(autoMap)
      setCsvStep('map')
    }
    if (isXlsx) reader.readAsArrayBuffer(file)
    else reader.readAsText(file)
  }

  const getCsvPreviewRows = () => {
    return csvData.rows.slice(0, 4).map(row => {
      const obj = {}
      CUSTOMER_FIELDS.forEach(f => {
        const col = csvMapping[f.key]
        const idx = col != null ? csvData.headers.indexOf(col) : -1
        obj[f.key] = idx >= 0 ? row[idx] : ''
      })
      return obj
    })
  }

  const runCsvImport = async () => {
    if (!csvMapping.phone) { notify.error('Phone column mapping is required'); return }
    const user = authManager.getCurrentUser()
    setCsvImporting(true)
    const counts = { inserted: 0, updated: 0, skipped: 0, errors: [] }
    const CHUNK = 500
    try {
      const phoneIdx = csvData.headers.indexOf(csvMapping.phone)
      setCsvProgress('Building records…')
      const allRecords = []
      for (const row of csvData.rows) {
        const phone = row[phoneIdx]?.trim()
        if (!phone) { counts.skipped++; continue }
        const record = { user_id: user.id, phone, login_type: 'software' }
        CUSTOMER_FIELDS.forEach(f => {
          if (f.key === 'phone') return
          const col = csvMapping[f.key]
          if (!col) return
          const idx = csvData.headers.indexOf(col)
          const val = idx >= 0 ? row[idx]?.trim() : ''
          if (!val) return
          record[f.key] = f.key === 'account_balance' ? (parseFloat(val.replace(/[^0-9.-]/g, '')) || 0) : val
        })
        allRecords.push(record)
      }
      setCsvProgress('Checking existing customers…')
      const existingMap = {}
      let from = 0
      while (true) {
        const { data, error } = await supabase.from('customers').select('id, phone').eq('user_id', user.id).range(from, from + 999)
        if (error) throw error
        if (!data?.length) break
        data.forEach(c => { existingMap[c.phone] = c.id })
        if (data.length < 1000) break
        from += 1000
      }
      const dedupedMap = {}
      for (const r of allRecords) dedupedMap[r.phone] = r
      const deduped = Object.values(dedupedMap)
      const toInsert = deduped.filter(r => !existingMap[r.phone])
      const toUpdate = deduped.filter(r => !!existingMap[r.phone]).map(r => ({ ...r, id: existingMap[r.phone] }))
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        setCsvProgress(`Inserting… ${Math.min(i + CHUNK, toInsert.length)} / ${toInsert.length}`)
        const { error } = await supabase.from('customers').insert(toInsert.slice(i, i + CHUNK))
        if (error) counts.errors.push(error.message)
        else counts.inserted += Math.min(CHUNK, toInsert.length - i)
      }
      for (let i = 0; i < toUpdate.length; i += CHUNK) {
        setCsvProgress(`Updating… ${Math.min(i + CHUNK, toUpdate.length)} / ${toUpdate.length}`)
        const { error } = await supabase.from('customers').upsert(toUpdate.slice(i, i + CHUNK), { onConflict: 'id' })
        if (error) counts.errors.push(error.message)
        else counts.updated += Math.min(CHUNK, toUpdate.length - i)
      }
      setCsvResult(counts)
      setCsvStep('done')
      if (counts.inserted > 0 || counts.updated > 0) {
        notify.success(`Imported ${counts.inserted} new, updated ${counts.updated}`)
        loadCustomers()
      }
    } catch (err) {
      notify.error(err.message || 'Import failed')
    } finally {
      setCsvImporting(false); setCsvProgress('')
    }
  }

  const downloadCsvTemplate = () => {
    const header = 'phone,full_name,email,addressline,account_balance'
    const example = '03001234567,Ahmed Ali,ahmed@email.com,House 5 Block B,500'
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
                <label className={`block text-xs font-medium mb-1 ${classes.textSecondary}`}>Balance (Rs)</label>
                <input
                  type="number"
                  value={customerForm.account_balance}
                  onChange={e => setCustomerForm(p => ({ ...p, account_balance: e.target.value }))}
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
              className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[90vh] ${isDark ? 'bg-gray-800' : 'bg-white'}`}
            >
              {/* Header */}
              <div className={`flex items-center justify-between px-5 py-4 border-b ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-purple-500" />
                  <div>
                    <h3 className={`font-bold text-sm ${classes.textPrimary}`}>Import Customers from CSV / Excel</h3>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {['upload', 'map', 'done'].map((s, i) => (
                        <span key={s} className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${csvStep === s ? 'bg-purple-600 text-white' : isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
                          {i + 1}. {s.charAt(0).toUpperCase() + s.slice(1)}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
                <button onClick={() => setShowCsvModal(false)} className={isDark ? 'text-gray-400 hover:text-white' : 'text-gray-400 hover:text-gray-600'}>
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

                {/* Step 1: Upload */}
                {csvStep === 'upload' && (
                  <>
                    <input
                      ref={csvFileRef}
                      type="file"
                      accept=".csv,.xlsx,.xls,text/csv"
                      className="hidden"
                      onChange={e => { handleCsvFile(e.target.files?.[0]); e.target.value = '' }}
                    />
                    <div
                      onClick={() => csvFileRef.current?.click()}
                      onDrop={e => { e.preventDefault(); handleCsvFile(e.dataTransfer.files[0]) }}
                      onDragOver={e => e.preventDefault()}
                      className={`flex flex-col items-center justify-center gap-3 py-12 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${isDark ? 'border-gray-600 hover:border-purple-500' : 'border-gray-300 hover:border-purple-400'}`}
                    >
                      <Upload className={`w-9 h-9 ${isDark ? 'text-gray-500' : 'text-gray-300'}`} />
                      <p className={`text-sm font-semibold ${classes.textPrimary}`}>Drop your file here or click to browse</p>
                      <p className={`text-xs ${classes.textSecondary}`}>Supports .csv and .xlsx — first row must be headers</p>
                    </div>
                    <button
                      onClick={downloadCsvTemplate}
                      className={`flex items-center gap-1 text-xs font-semibold ${isDark ? 'text-purple-400 hover:text-purple-300' : 'text-purple-600 hover:text-purple-800'}`}
                    >
                      <Download className="w-3.5 h-3.5" /> Download template CSV
                    </button>
                  </>
                )}

                {/* Step 2: Map columns */}
                {csvStep === 'map' && (
                  <>
                    <div className={`px-3 py-2 rounded-lg text-xs ${isDark ? 'bg-purple-900/30 text-purple-300 border border-purple-800' : 'bg-purple-50 text-purple-700 border border-purple-200'}`}>
                      {csvData.rows.length} rows detected · {csvData.headers.length} columns. Map your CSV columns to customer fields.
                    </div>
                    <div className="space-y-2">
                      {CUSTOMER_FIELDS.map(field => (
                        <div key={field.key} className="flex items-center gap-3">
                          <div className="w-28 shrink-0">
                            <p className={`text-xs font-semibold ${classes.textPrimary}`}>
                              {field.label}{field.required && <span className="text-red-400 ml-0.5">*</span>}
                            </p>
                          </div>
                          <select
                            value={csvMapping[field.key] || ''}
                            onChange={e => setCsvMapping(m => ({ ...m, [field.key]: e.target.value || undefined }))}
                            className={`flex-1 text-xs px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white focus:border-purple-500' : 'bg-white border-gray-300 text-gray-800 focus:border-purple-400'}`}
                          >
                            <option value="">— skip —</option>
                            {csvData.headers.map(h => (
                              <option key={h} value={h}>{h}</option>
                            ))}
                          </select>
                          {csvMapping[field.key]
                            ? <Check className="w-4 h-4 text-green-500 shrink-0" />
                            : field.required
                              ? <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                              : <div className="w-4 shrink-0" />
                          }
                        </div>
                      ))}
                    </div>

                    {/* Preview */}
                    {csvMapping.phone && getCsvPreviewRows().length > 0 && (
                      <div>
                        <p className={`text-[10px] font-semibold uppercase tracking-wide mb-1.5 ${classes.textSecondary}`}>Preview — first {getCsvPreviewRows().length} rows</p>
                        <div className={`rounded-xl border overflow-hidden overflow-x-auto ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                          <table className="w-full text-[10px]">
                            <thead>
                              <tr className={isDark ? 'bg-gray-700' : 'bg-gray-50'}>
                                {CUSTOMER_FIELDS.filter(f => csvMapping[f.key]).map(f => (
                                  <th key={f.key} className={`px-2 py-1.5 text-left font-semibold ${classes.textSecondary}`}>{f.label}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {getCsvPreviewRows().map((row, i) => (
                                <tr key={i} className={`border-t ${isDark ? 'border-gray-700/50' : 'border-gray-100'}`}>
                                  {CUSTOMER_FIELDS.filter(f => csvMapping[f.key]).map(f => (
                                    <td key={f.key} className={`px-2 py-1.5 ${classes.textSecondary}`}>{row[f.key] || '—'}</td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Step 3: Done */}
                {csvStep === 'done' && csvResult && (
                  <div className={`rounded-xl border p-5 ${csvResult.errors.length ? isDark ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-200' : isDark ? 'bg-green-900/20 border-green-700' : 'bg-green-50 border-green-200'}`}>
                    <p className={`text-sm font-bold mb-3 ${classes.textPrimary}`}>Import complete</p>
                    <div className="flex gap-4 text-xs">
                      <span className="text-green-600 font-semibold">✓ {csvResult.inserted} new</span>
                      <span className="text-blue-500 font-semibold">↻ {csvResult.updated} updated</span>
                      {csvResult.skipped > 0 && <span className={classes.textSecondary}>⊘ {csvResult.skipped} skipped</span>}
                    </div>
                    {csvResult.errors.length > 0 && (
                      <div className="mt-3">
                        <p className="text-[10px] font-semibold text-red-500 mb-1">{csvResult.errors.length} error(s):</p>
                        <ul className="text-[10px] text-red-500 space-y-0.5 max-h-24 overflow-y-auto">
                          {csvResult.errors.map((e, i) => <li key={i}>• {e}</li>)}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className={`flex gap-2 px-5 py-4 border-t ${isDark ? 'border-gray-700' : 'border-gray-200'}`}>
                {csvStep === 'upload' && (
                  <button onClick={() => setShowCsvModal(false)} className={`flex-1 py-2 text-xs rounded-lg border font-semibold ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                    Cancel
                  </button>
                )}
                {csvStep === 'map' && (
                  <>
                    <button onClick={() => setCsvStep('upload')} className={`px-4 py-2 text-xs rounded-lg border font-semibold ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-gray-100 border-gray-200 text-gray-600'}`}>
                      Back
                    </button>
                    <button
                      onClick={runCsvImport}
                      disabled={csvImporting || !csvMapping.phone}
                      className="flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white flex items-center justify-center gap-1.5"
                    >
                      {csvImporting
                        ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />{csvProgress || 'Importing…'}</>
                        : <><Upload className="w-3.5 h-3.5" />Import {csvData.rows.length} Rows</>
                      }
                    </button>
                  </>
                )}
                {csvStep === 'done' && (
                  <button onClick={() => setShowCsvModal(false)} className="flex-1 py-2 text-xs font-semibold rounded-lg bg-purple-600 hover:bg-purple-700 text-white">
                    Done
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
                  {['Name', 'Phone', 'Email', 'Address', 'Balance', 'Actions'].map(h => (
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
                    <td className={`px-3 py-2.5 ${(c.account_balance || 0) !== 0 ? 'text-blue-500 font-medium' : classes.textSecondary}`}>Rs {(c.account_balance || 0).toFixed(0)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditCustomer(c)} title="Edit" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-blue-400' : 'hover:bg-blue-50 text-blue-600'}`}>
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => openAddressModal(c)} title="Manage Addresses" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-gray-700 text-green-400' : 'hover:bg-green-50 text-green-600'}`}>
                          <MapPin className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteTarget(c)} title="Delete" className={`p-1.5 rounded-lg transition-colors ${isDark ? 'hover:bg-red-900/30 text-red-400' : 'hover:bg-red-50 text-red-500'}`}>
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
      {/* Delete confirmation modal */}
      <AnimatePresence>
        {deleteTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null) }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              transition={{ duration: 0.18 }}
              className={`w-full max-w-sm rounded-2xl shadow-2xl p-5 ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}
            >
              {/* icon */}
              <div className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto mb-4 ${isDark ? 'bg-red-900/30' : 'bg-red-50'}`}>
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h3 className={`text-sm font-bold text-center mb-1 ${classes.textPrimary}`}>Delete Customer</h3>
              <p className={`text-xs text-center mb-5 ${classes.textSecondary}`}>
                Are you sure you want to delete{' '}
                <span className={`font-semibold ${classes.textPrimary}`}>
                  {deleteTarget.full_name || deleteTarget.phone}
                </span>
                ? This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setDeleteTarget(null)}
                  className={`flex-1 py-2 text-xs font-semibold rounded-xl border transition-colors ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 border-gray-200 text-gray-600 hover:bg-gray-200'}`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteCustomer}
                  className="flex-1 py-2 text-xs font-semibold rounded-xl bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function Page() { return null }
