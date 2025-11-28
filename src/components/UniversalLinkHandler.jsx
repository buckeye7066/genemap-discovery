import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { isInAppBrowser, getBrowserEnvironment } from "./shared/safeNavigate";

/**
 * Universal Link Handler
 * Ensures deep links and external navigation work across all platforms
 * Supports iOS Safari, Android Chrome, in-app browsers (Messenger, Instagram, TikTok, etc.)
 */
export default function UniversalLinkHandler() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const env = getBrowserEnvironment();
    
    // Initialize localStorage fallback for restricted browsers
    try {
      localStorage.setItem("__storage_test__", "1");
      localStorage.removeItem("__storage_test__");
    } catch (e) {
      console.warn("localStorage disabled — using fallback memory store");
      const memoryStore = { store: {} };
      Object.defineProperty(window, 'localStorage', {
        value: {
          setItem: (k, v) => { memoryStore.store[k] = String(v); },
          getItem: (k) => memoryStore.store[k] || null,
          removeItem: (k) => { delete memoryStore.store[k]; },
          clear: () => { memoryStore.store = {}; },
          get length() { return Object.keys(memoryStore.store).length; },
          key: (i) => Object.keys(memoryStore.store)[i] || null
        },
        writable: true
      });
    }

    // Handle custom URL schemes and deep links
    const handleAppOpen = (event) => {
      const url = event?.url || window.location.href;
      
      try {
        // Parse deep link parameters
        const urlParams = new URLSearchParams(new URL(url).search);
        const page = urlParams.get('page');
        const action = urlParams.get('action');
        
        if (page) {
          navigate(`/${page}`);
        }
        
        if (action === 'login') {
          navigate('/');
        }
      } catch (e) {
        console.warn("Deep link parsing error:", e);
      }
    };
    
    // Listen for app resume events (mobile)
    window.addEventListener('appopen', handleAppOpen);
    
    // Handle universal links on iOS
    if (window.webkit?.messageHandlers?.appOpen) {
      window.webkit.messageHandlers.appOpen.postMessage = handleAppOpen;
    }
    
    // Handle Android intent links
    if (window.Android?.handleIntent) {
      window.handleIntent = handleAppOpen;
    }
    
    // Ensure all external links open in the appropriate context
    const handleLinkClick = (event) => {
      const target = event.target.closest('a');
      if (!target) return;
      
      const href = target.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      
      // External links
      if (href.startsWith('http') && !href.includes(window.location.hostname)) {
        // Check if in embedded context or in-app browser
        const isEmbedded = window !== window.top;
        
        if (isEmbedded || env.isInApp) {
          event.preventDefault();
          
          // For iOS in-app browsers, try intent-based opening
          if (env.isIOS && env.isInApp) {
            // Direct navigation works better on iOS in-app browsers
            window.location.href = href;
            return;
          }
          
          // For Android in-app browsers
          if (env.isAndroid && env.isInApp) {
            // Try Chrome custom tab intent
            const intentUrl = `intent://${href.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
            window.location.href = intentUrl;
            return;
          }
          
          // Standard fallback
          window.open(href, '_blank', 'noopener,noreferrer');
        }
      }
    };
    
    document.addEventListener('click', handleLinkClick);
    
    // Register service worker for PWA support
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(err => {
        console.warn('Service worker registration failed:', err);
      });
    }
    
    return () => {
      window.removeEventListener('appopen', handleAppOpen);
      document.removeEventListener('click', handleLinkClick);
    };
  }, [navigate]);
  
  return null;
}