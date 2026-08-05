import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { enforcePublishingBoundary } from '../config/publishingBoundary.js';

async function buildBoundaryApp() {
  const app = Fastify({ logger: false });
  const handler = vi.fn(async () => ({ ok: true }));

  app.addHook('preHandler', enforcePublishingBoundary);
  // Mirror production's prefix-based route registration so this also proves
  // Fastify exposes the fully prefixed canonical template in routeOptions.url.
  app.register(async (routes) => {
    routes.post('/vcf/parse', handler);
  }, { prefix: '/genomics' });
  app.register(async (routes) => {
    routes.get('/:trialId', handler);
  }, { prefix: '/clinical-trials' });
  app.register(async (routes) => {
    routes.get('/medical-data/:recordId', handler);
    routes.get('/conversations/:conversationId', handler);
  }, { prefix: '/entities' });
  app.register(async (routes) => {
    routes.post('/invoke', handler);
  }, { prefix: '/llm' });
  app.register(async (routes) => {
    routes.post('/chat', handler);
  }, { prefix: '/education' });

  // Exercise the safe raw-URL fallback for paths that Fastify does not match
  // to a concrete template (double encoding, dot segments, or odd casing).
  app.route({ method: ['GET', 'POST'], url: '/*', handler });
  await app.ready();
  return { app, handler };
}

describe('publishing boundary Fastify integration', () => {
  it.each([
    ['encoded VCF letters', 'POST', '/genomics/%76cf/parse'],
    ['encoded clinical-trials letters', 'GET', '/clinical%2Dtrials/NCT00000000'],
    ['encoded medical-data letters', 'GET', '/entities/medical%2Ddata/record-1'],
    ['encoded conversations letters', 'GET', '/entities/convers%61tions/conversation-1'],
  ])('blocks %s before the matched handler', async (_label, method, url) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        code: 'FEATURE_NOT_AVAILABLE',
        publicationMode: 'education_research',
      });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    ['encoded /llm/invoke', '/%6clm/invoke', { prompt: 'What is my risk from this variant?' }],
    ['encoded /education/chat', '/educ%61tion/chat', {
      messages: [{ role: 'user', content: 'I am taking warfarin; what dose should I use?' }],
    }],
  ])('blocks personal intent through %s before the handler', async (_label, url, payload) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({ method: 'POST', url, payload });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        code: 'EDUCATION_RESEARCH_BOUNDARY',
        publicationMode: 'education_research',
      });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    ['dot segments', 'POST', '/safe/../genomics/vcf/parse'],
    ['encoded slash', 'POST', '/genomics%2Fvcf%2Fparse'],
    ['double encoding', 'GET', '/clinical%252Dtrials/NCT00000000'],
    ['query string', 'GET', '/entities/medical-data/record-1?download=true'],
    ['case variation', 'GET', '/ENTITIES/CONVERSATIONS/conversation-1'],
    ['route parameter', 'GET', '/clinical-trials/NCT12345678'],
  ])('fails closed for hidden-path variant: %s', async (_label, method, url) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({ method, url });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    ['dot segments', '/safe/../llm/invoke'],
    ['encoded slash', '/llm%2Finvoke'],
    ['double encoding', '/%256clm/invoke'],
    ['query string', '/llm/invoke?source=direct'],
    ['case variation', '/LLM/INVOKE'],
  ])('fails closed for generation-path variant: %s', async (_label, url) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url,
        payload: { prompt: 'What diagnosis fits my child and these symptoms?' },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'EDUCATION_RESEARCH_BOUNDARY' });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it.each([
    ['hidden path', 'GET', '/clinical-trials/%E0%A4%A'],
    ['generation path', 'POST', '/%6clm/%E0%A4%Ainvoke'],
  ])('lets Fastify reject a malformed escape without executing a handler: %s', async (_label, method, url) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({
        method,
        url,
        payload: method === 'POST'
          ? { prompt: 'What diagnosis fits my child and these symptoms?' }
          : undefined,
      });
      expect(response.statusCode).toBe(400);
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('allows anonymized aggregate research through an encoded generation route', async () => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/%6clm/invoke',
        payload: {
          prompt: 'Compare genetic variants across an anonymized aggregate cohort of 50 patients with early-onset symptoms.',
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
