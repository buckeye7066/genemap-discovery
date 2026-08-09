import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import ReactMarkdown from 'react-markdown';
import { safeModelMarkdownComponents } from '../safeModelMarkdown';

describe('safeModelMarkdownComponents', () => {
  it('renders reference-style links and images as inert visible text', () => {
    const markdown = [
      'Review [the source][record] and ![tracking pixel][pixel].',
      '',
      '[record]: https://untrusted.example/source',
      '[pixel]: //tracker.example/pixel.png',
    ].join('\n');

    render(
      <ReactMarkdown components={safeModelMarkdownComponents}>
        {markdown}
      </ReactMarkdown>,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/the source/)).toBeTruthy();
    expect(screen.getByText(/tracking pixel/)).toBeTruthy();
  });

  it('renders inline links and images without href or src surfaces', () => {
    render(
      <ReactMarkdown components={safeModelMarkdownComponents}>
        {'[source](https://untrusted.example) ![pixel](https://tracker.example/pixel.png)'}
      </ReactMarkdown>,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText(/source/)).toBeTruthy();
    expect(screen.getByText(/pixel/)).toBeTruthy();
  });
});
