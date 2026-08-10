import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { reportClientError } from '@/lib/reportClientError.js'
import { initSentry } from '@/lib/sentry.js'

// Optional Sentry (no-op unless VITE_SENTRY_DSN is set). Init before render so
// it can capture errors thrown during the first paint.
initSentry()

// Native app only: confirm the active OTA bundle booted successfully so
// @capgo/capacitor-updater does not roll it back (manual-update mode; see
// lib/mobileUpdater.js and the Profile page's "App Updates" card).
import('@/lib/platform.js')
  .then(({ isNativeApp }) => {
    if (!isNativeApp()) return null
    return import('@capgo/capacitor-updater').then(({ CapacitorUpdater }) => CapacitorUpdater.notifyAppReady())
  })
  .catch(() => {}) // plugin unavailable (older APK) — nothing to confirm


// Capture uncaught errors and unhandled promise rejections once, at bootstrap,
// and report them to the backend (which emails the owner for non-admin users).
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



