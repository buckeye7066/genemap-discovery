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

const aiClaim = {
  source: 'GeneMap AI candidate generator',
  recordId: null,
  claim: 'RUNX1 is an AI-suggested candidate lead for the bounded query',
  taxon: '9606',
  species: 'Homo sapiens',
  evidenceClass: 'ai_lead',
  evidenceType: 'model_suggestion',
  evidenceStrength: 'lead',
  releaseVersion: 'publication-task/candidate_gene_research@1',
  retrievalDate: '2026-08-09',
  directLink: null,
  isAiLead: true,
};

const identityClaim = {
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
  // Identity verification is visible provenance but does not verify the
  // candidate's association with the bounded query.
  rankingBasis: 'ai_lead',
  associationClaims: [aiClaim, identityClaim],
  evidencePartition: {
    human: [identityClaim],
    animal: [],
    computational: [],
    aiLeads: [aiClaim],
    external: [],
  },
  sources: ['ClinGen'],
  phenotypes: [],
  coordinatesVerified: false,
};

describe('GeneCard claim-level provenance', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the complete identity provenance tuple without promoting association status', async () => {
    render(<GeneCard gene={gene} rank={1} />);

    expect(screen.getByText('AI research lead')).toBeInTheDocument();
    const claims = screen.getByTestId('association-claims');
    const identityText = within(claims).getByText(identityClaim.claim);
    const identityRow = identityText.closest('li');
    expect(identityRow).toBeTruthy();

    const row = within(identityRow);
    expect(row.getByText('human_verified')).toBeInTheDocument();
    expect(row.getByText('gene_identity')).toBeInTheDocument();
    expect(row.getByText('supporting')).toBeInTheDocument();
    expect(row.getByText('Homo sapiens')).toBeInTheDocument();
    expect(row.getByText('taxon 9606')).toBeInTheDocument();
    expect(row.getByText('ClinGen', { selector: 'span' })).toBeInTheDocument();
    expect(row.getByText(/RUNX1-001/)).toBeInTheDocument();
    expect(row.getByText(/GRCh38 \/ ClinGen 2026-08/)).toBeInTheDocument();
    expect(row.getByText(/retrieved 2026-08-09/)).toBeInTheDocument();

    const sourceLink = row.getByRole('link', { name: /open source record/i });
    expect(sourceLink).toHaveAttribute('href', identityClaim.directLink);
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