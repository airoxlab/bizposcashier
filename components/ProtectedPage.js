// components/ProtectedPage.js - Protected Page Wrapper with Blur/Block UI
'use client'
import React, { useState, useEffect } from 'react'
import { Lock, Shield, AlertTriangle, RefreshCw, CheckCircle, XCircle, X } from 'lucide-react'
import { permissionManager } from '@/lib/permissionManager'
import { authManager } from '@/lib/authManager'
import { motion, AnimatePresence } from 'framer-motion'

/**
 * ProtectedPage Component
 * Wraps pages and shows a blur/block overlay if user lacks permission
 *
 * Usage:
 * <ProtectedPage permissionKey="DASHBOARD" pageName="Dashboard">
 *   <YourPageContent />
 * </ProtectedPage>
 */
export default function ProtectedPage({
  children,
  permissionKey,
  pageName,
  allowClick = false // If true, shows blur but allows clicking through
}) {
  // Initialize synchronously when permissions are already cached — no spinner flash
  const [hasAccess, setHasAccess] = useState(() => {
    try {
      if (permissionManager.isPermissionsLoaded()) {
        return permissionManager.hasPermission(permissionKey)
      }
      return true // Default to access; useEffect will correct if needed
    } catch { return true }
  })
  const [isLoading, setIsLoading] = useState(() => {
    try { return !permissionManager.isPermissionsLoaded() } catch { return true }
  })
  const [userInfo, setUserInfo] = useState(() => {
    try {
      return permissionManager.isPermissionsLoaded()
        ? { name: authManager.getDisplayName(), role: authManager.getRole() }
        : null
    } catch { return null }
  })
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [notification, setNotification] = useState(null) // { type: 'success' | 'error', message: '', count: 0 }

  useEffect(() => {
    checkAccess()
  }, [permissionKey])

  const checkAccess = async () => {
    try {
      // Only async-load if not already loaded AND permissionMap is empty
      // (avoids re-fetching from Supabase on every page navigation)
      if (!permissionManager.isPermissionsLoaded()) {
        await permissionManager.loadPermissions()
      }

      const access = permissionManager.hasPermission(permissionKey)
      const role = authManager.getRole()

      setHasAccess(access)
      setUserInfo({ name: authManager.getDisplayName(), role })
      setIsLoading(false)

      if (!access) {
        const user = authManager.getCurrentUser()
        console.log(`🚫 Access denied to ${pageName} for ${user?.cashier_name || user?.customer_name}`)
      }
    } catch (error) {
      console.error('Error checking access:', error)
      setIsLoading(false)
    }
  }

  const handleRefreshPermissions = async () => {
    setIsRefreshing(true)
    try {
      console.log('🔄 Refreshing permissions from Access Restricted page...')
      const result = await permissionManager.forceReloadFromServer()

      if (result.success) {
        console.log(`✅ Permissions refreshed successfully! Loaded ${result.count} permissions`)
        setNotification({
          type: 'success',
          message: 'Permissions updated successfully!',
          count: result.count
        })
        // Wait 2 seconds to show success message, then reload
        setTimeout(() => {
          window.location.reload()
        }, 2000)
      } else {
        console.error('❌ Failed to refresh permissions:', result.error)
        setNotification({
          type: 'error',
          message: result.error || 'Failed to refresh permissions. Please contact your administrator.'
        })
        setIsRefreshing(false)
      }
    } catch (error) {
      console.error('❌ Error refreshing permissions:', error)
      setNotification({
        type: 'error',
        message: error.message || 'Failed to refresh permissions. Please contact your administrator.'
      })
      setIsRefreshing(false)
    }
  }

  // While loading (permissions not yet cached), render children silently
  // — avoids the spinner flash. useEffect will apply blur if access is denied.
  if (isLoading || hasAccess) {
    return <>{children}</>
  }

  // If no access, show blur overlay with message
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Blurred content underneath */}
      <div
        className={`blur-md ${allowClick ? 'pointer-events-auto' : 'pointer-events-none'} select-none`}
        style={{ filter: 'blur(8px)' }}
      >
        {children}
      </div>

      {/* Overlay blocker */}
      <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 p-8 max-w-md mx-4 relative">
          {/* Custom Notification */}
          <AnimatePresence>
            {notification && (
              <motion.div
                initial={{ opacity: 0, y: -20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="absolute -top-4 left-0 right-0 mx-4 z-60"
              >
                <div className={`rounded-xl shadow-2xl border-2 p-4 ${
                  notification.type === 'success'
                    ? 'bg-green-50 border-green-500'
                    : 'bg-red-50 border-red-500'
                }`}>
                  <div className="flex items-start gap-3">
                    <div className={`flex-shrink-0 ${
                      notification.type === 'success' ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {notification.type === 'success' ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : (
                        <XCircle className="w-6 h-6" />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className={`font-semibold text-sm ${
                        notification.type === 'success' ? 'text-green-900' : 'text-red-900'
                      }`}>
                        {notification.type === 'success' ? 'Success!' : 'Error'}
                      </p>
                      <p className={`text-sm mt-1 ${
                        notification.type === 'success' ? 'text-green-800' : 'text-red-800'
                      }`}>
                        {notification.message}
                      </p>
                      {notification.count !== undefined && (
                        <p className={`text-xs mt-1 ${
                          notification.type === 'success' ? 'text-green-700' : 'text-red-700'
                        }`}>
                          Loaded {notification.count} permissions
                        </p>
                      )}
                      {notification.type === 'success' && (
                        <p className="text-xs mt-2 text-green-600 font-medium">
                          Page will refresh in a moment...
                        </p>
                      )}
                    </div>
                    {notification.type === 'error' && (
                      <button
                        onClick={() => setNotification(null)}
                        className="flex-shrink-0 text-red-600 hover:text-red-800"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="text-center">
            {/* Icon */}
            <div className="mb-6">
              <div className="bg-red-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
                <Lock className="w-10 h-10 text-red-600" />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-gray-900 mb-3">
              Access Restricted
            </h2>

            {/* Message */}
            <p className="text-gray-600 mb-6">
              You don't have permission to access <span className="font-semibold text-gray-900">{pageName}</span>.
            </p>

            {/* User Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center justify-center gap-2 text-sm">
                <Shield className="w-4 h-4 text-gray-500" />
                <span className="text-gray-700">
                  Logged in as: <span className="font-semibold">{userInfo?.name}</span>
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-2">
                Role: {userInfo?.role === 'admin' ? 'Administrator' : 'Cashier'}
              </div>
            </div>

            {/* Help Text */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-left">
                  <p className="text-sm text-blue-900 font-medium mb-1">
                    Need Access?
                  </p>
                  <p className="text-xs text-blue-700">
                    Please contact your administrator to request access to this feature.
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              {/* Refresh Permissions Button */}
              <button
                onClick={handleRefreshPermissions}
                disabled={isRefreshing}
                className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                title="If your admin just granted you access, click here to refresh your permissions"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh Permissions'}
              </button>

              {/* Back Button */}
              <button
                onClick={() => window.history.back()}
                className="w-full px-6 py-3 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors font-medium"
              >
                Go Back
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Alternative: ProtectedSection Component
 * For protecting specific sections within a page instead of the entire page
 */
export function ProtectedSection({
  children,
  permissionKey,
  fallback = null,
  showMessage = true
}) {
  const [hasAccess, setHasAccess] = useState(false)

  useEffect(() => {
    const access = permissionManager.hasPermission(permissionKey)
    setHasAccess(access)
  }, [permissionKey])

  if (hasAccess) {
    return <>{children}</>
  }

  if (showMessage && !fallback) {
    return (
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
        <Lock className="w-8 h-8 text-gray-400 mx-auto mb-3" />
        <p className="text-gray-600 text-sm">
          You don't have permission to access this feature.
        </p>
      </div>
    )
  }

  return fallback
}
