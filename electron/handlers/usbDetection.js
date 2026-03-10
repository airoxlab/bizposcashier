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
  const printers = [];
  const foundPorts = new Set();

  console.log('🔍 Starting Windows USB printer detection...');

  // ============================================
  // Method 1: Use SerialPort library (MOST RELIABLE)
  // ============================================
  try {
    console.log('📡 Method 1: Using SerialPort library...');
    const ports = await SerialPort.list();

    console.log('SerialPort found ports:', ports);

    for (const port of ports) {
      // Filter for USB serial ports
      if (port.path && port.path.startsWith('COM')) {
        // Check if it's a USB device
        const isUSB = port.pnpId?.includes('USB') ||
                      port.vendorId ||
                      port.productId ||
                      port.manufacturer;

        if (!foundPorts.has(port.path)) {
          foundPorts.add(port.path);
          printers.push({
            port: port.path,
            name: port.friendlyName || port.manufacturer || `USB Device on ${port.path}`,
            manufacturer: port.manufacturer || 'Unknown',
            type: 'usb',
            connectionType: 'serial',
            pnpDeviceId: port.pnpId || '',
            vendorId: port.vendorId || '',
            productId: port.productId || '',
            serialNumber: port.serialNumber || '',
            isConnected: true
          });
          console.log(`✅ Found port: ${port.path} - ${port.friendlyName || port.manufacturer || 'Unknown'}`);
        }
      }
    }
  } catch (serialError) {
    console.log('SerialPort detection failed:', serialError.message);
  }

  // ============================================
  // Method 2: PowerShell Get-PnpDevice (Windows 10+)
  // ============================================
  if (printers.length === 0) {
    try {
      console.log('📡 Method 2: Using PowerShell Get-PnpDevice...');
      const psScript = `
        Get-PnpDevice -Class Ports -Status OK | Where-Object { $_.FriendlyName -match 'COM\\d+' } | ForEach-Object {
          $comMatch = [regex]::Match($_.FriendlyName, 'COM(\\d+)')
          if ($comMatch.Success) {
            $port = 'COM' + $comMatch.Groups[1].Value
            Write-Output "$port|$($_.FriendlyName)|$($_.Manufacturer)|$($_.InstanceId)"
          }
        }
      `;

      const result = execSync(`powershell -NoProfile -Command "${psScript.replace(/\n/g, ' ')}"`, {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true
      });

      if (result && result.trim()) {
        const lines = result.trim().split('\n');
        lines.forEach(line => {
          const [port, friendlyName, manufacturer, instanceId] = line.split('|').map(s => s?.trim());
          if (port && port.startsWith('COM') && !foundPorts.has(port)) {
            foundPorts.add(port);
            printers.push({
              port: port,
              name: friendlyName || `USB Printer on ${port}`,
              manufacturer: manufacturer || 'Unknown',
              type: 'usb',
              connectionType: 'serial',
              pnpDeviceId: instanceId || '',
              isConnected: true
            });
            console.log(`✅ Found port via PnpDevice: ${port} - ${friendlyName}`);
          }
        });
      }
    } catch (psError) {
      console.log('PowerShell Get-PnpDevice failed:', psError.message);
    }
  }

  // ============================================
  // Method 3: Registry Query for COM Ports
  // ============================================
  if (printers.length === 0) {
    try {
      console.log('📡 Method 3: Querying Windows Registry...');
      const regResult = execSync(
        'reg query HKLM\\HARDWARE\\DEVICEMAP\\SERIALCOMM',
        { encoding: 'utf8', timeout: 10000, windowsHide: true }
      );

      if (regResult && regResult.trim()) {
        const lines = regResult.trim().split('\n');
        lines.forEach(line => {
          const match = line.match(/REG_SZ\s+(COM\d+)/i);
          if (match && match[1] && !foundPorts.has(match[1])) {
            const port = match[1];
            foundPorts.add(port);
            printers.push({
              port: port,
              name: `Serial Device on ${port}`,
              manufacturer: 'Unknown',
              type: 'usb',
              connectionType: 'serial',
              pnpDeviceId: '',
              isConnected: true
            });
            console.log(`✅ Found port via Registry: ${port}`);
          }
        });
      }
    } catch (regError) {
      console.log('Registry query failed:', regError.message);
    }
  }

  // ============================================
  // Method 4: PowerShell CIM Instance (Modern)
  // ============================================
  if (printers.length === 0) {
    try {
      console.log('📡 Method 4: Using PowerShell CIM...');
      const cimScript = `
        Get-CimInstance -ClassName Win32_PnPEntity | Where-Object { $_.Name -match 'COM\\d+' -or $_.Caption -match 'COM\\d+' } | ForEach-Object {
          $comMatch = [regex]::Match($_.Name + $_.Caption, 'COM(\\d+)')
          if ($comMatch.Success) {
            $port = 'COM' + $comMatch.Groups[1].Value
            Write-Output "$port|$($_.Name)|$($_.Manufacturer)|$($_.DeviceID)"
          }
        }
      `;

      const result = execSync(`powershell -NoProfile -Command "${cimScript.replace(/\n/g, ' ')}"`, {
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true
      });

      if (result && result.trim()) {
        const lines = result.trim().split('\n');
        lines.forEach(line => {
          const [port, name, manufacturer, deviceId] = line.split('|').map(s => s?.trim());
          if (port && port.startsWith('COM') && !foundPorts.has(port)) {
            foundPorts.add(port);
            printers.push({
              port: port,
              name: name || `Device on ${port}`,
              manufacturer: manufacturer || 'Unknown',
              type: 'usb',
              connectionType: 'serial',
              pnpDeviceId: deviceId || '',
              isConnected: true
            });
            console.log(`✅ Found port via CIM: ${port} - ${name}`);
          }
        });
      }
    } catch (cimError) {
      console.log('PowerShell CIM detection failed:', cimError.message);
    }
  }

  // ============================================
  // Method 5: Check Windows Printers directly
  // ============================================
  try {
    console.log('📡 Method 5: Checking Windows installed printers...');
    const printerScript = `
      Get-Printer | Where-Object { $_.PortName -match 'COM\\d+' -or $_.PortName -match 'USB' } | ForEach-Object {
        Write-Output "$($_.PortName)|$($_.Name)|$($_.DriverName)|Printer"
      }
    `;

    const result = execSync(`powershell -NoProfile -Command "${printerScript.replace(/\n/g, ' ')}"`, {
      encoding: 'utf8',
      timeout: 10000,
      windowsHide: true
    });

    if (result && result.trim()) {
      const lines = result.trim().split('\n');
      lines.forEach(line => {
        const [portName, printerName, driverName] = line.split('|').map(s => s?.trim());
        if (portName && !foundPorts.has(portName)) {
          foundPorts.add(portName);
          printers.push({
            port: portName,
            name: printerName || `Printer on ${portName}`,
            manufacturer: driverName || 'Unknown',
            type: 'usb',
            connectionType: portName.startsWith('COM') ? 'serial' : 'usb',
            pnpDeviceId: '',
            isConnected: true
          });
          console.log(`✅ Found Windows printer: ${printerName} on ${portName}`);
        }
      });
    }
  } catch (printerError) {
    console.log('Windows printer detection failed:', printerError.message);
  }

  // ============================================
  // Method 6: Scan COM1-COM20 with quick test
  // ============================================
  if (printers.length === 0) {
    console.log('📡 Method 6: Scanning COM1-COM20...');
    for (let i = 1; i <= 20; i++) {
      const port = `COM${i}`;
      if (!foundPorts.has(port)) {
        try {
          // Quick check if port exists
          execSync(`powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames() | Where-Object { $_ -eq '${port}' }"`, {
            encoding: 'utf8',
            timeout: 2000,
            windowsHide: true
          });

          // If we get here, port exists
          foundPorts.add(port);
          printers.push({
            port: port,
            name: `Serial Device on ${port}`,
            manufacturer: 'Unknown',
            type: 'usb',
            connectionType: 'serial',
            pnpDeviceId: '',
            isConnected: true
          });
          console.log(`✅ Found port via scan: ${port}`);
        } catch (err) {
          // Port doesn't exist, skip
        }
      }
    }
  }

  // ============================================
  // Method 7: Get all available serial ports via PowerShell
  // ============================================
  if (printers.length === 0) {
    try {
      console.log('📡 Method 7: Getting all serial ports...');
      const result = execSync(
        'powershell -NoProfile -Command "[System.IO.Ports.SerialPort]::GetPortNames()"',
        { encoding: 'utf8', timeout: 5000, windowsHide: true }
      );

      if (result && result.trim()) {
        const ports = result.trim().split('\n').map(p => p.trim()).filter(p => p);
        ports.forEach(port => {
          if (port.startsWith('COM') && !foundPorts.has(port)) {
            foundPorts.add(port);
            printers.push({
              port: port,
              name: `Serial Port ${port}`,
              manufacturer: 'Unknown',
              type: 'usb',
              connectionType: 'serial',
              pnpDeviceId: '',
              isConnected: true
            });
            console.log(`✅ Found serial port: ${port}`);
          }
        });
      }
    } catch (err) {
      console.log('GetPortNames failed:', err.message);
    }
  }

  console.log(`🖨️ Total found: ${printers.length} USB/Serial device(s) on Windows`);
  return printers;
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
