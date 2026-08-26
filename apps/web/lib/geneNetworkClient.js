import { apiClient } from '@genemap/shared';

const CLINICAL_COMMAND = /^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u;
export const GENE_NETWORK_MAX_SYMBOLS = 10;
export const GENE_NETWORK_CLIENT_TIMEOUT_MS = 40_000;

const EMPTY_RESULT = Object.freeze({
  requestedSymbols: [],
  querySymbols: [],
  omittedSymbols: [],
  resolvedQuerySymbols: [],
  queryMappings: [],
  identifierResolutionStatus: 'unavailable',
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
    .sort((left, right) => left.localeCompare(right));
}

function networkScope(symbols) {
  const requestedSymbols = normalizeSymbols(symbols);
  return {
    requestedSymbols,
    querySymbols: requestedSymbols.slice(0, GENE_NETWORK_MAX_SYMBOLS),
    omittedSymbols: requestedSymbols.slice(GENE_NETWORK_MAX_SYMBOLS),
  };
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

export async function fetchGeneNetwork(symbols, options = {}) {
  const { requestedSymbols, querySymbols, omittedSymbols } = networkScope(symbols);
  if (querySymbols.length < 2) {
    return {
      ...EMPTY_RESULT,
      requestedSymbols,
      querySymbols,
      omittedSymbols,
      sourceStatus: 'insufficient_input',
    };
  }
  const requiredScore = boundedInteger(options.requiredScore, 400, 0, 1000);
  const addNodes = boundedInteger(options.addNodes, 3, 0, 5);

  try {
    const response = await apiClient.request('/genomics/gene-network', {
      method: 'POST',
      body: JSON.stringify({ symbols: querySymbols, requiredScore, addNodes }),
      timeoutMs: GENE_NETWORK_CLIENT_TIMEOUT_MS,
    });
    return {
      ...EMPTY_RESULT,
      ...(response && typeof response === 'object' ? response : {}),
      requestedSymbols,
      querySymbols: Array.isArray(response?.querySymbols) ? response.querySymbols : querySymbols,
      omittedSymbols,
      resolvedQuerySymbols: Array.isArray(response?.resolvedQuerySymbols)
        ? response.resolvedQuerySymbols
        : [],
      queryMappings: Array.isArray(response?.queryMappings) ? response.queryMappings : [],
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
      requestedSymbols,
      querySymbols,
      omittedSymbols,
      error: error?.message || 'Gene network is temporarily unavailable.',
    };
  }
}

export const __test = { EMPTY_RESULT, isPublicGeneSymbol, networkScope, normalizeSymbols };
