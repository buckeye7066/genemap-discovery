import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  canUsePublicationContent,
  createPublicationArtifact,
  PUBLICATION_STATUSES,
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
  });
});
