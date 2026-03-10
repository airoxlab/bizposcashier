// hooks/useAlert.js
'use client'

import { useState } from 'react'

export const useAlert = () => {
  const [alert, setAlert] = useState({
    isOpen: false,
    title: '',
    message: '',
    type: 'info',
    confirmText: 'OK',
    showCancel: false,
    cancelText: 'Cancel',
    onConfirm: null,
    onCancel: null,
    autoClose: false,
    autoCloseDelay: 3000
  })

  const showAlert = ({
    title,
    message,
    type = 'info',
    confirmText = 'OK',
    showCancel = false,
    cancelText = 'Cancel',
    onConfirm = null,
    onCancel = null,
    autoClose = false,
    autoCloseDelay = 3000
  }) => {
    setAlert({
      isOpen: true,
      title,
      message,
      type,
      confirmText,
      showCancel,
      cancelText,
      onConfirm,
      onCancel,
      autoClose,
      autoCloseDelay
    })
  }

  const hideAlert = () => {
    setAlert(prev => ({ ...prev, isOpen: false }))
  }

  // Convenience methods for different alert types
  const showSuccess = (title, message, options = {}) => {
    showAlert({
      title,
      message,
      type: 'success',
      autoClose: true,
      ...options
    })
  }

  const showError = (title, message, options = {}) => {
    showAlert({
      title,
      message,
      type: 'error',
      ...options
    })
  }

  const showWarning = (title, message, options = {}) => {
    showAlert({
      title,
      message,
      type: 'warning',
      ...options
    })
  }

  const showInfo = (title, message, options = {}) => {
    showAlert({
      title,
      message,
      type: 'info',
      ...options
    })
  }

  const showConfirm = (title, message, onConfirm, options = {}) => {
    showAlert({
      title,
      message,
      type: 'warning',
      showCancel: true,
      onConfirm,
      ...options
    })
  }

  return {
    alert,
    showAlert,
    hideAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showConfirm
  }
}