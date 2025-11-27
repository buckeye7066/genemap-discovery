/**
 * Unified date parsing and formatting utilities
 * Consolidates various date helper functions across the codebase
 */

/**
 * Safely parse a date value, returning null for invalid inputs
 * @param {string|Date|null|undefined} value - The date value to parse
 * @returns {Date|null} - Parsed Date object or null
 */
export const parseDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  
  try {
    const parsed = new Date(value);
    return isNaN(parsed.getTime()) ? null : parsed;
  } catch {
    return null;
  }
};

/**
 * Format a date for display, with fallback for invalid dates
 * @param {string|Date|null} value - The date to format
 * @param {string} fallback - Fallback text for invalid dates
 * @returns {string} - Formatted date string
 */
export const formatDate = (value, fallback = 'N/A') => {
  const date = parseDate(value);
  return date ? date.toLocaleDateString() : fallback;
};

/**
 * Format a date with time for display
 * @param {string|Date|null} value - The date to format
 * @param {string} fallback - Fallback text for invalid dates
 * @returns {string} - Formatted datetime string
 */
export const formatDateTime = (value, fallback = 'N/A') => {
  const date = parseDate(value);
  return date ? date.toLocaleString() : fallback;
};

/**
 * Get relative time string (e.g., "2 hours ago")
 * @param {string|Date|null} value - The date to compare
 * @returns {string} - Relative time string
 */
export const getRelativeTime = (value) => {
  const date = parseDate(value);
  if (!date) return 'Unknown';
  
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
  
  return formatDate(value);
};

export default {
  parseDate,
  formatDate,
  formatDateTime,
  getRelativeTime
};