import { describe, expect, it } from 'vitest';
import {
  EVIDENCE_CLASS_RANK,
  RANKABLE_EVIDENCE_CLASSES,
  RANKING_ATTRIBUTION,
  RANKING_EXCLUSION_TEXT,
  aiLeadClaim,
  claimSortKey,
  createAssociationClaim,
  explainGeneRanking,
  type AssociationClaim,
  type EvidenceClass,
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

    const determining = explanation.contributions.filter((c) => c.role === 'determines_rank');
    expect(determining).toHaveLength(1);
    expect(determining[0].source).toBe('Monarch Initiative');

    // THE RANK IS A MAX, NOT A SUM. The animal-model claim is real retrieved
    // evidence, but removing it would not change the rank - so it must NOT be
    // presented as having contributed to the outcome.
    const animalRow = explanation.contributions.find((c) => c.evidenceClass === 'animal_model');
    expect(animalRow).toMatchObject({
      role: 'considered_lower',
      contribution: EVIDENCE_CLASS_RANK.animal_model,
      excludedBecause: null,
    });
    expect(explainGeneRanking([human]).score).toBe(explanation.score);
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
    expect(explanation.contributions.every((c) => c.role === 'cannot_contribute')).toBe(true);
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
      expect(improvement.statement).toMatch(/^A retrieved .+ would raise its evidence tier\.$/);
      // No claim about what is out there, only about what the ordering does.
      expect(improvement.statement).not.toMatch(/likely|probably|should exist|we expect|there is/i);
      // And NO claim about LIST POSITION: this function sees one gene's claims
      // and cannot know what the other candidates hold.
      expect(improvement.statement).not.toMatch(/position|above .* current|higher in the list|rank it above/i);
    }
    expect(explanation.positionCaveat).toMatch(/does not guarantee a higher position/i);
  });
});

describe('explainGeneRanking — findings from code review', () => {
  it('never offers an improvement that claimSortKey would score as zero', () => {
    // external_followup ranks 100 in EVIDENCE_CLASS_RANK but claimSortKey zeroes
    // it UNCONDITIONALLY. Offering it as an improvement was a false statement:
    // adding exactly that record cannot move the score.
    const explanation = explainGeneRanking([aiLeadClaim('SCN1A', 'seizures')]);
    expect(explanation.score).toBe(0);
    expect(explanation.improvements.map((i) => i.evidenceClass)).not.toContain('external_followup');
    expect(explanation.improvements.map((i) => i.evidenceClass)).not.toContain('ai_lead');
  });

  it('keeps RANKABLE_EVIDENCE_CLASSES in step with what claimSortKey can actually score', () => {
    // The drift guard: if claimSortKey starts (or stops) zeroing a class, this
    // fails rather than letting the panel quietly promise the impossible.
    const canScore = (evidenceClass: EvidenceClass) => claimSortKey(createAssociationClaim({
      source: 'probe',
      recordId: null,
      claim: 'probe',
      taxon: evidenceClass === 'animal_model' ? '10090' : '9606',
      evidenceClass,
      evidenceType: 'gene_disease_association',
      evidenceStrength: 'supporting',
      releaseVersion: null,
    } as Parameters<typeof createAssociationClaim>[0])) > 0;

    // Derived from the authoritative table, so a NEW class is covered automatically.
    for (const evidenceClass of Object.keys(EVIDENCE_CLASS_RANK) as EvidenceClass[]) {
      expect(
        (RANKABLE_EVIDENCE_CLASSES as readonly string[]).includes(evidenceClass),
        `${evidenceClass}: RANKABLE_EVIDENCE_CLASSES disagrees with claimSortKey`,
      ).toBe(canScore(evidenceClass));
    }
  });

  it('labels tied maximum claims as tied, never as individual rank setters', () => {
    // Two claims at the same top ordinal jointly preserve the maximum. Removing
    // either one leaves the rank unchanged, so neither claim alone "sets" it.
    const a = createAssociationClaim({
      source: 'Monarch Initiative', recordId: 'a', claim: 'a', taxon: '9606',
      evidenceClass: 'human_verified', evidenceType: 'gene_disease_association',
      evidenceStrength: 'supporting', releaseVersion: '2026-06-08',
    } as Parameters<typeof createAssociationClaim>[0]);
    const b = { ...a, recordId: 'b', source: 'ClinGen' };

    const explanation = explainGeneRanking([a, b]);
    expect(explanation.contributions.filter((c) => c.role === 'tied_for_rank')).toHaveLength(2);
    expect(explanation.contributions.filter((c) => c.role === 'determines_rank')).toHaveLength(0);
  });

  it('carries a record id so repeated sources stay distinguishable', () => {
    // The Monarch ortholog grid can emit several claims under one source name;
    // rendering only the source made those rows indistinguishable.
    const grid = (recordId: string) => createAssociationClaim({
      source: 'Monarch Initiative ortholog-phenotype grid', recordId, claim: recordId,
      taxon: '10090', evidenceClass: 'animal_model',
      evidenceType: 'ortholog_phenotype_inference', evidenceStrength: 'supporting',
      releaseVersion: '2026-06-08',
    } as Parameters<typeof createAssociationClaim>[0]);

    const explanation = explainGeneRanking([grid('mgi-1'), grid('mgi-2')]);
    expect(explanation.contributions.map((c) => c.recordId)).toEqual(['mgi-1', 'mgi-2']);
    expect(explanation.contributions.every((c) => c.evidenceType === 'ortholog_phenotype_inference')).toBe(true);
  });

  it('carries claim text as the visible fallback identity when record ids are absent', () => {
    const grid = (claimText: string) => createAssociationClaim({
      source: 'Monarch Initiative ortholog-phenotype grid', recordId: null, claim: claimText,
      taxon: '10090', evidenceClass: 'animal_model',
      evidenceType: 'ortholog_phenotype_inference', evidenceStrength: 'supporting',
      releaseVersion: '2026-06-08',
    } as Parameters<typeof createAssociationClaim>[0]);

    const explanation = explainGeneRanking([
      grid('SCN1A mouse ortholog supports seizure phenotype A.'),
      grid('SCN1A mouse ortholog supports seizure phenotype B.'),
    ]);

    expect(explanation.contributions.map((c) => c.recordId)).toEqual([null, null]);
    expect(explanation.contributions.map((c) => c.claim)).toEqual([
      'SCN1A mouse ortholog supports seizure phenotype A.',
      'SCN1A mouse ortholog supports seizure phenotype B.',
    ]);
  });
});
