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
    'Interpret my variant and tell me my personal risk level.',
    'I am taking warfarin; what dose should I use for my genotype?',
    'What diagnosis fits this patient and these symptoms?',
    'Explain the pharmacogenomic drug implications for my child.',
  ])('blocks personalized clinical generation: %s', (prompt) => {
    expect(isPersonalClinicalPrompt(prompt)).toBe(true);
    expect(publicationBoundaryDecision({ url: '/education/chat', body: {
      messages: [{ role: 'user', content: prompt }],
    } })).toMatchObject({ statusCode: 403 });
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
    ['general genetics lesson', '/education/explain', { topic: 'What is pharmacogenomics?' }],
    ['general PGx mechanism', '/llm/invoke', { prompt: 'Explain how CYP2D6 metabolizer phenotypes are defined.' }],
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
