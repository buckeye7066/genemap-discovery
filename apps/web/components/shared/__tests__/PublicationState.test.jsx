import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PublicationState, {
  hasReusablePublicationContent,
  publicationContent,
} from '../PublicationState';

describe('PublicationState', () => {
  it('fails closed for withheld content even if a forged alias remains populated', () => {
    const artifact = {
      contractVersion: 1,
      status: 'withheld',
      content: 'must not be reused',
      reasonCode: 'clinical_boundary',
      correlationId: 'withheld-test',
      limitations: [],
    };

    expect(hasReusablePublicationContent(artifact)).toBe(false);
    expect(publicationContent(artifact)).toBeNull();
    render(<PublicationState artifact={artifact} />);
    expect(screen.getByText(/publication status invalid/i)).toBeTruthy();
    expect(screen.queryByText(/must not be reused/i)).toBeNull();
  });

  it('renders a canonical withheld envelope with a safe support identifier', () => {
    const artifact = {
      contractVersion: 1,
      status: 'withheld',
      content: null,
      reasonCode: 'clinical_boundary',
      correlationId: 'withheld-support-1',
      limitations: [],
    };

    render(<PublicationState artifact={artifact} />);
    expect(screen.getByText(/publication withheld/i)).toBeTruthy();
    expect(screen.getByText(/withheld-support-1/i)).toBeTruthy();
  });

  it('shows every limitation attached to partial reusable content', () => {
    const artifact = {
      contractVersion: 1,
      status: 'partial',
      content: 'safe partial content',
      reasonCode: 'provider_truncated',
      correlationId: 'partial-test',
      limitations: ['Ending may be incomplete.', 'One section was omitted.'],
    };

    expect(publicationContent(artifact)).toBe('safe partial content');
    render(<PublicationState artifact={artifact} />);
    expect(screen.getByText(/ending may be incomplete/i)).toBeTruthy();
    expect(screen.getByText(/one section was omitted/i)).toBeTruthy();
  });

  it('rejects a partial envelope that omits its required limitation', () => {
    const artifact = {
      contractVersion: 1,
      status: 'partial',
      content: 'must remain hidden',
      reasonCode: 'provider_truncated',
      correlationId: 'malformed-partial-test',
      limitations: [],
    };

    expect(publicationContent(artifact)).toBeNull();
    render(<PublicationState artifact={artifact} />);
    expect(screen.getByText(/publication status invalid/i)).toBeTruthy();
    expect(screen.queryByText(/must remain hidden/i)).toBeNull();
  });

  it.each([
    ['partial', 'partial content', ['Incomplete output.']],
    ['unavailable', null, []],
  ])('rejects %s when its required reason code is null', (status, content, limitations) => {
    const artifact = {
      contractVersion: 1,
      status,
      content,
      reasonCode: null,
      correlationId: `null-reason-${status}`,
      limitations,
    };

    expect(publicationContent(artifact)).toBeNull();
    render(<PublicationState artifact={artifact} />);
    expect(screen.getByText(/publication status invalid/i)).toBeTruthy();
  });
});
