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
  return JSON.parse(sanitizePublicationTaskOutput(TASK, taskInput, result));
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

    const result = sanitize('classify_and_suggest', `
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
    const result = sanitize('suggest_candidates', {
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

    expect(result.candidateGenes).toEqual([
      { symbol: 'CFTR', name: 'CFTR' },
      { symbol: 'RUNX1', explanation: 'An exploratory candidate for source verification.' },
    ]);
  });

  it('drops clinical guidance embedded in candidate names and classification synonyms', () => {
    const result = sanitize('classify_and_suggest', {
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

    expect(result.synonyms).toEqual(['CF']);
    expect(result.candidateGenes).toEqual([
      { symbol: 'CFTR', explanation: 'An exploratory candidate for source verification.' },
    ]);
  });

  it('derives classification from trusted curated and ontology references', () => {
    const phenotype = sanitize('classify', {
      queryType: 'disease',
      isDisease: true,
      diseaseName: 'Wrong model label',
      isHPOTerm: true,
    }, PHENOTYPE_QUERY);
    expect(phenotype).toEqual({
      queryType: 'phenotype',
      isDisease: false,
      isHPOTerm: false,
      mainFeatures: [],
      synonyms: [],
      hpoTerms: [],
    });

    const hpo = sanitize('classify', {
      queryType: 'disease',
      isDisease: true,
      diseaseName: 'Wrong model label',
      isHPOTerm: false,
    }, HPO_QUERY);
    expect(hpo).toEqual({
      queryType: 'hpo_term',
      isDisease: false,
      isHPOTerm: true,
      mainFeatures: [],
      synonyms: [],
      hpoTerms: [],
    });
  });

  it('accepts an array for suggest_candidates and fails closed on malformed output', () => {
    expect(sanitize('suggest_candidates', [
      { symbol: 'runx1' },
      { symbol: 'NOT A SYMBOL' },
      { symbol: 'RUNX1' },
    ])).toEqual({ candidateGenes: [{ symbol: 'RUNX1' }] });

    expect(sanitize('suggest_candidates', 'not json at all')).toEqual({ candidateGenes: [] });
    expect(sanitize('classify_and_suggest', '{broken', PHENOTYPE_QUERY)).toEqual({
      queryType: 'phenotype',
      isDisease: false,
      isHPOTerm: false,
      mainFeatures: [],
      synonyms: [],
      hpoTerms: [],
      candidateGenes: [],
    });
  });

  it('reduces safe gene-profile output to bounded non-clinical text and phenotype names only', () => {
    const result = sanitize('gene_profile', {
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

    expect(result.summary).toBe('This is not a diagnosis. Exploratory summary with boundaries.');
    expect(result.summaryStatus).toBe('available');
    expect(result.keyTakeaways).toHaveLength(12);
    expect(result.keyTakeaways.slice(0, 2)).toEqual(['First point', 'Second point']);
    expect(result.keyTakeaways).not.toContain('Patients should start medication.');
    expect(result.phenotypes).toEqual([{ name: 'Seizure' }, { name: 'Ataxia' }]);
    expect(JSON.stringify(result)).not.toMatch(/hpoId|directLink|expressionData|treatmentData|MODEL-GUESS|5 mg/);
  });

  it('returns an explicit safe withheld profile instead of allowing a client-side association fallback', () => {
    const result = sanitize('gene_profile', {
      summary: 'The patient should begin treatment and take 10 mg daily.',
      keyTakeaways: ['Screening is recommended for this patient.', 'Verify source records.'],
      phenotypes: [],
    });

    expect(result.summaryStatus).toBe('withheld');
    expect(result.summary).toBe(__test.WITHHELD_PROFILE_SUMMARY);
    expect(result.summary).not.toMatch(/associated with|treatment|10 mg daily/i);
    expect(result.keyTakeaways).toEqual(['Verify source records.']);
  });

  it('returns a deterministic unavailable profile for invalid or missing model output', () => {
    expect(sanitize('gene_profile', null)).toEqual({
      summary: __test.UNAVAILABLE_PROFILE_SUMMARY,
      summaryStatus: 'unavailable',
      keyTakeaways: [],
      phenotypes: [],
    });
    expect(sanitize('classify', [], PHENOTYPE_QUERY)).toEqual({
      queryType: 'phenotype',
      isDisease: false,
      isHPOTerm: false,
      mainFeatures: [],
      synonyms: [],
      hpoTerms: [],
    });
  });

  it('normalizes every published research narrative instead of passing provider prose through', () => {
    const raw = '# Cohort hypothesis\n<script>alert(1)</script>\nReview [the source](https://untrusted.example) and https://other.example/path.\u0085\n\n\nUse deidentified aggregate data.';
    const result = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw);

    expect(result).toContain('# Cohort hypothesis');
    expect(result).toContain('the source');
    expect(result).toContain('[external link removed]');
    expect(result).toContain('Use deidentified aggregate data.');
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

    const result = sanitizePublicationTaskOutput(RESEARCH_TASK, {}, raw);

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
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, clinical))
      .toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
    expect(sanitizePublicationTaskOutput(AGGREGATE_TASK, {}, clinical))
      .toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
    expect(sanitizePublicationTaskOutput(LEARNING_TASK, {}, 'You should consult your physician for screening.'))
      .toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
  });

  it('does not let a disclaimer consume a following semicolon-separated instruction', () => {
    const disguisedClinical = 'Do not use this output for diagnosis; take 5 mg daily.';

    expect(__test.containsProhibitedClinicalGuidance(disguisedClinical)).toBe(true);
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, disguisedClinical))
      .toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
  });

  it('allows complete known non-clinical boundary disclaimers and caps narrative output', () => {
    const safe = sanitizePublicationTaskOutput(
      LEARNING_TASK,
      {},
      `This is not medical advice. Compare aggregate patterns only. ${'A'.repeat(4_000)}`,
    );
    expect(safe).not.toBe(__test.PUBLICATION_BOUNDARY_MESSAGE);
    expect(safe).toContain('This is not medical advice.');
    expect(safe.length).toBeLessThanOrEqual(3_000);

    const completeBoundary = 'Do not use this output for diagnosis, personal-risk prediction, treatment, dosing, screening, or other clinical decisions. Compare aggregate patterns only.';
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, completeBoundary))
      .toBe(completeBoundary);
  });

  it('returns task-specific empty messages for missing published narratives', () => {
    expect(sanitizePublicationTaskOutput(RESEARCH_TASK, {}, null))
      .toBe(__test.EMPTY_RESEARCH_MESSAGE);
    expect(sanitizePublicationTaskOutput(LEARNING_TASK, {}, null))
      .toBe(__test.EMPTY_LEARNING_MESSAGE);
  });

  it('keeps backward compatibility only for unknown non-published tasks', () => {
    const original = '{"internal":"aggregate"}';
    expect(sanitizePublicationTaskOutput('internal_non_published_task', {}, original)).toBe(original);
    expect(sanitizePublicationTaskOutput('internal_non_published_task', {}, null)).toBe('');
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