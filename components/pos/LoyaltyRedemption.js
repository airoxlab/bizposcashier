'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Award, Gift, Check, X, AlertCircle } from 'lucide-react'

/**
 * LoyaltyRedemption Component
 * Displays available redemption options and allows customer to redeem points
 */
export default function LoyaltyRedemption({
  customer,
  orderTotal,
  onRedemptionApplied,
  onRedemptionRemoved,
  theme = 'light',
  loyaltyManager,
  compact = false
}) {
  const [customerPoints, setCustomerPoints] = useState(null)
  const [availableRedemptions, setAvailableRedemptions] = useState([])
  const [selectedRedemption, setSelectedRedemption] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const isDark = theme === 'dark'

  // Fetch customer points and available redemptions
  useEffect(() => {
    if (!customer || !loyaltyManager) {
      setIsLoading(false)
      return
    }

    loadCustomerPoints()
  }, [customer, loyaltyManager])

  const loadCustomerPoints = async () => {
    setIsLoading(true)
    try {
      const points = await loyaltyManager.getCustomerPoints(customer.id)
      setCustomerPoints(points)

      if (points && points.current_balance > 0) {
        // Get redemption options that customer can afford and meet order minimum
        const allOptions = loyaltyManager.getAvailableRedemptions(points.current_balance)

        // Filter by minimum order amount
        const qualifiedOptions = allOptions.filter(option => {
          const meetsMinimum = !option.min_order_amount || orderTotal >= option.min_order_amount
          return meetsMinimum
        })

        setAvailableRedemptions(qualifiedOptions)
      }
    } catch (error) {
      console.error('Error loading customer points:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyRedemption = (redemption) => {
    if (selectedRedemption?.id === redemption.id) {
      // Already selected, remove it
      handleRemoveRedemption()
      return
    }

    setSelectedRedemption(redemption)

    // Calculate discount amount based on redemption type
    let discountAmount = 0
    switch (redemption.redemption_type) {
      case 'DISCOUNT_AMOUNT':
        discountAmount = redemption.discount_amount
        break
      case 'DISCOUNT_PERCENT':
        discountAmount = (orderTotal * redemption.discount_percent) / 100
        break
      // FREE_PRODUCT and FREE_DEAL would need different handling
      case 'FREE_PRODUCT':
      case 'FREE_DEAL':
        // For now, treat as fixed discount equal to product/deal price
        discountAmount = redemption.discount_amount || 0
        break
      default:
        discountAmount = 0
    }

    // Call parent callback with redemption details
    if (onRedemptionApplied) {
      onRedemptionApplied({
        redemptionOptionId: redemption.id,
        pointsToRedeem: redemption.points_required,
        discountAmount: Math.min(discountAmount, orderTotal), // Can't discount more than order total
        redemptionName: redemption.name,
        redemptionType: redemption.redemption_type
      })
    }
  }

  const handleRemoveRedemption = () => {
    setSelectedRedemption(null)
    if (onRedemptionRemoved) {
      onRedemptionRemoved()
    }
  }

  // Style classes based on theme
  const classes = {
    card: isDark ? 'bg-gray-800' : 'bg-white',
    border: isDark ? 'border-gray-700' : 'border-gray-200',
    textPrimary: isDark ? 'text-white' : 'text-gray-900',
    textSecondary: isDark ? 'text-gray-400' : 'text-gray-600',
    hover: isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50',
    selected: isDark ? 'bg-purple-900/30 border-purple-500' : 'bg-purple-50 border-purple-500'
  }

  // Don't show if no customer or no points
  if (!customer || isLoading) return null

  if (!customerPoints || customerPoints.current_balance === 0) {
    return null // No points to redeem
  }

  if (availableRedemptions.length === 0) {
    return (
      <div className={`${classes.card} rounded-${compact ? 'lg' : '2xl'} p-${compact ? '2' : '6'} border ${classes.border}`}>
        <div className={`flex items-center mb-${compact ? '1' : '4'}`}>
          <Gift className={`w-${compact ? '4' : '6'} h-${compact ? '4' : '6'} mr-${compact ? '1' : '2'} text-purple-600`} />
          <h3 className={`text-${compact ? 'sm' : 'lg'} font-bold ${classes.textPrimary}`}>
            Loyalty Points Redemption
          </h3>
        </div>

        <div className={`flex items-center p-${compact ? '2' : '4'} rounded-lg ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
          <Award className={`w-${compact ? '4' : '5'} h-${compact ? '4' : '5'} mr-2 ${classes.textSecondary}`} />
          <div>
            <p className={`${classes.textPrimary} font-medium text-${compact ? 'xs' : 'base'}`}>
              Available Balance: {customerPoints.current_balance} points
            </p>
            <p className={`text-${compact ? 'xs' : 'sm'} ${classes.textSecondary}`}>
              No redemption options available for this order
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={`${classes.card} rounded-${compact ? 'lg' : '2xl'} p-${compact ? '2' : '6'} border ${classes.border}`}>
      <div className={`flex items-center justify-between mb-${compact ? '2' : '4'}`}>
        <div className="flex items-center">
          <Gift className={`w-${compact ? '4' : '6'} h-${compact ? '4' : '6'} mr-${compact ? '1' : '2'} text-purple-600`} />
          <h3 className={`text-${compact ? 'sm' : 'lg'} font-bold ${classes.textPrimary}`}>
            Loyalty Points Redemption
          </h3>
        </div>

        {selectedRedemption && (
          <button
            onClick={handleRemoveRedemption}
            className={`flex items-center px-${compact ? '2' : '3'} py-${compact ? '1' : '1.5'} text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all text-${compact ? 'xs' : 'sm'}`}
          >
            <X className={`w-${compact ? '3' : '4'} h-${compact ? '3' : '4'} mr-1`} />
            Remove
          </button>
        )}
      </div>

      {/* Current Balance */}
      <div className={`flex items-center p-${compact ? '2' : '4'} rounded-lg mb-${compact ? '2' : '4'} ${isDark ? 'bg-gradient-to-r from-purple-900/30 to-blue-900/30' : 'bg-gradient-to-r from-purple-50 to-blue-50'} border ${isDark ? 'border-purple-700/30' : 'border-purple-200'}`}>
        <Award className={`w-${compact ? '4' : '5'} h-${compact ? '4' : '5'} mr-${compact ? '2' : '3'} ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
        <div>
          <p className={`text-${compact ? 'xs' : 'sm'} ${classes.textSecondary}`}>Available Balance</p>
          <p className={`text-${compact ? 'lg' : '2xl'} font-bold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
            {customerPoints.current_balance} points
          </p>
        </div>
        {customerPoints.loyalty_tier && (
          <div className={`ml-auto px-${compact ? '2' : '3'} py-${compact ? '0.5' : '1'} rounded-full text-${compact ? '[10px]' : 'xs'} font-bold ${
            customerPoints.loyalty_tier === 'PLATINUM' ? 'bg-gray-700 text-white' :
            customerPoints.loyalty_tier === 'GOLD' ? 'bg-yellow-500 text-white' :
            customerPoints.loyalty_tier === 'SILVER' ? 'bg-gray-400 text-white' :
            'bg-orange-600 text-white'
          }`}>
            {customerPoints.loyalty_tier}
          </div>
        )}
      </div>

      {/* Redemption Options */}
      <div className={`space-y-${compact ? '1.5' : '3'}`}>
        <p className={`text-${compact ? 'xs' : 'sm'} font-medium ${classes.textSecondary} mb-${compact ? '1' : '2'}`}>
          Available Rewards ({availableRedemptions.length})
        </p>

        <AnimatePresence>
          {availableRedemptions.map((redemption) => {
            const isSelected = selectedRedemption?.id === redemption.id
            let discountDisplay = ''

            switch (redemption.redemption_type) {
              case 'DISCOUNT_AMOUNT':
                discountDisplay = `PKR ${redemption.discount_amount} OFF`
                break
              case 'DISCOUNT_PERCENT':
                discountDisplay = `${redemption.discount_percent}% OFF`
                break
              case 'FREE_PRODUCT':
                discountDisplay = 'Free Product'
                break
              case 'FREE_DEAL':
                discountDisplay = 'Free Deal'
                break
              default:
                discountDisplay = 'Discount'
            }

            return (
              <div
                key={redemption.id}
                onClick={() => handleApplyRedemption(redemption)}
                className={`p-${compact ? '2' : '4'} rounded-lg border-2 cursor-pointer transition-all ${
                  isSelected
                    ? classes.selected
                    : `${classes.border} ${classes.hover}`
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className={`flex items-center mb-${compact ? '1' : '2'}`}>
                      <div className={`w-${compact ? '8' : '12'} h-${compact ? '8' : '12'} rounded-full flex items-center justify-center ${
                        isSelected
                          ? isDark ? 'bg-purple-600' : 'bg-purple-500'
                          : isDark ? 'bg-gray-700' : 'bg-gray-100'
                      } mr-${compact ? '2' : '3'}`}>
                        <Gift className={`w-${compact ? '4' : '6'} h-${compact ? '4' : '6'} ${
                          isSelected ? 'text-white' : isDark ? 'text-purple-400' : 'text-purple-600'
                        }`} />
                      </div>
                      <div>
                        <h4 className={`text-${compact ? 'xs' : 'base'} font-bold ${classes.textPrimary}`}>
                          {redemption.name}
                        </h4>
                        <p className={`text-${compact ? 'xs' : 'sm'} ${isSelected ? 'text-purple-600 dark:text-purple-400' : classes.textSecondary}`}>
                          {discountDisplay}
                        </p>
                      </div>
                    </div>

                    {redemption.description && !compact && (
                      <p className={`text-sm ${classes.textSecondary} mb-2`}>
                        {redemption.description}
                      </p>
                    )}

                    <div className="flex items-center justify-between">
                      <div className={`flex items-center px-${compact ? '2' : '3'} py-${compact ? '0.5' : '1'} rounded-full ${
                        isDark ? 'bg-gray-700' : 'bg-gray-100'
                      }`}>
                        <Award className={`w-${compact ? '3' : '4'} h-${compact ? '3' : '4'} mr-1 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                        <span className={`text-${compact ? 'xs' : 'sm'} font-semibold ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                          {redemption.points_required} points
                        </span>
                      </div>

                      {redemption.min_order_amount && (
                        <span className={`text-xs ${classes.textSecondary}`}>
                          Min: PKR {redemption.min_order_amount}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className={`ml-${compact ? '2' : '4'} flex-shrink-0`}>
                    {isSelected && (
                      <div className={`w-${compact ? '5' : '8'} h-${compact ? '5' : '8'} rounded-full bg-green-500 flex items-center justify-center`}>
                        <Check className={`w-${compact ? '3' : '5'} h-${compact ? '3' : '5'} text-white`} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </AnimatePresence>
      </div>

      {/* Info Message */}
      {selectedRedemption && (
        <div className={`mt-${compact ? '2' : '4'} p-${compact ? '1.5' : '3'} rounded-lg border ${
            isDark
              ? 'bg-green-900/20 border-green-700/30'
              : 'bg-green-50 border-green-200'
          }`}
        >
          <div className="flex items-center">
            <AlertCircle className={`w-${compact ? '3' : '5'} h-${compact ? '3' : '5'} mr-${compact ? '1' : '2'} ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            <p className={`text-${compact ? 'xs' : 'sm'} font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>
              Redemption applied! {selectedRedemption.points_required} points will be deducted after payment.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
