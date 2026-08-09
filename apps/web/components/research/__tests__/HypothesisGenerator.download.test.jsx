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
    apiClient.invokePublicationTask.mockResolvedValue({ result: '## Bounded result\nVerify sources.' });
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
    expect(markdown).toContain('Focus: Early-onset symptoms (phenotype; phenotype:early-onset-symptoms; genemap_curated@1)');
    expect(markdown).toContain('Objective: identify_variants');
    expect(markdown).toContain('Modalities: wes, phenotype');
    expect(markdown).toContain('## Bounded result');
    expect(markdown).toContain('Education and exploratory research only');
  });
});