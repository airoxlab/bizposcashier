// 'use client'

// import { motion } from 'framer-motion'
// import { User, Check, X } from 'lucide-react'
// import themeManager from '../../lib/themeManager'
// import Modal from '../../components/ui/Modal'

// export default function DeliveryCustomerInfoModal({ 
//   isOpen, 
//   onClose, 
//   phoneNumber,
//   customerInfo, 
//   onCustomerInfoChange, 
//   onSubmit 
// }) {
//   // Theme management
//   const themeClasses = themeManager.getClasses()
//   const componentStyles = themeManager.getComponentStyles()
//   const isDark = themeManager.isDark()

//   const handleSubmit = (e) => {
//     console.log("🎯 [MODAL] handleSubmit called");
//     e.preventDefault();
//     e.stopPropagation();
    
//     console.log("🎯 [MODAL] Current customerInfo state:", {
//       firstName: customerInfo.firstName,
//       lastName: customerInfo.lastName, 
//       email: customerInfo.email,
//       addressLine: customerInfo.addressLine
//     });
    
//     // Validate required fields for delivery (firstName, lastName, and addressLine)
//     if (!customerInfo.firstName?.trim() || !customerInfo.lastName?.trim() || !customerInfo.addressLine?.trim()) {
//       console.log("❌ [MODAL] Validation failed. Missing fields:", {
//         firstName: !customerInfo.firstName?.trim(),
//         lastName: !customerInfo.lastName?.trim(), 
//         addressLine: !customerInfo.addressLine?.trim()
//       });
//       alert('Please fill in First Name, Last Name, and Address Line');
//       return;
//     }
    
//     console.log("✅ [MODAL] All validations passed. About to call onSubmit()");
//     console.log("🎯 [MODAL] Final data being submitted:", {
//       firstName: customerInfo.firstName,
//       lastName: customerInfo.lastName,
//       email: customerInfo.email, 
//       addressLine: customerInfo.addressLine,
//       phoneNumber: phoneNumber
//     });
    
//     // Call the submit function
//     onSubmit();
//   }

//   const handleSaveClick = () => {
//     console.log("handleSaveClick called");
//     // Validate required fields for delivery
//     if (!customerInfo.firstName?.trim() || !customerInfo.lastName?.trim() || !customerInfo.addressLine?.trim()) {
//       alert('Please fill in First Name, Last Name, and Address Line');
//       return;
//     }
    
//     // Log the data being submitted to debug
//     console.log("Submitting customer info with address:", {
//       firstName: customerInfo.firstName,
//       lastName: customerInfo.lastName,
//       email: customerInfo.email,
//       addressLine: customerInfo.addressLine,
//       phoneNumber: phoneNumber
//     });
    
//     // Call the submit function directly
//     onSubmit();
//   }

//   return (
//     <Modal
//       isOpen={isOpen}
//       onClose={onClose}
//       title="Delivery Customer Information"
//       maxWidth="max-w-md"
//     >
//       <div className="space-y-6">
//         <div className="text-center">
//           <div className={`w-16 h-16 ${isDark ? 'bg-orange-900/50' : 'bg-orange-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
//             <User className="w-8 h-8 text-orange-600" />
//           </div>
//           <p className={`${themeClasses.textPrimary} text-sm`}>
//             Please fill customer details for delivery
//           </p>
//           {phoneNumber && (
//             <p className={`${themeClasses.textSecondary} text-xs mt-1`}>
//               Phone: {phoneNumber}
//             </p>
//           )}
//         </div>
        
//         <form onSubmit={handleSubmit} className="space-y-4">
//           <div>
//             <label className={`${themeClasses.textPrimary} block text-sm font-semibold mb-2`}>
//               First Name *
//             </label>
//             <input
//               type="text"
//               value={customerInfo.firstName || ''}
//               onChange={(e) => {
//                 console.log("First name changed:", e.target.value);
//                 onCustomerInfoChange({
//                   ...customerInfo, 
//                   firstName: e.target.value
//                 });
//               }}
//               className={`w-full px-4 py-3 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200`}
//               placeholder="Enter first name"
//               required
//             />
//           </div>

//           <div>
//             <label className={`${themeClasses.textPrimary} block text-sm font-semibold mb-2`}>
//               Last Name *
//             </label>
//             <input
//               type="text"
//               value={customerInfo.lastName || ''}
//               onChange={(e) => {
//                 console.log("Last name changed:", e.target.value);
//                 onCustomerInfoChange({
//                   ...customerInfo, 
//                   lastName: e.target.value
//                 });
//               }}
//               className={`w-full px-4 py-3 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200`}
//               placeholder="Enter last name"
//               required
//             />
//           </div>
          
//           <div>
//             <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
//               Delivery Address *
//             </label>
//             <input
//               type="text"
//               value={customerInfo.addressLine || ''}
//               onChange={(e) => {
//                 console.log("Address changed:", e.target.value);
//                 onCustomerInfoChange({
//                   ...customerInfo, 
//                   addressLine: e.target.value
//                 });
//               }}
//               className={`w-full px-4 py-3 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200`}
//               placeholder="Enter delivery address"
//               required
//             />
//           </div>

//           <div>
//             <label className={`block text-sm font-semibold ${themeClasses.textPrimary} mb-2`}>
//               Email Address
//             </label>
//             <input
//               type="email"
//               value={customerInfo.email || ''}
//               onChange={(e) => {
//                 console.log("Email changed:", e.target.value);
//                 onCustomerInfoChange({
//                   ...customerInfo, 
//                   email: e.target.value
//                 });
//               }}
//               className={`w-full px-4 py-3 ${themeClasses.input} rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent transition-all duration-200`}
//               placeholder="Enter email (optional)"
//             />
//           </div>

//           <div className="flex space-x-3 pt-4">
//             <motion.button
//               type="button"
//               whileHover={{ scale: 1.02 }}
//               whileTap={{ scale: 0.98 }}
//               onClick={onClose}
//               className={`flex-1 px-4 py-3 ${themeClasses.button} font-semibold rounded-lg transition-all duration-200`}
//             >
//               <div className="flex items-center justify-center">
//                 <X className="w-4 h-4 mr-2" />
//                 Cancel
//               </div>
//             </motion.button>
            
//             <motion.button
//               type="submit"
//               whileHover={{ scale: 1.02 }}
//               whileTap={{ scale: 0.98 }}
//               disabled={!customerInfo.firstName?.trim() || !customerInfo.lastName?.trim() || !customerInfo.addressLine?.trim()}
//               className={`flex-1 px-4 py-3 font-semibold rounded-lg transition-all duration-200 ${
//                 !customerInfo.firstName?.trim() || !customerInfo.lastName?.trim() || !customerInfo.addressLine?.trim()
//                   ? `${isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-400 text-gray-500'} cursor-not-allowed`
//                   : 'bg-orange-600 hover:bg-orange-700 text-white'
//               }`}
//             >
//               <div className="flex items-center justify-center">
//                 <Check className="w-4 h-4 mr-2" />
//                 Save Info
//               </div>
//             </motion.button>
//           </div>
//         </form>
//       </div>
//     </Modal>
//   )
// }