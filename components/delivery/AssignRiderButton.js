'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Truck, Phone, Package, Check, AlertCircle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cacheManager } from '../../lib/cacheManager'
import { authManager } from '../../lib/authManager'
import { themeManager } from '../../lib/themeManager'
import { notify } from '../ui/NotificationSystem'
import Modal from '../ui/Modal'

/**
 * AssignRiderButton — the SINGLE source of truth for assigning a delivery rider
 * to an order anywhere in the app (orders page, delivery page sidebar / details,
 * new-order delivery tab, riders page, web-orders, etc.).
 *
 * Renders nothing unless the order is a delivery order.
 *
 * Two modes:
 *   • persist (default, for orders that already exist in the DB):
 *       writes `delivery_boy_id` through cacheManager.updateOrderStatus
 *       (offline-first, dispatches `ordersUpdated`) and logs the action.
 *   • local (persist={false} OR no order.id — e.g. the new-order flow where the
 *       order does not exist yet): just bubbles the picked rider up via onAssigned.
 *
 * Props:
 *   order       : order object. Needs `order_type`; for persist mode also `id` + `order_status`.
 *   orderType   : fallback order type when there is no `order` object (local mode).
 *   value       : currently-assigned rider id (overrides order.delivery_boy_id) — for local mode.
 *   onAssigned  : (riderId, riderObj) => void — called after a successful assignment.
 *   persist     : boolean (default true). Effective persist also requires a real order.id.
 *   riders      : optional pre-fetched rider array (else cache + Supabase refresh).
 *   size        : 'sm' | 'md' (default 'md').
 *   fullWidth   : stretch the trigger button to full width.
 *   showName    : show the assigned rider's name in the button label (default true).
 *   className   : extra classes for the trigger button.
 *   label       : override the trigger button text.
 */
export default function AssignRiderButton({
  order,
  orderType,
  value,
  onAssigned,
  persist = true,
  riders: ridersProp,
  size = 'md',
  fullWidth = false,
  showName = true,
  className = '',
  label,
}) {
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [riders, setRiders] = useState(ridersProp || [])
  const [selectedRider, setSelectedRider] = useState(null)
  const [saving, setSaving] = useState(false)

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const effectiveType = order?.order_type || orderType
  const isDelivery = effectiveType === 'delivery'
  const currentRiderId = value !== undefined ? value : (order?.delivery_boy_id || null)
  const shouldPersist = persist && !!order?.id

  useEffect(() => {
    if (ridersProp) setRiders(ridersProp)
  }, [ridersProp])

  const currentRider =
    (order?.delivery_boys && order.delivery_boys.id === currentRiderId ? order.delivery_boys : null) ||
    riders.find((r) => r.id === currentRiderId) ||
    null

  const loadRiders = async () => {
    if (ridersProp?.length) {
      setRiders(ridersProp)
      return
    }
    // Cache first (instant, offline-friendly)
    const cached = cacheManager.getAllDeliveryBoys?.() || []
    if (cached.length) setRiders(cached)

    // Refresh from Supabase (user-scoped, active only)
    try {
      const user = authManager.getCurrentUser()
      if (!user?.id) return
      const { data, error } = await supabase
        .from('delivery_boys')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('name', { ascending: true })
      if (!error && data) setRiders(data)
    } catch (err) {
      console.error('Failed to load riders:', err)
    }
  }

  const openModal = (e) => {
    e?.stopPropagation?.()
    setSelectedRider(currentRiderId)
    loadRiders()
    setIsOpen(true)
  }

  const handleSave = async () => {
    if (!selectedRider) {
      notify.warning('Please select a rider')
      return
    }
    const riderObj = riders.find((r) => r.id === selectedRider) || null

    // Local mode — order not yet persisted. Bubble the pick up and let the caller store it.
    if (!shouldPersist) {
      onAssigned?.(selectedRider, riderObj)
      setIsOpen(false)
      return
    }

    try {
      setSaving(true)
      const result = await cacheManager.updateOrderStatus(
        order.id,
        order.order_status,
        { delivery_boy_id: selectedRider }
      )
      if (!result?.success) throw new Error('Failed to update order')

      await authManager.logOrderAction(
        order.id,
        'rider_assigned',
        { rider_id: selectedRider },
        'Rider assigned to delivery order'
      )

      notify.success('Rider assigned successfully')
      onAssigned?.(selectedRider, riderObj)
      setIsOpen(false)
    } catch (err) {
      console.error('Error assigning rider:', err)
      notify.error('Failed to assign rider')
    } finally {
      setSaving(false)
    }
  }

  if (!isDelivery) return null

  const assigned = !!currentRiderId
  const btnText =
    label ||
    (assigned
      ? showName && currentRider?.name
        ? `Change · ${currentRider.name}`
        : 'Change Rider'
      : 'Assign Rider')
  const sizeCls = size === 'sm' ? 'px-2.5 py-1 text-xs gap-1' : 'px-3 py-1.5 text-sm gap-1.5'
  const iconCls = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4'

  return (
    <>
      <motion.button
        type="button"
        whileHover={{ scale: 1.03 }}
        whileTap={{ scale: 0.97 }}
        onClick={openModal}
        className={`inline-flex items-center justify-center ${sizeCls} rounded-lg font-medium text-white bg-purple-600 hover:bg-purple-700 transition-colors ${
          fullWidth ? 'w-full' : ''
        } ${className}`}
      >
        <Truck className={iconCls} />
        <span className="truncate">{btnText}</span>
      </motion.button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Assign Delivery Rider"
        maxWidth="max-w-2xl"
      >
        <div className="space-y-5">
          {riders.length === 0 ? (
            <div className="text-center py-12">
              <div
                className={`w-20 h-20 ${
                  isDark ? 'bg-orange-900/30' : 'bg-orange-100'
                } rounded-full flex items-center justify-center mx-auto mb-4`}
              >
                <AlertCircle className={`w-10 h-10 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
              </div>
              <h3 className={`text-lg font-bold ${classes.textPrimary} mb-2`}>No Active Riders Found</h3>
              <p className={`${classes.textSecondary} mb-6`}>Add delivery riders to start assigning orders</p>
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => router.push('/riders')}
                className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
              >
                Manage Riders
              </motion.button>
            </div>
          ) : (
            <>
              <div className={`text-sm ${classes.textSecondary} flex items-center gap-2 pb-2`}>
                <Truck className="w-4 h-4" />
                <span>Select a rider to assign to this delivery order</span>
              </div>

              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                {riders.map((rider) => (
                  <motion.button
                    key={rider.id}
                    type="button"
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => setSelectedRider(rider.id)}
                    className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
                      selectedRider === rider.id
                        ? isDark
                          ? 'bg-purple-900/40 border-purple-600 shadow-lg ring-2 ring-purple-500/50'
                          : 'bg-purple-50 border-purple-400 shadow-md ring-2 ring-purple-300/50'
                        : isDark
                          ? 'bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600'
                          : 'bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1 min-w-0">
                        <div
                          className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${
                            selectedRider === rider.id
                              ? isDark
                                ? 'bg-purple-700'
                                : 'bg-purple-500'
                              : isDark
                                ? 'bg-gray-700'
                                : 'bg-gray-200'
                          }`}
                        >
                          <Truck
                            className={`w-7 h-7 ${
                              selectedRider === rider.id
                                ? 'text-white'
                                : isDark
                                  ? 'text-gray-400'
                                  : 'text-gray-600'
                            }`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className={`font-bold text-lg ${classes.textPrimary} mb-1`}>{rider.name}</div>
                          <div className="space-y-1">
                            {rider.phone && (
                              <div className={`text-sm ${classes.textSecondary} flex items-center gap-2`}>
                                <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                <span>{rider.phone}</span>
                              </div>
                            )}
                            {rider.vehicle_type && (
                              <div
                                className={`text-sm flex items-center gap-2 ${
                                  selectedRider === rider.id
                                    ? isDark
                                      ? 'text-purple-300'
                                      : 'text-purple-700'
                                    : isDark
                                      ? 'text-blue-400'
                                      : 'text-blue-600'
                                }`}
                              >
                                <Package className="w-3.5 h-3.5 flex-shrink-0" />
                                <span className="font-medium">{rider.vehicle_type}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {selectedRider === rider.id && (
                        <div
                          className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-3 ${
                            isDark ? 'bg-purple-600' : 'bg-purple-500'
                          }`}
                        >
                          <Check className="w-5 h-5 text-white" strokeWidth={3} />
                        </div>
                      )}
                    </div>
                  </motion.button>
                ))}
              </div>

              <div className={`flex gap-3 pt-4 border-t-2 ${classes.border}`}>
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setIsOpen(false)}
                  className={`flex-1 py-3.5 px-6 border-2 ${classes.border} ${classes.textPrimary} font-bold rounded-xl ${classes.hover} transition-all`}
                >
                  Cancel
                </motion.button>
                <motion.button
                  type="button"
                  whileHover={{ scale: selectedRider ? 1.02 : 1 }}
                  whileTap={{ scale: selectedRider ? 0.98 : 1 }}
                  onClick={handleSave}
                  disabled={!selectedRider || saving}
                  className={`flex-1 py-3.5 px-6 ${
                    selectedRider && !saving
                      ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg hover:shadow-xl'
                      : 'bg-gray-400 cursor-not-allowed'
                  } text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2`}
                >
                  <Check className="w-5 h-5" />
                  {saving ? 'Assigning...' : 'Assign Rider'}
                </motion.button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </>
  )
}
