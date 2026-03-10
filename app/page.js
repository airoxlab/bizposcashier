'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Store, Lock, Phone, Eye, EyeOff, Printer } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { authManager } from '../lib/authManager'
import { themeManager } from '../lib/themeManager'
import { cacheManager } from '../lib/cacheManager'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isCheckingAuth, setIsCheckingAuth] = useState(true)
  const [printerAssetsStatus, setPrinterAssetsStatus] = useState('')
  const router = useRouter()

  useEffect(() => {
    checkExistingAuth()
  }, [])

  const checkExistingAuth = async () => {
    try {
      if (typeof window !== 'undefined') {
        themeManager.applyTheme()
      }
      
      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => resolve(false), 1500)
      })
      
      const authCheckPromise = new Promise(async (resolve) => {
        try {
          const isLoggedIn = authManager.isLoggedIn()
          resolve(isLoggedIn)
        } catch (error) {
          resolve(false)
        }
      })
      
      const isLoggedIn = await Promise.race([authCheckPromise, timeoutPromise])
      
      if (isLoggedIn) {
        router.push('/dashboard')
      } else {
        setIsCheckingAuth(false)
      }
      
    } catch (error) {
      setIsCheckingAuth(false)
    }
  }

  const formatPhoneNumber = (value) => {
    const cleaned = value.replace(/\D/g, '')
    
    if (cleaned.length <= 4) {
      return cleaned
    } else if (cleaned.length <= 7) {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4)}`
    } else {
      return `${cleaned.slice(0, 4)} ${cleaned.slice(4, 7)} ${cleaned.slice(7, 11)}`
    }
  }

  const handlePhoneChange = (e) => {
    const value = e.target.value
    const formatted = formatPhoneNumber(value)
    setPhone(formatted)
  }

  const handleLogin = async (e) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')
    setPrinterAssetsStatus('')

    try {
      const cleanPhone = phone.replace(/\s+/g, '')
      
      if (cleanPhone.length < 11) {
        setError('Please enter a valid 11-digit phone number')
        setIsLoading(false)
        return
      }

      if (!password) {
        setError('Please enter your password')
        setIsLoading(false)
        return
      }

      // Show printer assets loading if in Electron
      if (typeof window !== 'undefined' && window.electron) {
        setPrinterAssetsStatus('Downloading printer assets...')
      }

      // Use phone as-is without adding country code
      const result = await authManager.login(cleanPhone, password)
      
      if (result.success) {
        // Download and cache printer assets on login
        if (typeof window !== 'undefined' && window.electron) {
          try {
            setPrinterAssetsStatus('⏳ Downloading printer assets...')

            // Get user profile data with logo and QR URLs
            const userProfile = result.user || JSON.parse(localStorage.getItem('user') || '{}')

            if (userProfile.store_logo || userProfile.qr_code) {
              // Trigger asset download and caching
              const downloadResult = await window.electron.invoke('download-store-assets', {
                logoUrl: userProfile.store_logo,
                qrUrl: userProfile.qr_code
              })

              if (downloadResult.success) {
                setPrinterAssetsStatus('✓ Printer assets cached successfully')
              } else {
                setPrinterAssetsStatus('⚠ Some assets may not have downloaded')
              }
            } else {
              setPrinterAssetsStatus('⚠ No logo/QR configured')
            }
          } catch (err) {
            console.error('Error downloading printer assets:', err)
            setPrinterAssetsStatus('⚠ Asset download failed')
          }
        }

        // Small delay to show success message
        setTimeout(() => {
          cacheManager.resetSession()
          router.push('/dashboard')
        }, 500)
      } else {
        setError(result.error || 'Invalid phone number or password')
        setIsLoading(false)
        setPrinterAssetsStatus('')
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An error occurred. Please try again.')
      setIsLoading(false)
      setPrinterAssetsStatus('')
    }
  }

  if (isCheckingAuth) {
    return <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600" />
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="w-full max-w-md"
      >
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl p-8">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="mx-auto w-14 h-14 bg-gradient-to-br from-purple-600 to-blue-600 rounded-xl flex items-center justify-center mb-4">
              <Store className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-1">Welcome Back</h1>
            <p className="text-gray-500 text-sm">Sign in to your POS account</p>
          </div>

          {/* Login Form */}
          <form onSubmit={handleLogin} className="space-y-5">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm"
              >
                {error}
              </motion.div>
            )}

            {printerAssetsStatus && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`border rounded-lg p-3 text-sm flex items-center gap-2 ${
                  printerAssetsStatus.includes('✓') 
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : printerAssetsStatus.includes('⚠')
                    ? 'bg-yellow-50 border-yellow-200 text-yellow-700'
                    : 'bg-blue-50 border-blue-200 text-blue-700'
                }`}
              >
                <Printer className="w-4 h-4" />
                {printerAssetsStatus}
              </motion.div>
            )}

            {/* Phone Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone Number
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-gray-800 placeholder-gray-400"
                  placeholder="03XX XXX XXXX"
                  maxLength="13"
                  required
                  disabled={isLoading}
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Enter 11-digit phone number (e.g., 0300 123 4567)
              </p>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all text-gray-800 placeholder-gray-400"
                  placeholder="Enter your password"
                  required
                  disabled={isLoading}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                  disabled={isLoading}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold py-2.5 rounded-lg shadow-md hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2"></div>
                  Signing in...
                </div>
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          {/* Footer Info */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 rounded-lg p-3 mb-4">
              <p className="text-xs text-blue-800 font-medium">
                ✓ Works for both Admin and Cashier accounts
              </p>
            </div>
            
            <div className="text-center">
              <p className="text-xs text-gray-500">
                BizPOS v2.0 | Powered by <span className="font-semibold">Anvirosoft.com</span>
              </p>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

