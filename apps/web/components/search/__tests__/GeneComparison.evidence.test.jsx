import React from 'react';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import GeneComparison from '../GeneComparison';

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
        isAiLead: false,
      },
    ],
  },
];

describe('GeneComparison claim-level evidence', () => {
  it('compares separated human/model/computational evidence and provenance instead of legacy model scores', () => {
    render(<GeneComparison genes={genes} />);

    expect(screen.getByRole('heading', { name: /gene evidence comparison/i })).toBeInTheDocument();
    expect(screen.queryByText(/not scored/i)).not.toBeInTheDocument();
    expect(screen.getByText(/human association/i)).toBeInTheDocument();
    expect(screen.getAllByText(/model-organism/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/metadata/i)).toBeInTheDocument();
    expect(screen.getByText(/SCN1A has a source-recorded association/i)).toBeInTheDocument();
    expect(screen.getByText(/Mouse ortholog phenotype overlaps/i)).toBeInTheDocument();

    const sourceLink = screen.getByRole('link', { name: /open source record/i });
    expect(sourceLink).toHaveAttribute('href', 'https://example.org/scn1a');
    expect(sourceLink).toHaveAttribute('rel', expect.stringContaining('noopener'));

    const scn1aSection = screen.getByRole('heading', { name: 'SCN1A' }).closest('section');
    expect(scn1aSection).toBeTruthy();
    expect(within(scn1aSection).getByText(/Monarch Initiative/i)).toBeInTheDocument();
    expect(within(scn1aSection).getByText('2026-08-09')).toBeInTheDocument();
  });
});
