import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authCookie,
  buildTestApp,
  createPrismaMock,
  seedAuthUser,
  seedPremiumSubscription,
} from './setup.js';

vi.mock('../services/publicationResolvers.js', () => ({
  searchPublicationConcepts: vi.fn(async () => []),
}));

const FREE = { userId: 'free-research', email: 'free-research@example.com', role: 'user' };
const PREMIUM = { userId: 'premium-research', email: 'premium-research@example.com', role: 'user' };

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, {
    csrf: false,
    includePublicationConcepts: true,
  });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  seedAuthUser(prisma, FREE);
  seedAuthUser(prisma, PREMIUM);
  seedPremiumSubscription(prisma, PREMIUM.userId);
});

describe('research lookup route entitlements', () => {
  it.each([
    '/genomics/publication-concepts/search?q=seizure&kind=phenotype',
  ])('denies a direct free-tier request to %s', async (url) => {
    const response = await app.inject({
      method: 'GET',
      url,
      headers: { cookie: authCookie(FREE, prisma) },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      details: {
        entitlement: {
          feature: 'research.search',
          requiredTier: 'premium',
          currentTier: 'free',
        },
      },
    });
  });

  it('allows the deterministic concept resolver for a premium account', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/genomics/publication-concepts/search?q=seizure&kind=phenotype',
      headers: { cookie: authCookie(PREMIUM, prisma) },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ suggestions: [], modelInvoked: false });
  });
});
