import { describe, it, expect } from 'vitest';
import { PhenotypeSearchService } from '../PhenotypeSearchService';

// applyAuthoritativeData() is the merge that overlays real (MyGene.info/HPO)
// data onto the LLM's candidate genes and tags provenance. These lock in the
// exact behavior the UI relies on for the verified vs AI-estimated distinction.
describe('PhenotypeSearchService.applyAuthoritativeData', () => {
  it('overlays a verified gene record and validated HPO id, tagging provenance', () => {
    const genes = [{
      symbol: 'RUNX1',
      // The hallucinated, suspiciously-round values the LLM produced.
      chromosome: '21', start: 36160001, end: 36610000,
      ensemblId: 'AI-GUESS', entrezId: 'AI-GUESS', name: 'runt related tx factor',
      phenotypes: [{ name: 'Leukemia', hpoId: 'HP:FABRICATED' }],
    }];
    const authGenes = {
      RUNX1: {
        verified: true, chromosome: '21', start: 34787801, end: 36004667,
        ensemblId: 'ENSG00000159216', entrezId: '861', name: 'RUNX1 (authoritative)',
        genomeBuild: 'GRCh38', mapLocation: '21q22.12', source: 'MyGene.info',
      },
    };
    const authHpo = { leukemia: { hpoId: 'HP:0001909', name: 'Leukemia', verified: true } };

    const [g] = PhenotypeSearchService.applyAuthoritativeData(genes, authGenes, authHpo);

    expect(g.coordinatesVerified).toBe(true);
    // Authoritative values replace the AI guesses.
    expect(g.start).toBe(34787801);
    expect(g.end).toBe(36004667);
    expect(g.ensemblId).toBe('ENSG00000159216');
    expect(g.entrezId).toBe('861');
    expect(g.name).toBe('RUNX1 (authoritative)');
    expect(g.sources).toContain('Ensembl/NCBI (verified)');
    // HPO id is replaced with the validated one and flagged.
    expect(g.phenotypes[0]).toMatchObject({ hpoId: 'HP:0001909', hpoVerified: true });
    expect(g.hpoChecked).toBe(true);
  });

  it('keeps AI data clearly labeled when no authoritative record exists', () => {
    const genes = [{
      symbol: 'ZZZ1', chromosome: '1', start: 1, end: 2,
      phenotypes: [{ name: 'Some phenotype', hpoId: 'HP:FABRICATED' }],
    }];
    // Gene unresolved; HPO validation ran but found no match for the phenotype.
    const [g] = PhenotypeSearchService.applyAuthoritativeData(
      genes, {}, { 'some phenotype': { hpoId: null, verified: false } }
    );

    expect(g.coordinatesVerified).toBe(false);
    expect(g.sources).toEqual(['AI-suggested']);
    // A validated-but-unmatched phenotype drops its fabricated id rather than show it.
    expect(g.phenotypes[0].hpoId).toBeNull();
    expect(g.phenotypes[0].hpoVerified).toBe(false);
  });

  it('keeps the AI hpoId when validation did not run at all (endpoint unavailable)', () => {
    const genes = [{ symbol: 'ZZZ1', phenotypes: [{ name: 'X', hpoId: 'HP:1234567' }] }];
    // Empty authHpo means validation was skipped/unavailable — don't drop the id.
    const [g] = PhenotypeSearchService.applyAuthoritativeData(genes, {}, {});
    expect(g.phenotypes[0].hpoId).toBe('HP:1234567');
    expect(g.hpoChecked).toBe(false);
  });

  it('does not mark a gene verified when the record lacks coordinates', () => {
    const genes = [{ symbol: 'ABC1', chromosome: '5', start: 10, end: 20 }];
    const authGenes = { ABC1: { verified: false, chromosome: null, start: null, end: null } };
    const [g] = PhenotypeSearchService.applyAuthoritativeData(genes, authGenes, {});
    expect(g.coordinatesVerified).toBe(false);
    expect(g.sources).toEqual(['AI-suggested']);
  });
});

describe('PhenotypeSearchService.finalizeEnriched', () => {
  it('restores honest sources from coordinatesVerified and validates HPO', () => {
    const enriched = [
      { symbol: 'A', coordinatesVerified: true, sources: ['AI-suggested'], phenotypes: [{ name: 'Seizure', hpoId: 'HP:FAKE' }] },
      { symbol: 'B', coordinatesVerified: false, sources: ['AI-suggested'], phenotypes: [{ name: 'Nope', hpoId: 'HP:FAKE' }] },
    ];
    const authHpo = { seizure: { hpoId: 'HP:0001250', verified: true } , nope: { hpoId: null, verified: false } };
    const [a, b] = PhenotypeSearchService.finalizeEnriched(enriched, authHpo);
    expect(a.sources).toContain('Ensembl/NCBI (verified)');
    expect(a.phenotypes[0]).toMatchObject({ hpoId: 'HP:0001250', hpoVerified: true });
    expect(b.sources).toEqual(['AI-suggested']);
    // validation ran (authHpo non-empty) but no match → drop fabricated id
    expect(b.phenotypes[0].hpoId).toBeNull();
  });
});

describe('PhenotypeSearchService.collectPhenotypeNames', () => {
  it('dedupes, caps per gene, and bounds the total', () => {
    const genes = [
      { phenotypes: [{ name: 'A' }, { name: 'A' }, { name: 'B' }] },
      { phenotypes: [{ name: 'b' }, { name: 'C' }] },
    ];
    const names = PhenotypeSearchService.collectPhenotypeNames(genes);
    expect(names).toContain('A');
    expect(names).toContain('B');
    expect(names).toContain('C');
    // 'b' is a distinct string from 'B' at collection time (validation lowercases later).
    expect(names.length).toBeLessThanOrEqual(60);
  });
});
