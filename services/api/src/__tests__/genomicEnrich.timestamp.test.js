import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sourceRetrievedAt = '2026-08-01T12:34:56.000Z';
const enrichGenes = vi.fn(async () => ({
  RUNX1: {
    symbol: 'RUNX1',
    chromosome: '21',
    start: 34787801,
    end: 36004667,
    verified: true,
    source: 'MyGene.info',
    retrievedAt: sourceRetrievedAt,
  },
}));
const validateHpoTerms = vi.fn(async () => ({
  seizure: {
    hpoId: 'HP:0001250',
    name: 'Seizure',
    verified: true,
    source: 'Human Phenotype Ontology',
    retrievedAt: sourceRetrievedAt,
  },
}));

vi.mock('../services/genomicDatabases.js', () => ({
  lookupVariant: vi.fn(),
  searchVariants: vi.fn(),
  lookupGene: vi.fn(),
  searchClinVar: vi.fn(),
  searchPhenotypes: vi.fn(),
  enrichGenes,
  validateHpoTerms,
}));

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = { userId: 'provenance-user', email: 'provenance@example.com', role: 'user' };

describe('POST /genomics/enrich timestamp semantics', () => {
  let app;
  let prisma;

  beforeEach(async () => {
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeGenomics: true });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    await app?.close();
  });

  it('preserves immutable source timestamps and reports response retrieval separately', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/enrich',
      headers: { cookie: authCookie(user, prisma) },
      payload: { symbols: ['RUNX1'], phenotypes: ['Seizure'] },
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.payload);
    expect(body.genes.RUNX1.retrievedAt).toBe(sourceRetrievedAt);
    expect(body.phenotypes.seizure.retrievedAt).toBe(sourceRetrievedAt);
    expect(body.adapterRetrievedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(body.adapterRetrievedAt).not.toBe(sourceRetrievedAt);
  });
});
