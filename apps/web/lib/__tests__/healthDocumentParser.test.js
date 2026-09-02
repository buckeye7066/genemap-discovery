import { describe, expect, it, vi } from 'vitest';
import {
  HealthDocumentParseError,
  __test,
  normalizeHealthDocumentText,
  parseDelimitedText,
  parseHealthDocument,
  parseReferenceRange,
} from '../healthDocumentParser.js';

function csvFile(text, name = 'lab-results.csv') {
  return new File([text], name, { type: 'text/csv' });
}

function buildTextPdf(text) {
  const escaped = text.replaceAll('\\', '\\\\').replaceAll('(', '\\(').replaceAll(')', '\\)');
  const stream = `BT /F1 12 Tf 72 720 Td (${escaped}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new File([pdf], 'text-lab.pdf', { type: 'application/pdf' });
}

describe('health document parsing', () => {
  it('parses quoted CSV cells and uses the document reference range', () => {
    const rows = parseDelimitedText(
      'Test,Result,Units,Reference Range,Flag\n"Glucose, fasting",102,mg/dL,"70 - 99",H\n',
    );
    expect(rows[1][0]).toBe('Glucose, fasting');

    const normalized = normalizeHealthDocumentText(
      'Test,Result,Units,Reference Range,Flag\n"Glucose, fasting",102,mg/dL,"70 - 99",H\n',
      { format: 'csv' },
    );
    expect(normalized.observations).toEqual([
      expect.objectContaining({
        name: 'Glucose, fasting',
        numericValue: 102,
        unit: 'mg/dL',
        flag: 'high',
        referenceRange: expect.objectContaining({ low: 70, high: 99 }),
      }),
    ]);
    expect(normalized.summary.text).toContain('1 lab result extracted');
  });

  it('normalizes common plain-text lab lines without inventing ranges', () => {
    const normalized = normalizeHealthDocumentText(
      'Collected: 2026-08-28\nHemoglobin: 13.4 g/dL (12.0 - 15.5) N\nTSH  2.10 mIU/L  0.40-4.50\n',
    );
    expect(normalized.collectionDate).toBe('2026-08-28');
    expect(normalized.observations).toHaveLength(2);
    expect(normalized.observations[1]).toEqual(expect.objectContaining({
      name: 'TSH',
      numericValue: 2.1,
      unit: 'mIU/L',
      flag: 'normal',
    }));
    expect(parseReferenceRange('', '', '')).toBeNull();
  });

  it('respects exclusive comparator boundaries supplied by the document', () => {
    const normalized = normalizeHealthDocumentText([
      'Marker A: 5 mg/dL <5',
      'Marker B: 10 mg/dL >10',
    ].join('\n'));

    expect(normalized.observations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: 'Marker A',
        flag: 'high',
        referenceRange: expect.objectContaining({ high: 5, upperComparator: '<' }),
      }),
      expect.objectContaining({
        name: 'Marker B',
        flag: 'low',
        referenceRange: expect.objectContaining({ low: 10, lowerComparator: '>' }),
      }),
    ]));
  });

  it('extracts FHIR Observation values and their supplied reference range', () => {
    const observations = __test.observationsFromJson({
      resourceType: 'Bundle',
      entry: [{
        resource: {
          resourceType: 'Observation',
          code: { text: 'ALT' },
          valueQuantity: { value: 62, unit: 'U/L' },
          referenceRange: [{ high: { value: 44 } }],
        },
      }],
    });
    expect(observations).toEqual([
      expect.objectContaining({ name: 'ALT', numericValue: 62, unit: 'U/L', flag: 'high' }),
    ]);
  });

  it('creates a provenance-tagged record from a real CSV File', async () => {
    const result = await parseHealthDocument(csvFile(
      'Test,Result,Units,Reference Range\nGlucose,102,mg/dL,70-99\n',
    ));
    expect(result.status).toBe('structured');
    expect(result.source.sha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(result.source.extractionMethod).toBe('csv');
    expect(result.summary.high).toBe(1);
    expect(result.extractedText).toContain('Glucose,102');
  });

  it('uses a recognized CSV MIME type when a mobile share has no filename extension', async () => {
    const result = await parseHealthDocument(new File([
      'Test,Result,Units,Reference Range\nGlucose,102,mg/dL,70-99\n',
    ], 'shared-lab', { type: 'text/csv' }));

    expect(result.source.format).toBe('csv');
    expect(result.source.extractionMethod).toBe('csv');
    expect(result.observations).toEqual([
      expect.objectContaining({ name: 'Glucose', numericValue: 102, flag: 'high' }),
    ]);
  });

  it('extracts native text from a real PDF instead of summarizing its filename', async () => {
    const result = await parseHealthDocument(buildTextPdf('Glucose  102 mg/dL  70-99 H'));
    expect(result.source.extractionMethod).toBe('pdf_text');
    expect(result.extractedText).toContain('Glucose');
    expect(result.observations[0]).toEqual(expect.objectContaining({ name: 'Glucose', numericValue: 102 }));
    expect(result.summary.text).not.toContain('text-lab.pdf');
  });

  it('runs OCR for a scanned PDF page and preserves the recognized text', async () => {
    const fakePage = {
      getTextContent: async () => ({ items: [] }),
      getViewport: () => ({ width: 100, height: 100 }),
      render: () => ({ promise: Promise.resolve() }),
    };
    const terminate = vi.fn();
    const result = await parseHealthDocument(
      new File(['%PDF-1.4 scanned'], 'scan.pdf', { type: 'application/pdf' }),
      {
        loadPdf: async () => ({
          GlobalWorkerOptions: {},
          getDocument: () => ({
            promise: Promise.resolve({
              numPages: 1,
              getPage: async () => fakePage,
              destroy: vi.fn(),
            }),
          }),
        }),
        createOcrWorker: async () => ({
          recognize: async () => ({ data: { text: 'Platelets  120 10^3/uL 150-400 L' } }),
          terminate,
        }),
        renderPdfPage: async () => ({}),
      },
    );
    expect(result.source.extractionMethod).toBe('pdf_text_and_ocr');
    expect(result.source.ocrPages).toEqual([1]);
    expect(result.observations[0]).toEqual(expect.objectContaining({ name: 'Platelets', flag: 'low' }));
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('does not claim successful OCR when a mixed PDF scanned page is unreadable', async () => {
    const nativePage = {
      getTextContent: async () => ({
        items: [{
          str: 'Glucose  102 mg/dL  70-99 H',
          transform: [1, 0, 0, 1, 0, 100],
          hasEOL: true,
        }],
      }),
    };
    const scannedPage = { getTextContent: async () => ({ items: [] }) };
    const terminate = vi.fn();
    const result = await parseHealthDocument(
      new File(['%PDF-1.4 mixed'], 'mixed.pdf', { type: 'application/pdf' }),
      {
        loadPdf: async () => ({
          GlobalWorkerOptions: {},
          getDocument: () => ({
            promise: Promise.resolve({
              numPages: 2,
              getPage: async (pageNumber) => pageNumber === 1 ? nativePage : scannedPage,
              destroy: vi.fn(),
            }),
          }),
        }),
        createOcrWorker: async () => ({
          recognize: async () => ({ data: { text: '' } }),
          terminate,
        }),
        renderPdfPage: async () => ({}),
      },
    );

    expect(result.source.extractionMethod).toBe('pdf_text');
    expect(result.source.ocrPages).toEqual([]);
    expect(result.warnings).toContain('No readable text was found on PDF page 2.');
    expect(result.observations).toEqual([
      expect.objectContaining({ name: 'Glucose', numericValue: 102 }),
    ]);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('keeps a short OCR result when it contains a structured lab observation', async () => {
    const terminate = vi.fn();
    const result = await parseHealthDocument(
      new File([
        new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0]),
      ], 'a1c.png', { type: 'image/png' }),
      {
        createOcrWorker: async () => ({
          recognize: async () => ({ data: { text: 'A1C  5.7 %' } }),
          terminate,
        }),
      },
    );

    expect(result.status).toBe('structured');
    expect(result.observations).toEqual([
      expect.objectContaining({ name: 'A1C', numericValue: 5.7, unit: '%' }),
    ]);
    expect(terminate).toHaveBeenCalledOnce();
  });

  it('rejects an unreadable document after extraction instead of fabricating content', async () => {
    const file = new File(['%PDF-1.4 unreadable'], 'Normal-results.pdf', { type: 'application/pdf' });
    await expect(parseHealthDocument(file, {
      loadPdf: async () => ({
        GlobalWorkerOptions: {},
        getDocument: () => ({
          promise: Promise.resolve({
            numPages: 1,
            getPage: async () => ({
              getTextContent: async () => ({ items: [] }),
              getViewport: () => ({ width: 10, height: 10 }),
              render: () => ({ promise: Promise.resolve() }),
            }),
            destroy: vi.fn(),
          }),
        }),
      }),
      createOcrWorker: async () => ({
        recognize: async () => ({ data: { text: '' } }),
        terminate: vi.fn(),
      }),
      renderPdfPage: async () => ({}),
    })).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_NO_READABLE_TEXT',
    });
  });

  it('rejects unsupported SVG input before OCR', async () => {
    const createOcrWorker = vi.fn();
    await expect(parseHealthDocument(new File([
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    ], 'result.svg', { type: 'image/svg+xml' }), { createOcrWorker })).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_UNSUPPORTED_TYPE',
    });
    expect(createOcrWorker).not.toHaveBeenCalled();
  });

  it.each([
    ['report.html', 'text/html', '<html><body>Glucose 102 mg/dL</body></html>'],
    ['report.exe', 'text/plain', 'Glucose 102 mg/dL reference 70-99'],
  ])('rejects unsupported textual input %s instead of treating every text MIME as a lab file', async (name, type, content) => {
    await expect(parseHealthDocument(new File([content], name, { type }))).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_UNSUPPORTED_TYPE',
    });
  });

  it('rejects binary content disguised as a text report', async () => {
    await expect(parseHealthDocument(new File([
      new Uint8Array([0, 1, 2, 3, 71, 108, 117, 99, 111, 115, 101, 0, 4, 5]),
    ], 'report.txt', { type: 'text/plain' }))).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_INVALID_TEXT',
    });
  });

  it('rejects a mislabeled image before OCR', async () => {
    const createOcrWorker = vi.fn();
    await expect(parseHealthDocument(new File([
      'this is not a PNG',
    ], 'result.png', { type: 'image/png' }), { createOcrWorker })).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_INVALID_IMAGE',
    });
    expect(createOcrWorker).not.toHaveBeenCalled();
  });

  it.each([
    ['lab-results.csv', 'application/pdf', '%PDF-1.4 disguised'],
    ['lab-results.csv', 'image/png', new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])],
    ['lab-results.pdf', 'text/csv', 'Test,Result\nGlucose,102\n'],
    ['lab-results.json', 'text/plain', '{"resourceType":"Bundle"}'],
  ])('rejects mismatched filename and MIME families for %s as %s', async (name, type, bytes) => {
    await expect(parseHealthDocument(new File([bytes], name, { type }))).rejects.toMatchObject({
      constructor: HealthDocumentParseError,
      code: 'HEALTH_DOCUMENT_TYPE_MISMATCH',
    });
  });
});
