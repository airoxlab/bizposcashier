const path = require('path');
const fs = require('fs');
const net = require('net');
const os = require('os');
const { execFile } = require('child_process');
const { app } = require('electron');

const PRINTERS_FILE = path.join(app.getPath('userData'), 'printers.json');
const MAPPINGS_FILE = path.join(app.getPath('userData'), 'category_mappings.json');

async function ensureDataDirectory() {
  const dataDir = path.dirname(PRINTERS_FILE);
  try {
    await fs.promises.access(dataDir);
  } catch {
    await fs.promises.mkdir(dataDir, { recursive: true });
  }
}

async function loadPrinters() {
  try {
    const data = await fs.promises.readFile(PRINTERS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function savePrinters(printers) {
  await ensureDataDirectory();
  await fs.promises.writeFile(PRINTERS_FILE, JSON.stringify(printers, null, 2));
}

function generatePrinterId() {
  return 'printer_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
}

async function testPrinterConnection(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({ success: false, error: 'Connection timeout' });
    }, 5000);

    socket.connect(port, ip, () => {
      clearTimeout(timeout);
      socket.end();
      resolve({ success: true });
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: error.message });
    });
  });
}

async function checkPrinterStatus(ip, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const ESC = '\x1B';
    const DLE = '\x10';
    const EOT = '\x04';
    const statusCommand = Buffer.from([0x10, 0x04, 0x01]);

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({
        success: false,
        status: 'timeout',
        message: 'Printer did not respond'
      });
    }, 5000);

    socket.connect(port, ip, () => {
      socket.write(statusCommand);
    });

    socket.on('data', (data) => {
      clearTimeout(timeout);
      const statusByte = data[0];
      
      const offlineStatus = (statusByte & 0x08) !== 0;
      const paperStatus = (statusByte & 0x20) !== 0 || (statusByte & 0x60) !== 0;
      const drawerStatus = (statusByte & 0x04) !== 0;
      const errorStatus = (statusByte & 0x40) !== 0;

      let status = 'ready';
      let message = 'Printer is ready';

      if (offlineStatus) {
        status = 'offline';
        message = 'Printer is offline';
      } else if (paperStatus) {
        status = 'paper_out';
        message = 'Paper is out or near end';
      } else if (errorStatus) {
        status = 'error';
        message = 'Printer has an error';
      }

      socket.end();
      resolve({
        success: true,
        status,
        message,
        raw: {
          offline: offlineStatus,
          paperOut: paperStatus,
          drawer: drawerStatus,
          error: errorStatus
        }
      });
    });

    socket.on('error', (error) => {
      clearTimeout(timeout);
      resolve({
        success: false,
        status: 'error',
        message: error.message
      });
    });
  });
}

// Quick TCP probe — like testPrinterConnection but with shorter timeout for status polls
function probeTcp(ip, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;
    const finish = (ok, err) => {
      if (done) return;
      done = true;
      try { socket.destroy(); } catch {}
      resolve({ ok, err });
    };
    const t = setTimeout(() => finish(false, 'timeout'), timeoutMs);
    socket.once('connect', () => { clearTimeout(t); finish(true); });
    socket.once('error', (e) => { clearTimeout(t); finish(false, e.message); });
    try { socket.connect(parseInt(port), ip); }
    catch (e) { clearTimeout(t); finish(false, e.message); }
  });
}

// Probe a serial / COM port without printing — verifies the OS still sees the port.
// Uses SerialPort.list() so we don't need to open the port (which can block other processes).
async function probeSerialPort(portName) {
  if (!portName) return { ok: false, err: 'no port' };
  try {
    if (process.platform === 'win32') {
      // SerialPort.list() is the most reliable cross-driver detection on Windows.
      let SerialPort;
      try { ({ SerialPort } = require('serialport')); } catch { SerialPort = null; }
      if (SerialPort) {
        const ports = await SerialPort.list();
        const wanted = portName.trim().toUpperCase();
        const found = ports.some(p => (p.path || '').toUpperCase() === wanted);
        if (found) return { ok: true };
      }
      // Fallback: ask Windows directly
      return await new Promise((resolve) => {
        execFile('powershell', [
          '-NoProfile', '-Command',
          `[System.IO.Ports.SerialPort]::GetPortNames() -contains '${portName.replace(/'/g, "''")}'`
        ], { timeout: 3000, windowsHide: true }, (err, stdout) => {
          if (err) return resolve({ ok: false, err: err.message });
          resolve({ ok: stdout.trim().toLowerCase() === 'true' });
        });
      });
    } else {
      // POSIX — just check the device file exists
      try { await fs.promises.access(portName, fs.constants.F_OK); return { ok: true }; }
      catch { return { ok: false, err: 'not present' }; }
    }
  } catch (e) {
    return { ok: false, err: e.message };
  }
}

// Check a Windows USB Printer Class device (USB001 / Devices & Printers) by name.
// We consider it "connected" when Get-Printer returns it AND PrinterStatus is not Offline/Error.
async function probeWindowsUsbPrinter(printerName) {
  if (process.platform !== 'win32') return { ok: false, err: 'Windows only' };
  if (!printerName) return { ok: false, err: 'no printer name' };
  return await new Promise((resolve) => {
    const safe = printerName.replace(/'/g, "''");
    // PrinterStatus values: Normal, Offline, Error, Paused, etc.
    execFile('powershell', [
      '-NoProfile', '-Command',
      `$p = Get-Printer -Name '${safe}' -ErrorAction SilentlyContinue; if ($p) { $p.PrinterStatus.ToString() } else { 'NotFound' }`
    ], { timeout: 5000, windowsHide: true }, (err, stdout) => {
      if (err) return resolve({ ok: false, err: err.message });
      const status = (stdout || '').trim();
      if (!status || status === 'NotFound') return resolve({ ok: false, err: 'not installed' });
      // Treat anything that isn't explicitly Offline / Error as connected. Paper-out etc still
      // means the device is present and reachable.
      const bad = /Offline|Error|NotAvailable/i.test(status);
      resolve({ ok: !bad, status });
    });
  });
}

// Single entry point used by the renderer status badge. Accepts a printer config object
// (the same shape printerManager stores) and returns { connected, type, status, error }.
async function checkPrinterConnection(printerConfig) {
  if (!printerConfig) return { connected: false, type: 'none', error: 'no printer configured' };

  const usbPort = printerConfig.usb_device_path || printerConfig.usb_port || '';
  const ipAddress = printerConfig.ip_address || printerConfig.ip || '';
  let connectionType = printerConfig.connection_type || printerConfig.printer_type || '';

  // Detect Windows USB stored with WINUSB: prefix
  const winFromPort = usbPort && usbPort.startsWith('WINUSB:') ? usbPort.replace(/^WINUSB:/, '') : null;
  const winName = printerConfig.usb_printer_name || winFromPort;

  // Resolve type
  if (connectionType === 'ethernet' || connectionType === 'network') connectionType = 'ip';
  if (!connectionType || connectionType === 'thermal') {
    if (winName) connectionType = 'windows_usb';
    else if (usbPort) connectionType = 'usb';
    else if (ipAddress) connectionType = 'ip';
  }

  if (connectionType === 'windows_usb' || winFromPort) {
    const r = await probeWindowsUsbPrinter(winName);
    return { connected: r.ok, type: 'windows_usb', status: r.status || (r.ok ? 'ready' : 'offline'), error: r.err };
  }
  if (connectionType === 'usb') {
    const r = await probeSerialPort(usbPort);
    return { connected: r.ok, type: 'usb', status: r.ok ? 'ready' : 'offline', error: r.err };
  }
  if (connectionType === 'ip') {
    const r = await probeTcp(ipAddress, printerConfig.port || 9100, 2000);
    return { connected: r.ok, type: 'ip', status: r.ok ? 'ready' : 'offline', error: r.err };
  }
  return { connected: false, type: connectionType || 'unknown', error: 'unknown connection type' };
}

function registerPrinterHandlers(ipcMain) {
  ipcMain.handle('printer-test-connection', async (event, { ip, port = '9100' }) => {
    return await testPrinterConnection(ip, parseInt(port));
  });

  // Lightweight, non-printing status check used by the dashboard status badge.
  // Works for IP, COM/USB-serial, and Windows USB Printer Class devices.
  ipcMain.handle('printer-check-connection', async (event, printerConfig) => {
    try {
      return await checkPrinterConnection(printerConfig);
    } catch (e) {
      return { connected: false, type: 'unknown', error: e.message };
    }
  });

  ipcMain.handle('printer-status', async (event, { ip, port = '9100' }) => {
    return await checkPrinterStatus(ip, parseInt(port));
  });

  ipcMain.handle('printer-save', async (event, printerData) => {
    try {
      await ensureDataDirectory();
      const printers = await loadPrinters();

      // Find existing by ID first, then by IP/port for backward compatibility
      let existingIndex = printers.findIndex(p => p.id === printerData.id);
      if (existingIndex === -1) {
        existingIndex = printers.findIndex(p => p.ip === printerData.ip && p.port === printerData.port);
      }

      const printer = {
        id: printerData.id || generatePrinterId(),
        name: printerData.name || `Printer ${printerData.ip || printerData.usb_port || 'Unknown'}`,
        // IP printer fields
        ip: printerData.ip || printerData.ip_address,
        ip_address: printerData.ip_address || printerData.ip,
        port: printerData.port || 9100,
        // USB printer fields
        usb_port: printerData.usb_port || printerData.usb_device_path,
        usb_device_path: printerData.usb_device_path || printerData.usb_port,
        usb_printer_name: printerData.usb_printer_name || null,
        // Printer type
        printer_type: printerData.printer_type || printerData.connection_type,
        connection_type: printerData.connection_type || printerData.printer_type,
        // Status fields
        model: printerData.model || 'Generic ESC/POS',
        isDefault: printerData.isDefault || printerData.is_default || false,
        is_default: printerData.is_default || printerData.isDefault || false,
        connectionStatus: printerData.connectionStatus || printerData.connection_status || 'unknown',
        connection_status: printerData.connection_status || printerData.connectionStatus || 'unknown',
        lastConnectedAt: new Date().toISOString(),
        createdAt: printerData.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        user_id: printerData.user_id
      };

      if (existingIndex >= 0) {
        printers[existingIndex] = printer;
      } else {
        printers.push(printer);
      }

      if (printer.isDefault || printer.is_default) {
        printers.forEach((p, idx) => {
          if (idx !== existingIndex && idx !== printers.length - 1) {
            p.isDefault = false;
            p.is_default = false;
          }
        });
      }

      await savePrinters(printers);
      
      return {
        success: true,
        printer
      };
    } catch (error) {
      console.error('Error saving printer:', error);
      return {
        success: false,
        error: error.message
      };
    }
  });

  ipcMain.handle('printer-load', async (event) => {
    try {
      const printers = await loadPrinters();
      return {
        success: true,
        printers
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        printers: []
      };
    }
  });

  ipcMain.handle('printer-mappings-load', async () => {
    try {
      const mappings = await loadMappings();
      return { success: true, mappings };
    } catch (error) {
      return { success: false, error: error.message, mappings: [] };
    }
  });

  ipcMain.handle('printer-mappings-save', async (event, mappings) => {
    try {
      await saveMappings(mappings);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('printer-delete', async (event, printerId) => {
    try {
      const printers = await loadPrinters();
      const updatedPrinters = printers.filter(p => p.id !== printerId);
      
      if (printers.length === updatedPrinters.length) {
        return {
          success: false,
          error: 'Printer not found'
        };
      }
      
      await savePrinters(updatedPrinters);
      
      return {
        success: true,
        printers: updatedPrinters
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  });
}

async function loadMappings() {
  try {
    const data = await fs.promises.readFile(MAPPINGS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

async function saveMappings(mappings) {
  await ensureDataDirectory();
  await fs.promises.writeFile(MAPPINGS_FILE, JSON.stringify(mappings, null, 2));
}

module.exports = { registerPrinterHandlers };