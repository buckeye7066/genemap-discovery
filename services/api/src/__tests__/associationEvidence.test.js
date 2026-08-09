import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAssociationEvidence,
  __test,
} from '../services/associationEvidence.js';

const hpoReference = {
  kind: 'hpo',
  identifier: 'HP:0001250',
};

const mondoReference = {
  kind: 'mondo',
  identifier: 'MONDO:0009061',
};

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: vi.fn(async () => payload),
  };
}

function urlString(input) {
  return input instanceof URL ? input.href : String(input);
}

function hpoPayload() {
  return [
    1,
    ['HP:0001250'],
    {
      name: ['Seizure'],
      is_obsolete: [null],
      replaced_by: [null],
    },
    [['HP:0001250', 'Seizure']],
  ];
}

function geneLookup(symbols) {
  return Object.fromEntries(symbols.map((symbol) => [symbol, {
    symbol,
    verified: true,
    source: 'MyGene.info',
    entrezId: symbol === 'SCN1A' ? '6323' : '1080',
    ensemblId: symbol === 'SCN1A' ? 'ENSG00000144285' : 'ENSG00000001626',
  }]));
}

describe('association evidence adapters', () => {
  beforeEach(() => {
    __test.resetCache();
  });

  it('separates direct human and mouse ortholog evidence for an exact HPO term', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) {
        return jsonResponse({
          associations: [{
            id: 'monarch-human-1',
            category: 'biolink:GeneToPhenotypicFeatureAssociation',
            subject: 'NCBIGene:6323',
            subject_label: 'SCN1A',
            subject_category: 'biolink:Gene',
            subject_taxon: 'NCBITaxon:9606',
            subject_taxon_label: 'Homo sapiens',
            predicate: 'biolink:associated_with',
            object: 'HP:0001250',
            object_label: 'Seizure',
            object_category: 'biolink:PhenotypicFeature',
            evidence_count: 2,
            primary_knowledge_source: 'infores:hpo-annotations',
            publications: ['PMID:12345678'],
          }],
        });
      }
      if (url.includes('/ortholog-phenotype-grid')) {
        return jsonResponse({
          columns: [{
            id: 'MGI:98297',
            symbol: 'Scn1a',
            taxon: 'NCBITaxon:10090',
            taxon_label: 'Mus musculus',
          }],
          rows: [{ id: 'HP:0001250', name: 'Seizure' }],
          cells: {
            'MGI:98297:HP:0001250': {
              id: 'mouse-grid-cell-1',
              present: true,
              negated: false,
              evidence_count: 1,
              publications: ['PMID:87654321'],
            },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup,
    });

    expect(result.query).toMatchObject({
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
    });
    expect(result.claimsByGene.SCN1A).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'infores:hpo-annotations',
        recordId: 'monarch-human-1',
        taxon: '9606',
        species: 'Homo sapiens',
        evidenceClass: 'human_verified',
        evidenceType: 'gene_phenotype_association',
        directLink: 'https://pubmed.ncbi.nlm.nih.gov/12345678/',
        isAiLead: false,
      }),
      expect.objectContaining({
        source: 'Monarch Initiative ortholog-phenotype grid',
        recordId: 'mouse-grid-cell-1',
        taxon: '10090',
        species: 'Mus musculus',
        evidenceClass: 'animal_model',
        evidenceType: 'ortholog_phenotype_inference',
        directLink: 'https://pubmed.ncbi.nlm.nih.gov/87654321/',
        isAiLead: false,
      }),
    ]));
    expect(result.claimsByGene.SCN1A.find((claim) => claim.evidenceClass === 'animal_model').claim)
      .toMatch(/cross-species inference, not direct human evidence/i);
    expect(result.sourceStatus).toBe('available');
  });

  it('adds an Open Targets association as a distinct computed signal without exposing its score', async () => {
    const fetchImpl = vi.fn(async (input, options = {}) => {
      const url = urlString(input);
      if (url.endsWith('/entity/MONDO%3A0009061')) {
        return jsonResponse({
          id: 'MONDO:0009061',
          name: 'cystic fibrosis',
          category: ['biolink:Disease'],
        });
      }
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) {
        return jsonResponse({
          associations: [{
            id: 'monarch-cftr-1',
            category: 'biolink:CausalGeneToDiseaseAssociation',
            subject: 'NCBIGene:1080',
            subject_label: 'CFTR',
            subject_category: 'biolink:Gene',
            subject_taxon: 'NCBITaxon:9606',
            subject_taxon_label: 'Homo sapiens',
            predicate: 'biolink:causes',
            object: 'MONDO:0009061',
            object_label: 'cystic fibrosis',
            object_category: 'biolink:Disease',
            evidence_count: 4,
            primary_knowledge_source: 'infores:clingen',
          }],
        });
      }
      if (url.includes('/ortholog-phenotype-grid')) {
        return jsonResponse({ columns: [], rows: [], cells: {} });
      }
      if (url === 'https://api.platform.opentargets.org/api/v4/graphql') {
        expect(options.method).toBe('POST');
        const requestBody = JSON.parse(options.body);
        expect(requestBody.variables).toEqual({ diseaseId: 'MONDO_0009061' });
        return jsonResponse({
          data: {
            disease: {
              id: 'MONDO_0009061',
              name: 'cystic fibrosis',
              associatedTargets: {
                rows: [{
                  target: {
                    id: 'ENSG00000001626',
                    approvedSymbol: 'CFTR',
                    approvedName: 'CF transmembrane conductance regulator',
                  },
                  score: 0.987654,
                  datatypeScores: [{ id: 'genetic_association', score: 0.95 }],
                }],
              },
            },
          },
        });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getAssociationEvidence(mondoReference, ['CFTR'], {
      fetchImpl,
      geneLookup,
    });

    expect(result.claimsByGene.CFTR).toEqual(expect.arrayContaining([
      expect.objectContaining({
        source: 'infores:clingen',
        evidenceClass: 'human_verified',
        evidenceType: 'gene_disease_association',
      }),
      expect.objectContaining({
        source: 'Open Targets Platform GraphQL API v4',
        evidenceClass: 'computational',
        evidenceType: 'computed_target_disease_association',
        releaseVersion: null,
        taxon: '9606',
      }),
    ]));
    expect(JSON.stringify(result)).not.toContain('0.987654');
    expect(JSON.stringify(result)).not.toContain('0.95');
  });

  it('does not match a non-human gene by symbol without an explicit ortholog grid', () => {
    const symbol = __test.matchingSymbol({
      id: 'MGI:98297',
      label: 'SCN1A',
      taxon: 'NCBITaxon:10090',
    }, {
      SCN1A: { symbol: 'SCN1A', verified: true, source: 'MyGene.info' },
    });

    expect(symbol).toBeNull();
  });

  it('ignores negated and unrelated association categories and fails soft when sources are unavailable', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      return jsonResponse({}, 503);
    });

    const result = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup,
    });

    expect(result.claimsByGene.SCN1A).toEqual([]);
    expect(result.sourceStatus).toBe('no_matching_associations');
  });
});
