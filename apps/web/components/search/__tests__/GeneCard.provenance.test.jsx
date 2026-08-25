import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import GeneCard, { __test } from '../GeneCard';

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
  referenceAssembly: null,
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
  // The source snapshot is unknown; the reference assembly is recorded separately.
  releaseVersion: null,
  referenceAssembly: 'GRCh38',
  retrievalDate: '2026-08-09',
  directLink: 'https://example.org/records/RUNX1-001',
  isAiLead: false,
};

const associationClaim = {
  source: 'Monarch Initiative',
  recordId: 'association:RUNX1:HP0001250',
  claim: 'RUNX1 has a source-recorded association to Seizure',
  taxon: '9606',
  species: 'Homo sapiens',
  evidenceClass: 'human_verified',
  evidenceType: 'gene_phenotype_association',
  evidenceStrength: 'supporting',
  releaseVersion: '2026-06-08',
  referenceAssembly: null,
  retrievalDate: '2026-08-09',
  directLink: 'https://example.org/association/RUNX1-HP0001250',
  isAiLead: false,
};

const gene = {
  symbol: 'RUNX1',
  name: 'RUNX family transcription factor 1',
  // rankingBasis is intentionally absent: identity verification must not make
  // the fallback badge look like verified gene-query association evidence.
  associationClaims: [aiClaim, identityClaim],
  evidencePartition: {
    human: [],
    animal: [],
    computational: [],
    aiLeads: [aiClaim],
    external: [],
    metadata: [identityClaim],
  },
  sources: ['ClinGen'],
  phenotypes: [],
  coordinatesVerified: false,
};

describe('GeneCard claim-level provenance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.logActivity.mockReset().mockResolvedValue({});
  });

  it('labels provenance roles and renders stable complete values without promoting identity metadata', async () => {
    render(<GeneCard gene={gene} rank={1} />);

    expect(screen.getByText('AI research lead')).toBeInTheDocument();
    const claims = screen.getByTestId('association-claims');
    expect(within(claims).getByText('Evidence and source provenance')).toBeInTheDocument();

    const identityText = within(claims).getByText(identityClaim.claim);
    const identityRow = identityText.closest('li');
    expect(identityRow).toBeTruthy();

    const identity = within(identityRow);
    expect(identity.getByText('Identity / ontology / follow-up metadata')).toBeInTheDocument();
    expect(identity.getByText('human_verified')).toBeInTheDocument();
    expect(identity.getByText('gene_identity')).toBeInTheDocument();
    expect(identity.getByText('supporting')).toBeInTheDocument();
    expect(identity.getByText('Homo sapiens')).toBeInTheDocument();
    expect(identity.getByText('taxon 9606')).toBeInTheDocument();
    expect(identityRow).toHaveTextContent('Source: ClinGen');
    expect(identityRow).toHaveTextContent('Record ID: RUNX1-001');
    expect(identityRow).toHaveTextContent('Source release/version: Not recorded');
    expect(identityRow).toHaveTextContent('Reference assembly: GRCh38');
    expect(identityRow).toHaveTextContent('Adapter retrieval date: 2026-08-09');
    expect(identityRow).toHaveTextContent('AI lead: false');

    const sourceLink = identity.getByRole('link', { name: /open source record/i });
    expect(sourceLink).toHaveAttribute('href', identityClaim.directLink);
    expect(sourceLink).toHaveAttribute('rel', 'noopener noreferrer');

    const aiText = within(claims).getByText(aiClaim.claim);
    const aiRow = aiText.closest('li');
    const ai = within(aiRow);
    expect(ai.getByText('AI candidate lead')).toBeInTheDocument();
    expect(aiRow).toHaveTextContent('AI lead: true');
    expect(aiRow).toHaveTextContent('No validated HTTP(S) source link recorded');
    expect(screen.getByText(/no source-grounded association record was attached/i)).toBeInTheDocument();

    await waitFor(() => expect(apiClient.logActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        activityType: 'gene_view',
        entityType: 'gene',
        entityId: 'RUNX1',
      }),
    ));
  });

  it('states the exact grounded evidence classes without relabeling AI summaries', () => {
    const groundedGene = {
      ...gene,
      coordinatesVerified: true,
      chromosome: '21',
      start: 34787801,
      end: 36004667,
      genomeBuild: 'GRCh38',
      entrezId: '861',
      ensemblId: 'ENSG00000159216',
      hpoChecked: true,
      associationClaims: [associationClaim, aiClaim, identityClaim],
      evidencePartition: {
        human: [associationClaim],
        animal: [],
        computational: [],
        aiLeads: [aiClaim],
        external: [],
        metadata: [identityClaim],
      },
    };

    render(<GeneCard gene={groundedGene} rank={1} />);

    expect(screen.getByText('Human-verified association evidence')).toBeInTheDocument();
    const notice = screen.getByText(/source-grounded association rows are shown separately/i).closest('div');
    expect(notice).toHaveTextContent('1 human claim');
    expect(notice).toHaveTextContent(/AI candidate lead, AI summary, and candidate phenotype terms remain model-generated/i);
    expect(notice).toHaveTextContent(/HP: identifiers shown are term-validated/i);
    expect(notice).not.toHaveTextContent(/Gene-phenotype associations and the summary are AI-suggested/i);
    expect(screen.getByText(associationClaim.claim)).toBeInTheDocument();
    expect(screen.getByText('2026-06-08')).toBeInTheDocument();
  });

  it('summarizes human, model-organism, and computed evidence without counting metadata', () => {
    expect(__test.groundedEvidenceSummary({
      human: [associationClaim],
      animal: [{ ...associationClaim, taxon: '10090' }],
      computational: [{ ...associationClaim, evidenceClass: 'computational' }],
      literature: [{ ...associationClaim, evidenceClass: 'literature' }],
      metadata: [identityClaim],
    })).toBe('1 human claim, 1 model-organism claim, 1 computed claim, 1 literature-derived claim');
    expect(__test.groundedEvidenceSummary({ metadata: [identityClaim], aiLeads: [aiClaim] })).toBeNull();
  });

  it('labels a literature-only source record as literature evidence rather than an AI lead', () => {
    const literatureClaim = {
      ...associationClaim,
      source: 'Open Targets',
      recordId: 'literature:RUNX1:1',
      claim: 'RUNX1 and the bounded query co-occur in published text',
      evidenceClass: 'literature',
      evidenceType: 'literature',
    };

    render(<GeneCard gene={{
      ...gene,
      symbol: 'LIT1',
      associationClaims: [literatureClaim],
      evidencePartition: undefined,
    }} rank={1} />);

    expect(screen.getByText('Literature-derived association evidence')).toBeInTheDocument();
    expect(screen.getByText(/1 literature-derived claim/)).toBeInTheDocument();
    expect(screen.queryByText('AI research lead')).not.toBeInTheDocument();
  });

  it('retries activity logging while mounted and preserves successful de-duplication', async () => {
    apiClient.logActivity
      .mockRejectedValueOnce(new Error('transient activity service failure'))
      .mockResolvedValueOnce({});
    const retryGene = {
      ...gene,
      symbol: 'RETRY1',
      name: 'Retry logging fixture',
      associationClaims: [],
      evidencePartition: undefined,
    };

    const firstRender = render(<GeneCard gene={retryGene} rank={1} />);
    await waitFor(() => expect(apiClient.logActivity).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(apiClient.logActivity).toHaveBeenCalledTimes(2), { timeout: 2000 });
    firstRender.unmount();

    render(<GeneCard gene={retryGene} rank={1} />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(apiClient.logActivity).toHaveBeenCalledTimes(2);
  });
});