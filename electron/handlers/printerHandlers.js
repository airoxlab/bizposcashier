const path = require('path');
const fs = require('fs');
const net = require('net');
const { app } = require('electron');

const PRINTERS_FILE = path.join(app.getPath('userData'), 'printers.json');

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

function registerPrinterHandlers(ipcMain) {
  ipcMain.handle('printer-test-connection', async (event, { ip, port = '9100' }) => {
    return await testPrinterConnection(ip, parseInt(port));
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

module.exports = { registerPrinterHandlers };