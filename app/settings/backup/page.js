'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  ShieldCheck,
  Database,
  FolderOpen,
  UploadCloud,
  CheckCircle,
} from 'lucide-react'
import themeManager from '../../../lib/themeManager'
import { cacheManager } from '../../../lib/cacheManager'
import { notify } from '../../../components/ui/NotificationSystem'
import { useRouter } from 'next/navigation'

export function BackupPanel() {
  const classes = themeManager.getClasses()
  const isDark = themeManager.isDark()
  const router = useRouter()

  const [backupFolder, setBackupFolder] = useState(() =>
    typeof window !== 'undefined' ? (localStorage.getItem('pos_backup_folder') || '') : ''
  )
  const [backupIndex, setBackupIndex] = useState(null)
  const [dataSummary, setDataSummary] = useState(null)
  const [isOnline, setIsOnline] = useState(
    typeof window !== 'undefined' ? navigator.onLine : true
  )
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [importedCount, setImportedCount] = useState(null)

  const isElectron = typeof window !== 'undefined' && !!window.electronAPI?.backup

  useEffect(() => {
    const online = () => setIsOnline(true)
    const offline = () => setIsOnline(false)
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const pendingChanges = JSON.parse(localStorage.getItem('pending_order_changes_sync') || '[]')
    const orderChanges = JSON.parse(localStorage.getItem('order_changes') || '{}')
    const posCache = JSON.parse(localStorage.getItem('pos_cache') || '{}')
    const offlineOrders = posCache?.orders?.filter(o => !o._isSynced) || []
    setDataSummary({
      offlineOrders: offlineOrders.length,
      pendingChanges: pendingChanges.filter(c => !c.synced).length,
      cachedOrderChanges: Object.keys(orderChanges).length,
      totalCachedOrders: posCache?.orders?.length || 0,
    })
  }, [])

  useEffect(() => {
    if (backupFolder && isElectron) {
      window.electronAPI.backup.readIndex(backupFolder).then(res => {
        if (res.success) setBackupIndex(res.index)
      })
    }
  }, [backupFolder])

  async function handleSelectFolder() {
    if (!isElectron) return
    const res = await window.electronAPI.backup.selectFolder()
    if (!res.canceled) {
      setBackupFolder(res.path)
      localStorage.setItem('pos_backup_folder', res.path)
      await window.electronAPI.backup.saveConfig(res.path)
      const init = await window.electronAPI.backup.initFolder(res.path)
      if (init.success) {
        const idx = await window.electronAPI.backup.readIndex(res.path)
        if (idx.success) setBackupIndex(idx.index)
        notify.success('Backup folder ready. Offline data will auto-save here.')
      } else {
        notify.error(`Folder set but could not create it: ${init.error}`)
      }
    }
  }

  async function handleViewBackup() {
    if (!isElectron || !backupFolder) return
    const res = await window.electronAPI.backup.loadFile(backupFolder + '/pos_cache.json')
    if (res.success) {
      const offlineOrders = res.data?.orders?.filter(o => !o._isSynced) || []
      const total = res.data?.orders?.length || 0
      notify.info(`Backup: ${offlineOrders.length} unsynced orders · ${total} total cached orders`)
    } else {
      notify.error('No backup data found in this folder yet.')
    }
  }

  async function handleScanAllPorts() {
    if (!isElectron || !window.electronAPI?.backup?.scanAllPorts) return
    setScanning(true)
    setScanResult(null)
    setImportedCount(null)
    try {
      const result = await window.electronAPI.backup.scanAllPorts()
      setScanResult(result)
    } catch (err) {
      setScanResult({ success: false, error: err.message })
    } finally {
      setScanning(false)
    }
  }

  function handleImportRecovered() {
    if (!scanResult?.caches?.length) return
    const allOrders = scanResult.caches.flatMap(c => c.unsyncedOrders)
    const count = cacheManager.injectRecoveredOrders(allOrders)
    setImportedCount(count)
    if (count > 0) {
      setTimeout(() => router.push('/offline-orders'), 1200)
    }
  }

  const cardCls = `${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'} rounded-xl border p-6`
  const labelCls = `text-sm font-medium ${isDark ? 'text-gray-300' : 'text-gray-700'}`
  const mutedCls = `text-xs ${isDark ? 'text-gray-400' : 'text-gray-500'}`
  const inputCls = `flex-1 px-3 py-2 rounded-lg border text-sm ${isDark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-gray-50 border-gray-300 text-gray-900 placeholder-gray-400'} outline-none`

  return (
    <motion.div
      key="backup"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className="max-w-5xl mx-auto space-y-6"
    >
      {/* Header */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-blue-900/30' : 'bg-blue-50'}`}>
            <ShieldCheck className={`w-5 h-5 ${isDark ? 'text-blue-400' : 'text-blue-600'}`} />
          </div>
          <div>
            <h3 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>Offline Backup</h3>
            <p className={mutedCls}>Auto-saves all offline order data to a folder — only active when internet is disconnected</p>
          </div>
        </div>
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          isOnline
            ? (isDark ? 'bg-green-900/20 text-green-400 border border-green-700' : 'bg-green-50 text-green-700 border border-green-200')
            : (isDark ? 'bg-orange-900/20 text-orange-400 border border-orange-700' : 'bg-orange-50 text-orange-700 border border-orange-200')
        }`}>
          <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-orange-500'}`} />
          {isOnline
            ? 'Online — Backup inactive (no data saved to folder while connected)'
            : 'Offline — Backup active (data is being saved to folder automatically)'}
        </div>
        {!isElectron && (
          <div className={`mt-3 p-3 rounded-lg ${isDark ? 'bg-yellow-900/20 border-yellow-700' : 'bg-yellow-50 border-yellow-200'} border`}>
            <p className="text-sm text-yellow-600">Backup is only available in the desktop app.</p>
          </div>
        )}
      </div>

      {/* Local cache summary */}
      {dataSummary && (
        <div className={cardCls}>
          <div className="flex items-center gap-2 mb-4">
            <Database className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
            <span className={labelCls}>Locally Cached Data</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Offline Orders', value: dataSummary.offlineOrders, warn: dataSummary.offlineOrders > 0 },
              { label: 'Unsynced Changes', value: dataSummary.pendingChanges, warn: dataSummary.pendingChanges > 0 },
              { label: 'Change Records', value: dataSummary.cachedOrderChanges },
              { label: 'Total Orders Cached', value: dataSummary.totalCachedOrders },
            ].map(item => (
              <div key={item.label} className={`p-3 rounded-lg border ${
                item.warn
                  ? (isDark ? 'bg-orange-900/20 border-orange-700' : 'bg-orange-50 border-orange-200')
                  : (isDark ? 'bg-gray-700/50 border-gray-600' : 'bg-gray-50 border-gray-200')
              }`}>
                <p className={`text-2xl font-bold ${item.warn ? (isDark ? 'text-orange-400' : 'text-orange-600') : (isDark ? 'text-white' : 'text-gray-900')}`}>{item.value}</p>
                <p className={mutedCls}>{item.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Folder selection */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-4">
          <FolderOpen className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={labelCls}>Backup Folder</span>
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-gray-700 text-gray-400' : 'bg-gray-100 text-gray-500'}`}>
            Set once — works automatically
          </span>
        </div>
        <div className="flex gap-2 mb-3">
          <input readOnly value={backupFolder} placeholder="No folder selected" className={inputCls} />
          <button
            onClick={handleSelectFolder}
            disabled={!isElectron}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
              isElectron
                ? (isDark ? 'bg-blue-700 hover:bg-blue-600 text-white' : 'bg-blue-600 hover:bg-blue-700 text-white')
                : 'opacity-40 cursor-not-allowed bg-gray-200 text-gray-500'
            }`}
          >
            {backupFolder ? 'Change Folder' : 'Select Folder'}
          </button>
        </div>
        {backupIndex && (
          <div className={`flex items-center gap-2 p-3 rounded-lg ${isDark ? 'bg-green-900/15 border border-green-800' : 'bg-green-50 border border-green-200'}`}>
            <CheckCircle className={`w-4 h-4 flex-shrink-0 ${isDark ? 'text-green-400' : 'text-green-600'}`} />
            <div>
              <p className={`text-sm font-medium ${isDark ? 'text-green-300' : 'text-green-700'}`}>Last saved while offline</p>
              <p className={mutedCls}>{new Date(backupIndex.last_saved).toLocaleString()} · {backupIndex.files?.length || 0} files</p>
            </div>
            <button
              onClick={handleViewBackup}
              className={`ml-auto text-xs px-3 py-1.5 rounded-lg font-medium ${isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-white hover:bg-gray-50 text-gray-600 border border-gray-300'}`}
            >
              Inspect
            </button>
          </div>
        )}
        {!backupFolder && (
          <p className={`text-sm ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
            Select a folder. Once set, all offline orders and changes will be automatically written there whenever the internet is disconnected.
          </p>
        )}
      </div>

      {/* How it works */}
      <div className={cardCls}>
        <div className="flex items-center gap-2 mb-3">
          <UploadCloud className={`w-4 h-4 ${isDark ? 'text-gray-400' : 'text-gray-500'}`} />
          <span className={labelCls}>How It Works</span>
        </div>
        <div className="space-y-2">
          {[
            'Select a backup folder once in this settings page.',
            'When internet is disconnected, every offline order and change is automatically saved to that folder as JSON files.',
            'When internet is connected, nothing is written to the folder — backup is for offline sessions only.',
            'If orders fail to sync to Supabase after reconnecting, open the folder to inspect and manually re-upload the JSON files.',
          ].map((tip, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 text-xs font-bold ${isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>{i + 1}</div>
              <p className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>{tip}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Data Recovery */}
      {isElectron && (
        <div className={`${isDark ? 'bg-amber-950/30 border-amber-700/50' : 'bg-amber-50 border-amber-200'} rounded-xl border p-6`}>
          <div className="flex items-center gap-3 mb-4">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isDark ? 'bg-amber-900/40' : 'bg-amber-100'}`}>
              <Database className={`w-5 h-5 ${isDark ? 'text-amber-400' : 'text-amber-600'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className={`text-base font-bold ${isDark ? 'text-amber-300' : 'text-amber-800'}`}>Data Recovery</h3>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isDark ? 'bg-amber-900/50 text-amber-400 border border-amber-700' : 'bg-amber-100 text-amber-700 border border-amber-300'}`}>
                  Temporary Tool
                </span>
              </div>
              <p className={`text-xs mt-0.5 ${isDark ? 'text-amber-400/70' : 'text-amber-700'}`}>
                Scans all previous app sessions stored on this device and recovers any offline orders that were never synced to the database
              </p>
            </div>
          </div>

          <div className={`p-3 rounded-lg mb-4 text-sm ${isDark ? 'bg-amber-900/20 text-amber-300/80' : 'bg-amber-100 text-amber-800'}`}>
            The app was previously running on random ports which caused offline order data to become invisible on restart.
            This tool reads a snapshot of the device&apos;s local storage database and shows <strong>every order from every past session</strong> — both synced and unsynced.
          </div>

          <button
            onClick={handleScanAllPorts}
            disabled={scanning}
            className={`w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
              scanning ? 'opacity-60 cursor-not-allowed' : ''
            } ${isDark ? 'bg-amber-700 hover:bg-amber-600 text-white' : 'bg-amber-500 hover:bg-amber-600 text-white'}`}
          >
            {scanning ? (
              <>
                <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Scanning all sessions...
              </>
            ) : (
              <>
                <Database className="w-4 h-4" />
                Scan Device for Lost Orders
              </>
            )}
          </button>

          {scanResult && (
            <div className="mt-4">
              {scanResult.success ? (
                <>
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs mb-3 ${
                    scanResult.usedSnapshot
                      ? (isDark ? 'bg-green-900/20 border border-green-800 text-green-400' : 'bg-green-50 border border-green-200 text-green-700')
                      : (isDark ? 'bg-yellow-900/20 border border-yellow-800 text-yellow-400' : 'bg-yellow-50 border border-yellow-200 text-yellow-700')
                  }`}>
                    <div className={`w-2 h-2 rounded-full ${scanResult.usedSnapshot ? 'bg-green-500' : 'bg-yellow-500'}`} />
                    {scanResult.usedSnapshot
                      ? 'Using pre-startup snapshot — most accurate'
                      : 'Using live database copy — restart the app once to enable the more accurate snapshot mode'}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[
                      { label: 'Files Scanned', value: scanResult.filesScanned },
                      { label: 'Sessions Found', value: scanResult.totalSessions },
                      { label: 'Unsynced Orders', value: scanResult.totalUnsyncedOrders, highlight: scanResult.totalUnsyncedOrders > 0 },
                    ].map(stat => (
                      <div key={stat.label} className={`p-3 rounded-xl text-center ${isDark ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200'}`}>
                        <p className={`text-xl font-bold ${stat.highlight ? (isDark ? 'text-amber-300' : 'text-amber-700') : (isDark ? 'text-white' : 'text-gray-900')}`}>{stat.value}</p>
                        <p className={`text-[10px] mt-0.5 ${isDark ? 'text-amber-400/70' : 'text-amber-700'}`}>{stat.label}</p>
                      </div>
                    ))}
                  </div>
                  {scanResult.totalUnsyncedOrders > 0 && !importedCount && (
                    <button
                      onClick={handleImportRecovered}
                      className={`w-full py-2.5 rounded-xl font-semibold text-sm ${isDark ? 'bg-green-700 hover:bg-green-600 text-white' : 'bg-green-500 hover:bg-green-600 text-white'}`}
                    >
                      Import {scanResult.totalUnsyncedOrders} Recovered Orders
                    </button>
                  )}
                  {importedCount !== null && (
                    <div className={`p-3 rounded-xl text-center text-sm font-semibold ${isDark ? 'bg-green-900/20 text-green-400' : 'bg-green-50 text-green-700'}`}>
                      {importedCount > 0
                        ? `✓ ${importedCount} orders imported — redirecting to Offline Orders...`
                        : 'No new orders to import (all already present)'}
                    </div>
                  )}
                </>
              ) : (
                <div className={`p-3 rounded-xl text-sm ${isDark ? 'bg-red-900/20 text-red-400' : 'bg-red-50 text-red-700'}`}>
                  Scan failed: {scanResult.error}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
}

export default function Page() { return null }
