const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 40;
const MAX_OCR_PAGES = 20;
const MAX_OBSERVATIONS = 300;
const MAX_STORED_TEXT = 50_000;
const MIN_MEANINGFUL_TEXT = 24;
const MIN_NATIVE_PDF_TEXT_PER_PAGE = 18;

export const HEALTH_DOCUMENT_SCHEMA_VERSION = 1;
export const HEALTH_DOCUMENT_PARSER_VERSION = 'health-document-1.0.0';

const SUPPORTED_EXTENSIONS = new Set([
  'csv',
  'jpeg',
  'jpg',
  'json',
  'pdf',
  'png',
  'text',
  'tsv',
  'txt',
  'webp',
]);

const IMAGE_EXTENSIONS = new Set(['jpeg', 'jpg', 'png', 'webp']);
const IMAGE_MIME_FORMATS = new Map([
  ['image/jpeg', 'jpeg'],
  ['image/jpg', 'jpeg'],
  ['image/png', 'png'],
  ['image/webp', 'webp'],
]);
const TEXT_MIME_FORMATS = new Map([
  ['application/csv', 'csv'],
  ['text/csv', 'csv'],
  ['text/plain', 'text'],
  ['text/tab-separated-values', 'tsv'],
]);

function extensionFamily(ext) {
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (ext === 'pdf') return 'pdf';
  if (ext === 'json') return 'json';
  if (['csv', 'text', 'tsv', 'txt'].includes(ext)) return 'text';
  return null;
}

function mimeFamily(mimeType) {
  if (IMAGE_MIME_FORMATS.has(mimeType)) return 'image';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType === 'application/json') return 'json';
  if (TEXT_MIME_FORMATS.has(mimeType)) return 'text';
  return null;
}

function assertDeclaredDocumentFamily(ext, mimeType) {
  const fileFamily = extensionFamily(ext);
  const mediaFamily = mimeFamily(mimeType);
  if (fileFamily && mediaFamily && fileFamily !== mediaFamily) {
    throw new HealthDocumentParseError(
      'The document filename and media type describe different file formats.',
      'HEALTH_DOCUMENT_TYPE_MISMATCH',
    );
  }
}

const HEADER_ALIASES = Object.freeze({
  name: ['analyte', 'component', 'lab', 'labtest', 'marker', 'test', 'testname'],
  value: ['measurement', 'result', 'resultvalue', 'value'],
  unit: ['resultunit', 'unit', 'units'],
  range: ['interval', 'normalrange', 'range', 'referenceinterval', 'referencerange'],
  low: ['lower', 'lowerlimit', 'low', 'minimum', 'min'],
  high: ['higher', 'high', 'maximum', 'max', 'upper', 'upperlimit'],
  flag: ['abnormal', 'abnormalflag', 'flag', 'interpretation', 'resultflag', 'status'],
  date: ['collected', 'collectiondate', 'date', 'resultdate', 'specimendate'],
});

export class HealthDocumentParseError extends Error {
  constructor(message, code = 'HEALTH_DOCUMENT_PARSE_FAILED') {
    super(message);
    this.name = 'HealthDocumentParseError';
    this.code = code;
  }
}

function extensionFor(fileName = '') {
  const match = String(fileName).toLowerCase().match(/\.([a-z0-9]+)$/u);
  return match?.[1] || '';
}

function normalizeSpace(value) {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function normalizeHeader(value) {
  return normalizeSpace(value).toLowerCase().replace(/[^a-z0-9]/gu, '');
}

function clampProgress(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function report(onProgress, phase, progress, message) {
  onProgress?.({ phase, progress: clampProgress(progress), message });
}

function meaningfulText(text) {
  return String(text || '').replace(/[^A-Za-z0-9]/gu, '').length >= MIN_MEANINGFUL_TEXT;
}

export function isSupportedHealthDocument(file) {
  const ext = extensionFor(file?.name);
  const type = String(file?.type || '').toLowerCase();
  if (ext && !SUPPORTED_EXTENSIONS.has(ext)) return false;
  if (type.startsWith('image/') && !IMAGE_MIME_FORMATS.has(type)) return false;
  return SUPPORTED_EXTENSIONS.has(ext)
    || type === 'application/pdf'
    || type === 'application/json'
    || TEXT_MIME_FORMATS.has(type)
    || IMAGE_MIME_FORMATS.has(type);
}

function assertTextualContent(text) {
  const value = String(text || '');
  if (value.includes('\0')) {
    throw new HealthDocumentParseError(
      'The selected file contains binary data and is not a supported text document.',
      'HEALTH_DOCUMENT_INVALID_TEXT',
    );
  }
  const controls = [...value].filter((character) => {
    const code = character.codePointAt(0);
    return code < 32 && character !== '\n' && character !== '\r' && character !== '\t';
  }).length;
  if (value.length && controls / value.length > 0.01) {
    throw new HealthDocumentParseError(
      'The selected file is not readable plain text.',
      'HEALTH_DOCUMENT_INVALID_TEXT',
    );
  }
}

function imageFormatFromBytes(buffer) {
  const bytes = new Uint8Array(buffer);
  if (bytes.length >= 8
    && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value)) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') {
    return 'webp';
  }
  return null;
}

function expectedImageFormat(ext, mimeType) {
  const extensionFormat = ext === 'jpg' ? 'jpeg' : (IMAGE_EXTENSIONS.has(ext) ? ext : null);
  const mimeFormat = IMAGE_MIME_FORMATS.get(mimeType) || null;
  if (extensionFormat && mimeFormat && extensionFormat !== mimeFormat) {
    throw new HealthDocumentParseError(
      'The image filename and media type do not match.',
      'HEALTH_DOCUMENT_TYPE_MISMATCH',
    );
  }
  return extensionFormat || mimeFormat;
}

function assertDocumentSignature(buffer, { ext, mimeType, isImage }) {
  const bytes = new Uint8Array(buffer);
  if (ext === 'pdf' || mimeType === 'application/pdf') {
    if (bytes.length < 5 || String.fromCharCode(...bytes.slice(0, 5)) !== '%PDF-') {
      throw new HealthDocumentParseError(
        'The selected file is not a valid PDF document.',
        'HEALTH_DOCUMENT_INVALID_PDF',
      );
    }
  }
  if (isImage) {
    const expected = expectedImageFormat(ext, mimeType);
    const detected = imageFormatFromBytes(buffer);
    if (!detected || detected !== expected) {
      throw new HealthDocumentParseError(
        'The selected image is not a valid PNG, JPEG, or WebP file.',
        'HEALTH_DOCUMENT_INVALID_IMAGE',
      );
    }
  }
}

async function sha256Hex(buffer) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.subtle) {
    throw new HealthDocumentParseError(
      'This browser cannot calculate the document integrity hash.',
      'HEALTH_DOCUMENT_HASH_UNAVAILABLE',
    );
  }
  const digest = await cryptoApi.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function parseDelimitedText(text, delimiter = ',') {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findColumn(headers, field) {
  const aliases = HEADER_ALIASES[field];
  return headers.findIndex((header) => aliases.includes(normalizeHeader(header)));
}

function parseNumericValue(rawValue) {
  const text = normalizeSpace(rawValue);
  const match = text.match(/^([<>]=?)?\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/u);
  if (!match) return { comparator: null, numericValue: null };
  return {
    comparator: match[1] || null,
    numericValue: Number(match[2]),
  };
}

export function parseReferenceRange(rawRange, rawLow, rawHigh) {
  const parsedLow = parseNumericValue(rawLow);
  const parsedHigh = parseNumericValue(rawHigh);
  const explicitLow = parsedLow.numericValue;
  const explicitHigh = parsedHigh.numericValue;
  const text = normalizeSpace(rawRange)
    .replace(/[–—]/gu, '-')
    .replace(/\s+to\s+/giu, '-');

  let low = explicitLow;
  let high = explicitHigh;
  let lowerComparator = parsedLow.comparator?.startsWith('>') ? parsedLow.comparator : null;
  let upperComparator = parsedHigh.comparator?.startsWith('<') ? parsedHigh.comparator : null;

  const between = text.match(/^(-?(?:\d+(?:\.\d+)?|\.\d+))\s*-\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/u);
  if (between) {
    low ??= Number(between[1]);
    high ??= Number(between[2]);
  } else {
    const bounded = text.match(/^([<>]=?)\s*(-?(?:\d+(?:\.\d+)?|\.\d+))$/u);
    if (bounded) {
      if (bounded[1].startsWith('<')) {
        high ??= Number(bounded[2]);
        upperComparator = bounded[1];
      } else {
        low ??= Number(bounded[2]);
        lowerComparator = bounded[1];
      }
    }
  }

  if (!text && low == null && high == null) return null;
  return {
    text: text || [low, high].filter((value) => value != null).join(' - '),
    low,
    high,
    lowerComparator,
    upperComparator,
  };
}

function normalizeFlag(rawFlag, numericValue, range) {
  const flag = normalizeHeader(rawFlag);
  if (['h', 'hi', 'high', 'above', 'elevated'].includes(flag)) return 'high';
  if (['l', 'lo', 'low', 'below'].includes(flag)) return 'low';
  if (['a', 'abnormal', 'critical', 'positive', 'reactive'].includes(flag)) return 'abnormal';
  if (['n', 'normal', 'negative', 'nonreactive', 'withinrange'].includes(flag)) return 'normal';

  if (numericValue != null && range) {
    const belowLow = range.low != null && (
      numericValue < range.low
      || (range.lowerComparator === '>' && numericValue <= range.low)
    );
    const aboveHigh = range.high != null && (
      numericValue > range.high
      || (range.upperComparator === '<' && numericValue >= range.high)
    );
    if (belowLow) return 'low';
    if (aboveHigh) return 'high';
    if (range.low != null || range.high != null) return 'normal';
  }
  return 'reported';
}

function createObservation({
  name,
  value,
  unit,
  range,
  low = null,
  high = null,
  flag,
  source,
}) {
  const normalizedName = normalizeSpace(name).replace(/^[|:;,-]+|[|:;,-]+$/gu, '');
  const normalizedValue = normalizeSpace(value);
  if (!normalizedName || !normalizedValue) return null;
  if (/^(date|dob|name|patient|reference|range|result|test|unit)$/iu.test(normalizedName)) return null;
  if (normalizedName.length > 120 || normalizedValue.length > 100) return null;

  const parsedValue = parseNumericValue(normalizedValue);
  const referenceRange = parseReferenceRange(range, low, high);
  return {
    name: normalizedName,
    value: normalizedValue,
    numericValue: parsedValue.numericValue,
    comparator: parsedValue.comparator,
    unit: normalizeSpace(unit) || null,
    referenceRange,
    flag: normalizeFlag(flag, parsedValue.numericValue, referenceRange),
    source,
  };
}

function observationsFromRows(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeSpace);
  const index = {
    name: findColumn(headers, 'name'),
    value: findColumn(headers, 'value'),
    unit: findColumn(headers, 'unit'),
    range: findColumn(headers, 'range'),
    low: findColumn(headers, 'low'),
    high: findColumn(headers, 'high'),
    flag: findColumn(headers, 'flag'),
  };
  if (index.name < 0 || index.value < 0) return [];

  return rows.slice(1).map((row, offset) => createObservation({
    name: row[index.name],
    value: row[index.value],
    unit: index.unit >= 0 ? row[index.unit] : null,
    range: index.range >= 0 ? row[index.range] : null,
    low: index.low >= 0 ? row[index.low] : null,
    high: index.high >= 0 ? row[index.high] : null,
    flag: index.flag >= 0 ? row[index.flag] : null,
    source: { kind: 'row', number: offset + 2 },
  })).filter(Boolean);
}

function observationFromFhir(resource, sourceNumber) {
  if (resource?.resourceType !== 'Observation') return null;
  const name = resource.code?.text
    || resource.code?.coding?.find((coding) => coding?.display)?.display;
  const quantity = resource.valueQuantity;
  const value = quantity?.value ?? resource.valueString ?? resource.valueCodeableConcept?.text;
  const reference = resource.referenceRange?.[0];
  const interpretation = resource.interpretation?.[0]?.text
    || resource.interpretation?.[0]?.coding?.[0]?.code;
  return createObservation({
    name,
    value,
    unit: quantity?.unit || quantity?.code,
    low: reference?.low?.value,
    high: reference?.high?.value,
    range: reference?.text,
    flag: interpretation,
    source: { kind: 'fhir', number: sourceNumber },
  });
}

function collectJsonObjects(value, output = [], depth = 0) {
  if (depth > 8 || output.length >= MAX_OBSERVATIONS * 3 || value == null) return output;
  if (Array.isArray(value)) {
    for (const item of value) collectJsonObjects(item, output, depth + 1);
  } else if (typeof value === 'object') {
    output.push(value);
    for (const child of Object.values(value)) collectJsonObjects(child, output, depth + 1);
  }
  return output;
}

function observationsFromJson(value) {
  const objects = collectJsonObjects(value);
  const fhir = objects
    .map((object, index) => observationFromFhir(object, index + 1))
    .filter(Boolean);
  if (fhir.length) return fhir;

  const rows = objects.filter((object) => {
    const keys = Object.keys(object).map(normalizeHeader);
    return HEADER_ALIASES.name.some((key) => keys.includes(key))
      && HEADER_ALIASES.value.some((key) => keys.includes(key));
  });
  if (!rows.length) return [];

  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  return observationsFromRows([
    headers,
    ...rows.map((row) => headers.map((header) => {
      const valueAtKey = row[header];
      return typeof valueAtKey === 'object' ? JSON.stringify(valueAtKey) : String(valueAtKey ?? '');
    })),
  ]);
}

function observationsFromText(text) {
  const observations = [];
  const lines = String(text || '').split(/\r?\n/u);
  const valuePattern = '((?:[<>]=?)?\\s*-?(?:\\d+(?:\\.\\d+)?|\\.\\d+)|positive|negative|reactive|non[- ]?reactive|detected|not detected)';
  const rowPattern = new RegExp(
    `^\\s*([A-Za-z][A-Za-z0-9 %.()/_+,'-]{1,90}?)(?::\\s*|\\s{2,})${valuePattern}(?:\\s+(.+))?$`,
    'iu',
  );
  const compactRowPattern = new RegExp(
    `^\\s*([A-Za-z][A-Za-z0-9 %.()/_+,'-]{1,90}?)\\s+${valuePattern}(?:\\s+(.+))$`,
    'iu',
  );
  const rangePattern = /\(?\s*((?:-?(?:\d+(?:\.\d+)?|\.\d+))\s*(?:-|–|—|to)\s*(?:-?(?:\d+(?:\.\d+)?|\.\d+))|[<>]=?\s*-?(?:\d+(?:\.\d+)?|\.\d+))\s*\)?/iu;

  lines.forEach((line, index) => {
    const cleaned = line.replace(/[|]+/gu, '  ').trim();
    if (!cleaned || cleaned.length > 240) return;
    const match = cleaned.match(rowPattern) || cleaned.match(compactRowPattern);
    if (!match) return;
    const name = match[1];
    const value = match[2];
    if (/\b(?:collected|collection|date|dob|patient|reported|specimen)\b/iu.test(name)) return;

    let remainder = normalizeSpace(match[3]);
    const flagMatch = remainder.match(/(?:^|\s)(H|L|A|N|high|low|abnormal|normal)\s*$/iu);
    const flag = flagMatch?.[1] || null;
    if (flagMatch) remainder = remainder.slice(0, flagMatch.index).trim();
    const rangeMatch = remainder.match(rangePattern);
    const range = rangeMatch?.[1] || null;
    if (rangeMatch) {
      remainder = `${remainder.slice(0, rangeMatch.index)} ${remainder.slice((rangeMatch.index || 0) + rangeMatch[0].length)}`.trim();
    }
    const unit = normalizeSpace(remainder.replace(/^\(|\)$/gu, '')) || null;
    const observation = createObservation({
      name,
      value: value.replace(/\s+/gu, ''),
      unit,
      range,
      flag,
      source: { kind: 'line', number: index + 1 },
    });
    if (observation) observations.push(observation);
  });
  return observations;
}

function deduplicateObservations(observations) {
  const seen = new Set();
  const unique = [];
  for (const observation of observations) {
    const key = [
      normalizeHeader(observation.name),
      normalizeHeader(observation.value),
      normalizeHeader(observation.unit),
      observation.source?.kind,
      observation.source?.number,
    ].join('|');
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(observation);
    }
    if (unique.length >= MAX_OBSERVATIONS) break;
  }
  return unique;
}

function summarizeObservations(observations) {
  const counts = {
    total: observations.length,
    high: observations.filter((item) => item.flag === 'high').length,
    low: observations.filter((item) => item.flag === 'low').length,
    abnormal: observations.filter((item) => item.flag === 'abnormal').length,
    normal: observations.filter((item) => item.flag === 'normal').length,
    reported: observations.filter((item) => item.flag === 'reported').length,
  };
  const flagged = counts.high + counts.low + counts.abnormal;
  return {
    ...counts,
    text: observations.length
      ? `${observations.length} lab result${observations.length === 1 ? '' : 's'} extracted; ${flagged} flagged from the document's own ranges or flags.`
      : 'Document text extracted; no structured lab rows were recognized.',
  };
}

function textItemsToLines(items) {
  const lines = [];
  let current = '';
  let previousY = null;
  for (const item of items) {
    const value = normalizeSpace(item?.str);
    if (!value) continue;
    const y = Number(item?.transform?.[5]);
    const startsNewLine = previousY != null && Number.isFinite(y) && Math.abs(y - previousY) > 2.5;
    if ((startsNewLine || item.hasEOL) && current) {
      lines.push(current.trim());
      current = '';
    }
    current += `${current ? ' ' : ''}${value}`;
    if (Number.isFinite(y)) previousY = y;
    if (item.hasEOL && current) {
      lines.push(current.trim());
      current = '';
    }
  }
  if (current) lines.push(current.trim());
  return lines.join('\n');
}

async function defaultPdfLoader() {
  const useLegacyBuild = typeof navigator !== 'undefined' && /jsdom/iu.test(navigator.userAgent);
  if (useLegacyBuild) return import('pdfjs-dist/legacy/build/pdf.mjs');
  const [pdfjs, workerModule] = await Promise.all([
    import('pdfjs-dist/build/pdf.mjs'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
  return pdfjs;
}

async function defaultOcrWorker(onProgress) {
  const [{ createWorker }, workerModule, coreModule] = await Promise.all([
    import('tesseract.js'),
    import('tesseract.js/dist/worker.min.js?url'),
    // The LSTM-only build embeds its WASM payload. Supplying this exact local
    // file avoids Tesseract's jsDelivr default and works under GeneMap's
    // same-origin CSP. It is slower than SIMD on some devices but broadly
    // compatible and deterministic.
    import('tesseract.js-core/tesseract-core-lstm.wasm.js?url'),
  ]);
  const langPath = typeof window === 'undefined'
    ? '/ocr'
    : new URL('/ocr', window.location.origin).href.replace(/\/$/u, '');
  return createWorker('eng', 1, {
    workerPath: workerModule.default,
    workerBlobURL: false,
    corePath: coreModule.default,
    langPath,
    logger: (event) => {
      if (typeof event?.progress === 'number') {
        report(onProgress, 'ocr', event.progress, `OCR: ${event.status || 'recognizing text'}`);
      }
    },
  });
}

async function defaultRenderPdfPage(page) {
  if (typeof document === 'undefined') {
    throw new HealthDocumentParseError(
      'OCR requires a browser canvas.',
      'HEALTH_DOCUMENT_OCR_UNAVAILABLE',
    );
  }
  const viewport = page.getViewport({ scale: 2 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) {
    throw new HealthDocumentParseError('Unable to initialize OCR canvas.', 'HEALTH_DOCUMENT_OCR_UNAVAILABLE');
  }
  await page.render({ canvasContext: context, viewport }).promise;
  return canvas;
}

/**
 * @param {ArrayBuffer} buffer
 * @param {{onProgress?: Function, loadPdf?: Function, createOcrWorker?: Function, renderPdfPage?: Function}} [options]
 */
export async function extractPdfText(buffer, {
  onProgress,
  loadPdf = defaultPdfLoader,
  createOcrWorker = defaultOcrWorker,
  renderPdfPage = defaultRenderPdfPage,
} = {}) {
  report(onProgress, 'extract', 0.05, 'Opening PDF');
  const pdfjs = await loadPdf();
  const pdf = await pdfjs.getDocument({
    data: new Uint8Array(buffer),
    // PDF.js disables system-font fallback in its Node-flavoured legacy build.
    // Explicitly enabling it keeps standard-font PDFs readable in tests and in
    // browsers without requiring a runtime CDN fetch.
    useSystemFonts: true,
  }).promise;
  if (pdf.numPages > MAX_PDF_PAGES) {
    throw new HealthDocumentParseError(
      `PDF has ${pdf.numPages} pages; the maximum is ${MAX_PDF_PAGES}.`,
      'HEALTH_DOCUMENT_TOO_MANY_PAGES',
    );
  }

  const pageText = [];
  const warnings = [];
  const pagesNeedingOcr = [];
  let worker = null;
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      report(onProgress, 'extract', pageNumber / pdf.numPages, `Reading PDF page ${pageNumber} of ${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const nativeText = textItemsToLines(content.items || []);
      if (
        nativeText.replace(/\s/gu, '').length >= MIN_NATIVE_PDF_TEXT_PER_PAGE
        || observationsFromText(nativeText).length > 0
      ) {
        pageText.push({ pageNumber, text: nativeText, method: 'pdf_text' });
      } else {
        pagesNeedingOcr.push({ pageNumber, page });
      }
    }

    if (pagesNeedingOcr.length > MAX_OCR_PAGES) {
      throw new HealthDocumentParseError(
        `PDF needs OCR on ${pagesNeedingOcr.length} pages; the maximum is ${MAX_OCR_PAGES}.`,
        'HEALTH_DOCUMENT_OCR_PAGE_LIMIT',
      );
    }

    if (pagesNeedingOcr.length) {
      report(onProgress, 'ocr', 0, `Starting local OCR for ${pagesNeedingOcr.length} scanned page${pagesNeedingOcr.length === 1 ? '' : 's'}`);
      worker = await createOcrWorker(onProgress);
      for (let index = 0; index < pagesNeedingOcr.length; index += 1) {
        const { pageNumber, page } = pagesNeedingOcr[index];
        report(onProgress, 'ocr', index / pagesNeedingOcr.length, `OCR page ${pageNumber} of ${pdf.numPages}`);
        const canvas = await renderPdfPage(page);
        const result = await worker.recognize(canvas);
        const ocrText = normalizeSpace(result?.data?.text)
          ? String(result.data.text).trim()
          : '';
        if (meaningfulText(ocrText) || observationsFromText(ocrText).length > 0) {
          pageText.push({ pageNumber, text: ocrText, method: 'ocr' });
        } else {
          warnings.push(`No readable text was found on PDF page ${pageNumber}.`);
        }
      }
    }
  } finally {
    await worker?.terminate?.();
    await pdf.destroy?.();
  }

  pageText.sort((a, b) => a.pageNumber - b.pageNumber);
  const successfulOcrPages = pageText
    .filter((page) => page.method === 'ocr')
    .map((page) => page.pageNumber);
  const text = pageText.map((page) => `[Page ${page.pageNumber}]\n${page.text}`).join('\n\n');
  return {
    text,
    pageCount: pdf.numPages,
    // Provenance describes content that entered the stored record, not merely
    // work attempted along the way. If OCR found nothing on a scanned page but
    // another page supplied native text, keep the record internally
    // consistent as pdf_text and preserve the failed page in warnings.
    method: successfulOcrPages.length ? 'pdf_text_and_ocr' : 'pdf_text',
    ocrPages: successfulOcrPages,
    warnings,
  };
}

/** @param {File|Blob} file @param {{onProgress?: Function, createOcrWorker?: Function}} [options] */
async function extractImageText(file, { onProgress, createOcrWorker = defaultOcrWorker } = {}) {
  report(onProgress, 'ocr', 0, 'Starting local OCR');
  const worker = await createOcrWorker(onProgress);
  try {
    const result = await worker.recognize(file);
    return {
      text: String(result?.data?.text || '').trim(),
      pageCount: 1,
      method: 'ocr',
      ocrPages: [1],
      warnings: [],
    };
  } finally {
    await worker.terminate?.();
  }
}

function readWithFileReader(file, method) {
  if (typeof FileReader === 'undefined') {
    throw new HealthDocumentParseError(
      'This browser cannot read the selected file.',
      'HEALTH_DOCUMENT_FILE_READER_UNAVAILABLE',
    );
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new HealthDocumentParseError(
      'The selected file could not be read.',
      'HEALTH_DOCUMENT_FILE_READ_FAILED',
    ));
    reader.onload = () => resolve(reader.result);
    reader[method](file);
  });
}

async function readFileBuffer(file) {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return readWithFileReader(file, 'readAsArrayBuffer');
}

async function readFileText(file) {
  if (typeof file.text === 'function') return file.text();
  return readWithFileReader(file, 'readAsText');
}

function collectionDateFromText(text) {
  const match = String(text || '').match(
    /(?:collection|collected|specimen|result|reported)\s*(?:date)?\s*[:-]\s*((?:19|20)\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2}[-/](?:19|20)?\d{2})/iu,
  );
  return match?.[1] || null;
}

export function normalizeHealthDocumentText(text, { format = 'text', parsedJson = null } = {}) {
  let observations = [];
  if (parsedJson != null) observations.push(...observationsFromJson(parsedJson));
  if (format === 'csv' || format === 'tsv') {
    observations.push(...observationsFromRows(parseDelimitedText(text, format === 'tsv' ? '\t' : ',')));
  }
  observations.push(...observationsFromText(text));
  observations = deduplicateObservations(observations);

  return {
    observations,
    summary: summarizeObservations(observations),
    collectionDate: collectionDateFromText(text),
  };
}

/**
 * @param {File} file
 * @param {{onProgress?: Function, loadPdf?: Function, createOcrWorker?: Function, renderPdfPage?: Function}} [options]
 */
export async function parseHealthDocument(file, {
  onProgress,
  loadPdf,
  createOcrWorker,
  renderPdfPage,
} = {}) {
  if (!file || typeof file !== 'object') {
    throw new HealthDocumentParseError('Choose a file to parse.', 'HEALTH_DOCUMENT_FILE_REQUIRED');
  }
  if (!isSupportedHealthDocument(file)) {
    throw new HealthDocumentParseError(
      'Supported files are PDF, CSV, TSV, JSON, TXT, PNG, JPEG, and WebP.',
      'HEALTH_DOCUMENT_UNSUPPORTED_TYPE',
    );
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new HealthDocumentParseError('The selected file is empty.', 'HEALTH_DOCUMENT_EMPTY');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new HealthDocumentParseError(
      `The selected file is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`,
      'HEALTH_DOCUMENT_TOO_LARGE',
    );
  }

  const ext = extensionFor(file.name);
  const mimeType = String(file.type || '').toLowerCase();
  assertDeclaredDocumentFamily(ext, mimeType);

  report(onProgress, 'hash', 0, 'Reading document');
  const buffer = await readFileBuffer(file);
  const sha256 = await sha256Hex(buffer);
  const isImage = IMAGE_EXTENSIONS.has(ext) || IMAGE_MIME_FORMATS.has(mimeType);
  assertDocumentSignature(buffer, { ext, mimeType, isImage });
  let format = ext || TEXT_MIME_FORMATS.get(mimeType) || 'text';
  let parsedJson = null;
  let extraction;

  try {
    if (ext === 'pdf' || mimeType === 'application/pdf') {
      format = 'pdf';
      extraction = await extractPdfText(buffer, {
        onProgress,
        loadPdf,
        createOcrWorker,
        renderPdfPage,
      });
    } else if (isImage) {
      format = 'image';
      extraction = await extractImageText(file, { onProgress, createOcrWorker });
    } else {
      const text = await readFileText(file);
      assertTextualContent(text);
      if (ext === 'json' || mimeType === 'application/json') {
        format = 'json';
        try {
          parsedJson = JSON.parse(text);
        } catch {
          throw new HealthDocumentParseError(
            'The JSON document is malformed and could not be parsed.',
            'HEALTH_DOCUMENT_INVALID_JSON',
          );
        }
      } else if (ext === 'tsv' || TEXT_MIME_FORMATS.get(mimeType) === 'tsv') {
        format = 'tsv';
      } else if (ext === 'csv' || TEXT_MIME_FORMATS.get(mimeType) === 'csv') {
        format = 'csv';
      } else {
        format = 'text';
      }
      extraction = {
        text,
        pageCount: 1,
        method: format,
        ocrPages: [],
        warnings: [],
      };
    }
  } catch (error) {
    if (error instanceof HealthDocumentParseError) throw error;
    throw new HealthDocumentParseError(
      'The document could not be read. Verify that it is not corrupted or password-protected.',
      'HEALTH_DOCUMENT_EXTRACTION_FAILED',
    );
  }

  const text = String(extraction.text || '').trim();
  const normalized = normalizeHealthDocumentText(text, { format, parsedJson });
  if (!meaningfulText(text) && normalized.observations.length === 0) {
    throw new HealthDocumentParseError(
      'No readable health information was found after text extraction and OCR.',
      'HEALTH_DOCUMENT_NO_READABLE_TEXT',
    );
  }

  report(onProgress, 'normalize', 0.9, 'Normalizing lab results');
  const wasTruncated = text.length > MAX_STORED_TEXT;
  const warnings = [...(extraction.warnings || [])];
  if (wasTruncated) warnings.push(`Stored text was limited to ${MAX_STORED_TEXT.toLocaleString()} characters.`);
  if (normalized.observations.length >= MAX_OBSERVATIONS) {
    warnings.push(`Structured results were limited to ${MAX_OBSERVATIONS.toLocaleString()} observations.`);
  }
  if (!normalized.observations.length) {
    warnings.push('Text was extracted, but no structured lab rows were recognized; the extracted text remains available to the assistant.');
  }

  report(onProgress, 'complete', 1, 'Document parsed');
  return {
    schemaVersion: HEALTH_DOCUMENT_SCHEMA_VERSION,
    parserVersion: HEALTH_DOCUMENT_PARSER_VERSION,
    status: normalized.observations.length ? 'structured' : 'text_only',
    source: {
      fileName: String(file.name || 'health-document').slice(0, 240),
      mimeType: mimeType || 'application/octet-stream',
      sizeBytes: file.size,
      sha256,
      format,
      extractionMethod: extraction.method,
      pageCount: extraction.pageCount,
      ocrPages: extraction.ocrPages || [],
      extractedAt: new Date().toISOString(),
    },
    collectionDate: normalized.collectionDate,
    observations: normalized.observations,
    summary: normalized.summary,
    extractedText: text.slice(0, MAX_STORED_TEXT),
    warnings,
  };
}

export const __test = {
  observationsFromJson,
  observationsFromRows,
  observationsFromText,
  summarizeObservations,
};
