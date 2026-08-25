import { describe, expect, it } from 'vitest';
import { __test } from '../GeneResults';

function aiLead(symbol) {
  return {
    source: 'GeneMap bounded AI lead',
    recordId: null,
    claim: `${symbol} was suggested as a research lead`,
    taxon: 'unspecified',
    species: 'Unspecified',
    evidenceClass: 'ai_lead',
    evidenceType: 'model_suggestion',
    evidenceStrength: 'lead',
    isAiLead: true,
  };
}

function humanClaim(symbol) {
  return {
    source: 'Monarch Initiative',
    recordId: `association:${symbol}`,
    claim: `${symbol} has a source-recorded association`,
    taxon: '9606',
    species: 'Homo sapiens',
    evidenceClass: 'human_verified',
    evidenceType: 'gene_phenotype_association',
    evidenceStrength: 'supporting',
    isAiLead: false,
  };
}

function openTargetsClaim(symbol) {
  return {
    source: 'Open Targets Platform GraphQL API v4',
    recordId: `ENSG:${symbol}`,
    claim: `Open Targets aggregates source datatypes for ${symbol} and the bounded query`,
    subject: { kind: 'gene', id: `ENSG:${symbol}`, label: symbol },
    object: { kind: 'disease', id: 'MONDO:0005027', label: 'Seizure disorder' },
    taxon: '9606',
    species: 'Homo sapiens',
    evidenceClass: 'computational',
    evidenceType: 'computed_target_disease_association',
    evidenceStrength: 'supporting',
    scoreComponents: [{
      id: 'literature',
      label: 'Literature',
      score: 0.42,
      evidenceClass: 'literature',
      scale: 'open_targets_datatype_score_0_1',
    }],
    releaseVersion: '26.06',
    retrievalDate: '2026-08-25',
    directLink: 'https://platform.opentargets.org/disease/MONDO_0005027/associations',
    isAiLead: false,
  };
}

describe('GeneResults provenance filters', () => {
  it('uses genuine claim provenance rather than confidence_score', () => {
    const highModelScoreOnly = {
      symbol: 'AIHIGH',
      name: 'High model score only',
      confidence_score: 0.999,
      associationClaims: [aiLead('AIHIGH')],
    };
    const lowModelScoreWithHumanEvidence = {
      symbol: 'HUMANLOW',
      name: 'Low model score with human evidence',
      confidence_score: 0.001,
      associationClaims: [aiLead('HUMANLOW'), humanClaim('HUMANLOW')],
    };
    const literatureOnly = {
      symbol: 'LITONLY',
      name: 'Literature-derived evidence only',
      confidence_score: 0.999,
      associationClaims: [aiLead('LITONLY'), openTargetsClaim('LITONLY')],
    };

    expect(__test.geneMatchesFilters(highModelScoreOnly, { evidenceBasis: 'human' })).toBe(false);
    expect(__test.geneMatchesFilters(lowModelScoreWithHumanEvidence, { evidenceBasis: 'human' })).toBe(true);
    expect(__test.geneMatchesFilters(highModelScoreOnly, { evidenceBasis: 'unverified' })).toBe(true);
    expect(__test.geneMatchesFilters(lowModelScoreWithHumanEvidence, { evidenceBasis: 'unverified' })).toBe(false);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'literature' })).toBe(true);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'computational' })).toBe(true);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'unverified' })).toBe(false);
    expect(__test.summarizeEvidence([literatureOnly])).toMatchObject({
      computational: 1,
      literature: 1,
    });

    // Unknown legacy fields cannot silently reactivate model-score filtering.
    expect(__test.geneMatchesFilters(highModelScoreOnly, {
      evidenceBasis: 'all',
      minScore: 1,
    })).toBe(true);
  });
});
