import { describe, expect, it } from 'vitest';
import {
  aiLeadClaim,
  claimProvenanceRole,
  claimSortKey,
  createAssociationClaim,
  deriveRankingBasisFromClaims,
  evidenceClassPresence,
  externalFollowupClaim,
  hasEvidenceClassSignal,
  humanGeneIdentityClaim,
  hpoPhenotypeClaim,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  safeExternalHttpUrl,
  stripLlmSelfScores,
} from '../associationClaim.js';

describe('associationClaim', () => {
  it('builds AI leads without inventing retrieval provenance or verified evidence', () => {
    const claim = aiLeadClaim('CFTR', 'cystic fibrosis');
    expect(claim.isAiLead).toBe(true);
    expect(claim.evidenceClass).toBe('ai_lead');
    expect(claim.evidenceStrength).toBe('lead');
    expect(claim.recordId).toBeNull();
    expect(claim.referenceAssembly).toBeNull();
    expect(claim.species).toBe('Homo sapiens');
    expect(claim.retrievalDate).toBeNull();
    expect(claimSortKey(claim)).toBe(0);
    expect(claimProvenanceRole(claim)).toBe('ai_candidate_lead');
  });

  it('records reference assembly and an actual adapter retrieval separately from source release', () => {
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
    expect(claim.retrievalDate).toBe('2026-08-08');
    expect(claim.directLink).toContain('ENSG00000001626');
    expect(claim.isAiLead).toBe(false);
    expect(claimSortKey(claim)).toBe(0);
    expect(claimProvenanceRole(claim)).toBe('source_metadata');
  });

  it('keeps retrieval unknown when an authoritative claim lacks adapter timing', () => {
    const claim = humanGeneIdentityClaim({
      symbol: 'RUNX1',
      entrezId: '861',
      genomeBuild: 'GRCh38',
      sourceVersion: 'MyGene.info 2026-08 snapshot',
    });
    expect(claim.releaseVersion).toBe('MyGene.info 2026-08 snapshot');
    expect(claim.referenceAssembly).toBe('GRCh38');
    expect(claim.retrievalDate).toBeNull();
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
    expect(claim.retrievalDate).toBe('2026-08-08');
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
    expect(unsafe.retrievalDate).toBeNull();
    expect(claimSortKey(unsafe)).toBe(0);

    const safe = externalFollowupClaim({
      geneSymbol: 'RUNX1',
      database: 'Official database',
      url: 'https://example.org/RUNX1',
    });
    expect(safe.directLink).toBe('https://example.org/RUNX1');
    expect(safe.retrievalDate).toBeNull();
    expect(claimSortKey(safe)).toBe(0);
  });

  it('separates genuine human, animal, computational, AI, and metadata claims', () => {
    const identity = humanGeneIdentityClaim({ symbol: 'X', ensemblId: 'ENSG1' });
    const hpo = hpoPhenotypeClaim({
      geneSymbol: 'X',
      phenotypeName: 'Seizure',
      hpoId: 'HP:0001250',
    });
    const followup = externalFollowupClaim({
      geneSymbol: 'X',
      database: 'Official database',
      url: 'https://example.org/X',
    });
    const humanAssociation = createAssociationClaim({
      source: 'Curated association source',
      recordId: 'HUMAN:1',
      claim: 'human association evidence',
      taxon: '9606',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_disease_association',
      evidenceStrength: 'supporting',
      releaseVersion: '2026-08-01',
      directLink: 'https://example.org/HUMAN:1',
    });
    const animalAssociation = createAssociationClaim({
      source: 'MGI',
      recordId: 'MGI:123',
      claim: 'mouse ortholog evidence',
      taxon: '10090',
      evidenceClass: 'animal_model',
      evidenceType: 'ortholog_association',
      evidenceStrength: 'supporting',
      releaseVersion: 'MGI-2026',
      directLink: 'https://www.informatics.jax.org/marker/MGI:123',
    });
    const computationalAssociation = createAssociationClaim({
      source: 'In-silico predictor',
      recordId: null,
      claim: 'computational association score',
      taxon: '9606',
      evidenceClass: 'computational',
      evidenceType: 'gene_phenotype_association_prediction',
      evidenceStrength: 'supporting',
      releaseVersion: 'v1',
      directLink: null,
    });

    const parts = partitionClaimsBySpecies([
      aiLeadClaim('X', 'y'),
      identity,
      hpo,
      followup,
      humanAssociation,
      animalAssociation,
      computationalAssociation,
    ]);

    expect(parts.aiLeads).toHaveLength(1);
    expect(parts.human).toEqual([humanAssociation]);
    expect(parts.animal).toEqual([animalAssociation]);
    expect(parts.computational).toEqual([computationalAssociation]);
    expect(parts.metadata).toEqual([identity, hpo, followup]);
    expect(parts.external).toEqual([hpo, followup]);
  });

  it('detects positive literature score parts without reclassifying the Open Targets claim', () => {
    const openTargetsClaim = createAssociationClaim({
      source: 'Open Targets Platform GraphQL API v4',
      recordId: 'ENSG00000144285',
      claim: 'Open Targets aggregates source datatypes for SCN1A and Seizure',
      taxon: '9606',
      evidenceClass: 'computational',
      evidenceType: 'computed_target_disease_association',
      evidenceStrength: 'supporting',
      releaseVersion: '26.06',
      retrievalDate: '2026-08-25',
      directLink: 'https://platform.opentargets.org/disease/MONDO_0005027/associations',
      scoreComponents: [
        {
          id: 'genetic_association',
          label: 'Genetic association',
          score: 0.81,
          evidenceClass: 'human_verified',
          scale: 'open_targets_datatype_score_0_1',
        },
        {
          id: 'literature',
          label: 'Literature',
          score: 0.42,
          evidenceClass: 'literature',
          scale: 'open_targets_datatype_score_0_1',
        },
      ],
    });

    const partition = partitionClaimsBySpecies([openTargetsClaim]);
    expect(partition.computational).toEqual([openTargetsClaim]);
    expect(partition.literature).toEqual([]);
    expect(evidenceClassPresence([openTargetsClaim], 'literature')).toEqual({
      directClaims: 0,
      positiveScoreComponents: 1,
    });
    expect(hasEvidenceClassSignal([openTargetsClaim], 'literature')).toBe(true);
    expect(hasEvidenceClassSignal([openTargetsClaim], 'human_verified')).toBe(true);
    expect(deriveRankingBasisFromClaims([openTargetsClaim])).toBe('computational');
  });

  it('gives AI-lead state precedence over contradictory verified fields', () => {
    const contradictory = createAssociationClaim({
      source: 'Untrusted candidate source',
      recordId: 'MODEL:1',
      claim: 'Model lead with contradictory verified-looking metadata',
      taxon: '9606',
      evidenceClass: 'human_verified',
      evidenceType: 'gene_disease_association',
      evidenceStrength: 'strong',
      releaseVersion: 'model-output',
      directLink: null,
      isAiLead: true,
    });

    const parts = partitionClaimsBySpecies([contradictory]);
    expect(parts.aiLeads).toEqual([contradictory]);
    expect(parts.human).toEqual([]);
    expect(parts.animal).toEqual([]);
    expect(parts.computational).toEqual([]);
    expect(parts.external).toEqual([]);
    expect(parts.metadata).toEqual([]);
    expect(claimProvenanceRole(contradictory)).toBe('ai_candidate_lead');
    expect(claimSortKey(contradictory)).toBe(0);
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