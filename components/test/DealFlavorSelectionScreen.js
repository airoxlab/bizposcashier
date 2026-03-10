'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, Plus, Minus, Gift, Check } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

export default function DealFlavorSelectionScreen({
  deal,
  dealProducts = [],
  onAddToCart,
  onBack,
  classes,
  isDark
}) {
  const [quantity, setQuantity] = useState(1)
  const [selectedFlavors, setSelectedFlavors] = useState({})
  const [selectedProducts, setSelectedProducts] = useState({})
  const [priceAdjustments, setPriceAdjustments] = useState({})
  const firstProductBtnRef = useRef(null)

  // Auto-focus first product button on mount
  useEffect(() => {
    const t = setTimeout(() => firstProductBtnRef.current?.focus(), 150)
    return () => clearTimeout(t)
  }, [])

  // Global keyboard shortcuts for deal screen
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
        return
      }
      if ((e.key === '+' || e.key === '=') && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuantity(q => q + 1)
        return
      }
      if (e.key === '-' && !e.ctrlKey && !e.altKey) {
        e.preventDefault()
        setQuantity(q => Math.max(1, q - 1))
        return
      }
      if (e.key === 'Enter' && e.ctrlKey) {
        e.preventDefault()
        if (canAddToCart()) handleAddToCart()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack])

  // Helper function to get base price (minimum variant price)
  const getBasePrice = (product) => {
    if (!product.variants || product.variants.length === 0) return 0
    const prices = product.variants.map(v => parseFloat(v.price) || 0)
    return Math.min(...prices)
  }

  // Auto-select products without variants or with pre-assigned variants on mount
  useEffect(() => {
    if (!dealProducts || dealProducts.length === 0) return

    const autoSelectedProducts = {}
    const autoSelectedAdjustments = {}

    dealProducts.forEach(product => {
      // Auto-select if:
      // 1. Product has no variants (variants array is empty or null)
      // 2. Product has a pre-assigned variant (variantName exists)
      const hasNoVariants = !product.variants || product.variants.length === 0
      const hasPreAssignedVariant = product.variantName

      if (hasNoVariants || hasPreAssignedVariant) {
        autoSelectedProducts[product.id] = true

        // If product has a pre-assigned variant price, calculate adjustment
        if (hasPreAssignedVariant && product.variantPrice && product.variants && product.variants.length > 0) {
          // Calculate base price inline to avoid dependency
          const prices = product.variants.map(v => parseFloat(v.price) || 0)
          const basePrice = Math.min(...prices)
          const selectedPrice = parseFloat(product.variantPrice) || 0
          const priceDifference = selectedPrice - basePrice
          const adjustment = priceDifference > 0 ? priceDifference : 0
          autoSelectedAdjustments[product.id] = adjustment
        }
      }
    })

    setSelectedProducts(autoSelectedProducts)
    setPriceAdjustments(autoSelectedAdjustments)
  }, [dealProducts])

  const handleFlavorSelect = (productId, variant) => {
    const updatedFlavors = {
      ...selectedFlavors,
      [productId]: variant
    }
    setSelectedFlavors(updatedFlavors)

    // Calculate price adjustment
    const product = dealProducts.find(dp => dp.id === productId)
    if (product && product.variants && product.variants.length > 0) {
      const basePrice = getBasePrice(product)
      const selectedPrice = parseFloat(variant.price) || 0
      const priceDifference = selectedPrice - basePrice

      // Only add positive differences (more expensive variants)
      const adjustment = priceDifference > 0 ? priceDifference : 0

      const updatedAdjustments = {
        ...priceAdjustments,
        [productId]: adjustment
      }
      setPriceAdjustments(updatedAdjustments)

      // Mark product as selected when variant is chosen
      const updatedSelectedProducts = {
        ...selectedProducts,
        [productId]: true
      }
      setSelectedProducts(updatedSelectedProducts)
    }
  }

  const handleProductToggle = (productId) => {
    // Toggle selection state
    const isCurrentlySelected = selectedProducts[productId]
    const updatedSelectedProducts = {
      ...selectedProducts,
      [productId]: !isCurrentlySelected
    }
    setSelectedProducts(updatedSelectedProducts)

    // If deselecting, clear any variant selection for this product
    if (isCurrentlySelected) {
      const updatedFlavors = { ...selectedFlavors }
      delete updatedFlavors[productId]
      setSelectedFlavors(updatedFlavors)

      const updatedAdjustments = { ...priceAdjustments }
      delete updatedAdjustments[productId]
      setPriceAdjustments(updatedAdjustments)
    }
  }

  const handleAddToCart = () => {
    addToCartWithSelection(selectedProducts, selectedFlavors, priceAdjustments)
  }

  // Check if all required selections are made
  const canAddToCart = () => {
    // All deal products must be checked (products without variants are auto-selected)
    for (const product of dealProducts) {
      // Every product must be selected
      if (!selectedProducts[product.id]) {
        return false
      }

      // If product has variants and no pre-assigned variant, user must select one
      const hasVariants = product.variants && product.variants.length > 0
      const hasPreAssignedVariant = product.variantName
      const needsVariantSelection = hasVariants && !hasPreAssignedVariant

      if (needsVariantSelection && !selectedFlavors[product.id]) {
        return false
      }
    }

    return true
  }

  const addToCartWithSelection = (currentSelectedProducts, currentSelectedFlavors, currentPriceAdjustments = priceAdjustments) => {
    if (!deal) return

    // Calculate total price adjustment
    const totalAdjustment = Object.values(currentPriceAdjustments).reduce((sum, adj) => sum + adj, 0)
    const baseDealPrice = parseFloat(deal.price)
    const adjustedDealPrice = baseDealPrice + totalAdjustment

    // Filter to only include selected products
    const selectedDealProducts = dealProducts
      .filter(dp => currentSelectedProducts[dp.id])
      .map(dp => ({
        name: dp.productName || dp.name,
        quantity: dp.quantity,
        variant: currentSelectedFlavors[dp.id] ? currentSelectedFlavors[dp.id].name : (dp.variantName || null),
        // Store price info for reference
        variantPrice: currentSelectedFlavors[dp.id] ? parseFloat(currentSelectedFlavors[dp.id].price) : 0,
        priceAdjustment: currentPriceAdjustments[dp.id] || 0
      }))

    if (selectedDealProducts.length === 0) return

    const cartItem = {
      id: `deal-${deal.id}-${Date.now()}`,
      isDeal: true,
      dealId: deal.id,
      dealName: deal.name,
      dealProducts: selectedDealProducts,
      baseDealPrice: baseDealPrice,  // Original deal price
      priceAdjustment: totalAdjustment, // Total adjustment
      finalPrice: adjustedDealPrice, // Adjusted price
      quantity: quantity,
      totalPrice: adjustedDealPrice * quantity,
      image: deal.image_url
    }

    onAddToCart(cartItem)

    // Close the screen after adding to cart
    onBack()
  }

  const calculateTotalPrice = () => {
    const baseDealPrice = parseFloat(deal.price)
    const totalAdjustment = Object.values(priceAdjustments).reduce((sum, adj) => sum + adj, 0)
    const adjustedDealPrice = baseDealPrice + totalAdjustment
    return adjustedDealPrice * quantity
  }

  const getAdjustedDealPrice = () => {
    const baseDealPrice = parseFloat(deal.price)
    const totalAdjustment = Object.values(priceAdjustments).reduce((sum, adj) => sum + adj, 0)
    return baseDealPrice + totalAdjustment
  }

  if (!deal) return null

  return (
    <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
      {/* Header */}
      <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b p-4`}>
        <div className="flex items-center space-x-4">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={onBack}
            className={`p-2 ${classes.button} rounded-lg hover:${classes.shadow} transition-all`}
          >
            <ArrowLeft className="w-5 h-5" />
          </motion.button>

          <div className="flex-1">
            <div className="flex items-center space-x-2">
              <Gift className="w-5 h-5 text-green-600" />
              <h1 className={`text-xl font-bold ${classes.textPrimary}`}>
                {deal.name}
              </h1>
            </div>
            <p className={`${classes.textSecondary} text-sm`}>
              Special Deal - Rs {deal.price}
            </p>
            <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
              ESC = Back &nbsp;•&nbsp; +/− = Qty &nbsp;•&nbsp; Ctrl+Enter = Add to Cart
            </p>
          </div>

          <div className="text-right">
            <div className={`text-xs ${classes.textSecondary}`}>
              {new Date().toLocaleDateString()}
            </div>
            <div className={`text-sm font-semibold ${classes.textPrimary}`}>
              {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Deal Products Selection */}
        {dealProducts && dealProducts.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-base font-bold ${classes.textPrimary}`}>Select Products</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              {dealProducts.map((product, index) => {
                const isSelected = selectedProducts[product.id]
                const hasNoVariants = !product.variants || product.variants.length === 0
                const hasPreAssignedVariant = product.variantName
                const isLocked = hasNoVariants || hasPreAssignedVariant

                return (
                  <motion.button
                    key={index}
                    ref={index === 0 ? firstProductBtnRef : null}
                    whileHover={{ scale: isLocked ? 1 : 1.05 }}
                    whileTap={{ scale: isLocked ? 1 : 0.95 }}
                    onClick={() => !isLocked && handleProductToggle(product.id)}
                    disabled={isLocked}
                    className={`px-4 py-2 rounded-lg border-2 transition-all duration-200 flex items-center space-x-2 ${
                      isSelected
                        ? `border-green-500 ${isDark ? 'bg-green-900/20' : 'bg-green-50'}`
                        : `${classes.border} border-gray-200 ${isLocked ? 'opacity-60' : 'hover:border-green-300 hover:' + (isDark ? 'bg-gray-700/50' : 'bg-gray-50')}`
                    } ${isLocked ? 'cursor-default' : 'cursor-pointer'}`}
                  >
                    <div className="flex flex-col items-start">
                      <div className={`font-semibold text-sm ${
                        isSelected
                          ? isDark ? 'text-green-300' : 'text-green-700'
                          : classes.textPrimary
                      }`}>
                        {product.quantity}x {product.productName || product.name}
                      </div>
                      {(product.variantName || product.description) && (
                        <div className={`text-xs ${
                          isSelected
                            ? isDark ? 'text-green-400' : 'text-green-600'
                            : classes.textSecondary
                        }`}>
                          {product.variantName || product.description}
                        </div>
                      )}
                      {isLocked && (
                        <div className="text-[10px] text-gray-500">
                          (Auto-included)
                        </div>
                      )}
                    </div>
                    {isSelected && (
                      <Check className="w-4 h-4 text-green-500" />
                    )}
                  </motion.button>
                )
              })}
            </div>
          </div>
        )}

        {/* Variant Selection for each product */}
        {dealProducts.map((product) => {
          // Skip if product is not selected
          if (!selectedProducts[product.id]) return null

          // Skip if product already has a specific variant assigned or has no variants to choose from
          if (product.variantName || !product.variants || product.variants.length === 0) return null

          return (
            <div
              key={product.id}
            >
              <div className="flex items-center justify-between mb-2">
                <h3 className={`text-base font-bold ${classes.textPrimary}`}>
                  Select Variant for {product.productName || product.name}
                </h3>
                {!selectedFlavors[product.id] && selectedProducts[product.id] && (
                  <span className={`${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-600'} text-xs font-semibold px-2 py-1 rounded-full`}>
                    Required
                  </span>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const isSelected = selectedFlavors[product.id]?.id === variant.id

                  return (
                    <motion.button
                      key={variant.id}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => handleFlavorSelect(product.id, variant)}
                      className={`px-4 py-2 rounded-lg border-2 transition-all duration-200 flex items-center space-x-2 ${
                        isSelected
                          ? `border-green-500 ${isDark ? 'bg-green-900/20' : 'bg-green-50'}`
                          : `${classes.border} border-gray-200 hover:border-green-300 hover:${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`
                      }`}
                    >
                      <div className={`font-semibold text-sm ${
                        isSelected
                          ? isDark ? 'text-green-300' : 'text-green-700'
                          : classes.textPrimary
                      }`}>
                        {variant.name}
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-green-500" />
                      )}
                    </motion.button>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Quantity Selector */}
        <div>
          <h3 className={`text-base font-bold ${classes.textPrimary} mb-2`}>Quantity</h3>
          <div className="flex items-center space-x-4">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setQuantity(Math.max(1, quantity - 1))}
              className="w-10 h-10 bg-red-500 hover:bg-red-600 text-white rounded-lg flex items-center justify-center transition-all"
            >
              <Minus className="w-4 h-4" />
            </motion.button>

            <div className="flex-1 text-center">
              <div className={`text-2xl font-bold ${classes.textPrimary}`}>{quantity}</div>
            </div>

            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onClick={() => setQuantity(quantity + 1)}
              className="w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-lg flex items-center justify-center transition-all"
            >
              <Plus className="w-4 h-4" />
            </motion.button>
          </div>
        </div>

        {/* Price Summary */}
        <div
          className={`p-4 bg-gradient-to-r ${isDark ? 'from-green-900/20 to-emerald-900/20 border-green-800' : 'from-green-50 to-emerald-50 border-green-200'} rounded-xl border-2`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className={`text-base font-bold ${classes.textPrimary}`}>Deal Price</div>
              <div className={`text-xs ${classes.textSecondary}`}>
                Base: Rs {deal.price}
                {Object.values(priceAdjustments).reduce((sum, adj) => sum + adj, 0) > 0 && (
                  <span className="text-orange-600 font-semibold">
                    {' '}+ Rs {Object.values(priceAdjustments).reduce((sum, adj) => sum + adj, 0)} (variant upgrade)
                  </span>
                )}
              </div>
              <div className={`text-xs ${classes.textSecondary}`}>
                Rs {getAdjustedDealPrice()} × {quantity}
              </div>
            </div>
            <div className="text-right">
              <div className={`text-2xl font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                Rs {calculateTotalPrice().toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Add to Cart Button */}
        <motion.button
          whileHover={{ scale: canAddToCart() ? 1.02 : 1 }}
          whileTap={{ scale: canAddToCart() ? 0.98 : 1 }}
          onClick={handleAddToCart}
          disabled={!canAddToCart()}
          className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
            canAddToCart()
              ? 'bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl cursor-pointer'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-50'
          }`}
        >
          {canAddToCart() ? (
            <span className="flex items-center justify-center space-x-2">
              <Gift className="w-5 h-5" />
              <span>Add Deal to Cart</span>
            </span>
          ) : (
            <span>Please select all required variants</span>
          )}
        </motion.button>
      </div>
    </div>
  )
}
