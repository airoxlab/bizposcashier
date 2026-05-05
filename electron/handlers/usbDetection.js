const { execSync, exec } = require('child_process');
const os = require('os');
const { SerialPort } = require('serialport');

/**
 * Detect USB thermal printers connected to the system
 * Works cross-platform: Windows, Linux, Mac
 */
async function detectUSBPrinters() {
  const platform = os.platform();

  try {
    if (platform === 'win32') {
      return await detectWindowsUSBPrinters();
    } else if (platform === 'linux') {
      return await detectLinuxUSBPrinters();
    } else if (platform === 'darwin') {
      return await detectMacUSBPrinters();
    } else {
      return [];
    }
  } catch (error) {
    console.error('Error detecting USB printers:', error);
    return [];
  }
}

/**
 * Detect USB printers on Windows using multiple methods
 */
async function detectWindowsUSBPrinters() {
  const windowsPrinters = [];
  const serialPrinters = [];
  const foundNames = new Set();

  console.log('🔍 Starting Windows printer detection...');

  // ============================================
  // Step 1 (PRIMARY): Windows-installed printers via Get-Printer
  // Detects all printers installed in Windows Printers & Scanners
  // (USB001, network, etc.) — includes POS-80, EPSON, etc.
  // ============================================
  try {
    console.log('📡 Step 1: Detecting Windows-installed printers (Get-Printer)...');
    const result = execSync(
      'powershell -NoProfile -Command "Get-Printer | Where-Object { $_.Name -notmatch \'Microsoft|XPS|Fax|OneNote\' } | ForEach-Object { Write-Output ($_.Name + \'|\' + $_.DriverName + \'|\' + $_.PortName) }"',
      { encoding: 'utf8', timeout: 10000, windowsHide: true }
    );

    if (result && result.trim()) {
      result.trim().split('\n').forEach(line => {
        const parts = line.split('|').map(s => s?.trim());
        const name = parts[0];
        const driver = parts[1] || 'Unknown';
        const portName = parts[2] || '';
        if (name && !foundNames.has(name)) {
          foundNames.add(name);
          windowsPrinters.push({
            port: name,
            name: name,
            manufacturer: driver,
            type: 'windows_usb',
            connectionType: 'windows_usb',
            isWindowsPrinter: true,
            windowsPort: portName,
            isConnected: true
          });
          console.log(`✅ Windows printer: ${name} (${driver}) on ${portName}`);
        }
      });
    }
  } catch (err) {
    console.log('Get-Printer failed:', err.message);
  }

  // ============================================
  // Step 2 (SECONDARY): Real serial/COM port devices
  // Only runs if Windows printer detection found nothing.
  // Uses reliable methods only — no guessing/scanning.
  // ============================================
  if (windowsPrinters.length === 0) {
    console.log('📡 Step 2: Falling back to serial port detection...');
    const foundPorts = new Set();

    // Method A: SerialPort library
    try {
      const ports = await SerialPort.list();
      for (const port of ports) {
        if (port.path && port.path.startsWith('COM') && !foundPorts.has(port.path)) {
          foundPorts.add(port.path);
          serialPrinters.push({
            port: port.path,
            name: port.friendlyName || port.manufacturer || `USB Device on ${port.path}`,
            manufacturer: port.manufacturer || 'Unknown',
            type: 'usb',
            connectionType: 'serial',
            pnpDeviceId: port.pnpId || '',
            vendorId: port.vendorId || '',
            productId: port.productId || '',
            isConnected: true
          });
          console.log(`✅ Serial port: ${port.path} - ${port.friendlyName || 'Unknown'}`);
        }
      }
    } catch (err) {
      console.log('SerialPort.list failed:', err.message);
    }

    // Method B: Registry (only COM ports with actual hardware entries)
    if (serialPrinters.length === 0) {
      try {
        const regResult = execSync(
          'reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM',
          { encoding: 'utf8', timeout: 10000, windowsHide: true }
        );
        if (regResult && regResult.trim()) {
          regResult.trim().split('\n').forEach(line => {
            const match = line.match(/REG_SZ\s+(COM\d+)/i);
            if (match && match[1] && !foundPorts.has(match[1])) {
              const port = match[1];
              foundPorts.add(port);
              serialPrinters.push({
                port, name: `Serial Device on ${port}`,
                manufacturer: 'Unknown', type: 'usb',
                connectionType: 'serial', isConnected: true
              });
              console.log(`✅ Registry COM port: ${port}`);
            }
          });
        }
      } catch (err) {
        console.log('Registry query failed:', err.message);
      }
    }

    // Method C: PowerShell GetPortNames (actual available ports only)
    if (serialPrinters.length === 0) {
      try {
        const result = execSync(
          'powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"',
          { encoding: 'utf8', timeout: 5000, windowsHide: true }
        );
        if (result && result.trim()) {
          result.trim().split('\n').map(p => p.trim()).filter(p => p.startsWith('COM')).forEach(port => {
            if (!foundPorts.has(port)) {
              foundPorts.add(port);
              serialPrinters.push({
                port, name: `Serial Port ${port}`,
                manufacturer: 'Unknown', type: 'usb',
                connectionType: 'serial', isConnected: true
              });
              console.log(`✅ Serial port via GetPortNames: ${port}`);
            }
          });
        }
      } catch (err) {
        console.log('GetPortNames failed:', err.message);
      }
    }
  }

  const all = [...windowsPrinters, ...serialPrinters];
  console.log(`🖨️ Total found: ${all.length} printer(s) on Windows (${windowsPrinters.length} Windows, ${serialPrinters.length} serial)`);
  return all;
}

/**
 * Detect USB printers on Linux
 */
async function detectLinuxUSBPrinters() {
  const printers = [];

  // Method 1: SerialPort library
  try {
    const ports = await SerialPort.list();
    for (const port of ports) {
      if (port.path && (port.path.includes('ttyUSB') || port.path.includes('usb/lp'))) {
        printers.push({
          port: port.path,
          name: port.manufacturer || `USB Device on ${port.path}`,
          manufacturer: port.manufacturer || 'Unknown',
          type: 'usb',
          connectionType: 'serial',
          isConnected: true
        });
      }
    }
  } catch (err) {
    console.log('SerialPort detection failed on Linux:', err.message);
  }

  // Method 2: Check /dev/usb/lp* devices
  if (printers.length === 0) {
    try {
      const lpDevices = execSync('ls /dev/usb/lp* 2>/dev/null', {
        encoding: 'utf8',
        timeout: 5000
      });

      if (lpDevices && lpDevices.trim()) {
        const devices = lpDevices.trim().split('\n');
        devices.forEach(device => {
          printers.push({
            port: device.trim(),
            name: `USB Printer on ${device.trim()}`,
            manufacturer: 'Unknown',
            type: 'usb',
            connectionType: 'usb',
            isConnected: true
          });
        });
      }
    } catch (err) {
      // No /dev/usb/lp devices found
    }
  }

  // Method 3: Check /dev/ttyUSB* devices
  try {
    const ttyDevices = execSync('ls /dev/ttyUSB* 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000
    });

    if (ttyDevices && ttyDevices.trim()) {
      const devices = ttyDevices.trim().split('\n');
      devices.forEach(device => {
        const exists = printers.some(p => p.port === device.trim());
        if (!exists) {
          printers.push({
            port: device.trim(),
            name: `USB Serial Device on ${device.trim()}`,
            manufacturer: 'Unknown',
            type: 'usb',
            connectionType: 'serial',
            isConnected: true
          });
        }
      });
    }
  } catch (err) {
    // No /dev/ttyUSB devices found
  }

  console.log(`Found ${printers.length} USB printer(s) on Linux`);
  return printers;
}

/**
 * Detect USB printers on Mac
 */
async function detectMacUSBPrinters() {
  const printers = [];

  // Method 1: SerialPort library
  try {
    const ports = await SerialPort.list();
    for (const port of ports) {
      if (port.path && (port.path.includes('usbserial') || port.path.includes('usbmodem'))) {
        printers.push({
          port: port.path,
          name: port.manufacturer || `USB Device on ${port.path}`,
          manufacturer: port.manufacturer || 'Unknown',
          type: 'usb',
          connectionType: 'serial',
          isConnected: true
        });
      }
    }
  } catch (err) {
    console.log('SerialPort detection failed on Mac:', err.message);
  }

  // Method 2: Check /dev/tty.usbserial* and /dev/cu.usbserial* devices
  if (printers.length === 0) {
    try {
      const ttyDevices = execSync('ls /dev/tty.usbserial* /dev/cu.usbserial* 2>/dev/null', {
        encoding: 'utf8',
        timeout: 5000
      });

      if (ttyDevices && ttyDevices.trim()) {
        const devices = ttyDevices.trim().split('\n');
        devices.forEach(device => {
          printers.push({
            port: device.trim(),
            name: `USB Printer on ${device.trim()}`,
            manufacturer: 'Unknown',
            type: 'usb',
            connectionType: 'serial',
            isConnected: true
          });
        });
      }
    } catch (err) {
      // No devices found
    }
  }

  console.log(`Found ${printers.length} USB printer(s) on Mac`);
  return printers;
}

/**
 * Register IPC handlers for USB detection
 */
function registerUSBDetectionHandlers(ipcMain) {
  // Detect available USB printers
  ipcMain.handle('usb-detect-printers', async (event) => {
    try {
      console.log('🔍 USB detection requested...');
      const printers = await detectUSBPrinters();
      console.log('📋 Returning printers:', printers);
      return {
        success: true,
        printers
      };
    } catch (error) {
      console.error('Error in USB detection handler:', error);
      return {
        success: false,
        error: error.message,
        printers: []
      };
    }
  });

  // Check if a specific USB port is available
  ipcMain.handle('usb-check-port', async (event, { port }) => {
    try {
      const platform = os.platform();

      if (platform === 'win32') {
        try {
          const result = execSync(
            `powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames() -contains '${port}'"`,
            { encoding: 'utf8', timeout: 3000, windowsHide: true }
          );
          return { success: true, available: result.trim().toLowerCase() === 'true' };
        } catch (err) {
          return { success: true, available: false };
        }
      } else {
        const fs = require('fs');
        try {
          await fs.promises.access(port, fs.constants.F_OK);
          return { success: true, available: true };
        } catch (err) {
          return { success: true, available: false };
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
        available: false
      };
    }
  });
}

module.exports = {
  detectUSBPrinters,
  registerUSBDetectionHandlers
};
