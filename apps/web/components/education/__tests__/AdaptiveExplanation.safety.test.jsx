import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import AdaptiveExplanation from '../AdaptiveExplanation';

describe('AdaptiveExplanation model-markdown boundary', () => {
  it('renders generated link and image labels without active href or src attributes', () => {
    const { container } = render(
      <AdaptiveExplanation
        loading={false}
        level="undergraduate"
        content={'Read [the source](https://untrusted.example) and ![tracking pixel](https://tracker.example/pixel.png).'}
      />,
    );

    expect(screen.getByText('the source')).toBeInTheDocument();
    expect(screen.getByText('tracking pixel')).toBeInTheDocument();
    expect(container.querySelector('a')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.innerHTML).not.toContain('https://untrusted.example');
    expect(container.innerHTML).not.toContain('https://tracker.example');
  });
});
