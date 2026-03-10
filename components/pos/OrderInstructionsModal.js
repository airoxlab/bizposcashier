'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { FileText, Save, X } from 'lucide-react'
import Modal from '../ui/Modal'

export default function OrderInstructionsModal({ isOpen, onClose, instructions, onSave }) {
  const [localInstructions, setLocalInstructions] = useState(instructions || '')

  const handleSave = () => {
    onSave(localInstructions)
    onClose()
  }

  const handleClose = () => {
    setLocalInstructions(instructions || '')
    onClose()
  }

  const commonInstructions = [
    'No spice',
    'Extra spicy',
    'No onions',
    'Extra cheese',
    'Less salt',
    'Well done',
    'Medium rare',
    'Extra sauce',
    'No sauce',
    'Extra hot'
  ]

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Order Instructions"
      maxWidth="max-w-lg"
    >
      <div className="space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <FileText className="w-8 h-8 text-orange-600 dark:text-orange-400" />
          </div>
          <p className="text-gray-600 dark:text-gray-400">
            Add special instructions for this order
          </p>
        </div>
{/* Quick Instructions */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Quick Select:
          </h4>
          <div className="grid grid-cols-2 gap-2">
            {commonInstructions.map((instruction, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  if (localInstructions) {
                    setLocalInstructions(localInstructions + ', ' + instruction)
                  } else {
                    setLocalInstructions(instruction)
                  }
                }}
                className="p-2 text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 rounded-lg transition-all duration-200 border border-gray-300 dark:border-gray-600"
              >
                {instruction}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Custom Instructions */}
        <div>
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
            Custom Instructions:
          </h4>
          <textarea
            value={localInstructions}
            onChange={(e) => setLocalInstructions(e.target.value)}
            placeholder="Enter any special instructions for this order..."
            rows={4}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 resize-none"
          />
          <div className="text-right mt-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {localInstructions.length}/500
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex space-x-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleClose}
            className="flex-1 px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-semibold rounded-xl transition-all duration-200"
          >
            <div className="flex items-center justify-center">
              <X className="w-4 h-4 mr-2" />
              Cancel
            </div>
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            className="flex-1 px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg"
          >
            <div className="flex items-center justify-center">
              <Save className="w-4 h-4 mr-2" />
              Save Instructions
            </div>
          </motion.button>
        </div>

        {/* Preview */}
        {localInstructions && (
          <div className="p-4 bg-orange-50 dark:bg-orange-900/30 rounded-xl border border-orange-200 dark:border-orange-800">
            <h5 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">
              Preview:
            </h5>
            <p className="text-orange-700 dark:text-orange-300 text-sm">
              "{localInstructions}"
            </p>
          </div>
        )}
      </div>
    </Modal>
  )
}