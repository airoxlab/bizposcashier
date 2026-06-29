const { contextBridge, ipcRenderer } = require('electron');

window.global = window.global || window;

const api = {
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getLocalIP: () => ipcRenderer.invoke('get-local-ip'),

  // Auto-update methods
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  // Auto-update event listeners — each returns a disposer that removes ONLY
  // that listener, so multiple components (banner + settings panel) can
  // subscribe without one's cleanup wiping the other's.
  onUpdateStatus: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('update-status', h);
    return () => ipcRenderer.removeListener('update-status', h);
  },
  onUpdateAvailable: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('update-available', h);
    return () => ipcRenderer.removeListener('update-available', h);
  },
  onUpdateNotAvailable: (callback) => {
    const h = () => callback();
    ipcRenderer.on('update-not-available', h);
    return () => ipcRenderer.removeListener('update-not-available', h);
  },
  onUpdateDownloadProgress: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('update-download-progress', h);
    return () => ipcRenderer.removeListener('update-download-progress', h);
  },
  onUpdateDownloaded: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('update-downloaded', h);
    return () => ipcRenderer.removeListener('update-downloaded', h);
  },
  onUpdateError: (callback) => {
    const h = (event, data) => callback(data);
    ipcRenderer.on('update-error', h);
    return () => ipcRenderer.removeListener('update-error', h);
  },

  // Kept for backward compatibility — prefer the disposers returned above.
  removeUpdateListeners: () => {
    ipcRenderer.removeAllListeners('update-status');
    ipcRenderer.removeAllListeners('update-available');
    ipcRenderer.removeAllListeners('update-not-available');
    ipcRenderer.removeAllListeners('update-download-progress');
    ipcRenderer.removeAllListeners('update-downloaded');
    ipcRenderer.removeAllListeners('update-error');
  },

  showSaveDialog: () => ipcRenderer.invoke('show-save-dialog'),
  showErrorDialog: (title, content) => ipcRenderer.invoke('show-error-dialog', title, content),
  
  onNavigate: (callback) => ipcRenderer.on('navigate', callback),
  onNewOrder: (callback) => ipcRenderer.on('new-order', callback),

  // Order notification — also fires a DOM CustomEvent so pages can listen
  // without needing to know about Electron (no rebuild required for page changes)

  
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel),
  
  // Printer methods
  printerTestConnection: (data) => ipcRenderer.invoke('printer-test-connection', data),
  printerCheckConnection: (printerConfig) => ipcRenderer.invoke('printer-check-connection', printerConfig),
  printerPrintReceipt: (data) => ipcRenderer.invoke('printer-print-receipt', data),
  printerPrintKitchen: (data) => ipcRenderer.invoke('printer-print-kitchen', data),  // Added
  printerTestKitchen: (data) => ipcRenderer.invoke('printer-test-kitchen', data),      // Added
  printerRawTest: (data) => ipcRenderer.invoke('printer-raw-test', data),
  printerStatus: (data) => ipcRenderer.invoke('printer-status', data),
  printerSave: (data) => ipcRenderer.invoke('printer-save', data),
  printerLoad: () => ipcRenderer.invoke('printer-load'),
  printerDelete: (printerId) => ipcRenderer.invoke('printer-delete', printerId),

  // USB Printer methods (COM port / Serial)
  printerPrintUSB: (data) => ipcRenderer.invoke('printer-print-usb', data),
  printerPrintUSBKitchenToken: (data) => ipcRenderer.invoke('printer-print-usb-kitchen-token', data),
  printerTestUSB: (data) => ipcRenderer.invoke('printer-test-usb', data),
  usbDetectPrinters: () => ipcRenderer.invoke('usb-detect-printers'),
  usbCheckPort: (data) => ipcRenderer.invoke('usb-check-port', data),

  // Windows USB Printer Class methods (USB001 / Devices & Printers)
  printerListWindowsPrinters: () => ipcRenderer.invoke('printer-list-windows-printers'),
  printerPrintWindowsUSB: (data) => ipcRenderer.invoke('printer-print-windows-usb', data),
  printerPrintWindowsUSBKitchen: (data) => ipcRenderer.invoke('printer-print-windows-usb-kitchen', data),
  printerTestWindowsUSB: (data) => ipcRenderer.invoke('printer-test-windows-usb', data),

  // Kitchen token printer (IP)
  printKitchenToken: (orderData, userProfile, printerConfig) => ipcRenderer.invoke('print-kitchen-token', { orderData, userProfile, printerConfig }),

  // Category/Deal → Printer mappings
  printerMappingsLoad: () => ipcRenderer.invoke('printer-mappings-load'),
  printerMappingsSave: (mappings) => ipcRenderer.invoke('printer-mappings-save', mappings),
  
  customerFindByPhone: (data) => ipcRenderer.invoke('customer-find-by-phone', data),
  customerCreate: (data) => ipcRenderer.invoke('customer-create', data),
  customerUpdate: (data) => ipcRenderer.invoke('customer-update', data),
  
  invoke: (channel, data) => ipcRenderer.invoke(channel, data),
  
  // File picker (for campaign media)
  pickFile: (options) => ipcRenderer.invoke('dialog:pick-file', options),

  // WhatsApp
  whatsapp: {
    connect: () => ipcRenderer.invoke('whatsapp:connect'),
    disconnect: () => ipcRenderer.invoke('whatsapp:disconnect'),
    getStatus: () => ipcRenderer.invoke('whatsapp:status'),
    sendOrderMessage: (data) => ipcRenderer.invoke('whatsapp:send-order-message', data),
    sendCampaignMessage: (data) => ipcRenderer.invoke('whatsapp:send-campaign-message', data),
    sendReceiptImage: (data) => ipcRenderer.invoke('whatsapp:send-receipt-image', data),
    sendBalanceImage: (data) => ipcRenderer.invoke('whatsapp:send-balance-image', data),
    checkNumber: (data) => ipcRenderer.invoke('whatsapp:check-number', data),
    // Centralized sender: render images locally (no send) + read files for upload
    renderReceiptImage: (data) => ipcRenderer.invoke('whatsapp:render-receipt-image', data),
    renderBalanceImage: (data) => ipcRenderer.invoke('whatsapp:render-balance-image', data),
    readFileBase64: (data) => ipcRenderer.invoke('whatsapp:read-file-base64', data),
    onUserLogin: (data) => ipcRenderer.invoke('whatsapp:on-user-login', data),

    onQR: (cb) => ipcRenderer.on('whatsapp:qr', (_e, d) => cb(d)),
    onStatus: (cb) => ipcRenderer.on('whatsapp:status', (_e, d) => cb(d)),
    onReady: (cb) => ipcRenderer.on('whatsapp:ready', (_e, d) => cb(d)),
    onDisconnected: (cb) => ipcRenderer.on('whatsapp:disconnected', (_e, d) => cb(d)),
    onError: (cb) => ipcRenderer.on('whatsapp:error', (_e, d) => cb(d)),

    removeListeners: () => {
      ['whatsapp:qr', 'whatsapp:status', 'whatsapp:ready', 'whatsapp:disconnected', 'whatsapp:error']
        .forEach(ch => ipcRenderer.removeAllListeners(ch));
    },
  },

  // Product / deal image caching — downloads images to userData/product-images/
  // so they display correctly when offline.
  images: {
    downloadAll: (items) => ipcRenderer.invoke('images:download-all', items),
    clearAll:    ()      => ipcRenderer.invoke('images:clear-all'),
  },

  // Backup & Recovery (offline-only — auto-saves whenever offline data is cached)
  backup: {
    selectFolder: () => ipcRenderer.invoke('backup:select-folder'),
    initFolder: (folderPath) => ipcRenderer.invoke('backup:init-folder', { folderPath }),
    autoSave: (data, folderPath) => ipcRenderer.invoke('backup:auto-save', { data, folderPath }),
    readIndex: (folderPath) => ipcRenderer.invoke('backup:read-index', { folderPath }),
    loadFile: (filePath) => ipcRenderer.invoke('backup:load-file', { filePath }),
    defaultPath: () => ipcRenderer.invoke('backup:default-path'),
    // Config persistence — survives localStorage wipes
    saveConfig: (folderPath) => ipcRenderer.invoke('backup:save-config', { folderPath }),
    loadConfig: () => ipcRenderer.invoke('backup:load-config'),
    restoreFromFolder: (folderPath) => ipcRenderer.invoke('backup:restore-from-folder', { folderPath }),
    // Data Recovery — scan all past localStorage port origins in Chromium's LevelDB
    scanAllPorts: () => ipcRenderer.invoke('backup:scan-all-ports'),
  },

  // Fingerprint engine via dpfj.dll (DigitalPersona FingerJet)
  // Stateful enrollment: start once, add each capture until done:true.
  enrollStart:        ()                         => ipcRenderer.invoke('fingerprint:enrollStart'),
  enrollAdd:          (sampleB64)                => ipcRenderer.invoke('fingerprint:enrollAdd', sampleB64),
  enrollCancel:       ()                         => ipcRenderer.invoke('fingerprint:enrollCancel'),
  compareFingerprints:(templateB64, liveB64, th) => ipcRenderer.invoke('fingerprint:compare', templateB64, liveB64, th),
  identifyFingerprint:(liveB64, templates, th)   => ipcRenderer.invoke('fingerprint:identify', liveB64, templates, th),
  fingerprintSelfTest:()                         => ipcRenderer.invoke('fingerprint:selftest'),

  // PRA e-IMS fiscalization — token stays in main process, never exposed to renderer
  praSubmit: (data) => ipcRenderer.invoke('pra:submit', data),
  praPreview: (data) => ipcRenderer.invoke('pra:preview', data),
  praEnsureQr: (data) => ipcRenderer.invoke('pra:ensure-qr', data),

  platform: process.platform,
  isElectron: true
};

contextBridge.exposeInMainWorld('electronAPI', api);
contextBridge.exposeInMainWorld('electron', api);

window.addEventListener('DOMContentLoaded', () => {
  if (typeof global === 'undefined') {
    window.global = window;
  }
  
  if (process.env.NODE_ENV === 'production') {
    document.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });
  }
  
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
  });
  
  document.addEventListener('drop', (e) => {
    e.preventDefault();
  });
  
  document.body.classList.add('electron-app');
});

// Bridge IPC → CustomEvent so any page can react without Electron-specific code
ipcRenderer.on('new-order', (_event, data) => {
  window.dispatchEvent(new CustomEvent('bizpos:new-order', { detail: data }));
});

console.log('Preload script loaded');