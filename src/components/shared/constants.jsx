/**
 * Shared constants for timeouts, intervals, and delays
 * Centralizes magic numbers for maintainability
 */

// UI feedback delays
export const SAVE_SUCCESS_DELAY_MS = 3000;
export const TOAST_DURATION_MS = 3000;

// Dashboard and auto-refresh intervals
export const DASHBOARD_REFRESH_INTERVAL_MS = 30000;

// Analysis and processing delays
export const ANALYSIS_DELAY_MS = 2000;

// RLS propagation delay (for waiting after mutations)
export const RLS_PROPAGATION_DELAY_MS = 300;

// Monitoring intervals
export const MONITORING_INTERVAL_MS = 300000;

// Batch processing delays
export const BATCH_DELAY_MS = 10000;

// Concurrency limits
export const GENE_ENRICHMENT_CONCURRENCY = 4;
export const VCF_BATCH_SIZE = 5;

export default {
  SAVE_SUCCESS_DELAY_MS,
  TOAST_DURATION_MS,
  DASHBOARD_REFRESH_INTERVAL_MS,
  ANALYSIS_DELAY_MS,
  RLS_PROPAGATION_DELAY_MS,
  MONITORING_INTERVAL_MS,
  BATCH_DELAY_MS,
  GENE_ENRICHMENT_CONCURRENCY,
  VCF_BATCH_SIZE
};