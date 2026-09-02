import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import Assistants from '../Assistants';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    chatWithAssistant: vi.fn(),
    deleteConversation: vi.fn(),
    getConversations: vi.fn(),
    getMedicalData: vi.fn(),
  },
}));

const recordId = '11111111-1111-4111-8111-111111111111';
const record = {
  id: recordId,
  dataType: 'lab_document',
  title: 'August metabolic panel',
  content: {
    schemaVersion: 1,
    parserVersion: 'health-document-1.0.0',
    status: 'structured',
    source: {
      sha256: 'a'.repeat(64),
      extractionMethod: 'pdf_text',
    },
    observations: [{ name: 'Glucose', value: '102', unit: 'mg/dL' }],
    summary: { total: 1 },
    extractedText: 'Glucose 102 mg/dL reference range 70-99',
  },
};

const receipt = {
  contextVersion: '1.0',
  generatedAt: '2026-09-02T12:00:00.000Z',
  assistant: 'anastasia',
  profileFields: ['age', 'fieldOfStudy'],
  healthProfileIncluded: true,
  records: [{
    id: recordId,
    title: record.title,
    status: 'structured',
    parserVersion: 'health-document-1.0.0',
    extractionMethod: 'pdf_text',
    observationCount: 1,
    sourceSha256: 'a'.repeat(64),
  }],
  research: { geneSetCount: 1, projectCount: 2, recentSearchCount: 3 },
  responseReview: {
    status: 'passed',
    generationAttempts: 1,
    matchedContextKinds: ['lab_observation', 'lab_value'],
    requiredContextKinds: ['lab_observation', 'lab_value'],
  },
};

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

describe('profile-aware assistants page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getMedicalData.mockResolvedValue([record]);
    apiClient.getConversations.mockResolvedValue([]);
    apiClient.deleteConversation.mockResolvedValue({ success: true, deleted: true });
    apiClient.chatWithAssistant.mockResolvedValue({
      assistant: { id: 'anastasia', displayName: 'Anastasia' },
      conversationId: '22222222-2222-4222-8222-222222222222',
      message: 'Your Glucose result was 102 mg/dL; ask whether the sample was fasting.',
      contextReceipt: receipt,
    });
  });

  it('sends selected owner records through the assistant API and renders its context receipt', async () => {
    render(<MemoryRouter initialEntries={[`/assistants?record=${recordId}`]}><Assistants /></MemoryRouter>);

    expect(await screen.findByText('August metabolic panel')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeChecked());
    fireEvent.change(screen.getByPlaceholderText(/ask Anastasia/iu), {
      target: { value: 'What should I ask at my appointment?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/iu }));

    await waitFor(() => expect(apiClient.chatWithAssistant).toHaveBeenCalledWith('anastasia', {
      message: 'What should I ask at my appointment?',
      conversationId: undefined,
      recordIds: [recordId],
    }));
    expect(await screen.findByText(/Your Glucose result was 102 mg\/dL/iu)).toBeInTheDocument();
    expect(screen.getByText(/Context receipt 1.0/iu)).toBeInTheDocument();
    expect(screen.getByText(/Required: lab observation, lab value/iu)).toBeInTheDocument();
    expect(screen.getByText(/1 gene sets, 2 projects, 3 recent searches/iu)).toBeInTheDocument();
  });

  it('excludes legacy filename-only records from selectable assistant context', async () => {
    apiClient.getMedicalData.mockResolvedValueOnce([{
      id: recordId,
      dataType: 'lab_document',
      title: 'Normal-results.pdf',
      content: { summary: { total: 0 } },
    }]);

    render(<MemoryRouter><Assistants /></MemoryRouter>);

    expect(await screen.findByText(/1 older record cannot enter assistant context/iu)).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/No parsed records/iu)).toBeInTheDocument();
  });

  it('drops a late response after the user switches assistants', async () => {
    const lateAnastasia = deferred();
    apiClient.chatWithAssistant.mockReturnValueOnce(lateAnastasia.promise);
    render(<MemoryRouter><Assistants /></MemoryRouter>);

    await screen.findByText('August metabolic panel');
    fireEvent.change(screen.getByPlaceholderText(/ask Anastasia/iu), {
      target: { value: 'Use my profile.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /send/iu }));
    await waitFor(() => expect(apiClient.chatWithAssistant).toHaveBeenCalledOnce());

    fireEvent.click(screen.getByRole('button', { name: /Robert Technical genomics/iu }));
    expect(await screen.findByPlaceholderText(/ask Robert/iu)).toBeInTheDocument();

    await act(async () => lateAnastasia.resolve({
      assistant: { id: 'anastasia', displayName: 'Anastasia' },
      conversationId: '33333333-3333-4333-8333-333333333333',
      message: 'Late Anastasia response that belongs to the old persona.',
      contextReceipt: receipt,
    }));

    expect(screen.queryByText(/Late Anastasia response/iu)).not.toBeInTheDocument();
    expect(screen.queryByText(/Context receipt 1.0/iu)).not.toBeInTheDocument();
  });

  it('deletes an owner conversation through the audited API control', async () => {
    apiClient.getConversations.mockResolvedValueOnce([{
      id: '44444444-4444-4444-8444-444444444444',
      assistantType: 'anastasia',
      title: 'Saved panel question',
      messages: [{ role: 'user', content: 'Explain my panel.' }],
      metadata: { lastContextReceipt: receipt },
    }]);
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    try {
      render(<MemoryRouter><Assistants /></MemoryRouter>);

      expect(await screen.findByText('Saved panel question')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /delete saved panel question conversation/iu }));

      await waitFor(() => expect(apiClient.deleteConversation).toHaveBeenCalledWith(
        '44444444-4444-4444-8444-444444444444',
      ));
      expect(screen.queryByText('Saved panel question')).not.toBeInTheDocument();
      expect(screen.getByText('Assistant conversation deleted.')).toBeInTheDocument();
    } finally {
      confirm.mockRestore();
    }
  });
});
