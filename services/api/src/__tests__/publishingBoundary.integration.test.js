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
  [
    'less-structured pilot study',
    'I have a pilot study with symptom counts and variant annotations for exploratory analysis.',
  ],
]);

const DIRECT_PERSONAL_CARE_CASES = Object.freeze([
  ['second-person symptom diagnosis', 'Can you diagnose the symptoms I am experiencing?'],
  ['diagnosis of personal experience', 'Can you diagnose what I am experiencing?'],
  ['diagnosis of described personal problem', 'Can you diagnose the problem I have been experiencing?'],
  ['lower-case named raw genomic record', 'analyze raw genomic data from Jane Doe.'],
  ['upper-case named raw genomic record', 'ANALYZE RAW GENOMIC DATA FROM John Smith.'],
  ['upper-case acronym named raw genomic files', 'review raw DNA files from María García.'],
  ['imperative personalized warfarin calculation', 'Calculate the warfarin requirement for my CYP2C9 genotype.'],
  ['named raw genomic record', 'Analyze raw genomic data from Jane Doe, date of birth 1/1/1980.'],
  ['carried variant pathogenicity', 'Assess whether the variant I carry is pathogenic.'],
  ['inherited mutation screening', 'Recommend a screening schedule based on the mutation I inherited.'],
  ['owned VCF classification', 'The VCF belongs to me; classify every variant.'],
  ['personal medicine PGx interaction', 'Could the medicine I use interact with my CYP2D6 status?'],
  ['compact symptom diagnosis', 'Can you diagnose symptoms I experience?'],
  ['clinical self-classification', 'Classify myself based on my CYP2C9 genotype.'],
  ['gene-symbol self-classification', 'Classify me from BRCA1.'],
  ['personal PGx interpretation', 'What does my CYP2C9 genotype mean for warfarin?'],
  ['personal medication adjustment', 'How should my warfarin change based on CYP2C9?'],
  ['named raw genomic files', 'Interpret raw genomic files from Jane Doe.'],
  ['cancer treatment', 'I have cancer and want treatment options.'],
  ['diabetes medication', 'I have diabetes and want medication advice.'],
  ['chest-pain diagnosis', 'I have chest pain; tell me what diagnosis this is.'],
  ['BRCA1 screening', 'I have a BRCA1 mutation; how should I be screened?'],
  ['symptom help', 'I need help with these symptoms.'],
  ['short symptom help', 'I need symptom help.'],
  ['chest-pain guidance', 'I need guidance on this chest pain.'],
  ['future disease risk', 'I need to know if BRCA1 means I will get cancer.'],
  ['warfarin amount', 'I take warfarin; could CYP2C9 change how much I need tonight?'],
  ['bare medication disclosure', 'I take warfarin.'],
  ['using medication disclosure', 'I am using warfarin.'],
  ['method preface with personal dosing', 'I am using a variant-calling method; provide warfarin dosing guidance.'],
  ['aggregate method preface with personal amount', 'I am using a method to analyze 50 patients; how much warfarin is right for me?'],
  ['aggregate tool preface with personal medicine', 'I am using a tool to compare 200 patients; tell me what medicine I should take.'],
  ['aggregate software preface with personal condition', 'I am using software to model an anonymized cohort; what should I do about my lupus?'],
  ['aggregate patient cohort with family risk', 'Analyzing anonymized variants across this patient cohort of 500 participants; what is the risk for my child?'],
  ['aggregate measure plus family risk', 'Compare my treatment-response variables across an anonymized cohort of 200 patients; what is the risk for my child?'],
  ['personal chest complaint', 'My chest hurts. What could it be?'],
  ['direct chest-pain action', 'Chest pain—what should I do?'],
  ['personal BRCA1 result', 'What does my BRCA1 result mean for me?'],
  ['variant-symptom link', "Could this mutation explain the pain I've been having?"],
  ['symptom-diagnosis question', 'Do these symptoms mean I have cancer?'],
  ['aggregate preface with personal treatment', 'We have 200 patient records; what treatment should I choose for myself?'],
  ['unspecified cancer care', 'I have cancer. What are my options?'],
  ['unspecified diabetes care', 'I have diabetes. What can I do?'],
  ['reported lupus condition', 'I was told I have lupus.'],
  ['doctor-reported MS condition', 'The doctor says I have MS. What now?'],
  ['personal hereditary symptom', 'Could my headaches be genetic?'],
  ['gene-personal condition causation', 'Is BRCA1 why I have breast cancer?'],
  ['personal APOE4 copy result', 'I have two copies of APOE4. What does that mean?'],
  ['personal lab report', 'My lab report shows c.68_69delAG; explain it.'],
  ['positive test result', 'I am positive for Factor V Leiden.'],
  ['positive-for medication disclosure', 'I am positive for taking warfarin.'],
  ['raw DNA result interpretation', 'Here are my raw DNA results—what do they mean?'],
  ['raw patient-level WES records', 'I was told I have raw patient-level WES records from 50 patients and need to compare variants across the cohort.'],
  ['identifiable patient-level genotype records', 'Analyze these identifiable patient-level genotype records from 50 patients.'],
  ['aggregate preface with treatment to take', 'We have data from 200 patients; what treatment should I take?'],
  ['aggregate preface with treatment to use', 'We have data from 200 patients; what treatment should I use?'],
  ['aggregate boilerplate with personal treatment', 'We have 200 patient records and compare outcomes across the cohort; what treatment should I take?'],
  ['chest-pain cause', "I've got chest pain; what could be causing it?"],
  ['medication disclosure', 'I am taking warfarin.'],
  ['family risk', 'What is the risk for my child?'],
  ['research-prefixed personal mutation', 'I have a pilot study and need help interpreting this mutation.'],
  ['research-prefixed personal variant', 'I have an exploratory analysis; explain this genetic variant.'],
  ['personal help plus cohort boilerplate', 'I need help with these symptoms; also identify variants across 50 patients for cohort-level research.'],
  ['variant help', 'I need help interpreting these variants.'],
  ['personal genetic variants', 'I have genetic variants.'],
  ['personal variants compared with cohort', 'Compare my variants with an aggregate cohort of 200 patients.'],
  ['aggregate provenance plus owned VCF', 'Compare variants that came from my anonymized cohort of 200 patients; the VCF belongs to me.'],
  ['research-vocabulary personal dose calculation', 'Calculate the warfarin requirement for my CYP2C9 genotype; sequencing depth is part of my study.'],
  ['research-calculation preface plus personal requirement', 'Calculate sequencing depth for my study, then the warfarin requirement for my CYP2C9 genotype.'],
  ['research requirement plus personal dose', 'Calculate the sequencing-depth requirement for my genotype study, then recommend a warfarin dose for my CYP2C9 genotype.'],
  ['research requirement plus personal requirement', 'Calculate the sequencing-depth requirement for my genotype study, then calculate the warfarin requirement for my CYP2C9 genotype.'],
  ['personal requirement plus research requirement', 'Calculate the warfarin requirement for my CYP2C9 genotype, then calculate the sequencing-depth requirement for my genotype study.'],
]);

const AGGREGATE_RESEARCH_CASES = Object.freeze([
  ['diagnosis education', 'Explain how clinicians diagnose symptom clusters in a hypothetical case.'],
  ['cohort sample-size calculation', 'Calculate sample-size requirements for my anonymized cohort.'],
  ['anonymized raw genomic research', 'Analyze raw genomic data from an anonymized aggregate cohort of 200 samples.'],
  ['pathogenicity-classification education', 'Assess how laboratories classify variants as pathogenic using ACMG criteria.'],
  ['screening-schedule cohort comparison', 'Compare screening schedules as an outcome across a 200-patient cohort.'],
  ['VCF-format education', 'Explain the VCF format and how variant classification works.'],
  ['general medicine PGx education', 'Explain how medicines can interact with CYP2D6 metabolism.'],
  ['diagnosis-method research', 'Explain diagnosis methods for symptom cohorts I analyze.'],
  ['anonymized raw-file research', 'Interpret raw genomic files from an anonymized cohort.'],
  ['general CYP2C9 education', 'Explain CYP2C9 genotype effects on warfarin metabolism.'],
  ['genotype-model design', 'How should my model change based on genotype variables in the cohort?'],
  ['exact WES cohort prompt', 'I have WES data from 50 patients with early-onset symptoms and need to identify genetic variants across the cohort.'],
  ['exact anonymized genotype cohort prompt', 'I have an anonymized aggregate cohort of 200 patients with genotype, symptom-frequency, and treatment-response variables for population-level association research.'],
  ['exact RNA-seq cohort prompt', 'I have RNA-seq from 30 patients with symptoms and controls; compare variants at the cohort level.'],
  ['cohort variant help', 'I need help comparing genetic variants across 50 patients in an anonymized cohort.'],
  ['cohort help request', 'I need help identifying variants across 50 patients for cohort-level research.'],
  ['cohort covariate question', 'Should I include treatment response as a covariate in this 200-patient cohort study?'],
  ['cohort medication-response analysis', 'I have genotype data from 200 patients and need to compare medication response across the cohort.'],
  ['cohort treatment endpoint', 'In a 200-patient study, what treatment should I use as an endpoint for the cohort analysis?'],
  ['figurative engineering pain point', 'This workflow has a pain point; what should I do next to debug it?'],
  ['general BRCA1 function question', 'I have a question about BRCA1 gene function.'],
  ['reported cohort-model instruction', 'I was told to compare two cohort models.'],
  ['reported WES research material', 'I was told I have WES data from 50 patients and need to compare variants across the cohort.'],
  ['doctor-reported cohort material', 'The doctor says I have an anonymized cohort of 200 patients; compare genotype variables at the population level.'],
  ['laboratory research description', 'My lab studies DNA repair in yeast.'],
  ['positive-for research approach', 'I am positive for using a cohort study approach.'],
  ['aggregate tool with model follow-up', 'I am using a tool to compare 200 patients; what should I do about my model?'],
  ['patient-cohort variant analysis', 'Analyzing anonymized variants across this patient cohort of 500 participants.'],
  ['de-identified result summary', 'Summarize my results for the de-identified cohort of 200 samples.'],
  ['anonymized reported WES material', 'I was told I have anonymized aggregate WES data from 50 patients and need to compare variants across the cohort.'],
  ['patient-level terminology education', 'Explain the difference between patient-level genomic data and population-level aggregate analysis.'],
  ['aggregate possessive treatment measure', 'Compare my treatment-response variables across an anonymized cohort of 200 patients.'],
  ['aggregate possessive variant measure', 'Compare my variant annotations across an anonymized cohort of 200 patients.'],
  ['per-patient aggregate measure', "Model each patient's treatment response as an outcome across the anonymized cohort of 200 participants."],
  ['non-identifiable cohort material', 'Analyze these non-identifiable patient-level genomic records across an aggregate cohort of 200 participants.'],
  ['learner self-classification', 'Classify myself by learner level for this genetics lesson.'],
  ['learner self-assessment', 'Assess myself as a beginner in this genetics course.'],
  ['learner classification source', 'Classify me from the learner rubric.'],
  ['aggregate cohort provenance', 'Compare variants that came from my anonymized cohort of 200 patients.'],
  ['aggregate variants-in-dataset inventory', 'Assess the variants I have in my anonymized cohort of 200 patients.'],
  ['aggregate variants-in-data-set inventory', 'Evaluate mutations I have in an aggregate data set of 50 samples.'],
  ['symptom-lesson learning difficulty', 'Explain symptom classification in this lesson; I am experiencing difficulty with the statistics.'],
  ['diagnosis-lesson learning difficulty', 'Explain diagnosis methods in this lesson; I am experiencing difficulty with the statistics.'],
  ['genotype-study sequencing requirement', 'Calculate the sequencing-depth requirement for my genotype study.'],
  ['genotype-study sequencing amount', 'Estimate the amount of sequencing depth for my genotype study.'],
  ['upper-case anonymized raw-data research', 'ANALYZE RAW GENOMIC DATA FROM AN ANONYMIZED COHORT OF 200 SAMPLES.'],
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

  it.each(DIRECT_PERSONAL_CARE_CASES.flatMap(([label, prompt]) => [
    [label, '/llm/invoke', { prompt }],
    [label, '/education/chat', { messages: [{ role: 'user', content: prompt }] }],
  ]))('blocks %s end-to-end on %s without executing the handler', async (_label, url, payload) => {
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

  it.each(AGGREGATE_RESEARCH_CASES.flatMap(([label, prompt]) => [
    [label, '/llm/invoke', { prompt }],
    [label, '/education/chat', { messages: [{ role: 'user', content: prompt }] }],
  ]))('allows %s end-to-end on %s and executes the handler', async (_label, url, payload) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({ method: 'POST', url, payload });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it.each([
    ['education course', 'I take a genetics course and want to understand Mendelian inheritance.'],
    ['progressive education course', 'I am taking a genetics course and want to understand Mendelian inheritance.'],
    ['research notes', 'I take notes while reviewing genetic variants across an aggregate cohort.'],
    ['course shorthand', 'I take this course.'],
    ['aggregate medication-response dataset', 'In my dataset, compare medication response in 200 patients.'],
    ['aggregate research tool usage', 'I am using this analysis to compare variants across an aggregate cohort.'],
    ['aggregate research model usage', 'I am using a regression model to compare medication response in 200 patients.'],
    ['aggregate research method usage', 'I am using a variant-calling method to compare variants across an anonymized cohort of 50 patients.'],
    ['reported WES research material', 'I was told I have WES data from 50 patients and need to compare variants across the cohort.'],
    ['doctor-reported cohort material', 'The doctor says I have an anonymized cohort of 200 patients; compare genotype variables at the population level.'],
    ['positive-for research approach', 'I am positive for using a cohort study approach.'],
    ['positive-for genetics course', 'I am positive for taking a genetics course.'],
    ['aggregate tool with model follow-up', 'I am using a tool to compare 200 patients; what should I do about my model?'],
    ['patient-cohort variant analysis', 'Analyzing anonymized variants across this patient cohort of 500 participants.'],
    ['de-identified result summary', 'Summarize my results for the de-identified cohort of 200 samples.'],
    ['anonymized reported WES material', 'I was told I have anonymized aggregate WES data from 50 patients and need to compare variants across the cohort.'],
    ['patient-level terminology education', 'Explain the difference between patient-level genomic data and population-level aggregate analysis.'],
    ['aggregate possessive treatment measure', 'Compare my treatment-response variables across an anonymized cohort of 200 patients.'],
    ['aggregate possessive variant measure', 'Compare my variant annotations across an anonymized cohort of 200 patients.'],
    ['per-patient aggregate measure', "Model each patient's treatment response as an outcome across the anonymized cohort of 200 participants."],
    ['non-identifiable cohort material', 'Analyze these non-identifiable patient-level genomic records across an aggregate cohort of 200 participants.'],
    ['note-taking question', 'Should I take notes while learning how variants are classified?'],
    ['education question', 'Should I take a genetics course before studying inheritance?'],
    ['analysis question', 'Should I stop the analysis and review the cohort design?'],
    ['research-design question', 'Should I increase sample size for this cohort study?'],
    ['condition labels', 'I have condition labels for 200 patients in an aggregate cohort for population-level association research.'],
    ['less-structured pilot study', 'I have a pilot study with symptom counts and variant annotations for exploratory analysis.'],
  ])('allows ordinary non-clinical research wording from %s', async (_label, prompt) => {
    const { app, handler } = await buildBoundaryApp();
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/education/chat',
        payload: { messages: [{ role: 'user', content: prompt }] },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
      expect(handler).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });
});
