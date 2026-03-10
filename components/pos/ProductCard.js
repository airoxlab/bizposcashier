'use client'

import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'

export default function ProductCard({ product, onClick }) {
  return (
    <motion.div
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onClick(product)}
      className="bg-white dark:bg-gray-800 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 cursor-pointer overflow-hidden group"
    >
      {/* Product Image */}
      <div className="relative h-48 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-300"
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400 dark:text-gray-500 text-4xl font-bold">
              {product.name.charAt(0)}
            </div>
          </div>
        )}
        
        {/* Price Label */}
        <div className="absolute top-3 right-3 bg-purple-600 text-white px-3 py-1 rounded-full text-sm font-semibold shadow-lg">
          Rs {product.base_price}
        </div>

        {/* Add Button */}
        <motion.div
          whileHover={{ scale: 1.1, rotate: 90 }}
          className="absolute bottom-3 right-3 w-10 h-10 bg-white dark:bg-gray-800 rounded-full flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        >
          <Plus className="w-5 h-5 text-purple-600" />
        </motion.div>
      </div>

      {/* Product Info */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-800 dark:text-white text-lg mb-2 line-clamp-1">
          {product.name}
        </h3>
        {product.description && (
          <p className="text-gray-600 dark:text-gray-400 text-sm line-clamp-2">
            {product.description}
          </p>
        )}
        {product.ingredients && (
          <p className="text-gray-500 dark:text-gray-500 text-xs mt-2 line-clamp-1">
            {product.ingredients}
          </p>
        )}
      </div>
    </motion.div>
  )
}