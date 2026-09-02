import { z } from 'zod';
import { ForbiddenError, ValidationError } from '../utils/errors.js';

export const HEALTH_DOCUMENT_SCHEMA_VERSION = 1;
export const HEALTH_DOCUMENT_PARSER_VERSION = 'health-document-1.0.0';
export const HEALTH_PROFILE_SCHEMA_VERSION = 1;
export const MEDICAL_DATA_STORAGE_CONSENT = Object.freeze({
  type: 'medical_data_storage',
  version: '1.0',
});
export const MEDICAL_DATA_AI_CONSENT = Object.freeze({
  type: 'medical_data_ai_analysis',
  version: '1.0',
});

const boundedText = (max) => z.string().trim().min(1).max(max);
const nullableNumber = z.number().finite().nullable();

const ReferenceRangeSchema = z.object({
  text: z.string().max(120),
  low: nullableNumber,
  high: nullableNumber,
  lowerComparator: z.enum(['>', '>=']).nullable(),
  upperComparator: z.enum(['<', '<=']).nullable(),
}).strict().nullable();

const ObservationSchema = z.object({
  name: boundedText(120),
  value: boundedText(100),
  numericValue: nullableNumber,
  comparator: z.enum(['<', '<=', '>', '>=']).nullable(),
  unit: z.string().trim().max(50).nullable(),
  referenceRange: ReferenceRangeSchema,
  flag: z.enum(['high', 'low', 'abnormal', 'normal', 'reported']),
  source: z.object({
    kind: z.enum(['line', 'row', 'fhir']),
    number: z.number().int().positive().max(100_000),
  }).strict(),
}).strict();

const LabDocumentSchema = z.object({
  schemaVersion: z.literal(HEALTH_DOCUMENT_SCHEMA_VERSION),
  parserVersion: z.literal(HEALTH_DOCUMENT_PARSER_VERSION),
  status: z.enum(['structured', 'text_only']),
  source: z.object({
    fileName: boundedText(240),
    mimeType: boundedText(120),
    sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    format: z.enum(['csv', 'image', 'json', 'pdf', 'text', 'tsv']),
    extractionMethod: z.enum(['csv', 'json', 'ocr', 'pdf_text', 'pdf_text_and_ocr', 'text', 'tsv']),
    pageCount: z.number().int().positive().max(40),
    ocrPages: z.array(z.number().int().positive().max(40)).max(20),
    extractedAt: z.string().datetime(),
  }).strict(),
  collectionDate: z.string().trim().max(80).nullable(),
  observations: z.array(ObservationSchema).max(300),
  summary: z.object({
    total: z.number().int().nonnegative().max(300),
    high: z.number().int().nonnegative().max(300),
    low: z.number().int().nonnegative().max(300),
    abnormal: z.number().int().nonnegative().max(300),
    normal: z.number().int().nonnegative().max(300),
    reported: z.number().int().nonnegative().max(300),
    text: boundedText(500),
  }).strict(),
  extractedText: boundedText(50_000),
  warnings: z.array(z.string().trim().min(1).max(500)).max(30),
}).strict().superRefine((record, ctx) => {
  if (record.status === 'structured' && record.observations.length === 0) {
    ctx.addIssue({ code: 'custom', path: ['observations'], message: 'structured records need observations' });
  }
  if (record.status === 'text_only' && record.observations.length > 0) {
    ctx.addIssue({ code: 'custom', path: ['status'], message: 'text_only records cannot contain observations' });
  }
  const flags = ['high', 'low', 'abnormal', 'normal', 'reported'];
  const counts = Object.fromEntries(flags.map((flag) => [
    flag,
    record.observations.filter((item) => item.flag === flag).length,
  ]));
  if (
    record.summary.total !== record.observations.length
    || flags.some((flag) => record.summary[flag] !== counts[flag])
  ) {
    ctx.addIssue({ code: 'custom', path: ['summary'], message: 'every summary count must match the observations' });
  }

  const flagged = counts.high + counts.low + counts.abnormal;
  const expectedSummaryText = record.observations.length
    ? `${record.observations.length} lab result${record.observations.length === 1 ? '' : 's'} extracted; ${flagged} flagged from the document's own ranges or flags.`
    : 'Document text extracted; no structured lab rows were recognized.';
  if (record.summary.text !== expectedSummaryText) {
    ctx.addIssue({ code: 'custom', path: ['summary', 'text'], message: 'summary text must be parser-derived' });
  }

  if (
    record.status === 'text_only'
    && record.extractedText.replace(/[^A-Za-z0-9]/gu, '').length < 24
  ) {
    ctx.addIssue({ code: 'custom', path: ['extractedText'], message: 'text-only records need readable extracted content' });
  }

  const allowedMethods = {
    csv: ['csv'],
    image: ['ocr'],
    json: ['json'],
    pdf: ['pdf_text', 'pdf_text_and_ocr'],
    text: ['text'],
    tsv: ['tsv'],
  };
  if (!allowedMethods[record.source.format]?.includes(record.source.extractionMethod)) {
    ctx.addIssue({ code: 'custom', path: ['source', 'extractionMethod'], message: 'extraction method does not match source format' });
  }
  const uniqueOcrPages = new Set(record.source.ocrPages);
  if (
    uniqueOcrPages.size !== record.source.ocrPages.length
    || record.source.ocrPages.some((page) => page > record.source.pageCount)
  ) {
    ctx.addIssue({ code: 'custom', path: ['source', 'ocrPages'], message: 'OCR pages must be unique pages in the document' });
  }
  if (record.source.extractionMethod === 'pdf_text' && record.source.ocrPages.length) {
    ctx.addIssue({ code: 'custom', path: ['source', 'ocrPages'], message: 'text-only PDF extraction cannot report OCR pages' });
  }
  if (
    ['ocr', 'pdf_text_and_ocr'].includes(record.source.extractionMethod)
    && record.source.ocrPages.length === 0
  ) {
    ctx.addIssue({ code: 'custom', path: ['source', 'ocrPages'], message: 'OCR extraction must report at least one OCR page' });
  }
});

const HealthProfileSchema = z.object({
  schemaVersion: z.literal(HEALTH_PROFILE_SCHEMA_VERSION),
  updatedAt: z.string().datetime(),
  conditions: z.array(boundedText(200)).max(50),
  medications: z.array(boundedText(300)).max(50),
  allergies: z.array(boundedText(200)).max(50),
  familyHistory: z.array(boundedText(300)).max(50),
  symptoms: z.array(boundedText(300)).max(50),
  goals: z.array(boundedText(300)).max(30),
  notes: z.string().trim().max(5_000),
}).strict();

function parseOrThrow(schema, content, label) {
  const result = schema.safeParse(content);
  if (result.success) return result.data;
  const issues = result.error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.length ? issue.path.join('.') : 'content';
    return `${path}: ${issue.message}`;
  });
  throw new ValidationError(`${label} is invalid: ${issues.join('; ')}`);
}

export function validateHealthRecordContent(dataType, content) {
  if (dataType === 'lab_document') {
    return parseOrThrow(LabDocumentSchema, content, 'Parsed lab document');
  }
  if (dataType === 'health_profile') {
    return parseOrThrow(HealthProfileSchema, content, 'Health profile');
  }
  return content;
}

export async function requireLatestConsent(prisma, userId, consent) {
  const latest = await prisma.consentRecord.findFirst({
    where: {
      userId,
      consentType: consent.type,
      version: consent.version,
    },
    orderBy: { createdAt: 'desc' },
  });
  if (!latest || latest.granted !== true) {
    const error = new ForbiddenError(`Consent required: ${consent.type} v${consent.version}`);
    error.code = 'CONSENT_REQUIRED';
    error.consent = consent;
    throw error;
  }
  return latest;
}

export const __test = {
  HealthProfileSchema,
  LabDocumentSchema,
};
