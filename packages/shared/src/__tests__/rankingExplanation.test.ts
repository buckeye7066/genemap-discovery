import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_CLASS_RANK,
  RANKING_ATTRIBUTION,
  RANKING_EXCLUSION_TEXT,
  aiLeadClaim,
  createAssociationClaim,
  explainGeneRanking,
  type AssociationClaim,
} from '../associationClaim';

/**
 * GeneMap's own ranking, held to the rule Slice 1 imposed on source scores:
 * a rank is decomposable or it is not shown, and the number is attributed to
 * whoever computed it.
 */

const claim = (over: Partial<AssociationClaim> = {}): AssociationClaim =>
  createAssociationClaim({
    source: 'Monarch Initiative',
    recordId: 'assoc-1',
    claim: 'SCN1A is associated with seizures.',
    taxon: '9606',
    evidenceClass: 'human_verified',
    evidenceType: 'gene_phenotype_association',
    evidenceStrength: 'supporting',
    releaseVersion: '2026-06-08',
    retrievalDate: '2026-08-25',
    directLink: 'https://monarchinitiative.org/assoc-1',
    ...over,
  } as Parameters<typeof createAssociationClaim>[0]);

describe('explainGeneRanking — why this gene?', () => {
  it('names the claim that decided the rank and scores every other one', () => {
    const human = claim();
    const animal = claim({
      source: 'Monarch ortholog-phenotype grid',
      recordId: 'ortho-1',
      taxon: '10090',
      evidenceClass: 'animal_model',
      evidenceType: 'ortholog_phenotype_inference',
    });

    const explanation = explainGeneRanking([animal, human]);

    expect(explanation.score).toBe(EVIDENCE_CLASS_RANK.human_verified);
    expect(explanation.basis).toBe('human_verified');

    const decisive = explanation.contributions.filter((c) => c.decisive);
    expect(decisive).toHaveLength(1);
    expect(decisive[0].source).toBe('Monarch Initiative');

    // The animal-model claim still appears, with what it actually contributed.
    const animalRow = explanation.contributions.find((c) => c.evidenceClass === 'animal_model');
    expect(animalRow).toMatchObject({
      counted: true,
      contribution: EVIDENCE_CLASS_RANK.animal_model,
      decisive: false,
      excludedBecause: null,
    });
  });

  it('attributes the ordinal to GeneMap, not to a source', () => {
    const explanation = explainGeneRanking([claim()]);
    expect(explanation.attribution).toBe(RANKING_ATTRIBUTION);
    expect(explanation.attribution).toMatch(/GeneMap/);
    expect(explanation.attribution).toMatch(/not a score published by any source/i);
  });

  it('shows a zero-contribution claim WITH the reason it counted for nothing', () => {
    // Silently dropping these is what makes a ranking feel arbitrary.
    const explanation = explainGeneRanking([
      aiLeadClaim('SCN1A', 'seizures'),
      claim({ evidenceType: 'gene_identity', evidenceStrength: 'supporting' }),
      claim({ evidenceClass: 'external_followup', evidenceType: 'database_link', evidenceStrength: 'none' }),
    ]);

    expect(explanation.contributions).toHaveLength(3);
    expect(explanation.contributions.every((c) => c.counted === false)).toBe(true);
    expect(explanation.contributions.every((c) => c.contribution === 0)).toBe(true);

    const reasons = explanation.contributions.map((c) => c.excludedBecause);
    expect(reasons).toContain('ai_research_lead');
    expect(reasons).toContain('not_an_association');
    expect(reasons).toContain('external_followup');
    for (const reason of reasons) {
      expect(RANKING_EXCLUSION_TEXT[reason!]).toBeTruthy();
    }
  });

  it('says plainly when nothing retrieved supports the gene yet', () => {
    const explanation = explainGeneRanking([aiLeadClaim('SCN1A', 'seizures')]);
    expect(explanation.restsOnNothingRetrieved).toBe(true);
    expect(explanation.score).toBe(0);
    expect(explanation.basis).toBe('ai_lead');
  });

  it('handles a gene with no claims at all without inventing one', () => {
    for (const empty of [[], null, undefined]) {
      const explanation = explainGeneRanking(empty);
      expect(explanation.contributions).toEqual([]);
      expect(explanation.score).toBe(0);
      expect(explanation.restsOnNothingRetrieved).toBe(true);
    }
  });
});

describe('explainGeneRanking — what would change this ranking?', () => {
  it('lists only the classes the policy ranks ABOVE the current score', () => {
    const explanation = explainGeneRanking([
      claim({ taxon: '10090', evidenceClass: 'animal_model', evidenceType: 'ortholog_phenotype_inference' }),
    ]);

    expect(explanation.score).toBe(EVIDENCE_CLASS_RANK.animal_model);
    const classes = explanation.improvements.map((i) => i.evidenceClass);
    // Above animal_model (200): computational (300), human_verified (400).
    expect(classes).toEqual(['human_verified', 'computational']);
    // Not below or equal, and never "get an AI lead".
    expect(classes).not.toContain('literature');
    expect(classes).not.toContain('animal_model');
    expect(classes).not.toContain('ai_lead');
    expect(explanation.improvements.every((i) => i.wouldReach > explanation.score)).toBe(true);
  });

  it('offers nothing further once the gene is at the top of the policy', () => {
    const explanation = explainGeneRanking([claim()]);
    expect(explanation.basis).toBe('human_verified');
    expect(explanation.improvements).toEqual([]);
  });

  it('states a structural fact, never a prediction that such evidence exists', () => {
    const explanation = explainGeneRanking([aiLeadClaim('SCN1A', 'seizures')]);
    expect(explanation.improvements.length).toBeGreaterThan(0);
    for (const improvement of explanation.improvements) {
      expect(improvement.statement).toMatch(/^A retrieved .+ would rank it above its current position\.$/);
      // No claim about what is out there, only about what the ordering does.
      expect(improvement.statement).not.toMatch(/likely|probably|should exist|we expect|there is/i);
    }
  });
});
