import { describe, expect, it } from 'vitest';
import {
  sanitizePublicationTaskOutput,
  __test,
} from '../services/publicationTaskOutput.js';

const TASK = 'candidate_gene_research';
const RESEARCH_TASK = 'research_hypothesis';
const AGGREGATE_TASK = 'aggregate_genomics_research';
const LEARNING_TASK = 'learning_activity_summary';
const DISEASE_QUERY = {
  kind: 'curated_concept',
  conceptId: 'disease:cystic-fibrosis',
  canonicalLabel: 'Cystic Fibrosis',
  conceptKind: 'disease',
  source: 'genemap_curated',
  version: 1,
};
const PHENOTYPE_QUERY = {
  kind: 'curated_concept',
  conceptId: 'phenotype:seizures',
  canonicalLabel: 'seizures',
  conceptKind: 'phenotype',
  source: 'genemap_curated',
  version: 1,
};
const HPO_QUERY = {
  kind: 'hpo',
  identifier: 'HP:0001250',
  canonicalLabel: 'Seizure',
  source: 'NLM Clinical Tables HPO',
  apiVersion: 'v3',
  obsolete: false,
};

function sanitize(operation, result, query = DISEASE_QUERY) {
  const taskInput = operation === 'gene_profile'
    ? { operation }
    : { operation, query };
  return sanitizePublicationTaskOutput(TASK, taskInput, result);
}

function expectPublication(publication, {
  status = 'available',
  reasonCode = status === 'available' ? null : undefined,
} = {}) {
  expect(publication).toMatchObject({
    contractVersion: 1,
    status,
    correlationId: 'legacy-publication-boundary',
  });
  if (reasonCode !== undefined) expect(publication.reasonCode).toBe(reasonCode);
  if (status === 'available') expect(publication.limitations).toEqual([]);
  return publication.content;
}

describe('sanitizePublicationTaskOutput', () => {
  it('normalizes, deduplicates, bounds, and narrows candidate-gene output', () => {
    const generated = Array.from({ length: 20 }, (_, index) => ({
      symbol: `g${index + 10}`,
      name: `Gene ${index}\nname`,
      explanation: `Candidate ${index}\u0000 explanation`,
      score: 0.99,
      chromosome: 'AI guess',
      directLink: 'javascript:alert(1)',
    }));
    generated.splice(1, 0,
      { symbol: 'cftr', name: ' CFTR ', explanation: '  channel\nlead  ', score: 1 },
      { symbol: 'CFTR', name: 'duplicate' },
      { symbol: 'A', name: 'too short for the publication gene-symbol contract' },
      { symbol: { nested: true } },
      null,
    );

    const publication = sanitize('classify_and_suggest', `
      Here is the requested JSON:
      \`\`\`json
      ${JSON.stringify({
        // Contradictory model classification must not override the trusted query.
        queryType: 'phenotype',
        isDisease: false,
        diseaseName: 'Invented model label',
        isHPOTerm: true,
        mainFeatures: ['lung disease', 'lung disease', { unsafe: true }, 'sweat chloride'],
        synonyms: ['CF', 'CF', '\u0000'],
        inheritancePattern: ' autosomal\nrecessive ',
        hpoTerms: ['HP:MODEL-GUESS'],
        candidateGenes: generated,
      })}
      \`\`\`
    `);

    const result = expectPublication(publication);
    expect(result.queryType).toBe('disease');
    expect(result.isDisease).toBe(true);
    expect(result.isHPOTerm).toBe(false);
    expect(result.diseaseName).toBe('Cystic Fibrosis');
    expect(result.mainFeatures).toEqual(['lung disease', 'sweat chloride']);
    expect(result.synonyms).toEqual(['CF']);
    expect(result.inheritancePattern).toBe('autosomal recessive');
    expect(result.hpoTerms).toEqual([]);
    expect(result.candidateGenes).toHaveLength(15);
    expect(result.candidateGenes[0]).toEqual({
      symbol: 'G10',
      name: 'Gene 0 name',
      explanation: 'Candidate 0 explanation',
    });
    expect(result.candidateGenes[1]).toEqual({
      symbol: 'CFTR',
      name: 'CFTR',
      explanation: 'channel lead',
    });
    expect(result.candidateGenes.filter((gene) => gene.symbol === 'CFTR')).toHaveLength(1);
    expect(result.candidateGenes.some((gene) => gene.symbol === 'A')).toBe(false);
    for (const gene of result.candidateGenes) {
      expect(Object.keys(gene).every((key) => ['symbol', 'name', 'explanation'].includes(key))).toBe(true);
      expect(JSON.stringify(gene)).not.toMatch(/javascript:|AI guess|"score"/i);
    }
  });

  it('drops clinical guidance embedded in candidate explanations', () => {
    const publication = sanitize('suggest_candidates', {
      candidateGenes: [
        {
          symbol: 'CFTR',
          name: 'CFTR',
          explanation: 'Patients should start medication and take 5 mg daily.',
        },
        {
          symbol: 'RUNX1',
          explanation: 'An exploratory candidate for source verification.',
        },
      ],
    });

    const result = expectPublication(publication, {
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(result.candidateGenes).toEqual([
      { symbol: 'CFTR', name: 'CFTR' },
      { symbol: 'RUNX1', explanation: 'An exploratory candidate for source verification.' },
    ]);
  });

  it('drops clinical guidance embedded in candidate names and classification synonyms', () => {
    const publication = sanitize('classify_and_suggest', {
      queryType: 'disease',
      isDisease: true,
      synonyms: ['CF', 'Patients should take medication.'],
      candidateGenes: [
        {
          symbol: 'CFTR',
          name: 'Take 5 mg daily',
          explanation: 'An exploratory candidate for source verification.',
        },
      ],
    });

    const result = expectPublication(publication, {
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(result.synonyms).toEqual(['CF']);
    expect(result.candidateGenes).toEqual([
      { symbol: 'CFTR', explanation: 'An exploratory candidate for source verification.' },
    ]);
  });

  it('derives classification from trusted curated and ontology references', () => {
    const phenotypePublication = sanitize('classify', {
      queryType: 'disease',
      isDisease: true,
      diseaseName: 'Wrong model label',
      isHPOTerm: true,
      mainFeatures: ['A source-verification feature'],
    }, PHENOTYPE_QUERY);
    const phenotype = expectPublication(phenotypePublication);
    expect(phenotype).toEqual({
      queryType: 'phenotype',
      isDisease: false,
      isHPOTerm: false,
      mainFeatures: ['A source-verification feature'],
      synonyms: [],
      hpoTerms: [],
    });

    const hpoPublication = sanitize('classify', {
      queryType: 'disease',
      isDisease: true,
      diseaseName: 'Wrong model label',
      isHPOTerm: false,
      mainFeatures: ['An ontology-review feature'],
    }, HPO_QUERY);
    const hpo = expectPublication(hpoPublication);
    expect(hpo).toEqual({
      queryType: 'hpo_term',
      isDisease: false,
      isHPOTerm: true,
      mainFeatures: ['An ontology-review feature'],
      synonyms: [],
      hpoTerms: [],
    });
  });

  it('accepts an array for suggest_candidates and fails closed on malformed output', () => {
    const arrayPublication = sanitize('suggest_candidates', [
      { symbol: 'runx1' },
      { symbol: 'NOT A SYMBOL' },
      { symbol: 'RUNX1' },
    ]);
    expect(expectPublication(arrayPublication)).toEqual({
      candidateGenes: [{ symbol: 'RUNX1' }],
    });

    for (const publication of [
      sanitize('suggest_candidates', 'not json at all'),
      sanitize('classify_and_suggest', '{broken', PHENOTYPE_QUERY),
    ]) {
      expectPublication(publication, {
        status: 'unavailable',
        reasonCode: 'provider_malformed',
      });
      expect(publication.content).toBeNull();
      expect(publication.limitations).toEqual([]);
    }
  });

  it('reduces safe gene-profile output to bounded non-clinical text and phenotype names only', () => {
    const publication = sanitize('gene_profile', {
      summary: 'This is not a diagnosis. Exploratory\nsummary\u0000with boundaries.',
      keyTakeaways: [
        'First point',
        'Patients should start medication.',
        { text: 'object must be dropped' },
        'first point',
        'Second\npoint',
        ...Array.from({ length: 20 }, (_, index) => `Point ${index}`),
      ],
      phenotypes: [
        { name: 'Seizure', hpoId: 'HP:MODEL-GUESS', directLink: 'https://untrusted.example' },
        'Ataxia',
        { name: 'seizure' },
        { name: 'Take 5 mg daily' },
        { name: { object: true } },
        null,
      ],
      expressionData: [{ tissue: 'Brain', value: 999 }],
      treatmentData: ['not publishable'],
    });

    const result = expectPublication(publication, {
      status: 'partial',
      reasonCode: 'clinical_fields_withheld',
    });
    expect(publication.limitations).toHaveLength(1);
    expect(result.summary).toBe('This is not a diagnosis. Exploratory summary with boundaries.');
    expect(result.summaryStatus).toBe('available');
    expect(result.keyTakeaways).toHaveLength(12);
    expect(result.keyTakeaways.slice(0, 2)).toEqual(['First point', 'Second point']);
    expect(result.keyTakeaways).not.toContain('Patients should start medication.');
    expect(result.phenotypes).toEqual([{ name: 'Seizure' }, { name: 'Ataxia' }]);
    expect(JSON.stringify(result)).not.toMatch(/hpoId|directLink|expressionData|treatmentData|MODEL-GUESS|5 mg/);
  });

  it('returns an explicit safe withheld profile instead of allowing a client-side association fallback', () => {
    const publication = sanitize('gene_profile', {
      summary: 'The patient should begin treatment and take 10 mg daily.',
      keyTakeaways: ['Screening is recommended for this patient.', 'Verify source records.'],
      phenotypes: [],
    });

    expectPublication(publication, {
      status: 'withheld',
      reasonCode: 'clinical_boundary',
    });
    expect(publication.content).toBeNull();
    expect(publication.limitations).toEqual([]);
    expect(JSON.stringify(publication)).not.toMatch(/associated with|treatment|10 mg daily/i);
  });

  it('returns truthful terminal or partial artifacts for empty structured output', () => {
    const malformed = sanitize('gene_profile', null);
    expectPublication(malformed, {
      status: 'unavailable',
      reasonCode: 'provider_malformed',
    });
    expect(malformed.content).toBeNull();

    const missingSummary = sanitize('gene_profile', []);
    expectPublication(missingSummary, {
      status: 'unavailable',
      reasonCode: 'profile_summary_unavailable',
    });
    expect(missingSummary.content).toBeNull();

    const classification = sanitize('classify', [], PHENOTYPE_QUERY);
    expectPublication(classification, {
      status: 'unavailable',
      reasonCode: 'provider_empty',
    });
    expect(classification.content).toBeNull();

    const suggestions = sanitize('suggest_candidates', { candidateGenes: [] });
    expectPublication(suggestions, {
      status: 'unavailable',
      reasonCode: 'provider_empty',
    });
    expect(suggestions.content).toBeNull();

    const emptyFused = sanitize('classify_and_suggest', { candidateGenes: [] }, PHENOTYPE_QUERY);
    expectPublication(emptyFused, {
      status: 'unavailable',
      reasonCode: 'provider_empty',
    });
    expect(emptyFused.content).toBeNull();

    const diseaseOnlyFused = sanitize('classify_and_suggest', { candidateGenes: [] });
    const diseaseOnlyContent = expectPublication(diseaseOnlyFused, {
      status: 'partial',
      reasonCode: 'candidate_leads_missing',
    });
    expect(diseaseOnlyContent.diseaseName).toBe('Cystic Fibrosis');
    expect(diseaseOnlyContent.candidateGenes).toEqual([]);
    expect(diseaseOnlyFused.limitations).toHaveLength(1);
  });

  it('normalizes every published research narrative instead of passing provider prose through', () => {
    const raw = '# Cohort hypothesis\n<script>alert(1)</script>\nReview [the source](https://untrusted.example) and https://other.example/path.\u0085\n\n\nAnalyze deidentified aggregate data.';
    const publication = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw);
    const result = expectPublication(publication);

    expect(result).toContain('# Cohort hypothesis');
    expect(result).toContain('the source');
    expect(result).toContain('[external link removed]');
    expect(result).toContain('Analyze deidentified aggregate data.');
    expect(result).not.toContain('<script>');
    expect(result).not.toContain('https://');
    expect(result).not.toContain('\u0085');
    expect(result).not.toMatch(/\n{3,}/);
  });

  it('neutralizes reference-style Markdown, image definitions, and protocol-relative URLs', () => {
    const raw = [
      '# Bounded narrative',
      'Review [the source][record] and ![tracking pixel][pixel].',
      '[record]: https://untrusted.example/source "source"',
      '[pixel]: //tracker.example/pixel.png',
      'Also inspect //another.example/path.',
    ].join('\n');

    const publication = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw);
    const result = expectPublication(publication);

    expect(result).toContain('Review the source and tracking pixel.');
    expect(result).toContain('[external link removed]');
    expect(result).not.toContain('[record]:');
    expect(result).not.toContain('[pixel]:');
    expect(result).not.toContain('https://');
    expect(result).not.toContain('//tracker.example');
    expect(result).not.toContain('//another.example');
  });

  it('withholds clinical guidance from research and learning publication tasks', () => {
    const clinical = 'The patient should begin treatment and take 5 mg daily.';
    for (const publication of [
      sanitizePublicationTaskOutput(RESEARCH_TASK, {}, clinical),
      sanitizePublicationTaskOutput(AGGREGATE_TASK, {}, clinical),
      sanitizePublicationTaskOutput(
        LEARNING_TASK,
        {},
        'You should consult your physician for screening.',
      ),
    ]) {
      expectPublication(publication, {
        status: 'withheld',
        reasonCode: 'clinical_boundary',
      });
      expect(publication.content).toBeNull();
      expect(publication.limitations).toEqual([]);
    }
  });

  it('does not let a disclaimer consume a following semicolon-separated instruction', () => {
    const disguisedClinical = 'Do not use this output for diagnosis; take 5 mg daily.';

    expect(__test.containsProhibitedClinicalGuidance(disguisedClinical)).toBe(true);
    const publication = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, disguisedClinical);
    expectPublication(publication, {
      status: 'withheld',
      reasonCode: 'clinical_boundary',
    });
    expect(publication.content).toBeNull();
  });

  it('allows complete known non-clinical boundary disclaimers and caps narrative output', () => {
    const safePublication = sanitizePublicationTaskOutput(
      LEARNING_TASK,
      {},
      `This is not medical advice. Compare aggregate patterns only. ${'A'.repeat(4_000)}`,
    );
    const safe = expectPublication(safePublication);
    expect(safe).toContain('This is not medical advice.');
    expect(safe.length).toBeLessThanOrEqual(3_000);

    const completeBoundary = 'Do not use this output for diagnosis, personal-risk prediction, treatment, dosing, screening, or other clinical decisions. Compare aggregate patterns only.';
    const completePublication = sanitizePublicationTaskOutput(
      RESEARCH_TASK,
      {},
      completeBoundary,
    );
    expect(expectPublication(completePublication)).toBe(completeBoundary);
  });

  it('returns canonical unavailable artifacts for missing published narratives', () => {
    for (const publication of [
      sanitizePublicationTaskOutput(RESEARCH_TASK, {}, null),
      sanitizePublicationTaskOutput(LEARNING_TASK, {}, null),
    ]) {
      expectPublication(publication, {
        status: 'unavailable',
        reasonCode: 'provider_empty',
      });
      expect(publication.content).toBeNull();
      expect(publication.limitations).toEqual([]);
    }
  });

  it('fails closed for an unknown non-published task', () => {
    const original = '{"internal":"aggregate"}';
    for (const publication of [
      sanitizePublicationTaskOutput('internal_non_published_task', {}, original),
      sanitizePublicationTaskOutput('internal_non_published_task', {}, null),
    ]) {
      expectPublication(publication, {
        status: 'unavailable',
        reasonCode: 'unsupported_publication_task',
      });
      expect(publication.content).toBeNull();
      expect(publication.limitations).toEqual([]);
    }
  });

  it('caps individual text fields without retaining C0, DEL, or C1 controls', () => {
    const cleaned = __test.cleanText(`A\n\u0085${'B'.repeat(600)}`, 32);
    expect(cleaned).toHaveLength(32);
    expect(Array.from(cleaned).every((character) => {
      const codePoint = character.codePointAt(0) ?? -1;
      const isC0OrDel = codePoint <= 0x1f || codePoint === 0x7f;
      const isC1 = codePoint >= 0x80 && codePoint <= 0x9f;
      return !isC0OrDel && !isC1;
    })).toBe(true);
  });
});
