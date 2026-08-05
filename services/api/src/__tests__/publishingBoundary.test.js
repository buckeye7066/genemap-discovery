import { describe, expect, it, vi } from 'vitest';
import {
  HIGH_RISK_CLINICAL_FEATURES_ENABLED,
  PUBLICATION_MODE,
  enforcePublishingBoundary,
  isPersonalClinicalPrompt,
  publicationBoundaryDecision,
} from '../config/publishingBoundary.js';

// These fixtures intentionally preserve the complete request wrappers used by
// the surviving web features. The boundary must classify the embedded user
// intent, not trip over research vocabulary in the surrounding instructions.
const buildHypothesisWrapper = (researchContext) => `You are an AI-powered scientific hypothesis generator for genomics research. Generate novel, testable hypotheses.

**Research Context:**
${researchContext}

**Available Data Types:**
genomics

**Audience:** research scientists - provide comprehensive technical details

**Your Task - Generate Research Hypotheses:**

1. **Primary Hypothesis (H1)**
   - Clear, testable statement
   - Scientific rationale
   - Expected outcome
   - Significance if confirmed

2. **Alternative Hypotheses (H2-H4)**
   - At least 3 alternative hypotheses
   - Each with rationale
   - Competing or complementary to H1

3. **Multi-Omic Integration Strategy**
   For each available data type:

   - **Genomics:** Variant calling, GWAS, rare variant analysis

4. **Experimental Design**
   - Sample size requirements
   - Control groups needed
   - Statistical power considerations
   - Potential confounders

5. **Data Analysis Pipeline**
   Step-by-step analysis workflow:
   - Quality control steps
   - Integration methods
   - Statistical tests
   - Visualization approaches

6. **Expected Results Scenarios**
   - Scenario 1: Hypothesis confirmed
   - Scenario 2: Hypothesis rejected
   - Scenario 3: Mixed/partial results
   - Interpretation for each

7. **Novel Insights & Predictions**
   - What would be discovered if true?
   - Clinical implications
   - Therapeutic targets
   - Future research directions

8. **Resource Requirements**
   - Computational resources
   - Laboratory resources
   - Estimated timeline
   - Collaboration needs

9. **Potential Challenges**
   - Technical limitations
   - Biological confounders
   - Statistical concerns
   - Mitigation strategies

10. **Grant Application Relevance**
    - Alignment with funding priorities
    - Innovation aspects
    - Translational potential
    - Broader impacts

Generate creative, scientifically rigorous hypotheses that integrate multi-omic data.`;

const buildPhenotypeWrapper = (query) => `
You are a genomics assistant. For the query below, do BOTH steps in ONE response.

Query: "${query}"

STEP 1 — Classify the query:
- Is it a disease name (e.g. "Rheumatoid Arthritis", "Trisomy 21", "Cystic Fibrosis")?
- Is it a phenotype description (e.g. "polydactyly", "intellectual disability")?
- Is it an HPO term (starts with "HP:")?
- Identify its main phenotypic features, related HPO terms, synonyms, and — if it is a
  Mendelian disorder — the inheritance pattern.

STEP 2 — Generate candidate-gene research leads for that query:
- If it is a DISEASE: suggest a bounded set of plausible primary, susceptibility,
  modifier, and pathway leads. Never claim the list is exhaustive or clinically validated.
  Return 5-15 genes ranked only by model-estimated relevance to the query.
- If it is a PHENOTYPE or HPO term: find candidate genes associated with these features.
  Return 3-8 model-generated leads for source verification.
- For EACH gene provide: symbol, full name, Entrez ID and Ensembl ID (if known),
  chromosomal location (chromosome + approximate start/end), an AI relevance score (0-1),
  the association type (causative, risk factor, GWAS, pathway), evidence species
  (human, animal, computational, mixed, or unknown), and a brief explanation.

OMIM, ClinVar, GWAS Catalog, DisGeNET, UniProt, HPO, and PubMed are follow-up
destinations, not sources you may claim to have checked. Do not invent citations,
record identifiers, evidence grades, prevalence, or clinical significance. Anchor
the gene list on the ORIGINAL query "${query}" — do NOT fall back to generic famous
genes (BRCA1 / TP53 / APOE) unless they are genuinely relevant.

Return ONLY a JSON object with keys: queryType (string), isDisease (boolean), diseaseName
(string|null), isHPOTerm (boolean), mainFeatures (array of strings), hpoTerms (array of
strings), synonyms (array of strings), inheritancePattern (string|null), and candidateGenes.`;

const buildDashboardWrapper = (searches) => `As a genetics education and research assistant, summarize three patterns in this user's learning activity:

**User Profile:**
- Education: Researcher
- Recently viewed genes: CFTR, BRCA1
- Recent phenotype searches: ${searches.join(', ')}

**Task:** Generate 3 brief research-learning observations (2-3 sentences each):
1. A pattern or trend in their research
2. A connection they might have missed
3. A source-checking or learning next step

Do not infer diagnosis, personal genetic risk, treatment, or clinical action.
Keep each observation under 50 words, practical, and specific to the activity listed.`;

const FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS = Object.freeze([
  'I have WES data from 50 patients with early-onset symptoms and need to identify genetic variants across the cohort.',
  'I have an anonymized aggregate cohort of 200 patients with genotype, symptom-frequency, and treatment-response variables for population-level association research.',
  'I have RNA-seq from 30 patients with symptoms and controls; compare variants at the cohort level.',
  'I have a pilot study with symptom counts and variant annotations for exploratory analysis.',
  'I need help comparing genetic variants across 50 patients in an anonymized cohort.',
  'I need help identifying variants across 50 patients for cohort-level research.',
  'Should I include treatment response as a covariate in this 200-patient cohort study?',
  'I have genotype data from 200 patients and need to compare medication response across the cohort.',
]);

describe('publishable education/research boundary', () => {
  it('is fail-closed in source code rather than controlled by deployment env', () => {
    expect(PUBLICATION_MODE).toBe('education_research');
    expect(HIGH_RISK_CLINICAL_FEATURES_ENABLED).toBe(false);
  });

  it.each([
    '/clinical-trials/search?gene=BRCA1',
    '/clinical-trials/NCT00000000',
    '/genomics/vcf/parse',
    '/genomics/vcf/enrich',
    '/entities/medical-data',
    '/entities/medical-data/record-1',
    '/entities/conversations',
    '/entities/conversations/conversation-1',
  ])('hides high-risk API path %s', (url) => {
    expect(publicationBoundaryDecision({ url, body: {} })).toMatchObject({
      statusCode: 404,
      code: 'FEATURE_NOT_AVAILABLE',
    });
  });

  it.each(['robert', 'Robert', 'anastasia'])('blocks clinical agent %s server-side', (agent) => {
    expect(publicationBoundaryDecision({
      url: '/llm/invoke',
      body: { prompt: 'Explain BRCA1', agent },
    })).toMatchObject({ statusCode: 403, code: 'EDUCATION_RESEARCH_BOUNDARY' });
  });

  it.each([
    'Can you diagnose the symptoms I am experiencing?',
    'Can you diagnose what I am experiencing?',
    'Can you diagnose the problem I have been experiencing?',
    'analyze raw genomic data from Jane Doe.',
    'ANALYZE RAW GENOMIC DATA FROM John Smith.',
    'review raw DNA files from María García.',
    'Calculate the warfarin requirement for my CYP2C9 genotype.',
    'Analyze raw genomic data from Jane Doe, date of birth 1/1/1980.',
    'Assess whether the variant I carry is pathogenic.',
    'Recommend a screening schedule based on the mutation I inherited.',
    'The VCF belongs to me; classify every variant.',
    'Could the medicine I use interact with my CYP2D6 status?',
    'Can you diagnose symptoms I experience?',
    'Classify myself based on my CYP2C9 genotype.',
    'Classify me from BRCA1.',
    'What does my CYP2C9 genotype mean for warfarin?',
    'How should my warfarin change based on CYP2C9?',
    'Interpret raw genomic files from Jane Doe.',
    'Interpret my variant and tell me my personal risk level.',
    'I am taking warfarin; what dose should I use for my genotype?',
    'What diagnosis fits this patient and these symptoms?',
    'Explain the pharmacogenomic drug implications for my child.',
    'I have cancer and want treatment options.',
    'I have diabetes and want medication advice.',
    'I have chest pain; tell me what diagnosis this is.',
    'I have a BRCA1 mutation; how should I be screened?',
    'I need help with these symptoms.',
    'I need symptom help.',
    'I need guidance on this chest pain.',
    'I need to know if BRCA1 means I will get cancer.',
    'I take warfarin; could CYP2C9 change how much I need tonight?',
    'I take warfarin.',
    'I am using warfarin.',
    'I am using a variant-calling method; provide warfarin dosing guidance.',
    'I am using a method to analyze 50 patients; how much warfarin is right for me?',
    'I am using a tool to compare 200 patients; tell me what medicine I should take.',
    'I am using software to model an anonymized cohort; what should I do about my lupus?',
    'Analyzing anonymized variants across this patient cohort of 500 participants; what is the risk for my child?',
    'Compare my treatment-response variables across an anonymized cohort of 200 patients; what is the risk for my child?',
    'My chest hurts. What could it be?',
    'Chest pain—what should I do?',
    'What does my BRCA1 result mean for me?',
    "Could this mutation explain the pain I've been having?",
    'Do these symptoms mean I have cancer?',
    'We have 200 patient records; what treatment should I choose for myself?',
    'I have cancer. What are my options?',
    'I have diabetes. What can I do?',
    'I was told I have lupus.',
    'The doctor says I have MS. What now?',
    'Could my headaches be genetic?',
    'Is BRCA1 why I have breast cancer?',
    'I have two copies of APOE4. What does that mean?',
    'My lab report shows c.68_69delAG; explain it.',
    'I am positive for Factor V Leiden.',
    'I am positive for taking warfarin.',
    'Here are my raw DNA results—what do they mean?',
    'I was told I have raw patient-level WES records from 50 patients and need to compare variants across the cohort.',
    'Analyze these identifiable patient-level genotype records from 50 patients.',
    'We have data from 200 patients; what treatment should I take?',
    'We have data from 200 patients; what treatment should I use?',
    'We have 200 patient records and compare outcomes across the cohort; what treatment should I take?',
    "I've got chest pain; what could be causing it?",
    'I am taking warfarin.',
    'What is the risk for my child?',
    'I have a pilot study and need help interpreting this mutation.',
    'I have an exploratory analysis; explain this genetic variant.',
    'I need help with these symptoms; also identify variants across 50 patients for cohort-level research.',
    'I need help interpreting these variants.',
    'I have genetic variants.',
    'Compare my variants with an aggregate cohort of 200 patients.',
    'Compare variants that came from my anonymized cohort of 200 patients; the VCF belongs to me.',
    'Calculate the warfarin requirement for my CYP2C9 genotype; sequencing depth is part of my study.',
    'Calculate sequencing depth for my study, then the warfarin requirement for my CYP2C9 genotype.',
    'Calculate the sequencing-depth requirement for my genotype study, then recommend a warfarin dose for my CYP2C9 genotype.',
    'Calculate the sequencing-depth requirement for my genotype study, then calculate the warfarin requirement for my CYP2C9 genotype.',
    'Calculate the warfarin requirement for my CYP2C9 genotype, then calculate the sequencing-depth requirement for my genotype study.',
  ])('blocks personalized clinical generation: %s', (prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(true);
    expect(publicationBoundaryDecision({ url: '/education/chat', body: {
      messages: [{ role: 'user', content: prompt }],
    } })).toMatchObject({ statusCode: 403 });
  });

  it.each(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS)(
    'allows first-person ownership of aggregate research data: %s',
    (prompt) => {
      expect(isPersonalClinicalPrompt(prompt)).toBe(false);
      expect(publicationBoundaryDecision({
        url: '/llm/invoke',
        body: { prompt },
      })).toBeNull();
    }
  );

  it('does not let aggregate vocabulary override a later personal-care request', () => {
    const prompt = `${FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[0]} I also have cancer and want treatment options for me.`;
    expect(isPersonalClinicalPrompt(prompt)).toBe(true);
    expect(publicationBoundaryDecision({ url: '/llm/invoke', body: { prompt } })).toMatchObject({
      statusCode: 403,
      code: 'EDUCATION_RESEARCH_BOUNDARY',
    });
  });

  it.each([
    ['HypothesisGenerator', buildHypothesisWrapper(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[0])],
    ['PhenotypeSearchService', buildPhenotypeWrapper(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[1])],
    ['Dashboard', buildDashboardWrapper([FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[2]])],
    ['HypothesisGenerator cohort comparison', buildHypothesisWrapper(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[4])],
    ['HypothesisGenerator cohort help', buildHypothesisWrapper(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[5])],
    ['PhenotypeSearchService cohort covariate', buildPhenotypeWrapper(FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[6])],
    ['Dashboard medication-response cohort', buildDashboardWrapper([FIRST_PERSON_AGGREGATE_RESEARCH_PROMPTS[7]])],
  ])('allows first-person aggregate research inside the complete %s wrapper', (_surface, prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(false);
    expect(publicationBoundaryDecision({ url: '/llm/invoke', body: { prompt } })).toBeNull();
  });

  it.each([
    [
      'HypothesisGenerator WES example',
      buildHypothesisWrapper("We have WES data from 50 patients with early-onset Alzheimer's disease and age-matched controls. We observed elevated expression of inflammatory markers in patients. We want to identify genetic variants that may contribute to neuroinflammation."),
    ],
    [
      'HypothesisGenerator anonymized cohort',
      buildHypothesisWrapper('An anonymized aggregate cohort of 200 patients has genotype, symptom-frequency, and treatment-response variables for population-level association research.'),
    ],
    [
      'PhenotypeSearchService aggregate query',
      buildPhenotypeWrapper('genetic variants reported across patients with early-onset symptoms'),
    ],
    [
      'Dashboard aggregate activity',
      buildDashboardWrapper(['symptoms reported across a 50-patient cohort', 'aggregate genetic variants']),
    ],
  ])('allows complete non-personal research wrapper: %s', (_label, prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(false);
    expect(publicationBoundaryDecision({ url: '/llm/invoke', body: { prompt } })).toBeNull();
  });

  it.each([
    ['HypothesisGenerator dosing request', buildHypothesisWrapper('I am taking warfarin; what dose should I use for my genotype?')],
    ['PhenotypeSearchService personal risk', buildPhenotypeWrapper('What is my risk from this variant?')],
    ['Dashboard family diagnosis', buildDashboardWrapper(['What diagnosis fits my child and these symptoms?'])],
    ['HypothesisGenerator personal symptoms', buildHypothesisWrapper('I have severe recurrent symptoms and a pathogenic variant; what diagnosis fits me?')],
    ['PhenotypeSearchService personal treatment', buildPhenotypeWrapper('I need a diagnosis and treatment for these symptoms.')],
    ['HypothesisGenerator medication disclosure', buildHypothesisWrapper('I am taking warfarin.')],
    ['HypothesisGenerator method-prefaced dosing', buildHypothesisWrapper('I am using a variant-calling method; provide warfarin dosing guidance.')],
    ['HypothesisGenerator mixed method/dosing', buildHypothesisWrapper('I am using a method to analyze 50 patients; how much warfarin is right for me?')],
    ['HypothesisGenerator raw patient-level WES', buildHypothesisWrapper('I was told I have raw patient-level WES records from 50 patients and need to compare variants across the cohort.')],
    ['HypothesisGenerator personalized PGx calculation', buildHypothesisWrapper('Calculate the warfarin requirement for my CYP2C9 genotype.')],
    ['PhenotypeSearchService carried variant', buildPhenotypeWrapper('Assess whether the variant I carry is pathogenic.')],
    ['Dashboard named raw genomic record', buildDashboardWrapper(['Analyze raw genomic data from Jane Doe, date of birth 1/1/1980.'])],
    ['PhenotypeSearchService family risk', buildPhenotypeWrapper('What is the risk for my child?')],
    ['Dashboard symptom guidance', buildDashboardWrapper(['I need guidance on this chest pain.'])],
    ['HypothesisGenerator future disease', buildHypothesisWrapper('I need to know if BRCA1 means I will get cancer.')],
    ['PhenotypeSearchService chest pain', buildPhenotypeWrapper("I've got chest pain; what could be causing it?")],
    ['Dashboard dosing context', buildDashboardWrapper(['I take warfarin; could CYP2C9 change how much I need tonight?'])],
  ])('blocks personal clinical intent inside complete wrapper: %s', (_label, prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(true);
    expect(publicationBoundaryDecision({ url: '/llm/invoke', body: { prompt } })).toMatchObject({
      statusCode: 403,
      code: 'EDUCATION_RESEARCH_BOUNDARY',
    });
  });

  it('uses the matched Fastify route template over an encoded raw URL', () => {
    expect(publicationBoundaryDecision({
      url: '/%6clm/invoke?source=test',
      routeUrl: '/llm/invoke',
      body: { prompt: 'What is my risk from this variant?' },
    })).toMatchObject({ statusCode: 403 });

    expect(publicationBoundaryDecision({
      url: '/clinical%2Dtrials/NCT00000000',
      routeUrl: '/clinical-trials/:trialId',
      body: {},
    })).toMatchObject({ statusCode: 404 });
  });

  it.each([
    ['diagnosis education', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain how clinicians diagnose symptom clusters in a hypothetical case.' }],
    }],
    ['cohort sample-size calculation', '/llm/invoke', {
      prompt: 'Calculate sample-size requirements for my anonymized cohort.',
    }],
    ['anonymized raw genomic research', '/llm/invoke', {
      prompt: 'Analyze raw genomic data from an anonymized aggregate cohort of 200 samples.',
    }],
    ['pathogenicity-classification education', '/education/chat', {
      messages: [{ role: 'user', content: 'Assess how laboratories classify variants as pathogenic using ACMG criteria.' }],
    }],
    ['screening-schedule cohort comparison', '/llm/invoke', {
      prompt: 'Compare screening schedules as an outcome across a 200-patient cohort.',
    }],
    ['VCF-format education', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain the VCF format and how variant classification works.' }],
    }],
    ['general medicine PGx education', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain how medicines can interact with CYP2D6 metabolism.' }],
    }],
    ['diagnosis-method research', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain diagnosis methods for symptom cohorts I analyze.' }],
    }],
    ['anonymized raw-file research', '/llm/invoke', {
      prompt: 'Interpret raw genomic files from an anonymized cohort.',
    }],
    ['general CYP2C9 education', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain CYP2C9 genotype effects on warfarin metabolism.' }],
    }],
    ['genotype-model design', '/llm/invoke', {
      prompt: 'How should my model change based on genotype variables in the cohort?',
    }],
    ['learner self-classification', '/education/chat', {
      messages: [{ role: 'user', content: 'Classify myself by learner level for this genetics lesson.' }],
    }],
    ['learner self-assessment', '/education/chat', {
      messages: [{ role: 'user', content: 'Assess myself as a beginner in this genetics course.' }],
    }],
    ['learner classification source', '/education/chat', {
      messages: [{ role: 'user', content: 'Classify me from the learner rubric.' }],
    }],
    ['aggregate cohort provenance', '/llm/invoke', {
      prompt: 'Compare variants that came from my anonymized cohort of 200 patients.',
    }],
    ['aggregate variants-in-dataset inventory', '/education/chat', {
      messages: [{ role: 'user', content: 'Assess the variants I have in my anonymized cohort of 200 patients.' }],
    }],
    ['aggregate variants-in-data-set inventory', '/llm/invoke', {
      prompt: 'Evaluate mutations I have in an aggregate data set of 50 samples.',
    }],
    ['symptom-lesson learning difficulty', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain symptom classification in this lesson; I am experiencing difficulty with the statistics.' }],
    }],
    ['diagnosis-lesson learning difficulty', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain diagnosis methods in this lesson; I am experiencing difficulty with the statistics.' }],
    }],
    ['genotype-study sequencing requirement', '/llm/invoke', {
      prompt: 'Calculate the sequencing-depth requirement for my genotype study.',
    }],
    ['genotype-study sequencing amount', '/education/chat', {
      messages: [{ role: 'user', content: 'Estimate the amount of sequencing depth for my genotype study.' }],
    }],
    ['upper-case anonymized raw-data research', '/llm/invoke', {
      prompt: 'ANALYZE RAW GENOMIC DATA FROM AN ANONYMIZED COHORT OF 200 SAMPLES.',
    }],
    ['general genetics lesson', '/education/explain', { topic: 'What is pharmacogenomics?' }],
    ['general PGx mechanism', '/llm/invoke', { prompt: 'Explain how CYP2D6 metabolizer phenotypes are defined.' }],
    ['ordinary education wording', '/education/chat', {
      messages: [{ role: 'user', content: 'I take a genetics course and want to understand Mendelian inheritance.' }],
    }],
    ['progressive ordinary education wording', '/education/chat', {
      messages: [{ role: 'user', content: 'I am taking a genetics course and want to understand Mendelian inheritance.' }],
    }],
    ['ordinary research wording', '/llm/invoke', {
      prompt: 'I take notes while reviewing genetic variants across an aggregate cohort.',
    }],
    ['ordinary course shorthand', '/education/chat', {
      messages: [{ role: 'user', content: 'I take this course.' }],
    }],
    ['aggregate medication-response dataset', '/llm/invoke', {
      prompt: 'In my dataset, compare medication response in 200 patients.',
    }],
    ['aggregate research tool usage', '/llm/invoke', {
      prompt: 'I am using this analysis to compare variants across an aggregate cohort.',
    }],
    ['aggregate research model usage', '/education/chat', {
      messages: [{ role: 'user', content: 'I am using a regression model to compare medication response in 200 patients.' }],
    }],
    ['aggregate research method usage', '/llm/invoke', {
      prompt: 'I am using a variant-calling method to compare variants across an anonymized cohort of 50 patients.',
    }],
    ['aggregate treatment endpoint', '/llm/invoke', {
      prompt: 'In a 200-patient study, what treatment should I use as an endpoint for the cohort analysis?',
    }],
    ['figurative engineering pain point', '/education/chat', {
      messages: [{ role: 'user', content: 'This workflow has a pain point; what should I do next to debug it?' }],
    }],
    ['general BRCA1 function question', '/education/chat', {
      messages: [{ role: 'user', content: 'I have a question about BRCA1 gene function.' }],
    }],
    ['reported cohort-model instruction', '/llm/invoke', {
      prompt: 'I was told to compare two cohort models.',
    }],
    ['reported WES research material', '/llm/invoke', {
      prompt: 'I was told I have WES data from 50 patients and need to compare variants across the cohort.',
    }],
    ['doctor-reported cohort material', '/education/chat', {
      messages: [{ role: 'user', content: 'The doctor says I have an anonymized cohort of 200 patients; compare genotype variables at the population level.' }],
    }],
    ['laboratory research description', '/llm/invoke', {
      prompt: 'My lab studies DNA repair in yeast.',
    }],
    ['positive-for research approach', '/education/chat', {
      messages: [{ role: 'user', content: 'I am positive for using a cohort study approach.' }],
    }],
    ['positive-for genetics course', '/education/chat', {
      messages: [{ role: 'user', content: 'I am positive for taking a genetics course.' }],
    }],
    ['aggregate tool with model follow-up', '/education/chat', {
      messages: [{ role: 'user', content: 'I am using a tool to compare 200 patients; what should I do about my model?' }],
    }],
    ['patient-cohort variant analysis', '/llm/invoke', {
      prompt: 'Analyzing anonymized variants across this patient cohort of 500 participants.',
    }],
    ['de-identified result summary', '/education/chat', {
      messages: [{ role: 'user', content: 'Summarize my results for the de-identified cohort of 200 samples.' }],
    }],
    ['anonymized reported WES material', '/llm/invoke', {
      prompt: 'I was told I have anonymized aggregate WES data from 50 patients and need to compare variants across the cohort.',
    }],
    ['patient-level terminology education', '/education/chat', {
      messages: [{ role: 'user', content: 'Explain the difference between patient-level genomic data and population-level aggregate analysis.' }],
    }],
    ['aggregate possessive treatment measure', '/llm/invoke', {
      prompt: 'Compare my treatment-response variables across an anonymized cohort of 200 patients.',
    }],
    ['aggregate possessive variant measure', '/education/chat', {
      messages: [{ role: 'user', content: 'Compare my variant annotations across an anonymized cohort of 200 patients.' }],
    }],
    ['per-patient aggregate measure', '/llm/invoke', {
      prompt: "Model each patient's treatment response as an outcome across the anonymized cohort of 200 participants.",
    }],
    ['non-identifiable cohort material', '/education/chat', {
      messages: [{ role: 'user', content: 'Analyze these non-identifiable patient-level genomic records across an aggregate cohort of 200 participants.' }],
    }],
    ['ordinary note-taking question', '/education/chat', {
      messages: [{ role: 'user', content: 'Should I take notes while learning how variants are classified?' }],
    }],
    ['ordinary course question', '/education/chat', {
      messages: [{ role: 'user', content: 'Should I take a genetics course before studying inheritance?' }],
    }],
    ['ordinary analysis question', '/llm/invoke', {
      prompt: 'Should I stop the analysis and review the cohort design?',
    }],
    ['ordinary sample-size question', '/llm/invoke', {
      prompt: 'Should I increase sample size for this cohort study?',
    }],
    ['aggregate condition-label wording', '/llm/invoke', {
      prompt: 'I have condition labels for 200 patients in an aggregate cohort for population-level association research.',
    }],
    ['less-structured aggregate study', '/llm/invoke', {
      prompt: 'I have a pilot study with symptom counts and variant annotations for exploratory analysis.',
    }],
    ['gene lookup', '/genomics/gene/CFTR', null],
    ['candidate enrichment', '/genomics/enrich', { symbols: ['CFTR'] }],
    ['research project', '/entities/projects', { title: 'CFTR literature review' }],
  ])('allows %s', (_label, url, body) => {
    expect(publicationBoundaryDecision({ url, body })).toBeNull();
  });

  it('returns a structured response without logging sensitive prompt text', async () => {
    const send = vi.fn((payload) => payload);
    const code = vi.fn(() => ({ send }));
    const info = vi.fn();
    const reply = { code };
    const request = {
      raw: { url: '/llm/invoke' },
      body: { prompt: 'Interpret my variant and tell me my risk.' },
      log: { info },
    };

    await enforcePublishingBoundary(request, reply);

    expect(code).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({
      code: 'EDUCATION_RESEARCH_BOUNDARY',
      publicationMode: 'education_research',
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('Interpret my variant');
  });
});
