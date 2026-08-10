import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getPublicationAssociationEvidence,
  __test,
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

  it('returns a truthful partial result before a stalled MyGene adapter can consume the browser deadline', async () => {
    const neverResolvingGeneLookup = vi.fn(() => new Promise(() => {}));
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ items: [], associations: [] }),
    }));

    const started = Date.now();
    const result = await getPublicationAssociationEvidence(
      HPO_QUERY,
      ['SCN1A', 'SCN2A'],
      {
        geneLookup: neverResolvingGeneLookup,
        fetchImpl,
        providerDeadlineMs: 10,
      },
    );
    const elapsed = Date.now() - started;

    expect(elapsed).toBeLessThan(1_000);
    expect(neverResolvingGeneLookup).toHaveBeenCalledOnce();
    expect(result.sources.myGene.status).toBe('unavailable');
    expect(result.sourceStatus).not.toBe('available');
    expect(result.sourceStatus).not.toBe('no_matching_associations');
    expect(result.claimCount).toBe(0);
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
