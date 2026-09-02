import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import { parseHealthDocument } from '@/lib/healthDocumentParser';
import HealthData from '../HealthData';

vi.mock('@genemap/shared', () => ({
  apiClient: {
    createMedicalData: vi.fn(),
    deleteMedicalData: vi.fn(),
    getConsentRecords: vi.fn(),
    getMedicalData: vi.fn(),
    recordConsent: vi.fn(),
    recordConsents: vi.fn(),
    updateMedicalData: vi.fn(),
  },
}));

vi.mock('@/lib/healthDocumentParser', () => ({
  parseHealthDocument: vi.fn(),
}));

const parsedLab = {
  schemaVersion: 1,
  parserVersion: 'health-document-1.0.0',
  status: 'structured',
  source: {
    fileName: 'panel.csv',
    mimeType: 'text/csv',
    sizeBytes: 80,
    sha256: 'a'.repeat(64),
    format: 'csv',
    extractionMethod: 'csv',
    pageCount: 1,
    ocrPages: [],
    extractedAt: '2026-09-02T12:00:00.000Z',
  },
  collectionDate: null,
  observations: [{
    name: 'Glucose', value: '102', numericValue: 102, comparator: null,
    unit: 'mg/dL', referenceRange: { text: '70-99' }, flag: 'high',
    source: { kind: 'row', number: 2 },
  }],
  summary: {
    total: 1, high: 1, low: 0, abnormal: 0, normal: 0, reported: 0,
    text: "1 lab result extracted; 1 flagged from the document's own ranges or flags.",
  },
  extractedText: 'Test,Result,Units,Reference Range\nGlucose,102,mg/dL,70-99',
  warnings: [],
};

function renderPage() {
  return render(<MemoryRouter><HealthData /></MemoryRouter>);
}

describe('Health Data production flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClient.getMedicalData.mockResolvedValue([]);
    apiClient.getConsentRecords.mockResolvedValue([
      {
        consentType: 'medical_data_storage', version: '1.0', granted: true,
        createdAt: '2026-09-02T11:00:00.000Z',
      },
      {
        consentType: 'medical_data_ai_analysis', version: '1.0', granted: true,
        createdAt: '2026-09-02T11:00:00.000Z',
      },
    ]);
    apiClient.recordConsent.mockResolvedValue({});
    apiClient.recordConsents.mockResolvedValue([]);
    apiClient.createMedicalData.mockResolvedValue({ id: 'saved-lab', ...parsedLab });
    parseHealthDocument.mockResolvedValue(parsedLab);
  });

  it('parses the selected bytes, previews extracted values, and persists the parser result', async () => {
    const { container } = renderPage();
    await screen.findByText(/upload and parse labwork/iu);
    const input = container.querySelector('input[type="file"]');
    const file = new File([
      'Test,Result,Units,Reference Range\nGlucose,102,mg/dL,70-99',
    ], 'panel.csv', { type: 'text/csv' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(await screen.findByText('Glucose')).toBeInTheDocument();
    expect(screen.getByText('102 mg/dL')).toBeInTheDocument();
    expect(parseHealthDocument).toHaveBeenCalledWith(file, expect.objectContaining({
      onProgress: expect.any(Function),
    }));

    fireEvent.click(screen.getByRole('button', { name: /save encrypted result/iu }));
    await waitFor(() => expect(apiClient.createMedicalData).toHaveBeenCalledWith({
      dataType: 'lab_document',
      title: 'panel',
      content: parsedLab,
      metadata: {
        schemaVersion: 1,
        parserVersion: 'health-document-1.0.0',
        sourceSha256: 'a'.repeat(64),
      },
    }));
    expect(apiClient.recordConsent).toHaveBeenCalledWith(expect.objectContaining({
      consentType: 'medical_data_storage',
      version: '1.0',
      granted: true,
    }));
  });

  it('shows parser failures and never offers to save fabricated output', async () => {
    parseHealthDocument.mockRejectedValueOnce(new Error('No readable health information was found.'));
    const { container } = renderPage();
    await screen.findByText(/upload and parse labwork/iu);

    fireEvent.change(container.querySelector('input[type="file"]'), {
      target: { files: [new File(['unreadable'], 'report.pdf', { type: 'application/pdf' })] },
    });

    expect(await screen.findByText('No readable health information was found.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /save encrypted result/iu })).not.toBeInTheDocument();
    expect(apiClient.createMedicalData).not.toHaveBeenCalled();
  });

  it('saves both privacy choices through one atomic request', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /save privacy choices/iu }));

    await waitFor(() => expect(apiClient.recordConsents).toHaveBeenCalledTimes(1));
    const choices = apiClient.recordConsents.mock.calls[0][0];
    expect(choices).toEqual([
      expect.objectContaining({
        consentType: 'medical_data_storage', version: '1.0', granted: true,
      }),
      expect.objectContaining({
        consentType: 'medical_data_ai_analysis', version: '1.0', granted: true,
      }),
    ]);
    expect(choices[0].metadata.recordedAt).toBe(choices[1].metadata.recordedAt);
  });
});
