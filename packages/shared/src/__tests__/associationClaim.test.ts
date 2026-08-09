import { describe, expect, it } from 'vitest';
import {
  aiLeadClaim,
  claimProvenanceRole,
  claimSortKey,
  createAssociationClaim,
  deriveRankingBasisFromClaims,
  externalFollowupClaim,
  humanGeneIdentityClaim,
  hpoPhenotypeClaim,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  safeExternalHttpUrl,
  stripLlmSelfScores,
} from '../associationClaim.js';

describe('associationClaim', () => {
  it('builds AI leads without treating them as verified evidence', () => {
    const claim = aiLeadClaim('CFTR', 'cystic fibrosis');
    expect(claim.isAiLead).toBe(true);
    expect(claim.evidenceClass).toBe('ai_lead');
    expect(claim.evidenceStrength).toBe('lead');
    expect(claim.recordId).toBeNull();
    expect(claim.referenceAssembly).toBeNull();
    expect(claim.species).toBe('Homo sapiens');
    expect(claim.retrievalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(claimSortKey(claim)).toBe(0);
    expect(claimProvenanceRole(claim)).toBe('ai_candidate_lead');
  });

  it('records reference assembly separately from an unknown source release', () => {
    const claim = humanGeneIdentityClaim({
      symbol: 'CFTR',
      ensemblId: 'ENSG00000001626',
      entrezId: '1080',
      genomeBuild: 'GRCh38',
      retrievalDate: '2026-08-08',
    });
    expect(claim.evidenceClass).toBe('human_verified');
    expect(claim.evidenceType).toBe('gene_identity');
    expect(claim.taxon).toBe('9606');
    expect(claim.releaseVersion).toBeNull();
    expect(claim.referenceAssembly).toBe('GRCh38');
    expect(claim.directLink).toContain('ENSG00000001626');
    expect(claim.isAiLead).toBe(false);
    expect(claimSortKey(claim)).toBe(0);
    expect(claimProvenanceRole(claim)).toBe('source_metadata');
  });

  it('retains a real source release when an authoritative adapter supplies one', () => {
    const claim = humanGeneIdentityClaim({
      symbol: 'RUNX1',
      entrezId: '861',
      genomeBuild: 'GRCh38',
      sourceVersion: 'MyGene.info 2026-08 snapshot',
    });
    expect(claim.releaseVersion).toBe('MyGene.info 2026-08 snapshot');
    expect(claim.referenceAssembly).toBe('GRCh38');
  });

  it('keeps HPO term verification visible but outside association ranking', () => {
    const claim = hpoPhenotypeClaim({
      geneSymbol: 'SCN1A',
      phenotypeName: 'Seizure',
      hpoId: 'HP:0001250',
      retrievalDate: '2026-08-08',
    });
    expect(claim.taxon).toBe('9606');
    expect(claim.recordId).toBe('HP:0001250');
    expect(claim.releaseVersion).toBeNull();
    expect(claim.directLink).toContain('HP:0001250');
    expect(claimSortKey(claim)).toBe(0);
    expect(claimProvenanceRole(claim)).toBe('source_metadata');
  });

  it('keeps only absolute HTTP(S) provenance links at the shared boundary', () => {
    expect(safeExternalHttpUrl('https://example.org/record?id=1')).toBe('https://example.org/record?id=1');
    expect(safeExternalHttpUrl(' http://example.org/source ')).toBe('http://example.org/source');
    expect(safeExternalHttpUrl('javascript:alert(1)')).toBeNull();
    expect(safeExternalHttpUrl('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeExternalHttpUrl('/relative/source')).toBeNull();
    expect(safeExternalHttpUrl(null)).toBeNull();

    const unsafe = externalFollowupClaim({
      geneSymbol: 'RUNX1',
      database: 'Untrusted model output',
      url: 'javascript:alert(1)',
    });
    expect(unsafe.directLink).toBeNull();
    expect(claimSortKey(unsafe)).toBe(0);

    const safe = externalFollowupClaim({
      geneSymbol: 'RUNX1',
      database: 'Official database',
      url: 'https://example.org/RUNX1',
    });
    expect(safe.directLink).toBe('https://example.org/RUNX1');
    expect(claimSortKey(safe)).toBe(0);
  });

  it('separates human, animal, computational, and AI claims', () => {
    const claims = [
      aiLeadClaim('X', 'y'),
      humanGeneIdentityClaim({ symbol: 'X', ensemblId: 'ENSG1' }),
      createAssociationClaim({
        source: 'MGI',
        recordId: 'MGI:123',
        claim: 'mouse ortholog evidence',
        taxon: '10090',
        evidenceClass: 'animal_model',
        evidenceType: 'ortholog_association',
        evidenceStrength: 'supporting',
        releaseVersion: 'MGI-2026',
        directLink: 'https://www.informatics.jax.org/marker/MGI:123',
      }),
      createAssociationClaim({
        source: 'In-silico predictor',
        recordId: null,
        claim: 'computational association score',
        taxon: '9606',
        evidenceClass: 'computational',
        evidenceType: 'gene_phenotype_association_prediction',
        evidenceStrength: 'supporting',
        releaseVersion: 'v1',
        directLink: null,
      }),
    ];
    const parts = partitionClaimsBySpecies(claims);
    expect(parts.aiLeads).toHaveLength(1);
    expect(parts.human).toHaveLength(1);
    expect(parts.animal).toHaveLength(1);
    expect(parts.computational).toHaveLength(1);
  });

  it('derives one ranking basis from genuine association evidence only', () => {
    const identity = humanGeneIdentityClaim({ symbol: 'RUNX1', entrezId: '861' });
    const computational = createAssociationClaim({
      source: 'Reviewed computational fixture',
      recordId: 'COMP:1',
      claim: 'RUNX1 computationally supports the bounded research query',
      taxon: '9606',
      evidenceClass: 'computational',
      evidenceType: 'gene_phenotype_association_prediction',
      evidenceStrength: 'supporting',
      releaseVersion: 'v1',
      directLink: 'https://example.org/COMP:1',
    });
    expect(deriveRankingBasisFromClaims([aiLeadClaim('RUNX1', 'q'), identity])).toBe('ai_lead');
    expect(deriveRankingBasisFromClaims([identity, computational])).toBe('computational');
    expect(claimProvenanceRole(computational)).toBe('association_evidence');
  });

  it('promotes genuine association evidence but preserves lead order for metadata-only ties', () => {
    const humanAssociation = createAssociationClaim({
      source: 'Curated association source',
      recordId: 'ASSOC:1',
      claim: 'ASSOC1 is supported for the bounded research query',
      taxon: '9606',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_disease_association',
      evidenceStrength: 'strong',
      releaseVersion: '2026.1',
      directLink: 'https://example.org/associations/1',
    });
    expect(claimSortKey(humanAssociation)).toBeGreaterThan(0);

    const genes = [
      {
        symbol: 'AI1',
        score: 0.99,
        coordinatesVerified: false,
        associationClaims: [aiLeadClaim('AI1', 'q')],
      },
      {
        symbol: 'ID1',
        score: 0.1,
        coordinatesVerified: true,
        associationClaims: [
          aiLeadClaim('ID1', 'q'),
          humanGeneIdentityClaim({ symbol: 'ID1', ensemblId: 'ENSG2' }),
        ],
      },
      {
        symbol: 'ASSOC1',
        score: 0.01,
        coordinatesVerified: false,
        associationClaims: [aiLeadClaim('ASSOC1', 'q'), humanAssociation],
      },
    ];

    const ranked = rankGenesByProvenance(genes);
    expect(ranked.map((gene) => gene.symbol)).toEqual(['ASSOC1', 'AI1', 'ID1']);
    expect(stripLlmSelfScores(ranked[0]).score).toBeUndefined();
    expect(stripLlmSelfScores(ranked[1]).confidence_score).toBeUndefined();
  });
});
