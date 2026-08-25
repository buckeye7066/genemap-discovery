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

  it('publishes the Open Targets score DECOMPOSED, each part carrying its evidence class', async () => {
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
            meta: { dataVersion: { year: '26', month: '06', iteration: null } },
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
                  datatypeScores: [
                    { id: 'genetic_association', score: 0.95 },
                    { id: 'animal_model', score: 0.42 },
                    { id: 'literature', score: 0.61 },
                    // A component with no real number must be DROPPED, not
                    // coerced: Number(null) is 0, and 0.00 on screen reads as
                    // "measured as nothing" rather than "not stated".
                    { id: 'rna_expression', score: null },
                  ],
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
        // Was null: the adapter discarded the release it had been given.
        releaseVersion: '26.06',
        taxon: '9606',
      }),
    ]));
    const openTargets = result.claimsByGene.CFTR
      .find((claim) => claim.source === 'Open Targets Platform GraphQL API v4');

    // THE RULE THIS TEST PINS (replacing the old blanket score suppression):
    // a source-published score component may reach the browser ONLY carrying
    // its evidence class, and only on a claim that can state where it came
    // from, which release, and when. A decomposed score is not an unexplained
    // one - that is exactly why it is publishable where the bare aggregate is
    // not. See services/api/src/services/associationEvidenceContract.js.
    expect(openTargets.releaseVersion).toBe('26.06');
    expect(openTargets.retrievalDate).toEqual(expect.any(String));
    expect(openTargets.scoreComponents).toEqual([
      { id: 'genetic_association', label: 'Genetic association', score: 0.95, evidenceClass: 'human_verified', scale: 'open_targets_datatype_score_0_1' },
      { id: 'animal_model', label: 'Animal model', score: 0.42, evidenceClass: 'animal_model', scale: 'open_targets_datatype_score_0_1' },
      { id: 'literature', label: 'Literature', score: 0.61, evidenceClass: 'literature', scale: 'open_targets_datatype_score_0_1' },
    ]);

    // An absent component is absent. It never becomes a confident 0.00.
    expect(openTargets.scoreComponents.map((c) => c.id)).not.toContain('rna_expression');
    expect(openTargets.scoreComponents.every((c) => c.score > 0)).toBe(true);

    // The ROLLED-UP aggregate stays out: it is the unexplained number.
    expect(JSON.stringify(result)).not.toContain('0.987654');

    // The subject/object are machine-checkable, not parsed out of the sentence.
    expect(openTargets.subject).toEqual({ kind: 'gene', id: 'ENSG00000001626', label: 'CFTR' });
    expect(openTargets.object).toEqual({ kind: 'disease', id: 'MONDO:0009061', label: 'cystic fibrosis' });
  });

  it('refuses score components on a claim that cannot state its provenance', async () => {
    // The other half of the rule: numbers are publishable BECAUSE they are
    // traceable. Strip the release and the whole component set must go, rather
    // than leaking an unattributable number.
    const { sanitizeAssociationEvidence } = await import('../services/associationEvidenceContract.js');
    const traceable = {
      source: 'Open Targets Platform GraphQL API v4',
      claim: 'A traceable computed association.',
      taxon: '9606',
      evidenceClass: 'computational',
      evidenceType: 'computed_target_disease_association',
      releaseVersion: '26.06',
      retrievalDate: '2026-08-25',
      scoreComponents: [{
        id: 'genetic_association', label: 'Genetic association', score: 0.95,
        evidenceClass: 'human_verified', scale: 'open_targets_datatype_score_0_1',
      }],
    };
    const base = {
      query: { kind: 'mondo', identifier: 'MONDO:0009061', canonicalLabel: 'cystic fibrosis' },
      retrievedAt: '2026-08-25T00:00:00.000Z',
      sourceStatus: 'available',
    };

    const kept = sanitizeAssociationEvidence(
      { ...base, claimsByGene: { CFTR: [traceable] } }, ['CFTR'],
    );
    expect(kept.claimsByGene.CFTR[0].scoreComponents).toHaveLength(1);

    for (const missing of ['source', 'releaseVersion', 'retrievalDate']) {
      const untraceable = sanitizeAssociationEvidence(
        { ...base, claimsByGene: { CFTR: [{ ...traceable, [missing]: null }] } },
        ['CFTR'],
      );
      const claim = untraceable.claimsByGene.CFTR[0];
      if (!claim) continue; // a claim with no source is dropped outright
      expect(claim.scoreComponents, `missing ${missing} must refuse the score set`).toEqual([]);
      expect(JSON.stringify(untraceable)).not.toContain('0.95');
    }
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
    expect(result.sourceStatus).toBe('unavailable');
  });

  it('does not promote a taxon-unspecified direct edge to human evidence', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) {
        return jsonResponse({
          associations: [{
            id: 'ambiguous-edge',
            category: 'biolink:GeneToPhenotypicFeatureAssociation',
            subject: 'NCBIGene:6323',
            subject_label: 'SCN1A',
            subject_category: 'biolink:Gene',
            predicate: 'biolink:associated_with',
            object: 'HP:0001250',
            object_category: 'biolink:PhenotypicFeature',
          }],
        });
      }
      if (url.includes('/ortholog-phenotype-grid')) {
        return jsonResponse({ columns: [], rows: [], cells: {} });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup,
    });

    expect(result.claimsByGene.SCN1A).toEqual([]);
    expect(result.sourceStatus).toBe('no_matching_associations');
  });

  it('excludes negated disease phenotypes from ortholog inference', () => {
    const phenotypes = __test.phenotypeIdsForQuery({
      kind: 'mondo',
      identifier: 'MONDO:0009061',
      canonicalLabel: 'cystic fibrosis',
    }, [{
      negated: true,
      subject: 'MONDO:0009061',
      object: 'HP:0001250',
      object_category: 'biolink:PhenotypicFeature',
      object_label: 'Seizure',
    }]);

    expect([...phenotypes.keys()]).toEqual([]);
  });

  it('reports bounded source coverage as partial instead of a false source-wide negative', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) {
        return jsonResponse({ total: 1000, associations: [] });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup,
    });

    expect(result.claimsByGene.SCN1A).toEqual([]);
    expect(result.sourceStatus).toBe('partial_coverage');
    expect(result.sources.monarch).toMatchObject({
      status: 'partial',
      truncated: true,
    });
  });

  it('preserves the source retrieval date when a raw association cache is reused across UTC midnight', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-09T23:59:59.000Z'));
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) {
        return jsonResponse({
          associations: [{
            id: 'cached-edge',
            category: 'biolink:GeneToPhenotypicFeatureAssociation',
            subject: 'NCBIGene:6323',
            subject_label: 'SCN1A',
            subject_category: 'biolink:Gene',
            subject_taxon: 'NCBITaxon:9606',
            predicate: 'biolink:associated_with',
            object: 'HP:0001250',
            object_category: 'biolink:PhenotypicFeature',
          }],
        });
      }
      if (url.includes('/ortholog-phenotype-grid')) {
        return jsonResponse({ columns: [], rows: [], cells: {} });
      }
      throw new Error(`Unexpected URL ${url}`);
    });

    const first = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup,
    });
    vi.setSystemTime(new Date('2026-08-10T00:00:01.000Z'));
    const second = await getAssociationEvidence(hpoReference, ['SCN1A', 'CFTR'], {
      fetchImpl,
      geneLookup,
    });

    expect(first.claimsByGene.SCN1A[0].retrievalDate).toBe('2026-08-09');
    expect(second.claimsByGene.SCN1A[0].retrievalDate).toBe('2026-08-09');
    const associationCalls = fetchImpl.mock.calls.filter(([input]) => urlString(input).includes('/association?'));
    expect(associationCalls).toHaveLength(1);
    vi.useRealTimers();
  });

  it('keeps evidence available as partial coverage when gene identity lookup fails', async () => {
    const fetchImpl = vi.fn(async (input) => {
      const url = urlString(input);
      if (url.includes('clinicaltables.nlm.nih.gov')) return jsonResponse(hpoPayload());
      if (url.endsWith('/version')) return jsonResponse({ version: '2026-06-08' });
      if (url.includes('/association?')) return jsonResponse({ associations: [] });
      throw new Error(`Unexpected URL ${url}`);
    });

    const result = await getAssociationEvidence(hpoReference, ['SCN1A'], {
      fetchImpl,
      geneLookup: vi.fn(async () => { throw new Error('MyGene unavailable'); }),
    });

    expect(result.claimsByGene.SCN1A).toEqual([]);
    expect(result.sourceStatus).toBe('partial_coverage');
    expect(result.sources.myGene).toMatchObject({
      status: 'unavailable',
      truncated: false,
      retrievedAt: null,
    });
    expect(result.sources.monarch.status).toBe('available');
  });

});
