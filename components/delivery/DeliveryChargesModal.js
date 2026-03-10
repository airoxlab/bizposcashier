// 'use client'

// import { useState, useEffect } from 'react'
// import { motion } from 'framer-motion'
// import { Truck, Check, X, DollarSign } from 'lucide-react'
// import { themeManager } from '../../lib/themeManager'
// import Modal from '../../components/ui/Modal'

// export default function DeliveryChargesModal({ 
//   isOpen, 
//   onClose, 
//   deliveryCharges = 0, 
//   onSubmit 
// }) {
//   const [charges, setCharges] = useState(deliveryCharges.toString())

//   const classes = themeManager.getClasses()
//   const isDark = themeManager.isDark()

//   useEffect(() => {
//     setCharges(deliveryCharges.toString())
//   }, [deliveryCharges, isOpen])

//   const handleSubmit = () => {
//     const chargesAmount = parseFloat(charges) || 0
//     onSubmit(chargesAmount)
//     onClose()
//   }

//   const quickSetCharges = (amount) => {
//     setCharges(amount.toString())
//   }

//   const chargesValue = parseFloat(charges) || 0

//   return (
//     <Modal
//       isOpen={isOpen}
//       onClose={onClose}
//       title="Set Delivery Charges"
//       maxWidth="max-w-sm"
//     >
//       <div className="space-y-6">
//         <div className="text-center">
//           <div className={`w-16 h-16 rounded-full ${isDark ? 'bg-green-900/50' : 'bg-green-100'} flex items-center justify-center mx-auto mb-4`}>
//             <Truck className={`w-8 h-8 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
//           </div>
//           <p className={`${classes.textSecondary} text-sm text-center`}>
//             Set the delivery charges for this order
//           </p>
//         </div>
        
//         <div className="space-y-4">
//           {/* Manual Input */}
//           <div>
//             <label className={`${classes.textPrimary} block text-sm font-semibold mb-2`}>
//               Delivery Charges (Rs)
//             </label>
//             <div className="relative">
//               <DollarSign className={`absolute left-3 top-3.5 w-4 h-4 ${classes.textSecondary}`} />
//               <input
//                 type="number"
//                 value={charges}
//                 onChange={(e) => setCharges(e.target.value)}
//                 min="0"
//                 step="10"
//                 className={`w-full pl-10 pr-4 py-3 text-lg font-semibold text-center ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-green-500`}
//                 placeholder="0"
//               />
//             </div>
//           </div>
          
//           {/* Quick Set Buttons */}
//           <div>
//             <label className={`${classes.textPrimary} block text-sm font-semibold mb-2`}>
//               Quick Set
//             </label>
//             <div className="grid grid-cols-4 gap-2">
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => quickSetCharges(0)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary} ${
//                   chargesValue === 0 ? 'ring-2 ring-green-500' : ''
//                 }`}
//               >
//                 Free
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => quickSetCharges(50)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary} ${
//                   chargesValue === 50 ? 'ring-2 ring-green-500' : ''
//                 }`}
//               >
//                 Rs 50
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => quickSetCharges(100)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary} ${
//                   chargesValue === 100 ? 'ring-2 ring-green-500' : ''
//                 }`}
//               >
//                 Rs 100
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => quickSetCharges(150)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary} ${
//                   chargesValue === 150 ? 'ring-2 ring-green-500' : ''
//                 }`}
//               >
//                 Rs 150
//               </motion.button>
//             </div>
//           </div>

//           {/* Summary */}
//           {chargesValue > 0 && (
//             <div className={`p-3 bg-gradient-to-r ${isDark ? 'from-green-900/20 to-emerald-900/20 border-green-800' : 'from-green-50 to-emerald-50 border-green-200'} rounded-lg border`}>
//               <div className="flex justify-between items-center">
//                 <span className={`text-sm font-medium ${classes.textPrimary}`}>Delivery Charges:</span>
//                 <span className={`text-lg font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
//                   Rs {chargesValue.toFixed(0)}
//                 </span>
//               </div>
//             </div>
//           )}
//         </div>
        
//         <div className="flex space-x-3 pt-4">
//           <motion.button
//             whileHover={{ scale: 1.02 }}
//             whileTap={{ scale: 0.98 }}
//             onClick={onClose}
//             className={`flex-1 py-2.5 px-4 border-2 ${classes.border} ${classes.textPrimary} font-semibold rounded-lg hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'} transition-colors text-sm`}
//           >
//             <div className="flex items-center justify-center">
//               <X className="w-4 h-4 mr-1" />
//               Cancel
//             </div>
//           </motion.button>
          
//           <motion.button
//             whileHover={{ scale: 1.02 }}
//             whileTap={{ scale: 0.98 }}
//             onClick={handleSubmit}
//             className="flex-1 py-2.5 px-4 font-semibold rounded-lg transition-all duration-200 bg-green-600 hover:bg-green-700 text-white shadow-lg hover:shadow-xl text-sm"
//           >
//             <div className="flex items-center justify-center">
//               <Check className="w-4 h-4 mr-1" />
//               Set Charges
//             </div>
//           </motion.button>
//         </div>
//       </div>
//     </Modal>
//   )
// }