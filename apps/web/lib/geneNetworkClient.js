import { apiClient } from '@genemap/shared';

const CLINICAL_COMMAND = /^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u;

const EMPTY_RESULT = Object.freeze({
  querySymbols: [],
  nodes: [],
  edges: [],
  sourceStatus: 'unavailable',
  source: {
    name: 'STRING',
    documentationUrl: 'https://string-db.org/help/api/',
    networkUrl: null,
    species: 'Homo sapiens',
    taxon: '9606',
    networkType: 'functional',
    requiredScore: 400,
    addNodes: 3,
  },
  retrievedAt: null,
});

function isPublicGeneSymbol(value) {
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
    .filter(isPublicGeneSymbol))]
    .sort((left, right) => left.localeCompare(right))
    .slice(0, 10);
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function fetchGeneNetwork(symbols, options = {}) {
  const cleanSymbols = normalizeSymbols(symbols);
  if (cleanSymbols.length < 2) {
    return { ...EMPTY_RESULT, querySymbols: cleanSymbols, sourceStatus: 'insufficient_input' };
  }
  const requiredScore = boundedInteger(options.requiredScore, 400, 0, 1000);
  const addNodes = boundedInteger(options.addNodes, 3, 0, 5);

  try {
    const response = await apiClient.request('/genomics/gene-network', {
      method: 'POST',
      body: JSON.stringify({ symbols: cleanSymbols, requiredScore, addNodes }),
      timeoutMs: 30_000,
    });
    return {
      ...EMPTY_RESULT,
      ...(response && typeof response === 'object' ? response : {}),
      querySymbols: Array.isArray(response?.querySymbols) ? response.querySymbols : cleanSymbols,
      nodes: Array.isArray(response?.nodes) ? response.nodes : [],
      edges: Array.isArray(response?.edges) ? response.edges : [],
      source: {
        ...EMPTY_RESULT.source,
        ...(response?.source || {}),
      },
    };
  } catch (error) {
    return {
      ...EMPTY_RESULT,
      querySymbols: cleanSymbols,
      error: error?.message || 'Gene network is temporarily unavailable.',
    };
  }
}

export const __test = { EMPTY_RESULT, isPublicGeneSymbol, normalizeSymbols };
