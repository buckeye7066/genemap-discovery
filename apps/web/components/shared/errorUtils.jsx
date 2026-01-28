/**
 * Standardized error handling utilities
 * Provides consistent error message extraction across the app
 */

/**
 * Extract a user-friendly error message from various error formats
 * @param {Error|object|string|unknown} error - The error to extract message from
 * @returns {string} - Human-readable error message
 */
export const getErrorMessage = (error) => {
  // Handle null/undefined
  if (!error) return "An unexpected error occurred";
  
  // Handle string errors
  if (typeof error === 'string') return error;
  
  // Handle Error instances
  if (error instanceof Error) return error.message;
  
  // Handle Axios-style response errors
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.error) return error.response.data.error;
  
  // Handle generic object errors
  if (error?.message) return error.message;
  if (error?.error) return error.error;
  
  // Fallback
  return "An unexpected error occurred";
};

/**
 * Create a standardized error object for logging
 * @param {string} context - Where the error occurred
 * @param {unknown} error - The original error
 * @returns {object} - Structured error object
 */
export const createErrorLog = (context, error) => ({
  context,
  message: getErrorMessage(error),
  timestamp: new Date().toISOString(),
  originalError: error
});

/**
 * Check if an error is a network error
 * @param {unknown} error - The error to check
 * @returns {boolean}
 */
export const isNetworkError = (error) => {
  if (!error) return false;
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('network') || 
         message.includes('fetch') || 
         message.includes('connection') ||
         error?.code === 'NETWORK_ERROR';
};

export default {
  getErrorMessage,
  createErrorLog,
  isNetworkError
};