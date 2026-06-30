import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { reportClientError } from '@/lib/reportClientError.js'
import { initSentry } from '@/lib/sentry.js'

// Optional Sentry (no-op unless VITE_SENTRY_DSN is set). Init before render so
// it can capture errors thrown during the first paint.
initSentry()

// Capture uncaught errors and unhandled promise rejections once, at bootstrap,
// and report them to the backend (which emails the owner for non-admin users).
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
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



