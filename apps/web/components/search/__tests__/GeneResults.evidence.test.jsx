import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const evidenceClient = vi.hoisted(() => ({
  fetchAssociationEvidence: vi.fn(),
}));

vi.mock('@/lib/associationEvidenceClient', () => evidenceClient);
vi.mock('../GeneCard', () => ({
  default: ({ gene, rank }) => (
    <div data-testid={`gene-${gene.symbol}`}>
      {rank}:{gene.symbol}:{gene.rankingBasis}:{gene.associationClaims?.length || 0}
    </div>
  ),
}));
vi.mock('../GeneFilters', () => ({
  default: () => <div data-testid="filters" />,
}));
vi.mock('../../icons/DnaIcon', () => ({
  default: () => <span aria-hidden="true">DNA</span>,
}));

import GeneResults, { __test } from '../GeneResults';

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
    releaseVersion: 'candidate_gene_research@1',
    referenceAssembly: null,
    retrievalDate: null,
    directLink: null,
    isAiLead: true,
  };
}

function identityClaim(symbol) {
  return {
    source: 'MyGene.info',
    recordId: `NCBIGene:${symbol}`,
    claim: `${symbol} identity verified`,
    taxon: '9606',
    species: 'Homo sapiens',
    evidenceClass: 'human_verified',
    evidenceType: 'gene_identity',
    evidenceStrength: 'supporting',
    releaseVersion: null,
    referenceAssembly: 'GRCh38',
    retrievalDate: '2026-08-09',
    directLink: 'https://www.ncbi.nlm.nih.gov/gene/',
    isAiLead: false,
  };
}

function humanAssociation(symbol) {
  return {
    source: 'Monarch Initiative',
    recordId: `association:${symbol}`,
    claim: `${symbol} has a source-recorded association to Seizure`,
    taxon: '9606',
    species: 'Homo sapiens',
    evidenceClass: 'human_verified',
    evidenceType: 'gene_phenotype_association',
    evidenceStrength: 'supporting',
    releaseVersion: '2026-06-08',
    referenceAssembly: null,
    retrievalDate: '2026-08-09',
    directLink: 'https://example.org/association',
    isAiLead: false,
  };
}

describe('GeneResults evidence merge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('promotes genuine gene-query association evidence but not verified identity metadata', () => {
    const genes = [
      {
        symbol: 'CFTR',
        leadOrderHint: 0,
        associationClaims: [aiLead('CFTR'), identityClaim('CFTR')],
      },
      {
        symbol: 'SCN1A',
        leadOrderHint: 1,
        associationClaims: [aiLead('SCN1A')],
      },
    ];

    const merged = __test.mergeAssociationEvidence(genes, {
      sourceStatus: 'available',
      claimsByGene: { SCN1A: [humanAssociation('SCN1A')] },
    });

    expect(merged.map((gene) => gene.symbol)).toEqual(['SCN1A', 'CFTR']);
    expect(merged[0]).toMatchObject({
      symbol: 'SCN1A',
      rankingBasis: 'human_verified',
      associationEvidenceStatus: 'available',
    });
    expect(merged[1]).toMatchObject({
      symbol: 'CFTR',
      rankingBasis: 'ai_lead',
    });
    expect(merged[1].evidencePartition.human).toHaveLength(0);
    expect(merged[1].evidencePartition.metadata).toEqual([
      expect.objectContaining({ evidenceType: 'gene_identity' }),
    ]);
  });

  it('deduplicates repeated source claims and summarizes genes by evidence category', () => {
    const claim = humanAssociation('SCN1A');
    const merged = __test.mergeAssociationEvidence([
      {
        symbol: 'SCN1A',
        associationClaims: [aiLead('SCN1A'), claim],
      },
    ], {
      sourceStatus: 'available',
      claimsByGene: { SCN1A: [claim] },
    });

    expect(merged[0].associationClaims.filter((item) => item.recordId === claim.recordId)).toHaveLength(1);
    expect(__test.summarizeEvidence(merged)).toEqual({
      human: 1,
      animal: 0,
      computational: 0,
      literature: 0,
      aiLead: 1,
    });
  });

  it('counts literature-derived evidence as its own category, not as computational', () => {
    // Text mining establishes that two things were discussed together, not that
    // a relationship was demonstrated. Folding it into "computed evidence"
    // would overstate the computational column and hide the literature one.
    const literatureClaim = {
      ...humanAssociation('SCN1A'),
      recordId: 'literature-1',
      evidenceClass: 'literature',
      claim: 'SCN1A and the query co-occur in published text',
    };
    const merged = __test.mergeAssociationEvidence([
      { symbol: 'SCN1A', associationClaims: [aiLead('SCN1A')] },
    ], {
      sourceStatus: 'available',
      claimsByGene: { SCN1A: [literatureClaim] },
    });

    expect(merged[0].evidencePartition.literature).toHaveLength(1);
    expect(merged[0].evidencePartition.computational).toHaveLength(0);
    expect(merged[0].evidencePartition.human).toHaveLength(0);
    expect(__test.summarizeEvidence(merged)).toEqual({
      human: 0,
      animal: 0,
      computational: 0,
      literature: 1,
      aiLead: 1,
    });
  });

  it('resolves only reviewed catalog labels or exact identifiers for the evidence request', () => {
    expect(__test.queryReferenceForResults('HP:0001250', 'hpo_term')).toEqual({
      kind: 'hpo',
      identifier: 'HP:0001250',
    });
    expect(__test.queryReferenceForResults('Cystic Fibrosis', 'disease')).toMatchObject({
      kind: 'curated_concept',
      conceptId: 'disease:cystic-fibrosis',
      conceptKind: 'disease',
    });
    expect(__test.queryReferenceForResults('arbitrary patient prose', 'phenotype')).toBeNull();
  });

  it('renders retrieved evidence separately and passes the ranked gene to the card', async () => {
    evidenceClient.fetchAssociationEvidence.mockResolvedValue({
      sourceStatus: 'available',
      claimCount: 1,
      claimsByGene: { SCN1A: [humanAssociation('SCN1A')] },
    });

    render(
      <GeneResults
        results={{
          query: 'HP:0001250',
          queryType: 'hpo_term',
          isPremium: false,
          candidateGenes: [{
            symbol: 'SCN1A',
            name: 'sodium voltage-gated channel alpha subunit 1',
            associationClaims: [aiLead('SCN1A')],
          }],
        }}
      />,
    );

    await screen.findByText(/1 source-grounded association claim retrieved/i);
    await waitFor(() => expect(screen.getByTestId('gene-SCN1A')).toHaveTextContent(
      '1:SCN1A:human_verified:2',
    ));
    expect(evidenceClient.fetchAssociationEvidence).toHaveBeenCalledWith(
      { kind: 'hpo', identifier: 'HP:0001250' },
      ['SCN1A'],
    );
  });

  it('leaves every lead unpromoted when source adapters return no match', async () => {
    evidenceClient.fetchAssociationEvidence.mockResolvedValue({
      sourceStatus: 'no_matching_associations',
      claimCount: 0,
      claimsByGene: { SCN1A: [] },
    });

    render(
      <GeneResults
        results={{
          query: 'HP:0001250',
          queryType: 'hpo_term',
          isPremium: false,
          candidateGenes: [{
            symbol: 'SCN1A',
            name: 'SCN1A',
            associationClaims: [aiLead('SCN1A')],
          }],
        }}
      />,
    );

    await screen.findByText(/remain unverified AI research leads/i);
    expect(screen.getByTestId('gene-SCN1A')).toHaveTextContent('1:SCN1A:ai_lead:1');
  });
  it('uses the immutable publication reference instead of re-deriving from display query type', async () => {
    const publicationReference = {
      kind: 'curated_concept',
      conceptId: 'disease:cystic-fibrosis',
      canonicalLabel: 'Cystic Fibrosis',
      conceptKind: 'disease',
      source: 'genemap_curated',
      version: 1,
    };
    evidenceClient.fetchAssociationEvidence.mockResolvedValue({
      sourceStatus: 'no_matching_associations',
      claimCount: 0,
      claimsByGene: { CFTR: [] },
      sources: {},
    });

    render(
      <GeneResults
        results={{
          query: 'Cystic Fibrosis',
          // Deliberately mismatched legacy/model label. The immutable reference
          // must win so evidence is not silently skipped.
          queryType: 'phenotype',
          publicationReference,
          isPremium: false,
          candidateGenes: [{
            symbol: 'CFTR',
            name: 'CF transmembrane conductance regulator',
            associationClaims: [aiLead('CFTR')],
          }],
        }}
      />,
    );

    await waitFor(() => expect(evidenceClient.fetchAssociationEvidence).toHaveBeenCalledWith(
      publicationReference,
      ['CFTR'],
    ));
  });

  it('renders partial source coverage neutrally and publishes enriched genes to comparison state', async () => {
    const onEvidenceGenesChange = vi.fn();
    evidenceClient.fetchAssociationEvidence.mockResolvedValue({
      sourceStatus: 'partial_coverage',
      claimCount: 1,
      claimsByGene: { SCN1A: [humanAssociation('SCN1A')] },
      sources: {
        monarch: {
          status: 'partial',
          truncated: true,
          retrievedAt: '2026-08-09T12:00:00.000Z',
        },
        openTargets: {
          status: 'not_applicable',
          truncated: false,
          retrievedAt: null,
        },
      },
    });

    render(
      <GeneResults
        results={{
          query: 'HP:0001250',
          queryType: 'hpo_term',
          publicationReference: { kind: 'hpo', identifier: 'HP:0001250' },
          isPremium: false,
          candidateGenes: [{
            symbol: 'SCN1A',
            name: 'SCN1A',
            associationClaims: [aiLead('SCN1A')],
          }],
        }}
        onEvidenceGenesChange={onEvidenceGenesChange}
      />,
    );

    expect(await screen.findByText(/absence from this result is not evidence/i)).toBeInTheDocument();
    expect(screen.getAllByText(/partial coverage/i).length).toBeGreaterThan(0);
    await waitFor(() => expect(onEvidenceGenesChange).toHaveBeenLastCalledWith([
      expect.objectContaining({
        symbol: 'SCN1A',
        rankingBasis: 'human_verified',
        associationClaims: expect.arrayContaining([
          expect.objectContaining({ evidenceType: 'gene_phenotype_association' }),
        ]),
      }),
    ]));
  });

});
