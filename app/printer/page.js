'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft,
  Printer,
  Plus,
  Search,
  Wifi,
  WifiOff,
  Trash2,
  Edit3,
  Check,
  X,
  RefreshCw,
  Sun,
  Moon,
  CheckCircle2,
  XCircle,
  Network,
  Star,
  Settings,
  Activity,
  Zap,
  AlertTriangle,
  Info,
  ExternalLink,
  Monitor,
  Power,
  Signal,
  Usb
} from 'lucide-react'
import { useRouter } from 'next/navigation'
import { themeManager } from '../../lib/themeManager'
import { authManager } from '../../lib/authManager'
import { printerManager } from '../../lib/printerManager'
import { networkPrintListener } from '../../lib/networkPrintListener'
import { notify } from '../../components/ui/NotificationSystem'
import { supabase } from '../../lib/supabaseClient'
import Modal from '../../components/ui/Modal'
import ConfirmModal from '../../components/ui/ConfirmModal'
import ProtectedPage from '../../components/ProtectedPage'

export default function PrinterPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [printers, setPrinters] = useState([])
  const [discoveredPrinters, setDiscoveredPrinters] = useState([])
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [detectedUSBPrinters, setDetectedUSBPrinters] = useState([])
  const [isDetectingUSB, setIsDetectingUSB] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [theme, setTheme] = useState('light')
  const [networkStatus, setNetworkStatus] = useState({ isOnline: true })

  // Form states
  const [showAddModal, setShowAddModal] = useState(false)
  const [editingPrinter, setEditingPrinter] = useState(null)
  const [formData, setFormData] = useState({
    name: '',
    printer_type: 'ip', // 'ip', 'usb', or 'windows_usb'
    ip_address: '',
    port: '9100',
    usb_port: 'COM3', // Default USB port for Windows (COM port / Serial)
    usb_printer_name: '', // Windows USB Printer Class device name
    is_default: false
  })
  const [windowsPrinters, setWindowsPrinters] = useState([])
  const [isLoadingWindowsPrinters, setIsLoadingWindowsPrinters] = useState(false)

  // Delete confirmation modal state
  const [deleteModal, setDeleteModal] = useState({
    isOpen: false,
    printerId: null,
    printerName: ''
  })
  const [isDeleting, setIsDeleting] = useState(false)

  // Connection states
  const [testingPrinter, setTestingPrinter] = useState(null)
  const [connectionResults, setConnectionResults] = useState({})

  // Category/Deal → Printer routing
  const [categories, setCategories] = useState([])
  const [deals, setDeals] = useState([])
  const [categoryMappings, setCategoryMappings] = useState({}) // { 'category:<id>' | 'deal:<id>' : printerId }
  const [broadcastPrinterIds, setBroadcastPrinterIds] = useState([]) // printers that receive ALL items
  const [savingMappings, setSavingMappings] = useState(false)
  const [routingTab, setRoutingTab] = useState('categories') // 'categories' | 'deals'

  // Network Printing states
  const [sharePrinterMode, setSharePrinterMode] = useState(false)
  const [isServer, setIsServer] = useState(false)

  const formRef = useRef(null)

  // Load data on mount
useEffect(() => {
  const initializePage = async () => {
    // Check authentication
    if (!authManager.isLoggedIn()) {
      router.push('/')
      return
    }

    const userData = authManager.getCurrentUser()
    
    if (!userData?.id) {
      console.error('❌ No user ID found!')
      router.push('/')
      return
    }
    
    // Set user state first
    setUser(userData)

    // CRITICAL: Set user ID in printerManager BEFORE loading anything
    printerManager.setUserId(userData.id)
    console.log('✅ User ID set in printerManager:', userData.id)

    // Load and apply theme
    setTheme(themeManager.currentTheme)
    themeManager.applyTheme()

    // NOW load printers (after user ID is set and user state is set)
    await loadPrinters(userData.id)

    // Load categories, deals and existing routing mappings
    await loadRoutingData(userData.id)

    // Load network printing settings from database
    await loadNetworkPrintingSettings(userData)
  }

  initializePage()
  
  // Network status monitoring
  const checkNetwork = () => {
    setNetworkStatus({ isOnline: navigator.onLine })
  }
  
  window.addEventListener('online', checkNetwork)
  window.addEventListener('offline', checkNetwork)
  checkNetwork()

  return () => {
    window.removeEventListener('online', checkNetwork)
    window.removeEventListener('offline', checkNetwork)
  }
}, [router])

  // Network Printing: Load settings (offline-first approach)
  const loadNetworkPrintingSettings = async (userData) => {
    try {
      // Step 1: Load from localStorage immediately (instant, works offline)
      const shareModeStr = localStorage.getItem('share_printer_mode')
      const isServerStr = localStorage.getItem('is_print_server')

      const localShareMode = shareModeStr === 'true'
      const localServerMode = isServerStr === 'true'

      // Set state immediately with localStorage values
      setSharePrinterMode(localShareMode)
      setIsServer(localServerMode)

      // Note: Global print listener is handled by GlobalPrintListener component
      // No need to start it here - it runs on all pages

      console.log(`📦 Loaded from localStorage: Share Mode=${localShareMode}, Server Mode=${localServerMode}`)

      // Step 2: If online, sync from database in background (don't block UI)
      if (navigator.onLine) {
        console.log('🌐 Online - syncing settings from database...')

        // Determine table based on user type
        const table = userData.cashier_id ? 'cashiers' : 'users'
        const idField = userData.cashier_id ? 'id' : 'id'
        const recordId = userData.cashier_id || userData.id

        // Fetch from database (background sync)
        const { data, error } = await supabase
          .from(table)
          .select('share_printer_mode, is_print_server')
          .eq(idField, recordId)
          .single()

        if (!error && data) {
          const dbShareMode = data.share_printer_mode || false
          const dbServerMode = data.is_print_server || false

          // Only update if database values differ from localStorage
          if (dbShareMode !== localShareMode || dbServerMode !== localServerMode) {
            console.log('🔄 Database values differ - updating from database')
            console.log(`  DB: Share=${dbShareMode}, Server=${dbServerMode}`)
            console.log(`  Local: Share=${localShareMode}, Server=${localServerMode}`)

            // Update state with database values
            setSharePrinterMode(dbShareMode)
            setIsServer(dbServerMode)

            // Update localStorage to match database
            localStorage.setItem('share_printer_mode', dbShareMode.toString())
            localStorage.setItem('is_print_server', dbServerMode.toString())

            // Update global listener if server mode changed
            if (dbServerMode !== localServerMode) {
              networkPrintListener.setIsServer(dbServerMode)
              if (dbServerMode) {
                networkPrintListener.startListening()
              } else {
                networkPrintListener.stopListening()
              }
            }

            console.log('✅ Settings synced from database')
          } else {
            console.log('✅ Settings already in sync')
          }
        } else if (error) {
          console.log('⚠️ Could not sync from database, using localStorage values')
        }
      } else {
        console.log('📴 Offline - using localStorage values only')
      }
    } catch (error) {
      console.error('❌ Error loading network settings:', error)
      // If everything fails, at least try localStorage one more time
      const shareModeStr = localStorage.getItem('share_printer_mode')
      const isServerStr = localStorage.getItem('is_print_server')
      if (shareModeStr !== null) setSharePrinterMode(shareModeStr === 'true')
      if (isServerStr !== null) setIsServer(isServerStr === 'true')
    }
  }

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light'
    setTheme(newTheme)
    themeManager.setTheme(newTheme)
  }

  // Network Printing: Toggle functions
  const handleToggleShareMode = async (enabled) => {
    setSharePrinterMode(enabled)
    localStorage.setItem('share_printer_mode', enabled.toString())

    // Save to database for persistence across sessions
    if (user?.id) {
      try {
        // Check if user is a cashier (has cashier_id) or regular user
        const table = user.cashier_id ? 'cashiers' : 'users'
        const idField = user.cashier_id ? 'id' : 'id'
        const recordId = user.cashier_id || user.id

        await supabase
          .from(table)
          .update({ share_printer_mode: enabled })
          .eq(idField, recordId)
        console.log(`✅ Share printer mode saved to ${table} table`)
      } catch (error) {
        console.error('❌ Failed to save share printer mode:', error)
      }
    }

    notify.success(enabled ? 'Network printing enabled' : 'Network printing disabled')
  }

  const handleToggleServerMode = async (enabled) => {
    setIsServer(enabled)
    localStorage.setItem('is_print_server', enabled.toString())

    // Save to database for persistence across sessions
    if (user?.id) {
      try {
        // Check if user is a cashier (has cashier_id) or regular user
        const table = user.cashier_id ? 'cashiers' : 'users'
        const idField = user.cashier_id ? 'id' : 'id'
        const recordId = user.cashier_id || user.id

        await supabase
          .from(table)
          .update({ is_print_server: enabled })
          .eq(idField, recordId)
        console.log(`✅ Print server mode saved to ${table} table`)
      } catch (error) {
        console.error('❌ Failed to save print server mode:', error)
      }

      // Sync with global listener
      networkPrintListener.setIsServer(enabled)

      if (enabled) {
        // Start listening globally
        networkPrintListener.startListening()
        notify.success('Print server mode enabled - listening on all pages')
      } else {
        // Stop listening
        networkPrintListener.stopListening()
        notify.success('Print server mode disabled')
      }
    } else {
      notify.success(enabled ? 'This terminal is now a print server' : 'Print server mode disabled')
    }
  }

const loadPrinters = async (userId = user?.id) => {
  try {
    if (!userId) {
      console.error('❌ Cannot load printers - no user ID available')
      return
    }

    setIsLoading(true)
    console.log('Loading printers from database for user:', userId)
    
    const { data, error } = await supabase
      .from('printers')
      .select('*')
      .eq('is_active', true)
      .eq('created_by', userId)  // Use the parameter
      .order('created_at', { ascending: false })

    if (error) throw error

    console.log('Loaded printers from database:', data)

    // Map database fields to UI fields
    // Windows USB printers are stored with usb_device_path='WINUSB:<name>' in Supabase
    const mappedPrinters = (data || []).map(printer => {
      const usbPath = printer.usb_device_path || printer.usb_port
      const isWindowsUSB = usbPath && usbPath.startsWith('WINUSB:')
      return {
        ...printer,
        connection_type: isWindowsUSB ? 'windows_usb' : printer.connection_type,
        usb_printer_name: isWindowsUSB ? usbPath.replace(/^WINUSB:/, '') : (printer.usb_printer_name || null),
        usb_port: isWindowsUSB ? null : usbPath,
        printer_type: isWindowsUSB ? 'windows_usb' : (printer.connection_type === 'usb' ? 'usb' : 'ip')
      }
    })

    setPrinters(mappedPrinters)
    
    // Sync printers to localStorage
    if (data && data.length > 0) {
      console.log('Syncing printers to localStorage...')
      for (const printer of data) {
        await printerManager.savePrinterConfig(printer)
      }
      console.log('Sync complete. Printers saved to user-specific storage.')
    } else {
      console.log('No printers found for this user')
    }
    
  } catch (error) {
    console.error('Error loading printers:', error)
    notify.error('Failed to load printers')
  } finally {
    setIsLoading(false)
  }
}
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const validateForm = () => {
    if (!formData.name.trim()) {
      notify.error('Printer name is required')
      return false
    }

    // Validate based on printer type
    if (formData.printer_type === 'ip') {
      if (!formData.ip_address.trim()) {
        notify.error('IP address is required for IP printers')
        return false
      }

      const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/
      if (!ipRegex.test(formData.ip_address)) {
        notify.error('Please enter a valid IP address')
        return false
      }

      const port = parseInt(formData.port)
      if (isNaN(port) || port < 1 || port > 65535) {
        notify.error('Port must be between 1 and 65535')
        return false
      }
    } else if (formData.printer_type === 'usb') {
      if (!formData.usb_port.trim()) {
        notify.error('USB port is required for USB printers')
        return false
      }
    } else if (formData.printer_type === 'windows_usb') {
      if (!formData.usb_printer_name.trim()) {
        notify.error('Please select a Windows printer')
        return false
      }
    }

    return true
  }
const handleSubmit = async (e) => {
  e.preventDefault()
  if (!validateForm()) return

  if (!user?.id) {
    notify.error('User session expired. Please log in again.')
    router.push('/')
    return
  }

  try {
    console.log('Submitting printer form...')

    const winPrinterName = formData.printer_type === 'windows_usb' ? formData.usb_printer_name : null

    // Supabase payload: connection_type CHECK only allows 'ethernet' or 'usb'.
    // Windows USB printers are stored as connection_type='usb' with usb_device_path='WINUSB:<name>'
    // so they satisfy the schema constraints without any DB migration.
    const supabaseData = {
      name: formData.name,
      connection_type: formData.printer_type === 'ip' ? 'ethernet' : 'usb',
      ip_address: formData.printer_type === 'ip' ? formData.ip_address : null,
      port: formData.printer_type === 'ip' ? parseInt(formData.port) : null,
      usb_device_path: formData.printer_type === 'windows_usb'
        ? `WINUSB:${winPrinterName}`
        : (formData.printer_type === 'usb' ? formData.usb_port : null),
      usb_device_name: formData.printer_type === 'usb' ? formData.name : null,
      is_default: formData.is_default,
      created_by: user.id,
      updated_at: new Date().toISOString()
    }

    let result

    if (editingPrinter) {
      // Update existing printer
      console.log('Updating printer:', editingPrinter.id)
      const { data, error } = await supabase
        .from('printers')
        .update(supabaseData)
        .eq('id', editingPrinter.id)
        .select()
        .single()

      if (error) throw error
      result = data
      notify.success(`${formData.name} updated successfully`)
    } else {
      // Create new printer
      console.log('Creating new printer with data:', supabaseData)

      // If this is set as default, first unset all other defaults for this user
      if (formData.is_default) {
        await supabase
          .from('printers')
          .update({ is_default: false })
          .eq('created_by', user.id)
      }

      const { data, error } = await supabase
        .from('printers')
        .insert([{
          ...supabaseData,
          is_active: true,
          created_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (error) throw error
      result = data
      notify.success(`${formData.name} added successfully`)
    }

    // Merge usb_printer_name back for local storage (not in Supabase schema)
    const localResult = { ...result, usb_printer_name: winPrinterName }

    // Save to localStorage using printerManager
    console.log('Saving printer to localStorage:', localResult)
    await printerManager.savePrinterConfig(localResult)

    // Save full config (including usb_printer_name) to Electron local storage
    if (printerManager.isElectron()) {
      await window.electronAPI.printerSave({ ...localResult, user_id: user.id })
    }

    // Reload printers from database
    await loadPrinters(user.id)
    
    resetForm()

  } catch (error) {
    console.error('Error saving printer:', error)
    notify.error('Failed to save printer: ' + error.message)
  }
}
  const resetForm = () => {
    setFormData({
      name: '',
      printer_type: 'ip',
      ip_address: '',
      port: '9100',
      usb_port: 'COM3',
      usb_printer_name: '',
      is_default: false
    })
    setEditingPrinter(null)
    setShowAddModal(false)
  }

  const handleEdit = (printer) => {
    const ptype = printer.connection_type === 'windows_usb' ? 'windows_usb' : (printer.printer_type || 'ip')
    setFormData({
      name: printer.name,
      printer_type: ptype,
      ip_address: printer.ip_address || '',
      port: printer.port ? printer.port.toString() : '9100',
      usb_port: printer.usb_port || 'COM3',
      usb_printer_name: printer.usb_printer_name || '',
      is_default: printer.is_default
    })
    setEditingPrinter(printer)
    setShowAddModal(true)
  }

  // Open delete confirmation modal
  const openDeleteModal = (printerId, printerName) => {
    setDeleteModal({
      isOpen: true,
      printerId,
      printerName
    })
  }

  // Close delete confirmation modal
  const closeDeleteModal = () => {
    setDeleteModal({
      isOpen: false,
      printerId: null,
      printerName: ''
    })
  }

  // Handle actual deletion
  const handleDelete = async () => {
    const { printerId, printerName } = deleteModal

    if (!printerId) return

    setIsDeleting(true)

    try {
      console.log('Deleting printer:', printerId)

      // Delete from database - use actual DELETE for permanent removal
      // or soft delete by setting is_active to false
      const { error } = await supabase
        .from('printers')
        .delete()
        .eq('id', printerId)
        .eq('created_by', user?.id) // Ensure user can only delete their own printers

      if (error) throw error

      // Remove from localStorage
      console.log('Removing printer from localStorage...')
      await printerManager.removePrinter(printerId)

      // Sync localStorage after deletion
      await printerManager.syncPrintersFromDatabase()

      notify.success(`${printerName} deleted successfully`)
      closeDeleteModal()
      loadPrinters()

    } catch (error) {
      console.error('Error deleting printer:', error)
      notify.error('Failed to delete printer')
    } finally {
      setIsDeleting(false)
    }
  }

 // 1. Update testPrinterConnection function
const testPrinterConnection = async (printerId, printerType, ipOrPort, port, showNotification = true) => {
  setTestingPrinter(printerId)

  try {
    if (showNotification) {
      notify.info('Testing printer connection...', { duration: 2000 })
    }

    let result;
    let isConnected;

    if (printerType === 'windows_usb') {
      console.log(`Testing Windows USB printer: ${ipOrPort}`)
      if (!printerManager.isElectron()) {
        notify.error('Windows USB printer testing only available in desktop app')
        setTestingPrinter(null)
        return false
      }
      result = await window.electronAPI.printerTestWindowsUSB({ printerName: ipOrPort })
      isConnected = result.success
    } else if (printerType === 'usb') {
      console.log(`Testing USB printer: ${ipOrPort}`)

      if (!printerManager.isElectron()) {
        notify.error('USB printer testing only available in desktop app')
        setTestingPrinter(null)
        return false
      }

      result = await window.electronAPI.printerTestUSB({ port: ipOrPort })
      isConnected = result.success
    } else {
      console.log(`Testing IP printer: ${ipOrPort}:${port}`)
      // Use PrinterManager instead of API call
      result = await printerManager.testPrinterConnection(ipOrPort, port.toString())
      isConnected = result.success
    }

    console.log(`Connection test result:`, isConnected)
    
    // Update connection status in database
    await supabase
      .from('printers')
      .update({ 
        connection_status: isConnected ? 'connected' : 'disconnected',
        last_connected_at: isConnected ? new Date().toISOString() : null,
        updated_at: new Date().toISOString()
      })
      .eq('id', printerId)
    
    // Update localStorage connection status
    await printerManager.updateConnectionStatus(printerId, isConnected)
    
    setConnectionResults(prev => ({
      ...prev,
      [printerId]: { success: isConnected, timestamp: Date.now() }
    }))
    
    if (showNotification) {
      if (isConnected) {
        notify.success('Printer connected successfully')
      } else {
        notify.error('Failed to connect to printer')
      }
    }
    
    return isConnected
    
  } catch (error) {
    console.error('Error testing printer:', error)
    setConnectionResults(prev => ({
      ...prev,
      [printerId]: { success: false, timestamp: Date.now() }
    }))
    
    // Update localStorage as disconnected
    await printerManager.updateConnectionStatus(printerId, false)
    
    if (showNotification) {
      if (error.message.includes('only available in desktop app')) {
        notify.error('Printer testing only available in desktop app')
      } else {
        notify.error('Connection test failed')
      }
    }
    return false
  } finally {
    setTestingPrinter(null)
  }
}

// 2. Update testPrintReceipt function
const testPrintReceipt = async (printer) => {
  setTestingPrinter(printer.id)

  try {
    notify.info(`Sending test print to ${printer.name}...`, { duration: 2000 })
    const printerType = printer.printer_type || 'ip';

    // Check if we're in Electron
    if (!printerManager.isElectron()) {
      notify.error('Test printing only available in desktop app')
      setTestingPrinter(null)
      return
    }

    let result;

    const effectiveType = printer.connection_type === 'windows_usb' ? 'windows_usb' : printerType

    if (effectiveType === 'windows_usb') {
      console.log(`Sending test print to Windows USB printer: ${printer.usb_printer_name}`)
      result = await window.electronAPI.printerTestWindowsUSB({
        printerName: printer.usb_printer_name
      })
    } else if (effectiveType === 'usb') {
      console.log(`Sending test print to USB: ${printer.usb_port}`)
      result = await window.electronAPI.printerTestUSB({
        port: printer.usb_port
      })
    } else {
      console.log(`Sending test print to IP: ${printer.ip_address}:${printer.port}`)
      // Use the simple raw test function instead of full receipt
      result = await window.electronAPI.printerRawTest({
        ip: printer.ip_address,
        port: printer.port.toString()
      })
    }
    
    if (result.success) {
      notify.success(`Simple test print sent to ${printer.name}`)

      // Update last connected timestamp in database
      await supabase
        .from('printers')
        .update({
          connection_status: 'connected',
          last_connected_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', printer.id)

      // Update localStorage status
      await printerManager.updateConnectionStatus(printer.id, true)

      // Update connection result to show online status (no need to reload entire page)
      setConnectionResults(prev => ({
        ...prev,
        [printer.id]: { success: true, timestamp: Date.now() }
      }))
    } else {
      notify.error('Failed to send test print')
    }
    
  } catch (error) {
    console.error('Error sending test print:', error)
    if (error.message.includes('only available in desktop app')) {
      notify.error('Test printing only available in desktop app')
    } else {
      notify.error('Test print failed')
    }
  } finally {
    setTestingPrinter(null)
  }
}

// 3. Update autoDiscoverPrinters function
const autoDiscoverPrinters = async () => {
  // Check if we're in Electron first
  if (!printerManager.isElectron()) {
    notify.error('Auto-discovery only available in desktop app')
    return
  }
  
  setIsDiscovering(true)
  setDiscoveredPrinters([])
  
  try {
    notify.info('Scanning network for printers...')
    
    // Get common network ranges
    const networkBases = ['192.168.1', '192.168.0', '10.0.0', '172.16.0']
    const discovered = []
    
    // Test multiple IPs concurrently with limited batch size
    for (const base of networkBases) {
      const promises = []
      
      // Test first 50 IPs in each range
      for (let i = 1; i <= 50; i++) {
        const testIP = `${base}.${i}`
        promises.push(
          printerManager.testPrinterConnection(testIP, '9100')
            .then(result => ({ ip: testIP, connected: result.success }))
            .catch(() => ({ ip: testIP, connected: false }))
        )
      }
      
      // Process in batches of 10
      for (let i = 0; i < promises.length; i += 10) {
        const batch = promises.slice(i, i + 10)
        const results = await Promise.all(batch)
        
        results.forEach(result => {
          if (result.connected) {
            // Check if this IP is already in our printers list
            const existingPrinter = printers.find(p => p.ip_address === result.ip)
            if (!existingPrinter) {
              discovered.push({
                ip: result.ip,
                port: 9100,
                name: `Printer ${result.ip}`,
                type: 'thermal'
              })
            }
          }
        })
      }
    }
    
    setDiscoveredPrinters(discovered)
    
    if (discovered.length > 0) {
      notify.success(`Found ${discovered.length} printer(s) on the network`)
    } else {
      notify.warning('No new printers found on the network')
    }
    
  } catch (error) {
    console.error('Auto-discovery error:', error)
    if (error.message.includes('only available in desktop app')) {
      notify.error('Auto-discovery only available in desktop app')
    } else {
      notify.error('Auto-discovery failed')
    }
  } finally {
    setIsDiscovering(false)
  }
}

  const addDiscoveredPrinter = (discoveredPrinter) => {
    setFormData({
      name: discoveredPrinter.name,
      ip_address: discoveredPrinter.ip,
      port: discoveredPrinter.port.toString(),
      printer_type: 'ip',
      is_default: printers.length === 0 // Make first printer default
    })
    setShowAddModal(true)
    setDiscoveredPrinters(prev => prev.filter(p => p.ip !== discoveredPrinter.ip))
  }

  const detectUSBPrinters = async () => {
    if (!printerManager.isElectron()) {
      notify.error('USB detection only available in desktop app')
      return
    }

    setIsDetectingUSB(true)
    setDetectedUSBPrinters([])

    try {
      notify.info('Detecting USB printers...')

      const result = await window.electronAPI.usbDetectPrinters()

      if (result.success && result.printers && result.printers.length > 0) {
        // Filter out printers that are already configured
        const newPrinters = result.printers.filter(usbPrinter => {
          return !printers.some(p =>
            (p.usb_device_path === usbPrinter.port) ||
            (p.usb_port === usbPrinter.port)
          )
        })

        setDetectedUSBPrinters(newPrinters)

        if (newPrinters.length > 0) {
          notify.success(`Found ${newPrinters.length} USB printer(s)`)
        } else {
          notify.warning('No new USB printers found')
        }
      } else {
        notify.warning('No USB printers detected. Make sure your printer is connected and powered on.')
      }
    } catch (error) {
      console.error('USB detection error:', error)
      notify.error('Failed to detect USB printers')
    } finally {
      setIsDetectingUSB(false)
    }
  }

  const loadRoutingData = async (userId) => {
    try {
      // Load categories, deals, and existing mappings in parallel
      const [catRes, dealRes, mappingRes] = await Promise.all([
        supabase.from('categories').select('id, name').eq('user_id', userId).order('name'),
        supabase.from('deals').select('id, name').eq('user_id', userId).eq('is_active', true).order('name'),
        supabase.from('printer_category_mappings').select('type, entity_id, printer_id').eq('user_id', userId)
      ])
      // Deduplicate by id in case the DB returns duplicate rows
      if (catRes.data) {
        const seen = new Set()
        setCategories(catRes.data.filter(c => seen.has(c.id) ? false : seen.add(c.id)))
      }
      if (dealRes.data) {
        const seen = new Set()
        setDeals(dealRes.data.filter(d => seen.has(d.id) ? false : seen.add(d.id)))
      }

      if (mappingRes.data && mappingRes.data.length > 0) {
        // Supabase is the source of truth when online
        const map = {}
        const broadcasts = []
        mappingRes.data.forEach(m => {
          if (m.type === 'broadcast') broadcasts.push(m.printer_id)
          else map[`${m.type}:${m.entity_id}`] = m.printer_id
        })
        setCategoryMappings(map)
        setBroadcastPrinterIds(broadcasts)
        // Sync down to local cache for offline use
        if (printerManager.isElectron()) {
          const localMappings = [
            ...mappingRes.data.filter(m => m.type !== 'broadcast').map(m => ({ type: m.type, id: m.entity_id, printer_id: m.printer_id })),
            ...broadcasts.map(pid => ({ type: 'broadcast', id: pid, printer_id: pid }))
          ]
          window.electronAPI.printerMappingsSave(localMappings).catch(() => {})
        }
      } else if (printerManager.isElectron()) {
        // Offline fallback: load from local file
        const res = await window.electronAPI.printerMappingsLoad()
        if (res.success && res.mappings?.length > 0) {
          const map = {}
          const broadcasts = []
          res.mappings.forEach(m => {
            if (m.type === 'broadcast') broadcasts.push(m.printer_id)
            else map[`${m.type}:${m.id}`] = m.printer_id
          })
          setCategoryMappings(map)
          setBroadcastPrinterIds(broadcasts)
        }
      }
    } catch (err) {
      console.error('Error loading routing data:', err)
      if (printerManager.isElectron()) {
        try {
          const res = await window.electronAPI.printerMappingsLoad()
          if (res.success && res.mappings?.length > 0) {
            const map = {}
            const broadcasts = []
            res.mappings.forEach(m => {
              if (m.type === 'broadcast') broadcasts.push(m.printer_id)
              else map[`${m.type}:${m.id}`] = m.printer_id
            })
            setCategoryMappings(map)
            setBroadcastPrinterIds(broadcasts)
          }
        } catch {}
      }
    }
  }

  const saveRoutingMappings = async () => {
    setSavingMappings(true)

    // Build the local mappings array (category/deal + broadcast)
    const localMappings = [
      ...Object.entries(categoryMappings)
        .filter(([, printerId]) => printerId)
        .map(([key, printer_id]) => {
          const [type, ...rest] = key.split(':')
          return { type, id: rest.join(':'), printer_id }
        }),
      ...broadcastPrinterIds.map(pid => ({ type: 'broadcast', id: pid, printer_id: pid }))
    ]

    // Always save to local file first so offline works regardless
    if (printerManager.isElectron()) {
      try { await window.electronAPI.printerMappingsSave(localMappings) } catch {}
    }

    try {
      const supabaseMappings = localMappings.map(m => ({
        type: m.type,
        entity_id: m.id,
        printer_id: m.printer_id,
        user_id: user.id
      }))

      // Delete existing rows for this user then re-insert
      const { error: delErr } = await supabase
        .from('printer_category_mappings')
        .delete()
        .eq('user_id', user.id)
      if (delErr) throw new Error(delErr.message || JSON.stringify(delErr))

      if (supabaseMappings.length > 0) {
        const { error: insErr } = await supabase
          .from('printer_category_mappings')
          .insert(supabaseMappings)
        if (insErr) throw new Error(insErr.message || JSON.stringify(insErr))
      }

      notify.success('Printer routing saved!')
    } catch (err) {
      const msg = err?.message || String(err)
      console.error('Failed to sync routing to Supabase:', msg)
      // Local save already done above — show warning not error
      notify.warning('Saved locally. Supabase sync failed: ' + msg)
    } finally {
      setSavingMappings(false)
    }
  }

  const loadWindowsPrinters = async () => {
    if (!printerManager.isElectron()) return
    setIsLoadingWindowsPrinters(true)
    try {
      const result = await window.electronAPI.printerListWindowsPrinters()
      if (result.success && result.printers) {
        setWindowsPrinters(result.printers)
      }
    } catch (e) {
      console.error('Failed to list Windows printers:', e)
    } finally {
      setIsLoadingWindowsPrinters(false)
    }
  }

  const addDetectedUSBPrinter = (usbPrinter) => {
    setFormData({
      name: usbPrinter.name,
      printer_type: 'usb',
      usb_port: usbPrinter.port,
      is_default: printers.length === 0 // Make first printer default
    })
    setShowAddModal(true)
    setDetectedUSBPrinters(prev => prev.filter(p => p.port !== usbPrinter.port))
  }

  const setAsDefault = async (printerId) => {
    try {
      console.log('Setting printer as default:', printerId)
      
      // First, unset all other defaults in database
      await supabase
        .from('printers')
        .update({ 
          is_default: false,
          updated_at: new Date().toISOString()
        })
        .neq('id', printerId)

      // Set the selected printer as default in database
      const { data, error } = await supabase
        .from('printers')
        .update({ 
          is_default: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', printerId)
        .select()
        .single()
      
      if (error) throw error

      // CRITICAL: Update localStorage immediately
      console.log('Updating default printer in localStorage:', data)
      const setDefaultSuccess = printerManager.setDefaultPrinter(printerId)
      
      // Also save the updated printer config
      const saveSuccess = printerManager.savePrinterConfig(data)
      
      if (setDefaultSuccess && saveSuccess) {
        console.log('Default printer successfully updated in localStorage')
      } else {
        console.error('Failed to update default printer in localStorage')
      }
      
      notify.success('Default printer updated')
      loadPrinters()
      
    } catch (error) {
      console.error('Error setting default printer:', error)
      notify.error('Failed to set default printer')
    }
  }

  const getConnectionStatusBadge = (printer) => {
    const result = connectionResults[printer.id]
    const isOnline = result?.success
    const isRecent = result?.timestamp && (Date.now() - result.timestamp) < 30000

    // Don't show loading spinner in badge - let the notification handle it
    if (isRecent) {
      if (isOnline) {
        return (
          <div className="flex items-center px-3 py-1 bg-green-100 text-green-600 rounded-full text-xs font-medium">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse"></div>
            Online
          </div>
        )
      } else {
        return (
          <div className="flex items-center px-3 py-1 bg-red-100 text-red-600 rounded-full text-xs font-medium">
            <div className="w-2 h-2 bg-red-500 rounded-full mr-2"></div>
            Offline
          </div>
        )
      }
    }

    return (
      <div className="flex items-center px-3 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
        <div className="w-2 h-2 bg-gray-400 rounded-full mr-2"></div>
        Unknown
      </div>
    )
  }

  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  if (isLoading) {
    return (
      <div className={`h-screen w-screen flex items-center justify-center ${classes.background}`}>
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-4 border-emerald-200 border-t-emerald-500" />
          <p className={`text-sm font-medium ${classes.textSecondary}`}>Loading printers...</p>
        </div>
      </div>
    )
  }

  return (
    <ProtectedPage permissionKey="PRINTERS" pageName="Printer Management">
      <div className={`h-screen flex ${classes.background} overflow-hidden transition-all duration-500`}>
      {/* Left Sidebar */}
      <div className={`w-[420px] ${classes.card} ${classes.shadow} shadow-xl ${classes.border} border-r flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 bg-gradient-to-r from-purple-600 to-blue-600">
          <div className="flex items-center justify-between mb-3">
            <motion.button
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => router.push('/dashboard')}
              className="flex items-center text-white/90 hover:text-white transition-all text-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              <span className="font-medium">Dashboard</span>
            </motion.button>

            {/* Theme Toggle & Network Status */}
            <div className="flex items-center space-x-2">
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={toggleTheme}
                className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-all"
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

              {networkStatus.isOnline ? (
                <Wifi className="w-5 h-5 text-green-300" />
              ) : (
                <WifiOff className="w-5 h-5 text-red-300" />
              )}
            </div>
          </div>

          <div className="mb-4">
            <h1 className="text-lg font-bold text-white">Printer Management</h1>
            <p className="text-purple-100 text-xs">Configure thermal receipt printers</p>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={() => setShowAddModal(true)}
              className="w-full bg-purple-500 hover:bg-purple-400 text-white font-semibold py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Printer</span>
            </motion.button>

            <motion.button
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.99 }}
              onClick={detectUSBPrinters}
              disabled={isDetectingUSB}
              className="w-full bg-blue-500 hover:bg-blue-400 text-white font-semibold py-2.5 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isDetectingUSB ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Detecting...</span>
                </>
              ) : (
                <>
                  <Usb className="w-4 h-4" />
                  <span>Detect USB</span>
                </>
              )}
            </motion.button>
          </div>

          {/* Network Printing Settings */}
          <div className={`mt-4 pt-4 border-t ${isDark ? 'border-purple-700/30' : 'border-purple-200'}`}>
            <h3 className="text-white text-sm font-bold mb-3 flex items-center">
              <Network className="w-4 h-4 mr-2" />
              Network Printing
            </h3>

            {/* Share Printer Mode Toggle */}
            <div className={`${isDark ? 'bg-white/5' : 'bg-white/20'} backdrop-blur-sm rounded-xl p-3 mb-2`}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-white text-sm font-medium">Share Printer Mode</p>
                  <p className="text-purple-100 text-xs">For terminals WITHOUT printer</p>
                </div>
                <button
                  onClick={() => handleToggleShareMode(!sharePrinterMode)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    sharePrinterMode ? 'bg-green-500' : 'bg-gray-400'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      sharePrinterMode ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {sharePrinterMode && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center text-green-300 text-xs mt-2"
                >
                  <Check className="w-3 h-3 mr-1" />
                  <span>Network printing active</span>
                </motion.div>
              )}
            </div>

            {/* I am Server Toggle */}
            <div className={`${isDark ? 'bg-white/5' : 'bg-white/20'} backdrop-blur-sm rounded-xl p-3`}>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <p className="text-white text-sm font-medium">I am Server</p>
                  <p className="text-purple-100 text-xs">For terminal WITH printer</p>
                </div>
                <button
                  onClick={() => handleToggleServerMode(!isServer)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isServer ? 'bg-blue-500' : 'bg-gray-400'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isServer ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
              {isServer && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-center text-blue-300 text-xs mt-2"
                >
                  <Signal className="w-3 h-3 mr-1" />
                  <span>Listening for print jobs...</span>
                </motion.div>
              )}
            </div>

            {!sharePrinterMode && !isServer && (
              <div className="mt-2 text-purple-200 text-xs flex items-center">
                <Info className="w-3 h-3 mr-1" />
                <span>Turn on "Share Printer" on client terminals OR "I am Server" on terminal with printer</span>
              </div>
            )}
          </div>
        </div>

        {/* Detected USB Printers */}
        <AnimatePresence>
          {detectedUSBPrinters.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`${classes.border} border-b ${isDark ? 'bg-blue-900/10' : 'bg-blue-50'}`}
            >
              <div className="p-4">
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-3 flex items-center`}>
                  <Usb className="w-4 h-4 mr-2 text-blue-600" />
                  Found {detectedUSBPrinters.length} USB Printer(s)
                </h3>
                <div className="space-y-2">
                  {detectedUSBPrinters.map((printer, index) => (
                    <motion.div
                      key={printer.port}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`${classes.card} ${classes.border} border rounded-xl p-3 flex justify-between items-center hover:shadow-md transition-all`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Usb className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                          <div className={`font-medium ${classes.textPrimary} text-sm`}>
                            {printer.port}
                          </div>
                          <div className={`text-xs ${classes.textSecondary}`}>
                            {printer.name}
                          </div>
                          {printer.manufacturer && printer.manufacturer !== 'Unknown' && (
                            <div className={`text-xs ${classes.textSecondary}`}>
                              {printer.manufacturer}
                            </div>
                          )}
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addDetectedUSBPrinter(printer)}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-medium hover:bg-blue-700 transition-colors"
                      >
                        Add
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Discovered Ethernet Printers */}
        <AnimatePresence>
          {discoveredPrinters.length > 0 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className={`${classes.border} border-b ${isDark ? 'bg-green-900/10' : 'bg-green-50'}`}
            >
              <div className="p-4">
                <h3 className={`text-sm font-bold ${classes.textPrimary} mb-3 flex items-center`}>
                  <Zap className="w-4 h-4 mr-2 text-green-600" />
                  Found {discoveredPrinters.length} Printer(s)
                </h3>
                <div className="space-y-2">
                  {discoveredPrinters.map((printer, index) => (
                    <motion.div
                      key={printer.ip}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className={`${classes.card} ${classes.border} border rounded-xl p-3 flex justify-between items-center hover:shadow-md transition-all`}
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                          <Network className="w-4 h-4 text-green-600" />
                        </div>
                        <div>
                          <div className={`font-medium ${classes.textPrimary} text-sm`}>
                            {printer.ip}:{printer.port}
                          </div>
                          <div className={`text-xs ${classes.textSecondary}`}>
                            Thermal printer detected
                          </div>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => addDiscoveredPrinter(printer)}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 transition-colors"
                      >
                        Add
                      </motion.button>
                    </motion.div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Printers List */}
        <div className="flex-1 overflow-y-auto p-4">
          {printers.length === 0 ? (
            <div className="text-center py-8">
              <div className={`w-16 h-16 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                <Printer className={`w-8 h-8 ${classes.textSecondary}`} />
              </div>
              <h3 className={`text-lg font-semibold ${classes.textSecondary} mb-2`}>No Printers</h3>
              <p className={`${classes.textSecondary} text-sm`}>Add your first printer to get started</p>
            </div>
          ) : (
            <div className="space-y-3">
              <h3 className={`text-xs font-semibold ${classes.textSecondary} uppercase tracking-wider mb-3`}>
                Configured Printers ({printers.length})
              </h3>
              <AnimatePresence>
                {printers.map((printer, index) => (
                  <motion.div
                    key={printer.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: index * 0.05 }}
                    className={`${classes.card} rounded-xl ${classes.shadow} shadow-lg hover:shadow-xl transition-all duration-300 ${classes.border} border overflow-hidden group`}
                  >
                    <div className="p-4">
                      {/* Header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center space-x-3">
                          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                            printer.is_default 
                              ? 'bg-gradient-to-br from-purple-500 to-blue-500' 
                              : isDark ? 'bg-gray-600' : 'bg-gray-300'
                          }`}>
                            {printer.is_default ? (
                              <Star className="w-6 h-6 text-white" />
                            ) : (
                              <Printer className={`w-6 h-6 ${isDark ? 'text-gray-300' : 'text-gray-600'}`} />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center space-x-2">
                              <h4 className={`font-bold ${classes.textPrimary} text-sm`}>
                                {printer.name}
                              </h4>
                              {printer.is_default && (
                                <span className="px-2 py-0.5 bg-purple-100 text-purple-600 text-xs font-medium rounded-full">
                                  Default
                                </span>
                              )}
                            </div>
                            <p className={`${classes.textSecondary} text-xs flex items-center space-x-2`}>
                              {printer.connection_type === 'windows_usb' ? (
                                <>
                                  <Monitor className="w-3 h-3" />
                                  <span>{printer.usb_printer_name || 'Windows USB Printer'}</span>
                                </>
                              ) : printer.printer_type === 'usb' ? (
                                <>
                                  <Usb className="w-3 h-3" />
                                  <span>{printer.usb_port || 'USB Printer'}</span>
                                </>
                              ) : (
                                <>
                                  <Network className="w-3 h-3" />
                                  <span>{printer.ip_address}:{printer.port}</span>
                                </>
                              )}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        {getConnectionStatusBadge(printer)}
                      </div>

                      {/* Quick Actions */}
                      <div className="flex items-center justify-between space-x-2">
                        <div className="flex items-center space-x-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => testPrinterConnection(
                              printer.id,
                              printer.connection_type === 'windows_usb' ? 'windows_usb' : (printer.printer_type || 'ip'),
                              printer.connection_type === 'windows_usb' ? printer.usb_printer_name : (printer.printer_type === 'usb' ? printer.usb_port : printer.ip_address),
                              printer.port,
                              true
                            )}
                            disabled={testingPrinter === printer.id}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                              testingPrinter === printer.id
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                            }`}
                          >
                            <Signal className="w-3 h-3" />
                            <span>Test</span>
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => testPrintReceipt(printer)}
                            disabled={testingPrinter === printer.id}
                            className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors flex items-center space-x-2 ${
                              testingPrinter === printer.id
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                : 'bg-green-100 text-green-600 hover:bg-green-200'
                            }`}
                          >
                            <Printer className="w-3 h-3" />
                            <span>Print</span>
                          </motion.button>
                        </div>

                        <div className="flex items-center space-x-1">
                          {!printer.is_default && (
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => setAsDefault(printer.id)}
                              className="p-2 rounded-lg bg-purple-100 text-purple-600 hover:bg-purple-200 transition-colors"
                              title="Set as default"
                            >
                              <Star className="w-3 h-3" />
                            </motion.button>
                          )}

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleEdit(printer)}
                            className="p-2 rounded-lg bg-orange-100 text-orange-600 hover:bg-orange-200 transition-colors"
                            title="Edit printer"
                          >
                            <Edit3 className="w-3 h-3" />
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => openDeleteModal(printer.id, printer.name)}
                            className="p-2 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition-colors"
                            title="Delete printer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </motion.button>
                        </div>
                      </div>

                      {/* Last Connected */}
                      {printer.last_connected_at && (
                        <div className={`mt-3 pt-3 ${classes.border} border-t text-xs ${classes.textSecondary} flex items-center space-x-2`}>
                          <Activity className="w-3 h-3" />
                          <span>Last active: {new Date(printer.last_connected_at).toLocaleString()}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Enhanced Main Content */}
      <div className={`flex-1 flex flex-col ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
        {/* Enhanced Header */}
        <div className={`${classes.card} ${classes.shadow} shadow-sm ${classes.border} border-b p-6`}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-2xl font-bold ${classes.textPrimary} flex items-center space-x-3`}>
                <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-500 rounded-xl flex items-center justify-center">
                  <Printer className="w-5 h-5 text-white" />
                </div>
                <span>Thermal Printer Management</span>
              </h1>
              <p className={`${classes.textSecondary} text-sm mt-1`}>
                Configure and manage your thermal printers for order receipts
              </p>
            </div>
            <div className="text-right">
              <div className={`text-xs ${classes.textSecondary}`}>
                {new Date().toLocaleDateString()}
              </div>
              <div className={`text-sm font-semibold ${classes.textPrimary}`}>
                {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true })}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Main Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {printers.length === 0 && discoveredPrinters.length === 0 ? (
            <div className="text-center py-20">
              <div className={`w-32 h-32 ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full flex items-center justify-center mx-auto mb-8`}>
                <Printer className={`w-16 h-16 ${classes.textSecondary}`} />
              </div>
              <h3 className={`text-3xl font-bold ${classes.textSecondary} mb-4`}>
                No Printers Configured
              </h3>
              <p className={`${classes.textSecondary} text-lg mb-8 max-w-md mx-auto`}>
                Get started by adding your first thermal printer to begin printing receipts.
              </p>
              <div className="flex justify-center">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowAddModal(true)}
                  className="px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 flex items-center space-x-2"
                >
                  <Plus className="w-5 h-5" />
                  <span>Add Printer</span>
                </motion.button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Kitchen Token Routing */}
              {printers.length > 0 && (categories.length > 0 || deals.length > 0) && (
                <div className={`${classes.card} rounded-2xl ${classes.shadow} shadow-lg ${classes.border} border p-6`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <h2 className={`text-xl font-bold ${classes.textPrimary} flex items-center space-x-2`}>
                        <Settings className="w-5 h-5 text-orange-500" />
                        <span>Kitchen Token Routing</span>
                      </h2>
                      <p className={`text-xs ${classes.textSecondary} mt-1`}>
                        Per printer: toggle <strong>All Items</strong> to receive every order item, or pick specific categories/deals.
                      </p>
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={saveRoutingMappings}
                      disabled={savingMappings}
                      className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-semibold rounded-xl text-sm flex items-center space-x-2 transition-colors"
                    >
                      {savingMappings ? (
                        <><RefreshCw className="w-4 h-4 animate-spin" /><span>Saving…</span></>
                      ) : (
                        <><Check className="w-4 h-4" /><span>Save Routing</span></>
                      )}
                    </motion.button>
                  </div>

                  <div className="space-y-3 mt-4">
                    {printers.map(printer => {
                      const isBroadcast = broadcastPrinterIds.includes(printer.id)
                      const connInfo = printer.ip_address || printer.usb_port || printer.connection_type || ''
                      return (
                        <div key={printer.id} className={`rounded-xl border ${classes.border} overflow-hidden`}>
                          {/* Printer header */}
                          <div className={`flex items-center justify-between px-4 py-3 ${isDark ? 'bg-gray-800' : 'bg-gray-50'}`}>
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-sm font-semibold ${classes.textPrimary} truncate`}>{printer.name}</span>
                              {connInfo && <span className={`text-xs ${classes.textSecondary} shrink-0`}>{connInfo}</span>}
                            </div>
                            <button
                              onClick={() => setBroadcastPrinterIds(prev =>
                                isBroadcast ? prev.filter(id => id !== printer.id) : [...prev, printer.id]
                              )}
                              className={`ml-3 shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                isBroadcast
                                  ? 'bg-green-500 hover:bg-green-600 text-white'
                                  : `${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-white hover:bg-gray-100 text-gray-600 border border-gray-300'}`
                              }`}
                            >
                              {isBroadcast ? '✓ All Items' : 'All Items'}
                            </button>
                          </div>

                          {/* Categories / Deals — hidden when broadcast is on */}
                          {isBroadcast ? (
                            <div className={`px-4 py-2.5 ${isDark ? 'bg-gray-900/40' : 'bg-green-50'}`}>
                              <p className="text-xs text-green-600 font-medium">Receives every item from every order — no need to select categories.</p>
                            </div>
                          ) : (
                            <div className={`px-4 py-3 ${isDark ? 'bg-gray-900/20' : 'bg-white'}`}>
                              {categories.length > 0 && (
                                <div className="mb-2">
                                  <p className={`text-xs font-medium ${classes.textSecondary} mb-1.5`}>Categories</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {categories.map(cat => {
                                      const isChecked = categoryMappings[`category:${cat.id}`] === printer.id
                                      return (
                                        <button
                                          key={cat.id}
                                          onClick={() => setCategoryMappings(prev => ({
                                            ...prev,
                                            [`category:${cat.id}`]: isChecked ? null : printer.id
                                          }))}
                                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                            isChecked
                                              ? 'bg-orange-500 text-white'
                                              : `${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
                                          }`}
                                        >
                                          {cat.name}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {deals.length > 0 && (
                                <div>
                                  <p className={`text-xs font-medium ${classes.textSecondary} mb-1.5`}>Deals</p>
                                  <div className="flex flex-wrap gap-1.5">
                                    {deals.map(deal => {
                                      const isChecked = categoryMappings[`deal:${deal.id}`] === printer.id
                                      return (
                                        <button
                                          key={deal.id}
                                          onClick={() => setCategoryMappings(prev => ({
                                            ...prev,
                                            [`deal:${deal.id}`]: isChecked ? null : printer.id
                                          }))}
                                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                                            isChecked
                                              ? 'bg-orange-500 text-white'
                                              : `${isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`
                                          }`}
                                        >
                                          {deal.name}
                                        </button>
                                      )
                                    })}
                                  </div>
                                </div>
                              )}
                              {categories.length === 0 && deals.length === 0 && (
                                <p className={`text-xs ${classes.textSecondary}`}>No categories or deals found.</p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Enhanced Add/Edit Printer Modal */}
      <Modal
        isOpen={showAddModal}
        onClose={resetForm}
        title={editingPrinter ? 'Edit Printer Configuration' : 'Add New Thermal Printer'}
        maxWidth="max-w-lg"
      >
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                Printer Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                placeholder="Kitchen Printer, Receipt Printer, etc."
                className={`w-full px-4 py-3 ${classes.border} border rounded-xl ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                required
              />
              <p className={`text-xs ${classes.textSecondary} mt-1`}>Give your printer a descriptive name</p>
            </div>

            {/* Printer Type Selection */}
            <div>
              <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                Printer Type *
              </label>
              <div className="grid grid-cols-3 gap-3">
                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setFormData(prev => ({ ...prev, printer_type: 'ip' }))}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    formData.printer_type === 'ip'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : `${classes.border} ${classes.card}`
                  }`}
                >
                  <Network className={`w-5 h-5 mx-auto mb-1 ${formData.printer_type === 'ip' ? 'text-purple-600' : classes.textSecondary}`} />
                  <div className={`text-xs font-medium ${formData.printer_type === 'ip' ? 'text-purple-600' : classes.textPrimary}`}>
                    Network (IP)
                  </div>
                  <div className={`text-xs ${classes.textSecondary} mt-0.5`}>Ethernet/WiFi</div>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setFormData(prev => ({ ...prev, printer_type: 'usb' }))}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    formData.printer_type === 'usb'
                      ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                      : `${classes.border} ${classes.card}`
                  }`}
                >
                  <Usb className={`w-5 h-5 mx-auto mb-1 ${formData.printer_type === 'usb' ? 'text-purple-600' : classes.textSecondary}`} />
                  <div className={`text-xs font-medium ${formData.printer_type === 'usb' ? 'text-purple-600' : classes.textPrimary}`}>
                    USB/Serial
                  </div>
                  <div className={`text-xs ${classes.textSecondary} mt-0.5`}>COM port</div>
                </motion.button>

                <motion.button
                  type="button"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    setFormData(prev => ({ ...prev, printer_type: 'windows_usb' }))
                    loadWindowsPrinters()
                  }}
                  className={`p-3 rounded-xl border-2 transition-all ${
                    formData.printer_type === 'windows_usb'
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                      : `${classes.border} ${classes.card}`
                  }`}
                >
                  <Monitor className={`w-5 h-5 mx-auto mb-1 ${formData.printer_type === 'windows_usb' ? 'text-green-600' : classes.textSecondary}`} />
                  <div className={`text-xs font-medium ${formData.printer_type === 'windows_usb' ? 'text-green-600' : classes.textPrimary}`}>
                    Windows USB
                  </div>
                  <div className={`text-xs ${classes.textSecondary} mt-0.5`}>USB001 device</div>
                </motion.button>
              </div>
            </div>

            {/* Conditional Fields Based on Printer Type */}
            {formData.printer_type === 'ip' ? (
              <div className="grid grid-cols-3 gap-4">
                <div className="col-span-2">
                  <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                    IP Address *
                  </label>
                  <input
                    type="text"
                    name="ip_address"
                    value={formData.ip_address}
                    onChange={handleInputChange}
                    placeholder="192.168.1.100"
                    className={`w-full px-4 py-3 ${classes.border} border rounded-xl ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                    required
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                    Port *
                  </label>
                  <input
                    type="number"
                    name="port"
                    value={formData.port}
                    onChange={handleInputChange}
                    placeholder="9100"
                    min="1"
                    max="65535"
                    className={`w-full px-4 py-3 ${classes.border} border rounded-xl ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                    required
                  />
                </div>
              </div>
            ) : formData.printer_type === 'windows_usb' ? (
              <div>
                <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                  Windows Printer *
                </label>
                <div className="flex gap-2">
                  <select
                    name="usb_printer_name"
                    value={formData.usb_printer_name}
                    onChange={handleInputChange}
                    className={`flex-1 px-4 py-3 ${classes.border} border rounded-xl ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all`}
                    required
                  >
                    <option value="">-- Select a printer --</option>
                    {windowsPrinters.map(p => (
                      <option key={p.name} value={p.name}>{p.name}</option>
                    ))}
                    {formData.usb_printer_name && !windowsPrinters.find(p => p.name === formData.usb_printer_name) && (
                      <option value={formData.usb_printer_name}>{formData.usb_printer_name}</option>
                    )}
                  </select>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={loadWindowsPrinters}
                    disabled={isLoadingWindowsPrinters}
                    className="px-3 py-2 bg-green-500 hover:bg-green-400 text-white rounded-xl disabled:opacity-50"
                    title="Refresh printer list"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoadingWindowsPrinters ? 'animate-spin' : ''}`} />
                  </motion.button>
                </div>
                <p className={`text-xs ${classes.textSecondary} mt-1`}>
                  These are printers shown in Windows "Devices &amp; Printers". Your BC89AC USB printer should appear here.
                </p>
                {windowsPrinters.length === 0 && !isLoadingWindowsPrinters && (
                  <p className="text-xs text-amber-500 mt-1">No printers found — click the refresh button or check that your printer is installed in Windows.</p>
                )}
              </div>
            ) : (
              <div>
                <label className={`block text-sm font-medium ${classes.textPrimary} mb-2`}>
                  USB Port *
                </label>
                <input
                  type="text"
                  name="usb_port"
                  value={formData.usb_port}
                  onChange={handleInputChange}
                  placeholder="COM3 (Windows) or /dev/usb/lp0 (Linux)"
                  className={`w-full px-4 py-3 ${classes.border} border rounded-xl ${classes.card} ${classes.textPrimary} focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`}
                  required
                />
                <p className={`text-xs ${classes.textSecondary} mt-1`}>
                  Windows: COM1-COM20 | Linux/Mac: /dev/usb/lp0 or /dev/ttyUSB0
                </p>
              </div>
            )}

            <div className={`p-4 rounded-xl ${isDark ? 'bg-blue-900/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'} border`}>
              <div className="flex items-center space-x-3">
                <input
                  type="checkbox"
                  id="is_default"
                  name="is_default"
                  checked={formData.is_default}
                  onChange={handleInputChange}
                  className="w-4 h-4 text-purple-600 bg-gray-100 border-gray-300 rounded focus:ring-purple-500 focus:ring-2"
                />
                <label htmlFor="is_default" className={`text-sm font-medium ${classes.textPrimary} flex items-center space-x-2`}>
                  <Star className="w-4 h-4 text-purple-600" />
                  <span>Set as default printer for orders</span>
                </label>
              </div>
              <p className={`text-xs ${classes.textSecondary} mt-2 ml-7`}>
                The default printer will be used automatically for printing receipts
              </p>
            </div>
          </div>

          <div className="flex space-x-4 pt-4">
            <motion.button
              type="button"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={resetForm}
              className={`flex-1 py-3 px-4 ${classes.border} border-2 ${classes.textPrimary} font-semibold rounded-xl hover:${isDark ? 'bg-gray-700' : 'bg-gray-100'} transition-colors`}
            >
              Cancel
            </motion.button>

            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200"
            >
              {editingPrinter ? 'Update Printer' : 'Add Printer'}
            </motion.button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        title="Delete Printer"
        message={`Are you sure you want to delete "${deleteModal.printerName}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        isLoading={isDeleting}
      />
      </div>
    </ProtectedPage>
  )
}