import { describe, expect, it, vi } from 'vitest';
import {
  GENE_NETWORK_LIMITS,
  getGeneNetwork,
  normalizeStringNetwork,
} from '../services/geneNetwork.js';

const RETRIEVED_AT = '2026-08-25T12:00:00.000Z';
const STRING_ROWS = [
  {
    stringId_A: '9606.ENSP00000303540',
    stringId_B: '9606.ENSP00000316527',
    preferredName_A: 'SCN2A',
    preferredName_B: 'SCN1A',
    score: 0.91,
    nscore: 0,
    fscore: 0,
    pscore: 0,
    ascore: 0.22,
    escore: 0.8,
    dscore: 0.5,
    tscore: 0.3,
  },
  {
    stringId_A: '9606.ENSP00000303540',
    stringId_B: '9606.ENSP00000400001',
    preferredName_A: 'SCN2A',
    preferredName_B: 'SCN3A',
    score: 0.82,
    nscore: 0,
    fscore: 0,
    pscore: 0.1,
    ascore: 0.62,
    escore: 0.4,
    dscore: 0,
    tscore: 0.2,
  },
];

const STRING_ID_ROWS = [
  {
    queryIndex: 0,
    queryItem: 'SCN1A',
    stringId: '9606.ENSP00000316527',
    preferredName: 'SCN1A',
  },
  {
    queryIndex: 1,
    queryItem: 'SCN2A',
    stringId: '9606.ENSP00000303540',
    preferredName: 'SCN2A',
  },
];

function okJson(payload) {
  return {
    ok: true,
    json: vi.fn().mockResolvedValue(payload),
  };
}

function networkFetch(rows = STRING_ROWS, identifierRows = STRING_ID_ROWS) {
  return vi.fn()
    .mockResolvedValueOnce(okJson(identifierRows))
    .mockResolvedValueOnce(okJson(rows));
}

describe('STRING gene-network adapter', () => {
  it('normalizes API rows in stable order and distinguishes query from expanded nodes', () => {
    const network = normalizeStringNetwork(
      [...STRING_ROWS].reverse(),
      ['SCN2A', 'SCN1A'],
      RETRIEVED_AT,
    );

    expect(network.nodes.map((node) => [node.symbol, node.kind])).toEqual([
      ['SCN1A', 'query'],
      ['SCN2A', 'query'],
      ['SCN3A', 'expanded'],
    ]);
    expect(network.edges.map((edge) => edge.id)).toEqual([
      'SCN1A::SCN2A',
      'SCN2A::SCN3A',
    ]);
    expect(network.edges[0]).toMatchObject({
      score: 0.91,
      sourceName: 'STRING',
      sourceUrl: 'https://string-db.org/help/api/',
      retrievedAt: RETRIEVED_AT,
      evidenceChannels: expect.arrayContaining([
        { label: 'experiments', score: 0.8 },
        { label: 'curated databases', score: 0.5 },
      ]),
    });
  });

  it('preserves a selected query gene that has no qualifying STRING edge', () => {
    const network = normalizeStringNetwork(
      [STRING_ROWS[1]],
      ['SCN2A', 'SCN1A'],
      RETRIEVED_AT,
    );

    expect(network.nodes).toEqual([
      {
        id: 'SCN1A',
        symbol: 'SCN1A',
        stringId: null,
        kind: 'query',
      },
      {
        id: 'SCN2A',
        symbol: 'SCN2A',
        stringId: '9606.ENSP00000303540',
        kind: 'query',
      },
      {
        id: 'SCN3A',
        symbol: 'SCN3A',
        stringId: '9606.ENSP00000400001',
        kind: 'expanded',
      },
    ]);
    expect(network.edges).toHaveLength(1);
  });

  it('sends sorted bounded public symbols and fixed human functional-network parameters', async () => {
    const fetchImpl = networkFetch();

    const result = await getGeneNetwork(
      ['scn2a', 'SCN1A', 'SCN1A'],
      { requiredScore: 700, addNodes: 2 },
      { fetchImpl, now: () => new Date(RETRIEVED_AT) },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [resolutionUrl, resolutionRequest] = fetchImpl.mock.calls[0];
    const parsedResolution = new URL(resolutionUrl);
    expect(parsedResolution.origin + parsedResolution.pathname)
      .toBe('https://string-db.org/api/json/get_string_ids');
    expect(parsedResolution.searchParams.get('identifiers')).toBe('SCN1A\rSCN2A');
    expect(parsedResolution.searchParams.get('species')).toBe('9606');
    expect(parsedResolution.searchParams.get('limit')).toBe('1');
    expect(parsedResolution.searchParams.get('echo_query')).toBe('1');
    expect(parsedResolution.searchParams.get('caller_identity')).toBe('GeneMapDiscovery');
    expect(resolutionRequest.headers).toEqual({ Accept: 'application/json' });

    const [url, request] = fetchImpl.mock.calls[1];
    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe('https://string-db.org/api/json/network');
    expect(parsed.searchParams.get('identifiers')).toBe('SCN1A\rSCN2A');
    expect(parsed.searchParams.get('species')).toBe('9606');
    expect(parsed.searchParams.get('required_score')).toBe('700');
    expect(parsed.searchParams.get('network_type')).toBe('functional');
    expect(parsed.searchParams.get('add_nodes')).toBe('2');
    expect(parsed.searchParams.get('caller_identity')).toBe('GeneMapDiscovery');
    expect(request.headers).toEqual({ Accept: 'application/json' });
    expect(result).toMatchObject({
      querySymbols: ['SCN1A', 'SCN2A'],
      resolvedQuerySymbols: ['SCN1A', 'SCN2A'],
      queryMappings: [
        { submittedSymbol: 'SCN1A', preferredSymbol: 'SCN1A', resolved: true },
        { submittedSymbol: 'SCN2A', preferredSymbol: 'SCN2A', resolved: true },
      ],
      identifierResolutionStatus: 'available',
      sourceStatus: 'available',
      retrievedAt: RETRIEVED_AT,
      source: {
        name: 'STRING',
        taxon: '9606',
        networkType: 'functional',
        requiredScore: 700,
        addNodes: 2,
      },
    });
  });

  it('fails soft without asserting query nodes when identifier resolution is unavailable', async () => {
    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      { fetchImpl: vi.fn().mockRejectedValue(new Error('network down')) },
    );

    expect(result).toMatchObject({
      sourceStatus: 'unavailable',
      identifierResolutionStatus: 'unavailable',
      retrievedAt: null,
      edges: [],
      nodes: [],
      queryMappings: [],
    });
  });

  it('treats a malformed successful payload as unavailable rather than no associations', async () => {
    const logger = { warn: vi.fn() };
    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      {
        fetchImpl: networkFetch({ message: 'unexpected payload' }),
        logger,
      },
    );

    expect(result).toMatchObject({
      sourceStatus: 'unavailable',
      retrievedAt: null,
      edges: [],
      nodes: [
        { symbol: 'SCN1A', kind: 'query' },
        { symbol: 'SCN2A', kind: 'query' },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { error: 'STRING network response was not an array' },
      'STRING network lookup failed',
    );
  });

  it.each([
    ['missing', undefined],
    ['nonnumeric', 'not-a-score'],
    ['negative', -0.01],
    ['greater than one', 1.01],
  ])('treats a %s combined score as an unavailable source response', async (_name, value) => {
    const row = { ...STRING_ROWS[0] };
    if (value === undefined) delete row.score;
    else row.score = value;
    const logger = { warn: vi.fn() };

    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      { fetchImpl: networkFetch([row]), logger },
    );

    expect(result).toMatchObject({
      sourceStatus: 'unavailable',
      retrievedAt: null,
      edges: [],
      nodes: [
        { symbol: 'SCN1A', kind: 'query' },
        { symbol: 'SCN2A', kind: 'query' },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { error: 'STRING network response contained an invalid combined score' },
      'STRING network lookup failed',
    );
  });

  it.each([
    ['missing endpoint', { preferredName_A: undefined }],
    ['invalid endpoint', { preferredName_A: 'not a gene' }],
    ['identical endpoints', { preferredName_B: 'SCN2A' }],
    ['numeric endpoint', { preferredName_A: 123 }],
    ['boolean endpoint', { preferredName_A: true }],
    ['array endpoint', { preferredName_A: ['SCN2A'] }],
  ])('treats %s as an unavailable source response', async (_name, change) => {
    const logger = { warn: vi.fn() };
    const row = { ...STRING_ROWS[0], ...change };

    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      { fetchImpl: networkFetch([row]), logger },
    );

    expect(result).toMatchObject({
      sourceStatus: 'unavailable',
      retrievedAt: null,
      edges: [],
      nodes: [
        { symbol: 'SCN1A', kind: 'query' },
        { symbol: 'SCN2A', kind: 'query' },
      ],
    });
    expect(logger.warn).toHaveBeenCalledWith(
      { error: 'STRING network response contained invalid association endpoints' },
      'STRING network lookup failed',
    );
  });

  it('validates every provider row before applying the output edge cap', async () => {
    const rows = Array.from(
      { length: GENE_NETWORK_LIMITS.maxEdges },
      () => ({ ...STRING_ROWS[0] }),
    );
    rows.push({ ...STRING_ROWS[0], score: 'invalid-after-cap' });

    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      { fetchImpl: networkFetch(rows) },
    );

    expect(result).toMatchObject({
      sourceStatus: 'unavailable',
      retrievedAt: null,
      edges: [],
    });
  });

  it('maps submitted aliases to preferred STRING symbols before classifying query nodes', async () => {
    const identifierRows = [
      {
        queryIndex: 0,
        queryItem: 'P53',
        stringId: '9606.ENSP00000269305',
        preferredName: 'TP53',
      },
      {
        queryIndex: 1,
        queryItem: 'SCN1A',
        stringId: '9606.ENSP00000316527',
        preferredName: 'SCN1A',
      },
    ];
    const rows = [{
      stringId_A: '9606.ENSP00000269305',
      stringId_B: '9606.ENSP00000316527',
      preferredName_A: 'TP53',
      preferredName_B: 'SCN1A',
      score: 0.88,
      escore: 0.7,
    }];
    const fetchImpl = networkFetch(rows, identifierRows);

    const result = await getGeneNetwork(
      ['p53', 'SCN1A'],
      {},
      { fetchImpl, now: () => new Date(RETRIEVED_AT) },
    );

    const networkUrl = new URL(fetchImpl.mock.calls[1][0]);
    expect(networkUrl.searchParams.get('identifiers')).toBe('SCN1A\rTP53');
    expect(result).toMatchObject({
      querySymbols: ['P53', 'SCN1A'],
      resolvedQuerySymbols: ['SCN1A', 'TP53'],
      identifierResolutionStatus: 'available',
      queryMappings: [
        {
          submittedSymbol: 'P53',
          preferredSymbol: 'TP53',
          stringId: '9606.ENSP00000269305',
          resolved: true,
        },
        {
          submittedSymbol: 'SCN1A',
          preferredSymbol: 'SCN1A',
          stringId: '9606.ENSP00000316527',
          resolved: true,
        },
      ],
      nodes: [
        { symbol: 'SCN1A', kind: 'query' },
        { symbol: 'TP53', kind: 'query' },
      ],
      edges: [{ id: 'SCN1A::TP53', source: 'SCN1A', target: 'TP53', score: 0.88 }],
      sourceStatus: 'available',
    });
    expect(result.nodes.some((node) => node.symbol === 'P53')).toBe(false);
    expect(new URL(result.source.networkUrl).searchParams.get('identifiers'))
      .toBe('SCN1A\rTP53');
  });

  it('does not classify an unresolved submitted identifier as a queried node', async () => {
    const fetchImpl = networkFetch(STRING_ROWS, STRING_ID_ROWS);

    const result = await getGeneNetwork(
      ['UNKNOWN', 'SCN2A', 'SCN1A'],
      {},
      { fetchImpl, now: () => new Date(RETRIEVED_AT) },
    );

    expect(result).toMatchObject({
      querySymbols: ['SCN1A', 'SCN2A', 'UNKNOWN'],
      resolvedQuerySymbols: ['SCN1A', 'SCN2A'],
      identifierResolutionStatus: 'available',
      queryMappings: [
        { submittedSymbol: 'SCN1A', preferredSymbol: 'SCN1A', resolved: true },
        { submittedSymbol: 'SCN2A', preferredSymbol: 'SCN2A', resolved: true },
        { submittedSymbol: 'UNKNOWN', preferredSymbol: 'UNKNOWN', resolved: false },
      ],
      nodes: [
        { symbol: 'SCN1A', kind: 'query' },
        { symbol: 'SCN2A', kind: 'query' },
        { symbol: 'SCN3A', kind: 'expanded' },
      ],
      sourceStatus: 'available',
    });
    expect(result.nodes.some((node) => node.symbol === 'UNKNOWN')).toBe(false);
    expect(new URL(fetchImpl.mock.calls[1][0]).searchParams.get('identifiers'))
      .toBe('SCN1A\rSCN2A');
  });

  it('does not claim no associations when fewer than two identifiers resolve', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(okJson([STRING_ID_ROWS[0]]));

    const result = await getGeneNetwork(
      ['SCN1A', 'UNKNOWN'],
      {},
      { fetchImpl, now: () => new Date(RETRIEVED_AT) },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(fetchImpl.mock.calls[0][0]).pathname).toBe('/api/json/get_string_ids');
    expect(result).toMatchObject({
      querySymbols: ['SCN1A', 'UNKNOWN'],
      resolvedQuerySymbols: ['SCN1A'],
      identifierResolutionStatus: 'available',
      queryMappings: [
        { submittedSymbol: 'SCN1A', preferredSymbol: 'SCN1A', resolved: true },
        { submittedSymbol: 'UNKNOWN', preferredSymbol: 'UNKNOWN', resolved: false },
      ],
      nodes: [{ symbol: 'SCN1A', kind: 'query' }],
      edges: [],
      sourceStatus: 'insufficient_resolved_input',
      retrievedAt: RETRIEVED_AT,
    });
    expect(result.sourceStatus).not.toBe('no_associations');
  });

  it('reports any symbols outside the bounded upstream request instead of silently dropping them', async () => {
    const requestedSymbols = Array.from(
      { length: 12 },
      (_, index) => `G${String(index + 1).padStart(2, '0')}`,
    );
    const identifierRows = requestedSymbols.slice(0, 10).map((symbol, queryIndex) => ({
      queryIndex,
      queryItem: symbol,
      stringId: `9606.${symbol}`,
      preferredName: symbol,
    }));
    const fetchImpl = networkFetch([], identifierRows);

    const result = await getGeneNetwork(requestedSymbols, {}, { fetchImpl });
    const [url] = fetchImpl.mock.calls[1];

    expect(new URL(url).searchParams.get('identifiers')).toBe(
      requestedSymbols.slice(0, 10).join('\r'),
    );
    expect(result).toMatchObject({
      requestedSymbols,
      querySymbols: requestedSymbols.slice(0, 10),
      omittedSymbols: requestedSymbols.slice(10),
      sourceStatus: 'no_associations',
    });
    expect(result.nodes.map((node) => node.symbol)).toEqual(requestedSymbols.slice(0, 10));
  });
});
