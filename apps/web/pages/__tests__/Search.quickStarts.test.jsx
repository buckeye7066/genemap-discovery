import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SearchPage from '../Search';
import { PhenotypeSearchService } from '../../components/search/PhenotypeSearchService';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    saveSearchHistory: vi.fn().mockResolvedValue({}),
    saveGeneSet: vi.fn().mockResolvedValue({}),
  },
}));

vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'quick-start@example.invalid' } }),
}));

vi.mock('../../components/search/PhenotypeSearchService', () => ({
  PhenotypeSearchService: {
    findCandidates: vi.fn(),
    enrichCandidates: vi.fn(),
    compareGeneSets: vi.fn(),
  },
}));

vi.mock('../../components/search/SearchForm', () => ({
  default: () => <div data-testid="search-form" />,
}));
vi.mock('../../components/search/GeneResults', () => ({
  default: () => <div data-testid="gene-results" />,
}));
vi.mock('../../components/search/GeneComparison', () => ({
  default: () => <div />,
}));
vi.mock('../../components/search/GeneInputForm', () => ({
  default: () => <div data-testid="gene-input" />,
}));
vi.mock('../../components/search/GeneSetComparison', () => ({
  default: () => <div />,
}));
vi.mock('../../components/search/SavedGeneSets', () => ({
  default: () => <div />,
}));
vi.mock('../../components/icons/DnaIcon', () => ({
  default: () => <span aria-hidden="true">DNA</span>,
}));
vi.mock('../../components/AiThinkingIndicator', () => ({
  default: () => <div />,
}));

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <SearchPage />
    </QueryClientProvider>,
  );
}

describe('Search reviewed quick starts', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/search');
    vi.clearAllMocks();
    const base = {
      query: 'Cystic Fibrosis',
      candidateGenes: [],
      hpoTerms: [],
      isPremium: false,
      enriched: false,
    };
    PhenotypeSearchService.findCandidates.mockResolvedValue(base);
    PhenotypeSearchService.enrichCandidates.mockResolvedValue({ ...base, enriched: true });
  });

  it('uses an explicit reviewed disease reference and removes misleading symbol shortcuts', async () => {
    renderPage();

    expect(screen.queryByRole('button', { name: /^hearing loss$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^BRCA1$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Cystic Fibrosis$/i }));

    await waitFor(() => expect(PhenotypeSearchService.findCandidates).toHaveBeenCalledOnce());
    expect(PhenotypeSearchService.findCandidates).toHaveBeenCalledWith(
      'Cystic Fibrosis',
      false,
      'disease',
      {
        kind: 'curated_concept',
        conceptId: 'disease:cystic-fibrosis',
        canonicalLabel: 'Cystic Fibrosis',
        conceptKind: 'disease',
        source: 'genemap_curated',
        version: 1,
      },
    );
  });
});
