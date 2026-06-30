import { apiClient } from '@genemap/shared';

/**
 * Share a single clinical_records fetch across all callers.
 *
 * Every GeneCard in a search result independently called
 * apiClient.getMedicalData('clinical_records') on mount. A 15-gene search
 * therefore fired 15 identical GETs at once — a request burst that read as a
 * "continuous flood" and, alongside the lazy chart chunks, froze the renderer.
 * Caching the in-flight/resolved promise per user collapses that to ONE request.
 */
let cache = { email: null, promise: null };

export function getClinicalRecordsCached(email) {
  if (!email) return Promise.resolve([]);
  if (cache.email === email && cache.promise) return cache.promise;
  const promise = apiClient.getMedicalData('clinical_records').catch(() => []);
  cache = { email, promise };
  return promise;
}

/** Call after a medical-data upload/delete so the next read is fresh. */
export function clearClinicalRecordsCache() {
  cache = { email: null, promise: null };
}
