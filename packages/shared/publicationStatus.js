import { z } from 'zod';

export const PUBLICATION_ARTIFACT_CONTRACT_VERSION = 1;

export const PUBLICATION_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  PARTIAL: 'partial',
  UNAVAILABLE: 'unavailable',
  WITHHELD: 'withheld',
});

export const TERMINAL_PUBLICATION_STATUSES = Object.freeze([
  PUBLICATION_STATUSES.UNAVAILABLE,
  PUBLICATION_STATUSES.WITHHELD,
]);

export const PUBLICATION_REASON_CODES = Object.freeze({
  PARTIAL_RESULTS: 'partial_results',
  DATA_UNAVAILABLE: 'data_unavailable',
  PUBLICATION_DISABLED: 'publication_disabled',
  PRIVACY_WITHHELD: 'privacy_withheld',
  CONTENT_WITHHELD: 'content_withheld',
  CONTENT_FILTERED: 'content_filtered',
  SOURCE_UNAVAILABLE: 'source_unavailable',
  UPSTREAM_UNAVAILABLE: 'upstream_unavailable',
  SERVICE_UNAVAILABLE: 'service_unavailable',
  RECOVERY_DISABLED: 'recovery_disabled',
  NOT_AVAILABLE: 'not_available',
  REDACTED: 'redacted',
  UNAVAILABLE: 'unavailable',
  WITHHELD: 'withheld',
});

const STATUS_VALUES = Object.freeze(Object.values(PUBLICATION_STATUSES));
const REASON_CODE_VALUES = Object.freeze(Object.values(PUBLICATION_REASON_CODES));
const REASON_CODE_SET = new Set(REASON_CODE_VALUES);

const isPlainObject = (value) => (
  value !== null
  && typeof value === 'object'
  && !Array.isArray(value)
);

const cloneValue = (value) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value));
};

const hasUsableData = (value) => value !== undefined && value !== null;

const normalizeLimitations = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => (typeof item === 'string' ? item.trim() : item));
  }

  if (typeof input === 'string') {
    return [input.trim()];
  }

  if (input === undefined || input === null) {
    return [];
  }

  return input;
};

const normalizeReasonCode = (input) => {
  if (typeof input === 'string') {
    return input.trim();
  }

  if (input === undefined || input === null) {
    return null;
  }

  return input;
};

const reasonCodeFromInput = (input) => normalizeReasonCode(
  input.reasonCode
  ?? input.reason
  ?? input.terminalReason
  ?? input.reason_code,
);

const limitationsFromInput = (input) => normalizeLimitations(
  input.limitations
  ?? input.limitationText
  ?? input.limitation
  ?? input.messages,
);

const addIssue = (issues, message, path = []) => {
  issues.push({ message, path });
};

const collectPublicationArtifactIssues = (artifact, dataSchema) => {
  const issues = [];

  if (!isPlainObject(artifact)) {
    addIssue(issues, 'Publication artifact must be an object.');
    return issues;
  }

  if (artifact.contractVersion !== PUBLICATION_ARTIFACT_CONTRACT_VERSION) {
    addIssue(issues, 'Publication artifact contract version must be 1.', ['contractVersion']);
  }

  if (!STATUS_VALUES.includes(artifact.status)) {
    addIssue(issues, 'Publication artifact status is not recognized.', ['status']);
    return issues;
  }

  const limitations = Array.isArray(artifact.limitations) ? artifact.limitations : [];
  const hasLimitations = limitations.length > 0
    && limitations.every((item) => typeof item === 'string' && item.trim().length > 0);
  const reasonCode = normalizeReasonCode(artifact.reasonCode);
  const hasReasonCode = typeof reasonCode === 'string' && reasonCode.length > 0;
  const hasKnownReasonCode = hasReasonCode && REASON_CODE_SET.has(reasonCode);

  if (artifact.status === PUBLICATION_STATUSES.AVAILABLE) {
    if (!hasUsableData(artifact.data)) {
      addIssue(issues, 'Available publication artifacts must include data.', ['data']);
    }

    if (hasReasonCode) {
      addIssue(issues, 'Available publication artifacts must not include a terminal reason code.', ['reasonCode']);
    }

    if (limitations.length > 0) {
      addIssue(issues, 'Available publication artifacts must not include limitation text.', ['limitations']);
    }
  } else {
    if (!Array.isArray(artifact.limitations) || !hasLimitations) {
      addIssue(issues, 'Non-available publication artifacts must include limitation text.', ['limitations']);
    }

    if (!hasKnownReasonCode) {
      addIssue(issues, 'Non-available publication artifacts must include a known reason code.', ['reasonCode']);
    }

    if (artifact.status === PUBLICATION_STATUSES.PARTIAL && !hasUsableData(artifact.data)) {
      addIssue(issues, 'Partial publication artifacts must include the available data.', ['data']);
    }

    if (
      (artifact.status === PUBLICATION_STATUSES.UNAVAILABLE || artifact.status === PUBLICATION_STATUSES.WITHHELD)
      && hasUsableData(artifact.data)
    ) {
      addIssue(issues, 'Terminal publication artifacts must not include publication data.', ['data']);
    }
  }

  if (dataSchema && hasUsableData(artifact.data)) {
    const dataResult = dataSchema.safeParse(artifact.data);
    if (!dataResult.success) {
      addIssue(issues, 'Publication artifact data does not match the expected format.', ['data']);
    }
  }

  return issues;
};

export const isTerminalPublicationStatus = (status) => TERMINAL_PUBLICATION_STATUSES.includes(status);

export const isPublicationStatus = (status) => STATUS_VALUES.includes(status);

export const isPublicationReasonCode = (reasonCode) => (
  typeof reasonCode === 'string'
  && REASON_CODE_SET.has(reasonCode)
);

export const publicationArtifactSchema = (dataSchema = z.unknown()) => z.object({
  contractVersion: z.literal(PUBLICATION_ARTIFACT_CONTRACT_VERSION),
  status: z.enum(STATUS_VALUES),
  data: dataSchema.nullable().optional(),
  limitations: z.array(z.string().trim().min(1)).optional(),
  reasonCode: z.string().trim().nullable().optional(),
  correlationId: z.string().trim().min(1).nullable().optional(),
  createdAt: z.string().trim().min(1).nullable().optional(),
  updatedAt: z.string().trim().min(1).nullable().optional(),
}).passthrough().superRefine((artifact, ctx) => {
  for (const issue of collectPublicationArtifactIssues(artifact, dataSchema)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: issue.message,
      path: issue.path,
    });
  }
});

export const createPublicationArtifact = (input = {}) => {
  if (!isPlainObject(input)) {
    throw new TypeError('Publication artifact details must be an object.');
  }

  const status = input.status ?? PUBLICATION_STATUSES.AVAILABLE;
  const artifact = {
    contractVersion: PUBLICATION_ARTIFACT_CONTRACT_VERSION,
    status,
    data: input.data ?? null,
    limitations: limitationsFromInput(input),
    reasonCode: reasonCodeFromInput(input),
  };

  if (input.correlationId !== undefined && input.correlationId !== null) {
    artifact.correlationId = String(input.correlationId);
  }

  if (input.createdAt !== undefined && input.createdAt !== null) {
    artifact.createdAt = String(input.createdAt);
  }

  if (input.updatedAt !== undefined && input.updatedAt !== null) {
    artifact.updatedAt = String(input.updatedAt);
  }

  const issues = collectPublicationArtifactIssues(artifact);
  if (issues.length > 0) {
    throw new Error(issues.map((issue) => issue.message).join(' '));
  }

  return cloneValue(artifact);
};

export const isCanonicalPublicationArtifact = (value, dataSchema = z.unknown()) => {
  try {
    return collectPublicationArtifactIssues(value, dataSchema).length === 0;
  } catch {
    return false;
  }
};

export const isTerminalPublicationArtifact = (value, dataSchema = z.unknown()) => (
  isCanonicalPublicationArtifact(value, dataSchema)
  && isTerminalPublicationStatus(value.status)
);

export const terminalPublicationArtifactFromError = (error, dataSchema = z.unknown()) => {
  const details = isPlainObject(error?.details) ? error.details : null;
  const candidate = details?.publicationArtifact
    ?? details?.publication
    ?? details?.artifact
    ?? null;

  if (!isTerminalPublicationArtifact(candidate, dataSchema)) {
    return null;
  }

  return cloneValue(candidate);
};
