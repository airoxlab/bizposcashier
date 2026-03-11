// lib/printerManager.js
import { supabase } from './supabaseClient'
import { networkPrintManager } from './networkPrintManager'

class PrinterManager {
  constructor() {
    this.storageKey = 'configured_printers'
    this.defaultPrinterKey = 'default_printer'
    this.lastSyncKey = 'printers_last_sync'
    this.currentUserId = null
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true

    // Listen for online/offline events
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.isOnline = true
        console.log('Network: Online - syncing printers...')
        this.syncPrintersFromDatabase()
      })
      window.addEventListener('offline', () => {
        this.isOnline = false
        console.log('Network: Offline - using cached printers')
      })
    }
  }

  // Check if we're online
  checkOnlineStatus() {
    this.isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true
    return this.isOnline
  }

  // CRITICAL: Set user ID before any operations
  setUserId(userId) {
    this.currentUserId = userId
    console.log('User ID set:', userId)

    // Auto-sync printers when user ID is set (if online)
    if (userId && this.checkOnlineStatus()) {
      this.syncPrintersFromDatabase()
    }
  }

  // Sync printers from Supabase database to localStorage
  async syncPrintersFromDatabase() {
    try {
      if (!this.currentUserId) {
        console.log('Cannot sync printers - no user ID set')
        return false
      }

      if (!this.checkOnlineStatus()) {
        console.log('Cannot sync printers - offline')
        return false
      }

      console.log('Syncing printers from database for user:', this.currentUserId)

      const { data: printers, error } = await supabase
        .from('printers')
        .select('*')
        .eq('is_active', true)
        .eq('created_by', this.currentUserId)
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error syncing printers from database:', error)
        return false
      }

      if (!printers || printers.length === 0) {
        console.log('No printers found in database to sync')
        return true
      }

      // Get existing localStorage printers for this user
      let allPrinters = this.getAllPrintersFromStorage()

      // Remove old printers for this user
      allPrinters = allPrinters.filter(p => p.user_id !== this.currentUserId)

      // Add synced printers
      for (const dbPrinter of printers) {
        // Determine connection type - prefer explicit value, then infer from available data
        const usbPath = dbPrinter.usb_device_path || dbPrinter.usb_port;
        const hasUSB = usbPath && usbPath.trim() !== '';
        const hasIP = dbPrinter.ip_address && dbPrinter.ip_address.trim() !== '';

        // Detect Windows USB printer: stored in DB as connection_type='usb', usb_device_path='WINUSB:<name>'
        const isWindowsUSB = hasUSB && usbPath.startsWith('WINUSB:');
        const winPrinterName = isWindowsUSB ? usbPath.replace(/^WINUSB:/, '') : null;

        // Infer connection type if not explicitly set
        let effectiveConnectionType = isWindowsUSB ? 'windows_usb' : (dbPrinter.connection_type || dbPrinter.printer_type);
        if (!effectiveConnectionType || effectiveConnectionType === 'thermal') {
          effectiveConnectionType = hasUSB ? 'usb' : (hasIP ? 'ethernet' : 'ethernet');
        }

        const printerConfig = {
          id: dbPrinter.id,
          name: dbPrinter.name,
          printer_type: effectiveConnectionType === 'windows_usb' ? 'windows_usb' : (effectiveConnectionType === 'usb' ? 'usb' : 'ip'),
          connection_type: effectiveConnectionType,
          ip_address: dbPrinter.ip_address,
          port: dbPrinter.port || 9100,
          usb_port: isWindowsUSB ? null : usbPath,
          usb_device_path: isWindowsUSB ? null : usbPath,
          usb_printer_name: winPrinterName || dbPrinter.usb_printer_name,
          is_default: dbPrinter.is_default || false,
          connection_status: dbPrinter.connection_status || 'unknown',
          is_active: dbPrinter.is_active,
          last_connected_at: dbPrinter.last_connected_at,
          updated_at: dbPrinter.updated_at || new Date().toISOString(),
          synced_at: new Date().toISOString(),
          user_id: this.currentUserId
        }
        allPrinters.push(printerConfig)
      }

      // Save to localStorage
      localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))

      // Update default printer
      const defaultPrinter = printers.find(p => p.is_default === true) || printers[0]
      if (defaultPrinter) {
        const allDefaults = this.getAllDefaultsFromStorage()
        allDefaults[this.currentUserId] = {
          id: defaultPrinter.id,
          name: defaultPrinter.name,
          ip_address: defaultPrinter.ip_address,
          port: defaultPrinter.port || 9100,
          usb_port: defaultPrinter.usb_device_path || defaultPrinter.usb_port,
          usb_device_path: defaultPrinter.usb_device_path || defaultPrinter.usb_port,
          user_id: this.currentUserId
        }
        localStorage.setItem(this.defaultPrinterKey, JSON.stringify(allDefaults))
      }

      // Update last sync time
      const syncTimes = this.getLastSyncTimes()
      syncTimes[this.currentUserId] = new Date().toISOString()
      localStorage.setItem(this.lastSyncKey, JSON.stringify(syncTimes))

      console.log(`Synced ${printers.length} printers to localStorage`)
      return true
    } catch (error) {
      console.error('Error syncing printers:', error)
      return false
    }
  }

  // Get last sync times
  getLastSyncTimes() {
    try {
      const stored = localStorage.getItem(this.lastSyncKey)
      return stored ? JSON.parse(stored) : {}
    } catch {
      return {}
    }
  }

  // Check if sync is needed (older than 1 hour)
  needsSync() {
    const syncTimes = this.getLastSyncTimes()
    const lastSync = syncTimes[this.currentUserId]
    if (!lastSync) return true

    const hourAgo = new Date(Date.now() - 60 * 60 * 1000)
    return new Date(lastSync) < hourAgo
  }

  // Check if we're in Electron environment
  isElectron() {
    return typeof window !== 'undefined' && window.electronAPI && window.electronAPI.isElectron
  }

  // Save printer configuration - works with both localStorage and Electron
  async savePrinterConfig(printer) {
    try {
      console.log('Saving printer config:', printer)
      
      if (!this.currentUserId) {
        console.error('Cannot save printer - no user ID set!')
        return false
      }
      
      // If in Electron, save to Electron storage first
      if (this.isElectron()) {
        const electronResult = await window.electronAPI.printerSave({
          id: printer.id,
          name: printer.name,
          // IP printer fields
          ip: printer.ip_address,
          ip_address: printer.ip_address,
          port: printer.port || 9100,
          // USB printer fields
          usb_port: printer.usb_device_path || printer.usb_port,
          usb_device_path: printer.usb_device_path || printer.usb_port,
          // Connection type - CRITICAL for routing
          connection_type: printer.connection_type,
          printer_type: printer.connection_type === 'usb' ? 'usb' : (printer.connection_type === 'ethernet' ? 'ip' : printer.printer_type),
          // Other fields
          model: printer.model || 'Generic ESC/POS',
          is_default: printer.is_default,
          user_id: this.currentUserId
        })

        if (!electronResult.success) {
          console.error('Failed to save to Electron storage:', electronResult.error)
          throw new Error(electronResult.error)
        }

        console.log('Saved to Electron storage:', electronResult.printer)
      }
      
      // Always save to localStorage
      return this.saveToLocalStorage(printer)
      
    } catch (error) {
      console.error('Error saving printer config:', error)
      return false
    }
  }

  // Save to localStorage
  saveToLocalStorage(printer) {
    try {
      if (!this.currentUserId) {
        console.error('Cannot save to localStorage - no user ID set!')
        return false
      }

      const printers = this.getAllPrintersFromStorage()
      
      // Check if printer already exists (by ID or IP+port combo)
      const existingIndex = printers.findIndex(p => 
        p.id === printer.id || (p.ip_address === printer.ip_address && p.port === printer.port)
      )
      
      // Determine printer type from connection_type
      const effectivePrinterType = printer.connection_type === 'usb' ? 'usb' :
                                   (printer.connection_type === 'ethernet' ? 'ip' :
                                   (printer.printer_type || 'ip'));

      const printerConfig = {
        id: printer.id || this.generatePrinterId(),
        name: printer.name,
        // CRITICAL: Both fields must be set for proper routing
        printer_type: effectivePrinterType,
        connection_type: printer.connection_type || (effectivePrinterType === 'usb' ? 'usb' : 'ethernet'),
        ip_address: printer.ip_address,
        port: printer.port || 9100,
        usb_port: printer.usb_device_path || printer.usb_port,
        usb_device_path: printer.usb_device_path || printer.usb_port,
        is_default: printer.is_default,
        connection_status: printer.connection_status || 'unknown',
        last_connected_at: printer.last_connected_at,
        updated_at: new Date().toISOString(),
        user_id: this.currentUserId
      }
      
      if (existingIndex >= 0) {
        printers[existingIndex] = printerConfig
      } else {
        printers.push(printerConfig)
      }
      
      // If this is the default printer for this user, unset other defaults for this user
      if (printer.is_default) {
        printers.forEach(p => {
          if (p.user_id === this.currentUserId && p.id !== printerConfig.id) {
            p.is_default = false
          }
        })
        
        // Update default printer for current user
        const allDefaults = this.getAllDefaultsFromStorage()
        allDefaults[this.currentUserId] = printerConfig
        localStorage.setItem(this.defaultPrinterKey, JSON.stringify(allDefaults))
      }
      
      localStorage.setItem(this.storageKey, JSON.stringify(printers))
      console.log('Saved to localStorage for user:', this.currentUserId)
      return true
    } catch (error) {
      console.error('Error saving to localStorage:', error)
      return false
    }
  }

  // Get ALL printers from storage (all users)
  getAllPrintersFromStorage() {
    try {
      const stored = localStorage.getItem(this.storageKey)
      return stored ? JSON.parse(stored) : []
    } catch (error) {
      console.error('Error loading from localStorage:', error)
      return []
    }
  }

  // Get all defaults from storage (all users)
  getAllDefaultsFromStorage() {
    try {
      const stored = localStorage.getItem(this.defaultPrinterKey)
      return stored ? JSON.parse(stored) : {}
    } catch (error) {
      console.error('Error loading defaults from localStorage:', error)
      return {}
    }
  }

  // Get configured printers for CURRENT USER ONLY
  async getConfiguredPrinters() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot get printers - no user ID set!')
        return []
      }

      // If in Electron, get from Electron storage first
      if (this.isElectron()) {
        const electronResult = await window.electronAPI.printerLoad()
        
        if (electronResult.success && electronResult.printers) {
          // Convert Electron format and filter by user
          const convertedPrinters = electronResult.printers
            .map(p => ({
              id: p.id,
              name: p.name,
              ip_address: p.ip || p.ip_address,
              port: p.port || 9100,
              usb_port: p.usb_port || p.usb_device_path,
              usb_device_path: p.usb_device_path || p.usb_port,
              usb_printer_name: p.usb_printer_name || null,
              printer_type: p.printer_type || p.connection_type,
              connection_type: p.connection_type || p.printer_type,
              is_default: p.is_default || false,
              connection_status: p.status || 'unknown',
              last_connected_at: p.updatedAt,
              updated_at: p.updatedAt,
              user_id: p.user_id || this.currentUserId
            }))
            .filter(p => p.user_id === this.currentUserId)

          return convertedPrinters
        }
      }
      
      // Get from localStorage and filter by current user
      return this.getFromLocalStorage()
    } catch (error) {
      console.error('Error loading printers:', error)
      return this.getFromLocalStorage()
    }
  }

  // Get printers from localStorage for current user only
  getFromLocalStorage() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot get from localStorage - no user ID set!')
        return []
      }

      const allPrinters = this.getAllPrintersFromStorage()
      
      // Filter by current user
      const userPrinters = allPrinters.filter(p => p.user_id === this.currentUserId)
      console.log(`Found ${userPrinters.length} printers for user ${this.currentUserId}`)
      
      return userPrinters
    } catch (error) {
      console.error('Error loading from localStorage:', error)
      return []
    }
  }

  // Check if user has any printers configured
  async hasPrintersConfigured() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot check printers - no user ID set!')
        return false
      }

      const printers = await this.getConfiguredPrinters()
      return printers && printers.length > 0
    } catch (error) {
      console.error('Error checking if printers are configured:', error)
      return false
    }
  }

  // Get default printer for current user
  async getDefaultPrinter() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot get default printer - no user ID set!')
        return null
      }

      const printers = await this.getConfiguredPrinters()
      const defaultPrinter = printers.find(p => p.is_default && p.user_id === this.currentUserId)
      
      if (defaultPrinter) {
        return defaultPrinter
      }
      
      // If no default but printers exist, make first one default
      if (printers.length > 0) {
        await this.setDefaultPrinter(printers[0].id)
        return printers[0]
      }
      
      return null
    } catch (error) {
      console.error('Error loading default printer:', error)
      return null
    }
  }

  // Update printer connection status
  async updateConnectionStatus(printerId, isConnected) {
    try {
      if (!this.currentUserId) {
        console.error('Cannot update status - no user ID set!')
        return false
      }

      const allPrinters = this.getAllPrintersFromStorage()
      const printerIndex = allPrinters.findIndex(p => p.id === printerId && p.user_id === this.currentUserId)
      
      if (printerIndex >= 0) {
        allPrinters[printerIndex].connection_status = isConnected ? 'connected' : 'disconnected'
        allPrinters[printerIndex].last_connected_at = isConnected ? new Date().toISOString() : allPrinters[printerIndex].last_connected_at
        allPrinters[printerIndex].updated_at = new Date().toISOString()
        
        localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))
        
        console.log(`Updated printer ${printerId} status: ${isConnected ? 'connected' : 'disconnected'}`)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error updating connection status:', error)
      return false
    }
  }

  // Remove printer
  async removePrinter(printerId) {
    try {
      if (!this.currentUserId) {
        console.error('Cannot remove printer - no user ID set!')
        return false
      }

      if (this.isElectron()) {
        const electronResult = await window.electronAPI.printerDelete(printerId)
        
        if (!electronResult.success) {
          console.error('Failed to remove from Electron storage:', electronResult.error)
          return false
        }
      }
      
      // Remove from localStorage
      let allPrinters = this.getAllPrintersFromStorage()
      const removedPrinter = allPrinters.find(p => p.id === printerId && p.user_id === this.currentUserId)
      
      // Remove only if it belongs to current user
      allPrinters = allPrinters.filter(p => !(p.id === printerId && p.user_id === this.currentUserId))
      localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))
      
      // Update defaults if needed
      if (removedPrinter && removedPrinter.is_default) {
        const allDefaults = this.getAllDefaultsFromStorage()
        delete allDefaults[this.currentUserId]
        
        // Set new default if other printers exist
        const userPrinters = allPrinters.filter(p => p.user_id === this.currentUserId)
        if (userPrinters.length > 0) {
          userPrinters[0].is_default = true
          allDefaults[this.currentUserId] = userPrinters[0]
          localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))
        }
        
        localStorage.setItem(this.defaultPrinterKey, JSON.stringify(allDefaults))
      }
      
      console.log('Printer removed:', printerId)
      return true
    } catch (error) {
      console.error('Error removing printer:', error)
      return false
    }
  }

  // Set printer as default
  async setDefaultPrinter(printerId) {
    try {
      if (!this.currentUserId) {
        console.error('Cannot set default - no user ID set!')
        return false
      }

      const allPrinters = this.getAllPrintersFromStorage()
      let newDefaultPrinter = null
      
      // Update printers: unset defaults for current user, set new default
      allPrinters.forEach(p => {
        if (p.user_id === this.currentUserId) {
          if (p.id === printerId) {
            p.is_default = true
            newDefaultPrinter = p
          } else {
            p.is_default = false
          }
        }
      })
      
      if (newDefaultPrinter) {
        localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))
        
        // Update default for this user
        const allDefaults = this.getAllDefaultsFromStorage()
        allDefaults[this.currentUserId] = newDefaultPrinter
        localStorage.setItem(this.defaultPrinterKey, JSON.stringify(allDefaults))
        
        console.log('Default printer updated:', newDefaultPrinter.name)
        return true
      }
      
      return false
    } catch (error) {
      console.error('Error setting default printer:', error)
      return false
    }
  }

  // CRITICAL: Get printer info for thermal printing - OFFLINE-FIRST approach
  // Uses localStorage first to work offline, then syncs from database when online
  async getPrinterForPrinting() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot get printer for printing - no user ID set!')
        return null
      }

      console.log('Getting printer for printing for user:', this.currentUserId)
      console.log('  - Online status:', this.checkOnlineStatus() ? 'Online' : 'Offline')

      // OFFLINE-FIRST: Always try localStorage first for instant response
      const localPrinter = await this.getPrinterFromLocalStorage()

      // If online and sync is needed, sync in background (don't wait)
      if (this.checkOnlineStatus() && this.needsSync()) {
        console.log('Background sync triggered...')
        this.syncPrintersFromDatabase().catch(err =>
          console.warn('Background sync failed:', err)
        )
      }

      // If we have a local printer, use it
      if (localPrinter) {
        console.log('Using printer from localStorage:', localPrinter.name)
        return localPrinter
      }

      // No local printer - try to fetch from database if online
      if (this.checkOnlineStatus()) {
        console.log('No local printer found, fetching from database...')

        const { data: printers, error } = await supabase
          .from('printers')
          .select('*')
          .eq('is_active', true)
          .eq('created_by', this.currentUserId)
          .order('is_default', { ascending: false })
          .order('created_at', { ascending: false })

        if (error) {
          console.error('Error loading printers from database:', error)
          return null
        }

        if (!printers || printers.length === 0) {
          console.warn('No printers found in database - user needs to configure a printer first')
          return null
        }

        // Sync to localStorage for future offline use
        await this.syncPrintersFromDatabase()

        // Get the default printer or the first one
        const defaultPrinter = printers.find(p => p.is_default === true) || printers[0]

        // Determine printer type from available fields
        const usbPort = defaultPrinter.usb_device_path || defaultPrinter.usb_port;
        const ipAddr = defaultPrinter.ip_address;
        const hasUSB = usbPort && usbPort.trim() !== '';
        const hasIP = ipAddr && ipAddr.trim() !== '';

        // Get connection type - prefer explicit value, but infer if needed
        let printerType = defaultPrinter.connection_type || defaultPrinter.printer_type;

        // If printer_type is 'thermal' or not set, infer from available data
        if (!printerType || printerType === 'thermal') {
          printerType = hasUSB ? 'usb' : (hasIP ? 'ethernet' : null);
        }

        // Normalize to 'usb' or 'ip'
        if (printerType === 'ethernet' || printerType === 'network') {
          printerType = 'ip';
        }

        console.log('Found printer from database:', defaultPrinter.name)
        console.log('  - Raw connection_type:', defaultPrinter.connection_type)
        console.log('  - Raw printer_type:', defaultPrinter.printer_type)
        console.log('  - Resolved Type:', printerType)
        console.log('  - IP:', ipAddr || 'N/A')
        console.log('  - USB Port:', usbPort || 'N/A')

        // Detect Windows USB printer stored with WINUSB: prefix
        const isWinUSBDB = hasUSB && usbPort.startsWith('WINUSB:');
        const resolvedTypeDB = isWinUSBDB ? 'windows_usb' : (printerType === 'usb' ? 'usb' : 'ethernet');

        return {
          name: defaultPrinter.name,
          printer_type: resolvedTypeDB,
          connection_type: resolvedTypeDB,
          ip_address: ipAddr,
          ip: ipAddr,
          port: defaultPrinter.port || 9100,
          usb_port: isWinUSBDB ? null : usbPort,
          usb_device_path: isWinUSBDB ? null : usbPort,
          usb_printer_name: isWinUSBDB ? usbPort.replace(/^WINUSB:/, '') : null,
          id: defaultPrinter.id
        }
      }

      console.warn('Offline and no printer found in localStorage - user needs to configure a printer first')
      return null

    } catch (error) {
      console.error('Error getting printer for printing:', error)
      // Final fallback to localStorage
      return await this.getPrinterFromLocalStorage()
    }
  }

  // Fallback method for localStorage
  async getPrinterFromLocalStorage() {
    try {
      console.log('Attempting to get printer from localStorage as fallback')
      const printers = await this.getConfiguredPrinters()

      if (!printers || printers.length === 0) {
        console.warn('No printers configured in localStorage - user needs to configure a printer first')
        return null
      }

      const defaultPrinter = printers.find(p => p.is_default && p.user_id === this.currentUserId)
      const printer = defaultPrinter || printers[0]

      if (printer) {
        // Get USB and IP values with fallbacks
        const usbPort = printer.usb_device_path || printer.usb_port || '';
        const ipAddr = printer.ip_address || printer.ip || '';

        // Determine printer type from available fields - check connection_type first
        let printerType = printer.printer_type || printer.connection_type;

        // If no explicit type, infer from available data
        if (!printerType || printerType === 'unknown') {
          if (usbPort && usbPort.trim() !== '') {
            printerType = 'usb';
          } else if (ipAddr && ipAddr.trim() !== '') {
            printerType = 'ip';
          } else {
            // Default to 'ip' if nothing else specified
            printerType = 'ip';
          }
        }

        // Normalize connection type
        if (printerType === 'ethernet' || printerType === 'network') {
          printerType = 'ip';
        }

        console.log('Found printer from localStorage:', printer.name)
        console.log('  - Type:', printerType)
        console.log('  - IP:', ipAddr || 'N/A')
        console.log('  - USB Port:', usbPort || 'N/A')
        console.log('  - Raw printer data:', JSON.stringify(printer, null, 2))

        // Detect Windows USB printer from either WINUSB: prefix or windows_usb connection type
        const isWinUSBLocal = (usbPort && usbPort.startsWith('WINUSB:')) || printerType === 'windows_usb';
        const winNameLocal = isWinUSBLocal
          ? (printer.usb_printer_name || (usbPort && usbPort.startsWith('WINUSB:') ? usbPort.replace(/^WINUSB:/, '') : null))
          : null;
        const resolvedTypeLocal = isWinUSBLocal ? 'windows_usb' : printerType;

        return {
          name: printer.name,
          printer_type: resolvedTypeLocal,
          connection_type: resolvedTypeLocal,
          ip_address: ipAddr,
          ip: ipAddr,
          port: printer.port || 9100,
          usb_port: isWinUSBLocal ? null : usbPort,
          usb_device_path: isWinUSBLocal ? null : usbPort,
          usb_printer_name: winNameLocal,
          id: printer.id
        }
      }

      return null
    } catch (error) {
      console.error('Error getting from localStorage:', error)
      return null
    }
  }

  // Test printer connection
  async testPrinterConnection(ip, port) {
    if (this.isElectron()) {
      try {
        return await window.electronAPI.printerTestConnection({ ip, port })
      } catch (error) {
        console.error('Error testing connection:', error)
        return { success: false, error: error.message }
      }
    } else {
      throw new Error('Printer testing only available in desktop app')
    }
  }

  // Print receipt
  async printReceipt(orderData, userProfile, printerConfig) {
    // Check if network printing should be used (client terminal)
    if (networkPrintManager.shouldUseNetwork()) {
      console.log('🌐 Network printing mode enabled - sending print job to network')
      try {
        const printData = {
          orderData,
          userProfile,
          printerConfig
        }
        const result = await networkPrintManager.sendPrintJobToNetwork(
          JSON.stringify(printData),
          this.currentUserId
        )

        if (result.success) {
          console.log('✅ Print job sent to network successfully')
          return { success: true, message: 'Print job sent to network printer' }
        } else {
          console.error('❌ Failed to send print job to network:', result.error)
          return { success: false, error: result.error || 'Failed to send to network' }
        }
      } catch (error) {
        console.error('❌ Network printing error:', error)
        return { success: false, error: error.message }
      }
    }

    if (this.isElectron()) {
      try {
        console.log('Receipt - Printer config:', JSON.stringify(printerConfig, null, 2));

        const usbPort = printerConfig.usb_port || printerConfig.usb_device_path;
        const ipAddress = printerConfig.ip_address || printerConfig.ip;
        const connectionType = printerConfig.connection_type || printerConfig.printer_type;

        // Log raw values for debugging
        console.log('Receipt - Raw printer values:');
        console.log('  - printerConfig.connection_type:', printerConfig.connection_type);
        console.log('  - printerConfig.printer_type:', printerConfig.printer_type);
        console.log('  - printerConfig.usb_port:', printerConfig.usb_port);
        console.log('  - printerConfig.usb_device_path:', printerConfig.usb_device_path);
        console.log('  - printerConfig.ip_address:', printerConfig.ip_address);
        console.log('  - printerConfig.ip:', printerConfig.ip);

        // CRITICAL: Determine printer type
        // Check USB data FIRST, as USB printers might have leftover IP data
        let printerType;
        const hasUSB = usbPort && usbPort.trim() !== '';
        const hasIP = ipAddress && ipAddress.trim() !== '';

        // 0. Windows USB Printer Class (USB001 / Devices & Printers) - check FIRST
        // Detect both explicit connection_type='windows_usb' AND the WINUSB: prefix
        // stored in usb_device_path when loaded from Supabase/localStorage as connection_type='usb'
        const winPrinterNameFromPort = hasUSB && usbPort.startsWith('WINUSB:') ? usbPort.replace(/^WINUSB:/, '') : null;
        const winPrinterName = printerConfig.usb_printer_name || winPrinterNameFromPort;

        if (connectionType === 'windows_usb' || winPrinterNameFromPort) {
          if (!winPrinterName) {
            return { success: false, error: 'Windows USB printer selected but no printer name configured' };
          }
          console.log('Routing receipt to Windows USB printer:', winPrinterName);
          return await window.electronAPI.printerPrintWindowsUSB({
            orderData,
            userProfile,
            printerConfig: { ...printerConfig, usb_printer_name: winPrinterName }
          });
        }

        // 1. If connection_type explicitly says 'usb', use USB
        if (connectionType === 'usb') {
          printerType = 'usb';
        }
        // 2. If connection_type explicitly says 'ethernet' or 'ip', use IP
        else if (connectionType === 'ethernet' || connectionType === 'ip' || connectionType === 'network') {
          printerType = 'ip';
        }
        // 3. If connection_type is 'thermal' or undefined, infer from data - USB takes priority
        else if (hasUSB) {
          printerType = 'usb';
          console.log('  >> Inferred USB from usb_port/usb_device_path');
        } else if (hasIP) {
          printerType = 'ip';
          console.log('  >> Inferred IP from ip_address');
        } else {
          console.error('Cannot determine printer type - no USB port or IP address');
          return { success: false, error: 'Printer configuration missing connection details' };
        }

        console.log('Receipt - Determined printer type:', printerType);
        console.log('  - Connection Type from config:', connectionType || 'N/A');
        console.log('  - USB Port:', usbPort || 'N/A');
        console.log('  - IP Address:', ipAddress || 'N/A');

        if (printerType === 'usb') {
          if (!usbPort || usbPort.trim() === '') {
            return { success: false, error: 'USB printer selected but no USB port configured' };
          }
          console.log('Routing receipt to USB printer:', usbPort);
          return await window.electronAPI.printerPrintUSB({
            orderData,
            userProfile,
            printerConfig: { ...printerConfig, usb_port: usbPort }
          });
        } else {
          if (!ipAddress || ipAddress.trim() === '') {
            return { success: false, error: 'IP printer selected but no IP address configured' };
          }
          console.log('Routing receipt to IP printer:', ipAddress);
          return await window.electronAPI.printerPrintReceipt({
            orderData,
            userProfile,
            printerConfig: { ...printerConfig, ip_address: ipAddress }
          });
        }
      } catch (error) {
        console.error('Error printing receipt:', error)
        return { success: false, error: error.message }
      }
    } else {
      throw new Error('Printing only available in desktop app')
    }
  }

  // Print kitchen token
  async printKitchenToken(orderData, userProfile, printerConfig) {
    // Check if network printing should be used (client terminal)
    if (networkPrintManager.shouldUseNetwork()) {
      console.log('🌐 Network printing mode enabled - sending kitchen token to network')
      try {
        const printData = {
          orderData,
          userProfile,
          printerConfig,
          printType: 'kitchen_token'
        }
        const result = await networkPrintManager.sendPrintJobToNetwork(
          JSON.stringify(printData),
          this.currentUserId
        )

        if (result.success) {
          console.log('✅ Kitchen token sent to network successfully')
          return { success: true, message: 'Kitchen token sent to network printer' }
        } else {
          console.error('❌ Failed to send kitchen token to network:', result.error)
          return { success: false, error: result.error || 'Failed to send to network' }
        }
      } catch (error) {
        console.error('❌ Network printing error for kitchen token:', error)
        return { success: false, error: error.message }
      }
    }

    if (this.isElectron()) {
      try {
        console.log('Kitchen token - Printer config:', JSON.stringify(printerConfig, null, 2));

        // Get connection details with fallbacks
        let usbPort = printerConfig.usb_port || printerConfig.usb_device_path || '';
        let ipAddress = printerConfig.ip_address || printerConfig.ip || '';
        let connectionType = printerConfig.connection_type || printerConfig.printer_type || '';

        // Normalize connection type
        if (connectionType === 'ethernet' || connectionType === 'network') {
          connectionType = 'ip';
        }

        // If no connection details, try to get from Electron storage
        if ((!usbPort || usbPort.trim() === '') && (!ipAddress || ipAddress.trim() === '')) {
          console.log('No connection details in config, checking Electron storage...');
          try {
            const electronResult = await window.electronAPI.printerLoad();
            if (electronResult.success && electronResult.printers && electronResult.printers.length > 0) {
              const defaultPrinter = electronResult.printers.find(p => p.is_default) || electronResult.printers[0];
              if (defaultPrinter) {
                usbPort = defaultPrinter.usb_port || defaultPrinter.usb_device_path || '';
                ipAddress = defaultPrinter.ip || defaultPrinter.ip_address || '';
                connectionType = defaultPrinter.connection_type || defaultPrinter.printer_type || '';
                console.log('Found printer from Electron storage:', defaultPrinter.name);
              }
            }
          } catch (e) {
            console.warn('Could not load from Electron storage:', e);
          }
        }

        // CRITICAL: Determine printer type - check connection_type FIRST, then fall back to data availability
        let printerType;

        // 0. Windows USB Printer Class (USB001 / Devices & Printers) - check FIRST
        // Detect both explicit connection_type='windows_usb' AND the WINUSB: prefix
        // stored in usb_device_path when loaded from Supabase/localStorage as connection_type='usb'
        const ktWinFromPort = usbPort && usbPort.startsWith('WINUSB:') ? usbPort.replace(/^WINUSB:/, '') : null;
        const ktWinPrinterName = printerConfig.usb_printer_name || ktWinFromPort;

        if (connectionType === 'windows_usb' || ktWinFromPort) {
          if (!ktWinPrinterName) {
            return { success: false, error: 'Windows USB printer selected but no printer name configured' };
          }
          console.log('Routing kitchen token to Windows USB printer:', ktWinPrinterName);
          return await window.electronAPI.printerPrintWindowsUSBKitchen({
            orderData,
            userProfile,
            printerConfig: { ...printerConfig, usb_printer_name: ktWinPrinterName }
          });
        }

        // 1. If connection_type explicitly says 'usb', use USB
        if (connectionType === 'usb') {
          printerType = 'usb';
        }
        // 2. If connection_type explicitly says 'ethernet' or 'ip', use IP
        else if (connectionType === 'ethernet' || connectionType === 'ip') {
          printerType = 'ip';
        }
        // 3. Fall back to checking available data - USB path takes priority
        else if (usbPort && usbPort.trim() !== '') {
          printerType = 'usb';
        } else if (ipAddress && ipAddress.trim() !== '') {
          printerType = 'ip';
        } else {
          console.error('Cannot determine printer type for kitchen token');
          console.error('  - USB Port value:', usbPort);
          console.error('  - IP Address value:', ipAddress);
          console.error('  - Connection Type value:', connectionType);
          return { success: false, error: 'Printer configuration missing connection details. Please reconfigure your printer in Settings.' };
        }

        console.log('Kitchen token - Determined printer type:', printerType);
        console.log('  - Connection Type from config:', connectionType || 'N/A');
        console.log('  - USB Port:', usbPort || 'N/A');
        console.log('  - IP Address:', ipAddress || 'N/A');

        if (printerType === 'usb') {
          if (!usbPort || usbPort.trim() === '') {
            return { success: false, error: 'USB printer selected but no USB port configured' };
          }
          console.log('Routing kitchen token to USB printer:', usbPort);
          return await window.electronAPI.printerPrintUSBKitchenToken({
            orderData,
            userProfile,
            printerConfig: { ...printerConfig, usb_port: usbPort }
          });
        } else {
          if (!ipAddress || ipAddress.trim() === '') {
            return { success: false, error: 'IP printer selected but no IP address configured' };
          }
          console.log('Routing kitchen token to IP printer:', ipAddress);
          return await window.electronAPI.printKitchenToken(orderData, userProfile, {
            ...printerConfig,
            ip_address: ipAddress
          });
        }
      } catch (error) {
        console.error('Error printing kitchen token:', error)
        return { success: false, error: error.message }
      }
    } else {
      throw new Error('Printing only available in desktop app')
    }
  }

  // Helper method to generate printer ID
  generatePrinterId() {
    return 'printer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now()
  }

  // Test if printer exists
  async hasConfiguredPrinters() {
    const printers = await this.getConfiguredPrinters()
    return printers.length > 0
  }

  // Clear all printer configurations for current user
  async clearAllPrinters() {
    try {
      if (!this.currentUserId) {
        console.error('Cannot clear printers - no user ID set!')
        return false
      }

      if (this.isElectron()) {
        const printers = await this.getConfiguredPrinters()
        for (const printer of printers) {
          await window.electronAPI.printerDelete(printer.id)
        }
      }
      
      // Remove only current user's printers from localStorage
      let allPrinters = this.getAllPrintersFromStorage()
      allPrinters = allPrinters.filter(p => p.user_id !== this.currentUserId)
      localStorage.setItem(this.storageKey, JSON.stringify(allPrinters))
      
      // Remove current user's default
      const allDefaults = this.getAllDefaultsFromStorage()
      delete allDefaults[this.currentUserId]
      localStorage.setItem(this.defaultPrinterKey, JSON.stringify(allDefaults))
      
      console.log('All printer configurations cleared for user:', this.currentUserId)
      return true
    } catch (error) {
      console.error('Error clearing printer configurations:', error)
      return false
    }
  }

  // Get connection status summary
  async getConnectionSummary() {
    try {
      const printers = await this.getConfiguredPrinters()
      const connected = printers.filter(p => p.connection_status === 'connected').length
      const total = printers.length
      
      return {
        total,
        connected,
        disconnected: total - connected,
        hasDefault: printers.some(p => p.is_default)
      }
    } catch (error) {
      console.error('Error getting connection summary:', error)
      return { total: 0, connected: 0, disconnected: 0, hasDefault: false }
    }
  }

  // Clear user ID (call on logout)
  clearUserId() {
    console.log('Clearing user ID')
    this.currentUserId = null
  }
}

export const printerManager = new PrinterManager()