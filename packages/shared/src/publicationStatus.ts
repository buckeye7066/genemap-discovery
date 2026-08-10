export const PUBLICATION_STATUSES = Object.freeze({
  AVAILABLE: 'available',
  PARTIAL: 'partial',
  WITHHELD: 'withheld',
  UNAVAILABLE: 'unavailable',
  SUPERSEDED: 'superseded',
} as const);

export type PublicationStatus = typeof PUBLICATION_STATUSES[keyof typeof PUBLICATION_STATUSES];

export interface PublicationArtifact<T> {
  contractVersion: 1;
  status: PublicationStatus;
  content: T | null;
  reasonCode: string | null;
  correlationId: string;
  limitations: string[];
}

export interface CreatePublicationArtifactInput<T> {
  status: PublicationStatus;
  content?: T | null;
  reasonCode?: string | null;
  correlationId: string;
  limitations?: string[];
}

const REASON_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/u;
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const PUBLICATION_ARTIFACT_KEYS = Object.freeze([
  'content',
  'contractVersion',
  'correlationId',
  'limitations',
  'reasonCode',
  'status',
]);

export function isCanonicalPublicationArtifact<T = unknown>(
  artifact: unknown,
): artifact is PublicationArtifact<T> {
  if (!artifact || typeof artifact !== 'object' || Array.isArray(artifact)) return false;
  const keys = Object.keys(artifact).sort();
  if (
    keys.length !== PUBLICATION_ARTIFACT_KEYS.length
    || keys.some((key, index) => key !== PUBLICATION_ARTIFACT_KEYS[index])
  ) return false;
  const candidate = artifact as Partial<PublicationArtifact<T>>;
  if (
    candidate.contractVersion !== 1
    || !Object.values(PUBLICATION_STATUSES).includes(candidate.status as PublicationStatus)
    || !Object.prototype.hasOwnProperty.call(candidate, 'content')
  ) return false;
  if (
    typeof candidate.correlationId !== 'string'
    || !CORRELATION_ID.test(candidate.correlationId)
  ) return false;
  if (
    candidate.reasonCode !== null
    && (
      typeof candidate.reasonCode !== 'string'
      || !REASON_CODE.test(candidate.reasonCode)
    )
  ) return false;
  if (candidate.status !== PUBLICATION_STATUSES.AVAILABLE && candidate.reasonCode === null) {
    return false;
  }
  if (
    !Array.isArray(candidate.limitations)
    || !candidate.limitations.every((item) => (
      typeof item === 'string'
      && item.length > 0
      && item === item.trim()
    ))
    || new Set(candidate.limitations).size !== candidate.limitations.length
  ) return false;

  const contentAllowed = candidate.status === PUBLICATION_STATUSES.AVAILABLE
    || candidate.status === PUBLICATION_STATUSES.PARTIAL;
  if (contentAllowed) {
    if (candidate.content === null || candidate.content === undefined) return false;
    return candidate.status !== PUBLICATION_STATUSES.PARTIAL
      || candidate.limitations.length > 0;
  }
  return candidate.content === null;
}

export function createPublicationArtifact<T>(
  input: CreatePublicationArtifactInput<T>,
): PublicationArtifact<T> {
  if (!Object.values(PUBLICATION_STATUSES).includes(input.status)) {
    throw new TypeError('Unknown publication status.');
  }
  if (!CORRELATION_ID.test(input.correlationId)) {
    throw new TypeError('A non-sensitive correlation identifier is required.');
  }
  if (input.reasonCode != null && !REASON_CODE.test(input.reasonCode)) {
    throw new TypeError('Publication reason codes must be finite non-sensitive identifiers.');
  }
  if (input.status !== PUBLICATION_STATUSES.AVAILABLE && input.reasonCode == null) {
    throw new TypeError('Non-available publication artifacts require a reason code.');
  }

  const contentAllowed = input.status === PUBLICATION_STATUSES.AVAILABLE
    || input.status === PUBLICATION_STATUSES.PARTIAL;
  const content = contentAllowed ? (input.content ?? null) : null;
  if (contentAllowed && content == null) {
    throw new TypeError('Available or partial publication artifacts require content.');
  }

  const limitations = [...new Set((input.limitations ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter(Boolean))];
  if (input.status === PUBLICATION_STATUSES.PARTIAL && limitations.length === 0) {
    throw new TypeError('Partial publication artifacts require a visible limitation.');
  }

  return {
    contractVersion: 1,
    status: input.status,
    content,
    reasonCode: input.reasonCode ?? null,
    correlationId: input.correlationId,
    limitations,
  };
}

export function canUsePublicationContent<T>(
  artifact: PublicationArtifact<T> | null | undefined,
): artifact is PublicationArtifact<T> & { content: T } {
  return Boolean(
    isCanonicalPublicationArtifact<T>(artifact)
    && (artifact.status === PUBLICATION_STATUSES.AVAILABLE
      || artifact.status === PUBLICATION_STATUSES.PARTIAL)
    && artifact.content != null,
  );
}
