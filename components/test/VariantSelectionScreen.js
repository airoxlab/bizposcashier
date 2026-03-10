'use client'

import { motion } from 'framer-motion'
import { ArrowLeft, Plus, Minus, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'

export default function VariantSelectionScreen({
  product,
  variants = [],
  onAddToCart,
  onBack,
  classes,
  isDark
}) {
  const [selectedVariant, setSelectedVariant] = useState(null)
  const [quantity, setQuantity] = useState(1)
  const [isIngredientsOpen, setIsIngredientsOpen] = useState(false)
  const firstVariantBtnRef = useRef(null)
  const variantContainerRef = useRef(null)

  // Arrow key navigation between variant buttons
  const handleVariantKeyDown = (e, variant) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault()
      const btns = [...variantContainerRef.current.querySelectorAll('button')]
      const idx = btns.indexOf(e.currentTarget)
      if (idx < btns.length - 1) btns[idx + 1].focus()
      return
    }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      const btns = [...variantContainerRef.current.querySelectorAll('button')]
      const idx = btns.indexOf(e.currentTarget)
      if (idx > 0) btns[idx - 1].focus()
      return
    }
  }

  // Auto-focus first variant button on mount
  useEffect(() => {
    if (variants && variants.length > 0) {
      const t = setTimeout(() => firstVariantBtnRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [])

  // Escape → go back
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onBack()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onBack])

  // Auto-add to cart when variant is selected (if variants exist) or immediately if no variants
  const autoAddToCart = (variant = null) => {
    if (!product) return

    let finalPrice
    let variantPrice = 0
    let basePrice = parseFloat(product.base_price)

    if (variant) {
      finalPrice = parseFloat(variant.price)
      variantPrice = finalPrice
      basePrice = 0
    } else {
      finalPrice = basePrice
    }

    const cartItem = {
      id: `${product.id}-${variant?.id || 'base'}-${Date.now()}`,
      productId: product.id,
      variantId: variant?.id || null,
      productName: product.name,
      variantName: variant?.name || null,
      basePrice: basePrice,
      variantPrice: variantPrice,
      finalPrice: finalPrice,
      quantity: quantity,
      totalPrice: finalPrice * quantity,
      image: product.image_url
    }

    onAddToCart(cartItem)

    // Auto-close the screen after adding to cart
    setTimeout(() => {
      onBack()
    }, 100)
  }

  // Auto-add to cart if no variants exist
  useEffect(() => {
    if (product && (!variants || variants.length === 0)) {
      autoAddToCart()
    }
  }, [])

  const calculateFinalPrice = () => {
    if (!product) return 0

    if (selectedVariant) {
      return parseFloat(selectedVariant.price)
    } else {
      return parseFloat(product.base_price)
    }
  }

  const calculateTotalPrice = () => {
    return calculateFinalPrice() * quantity
  }

  const handleAddToCart = () => {
    if (!product) return

    // If product has variants but none selected, don't allow
    if (variants.length > 0 && !selectedVariant) {
      return
    }

    let finalPrice
    let variantPrice = 0
    let basePrice = parseFloat(product.base_price)

    if (selectedVariant) {
      finalPrice = parseFloat(selectedVariant.price)
      variantPrice = finalPrice
      basePrice = 0
    } else {
      finalPrice = basePrice
    }

    const cartItem = {
      id: `${product.id}-${selectedVariant?.id || 'base'}-${Date.now()}`,
      productId: product.id,
      variantId: selectedVariant?.id || null,
      productName: product.name,
      variantName: selectedVariant?.name || null,
      basePrice: basePrice,
      variantPrice: variantPrice,
      finalPrice: finalPrice,
      quantity: quantity,
      totalPrice: finalPrice * quantity,
      image: product.image_url
    }

    onAddToCart(cartItem)
  }

  if (!product) return null

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
            <h1 className={`text-xl font-bold ${classes.textPrimary}`}>
              {product.name}
            </h1>
            <p className={`${classes.textSecondary} text-sm`}>
              {variants.length > 0 ? 'Select a size to continue' : `Rs ${product.base_price}`}
            </p>
            {variants.length > 0 && (
              <p className={`text-xs mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                ESC = Back &nbsp;•&nbsp; Arrow keys = Navigate &nbsp;•&nbsp; Enter = Select
              </p>
            )}
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
        {/* Collapsible Ingredients Section */}
        {product.ingredients && (
          <div
            className={`${classes.card} rounded-xl ${classes.border} border`}
          >
            <button
              onClick={() => setIsIngredientsOpen(!isIngredientsOpen)}
              className="w-full p-3 flex items-center justify-between"
            >
              <h3 className={`text-sm font-bold ${classes.textPrimary}`}>Ingredients</h3>
              {isIngredientsOpen ? (
                <ChevronUp className={`w-4 h-4 ${classes.textSecondary}`} />
              ) : (
                <ChevronDown className={`w-4 h-4 ${classes.textSecondary}`} />
              )}
            </button>
            {isIngredientsOpen && (
              <div
                className="px-3 pb-3"
              >
                <p className={`${classes.textSecondary} text-sm`}>{product.ingredients}</p>
              </div>
            )}
          </div>
        )}

        {/* Size Selection */}
        {variants && variants.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className={`text-base font-bold ${classes.textPrimary}`}>Choose Size</h3>
              {!selectedVariant && (
                <span className={`${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-100 text-red-600'} text-xs font-semibold px-2 py-1 rounded-full`}>
                  Required
                </span>
              )}
            </div>

            <div ref={variantContainerRef} className="flex flex-wrap gap-2">
              {variants.map((variant, index) => {
                const variantPrice = parseFloat(variant.price)
                const isSelected = selectedVariant?.id === variant.id

                return (
                  <motion.button
                    key={variant.id}
                    ref={index === 0 ? firstVariantBtnRef : null}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => {
                      setSelectedVariant(variant)
                      autoAddToCart(variant)
                    }}
                    onKeyDown={(e) => handleVariantKeyDown(e, variant)}
                    className={`px-4 py-2 rounded-lg border-2 transition-all duration-200 flex items-center space-x-2 ${isSelected
                      ? `border-green-500 ${isDark ? 'bg-green-900/20' : 'bg-green-50'}`
                      : `${classes.border} border-gray-200 hover:border-green-300 hover:${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`
                    }`}
                  >
                    <div className="flex flex-col">
                      <div className={`font-semibold text-sm ${isSelected
                        ? isDark ? 'text-green-300' : 'text-green-700'
                        : classes.textPrimary
                      }`}>
                        {variant.name}
                      </div>
                      <div className={`text-xs font-bold ${isSelected
                        ? isDark ? 'text-green-400' : 'text-green-600'
                        : classes.textPrimary
                      }`}>
                        Rs {variantPrice.toFixed(2)}
                      </div>
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

        {/* No variants message */}
        {(!variants || variants.length === 0) && (
          <div
            className={`${isDark ? 'bg-green-900/20 border-green-800' : 'bg-green-50 border-green-200'} border-2 rounded-xl p-3`}
          >
            <p className={`${isDark ? 'text-green-300' : 'text-green-700'} font-medium text-sm`}>
              Base price: Rs {product.base_price}
            </p>
          </div>
        )}

        {/* Price Summary */}
        <div
          className={`p-4 bg-gradient-to-r ${isDark ? 'from-green-900/20 to-emerald-900/20 border-green-800' : 'from-green-50 to-emerald-50 border-green-200'} rounded-xl border-2`}
        >
          <div className="flex justify-between items-center">
            <div>
              <div className={`text-base font-bold ${classes.textPrimary}`}>Total Price</div>
              <div className={`text-xs ${classes.textSecondary}`}>
                Rs {calculateFinalPrice().toFixed(2)} × {quantity}
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
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={handleAddToCart}
          disabled={variants.length > 0 && !selectedVariant}
          className={`w-full py-3 font-bold rounded-xl transition-all duration-200 text-base ${
            variants.length > 0 && !selectedVariant
              ? `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500'} cursor-not-allowed`
              : 'bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white shadow-lg hover:shadow-xl'
          }`}
        >
          <div className="flex items-center justify-center space-x-2">
            <Plus className="w-5 h-5" />
            <span>
              {variants.length > 0 && !selectedVariant
                ? 'Select Size First'
                : `Add to Cart - Rs ${calculateTotalPrice().toFixed(2)}`
              }
            </span>
          </div>
        </motion.button>
      </div>
    </div>
  )
}
