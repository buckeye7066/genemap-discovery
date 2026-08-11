import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import HypothesisGenerator from '../HypothesisGenerator';

vi.mock('@genemap/shared', () => ({
  apiClient: { invokePublicationTask: vi.fn() },
}));

function readBlobAsText(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error || new Error('Unable to read downloaded artifact')));
    reader.readAsText(blob);
  });
}

describe('HypothesisGenerator downloadable artifact', () => {
  let capturedBlob;
  let clickSpy;

  beforeEach(() => {
    capturedBlob = null;
    vi.clearAllMocks();
    apiClient.invokePublicationTask.mockResolvedValue({
      publication: {
        contractVersion: 1,
        status: 'available',
        content: '## Bounded result\nVerify sources.',
        reasonCode: null,
        correlationId: 'hypothesis-test-1',
        limitations: [],
      },
    });
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn((blob) => {
        capturedBlob = blob;
        return 'blob:genemap-hypothesis';
      }),
      revokeObjectURL: vi.fn(),
    });
    clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  afterEach(() => {
    clickSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('includes control-group state and the exact reviewed focus identity', async () => {
    render(<HypothesisGenerator />);

    fireEvent.click(screen.getByLabelText(/a control group is present/i));
    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));

    await waitFor(() => expect(apiClient.invokePublicationTask).toHaveBeenCalledOnce());
    await screen.findByText(/bounded result/i);
    fireEvent.click(screen.getByRole('button', { name: /download markdown/i }));

    expect(capturedBlob).toBeInstanceOf(Blob);
    const markdown = await readBlobAsText(capturedBlob);
    expect(markdown).toContain('Control group present: No');
    expect(markdown).toContain('Focus: early-onset symptoms (phenotype; phenotype:early-onset-symptoms; genemap_curated@1)');
    expect(markdown).toContain('Objective: identify_variants');
    expect(markdown).toContain('Modalities: wes, phenotype');
    expect(markdown).toContain('Publication status: available');
    expect(markdown).toContain('Publication correlation: hypothesis-test-1');
    expect(markdown).toContain('## Bounded result');
    expect(markdown).toContain('Education and exploratory research only');
  });

  it('serializes visible limitations for a partial publication', async () => {
    apiClient.invokePublicationTask.mockResolvedValueOnce({
      publication: {
        contractVersion: 1,
        status: 'partial',
        content: '## Partial bounded result',
        reasonCode: 'provider_truncated',
        correlationId: 'hypothesis-test-partial',
        limitations: ['The provider reached its output limit.'],
      },
    });
    render(<HypothesisGenerator />);

    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));
    await screen.findByText(/partial publication/i);
    expect(screen.getByText(/provider reached its output limit/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /download markdown/i }));

    const markdown = await readBlobAsText(capturedBlob);
    expect(markdown).toContain('Publication status: partial');
    expect(markdown).toContain('Publication reason: provider_truncated');
    expect(markdown).toContain('- The provider reached its output limit.');
  });

  it('does not render or download withheld generated content', async () => {
    apiClient.invokePublicationTask.mockResolvedValueOnce({
      result: 'legacy alias must not be displayed',
      publication: {
        contractVersion: 1,
        status: 'withheld',
        content: null,
        reasonCode: 'clinical_boundary',
        correlationId: 'hypothesis-test-withheld',
        limitations: [],
      },
    });
    render(<HypothesisGenerator />);

    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));
    await screen.findByText(/publication withheld/i);

    expect(screen.queryByText(/legacy alias must not be displayed/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /download markdown/i })).not.toBeInTheDocument();
    expect(capturedBlob).toBeNull();
  });

  it('renders the terminal recovery publication returned with an invoke 503', async () => {
    const error = new Error('Generated content is temporarily unavailable.');
    error.status = 503;
    error.details = {
      publication: {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: 'model_publication_disabled',
        correlationId: 'hypothesis:recovery-disabled',
        limitations: [],
      },
    };
    apiClient.invokePublicationTask.mockRejectedValueOnce(error);
    render(<HypothesisGenerator />);

    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));

    const supportId = await screen.findByText('hypothesis:recovery-disabled');
    const publicationAlert = supportId.closest('[data-publication-status]');
    expect(publicationAlert).not.toBeNull();
    expect(publicationAlert).toHaveAttribute('data-publication-status', 'unavailable');
    expect(publicationAlert).toHaveTextContent('Support ID: hypothesis:recovery-disabled');
    expect(screen.queryByRole('button', { name: /download markdown/i })).not.toBeInTheDocument();
    expect(capturedBlob).toBeNull();
  });
});
