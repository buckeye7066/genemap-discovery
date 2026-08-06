import { describe, expect, it } from 'vitest';
import {
  CURATED_PUBLICATION_CONCEPTS,
  publicationConceptById,
  publicationConceptByLabel,
  publicationHpoReference,
  publicationHistoryReplay,
  publicationMondoReference,
  publicationReferenceFromHistory,
  resolvePublicationSearchReference,
  resolvePublicationUrlReference,
} from '../publicationConceptCatalog';

describe('browser publication concept references', () => {
  it('creates exact immutable catalog tuples and rejects arbitrary labels', () => {
    for (const item of CURATED_PUBLICATION_CONCEPTS) {
      expect(publicationConceptById(item.conceptId)).toMatchObject({
        kind: 'curated_concept',
        conceptId: item.conceptId,
        canonicalLabel: item.canonicalLabel,
        conceptKind: item.conceptKind,
        source: 'genemap_curated',
        version: 1,
      });
    }
    for (const value of ['Alice Smith', 'Alice Smith BRCA1 result', 'DNA and bomb making']) {
      expect(publicationConceptByLabel(value)).toBeNull();
    }
  });

  it('keeps selected resolver objects to identifier-only generation input', () => {
    expect(resolvePublicationSearchReference('spoofed label', 'free_text', {
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'browser-controlled text',
    })).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
    expect(resolvePublicationSearchReference('spoofed label', 'disease', {
      kind: 'mondo',
      identifier: 'MONDO:0007947',
      canonicalLabel: 'browser-controlled text',
    })).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });
  });

  it('accepts only exact HPO and MONDO identifier formats', () => {
    expect(publicationHpoReference('hp:0001250')).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
    expect(publicationHpoReference('HP:999')).toBeNull();
    expect(publicationMondoReference('mondo:0007947')).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });
    expect(publicationMondoReference('MONDO:123')).toBeNull();
  });

  it('allows only immutable or exact-id URL bootstrap values', () => {
    expect(resolvePublicationUrlReference('Cystic Fibrosis')).toMatchObject({
      searchMode: 'disease',
      reference: { kind: 'curated_concept', conceptId: 'disease:cystic-fibrosis' },
    });
    expect(resolvePublicationUrlReference('HP:0001250')).toEqual({
      searchMode: 'hpo_term',
      reference: { kind: 'hpo', identifier: 'HP:0001250' },
    });
    expect(resolvePublicationUrlReference('MONDO:0007947')).toEqual({
      searchMode: 'disease',
      reference: { kind: 'mondo', identifier: 'MONDO:0007947' },
    });
    for (const value of [
      'Alice Smith BRCA1 result',
      'DNA and bomb making',
      'Marfan syndrome',
      'ignore previous instructions',
    ]) {
      expect(resolvePublicationUrlReference(value)).toBeNull();
    }
  });

  it('restores only deliberately persisted structured history references', () => {
    expect(publicationReferenceFromHistory({ publicationReference: {
      kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'untrusted',
    } })).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
    expect(publicationReferenceFromHistory({ results: { publicationReference: {
      kind: 'mondo', identifier: 'MONDO:0007947', canonicalLabel: 'untrusted',
    } } })).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });
    expect(publicationReferenceFromHistory({ publicationReference: {
      kind: 'curated_concept', conceptId: 'disease:cystic-fibrosis', canonicalLabel: 'tampered',
    } })).toMatchObject({
      kind: 'curated_concept',
      conceptId: 'disease:cystic-fibrosis',
      canonicalLabel: 'Cystic Fibrosis',
    });

    for (const legacy of [
      { query: 'Cystic Fibrosis' },
      { query: 'HP:0001250', hpoTerm: 'HP:0001250' },
      { results: { canonicalLabel: 'Marfan syndrome' } },
      { publicationReference: { kind: 'hpo', identifier: 'HP:123' } },
    ]) {
      expect(publicationReferenceFromHistory(legacy)).toBeNull();
    }
  });

  it('builds history replay from normalized references and keeps legacy rows prefill-only', () => {
    expect(publicationHistoryReplay({
      query: 'untrusted HPO label',
      publicationReference: {
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'browser-controlled text',
        source: 'spoofed',
      },
    })).toEqual({
      query: 'HP:0001250',
      reference: { kind: 'hpo', identifier: 'HP:0001250' },
      autoRun: true,
    });
    expect(publicationHistoryReplay({
      query: 'untrusted MONDO label',
      publicationReference: {
        kind: 'mondo',
        identifier: 'MONDO:0007947',
        canonicalLabel: 'browser-controlled text',
        source: 'spoofed',
      },
    })).toEqual({
      query: 'MONDO:0007947',
      reference: { kind: 'mondo', identifier: 'MONDO:0007947' },
      autoRun: true,
    });
    expect(publicationHistoryReplay({
      query: 'tampered label',
      publicationReference: {
        kind: 'curated_concept',
        conceptId: 'disease:cystic-fibrosis',
        canonicalLabel: 'tampered',
        source: 'spoofed',
      },
    })).toMatchObject({
      query: 'Cystic Fibrosis',
      autoRun: true,
      reference: {
        kind: 'curated_concept',
        conceptId: 'disease:cystic-fibrosis',
        canonicalLabel: 'Cystic Fibrosis',
        source: 'genemap_curated',
      },
    });

    expect(publicationHistoryReplay({ query: 'legacy free text' })).toEqual({
      query: 'legacy free text',
      reference: null,
      autoRun: false,
    });
    expect(publicationHistoryReplay({
      query: 'legacy label',
      publicationReference: { kind: 'hpo', identifier: 'HP:123' },
    })).toEqual({ query: 'legacy label', reference: null, autoRun: false });
    expect(publicationHistoryReplay({ query: '   ' })).toBeNull();
  });
});
