// lib/themeManager.js

class ThemeManager {
  constructor() {
    this.themes = {
      light: {
        name: 'Light',
        background: 'from-indigo-50 via-purple-50 to-pink-50',
        cardBg: 'bg-white',
        textPrimary: 'text-gray-900',
        textSecondary: 'text-gray-600',
        border: 'border-gray-200',
        shadow: 'shadow-lg',
        headerBg: 'bg-white/80',
        sidebarBg: 'bg-white'
      },
      dark: {
        name: 'Dark',
        background: 'from-gray-900 via-purple-900 to-blue-900',
        cardBg: 'bg-gray-800',
        textPrimary: 'text-white',
        textSecondary: 'text-gray-300',
        border: 'border-gray-700',
        shadow: 'shadow-xl shadow-black/20',
        headerBg: 'bg-gray-800/80',
        sidebarBg: 'bg-gray-800'
      }
    }

    this.backgrounds = {
      default: 'from-indigo-50 via-purple-50 to-pink-50',
      ocean: 'from-blue-400 via-blue-500 to-blue-600',
      sunset: 'from-orange-400 via-red-500 to-pink-500',
      forest: 'from-green-400 via-green-500 to-emerald-600',
      purple: 'from-purple-400 via-purple-500 to-indigo-600',
      midnight: 'from-gray-900 via-purple-900 to-blue-900',
      gradient1: 'from-pink-300 via-purple-300 to-indigo-400',
      gradient2: 'from-yellow-200 via-green-200 to-green-300',
      gradient3: 'from-red-200 via-red-300 to-yellow-300'
    }

    this.currencies = {
      PKR: { symbol: 'Rs', name: 'Pakistani Rupee' },
      INR: { symbol: '₹', name: 'Indian Rupee' },
      USD: { symbol: '$', name: 'US Dollar' },
      EUR: { symbol: '€', name: 'Euro' },
      GBP: { symbol: '£', name: 'British Pound' },
      AED: { symbol: 'د.إ', name: 'UAE Dirham' },
      SAR: { symbol: 'ر.س', name: 'Saudi Riyal' }
    }

    this.currentTheme = 'light'
    this.currentBackground = 'default'
    this.currentCurrency = 'PKR'

    // Initialize settings only on client-side
    if (typeof window !== 'undefined') {
      this.loadSettings()
    }
  }

  // Helper method to get cookie value
  getCookie(name) {
    if (typeof document === 'undefined') return null
    
    const nameEQ = name + "="
    const ca = document.cookie.split(';')
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i]
      while (c.charAt(0) === ' ') c = c.substring(1, c.length)
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length)
    }
    return null
  }

  // Helper method to set cookie
  setCookie(name, value, days = 365) {
    if (typeof document === 'undefined') return
    
    try {
      const expires = new Date()
      expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000))
      document.cookie = `${name}=${value}; expires=${expires.toUTCString()}; path=/`
    } catch (e) {
      console.warn('Could not set cookie:', e)
    }
  }

  loadSettings() {
    if (typeof window !== 'undefined') {
      // First, try to load from in-memory storage
      let theme, background, currency
      
      if (window._themeSettings) {
        ({ theme, background, currency } = window._themeSettings)
      } else {
        // Try cookies first, then localStorage as fallback
        theme = this.getCookie('theme') || localStorage.getItem('theme')
        background = this.getCookie('background') || localStorage.getItem('background')
        currency = this.getCookie('currency') || localStorage.getItem('currency')
      }

      // Apply loaded settings if valid
      if (theme && this.themes[theme]) {
        this.currentTheme = theme
      }
      if (background && this.backgrounds[background]) {
        this.currentBackground = background
      }
      if (currency && this.currencies[currency]) {
        this.currentCurrency = currency
      }

      // Always ensure in-memory storage is updated
      window._themeSettings = {
        theme: this.currentTheme,
        background: this.currentBackground,
        currency: this.currentCurrency
      }

      this.applyTheme()
    }
  }

  saveSettings() {
    if (typeof window !== 'undefined') {
      // Store in memory
      window._themeSettings = {
        theme: this.currentTheme,
        background: this.currentBackground,
        currency: this.currentCurrency
      }

      // Persist in cookies for cross-session persistence
      this.setCookie('theme', this.currentTheme)
      this.setCookie('background', this.currentBackground)
      this.setCookie('currency', this.currentCurrency)

      // Also persist in localStorage so the layout anti-flash script can read it
      try {
        localStorage.setItem('theme', this.currentTheme)
        localStorage.setItem('background', this.currentBackground)
        localStorage.setItem('currency', this.currentCurrency)
      } catch (e) { /* ignore */ }
    }
  }

  setTheme(themeName) {
    if (this.themes[themeName]) {
      this.currentTheme = themeName
      this.applyTheme()
      this.saveSettings()
    }
  }

  setBackground(backgroundName) {
    if (this.backgrounds[backgroundName]) {
      this.currentBackground = backgroundName
      this.applyTheme()
      this.saveSettings()
    }
  }

  setCurrency(currencyCode) {
    if (this.currencies[currencyCode]) {
      this.currentCurrency = currencyCode
      this.saveSettings()
    }
  }

  applyTheme() {
    if (typeof document === 'undefined') return

    const theme = this.themes[this.currentTheme]
    const background = this.backgrounds[this.currentBackground]

    // Remove existing theme classes
    document.documentElement.classList.remove('dark', 'light')
    
    // Add current theme class to enable Tailwind dark mode
    document.documentElement.classList.add(this.currentTheme)

    // For dark theme, update background to dark version
    if (this.currentTheme === 'dark') {
      this.currentBackground = 'midnight'
    } else if (this.currentTheme === 'light' && this.currentBackground === 'midnight') {
      this.currentBackground = 'default'
    }

    // We rely on CSS variables defined in globals.css and the `.dark` class
    // instead of setting inline CSS variables here. Mutating inline styles on
    // the <html> element can cause SSR hydration mismatches between server and
    // client markup, so avoid updating document.documentElement.style here.
  }

  getTheme() {
    return this.themes[this.currentTheme]
  }

  getCurrentBackground() {
    return this.backgrounds[this.currentBackground]
  }

  getCurrentCurrency() {
    return this.currencies[this.currentCurrency]
  }

  getAllThemes() {
    return this.themes
  }

  getAllBackgrounds() {
    return this.backgrounds
  }

  getAllCurrencies() {
    return this.currencies
  }

  isDark() {
    return this.currentTheme === 'dark'
  }

  formatCurrency(amount) {
    const currency = this.getCurrentCurrency()
    return `${currency.symbol} ${parseFloat(amount).toFixed(2)}`
  }

  // Get consistent theme-aware classes for components
  getClasses() {
    const theme = this.getTheme()
    const isDarkMode = this.isDark()
    
    return {
      // Background with proper gradient
      background: `bg-gradient-to-br ${this.getCurrentBackground()}`,
      
      // Card backgrounds - use theme-specific colors
      card: isDarkMode ? 'bg-gray-800' : 'bg-white',
      
      // Text colors - use theme-specific colors
      textPrimary: isDarkMode ? 'text-white' : 'text-gray-900',
      textSecondary: isDarkMode ? 'text-gray-300' : 'text-gray-600',
      
      // Border colors
      border: isDarkMode ? 'border-gray-700' : 'border-gray-200',
      
      // Shadow with theme support
      shadow: isDarkMode ? 'shadow-xl shadow-black/20' : 'shadow-lg',
      
      // Header and sidebar
      header: isDarkMode ? 'bg-gray-800/90' : 'bg-white/90',
      sidebar: isDarkMode ? 'bg-gray-800' : 'bg-white',
      
      // Input styles
      input: isDarkMode 
        ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
      
      // Button styles
      button: isDarkMode
        ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
        : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300',
      
      // Modal styles
      modal: isDarkMode
        ? 'bg-gray-800 border-gray-700'
        : 'bg-white border-gray-200',
      
      // Hover states
      hover: isDarkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-50',
      
      // Focus states
      focus: isDarkMode 
        ? 'focus:ring-2 focus:ring-purple-400 focus:ring-offset-2 focus:ring-offset-gray-800'
        : 'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
    }
  }

  // Helper method to get icon color based on theme
  getIconColor(type = 'primary') {
    const isDarkMode = this.isDark()
    
    switch (type) {
      case 'primary':
        return isDarkMode ? 'text-white' : 'text-gray-900'
      case 'secondary':
        return isDarkMode ? 'text-gray-300' : 'text-gray-600'
      case 'success':
        return 'text-green-500'
      case 'warning':
        return isDarkMode ? 'text-orange-400' : 'text-orange-600'
      case 'error':
        return 'text-red-500'
      default:
        return isDarkMode ? 'text-gray-300' : 'text-gray-600'
    }
  }

  // Method to get consistent component styles
  getComponentStyles() {
    const isDarkMode = this.isDark()
    
    return {
      // Page container
      page: `min-h-screen bg-gradient-to-br ${this.getCurrentBackground()} transition-all duration-500`,
      
      // Content wrapper
      content: isDarkMode ? 'text-white' : 'text-gray-900',
      
      // Card component
      cardWrapper: `${isDarkMode ? 'bg-gray-800' : 'bg-white'} ${isDarkMode ? 'border-gray-700' : 'border-gray-200'} border rounded-xl ${isDarkMode ? 'shadow-xl shadow-black/20' : 'shadow-lg'} transition-all duration-300`,
      
      // Form elements
      formInput: `w-full px-4 py-3 rounded-lg ${isDarkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} border focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`,
      
      // Buttons
      primaryButton: `bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200`,
      
      secondaryButton: `${isDarkMode ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600' : 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300'} font-semibold py-3 px-6 rounded-lg border transition-all duration-200`,
      
      dangerButton: `bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200`,
      
      // Navigation
      navItem: `${isDarkMode ? 'text-gray-300 hover:text-white hover:bg-gray-700' : 'text-gray-700 hover:text-gray-900 hover:bg-gray-100'} px-4 py-2 rounded-lg font-medium transition-all duration-200`,
      
      navItemActive: `${isDarkMode ? 'bg-gray-700 text-white' : 'bg-purple-100 text-purple-700'} px-4 py-2 rounded-lg font-medium`,
      
      // Tables
      tableHeader: `${isDarkMode ? 'bg-gray-700 text-gray-200' : 'bg-gray-50 text-gray-700'} px-6 py-3 text-left text-xs font-medium uppercase tracking-wider`,
      
      tableRow: `${isDarkMode ? 'bg-gray-800 hover:bg-gray-700 border-gray-700' : 'bg-white hover:bg-gray-50 border-gray-200'} border-b transition-colors duration-200`,
      
      tableCell: `${isDarkMode ? 'text-gray-300' : 'text-gray-900'} px-6 py-4 whitespace-nowrap text-sm`,
      
      // Modals
      modalOverlay: 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50',
      
      modalContent: `${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-2xl shadow-2xl max-w-md w-full border transform transition-all duration-300`,
      
      // Alerts
      successAlert: `${isDarkMode ? 'bg-green-900 border-green-700 text-green-200' : 'bg-green-50 border-green-200 text-green-800'} border rounded-lg p-4`,
      
      errorAlert: `${isDarkMode ? 'bg-red-900 border-red-700 text-red-200' : 'bg-red-50 border-red-200 text-red-800'} border rounded-lg p-4`,
      
      warningAlert: `${isDarkMode ? 'bg-yellow-900 border-yellow-700 text-yellow-200' : 'bg-yellow-50 border-yellow-200 text-yellow-800'} border rounded-lg p-4`,
      
      infoAlert: `${isDarkMode ? 'bg-blue-900 border-blue-700 text-blue-200' : 'bg-blue-50 border-blue-200 text-blue-800'} border rounded-lg p-4`,
      
      // Headers and text
      heading1: `${isDarkMode ? 'text-white' : 'text-gray-900'} text-3xl font-bold`,
      heading2: `${isDarkMode ? 'text-white' : 'text-gray-900'} text-2xl font-bold`,
      heading3: `${isDarkMode ? 'text-white' : 'text-gray-900'} text-xl font-semibold`,
      
      bodyText: `${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`,
      mutedText: `${isDarkMode ? 'text-gray-400' : 'text-gray-500'} text-sm`,
      
      // Loading states
      spinner: 'animate-spin rounded-full border-b-2 border-purple-600',
      loadingOverlay: `${isDarkMode ? 'bg-gray-800' : 'bg-white'} bg-opacity-90 absolute inset-0 flex items-center justify-center`,
      
      // Status indicators
      statusOnline: 'w-3 h-3 bg-green-500 rounded-full',
      statusOffline: 'w-3 h-3 bg-red-500 rounded-full',
      statusPending: 'w-3 h-3 bg-yellow-500 rounded-full animate-pulse',
      
      // Badges
      primaryBadge: 'bg-purple-100 text-purple-800 text-xs font-medium px-2.5 py-0.5 rounded-full',
      successBadge: 'bg-green-100 text-green-800 text-xs font-medium px-2.5 py-0.5 rounded-full',
      warningBadge: 'bg-yellow-100 text-yellow-800 text-xs font-medium px-2.5 py-0.5 rounded-full',
      errorBadge: 'bg-red-100 text-red-800 text-xs font-medium px-2.5 py-0.5 rounded-full',
      
      // Dark mode variants for badges
      primaryBadgeDark: isDarkMode ? 'bg-purple-900 text-purple-200' : 'bg-purple-100 text-purple-800',
      successBadgeDark: isDarkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800',
      warningBadgeDark: isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800',
      errorBadgeDark: isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-800',
    }
  }
}

// Export a singleton instance for use across the app
const themeManager = new ThemeManager()

// Named export and default export for compatibility
export { themeManager }
export default themeManager