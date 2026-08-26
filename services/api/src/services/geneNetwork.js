const STRING_NETWORK_ENDPOINT = 'https://string-db.org/api/json/network';
const STRING_IDENTIFIER_ENDPOINT = 'https://string-db.org/api/json/get_string_ids';
const STRING_NETWORK_PAGE = 'https://string-db.org/cgi/network';
const STRING_API_DOCUMENTATION = 'https://string-db.org/help/api/';
const HUMAN_TAXON_ID = 9606;
const MAX_EDGES = 250;
const MAX_QUERY_SYMBOLS = 10;
const DEFAULT_REQUIRED_SCORE = 400;
const DEFAULT_ADDED_NODES = 3;

const EVIDENCE_CHANNELS = Object.freeze([
  ['neighborhood', 'nscore'],
  ['gene fusion', 'fscore'],
  ['phylogenetic co-occurrence', 'pscore'],
  ['co-expression', 'ascore'],
  ['experiments', 'escore'],
  ['curated databases', 'dscore'],
  ['text mining', 'tscore'],
]);

function boundedInteger(value, fallback, min, max) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= min && parsed <= max ? parsed : fallback;
}

function cleanSymbols(symbols) {
  return [...new Set((Array.isArray(symbols) ? symbols : [])
    .map((symbol) => String(symbol || '').trim().toUpperCase())
    .filter((symbol) => /^[A-Z0-9][A-Z0-9-]{1,14}$/u.test(symbol)))]
    .sort((left, right) => left.localeCompare(right));
}

function strictScore(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null;
}

function providerSymbol(value) {
  if (typeof value !== 'string') return null;
  const symbol = value.trim().toUpperCase();
  return /^[A-Z0-9][A-Z0-9-]{1,30}$/u.test(symbol) ? symbol : null;
}

function networkPageUrl(symbols) {
  const params = new URLSearchParams({
    identifiers: symbols.join('\r'),
    species: String(HUMAN_TAXON_ID),
  });
  return `${STRING_NETWORK_PAGE}?${params.toString()}`;
}

export function normalizeStringQueryMappings(rows, querySymbols) {
  if (!Array.isArray(rows)) {
    throw new Error('STRING identifier response was not an array');
  }
  const cleanQuerySymbols = cleanSymbols(querySymbols);
  const querySet = new Set(cleanQuerySymbols);
  const resolved = new Map();

  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('STRING identifier response contained an invalid row');
    }
    const hasQueryIndex = row.queryIndex !== undefined && row.queryIndex !== null;
    if (hasQueryIndex && (
      !Number.isInteger(row.queryIndex)
      || row.queryIndex < 0
      || row.queryIndex >= cleanQuerySymbols.length
    )) {
      throw new Error('STRING identifier response contained an invalid mapping');
    }
    const queryIndex = hasQueryIndex ? row.queryIndex : null;
    const indexedSymbol = queryIndex !== null
      && queryIndex >= 0
      && queryIndex < cleanQuerySymbols.length
      ? cleanQuerySymbols[queryIndex]
      : null;
    const hasQueryItem = row.queryItem !== undefined && row.queryItem !== null;
    const echoedSymbol = providerSymbol(row.queryItem);
    if (hasQueryItem && (!echoedSymbol || !querySet.has(echoedSymbol))) {
      throw new Error('STRING identifier response contained an invalid mapping');
    }
    if (indexedSymbol && echoedSymbol && indexedSymbol !== echoedSymbol) {
      throw new Error('STRING identifier response contained a contradictory mapping');
    }
    const submittedSymbol = echoedSymbol || indexedSymbol;
    const preferredSymbol = providerSymbol(row.preferredName);
    if (!submittedSymbol || !preferredSymbol) {
      throw new Error('STRING identifier response contained an invalid mapping');
    }
    if (!resolved.has(submittedSymbol)) {
      resolved.set(submittedSymbol, {
        submittedSymbol,
        preferredSymbol,
        stringId: typeof row.stringId === 'string' && row.stringId.trim()
          ? row.stringId.trim()
          : null,
        resolved: true,
      });
    }
  }

  return cleanQuerySymbols.map((submittedSymbol) => resolved.get(submittedSymbol) || {
    submittedSymbol,
    preferredSymbol: submittedSymbol,
    stringId: null,
    resolved: false,
  });
}

export function normalizeStringNetwork(
  rows,
  querySymbols,
  retrievedAt,
  queryMappings = null,
) {
  const cleanQuerySymbols = cleanSymbols(querySymbols);
  const normalizedMappings = Array.isArray(queryMappings)
    ? queryMappings
    : cleanQuerySymbols.map((symbol) => ({
      submittedSymbol: symbol,
      preferredSymbol: symbol,
      stringId: null,
      resolved: true,
    }));
  const resolvedMappings = normalizedMappings.filter((mapping) => mapping?.resolved !== false);
  const querySet = new Set(resolvedMappings.map((mapping) => mapping.preferredSymbol));
  const nodeMap = new Map();
  for (const mapping of resolvedMappings) {
    const symbol = providerSymbol(mapping?.preferredSymbol);
    if (!symbol) continue;
    const existing = nodeMap.get(symbol);
    nodeMap.set(symbol, {
      id: symbol,
      symbol,
      stringId: existing?.stringId
        || (typeof mapping.stringId === 'string' ? mapping.stringId : null),
      kind: 'query',
    });
  }
  const edgeMap = new Map();
  if (!Array.isArray(rows)) {
    throw new Error('STRING network response was not an array');
  }
  const validatedRows = rows.map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error('STRING network response contained invalid association endpoints');
    }
    const combinedScore = strictScore(row.score);
    if (combinedScore === null) {
      throw new Error('STRING network response contained an invalid combined score');
    }
    const symbolA = providerSymbol(row.preferredName_A);
    const symbolB = providerSymbol(row.preferredName_B);
    if (!symbolA || !symbolB || symbolA === symbolB) {
      throw new Error('STRING network response contained invalid association endpoints');
    }
    const evidenceChannels = EVIDENCE_CHANNELS.flatMap(([label, field]) => {
      if (!Object.prototype.hasOwnProperty.call(row, field)) return [];
      const channelScore = strictScore(row[field]);
      if (channelScore === null) {
        throw new Error('STRING network response contained an invalid evidence-channel score');
      }
      return channelScore > 0 ? [{ label, score: channelScore }] : [];
    });
    return {
      row,
      combinedScore,
      symbolA,
      symbolB,
      evidenceChannels,
    };
  });

  const assertConnectedToQuery = (candidateRows) => {
    const connectedSymbols = new Set(querySet);
    let changed = true;
    while (changed) {
      changed = false;
      for (const { symbolA, symbolB } of candidateRows) {
        if (connectedSymbols.has(symbolA) && !connectedSymbols.has(symbolB)) {
          connectedSymbols.add(symbolB);
          changed = true;
        } else if (connectedSymbols.has(symbolB) && !connectedSymbols.has(symbolA)) {
          connectedSymbols.add(symbolA);
          changed = true;
        }
      }
    }
    if (candidateRows.some(({ symbolA, symbolB }) => (
      !connectedSymbols.has(symbolA) || !connectedSymbols.has(symbolB)
    ))) {
      throw new Error('STRING network response fell outside the resolved query scope');
    }
  };
  assertConnectedToQuery(validatedRows);
  const boundedRows = validatedRows.slice(0, MAX_EDGES);
  assertConnectedToQuery(boundedRows);

  for (const {
    row,
    combinedScore,
    symbolA,
    symbolB,
    evidenceChannels,
  } of boundedRows) {
    for (const [symbol, stringId] of [
      [symbolA, row.stringId_A],
      [symbolB, row.stringId_B],
    ]) {
      const existing = nodeMap.get(symbol);
      if (!existing) {
        nodeMap.set(symbol, {
          id: symbol,
          symbol,
          stringId: typeof stringId === 'string' ? stringId : null,
          kind: querySet.has(symbol) ? 'query' : 'expanded',
        });
      } else if (!existing.stringId && typeof stringId === 'string') {
        nodeMap.set(symbol, { ...existing, stringId });
      }
    }

    const [source, target] = [symbolA, symbolB].sort((left, right) => left.localeCompare(right));
    const edgeId = `${source}::${target}`;
    const edge = {
      id: edgeId,
      source,
      target,
      score: combinedScore,
      evidenceChannels,
      statement: `${source} and ${target} have a STRING functional association score of ${combinedScore.toFixed(3)}.`,
      sourceName: 'STRING',
      sourceUrl: STRING_API_DOCUMENTATION,
      retrievedAt,
    };
    const existing = edgeMap.get(edgeId);
    if (!existing || edge.score > existing.score) edgeMap.set(edgeId, edge);
  }

  const nodes = [...nodeMap.values()].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'query' ? -1 : 1;
    return left.symbol.localeCompare(right.symbol);
  });
  const edges = [...edgeMap.values()].sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    return left.id.localeCompare(right.id);
  });

  return { nodes, edges };
}

export async function getGeneNetwork(symbols, options = {}, dependencies = {}) {
  const requestedSymbols = cleanSymbols(symbols);
  const querySymbols = requestedSymbols.slice(0, MAX_QUERY_SYMBOLS);
  const omittedSymbols = requestedSymbols.slice(MAX_QUERY_SYMBOLS);
  const requiredScore = boundedInteger(
    options.requiredScore,
    DEFAULT_REQUIRED_SCORE,
    0,
    1000,
  );
  const addNodes = boundedInteger(options.addNodes, DEFAULT_ADDED_NODES, 0, 5);
  const fetchImpl = dependencies.fetchImpl || fetch;
  const now = dependencies.now || (() => new Date());
  const retrievedAt = now().toISOString();
  const source = {
    name: 'STRING',
    apiVersion: 'current public API',
    releaseVersion: null,
    documentationUrl: STRING_API_DOCUMENTATION,
    networkUrl: networkPageUrl(querySymbols),
    species: 'Homo sapiens',
    taxon: String(HUMAN_TAXON_ID),
    networkType: 'functional',
    requiredScore,
    addNodes,
  };

  if (querySymbols.length < 2) {
    return {
      requestedSymbols,
      querySymbols,
      omittedSymbols,
      resolvedQuerySymbols: [],
      queryMappings: [],
      identifierResolutionStatus: 'not_requested',
      nodes: [],
      edges: [],
      sourceStatus: 'insufficient_input',
      source,
      retrievedAt: null,
    };
  }

  const params = new URLSearchParams({
    identifiers: querySymbols.join('\r'),
    species: String(HUMAN_TAXON_ID),
    required_score: String(requiredScore),
    network_type: 'functional',
    add_nodes: String(addNodes),
    caller_identity: 'GeneMapDiscovery',
  });

  let queryMappings = [];
  let resolvedQuerySymbols = [];
  let identifierResolutionStatus = 'unavailable';

  try {
    const resolutionParams = new URLSearchParams({
      identifiers: querySymbols.join('\r'),
      species: String(HUMAN_TAXON_ID),
      limit: '1',
      echo_query: '1',
      caller_identity: 'GeneMapDiscovery',
    });
    const resolutionResponse = await fetchImpl(
      `${STRING_IDENTIFIER_ENDPOINT}?${resolutionParams.toString()}`,
      {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!resolutionResponse.ok) {
      throw new Error(`STRING identifier request returned HTTP ${resolutionResponse.status}`);
    }
    queryMappings = normalizeStringQueryMappings(
      await resolutionResponse.json(),
      querySymbols,
    );
    identifierResolutionStatus = 'available';
    resolvedQuerySymbols = [...new Set(queryMappings
      .filter((mapping) => mapping.resolved)
      .map((mapping) => mapping.preferredSymbol))]
      .sort((left, right) => left.localeCompare(right));
    source.networkUrl = networkPageUrl(
      resolvedQuerySymbols.length > 0 ? resolvedQuerySymbols : querySymbols,
    );

    if (resolvedQuerySymbols.length < 2) {
      const network = normalizeStringNetwork([], querySymbols, retrievedAt, queryMappings);
      return {
        requestedSymbols,
        querySymbols,
        omittedSymbols,
        resolvedQuerySymbols,
        queryMappings,
        identifierResolutionStatus,
        ...network,
        sourceStatus: 'insufficient_resolved_input',
        source,
        retrievedAt,
      };
    }

    params.set('identifiers', resolvedQuerySymbols.join('\r'));
    const response = await fetchImpl(`${STRING_NETWORK_ENDPOINT}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      throw new Error(`STRING network request returned HTTP ${response.status}`);
    }
    const rows = await response.json();
    if (!Array.isArray(rows)) {
      throw new Error('STRING network response was not an array');
    }
    const network = normalizeStringNetwork(rows, querySymbols, retrievedAt, queryMappings);
    return {
      requestedSymbols,
      querySymbols,
      omittedSymbols,
      resolvedQuerySymbols,
      queryMappings,
      identifierResolutionStatus,
      ...network,
      sourceStatus: network.edges.length > 0 ? 'available' : 'no_associations',
      source,
      retrievedAt,
    };
  } catch (error) {
    dependencies.logger?.warn?.({ error: error?.message }, 'STRING network lookup failed');
    return {
      requestedSymbols,
      querySymbols,
      omittedSymbols,
      resolvedQuerySymbols,
      queryMappings,
      identifierResolutionStatus,
      nodes: normalizeStringNetwork([], querySymbols, retrievedAt, queryMappings).nodes,
      edges: [],
      sourceStatus: 'unavailable',
      source,
      retrievedAt: null,
    };
  }
}

export const GENE_NETWORK_LIMITS = Object.freeze({
  maxSymbols: MAX_QUERY_SYMBOLS,
  maxAddedNodes: 5,
  maxEdges: MAX_EDGES,
  defaultRequiredScore: DEFAULT_REQUIRED_SCORE,
  defaultAddedNodes: DEFAULT_ADDED_NODES,
});
