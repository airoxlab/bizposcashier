// lib/marketingUtils.js
import * as XLSX from 'xlsx';

export const marketingUtils = {
  /**
   * Parse multiple phone numbers from textarea
   * Supports: comma, newline, dot, semicolon separation
   */
  parsePhoneNumbers: (text) => {
    if (!text || text.trim() === '') return [];

    // Split by common delimiters
    const numbers = text
      .split(/[,.\n;|]+/)
      .map(num => num.trim())
      .filter(num => num.length > 0);

    // Remove duplicates
    return [...new Set(numbers)];
  },

  /**
   * Format phone number to international format
   * Handles Pakistani numbers starting with 0
   */
  formatPhoneNumber: (number) => {
    const cleaned = number.replace(/\D/g, '');
    
    // If starts with 0, replace with +92
    if (cleaned.startsWith('0')) {
      return '+92' + cleaned.substring(1);
    }
    
    // If already starts with 92, add +
    if (cleaned.startsWith('92')) {
      return '+' + cleaned;
    }
    
    // Otherwise, add +92
    return '+92' + cleaned;
  },

  /**
   * Parse Excel/CSV file and extract phone numbers
   * Returns: { headers, data, phoneColumn }
   */
  parseExcelFile: async (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          
          // Get first sheet
          const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

          if (jsonData.length === 0) {
            reject(new Error('Excel file is empty'));
            return;
          }

          // First row is headers
          const headers = jsonData[0];
          const rows = jsonData.slice(1);

          // Try to find phone column
          const phoneColumnIndex = headers.findIndex(h => 
            h && h.toString().toLowerCase().match(/phone|mobile|number|contact/)
          );

          // Convert to objects
          const parsedData = rows.map(row => {
            const obj = {};
            headers.forEach((header, index) => {
              obj[header] = row[index] || '';
            });
            return obj;
          });

          resolve({
            headers: headers.filter(h => h), // Remove empty headers
            data: parsedData,
            phoneColumnIndex: phoneColumnIndex
          });

        } catch (error) {
          reject(error);
        }
      };

      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsArrayBuffer(file);
    });
  },

  /**
   * Extract phone numbers from parsed Excel data
   */
  extractPhoneNumbers: (excelData, phoneColumnName) => {
    if (!excelData || !excelData.data) return [];

    const numbers = excelData.data
      .map(row => row[phoneColumnName])
      .filter(num => num && num.toString().trim() !== '')
      .map(num => marketingUtils.formatPhoneNumber(num.toString()));

    // Remove duplicates
    return [...new Set(numbers)];
  },

  /**
   * Replace tags in message template
   */
  replaceTags: (template, data) => {
    let message = template;

    // Replace {first_name}
    if (data.first_name) {
      message = message.replace(/{first_name}/g, data.first_name);
    } else {
      message = message.replace(/{first_name}/g, 'Valued Customer');
    }

    // Replace {last_name}
    if (data.last_name) {
      message = message.replace(/{last_name}/g, data.last_name);
    } else {
      message = message.replace(/{last_name}/g, '');
    }

    // Replace {phone}
    if (data.phone) {
      message = message.replace(/{phone}/g, data.phone);
    } else {
      message = message.replace(/{phone}/g, '');
    }

    // Replace other common tags
    message = message.replace(/{date}/g, new Date().toLocaleDateString());
    message = message.replace(/{time}/g, new Date().toLocaleTimeString());

    return message.trim();
  },

  /**
   * Validate image path
   */
  validateImagePath: (path) => {
    if (!path || path.trim() === '') return { valid: false, error: 'No path provided' };

    const validExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'];
    const ext = path.toLowerCase().slice(path.lastIndexOf('.'));

    if (!validExtensions.includes(ext)) {
      return { 
        valid: false, 
        error: `Invalid image format. Supported: ${validExtensions.join(', ')}` 
      };
    }

    return { valid: true };
  },

  /**
   * Generate campaign name
   */
  generateCampaignName: () => {
    const date = new Date();
    const dateStr = date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
    return `Campaign ${dateStr}`;
  },

  /**
   * Calculate statistics from results
   */
  calculateStats: (results) => {
    return {
      total: results.length,
      sent: results.filter(r => r.status === 'sent').length,
      failed: results.filter(r => r.status === 'failed').length,
      pending: results.filter(r => r.status === 'pending').length
    };
  }
};

export default marketingUtils;