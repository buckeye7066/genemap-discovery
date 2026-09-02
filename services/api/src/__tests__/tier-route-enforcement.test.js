import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  authCookie,
  buildTestApp,
  createPrismaMock,
  seedAuthUser,
} from './setup.js';

vi.mock('../services/publicationResolvers.js', () => ({
  searchPublicationConcepts: vi.fn(async () => []),
}));

const FREE_USER = {
  userId: 'free-tier-route-user',
  email: 'free-tier-route@example.com',
  role: 'user',
};

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, {
    csrf: false,
    includeAssistants: true,
    includeGenomics: true,
    includeLlm: true,
    includePublicationConcepts: true,
  });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  seedAuthUser(prisma, FREE_USER);
});

const paidRoutes = [
  ['GET', '/entities/search-history', 'research.search', 'premium'],
  ['GET', '/entities/medical-data', 'health.records', 'premium'],
  ['GET', '/entities/conversations', 'assistants.profile_context', 'premium'],
  ['GET', '/entities/gene-sets', 'research.workspace', 'premium'],
  ['GET', '/entities/projects', 'research.workspace', 'premium'],
  ['GET', '/entities/licenses', 'institution.manage', 'institutional'],
  ['GET', '/genomics/phenotype/search?q=seizure', 'genomics.tools', 'premium'],
  ['GET', '/genomics/publication-concepts/search?q=seizure&kind=phenotype', 'research.search', 'premium'],
  ['POST', '/llm/invoke', 'research.ai', 'premium'],
  ['POST', '/assistants/anastasia/chat', 'assistants.profile_context', 'premium'],
];

describe('paid route enforcement sweep', () => {
  it.each(paidRoutes)('%s %s rejects a direct free-tier call', async (method, url, feature, requiredTier) => {
    const response = await app.inject({
      method,
      url,
      headers: { cookie: authCookie(FREE_USER, prisma) },
      payload: method === 'POST' ? {} : undefined,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      details: {
        entitlement: {
          feature,
          requiredTier,
          currentTier: 'free',
        },
      },
    });
  });
});
