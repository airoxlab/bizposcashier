// 'use client'

// import { useState, useEffect } from 'react'
// import { motion } from 'framer-motion'
// import { Clock, X, Check, Truck } from 'lucide-react'
// import { themeManager } from '../../lib/themeManager'
// import { notify } from '../../components/ui/NotificationSystem'

// export default function DeliveryTimeModal({ isOpen, onClose, deliveryTime, onSubmit }) {
//   const [selectedTime, setSelectedTime] = useState(deliveryTime)

//   const classes = themeManager.getClasses()
//   const isDark = themeManager.isDark()

//   useEffect(() => {
//     setSelectedTime(deliveryTime)
//   }, [deliveryTime, isOpen])

//   const handleSubmit = () => {
//     if (!selectedTime) {
//       notify.warning('Please select a delivery time')
//       return
//     }
//     onSubmit(selectedTime)
//     onClose()
//   }

//   const addMinutes = (minutes) => {
//     const now = new Date()
//     now.setMinutes(now.getMinutes() + minutes)
//     const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
//     setSelectedTime(timeStr)
//   }

//   if (!isOpen) return null

//   return (
//     <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
//       <motion.div
//         initial={{ scale: 0.95, opacity: 0 }}
//         animate={{ scale: 1, opacity: 1 }}
//         exit={{ scale: 0.95, opacity: 0 }}
//         transition={{ duration: 0.2 }}
//         className={`${classes.card} rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden`}
//       >
//         <div className={`${classes.card} p-6`}>
//           <div className="flex justify-end mb-4">
//             <button onClick={onClose} className={`${classes.textSecondary} hover:${classes.textPrimary}`}>
//               <X className="w-6 h-6" />
//             </button>
//           </div>
//           <div className="flex flex-col items-center space-y-6">
//             <div className={`w-16 h-16 rounded-full ${isDark ? 'bg-orange-900/50' : 'bg-orange-100'} flex items-center justify-center`}>
//               <Truck className={`w-8 h-8 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
//             </div>
//             <h2 className={`text-xl font-bold ${classes.textPrimary}`}>Delivery Time</h2>
//             <p className={`${classes.textSecondary} text-sm text-center`}>Please select the expected delivery time</p>
            
//             <input
//               type="time"
//               value={selectedTime}
//               onChange={(e) => setSelectedTime(e.target.value)}
//               className={`w-full p-3 text-lg font-semibold text-center ${classes.card} ${classes.border} border rounded-lg ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-orange-500`}
//             />
            
//             <div className="grid grid-cols-4 gap-2 w-full">
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => addMinutes(30)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary}`}
//               >
//                 +30 min
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => addMinutes(45)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary}`}
//               >
//                 +45 min
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => addMinutes(60)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary}`}
//               >
//                 +1 hr
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.05 }}
//                 whileTap={{ scale: 0.95 }}
//                 onClick={() => addMinutes(90)}
//                 className={`${classes.button} py-2 rounded-lg text-sm font-medium ${classes.textPrimary}`}
//               >
//                 +1.5 hr
//               </motion.button>
//             </div>
            
//             <div className="flex space-x-4 w-full">
//               <motion.button
//                 whileHover={{ scale: 1.02 }}
//                 whileTap={{ scale: 0.98 }}
//                 onClick={onClose}
//                 className={`flex-1 py-3 rounded-lg font-semibold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'} hover:opacity-90`}
//               >
//                 Cancel
//               </motion.button>
//               <motion.button
//                 whileHover={{ scale: 1.02 }}
//                 whileTap={{ scale: 0.98 }}
//                 onClick={handleSubmit}
//                 className={`flex-1 py-3 rounded-lg font-semibold bg-orange-600 text-white hover:bg-orange-700 flex items-center justify-center`}
//               >
//                 <Check className="w-5 h-5 mr-2" />
//                 Set Time
//               </motion.button>
//             </div>
//           </div>
//         </div>
//       </motion.div>
//     </div>
//   )
// }