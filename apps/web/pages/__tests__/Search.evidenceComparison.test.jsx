import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from '../Search';

const phenotypeService = vi.hoisted(() => ({
  findCandidates: vi.fn(),
  enrichCandidates: vi.fn(),
  compareGeneSets: vi.fn(),
}));

vi.mock('@genemap/shared', () => ({
  apiClient: {
    saveSearchHistory: vi.fn().mockResolvedValue({}),
    saveGeneSet: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'comparison@example.invalid' } }),
}));

vi.mock('../../components/search/PhenotypeSearchService', () => ({
  PhenotypeSearchService: phenotypeService,
}));

vi.mock('../../components/search/SearchForm', () => ({
  default: ({ onSearch }) => (
    <button
      type="button"
      onClick={() => onSearch(
        'HP:0001250',
        false,
        'free_text',
        { kind: 'hpo', identifier: 'HP:0001250' },
      )}
    >
      Run reviewed search
    </button>
  ),
}));

const evidenceGenes = [
  {
    symbol: 'SCN1A',
    rankingBasis: 'human_verified',
    associationClaims: [{
      source: 'Monarch Initiative',
      evidenceType: 'gene_phenotype_association',
      evidenceClass: 'human_verified',
      taxon: '9606',
      claim: 'SCN1A association evidence',
    }],
  },
  {
    symbol: 'SCN2A',
    rankingBasis: 'animal_model',
    associationClaims: [{
      source: 'Monarch ortholog grid',
      evidenceType: 'ortholog_phenotype_inference',
      evidenceClass: 'animal_model',
      taxon: '10090',
      claim: 'SCN2A model evidence',
    }],
  },
];

vi.mock('../../components/search/GeneResults', () => ({
  default: ({ onGeneSelect, onEvidenceGenesChange }) => (
    <div data-testid="gene-results">
      {evidenceGenes.map((gene) => (
        <button
          key={gene.symbol}
          type="button"
          onClick={() => {
            onEvidenceGenesChange(evidenceGenes);
            onGeneSelect(gene);
          }}
        >
          Select {gene.symbol}
        </button>
      ))}
    </div>
  ),
}));

vi.mock('../../components/search/GeneComparison', () => ({
  default: ({ genes }) => (
    <div data-testid="comparison">
      {genes.map((gene) => `${gene.symbol}:${gene.rankingBasis}:${gene.associationClaims.length}`).join('|')}
    </div>
  ),
}));
vi.mock('../../components/search/GeneInputForm', () => ({ default: () => <div /> }));
vi.mock('../../components/search/GeneSetComparison', () => ({ default: () => <div /> }));
vi.mock('../../components/search/SavedGeneSets', () => ({ default: () => <div /> }));
vi.mock('../../components/icons/DnaIcon', () => ({ default: () => <span aria-hidden="true">DNA</span> }));
vi.mock('../../components/AiThinkingIndicator', () => ({ default: () => <div /> }));

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchPage />
    </QueryClientProvider>,
  );
}

describe('Search source-grounded comparison selection', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/search');
    vi.clearAllMocks();
    const base = {
      query: 'HP:0001250',
      queryType: 'hpo_term',
      publicationReference: { kind: 'hpo', identifier: 'HP:0001250' },
      candidateGenes: evidenceGenes.map(({ symbol }) => ({ symbol })),
      hpoTerms: [],
      isPremium: false,
      // Search.jsx now requires a canonical, non-terminal publication
      // envelope on the candidate result before it will enrich/render
      // results; without one it is replaced with a fail-closed
      // "invalid_candidate_publication" marker.
      publication: {
        contractVersion: 1,
        status: 'available',
        content: { candidateGenes: [] },
        reasonCode: null,
        correlationId: 'candidate:evidence-comparison-test',
        limitations: [],
      },
    };
    phenotypeService.findCandidates.mockResolvedValue(base);
    phenotypeService.enrichCandidates.mockResolvedValue(base);
  });

  it('compares the latest evidence-enriched gene records, not stale pre-evidence selections', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /run reviewed search/i }));
    await screen.findByTestId('gene-results');

    fireEvent.click(screen.getByRole('button', { name: /select SCN1A/i }));
    fireEvent.click(screen.getByRole('button', { name: /select SCN2A/i }));
    await waitFor(() => expect(screen.getByText(/2 genes selected/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: /^compare$/i }));

    expect(await screen.findByTestId('comparison')).toHaveTextContent(
      'SCN1A:human_verified:1|SCN2A:animal_model:1',
    );
  });
});
