"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Gift, TrendingUp, Sparkles, Info, ChevronDown, ChevronUp } from 'lucide-react'
import loyaltyManager from '@/lib/loyaltyManager'

export default function LoyaltyPointsDisplay({
  customer,
  cart,
  orderType,
  subtotal,
  theme = 'light'
}) {
  const [customerPoints, setCustomerPoints] = useState(null)
  const [earnedPoints, setEarnedPoints] = useState(null)
  const [showBreakdown, setShowBreakdown] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (customer?.id) {
      loadCustomerPoints()
      calculateEarnablePoints()
    } else {
      setCustomerPoints(null)
      setEarnedPoints(null)
    }
  }, [customer, cart, subtotal])

  const loadCustomerPoints = async () => {
    if (!customer?.id) return

    setLoading(true)
    try {
      const points = await loyaltyManager.getCustomerPoints(customer.id)
      setCustomerPoints(points)
    } catch (error) {
      console.error('Error loading customer points:', error)
    } finally {
      setLoading(false)
    }
  }

  const calculateEarnablePoints = () => {
    if (!customer?.id || !cart || cart.length === 0) {
      setEarnedPoints(null)
      return
    }

    const orderData = {
      customerId: customer.id,
      orderType: orderType || 'walkin',
      subtotal: subtotal || 0,
      items: cart.map(item => ({
        product_id: item.product_id,
        category_id: item.category_id,
        quantity: item.quantity,
        price: item.finalPrice
      })),
      orderDate: new Date()
    }

    const pointsData = loyaltyManager.calculatePointsForOrder(orderData)
    setEarnedPoints(pointsData)
  }

  if (!customer) {
    return null
  }

  const isDark = theme === 'dark'

  return (
    <div>
      {/* Compact Collapsible Loyalty Card */}
      {customer && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className={`rounded-lg border ${
            isDark
              ? 'bg-gradient-to-br from-purple-900/40 to-indigo-900/40 border-purple-500/30'
              : 'bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200'
          }`}
        >
          {/* Header - Always Visible */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="w-full p-2 flex items-center justify-between hover:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2">
              <motion.div
                animate={{
                  scale: earnedPoints && earnedPoints.totalPoints > 0 ? [1, 1.1, 1] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: earnedPoints && earnedPoints.totalPoints > 0 ? Infinity : 0,
                  repeatDelay: 3
                }}
                className={`p-1.5 rounded-lg ${
                  earnedPoints && earnedPoints.totalPoints > 0
                    ? isDark ? 'bg-green-500/20' : 'bg-green-100'
                    : isDark ? 'bg-purple-500/20' : 'bg-purple-100'
                }`}
              >
                {earnedPoints && earnedPoints.totalPoints > 0 ? (
                  <Sparkles
                    className={`w-4 h-4 ${
                      isDark ? 'text-green-300' : 'text-green-600'
                    }`}
                  />
                ) : (
                  <Award
                    className={`w-4 h-4 ${
                      isDark ? 'text-purple-300' : 'text-purple-600'
                    }`}
                  />
                )}
              </motion.div>
              <div className="text-left">
                {earnedPoints && earnedPoints.totalPoints > 0 ? (
                  <>
                    <p
                      className={`text-[10px] font-medium ${
                        isDark ? 'text-green-300' : 'text-green-600'
                      }`}
                    >
                      You&apos;ll Earn
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className={`text-lg font-bold ${
                          isDark ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        +{earnedPoints.totalPoints}
                      </p>
                      <span
                        className={`text-[10px] ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        points
                      </span>
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className={`text-[10px] font-medium ${
                        isDark ? 'text-purple-300' : 'text-purple-600'
                      }`}
                    >
                      Loyalty Points
                    </p>
                    <div className="flex items-baseline gap-1">
                      <p
                        className={`text-lg font-bold ${
                          isDark ? 'text-white' : 'text-gray-900'
                        }`}
                      >
                        {customerPoints?.current_balance?.toFixed(0) || 0}
                      </p>
                      <span
                        className={`text-[10px] ${
                          isDark ? 'text-gray-400' : 'text-gray-500'
                        }`}
                      >
                        balance
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Tier Badge */}
              {customerPoints?.loyalty_tier && (
                <div
                  className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                    customerPoints.loyalty_tier === 'PLATINUM'
                      ? isDark
                        ? 'bg-purple-500/30 text-purple-200'
                        : 'bg-purple-100 text-purple-700'
                      : customerPoints.loyalty_tier === 'GOLD'
                      ? isDark
                        ? 'bg-yellow-500/30 text-yellow-200'
                        : 'bg-yellow-100 text-yellow-700'
                      : customerPoints.loyalty_tier === 'SILVER'
                      ? isDark
                        ? 'bg-gray-500/30 text-gray-200'
                        : 'bg-gray-100 text-gray-700'
                      : isDark
                      ? 'bg-orange-500/30 text-orange-200'
                      : 'bg-orange-100 text-orange-700'
                  }`}
                >
                  {customerPoints.loyalty_tier}
                </div>
              )}

              {/* Expand/Collapse Icon */}
              <div
                className={`p-1 rounded-lg ${
                  isDark
                    ? 'text-purple-300'
                    : 'text-purple-600'
                }`}
              >
                {isExpanded ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </div>
            </div>
          </button>

          {/* Expanded Details */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="px-2 pb-2 space-y-2 border-t border-purple-200/20">
                  {/* Current Balance */}
                  {customerPoints && (
                    <div className="mt-2 p-2 rounded-lg bg-white/10">
                      <p
                        className={`text-[10px] font-medium mb-1 ${
                          isDark ? 'text-purple-300' : 'text-purple-600'
                        }`}
                      >
                        Current Balance
                      </p>
                      <div className="flex items-baseline gap-1">
                        <p
                          className={`text-xl font-bold ${
                            isDark ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          {customerPoints.current_balance?.toFixed(0) || 0}
                        </p>
                        <span
                          className={`text-[10px] ${
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          points
                        </span>
                      </div>

                      {/* Lifetime Stats */}
                      <div className="mt-2 pt-2 border-t border-purple-200/20 grid grid-cols-2 gap-2">
                        <div>
                          <p
                            className={`text-[10px] ${
                              isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}
                          >
                            Total Earned
                          </p>
                          <p
                            className={`text-xs font-semibold ${
                              isDark ? 'text-green-400' : 'text-green-600'
                            }`}
                          >
                            {customerPoints.total_points_earned?.toFixed(0) || 0}
                          </p>
                        </div>
                        <div>
                          <p
                            className={`text-[10px] ${
                              isDark ? 'text-gray-400' : 'text-gray-600'
                            }`}
                          >
                            Total Redeemed
                          </p>
                          <p
                            className={`text-xs font-semibold ${
                              isDark ? 'text-orange-400' : 'text-orange-600'
                            }`}
                          >
                            {customerPoints.points_redeemed?.toFixed(0) || 0}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Points to be Earned Breakdown */}
                  {earnedPoints && earnedPoints.totalPoints > 0 && (
                    <div className="p-2 rounded-lg bg-white/10">
                      <div className="flex items-center justify-between mb-2">
                        <p
                          className={`text-[10px] font-medium ${
                            isDark ? 'text-green-300' : 'text-green-600'
                          }`}
                        >
                          Points You&apos;ll Earn
                        </p>
                        {earnedPoints.breakdown && earnedPoints.breakdown.length > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              setShowBreakdown(!showBreakdown)
                            }}
                            className={`text-[10px] underline ${
                              isDark ? 'text-green-300' : 'text-green-600'
                            }`}
                          >
                            {showBreakdown ? 'Hide' : 'View'} Breakdown
                          </button>
                        )}
                      </div>

                      <div className="flex items-baseline gap-1 mb-2">
                        <p
                          className={`text-xl font-bold ${
                            isDark ? 'text-white' : 'text-gray-900'
                          }`}
                        >
                          +{earnedPoints.totalPoints}
                        </p>
                        <span
                          className={`text-[10px] ${
                            isDark ? 'text-gray-400' : 'text-gray-500'
                          }`}
                        >
                          points
                        </span>
                      </div>

                      {/* Points Breakdown */}
                      <AnimatePresence>
                        {showBreakdown && earnedPoints.breakdown && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="pt-2 border-t border-green-200/20 space-y-1.5">
                              {earnedPoints.breakdown.map((item, index) => (
                                <div
                                  key={index}
                                  className={`flex items-start justify-between text-[10px] ${
                                    isDark ? 'text-gray-300' : 'text-gray-700'
                                  }`}
                                >
                                  <div className="flex-1 pr-2">
                                    <p className="font-medium">{item.ruleName}</p>
                                    <p
                                      className={`text-[9px] ${
                                        isDark ? 'text-gray-500' : 'text-gray-500'
                                      }`}
                                    >
                                      {item.description}
                                    </p>
                                  </div>
                                  <span
                                    className={`font-bold text-xs ${
                                      isDark ? 'text-green-400' : 'text-green-600'
                                    }`}
                                  >
                                    +{item.points}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}

                  {/* No Points Message */}
                  {earnedPoints && earnedPoints.totalPoints === 0 && cart && cart.length > 0 && (
                    <div className="p-2 rounded-lg bg-white/10">
                      <div className="flex items-center gap-1.5">
                        <Gift
                          className={`w-3.5 h-3.5 ${
                            isDark ? 'text-gray-500' : 'text-gray-400'
                          }`}
                        />
                        <p
                          className={`text-[10px] ${
                            isDark ? 'text-gray-400' : 'text-gray-600'
                          }`}
                        >
                          No loyalty points for this order
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  )
}
