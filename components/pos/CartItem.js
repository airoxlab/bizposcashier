'use client'

import { motion } from 'framer-motion'
import { Plus, Minus, Trash2, Edit3, Percent } from 'lucide-react'

export default function CartItem({ 
  item, 
  onUpdateQuantity, 
  onRemove, 
  onEdit, 
  onApplyDiscount 
}) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4 group"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="font-medium text-gray-800 dark:text-white">
            {item.productName}
          </h4>
          {item.variantName && (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Size: {item.variantName}
            </p>
          )}
          <p className="text-sm font-semibold text-purple-600 dark:text-purple-400">
            Rs {item.finalPrice}
          </p>
        </div>
        
        {/* Action Buttons */}
        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit && onEdit(item)}
            className="p-1 text-blue-500 hover:text-blue-700 transition-colors"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onApplyDiscount && onApplyDiscount(item)}
            className="p-1 text-green-500 hover:text-green-700 transition-colors"
          >
            <Percent className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRemove(item.id)}
            className="p-1 text-red-500 hover:text-red-700 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onUpdateQuantity(item.id, item.quantity - 1)}
            className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <Minus className="w-4 h-4" />
          </motion.button>
          <span className="font-semibold text-gray-800 dark:text-white w-8 text-center">
            {item.quantity}
          </span>
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
            className="w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors"
          >
            <Plus className="w-4 h-4" />
          </motion.button>
        </div>
        <div className="text-right">
          <p className="font-semibold text-gray-800 dark:text-white">
            Rs {item.totalPrice.toFixed(2)}
          </p>
        </div>
      </div>
    </motion.div>
  )
}