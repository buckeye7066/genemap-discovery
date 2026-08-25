import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const networkService = vi.hoisted(() => ({
  getGeneNetwork: vi.fn(),
}));

vi.mock('../services/geneNetwork.js', () => networkService);

import { authCookie, buildTestApp, createPrismaMock } from './setup.js';

const user = {
  userId: 'gene-network-route-user',
  email: 'network@example.invalid',
  role: 'user',
};

describe('POST /genomics/gene-network', () => {
  let app;
  let prisma;
  let cookie;

  beforeEach(async () => {
    vi.clearAllMocks();
    prisma = createPrismaMock();
    app = await buildTestApp(prisma, { csrf: false, includeGenomics: true });
    cookie = authCookie(user, prisma);
    networkService.getGeneNetwork.mockResolvedValue({
      querySymbols: ['SCN1A', 'SCN2A'],
      nodes: [
        { id: 'SCN1A', symbol: 'SCN1A', kind: 'query' },
        { id: 'SCN2A', symbol: 'SCN2A', kind: 'query' },
      ],
      edges: [{ id: 'SCN1A::SCN2A', source: 'SCN1A', target: 'SCN2A', score: 0.91 }],
      sourceStatus: 'available',
      source: { name: 'STRING', taxon: '9606', networkType: 'functional' },
      retrievedAt: '2026-08-25T12:00:00.000Z',
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('requires authentication', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/gene-network',
      payload: { symbols: ['SCN1A', 'SCN2A'] },
    });

    expect(response.statusCode).toBe(401);
    expect(networkService.getGeneNetwork).not.toHaveBeenCalled();
  });

  it('passes only bounded public symbols and network options to the adapter', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/gene-network',
      headers: { cookie },
      payload: {
        symbols: ['scn2a', 'SCN1A'],
        requiredScore: 700,
        addNodes: 2,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(networkService.getGeneNetwork).toHaveBeenCalledWith(
      ['SCN2A', 'SCN1A'],
      { requiredScore: 700, addNodes: 2 },
      { logger: app.log },
    );
    expect(JSON.parse(response.payload)).toMatchObject({
      sourceStatus: 'available',
      source: { name: 'STRING', networkType: 'functional' },
      edges: [{ id: 'SCN1A::SCN2A', score: 0.91 }],
    });
  });

  it.each([
    { symbols: ['SCN1A'] },
    { symbols: ['SCN1A', 'scn1a'] },
    { symbols: ['SCN1A', 'not a gene'] },
    { symbols: ['TAKE-5MG', 'SCN1A'] },
    { symbols: ['STOP-DRUG', 'SCN1A'] },
    { symbols: Array.from({ length: 11 }, (_, index) => `G${index + 10}`) },
    { symbols: ['SCN1A', 'SCN2A'], requiredScore: 1001 },
    { symbols: ['SCN1A', 'SCN2A'], addNodes: 6 },
    { symbols: ['SCN1A', 'SCN2A'], injected: true },
  ])('rejects invalid or over-broad input: %j', async (payload) => {
    const response = await app.inject({
      method: 'POST',
      url: '/genomics/gene-network',
      headers: { cookie },
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(networkService.getGeneNetwork).not.toHaveBeenCalled();
  });
});
