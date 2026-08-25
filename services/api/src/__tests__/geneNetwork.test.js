import { describe, expect, it, vi } from 'vitest';
import { getGeneNetwork, normalizeStringNetwork } from '../services/geneNetwork.js';

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

describe('STRING gene-network adapter', () => {
  it('normalizes API rows deterministically and distinguishes query from expanded nodes', () => {
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
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue(STRING_ROWS),
    });

    const result = await getGeneNetwork(
      ['scn2a', 'SCN1A', 'SCN1A'],
      { requiredScore: 700, addNodes: 2 },
      { fetchImpl, now: () => new Date(RETRIEVED_AT) },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0];
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

  it('fails soft with labeled query nodes when the public source is unavailable', async () => {
    const result = await getGeneNetwork(
      ['SCN1A', 'SCN2A'],
      {},
      { fetchImpl: vi.fn().mockRejectedValue(new Error('network down')) },
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
  });

  it('reports any symbols outside the bounded upstream request instead of silently dropping them', async () => {
    const requestedSymbols = Array.from(
      { length: 12 },
      (_, index) => `G${String(index + 1).padStart(2, '0')}`,
    );
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue([]),
    });

    const result = await getGeneNetwork(requestedSymbols, {}, { fetchImpl });
    const [url] = fetchImpl.mock.calls[0];

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
