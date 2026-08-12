import { apiClient } from '@genemap/shared';

/**
 * @typedef {object} AssociationEvidenceSource
 * @property {string|null} [apiVersion]
 * @property {string|null} [releaseVersion]
 * @property {string|null} [status]
 * @property {boolean} [truncated]
 */

/**
 * @typedef {object} AssociationEvidenceResponse
 * @property {object|null} [query]
 * @property {Record<string, Array<object>>} [claimsByGene]
 * @property {string|null} [adapterRetrievedAt]
 * @property {{myGene?: AssociationEvidenceSource, monarch?: AssociationEvidenceSource, openTargets?: AssociationEvidenceSource}} [sources]
 * @property {string} [sourceStatus]
 * @property {number} [claimCount]
 */

const EMPTY_RESULT = Object.freeze({
  query: null,
  claimsByGene: {},
  adapterRetrievedAt: null,
  sources: {
    myGene: { apiVersion: 'v3', releaseVersion: null, status: 'unavailable', truncated: false },
    monarch: { apiVersion: 'v3', releaseVersion: null, status: 'unavailable', truncated: false },
    openTargets: { apiVersion: 'v4', releaseVersion: null, status: 'unavailable', truncated: false },
  },
  sourceStatus: 'unavailable',
  claimCount: 0,
});

const CLINICAL_COMMAND = /^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u;

function isPublicationGeneSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9-]{1,14}$/u.test(symbol)) return false;
  const policyText = symbol
    .replace(/-/gu, ' ')
    .replace(/(\d)(MG|MCG|UG|ML|UNITS?)\b/gu, '$1 $2');
  return !CLINICAL_COMMAND.test(policyText);
}

function normalizeSymbols(symbols) {
  return [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => String(symbol || '').trim().toUpperCase())
    .filter(isPublicationGeneSymbol))]
    .slice(0, 15);
}

/**
 * Fetch bounded public association evidence from GeneMap's authenticated API.
 * Upstream/reference outages are non-destructive: candidate leads remain visible
 * and explicitly unverified rather than disappearing or inheriting fake evidence.
 *
 * @param {object|null} query
 * @param {string[]} symbols
 * @returns {Promise<AssociationEvidenceResponse & {error?: string}>}
 */
export async function fetchAssociationEvidence(query, symbols) {
  const cleanSymbols = normalizeSymbols(symbols);
  if (!query || cleanSymbols.length === 0) return EMPTY_RESULT;
  try {
    /** @type {AssociationEvidenceResponse} */
    const response = await apiClient.request('/genomics/association-evidence', {
      method: 'POST',
      body: JSON.stringify({ query, symbols: cleanSymbols }),
      timeoutMs: 45_000,
    });
    return {
      ...EMPTY_RESULT,
      ...(response && typeof response === 'object' ? response : {}),
      claimsByGene: response?.claimsByGene && typeof response.claimsByGene === 'object'
        ? response.claimsByGene
        : {},
      sources: {
        ...EMPTY_RESULT.sources,
        ...(response?.sources || {}),
      },
    };
  } catch (error) {
    return {
      ...EMPTY_RESULT,
      error: error?.message || 'Association evidence is temporarily unavailable.',
    };
  }
}

export const __test = { isPublicationGeneSymbol, normalizeSymbols, EMPTY_RESULT };
