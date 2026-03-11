"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Search,
  Filter,
  Calendar,
  Clock,
  User,
  FileText,
  Edit3,
  CheckCircle,
  XCircle,
  RefreshCw,
  Eye,
  Phone,
  MapPin,
  Truck,
  Coffee,
  DollarSign,
  MoreVertical,
  AlertTriangle,
  X,
  Sun,
  Moon,
  Check,
  Printer,
  Package,
  CreditCard,
  History,
  Shield,
  UserCircle,
  Plus, // Add this
  Minus, // Add this
  Table2,
  Award,
  TrendingUp,
  TrendingDown,
  Globe,
  Gift,
  BarChart2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { themeManager } from "../../lib/themeManager";
import { authManager } from "../../lib/authManager";
import { printerManager } from "../../lib/printerManager";
import { cacheManager } from "../../lib/cacheManager";
import { usePermissions } from "../../lib/permissionManager";
import { webOrderNotificationManager } from "../../lib/webOrderNotification";
import dailySerialManager from "../../lib/utils/dailySerialManager";
import { getTodaysBusinessDate, getBusinessDate } from "../../lib/utils/businessDayUtils";
import Modal from "../../components/ui/Modal";
import ProtectedPage from "../../components/ProtectedPage";
import InlinePaymentSection from "../../components/pos/InlinePaymentSection";
import SplitPaymentModal from "../../components/pos/SplitPaymentModal";
import ConvertToDeliveryModal from "../../components/delivery/ConvertToDeliveryModal";
import ConvertToTakeawayModal from "../../components/delivery/ConvertToTakeawayModal";
import NotificationSystem, { notify } from "../../components/ui/NotificationSystem";
import { getOrderItemsWithChanges } from '../../lib/utils/orderChangesTracker';

const OrderSkeleton = ({ isDark }) => {
  return (
    <div
      className={`p-2 rounded-lg ${
        isDark ? "bg-gray-800" : "bg-white"
      } border ${isDark ? "border-gray-700" : "border-gray-200"} animate-pulse`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center flex-1">
          <div
            className={`w-6 h-6 rounded-md ${
              isDark ? "bg-gray-700" : "bg-gray-200"
            } mr-2`}
          ></div>
          <div className="flex-1">
            <div
              className={`h-4 ${
                isDark ? "bg-gray-700" : "bg-gray-200"
              } rounded w-24 mb-1`}
            ></div>
            <div
              className={`h-3 ${
                isDark ? "bg-gray-700" : "bg-gray-200"
              } rounded w-16`}
            ></div>
          </div>
        </div>
        <div className="text-right">
          <div
            className={`h-4 ${
              isDark ? "bg-gray-700" : "bg-gray-200"
            } rounded w-16 mb-1 ml-auto`}
          ></div>
          <div
            className={`h-3 ${
              isDark ? "bg-gray-700" : "bg-gray-200"
            } rounded w-12 ml-auto`}
          ></div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div
          className={`h-3 ${
            isDark ? "bg-gray-700" : "bg-gray-200"
          } rounded w-20`}
        ></div>
        <div
          className={`h-5 ${
            isDark ? "bg-gray-700" : "bg-gray-200"
          } rounded-full w-16`}
        ></div>
      </div>
    </div>
  );
};

// Success Modal
const SuccessModal = ({ isOpen, onClose, title, message }) => {
  const isDark = themeManager.isDark();

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
          {title}
        </h3>
        <p
          className={`${
            isDark ? "text-gray-300" : "text-gray-600"
          } text-sm mb-6`}
        >
          {message}
        </p>
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onClose}
          className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
        >
          OK
        </motion.button>
      </div>
    </Modal>
  );
};

export default function OrdersPage() {
  const router = useRouter();
  const permissions = usePermissions();
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [orders, setOrders] = useState([]);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const selectedOrderRef = useRef(null);
  const [orderItems, setOrderItems] = useState([]);
  const [orderHistory, setOrderHistory] = useState([]);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [orderLoyaltyPoints, setOrderLoyaltyPoints] = useState([]);
  const [loyaltyRedemption, setLoyaltyRedemption] = useState(null);
  const [paymentTransactions, setPaymentTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cashierFilter, setCashierFilter] = useState("All");
  const [deliveryBoyFilter, setDeliveryBoyFilter] = useState("All");
  const [showRiderSummary, setShowRiderSummary] = useState(false);
  const [cashiersList, setCashiersList] = useState([]);
  const [deliveryBoysList, setDeliveryBoysList] = useState([]);
  const [showActionMenu, setShowActionMenu] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedCancelReason, setSelectedCancelReason] = useState("");
  const [customCancelReason, setCustomCancelReason] = useState("");
  const [theme, setTheme] = useState("light");
  const [isPrinting, setIsPrinting] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(100);
  const [totalAvailable, setTotalAvailable] = useState(0);
  const [successModal, setSuccessModal] = useState({
    isOpen: false,
    title: "",
    message: "",
  });
  const [showPaymentView, setShowPaymentView] = useState(false);
  const [showSplitPaymentModal, setShowSplitPaymentModal] = useState(false);
  const [splitPaymentOrder, setSplitPaymentOrder] = useState(null);
  const [showConvertToDeliveryModal, setShowConvertToDeliveryModal] = useState(false);
  const [showConvertToTakeawayModal, setShowConvertToTakeawayModal] = useState(false);

  const cancellationReasons = [
    "Customer requested cancellation",
    "Out of stock items",
    "Kitchen issues",
    "Payment problems",
    "Delivery not possible",
    "Other",
  ];

  const tabs = [
    { id: "All", label: "All", icon: FileText },
    { id: "Walkin", label: "Walk-in", icon: Coffee },
    { id: "Takeaway", label: "Takeaway", icon: Coffee },
    { id: "Delivery", label: "Delivery", icon: Truck },
  ];

  const statusOptions = [
    { id: "All", label: "All", color: "gray" },
    { id: "Pending", label: "Pending", color: "yellow" },
    { id: "Preparing", label: "Preparing", color: "blue" },
    { id: "Ready", label: "Ready", color: "purple" },
    { id: "Dispatched", label: "Dispatched", color: "green" },
    { id: "Cancelled", label: "Cancelled", color: "red" },
  ];

  useEffect(() => {
    if (!authManager.isLoggedIn()) {
      router.push("/");
      return;
    }

    const userData = authManager.getCurrentUser();
    const role = authManager.getRole();
    setUser(userData);
    setUserRole(role);

    if (userData?.id) {
      printerManager.setUserId(userData.id);
      cacheManager.setUserId(userData.id);
    }

    setTheme(themeManager.currentTheme);
    themeManager.applyTheme();

    const today = new Date();
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(today.getDate() - 7);

    setDateFrom(sevenDaysAgo.toISOString().split("T")[0]);
    setDateTo(today.toISOString().split("T")[0]);

    // Pass userData.id directly to avoid state timing issues
    if (userData?.id) {
      fetchFilterLists(userData.id);
    }
    fetchOrders();
  }, [router]);

  useEffect(() => {
    setDisplayLimit(100);
    fetchOrders();
  }, [activeTab, statusFilter, dateFrom, dateTo, searchTerm, cashierFilter, deliveryBoyFilter]);

  // Realtime subscription for orders
  useEffect(() => {
    if (!user?.id) return;

    console.log("📡 [Orders Page] Setting up realtime subscription");

    const channel = supabase
      .channel("orders-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          console.log("🔔 [Orders Page] Realtime update:", payload);

          if (payload.eventType === "INSERT") {
            const order = payload.new;

            // Mobile App order notification
            if (order?.original_order_source === "Mobile App" && order?.is_approved === false) {
              webOrderNotificationManager.playBeepSound();
              notify.success(`📱 New Mobile App Order: ${order.order_number}`, {
                duration: 8000,
                description: 'Order received and ready to approve'
              });
            } else if (order?.order_number) {
              // Any other new order from another device
              notify.success(`New order arrived: #${order.order_number}`, {
                duration: 5000,
                description: `${order.order_type || ''} · Rs ${order.total_amount || 0}`
              });
            }
          }

          // Refresh list without auto-jumping (selectedOrderRef keeps current selection)
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      console.log("📡 [Orders Page] Cleaning up realtime subscription");
      supabase.removeChannel(channel);
    };
  }, [user?.id, activeTab, statusFilter, dateFrom, dateTo]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    themeManager.setTheme(newTheme);
  };

  const showSuccess = (title, message) => {
    setSuccessModal({ isOpen: true, title, message });
  };

  const fetchFilterLists = async (userId) => {
    try {
      if (!userId) {
        console.error("❌ Cannot fetch filter lists - no user ID provided");
        return;
      }

      console.log("📋 Fetching cashiers and delivery boys for user:", userId);

      // Fetch cashiers from cashiers table
      const { data: cashiersData, error: cashiersError } = await supabase
        .from("cashiers")
        .select("id, name")
        .eq("user_id", userId)
        .order("name");

      if (cashiersError) {
        console.error("❌ Error fetching cashiers:", cashiersError);
      } else {
        console.log("✅ Fetched cashiers:", cashiersData?.length || 0, cashiersData);
      }

      // Fetch admin users from users table
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("id, customer_name")
        .eq("id", userId);

      if (usersError) {
        console.error("❌ Error fetching users:", usersError);
      } else {
        console.log("✅ Fetched users:", usersData?.length || 0, usersData);
      }

      // Combine cashiers and users into one list
      const allCashiers = [];

      // Add admin users (with a prefix to indicate they're from users table)
      if (usersData && usersData.length > 0) {
        usersData.forEach(u => {
          allCashiers.push({
            id: `user_${u.id}`,
            name: u.customer_name || "Admin",
            type: "user"
          });
        });
      }

      // Add cashiers (with a prefix to indicate they're from cashiers table)
      if (cashiersData && cashiersData.length > 0) {
        cashiersData.forEach(c => {
          allCashiers.push({
            id: `cashier_${c.id}`,
            name: c.name,
            type: "cashier",
            originalId: c.id
          });
        });
      }

      console.log("📋 Combined cashiers list:", allCashiers.length, allCashiers);
      setCashiersList(allCashiers);

      // Fetch delivery boys
      const { data: deliveryBoysData, error: deliveryBoysError } = await supabase
        .from("delivery_boys")
        .select("id, name")
        .eq("user_id", userId)
        .order("name");

      if (deliveryBoysError) {
        console.error("❌ Error fetching delivery boys:", deliveryBoysError);
      } else {
        console.log("✅ Fetched delivery boys:", deliveryBoysData?.length || 0, deliveryBoysData);
      }

      setDeliveryBoysList(deliveryBoysData || []);
    } catch (error) {
      console.error("❌ Error fetching filter lists:", error);
    }
  };

  const fetchOrders = async () => {
    try {
      // Only show loading spinner on initial load
      const shouldShowLoading = orders.length === 0;

      if (shouldShowLoading) {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      if (!user?.id) {
        console.log("❌ [Orders Page] No user found, cannot fetch orders");
        setLoading(false);
        return;
      }

      console.log("🔍 [Orders Page] Fetching orders for user:", user.id);

      let rawOrders = [];

      // Check if we're online or offline
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      if (isOnline) {
        try {
          // Direct Supabase query with proper error handling
          // Filter to show only approved orders (POS orders or approved website orders)
          const { data, error } = await supabase
            .from("orders")
            .select(`
              id,
              order_number,
              order_type,
              order_status,
              payment_status,
              payment_method,
              order_date,
              order_time,
              total_amount,
              subtotal,
              discount_amount,
              delivery_charges,
              delivery_address,
              order_instructions,
              created_at,
              table_id,
              customer_id,
              cashier_id,
              delivery_boy_id,
              order_source,
              original_order_source,
              is_approved,
              customers (
                id,
                full_name,
                phone,
                addressline
              ),
              tables (
                id,
                table_name,
                table_number
              ),
              cashiers!orders_cashier_id_fkey (
                id,
                name
              ),
              users (
                id,
                customer_name
              ),
              delivery_boys (
                id,
                name
              )
            `)
            .eq("user_id", user.id)
            .or("order_source.eq.POS,is_approved.eq.true")
            .gte("order_date", dateFrom || new Date().toISOString().split("T")[0])
            .lte("order_date", dateTo || new Date().toISOString().split("T")[0])
            .order("created_at", { ascending: false })
            .limit(displayLimit);

          if (error) {
            console.error("Supabase error details:", JSON.stringify(error, null, 2));
            throw new Error(error.message || "Failed to fetch orders");
          }

          rawOrders = data || [];
          console.log("📦 [Orders Page] Fetched from Supabase:", rawOrders.length);
        } catch (fetchError) {
          // Network error - fall back to cache
          console.warn("🔄 [Orders Page] Network error, falling back to cache:", fetchError.message);
          rawOrders = cacheManager.getAllOrders() || [];
          console.log("📦 [Orders Page] Loaded from cache (network error):", rawOrders.length);
        }
      } else {
        // Offline mode - get orders from cache
        console.log("📴 [Orders Page] Offline mode - loading from cache");
        rawOrders = cacheManager.getAllOrders() || [];
        console.log("📦 [Orders Page] Loaded from cache:", rawOrders.length);
      }

      let filteredOrders = rawOrders;
      console.log("📦 Raw orders fetched:", filteredOrders.length);

      // Filter to show only approved orders (POS orders or approved website orders)
      filteredOrders = filteredOrders.filter((order) => {
        return order.order_source === 'POS' || order.is_approved === true;
      });

      // Apply date filter client-side (needed for offline data)
      const fromDate = dateFrom || new Date().toISOString().split("T")[0];
      const toDate = dateTo || new Date().toISOString().split("T")[0];
      filteredOrders = filteredOrders.filter((order) => {
        const orderDate = order.order_date || (order.created_at ? order.created_at.split("T")[0] : null);
        if (!orderDate) return true;
        return orderDate >= fromDate && orderDate <= toDate;
      });

      // Apply type filter client-side
      if (activeTab !== "All") {
        filteredOrders = filteredOrders.filter(
          (order) => order.order_type === activeTab.toLowerCase()
        );
      }

      // Apply status filter client-side
      if (statusFilter !== "All") {
        filteredOrders = filteredOrders.filter(
          (order) => order.order_status === statusFilter
        );
      }

      // Apply cashier filter client-side
      if (cashierFilter !== "All") {
        filteredOrders = filteredOrders.filter((order) => {
          // Check if filter is for a user (admin) or cashier
          if (cashierFilter.startsWith("user_")) {
            // Filter for admin users (orders with no cashier_id)
            return !order.cashier_id;
          } else if (cashierFilter.startsWith("cashier_")) {
            // Extract the actual cashier ID from the filter value
            const actualCashierId = cashierFilter.replace("cashier_", "");
            return order.cashier_id === actualCashierId;
          }
          return true;
        });
      }

      // Apply delivery boy filter client-side
      if (deliveryBoyFilter !== "All") {
        filteredOrders = filteredOrders.filter(
          (order) => order.delivery_boy_id === deliveryBoyFilter
        );
      }

      // IMPORTANT: Enrich orders with daily serial numbers BEFORE search
      // This ensures serial numbers are available for searching
      const ordersWithSerials = cacheManager.enrichOrdersWithSerials(filteredOrders);
      filteredOrders = ordersWithSerials;

      // Apply search filter client-side (after serial enrichment)
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        console.log("🔍 Searching for:", search);
        filteredOrders = filteredOrders.filter((order) => {
          const orderNumber = (order.order_number || "").toLowerCase();
          const customerName = (order.customers?.full_name || "").toLowerCase();
          const customerPhone = (order.customers?.phone || "").toLowerCase();
          const tableName = (order.tables?.table_name || "").toLowerCase();
          const tableNumber = (order.tables?.table_number?.toString() || "").toLowerCase();

          // Serial number search - support searching by serial like "001", "1", "#001", etc.
          let searchMatchesSerial = false;
          if (order.daily_serial) {
            const serialNumber = order.daily_serial.toString();
            const serialFormatted = order.daily_serial.toString().padStart(3, '0');
            const searchClean = search.replace('#', '').trim();

            // Check various formats
            searchMatchesSerial =
              serialNumber === searchClean ||           // "7" matches serial 7
              serialFormatted === searchClean ||        // "007" matches serial 7
              serialFormatted.includes(searchClean) ||  // "00" matches "007"
              serialNumber.includes(searchClean);       // "7" includes "7"
          }

          // Debug log for EVERY order to see what's happening
          console.log("🔍 Order search debug:", {
            orderNumber: order.order_number,
            dailySerial: order.daily_serial,
            searchTerm: search,
            searchMatchesSerial,
            customerName,
            hasTable: !!order.tables
          });

          return (
            orderNumber.includes(search) ||
            customerName.includes(search) ||
            customerPhone.includes(search) ||
            tableName.includes(search) ||
            tableNumber.includes(search) ||
            searchMatchesSerial
          );
        });
      }

      console.log("✅ [Orders Page] Filtered orders:", filteredOrders.length);

      setOrders(filteredOrders);
      setTotalAvailable(filteredOrders.length);

      const currentSelected = selectedOrderRef.current;
      if (filteredOrders.length > 0 && !currentSelected) {
        setSelectedOrder(filteredOrders[0]);
        selectedOrderRef.current = filteredOrders[0];
        await fetchOrderItems(filteredOrders[0].id);
        await fetchOrderHistory(filteredOrders[0].id);
      } else if (currentSelected) {
        // Sync the selected order with the latest data from the server
        const refreshed = filteredOrders.find(o => o.id === currentSelected.id);
        if (refreshed) {
          setSelectedOrder(refreshed);
          selectedOrderRef.current = refreshed;
        }
      }

      setLoading(false);
      setLoadingMore(false);
    } catch (error) {
      console.error("❌ [Orders Page] Error fetching orders:", error.message || error);
      setLoading(false);
      setLoadingMore(false);
    }
  };
  const handleLoadMore = () => {
    setDisplayLimit((prev) => prev + 100);
    setTimeout(() => {
      fetchOrders();
    }, 100);
  };

  const fetchOrderItems = async (orderId) => {
    try {
      // First check if order has items cached (for offline orders)
      const order = orders.find((o) => o.id === orderId);
      if (order && order.items && Array.isArray(order.items)) {
        console.log("📦 Using cached order items:", order.items.length);
        setOrderItems(order.items);
        return;
      }

      // If offline, can't fetch - show empty or what we have
      if (!navigator.onLine) {
        console.log("📴 Offline: Cannot fetch order items from database");
        setOrderItems([]);
        return;
      }

      // If online and no cached items, fetch from Supabase
      const { data, error } = await supabase
        .from("order_items")
        .select("*")
        .eq("order_id", orderId)
        .order("created_at");

      if (error) throw error;

      // DEBUG: Log raw data from database
      console.log('📦 Fetched order items from DB:', JSON.stringify(data, null, 2));

      setOrderItems(data || []);
    } catch (error) {
      console.error("Error fetching order items:", error);
      // Fallback to cached items if available
      const order = orders.find((o) => o.id === orderId);
      if (order && order.items) {
        setOrderItems(order.items);
      } else {
        setOrderItems([]);
      }
    }
  };

  const fetchOrderHistory = async (orderId) => {
    try {
      // Check if we're offline
      if (!navigator.onLine) {
        console.log("📴 Offline: Skipping order history fetch");
        setOrderHistory([]);
        return;
      }

      const history = await authManager.getOrderHistory(orderId);
      setOrderHistory(history);
    } catch (error) {
      console.error("Error fetching order history:", error);
      setOrderHistory([]);
    }
  };

  const fetchOrderLoyaltyPoints = async (orderId) => {
    try {
      // Check if we're offline
      if (!navigator.onLine) {
        console.log("📴 Offline: Skipping loyalty points fetch");
        setOrderLoyaltyPoints([]);
        return;
      }

      const { data, error } = await supabase
        .from("loyalty_points_log")
        .select(`
          *,
          customers (
            full_name,
            phone
          )
        `)
        .eq("order_id", orderId)
        .order("created_at", { ascending: false });

      if (error) throw error;

      setOrderLoyaltyPoints(data || []);
    } catch (error) {
      console.error("Error fetching loyalty points:", error);
      setOrderLoyaltyPoints([]);
    }
  };

  const fetchLoyaltyRedemption = async (orderNumber) => {
    try {
      // Check if we're offline
      if (!navigator.onLine) {
        console.log("📴 Offline: Checking cache for loyalty redemption");

        // Try to get loyalty redemption from localStorage/cache
        const cachedOrder = cacheManager.getOrders().find(o => o.order_number === orderNumber);

        if (cachedOrder) {
          // Check if loyalty redemption data is stored in the order
          const loyaltyData = {
            points_used: cachedOrder.loyalty_points_redeemed || cachedOrder.loyaltyPointsRedeemed || 0,
            discount_applied: cachedOrder.loyalty_discount_amount || cachedOrder.loyaltyDiscountAmount || 0
          };

          if (loyaltyData.points_used > 0 || loyaltyData.discount_applied > 0) {
            console.log('✅ Found cached loyalty redemption:', loyaltyData);
            setLoyaltyRedemption(loyaltyData);
            return;
          }
        }

        console.log("📴 Offline: No loyalty redemption data found in cache");
        setLoyaltyRedemption(null);
        return;
      }

      const { data, error } = await supabase
        .from("loyalty_redemptions")
        .select("points_used, discount_applied")
        .eq("order_id", orderNumber)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Not found error
          console.error("Error fetching loyalty redemption:", error);
        }
        setLoyaltyRedemption(null);
        return;
      }

      if (data) {
        console.log('✅ Found loyalty redemption:', data);
        setLoyaltyRedemption(data);
      } else {
        setLoyaltyRedemption(null);
      }
    } catch (error) {
      console.error("Error fetching loyalty redemption:", error);
      setLoyaltyRedemption(null);
    }
  };

  const fetchPaymentTransactions = async (orderId) => {
    try {
      console.log('💳 Fetching payment transactions for order:', orderId);

      // Try cache first (for offline support)
      const cachedTransactions = cacheManager.getPaymentTransactions(orderId);
      if (cachedTransactions && cachedTransactions.length > 0) {
        console.log('✅ Using cached payment transactions:', cachedTransactions);
        setPaymentTransactions(cachedTransactions);
        return;
      }

      // If not in cache and online, fetch from database
      if (navigator.onLine) {
        const { data, error } = await supabase
          .from("order_payment_transactions")
          .select("*")
          .eq("order_id", orderId)
          .order("created_at", { ascending: true });

        if (error) {
          console.error("Error fetching payment transactions:", error);
          setPaymentTransactions([]);
          return;
        }

        console.log('✅ Fetched payment transactions from database:', data);

        // Cache the transactions for offline use
        if (data && data.length > 0) {
          cacheManager.setPaymentTransactions(orderId, data);
        }

        setPaymentTransactions(data || []);
      } else {
        console.log('📴 Offline: No cached payment transactions found');
        setPaymentTransactions([]);
      }
    } catch (error) {
      console.error("Error fetching payment transactions:", error);
      setPaymentTransactions([]);
    }
  };

  const handleOrderSelect = async (order) => {
    setSelectedOrder(order);
    selectedOrderRef.current = order;
    await fetchOrderItems(order.id);
    await fetchOrderHistory(order.id);
    await fetchOrderLoyaltyPoints(order.order_number);
    await fetchLoyaltyRedemption(order.order_number);

    // Fetch payment transactions if split payment
    if (order.payment_method === 'Split') {
      await fetchPaymentTransactions(order.id);
    } else {
      setPaymentTransactions([]);
    }

    setShowActionMenu(null);
  };

  // Handle payment completion from inline payment view
  const handlePaymentComplete = async (paymentData) => {
    try {
      if (!selectedOrder) return;

      // Check network status
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        notify.error('No internet connection - cannot process payment');
        return;
      }

      // Check if this is a split payment request
      if (paymentData.useSplitPayment) {
        console.log('💳 Split payment requested for order:', selectedOrder.order_number);
        setSplitPaymentOrder(selectedOrder);
        setShowSplitPaymentModal(true);
        setShowPaymentView(false);
        return;
      }

      // Check if paymentData is an array (split payment completion)
      if (Array.isArray(paymentData)) {
        console.log('💳 Processing split payment completion for order:', selectedOrder.id);
        console.log('💳 Payment data:', paymentData);
        console.log('💳 Selected order:', selectedOrder);

        // Calculate total from payments
        const totalPaid = paymentData.reduce((sum, p) => sum + parseFloat(p.amount), 0);
        console.log('💳 Total paid:', totalPaid);

        // Update order with split payment
        try {
          console.log('💳 Attempting to update order with data:', {
            payment_method: 'Split',
            payment_status: 'Paid',
            amount_paid: totalPaid,
            order_id: selectedOrder.id
          });

          const { data: updateData, error: updateError } = await supabase
            .from('orders')
            .update({
              payment_method: 'Split',
              payment_status: 'Paid',
              amount_paid: totalPaid,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedOrder.id)
            .select();

          console.log('💳 Update result:', { updateData, updateError });

          if (updateError) {
            console.error('❌ Error updating order:', updateError);
            throw new Error(`Failed to update order: ${updateError.message}`);
          }

          if (!updateData || updateData.length === 0) {
            console.error('❌ No rows updated - order may not exist or ID is incorrect');
            throw new Error('Failed to update order - no rows affected');
          }

          console.log('✅ Order updated successfully:', updateData);
        } catch (dbError) {
          console.error('❌ Database error updating order:', dbError);
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Insert payment transactions
        const transactions = paymentData.map(payment => ({
          order_id: selectedOrder.id,
          user_id: user.id,
          payment_method: payment.method,
          amount: parseFloat(payment.amount),
          reference_number: payment.reference || null,
          notes: payment.notes || null,
          created_at: new Date().toISOString()
        }));

        const { error: txError } = await supabase
          .from('order_payment_transactions')
          .insert(transactions);

        if (txError) {
          console.error('Error inserting payment transactions:', txError);
        } else {
          console.log('✅ Split payment transactions inserted:', transactions);
          // Cache the transactions for offline use
          cacheManager.setPaymentTransactions(selectedOrder.id, transactions);
        }

        // Log the payment action (don't fail if this fails)
        try {
          await authManager.logOrderAction(
            selectedOrder.id,
            'payment_completed',
            {
              payment_method: 'Split',
              amount: totalPaid,
              transactions: paymentData
            },
            `Split payment completed: Rs ${totalPaid} across ${paymentData.length} methods`
          );
        } catch (logError) {
          console.error('⚠️ Failed to log payment action:', logError);
          // Continue even if logging fails
        }

        // Update local selected order state
        setSelectedOrder({
          ...selectedOrder,
          payment_method: 'Split',
          payment_status: 'Paid',
          amount_paid: totalPaid
        });

        notify.success('Split payment completed successfully!');
      } else {
        // Regular payment (single method)
        try {
          // Update order with payment details
          const { error: updateError } = await supabase
            .from('orders')
            .update({
              payment_method: paymentData.paymentMethod,
              payment_status: 'Paid',
              discount_amount: paymentData.discountAmount || 0,
              discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
              total_amount: paymentData.newTotal,
              updated_at: new Date().toISOString()
            })
            .eq('id', selectedOrder.id);

          if (updateError) {
            console.error('❌ Error updating order:', updateError);
            throw new Error(`Failed to update order: ${updateError.message}`);
          }
        } catch (dbError) {
          console.error('❌ Database error:', dbError);
          throw new Error(`Database error: ${dbError.message}`);
        }

        // Log the payment action (don't fail if this fails)
        try {
          await authManager.logOrderAction(
            selectedOrder.id,
            'payment_completed',
            {
              payment_method: paymentData.paymentMethod,
              amount: paymentData.newTotal,
              discount: paymentData.discountAmount
            },
            `Payment completed: ${paymentData.paymentMethod} - Rs ${paymentData.newTotal}`
          );
        } catch (logError) {
          console.error('⚠️ Failed to log payment action:', logError);
          // Continue even if logging fails
        }

        // Update local selected order state
        setSelectedOrder({
          ...selectedOrder,
          payment_method: paymentData.paymentMethod,
          payment_status: 'Paid',
          discount_amount: paymentData.discountAmount || 0,
          discount_percentage: paymentData.discountType === 'percentage' ? paymentData.discountValue : 0,
          total_amount: paymentData.newTotal
        });

        notify.success('Payment completed successfully!');
      }

      // Hide payment view
      setShowPaymentView(false);

      // Mark order as completed
      try {
        await updateOrderStatus(selectedOrder.id, 'Completed');
      } catch (statusError) {
        console.error('⚠️ Failed to mark order as completed:', statusError);
        notify.warning('Payment recorded but order status may not be updated');
      }

      // Refresh orders list
      try {
        await fetchOrders();
      } catch (refreshError) {
        console.error('⚠️ Failed to refresh orders:', refreshError);
        // Don't notify - orders will refresh on next interaction
      }

    } catch (error) {
      console.error('❌ Error completing payment:', error);

      // Provide more specific error message
      let errorMessage = 'Failed to complete payment';
      if (error.message.includes('Failed to fetch')) {
        errorMessage = 'Network error - please check your connection';
      } else if (error.message.includes('Database error')) {
        errorMessage = error.message;
      } else {
        errorMessage = `Failed to complete payment: ${error.message}`;
      }

      notify.error(errorMessage);
    }
  };

  // Move a completed order to a different order type (walkin ↔ takeaway ↔ delivery)
  const handleMoveOrderType = async (targetType) => {
    if (!selectedOrder) return;
    try {
      const additionalData = { order_type: targetType };

      // Moving away from delivery: clear delivery fields and subtract delivery charges from total
      if (targetType !== 'delivery' && selectedOrder.order_type === 'delivery') {
        const deliveryCharges = parseFloat(selectedOrder.delivery_charges) || 0;
        additionalData.delivery_address = null;
        additionalData.delivery_charges = 0;
        additionalData.delivery_boy_id = null;
        additionalData.delivery_time = null;
        additionalData.total_amount = Math.max(0, (parseFloat(selectedOrder.total_amount) || 0) - deliveryCharges);
      }

      const result = await cacheManager.updateOrderStatus(
        selectedOrder.id,
        selectedOrder.order_status,
        additionalData
      );
      if (!result.success) throw new Error('Failed to move order');
      // Optimistically update selectedOrder so UI reflects the change immediately
      setSelectedOrder(prev => prev ? { ...prev, ...additionalData } : prev);
      notify.success(`Order moved to ${targetType} successfully!`);
      fetchOrders();
    } catch (err) {
      notify.error(`Failed to move order: ${err.message}`);
    }
  };

  const updateOrderStatus = async (orderId, newStatus, cancelReason = null) => {
    try {
      console.log(`🔄 [Orders] Updating order ${orderId} status to: ${newStatus}`)

      // Build additional data for the update
      const additionalData = {};

      if (cancelReason) {
        additionalData.cancellation_reason = cancelReason;
      }

      // Update modified_by if cashier
      if (userRole === "cashier") {
        const cashier = authManager.getCashier();
        if (cashier) {
          additionalData.modified_by_cashier_id = cashier.id;
        }
      }

      // Use cacheManager for offline-capable status update
      const result = await cacheManager.updateOrderStatus(orderId, newStatus, additionalData);

      if (!result.success) {
        throw new Error('Failed to update order status');
      }

      // ================================================================
      // 🔥 CRITICAL: DEDUCT INVENTORY WHEN ORDER IS COMPLETED
      // ================================================================
      if (newStatus === 'Completed') {
        console.log('🔥 [Orders] Order completed, initiating inventory deduction...')
        console.log('📋 [Orders] Order details:', {
          id: orderId,
          order_number: selectedOrder?.order_number,
          order_type: selectedOrder?.order_type,
          order_type_id: selectedOrder?.order_type_id
        })

        // Get full order details including order_type_id
        let orderToComplete = selectedOrder;
        let orderTypeId = orderToComplete?.order_type_id;

        // If we don't have order_type_id, try to get it
        if (!orderTypeId) {
          console.warn('⚠️ [Orders] order_type_id not found in selectedOrder')

          // STEP 1: Try to fetch from orders table
          try {
            const { data: orderData, error: fetchError } = await supabase
              .from('orders')
              .select('order_type_id, order_type, order_number')
              .eq('id', orderId)
              .single()

            if (!fetchError && orderData) {
              orderToComplete = { ...orderToComplete, ...orderData }
              orderTypeId = orderData.order_type_id

              if (orderTypeId) {
                console.log('✅ [Orders] Fetched order_type_id from orders table:', orderTypeId)
              } else {
                console.warn('⚠️ [Orders] order_type_id still null in database, will lookup from order_types table')
              }
            }
          } catch (fetchErr) {
            console.error('❌ [Orders] Exception fetching from orders table:', fetchErr)
          }

          // STEP 2: If still no order_type_id, lookup from order_types table using order_type string
          if (!orderTypeId && orderToComplete?.order_type) {
            console.log('🔍 [Orders] Looking up order_type_id from order_types table for:', orderToComplete.order_type)
            try {
              const { data: orderTypeData, error: lookupError } = await supabase
                .from('order_types')
                .select('id, name, code')
                .eq('code', orderToComplete.order_type)
                .eq('is_active', true)
                .single()

              if (!lookupError && orderTypeData?.id) {
                orderTypeId = orderTypeData.id
                console.log('✅ [Orders] Looked up order_type_id from order_types:', orderTypeId, 'for code:', orderToComplete.order_type)

                // Update the order with the order_type_id for future use
                await supabase
                  .from('orders')
                  .update({ order_type_id: orderTypeId })
                  .eq('id', orderId)
                console.log('✅ [Orders] Updated order with order_type_id for future use')
              } else {
                console.error('❌ [Orders] Failed to lookup order_type_id:', lookupError)
              }
            } catch (lookupErr) {
              console.error('❌ [Orders] Exception looking up order_type_id:', lookupErr)
            }
          }
        } else {
          console.log('✅ [Orders] Using order_type_id from selectedOrder:', orderTypeId)
        }

        // Call the reliable deduction function
        if (orderTypeId && user?.id) {
          console.log('📦 [Orders] Calling deduct_inventory_for_order with:', {
            order_id: orderId,
            user_id: user.id,
            order_type_id: orderTypeId
          })

          try {
            const { data: deductionResult, error: deductError } = await supabase.rpc(
              'deduct_inventory_for_order',
              {
                p_order_id: orderId,
                p_user_id: user.id,
                p_order_type_id: orderTypeId
              }
            )

            console.log('📦 [Orders] Deduction function returned:', { deductionResult, deductError })

            if (deductError) {
              console.error('❌ [Orders] Inventory deduction database error:', deductError)
              notify.error(`Order completed but inventory deduction failed: ${deductError.message}`, {
                duration: 7000,
              })
            } else if (deductionResult?.success) {
              console.log(`✅ [Orders] Inventory deducted successfully: ${deductionResult.deductions_made} items`)
              notify.success(`Order completed! ${deductionResult.deductions_made} inventory items deducted.`, {
                duration: 4000,
              })
            } else {
              console.warn('⚠️ [Orders] Inventory deduction returned non-success:', deductionResult)
              const errorMsg = deductionResult?.error || 'Inventory may not have been deducted'
              notify.warning(errorMsg, {
                duration: 6000,
              })
            }
          } catch (invError) {
            console.error('❌ [Orders] Exception during inventory deduction:', invError)
            notify.error('Failed to deduct inventory: ' + invError.message, {
              duration: 7000,
            })
          }
        } else {
          console.error('❌ [Orders] Cannot deduct inventory - Missing:', {
            orderTypeId: !!orderTypeId,
            userId: !!user?.id,
            orderType: orderToComplete?.order_type
          })
          notify.error('Cannot deduct inventory: Missing order type or user ID', {
            duration: 6000,
          })
        }
      }
      // ================================================================

      // Log order action only when online (it requires database access)
      if (!result.isOffline) {
        await authManager.logOrderAction(
          orderId,
          `status_changed_to_${newStatus.toLowerCase()}`,
          { from_status: selectedOrder.order_status, to_status: newStatus },
          cancelReason
            ? `Cancelled: ${cancelReason}`
            : `Status changed to ${newStatus}`
        );
      }

      // If order is completed and it's a walkin order with a table, free up the table
      if (newStatus === 'Completed' && selectedOrder?.order_type === 'walkin' && selectedOrder?.table_id) {
        await cacheManager.updateTableStatus(selectedOrder.table_id, 'available');
        console.log(`✅ [Orders] Table ${selectedOrder.table_id} freed after order completion`);
      }

      fetchOrders();
      if (selectedOrder?.id === orderId) {
        setSelectedOrder({
          ...selectedOrder,
          order_status: newStatus,
          cancellation_reason: cancelReason,
        });
        // Only fetch order history when online
        if (!result.isOffline) {
          await fetchOrderHistory(orderId);
        }
      }

    } catch (error) {
      console.error("❌ [Orders] Error updating order status:", error);
      notify.error('Failed to update order status: ' + error.message, {
        duration: 5000,
      })
    }
  };

  const handleCancelOrder = () => {
    setShowCancelModal(true);
    setShowActionMenu(null);
  };

  const confirmCancelOrder = () => {
    const finalReason =
      selectedCancelReason === "Other"
        ? customCancelReason
        : selectedCancelReason;
    if (!finalReason) {
      return;
    }

    updateOrderStatus(selectedOrder.id, "Cancelled", finalReason);
    setShowCancelModal(false);
    setSelectedCancelReason("");
    setCustomCancelReason("");
  };
  const handleReopenOrder = (order) => {
    // Get current user info
    const currentUser = authManager.getCurrentUser();
    const currentCashier = authManager.getCashier();
    const currentRole = authManager.getRole();

    // Prepare order data for reopening
    const orderData = {
      cart: orderItems.map((item, index) => ({
        id: `${item.product_id}-${item.variant_id || "base"}-${Date.now()}-${index}`,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        variantName: item.variant_name,
        basePrice: item.base_price,
        variantPrice: item.variant_price || 0,
        finalPrice: item.final_price,
        quantity: item.quantity,
        totalPrice: item.total_price,
      })),
      customer: order.customers,
      orderInstructions: order.order_instructions || "",
      discount: order.discount_percentage || 0,
      subtotal: order.subtotal,
      discountAmount: order.discount_amount,
      total: order.total_amount,
      orderType: order.order_type,
      existingOrderId: order.id,
      existingOrderNumber: order.order_number,
      isModifying: true,
      // 🆕 Store original payment information
      originalPaymentStatus: order.payment_status,
      originalAmountPaid: order.amount_paid || order.total_amount,
      originalPaymentMethod: order.payment_method,
      // Store original order state for comparison
      originalState: {
        items: orderItems.map((item) => ({
          productName: item.product_name,
          variantName: item.variant_name,
          quantity: item.quantity,
          price: item.final_price,
          totalPrice: item.total_price,
        })),
        subtotal: order.subtotal,
        discountAmount: order.discount_amount,
        total: order.total_amount,
        itemCount: orderItems.length,
      },
    };

    // 🔥 DYNAMIC localStorage keys based on order type
    const orderTypePrefix = order.order_type; // 'walkin', 'takeaway', or 'delivery'

    // Save to localStorage with modification flag
    localStorage.setItem(
      `${orderTypePrefix}_cart`,
      JSON.stringify(orderData.cart)
    );
    localStorage.setItem(
      `${orderTypePrefix}_customer`,
      JSON.stringify(orderData.customer)
    );
    localStorage.setItem(
      `${orderTypePrefix}_instructions`,
      orderData.orderInstructions
    );
    localStorage.setItem(
      `${orderTypePrefix}_discount`,
      orderData.discount.toString()
    );
    localStorage.setItem(`${orderTypePrefix}_modifying_order`, order.id);
    localStorage.setItem(
      `${orderTypePrefix}_modifying_order_number`,
      order.order_number
    );
    localStorage.setItem(
      `${orderTypePrefix}_original_state`,
      JSON.stringify(orderData.originalState)
    );
    // 🆕 Save original payment information for modified order payment calculation
    localStorage.setItem(
      `${orderTypePrefix}_original_payment_status`,
      order.payment_status || 'Pending'
    );
    localStorage.setItem(
      `${orderTypePrefix}_original_amount_paid`,
      (order.amount_paid || order.total_amount || 0).toString()
    );
    localStorage.setItem(
      `${orderTypePrefix}_original_payment_method`,
      order.payment_method || 'Cash'
    );

    // 🔥 FIX: Save delivery-specific data for delivery orders
    if (order.order_type === "delivery") {
      if (order.delivery_charges) {
        localStorage.setItem(
          "delivery_charges",
          order.delivery_charges.toString()
        );
      }
      if (order.delivery_time) {
        // Convert timestamp to HH:MM format for the time input
        const deliveryDate = new Date(order.delivery_time);
        const hours = deliveryDate.getHours().toString().padStart(2, "0");
        const minutes = deliveryDate.getMinutes().toString().padStart(2, "0");
        localStorage.setItem("delivery_time", `${hours}:${minutes}`);
      }
    }

    // 🔥 FIX: Save takeaway-specific data for takeaway orders
    if (order.order_type === "takeaway" && order.takeaway_time) {
      localStorage.setItem("takeaway_time", order.takeaway_time);
    }

    // Get the name of who is reopening
    const reopenedBy =
      currentRole === "cashier" && currentCashier?.name
        ? currentCashier.name
        : "Admin";

    // Log reopening action
    authManager.logOrderAction(
      order.id,
      "reopened",
      { order_number: order.order_number },
      `Order reopened for modification by ${reopenedBy}`
    );

    // Navigate to appropriate page based on order type
    const routes = {
      walkin: "/walkin",
      takeaway: "/takeaway",
      delivery: "/delivery",
    };

    // Dispatch custom event to notify the target page to reload data
    window.dispatchEvent(new CustomEvent('orderReopened', {
      detail: {
        orderType: order.order_type,
        orderId: order.id,
        orderNumber: order.order_number
      }
    }));

    console.log(`🔄 [Orders] Dispatching orderReopened event for ${order.order_type} order ${order.order_number}`);

    router.push(routes[order.order_type] || "/walkin");
  };

  const handlePrintReceipt = async () => {
    if (!selectedOrder) return;

    try {
      setIsPrinting(true);

      if (!user?.id) {
        setIsPrinting(false);
        return;
      }

      printerManager.setUserId(user.id);
      const printer = await printerManager.getPrinterForPrinting();

      if (!printer) {
        setIsPrinting(false);
        return;
      }

      const orderData = {
        orderNumber: selectedOrder.order_number,
        dailySerial: selectedOrder.daily_serial || null,
        orderType: selectedOrder.order_type,
        customer: selectedOrder.customers,
        deliveryAddress: selectedOrder.delivery_address || selectedOrder.customers?.addressline || selectedOrder.customers?.address,
        orderInstructions: selectedOrder.order_instructions,
        specialNotes: selectedOrder.order_instructions,
        total: selectedOrder.total_amount,
        subtotal: selectedOrder.subtotal,
        deliveryCharges: selectedOrder.delivery_charges || 0,
        discountAmount: selectedOrder.discount_amount || 0,
        loyaltyDiscountAmount: loyaltyRedemption?.discount_applied || 0,
        loyaltyPointsRedeemed: loyaltyRedemption?.points_used || 0,
        discountType: "amount",
        tableName: selectedOrder.tables?.table_name || (selectedOrder.tables?.table_number ? `Table ${selectedOrder.tables.table_number}` : '') || '',
        cart: orderItems.map((item) => {
          // DEBUG: Log ALL items to see what we're getting from database
          console.log('🖨️ Receipt - Raw item from DB:', JSON.stringify(item, null, 2));
          console.log('🖨️ Receipt - item.is_deal:', item.is_deal);

          // Handle deal items
          if (item.is_deal) {
            console.log('🖨️ Receipt - Processing deal item:', item);
            console.log('🖨️ Receipt - deal_products field:', item.deal_products);
            console.log('🖨️ Receipt - deal_products type:', typeof item.deal_products);

            let dealProducts = [];
            try {
              if (item.deal_products) {
                // Try to parse if it's a string, otherwise use as-is
                dealProducts = typeof item.deal_products === 'string'
                  ? JSON.parse(item.deal_products)
                  : item.deal_products;
              }
            } catch (e) {
              console.error('❌ Failed to parse deal_products:', e);
            }

            console.log('🖨️ Receipt - Parsed dealProducts:', dealProducts);

            return {
              isDeal: true,
              dealId: item.deal_id,
              dealName: item.product_name,
              dealProducts: dealProducts,
              quantity: item.quantity,
              totalPrice: item.total_price,
              finalPrice: item.final_price,
              itemInstructions: item.item_instructions || null,
            };
          }
          // Handle regular product items
          return {
            isDeal: false,
            productName: item.product_name,
            variantName: item.variant_name,
            quantity: item.quantity,
            totalPrice: item.total_price,
            finalPrice: item.final_price,
            itemInstructions: item.item_instructions || null,
          };
        }),
        paymentMethod: selectedOrder.payment_method || "Cash",
      };

      // Add payment transactions for split payment
      if (selectedOrder.payment_method === 'Split' && paymentTransactions.length > 0) {
        orderData.paymentTransactions = paymentTransactions;
        console.log('✅ Including payment transactions in print data:', paymentTransactions);
      }

      // Get user profile with all fields including hashtags
      const userProfileRaw = JSON.parse(
        localStorage.getItem("user_profile") ||
          localStorage.getItem("user") ||
          "{}"
      );
      const userRaw = JSON.parse(localStorage.getItem("user") || "{}");

      // Get local assets for offline printing
      const localLogo = localStorage.getItem("store_logo_local");
      const localQr = localStorage.getItem("qr_code_local");

      console.log("🔍 Orders Page - Debug localStorage assets:");
      console.log("  - store_logo_local exists:", localLogo ? "YES" : "NO");
      console.log("  - store_logo_local length:", localLogo?.length || 0);
      console.log("  - store_logo_local starts with:", localLogo?.substring(0, 30) || "N/A");
      console.log("  - qr_code_local exists:", localQr ? "YES" : "NO");
      console.log("  - qr_code_local:", localQr || "N/A");
      console.log("  - userProfileRaw.store_logo:", userProfileRaw?.store_logo || "N/A");
      console.log("  - userProfileRaw.qr_code:", userProfileRaw?.qr_code || "N/A");
      console.log("  - userProfileRaw.show_logo_on_receipt:", userProfileRaw?.show_logo_on_receipt);
      console.log("  - userProfileRaw.show_footer_section:", userProfileRaw?.show_footer_section);

      const userProfile = {
        store_name: userProfileRaw?.store_name || userRaw?.store_name || "",
        store_address:
          userProfileRaw?.store_address || userRaw?.store_address || "",
        phone: userProfileRaw?.phone || userRaw?.phone || "",
        // Use local base64/cached logo first, fallback to URL
        store_logo: localLogo || userProfileRaw?.store_logo || userRaw?.store_logo || null,
        // Use local QR first, fallback to URL
        qr_code: localQr || userProfileRaw?.qr_code || userRaw?.qr_code || null,
        hashtag1: userProfileRaw?.hashtag1 || userRaw?.hashtag1 || "",
        hashtag2: userProfileRaw?.hashtag2 || userRaw?.hashtag2 || "",
        // Explicitly check for boolean false, handle string "false" too
        show_footer_section: userProfileRaw?.show_footer_section === false || userProfileRaw?.show_footer_section === "false" ? false : true,
        show_logo_on_receipt: userProfileRaw?.show_logo_on_receipt === false || userProfileRaw?.show_logo_on_receipt === "false" ? false : true,
        show_business_name_on_receipt: userProfileRaw?.show_business_name_on_receipt === false || userProfileRaw?.show_business_name_on_receipt === "false" ? false : true,
        // Add cashier/admin name for receipt printing
        cashier_name: selectedOrder.cashier_id ? selectedOrder.cashiers?.name : null,
        customer_name: !selectedOrder.cashier_id ? selectedOrder.users?.customer_name : null,
      };

      console.log("📦 Orders Page - Final userProfile being sent to printer:");
      console.log("  - store_logo:", userProfile.store_logo ? (userProfile.store_logo.startsWith('data:') ? 'BASE64 (' + userProfile.store_logo.length + ' chars)' : userProfile.store_logo) : "NULL");
      console.log("  - qr_code:", userProfile.qr_code || "NULL");
      console.log("  - show_logo_on_receipt:", userProfile.show_logo_on_receipt);
      console.log("  - show_footer_section:", userProfile.show_footer_section);
      console.log("  - show_business_name_on_receipt:", userProfile.show_business_name_on_receipt);

      const result = await printerManager.printReceipt(
        orderData,
        userProfile,
        printer
      );

      console.log("📬 Orders Page - Print result received:", result);

      if (result.success) {
        console.log("✅ Print successful!");
        // showSuccess('Print Successful', `Receipt printed to ${printer.name}`)
      } else {
        console.error("❌ Print failed:", result.error || result.message);
        throw new Error(result.message || result.error || "Print failed");
      }
    } catch (error) {
      console.error("❌ Print error caught:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintKitchenToken = async () => {
    if (!selectedOrder) return;

    try {
      setIsPrinting(true);

      if (!user?.id) {
        setIsPrinting(false);
        return;
      }

      // Get printer config
      printerManager.setUserId(user.id);
      const printer = await printerManager.getPrinterForPrinting();

      if (!printer) {
        setIsPrinting(false);
        console.error("No printer configured");
        return;
      }

      // Prepare order data for kitchen token
      let mappedItems = orderItems.map((item) => {
        // DEBUG: Log ALL items to see what we're getting from database
        console.log('🍳 Kitchen - Raw item from DB:', JSON.stringify(item, null, 2));
        console.log('🍳 Kitchen - item.is_deal:', item.is_deal);

        // Handle deal items
        if (item.is_deal) {
          console.log('🍳 Kitchen - Processing deal item:', item);
          console.log('🍳 Kitchen - deal_products field:', item.deal_products);
          console.log('🍳 Kitchen - deal_products type:', typeof item.deal_products);

          let dealProducts = [];
          try {
            if (item.deal_products) {
              // Try to parse if it's a string, otherwise use as-is
              dealProducts = typeof item.deal_products === 'string'
                ? JSON.parse(item.deal_products)
                : item.deal_products;
            }
          } catch (e) {
            console.error('❌ Failed to parse deal_products:', e);
          }

          console.log('🍳 Kitchen - Parsed dealProducts:', dealProducts);

          return {
            name: item.product_name,
            quantity: item.quantity,
            notes: item.notes || "",
            isDeal: true,
            dealProducts: dealProducts,
            productId: item.product_id,
            variantId: item.variant_id,
            productName: item.product_name,
            variantName: item.variant_name,
            instructions: item.item_instructions || ''
          };
        }
        // Handle regular items
        return {
          name: item.product_name,
          size: item.variant_name,
          quantity: item.quantity,
          notes: item.notes || "",
          isDeal: false,
          productId: item.product_id,
          variantId: item.variant_id,
          productName: item.product_name,
          variantName: item.variant_name,
          instructions: item.item_instructions || ''
        };
      })

      // 🆕 Check for order changes using order_item_changes table
      if (selectedOrder.id) {
        mappedItems = await getOrderItemsWithChanges(selectedOrder.id, mappedItems)
      }

      const orderData = {
        orderNumber: selectedOrder.order_number,
        dailySerial: selectedOrder.daily_serial || null,
        orderType: selectedOrder.order_type,
        customerName: selectedOrder.customers?.full_name || "",
        customerPhone: selectedOrder.customers?.phone || "",
        totalAmount: selectedOrder.total_amount,
        subtotal: selectedOrder.subtotal,
        deliveryCharges: selectedOrder.delivery_charges || 0,
        discountAmount: selectedOrder.discount_amount || 0,
        specialNotes: selectedOrder.order_instructions || "",
        deliveryAddress: selectedOrder.delivery_address || selectedOrder.customers?.addressline || selectedOrder.customers?.address || "",
        tableName: selectedOrder.tables?.table_name || (selectedOrder.tables?.table_number ? `Table ${selectedOrder.tables.table_number}` : '') || '',
        items: mappedItems,
      };

      // Get user profile
      const userProfileRaw = JSON.parse(
        localStorage.getItem("user_profile") ||
          localStorage.getItem("user") ||
          "{}"
      );
      const userRaw = JSON.parse(localStorage.getItem("user") || "{}");

      const userProfile = {
        store_name: userProfileRaw?.store_name || userRaw?.store_name || "",
        store_address:
          userProfileRaw?.store_address || userRaw?.store_address || "",
        phone: userProfileRaw?.phone || userRaw?.phone || "",
        store_logo: userProfileRaw?.store_logo || userRaw?.store_logo || null,
        // Add cashier/admin name for kitchen token printing
        cashier_name: selectedOrder.cashier_id ? selectedOrder.cashiers?.name : null,
        customer_name: !selectedOrder.cashier_id ? selectedOrder.users?.customer_name : null,
      };

      // Use printerManager to print kitchen token (routes to USB or IP automatically)
      const result = await printerManager.printKitchenToken(
        orderData,
        userProfile,
        printer
      );

      if (!result.success) {
        console.error("Kitchen token print failed:", result.error);
      }
    } catch (error) {
      console.error("Kitchen token print error:", error);
    } finally {
      setIsPrinting(false);
    }
  };

  const getStatusConfig = (status) => {
    const isDark = themeManager.isDark();
    const configs = {
      Pending: {
        bg: isDark ? "bg-yellow-900/20" : "bg-yellow-50",
        border: isDark ? "border-yellow-700/30" : "border-yellow-200",
        text: isDark ? "text-yellow-300" : "text-yellow-700",
        badge: isDark
          ? "bg-yellow-900/30 text-yellow-300"
          : "bg-yellow-100 text-yellow-800",
      },
      Preparing: {
        bg: isDark ? "bg-blue-900/20" : "bg-blue-50",
        border: isDark ? "border-blue-700/30" : "border-blue-200",
        text: isDark ? "text-blue-300" : "text-blue-700",
        badge: isDark
          ? "bg-blue-900/30 text-blue-300"
          : "bg-blue-100 text-blue-800",
      },
      Ready: {
        bg: isDark ? "bg-purple-900/20" : "bg-purple-50",
        border: isDark ? "border-purple-700/30" : "border-purple-200",
        text: isDark ? "text-purple-300" : "text-purple-700",
        badge: isDark
          ? "bg-purple-900/30 text-purple-300"
          : "bg-purple-100 text-purple-800",
      },
      Completed: {
        bg: isDark ? "bg-green-900/20" : "bg-green-50",
        border: isDark ? "border-green-700/30" : "border-green-200",
        text: isDark ? "text-green-300" : "text-green-700",
        badge: isDark
          ? "bg-green-900/30 text-green-300"
          : "bg-green-100 text-green-800",
      },
      Cancelled: {
        bg: isDark ? "bg-red-900/20" : "bg-red-50",
        border: isDark ? "border-red-700/30" : "border-red-200",
        text: isDark ? "text-red-300" : "text-red-700",
        badge: isDark
          ? "bg-red-900/30 text-red-300"
          : "bg-red-100 text-red-800",
      },
    };
    return configs[status] || configs["Pending"];
  };

  const getOrderTypeIcon = (type) => {
    switch (type) {
      case "takeaway":
        return Coffee;
      case "delivery":
        return Truck;
      default:
        return Coffee;
    }
  };

  const getOrderTypeColor = (type) => {
    const isDark = themeManager.isDark();
    switch (type) {
      case "takeaway":
        return isDark
          ? "bg-blue-900/30 text-blue-300"
          : "bg-blue-100 text-blue-600";
      case "delivery":
        return isDark
          ? "bg-orange-900/30 text-orange-300"
          : "bg-orange-100 text-orange-600";
      default:
        return isDark
          ? "bg-emerald-900/30 text-emerald-300"
          : "bg-emerald-100 text-emerald-600";
    }
  };

  const getRoleIcon = (role) => {
    return role === "admin" ? Shield : UserCircle;
  };

  const getRoleColor = (role) => {
    const isDark = themeManager.isDark();
    if (role === "admin") {
      return isDark ? "text-purple-400" : "text-purple-600";
    }
    return isDark ? "text-blue-400" : "text-blue-600";
  };

  const filteredOrders = orders.filter((order) => {
    const customerName = order.customers?.full_name || "";
    const tableName = order.tables?.table_name || "";
    const tableNumber = order.tables?.table_number?.toString() || "";
    const search = searchTerm.toLowerCase();

    const matches = (
      order.order_number.toLowerCase().includes(search) ||
      customerName.toLowerCase().includes(search) ||
      (order.customers?.phone || "").includes(searchTerm) ||
      tableName.toLowerCase().includes(search) ||
      tableNumber.toLowerCase().includes(search)
    );

    // Debug logging
    if (searchTerm && matches) {
      console.log("✅ Match found:", {
        orderNumber: order.order_number,
        tableName,
        tableNumber,
        customerName,
        searchTerm
      });
    }

    return matches;
  });

  const hasMore = orders.length < totalAvailable;
  const themeClasses = themeManager.getClasses();
  const isDark = themeManager.isDark();

  return (
    <ProtectedPage permissionKey="ORDERS" pageName="Orders">
      <div
        className={`h-screen flex ${themeClasses.background} overflow-hidden text-sm transition-all duration-500`}
      >
      <div
        className={`w-80 ${themeClasses.card} shadow-lg ${themeClasses.border} border-r flex flex-col`}
      >
        <div className="p-2 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between mb-2">
            <motion.button
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push("/dashboard")}
              className="flex items-center text-white/90 hover:text-white transition-all text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="font-medium">Dashboard</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
            >
              <AnimatePresence mode="wait">
                {isDark ? (
                  <motion.div
                    key="sun"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Sun className="w-4 h-4 text-yellow-300" />
                  </motion.div>
                ) : (
                  <motion.div
                    key="moon"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <Moon className="w-4 h-4 text-white/90" />
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.button>
          </div>

          <div className="mb-2">
            <h1 className="text-base font-bold text-white">Orders Management</h1>
            <p className="text-purple-100 text-xs">Track and manage orders</p>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <input
              type="text"
              placeholder="Search orders..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm bg-white/90 border border-white/20 rounded-lg focus:ring-1 focus:ring-white/30 text-gray-800"
            />
          </div>
        </div>

        <div
          className={`p-2 ${isDark ? "bg-gray-800" : "bg-gray-50"} ${
            themeClasses.border
          } border-b`}
        >
          <div
            className={`flex space-x-1 mb-2 ${themeClasses.card} rounded-lg p-1`}
          >
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-1 flex items-center justify-center py-1.5 px-2 rounded-md text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? "bg-purple-600 text-white shadow-sm"
                    : `${themeClasses.textSecondary} hover:${themeClasses.textPrimary}`
                }`}
              >
                <tab.icon className="w-3 h-3 mr-1" />
                {tab.label}
              </button>
            ))}
          </div>

          <div className="space-y-1">
            {/* First row: Status, Date From, Date To */}
            <div className="grid grid-cols-3 gap-1">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className={`text-xs ${themeClasses.border} border rounded px-2 py-1 ${themeClasses.card} ${themeClasses.textPrimary}`}
              >
                {statusOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>

              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className={`text-xs ${themeClasses.border} border rounded px-1 py-1 ${themeClasses.card} ${themeClasses.textPrimary}`}
              />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className={`text-xs ${themeClasses.border} border rounded px-1 py-1 ${themeClasses.card} ${themeClasses.textPrimary}`}
              />
            </div>

            {/* Second row: Cashier, Delivery Boy + rider summary toggle */}
            <div className="grid grid-cols-2 gap-1">
              <select
                value={cashierFilter}
                onChange={(e) => setCashierFilter(e.target.value)}
                className={`text-xs ${themeClasses.border} border rounded px-2 py-1 ${themeClasses.card} ${themeClasses.textPrimary}`}
              >
                <option value="All">All Cashiers</option>
                {cashiersList.map((cashier) => (
                  <option key={cashier.id} value={cashier.id}>
                    {cashier.name} {cashier.type === 'user' ? '(Admin)' : ''}
                  </option>
                ))}
              </select>

              <div className="flex gap-1">
                <select
                  value={deliveryBoyFilter}
                  onChange={(e) => setDeliveryBoyFilter(e.target.value)}
                  className={`flex-1 min-w-0 text-xs ${themeClasses.border} border rounded px-2 py-1 ${themeClasses.card} ${themeClasses.textPrimary}`}
                >
                  <option value="All">All Riders</option>
                  {deliveryBoysList.map((boy) => (
                    <option key={boy.id} value={boy.id}>
                      {boy.name}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => setShowRiderSummary(p => !p)}
                  title="Rider summary"
                  className={`flex-shrink-0 px-1.5 rounded border transition-all ${
                    showRiderSummary
                      ? 'bg-purple-600 text-white border-purple-600'
                      : `${themeClasses.border} ${themeClasses.card} ${themeClasses.textSecondary} hover:border-purple-400`
                  }`}
                >
                  <BarChart2 className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Rider Summary Panel */}
            {showRiderSummary && (() => {
              const riderStats = Object.values(
                orders
                  .filter(o => o.order_type === 'delivery' && o.delivery_boy_id)
                  .reduce((acc, o) => {
                    const id = o.delivery_boy_id
                    const name = o.delivery_boys?.name || 'Unknown'
                    if (!acc[id]) acc[id] = { name, count: 0, total: 0 }
                    acc[id].count++
                    acc[id].total += (o.total_amount || 0)
                    return acc
                  }, {})
              ).sort((a, b) => b.total - a.total)

              if (riderStats.length === 0) return (
                <div className={`mt-1 rounded-lg border p-2 text-center text-xs ${themeClasses.border} ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                  No delivery orders in current view
                </div>
              )

              return (
                <div className={`mt-1 rounded-lg border overflow-hidden ${themeClasses.border}`}>
                  <div className={`px-2 py-1 flex items-center justify-between ${isDark ? 'bg-purple-900/30' : 'bg-purple-50'}`}>
                    <span className={`text-[10px] font-semibold uppercase tracking-wide ${isDark ? 'text-purple-300' : 'text-purple-700'}`}>
                      <Truck className="inline w-2.5 h-2.5 mr-1" />Rider Summary
                    </span>
                    <span className={`text-[10px] ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>
                      {riderStats.reduce((s, r) => s + r.count, 0)} orders
                    </span>
                  </div>
                  {riderStats.map((r, i) => (
                    <div
                      key={i}
                      onClick={() => {
                        const found = deliveryBoysList.find(b => b.name === r.name)
                        if (found) setDeliveryBoyFilter(found.id)
                      }}
                      className={`flex items-center justify-between px-2 py-1 cursor-pointer border-t transition-colors ${themeClasses.border} ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'}`}
                    >
                      <span className={`text-xs font-medium truncate flex-1 ${themeClasses.textPrimary}`}>{r.name}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                          {r.count} {r.count === 1 ? 'order' : 'orders'}
                        </span>
                        <span className={`text-xs font-semibold ${isDark ? 'text-green-400' : 'text-green-600'}`}>
                          Rs {r.total.toFixed(0)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>

        <div
          className={`px-3 py-1 ${isDark ? "bg-gray-700/50" : "bg-gray-100"} ${
            themeClasses.border
          } border-b`}
        >
          <p className={`text-xs font-semibold ${themeClasses.textPrimary}`}>
            Showing {filteredOrders.length} of {totalAvailable} orders
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-1 space-y-1">
              {[...Array(8)].map((_, i) => (
                <OrderSkeleton key={i} isDark={isDark} />
              ))}
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-center py-8 px-4">
              <FileText
                className={`w-8 h-8 ${themeClasses.textSecondary} mx-auto mb-2`}
              />
              <h3
                className={`text-sm font-semibold ${themeClasses.textSecondary} mb-1`}
              >
                No orders found
              </h3>
              <p className={`${themeClasses.textSecondary} text-xs`}>
                Try adjusting filters
              </p>
            </div>
          ) : (
            <>
              <div className="p-1 space-y-1">
                {filteredOrders.map((order) => {
                  const OrderIcon = getOrderTypeIcon(order.order_type);
                  const statusConfig = getStatusConfig(order.order_status);
                  return (
                    <motion.div
                      key={order.id}
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      onClick={() => handleOrderSelect(order)}
                      className={`p-2 rounded-lg cursor-pointer transition-all ${
                        themeClasses.border
                      } border ${
                        selectedOrder?.id === order.id
                          ? `bg-purple-50 border-purple-200 shadow-md ${
                              isDark
                                ? "bg-purple-900/20 border-purple-700/30"
                                : ""
                            }`
                          : `${themeClasses.card} hover:${themeClasses.shadow} hover:shadow-sm`
                      }`}
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center">
                          <div
                            className={`w-6 h-6 rounded-md flex items-center justify-center mr-2 ${getOrderTypeColor(
                              order.order_type
                            )}`}
                          >
                            <OrderIcon className="w-3 h-3" />
                          </div>
                          <div>
                            <h3
                              className={`font-bold ${themeClasses.textPrimary} text-sm`}
                            >
                              {order.daily_serial ? `${dailySerialManager.formatSerial(order.daily_serial)} ` : ''}#{order.order_number}
                            </h3>
                            <p
                              className={`text-xs ${themeClasses.textSecondary} capitalize`}
                            >
                              {order.order_type}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p
                            className={`font-bold ${themeClasses.textPrimary} text-sm`}
                          >
                            Rs {order.total_amount}
                          </p>
                          <p
                            className={`text-xs ${themeClasses.textSecondary}`}
                          >
                            {order.order_time}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center min-w-0 flex-1">
                          {order.customers ? (
                            <div
                              className={`text-xs ${themeClasses.textPrimary} font-medium truncate`}
                            >
                              {order.customers.full_name || "Guest"}
                            </div>
                          ) : (
                            <div
                              className={`text-xs ${themeClasses.textSecondary}`}
                            >
                              Walk-in
                            </div>
                          )}
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusConfig.badge}`}
                        >
                          {order.order_status}
                        </span>
                      </div>

                      {/* Show table info for walkin orders */}
                      {order.order_type === 'walkin' && order.tables && (
                        <div className={`flex items-center gap-1 mt-1.5 pt-1.5 border-t ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                          <Table2 className={`w-3 h-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                          <span className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'} font-medium`}>
                            {order.tables.table_name || `Table ${order.tables.table_number}`}
                          </span>
                        </div>
                      )}

                      {/* Show original source badge for web orders */}
                      {order.original_order_source && order.original_order_source !== 'POS' && (
                        <div className={`flex items-center gap-1 mt-1.5 ${order.order_type === 'walkin' && order.tables ? '' : 'pt-1.5 border-t'} ${isDark ? 'border-gray-600' : 'border-gray-200'}`}>
                          <Globe className={`w-3 h-3 ${isDark ? 'text-purple-400' : 'text-purple-600'}`} />
                          <span className={`text-xs ${isDark ? 'text-purple-400' : 'text-purple-600'} font-medium`}>
                            Originally from {order.original_order_source}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  );
                })}
              </div>

              {hasMore && (
                <div className="p-3">
                  <motion.button
                    whileHover={{ scale: loadingMore ? 1 : 1.02 }}
                    whileTap={{ scale: loadingMore ? 1 : 0.98 }}
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className={`w-full py-2 px-4 rounded-lg font-medium text-sm transition-all shadow-md ${
                      loadingMore
                        ? "bg-gray-400 cursor-not-allowed"
                        : isDark
                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                        : "bg-purple-500 hover:bg-purple-600 text-white"
                    }`}
                  >
                    {loadingMore ? (
                      <span className="flex items-center justify-center">
                        <svg
                          className="animate-spin -ml-1 mr-3 h-4 w-4 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Loading...
                      </span>
                    ) : (
                      `Load 100 More (${totalAvailable - orders.length} remaining)`
                    )}
                  </motion.button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className={`flex-1 flex flex-col ${themeClasses.card}`}>
        {!loading && selectedOrder ? (
          <>
            {/* Show payment view if payment is pending and user clicked complete */}
            {showPaymentView && selectedOrder.payment_status === 'Pending' ? (
              <InlinePaymentSection
                order={selectedOrder}
                onPaymentComplete={handlePaymentComplete}
                onCancel={() => setShowPaymentView(false)}
                classes={themeClasses}
                isDark={theme === 'dark'}
              />
            ) : (
            <>
            <div className={`p-6 ${themeClasses.border} border-b`}>
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex items-center space-x-4">
                  <div
                    className={`w-12 h-12 rounded-xl ${
                      getStatusConfig(selectedOrder.order_status).bg
                    } ${
                      getStatusConfig(selectedOrder.order_status).border
                    } border-2 flex items-center justify-center`}
                  >
                    <FileText
                      className={`w-6 h-6 ${
                        getStatusConfig(selectedOrder.order_status).text
                      }`}
                    />
                  </div>
                  <div>
                    <div className="flex items-center space-x-3 mb-1">
                      <h2
                        className={`text-2xl font-bold ${themeClasses.textPrimary}`}
                      >
                        {selectedOrder.daily_serial ? `${dailySerialManager.formatSerial(selectedOrder.daily_serial)} - ` : ''}#{selectedOrder.order_number}
                      </h2>
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-semibold ${
                          getStatusConfig(selectedOrder.order_status).badge
                        }`}
                      >
                        {selectedOrder.order_status}
                      </span>
                    </div>
                    <div className="flex items-center space-x-4 text-sm">
                      <span
                        className={`flex items-center ${themeClasses.textSecondary}`}
                      >
                        <Calendar className="w-4 h-4 mr-1" />
                        {new Date(
                          selectedOrder.order_date
                        ).toLocaleDateString()}{" "}
                        at {selectedOrder.order_time}
                      </span>
                      <span
                        className={`flex items-center ${themeClasses.textSecondary} capitalize`}
                      >
                        <Package className="w-4 h-4 mr-1" />
                        {selectedOrder.order_type} Order
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Print Receipt Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePrintReceipt}
                    disabled={isPrinting}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-blue-500 hover:bg-blue-600 disabled:bg-gray-400 text-white rounded-lg transition-all font-medium text-sm"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    <span>{isPrinting ? "Printing..." : "Print"}</span>
                  </motion.button>

                  {/* Print Kitchen Token Button */}
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handlePrintKitchenToken}
                    disabled={isPrinting}
                    className="flex items-center space-x-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 disabled:bg-gray-400 text-white rounded-lg transition-all font-medium text-sm"
                  >
                    <Package className="w-3.5 h-3.5" />
                    <span>{isPrinting ? "Printing..." : "Print Token"}</span>
                  </motion.button>

                  {/* Status Change Buttons */}
                  {selectedOrder.order_status === "Pending" && (
                    <>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() =>
                          updateOrderStatus(selectedOrder.id, "Preparing")
                        }
                        className="flex items-center space-x-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all font-medium text-sm"
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Start Preparing</span>
                      </motion.button>
                      {permissions.hasPermission('COMPLETE_ORDER') && (
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            // Check if payment is pending/unpaid
                            // BUT: If payment_method is 'Account', complete directly (customer ledger, no payment needed)
                            const needsPayment = selectedOrder.payment_status === 'Pending' && selectedOrder.payment_method !== 'Account';

                            if (needsPayment) {
                              setShowPaymentView(true);
                            } else {
                              updateOrderStatus(selectedOrder.id, "Completed");
                            }
                          }}
                          className="flex items-center space-x-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all font-medium text-sm"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          <span>Complete</span>
                        </motion.button>
                      )}
                    </>
                  )}

                  {selectedOrder.order_status === "Preparing" && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        updateOrderStatus(selectedOrder.id, "Ready")
                      }
                      className="flex items-center space-x-1.5 px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg transition-all font-medium text-sm"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Mark Ready</span>
                    </motion.button>
                  )}

                  {(selectedOrder.order_status === "Ready" ||
                    selectedOrder.order_status === "Preparing" ||
                    selectedOrder.order_status === "Dispatched") &&
                    permissions.hasPermission('COMPLETE_ORDER') && (
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        // Check if payment is pending/unpaid
                        // BUT: If payment_method is 'Account', complete directly (customer ledger, no payment needed)
                        const needsPayment = selectedOrder.payment_status === 'Pending' && selectedOrder.payment_method !== 'Account';

                        if (needsPayment) {
                          setShowPaymentView(true);
                        } else {
                          updateOrderStatus(selectedOrder.id, "Completed");
                        }
                      }}
                      className="flex items-center space-x-1.5 px-3 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-all font-medium text-sm"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>Complete</span>
                    </motion.button>
                  )}

                  {/* Order type conversion buttons — only for Completed orders */}
                  {selectedOrder.order_status === 'Completed' && (
                    <>
                      {/* Walkin order: move to Takeaway or Delivery */}
                      {selectedOrder.order_type === 'walkin' && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowConvertToTakeawayModal(true)}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Coffee className="w-3.5 h-3.5" />
                            <span>Move to Takeaway</span>
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowConvertToDeliveryModal(true)}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Move to Delivery</span>
                          </motion.button>
                        </>
                      )}

                      {/* Takeaway order: move to Walkin or Delivery */}
                      {selectedOrder.order_type === 'takeaway' && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleMoveOrderType('walkin')}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Table2 className="w-3.5 h-3.5" />
                            <span>Move to Walkin</span>
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowConvertToDeliveryModal(true)}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Truck className="w-3.5 h-3.5" />
                            <span>Move to Delivery</span>
                          </motion.button>
                        </>
                      )}

                      {/* Delivery order: move to Walkin or Takeaway */}
                      {selectedOrder.order_type === 'delivery' && (
                        <>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => handleMoveOrderType('walkin')}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Table2 className="w-3.5 h-3.5" />
                            <span>Move to Walkin</span>
                          </motion.button>
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => setShowConvertToTakeawayModal(true)}
                            className="flex items-center space-x-1.5 px-3 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-all font-medium text-sm"
                          >
                            <Coffee className="w-3.5 h-3.5" />
                            <span>Move to Takeaway</span>
                          </motion.button>
                        </>
                      )}
                    </>
                  )}

                  {/* Actions Menu */}
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() =>
                        setShowActionMenu(
                          showActionMenu === selectedOrder.id
                            ? null
                            : selectedOrder.id
                        )
                      }
                      className={`p-2 ${themeClasses.button} rounded-lg transition-colors border ${themeClasses.border}`}
                    >
                      <MoreVertical className="w-4 h-4" />
                    </motion.button>

                    <AnimatePresence>
                      {showActionMenu === selectedOrder.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.95, y: -10 }}
                          animate={{ opacity: 1, scale: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.95, y: -10 }}
                          className={`absolute right-0 top-full mt-2 w-48 ${themeClasses.card} rounded-xl ${themeClasses.shadow} shadow-xl ${themeClasses.border} border py-2 z-50`}
                        >
                          {permissions.hasPermission('REOPEN_ORDER') && (
                            <button
                              onClick={() => handleReopenOrder(selectedOrder)}
                              className={`w-full px-4 py-2 text-left hover:${
                                isDark ? "bg-gray-700" : "bg-gray-50"
                              } flex items-center space-x-3 text-sm ${
                                themeClasses.textPrimary
                              } transition-colors`}
                            >
                              <Edit3 className="w-4 h-4 text-purple-500" />
                              <span>Re-Open Order</span>
                            </button>
                          )}
                          {permissions.hasPermission('CANCEL_ORDER') &&
                            selectedOrder.order_status !== "Cancelled" &&
                            selectedOrder.order_status !== "Completed" && (
                              <button
                                onClick={handleCancelOrder}
                                className={`w-full px-4 py-2 text-left hover:${
                                  isDark ? "bg-gray-700" : "bg-gray-50"
                                } flex items-center space-x-3 text-sm text-red-600 transition-colors`}
                              >
                                <XCircle className="w-4 h-4" />
                                <span>Cancel Order</span>
                              </button>
                            )}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Order Summary Cards */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                <div
                  className={`${themeClasses.card} rounded-lg p-3 ${themeClasses.border} border`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                      {selectedOrder.cashiers ? (
                        getRoleIcon("cashier") === UserCircle ? (
                          <UserCircle className="w-4 h-4 text-blue-600" />
                        ) : (
                          <User className="w-4 h-4 text-blue-600" />
                        )
                      ) : (
                        <Shield className="w-4 h-4 text-purple-600" />
                      )}
                    </div>
                    <div>
                      <p
                        className={`text-[10px] ${themeClasses.textSecondary} font-medium`}
                      >
                        {selectedOrder.cashier_id ? "Cashier" : "Created By"}
                      </p>
                      <p
                        className={`text-sm font-semibold ${themeClasses.textPrimary}`}
                      >
                        {selectedOrder.cashier_id
                          ? (selectedOrder.cashiers?.name || "Cashier")
                          : (selectedOrder.users?.customer_name || "Admin")}
                      </p>
                      {selectedOrder.modified_cashier && (
                        <p
                          className={`text-[10px] ${
                            isDark ? "text-orange-400" : "text-orange-600"
                          }`}
                        >
                          Modified by: {selectedOrder.modified_cashier.name}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div
                  className={`${themeClasses.card} rounded-lg p-3 ${themeClasses.border} border`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                      <DollarSign className="w-4 h-4 text-green-600" />
                    </div>
                    <div>
                      <p
                        className={`text-[10px] ${themeClasses.textSecondary} font-medium`}
                      >
                        Total Amount
                      </p>
                      <p
                        className={`text-base font-bold ${themeClasses.textPrimary}`}
                      >
                        Rs {selectedOrder.total_amount}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`${themeClasses.card} rounded-lg p-3 ${themeClasses.border} border`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-purple-600" />
                    </div>
                    <div>
                      <p
                        className={`text-[10px] ${themeClasses.textSecondary} font-medium`}
                      >
                        Payment
                      </p>
                      <p
                        className={`text-sm font-semibold ${themeClasses.textPrimary}`}
                      >
                        {selectedOrder.payment_method || "Cash"}
                      </p>
                      <p
                        className={`text-[10px] ${
                          selectedOrder.payment_status === "Paid"
                            ? "text-green-600"
                            : "text-orange-600"
                        }`}
                      >
                        {selectedOrder.payment_status || "Paid"}
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`${themeClasses.card} rounded-lg p-3 ${themeClasses.border} border`}
                >
                  <div className="flex items-center space-x-2">
                    <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                      <Package className="w-4 h-4 text-orange-600" />
                    </div>
                    <div>
                      <p
                        className={`text-[10px] ${themeClasses.textSecondary} font-medium`}
                      >
                        Items
                      </p>
                      <p
                        className={`text-sm font-semibold ${themeClasses.textPrimary}`}
                      >
                        {orderItems.length} items
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3
                      className={`text-xl font-bold ${themeClasses.textPrimary}`}
                    >
                      Order Items
                    </h3>
                    <span
                      className={`px-3 py-1 rounded-full text-sm font-medium ${
                        themeClasses.textSecondary
                      } ${isDark ? "bg-gray-700" : "bg-gray-100"}`}
                    >
                      {orderItems.length} items
                    </span>
                  </div>

                  <div className="space-y-3">
                    {orderItems.map((item, index) => {
                      // Parse deal products if this is a deal
                      let dealProducts = [];
                      if (item.is_deal && item.deal_products) {
                        try {
                          dealProducts = typeof item.deal_products === 'string'
                            ? JSON.parse(item.deal_products)
                            : item.deal_products;
                        } catch (e) {
                          console.error('Failed to parse deal_products:', e);
                        }
                      }

                      return (
                        <motion.div
                          key={index}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.1 }}
                          className={`${themeClasses.card} rounded-xl p-4 ${themeClasses.border} border hover:${themeClasses.shadow} hover:shadow-lg transition-all`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-4">
                              <div className={`w-12 h-12 bg-gradient-to-br ${item.is_deal ? 'from-orange-500 to-red-500' : 'from-purple-500 to-blue-500'} rounded-xl flex items-center justify-center`}>
                                {item.is_deal ? (
                                  <Gift className="w-6 h-6 text-white" />
                                ) : (
                                  <span className="text-white font-bold text-lg">
                                    {item.product_name.charAt(0)}
                                  </span>
                                )}
                              </div>
                              <div className="flex-1">
                                {item.is_deal && (
                                  <div className="flex items-center space-x-1 mb-1">
                                    <Gift className="w-3 h-3 text-orange-500" />
                                    <span className="text-xs font-bold text-orange-500 uppercase">DEAL</span>
                                  </div>
                                )}
                                <h4
                                  className={`font-semibold ${themeClasses.textPrimary}`}
                                >
                                  {item.product_name}
                                </h4>
                                {item.variant_name && !item.is_deal && (
                                  <p className="text-purple-600 text-sm font-medium">
                                    Size: {item.variant_name}
                                  </p>
                                )}
                                {/* Display deal products breakdown */}
                                {item.is_deal && dealProducts.length > 0 && (
                                  <div className="mt-1 space-y-0.5">
                                    {dealProducts.map((dp, dpIndex) => {
                                      const flavorName = dp.variant ||
                                        (dp.flavor ?
                                          (typeof dp.flavor === 'object' ? dp.flavor.name || dp.flavor.flavor_name : dp.flavor)
                                          : null);
                                      return (
                                        <p key={dpIndex} className={`text-xs ${themeClasses.textSecondary}`}>
                                          • {dp.quantity}x {dp.name}
                                          {flavorName && (
                                            <span className="ml-1 text-green-600 font-semibold">
                                              ({flavorName}
                                              {dp.priceAdjustment > 0 && ` +Rs ${dp.priceAdjustment}`})
                                            </span>
                                          )}
                                        </p>
                                      );
                                    })}
                                  </div>
                                )}
                                <p
                                  className={`text-sm ${themeClasses.textSecondary} mt-1`}
                                >
                                  Qty: {item.quantity} × Rs {item.final_price}{" "}
                                  each
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p
                                className={`font-bold text-lg ${themeClasses.textPrimary}`}
                              >
                                Rs {item.total_price.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-4">
                  {selectedOrder.customers && (
                    <div
                      className={`${
                        isDark
                          ? "bg-blue-900/20 border-blue-700/30"
                          : "bg-blue-50 border-blue-200"
                      } rounded-xl p-4 border`}
                    >
                      <h4
                        className={`font-semibold ${
                          isDark ? "text-blue-300" : "text-blue-900"
                        } mb-3 flex items-center`}
                      >
                        <User className="w-5 h-5 mr-2" />
                        Customer Information
                      </h4>
                      <div className="space-y-2">
                        <p
                          className={`${
                            isDark ? "text-blue-200" : "text-blue-800"
                          } font-semibold`}
                        >
                          {selectedOrder.customers.full_name || "Guest"}
                        </p>
                        {selectedOrder.customers.phone && (
                          <p
                            className={`${
                              isDark ? "text-blue-300" : "text-blue-700"
                            } flex items-center`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            {selectedOrder.customers.phone}
                          </p>
                        )}
                        {selectedOrder.customers.email && (
                          <p
                            className={`${
                              isDark ? "text-blue-300" : "text-blue-700"
                            } text-sm`}
                          >
                            {selectedOrder.customers.email}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedOrder.order_type === "delivery" && selectedOrder.delivery_boys && (
                    <div
                      className={`${
                        isDark
                          ? "bg-cyan-900/20 border-cyan-700/30"
                          : "bg-cyan-50 border-cyan-200"
                      } rounded-xl p-4 border`}
                    >
                      <h4
                        className={`font-semibold ${
                          isDark ? "text-cyan-300" : "text-cyan-900"
                        } mb-3 flex items-center`}
                      >
                        <Truck className="w-5 h-5 mr-2" />
                        Delivery Boy
                      </h4>
                      <div className="space-y-2">
                        <p
                          className={`${
                            isDark ? "text-cyan-200" : "text-cyan-800"
                          } font-semibold`}
                        >
                          {selectedOrder.delivery_boys.name}
                        </p>
                        {selectedOrder.delivery_boys.phone && (
                          <p
                            className={`${
                              isDark ? "text-cyan-300" : "text-cyan-700"
                            } flex items-center text-sm`}
                          >
                            <Phone className="w-4 h-4 mr-2" />
                            {selectedOrder.delivery_boys.phone}
                          </p>
                        )}
                        {selectedOrder.delivery_boys.vehicle_type && (
                          <p
                            className={`${
                              isDark ? "text-cyan-300" : "text-cyan-700"
                            } text-sm capitalize`}
                          >
                            Vehicle: {selectedOrder.delivery_boys.vehicle_type}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {selectedOrder.order_instructions && (
                    <div
                      className={`${
                        isDark
                          ? "bg-orange-900/20 border-orange-700/30"
                          : "bg-orange-50 border-orange-200"
                      } rounded-xl p-4 border`}
                    >
                      <h4
                        className={`font-semibold ${
                          isDark ? "text-orange-300" : "text-orange-900"
                        } mb-3 flex items-center`}
                      >
                        <FileText className="w-5 h-5 mr-2" />
                        Special Instructions
                      </h4>
                      <p
                        className={`${
                          isDark ? "text-orange-200" : "text-orange-800"
                        }`}
                      >
                        {selectedOrder.order_instructions}
                      </p>
                    </div>
                  )}

                  {selectedOrder.order_status === "Cancelled" &&
                    selectedOrder.cancellation_reason && (
                      <div
                        className={`${
                          isDark
                            ? "bg-red-900/20 border-red-700/30"
                            : "bg-red-50 border-red-200"
                        } rounded-xl p-4 border`}
                      >
                        <h4
                          className={`font-semibold ${
                            isDark ? "text-red-300" : "text-red-900"
                          } mb-3 flex items-center`}
                        >
                          <AlertTriangle className="w-5 h-5 mr-2" />
                          Cancellation Reason
                        </h4>
                        <p
                          className={`${
                            isDark ? "text-red-200" : "text-red-800"
                          }`}
                        >
                          {selectedOrder.cancellation_reason}
                        </p>
                      </div>
                    )}

                  <div
                    className={`${
                      isDark
                        ? "bg-green-900/20 border-green-700/30"
                        : "bg-green-50 border-green-200"
                    } rounded-xl p-4 border`}
                  >
                    <h4
                      className={`font-semibold ${
                        isDark ? "text-green-300" : "text-green-900"
                      } mb-3`}
                    >
                      Payment Summary
                    </h4>
                    <div className="space-y-2">
                      <div
                        className={`flex justify-between ${
                          isDark ? "text-green-200" : "text-green-800"
                        }`}
                      >
                        <span>Subtotal:</span>
                        <span>
                          Rs{" "}
                          {parseFloat(selectedOrder.subtotal || 0).toFixed(2)}
                        </span>
                      </div>
                      {selectedOrder.discount_amount > 0 && (
                        <div
                          className={`flex justify-between ${
                            isDark ? "text-green-300" : "text-green-700"
                          }`}
                        >
                          <span>
                            Discount ({selectedOrder.discount_percentage}%):
                          </span>
                          <span>
                            -Rs{" "}
                            {parseFloat(
                              selectedOrder.discount_amount || 0
                            ).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {loyaltyRedemption && loyaltyRedemption.discount_applied > 0 && (
                        <div
                          className={`flex justify-between ${
                            isDark ? "text-purple-400" : "text-purple-600"
                          }`}
                        >
                          <span>
                            Loyalty ({loyaltyRedemption.points_used} pts):
                          </span>
                          <span>
                            -Rs{" "}
                            {parseFloat(loyaltyRedemption.discount_applied || 0).toFixed(2)}
                          </span>
                        </div>
                      )}
                      {selectedOrder.order_type === "delivery" &&
                        parseFloat(selectedOrder.delivery_charges || 0) > 0 && (
                          <div
                            className={`flex justify-between ${
                              isDark ? "text-blue-400" : "text-blue-600"
                            }`}
                          >
                            <span>Delivery Charges:</span>
                            <span>
                              +Rs{" "}
                              {parseFloat(
                                selectedOrder.delivery_charges || 0
                              ).toFixed(2)}
                            </span>
                          </div>
                        )}
                      <div
                        className={`flex justify-between ${
                          isDark ? "text-green-200" : "text-green-900"
                        } font-bold text-lg ${
                          isDark ? "border-green-700/30" : "border-green-200"
                        } border-t pt-2`}
                      >
                        <span>Total:</span>
                        <span>
                          Rs{" "}
                          {(
                            parseFloat(selectedOrder.subtotal || 0) -
                            parseFloat(selectedOrder.discount_amount || 0) -
                            parseFloat(loyaltyRedemption?.discount_applied || 0) +
                            parseFloat(selectedOrder.delivery_charges || 0)
                          ).toFixed(2)}
                        </span>
                      </div>

                      {/* Split Payment Details */}
                      {selectedOrder.payment_method === 'Split' && paymentTransactions.length > 0 && (
                        <div className={`pt-3 mt-3 border-t ${isDark ? "border-green-700/30" : "border-green-200"}`}>
                          <div className="flex items-center gap-2 mb-2">
                            <CreditCard className={`w-4 h-4 ${isDark ? "text-blue-400" : "text-blue-600"}`} />
                            <span className={`text-sm font-semibold ${isDark ? "text-blue-400" : "text-blue-600"}`}>
                              Split Payment Breakdown:
                            </span>
                          </div>
                          <div className="space-y-1.5 pl-6">
                            {paymentTransactions.map((transaction, idx) => (
                              <div key={transaction.id || idx} className="flex justify-between">
                                <span className={`text-sm ${isDark ? "text-gray-400" : "text-gray-600"}`}>
                                  {transaction.payment_method}:
                                </span>
                                <span className={`text-sm font-semibold ${isDark ? "text-green-300" : "text-green-700"}`}>
                                  Rs {parseFloat(transaction.amount).toFixed(2)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  {/* Order History Section - Compact with View History Button */}
                  <div
                    className={`${
                      isDark
                        ? "bg-purple-900/20 border-purple-700/30"
                        : "bg-purple-50 border-purple-200"
                    } rounded-xl p-3 border mt-4`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div
                          className={`w-7 h-7 rounded-full ${
                            isDark ? "bg-purple-800/30" : "bg-purple-100"
                          } flex items-center justify-center`}
                        >
                          <History
                            className={`w-4 h-4 ${
                              isDark ? "text-purple-400" : "text-purple-600"
                            }`}
                          />
                        </div>
                        <div>
                          <h4
                            className={`text-xs font-semibold ${
                              isDark ? "text-purple-300" : "text-purple-900"
                            }`}
                          >
                            Order History & Changes
                          </h4>
                          <p
                            className={`text-[10px] ${
                              isDark ? "text-purple-400" : "text-purple-600"
                            }`}
                          >
                            {orderHistory.length === 0
                              ? "No changes recorded yet"
                              : `${orderHistory.length} ${
                                  orderHistory.length === 1 ? "event" : "events"
                                } recorded`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => setShowHistoryModal(true)}
                        className={`px-2.5 py-1 rounded-lg font-medium text-[10px] flex items-center space-x-1 transition-all ${
                          isDark
                            ? "bg-purple-600 hover:bg-purple-700 text-white"
                            : "bg-purple-500 hover:bg-purple-600 text-white"
                        } shadow-sm hover:shadow-md`}
                      >
                        <Eye className="w-3 h-3" />
                        <span>View History</span>
                      </button>
                    </div>
                  </div>

                  {/* Loyalty Points Section - Compact */}
                  <div
                    className={`${
                      isDark
                        ? "bg-indigo-900/20 border-indigo-700/30"
                        : "bg-indigo-50 border-indigo-200"
                    } rounded-xl p-3 border mt-3`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                          isDark ? "bg-indigo-600/20" : "bg-indigo-100"
                        }`}>
                          <Award className={`w-4 h-4 ${
                            isDark ? "text-indigo-400" : "text-indigo-600"
                          }`} />
                        </div>
                        <h4
                          className={`text-xs font-semibold ${
                            isDark ? "text-indigo-300" : "text-indigo-900"
                          }`}
                        >
                          Loyalty Points
                        </h4>
                      </div>
                      {orderLoyaltyPoints.length > 0 && (
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${
                            isDark
                              ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/40"
                              : "bg-indigo-600 text-white"
                          }`}
                        >
                          {orderLoyaltyPoints.reduce((sum, log) => sum + parseFloat(log.points), 0)} pts
                        </span>
                      )}
                    </div>

                    {orderLoyaltyPoints.length === 0 ? (
                      <div className="text-center py-3">
                        <p
                          className={`text-[10px] ${
                            isDark ? "text-indigo-400" : "text-indigo-600"
                          }`}
                        >
                          No loyalty points earned
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                        {orderLoyaltyPoints.map((log, index) => (
                          <motion.div
                            key={log.id}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: index * 0.03,
                              duration: 0.2,
                            }}
                            className={`${
                              isDark
                                ? "bg-indigo-900/10 hover:bg-indigo-900/20"
                                : "bg-white hover:bg-indigo-50"
                            } rounded-lg p-2 border ${
                              isDark
                                ? "border-indigo-700/30"
                                : "border-indigo-200/50"
                            } transition-all duration-150`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <div
                                  className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                    log.transaction_type === "EARNED"
                                      ? isDark
                                        ? "bg-green-600/20 border border-green-500/30"
                                        : "bg-green-50 border border-green-200"
                                      : log.transaction_type === "REDEEMED"
                                      ? isDark
                                        ? "bg-orange-600/20 border border-orange-500/30"
                                        : "bg-orange-50 border border-orange-200"
                                      : isDark
                                      ? "bg-blue-600/20 border border-blue-500/30"
                                      : "bg-blue-50 border border-blue-200"
                                  }`}
                                >
                                  {log.transaction_type === "EARNED" ? (
                                    <TrendingUp
                                      className={`w-3.5 h-3.5 ${
                                        isDark ? "text-green-400" : "text-green-600"
                                      }`}
                                    />
                                  ) : log.transaction_type === "REDEEMED" ? (
                                    <TrendingDown
                                      className={`w-3.5 h-3.5 ${
                                        isDark ? "text-orange-400" : "text-orange-600"
                                      }`}
                                    />
                                  ) : (
                                    <Award
                                      className={`w-3.5 h-3.5 ${
                                        isDark ? "text-blue-400" : "text-blue-600"
                                      }`}
                                    />
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span
                                      className={`font-semibold text-[10px] truncate ${
                                        isDark ? "text-white" : "text-gray-900"
                                      }`}
                                    >
                                      {log.rule_name || log.transaction_type}
                                    </span>
                                    <span
                                      className={`text-[8px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wide flex-shrink-0 ${
                                        log.transaction_type === "EARNED"
                                          ? isDark
                                            ? "bg-green-600/30 text-green-300"
                                            : "bg-green-600 text-white"
                                          : log.transaction_type === "REDEEMED"
                                          ? isDark
                                            ? "bg-orange-600/30 text-orange-300"
                                            : "bg-orange-600 text-white"
                                          : isDark
                                          ? "bg-blue-600/30 text-blue-300"
                                          : "bg-blue-600 text-white"
                                      }`}
                                    >
                                      {log.transaction_type}
                                    </span>
                                  </div>
                                  <p
                                    className={`text-[9px] ${
                                      isDark ? "text-gray-500" : "text-gray-500"
                                    }`}
                                  >
                                    {new Date(log.created_at).toLocaleString("en-US", {
                                      month: "short",
                                      day: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                    })}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right flex flex-col items-end gap-0.5">
                                <span
                                  className={`text-base font-black leading-none ${
                                    parseFloat(log.points) > 0
                                      ? isDark
                                        ? "text-green-400"
                                        : "text-green-600"
                                      : isDark
                                      ? "text-red-400"
                                      : "text-red-600"
                                  }`}
                                >
                                  {parseFloat(log.points) > 0 ? "+" : ""}
                                  {parseFloat(log.points).toFixed(0)}
                                </span>
                                <span className={`text-[8px] font-medium ${
                                  isDark ? "text-gray-500" : "text-gray-500"
                                }`}>
                                  Bal: {parseFloat(log.balance_after).toFixed(0)}
                                </span>
                              </div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div
                className={`w-20 h-20 ${
                  isDark ? "bg-gray-800" : "bg-gray-100"
                } rounded-full flex items-center justify-center mx-auto mb-4`}
              >
                <FileText
                  className={`w-10 h-10 ${themeClasses.textSecondary}`}
                />
              </div>
              <h3
                className={`text-xl font-semibold ${themeClasses.textSecondary} mb-2`}
              >
                Select an Order
              </h3>
              <p className={`${themeClasses.textSecondary}`}>
                Choose an order from the list to view details
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Order"
        maxWidth="max-w-md"
      >
        <div className="space-y-6">
          <div className="text-center">
            <div
              className={`w-16 h-16 ${
                isDark ? "bg-red-500/10 border border-red-500/20" : "bg-red-50"
              } rounded-full flex items-center justify-center mx-auto mb-4`}
            >
              <AlertTriangle
                className={`w-8 h-8 ${
                  isDark ? "text-red-400" : "text-red-600"
                }`}
              />
            </div>
            <h3
              className={`text-lg font-bold ${
                isDark ? "text-white" : "text-gray-900"
              } mb-2`}
            >
              Cancel Order {selectedOrder?.daily_serial ? `${dailySerialManager.formatSerial(selectedOrder.daily_serial)} - ` : ''}#{selectedOrder?.order_number}
            </h3>
            <p
              className={`${
                isDark ? "text-gray-300" : "text-gray-600"
              } text-sm`}
            >
              Please select a reason for cancelling this order
            </p>
          </div>

          <div className="space-y-3">
            <label
              className={`block text-sm font-semibold ${
                isDark ? "text-white" : "text-gray-700"
              } mb-3`}
            >
              Cancellation Reason *
            </label>

            <div className="space-y-3">
              {cancellationReasons.map((reason) => (
                <motion.label
                  key={reason}
                  whileHover={{ scale: 1.01, y: -1 }}
                  whileTap={{ scale: 0.99 }}
                  className={`flex items-center p-4 rounded-xl cursor-pointer transition-all duration-200 group ${
                    selectedCancelReason === reason
                      ? isDark
                        ? "bg-red-500/20 border-2 border-red-500/50 shadow-lg shadow-red-500/10"
                        : "bg-red-50 border-2 border-red-300 shadow-lg"
                      : isDark
                      ? "bg-gray-700/80 border border-gray-600/50 hover:bg-gray-600/60 hover:border-gray-500/50 backdrop-blur-sm"
                      : "bg-white border border-gray-200 hover:bg-gray-50 hover:border-gray-300 shadow-sm hover:shadow-md"
                  }`}
                >
                  <input
                    type="radio"
                    name="cancelReason"
                    value={reason}
                    checked={selectedCancelReason === reason}
                    onChange={(e) => setSelectedCancelReason(e.target.value)}
                    className="sr-only"
                  />

                  <div
                    className={`relative w-5 h-5 rounded-full border-2 mr-4 flex items-center justify-center transition-all ${
                      selectedCancelReason === reason
                        ? "border-red-500 bg-red-500 shadow-lg shadow-red-500/30"
                        : isDark
                        ? "border-gray-400 group-hover:border-gray-300"
                        : "border-gray-300 group-hover:border-gray-400"
                    }`}
                  >
                    {selectedCancelReason === reason && (
                      <motion.div
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{
                          type: "spring",
                          stiffness: 500,
                          damping: 15,
                        }}
                        className="w-2 h-2 bg-white rounded-full"
                      />
                    )}
                  </div>

                  <span
                    className={`font-medium text-sm flex-1 ${
                      selectedCancelReason === reason
                        ? isDark
                          ? "text-red-300"
                          : "text-red-700"
                        : isDark
                        ? "text-gray-100"
                        : "text-gray-700"
                    }`}
                  >
                    {reason}
                  </span>

                  {selectedCancelReason === reason && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0, x: 10 }}
                      animate={{ opacity: 1, scale: 1, x: 0 }}
                      transition={{
                        delay: 0.1,
                        type: "spring",
                        stiffness: 400,
                      }}
                      className="ml-3"
                    >
                      <div
                        className={`w-6 h-6 rounded-full flex items-center justify-center ${
                          isDark ? "bg-red-500/20" : "bg-red-100"
                        }`}
                      >
                        <Check
                          className={`w-3 h-3 ${
                            isDark ? "text-red-400" : "text-red-600"
                          }`}
                        />
                      </div>
                    </motion.div>
                  )}
                </motion.label>
              ))}
            </div>
          </div>

          <AnimatePresence>
            {selectedCancelReason === "Other" && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: "auto", y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="overflow-hidden"
              >
                <label
                  className={`block text-sm font-semibold ${
                    isDark ? "text-white" : "text-gray-700"
                  } mb-3`}
                >
                  Please specify the reason:
                </label>
                <textarea
                  value={customCancelReason}
                  onChange={(e) => setCustomCancelReason(e.target.value)}
                  placeholder="Enter custom cancellation reason..."
                  className={`w-full px-4 py-3 border rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none transition-all text-sm ${
                    isDark
                      ? "bg-gray-700/60 border-gray-600/50 text-white placeholder-gray-400 focus:bg-gray-700"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                  }`}
                  rows="4"
                />
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex space-x-4 pt-4">
            <motion.button
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={confirmCancelOrder}
              disabled={
                !selectedCancelReason ||
                (selectedCancelReason === "Other" && !customCancelReason)
              }
              className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 disabled:from-gray-500 disabled:to-gray-600 disabled:cursor-not-allowed text-white font-semibold py-3 px-6 rounded-xl shadow-lg hover:shadow-xl hover:shadow-red-500/25 transition-all disabled:opacity-50 disabled:shadow-none text-sm"
            >
              <XCircle className="w-4 h-4 mr-2 inline" />
              Cancel Order
            </motion.button>
          </div>
        </div>
      </Modal>

      {/* Order History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title="Order History & Changes"
        maxWidth="max-w-5xl"
      >
        <div className={`${isDark ? "bg-gray-900" : "bg-white"} rounded-xl`}>
          {orderHistory.length === 0 ? (
            <div className="text-center py-12">
              <div
                className={`w-16 h-16 rounded-full ${
                  isDark ? "bg-purple-800/30" : "bg-purple-100"
                } flex items-center justify-center mx-auto mb-4`}
              >
                <History
                  className={`w-8 h-8 ${
                    isDark ? "text-purple-400" : "text-purple-500"
                  }`}
                />
              </div>
              <p
                className={`text-base ${
                  isDark ? "text-purple-300" : "text-purple-700"
                } font-medium`}
              >
                No history recorded yet
              </p>
              <p
                className={`text-sm ${
                  isDark ? "text-purple-400" : "text-purple-600"
                } mt-2`}
              >
                Changes will appear here when you reopen or modify this order
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {orderHistory.map((history, index) => {
                const actionName =
                  history.cashiers?.name ||
                  history.users?.customer_name ||
                  "System";
                const isModified = history.action_type === "modified";
                const isReopened = history.action_type === "reopened";
                const hasItemChanges =
                  history.order_item_changes &&
                  history.order_item_changes.length > 0;
                const priceDiff = history.price_difference;

                // Get action icon and color
                const getActionIcon = () => {
                  if (isReopened)
                    return { Icon: RefreshCw, color: "orange" };
                  if (isModified)
                    return { Icon: Edit3, color: "blue" };
                  if (history.action_type.includes("status_changed"))
                    return { Icon: CheckCircle, color: "green" };
                  return { Icon: Clock, color: "purple" };
                };

                const { Icon: ActionIcon, color: actionColor } =
                  getActionIcon();

                return (
                  <motion.div
                    key={history.id}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{
                      delay: index * 0.03,
                      type: "spring",
                      stiffness: 400,
                      damping: 30,
                    }}
                    className={`${
                      isDark
                        ? "bg-purple-800/20 hover:bg-purple-800/30"
                        : "bg-white hover:bg-purple-50/50"
                    } rounded-lg p-2.5 border ${
                      isDark
                        ? "border-purple-700/30"
                        : "border-purple-200"
                    } ${
                      themeClasses.shadow
                    } shadow-sm hover:shadow-md transition-all`}
                  >
                    {/* Compact Header */}
                    <div className="flex items-center space-x-2 mb-2">
                      <div
                        className={`w-8 h-8 rounded-full ${
                          actionColor === "blue"
                            ? isDark
                              ? "bg-blue-900/30"
                              : "bg-blue-100"
                            : actionColor === "orange"
                            ? isDark
                              ? "bg-orange-900/30"
                              : "bg-orange-100"
                            : actionColor === "green"
                            ? isDark
                              ? "bg-green-900/30"
                              : "bg-green-100"
                            : isDark
                            ? "bg-purple-900/30"
                            : "bg-purple-100"
                        } flex items-center justify-center flex-shrink-0`}
                      >
                        <ActionIcon
                          className={`w-4 h-4 ${
                            actionColor === "blue"
                              ? isDark
                                ? "text-blue-400"
                                : "text-blue-600"
                              : actionColor === "orange"
                              ? isDark
                                ? "text-orange-400"
                                : "text-orange-600"
                              : actionColor === "green"
                              ? isDark
                                ? "text-green-400"
                                : "text-green-600"
                              : isDark
                              ? "text-purple-400"
                              : "text-purple-600"
                          }`}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span
                            className={`font-semibold text-xs ${
                              isDark
                                ? "text-purple-200"
                                : "text-purple-900"
                            } truncate`}
                          >
                            {actionName}
                          </span>
                          {history.cashiers && (
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded-md flex-shrink-0 ${
                                isDark
                                  ? "bg-blue-900/30 text-blue-300"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              Cashier
                            </span>
                          )}
                        </div>
                        <p
                          className={`text-[10px] ${
                            isDark
                              ? "text-purple-400"
                              : "text-purple-600"
                          } mt-0.5`}
                        >
                          {new Date(
                            history.created_at
                          ).toLocaleString("en-US", {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>

                    {/* Action Description */}
                    <p
                      className={`text-xs ${
                        isDark ? "text-purple-300" : "text-purple-700"
                      } mb-2`}
                    >
                      {history.action_type === "reopened" &&
                        "🔄 Order reopened"}
                      {history.action_type === "modified" &&
                        "✏️ Items & pricing modified"}
                      {history.action_type ===
                        "status_changed_to_pending" &&
                        "⏳ Changed to Pending"}
                      {history.action_type ===
                        "status_changed_to_preparing" &&
                        "👨‍🍳 Changed to Preparing"}
                      {history.action_type ===
                        "status_changed_to_ready" &&
                        "✅ Changed to Ready"}
                      {history.action_type ===
                        "status_changed_to_completed" &&
                        "🎉 Completed"}
                      {history.action_type ===
                        "status_changed_to_cancelled" &&
                        "❌ Cancelled"}
                    </p>

                    {/* Item Changes - Ultra Compact */}
                    {hasItemChanges && (
                      <div className={`mt-2 pt-2 border-t ${
                        isDark ? "border-purple-700/30" : "border-purple-200"
                      }`}>
                        <div
                          className={`text-[10px] font-semibold ${
                            isDark
                              ? "text-purple-300"
                              : "text-purple-700"
                          } uppercase mb-1.5 flex items-center`}
                        >
                          <Package className="w-2.5 h-2.5 mr-1" />
                          Item Changes
                        </div>

                        <div className="space-y-1">
                        {history.order_item_changes.map(
                          (change, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center justify-between p-1.5 rounded text-[10px] ${
                                change.change_type === "added"
                                  ? isDark
                                    ? "bg-green-900/20 text-green-300"
                                    : "bg-green-50 text-green-700"
                                  : change.change_type === "removed"
                                  ? isDark
                                    ? "bg-red-900/20 text-red-300"
                                    : "bg-red-50 text-red-700"
                                  : isDark
                                  ? "bg-blue-900/20 text-blue-300"
                                  : "bg-blue-50 text-blue-700"
                              }`}
                            >
                              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                {change.change_type === "added" && (
                                  <Plus className="w-2.5 h-2.5 flex-shrink-0" />
                                )}
                                {change.change_type === "removed" && (
                                  <X className="w-2.5 h-2.5 flex-shrink-0" />
                                )}
                                {change.change_type === "quantity_changed" && (
                                  <RefreshCw className="w-2.5 h-2.5 flex-shrink-0" />
                                )}
                                <span className="truncate font-medium">
                                  {change.product_name}
                                  {change.variant_name && ` (${change.variant_name})`}
                                </span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-[10px] mt-0.5 ${
                                      change.change_type === "added"
                                        ? "font-semibold"
                                        : change.change_type === "removed"
                                        ? "font-semibold"
                                        : "font-semibold"
                                    }`}
                                >
                                    {change.change_type === "added" &&
                                      `+${change.new_quantity}`}
                                    {change.change_type ===
                                      "removed" &&
                                      `-${change.old_quantity}`}
                                    {change.change_type ===
                                      "quantity_changed" &&
                                      `${change.old_quantity}→${change.new_quantity}`}
                                </span>
                                <span className="font-semibold">
                                  {change.change_type === "added" && `+Rs${change.new_total?.toFixed(0)}`}
                                  {change.change_type === "removed" && `-Rs${change.old_total?.toFixed(0)}`}
                                  {change.change_type === "quantity_changed" && `Rs${change.new_total?.toFixed(0)}`}
                                </span>
                              </div>
                            </div>
                          )
                        )}
                        </div>
                      </div>
                    )}

                    {/* Compact Price Summary */}
                    {isModified &&
                      (history.old_total || history.new_total) && (
                        <div className={`mt-2 pt-2 border-t ${
                          isDark ? "border-purple-700/30" : "border-purple-200"
                        }`}>
                          <div className="flex items-center justify-between">
                            <span className={`text-[10px] ${
                              isDark ? "text-purple-300" : "text-purple-700"
                            }`}>
                              Total: Rs{history.old_total?.toFixed(0)} → Rs{history.new_total?.toFixed(0)}
                            </span>
                            {priceDiff !== null && priceDiff !== 0 && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                priceDiff > 0
                                  ? isDark
                                    ? "bg-green-900/30 text-green-400"
                                    : "bg-green-100 text-green-700"
                                  : isDark
                                  ? "bg-red-900/30 text-red-400"
                                  : "bg-red-100 text-red-700"
                              }`}>
                                {priceDiff > 0 ? "+" : ""}Rs{Math.abs(priceDiff).toFixed(0)}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      {/* Success Modal */}
      <SuccessModal
        isOpen={successModal.isOpen}
        onClose={() =>
          setSuccessModal({ isOpen: false, title: "", message: "" })
        }
        title={successModal.title}
        message={successModal.message}
      />

      {/* Split Payment Modal */}
      {showSplitPaymentModal && splitPaymentOrder && (
        <SplitPaymentModal
          isOpen={showSplitPaymentModal}
          onClose={() => {
            setShowSplitPaymentModal(false);
            setSplitPaymentOrder(null);
          }}
          totalAmount={splitPaymentOrder.total_amount}
          amountDue={splitPaymentOrder.total_amount}
          customer={splitPaymentOrder.customers}
          onPaymentComplete={async (paymentData) => {
            setShowSplitPaymentModal(false);
            setSplitPaymentOrder(null);
            // Call the same handler but with actual payment data this time
            await handlePaymentComplete(paymentData);
          }}
          isDark={theme === 'dark'}
          classes={themeClasses}
        />
      )}

      {/* Move to Delivery Modal */}
      {showConvertToDeliveryModal && selectedOrder && (
        <ConvertToDeliveryModal
          isOpen={showConvertToDeliveryModal}
          onClose={() => setShowConvertToDeliveryModal(false)}
          order={selectedOrder}
          onSuccess={() => {
            setShowConvertToDeliveryModal(false);
            setSelectedOrder(prev => prev ? { ...prev, order_type: 'delivery' } : prev);
            notify.success('Order moved to delivery successfully!');
            fetchOrders();
          }}
        />
      )}

      {/* Move to Takeaway Modal */}
      {showConvertToTakeawayModal && selectedOrder && (
        <ConvertToTakeawayModal
          isOpen={showConvertToTakeawayModal}
          onClose={() => setShowConvertToTakeawayModal(false)}
          order={selectedOrder}
          onSuccess={() => {
            setShowConvertToTakeawayModal(false);
            setSelectedOrder(prev => prev ? { ...prev, order_type: 'takeaway', delivery_charges: 0, delivery_address: null, delivery_boy_id: null } : prev);
            notify.success('Order moved to takeaway successfully!');
            fetchOrders();
          }}
        />
      )}


      {/* Notification System */}
      <NotificationSystem />
      </div>
    </ProtectedPage>
  );
}
