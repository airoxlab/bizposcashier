// lib/config/printerConfig.js
export const PrinterConfig = {
  // Default connection settings
  DEFAULT_PORT: 9100,
  CONNECTION_TIMEOUT: 5000,
  PRINT_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,

  // Supported printer types and paper sizes
  PRINTER_TYPES: {
    THERMAL: 'thermal',
    INKJET: 'inkjet', 
    LASER: 'laser'
  },

  PAPER_SIZES: {
    THERMAL_58: '58mm',
    THERMAL_80: '80mm',
    A4: 'A4'
  },

  // ESC/POS Commands
  COMMANDS: {
    ESC: 0x1B,
    GS: 0x1D,
    LF: 0x0A,
    
    // Text formatting
    BOLD_ON: [0x1B, 0x45, 0x01],
    BOLD_OFF: [0x1B, 0x45, 0x00],
    UNDERLINE_ON: [0x1B, 0x2D, 0x01],
    UNDERLINE_OFF: [0x1B, 0x2D, 0x00],
    
    // Text size
    NORMAL_SIZE: [0x1B, 0x21, 0x00],
    DOUBLE_HEIGHT: [0x1B, 0x21, 0x10],
    DOUBLE_WIDTH: [0x1B, 0x21, 0x20],
    DOUBLE_SIZE: [0x1B, 0x21, 0x30],
    
    // Alignment
    ALIGN_LEFT: [0x1B, 0x61, 0x00],
    ALIGN_CENTER: [0x1B, 0x61, 0x01],
    ALIGN_RIGHT: [0x1B, 0x61, 0x02],
    
    // Cutting
    CUT_PARTIAL: [0x1D, 0x56, 0x01],
    CUT_FULL: [0x1D, 0x56, 0x00],
    
    // Initialization
    INIT: [0x1B, 0x40]
  },

  // Receipt formatting
  RECEIPT: {
    CHAR_PER_LINE_58: 32,
    CHAR_PER_LINE_80: 42,
    LEFT_PADDING: '  ',
    SEPARATOR_CHAR: '=',
    ITEM_SEPARATOR: '-'
  },

  // Validation rules
  VALIDATION: {
    IP_REGEX: /^(\d{1,3}\.){3}\d{1,3}$/,
    MAC_REGEX: /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/,
    PORT_MIN: 1,
    PORT_MAX: 65535,
    NAME_MAX_LENGTH: 100,
    ADDRESS_MAX_LENGTH: 500
  },

  // Error messages
  ERRORS: {
    CONNECTION_REFUSED: 'Printer not responding. Check power and network connection.',
    TIMEOUT: 'Connection timeout. Printer may be busy or unreachable.',
    NOT_FOUND: 'Printer not found at specified IP address.',
    CONNECTION_RESET: 'Connection was reset. Printer may have restarted.',
    NETWORK_UNREACHABLE: 'Network unreachable. Check network configuration.',
    INVALID_IP: 'Invalid IP address format.',
    INVALID_MAC: 'Invalid MAC address format.',
    INVALID_PORT: 'Port must be between 1 and 65535.',
    NO_PRINTER: 'No printer configured. Please add a printer first.',
    PRINT_FAILED: 'Print job failed. Check printer status.'
  }
}