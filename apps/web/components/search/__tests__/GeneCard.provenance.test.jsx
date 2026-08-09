import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import GeneCard from '../GeneCard';

vi.mock('@genemap/shared', () => ({
  apiClient: { logActivity: vi.fn().mockResolvedValue({}) },
}));

vi.mock('../../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'provenance-test@example.invalid' } }),
}));

const claim = {
  source: 'ClinGen',
  recordId: 'RUNX1-001',
  claim: 'RUNX1 gene identity verified in Homo sapiens',
  taxon: '9606',
  species: 'Homo sapiens',
  evidenceClass: 'human_verified',
  evidenceType: 'gene_identity',
  evidenceStrength: 'supporting',
  releaseVersion: 'GRCh38 / ClinGen 2026-08',
  retrievalDate: '2026-08-09',
  directLink: 'https://example.org/records/RUNX1-001',
  isAiLead: false,
};

const gene = {
  symbol: 'RUNX1',
  name: 'RUNX family transcription factor 1',
  rankingBasis: 'human_verified',
  associationClaims: [claim],
  evidencePartition: {
    human: [claim],
    animal: [],
    computational: [],
    aiLeads: [],
    external: [],
  },
  sources: ['ClinGen'],
  phenotypes: [],
  coordinatesVerified: false,
};

describe('GeneCard claim-level provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the complete provenance tuple for a representative ranked claim', async () => {
    render(<GeneCard gene={gene} rank={1} />);

    const claims = screen.getByTestId('association-claims');
    expect(within(claims).getByText('human_verified')).toBeInTheDocument();
    expect(within(claims).getByText('gene_identity')).toBeInTheDocument();
    expect(within(claims).getByText('supporting')).toBeInTheDocument();
    expect(within(claims).getByText('Homo sapiens')).toBeInTheDocument();
    expect(within(claims).getByText(claim.claim)).toBeInTheDocument();
    expect(within(claims).getByText('ClinGen', { selector: 'span' })).toBeInTheDocument();
    expect(within(claims).getByText(/RUNX1-001/)).toBeInTheDocument();
    expect(within(claims).getByText(/GRCh38 \/ ClinGen 2026-08/)).toBeInTheDocument();
    expect(within(claims).getByText(/retrieved 2026-08-09/)).toBeInTheDocument();

    const sourceLink = within(claims).getByRole('link', { name: /open source record/i });
    expect(sourceLink).toHaveAttribute('href', claim.directLink);
    expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');

    await waitFor(() => expect(apiClient.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'gene_view',
        entityType: 'gene',
        entityId: 'RUNX1',
      }),
    ));
  });
});