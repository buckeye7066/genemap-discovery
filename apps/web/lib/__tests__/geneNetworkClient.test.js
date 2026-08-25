import { beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ request: vi.fn() }));

vi.mock('@genemap/shared', () => ({ apiClient: shared }));

import { fetchGeneNetwork, __test } from '../geneNetworkClient';

describe('geneNetworkClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates, sorts, policy-filters, and bounds public gene symbols', async () => {
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
