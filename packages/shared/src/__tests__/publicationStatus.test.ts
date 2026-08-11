import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canUsePublicationContent,
  createPublicationArtifact,
  isCanonicalPublicationArtifact,
  PUBLICATION_STATUSES,
  terminalPublicationArtifactFromError,
} from '../publicationStatus.js';
import { publicationArtifactSchema } from '../schemas.js';

describe('PublicationArtifact', () => {
  it('allows usable content only for available and partial artifacts', () => {
    const available = createPublicationArtifact({
      status: PUBLICATION_STATUSES.AVAILABLE,
      content: 'reviewed content',
      correlationId: 'req-123',
    });
    const partial = createPublicationArtifact({
      status: PUBLICATION_STATUSES.PARTIAL,
      content: 'bounded content',
      correlationId: 'req-124',
      reasonCode: 'provider_truncated',
      limitations: ['The provider response ended early.'],
    });
    expect(canUsePublicationContent(available)).toBe(true);
    expect(canUsePublicationContent(partial)).toBe(true);
    expect(isCanonicalPublicationArtifact(available)).toBe(true);
    expect(isCanonicalPublicationArtifact(partial)).toBe(true);
    expect(available.contractVersion).toBe(1);
  });

  it.each([
    PUBLICATION_STATUSES.WITHHELD,
    PUBLICATION_STATUSES.UNAVAILABLE,
    PUBLICATION_STATUSES.SUPERSEDED,
  ])('removes content from %s artifacts', (status) => {
    const artifact = createPublicationArtifact({
      status,
      content: 'must not escape',
      reasonCode: 'policy_boundary',
      correlationId: 'req-125',
    });
    expect(artifact.content).toBeNull();
    expect(canUsePublicationContent(artifact)).toBe(false);
  });

  it('requires a limitation for partial artifacts', () => {
    expect(() => createPublicationArtifact({
      status: PUBLICATION_STATUSES.PARTIAL,
      content: 'incomplete',
      reasonCode: 'provider_truncated',
      correlationId: 'req-126',
    })).toThrow(/limitation/i);
  });

  it('requires a finite reason for every non-available state', () => {
    expect(() => createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      correlationId: 'req-126b',
    })).toThrow(/reason code/i);
  });

  it('enforces the same invariants in the runtime schema', () => {
    const schema = publicationArtifactSchema(z.string());
    expect(schema.safeParse({
      contractVersion: 1,
      status: 'withheld',
      content: 'blocked content',
      reasonCode: 'policy_boundary',
      correlationId: 'req-127',
      limitations: [],
    }).success).toBe(false);
    expect(schema.safeParse({
      contractVersion: 1,
      status: 'partial',
      content: 'incomplete content',
      reasonCode: 'provider_truncated',
      correlationId: 'req-127b',
      limitations: ['Duplicate limitation.', 'Duplicate limitation.'],
    }).success).toBe(false);
    expect(schema.safeParse({
      contractVersion: 1,
      status: 'partial',
      content: 'incomplete content',
      reasonCode: 'provider_truncated',
      correlationId: 'req-127c',
      limitations: [' Untrimmed limitation. '],
    }).success).toBe(false);
  });

  it('provides one runtime predicate for every publication consumer', () => {
    expect(isCanonicalPublicationArtifact({
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'policy_boundary',
      correlationId: 'req-128',
      limitations: [],
    })).toBe(true);

    const malformed = [
      {
        contractVersion: 1,
        status: 'withheld',
        content: 'must not escape',
        reasonCode: 'policy_boundary',
        correlationId: 'req-129',
        limitations: [],
      },
      {
        contractVersion: 1,
        status: 'partial',
        content: 'incomplete',
        reasonCode: 'provider_truncated',
        correlationId: 'req-130',
        limitations: [],
      },
      {
        contractVersion: 1,
        status: 'available',
        content: 'duplicate limitations',
        reasonCode: null,
        correlationId: 'req-131',
        limitations: ['Duplicate.', 'Duplicate.'],
      },
      {
        contractVersion: 1,
        status: 'unavailable',
        content: null,
        reasonCode: null,
        correlationId: 'req-132',
        limitations: [],
      },
      {
        contractVersion: 1,
        status: 'available',
        content: 'bad correlation',
        reasonCode: null,
        correlationId: 'contains a space',
        limitations: [],
      },
      {
        contractVersion: 1,
        status: 'available',
        content: 'apparently usable',
        reasonCode: null,
        correlationId: 'hidden-provider-field',
        limitations: [],
        rawProviderText: 'must not be accepted as canonical',
      },
    ];

    expect(malformed.every((artifact) => !isCanonicalPublicationArtifact(artifact))).toBe(true);
  });

  it('recovers only a cloned canonical terminal artifact from operational error details', () => {
    const limitations = ['Generated publication is disabled during recovery.'];
    const recovered = terminalPublicationArtifactFromError({
      status: 503,
      details: {
        publication: {
          contractVersion: 1,
          status: 'unavailable',
          content: null,
          reasonCode: 'model_publication_disabled',
          correlationId: 'request-recovery:llm-invoke',
          limitations,
        },
        internalTrace: 'must not escape',
      },
    });

    expect(recovered).toEqual({
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
      correlationId: 'request-recovery:llm-invoke',
      limitations,
    });
    expect(recovered).not.toHaveProperty('internalTrace');
    expect(recovered?.limitations).not.toBe(limitations);
  });

  it.each([
    {
      contractVersion: 1,
      status: 'available',
      content: 'must not be recovered from an error',
      reasonCode: null,
      correlationId: 'request-available',
      limitations: [],
    },
    {
      contractVersion: 1,
      status: 'partial',
      content: 'must not be recovered from an error',
      reasonCode: 'provider_truncated',
      correlationId: 'request-partial',
      limitations: ['The output ended early.'],
    },
    {
      contractVersion: 1,
      status: 'unavailable',
      content: null,
      reasonCode: 'model_publication_disabled',
      correlationId: 'request-extra-key',
      limitations: [],
      rawProviderText: 'must not escape',
    },
    {
      contractVersion: 1,
      status: 'unavailable',
      content: 'terminal content must be null',
      reasonCode: 'model_publication_disabled',
      correlationId: 'request-malformed',
      limitations: [],
    },
  ])('rejects non-terminal or non-canonical $status artifacts carried through error details', (publication) => {
    expect(terminalPublicationArtifactFromError({ details: { publication } })).toBeNull();
  });
});
