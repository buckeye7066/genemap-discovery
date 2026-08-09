import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import {
  fetchAssociationEvidence,
  __test,
} from '../associationEvidenceClient';

vi.mock('@genemap/shared', () => ({
  apiClient: { request: vi.fn() },
}));

const query = { kind: 'hpo', identifier: 'HP:0001250' };

describe('associationEvidenceClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deduplicates, policy-filters, and bounds candidate symbols before calling the authenticated API', async () => {
    apiClient.request.mockResolvedValue({
      query: { ...query, canonicalLabel: 'Seizure' },
      claimsByGene: { SCN1A: [] },
      sourceStatus: 'no_matching_associations',
      claimCount: 0,
    });

    const result = await fetchAssociationEvidence(query, [
      'scn1a',
      'SCN1A',
      'not a symbol',
      'TAKE-5MG',
      'STOP-DRUG',
      ...Array.from({ length: 20 }, (_, index) => `G${index + 10}`),
    ]);

    expect(apiClient.request).toHaveBeenCalledWith('/genomics/association-evidence', {
      method: 'POST',
      body: JSON.stringify({
        query,
        symbols: ['SCN1A', ...Array.from({ length: 14 }, (_, index) => `G${index + 10}`)],
      }),
      timeoutMs: 45_000,
    });
    expect(result.sourceStatus).toBe('no_matching_associations');
    expect(__test.isPublicationGeneSymbol('SCN1A')).toBe(true);
    expect(__test.isPublicationGeneSymbol('STOP1')).toBe(true);
    expect(__test.isPublicationGeneSymbol('TAKE-5MG')).toBe(false);
    expect(__test.isPublicationGeneSymbol('STOP-DRUG')).toBe(false);
  });

  it('fails soft without promoting or removing candidate leads when the source API is unavailable', async () => {
    apiClient.request.mockRejectedValue(new Error('upstream unavailable'));

    const result = await fetchAssociationEvidence(query, ['SCN1A']);

    expect(result).toMatchObject({
      query: null,
      claimsByGene: {},
      sourceStatus: 'unavailable',
      claimCount: 0,
      error: 'upstream unavailable',
    });
  });

  it('does not make a request without a valid reference and at least one bounded symbol', async () => {
    expect(await fetchAssociationEvidence(null, ['SCN1A'])).toEqual(__test.EMPTY_RESULT);
    expect(await fetchAssociationEvidence(query, ['not a gene'])).toEqual(__test.EMPTY_RESULT);
    expect(await fetchAssociationEvidence(query, ['TAKE-5MG'])).toEqual(__test.EMPTY_RESULT);
    expect(apiClient.request).not.toHaveBeenCalled();
  });
});