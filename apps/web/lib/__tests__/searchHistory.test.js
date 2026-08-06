import { describe, it, expect } from 'vitest';
import {
  normalizeSearchHistoryEntry,
  publicationReferenceFromSearchHistoryEntry,
} from '../searchHistory.js';

describe('normalizeSearchHistoryEntry', () => {
  it('reads the current backend contract (query/queryType/results/createdAt)', () => {
    const out = normalizeSearchHistoryEntry({
      id: 'a',
      query: 'hearing loss',
      queryType: 'premium',
      createdAt: '2026-06-23T00:00:00Z',
      results: {
        hpoTerm: 'HP:0000365',
        publicationReference: { kind: 'hpo', identifier: 'HP:0000365' },
        candidateGenes: ['GJB2', 'MYO7A'],
        count: 2,
      },
    });
    expect(out).toMatchObject({
      id: 'a',
      query: 'hearing loss',
      queryType: 'premium',
      createdAt: '2026-06-23T00:00:00Z',
      hpoTerm: 'HP:0000365',
      publicationReference: { kind: 'hpo', identifier: 'HP:0000365' },
      candidateGenes: ['GJB2', 'MYO7A'],
      count: 2,
    });
  });

  it('falls back to legacy Base44 snake_case fields', () => {
    const out = normalizeSearchHistoryEntry({
      id: 'b',
      phenotype_query: 'short stature',
      search_type: 'free',
      created_date: '2026-01-01T00:00:00Z',
      hpo_term: 'HP:0004322',
      candidate_genes: ['FGFR3'],
      results_count: 1,
    });
    expect(out.query).toBe('short stature');
    expect(out.queryType).toBe('free');
    expect(out.createdAt).toBe('2026-01-01T00:00:00Z');
    expect(out.hpoTerm).toBe('HP:0004322');
    expect(out.candidateGenes).toEqual(['FGFR3']);
    expect(out.count).toBe(1);
  });

  it('derives count from candidateGenes length when no explicit count', () => {
    const out = normalizeSearchHistoryEntry({ query: 'x', results: { candidateGenes: ['A', 'B', 'C'] } });
    expect(out.count).toBe(3);
  });

  it('never throws and yields safe defaults for an empty record', () => {
    const out = normalizeSearchHistoryEntry({});
    expect(out.query).toBe('(unknown search)');
    expect(out.queryType).toBe('free');
    expect(out.candidateGenes).toEqual([]);
    expect(out.count).toBe(0);
  });

  it('recovers only bounded references from current and legacy history', () => {
    expect(publicationReferenceFromSearchHistoryEntry({
      query: 'spoofed label',
      results: {
        publicationReference: {
          kind: 'hpo',
          identifier: 'hp:0001250',
          canonicalLabel: 'browser-controlled text',
        },
      },
    })).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });

    expect(publicationReferenceFromSearchHistoryEntry({
      query: 'ignored label',
      results: {
        publicationReference: {
          kind: 'curated_concept',
          conceptId: 'disease:cystic-fibrosis',
          canonicalLabel: 'spoofed',
        },
      },
    })).toMatchObject({
      kind: 'curated_concept',
      conceptId: 'disease:cystic-fibrosis',
      canonicalLabel: 'Cystic Fibrosis',
    });

    expect(publicationReferenceFromSearchHistoryEntry({
      query: 'MONDO:0007947',
    })).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });

    expect(publicationReferenceFromSearchHistoryEntry({
      query: 'legacy label',
      results: { hpoTerm: 'HP:0004322' },
    })).toEqual({ kind: 'hpo', identifier: 'HP:0004322' });

    expect(publicationReferenceFromSearchHistoryEntry({
      query: 'Alice Smith BRCA1 result',
    })).toBeNull();
  });

});
