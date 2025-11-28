/**
 * Safe Navigation Utility for Cross-Platform Compatibility
 * Handles in-app browsers (Messenger, Instagram, TikTok, etc.)
 */

/**
 * Detect if running in an in-app browser
 */
export function isInAppBrowser() {
  const ua = navigator.userAgent || "";
  return /FBAN|FBAV|Instagram|Messenger|Line|TikTok|Snapchat|Twitter|WebView|wv\)/i.test(ua);
}

/**
 * Detect specific browser environment
 */
export function getBrowserEnvironment() {
  const ua = navigator.userAgent || "";
  return {
    isInApp: isInAppBrowser(),
    isFacebook: /FBAN|FBAV/i.test(ua),
    isInstagram: /Instagram/i.test(ua),
    isMessenger: /Messenger/i.test(ua),
    isTikTok: /TikTok/i.test(ua),
    isLine: /Line/i.test(ua),
    isSnapchat: /Snapchat/i.test(ua),
    isTwitter: /Twitter/i.test(ua),
    isWebView: /WebView|wv\)/i.test(ua),
    isIOS: /iPad|iPhone|iPod/.test(ua),
    isAndroid: /Android/.test(ua),
    isSafari: /Safari/.test(ua) && !/Chrome/.test(ua),
    isStandalone: window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
  };
}

/**
 * Safe navigation that works in restricted browsers
 * @param {string} url - URL to navigate to
 * @param {object} options - Navigation options
 */
export function safeNavigate(url, options = {}) {
  const { newTab = false, replace = false } = options;
  const env = getBrowserEnvironment();

  // For in-app browsers, use direct location assignment
  if (env.isInApp) {
    if (replace) {
      window.location.replace(url);
    } else {
      window.location.href = url;
    }
    return;
  }

  // For new tab requests
  if (newTab) {
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  // Standard navigation
  if (replace) {
    window.location.replace(url);
  } else {
    window.location.href = url;
  }
}

/**
 * Safe external link opener that bypasses popup blockers
 * Must be called within a direct user event handler
 * @param {string} url - External URL to open
 */
export function safeOpenExternal(url) {
  const env = getBrowserEnvironment();
  
  // In-app browsers need special handling
  if (env.isInApp) {
    // Try to force system browser on iOS
    if (env.isIOS) {
      // Safari can open external links if we set location
      window.location.href = url;
      return;
    }
    // Android in-app browsers
    if (env.isAndroid) {
      // Try intent for Android
      const intentUrl = `intent://${url.replace(/^https?:\/\//, '')}#Intent;scheme=https;end`;
      window.location.href = intentUrl;
      return;
    }
  }

  // Standard external open
  window.open(url, "_blank", "noopener,noreferrer");
}

/**
 * Safe login redirect that works in in-app browsers
 * @param {function} authRedirect - The auth.redirectToLogin function
 * @param {string} fallbackUrl - Fallback login URL
 */
export function safeLoginRedirect(authRedirect, fallbackUrl = "/") {
  const env = getBrowserEnvironment();
  
  // In-app browsers block popups, use direct redirect
  if (env.isInApp) {
    window.location.href = fallbackUrl;
    return;
  }

  // Standard auth redirect
  if (typeof authRedirect === 'function') {
    authRedirect();
  } else {
    window.location.href = fallbackUrl;
  }
}

/**
 * Check if WebGL is available
 * @returns {boolean}
 */
export function isWebGLAvailable() {
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
    return !!gl;
  } catch (e) {
    return false;
  }
}

/**
 * Check if localStorage is available
 * @returns {boolean}
 */
export function isLocalStorageAvailable() {
  try {
    const test = "__storage_test__";
    localStorage.setItem(test, test);
    localStorage.removeItem(test);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Memory-based storage fallback for restricted browsers
 */
export const memoryStorage = {
  store: {},
  setItem(key, value) {
    this.store[key] = String(value);
  },
  getItem(key) {
    return this.store[key] || null;
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  },
  get length() {
    return Object.keys(this.store).length;
  },
  key(index) {
    return Object.keys(this.store)[index] || null;
  }
};

/**
 * Get a storage object that works everywhere
 * @returns {Storage}
 */
export function getSafeStorage() {
  return isLocalStorageAvailable() ? localStorage : memoryStorage;
}

export default {
  isInAppBrowser,
  getBrowserEnvironment,
  safeNavigate,
  safeOpenExternal,
  safeLoginRedirect,
  isWebGLAvailable,
  isLocalStorageAvailable,
  memoryStorage,
  getSafeStorage
};