'use client'

import { useState, useEffect, useRef } from 'react'
import { User, X, ChevronDown, ChevronUp, Clock, MapPin, Truck, DollarSign, FileText, Search, Plus, Check } from 'lucide-react'
import { cacheManager } from '../../lib/cacheManager'
import { supabase } from '../../lib/supabase'
import { notify } from '../ui/NotificationSystem'

export default function InlineCustomerPanel({
  orderType = 'walkin',
  customer,
  orderData = {},
  onCustomerChange,
  onOrderDataChange,
  classes,
  isDark,
  // Controlled mode props (used when contentOnly=true from CartSidebar)
  contentOnly = false,
  mode: controlledMode,
  onModeChange,
}) {
  const [internalMode, setInternalMode] = useState('idle')
  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [allCustomers, setAllCustomers] = useState([])
  const [deliveryBoys, setDeliveryBoys] = useState([])
  const [showNewCustForm, setShowNewCustForm] = useState(false)
  const [newCustName, setNewCustName] = useState('')
  const [newCustPhone, setNewCustPhone] = useState('')
  const [newCustEmail, setNewCustEmail] = useState('')
  const [newCustAddress, setNewCustAddress] = useState('')
  const [newCustAddressLabel, setNewCustAddressLabel] = useState('Home')
  const [customerAddresses, setCustomerAddresses] = useState([])
  const inputRef = useRef(null)
  const nameInputRef = useRef(null)
  const lastLoadedCustomerRef = useRef(null)

  // Use controlled mode when provided (contentOnly), otherwise use internal
  const mode = controlledMode !== undefined ? controlledMode : internalMode
  const setMode = (m) => {
    if (onModeChange) onModeChange(m)
    if (controlledMode === undefined) setInternalMode(m)
  }

  // Load customers
  useEffect(() => {
    const list = cacheManager.getAllCustomers?.() || []
    if (list.length > 0) {
      setAllCustomers(list)
    } else {
      try {
        const stored = JSON.parse(localStorage.getItem('pos_customers') || '[]')
        setAllCustomers(stored)
      } catch {}
    }
  }, [])

  // Load delivery boys
  useEffect(() => {
    if (orderType === 'delivery') {
      const boys = cacheManager.getAllDeliveryBoys?.() || []
      setDeliveryBoys(boys)
    }
  }, [orderType])

  // Auto-focus search input
  useEffect(() => {
    if (mode === 'searching') {
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [mode])

  // Auto-focus new customer name input
  useEffect(() => {
    if (showNewCustForm) {
      setTimeout(() => nameInputRef.current?.focus(), 50)
    }
  }, [showNewCustForm])

  // Clear search when leaving search mode
  useEffect(() => {
    if (mode !== 'searching') {
      setSearchQuery('')
      setSuggestions([])
      setShowNewCustForm(false)
      setNewCustName('')
      setNewCustPhone('')
      setNewCustEmail('')
      setNewCustAddress('')
      setNewCustAddressLabel('Home')
    }
  }, [mode])

  // Filter suggestions
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase()
    if (q.length >= 1) {
      const matched = allCustomers
        .filter(c => c != null)
        .filter(c =>
          (c.full_name || '').toLowerCase().includes(q) ||
          (c.phone || '').includes(q)
        )
        .slice(0, 6)
      setSuggestions(matched)
    } else {
      setSuggestions([])
    }
  }, [searchQuery, allCustomers])

  // Set defaults when expanding
  useEffect(() => {
    if (mode === 'expanded') {
      if (orderType === 'takeaway' && !orderData.pickupTime) {
        update('pickupTime', addMins(null, 30))
      }
      if (orderType === 'delivery' && !orderData.deliveryTime) {
        update('deliveryTime', addMins(null, 45))
      }
      if (orderType === 'delivery' && orderData.deliveryCharges === undefined) {
        update('deliveryCharges', 0)
      }
      if (orderType === 'delivery' && !orderData.addressLabel) {
        update('addressLabel', 'Home')
      }

      // Load customer addresses from customer_addresses table
      if (orderType === 'delivery' && customer?.id) {
        const isOnline = cacheManager.getNetworkStatus?.()?.isOnline ?? navigator.onLine
        if (isOnline) {
          supabase
            .from('customer_addresses')
            .select('*')
            .eq('customer_id', customer.id)
            .order('is_default', { ascending: false })
            .order('created_at', { ascending: false })
            .then(({ data }) => {
              const isNewCustomer = lastLoadedCustomerRef.current !== customer.id
              lastLoadedCustomerRef.current = customer.id
              if (data && data.length > 0) {
                setCustomerAddresses(data)
                // Always reset to default address when customer changes
                if (isNewCustomer) {
                  const defaultAddr = data.find(a => a.is_default) || data[0]
                  onOrderDataChange({ ...orderData, addressLine: defaultAddr.address_line, addressLabel: defaultAddr.label || 'Home' })
                }
              } else {
                setCustomerAddresses([])
                // Fall back to customers.addressline
                if (isNewCustomer && customer?.addressline) {
                  onOrderDataChange({ ...orderData, addressLine: customer.addressline })
                }
              }
            })
        } else if (!orderData.addressLine && customer?.addressline) {
          update('addressLine', customer.addressline)
        }
      }
    }
  }, [mode, orderType, customer?.id])

  const update = (field, value) => {
    onOrderDataChange({ ...orderData, [field]: value })
  }

  const handleSaveAndClose = async () => {
    setMode('idle')

    const addressLine = orderData.addressLine?.trim()
    const id = customer?.id
    // Skip if no real DB ID (local_/temp_ customers haven't been synced yet)
    if (!id || id.startsWith('local_') || id.startsWith('temp_') || !addressLine || addressLine.length < 3) return

    try {
      // 1. Update customers.addressline
      await supabase
        .from('customers')
        .update({ addressline: addressLine, updated_at: new Date().toISOString() })
        .eq('id', id)

      // 2. Save to customer_addresses if not already there
      const { data: existing } = await supabase
        .from('customer_addresses')
        .select('id')
        .eq('customer_id', id)
        .eq('address_line', addressLine)
        .maybeSingle()

      if (!existing) {
        const label = orderData.addressLabel || 'Home'
        // Check if this customer has any addresses yet (to set is_default correctly)
        const { data: existingAddrs } = await supabase
          .from('customer_addresses')
          .select('id')
          .eq('customer_id', id)
        const isFirst = !existingAddrs || existingAddrs.length === 0
        await supabase
          .from('customer_addresses')
          .insert({
            customer_id: id,
            address_line: addressLine,
            label,
            is_default: isFirst
          })
      }

      // 3. Update local cache Map so address is correct without full reload
      cacheManager.updateCustomerInCache?.(id, { addressline: addressLine })

      // 4. Update the customer prop in parent state so delivery_customer localStorage is updated too
      onCustomerChange({ ...customer, addressline: addressLine })

      notify.success('Address saved', { duration: 2000 })
    } catch (err) {
      console.error('❌ [InlinePanel] Failed to save address:', err)
    }
  }

  const addMins = (timeStr, mins) => {
    const base = timeStr ? new Date(`1970-01-01T${timeStr}:00`) : new Date()
    base.setMinutes(base.getMinutes() + mins)
    return base.toTimeString().slice(0, 5)
  }

  const selectCustomer = (c) => {
    onCustomerChange(c)
    setSearchQuery('')
    setSuggestions([])
    setMode(contentOnly ? 'idle' : 'expanded')

    if (orderType === 'delivery' && c?.id && !orderData.addressLine) {
      const isOnline = cacheManager.getNetworkStatus?.()?.isOnline ?? navigator.onLine
      if (isOnline) {
        // Fetch latest address from Supabase — cache may be stale
        supabase
          .from('customers')
          .select('addressline')
          .eq('id', c.id)
          .maybeSingle()
          .then(({ data }) => {
            const freshAddress = data?.addressline || c.addressline
            if (freshAddress) {
              onCustomerChange({ ...c, addressline: freshAddress })
              onOrderDataChange({ ...orderData, addressLine: freshAddress })
            }
          })
      } else if (c?.addressline) {
        onOrderDataChange({ ...orderData, addressLine: c.addressline })
      }
    }
  }

  const clearCustomer = (e) => {
    e.stopPropagation()
    onCustomerChange(null)
    setMode('idle')
  }

  const [creating, setCreating] = useState(false)

  const handleCreateCustomer = async () => {
    const trimName = newCustName.trim()
    const trimPhone = newCustPhone.trim()
    if (!trimName && !trimPhone) return
    if (creating) return

    setCreating(true)
    try {
      const phone = trimPhone || `noPhone_${Date.now()}`
      const trimAddress = newCustAddress.trim()
      const customerData = {
        fullName: trimName || trimPhone,
        phone,
        email: newCustEmail.trim(),
        addressLine: trimAddress
      }

      const savedCustomer = await cacheManager.findOrCreateCustomer(phone, customerData)

      if (savedCustomer) {
        // Save address to customer_addresses if provided
        if (savedCustomer.id && !savedCustomer.id.startsWith('local_') && !savedCustomer.id.startsWith('temp_') && trimAddress) {
          await supabase.from('customer_addresses').insert({
            customer_id: savedCustomer.id,
            label: newCustAddressLabel,
            address_line: trimAddress,
            is_default: true
          })
        }

        setAllCustomers(prev => {
          const exists = prev.some(c => c.id === savedCustomer.id)
          return exists ? prev : [...prev, savedCustomer]
        })
        selectCustomer(savedCustomer)

        // For delivery: populate the address fields
        if (orderType === 'delivery' && trimAddress) {
          onOrderDataChange({ ...orderData, addressLine: trimAddress, addressLabel: newCustAddressLabel })
        }
      }
    } catch (err) {
      console.error('[InlineCustomerPanel] Failed to create customer:', err)
      const fallback = {
        id: `local_${Date.now()}`,
        full_name: trimName || trimPhone,
        phone: trimPhone,
        email: ''
      }
      setAllCustomers(prev => [...prev, fallback])
      selectCustomer(fallback)
    } finally {
      setCreating(false)
    }
  }

  const showCreateOption = searchQuery.trim().length >= 2 && suggestions.length === 0 && !showNewCustForm

  const inputCls = `w-full text-xs px-2 py-1.5 rounded-lg border outline-none ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500 focus:border-purple-500' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400 focus:border-purple-400'}`
  const labelCls = `block text-xs font-medium mb-1 ${isDark ? 'text-gray-300' : 'text-gray-600'}`
  const quickBtnCls = (active) => `flex-1 py-1 text-xs rounded border transition-all ${active ? 'bg-purple-600 text-white border-purple-600' : isDark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-100'}`

  // Search UI (shared between full and contentOnly modes)
  const searchUI = (onClose) => (
    <div className="mt-1.5">
      <div className={`flex items-center rounded-lg border px-2 py-1.5 gap-1.5 ${isDark ? 'bg-gray-800 border-purple-500' : 'bg-white border-purple-400'}`}>
        <Search className={`w-3.5 h-3.5 flex-shrink-0 ${isDark ? 'text-purple-400' : 'text-purple-500'}`} />
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={e => { setSearchQuery(e.target.value); setShowNewCustForm(false) }}
          placeholder="Search by phone or name..."
          className={`flex-1 text-xs bg-transparent outline-none ${isDark ? 'text-white placeholder-gray-500' : 'text-gray-800 placeholder-gray-400'}`}
        />
        <button
          onClick={onClose}
          className={`p-0.5 rounded ${isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      {/* Results — in-flow (not absolute) so it's never clipped by parent overflow:hidden */}
      {(suggestions.length > 0 || showCreateOption || showNewCustForm) && (
        <div className={`mt-1 rounded-lg border overflow-hidden ${isDark ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-200'}`}>
          {suggestions.map(c => (
            <button
              key={c.id}
              onMouseDown={() => selectCustomer(c)}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
            >
              <User className={`w-3 h-3 flex-shrink-0 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
              <div>
                <div className={`text-xs font-medium ${isDark ? 'text-white' : 'text-gray-800'}`}>{c.full_name}</div>
                <div className={`text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{c.phone}</div>
              </div>
            </button>
          ))}

          {/* Create new customer option */}
          {showCreateOption && (
            <button
              onMouseDown={() => {
                // Pre-fill based on input type
                const q = searchQuery.trim()
                const looksLikePhone = /^\d+$/.test(q)
                setNewCustName(looksLikePhone ? '' : q)
                setNewCustPhone(looksLikePhone ? q : '')
                setNewCustEmail('')
                setNewCustAddress('')
                setNewCustAddressLabel('Home')
                setShowNewCustForm(true)
              }}
              className={`w-full text-left px-3 py-2 flex items-center gap-2 transition-colors border-t ${
                isDark ? 'hover:bg-gray-700 border-gray-700 text-purple-400' : 'hover:bg-purple-50 border-gray-100 text-purple-600'
              }`}
            >
              <Plus className="w-3 h-3 flex-shrink-0" />
              <span className="text-xs font-medium">Save &quot;{searchQuery.trim()}&quot; as new customer</span>
            </button>
          )}

          {/* Inline new customer form */}
          {showNewCustForm && (
            <div className={`px-3 py-2.5 space-y-2 border-t ${isDark ? 'border-gray-700 bg-gray-800/80' : 'border-gray-100 bg-purple-50/60'}`}>
              <div className={`text-xs font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>New Customer</div>
              <input
                ref={nameInputRef}
                value={newCustName}
                onChange={e => setNewCustName(e.target.value)}
                placeholder="Full name *"
                className={inputCls}
              />
              <input
                value={newCustPhone}
                onChange={e => setNewCustPhone(e.target.value)}
                placeholder="Phone number *"
                className={inputCls}
              />
              <input
                value={newCustEmail}
                onChange={e => setNewCustEmail(e.target.value)}
                placeholder="Email (optional)"
                className={inputCls}
              />
              {/* Address section */}
              <div>
                <div className={`text-[10px] font-medium mb-1 ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>Address (optional)</div>
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {['Home', 'Office', 'House 1', 'House 2', 'Other'].map(lbl => (
                    <button
                      key={lbl}
                      type="button"
                      onMouseDown={() => setNewCustAddressLabel(lbl)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-all ${
                        newCustAddressLabel === lbl
                          ? 'bg-purple-600 text-white border-purple-600'
                          : isDark ? 'bg-gray-700 text-gray-400 border-gray-600' : 'bg-white text-gray-500 border-gray-300'
                      }`}
                    >{lbl}</button>
                  ))}
                </div>
                <textarea
                  value={newCustAddress}
                  onChange={e => setNewCustAddress(e.target.value)}
                  placeholder={`${newCustAddressLabel} address...`}
                  rows={2}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <div className="flex gap-1 pt-0.5">
                <button
                  onMouseDown={() => setShowNewCustForm(false)}
                  className={`flex-1 py-1 text-xs rounded border transition-colors ${isDark ? 'bg-gray-700 border-gray-600 text-gray-300' : 'bg-white border-gray-300 text-gray-600'}`}
                >Cancel</button>
                <button
                  onMouseDown={handleCreateCustomer}
                  disabled={(!newCustName.trim() && !newCustPhone.trim()) || creating}
                  className="flex-[2] py-1 text-xs font-bold rounded bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white transition-colors flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  {creating ? 'Saving...' : 'Create & Select'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // Expanded fields UI (shared)
  const expandedFieldsUI = (
    <div className={`rounded-lg border p-2.5 space-y-2.5 ${isDark ? 'bg-gray-800/60 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>

      {/* ── TAKEAWAY ── */}
      {orderType === 'takeaway' && (
        <>
          <div>
            <label className={labelCls}><Clock className="inline w-3 h-3 mr-1" />Pickup Time *</label>
            <input
              type="time"
              value={orderData.pickupTime || addMins(null, 30)}
              onChange={e => update('pickupTime', e.target.value)}
              className={inputCls}
            />
            <div className="flex gap-1 mt-1">
              {[15, 30, 45, 60].map(m => (
                <button key={m} onClick={() => update('pickupTime', addMins(orderData.pickupTime, m))} className={quickBtnCls(false)}>+{m}m</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}><FileText className="inline w-3 h-3 mr-1" />Instructions <span className="font-normal opacity-60">(Optional)</span></label>
            <textarea value={orderData.instructions || ''} onChange={e => update('instructions', e.target.value)} placeholder="Special requests..." rows={2} className={`${inputCls} resize-none`} />
          </div>
        </>
      )}

      {/* ── DELIVERY ── */}
      {orderType === 'delivery' && (
        <>
          <div>
            <label className={labelCls}><MapPin className="inline w-3 h-3 mr-1" />Delivery Address *</label>
            <div className="flex flex-wrap gap-1 mb-1.5">
              {['Home', 'Office', 'House 1', 'House 2', 'Other'].map(lbl => {
                const savedAddr = customerAddresses.find(a => a.label === lbl)
                return (
                  <button
                    key={lbl}
                    onClick={() => {
                      if (savedAddr) {
                        onOrderDataChange({ ...orderData, addressLabel: lbl, addressLine: savedAddr.address_line })
                      } else {
                        onOrderDataChange({ ...orderData, addressLabel: lbl, addressLine: '' })
                      }
                    }}
                    className={`px-2 py-0.5 rounded-full text-xs border transition-all ${
                      (orderData.addressLabel || 'Home') === lbl
                        ? 'bg-purple-600 text-white border-purple-600'
                        : isDark ? 'bg-gray-700 text-gray-400 border-gray-600 hover:bg-gray-600' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                    }`}
                  >{lbl}</button>
                )
              })}
            </div>
            <textarea value={orderData.addressLine || ''} onChange={e => update('addressLine', e.target.value)} placeholder="Enter full delivery address..." rows={2} className={`${inputCls} resize-none`} />
          </div>

          {deliveryBoys.length > 0 && (
            <div>
              <label className={labelCls}><Truck className="inline w-3 h-3 mr-1" />Delivery Boy <span className="font-normal opacity-60">(Optional)</span></label>
              <select value={orderData.deliveryBoyId || ''} onChange={e => update('deliveryBoyId', e.target.value)} className={inputCls}>
                <option value="">Select Delivery Boy (Optional)</option>
                {deliveryBoys.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className={labelCls}><Clock className="inline w-3 h-3 mr-1" />Delivery Time *</label>
            <input type="time" value={orderData.deliveryTime || addMins(null, 45)} onChange={e => update('deliveryTime', e.target.value)} className={inputCls} />
            <div className="flex gap-1 mt-1">
              {[30, 45, 60, 90].map(m => (
                <button key={m} onClick={() => update('deliveryTime', addMins(orderData.deliveryTime, m))} className={quickBtnCls(false)}>+{m}m</button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}><DollarSign className="inline w-3 h-3 mr-1" />Delivery Charges (Rs)</label>
            <input type="number" min="0" value={orderData.deliveryCharges ?? 0} onChange={e => update('deliveryCharges', Number(e.target.value))} className={`${inputCls} mb-1`} />
            <div className="flex gap-1">
              {[0, 50, 100, 150, 200].map(c => (
                <button key={c} onClick={() => update('deliveryCharges', c)} className={quickBtnCls((orderData.deliveryCharges ?? 0) === c)}>Rs {c}</button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelCls}><FileText className="inline w-3 h-3 mr-1" />Instructions <span className="font-normal opacity-60">(Optional)</span></label>
            <textarea value={orderData.instructions || ''} onChange={e => update('instructions', e.target.value)} placeholder="Special requests..." rows={2} className={`${inputCls} resize-none`} />
          </div>
        </>
      )}

      {/* ── WALKIN ── */}
      {orderType === 'walkin' && (
        <div className={`text-xs space-y-0.5 ${isDark ? 'text-gray-300' : 'text-gray-600'}`}>
          {customer?.phone && <div><span className="font-medium">Phone:</span> {customer.phone}</div>}
          {customer?.email && <div><span className="font-medium">Email:</span> {customer.email}</div>}
        </div>
      )}
    </div>
  )

  /* ══════════════════════════════════════════════
     CONTENT-ONLY MODE
     Trigger buttons are managed externally in CartSidebar action row.
     This only renders the below-the-row content.
  ══════════════════════════════════════════════ */
  if (contentOnly) {
    if (mode === 'searching') {
      return searchUI(() => setMode('idle'))
    }
    if (mode === 'expanded' && customer) {
      return (
        <div className="mt-1.5 space-y-2">
          {expandedFieldsUI}
          <button
            onClick={handleSaveAndClose}
            className="w-full py-1.5 text-xs font-bold rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center justify-center gap-1"
          >
            <Check className="w-3 h-3" />
            Save & Close
          </button>
        </div>
      )
    }
    return null
  }

  /* ══════════════════════════════════════════════
     FULL MODE (walkin / takeaway / delivery pages)
  ══════════════════════════════════════════════ */

  if (mode === 'searching') {
    return searchUI(() => { setMode('idle'); setSearchQuery(''); setSuggestions([]) })
  }

  if (customer) {
    return (
      <div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode(mode === 'expanded' ? 'idle' : 'expanded')}
            className={`flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              mode === 'expanded'
                ? isDark ? 'bg-green-800/40 border-green-500 text-green-200' : 'bg-green-100 border-green-500 text-green-800'
                : isDark ? 'bg-green-900/30 border-green-700 text-green-300' : 'bg-green-50 border-green-300 text-green-700'
            }`}
          >
            <User className="w-3 h-3 flex-shrink-0" />
            <span className="truncate flex-1 text-left">{customer.full_name?.trim() || customer.phone}</span>
            {mode === 'expanded' ? <ChevronUp className="w-3 h-3 flex-shrink-0" /> : <ChevronDown className="w-3 h-3 flex-shrink-0" />}
          </button>
          <button
            onClick={clearCustomer}
            className={`p-1.5 rounded-lg border text-xs transition-all ${isDark ? 'bg-gray-700 border-gray-600 text-gray-400 hover:text-red-400 hover:border-red-500' : 'bg-gray-50 border-gray-200 text-gray-400 hover:text-red-500 hover:border-red-300'}`}
          >
            <X className="w-3 h-3" />
          </button>
        </div>
        {mode === 'expanded' && <div className="mt-2">{expandedFieldsUI}</div>}
      </div>
    )
  }

  /* IDLE */
  return (
    <button
      onClick={() => setMode('searching')}
      className={`w-full flex items-center justify-center gap-1 px-2 py-1.5 rounded-lg text-xs font-medium border border-dashed transition-all ${
        isDark ? 'border-gray-600 text-gray-400 hover:border-purple-500 hover:text-purple-400' : 'border-gray-300 text-gray-500 hover:border-purple-400 hover:text-purple-600'
      }`}
    >
      <User className="w-3 h-3" />
      <span>Add Customer</span>
    </button>
  )
}
