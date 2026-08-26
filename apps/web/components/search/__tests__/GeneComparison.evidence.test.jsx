import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GeneComparison, { __test } from '../GeneComparison';

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

const genes = [
  {
    symbol: 'SCN1A',
    name: 'sodium voltage-gated channel alpha subunit 1',
    chromosome: '2',
    rankingBasis: 'human_verified',
    associationClaims: [
      aiLead('SCN1A'),
      {
        source: 'Monarch Initiative',
        recordId: 'association:SCN1A',
        claim: 'SCN1A has a source-recorded association with Seizure',
        taxon: '9606',
        species: 'Homo sapiens',
        evidenceClass: 'human_verified',
        evidenceType: 'gene_phenotype_association',
        evidenceStrength: 'supporting',
        releaseVersion: '2026-06-08',
        retrievalDate: '2026-08-09',
        directLink: 'https://example.org/scn1a',
        isAiLead: false,
      },
      {
        source: 'MyGene.info',
        recordId: 'NCBIGene:6323',
        claim: 'SCN1A identity verified',
        taxon: '9606',
        species: 'Homo sapiens',
        evidenceClass: 'human_verified',
        evidenceType: 'gene_identity',
        evidenceStrength: 'supporting',
        retrievalDate: '2026-08-09',
        isAiLead: false,
      },
    ],
  },
  {
    symbol: 'SCN2A',
    name: 'sodium voltage-gated channel alpha subunit 2',
    chromosome: '2',
    rankingBasis: 'animal_model',
    associationClaims: [
      aiLead('SCN2A'),
      {
        source: 'Monarch Initiative ortholog-phenotype grid',
        recordId: 'ortholog:SCN2A',
        claim: 'Mouse ortholog phenotype overlaps Seizure',
        taxon: '10090',
        species: 'Mus musculus',
        evidenceClass: 'animal_model',
        evidenceType: 'ortholog_phenotype_inference',
        evidenceStrength: 'supporting',
        retrievalDate: '2026-08-09',
        directLink: 'javascript:alert(1)',
        isAiLead: false,
      },
      {
        source: 'Open Targets Platform GraphQL API v4',
        recordId: 'ENSG00000136531',
        claim: 'Open Targets aggregates source datatypes for SCN2A and Seizure',
        subject: { kind: 'gene', id: 'ENSG00000136531', label: 'SCN2A' },
        object: { kind: 'disease', id: 'MONDO:0005027', label: 'Seizure disorder' },
        taxon: '9606',
        species: 'Homo sapiens',
        evidenceClass: 'computational',
        evidenceType: 'computed_target_disease_association',
        evidenceStrength: 'supporting',
        scoreComponents: [{
          id: 'literature',
          label: 'Literature',
          score: 0.0042,
          evidenceClass: 'literature',
          scale: 'open_targets_datatype_score_0_1',
        }],
        releaseVersion: '26.06',
        retrievalDate: '2026-08-25',
        directLink: 'https://platform.opentargets.org/disease/MONDO_0005027/associations',
        isAiLead: false,
      },
    ],
  },
];

describe('GeneComparison claim-level evidence', () => {
  it('compares separated evidence and renders only safe absolute source links', () => {
    render(<GeneComparison genes={genes} />);

    expect(screen.getByRole('heading', { name: /gene evidence comparison/i })).toBeInTheDocument();
    expect(screen.queryByText(/not scored/i)).not.toBeInTheDocument();
    expect(screen.getAllByText(/human association/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/model-organism/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/metadata/i).length).toBeGreaterThan(0);
    expect(screen.getByText('Literature evidence', { selector: 'p' }).closest('div'))
      .toHaveTextContent('1 score component');
    expect(screen.getByText(/Open Targets aggregates source datatypes for SCN2A/i)).toBeInTheDocument();
    expect(screen.getByText(/Literature: <0.01 · class literature/i)).toBeInTheDocument();
    expect(__test.formatScoreComponent(0.0042)).toBe('<0.01');
    expect(__test.formatScoreComponent(0.42)).toBe('0.42');
    expect(__test.formatScoreComponent(0)).toBe('0.00');
    expect(__test.literatureEvidenceLabel({
      directClaims: 0,
      positiveScoreComponents: 1,
    })).toBe('1 score component');
    expect(__test.rankingLabel('literature')).toBe('Literature-derived association evidence');
    expect(screen.getByText(/SCN1A has a source-recorded association/i)).toBeInTheDocument();
    expect(screen.getByText(/Mouse ortholog phenotype overlaps/i)).toBeInTheDocument();

    const sourceLinks = screen.getAllByRole('link', { name: /open source record/i });
    expect(sourceLinks).toHaveLength(2);
    expect(sourceLinks[0]).toHaveAttribute('href', 'https://example.org/scn1a');
    expect(sourceLinks[0]).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(document.querySelector('a[href^="javascript:"]')).toBeNull();

    const scn1aSection = screen.getByRole('heading', { name: 'SCN1A' }).closest('section');
    expect(scn1aSection).toBeTruthy();
    expect(within(scn1aSection).getByText(/Monarch Initiative/i)).toBeInTheDocument();
    expect(within(scn1aSection).getByText('2026-08-09')).toBeInTheDocument();
  });
});
