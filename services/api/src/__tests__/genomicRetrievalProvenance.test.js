import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrichGenes, validateHpoTerms } from '../services/genomicDatabases.js';

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

afterEach(() => vi.unstubAllGlobals());

describe('authoritative adapter retrieval provenance', () => {
  it('stamps a successful MyGene record once and preserves the cached timestamp', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{
      query: 'RETR1',
      symbol: 'RETR1',
      name: 'retrieval provenance fixture',
      entrezgene: 123456,
      ensembl: { gene: 'ENSG00000999991' },
      genomic_pos: { chr: '1', start: 101, end: 202 },
    }]));
    vi.stubGlobal('fetch', fetchMock);

    const first = await enrichGenes(['RETR1']);
    expect(first.RETR1.verified).toBe(true);
    expect(first.RETR1.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = await enrichGenes(['RETR1']);
    expect(second.RETR1.retrievedAt).toBe(first.RETR1.retrievedAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('carries the actual HPO adapter timestamp into a validated term record', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      terms: [{ id: 'HP:0099999', name: 'Retrieval provenance phenotype' }],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const first = await validateHpoTerms(['Retrieval provenance phenotype']);
    const record = first['retrieval provenance phenotype'];
    expect(record).toMatchObject({
      hpoId: 'HP:0099999',
      verified: true,
    });
    expect(record.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = await validateHpoTerms(['Retrieval provenance phenotype']);
    expect(second['retrieval provenance phenotype'].retrievedAt).toBe(record.retrievedAt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
