/**
 * Environment-aware logger utility
 * Suppresses debug/info logs in production for cleaner output
 */

const isDev = typeof process !== 'undefined' 
  ? process.env.NODE_ENV === "development" 
  : true; // Default to dev mode in browser

export const log = {
  info: (...args) => isDev && console.info("[INFO]", ...args),
  warn: (...args) => console.warn("[WARN]", ...args),
  error: (...args) => console.error("[ERROR]", ...args),
  debug: (...args) => isDev && console.debug("[DEBUG]", ...args)
};

export default log;