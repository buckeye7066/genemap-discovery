import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import HypothesisGenerator from '../HypothesisGenerator';
import { MANDATED_RESEARCH_EXAMPLES } from '@/lib/researchTaskFixtures';

vi.mock('@genemap/shared', () => ({
  apiClient: { invokePublicationTask: vi.fn() },
}));

describe('guided hypothesis focus identity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.invokePublicationTask.mockResolvedValue({ result: 'bounded research hypothesis' });
  });

  it('clears a prior HPO identity when a no-focus structured example is loaded', async () => {
    render(<HypothesisGenerator />);

    fireEvent.change(screen.getByLabelText(/optional focus type/i), {
      target: { value: 'hpo' },
    });
    fireEvent.change(screen.getByLabelText(/exact HPO identifier/i), {
      target: { value: 'HP:0001250' },
    });
    fireEvent.click(screen.getByRole('button', {
      name: new RegExp(MANDATED_RESEARCH_EXAMPLES[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')),
    }));

    expect(screen.getByLabelText(/optional focus type/i)).toHaveValue('none');
    expect(screen.queryByLabelText(/exact HPO identifier/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));

    await waitFor(() => expect(apiClient.invokePublicationTask).toHaveBeenCalledOnce());
    const [task, taskInput] = apiClient.invokePublicationTask.mock.calls[0];
    expect(task).toBe('research_hypothesis');
    expect(taskInput).not.toHaveProperty('focus');
    expect(JSON.stringify(taskInput)).not.toContain('HP:0001250');
  });

  it('requires a new reviewed selection after changing away from HPO mode', async () => {
    render(<HypothesisGenerator />);

    fireEvent.change(screen.getByLabelText(/optional focus type/i), {
      target: { value: 'hpo' },
    });
    fireEvent.change(screen.getByLabelText(/exact HPO identifier/i), {
      target: { value: 'HP:0001250' },
    });
    fireEvent.change(screen.getByLabelText(/optional focus type/i), {
      target: { value: 'curated' },
    });
    expect(screen.getByLabelText(/reviewed concept/i)).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: /generate research hypotheses/i }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/choose a reviewed concept/i));
    expect(screen.getByRole('note')).toHaveTextContent(/exploratory research only/i);
    expect(screen.getAllByRole('alert')).toHaveLength(1);
    expect(apiClient.invokePublicationTask).not.toHaveBeenCalled();
  });
});
