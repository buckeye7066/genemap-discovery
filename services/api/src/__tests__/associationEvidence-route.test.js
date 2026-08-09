import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const evidenceService = vi.hoisted(() => ({
  getPublicationAssociationEvidence: vi.fn(),
}));

vi.mock('../services/associationEvidenceContract.js', () => evidenceService);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = {
  userId: 'association-route-user',
  email: 'association-route@example.invalid',
  role: 'user',
};

const query = {
  kind: 'hpo',
  identifier: 'HP:0001250',
};

describe('POST /genomics/association-evidence', () => {
  let app;
  let prisma;
  let cookie;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeGenomics: true });
    cookie = authCookie(user, prisma);
    evidenceService.getPublicationAssociationEvidence.mockResolvedValue({
      query: {
        ...query,
        canonicalLabel: 'Seizure',
        source: 'NLM Clinical Tables HPO',
        apiVersion: 'v3',
      },
      claimsByGene: {
        SCN1A: [{
          source: 'Monarch Initiative',
          recordId: 'association-1',
          claim: 'SCN1A has source evidence for Seizure',
          taxon: '9606',
          species: 'Homo sapiens',
          evidenceClass: 'human_verified',
          evidenceType: 'gene_phenotype_association',
          evidenceStrength: 'supporting',
          releaseVersion: '2026-06-08',
          referenceAssembly: null,
          retrievalDate: '2026-08-09',
          directLink: 'https://example.org/association-1',
          isAiLead: false,
        }],
      },
      sourceStatus: 'available',
      claimCount: 1,
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/association-evidence',
      payload: { query, symbols: ['SCN1A'] },
    });

    expect(response.statusCode).toBe(401);
    expect(evidenceService.getPublicationAssociationEvidence).not.toHaveBeenCalled();
  });

  it('accepts only a bounded immutable query reference and candidate-symbol list', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/association-evidence',
      headers: { cookie },
      payload: { query, symbols: ['scn1a', 'SCN1A'] },
    });

    expect(response.statusCode).toBe(200);
    expect(evidenceService.getPublicationAssociationEvidence).toHaveBeenCalledWith(
      query,
      ['SCN1A', 'SCN1A'],
    );
    expect(JSON.parse(response.payload)).toMatchObject({
      sourceStatus: 'available',
      claimCount: 1,
      claimsByGene: { SCN1A: [expect.objectContaining({ evidenceClass: 'human_verified' })] },
    });
  });

  it.each([
    { query: { kind: 'hpo', identifier: 'HP:12' }, symbols: ['SCN1A'] },
    { query: { kind: 'free_text', text: 'seizure' }, symbols: ['SCN1A'] },
    { query, symbols: [] },
    { query, symbols: ['not a gene'] },
    { query, symbols: Array.from({ length: 16 }, (_, index) => `G${index + 10}`) },
    { query: { ...query, injected: true }, symbols: ['SCN1A'] },
  ])('rejects invalid or over-broad input: %j', async (payload) => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/association-evidence',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(evidenceService.getPublicationAssociationEvidence).not.toHaveBeenCalled();
  });
});
