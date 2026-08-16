import { z } from 'zod';

export const PUBLICATION_ARTIFACT_CONTRACT_VERSION = 1;

export const PUBLICATION_STATUSES = [
  'available',
  'partial',
  'unavailable',
  'withheld',
];

export const TERMINAL_PUBLICATION_STATUSES = [
  'available',
  'partial',
  'unavailable',
];

export const REASON_CODE_PATTERN = /^[A-Za-z][A-Za-z0-9_:-]*$/;
export const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]*$/;

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

const nonEmptyStringSchema = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: 'Must not be blank.',
});

const reasonCodeSchema = nonEmptyStringSchema.regex(REASON_CODE_PATTERN, {
  message: 'Reason code must use only letters, numbers, underscores, hyphens, or colons.',
});

const correlationIdSchema = nonEmptyStringSchema.regex(CORRELATION_ID_PATTERN, {
  message: 'Correlation id must use only letters, numbers, dots, underscores, slashes, colons, @ signs, or hyphens.',
});

const limitationSchema = nonEmptyStringSchema;

const addIssue = (ctx, path, message) => {
  ctx.addIssue({
    code: z.ZodIssueCode.custom,
    path,
    message,
  });
};

const hasRequiredReasonCode = (artifact) => typeof artifact.reasonCode === 'string' && artifact.reasonCode.trim().length > 0;
const hasRequiredLimitations = (artifact) => Array.isArray(artifact.limitations) && artifact.limitations.length > 0;

const cloneValue = (value) => {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (typeof structuredClone === 'function') {
    try {
      return structuredClone(value);
    } catch {
      // Fall through to a small plain-object clone for older or non-cloneable values.
    }
  }

  if (Array.isArray(value)) {
    return value.map((item) => cloneValue(item));
  }

  const clone = {};
  for (const [key, item] of Object.entries(value)) {
    clone[key] = cloneValue(item);
  }
  return clone;
};

export function publicationArtifactSchema(contentSchema = z.unknown()) {
  const safeContentSchema = contentSchema && typeof contentSchema.nullable === 'function'
    ? contentSchema
    : z.unknown();

  return z.object({
    contractVersion: z.literal(PUBLICATION_ARTIFACT_CONTRACT_VERSION),
    status: z.enum(PUBLICATION_STATUSES),
    content: safeContentSchema.nullable(),
    reasonCode: reasonCodeSchema.nullable().optional(),
    correlationId: correlationIdSchema.nullable().optional(),
    limitations: z.array(limitationSchema).optional(),
  }).strict().superRefine((artifact, ctx) => {
    if (!TERMINAL_PUBLICATION_STATUSES.includes(artifact.status)) {
      addIssue(ctx, ['status'], 'Publication artifact status must be available, partial, or unavailable.');
      return;
    }

    if (artifact.status === 'available') {
      if (!hasOwn(artifact, 'content') || artifact.content === null || artifact.content === undefined) {
        addIssue(ctx, ['content'], 'An available publication artifact must include content.');
      }

      if (Array.isArray(artifact.limitations) && artifact.limitations.length > 0) {
        addIssue(ctx, ['limitations'], 'An available publication artifact must not include limitations.');
      }

      if (hasRequiredReasonCode(artifact)) {
        addIssue(ctx, ['reasonCode'], 'An available publication artifact must not include a reason code.');
      }
      return;
    }

    if (artifact.status === 'partial') {
      if (!hasOwn(artifact, 'content') || artifact.content === null || artifact.content === undefined) {
        addIssue(ctx, ['content'], 'A partial publication artifact must include the content that could be generated.');
      }

      if (!hasRequiredReasonCode(artifact)) {
        addIssue(ctx, ['reasonCode'], 'A partial publication artifact must include a reason code.');
      }

      if (!hasRequiredLimitations(artifact)) {
        addIssue(ctx, ['limitations'], 'A partial publication artifact must include at least one limitation.');
      }
      return;
    }

    if (artifact.status === 'unavailable') {
      if (!hasOwn(artifact, 'content') || artifact.content !== null) {
        addIssue(ctx, ['content'], 'An unavailable publication artifact must have null content.');
      }

      if (!hasRequiredReasonCode(artifact)) {
        addIssue(ctx, ['reasonCode'], 'An unavailable publication artifact must include a reason code.');
      }

      if (!hasRequiredLimitations(artifact)) {
        addIssue(ctx, ['limitations'], 'An unavailable publication artifact must include at least one limitation.');
      }
    }
  });
}

export function createPublicationArtifact(input) {
  if (!input || typeof input !== 'object') {
    throw new Error('Publication artifact details are required.');
  }

  const artifact = {
    contractVersion: PUBLICATION_ARTIFACT_CONTRACT_VERSION,
    ...input,
  };

  if (!hasOwn(artifact, 'content') && (artifact.status === 'unavailable' || artifact.status === 'withheld')) {
    artifact.content = null;
  }

  const parsed = publicationArtifactSchema(z.unknown()).safeParse(artifact);

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    throw new Error(firstIssue?.message || 'Publication artifact is not valid.');
  }

  return cloneValue(parsed.data);
}

export function createAvailablePublicationArtifact(content, options = {}) {
  return createPublicationArtifact({
    ...options,
    status: 'available',
    content,
  });
}

export function createPartialPublicationArtifact(content, options = {}) {
  return createPublicationArtifact({
    ...options,
    status: 'partial',
    content,
  });
}

export function createUnavailablePublicationArtifact(reasonOrOptions, options = {}) {
  const details = reasonOrOptions && typeof reasonOrOptions === 'object'
    ? reasonOrOptions
    : { ...options, reasonCode: reasonOrOptions };

  return createPublicationArtifact({
    ...details,
    status: 'unavailable',
    content: null,
  });
}

export const createCanonicalPublicationArtifact = createPublicationArtifact;

export function isPublicationArtifact(value) {
  return publicationArtifactSchema(z.unknown()).safeParse(value).success;
}

export function isCanonicalPublicationArtifact(value) {
  const parsed = publicationArtifactSchema(z.unknown()).safeParse(value);
  return parsed.success && TERMINAL_PUBLICATION_STATUSES.includes(parsed.data.status);
}

export function isTerminalPublicationArtifact(value) {
  return isCanonicalPublicationArtifact(value);
}

export function assertCanonicalPublicationArtifact(value) {
  const parsed = publicationArtifactSchema(z.unknown()).safeParse(value);

  if (!parsed.success || !TERMINAL_PUBLICATION_STATUSES.includes(parsed.success ? parsed.data.status : undefined)) {
    const firstIssue = parsed.success ? undefined : parsed.error.issues[0];
    throw new Error(firstIssue?.message || 'Publication artifact is not canonical.');
  }

  return cloneValue(parsed.data);
}

export function terminalPublicationArtifactFromError(error) {
  const artifact = error?.details?.publicationArtifact;

  if (!isCanonicalPublicationArtifact(artifact)) {
    return null;
  }

  return cloneValue(artifact);
}

export const publicationArtifactFromError = terminalPublicationArtifactFromError;

export function clonePublicationArtifact(artifact) {
  if (!isCanonicalPublicationArtifact(artifact)) {
    throw new Error('Publication artifact is not canonical.');
  }

  return cloneValue(artifact);
}

export default {
  PUBLICATION_ARTIFACT_CONTRACT_VERSION,
  PUBLICATION_STATUSES,
  TERMINAL_PUBLICATION_STATUSES,
  REASON_CODE_PATTERN,
  CORRELATION_ID_PATTERN,
  publicationArtifactSchema,
  createPublicationArtifact,
  createCanonicalPublicationArtifact,
  createAvailablePublicationArtifact,
  createPartialPublicationArtifact,
  createUnavailablePublicationArtifact,
  isPublicationArtifact,
  isCanonicalPublicationArtifact,
  isTerminalPublicationArtifact,
  assertCanonicalPublicationArtifact,
  terminalPublicationArtifactFromError,
  publicationArtifactFromError,
  clonePublicationArtifact,
};
