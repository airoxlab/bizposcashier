// components/ui/PosToaster.js
//
// Centered, dismissible wrapper around react-hot-toast's <Toaster>.
//
// Important: this is ALWAYS mounted. react-hot-toast has a single global
// queue — if the Toaster isn't on the page, `toast.error(...)` calls go
// nowhere. That caused cashiers to click "Order & Pay" on a walk-in without
// a customer and see NOTHING happen after the admin disabled toast
// notifications — the blocking warning was silently discarded.
//
// The admin "POS toast notifications" toggle instead lives inside the custom
// NotificationSystem.notify.* helper, where it filters success/info/loading
// messages. Errors and warnings always show regardless of the setting.
//
// Why this file still exists:
//   - Centralises centered-top positioning, pointer-event pass-through, and
//     dark-mode styling so every page gets consistent toast behavior.

'use client'

import { Toaster } from 'react-hot-toast'

export default function PosToaster({ isDark = false, toastOptions: extraToastOptions, ...rest }) {
  return (
    <Toaster
      position="top-center"
      reverseOrder={false}
      gutter={8}
      // Don't block UI clicks — let pointer events pass through the container.
      containerStyle={{ pointerEvents: 'none' }}
      toastOptions={{
        duration: 3000,
        // Each toast reclaims pointer events so it's still dismissible.
        style: {
          pointerEvents: 'auto',
          background: isDark ? '#1f2937' : '#fff',
          color: isDark ? '#f3f4f6' : '#111827',
          border: isDark ? '1px solid #374151' : '1px solid #e5e7eb',
        },
        success: {
          duration: 3000,
          iconTheme: { primary: '#10b981', secondary: '#fff' },
        },
        error: {
          duration: 4000,
          iconTheme: { primary: '#ef4444', secondary: '#fff' },
        },
        ...extraToastOptions,
      }}
      {...rest}
    />
  )
}
