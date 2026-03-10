// thermal.js - Thermal Printer Utility Functions

/**
 * ESC/POS Commands for thermal printers
 */
export const ESC_POS_COMMANDS = {
  // Initialize printer
  INIT: '\x1B\x40',
  
  // Line feed
  LF: '\x0A',
  
  // Cut paper
  CUT: '\x1D\x56\x00',
  
  // Status commands
  STATUS: '\x10\x04\x01', // Real-time status
  PAPER_STATUS: '\x10\x04\x04', // Paper sensor status
  
  // Text formatting
  BOLD_ON: '\x1B\x45\x01',
  BOLD_OFF: '\x1B\x45\x00',
  
  // Alignment
  ALIGN_LEFT: '\x1B\x61\x00',
  ALIGN_CENTER: '\x1B\x61\x01',
  ALIGN_RIGHT: '\x1B\x61\x02',
  
  // Font size
  NORMAL_SIZE: '\x1D\x21\x00',
  DOUBLE_SIZE: '\x1D\x21\x11',
};

/**
 * Thermal Printer Class
 */
export class ThermalPrinter {
  constructor(ip, port = 9100) {
    this.ip = ip;
    this.port = port;
    this.isConnected = false;
    this.socket = null;
  }

  /**
   * Test printer connectivity using multiple methods
   */
  async testConnection() {
    const results = {
      ping: false,
      socket: false,
      escpos: false,
      websocket: false
    };

    try {
      // Method 1: Simple network ping via API
      results.ping = await this.testPing();
      
      // Method 2: WebSocket connection test
      results.websocket = await this.testWebSocket();
      
      // Method 3: ESC/POS status command
      results.escpos = await this.testESCPOSStatus();
      
      // Method 4: HTTP connection test
      results.socket = await this.testHTTPConnection();

      return {
        success: Object.values(results).some(r => r),
        methods: results,
        details: this.getConnectionDetails(results)
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        methods: results
      };
    }
  }

  /**
   * Test using simple network ping
   */
  async testPing() {
    try {
      const response = await fetch('/api/printer/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: this.ip, port: this.port }),
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const result = await response.json();
        return result.success;
      }
      return false;
    } catch {
      return false;
    }
  }

  /**
   * Test WebSocket connection to printer
   */
  async testWebSocket() {
    return new Promise((resolve) => {
      try {
        const ws = new WebSocket(`ws://${this.ip}:${this.port}`);
        const timeout = setTimeout(() => {
          ws.close();
          resolve(false);
        }, 3000);

        ws.onopen = () => {
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        };

        ws.onerror = () => {
          clearTimeout(timeout);
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  /**
   * Test ESC/POS printer status
   */
  async testESCPOSStatus() {
    try {
      const response = await fetch('/api/printer/escpos-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: this.ip, port: this.port }),
        signal: AbortSignal.timeout(5000)
      });
      
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Test HTTP connection
   */
  async testHTTPConnection() {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);

      const response = await fetch(`http://${this.ip}:${this.port}`, {
        method: 'HEAD',
        mode: 'no-cors',
        signal: controller.signal
      });

      clearTimeout(timeout);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get connection details based on test results
   */
  getConnectionDetails(results) {
    const successMethods = [];
    
    if (results.ping) successMethods.push('Network Ping');
    if (results.websocket) successMethods.push('WebSocket');
    if (results.escpos) successMethods.push('ESC/POS Status');
    if (results.socket) successMethods.push('HTTP Connection');

    if (successMethods.length > 0) {
      return `Connection successful via: ${successMethods.join(', ')}`;
    } else {
      return 'All connection methods failed. Check printer status and network configuration.';
    }
  }

  /**
   * Send raw data to printer
   */
  async sendRawData(data) {
    try {
      const response = await fetch('/api/printer/print', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ip: this.ip,
          port: this.port,
          data: data
        })
      });

      return await response.json();
    } catch (error) {
      throw new Error(`Failed to send data to printer: ${error.message}`);
    }
  }

  /**
   * Print test receipt
   */
  async printTestReceipt() {
    const testReceipt = 
      ESC_POS_COMMANDS.INIT +
      ESC_POS_COMMANDS.ALIGN_CENTER +
      ESC_POS_COMMANDS.DOUBLE_SIZE +
      ESC_POS_COMMANDS.BOLD_ON +
      'TEST PRINT\n' +
      ESC_POS_COMMANDS.NORMAL_SIZE +
      ESC_POS_COMMANDS.BOLD_OFF +
      ESC_POS_COMMANDS.ALIGN_LEFT +
      '--------------------------------\n' +
      'Cafe Management System\n' +
      'Printer Connection Test\n' +
      '--------------------------------\n' +
      `Date: ${new Date().toLocaleString()}\n` +
      `Printer: ${this.ip}:${this.port}\n` +
      '--------------------------------\n' +
      ESC_POS_COMMANDS.ALIGN_CENTER +
      'Connection Successful!\n' +
      ESC_POS_COMMANDS.LF +
      ESC_POS_COMMANDS.LF +
      ESC_POS_COMMANDS.CUT;

    return await this.sendRawData(testReceipt);
  }

  /**
   * Get printer status
   */
  async getPrinterStatus() {
    try {
      const response = await fetch('/api/printer/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ip: this.ip, port: this.port }),
        signal: AbortSignal.timeout(5000)
      });

      if (response.ok) {
        return await response.json();
      } else {
        throw new Error('Failed to get printer status');
      }
    } catch (error) {
      return {
        online: false,
        error: error.message
      };
    }
  }
}

/**
 * Utility functions
 */
export const PrinterUtils = {
  /**
   * Validate IP address format
   */
  isValidIP(ip) {
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip);
  },

  /**
   * Validate port number
   */
  isValidPort(port) {
    const portNum = parseInt(port);
    return !isNaN(portNum) && portNum >= 1 && portNum <= 65535;
  },

  /**
   * Common thermal printer ports
   */
  getCommonPorts() {
    return [
      { port: '9100', name: 'Standard Thermal Printer Port' },
      { port: '515', name: 'LPD/LPR Protocol' },
      { port: '631', name: 'IPP (Internet Printing Protocol)' },
      { port: '80', name: 'HTTP' },
      { port: '8080', name: 'HTTP Alternative' }
    ];
  },

  /**
   * Auto-discover printers on network
   */
  async autoDiscoverPrinters(networkRange = '192.168.1') {
    const discoveredPrinters = [];
    const promises = [];

    // Check common IP ranges
    for (let i = 1; i <= 254; i++) {
      const ip = `${networkRange}.${i}`;
      promises.push(this.checkPrinterAtIP(ip));
    }

    try {
      const results = await Promise.allSettled(promises);
      results.forEach((result, index) => {
        if (result.status === 'fulfilled' && result.value) {
          discoveredPrinters.push({
            ip: `${networkRange}.${index + 1}`,
            port: '9100',
            status: 'online'
          });
        }
      });
    } catch (error) {
      console.error('Auto-discovery failed:', error);
    }

    return discoveredPrinters;
  },

  /**
   * Check if printer exists at specific IP
   */
  async checkPrinterAtIP(ip) {
    const printer = new ThermalPrinter(ip);
    const result = await printer.testConnection();
    return result.success;
  },

  /**
   * Format receipt data
   */
  formatReceiptData(receiptData) {
    let formattedData = ESC_POS_COMMANDS.INIT;
    
    // Header
    if (receiptData.header) {
      formattedData += ESC_POS_COMMANDS.ALIGN_CENTER;
      formattedData += ESC_POS_COMMANDS.BOLD_ON;
      formattedData += receiptData.header + '\n';
      formattedData += ESC_POS_COMMANDS.BOLD_OFF;
      formattedData += ESC_POS_COMMANDS.ALIGN_LEFT;
    }

    // Items
    if (receiptData.items) {
      formattedData += '--------------------------------\n';
      receiptData.items.forEach(item => {
        formattedData += `${item.name.padEnd(20)} ${item.price.toString().padStart(8)}\n`;
      });
      formattedData += '--------------------------------\n';
    }

    // Total
    if (receiptData.total) {
      formattedData += ESC_POS_COMMANDS.BOLD_ON;
      formattedData += `TOTAL: ${receiptData.total}\n`;
      formattedData += ESC_POS_COMMANDS.BOLD_OFF;
    }

    // Footer
    if (receiptData.footer) {
      formattedData += ESC_POS_COMMANDS.ALIGN_CENTER;
      formattedData += receiptData.footer + '\n';
    }

    formattedData += ESC_POS_COMMANDS.LF + ESC_POS_COMMANDS.LF;
    formattedData += ESC_POS_COMMANDS.CUT;

    return formattedData;
  }
};

export default ThermalPrinter;