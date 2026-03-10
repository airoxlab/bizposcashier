'use client';

import { useEffect, useState } from 'react';

export default function UpdateNotification() {
  const [updateState, setUpdateState] = useState({
    checking: false,
    available: false,
    downloading: false,
    downloaded: false,
    error: null,
    progress: null,
    version: null
  });

  useEffect(() => {
    // Only run in Electron environment
    if (!window.electronAPI) return;

    // Listen to update events
    window.electronAPI.onUpdateStatus((data) => {
      if (data.status === 'checking') {
        setUpdateState(prev => ({ ...prev, checking: true }));
      }
    });

    window.electronAPI.onUpdateAvailable((data) => {
      setUpdateState(prev => ({
        ...prev,
        checking: false,
        available: true,
        version: data.version
      }));
    });

    window.electronAPI.onUpdateNotAvailable(() => {
      setUpdateState(prev => ({
        ...prev,
        checking: false,
        available: false
      }));
    });

    window.electronAPI.onUpdateDownloadProgress((data) => {
      setUpdateState(prev => ({
        ...prev,
        downloading: true,
        progress: {
          percent: Math.round(data.percent),
          transferred: formatBytes(data.transferred),
          total: formatBytes(data.total),
          speed: formatBytes(data.bytesPerSecond) + '/s'
        }
      }));
    });

    window.electronAPI.onUpdateDownloaded((data) => {
      setUpdateState(prev => ({
        ...prev,
        downloading: false,
        downloaded: true,
        version: data.version
      }));
    });

    window.electronAPI.onUpdateError((data) => {
      setUpdateState(prev => ({
        ...prev,
        checking: false,
        downloading: false,
        error: data.message
      }));

      // Auto-hide error after 10 seconds
      setTimeout(() => {
        setUpdateState(prev => ({ ...prev, error: null }));
      }, 10000);
    });

    // Cleanup listeners on unmount
    return () => {
      if (window.electronAPI?.removeUpdateListeners) {
        window.electronAPI.removeUpdateListeners();
      }
    };
  }, []);

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  const handleInstallUpdate = () => {
    if (window.electronAPI) {
      window.electronAPI.installUpdate();
    }
  };

  const handleDownloadUpdate = () => {
    if (window.electronAPI) {
      setUpdateState(prev => ({ ...prev, downloading: true }));
      window.electronAPI.downloadUpdate();
    }
  };

  const handleDismiss = () => {
    setUpdateState({
      checking: false,
      available: false,
      downloading: false,
      downloaded: false,
      error: null,
      progress: null,
      version: null
    });
  };

  // Error notification
  if (updateState.error) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss}></div>

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
              <svg className="w-10 h-10 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Update Error</h3>
            <p className="text-gray-600 dark:text-gray-300 leading-relaxed">
              {updateState.error}
            </p>
          </div>

          {/* Action */}
          <button
            onClick={handleDismiss}
            className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-6 rounded-xl transition-colors duration-200 shadow-lg hover:shadow-xl"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  // Update downloaded - ready to install
  if (updateState.downloaded) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss}></div>

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Success Icon with animation */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-green-400 to-emerald-600 rounded-full flex items-center justify-center shadow-lg animate-in zoom-in duration-300">
              <svg className="w-14 h-14 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Update Ready!</h3>
            <p className="text-lg text-gray-700 dark:text-gray-200 mb-2">
              Version {updateState.version}
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              The update has been downloaded successfully. Restart the app to install and enjoy the latest features.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleInstallUpdate}
              className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              Restart Now
            </button>
            <button
              onClick={handleDismiss}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-colors duration-200"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Downloading update with progress
  if (updateState.downloading && updateState.progress) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
        {/* Backdrop - no onClick to prevent dismissing during download */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
          {/* Download Icon with animation */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center shadow-lg">
              <svg className="w-12 h-12 text-white animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Downloading Update</h3>
            <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold mb-4">
              Version {updateState.version}
            </p>

            {/* Progress Bar */}
            <div className="mb-4">
              <div className="flex justify-between text-sm mb-2 text-gray-700 dark:text-gray-300">
                <span className="font-semibold">{updateState.progress.percent}%</span>
                <span>{updateState.progress.transferred} / {updateState.progress.total}</span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 overflow-hidden shadow-inner">
                <div
                  className="bg-gradient-to-r from-blue-500 to-blue-600 h-full rounded-full transition-all duration-300 ease-out shadow-lg"
                  style={{ width: `${updateState.progress.percent}%` }}
                />
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 mt-2 flex items-center justify-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{updateState.progress.speed}</span>
              </div>
            </div>

            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Please wait while the update is being downloaded...
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Update available - not yet downloading
  if (updateState.available) {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 animate-in fade-in duration-200">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleDismiss}></div>

        {/* Modal */}
        <div className="relative bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full p-8 animate-in zoom-in-95 duration-200">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Update Icon with animation */}
          <div className="flex justify-center mb-6">
            <div className="w-24 h-24 bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full flex items-center justify-center shadow-lg animate-pulse">
              <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
          </div>

          {/* Content */}
          <div className="text-center mb-8">
            <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Update Available!</h3>
            <p className="text-lg text-blue-600 dark:text-blue-400 font-semibold mb-3">
              Version {updateState.version}
            </p>
            <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
              A new version is available with improvements and new features. Download now to keep your system up to date.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleDownloadUpdate}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
            >
              Download Now
            </button>
            <button
              onClick={handleDismiss}
              className="px-6 py-3 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-colors duration-200"
            >
              Later
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Checking for updates - silently in background, no UI needed
  // Only show notifications when update is actually available
  return null;
}
