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

function literatureClaim(symbol) {
  return {
    ...humanClaim(symbol),
    source: 'Open Targets',
    recordId: `literature:${symbol}`,
    claim: `${symbol} and the query co-occur in published text`,
    evidenceClass: 'literature',
    evidenceType: 'literature',
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
      associationClaims: [aiLead('LITONLY'), literatureClaim('LITONLY')],
    };

    expect(__test.geneMatchesFilters(highModelScoreOnly, { evidenceBasis: 'human' })).toBe(false);
    expect(__test.geneMatchesFilters(lowModelScoreWithHumanEvidence, { evidenceBasis: 'human' })).toBe(true);
    expect(__test.geneMatchesFilters(highModelScoreOnly, { evidenceBasis: 'unverified' })).toBe(true);
    expect(__test.geneMatchesFilters(lowModelScoreWithHumanEvidence, { evidenceBasis: 'unverified' })).toBe(false);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'literature' })).toBe(true);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'computational' })).toBe(false);
    expect(__test.geneMatchesFilters(literatureOnly, { evidenceBasis: 'unverified' })).toBe(false);

    // Unknown legacy fields cannot silently reactivate model-score filtering.
    expect(__test.geneMatchesFilters(highModelScoreOnly, {
      evidenceBasis: 'all',
      minScore: 1,
    })).toBe(true);
  });
});
