import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import SearchPage from '../Search';

const service = vi.hoisted(() => ({
  findCandidates: vi.fn(),
  enrichCandidates: vi.fn(),
  compareGeneSets: vi.fn(),
}));

vi.mock('@genemap/shared', () => ({
  apiClient: {
    saveSearchHistory: vi.fn(),
    saveGeneSet: vi.fn(),
  },
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('../../lib/AuthContext', () => ({
  useAuth: () => ({ user: { email: 'researcher@example.test' } }),
}));
vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }) => children,
}));
vi.mock('../../components/shared/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn() },
}));
vi.mock('../../components/shared/constants', () => ({ SAVE_SUCCESS_DELAY_MS: 1 }));
vi.mock('../../components/shared/errorUtils', () => ({
  getErrorMessage: (error) => error?.message || String(error || ''),
}));
vi.mock('../../components/icons/DnaIcon', () => ({
  default: (props) => <svg aria-hidden="true" {...props} />,
}));
vi.mock('../../components/search/SearchForm', () => ({
  default: ({ onSearch, isLoading }) => (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => onSearch('Cystic Fibrosis', false, 'disease')}
      >
        Run candidate search
      </button>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => onSearch('Rheumatoid Arthritis', false, 'disease')}
      >
        Run terminal search
      </button>
    </>
  ),
}));
vi.mock('../../components/search/GeneResults', () => ({
  default: () => <div data-testid="gene-results">normal gene results</div>,
}));
vi.mock('@/components/AiThinkingIndicator', () => ({
  default: ({ label }) => <p>{label}</p>,
}));
vi.mock('../../components/search/GeneComparison', () => ({ default: () => null }));
vi.mock('../../components/search/GeneInputForm', () => ({
  default: ({ onGenesSubmit, isLoading }) => (
    <>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => onGenesSubmit(['RUNX1'])}
      >
        Compare input genes
      </button>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => onGenesSubmit(['BRCA1'])}
      >
        Use BRCA1 genes
      </button>
      <button
        type="button"
        disabled={isLoading}
        onClick={() => onGenesSubmit([])}
      >
        Clear input genes
      </button>
    </>
  ),
}));
vi.mock('../../components/search/GeneSetComparison', () => ({
  default: ({ comparison }) => (
    <div data-testid="gene-set-comparison">{comparison?.analysis}</div>
  ),
}));
vi.mock('../../components/search/SavedGeneSets', () => ({ default: () => null }));
vi.mock('../../components/search/PhenotypeSearchService', () => ({
  PhenotypeSearchService: service,
}));
vi.mock('../../lib/publicationConceptCatalog', () => ({
  resolvePublicationSearchReference: () => ({
    kind: 'curated_concept',
    conceptId: 'disease:cystic-fibrosis',
    canonicalLabel: 'Cystic Fibrosis',
    conceptKind: 'disease',
    source: 'genemap_curated',
    version: 1,
  }),
  resolvePublicationUrlReference: () => null,
}));

function publication(status, content = null) {
  return {
    contractVersion: 1,
    status,
    content,
    reasonCode: status === 'available' ? null : `candidate_${status}`,
    correlationId: `candidate:${status}`,
    limitations: [],
  };
}

function modelPublicationError(correlationId) {
  const error = new Error('Generated content is temporarily unavailable.');
  error.status = 503;
  error.details = {
    publication: {
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
      correlationId,
      limitations: [],
    },
  };
  return error;
}

function candidateResult(artifact) {
  return {
    query: 'Cystic Fibrosis',
    candidateGenes: [],
    isPremium: false,
    hpoTerms: [],
    queryType: 'disease',
    userPreferences: null,
    publication: artifact,
    enriched: false,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe('Search candidate publication boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.saveSearchHistory.mockResolvedValue({});
  });

  it.each(['withheld', 'unavailable', 'superseded'])(
    'surfaces a %s candidate publication and never records an empty success',
    async (status) => {
      service.findCandidates.mockResolvedValue(candidateResult(publication(status)));

      render(<SearchPage />);
      fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));

      const publicationState = await screen.findByRole(
        status === 'superseded' ? 'status' : 'alert',
      );
      expect(publicationState).toHaveAttribute('data-publication-status', status);
      expect(publicationState).toHaveTextContent(`Publication ${status}`);
      expect(publicationState).toHaveTextContent(`candidate:${status}`);
      expect(screen.queryByTestId('gene-results')).toBeNull();
      expect(service.enrichCandidates).not.toHaveBeenCalled();
      expect(service.compareGeneSets).not.toHaveBeenCalled();
      expect(apiClient.saveSearchHistory).not.toHaveBeenCalled();
    },
  );

  it('keeps a genuine available empty result distinct and records that successful search', async () => {
    const base = candidateResult(publication('available', { candidateGenes: [] }));
    const enriched = { ...base, enriched: true };
    service.findCandidates.mockResolvedValue(base);
    service.enrichCandidates.mockResolvedValue(enriched);

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));

    expect(await screen.findByRole('status')).toHaveTextContent(
      'No candidate genes were generated',
    );
    expect(screen.queryByText(/publication withheld|publication unavailable/i)).toBeNull();
    expect(service.enrichCandidates).toHaveBeenCalledWith(base);
    await waitFor(() => expect(apiClient.saveSearchHistory).toHaveBeenCalledTimes(1));
    expect(apiClient.saveSearchHistory).toHaveBeenCalledWith(expect.objectContaining({
      results: expect.objectContaining({ candidateGenes: [], count: 0 }),
    }));
  });

  it('surfaces a terminal publication from a search 503 without enrichment or history', async () => {
    service.findCandidates.mockRejectedValue(
      modelPublicationError('candidate:recovery-disabled'),
    );

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));

    const supportId = await screen.findByText('candidate:recovery-disabled');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Support ID: candidate:recovery-disabled');
    expect(screen.queryByTestId('gene-results')).toBeNull();
    expect(service.enrichCandidates).not.toHaveBeenCalled();
    expect(service.compareGeneSets).not.toHaveBeenCalled();
    expect(apiClient.saveSearchHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    ['malformed', { ...publication('available', { candidateGenes: [] }), status: undefined }],
  ])(
    'fails closed when the candidate publication is %s',
    async (_caseName, artifact) => {
      if (!artifact || artifact.status === undefined) {
        artifact = {
          status: 'unavailable',
          reasonCode: 'client-candidate:invalid-publication',
        };
      }
      service.findCandidates.mockResolvedValue(candidateResult(artifact));

      render(<SearchPage />);
      fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));

      const publicationAlert = await screen.findByRole('alert');
      expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
      expect(publicationAlert).toHaveTextContent('Publication unavailable');
      expect(publicationAlert).toHaveTextContent('client-candidate:invalid-publication');
      expect(screen.queryByTestId('gene-results')).toBeNull();
      expect(service.enrichCandidates).not.toHaveBeenCalled();
      expect(service.compareGeneSets).not.toHaveBeenCalled();
      expect(apiClient.saveSearchHistory).not.toHaveBeenCalled();
    },
  );

  it('shows partial zero-candidate limitations without recording a zero success', async () => {
    const artifact = {
      ...publication('partial', { candidateGenes: [] }),
      limitations: ['Candidate generation ended before completion.'],
    };
    service.findCandidates.mockResolvedValue(candidateResult(artifact));

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));

    const publicationStatus = await screen.findByRole('status');
    expect(publicationStatus).toHaveAttribute('data-publication-status', 'partial');
    expect(publicationStatus).toHaveTextContent('Partial publication');
    expect(publicationStatus).toHaveTextContent('Candidate generation ended before completion.');
    expect(publicationStatus).not.toHaveTextContent('No candidate genes were generated');
    expect(screen.queryByTestId('gene-results')).toBeNull();
    expect(service.enrichCandidates).not.toHaveBeenCalled();
    expect(apiClient.saveSearchHistory).not.toHaveBeenCalled();
  });

  it('ignores a stale manual comparison after a newer terminal search starts', async () => {
    const enrichment = deferred();
    const terminalSearch = deferred();
    const staleComparison = deferred();
    const base = {
      ...candidateResult(publication('available', { candidateGenes: [{ symbol: 'CFTR' }] })),
      candidateGenes: [{ symbol: 'CFTR' }],
    };
    const enriched = { ...base, enriched: true };
    service.findCandidates
      .mockResolvedValueOnce(base)
      .mockImplementationOnce(() => terminalSearch.promise);
    service.enrichCandidates.mockImplementationOnce(() => enrichment.promise);
    service.compareGeneSets.mockImplementationOnce(() => staleComparison.promise);

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));
    expect(await screen.findByTestId('gene-results')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /compare input genes/i }));
    await waitFor(() => expect(service.compareGeneSets).toHaveBeenCalledTimes(1));

    await act(async () => {
      enrichment.resolve(enriched);
      await enrichment.promise;
    });
    const terminalButton = screen.getByRole('button', { name: /run terminal search/i });
    await waitFor(() => expect(terminalButton).not.toBeDisabled());
    fireEvent.click(terminalButton);
    expect(await screen.findByText(/finding genes for "Rheumatoid Arthritis"/i)).toBeInTheDocument();

    await act(async () => {
      staleComparison.resolve({ analysis: 'stale comparison result' });
      await staleComparison.promise;
    });
    expect(screen.getByText(/finding genes for "Rheumatoid Arthritis"/i)).toBeInTheDocument();
    expect(screen.queryByTestId('gene-set-comparison')).toBeNull();
    expect(screen.queryByText(/stale comparison result/i)).toBeNull();

    await act(async () => {
      terminalSearch.reject(modelPublicationError('candidate:newest-recovery'));
      await Promise.allSettled([terminalSearch.promise]);
    });
    const supportId = await screen.findByText('candidate:newest-recovery');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('candidate:newest-recovery');
    expect(screen.queryByTestId('gene-set-comparison')).toBeNull();
  });

  it('lets a newer same-search manual comparison supersede the search-owned comparison', async () => {
    const enrichment = deferred();
    const manualComparison = deferred();
    const base = {
      ...candidateResult(publication('available', { candidateGenes: [{ symbol: 'CFTR' }] })),
      candidateGenes: [{ symbol: 'CFTR' }],
    };
    const enriched = { ...base, enriched: true };
    service.findCandidates.mockResolvedValue(base);
    service.enrichCandidates.mockImplementationOnce(() => enrichment.promise);
    service.compareGeneSets.mockImplementationOnce(() => manualComparison.promise);

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /^compare input genes$/i }));
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));
    expect(await screen.findByTestId('gene-results')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /use BRCA1 genes/i }));
    await waitFor(() => expect(service.compareGeneSets).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('gene-results')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comparing the current gene input',
    );
    expect(service.compareGeneSets).toHaveBeenCalledWith(
      ['BRCA1'],
      ['CFTR'],
      'Cystic Fibrosis',
      false,
    );

    await act(async () => {
      enrichment.resolve(enriched);
      await enrichment.promise;
    });
    await waitFor(() => expect(apiClient.saveSearchHistory).toHaveBeenCalledTimes(1));
    expect(service.compareGeneSets).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Comparing the current gene input',
    );

    await act(async () => {
      manualComparison.resolve({ analysis: 'BRCA1 current comparison' });
      await manualComparison.promise;
    });
    expect(await screen.findByTestId('gene-set-comparison')).toHaveTextContent(
      'BRCA1 current comparison',
    );
  });

  it('does not restore a pending comparison after the input genes are cleared', async () => {
    const enrichment = deferred();
    const staleComparison = deferred();
    const base = {
      ...candidateResult(publication('available', { candidateGenes: [{ symbol: 'CFTR' }] })),
      candidateGenes: [{ symbol: 'CFTR' }],
    };
    service.findCandidates.mockResolvedValue(base);
    service.enrichCandidates.mockImplementationOnce(() => enrichment.promise);
    service.compareGeneSets.mockImplementationOnce(() => staleComparison.promise);

    render(<SearchPage />);
    fireEvent.click(screen.getByRole('button', { name: /run candidate search/i }));
    expect(await screen.findByTestId('gene-results')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^compare input genes$/i }));
    await waitFor(() => expect(service.compareGeneSets).toHaveBeenCalledTimes(1));

    await act(async () => {
      enrichment.resolve({ ...base, enriched: true });
      await enrichment.promise;
    });
    const clearButton = screen.getByRole('button', { name: /clear input genes/i });
    await waitFor(() => expect(clearButton).not.toBeDisabled());
    fireEvent.click(clearButton);
    expect(screen.queryByText(/comparing the current gene input/i)).toBeNull();
    expect(screen.getByRole('button', { name: /run candidate search/i })).not.toBeDisabled();

    await act(async () => {
      staleComparison.resolve({ analysis: 'cleared stale comparison' });
      await staleComparison.promise;
    });
    expect(screen.queryByTestId('gene-set-comparison')).toBeNull();
    expect(screen.queryByText(/cleared stale comparison/i)).toBeNull();
    expect(screen.queryByText(/comparing the current gene input/i)).toBeNull();
  });
});
