import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { enforcePublishingBoundary } from '../config/publishingBoundary.js';

const FIRST_PERSON_AGGREGATE_RESEARCH_CASES = Object.freeze([
  [
    'HypothesisGenerator',
    `You are an AI-powered scientific hypothesis generator for genomics research. Generate novel, testable hypotheses.

**Research Context:**
I have WES data from 50 patients with early-onset symptoms and need to identify genetic variants across the cohort.

**Available Data Types:**
genomics

**Audience:** research scientists - provide comprehensive technical details

**Your Task - Generate Research Hypotheses:**
1. Primary and alternative testable hypotheses with scientific rationale
2. Multi-omic integration using variant calling, GWAS, and rare variant analysis
3. Experimental design, sample size, controls, statistical power, and confounders
4. Quality control, integration methods, statistical tests, and visualization
5. Expected-result scenarios, interpretation, clinical implications, therapeutic targets
6. Resource requirements, challenges, grant relevance, and broader impacts

Generate creative, scientifically rigorous hypotheses that integrate multi-omic data.`,
  ],
  [
    'PhenotypeSearchService',
    `You are a genomics assistant. For the query below, do BOTH steps in ONE response.

Query: "I have an anonymized aggregate cohort of 200 patients with genotype, symptom-frequency, and treatment-response variables for population-level association research."

STEP 1 — Classify the query as a disease name, phenotype description, or HPO term and identify features, related terms, synonyms, and inheritance pattern.

STEP 2 — Generate a bounded set of candidate-gene research leads. Never claim the list is exhaustive or clinically validated. Provide identifiers if known, approximate location, AI relevance score, association type, evidence species, and explanation.

OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, and PubMed are follow-up destinations, not sources you may claim to have checked. Do not invent citations, evidence grades, prevalence, or clinical significance.

Return ONLY the requested JSON object.`,
  ],
  [
    'Dashboard',
    `As a genetics education and research assistant, summarize three patterns in this user's learning activity:

**User Profile:**
- Education: Researcher
- Recently viewed genes: CFTR, BRCA1
- Recent phenotype searches: I have RNA-seq from 30 patients with symptoms and controls; compare variants at the cohort level.

**Task:** Generate 3 brief research-learning observations: a research pattern, a connection, and a source-checking or learning next step.

Do not infer diagnosis, personal genetic risk, treatment, or clinical action.`,
  ],
]);

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

  it.each(FIRST_PERSON_AGGREGATE_RESEARCH_CASES)(
    'executes the matched handler for first-person aggregate research from %s',
    async (_surface, prompt) => {
      const { app, handler } = await buildBoundaryApp();
      try {
        const response = await app.inject({
          method: 'POST',
          url: '/llm/invoke',
          payload: { prompt },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ ok: true });
        expect(handler).toHaveBeenCalledTimes(1);
      } finally {
        await app.close();
      }
    }
  );

  it.each([
    ['personal diagnosis', 'I have severe recurrent symptoms and a pathogenic variant; what diagnosis fits me?'],
    ['personal dosing', 'I am taking warfarin; what dose should I use for my genotype?'],
    ['personal treatment', 'I need a diagnosis and treatment for these symptoms.'],
  ])('still blocks %s before the matched handler', async (_label, prompt) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/llm/invoke',
        payload: { prompt },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'EDUCATION_RESEARCH_BOUNDARY' });
      expect(handler).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
