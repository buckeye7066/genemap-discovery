import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { reportClientError } from '@/lib/reportClientError.js'
import { initSentry } from '@/lib/sentry.js'
import { isNativeApp } from '@/lib/platform.js'
import { startMobileUpdateNotifier } from '@/lib/mobileUpdateNotifier.js'

// initSentry() is a deliberate NO-OP STUB that always returns false and captures
// nothing. VITE_SENTRY_DSN is read nowhere, so there is no env var that turns
// this on. Browser exception export stays disabled: stacks can carry user text.
initSentry()


// Capture uncaught errors and unhandled promise rejections once, at bootstrap,
// and report them to the backend. POST /report-client-error accepts two enum
// values, logs them, and returns 204 -- it emails NO ONE. The only mail path in
// the product is operatorAlert -> ADMIN_EMAILS on a ledger-write failure.
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    // Browsers mute cross-origin script errors (WHATWG "muted errors"): when a
    // script we didn't load in our own origin throws (a browser extension's
    // injected content script is the common case on login-style pages), the
    // browser reports message="Script error." with error/filename/lineno all
    // blanked out. There is no real stack to recover here — synthesizing one
    // via `new Error()` just fabricates a frame pointing at this handler
    // itself, misattributing the crash to our bundle. Skip reporting rather
    // than emailing the owner a false alarm with no diagnostic value.
    if (event?.message === 'Script error.' && !event?.error && !event?.filename) return
    reportClientError(event?.error || new Error(event?.message || 'Unknown error'))
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason
    const err =
      reason instanceof Error
        ? reason
        : new Error(typeof reason === 'string' ? reason : 'Unhandled promise rejection')
    reportClientError(err)
  })
}

// Native app only. Two jobs:
//  1. notifyAppReady() confirms the active OTA bundle booted, so
//     @capgo/capacitor-updater does not roll it back to the previous one.
//  2. start the launch/resume update check that raises a local notification
//     and the in-app prompt (see lib/mobileUpdateNotifier.js).
// Both are best-effort: an older package without the plugin just skips them.
if (isNativeApp()) {
  import('@capgo/capacitor-updater')
    .then(({ CapacitorUpdater }) => CapacitorUpdater.notifyAppReady())
    .catch(() => {})
  try {
    startMobileUpdateNotifier({ isNative: true })
  } catch {
    // an update check must never block the app from rendering
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

if (import.meta.env.DEV && import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:beforeUpdate' }, '*');
  });
  import.meta.hot.on('vite:afterUpdate', () => {
    window.parent?.postMessage({ type: 'sandbox:afterUpdate' }, '*');
  });
}



