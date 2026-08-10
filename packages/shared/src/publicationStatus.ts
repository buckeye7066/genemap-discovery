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
    artifact
    && (artifact.status === PUBLICATION_STATUSES.AVAILABLE
      || artifact.status === PUBLICATION_STATUSES.PARTIAL)
    && artifact.content != null,
  );
}
