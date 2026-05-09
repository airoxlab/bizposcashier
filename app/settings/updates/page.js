'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Download, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { notify } from '../../../components/ui/NotificationSystem'

export function UpdatesPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()

  const [updateState, setUpdateState] = useState({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: null,
    version: null,
    currentVersion: null,
    hasChecked: false,
  })

  useEffect(() => {
    if (!window.electronAPI) return

    window.electronAPI.getAppVersion().then(version => {
      setUpdateState(prev => ({ ...prev, currentVersion: version }))
    })

    window.electronAPI.onUpdateStatus(() => {
      setUpdateState(prev => ({ ...prev, checking: true }))
    })

    window.electronAPI.onUpdateAvailable((data) => {
      setUpdateState(prev => ({ ...prev, checking: false, available: true, version: data.version }))
    })

    window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateState(prev => ({ ...prev, checking: false, available: false }))
    })

    window.electronAPI.onUpdateDownloadProgress((data) => {
      const fmt = (bytes) => {
        if (bytes === 0) return '0 B'
        const k = 1024
        const sizes = ['B', 'KB', 'MB', 'GB']
        const i = Math.floor(Math.log(bytes) / Math.log(k))
        return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]
      }
      setUpdateState(prev => ({
        ...prev,
        downloading: true,
        progress: {
          percent: Math.round(data.percent),
          transferred: fmt(data.transferred),
          total: fmt(data.total),
          speed: fmt(data.bytesPerSecond) + '/s',
        },
      }))
    })

    window.electronAPI.onUpdateDownloaded((data) => {
      setUpdateState(prev => ({ ...prev, downloading: false, downloaded: true, version: data.version }))
      notify.success('Update downloaded! Click "Install Update" to restart and update.')
    })

    window.electronAPI.onUpdateError((data) => {
      setUpdateState(prev => ({ ...prev, checking: false, downloading: false, error: data.message }))
      notify.error('Update error: ' + data.message)
      setTimeout(() => setUpdateState(prev => ({ ...prev, error: null })), 10000)
    })

    return () => {
      if (window.electronAPI?.removeUpdateListeners) {
        window.electronAPI.removeUpdateListeners()
      }
    }
  }, [])

  useEffect(() => {
    if (!updateState.hasChecked && !updateState.checking && window.electronAPI) {
      handleCheckForUpdates()
    }
  }, [])

  const handleCheckForUpdates = async () => {
    if (!window.electronAPI) {
      notify.error('Update feature is only available in desktop app')
      return
    }
    setUpdateState(prev => ({ ...prev, checking: true, error: null, hasChecked: true }))
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (result?.message) {
        setUpdateState(prev => ({ ...prev, checking: false, error: result.message }))
      }
    } catch {
      setUpdateState(prev => ({ ...prev, checking: false, error: 'Failed to check for updates' }))
    }
  }

  const handleDownloadUpdate = async () => {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.downloadUpdate()
    } catch {
      notify.error('Failed to download update')
    }
  }

  const handleInstallUpdate = () => {
    if (!window.electronAPI) return
    window.electronAPI.installUpdate()
  }

  return (
    <motion.div
      key="updates"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto"
    >
      <div className={`${classes.card} ${classes.shadow} ${classes.border} rounded-xl p-5`}>
        <div className={`mb-4 p-4 rounded-xl ${isDark ? 'bg-gray-700/50' : 'bg-gray-50'}`}>
          <div className="flex items-center justify-between">
            <div>
              <p className={`text-xs ${classes.textSecondary} mb-1`}>Current Version</p>
              <p className={`text-xl font-bold ${classes.textPrimary}`}>
                {updateState.currentVersion || 'Loading...'}
              </p>
            </div>
            <CheckCircle className={`w-6 h-6 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
        </div>

        <div className="space-y-3">
          {updateState.checking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-gray-700/30 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}
            >
              <div className="flex items-center space-x-3">
                <div className="animate-spin rounded-full h-7 w-7 border-3 border-blue-500 border-t-transparent" />
                <div>
                  <p className={`font-semibold text-sm ${classes.textPrimary}`}>Checking for updates...</p>
                  <p className={`text-xs ${classes.textSecondary}`}>Please wait</p>
                </div>
              </div>
            </motion.div>
          )}

          {updateState.available && !updateState.downloading && !updateState.downloaded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'}`}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <div className={`p-2 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-100'}`}>
                    <Download className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                  </div>
                  <div>
                    <p className={`font-bold text-sm ${classes.textPrimary}`}>Update Available!</p>
                    <p className={`text-xs ${classes.textSecondary}`}>Version {updateState.version}</p>
                  </div>
                </div>
              </div>
              <p className={`${classes.textSecondary} mb-3 text-xs`}>New version with improvements and features available.</p>
              <button
                onClick={handleDownloadUpdate}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 text-sm"
              >
                Download Update
              </button>
            </motion.div>
          )}

          {updateState.downloading && updateState.progress && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-blue-900/20 border-blue-500/30' : 'bg-blue-50 border-blue-200'}`}
            >
              <div className="flex items-center space-x-3 mb-4">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-blue-900/30' : 'bg-blue-100'}`}>
                  <Download className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'} animate-bounce`} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${classes.textPrimary}`}>Downloading Update</p>
                  <p className={`text-xs ${classes.textSecondary}`}>Version {updateState.version}</p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className={`font-semibold ${classes.textPrimary}`}>{updateState.progress.percent}%</span>
                  <span className={classes.textSecondary}>{updateState.progress.transferred} / {updateState.progress.total}</span>
                </div>
                <div className={`w-full ${isDark ? 'bg-gray-700' : 'bg-gray-200'} rounded-full h-2 overflow-hidden`}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${updateState.progress.percent}%` }}
                    transition={{ duration: 0.3 }}
                    className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full"
                  />
                </div>
                <div className="text-xs text-center">
                  <span className={classes.textSecondary}>{updateState.progress.speed}</span>
                </div>
              </div>
            </motion.div>
          )}

          {updateState.downloaded && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-green-900/20 border-green-500/30' : 'bg-green-50 border-green-200'}`}
            >
              <div className="flex items-center space-x-3 mb-3">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-100'}`}>
                  <CheckCircle className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className={`font-bold text-sm ${classes.textPrimary}`}>Update Ready!</p>
                  <p className={`text-xs ${classes.textSecondary}`}>Version {updateState.version}</p>
                </div>
              </div>
              <p className={`${classes.textSecondary} mb-3 text-xs`}>Update downloaded. Restart to install.</p>
              <button
                onClick={handleInstallUpdate}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold rounded-lg transition-all duration-200 text-sm"
              >
                Restart & Install
              </button>
            </motion.div>
          )}

          {!updateState.checking && !updateState.available && !updateState.downloading && !updateState.downloaded && !updateState.error && updateState.hasChecked && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-50 border-gray-200'}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-green-900/30' : 'bg-green-100'}`}>
                  <CheckCircle className={`w-5 h-5 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${classes.textPrimary}`}>You&apos;re up to date!</p>
                  <p className={`text-xs ${classes.textSecondary}`}>No updates found</p>
                </div>
              </div>
            </motion.div>
          )}

          {updateState.error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-4 rounded-xl border ${isDark ? 'bg-red-900/20 border-red-500/30' : 'bg-red-50 border-red-200'}`}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg ${isDark ? 'bg-red-900/30' : 'bg-red-100'}`}>
                  <AlertTriangle className={`w-5 h-5 ${isDark ? 'text-red-400' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className={`font-semibold text-sm ${classes.textPrimary}`}>Update Error</p>
                  <p className={`text-xs ${classes.textSecondary}`}>{updateState.error}</p>
                </div>
              </div>
            </motion.div>
          )}

          <button
            onClick={handleCheckForUpdates}
            disabled={updateState.checking || updateState.downloading}
            className={`w-full py-2.5 px-4 rounded-lg font-semibold transition-all duration-200 flex items-center justify-center gap-2 text-sm ${
              updateState.checking || updateState.downloading
                ? 'bg-gray-400 cursor-not-allowed'
                : `${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} ${classes.textPrimary}`
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${updateState.checking ? 'animate-spin' : ''}`} />
            {updateState.checking ? 'Checking...' : 'Check for Updates'}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function Page() { return null }
