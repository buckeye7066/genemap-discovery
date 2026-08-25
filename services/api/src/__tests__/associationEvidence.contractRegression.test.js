import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __test,
  sanitizeAssociationEvidence,
} from '../services/associationEvidenceContract.js';

const HPO_QUERY = {
  kind: 'hpo',
  identifier: 'HP:0001250',
  canonicalLabel: 'Seizure',
  source: 'NLM Clinical Tables HPO',
  apiVersion: 'v3',
  obsolete: false,
};

beforeEach(() => {
  __test.resetCache();
});

describe('association evidence release bounds', () => {
  it('marks candidate sets beyond the ortholog evaluation cap as partial coverage', () => {
    const symbols = Array.from({ length: 15 }, (_, index) => `GENE${index + 10}`);
    const raw = {
      query: HPO_QUERY,
      sourceStatus: 'available',
      claimsByGene: {},
      sources: {
        myGene: { status: 'available' },
        monarch: { status: 'available', truncated: false },
        openTargets: { status: 'not_applicable' },
      },
    };

    const bounded = __test.applyOrthologCoverage(raw, symbols);

    expect(bounded.sourceStatus).toBe('partial_coverage');
    expect(bounded.sources.monarch).toMatchObject({
      status: 'partial',
      truncated: true,
      candidateLimit: 8,
      candidatesRequested: 15,
      candidatesSkipped: 7,
    });
  });

  it('preserves Open Targets literature as a positive score part on its computed claim', () => {
    const result = sanitizeAssociationEvidence({
      query: HPO_QUERY,
      retrievedAt: '2026-08-25T12:00:00.000Z',
      sourceStatus: 'available',
      sources: {
        myGene: { status: 'available' },
        monarch: { status: 'available' },
        openTargets: {
          status: 'available',
          apiVersion: 'v4',
          releaseVersion: '26.06',
          retrievedAt: '2026-08-25T12:00:00.000Z',
        },
      },
      claimsByGene: {
        SCN1A: [{
          source: 'Open Targets Platform GraphQL API v4',
          recordId: 'ENSG00000144285',
          claim: 'Open Targets aggregates source datatypes for SCN1A and Seizure',
          subject: { kind: 'gene', id: 'ENSG00000144285', label: 'SCN1A' },
          object: { kind: 'disease', id: 'MONDO:0005027', label: 'Seizure disorder' },
          taxon: '9606',
          species: 'Homo sapiens',
          evidenceClass: 'computational',
          evidenceType: 'computed_target_disease_association',
          evidenceStrength: 'supporting',
          scoreComponents: [{
            id: 'literature',
            label: 'Literature',
            score: 0.42,
            evidenceClass: 'literature',
            scale: 'open_targets_datatype_score_0_1',
          }],
          releaseVersion: '26.06',
          retrievalDate: '2026-08-25',
          directLink: 'https://platform.opentargets.org/disease/MONDO_0005027/associations',
          isAiLead: false,
        }],
      },
    }, ['SCN1A']);

    expect(result.claimsByGene.SCN1A).toHaveLength(1);
    expect(result.claimsByGene.SCN1A[0]).toMatchObject({
      evidenceClass: 'computational',
      evidenceType: 'computed_target_disease_association',
      scoreComponents: [{
        id: 'literature',
        score: 0.42,
        evidenceClass: 'literature',
        scale: 'open_targets_datatype_score_0_1',
      }],
    });
  });

  it('returns an honest unavailable MyGene result before a stalled adapter can consume the route deadline', async () => {
    const neverResolvingGeneLookup = vi.fn(() => new Promise(() => {}));

    const started = Date.now();
    const result = await __test.timedGeneLookup(
      ['SCN1A', 'SCN2A'],
      neverResolvingGeneLookup,
      10,
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(neverResolvingGeneLookup).toHaveBeenCalledOnce();
    expect(result).toEqual({
      records: { SCN1A: null, SCN2A: null },
      status: 'unavailable',
      retrievedAt: null,
      error: 'gene_lookup_deadline_exceeded',
    });
  });

  it('applies a shared provider deadline to upstream fetches', async () => {
    let capturedSignal;
    const fetchImpl = vi.fn(async (_url, options) => {
      capturedSignal = options.signal;
      return { ok: true, json: async () => ({}) };
    });
    const bounded = __test.boundedFetch(fetchImpl, 25);

    await bounded('https://example.invalid/source', { signal: new AbortController().signal });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});
