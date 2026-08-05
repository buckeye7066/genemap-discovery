import Fastify from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PUBLICATION_TASKS,
  PUBLICATION_TASK_VALUES,
  enforcePublishingBoundary,
} from '../config/publishingBoundary.js';

const MANDATED_AGGREGATE_PROMPTS = Object.freeze([
  'I have WES data from 50 patients with early-onset symptoms and need to identify genetic variants across the cohort.',
  'I have an anonymized aggregate cohort of 200 patients with genotype, symptom-frequency, and treatment-response variables for population-level association research.',
  'I have RNA-seq from 30 patients with symptoms and controls; compare variants at the cohort level.',
]);

const buildHypothesisWrapper = (context) => `You are an AI-powered scientific hypothesis generator for genomics research. Generate novel, testable hypotheses.

**Research Context:**
${context}

**Available Data Types:**
genomics

**Audience:** research scientists - provide comprehensive technical details

**Your Task - Generate Research Hypotheses:**
1. **Primary Hypothesis (H1)** with a testable statement, rationale, expected outcome, and significance
2. **Alternative Hypotheses (H2-H4)** with competing or complementary rationales
3. **Multi-Omic Integration Strategy** using variant calling, GWAS, and rare variant analysis
4. **Experimental Design** with sample size, controls, statistical power, and confounders
5. **Data Analysis Pipeline** with quality control, integration, statistical tests, and visualization
6. **Expected Results Scenarios** with interpretation
7. **Novel Insights & Predictions**, clinical implications, therapeutic targets, and future research
8. **Resource Requirements**
9. **Potential Challenges** and mitigations
10. **Grant Application Relevance**

Generate creative, scientifically rigorous hypotheses that integrate multi-omic data.`;

const buildPhenotypeWrapper = (query) => `You are a genomics assistant.
Query: "${query}"
STEP 1 — Classify the query as a disease name, phenotype description, or HPO term and identify features, related terms, synonyms, and inheritance pattern.
STEP 2 — Generate a bounded set of candidate-gene research leads. Never claim the list is exhaustive or clinically validated. Provide identifiers if known, approximate location, AI relevance score, association type, evidence species, and explanation.
OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, and PubMed are follow-up destinations, not sources you may claim to have checked. Do not invent citations, evidence grades, prevalence, or clinical significance.
Return ONLY the requested JSON object.`;

const buildDashboardWrapper = (search) => `As a genetics education and research assistant, summarize patterns in this user's learning activity.
Recent phenotype searches: ${search}
Generate three brief research-learning observations. Do not infer diagnosis, personal genetic risk, treatment, or clinical action.`;

const ALLOWED_CASES = Object.freeze([
  ...MANDATED_AGGREGATE_PROMPTS.map((prompt) => ({
    label: 'mandated aggregate workflow',
    task: PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH,
    prompt,
  })),
  {
    label: 'aggregate covariate design',
    task: PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH,
    prompt: 'Should I include treatment response as a covariate in this 200-patient cohort study?',
  },
  {
    label: 'aggregate medication-response analysis',
    task: PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH,
    prompt: 'In my dataset, compare medication response in 200 patients across the cohort.',
  },
  {
    label: 'deidentified raw cohort data',
    task: PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH,
    prompt: 'Analyze raw genomic data from an anonymized aggregate cohort of 200 samples.',
  },
  {
    label: 'generic genetics education',
    task: PUBLICATION_TASKS.GENETICS_EDUCATION,
    prompt: 'Explain how CYP2C9 affects warfarin metabolism in general pharmacogenomics education.',
  },
  {
    label: 'non-medication taking phrase',
    task: PUBLICATION_TASKS.GENETICS_EDUCATION,
    prompt: 'I take this course; explain how BRCA1 functions in DNA repair.',
  },
  {
    label: 'complete HypothesisGenerator wrapper',
    task: PUBLICATION_TASKS.RESEARCH_HYPOTHESIS,
    prompt: buildHypothesisWrapper(MANDATED_AGGREGATE_PROMPTS[0]),
  },
  {
    label: 'complete PhenotypeSearchService wrapper',
    task: PUBLICATION_TASKS.CANDIDATE_GENE_RESEARCH,
    prompt: buildPhenotypeWrapper(MANDATED_AGGREGATE_PROMPTS[1]),
  },
  {
    label: 'candidate educational-question wrapper',
    task: PUBLICATION_TASKS.CANDIDATE_GENE_RESEARCH,
    prompt: buildPhenotypeWrapper('I have a question about BRCA1 gene function.'),
  },
  {
    label: 'non-human lab hypothesis wrapper',
    task: PUBLICATION_TASKS.RESEARCH_HYPOTHESIS,
    prompt: buildHypothesisWrapper('My lab studies DNA repair in yeast using synthetic reporter constructs.'),
  },
  {
    label: 'complete Dashboard wrapper',
    task: PUBLICATION_TASKS.LEARNING_ACTIVITY_SUMMARY,
    prompt: buildDashboardWrapper(MANDATED_AGGREGATE_PROMPTS[2]),
  },
]);

const BLOCKED_CASES = Object.freeze([
  ['first-person care', 'I have cancer and want treatment options.'],
  ['unknown condition', 'I have lupus. What can I do?'],
  ['reported condition', 'The doctor says I have MS. What now?'],
  ['contraction', "I've got chest pain; what could be causing it?"],
  ['second-person diagnosis', 'Can you diagnose the symptoms I am experiencing?'],
  ['imperative diagnosis', 'Diagnose these symptoms and tell me the likely condition.'],
  ['personal result', 'What does my BRCA1 result mean for me?'],
  ['second-person result', 'Explain your BRCA1 result and your risk.'],
  ['personal variant', 'Assess whether the variant I carry is pathogenic.'],
  ['owned VCF', 'The VCF belongs to me; classify every variant.'],
  ['family risk', 'What is the risk for my child?'],
  ['symptom guidance', 'Chest pain—what should I do?'],
  ['personal PGx', 'Could the medicine I use interact with my CYP2D6 status?'],
  ['personal dose', 'Calculate the warfarin requirement for my CYP2C9 genotype.'],
  ['dose without pronoun', 'Calculate a warfarin dose for CYP2C9 poor-metabolizer status.'],
  ['medication disclosure', 'I am taking warfarin.'],
  ['personal result report', 'My lab report shows c.68_69delAG; explain it.'],
  ['raw DNA result', 'Here are my raw DNA results—what do they mean?'],
  ['named raw genomics', 'Analyze raw genomic data from Jane Doe.'],
  ['initialed named raw genomics', 'Analyze raw genomic data from J. Doe.'],
  ['middle-initial raw genomics', 'Analyze raw genomic data from Jane Q. Doe.'],
  ['role-named raw genomics', 'Analyze raw genomic data from Patient Smith.'],
  ['plural patient records', 'Analyze raw genomic data from patient records.'],
  ['identifiable records', 'Analyze these identifiable patient-level genotype records from 50 patients.'],
  ['raw genomics with identifier', 'Analyze raw genomic data from Jane Doe, date of birth 1/1/1980.'],
  ['safe then named raw source', 'Analyze raw genomic data from an anonymized cohort, then analyze raw genomic data from Jane Doe.'],
  ['aggregate then personal', 'We have 200 patient records; what treatment should I choose for myself?'],
  ['personal then aggregate', 'I need help with these symptoms; also identify variants across 50 patients for cohort-level research.'],
  ['aggregate plus family', 'Compare variants across an anonymized cohort of 200 patients; what is the risk for my child?'],
  ['aggregate plus personal VCF', 'Compare variants from an anonymized cohort of 200 patients; the VCF belongs to me.'],
  ['personal dose before aggregate', 'Calculate my warfarin dose from CYP2C9; then compare outcomes across 200 patients.'],
  ['aggregate before personal dose', 'Compare outcomes across 200 patients; calculate my warfarin dose from CYP2C9.'],
  ['self classification', 'Classify me, based on BRCA1.'],
]);

function payloadFor(path, prompt, task) {
  if (path === '/education/chat') {
    return {
      messages: [{ role: 'user', content: prompt }],
      level: 'undergraduate',
      publicationTask: task,
    };
  }
  return { prompt, options: { publicationTask: task } };
}

async function buildBoundaryApp() {
  const app = Fastify({ logger: false });
  const handler = vi.fn(async () => ({ ok: true }));

  app.addHook('preHandler', enforcePublishingBoundary);
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
    routes.post('/chat', handler);
    routes.post('/image', handler);
  }, { prefix: '/llm' });
  app.register(async (routes) => {
    routes.post('/chat', handler);
    routes.post('/explain', handler);
    routes.post('/quiz', handler);
    routes.post('/image', handler);
    routes.get('/topics', handler);
  }, { prefix: '/education' });

  // Proves raw-URL fallback behavior for paths that do not match a concrete
  // Fastify template (double encoding, dot segments, casing, malformed input).
  app.route({ method: ['GET', 'POST'], url: '/*', handler });
  await app.ready();
  return { app, handler };
}

describe('publishing boundary Fastify integration', () => {
  let app;
  let handler;

  beforeAll(async () => {
    ({ app, handler } = await buildBoundaryApp());
  });

  beforeEach(() => handler.mockClear());
  afterAll(async () => app.close());

  it.each([
    ['encoded VCF letters', 'POST', '/genomics/%76cf/parse'],
    ['encoded clinical-trials letters', 'GET', '/clinical%2Dtrials/NCT00000000'],
    ['encoded medical-data letters', 'GET', '/entities/medical%2Ddata/record-1'],
    ['encoded conversations letters', 'GET', '/entities/convers%61tions/conversation-1'],
    ['dot segments', 'POST', '/safe/../genomics/vcf/parse'],
    ['encoded slash', 'POST', '/genomics%2Fvcf%2Fparse'],
    ['double encoding', 'GET', '/clinical%252Dtrials/NCT00000000'],
    ['double-encoded slash', 'POST', '/genomics%252Fvcf%252Fparse'],
    ['query string', 'GET', '/entities/medical-data/record-1?download=true'],
    ['case variation', 'GET', '/ENTITIES/CONVERSATIONS/conversation-1'],
    ['route parameter', 'GET', '/clinical-trials/NCT12345678'],
  ])('blocks hidden-path variant before handler: %s', async (_label, method, url) => {
    const response = await app.inject({ method, url });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
    expect(handler).not.toHaveBeenCalled();
  });

  it.each([
    ['encoded /llm/invoke', '/%6clm/invoke'],
    ['dot segments', '/safe/../llm/invoke'],
    ['encoded slash', '/llm%2Finvoke'],
    ['double encoding', '/%256clm/invoke'],
    ['query string', '/llm/invoke?source=direct'],
    ['case variation', '/LLM/INVOKE'],
  ])('enforces task/content policy through generation-path variant: %s', async (_label, url) => {
    const response = await app.inject({
      method: 'POST',
      url,
      payload: payloadFor('/llm/invoke', 'What does my BRCA1 result mean for me?', PUBLICATION_TASKS.GENETICS_EDUCATION),
    });
    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'EDUCATION_RESEARCH_BOUNDARY' });
    expect(handler).not.toHaveBeenCalled();
  });

  it('handles malformed encoding without executing a handler', async () => {
    const response = await app.inject({ method: 'GET', url: '/clinical%ZZtrials/NCT1' });
    expect([400, 404]).toContain(response.statusCode);
    expect(handler).not.toHaveBeenCalled();
  });

  it.each(['/llm/invoke', '/llm/chat', '/education/chat'])(
    'rejects missing and unknown tasks before %s handler',
    async (url) => {
      const prompt = 'Explain BRCA1 gene function for genetics education.';
      const missing = url === '/llm/invoke'
        ? { prompt }
        : { messages: [{ role: 'user', content: prompt }], level: 'undergraduate' };
      let response = await app.inject({ method: 'POST', url, payload: missing });
      expect(response.statusCode).toBe(403);
      expect(handler).not.toHaveBeenCalled();

      handler.mockClear();
      const unknown = url === '/llm/invoke'
        ? { ...missing, options: { publicationTask: 'unknown_task' } }
        : { ...missing, publicationTask: 'unknown_task' };
      response = await app.inject({ method: 'POST', url, payload: unknown });
      expect(response.statusCode).toBe(403);
      expect(handler).not.toHaveBeenCalled();
    }
  );

  for (const path of ['/llm/invoke', '/education/chat']) {
    it.each(ALLOWED_CASES)(`executes allowed ${path} wrapper: $label`, async ({ task, prompt }) => {
      const response = await app.inject({
        method: 'POST',
        url: path,
        payload: payloadFor(path, prompt, task),
      });
      expect(response.statusCode).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
    });

    for (const task of PUBLICATION_TASK_VALUES) {
      it.each(BLOCKED_CASES)(
        `does not execute ${path} for %s labeled ${task}`,
        async (_label, prompt) => {
          const response = await app.inject({
            method: 'POST',
            url: path,
            payload: payloadFor(path, prompt, task),
          });
          expect(response.statusCode).toBe(403);
          expect(response.json()).toMatchObject({ code: 'EDUCATION_RESEARCH_BOUNDARY' });
          expect(handler).not.toHaveBeenCalled();
        }
      );
    }
  }

  it('allows server-owned fixed education task and safe read routes', async () => {
    let response = await app.inject({
      method: 'POST',
      url: '/education/explain',
      payload: { topic: 'DNA inheritance', level: 'undergraduate' },
    });
    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledOnce();

    handler.mockClear();
    response = await app.inject({ method: 'GET', url: '/education/topics' });
    expect(response.statusCode).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
  });

  it('blocks personal content even on a server-owned education route', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/education/quiz',
      payload: { topic: 'What does my BRCA1 result mean for me?', level: 'undergraduate' },
    });
    expect(response.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });

  it('does not expose raw /llm image generation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/llm/image',
      payload: {
        prompt: 'Create a DNA education diagram.',
        options: { publicationTask: PUBLICATION_TASKS.GENETICS_EDUCATION },
      },
    });
    expect(response.statusCode).toBe(403);
    expect(handler).not.toHaveBeenCalled();
  });
});
