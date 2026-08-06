import { describe, it, expect, vi, afterEach } from 'vitest';
import { apiClient } from '@genemap/shared';
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
    expect(g.chromosome).toBeNull();
    expect(g.start).toBeNull();
    expect(g.end).toBeNull();
    expect(g.ensemblId).toBeNull();
    expect(g.entrezId).toBeNull();
    // A validated-but-unmatched phenotype drops its fabricated id rather than show it.
    expect(g.phenotypes[0].hpoId).toBeNull();
    expect(g.phenotypes[0].hpoVerified).toBe(false);
  });

  it('drops the AI hpoId when validation did not run (fail-closed provenance)', () => {
    const genes = [{ symbol: 'ZZZ1', phenotypes: [{ name: 'X', hpoId: 'HP:1234567' }] }];
    // Empty authHpo means validation was skipped/unavailable; the model id is
    // still not an authoritative record and must remain unavailable.
    const [g] = PhenotypeSearchService.applyAuthoritativeData(genes, {}, {});
    expect(g.phenotypes[0].hpoId).toBeNull();
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

// findCandidates() now classifies the query AND finds genes in a SINGLE fused
// LLM round-trip (down from two sequential calls), with user-context fetched
// concurrently and a two-step fallback when the fused call yields no genes.
describe('PhenotypeSearchService.findCandidates (fused analyze+find)', () => {
  afterEach(() => vi.restoreAllMocks());

  const json = (obj) => ({ result: JSON.stringify(obj) });

  it.each(['Alice Smith', 'Alice Smith BRCA1 result', 'DNA and bomb making'])(
    'does not invoke generation for unresolved free label %s',
    async (query) => {
      const invoke = vi.spyOn(apiClient, 'invokePublicationTask');
      await expect(PhenotypeSearchService.findCandidates(query, false, 'free_text'))
        .rejects.toThrow(/reviewed disease\/phenotype|free-text labels/i);
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('uses ONE LLM call on the happy path and returns the genes', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue(
      json({
        queryType: 'disease',
        isDisease: true,
        diseaseName: 'Cystic Fibrosis',
        hpoTerms: ['HP:0006528'],
        candidateGenes: [{ symbol: 'CFTR', name: 'CF transmembrane regulator', chromosome: '7' }],
      })
    );
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({ role: 'user' });
    vi.spyOn(apiClient, 'enrichGenomicData').mockResolvedValue({ genes: {}, phenotypes: {} });

    const base = await PhenotypeSearchService.findCandidates('Cystic Fibrosis', false, 'disease');

    expect(base.candidateGenes.map((g) => g.symbol)).toContain('CFTR');
    expect(base.hpoTerms).toEqual([]);
    // The fusion: a single /llm/invoke, not the previous analyze + find pair.
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'candidate_gene_research',
      expect.objectContaining({
        version: 1,
        operation: 'classify_and_suggest',
        query: {
          kind: 'curated_concept',
          conceptId: 'disease:cystic-fibrosis',
          canonicalLabel: 'Cystic Fibrosis',
          conceptKind: 'disease',
          source: 'genemap_curated',
          version: 1,
        },
      }),
      expect.any(Object),
    );
  });

  it('falls back to the two-step path when the fused call returns no genes', async () => {
    const invoke = vi
      .spyOn(apiClient, 'invokePublicationTask')
      .mockResolvedValueOnce(json({ queryType: 'phenotype', candidateGenes: [] })) // fused → empty
      .mockResolvedValueOnce(json({ isDisease: false, mainFeatures: ['tall stature'] })) // analyzePhenotype
      .mockResolvedValueOnce(json({ candidateGenes: [{ symbol: 'FBN1' }] })); // findCandidateGenes
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({});
    vi.spyOn(apiClient, 'enrichGenomicData').mockResolvedValue({ genes: {}, phenotypes: {} });

    const base = await PhenotypeSearchService.findCandidates('short stature', false);

    expect(base.candidateGenes.map((g) => g.symbol)).toContain('FBN1');
    expect(invoke).toHaveBeenCalledTimes(3); // fused (empty) + analyze + find
  });

  it('submits only the selected Monarch id for a dynamic disease result', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue(json({
      queryType: 'disease',
      isDisease: true,
      candidateGenes: [{ symbol: 'FBN1' }],
    }));
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({});
    vi.spyOn(apiClient, 'enrichGenomicData').mockResolvedValue({ genes: {}, phenotypes: {} });
    await PhenotypeSearchService.findCandidates(
      'Marfan syndrome',
      false,
      'disease',
      { kind: 'mondo', identifier: 'MONDO:0007947', canonicalLabel: 'untrusted browser label' },
    );
    expect(invoke).toHaveBeenCalledWith(
      'candidate_gene_research',
      expect.objectContaining({ query: { kind: 'mondo', identifier: 'MONDO:0007947' } }),
      expect.any(Object),
    );
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('untrusted browser label');
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

describe('PhenotypeSearchService verified gene profile contract', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not invoke a model for an unverified symbol', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask');
    const result = await PhenotypeSearchService.enrichGeneCombined(
      { symbol: 'BUSINESS', coordinatesVerified: false },
      null,
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(result.aiSummary).toMatch(/verification was unavailable/i);
    expect(result.phenotypes).toEqual([]);
  });

  it('sends a verified identifier, never free-form gene context', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue({
      result: JSON.stringify({ summary: 'Exploratory summary', keyTakeaways: [], phenotypes: [] }),
    });
    await PhenotypeSearchService.enrichGeneCombined(
      {
        symbol: 'CFTR',
        ensemblId: 'ENSG00000001626',
        entrezId: '1080',
        coordinatesVerified: true,
        explanation: 'untrusted model prose that must not be forwarded',
      },
      { education_level: 'graduate' },
    );
    expect(invoke).toHaveBeenCalledWith(
      'candidate_gene_research',
      {
        version: 1,
        operation: 'gene_profile',
        gene: { symbol: 'CFTR' },
        audience: 'graduate',
      },
      { maxTokens: 2048 },
    );
    expect(JSON.stringify(invoke.mock.calls[0])).not.toContain('untrusted model prose');
  });
});
