import { apiClient } from '@genemap/shared';

const EMPTY_RESULT = Object.freeze({
  query: null,
  claimsByGene: {},
  adapterRetrievedAt: null,
  sources: {
    monarch: { apiVersion: 'v3', releaseVersion: null },
    openTargets: { apiVersion: 'v4', releaseVersion: null },
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
 */
export async function fetchAssociationEvidence(query, symbols) {
  const cleanSymbols = normalizeSymbols(symbols);
  if (!query || cleanSymbols.length === 0) return EMPTY_RESULT;
  try {
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
