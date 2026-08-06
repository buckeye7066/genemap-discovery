import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  resolvePublicationGene,
  resolvePublicationHpo,
  resolvePublicationMondo,
  resolvePublicationTaskReferences,
  searchPublicationConcepts,
  __test,
} from '../services/publicationResolvers.js';

function response(payload, ok = true) {
  return { ok, json: vi.fn().mockResolvedValue(payload) };
}

const VERIFIED_CFTR = Object.freeze({
  symbol: 'CFTR',
  ensemblId: 'ENSG00000001626',
  entrezId: '1080',
  source: 'MyGene.info',
  verified: true,
});

describe('server-owned publication resolvers', () => {
  beforeEach(() => __test.resetHpoCache());

  it('returns only the exact authoritative gene identity for the requested symbol', async () => {
    const geneLookup = vi.fn().mockResolvedValue({ CFTR: VERIFIED_CFTR });
    await expect(resolvePublicationGene('cftr', { geneLookup })).resolves.toEqual(VERIFIED_CFTR);
    expect(geneLookup).toHaveBeenCalledWith(['CFTR']);
  });

  it.each([
    ['unavailable', {}],
    ['not found', { CFTR: null }],
    ['record-symbol mismatch', { CFTR: { ...VERIFIED_CFTR, symbol: 'BRCA1' } }],
    ['unverified record', { CFTR: { ...VERIFIED_CFTR, verified: false } }],
    ['wrong source', { CFTR: { ...VERIFIED_CFTR, source: 'browser' } }],
  ])('fails closed when MyGene is %s', async (_label, records) => {
    await expect(resolvePublicationGene('CFTR', {
      geneLookup: vi.fn().mockResolvedValue(records),
    })).resolves.toBeNull();
  });

  it('revalidates exact active HPO id and ignores a spoofed browser label', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      1,
      ['HP:0001250'],
      { name: ['Seizure'], is_obsolete: [false], replaced_by: [null] },
      [['HP:0001250', 'Seizure']],
    ]));
    await expect(resolvePublicationHpo('HP:0001250', { fetchImpl })).resolves.toEqual({
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
      obsolete: false,
    });
  });

  it('accepts NLM\'s captured active-record null flag while retaining exact-id checks', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      1,
      ['HP:0001250'],
      { name: ['Seizure'], is_obsolete: [null], replaced_by: [null] },
      [['HP:0001250', 'Seizure']],
    ]));
    await expect(resolvePublicationHpo('HP:0001250', { fetchImpl })).resolves.toMatchObject({
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      obsolete: false,
    });
  });

  it.each(['HP:9999999', 'HP:1234567'])(
    'fails closed for a well-shaped unresolved HPO id: %s',
    async (identifier) => {
      const fetchImpl = vi.fn().mockResolvedValue(response([0, [], {
        name: [], is_obsolete: [], replaced_by: [],
      }, []]));
      await expect(resolvePublicationHpo(identifier, { fetchImpl })).resolves.toBeNull();
    },
  );

  it.each([
    ['HP:0005540', 'obsolete Red blood cell keratocytosis', 'HP:0004447'],
    ['HP:0025237', 'obsolete Confusional arousal', null],
  ])('fails closed for captured live obsolete HPO shape %s', async (identifier, name, replacedBy) => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      1,
      [identifier],
      { name: [name], is_obsolete: [null], replaced_by: [replacedBy] },
      [[identifier, name]],
    ]));
    await expect(resolvePublicationHpo(identifier, { fetchImpl })).resolves.toBeNull();
  });

  it('searches NLM without invoking a model and returns active HPO selections', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      2,
      ['HP:0001250', 'HP:0009999'],
      { name: ['Seizure', 'Obsolete'], is_obsolete: [false, true], replaced_by: [null, 'HP:0000001'] },
      [['HP:0001250', 'Seizure'], ['HP:0009999', 'Obsolete']],
    ]));
    await expect(searchPublicationConcepts('seiz', 'phenotype', { fetchImpl })).resolves.toEqual([
      expect.objectContaining({ kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'Seizure' }),
    ]);
  });

  it('keeps active null-flag HPO suggestions and removes explicit replacements', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      3,
      ['HP:0001250', 'HP:0005540', 'HP:0025237'],
      {
        name: ['Seizure', 'obsolete Red blood cell keratocytosis', 'obsolete Confusional arousal'],
        is_obsolete: [null, null, null],
        replaced_by: [null, 'HP:0004447', null],
      },
      [
        ['HP:0001250', 'Seizure'],
        ['HP:0005540', 'obsolete Red blood cell keratocytosis'],
        ['HP:0025237', 'obsolete Confusional arousal'],
      ],
    ]));
    await expect(searchPublicationConcepts('seiz', 'phenotype', { fetchImpl })).resolves.toEqual([
      expect.objectContaining({ identifier: 'HP:0001250' }),
    ]);
  });

  it('searches Monarch for MONDO disease selections and revalidates the entity', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ items: [
        {
          id: 'MONDO:0009061',
          name: 'Cystic fibrosis',
          category: ['biolink:Disease'],
          deprecated: null,
        },
        { id: 'HGNC:1884', name: 'CFTR', category: ['biolink:Gene'] },
      ] }))
      .mockResolvedValueOnce(response({
        id: 'MONDO:0009061',
        name: 'Cystic fibrosis',
        category: ['biolink:Disease'],
        deprecated: null,
      }));
    await expect(searchPublicationConcepts('cystic', 'disease', { fetchImpl })).resolves.toEqual([
      expect.objectContaining({ kind: 'mondo', identifier: 'MONDO:0009061' }),
    ]);
    await expect(resolvePublicationMondo('MONDO:0009061', { fetchImpl })).resolves.toEqual({
      identifier: 'MONDO:0009061',
      canonicalLabel: 'Cystic fibrosis',
      source: 'Monarch Initiative',
      apiVersion: 'v3',
    });
  });

  it.each([true, 'true', ' TRUE ', 1])(
    'rejects explicitly deprecated=%s MONDO suggestions and entity records',
    async (deprecated) => {
      const fetchImpl = vi.fn()
        .mockResolvedValueOnce(response({ items: [{
          id: 'MONDO:0009061', name: 'Deprecated disease', category: 'biolink:Disease', deprecated,
        }] }))
        .mockResolvedValueOnce(response({
          id: 'MONDO:0009061', name: 'Deprecated disease', category: 'biolink:Disease', deprecated,
        }));
      await expect(searchPublicationConcepts('deprecated', 'disease', { fetchImpl })).resolves.toEqual([]);
      await expect(resolvePublicationMondo('MONDO:0009061', { fetchImpl })).resolves.toBeNull();
    },
  );

  it('rejects category strings that merely contain the word disease', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ items: [{
        id: 'MONDO:0009061',
        name: 'Untrusted category',
        category: 'biolink:NotADisease',
        deprecated: null,
      }] }))
      .mockResolvedValueOnce(response({
        id: 'MONDO:0009061',
        name: 'Untrusted category',
        category: 'biolink:DiseaseOrPhenotypicFeature',
        deprecated: null,
      }));

    await expect(searchPublicationConcepts('category', 'disease', { fetchImpl })).resolves.toEqual([]);
    await expect(resolvePublicationMondo('MONDO:0009061', { fetchImpl })).resolves.toBeNull();
  });

  it('fails closed on an upstream timeout without manufacturing a resolved record', async () => {
    const timeoutError = Object.assign(new Error('upstream timed out'), { name: 'AbortError' });
    const fetchImpl = vi.fn().mockRejectedValue(timeoutError);

    await expect(searchPublicationConcepts('seizure', 'phenotype', { fetchImpl })).resolves.toEqual([]);
    await expect(resolvePublicationMondo('MONDO:0009061', { fetchImpl })).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    for (const [, options] of fetchImpl.mock.calls) {
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(__test.PUBLICATION_RESOLVER_TIMEOUT_MS).toBe(12_000);
  });

  it('resolves every external identity needed by one typed task', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response([
      1,
      ['HP:0001250'],
      { name: ['Seizure'], is_obsolete: [false], replaced_by: [null] },
      [['HP:0001250', 'Seizure']],
    ]));
    const result = await resolvePublicationTaskReferences(
      'candidate_gene_research',
      { operation: 'classify', query: { kind: 'hpo', identifier: 'HP:0001250' } },
      { fetchImpl },
    );
    expect(result.resolvedHpoById['HP:0001250']).toMatchObject({ canonicalLabel: 'Seizure' });
  });
});
