'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, Check } from 'lucide-react'

export default function VariantSidebar({ 
  isOpen, 
  onClose, 
  product, 
  variants, 
  selectedVariant, 
  onVariantSelect, 
  quantity, 
  onQuantityChange, 
  onAddToCart 
}) {
  const calculateFinalPrice = () => {
    if (!product) return 0
    const basePrice = parseFloat(product.base_price)
    const variantPrice = selectedVariant ? parseFloat(selectedVariant.price) : 0
    return basePrice + variantPrice
  }

  const calculateTotalPrice = () => {
    return calculateFinalPrice() * quantity
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          />
          
          {/* Sidebar - More compact and responsive */}
          <motion.div
            initial={{ x: -1000, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -1000, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="relative w-[400px] sm:w-[450px] md:w-[500px] h-full bg-white shadow-2xl flex flex-col overflow-hidden"
          >
            {/* Header - More compact */}
            <div className="p-3 border-b border-gray-200 bg-purple-600 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-bold text-white truncate">
                    {product?.name}
                  </h3>
                  <p className="text-purple-200 text-xs">
                    Customize your order
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors ml-2"
                >
                  <X className="w-5 h-5 text-white" />
                </button>
              </div>
            </div>

            {/* Content - Compact layout */}
            <div className="flex-1 flex flex-col p-3 min-h-0">
              {/* Product Image and Price - Smaller */}
              <div className="text-center mb-3 flex-shrink-0">
                <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2 overflow-hidden">
                  {product?.image_url ? (
                    <img
                      src={product.image_url}
                      alt={product.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-gray-400 text-lg font-bold">
                      {product?.name?.charAt(0)}
                    </span>
                  )}
                </div>
                <div className="text-xl font-bold text-gray-800 mb-1">
                  Rs {calculateFinalPrice().toFixed(2)}
                </div>
                <div className="text-xs text-gray-500">
                  Base: Rs {product?.base_price}
                  {selectedVariant && ` + Rs ${selectedVariant.price}`}
                </div>
              </div>

              {/* Variants Section - Compact */}
              <div className="flex-1 min-h-0 mb-3">
                {variants && variants.length > 0 ? (
                  <div className="h-full flex flex-col">
                    <div className="flex items-center justify-between mb-2 flex-shrink-0">
                      <h4 className="text-sm font-bold text-gray-800">
                        Select Size
                      </h4>
                      {!selectedVariant && (
                        <span className="bg-red-100 text-red-600 text-xs font-semibold px-2 py-1 rounded-full">
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2" style={{scrollbarWidth: 'none', msOverflowStyle: 'none'}}>
                      <style jsx>{`
                        div::-webkit-scrollbar {
                          display: none;
                        }
                      `}</style>
                      {variants.map((variant) => (
                        <button
                          key={variant.id}
                          onClick={() => onVariantSelect(variant)}
                          className={`
                            w-full p-2 rounded-lg border-2 transition-all duration-200 text-left
                            ${selectedVariant?.id === variant.id
                              ? 'border-purple-500 bg-purple-50 shadow-md'
                              : 'border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50'
                            }
                          `}
                        >
                          <div className="flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                              <div className={`font-semibold text-sm truncate ${
                                selectedVariant?.id === variant.id
                                  ? 'text-purple-700'
                                  : 'text-gray-700'
                              }`}>
                                {variant.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                +Rs {variant.price}
                              </div>
                            </div>
                            <div className="flex items-center space-x-2 ml-2">
                              <div className="text-sm font-bold text-gray-800">
                                Rs {(parseFloat(product?.base_price || 0) + parseFloat(variant.price)).toFixed(2)}
                              </div>
                              {selectedVariant?.id === variant.id && (
                                <div className="w-4 h-4 bg-purple-500 rounded-full flex items-center justify-center">
                                  <Check className="w-3 h-3 text-white" />
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="p-2 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-600 mr-2" />
                      <p className="text-green-700 font-medium text-sm">
                        Ready to add to cart
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Quantity Section - Compact */}
              <div className="flex-shrink-0">
                <h4 className="text-sm font-bold text-gray-800 mb-2 text-center">
                  Quantity
                </h4>
                <div className="flex items-center justify-center space-x-4">
                  <button
                    onClick={() => onQuantityChange(Math.max(1, quantity - 1))}
                    className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <Minus className="w-4 h-4" />
                  </button>
                  <div className="text-center min-w-[60px]">
                    <div className="text-2xl font-bold text-gray-800">
                      {quantity}
                    </div>
                    <div className="text-xs text-gray-500">
                      Items
                    </div>
                  </div>
                  <button
                    onClick={() => onQuantityChange(quantity + 1)}
                    className="w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors shadow-lg"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Footer - Compact */}
            <div className="p-3 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="mb-2 p-2 bg-white rounded-lg border">
                <div className="flex justify-between items-center">
                  <span className="text-gray-600 font-medium text-sm">Total:</span>
                  <span className="text-lg font-bold text-green-600">
                    Rs {calculateTotalPrice().toFixed(2)}
                  </span>
                </div>
              </div>

              <button
                onClick={onAddToCart}
                disabled={(variants && variants.length > 0 && !selectedVariant)}
                className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-bold py-2 rounded-lg shadow-lg transition-all duration-200 disabled:cursor-not-allowed text-sm"
              >
                <div className="flex items-center justify-center">
                  <Plus className="w-4 h-4 mr-1" />
                  Add to Cart - Rs {calculateTotalPrice().toFixed(2)}
                </div>
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}