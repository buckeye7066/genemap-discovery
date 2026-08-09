import { describe, expect, it } from 'vitest';
import {
  sanitizePublicationTaskOutput,
  __test,
} from '../services/publicationTaskOutput.js';

const TASK = 'candidate_gene_research';
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

  it('reduces gene-profile output to bounded text and phenotype names only', () => {
    const result = sanitize('gene_profile', {
      summary: '  Exploratory\nsummary\u0000with boundaries  ',
      keyTakeaways: [
        'First point',
        { text: 'object must be dropped' },
        'first point',
        'Second\npoint',
        ...Array.from({ length: 20 }, (_, index) => `Point ${index}`),
      ],
      phenotypes: [
        { name: 'Seizure', hpoId: 'HP:MODEL-GUESS', directLink: 'https://untrusted.example' },
        'Ataxia',
        { name: 'seizure' },
        { name: { object: true } },
        null,
      ],
      expressionData: [{ tissue: 'Brain', value: 999 }],
      treatmentData: ['not publishable'],
    });

    expect(result.summary).toBe('Exploratory summary with boundaries');
    expect(result.keyTakeaways).toHaveLength(12);
    expect(result.keyTakeaways.slice(0, 2)).toEqual(['First point', 'Second point']);
    expect(result.phenotypes).toEqual([{ name: 'Seizure' }, { name: 'Ataxia' }]);
    expect(JSON.stringify(result)).not.toMatch(/hpoId|directLink|expressionData|treatmentData|MODEL-GUESS/);
  });

  it('returns a stable empty profile for invalid model output', () => {
    expect(sanitize('gene_profile', null)).toEqual({ keyTakeaways: [], phenotypes: [] });
    expect(sanitize('classify', [], PHENOTYPE_QUERY)).toEqual({
      queryType: 'phenotype',
      isDisease: false,
      isHPOTerm: false,
      mainFeatures: [],
      synonyms: [],
      hpoTerms: [],
    });
  });

  it('does not rewrite unrelated publication task output', () => {
    const original = '{"cohort":"aggregate"}';
    expect(sanitizePublicationTaskOutput('aggregate_genomics_research', { operation: 'x' }, original))
      .toBe(original);
    expect(sanitizePublicationTaskOutput('aggregate_genomics_research', {}, null)).toBe('');
  });

  it('caps individual text fields without retaining control characters', () => {
    const cleaned = __test.cleanText(`A\n${'B'.repeat(600)}`, 32);
    expect(cleaned).toHaveLength(32);
    expect(Array.from(cleaned).every((character) => {
      const codePoint = character.codePointAt(0) ?? -1;
      return codePoint > 0x1f && codePoint !== 0x7f;
    })).toBe(true);
  });
});
