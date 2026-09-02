import { describe, expect, it } from 'vitest';
import {
  HEALTH_DOCUMENT_PARSER_VERSION,
  validateHealthRecordContent,
} from '../services/healthRecords.js';

function validLabDocument() {
  return {
    schemaVersion: 1,
    parserVersion: HEALTH_DOCUMENT_PARSER_VERSION,
    status: 'structured',
    source: {
      fileName: 'panel.csv',
      mimeType: 'text/csv',
      sizeBytes: 128,
      sha256: 'a'.repeat(64),
      format: 'csv',
      extractionMethod: 'csv',
      pageCount: 1,
      ocrPages: [],
      extractedAt: '2026-09-02T12:00:00.000Z',
    },
    collectionDate: '2026-09-01',
    observations: [{
      name: 'Glucose',
      value: '102',
      numericValue: 102,
      comparator: null,
      unit: 'mg/dL',
      referenceRange: {
        text: '70-99',
        low: 70,
        high: 99,
        lowerComparator: null,
        upperComparator: null,
      },
      flag: 'high',
      source: { kind: 'row', number: 2 },
    }],
    summary: {
      total: 1,
      high: 1,
      low: 0,
      abnormal: 0,
      normal: 0,
      reported: 0,
      text: "1 lab result extracted; 1 flagged from the document's own ranges or flags.",
    },
    extractedText: 'Test,Result,Units,Reference Range\nGlucose,102,mg/dL,70-99',
    warnings: [],
  };
}

describe('health record storage contract', () => {
  it('accepts the exact supported parser output contract', () => {
    expect(validateHealthRecordContent('lab_document', validLabDocument())).toEqual(validLabDocument());
  });

  it('rejects parser versions the API has not explicitly reviewed', () => {
    const record = validLabDocument();
    record.parserVersion = 'health-document-2.0.0';
    expect(() => validateHealthRecordContent('lab_document', record)).toThrow(/parserVersion/iu);
  });

  it('rejects client-spoofed summary counts and summary prose', () => {
    const badCounts = validLabDocument();
    badCounts.summary.high = 0;
    badCounts.summary.reported = 1;
    expect(() => validateHealthRecordContent('lab_document', badCounts)).toThrow(/summary count/iu);

    const badText = validLabDocument();
    badText.summary.text = 'Everything is normal.';
    expect(() => validateHealthRecordContent('lab_document', badText)).toThrow(/parser-derived/iu);
  });

  it('rejects impossible extraction provenance and placeholder text-only records', () => {
    const badProvenance = validLabDocument();
    badProvenance.source.format = 'pdf';
    expect(() => validateHealthRecordContent('lab_document', badProvenance)).toThrow(/extraction method/iu);

    const textOnly = validLabDocument();
    textOnly.status = 'text_only';
    textOnly.observations = [];
    textOnly.summary = {
      total: 0,
      high: 0,
      low: 0,
      abnormal: 0,
      normal: 0,
      reported: 0,
      text: 'Document text extracted; no structured lab rows were recognized.',
    };
    textOnly.extractedText = 'file-name-only.pdf';
    expect(() => validateHealthRecordContent('lab_document', textOnly)).toThrow(/readable extracted content/iu);
  });
});
