import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import Dashboard from '../Dashboard';

const authState = vi.hoisted(() => ({
  user: {
    id: 'alice-id',
    email: 'alice@example.test',
    fullName: 'Alice Example',
    education_level: 'undergraduate',
    demographicsCollected: true,
  },
}));

vi.mock('@genemap/shared', () => ({
  apiClient: {
    getUserActivity: vi.fn(),
    getSearchHistory: vi.fn(),
    getProjects: vi.fn(),
    getGeneSets: vi.fn(),
    invokePublicationTask: vi.fn(),
  },
}));
vi.mock('../../lib/AuthContext', () => ({ useAuth: () => ({ user: authState.user }) }));
vi.mock('../../lib/searchHistory', () => ({ normalizeSearchHistoryEntry: (entry) => entry }));
vi.mock('../../lib/publicationConceptCatalog', () => ({
  publicationHistoryReplay: () => null,
  publicationReferenceFromHistory: () => null,
}));
vi.mock('../../components/shared/logger', () => ({
  log: { debug: vi.fn(), error: vi.fn() },
}));
vi.mock('../../components/shared/constants', () => ({
  DASHBOARD_REFRESH_INTERVAL_MS: 60_000,
}));
vi.mock('../../components/shared/safeModelMarkdown', () => ({
  safeModelMarkdownComponents: {},
}));
vi.mock('../../components/dashboard/OnboardingTour', () => ({ default: () => null }));
vi.mock('@/utils', () => ({
  cn: (...values) => values.filter(Boolean).join(' '),
  createPageUrl: (name) => `/${String(name).toLowerCase()}`,
}));

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function summaryResponse(content, correlationId) {
  return {
    publication: {
      contractVersion: 1,
      status: 'available',
      content,
      reasonCode: null,
      correlationId,
      limitations: [],
    },
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

function dashboardElement() {
  return (
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>
  );
}

describe('Dashboard research summary identity boundary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.user = {
      id: 'alice-id',
      email: 'alice@example.test',
      fullName: 'Alice Example',
      education_level: 'undergraduate',
      demographicsCollected: true,
    };
    apiClient.getUserActivity
      .mockResolvedValueOnce([{ id: 'a1', activityType: 'gene_view', entityId: 'CFTR' }])
      .mockResolvedValueOnce([{ id: 'a2', activityType: 'gene_view', entityId: 'BRCA1' }])
      .mockResolvedValueOnce([{ id: 'b1', activityType: 'gene_view', entityId: 'RUNX1' }]);
    apiClient.getSearchHistory.mockResolvedValue([]);
    apiClient.getProjects.mockResolvedValue([]);
    apiClient.getGeneSets.mockResolvedValue([]);
  });

  it('hides the prior identity synchronously and ignores its later refresh completion', async () => {
    const staleAliceRefresh = deferred();
    const currentBobSummary = deferred();
    apiClient.invokePublicationTask
      .mockResolvedValueOnce(summaryResponse('Alice current summary.', 'summary:alice-current'))
      .mockImplementationOnce(() => staleAliceRefresh.promise)
      .mockImplementationOnce(() => currentBobSummary.promise);

    const { rerender } = render(dashboardElement());
    expect(await screen.findByText('Alice current summary.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
    await waitFor(() => expect(apiClient.invokePublicationTask).toHaveBeenCalledTimes(2));

    authState.user = {
      id: 'bob-id',
      email: 'bob@example.test',
      fullName: 'Bob Example',
      education_level: 'graduate',
      demographicsCollected: true,
    };
    rerender(dashboardElement());
    expect(screen.queryByText('Alice current summary.')).toBeNull();
    await waitFor(() => expect(apiClient.invokePublicationTask).toHaveBeenCalledTimes(3));

    await act(async () => {
      currentBobSummary.resolve(summaryResponse('Bob current summary.', 'summary:bob-current'));
      await currentBobSummary.promise;
    });
    expect(await screen.findByText('Bob current summary.')).toBeInTheDocument();

    await act(async () => {
      staleAliceRefresh.resolve(summaryResponse('Alice stale refresh.', 'summary:alice-stale'));
      await staleAliceRefresh.promise;
    });
    expect(screen.getByText('Bob current summary.')).toBeInTheDocument();
    expect(screen.queryByText(/alice stale refresh/i)).toBeNull();
  });

  it('renders the terminal recovery publication returned with a summary 503', async () => {
    apiClient.invokePublicationTask.mockRejectedValue(
      modelPublicationError('summary:recovery-disabled'),
    );

    render(dashboardElement());

    const supportId = await screen.findByText('summary:recovery-disabled');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Publication unavailable');
    expect(publicationAlert).toHaveTextContent('Support ID: summary:recovery-disabled');
  });

  it('keeps the newest overlapping load data and summary for the same identity', async () => {
    const staleActivityRows = deferred();
    let runIntervalRefresh;
    const realSetInterval = globalThis.setInterval.bind(globalThis);
    const intervalSpy = vi.spyOn(globalThis, 'setInterval').mockImplementation((callback, delay, ...args) => {
      if (!runIntervalRefresh && delay === 60_000) {
        runIntervalRefresh = callback;
        return realSetInterval(() => {}, delay);
      }
      return realSetInterval(callback, delay, ...args);
    });

    apiClient.getUserActivity
      .mockReset()
      .mockResolvedValueOnce([{ id: 'initial', activityType: 'gene_view', entityId: 'CFTR' }])
      .mockImplementationOnce(() => staleActivityRows.promise)
      .mockResolvedValueOnce([{ id: 'newest', activityType: 'gene_view', entityId: 'RUNX1' }]);
    apiClient.invokePublicationTask
      .mockResolvedValueOnce(summaryResponse('Initial summary.', 'summary:initial'))
      .mockResolvedValueOnce(summaryResponse('Newest summary.', 'summary:newest'))
      .mockResolvedValueOnce(summaryResponse('Stale summary.', 'summary:stale'));

    const { unmount } = render(dashboardElement());
    try {
      expect(await screen.findByText('Initial summary.')).toBeInTheDocument();
      expect(runIntervalRefresh).toEqual(expect.any(Function));

      fireEvent.click(screen.getByRole('button', { name: /^refresh$/i }));
      await waitFor(() => expect(apiClient.getUserActivity).toHaveBeenCalledTimes(2));

      act(() => runIntervalRefresh());
      expect(await screen.findByText('Newest summary.')).toBeInTheDocument();
      expect(screen.getByText('RUNX1')).toBeInTheDocument();

      await act(async () => {
        staleActivityRows.resolve([{ id: 'stale', activityType: 'gene_view', entityId: 'BRCA1' }]);
        await staleActivityRows.promise;
      });

      expect(screen.getByText('RUNX1')).toBeInTheDocument();
      expect(screen.queryByText('BRCA1')).toBeNull();
      expect(screen.getByText('Newest summary.')).toBeInTheDocument();
      expect(screen.queryByText('Stale summary.')).toBeNull();
      expect(apiClient.invokePublicationTask).toHaveBeenCalledTimes(2);
    } finally {
      unmount();
      intervalSpy.mockRestore();
    }
  });
});
