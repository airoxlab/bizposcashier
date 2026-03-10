"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Globe,
  Clock,
  User,
  Phone,
  MapPin,
  Truck,
  Coffee,
  DollarSign,
  CheckCircle,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Package,
  Printer,
  FileText,
  X,
  Filter,
  Check,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { themeManager } from "../../lib/themeManager";
import { authManager } from "../../lib/authManager";
import { printerManager } from "../../lib/printerManager";
import { cacheManager } from "../../lib/cacheManager";
import { usePermissions } from "../../lib/permissionManager";
import { webOrderNotificationManager } from "../../lib/webOrderNotification";
import Modal from "../../components/ui/Modal";
import ProtectedPage from "../../components/ProtectedPage";
import { notify } from "../../components/ui/NotificationSystem";

const OrderSkeleton = ({ isDark }) => {
  return (
    <div
      className={`p-4 rounded-lg ${
        isDark ? "bg-gray-800" : "bg-white"
      } border ${isDark ? "border-gray-700" : "border-gray-200"} animate-pulse`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <div
            className={`h-5 ${
              isDark ? "bg-gray-700" : "bg-gray-200"
            } rounded w-32 mb-2`}
          ></div>
          <div
            className={`h-4 ${
              isDark ? "bg-gray-700" : "bg-gray-200"
            } rounded w-24`}
          ></div>
        </div>
        <div
          className={`h-6 ${
            isDark ? "bg-gray-700" : "bg-gray-200"
          } rounded-full w-20`}
        ></div>
      </div>
      <div className="space-y-2">
        <div
          className={`h-3 ${
            isDark ? "bg-gray-700" : "bg-gray-200"
          } rounded w-full`}
        ></div>
        <div
          className={`h-3 ${
            isDark ? "bg-gray-700" : "bg-gray-200"
          } rounded w-3/4`}
        ></div>
      </div>
    </div>
  );
};

// Rejection Modal
const RejectionModal = ({ isOpen, onClose, onConfirm, isDark }) => {
  const [reason, setReason] = useState("");
  const [customReason, setCustomReason] = useState("");

  const rejectionReasons = [
    "Items not available",
    "Outside delivery area",
    "Restaurant too busy",
    "Invalid order details",
    "Payment issue",
    "Other",
  ];

  const handleConfirm = () => {
    const finalReason = reason === "Other" ? customReason : reason;
    if (!finalReason) {
      notify.error("Please select or enter a reason");
      return;
    }
    onConfirm(finalReason);
    setReason("");
    setCustomReason("");
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Reject Order" maxWidth="max-w-md">
      <div className="space-y-4">
        <p className={`text-sm ${isDark ? "text-gray-300" : "text-gray-600"}`}>
          Please select a reason for rejecting this order:
        </p>

        <div className="space-y-2">
          {rejectionReasons.map((r) => (
            <label
              key={r}
              className={`flex items-center p-3 rounded-lg border ${
                reason === r
                  ? isDark
                    ? "border-red-500 bg-red-500/10"
                    : "border-red-500 bg-red-50"
                  : isDark
                  ? "border-gray-700 hover:border-gray-600"
                  : "border-gray-200 hover:border-gray-300"
              } cursor-pointer transition-all`}
            >
              <input
                type="radio"
                name="reason"
                value={r}
                checked={reason === r}
                onChange={(e) => setReason(e.target.value)}
                className="mr-3"
              />
              <span className={isDark ? "text-white" : "text-gray-900"}>{r}</span>
            </label>
          ))}
        </div>

        {reason === "Other" && (
          <textarea
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            placeholder="Enter custom reason..."
            className={`w-full px-4 py-3 rounded-lg border ${
              isDark
                ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500"
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-400"
            } focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all`}
            rows={3}
          />
        )}

        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            className={`flex-1 py-3 rounded-lg font-semibold ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
            } transition-all`}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-3 rounded-lg font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all"
          >
            Reject Order
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Delivery Details Modal (for assigning rider and updating delivery charges)
const DeliveryDetailsModal = ({ isOpen, onClose, order, isDark, onSave }) => {
  const [deliveryBoyId, setDeliveryBoyId] = useState("");
  const [deliveryCharges, setDeliveryCharges] = useState(0);
  const [deliveryBoys, setDeliveryBoys] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && order) {
      setDeliveryCharges(order.delivery_charges || 0);
      setDeliveryBoyId(order.delivery_boy_id || "");
      loadDeliveryBoys();
    }
  }, [isOpen, order]);

  const loadDeliveryBoys = async () => {
    try {
      setLoading(true);
      const currentUser = authManager.getCurrentUser();
      if (!currentUser?.id) return;

      const { data, error } = await supabase
        .from("delivery_boys")
        .select("*")
        .eq("status", "active")
        .eq("user_id", currentUser.id)
        .order("name", { ascending: true });

      if (error) throw error;
      setDeliveryBoys(data || []);
    } catch (error) {
      console.error("Error loading delivery boys:", error);
      notify.error("Failed to load delivery boys");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!order) return;

    setSaving(true);
    try {
      const updates = {
        delivery_charges: parseFloat(deliveryCharges) || 0,
        delivery_boy_id: deliveryBoyId || null,
      };

      // Recalculate total amount
      const newTotal = order.subtotal - (order.discount_amount || 0) + updates.delivery_charges;
      updates.total_amount = newTotal;

      const { error } = await supabase
        .from("orders")
        .update(updates)
        .eq("id", order.id);

      if (error) throw error;

      notify.success("Delivery details updated successfully");
      onSave?.();
      onClose();
    } catch (error) {
      console.error("Error updating delivery details:", error);
      notify.error("Failed to update delivery details");
    } finally {
      setSaving(false);
    }
  };

  const quickCharges = [0, 50, 100, 150, 200];

  if (!order) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Delivery Details" maxWidth="max-w-md">
      <div className="space-y-4">
        {/* Delivery Boy Selection */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <Truck className="w-4 h-4 inline mr-2" />
            Assign Delivery Boy
          </label>
          <select
            value={deliveryBoyId}
            onChange={(e) => setDeliveryBoyId(e.target.value)}
            disabled={loading}
            className={`w-full px-4 py-3 rounded-lg border ${
              isDark
                ? "bg-gray-800 border-gray-700 text-white"
                : "bg-white border-gray-300 text-gray-900"
            } focus:ring-2 focus:ring-purple-500 transition-all`}
          >
            <option value="">Select a rider...</option>
            {deliveryBoys.map((boy) => (
              <option key={boy.id} value={boy.id}>
                {boy.name} {boy.vehicle_type ? `(${boy.vehicle_type})` : ""}
              </option>
            ))}
          </select>
        </div>

        {/* Delivery Charges */}
        <div>
          <label className={`block text-sm font-medium mb-2 ${isDark ? "text-gray-300" : "text-gray-700"}`}>
            <DollarSign className="w-4 h-4 inline mr-2" />
            Delivery Charges (Rs)
          </label>
          <input
            type="number"
            value={deliveryCharges}
            onChange={(e) => setDeliveryCharges(e.target.value)}
            min="0"
            step="10"
            className={`w-full px-4 py-3 rounded-lg border ${
              isDark
                ? "bg-gray-800 border-gray-700 text-white"
                : "bg-white border-gray-300 text-gray-900"
            } focus:ring-2 focus:ring-purple-500 transition-all`}
            placeholder="Enter delivery charges"
          />

          {/* Quick Charge Buttons */}
          <div className="flex flex-wrap gap-2 mt-2">
            {quickCharges.map((charge) => (
              <button
                key={charge}
                onClick={() => setDeliveryCharges(charge)}
                className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-all ${
                  deliveryCharges == charge
                    ? "bg-purple-500 text-white"
                    : isDark
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Rs {charge}
              </button>
            ))}
          </div>
        </div>

        {/* Total Calculation Preview */}
        <div className={`p-3 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>Subtotal:</span>
              <span className={isDark ? "text-white" : "text-gray-900"}>Rs {order.subtotal}</span>
            </div>
            {order.discount_amount > 0 && (
              <div className="flex justify-between text-green-500">
                <span>Discount:</span>
                <span>-Rs {order.discount_amount}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className={isDark ? "text-gray-400" : "text-gray-600"}>Delivery Charges:</span>
              <span className={isDark ? "text-white" : "text-gray-900"}>Rs {deliveryCharges || 0}</span>
            </div>
            <div className={`flex justify-between font-bold pt-2 border-t ${isDark ? "border-gray-700" : "border-gray-200"}`}>
              <span className={isDark ? "text-white" : "text-gray-900"}>New Total:</span>
              <span className={isDark ? "text-white" : "text-gray-900"}>
                Rs {(order.subtotal - (order.discount_amount || 0) + (parseFloat(deliveryCharges) || 0)).toFixed(0)}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 pt-2">
          <button
            onClick={onClose}
            disabled={saving}
            className={`flex-1 py-3 rounded-lg font-semibold ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
            } transition-all disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white transition-all disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Print Success Modal
const PrintSuccessModal = ({ isOpen, onClose, onPrintReceipt, onPrintToken, isDark }) => {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="" maxWidth="max-w-md">
      <div className="text-center py-4">
        <div
          className={`w-16 h-16 ${
            isDark
              ? "bg-green-500/10 border border-green-500/20"
              : "bg-green-50"
          } rounded-full flex items-center justify-center mx-auto mb-4`}
        >
          <CheckCircle
            className={`w-8 h-8 ${
              isDark ? "text-green-400" : "text-green-600"
            }`}
          />
        </div>
        <h3
          className={`text-lg font-bold ${
            isDark ? "text-white" : "text-gray-900"
          } mb-2`}
        >
          Order Approved!
        </h3>
        <p
          className={`${
            isDark ? "text-gray-300" : "text-gray-600"
          } text-sm mb-6`}
        >
          The order has been approved and added to POS
        </p>

        <div className="space-y-3">
          <button
            onClick={onPrintReceipt}
            className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Customer Receipt
          </button>
          <button
            onClick={onPrintToken}
            className="w-full py-3 rounded-lg font-semibold bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Kitchen Token
          </button>
          <button
            onClick={onClose}
            className={`w-full py-3 rounded-lg font-semibold ${
              isDark
                ? "bg-gray-800 hover:bg-gray-700 text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-900"
            } transition-all`}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
};

// Order Details Modal
const OrderDetailsModal = ({ isOpen, onClose, order, orderItems, isDark, onApprove, onReject, onEditDelivery }) => {
  if (!order) return null;

  // Check if order is pending (not approved and not rejected)
  const isPending = !order.is_approved && order.order_status !== "Cancelled";
  // Check if order is delivery type
  const isDelivery = order.order_type === "delivery";

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Order Details" maxWidth="max-w-4xl">
      <div className="space-y-4">
        {/* Two Column Layout */}
        <div className="grid grid-cols-2 gap-4">
          {/* Left Column - Order Info & Customer Details */}
          <div className="space-y-4">
            {/* Order Info */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
              <h4 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                Order Information
              </h4>
              <div className="space-y-3 text-sm">
                <div>
                  <p className={`${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                    Order Number
                  </p>
                  <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {order.order_number}
                  </p>
                </div>
                <div>
                  <p className={`${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                    Order Type
                  </p>
                  <div className="flex items-center gap-1">
                    {order.order_type === "delivery" ? (
                      <Truck className="w-4 h-4 text-blue-500" />
                    ) : (
                      <Package className="w-4 h-4 text-green-500" />
                    )}
                    <span className={`font-semibold capitalize ${isDark ? "text-white" : "text-gray-900"}`}>
                      {order.order_type}
                    </span>
                  </div>
                </div>
                <div>
                  <p className={`${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                    Order Time
                  </p>
                  <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                    {order.order_time || "N/A"}
                  </p>
                </div>
                <div>
                  <p className={`${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                    Original Source
                  </p>
                  <div className="flex items-center gap-1">
                    <Globe className="w-4 h-4 text-purple-500" />
                    <span className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                      {order.original_order_source || "Website"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Details */}
            <div className={`p-4 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
              <h4 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
                Customer Details
              </h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <User className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                  <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                    {order.customers?.full_name || "N/A"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Phone className={`w-4 h-4 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                  <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                    {order.customers?.phone || "N/A"}
                  </span>
                </div>
                {order.delivery_address && (
                  <div className="flex items-start gap-2">
                    <MapPin className={`w-4 h-4 mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                    <span className={isDark ? "text-gray-300" : "text-gray-700"}>
                      {order.delivery_address}
                    </span>
                  </div>
                )}
                {order.order_instructions && (
                  <div className="flex items-start gap-2 mt-3 p-3 rounded-lg border border-dashed border-gray-600">
                    <FileText className={`w-4 h-4 mt-0.5 ${isDark ? "text-gray-400" : "text-gray-500"}`} />
                    <div className="flex-1">
                      <p className={`text-xs ${isDark ? "text-gray-400" : "text-gray-500"} mb-1`}>
                        Special Instructions
                      </p>
                      <span className={`text-sm ${isDark ? "text-gray-300" : "text-gray-700"}`}>
                        {order.order_instructions}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Order Items */}
          <div className={`p-4 rounded-lg ${isDark ? "bg-gray-800" : "bg-gray-50"}`}>
            <h4 className={`font-semibold mb-3 ${isDark ? "text-white" : "text-gray-900"}`}>
              Order Items
            </h4>
            <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
              {orderItems.map((item, index) => (
                <div
                  key={index}
                  className={`flex justify-between items-start py-2 ${
                    index !== orderItems.length - 1 ? "border-b border-gray-700" : ""
                  }`}
                >
                  <div className="flex-1">
                    <p className={`font-medium ${isDark ? "text-white" : "text-gray-900"}`}>
                      {item.product_name}
                      {item.variant_name && (
                        <span className={`text-sm ml-2 ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                          ({item.variant_name})
                        </span>
                      )}
                    </p>
                    <p className={`text-sm ${isDark ? "text-gray-400" : "text-gray-500"}`}>
                      Qty: {item.quantity} × Rs {item.final_price}
                    </p>
                  </div>
                  <p className={`font-semibold ${isDark ? "text-white" : "text-gray-900"}`}>
                    Rs {item.total_price}
                  </p>
                </div>
              ))}
            </div>

            {/* Price Summary */}
            <div className="mt-4 pt-4 border-t border-gray-700 space-y-2">
              <div className="flex justify-between text-sm">
                <span className={isDark ? "text-gray-400" : "text-gray-600"}>Subtotal</span>
                <span className={isDark ? "text-white" : "text-gray-900"}>Rs {order.subtotal}</span>
              </div>
              {order.discount_amount > 0 && (
                <div className="flex justify-between text-sm text-green-500">
                  <span>Discount</span>
                  <span>- Rs {order.discount_amount}</span>
                </div>
              )}
              {order.delivery_charges > 0 && (
                <div className="flex justify-between text-sm">
                  <span className={isDark ? "text-gray-400" : "text-gray-600"}>Delivery Charges</span>
                  <span className={isDark ? "text-white" : "text-gray-900"}>Rs {order.delivery_charges}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-700">
                <span className={isDark ? "text-white" : "text-gray-900"}>Total</span>
                <span className={isDark ? "text-white" : "text-gray-900"}>Rs {order.total_amount}</span>
              </div>
            </div>

            {/* Edit Delivery Button - Only for delivery orders */}
            {isDelivery && (
              <button
                onClick={() => onEditDelivery?.(order)}
                className={`w-full mt-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 transition-all ${
                  isDark
                    ? "bg-gray-800 hover:bg-gray-700 text-white"
                    : "bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200"
                }`}
              >
                <Truck className="w-4 h-4" />
                Edit Delivery Details
              </button>
            )}
          </div>
        </div>

        {/* Action Buttons - Only show for pending orders */}
        {isPending && (
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => onReject(order)}
              className="flex-1 py-3 rounded-lg font-semibold bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white transition-all flex items-center justify-center gap-2"
            >
              <XCircle className="w-5 h-5" />
              Reject Order
            </button>
            <button
              onClick={() => onApprove(order)}
              className="flex-1 py-3 rounded-lg font-semibold bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white transition-all flex items-center justify-center gap-2"
            >
              <CheckCircle className="w-5 h-5" />
              Approve & Process
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
};

function WebOrdersPage() {
  const router = useRouter();
  const permissions = usePermissions();
  const [user, setUser] = useState(null);
  const [cashier, setCashier] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [orderItems, setOrderItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);
  const [orderToReject, setOrderToReject] = useState(null);
  const [theme, setTheme] = useState("light");
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("Pending"); // Pending, Approved, Rejected, All
  const [approvedOrderId, setApprovedOrderId] = useState(null);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showDeliveryModal, setShowDeliveryModal] = useState(false);
  const [orderForDelivery, setOrderForDelivery] = useState(null);

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push("/");
      return;
    }

    const userData = authManager.getCurrentUser();
    const cashierData = authManager.getCashier();
    setUser(userData);
    setCashier(cashierData);

    if (userData?.id) {
      printerManager.setUserId(userData.id);
      cacheManager.setUserId(userData.id);
    }

    setTheme(themeManager.currentTheme);
    themeManager.applyTheme();
  }, [router]);

  // Fetch orders when user is loaded or filter changes
  useEffect(() => {
    if (user?.id) {
      fetchWebOrders();
    }
  }, [user, statusFilter]);

  // Realtime subscription for new orders
  useEffect(() => {
    if (!user?.id) return;

    console.log("📡 [Web Orders Page] Setting up realtime subscription for user:", user.id);

    const channel = supabase
      .channel("web-orders-page-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const timestamp = new Date().toISOString();
          console.log(`🔔 [Web Orders Page] ${timestamp} - Realtime event:`, payload.eventType, payload);

          // Check if it's a website or mobile app order for INSERT events
          if (payload.eventType === "INSERT" &&
              (payload.new?.original_order_source === "Website" ||
               payload.new?.original_order_source === "Mobile App")) {
            console.log("🌐 [Web Orders Page] ✅ New web/mobile order inserted:", payload.new.order_number);
            console.log("🔄 [Web Orders Page] Refreshing orders list...");

            // Play beep sound and show toast only for pending orders
            if (payload.new?.is_approved === false) {
              webOrderNotificationManager.playBeepSound();

              const sourceLabel = payload.new?.original_order_source === "Mobile App" ? "Mobile App" : "Web";
              notify.success(
                `${sourceLabel === "Mobile App" ? "📱" : "🌐"} New ${sourceLabel} Order: ${payload.new.order_number}`,
                {
                  duration: 8000,
                  description: 'Order received and ready to approve'
                }
              );
            }

            fetchWebOrders();
          }
          // Check for UPDATE events (approval/rejection)
          else if (payload.eventType === "UPDATE" &&
                   (payload.new?.original_order_source === "Website" ||
                    payload.old?.original_order_source === "Website" ||
                    payload.new?.original_order_source === "Mobile App" ||
                    payload.old?.original_order_source === "Mobile App")) {
            console.log("🔄 [Web Orders Page] Web/Mobile order updated:", payload.new?.order_number);
            console.log("🔄 [Web Orders Page] Refreshing orders list...");
            fetchWebOrders();
          }
          // Check for DELETE events
          else if (payload.eventType === "DELETE" &&
                   (payload.old?.original_order_source === "Website" ||
                    payload.old?.original_order_source === "Mobile App")) {
            console.log("🗑️ [Web Orders Page] Web/Mobile order deleted:", payload.old?.order_number);
            console.log("🔄 [Web Orders Page] Refreshing orders list...");
            fetchWebOrders();
          } else {
            console.log("ℹ️ [Web Orders Page] Realtime event but not for web/mobile orders:", {
              eventType: payload.eventType,
              order_number: payload.new?.order_number || payload.old?.order_number,
              original_order_source: payload.new?.original_order_source || payload.old?.original_order_source
            });
          }
        }
      )
      .subscribe((status) => {
        console.log("📡 [Web Orders Page] Subscription status:", status);
        if (status === "SUBSCRIBED") {
          console.log("✅ [Web Orders Page] Successfully subscribed to realtime updates");
        } else if (status === "CHANNEL_ERROR") {
          console.error("❌ [Web Orders Page] Channel error - realtime updates may not work");
        }
      });

    return () => {
      console.log("📡 [Web Orders Page] Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const fetchWebOrders = async () => {
    try {
      setLoading(true);

      if (!user?.id) {
        console.log("❌ [Web Orders] No user found");
        setLoading(false);
        return;
      }

      console.log("🔍 [Web Orders] Fetching web/mobile orders with filter:", statusFilter);

      let query = supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            full_name,
            phone,
            email,
            addressline
          ),
          cashiers!orders_approved_by_cashier_fkey (
            id,
            name
          )
        `)
        .eq("user_id", user.id)
        .in("original_order_source", ["Website", "Mobile App"]);

      // Apply status filter
      if (statusFilter === "Pending") {
        query = query.eq("is_approved", false);
      } else if (statusFilter === "Approved") {
        query = query.eq("is_approved", true).neq("order_status", "Cancelled");
      } else if (statusFilter === "Rejected") {
        query = query.eq("order_status", "Cancelled");
      }
      // "All" shows everything

      query = query.order("created_at", { ascending: false }).limit(100);

      const { data, error } = await query;

      if (error) throw error;

      setOrders(data || []);
      console.log(`✅ [Web Orders] Fetched ${data?.length || 0} orders (filter: ${statusFilter})`);
    } catch (error) {
      console.error("❌ [Web Orders] Error fetching orders:", error);
      notify.error("Failed to load web orders");
    } finally {
      setLoading(false);
    }
  };

  const playBeepSound = () => {
    try {
      const audio = new Audio("/sounds/beep.mp3");
      audio.play().catch((err) => console.log("Could not play sound:", err));
    } catch (error) {
      console.log("Error playing beep sound:", error);
    }
  };

  const fetchOrderItems = async (orderId) => {
    try {
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId);

      if (error) throw error;

      setOrderItems(data || []);
    } catch (error) {
      console.error("❌ [Web Orders] Error fetching order items:", error);
      notify.error("Failed to load order items");
    }
  };

  const handleViewDetails = async (order) => {
    setSelectedOrder(order);
    await fetchOrderItems(order.id);
    setShowDetailsModal(true);
  };

  const handleApprove = async (order) => {
    if (isProcessing) return;

    try {
      setIsProcessing(true);
      console.log("✅ [Web Orders] Approving order:", order.order_number);

      // Update order in database
      const { error } = await supabase
        .from("orders")
        .update({
          order_source: "POS", // Change current source to POS
          is_approved: true,
          approved_at: new Date().toISOString(),
          approved_by_cashier_id: cashier?.id || null,
          approval_notes: "Approved from Web Orders page",
        })
        .eq("id", order.id);

      if (error) throw error;

      // Close details modal and show print options modal
      setShowDetailsModal(false);
      setApprovedOrderId(order.id);
      setShowPrintModal(true);

      // Refresh the list
      await fetchWebOrders();
    } catch (error) {
      console.error("❌ [Web Orders] Error approving order:", error);
      notify.error("Failed to approve order");
    } finally {
      setIsProcessing(false);
    }
  };

  const handlePrintReceipt = async () => {
    try {
      if (!approvedOrderId) return;

      console.log("🖨️ [Web Orders] Printing receipt for order:", approvedOrderId);

      // Fetch complete order data
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            full_name,
            phone,
            email,
            addressline
          )
        `)
        .eq("id", approvedOrderId)
        .single();

      if (orderError) throw orderError;

      // Fetch order items
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", approvedOrderId);

      if (itemsError) throw itemsError;

      console.log("🖨️ [Web Orders] Order items fetched:", items);
      console.log("🖨️ [Web Orders] Items count:", items?.length || 0);

      // Transform database items to printer format (cart format for receipt printer)
      const transformedCart = (items || []).map(item => ({
        id: item.id,
        productId: item.product_id,
        productName: item.product_name,
        variantId: item.variant_id,
        variantName: item.variant_name,
        quantity: item.quantity,
        finalPrice: item.final_price,
        totalPrice: item.total_price,
        isDeal: item.is_deal || false,
        dealId: item.deal_id || null,
        dealProducts: item.deal_products || null,
        notes: item.notes || null,
      }));

      console.log("🖨️ [Web Orders] Transformed cart:", transformedCart);

      // Get user profile
      const userProfileRaw = authManager.getCurrentUser();
      const userProfile = {
        store_name: userProfileRaw?.store_name || "Store",
        address: userProfileRaw?.address || "",
        phone: userProfileRaw?.phone || "",
        email: userProfileRaw?.email || "",
        store_logo: userProfileRaw?.store_logo || null,
        qr_code: userProfileRaw?.qr_code || null,
        show_footer_section: userProfileRaw?.show_footer_section !== false,
        show_business_name_on_receipt: userProfileRaw?.show_business_name_on_receipt !== false,
      };

      // Get printer config
      const printer = await printerManager.getPrinterForPrinting();
      if (!printer) {
        notify.error("No printer configured. Please configure a printer in settings.");
        return;
      }

      // Build complete order data for printing (receipt printer expects 'cart' property)
      const completeOrderData = {
        ...orderData,
        orderNumber: orderData.order_number,
        dailySerial: orderData.daily_serial || null,
        cart: transformedCart, // Receipt printer expects 'cart' not 'items'
        items: transformedCart, // Keep items for kitchen token (USB printer)
        customer: orderData.customers,
        subtotal: orderData.subtotal,
        discountAmount: orderData.discount_amount || 0,
        deliveryCharges: orderData.delivery_charges || 0,
        total: orderData.total_amount,
        paymentMethod: orderData.payment_method || 'Cash',
        orderType: orderData.order_type || 'delivery',
      };

      console.log("🖨️ [Web Orders] Complete order data:", completeOrderData);
      console.log("🖨️ [Web Orders] Cart items:", completeOrderData.cart);
      console.log("🖨️ [Web Orders] Printing to:", printer.name);
      const result = await printerManager.printReceipt(
        completeOrderData,
        userProfile,
        printer
      );

      if (result.success) {
        notify.success("Receipt printed successfully");
      } else {
        notify.error(result.error || "Failed to print receipt");
      }
    } catch (error) {
      console.error("❌ [Web Orders] Print receipt error:", error);
      notify.error("Failed to print receipt");
    }
  };

  const handlePrintToken = async () => {
    try {
      if (!approvedOrderId) return;

      console.log("🖨️ [Web Orders] Printing kitchen token for order:", approvedOrderId);

      // Fetch complete order data
      const { data: orderData, error: orderError } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            full_name,
            phone
          )
        `)
        .eq("id", approvedOrderId)
        .single();

      if (orderError) throw orderError;

      // Fetch order items
      const { data: items, error: itemsError } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", approvedOrderId);

      if (itemsError) throw itemsError;

      // Transform database items to printer format (kitchen token uses 'items')
      const transformedItems = (items || []).map(item => ({
        name: item.product_name,
        size: item.variant_name || null,
        quantity: item.quantity,
        price: item.final_price,
        total: item.total_price,
        notes: item.notes || null,
        isDeal: item.is_deal || false,
      }));

      // Get user profile
      const userProfileRaw = authManager.getCurrentUser();
      const userProfile = {
        store_name: userProfileRaw?.store_name || "KITCHEN",
      };

      // Get printer config
      const printer = await printerManager.getPrinterForPrinting();
      if (!printer) {
        notify.error("No printer configured. Please configure a printer in settings.");
        return;
      }

      // Build complete order data for printing (kitchen token uses 'items')
      const completeOrderData = {
        ...orderData,
        orderNumber: orderData.order_number,
        items: transformedItems,
        customer: orderData.customers,
        orderType: orderData.order_type || 'delivery',
      };

      console.log("🖨️ [Web Orders] Printing token to:", printer.name);
      const result = await printerManager.printKitchenToken(
        completeOrderData,
        userProfile,
        printer
      );

      if (result.success) {
        notify.success("Kitchen token printed successfully");
      } else {
        notify.error(result.error || "Failed to print kitchen token");
      }
    } catch (error) {
      console.error("❌ [Web Orders] Print token error:", error);
      notify.error("Failed to print kitchen token");
    }
  };

  const handleClosePrintModal = () => {
    setShowPrintModal(false);
    setApprovedOrderId(null);
  };

  const handleEditDelivery = (order) => {
    setOrderForDelivery(order);
    setShowDeliveryModal(true);
  };

  const handleDeliverySaved = async () => {
    await fetchWebOrders();
    // Refresh order items if details modal is open
    if (selectedOrder) {
      await fetchOrderItems(selectedOrder.id);
      // Update the selected order data
      const { data, error } = await supabase
        .from("orders")
        .select(`
          *,
          customers (
            id,
            full_name,
            phone,
            email,
            addressline
          ),
          cashiers!orders_approved_by_cashier_fkey (
            id,
            name
          )
        `)
        .eq("id", selectedOrder.id)
        .single();

      if (!error && data) {
        setSelectedOrder(data);
      }
    }
  };

  const handleRejectClick = (order) => {
    setOrderToReject(order);
    setShowDetailsModal(false);
    setShowRejectionModal(true);
  };

  const handleRejectConfirm = async (reason) => {
    if (isProcessing || !orderToReject) return;

    try {
      setIsProcessing(true);
      console.log("❌ [Web Orders] Rejecting order:", orderToReject.order_number);

      // Update order status to Cancelled
      const { error } = await supabase
        .from("orders")
        .update({
          order_status: "Cancelled",
          is_approved: true, // Mark as "processed" so it doesn't show here anymore
          approved_at: new Date().toISOString(),
          approved_by_cashier_id: cashier?.id || null,
          approval_notes: `Rejected: ${reason}`,
        })
        .eq("id", orderToReject.id);

      if (error) throw error;

      notify.success(`Order ${orderToReject.order_number} rejected`);

      // Refresh the list
      await fetchWebOrders();
      setShowRejectionModal(false);
      setOrderToReject(null);
    } catch (error) {
      console.error("❌ [Web Orders] Error rejecting order:", error);
      notify.error("Failed to reject order");
    } finally {
      setIsProcessing(false);
    }
  };

  const isDark = theme === "dark";
  const themeClasses = {
    bg: isDark ? "bg-gray-900" : "bg-gray-50",
    card: isDark ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200",
    text: isDark ? "text-white" : "text-gray-900",
    textSecondary: isDark ? "text-gray-400" : "text-gray-600",
    button: isDark
      ? "bg-gray-800 hover:bg-gray-700 text-white"
      : "bg-white hover:bg-gray-50 text-gray-900 border border-gray-200",
    input: isDark
      ? "bg-gray-800 border-gray-700 text-white placeholder-gray-500"
      : "bg-white border-gray-300 text-gray-900 placeholder-gray-400",
  };

  // Filter orders based on search
  const filteredOrders = orders.filter((order) => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      order.order_number?.toLowerCase().includes(search) ||
      order.customers?.full_name?.toLowerCase().includes(search) ||
      order.customers?.phone?.toLowerCase().includes(search)
    );
  });

  return (
    <ProtectedPage permissionKey="WEB_ORDERS" pageName="Web Orders">
      <div className={`min-h-screen ${themeClasses.bg}`}>
        {/* Header */}
        <div className={`sticky top-0 z-40 ${isDark ? "bg-gray-900/95" : "bg-white/95"} backdrop-blur-sm border-b ${isDark ? "border-gray-800" : "border-gray-200"}`}>
          <div className="px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => router.push("/dashboard")}
                  className={`p-2 rounded-xl ${themeClasses.button} transition-all`}
                >
                  <ArrowLeft className="w-5 h-5" />
                </motion.button>
                <div>
                  <h1 className={`text-2xl font-bold ${themeClasses.text}`}>
                    Web Orders
                  </h1>
                  <p className={`text-sm ${themeClasses.textSecondary}`}>
                    Orders from website and mobile app
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={fetchWebOrders}
                  className={`p-2 rounded-xl ${themeClasses.button} transition-all`}
                >
                  <RefreshCw className="w-5 h-5" />
                </motion.button>
              </div>
            </div>

            {/* Status Filter Tabs */}
            <div className="flex gap-2 mb-4">
              {["Pending", "Approved", "Rejected", "All"].map((status) => (
                <motion.button
                  key={status}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                    statusFilter === status
                      ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-md"
                      : isDark
                      ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {status}
                </motion.button>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${themeClasses.textSecondary}`} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by order number, customer name, or phone..."
                className={`w-full pl-10 pr-4 py-3 rounded-xl border ${themeClasses.input} focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[...Array(6)].map((_, i) => (
                <OrderSkeleton key={i} isDark={isDark} />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-16">
              <div className={`w-20 h-20 ${isDark ? "bg-gray-800" : "bg-gray-100"} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <Globe className={`w-10 h-10 ${themeClasses.textSecondary}`} />
              </div>
              <h3 className={`text-xl font-bold ${themeClasses.text} mb-2`}>
                No Orders Found
              </h3>
              <p className={themeClasses.textSecondary}>
                {searchTerm
                  ? "No orders match your search"
                  : "All web and mobile orders have been processed"}
              </p>
            </div>
          ) : (
            <div>
              <div className={`mb-4 flex items-center justify-between`}>
                <p className={`text-sm ${themeClasses.textSecondary}`}>
                  {filteredOrders.length} pending order{filteredOrders.length !== 1 ? "s" : ""}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredOrders.map((order) => (
                  <motion.div
                    key={order.id}
                    layout
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    className={`p-4 rounded-xl border ${themeClasses.card} hover:shadow-lg transition-all cursor-pointer`}
                    onClick={() => handleViewDetails(order)}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <p className={`font-bold ${themeClasses.text}`}>
                          {order.order_number}
                        </p>
                        <p className={`text-xs ${themeClasses.textSecondary} flex items-center gap-1 mt-1`}>
                          <Clock className="w-3 h-3" />
                          {order.order_time || "N/A"}
                        </p>
                      </div>
                      <div
                        className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 ${
                          order.order_type === "delivery"
                            ? "bg-blue-500/10 text-blue-500"
                            : "bg-green-500/10 text-green-500"
                        }`}
                      >
                        {order.order_type === "delivery" ? (
                          <Truck className="w-3 h-3" />
                        ) : (
                          <Package className="w-3 h-3" />
                        )}
                        {order.order_type}
                      </div>
                    </div>

                    {/* Customer Info */}
                    <div className="space-y-2 mb-3">
                      <div className="flex items-center gap-2">
                        <User className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                        <span className={`text-sm ${themeClasses.text}`}>
                          {order.customers?.full_name || "N/A"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className={`w-4 h-4 ${themeClasses.textSecondary}`} />
                        <span className={`text-sm ${themeClasses.text}`}>
                          {order.customers?.phone || "N/A"}
                        </span>
                      </div>
                      {order.delivery_address && (
                        <div className="flex items-start gap-2">
                          <MapPin className={`w-4 h-4 mt-0.5 ${themeClasses.textSecondary}`} />
                          <span className={`text-sm ${themeClasses.text} line-clamp-2`}>
                            {order.delivery_address}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Total */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-700">
                      <span className={`text-sm ${themeClasses.textSecondary}`}>
                        Total Amount
                      </span>
                      <span className={`text-lg font-bold ${themeClasses.text}`}>
                        Rs {order.total_amount}
                      </span>
                    </div>

                    {/* Status & Source Badges */}
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1 text-xs text-purple-500">
                        <Globe className="w-3 h-3" />
                        <span>From {order.original_order_source || "Website"}</span>
                      </div>
                      {order.is_approved && order.order_status !== "Cancelled" && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-green-500/10 text-green-500 text-xs font-semibold">
                          <Check className="w-3 h-3" />
                          Approved
                        </div>
                      )}
                      {order.order_status === "Cancelled" && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500/10 text-red-500 text-xs font-semibold">
                          <XCircle className="w-3 h-3" />
                          Rejected
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modals */}
        <OrderDetailsModal
          isOpen={showDetailsModal}
          onClose={() => setShowDetailsModal(false)}
          order={selectedOrder}
          orderItems={orderItems}
          isDark={isDark}
          onApprove={handleApprove}
          onReject={handleRejectClick}
          onEditDelivery={handleEditDelivery}
        />

        <RejectionModal
          isOpen={showRejectionModal}
          onClose={() => {
            setShowRejectionModal(false);
            setOrderToReject(null);
          }}
          onConfirm={handleRejectConfirm}
          isDark={isDark}
        />

        <PrintSuccessModal
          isOpen={showPrintModal}
          onClose={handleClosePrintModal}
          onPrintReceipt={handlePrintReceipt}
          onPrintToken={handlePrintToken}
          isDark={isDark}
        />

        <DeliveryDetailsModal
          isOpen={showDeliveryModal}
          onClose={() => {
            setShowDeliveryModal(false);
            setOrderForDelivery(null);
          }}
          order={orderForDelivery}
          isDark={isDark}
          onSave={handleDeliverySaved}
        />
      </div>
    </ProtectedPage>
  );
}

export default WebOrdersPage;
