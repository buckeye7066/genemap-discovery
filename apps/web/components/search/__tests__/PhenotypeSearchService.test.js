import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import { PhenotypeSearchService } from '../PhenotypeSearchService';

afterEach(() => vi.restoreAllMocks());

describe('PhenotypeSearchService authoritative overlays', () => {
  it('replaces model-controlled metadata and carries real adapter timestamps', () => {
    const genes = [{
      symbol: 'RUNX1',
      chromosome: '21',
      start: 1,
      end: 2,
      ensemblId: 'AI-GUESS',
      entrezId: 'AI-GUESS',
      name: 'model name',
      phenotypes: [{ name: 'Leukemia', hpoId: 'HP:FABRICATED' }],
    }];
    const authGenes = {
      RUNX1: {
        verified: true,
        chromosome: '21',
        start: 34787801,
        end: 36004667,
        ensemblId: 'ENSG00000159216',
        entrezId: '861',
        name: 'RUNX1 (authoritative)',
        genomeBuild: 'GRCh38',
        mapLocation: '21q22.12',
        source: 'MyGene.info',
        retrievedAt: '2026-08-09T14:00:00.000Z',
      },
    };
    const authHpo = {
      leukemia: {
        hpoId: 'HP:0001909',
        name: 'Leukemia',
        verified: true,
        retrievedAt: '2026-08-09T14:01:00.000Z',
      },
    };

    const [gene] = PhenotypeSearchService.applyAuthoritativeData(genes, authGenes, authHpo);
    expect(gene).toMatchObject({
      coordinatesVerified: true,
      start: 34787801,
      end: 36004667,
      ensemblId: 'ENSG00000159216',
      entrezId: '861',
      name: 'RUNX1 (authoritative)',
      authoritativeRetrievedAt: '2026-08-09T14:00:00.000Z',
    });
    expect(gene.sources[0]).toMatch(/MyGene\.info/i);
    expect(gene.phenotypes[0]).toMatchObject({
      hpoId: 'HP:0001909',
      hpoVerified: true,
      retrievedAt: '2026-08-09T14:01:00.000Z',
    });
  });

  it('fails closed when authoritative gene or HPO records are unavailable', () => {
    const [gene] = PhenotypeSearchService.applyAuthoritativeData(
      [{
        symbol: 'ZZZ1',
        chromosome: '1',
        start: 1,
        end: 2,
        ensemblId: 'AI-GUESS',
        phenotypes: [{ name: 'Some phenotype', hpoId: 'HP:FABRICATED' }],
      }],
      {},
      { 'some phenotype': { hpoId: null, verified: false, retrievedAt: null } },
    );

    expect(gene.coordinatesVerified).toBe(false);
    expect(gene.chromosome).toBeNull();
    expect(gene.start).toBeNull();
    expect(gene.end).toBeNull();
    expect(gene.ensemblId).toBeNull();
    expect(gene.entrezId).toBeNull();
    expect(gene.authoritativeRetrievedAt).toBeNull();
    expect(gene.phenotypes[0]).toMatchObject({
      hpoId: null,
      hpoVerified: false,
      retrievedAt: null,
    });
  });
});

describe('PhenotypeSearchService provenance', () => {
  it('keeps identity and ontology records outside association ranking', () => {
    const [gene] = PhenotypeSearchService.finalizeEnriched(
      [{
        symbol: 'RUNX1',
        coordinatesVerified: true,
        ensemblId: 'ENSG00000159216',
        genomeBuild: 'GRCh38',
        verifiedSource: 'MyGene.info',
        authoritativeRetrievedAt: '2026-08-09T14:00:00.000Z',
        phenotypes: [{ name: 'Seizure', hpoId: 'HP:FAKE' }],
        furtherReading: {
          resources: [{ name: 'PubMed search', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=RUNX1' }],
        },
      }],
      {
        seizure: {
          hpoId: 'HP:0001250',
          verified: true,
          retrievedAt: '2026-08-09T14:01:00.000Z',
        },
      },
      'seizure',
    );

    expect(gene.rankingBasis).toBe('ai_lead');
    expect(gene.evidencePartition.aiLeads).toHaveLength(1);
    expect(gene.evidencePartition.human).toHaveLength(0);
    expect(gene.evidencePartition.metadata).toEqual(expect.arrayContaining([
      expect.objectContaining({
        evidenceClass: 'human_verified',
        evidenceType: 'gene_identity',
        retrievalDate: '2026-08-09',
      }),
    ]));
    const ontology = gene.evidencePartition.external.find(
      (claim) => claim.evidenceType === 'phenotype_ontology',
    );
    expect(ontology).toMatchObject({
      recordId: 'HP:0001250',
      retrievalDate: '2026-08-09',
    });
    const followup = gene.evidencePartition.external.find(
      (claim) => claim.evidenceType === 'database_link',
    );
    expect(followup.retrievalDate).toBeNull();
    expect(gene.evidencePartition.aiLeads[0].retrievalDate).toBeNull();
  });

  it('strips model scores and preserves original lead order for metadata-only ties', () => {
    const ranked = PhenotypeSearchService.attachProvenance([
      { symbol: 'AI1', score: 0.99, confidenceScore: 99, coordinatesVerified: false },
      {
        symbol: 'VER1',
        score: 0.1,
        coordinatesVerified: true,
        ensemblId: 'ENSG00000001626',
        genomeBuild: 'GRCh38',
        authoritativeRetrievedAt: '2026-08-09T14:00:00.000Z',
      },
    ], 'cystic fibrosis');

    expect(ranked.map((gene) => gene.symbol)).toEqual(['AI1', 'VER1']);
    expect(ranked[0].score).toBeUndefined();
    expect(ranked[0].confidenceScore).toBeUndefined();
    expect(ranked[1].rankingBasis).toBe('ai_lead');
  });
});

describe('PhenotypeSearchService staged candidate journey', () => {
  const envelope = (value) => ({ result: JSON.stringify(value), disclaimer: 'educational' });

  it.each(['Alice Smith', 'Alice Smith BRCA1 result', 'DNA and bomb making'])(
    'does not invoke generation for unresolved free label %s',
    async (query) => {
      const invoke = vi.spyOn(apiClient, 'invokePublicationTask');
      await expect(
        PhenotypeSearchService.findCandidates(query, false, 'free_text'),
      ).rejects.toThrow(/reviewed disease\/phenotype|exact HPO/i);
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('uses one strict fused task, caps before enrichment, and returns cards', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue(envelope({
      queryType: 'disease',
      isDisease: true,
      diseaseName: 'Cystic Fibrosis',
      candidateGenes: [{ symbol: 'CFTR', name: 'CF transmembrane regulator' }],
    }));
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({ role: 'user' });
    const enrich = vi.spyOn(apiClient, 'enrichGenomicData').mockResolvedValue({
      genes: {},
      phenotypes: {},
    });

    const base = await PhenotypeSearchService.findCandidates(
      'Cystic Fibrosis',
      false,
      'disease',
    );

    expect(base.candidateGenes.map((gene) => gene.symbol)).toEqual(['CFTR']);
    expect(base.candidateGenes[0].rankingBasis).toBe('ai_lead');
    expect(base.hpoTerms).toEqual([]);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith(
      'candidate_gene_research',
      expect.objectContaining({
        version: 1,
        operation: 'classify_and_suggest',
        query: expect.objectContaining({
          kind: 'curated_concept',
          conceptId: 'disease:cystic-fibrosis',
        }),
      }),
      { maxTokens: 4096 },
    );
    expect(enrich).toHaveBeenCalledWith(['CFTR'], []);
  });

  it('falls back through classify and suggest when the fused result is sparse', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask')
      .mockResolvedValueOnce(envelope({ queryType: 'disease', isDisease: true, candidateGenes: [] }))
      .mockResolvedValueOnce(envelope({ queryType: 'disease', isDisease: true, mainFeatures: [] }))
      .mockResolvedValueOnce(envelope({ candidateGenes: [{ symbol: 'CFTR' }] }));
    vi.spyOn(apiClient, 'getMe').mockResolvedValue({});
    vi.spyOn(apiClient, 'enrichGenomicData').mockResolvedValue({ genes: {}, phenotypes: {} });

    const base = await PhenotypeSearchService.findCandidates(
      'Cystic Fibrosis',
      false,
      'disease',
    );

    expect(base.candidateGenes.map((gene) => gene.symbol)).toEqual(['CFTR']);
    expect(invoke).toHaveBeenCalledTimes(3);
    expect(invoke.mock.calls[1][1]).toMatchObject({ version: 1, operation: 'classify' });
    expect(invoke.mock.calls[2][1]).toMatchObject({ version: 1, operation: 'suggest_candidates' });
  });

  it('submits only the selected MONDO identifier, not the browser label', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue(envelope({
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
      {
        kind: 'mondo',
        identifier: 'MONDO:0007947',
        canonicalLabel: 'untrusted browser label',
      },
    );

    const taskInput = invoke.mock.calls[0][1];
    expect(taskInput.query).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });
    expect(JSON.stringify(taskInput)).not.toContain('untrusted browser label');
  });
});

describe('PhenotypeSearchService profile and comparison behavior', () => {
  it('deduplicates phenotype names case-insensitively and bounds the resolver batch', () => {
    const names = PhenotypeSearchService.collectPhenotypeNames([
      { phenotypes: [{ name: 'Seizure' }, { name: 'seizure' }, { name: 'Ataxia' }] },
    ]);
    // Display casing is not authoritative until HPO resolution; only normalized
    // membership and bounded cardinality matter at this collection stage.
    expect(names.map((name) => name.toLowerCase())).toEqual(['seizure', 'ataxia']);
    expect(names.length).toBeLessThanOrEqual(60);
  });

  it('does not invoke a model for an unverified symbol', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask');
    const result = await PhenotypeSearchService.enrichGeneCombined(
      { symbol: 'BUSINESS', coordinatesVerified: false },
      null,
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(result.profileStatus).toBe('unavailable');
    expect(result.aiSummary).toMatch(/AI-suggested candidate lead/i);
    expect(result.phenotypes).toEqual([]);
  });

  it('sends only a verified symbol and honors explicit server profile states', async () => {
    const invoke = vi.spyOn(apiClient, 'invokePublicationTask').mockResolvedValue({
      result: JSON.stringify({
        summary: 'Generated profile withheld because the response crossed the boundary.',
        summaryStatus: 'withheld',
        keyTakeaways: [],
        phenotypes: [],
      }),
      disclaimer: 'educational',
    });
    const result = await PhenotypeSearchService.enrichGeneCombined(
      {
        symbol: 'CFTR',
        ensemblId: 'ENSG00000001626',
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
    expect(result.profileStatus).toBe('withheld');
  });

  it('uses a deterministic unavailable state after a profile-call failure', async () => {
    vi.spyOn(apiClient, 'invokePublicationTask').mockRejectedValue(new Error('provider outage'));
    const [result] = await PhenotypeSearchService.enrichGeneData([
      {
        symbol: 'CFTR',
        ensemblId: 'ENSG00000001626',
        coordinatesVerified: true,
      },
    ], false, null);

    expect(result.profileStatus).toBe('unavailable');
    expect(result.aiSummary).toMatch(/Generated profile unavailable/i);
    expect(result.aiSummary).not.toMatch(/is associated with/i);
  });

  it('compares lists deterministically without personal interpretation', async () => {
    const comparison = await PhenotypeSearchService.compareGeneSets(
      ['CFTR', 'RUNX1'],
      ['CFTR', 'FBN1'],
      'cystic fibrosis',
      false,
    );
    expect(comparison.overlapping).toEqual(['CFTR']);
    expect(comparison.uniqueToUser).toEqual(['RUNX1']);
    expect(comparison.uniqueToPhenotype).toEqual(['FBN1']);
    expect(comparison.functionalRelationships).toEqual([]);
    expect(comparison.analysis).toMatch(/does not evaluate a person's genome/i);
  });
});
