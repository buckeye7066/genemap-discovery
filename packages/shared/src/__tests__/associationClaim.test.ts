import { describe, expect, it } from 'vitest';
import {
  aiLeadClaim,
  createAssociationClaim,
  humanGeneIdentityClaim,
  hpoPhenotypeClaim,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  stripLlmSelfScores,
} from '../associationClaim.js';

describe('associationClaim', () => {
  it('builds AI leads without treating them as verified evidence', () => {
    const claim = aiLeadClaim('CFTR', 'cystic fibrosis');
    expect(claim.isAiLead).toBe(true);
    expect(claim.evidenceClass).toBe('ai_lead');
    expect(claim.evidenceStrength).toBe('lead');
    expect(claim.recordId).toBeNull();
    expect(claim.species).toBe('Homo sapiens');
    expect(claim.retrievalDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('attaches human gene identity provenance with version and link', () => {
    const claim = humanGeneIdentityClaim({
      symbol: 'CFTR',
      ensemblId: 'ENSG00000001626',
      entrezId: '1080',
      genomeBuild: 'GRCh38',
      retrievalDate: '2026-08-08',
    });
    expect(claim.evidenceClass).toBe('human_verified');
    expect(claim.taxon).toBe('9606');
    expect(claim.releaseVersion).toBe('GRCh38');
    expect(claim.directLink).toContain('ENSG00000001626');
    expect(claim.isAiLead).toBe(false);
  });

  it('keeps HPO claims human-only and linked', () => {
    const claim = hpoPhenotypeClaim({
      geneSymbol: 'SCN1A',
      phenotypeName: 'Seizure',
      hpoId: 'HP:0001250',
      retrievalDate: '2026-08-08',
    });
    expect(claim.taxon).toBe('9606');
    expect(claim.recordId).toBe('HP:0001250');
    expect(claim.directLink).toContain('HP:0001250');
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
        evidenceType: 'ortholog',
        evidenceStrength: 'supporting',
        releaseVersion: 'MGI-2026',
        directLink: 'https://www.informatics.jax.org/marker/MGI:123',
      }),
      createAssociationClaim({
        source: 'In-silico predictor',
        recordId: null,
        claim: 'computational score',
        taxon: '9606',
        evidenceClass: 'computational',
        evidenceType: 'in_silico',
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

  it('ranks verified provenance above AI leads and strips LLM self-scores', () => {
    const genes = [
      {
        symbol: 'AI1',
        score: 0.99,
        coordinatesVerified: false,
        associationClaims: [aiLeadClaim('AI1', 'q')],
      },
      {
        symbol: 'VER1',
        score: 0.1,
        coordinatesVerified: true,
        associationClaims: [
          aiLeadClaim('VER1', 'q'),
          humanGeneIdentityClaim({ symbol: 'VER1', ensemblId: 'ENSG2' }),
        ],
      },
    ];
    const ranked = rankGenesByProvenance(genes);
    expect(ranked.map((g) => g.symbol)).toEqual(['VER1', 'AI1']);
    expect(stripLlmSelfScores(ranked[0]).score).toBeUndefined();
    expect(stripLlmSelfScores(ranked[0]).confidence_score).toBeUndefined();
  });
});
