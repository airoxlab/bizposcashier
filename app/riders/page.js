"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  RefreshCw,
  Truck,
  Phone,
  MapPin,
  Clock,
  DollarSign,
  Package,
  User,
  Check,
  X,
  Printer,
  ChevronRight,
  AlertCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { themeManager } from "../../lib/themeManager";
import { authManager } from "../../lib/authManager";
import { printerManager } from "../../lib/printerManager";
import { cacheManager } from "../../lib/cacheManager";
import dailySerialManager from "../../lib/utils/dailySerialManager";
import ProtectedPage from "../../components/ProtectedPage";
import Modal from "../../components/ui/Modal";
import NotificationSystem, { notify } from "../../components/ui/NotificationSystem";

export default function RidersOrdersPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(null);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedRider, setSelectedRider] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [theme, setTheme] = useState("light");

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push("/");
      return;
    }

    const userData = authManager.getCurrentUser();
    setUser(userData);

    if (userData?.id) {
      printerManager.setUserId(userData.id);
    }

    setTheme(themeManager.currentTheme);
    themeManager.applyTheme();

    fetchDeliveryOrders();
    fetchDeliveryBoys();

    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchDeliveryOrders(true);
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const fetchDeliveryOrders = async (silent = false) => {
    try {
      if (!silent) setLoading(true);

      const userData = authManager.getCurrentUser();
      if (!userData) return;

      // Fetch delivery orders that are pending (not completed)
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            full_name,
            phone,
            addressline
          ),
          delivery_boys (
            id,
            name,
            phone,
            vehicle_type
          ),
          order_items (
            id,
            product_id,
            variant_id,
            product_name,
            variant_name,
            base_price,
            variant_price,
            final_price,
            quantity,
            total_price,
            is_deal,
            deal_id,
            deal_products
          ),
          cashiers!orders_cashier_id_fkey (
            id,
            name
          ),
          users (
            id,
            customer_name
          )
        `)
        .eq("user_id", userData.id)
        .eq("order_type", "delivery")
        .in("order_status", ["Pending", "Preparing", "Ready", "Dispatched"])
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Enrich with daily serial numbers
      const ordersWithSerials = cacheManager.enrichOrdersWithSerials(data || []);
      setOrders(ordersWithSerials);

      // If an order is selected, update its data
      if (selectedOrder) {
        const updatedOrder = ordersWithSerials.find(o => o.id === selectedOrder.id);
        if (updatedOrder) {
          setSelectedOrder(updatedOrder);
        } else {
          // Order no longer in riders list (completed) — clear selection
          setSelectedOrder(null);
        }
      }

      console.log(`📦 Loaded ${ordersWithSerials.length} delivery orders`);
    } catch (error) {
      console.error("Error fetching delivery orders:", error);
      notify.error("Failed to load delivery orders");
    } finally {
      setLoading(false);
    }
  };

  const fetchDeliveryBoys = async () => {
    try {
      const userData = authManager.getCurrentUser();
      if (!userData) return;

      const { data, error } = await supabase
        .from("delivery_boys")
        .select("*")
        .eq("user_id", userData.id)
        .eq("status", "active")
        .order("name");

      if (error) throw error;
      setDeliveryBoys(data || []);
    } catch (error) {
      console.error("Error fetching delivery boys:", error);
      notify.error("Failed to load delivery riders");
    }
  };

  const fetchOrderItems = async (orderId) => {
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");

      if (error) throw error;
      setOrderItems(data || []);
    } catch (error) {
      console.error("Error fetching order items:", error);
      setOrderItems([]);
    }
  };

  const fetchLoyaltyRedemption = async (orderNumber) => {
    try {
      const { data, error } = await supabase
        .from("loyalty_redemptions")
        .select("points_used, discount_applied")
        .eq("order_id", orderNumber)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error("Error fetching loyalty redemption:", error);
        }
        setLoyaltyRedemption(null);
        return;
      }

      setLoyaltyRedemption(data);
    } catch (error) {
      console.error("Error fetching loyalty redemption:", error);
      setLoyaltyRedemption(null);
    }
  };

  const handleOrderSelect = async (order) => {
    setSelectedOrder(order);
    setOrderItems(order.order_items || []);
    await fetchLoyaltyRedemption(order.order_number);
  };

  const handleAssignRider = () => {
    if (!selectedOrder) return;
    setSelectedRider(selectedOrder.delivery_boy_id || null);
    setShowAssignModal(true);
  };

  const handleSaveAssignment = async () => {
    try {
      if (!selectedRider) {
        notify.warning("Please select a rider");
        return;
      }

      // Verify order is still in an assignable state (guard against race condition)
      const { data: currentOrder, error: statusError } = await supabase
        .from("orders")
        .select("order_status")
        .eq("id", selectedOrder.id)
        .single();

      if (statusError) throw statusError;

      if (!["Pending", "Preparing", "Ready", "Dispatched"].includes(currentOrder?.order_status)) {
        notify.error("This order is no longer active and cannot be assigned a rider");
        setShowAssignModal(false);
        setSelectedOrder(null);
        await fetchDeliveryOrders();
        return;
      }

      const { error } = await supabase
        .from("orders")
        .update({
          delivery_boy_id: selectedRider,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedOrder.id);

      if (error) throw error;

      // Log the action
      await authManager.logOrderAction(
        selectedOrder.id,
        "rider_assigned",
        { rider_id: selectedRider },
        `Rider assigned to delivery order`
      );

      notify.success("Rider assigned successfully");
      setShowAssignModal(false);
      await fetchDeliveryOrders();

      // Update selected order
      const rider = deliveryBoys.find(r => r.id === selectedRider);
      setSelectedOrder({
        ...selectedOrder,
        delivery_boy_id: selectedRider,
        delivery_boys: rider,
      });
    } catch (error) {
      console.error("Error assigning rider:", error);
      notify.error("Failed to assign rider");
    }
  };

  const handlePrintReceipt = async () => {
    if (!selectedOrder) return;

    try {
      setIsPrinting(true);

      const printer = await printerManager.getPrinterForPrinting();
      if (!printer) {
        notify.error("No printer configured");
        setIsPrinting(false);
        return;
      }

      const orderData = {
        orderNumber: selectedOrder.order_number,
        dailySerial: selectedOrder.daily_serial || null,
        orderType: selectedOrder.order_type,
        customer: selectedOrder.customers,
        deliveryAddress: selectedOrder.delivery_address || selectedOrder.customers?.addressline,
        orderInstructions: selectedOrder.order_instructions,
        specialNotes: selectedOrder.order_instructions,
        total: selectedOrder.total_amount,
        subtotal: selectedOrder.subtotal,
        deliveryCharges: selectedOrder.delivery_charges || 0,
        discountAmount: selectedOrder.discount_amount || 0,
        loyaltyDiscountAmount: loyaltyRedemption?.discount_applied || 0,
        loyaltyPointsRedeemed: loyaltyRedemption?.points_used || 0,
        discountType: "amount",
        cart: orderItems.map((item) => {
          if (item.is_deal) {
            let dealProducts = [];
            try {
              if (item.deal_products) {
                dealProducts = typeof item.deal_products === 'string'
                  ? JSON.parse(item.deal_products)
                  : item.deal_products;
              }
            } catch (e) {
              console.error('Failed to parse deal_products:', e);
            }

            return {
              isDeal: true,
              dealId: item.deal_id,
              dealName: item.product_name,
              dealProducts: dealProducts,
              quantity: item.quantity,
              totalPrice: item.total_price,
              finalPrice: item.final_price,
            };
          }

          return {
            isDeal: false,
            productName: item.product_name,
            variantName: item.variant_name,
            quantity: item.quantity,
            totalPrice: item.total_price,
            finalPrice: item.final_price,
          };
        }),
        paymentMethod: selectedOrder.payment_method || "Cash",
      };

      // Get user profile
      const userProfileRaw = JSON.parse(
        localStorage.getItem("user_profile") || "{}"
      );

      const localLogo = localStorage.getItem("store_logo_local");
      const localQr = localStorage.getItem("qr_code_local");

      // Get cashier/admin name from order
      const cashierName = selectedOrder.cashier_id
        ? (selectedOrder.cashiers?.name || 'Cashier')
        : (selectedOrder.users?.customer_name || 'Admin')

      const userProfile = {
        ...userProfileRaw,
        store_logo: localLogo || userProfileRaw.store_logo,
        qr_code: localQr || userProfileRaw.qr_code,
        // Add cashier/admin name for receipt printing
        cashier_name: selectedOrder.cashier_id ? cashierName : null,
        customer_name: !selectedOrder.cashier_id ? cashierName : null,
      };

      const result = await printerManager.printReceipt(
        orderData,
        userProfile,
        printer
      );

      if (result.success) {
        notify.success("Receipt printed successfully");
      } else {
        throw new Error(result.message || "Print failed");
      }
    } catch (error) {
      console.error("Print error:", error);
      notify.error(`Print failed: ${error.message}`);
    } finally {
      setIsPrinting(false);
    }
  };

  const formatOrderNumber = (orderNumber) => {
    if (!orderNumber) return "";
    return `#${orderNumber.slice(-9)}`;
  };

  const formatOrderDisplay = (order) => {
    if (!order || !order.order_number) return "";

    const formattedOrderNumber = formatOrderNumber(order.order_number);

    if (order.daily_serial) {
      const formattedSerial = dailySerialManager.formatSerial(order.daily_serial);
      return `${formattedSerial} ${formattedOrderNumber}`;
    }

    return formattedOrderNumber;
  };

  const formatTime = (timeString) => {
    if (!timeString) return "";
    const date = new Date(timeString);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
  };

  const getStatusColor = (status) => {
    const isDark = theme === "dark";
    switch (status) {
      case "Pending":
        return isDark
          ? "bg-yellow-900/30 text-yellow-400 border-yellow-700"
          : "bg-yellow-100 text-yellow-700 border-yellow-300";
      case "Preparing":
        return isDark
          ? "bg-blue-900/30 text-blue-400 border-blue-700"
          : "bg-blue-100 text-blue-700 border-blue-300";
      case "Ready":
        return isDark
          ? "bg-purple-900/30 text-purple-400 border-purple-700"
          : "bg-purple-100 text-purple-700 border-purple-300";
      case "Dispatched":
        return isDark
          ? "bg-green-900/30 text-green-400 border-green-700"
          : "bg-green-100 text-green-700 border-green-300";
      case "Completed":
        return isDark
          ? "bg-gray-700 text-gray-400 border-gray-600"
          : "bg-gray-100 text-gray-600 border-gray-300";
      default:
        return isDark
          ? "bg-gray-700 text-gray-300"
          : "bg-gray-100 text-gray-600";
    }
  };

  const filteredOrders = orders.filter((order) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(searchLower) ||
      order.customers?.full_name?.toLowerCase().includes(searchLower) ||
      order.customers?.phone?.toLowerCase().includes(searchLower) ||
      order.delivery_address?.toLowerCase().includes(searchLower)
    );
  });

  const classes = themeManager.getClasses();
  const isDark = themeManager.isDark();

  return (
    <ProtectedPage permissionKey="RIDERS" pageName="Riders Management">
      <div className={`min-h-screen ${classes.background} transition-all duration-500`}>
        {/* Header */}
        <div className={`${classes.card} ${classes.border} border-b sticky top-0 z-10`}>
          <div className="max-w-[1920px] mx-auto px-4 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/dashboard")}
                  className={`p-2 rounded-lg ${classes.button} transition-colors`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
                <div>
                  <h1 className={`text-2xl font-bold ${classes.textPrimary}`}>
                    Riders Orders
                  </h1>
                  <p className={`text-sm ${classes.textSecondary}`}>
                    Manage delivery assignments
                  </p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => fetchDeliveryOrders()}
                  disabled={loading}
                  className={`p-2 rounded-lg ${classes.button} transition-colors`}
                >
                  <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                </motion.button>
              </div>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-80px)]">
          {/* Sidebar - Orders List */}
          <div className={`w-80 ${classes.card} ${classes.border} border-r flex flex-col`}>
            {/* Search */}
            <div className="p-4 border-b ${classes.border}">
              <div className="relative">
                <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${classes.textSecondary}`} />
                <input
                  type="text"
                  placeholder="Search orders..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className={`w-full pl-10 pr-4 py-2 ${classes.input} rounded-lg focus:ring-2 focus:ring-purple-500`}
                />
              </div>
            </div>

            {/* Orders List */}
            <div className="flex-1 overflow-y-auto">
              {!loading && filteredOrders.length === 0 ? (
                <div className="p-8 text-center">
                  <Package className={`w-12 h-12 ${classes.textSecondary} mx-auto mb-3`} />
                  <p className={`${classes.textSecondary}`}>No delivery orders found</p>
                </div>
              ) : (
                <div className="p-2 space-y-2">
                  {filteredOrders.map((order) => (
                    <motion.button
                      key={order.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleOrderSelect(order)}
                      className={`w-full text-left p-3 rounded-lg transition-all ${
                        selectedOrder?.id === order.id
                          ? isDark
                            ? "bg-purple-900/30 border-purple-700"
                            : "bg-purple-50 border-purple-300"
                          : isDark
                            ? "bg-gray-800 hover:bg-gray-750"
                            : "bg-white hover:bg-gray-50"
                      } border ${classes.border}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <div className={`font-semibold ${classes.textPrimary}`}>
                            {formatOrderDisplay(order)}
                          </div>
                          <div className={`text-xs ${classes.textSecondary}`}>
                            {formatTime(order.created_at)}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className={`font-bold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                            Rs {order.total_amount}
                          </div>
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${getStatusColor(order.order_status)}`}>
                            {order.order_status}
                          </span>
                        </div>
                      </div>

                      <div className={`text-xs ${classes.textSecondary} mb-1`}>
                        <User className="w-3 h-3 inline mr-1" />
                        {order.customers?.full_name || "Guest"}
                      </div>

                      {order.delivery_boys && (
                        <div className={`text-xs ${isDark ? 'text-blue-400' : 'text-blue-600'} flex items-center`}>
                          <Truck className="w-3 h-3 mr-1" />
                          {order.delivery_boys.name}
                        </div>
                      )}

                      {!order.delivery_boys && (
                        <div className={`text-xs ${isDark ? 'text-orange-400' : 'text-orange-600'} flex items-center`}>
                          <AlertCircle className="w-3 h-3 mr-1" />
                          No rider assigned
                        </div>
                      )}
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Main Content - Order Details */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!selectedOrder ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <Truck className={`w-16 h-16 ${classes.textSecondary} mx-auto mb-4`} />
                  <p className={`${classes.textSecondary}`}>Select an order to view details</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col h-full">
                {/* Fixed Header with Print Button */}
                <div className="flex-shrink-0 p-6 pb-4 border-b ${classes.border}">
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 className={`text-2xl font-bold ${classes.textPrimary} mb-1`}>
                        {formatOrderDisplay(selectedOrder)}
                      </h2>
                      <p className={`${classes.textSecondary}`}>
                        {formatTime(selectedOrder.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <span className={`px-3 py-1 rounded-full border text-sm font-medium ${getStatusColor(selectedOrder.order_status)}`}>
                        {selectedOrder.order_status}
                      </span>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handlePrintReceipt}
                        disabled={isPrinting}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-lg font-semibold flex items-center"
                      >
                        <Printer className="w-4 h-4 mr-2" />
                        {isPrinting ? "Printing..." : "Print Receipt"}
                      </motion.button>
                    </div>
                  </div>
                </div>

                {/* Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-6 pt-4">
                  <div className="max-w-4xl mx-auto space-y-4">
                {/* Customer & Rider Info Grid */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Customer Info */}
                  <div className={`${classes.card} rounded-xl p-4 ${classes.border} border`}>
                    <h3 className={`font-semibold ${classes.textPrimary} mb-3`}>Customer Details</h3>
                    <div className="space-y-2">
                      <div className="flex items-center">
                        <User className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                        <span className={classes.textPrimary}>{selectedOrder.customers?.full_name || "Guest"}</span>
                      </div>
                      {selectedOrder.customers?.phone && (
                        <div className="flex items-center">
                          <Phone className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                          <span className={classes.textPrimary}>{selectedOrder.customers.phone}</span>
                        </div>
                      )}
                      <div className="flex items-start">
                        <MapPin className={`w-4 h-4 ${classes.textSecondary} mr-2 mt-0.5 flex-shrink-0`} />
                        <span className={`${classes.textPrimary} text-sm`}>
                          {selectedOrder.delivery_address || selectedOrder.customers?.addressline || "No address"}
                        </span>
                      </div>
                      {selectedOrder.delivery_time && (
                        <div className="flex items-center">
                          <Clock className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                          <span className={classes.textPrimary}>
                            {formatTime(selectedOrder.delivery_time)}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Rider Info */}
                  <div className={`${classes.card} rounded-xl p-4 ${classes.border} border`}>
                    <div className="flex items-center justify-between mb-3">
                      <h3 className={`font-semibold ${classes.textPrimary}`}>Assigned Rider</h3>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleAssignRider}
                        className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-medium"
                      >
                        {selectedOrder.delivery_boys ? "Change" : "Assign"}
                      </motion.button>
                    </div>
                    {selectedOrder.delivery_boys ? (
                      <div className="space-y-2">
                        <div className="flex items-center">
                          <Truck className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                          <span className={classes.textPrimary}>{selectedOrder.delivery_boys.name}</span>
                        </div>
                        {selectedOrder.delivery_boys.phone && (
                          <div className="flex items-center">
                            <Phone className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                            <span className={classes.textPrimary}>{selectedOrder.delivery_boys.phone}</span>
                          </div>
                        )}
                        {selectedOrder.delivery_boys.vehicle_type && (
                          <div className="flex items-center text-sm">
                            <Package className={`w-4 h-4 ${classes.textSecondary} mr-2`} />
                            <span className={classes.textPrimary}>{selectedOrder.delivery_boys.vehicle_type}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className={`${classes.textSecondary} text-sm`}>No rider assigned yet</p>
                    )}
                  </div>
                </div>

                {/* Order Items & Payment Summary - Side by Side */}
                <div className="grid grid-cols-2 gap-4">
                  {/* Order Items */}
                  <div className={`${classes.card} rounded-xl p-4 ${classes.border} border`}>
                    <h3 className={`font-semibold ${classes.textPrimary} mb-3`}>Order Items</h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {orderItems.map((item, index) => (
                        <div key={index} className={`flex justify-between p-2 ${isDark ? 'bg-gray-800' : 'bg-gray-50'} rounded`}>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${classes.textPrimary} text-sm truncate`}>
                              {item.product_name}
                            </div>
                            {item.variant_name && (
                              <div className={`text-xs ${classes.textSecondary}`}>
                                {item.variant_name}
                              </div>
                            )}
                            <div className={`text-xs ${classes.textSecondary}`}>
                              Qty: {item.quantity}
                            </div>
                          </div>
                          <div className={`font-semibold ${classes.textPrimary} text-sm ml-2`}>
                            Rs {item.total_price.toFixed(0)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Payment Summary */}
                  <div className={`${classes.card} rounded-xl p-4 ${classes.border} border`}>
                    <h3 className={`font-semibold ${classes.textPrimary} mb-3`}>Payment Summary</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className={classes.textSecondary}>Subtotal:</span>
                        <span className={classes.textPrimary}>Rs {parseFloat(selectedOrder.subtotal || 0).toFixed(0)}</span>
                      </div>
                      {selectedOrder.discount_amount > 0 && (
                        <div className={`flex justify-between text-sm ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          <span>Discount:</span>
                          <span>-Rs {parseFloat(selectedOrder.discount_amount || 0).toFixed(0)}</span>
                        </div>
                      )}
                      {loyaltyRedemption && loyaltyRedemption.discount_applied > 0 && (
                        <div className={`flex justify-between text-sm ${isDark ? 'text-purple-400' : 'text-purple-600'}`}>
                          <span>Loyalty ({loyaltyRedemption.points_used} pts):</span>
                          <span>-Rs {parseFloat(loyaltyRedemption.discount_applied || 0).toFixed(0)}</span>
                        </div>
                      )}
                      {selectedOrder.delivery_charges > 0 && (
                        <div className={`flex justify-between text-sm ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                          <span>Delivery:</span>
                          <span>+Rs {parseFloat(selectedOrder.delivery_charges || 0).toFixed(0)}</span>
                        </div>
                      )}
                      <div className={`flex justify-between font-bold text-lg ${classes.textPrimary} border-t ${classes.border} pt-2 mt-2`}>
                        <span>Total:</span>
                        <span>Rs {parseFloat(selectedOrder.total_amount || 0).toFixed(0)}</span>
                      </div>
                      <div className="flex justify-between text-sm pt-1">
                        <span className={classes.textSecondary}>Payment:</span>
                        <span className={`${classes.textPrimary} font-medium`}>{selectedOrder.payment_method}</span>
                      </div>
                    </div>
                  </div>
                </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Assign Rider Modal */}
        <Modal
          isOpen={showAssignModal}
          onClose={() => setShowAssignModal(false)}
          title="Assign Delivery Rider"
          maxWidth="max-w-2xl"
        >
          <div className="space-y-5">
            {deliveryBoys.length === 0 ? (
              <div className="text-center py-12">
                <div className={`w-20 h-20 ${isDark ? 'bg-orange-900/30' : 'bg-orange-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                  <AlertCircle className={`w-10 h-10 ${isDark ? 'text-orange-400' : 'text-orange-600'}`} />
                </div>
                <h3 className={`text-lg font-bold ${classes.textPrimary} mb-2`}>No Active Riders Found</h3>
                <p className={`${classes.textSecondary} mb-6`}>Add delivery riders to start assigning orders</p>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/delivery-boys")}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl font-bold shadow-lg hover:shadow-xl transition-all"
                >
                  Add Riders
                </motion.button>
              </div>
            ) : (
              <>
                <div className={`text-sm ${classes.textSecondary} flex items-center gap-2 pb-2`}>
                  <Truck className="w-4 h-4" />
                  <span>Select a rider to assign to this delivery order</span>
                </div>

                <div className="space-y-3 max-h-[450px] overflow-y-auto pr-2">
                  {deliveryBoys.map((rider) => (
                    <motion.button
                      key={rider.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => setSelectedRider(rider.id)}
                      className={`w-full text-left p-5 rounded-2xl border-2 transition-all ${
                        selectedRider === rider.id
                          ? isDark
                            ? "bg-purple-900/40 border-purple-600 shadow-lg ring-2 ring-purple-500/50"
                            : "bg-purple-50 border-purple-400 shadow-md ring-2 ring-purple-300/50"
                          : isDark
                            ? "bg-gray-800 border-gray-700 hover:bg-gray-750 hover:border-gray-600"
                            : "bg-white border-gray-200 hover:border-gray-300 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1 min-w-0">
                          <div className={`w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0 ${
                            selectedRider === rider.id
                              ? isDark
                                ? 'bg-purple-700'
                                : 'bg-purple-500'
                              : isDark
                                ? 'bg-gray-700'
                                : 'bg-gray-200'
                          }`}>
                            <Truck className={`w-7 h-7 ${
                              selectedRider === rider.id
                                ? 'text-white'
                                : isDark
                                  ? 'text-gray-400'
                                  : 'text-gray-600'
                            }`} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className={`font-bold text-lg ${classes.textPrimary} mb-1`}>
                              {rider.name}
                            </div>

                            <div className="space-y-1">
                              {rider.phone && (
                                <div className={`text-sm ${classes.textSecondary} flex items-center gap-2`}>
                                  <Phone className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span>{rider.phone}</span>
                                </div>
                              )}
                              {rider.vehicle_type && (
                                <div className={`text-sm flex items-center gap-2 ${
                                  selectedRider === rider.id
                                    ? isDark
                                      ? 'text-purple-300'
                                      : 'text-purple-700'
                                    : isDark
                                      ? 'text-blue-400'
                                      : 'text-blue-600'
                                }`}>
                                  <Package className="w-3.5 h-3.5 flex-shrink-0" />
                                  <span className="font-medium">{rider.vehicle_type}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>

                        {selectedRider === rider.id && (
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ml-3 ${
                            isDark ? 'bg-purple-600' : 'bg-purple-500'
                          }`}>
                            <Check className="w-5 h-5 text-white" strokeWidth={3} />
                          </div>
                        )}
                      </div>
                    </motion.button>
                  ))}
                </div>

                <div className={`flex gap-3 pt-4 border-t-2 ${classes.border}`}>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setShowAssignModal(false)}
                    className={`flex-1 py-3.5 px-6 border-2 ${classes.border} ${classes.textPrimary} font-bold rounded-xl ${classes.hover} transition-all`}
                  >
                    Cancel
                  </motion.button>
                  <motion.button
                    whileHover={{ scale: selectedRider ? 1.02 : 1 }}
                    whileTap={{ scale: selectedRider ? 0.98 : 1 }}
                    onClick={handleSaveAssignment}
                    disabled={!selectedRider}
                    className={`flex-1 py-3.5 px-6 ${
                      selectedRider
                        ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 shadow-lg hover:shadow-xl'
                        : 'bg-gray-400 cursor-not-allowed'
                    } text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2`}
                  >
                    <Check className="w-5 h-5" />
                    Assign Rider
                  </motion.button>
                </div>
              </>
            )}
          </div>
        </Modal>

        <NotificationSystem />
      </div>
    </ProtectedPage>
  );
}
