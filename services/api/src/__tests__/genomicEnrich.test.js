import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from 'vitest';
import {
  buildTestApp,
  createPrismaMock,
  authCookie,
  seedAuthUser,
  seedPremiumSubscription,
} from './setup.js';
import { enrichGenes, validateHpoTerms } from '../services/genomicDatabases.js';

function jsonResponse(data) {
  return { ok: true, status: 200, json: async () => data };
}

// ─── enrichGenes (MyGene.info → Ensembl/NCBI) ────────────────────────────────

describe('enrichGenes', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns authoritative records keyed by the queried symbol', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      {
        query: 'BRCA1', symbol: 'BRCA1', name: 'BRCA1 DNA repair associated',
        entrezgene: 672, ensembl: { gene: 'ENSG00000012048' },
        genomic_pos: { chr: '17', start: 43044295, end: 43125483, strand: -1 },
        map_location: '17q21.31', summary: 'A tumor suppressor.',
      },
      { query: 'NOTAREALGENE', notfound: true },
    ])));

    const res = await enrichGenes(['BRCA1', 'NOTAREALGENE']);
    expect(res.BRCA1).toMatchObject({
      symbol: 'BRCA1',
      entrezId: '672',
      ensemblId: 'ENSG00000012048',
      chromosome: '17',
      start: 43044295,
      end: 43125483,
      genomeBuild: 'GRCh38',
      verified: true,
      source: 'MyGene.info',
    });
    expect(res.NOTAREALGENE).toBeNull();
  });

  it('handles genomic_pos returned as an array (multiple mappings)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([
      {
        query: 'EGFR', symbol: 'EGFR', name: 'epidermal growth factor receptor',
        entrezgene: 1956, ensembl: [{ gene: 'ENSG00000146648' }],
        genomic_pos: [{ chr: '7', start: 55019017, end: 55211628 }, { chr: 'CHR_HSCHR7', start: 1, end: 2 }],
      },
    ])));
    const res = await enrichGenes(['EGFR']);
    expect(res.EGFR).toMatchObject({ chromosome: '7', start: 55019017, ensemblId: 'ENSG00000146648', verified: true });
  });

  it('fails soft to null when the upstream errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const res = await enrichGenes(['ZZZ1']);
    expect(res.ZZZ1).toBeNull();
  });

  it('returns {} for empty input without calling fetch', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    expect(await enrichGenes([])).toEqual({});
    expect(spy).not.toHaveBeenCalled();
  });
});

// ─── validateHpoTerms (HPO / JAX) ────────────────────────────────────────────

describe('validateHpoTerms', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the top HPO match per name and flags unmatched as unverified', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).toLowerCase().includes('seizure')) {
        return jsonResponse({ terms: [{ id: 'HP:0001250', name: 'Seizure' }] });
      }
      return jsonResponse({ terms: [] });
    }));

    const res = await validateHpoTerms(['Seizure', 'Not a phenotype xyz']);
    expect(res.seizure).toMatchObject({ hpoId: 'HP:0001250', verified: true });
    expect(res['not a phenotype xyz']).toMatchObject({ hpoId: null, verified: false });
  });
});

// ─── POST /genomics/enrich ───────────────────────────────────────────────────

describe('POST /genomics/enrich', () => {
  let app;
  let prisma;

  beforeAll(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { includeGenomics: true, csrf: false });
    seedAuthUser(prisma, { userId: 'u1', email: 'u@e.com', role: 'user' });
    seedPremiumSubscription(prisma, 'u1');
  });
  afterAll(async () => { await app.close(); });
  afterEach(() => vi.unstubAllGlobals());

  it('preserves source-record timestamps and reports the route response time separately', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('mygene.info')) {
        return jsonResponse([{
          query: 'TP53', symbol: 'TP53', name: 'tumor protein p53', entrezgene: 7157,
          ensembl: { gene: 'ENSG00000141510' }, genomic_pos: { chr: '17', start: 7668421, end: 7687550 },
          map_location: '17p13.1',
        }]);
      }
      return jsonResponse({ terms: [{ id: 'HP:0002664', name: 'Neoplasm' }] });
    }));

    const cookie = authCookie({ userId: 'u1', email: 'u@e.com', role: 'user' }, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/enrich',
      headers: { cookie },
      payload: { symbols: ['TP53'], phenotypes: ['Neoplasm'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.adapterRetrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.genes.TP53).toMatchObject({
      verified: true,
      chromosome: '17',
    });
    expect(body.genes.TP53.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.genes.TP53).not.toHaveProperty('retrievalScope');
    expect(body.phenotypes.neoplasm).toMatchObject({
      hpoId: 'HP:0002664',
      verified: true,
    });
    expect(body.phenotypes.neoplasm.retrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.phenotypes.neoplasm).not.toHaveProperty('retrievalScope');
    expect(Date.parse(body.genes.TP53.retrievedAt)).toBeLessThanOrEqual(Date.parse(body.adapterRetrievedAt));
    expect(Date.parse(body.phenotypes.neoplasm.retrievedAt)).toBeLessThanOrEqual(Date.parse(body.adapterRetrievedAt));
  });

  it('does not invent a retrieval record for unresolved genes', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (String(url).includes('mygene.info')) {
        return jsonResponse([{ query: 'NOTAREALGENE', notfound: true }]);
      }
      return jsonResponse({ terms: [] });
    }));

    const cookie = authCookie({ userId: 'u1', email: 'u@e.com', role: 'user' }, prisma);
    const res = await app.inject({
      method: 'POST',
      url: '/genomics/enrich',
      headers: { cookie },
      payload: { symbols: ['NOTAREALGENE'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.genes.NOTAREALGENE).toBeNull();
  });

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'POST', url: '/genomics/enrich', payload: { symbols: ['TP53'] } });
    expect(res.statusCode).toBe(401);
  });
});
