// hooks/useTheme.js
import { useState, useEffect } from 'react'

// Theme manager instance - will be initialized client-side only
let themeManagerInstance = null

// Initialize theme manager only on client side
const initThemeManager = async () => {
  if (typeof window !== 'undefined' && !themeManagerInstance) {
    try {
      const { themeManager } = await import('../lib/themeManager')
      themeManagerInstance = themeManager
      return themeManagerInstance
    } catch (error) {
      console.error('Failed to initialize theme manager:', error)
      return null
    }
  }
  return themeManagerInstance
}

export const useTheme = () => {
  const [isReady, setIsReady] = useState(false)
  const [currentTheme, setCurrentTheme] = useState('light')
  const [themeClasses, setThemeClasses] = useState({
    background: 'bg-gradient-to-br from-indigo-50 via-purple-50 to-pink-50',
    card: 'bg-white',
    textPrimary: 'text-gray-900',
    textSecondary: 'text-gray-600',
    border: 'border-gray-200',
    shadow: 'shadow-lg',
    header: 'bg-white/90',
    sidebar: 'bg-white',
    button: 'bg-gray-100 hover:bg-gray-200 text-gray-900 border-gray-300',
    input: 'bg-white border-gray-300 text-gray-900 placeholder-gray-500',
    modal: 'bg-white border-gray-200',
    hover: 'hover:bg-gray-50',
    focus: 'focus:ring-2 focus:ring-purple-500 focus:ring-offset-2'
  })

  useEffect(() => {
    const initialize = async () => {
      const manager = await initThemeManager()
      if (manager) {
        setCurrentTheme(manager.currentTheme)
        setThemeClasses(manager.getClasses())
        manager.applyTheme()
        setIsReady(true)
      } else {
        // Fallback to light theme if initialization fails
        setIsReady(true)
      }
    }

    initialize()
  }, [])

  const toggleTheme = async () => {
    const manager = themeManagerInstance || await initThemeManager()
    if (manager) {
      const newTheme = currentTheme === 'light' ? 'dark' : 'light'
      setCurrentTheme(newTheme)
      manager.setTheme(newTheme)
      setThemeClasses(manager.getClasses())
    }
  }

  const setTheme = async (themeName) => {
    const manager = themeManagerInstance || await initThemeManager()
    if (manager && manager.themes[themeName]) {
      setCurrentTheme(themeName)
      manager.setTheme(themeName)
      setThemeClasses(manager.getClasses())
    }
  }

  const formatCurrency = (amount) => {
    const manager = themeManagerInstance
    if (manager) {
      return manager.formatCurrency(amount)
    }
    return `Rs ${parseFloat(amount).toFixed(2)}` // Fallback
  }

  const isDark = () => {
    return currentTheme === 'dark'
  }

  const getIconColor = (type = 'primary') => {
    const manager = themeManagerInstance
    if (manager) {
      return manager.getIconColor(type)
    }
    
    // Fallback colors
    const isDarkMode = isDark()
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

  const getComponentStyles = () => {
    const manager = themeManagerInstance
    if (manager && manager.getComponentStyles) {
      return manager.getComponentStyles()
    }

    // Fallback component styles
    const isDarkMode = isDark()
    return {
      page: `min-h-screen bg-gradient-to-br ${themeClasses.background} transition-all duration-500`,
      content: isDarkMode ? 'text-white' : 'text-gray-900',
      cardWrapper: `${themeClasses.card} ${themeClasses.border} border rounded-xl ${themeClasses.shadow} transition-all duration-300`,
      formInput: `w-full px-4 py-3 rounded-lg ${themeClasses.input} border focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all`,
      primaryButton: 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white font-semibold py-3 px-6 rounded-lg shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-200',
      secondaryButton: `${themeClasses.button} font-semibold py-3 px-6 rounded-lg border transition-all duration-200`,
      heading1: `${themeClasses.textPrimary} text-3xl font-bold`,
      heading2: `${themeClasses.textPrimary} text-2xl font-bold`,
      heading3: `${themeClasses.textPrimary} text-xl font-semibold`,
      bodyText: themeClasses.textSecondary,
      mutedText: `${isDarkMode ? 'text-gray-400' : 'text-gray-500'} text-sm`,
    }
  }

  return {
    isReady,
    currentTheme,
    themeClasses,
    toggleTheme,
    setTheme,
    formatCurrency,
    isDark: isDark(),
    getIconColor,
    getComponentStyles,
    manager: themeManagerInstance
  }
}