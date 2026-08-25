const STRING_NETWORK_ENDPOINT = 'https://string-db.org/api/json/network';
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

function score(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0;
}

function networkPageUrl(symbols) {
  const params = new URLSearchParams({
    identifiers: symbols.join('\r'),
    species: String(HUMAN_TAXON_ID),
  });
  return `${STRING_NETWORK_PAGE}?${params.toString()}`;
}

export function normalizeStringNetwork(rows, querySymbols, retrievedAt) {
  const cleanQuerySymbols = cleanSymbols(querySymbols);
  const querySet = new Set(cleanQuerySymbols);
  const nodeMap = new Map(cleanQuerySymbols.map((symbol) => [
    symbol,
    {
      id: symbol,
      symbol,
      stringId: null,
      kind: 'query',
    },
  ]));
  const edgeMap = new Map();

  for (const row of Array.isArray(rows) ? rows.slice(0, MAX_EDGES) : []) {
    const symbolA = String(row?.preferredName_A || '').trim().toUpperCase();
    const symbolB = String(row?.preferredName_B || '').trim().toUpperCase();
    if (!symbolA || !symbolB || symbolA === symbolB) continue;
    if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/u.test(symbolA)) continue;
    if (!/^[A-Z0-9][A-Z0-9-]{1,30}$/u.test(symbolB)) continue;

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
    const combinedScore = score(row.score);
    const evidenceChannels = EVIDENCE_CHANNELS
      .map(([label, field]) => ({ label, score: score(row?.[field]) }))
      .filter((channel) => channel.score > 0);
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

  try {
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
    const network = normalizeStringNetwork(rows, querySymbols, retrievedAt);
    return {
      requestedSymbols,
      querySymbols,
      omittedSymbols,
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
      nodes: querySymbols.map((symbol) => ({
        id: symbol,
        symbol,
        stringId: null,
        kind: 'query',
      })),
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
