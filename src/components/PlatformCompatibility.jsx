import { useEffect } from "react";
import { isLocalStorageAvailable, memoryStorage } from "./shared/safeNavigate";

/**
 * Platform Compatibility Component
 * Ensures the app works across all operating systems and embedded contexts
 * Supports: iOS Safari, Android Chrome, in-app browsers (Messenger, Instagram, TikTok, Facebook, etc.)
 * Desktop: Chrome, Safari, Edge, Firefox
 * PWA: Standalone installable mode
 */
export default function PlatformCompatibility() {
  useEffect(() => {
    // Detect platform and set appropriate classes
    const userAgent = navigator.userAgent.toLowerCase();
    const platform = navigator.platform?.toLowerCase() || '';
    
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMacOS = /mac/.test(platform);
    const isWindows = /win/.test(platform);
    const isLinux = /linux/.test(platform) && !isAndroid;
    
    // Detect if running in an embedded context (in-app browser)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || window.navigator.standalone 
      || document.referrer.includes('android-app://');
    
    const isInAppBrowser = /FBAN|FBAV|Instagram|Messenger|Line|WhatsApp|LinkedIn|Twitter|TikTok|Snapchat/i.test(userAgent);
    const isWebView = /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)|; wv\)/i.test(userAgent);
    
    // Detect specific in-app browsers
    const isFacebook = /FBAN|FBAV/i.test(userAgent);
    const isInstagram = /Instagram/i.test(userAgent);
    const isMessenger = /Messenger/i.test(userAgent);
    const isTikTok = /TikTok/i.test(userAgent);
    
    // Add platform classes to body
    const platformClasses = [
      isIOS && 'platform-ios',
      isAndroid && 'platform-android',
      isMacOS && 'platform-macos',
      isWindows && 'platform-windows',
      isLinux && 'platform-linux',
      isStandalone && 'display-standalone',
      isStandalone && 'pwa-mode',
      isInAppBrowser && 'in-app-browser',
      isWebView && 'webview',
      isWebView && 'webview-compat',
      isFacebook && 'fb-browser',
      isInstagram && 'ig-browser',
      isMessenger && 'messenger-browser',
      isTikTok && 'tiktok-browser'
    ].filter(Boolean);
    
    document.body.classList.add(...platformClasses);
    
    // Initialize localStorage fallback for restricted browsers (Messenger, Instagram, etc.)
    if (!isLocalStorageAvailable()) {
      console.warn("localStorage disabled — using fallback memory store");
      try {
        Object.defineProperty(window, 'localStorage', {
          value: memoryStorage,
          writable: true,
          configurable: true
        });
      } catch (e) {
        // Some browsers don't allow redefining localStorage
        window.__memoryStorage = memoryStorage;
      }
    }
    
    // Viewport height fix for mobile browsers (especially iOS Safari)
    const setViewportHeight = () => {
      const vh = window.innerHeight * 0.01;
      document.documentElement.style.setProperty('--vh', `${vh}px`);
    };
    
    setViewportHeight();
    window.addEventListener('resize', setViewportHeight);
    window.addEventListener('orientationchange', setViewportHeight);
    
    // Prevent zoom on iOS double-tap
    if (isIOS) {
      let lastTouchEnd = 0;
      document.addEventListener('touchend', (event) => {
        const now = Date.now();
        if (now - lastTouchEnd <= 300) {
          event.preventDefault();
        }
        lastTouchEnd = now;
      }, { passive: false });
    }
    
    // Handle safe areas for notched devices
    if (isIOS || isAndroid) {
      const style = document.createElement('style');
      style.textContent = `
        :root {
          --safe-area-inset-top: env(safe-area-inset-top, 0px);
          --safe-area-inset-bottom: env(safe-area-inset-bottom, 0px);
          --safe-area-inset-left: env(safe-area-inset-left, 0px);
          --safe-area-inset-right: env(safe-area-inset-right, 0px);
        }
      `;
      document.head.appendChild(style);
    }
    
    // Fix for iOS Safari bottom bar
    if (isIOS) {
      document.body.style.paddingBottom = 'env(safe-area-inset-bottom)';
    }
    
    // Enable smooth scrolling on all platforms
    document.documentElement.style.scrollBehavior = 'smooth';
    
    // Handle back button for Android
    if (isAndroid) {
      window.addEventListener('popstate', () => {
        // Navigation is handled by React Router
      });
    }
    
    return () => {
      window.removeEventListener('resize', setViewportHeight);
      window.removeEventListener('orientationchange', setViewportHeight);
    };
  }, []);
  
  return null; // This component only handles side effects
}

// Export platform detection utilities
export const usePlatformDetection = () => {
  const userAgent = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() || '';
  
  return {
    isIOS: /iphone|ipad|ipod/.test(userAgent),
    isAndroid: /android/.test(userAgent),
    isMacOS: /mac/.test(platform),
    isWindows: /win/.test(platform),
    isLinux: /linux/.test(platform) && !/android/.test(userAgent),
    isMobile: /mobile|android|iphone|ipad|ipod/.test(userAgent),
    isTablet: /ipad|android(?!.*mobile)/.test(userAgent),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone,
    isInAppBrowser: /FBAN|FBAV|Instagram|Messenger|Line|WhatsApp|LinkedIn|Twitter|TikTok|Snapchat/i.test(userAgent),
    isFacebook: /FBAN|FBAV/i.test(userAgent),
    isInstagram: /Instagram/i.test(userAgent),
    isMessenger: /Messenger/i.test(userAgent),
    isTikTok: /TikTok/i.test(userAgent),
    isWebView: /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)|; wv\)/i.test(userAgent),
    isTouchDevice: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    browserName: (() => {
      if (userAgent.includes('edg')) return 'Edge';
      if (userAgent.includes('chrome')) return 'Chrome';
      if (userAgent.includes('safari') && !userAgent.includes('chrome')) return 'Safari';
      if (userAgent.includes('firefox')) return 'Firefox';
      if (userAgent.includes('opera') || userAgent.includes('opr')) return 'Opera';
      return 'Unknown';
    })()
  };
};