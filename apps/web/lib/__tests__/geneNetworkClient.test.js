import { beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@genemap/shared', () => ({ apiClient: shared }));

import { fetchGeneNetwork, __test } from '../geneNetworkClient';

describe('geneNetworkClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates, sorts, and policy-filters public gene symbols', async () => {
    shared.request.mockResolvedValue({
      querySymbols: ['SCN1A', 'SCN2A'],
      nodes: [{ id: 'SCN1A', symbol: 'SCN1A', kind: 'query' }],
      edges: [],
      sourceStatus: 'no_associations',
      source: { name: 'STRING' },
    });

    await fetchGeneNetwork(
      ['scn2a', 'SCN1A', 'SCN1A', 'not a gene', 'TAKE-5MG'],
      { requiredScore: 700, addNodes: 2 },
    );

    expect(shared.request).toHaveBeenCalledWith('/genomics/gene-network', {
      method: 'POST',
      body: JSON.stringify({
        symbols: ['SCN1A', 'SCN2A'],
        requiredScore: 700,
        addNodes: 2,
      }),
      timeoutMs: 30_000,
    });
    expect(__test.isPublicGeneSymbol('SCN1A')).toBe(true);
    expect(__test.isPublicGeneSymbol('TAKE-5MG')).toBe(false);
  });

  it('returns an explicit scope when more than ten valid genes are selected', async () => {
    const requestedSymbols = Array.from(
      { length: 12 },
      (_, index) => `G${String(index + 1).padStart(2, '0')}`,
    );
    shared.request.mockResolvedValue({ sourceStatus: 'no_associations' });

    const result = await fetchGeneNetwork([...requestedSymbols].reverse());
    const request = shared.request.mock.calls[0][1];

    expect(JSON.parse(request.body).symbols).toEqual(requestedSymbols.slice(0, 10));
    expect(result).toMatchObject({
      requestedSymbols,
      querySymbols: requestedSymbols.slice(0, 10),
      omittedSymbols: requestedSymbols.slice(10),
    });
    expect(__test.networkScope(requestedSymbols)).toEqual({
      requestedSymbols,
      querySymbols: requestedSymbols.slice(0, 10),
      omittedSymbols: requestedSymbols.slice(10),
    });
  });

  it('fails soft while preserving the query symbols and source identity', async () => {
    shared.request.mockRejectedValue(new Error('source unavailable'));

    const result = await fetchGeneNetwork(['SCN2A', 'SCN1A']);

    expect(result).toMatchObject({
      querySymbols: ['SCN1A', 'SCN2A'],
      nodes: [],
      edges: [],
      sourceStatus: 'unavailable',
      error: 'source unavailable',
      source: { name: 'STRING', networkType: 'functional' },
    });
  });

  it('does not call the API for fewer than two valid symbols', async () => {
    const result = await fetchGeneNetwork(['SCN1A', 'TAKE-5MG']);

    expect(result.sourceStatus).toBe('insufficient_input');
    expect(shared.request).not.toHaveBeenCalled();
  });
});
