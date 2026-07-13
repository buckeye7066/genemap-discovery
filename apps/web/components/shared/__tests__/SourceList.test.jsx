import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SourceList from '../SourceList.jsx';

// components/shared/** is type-checked with types:[] — no jest-dom matchers.
const SAMPLE = [
  { label: 'MedlinePlus Genetics', url: 'https://medlineplus.gov/genetics/', publisher: 'NIH' },
  { label: 'Talking Glossary', url: 'https://www.genome.gov/genetics-glossary', publisher: 'NHGRI' },
];

describe('SourceList', () => {
  it('renders each source as a safe external link', () => {
    render(<SourceList sources={SAMPLE} />);
    const links = screen.getAllByRole('link');
    expect(links.length).toBe(2);
    for (const a of links) {
      expect(a.getAttribute('target')).toBe('_blank');
      // Prevent reverse-tabnabbing on target=_blank links.
      expect(a.getAttribute('rel')).toContain('noopener');
      expect(a.getAttribute('href').startsWith('https://')).toBe(true);
    }
    expect(screen.getByText(/MedlinePlus Genetics/)).toBeTruthy();
  });

  it('renders nothing when there are no sources', () => {
    const { container } = render(<SourceList sources={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when sources is not an array', () => {
    const { container } = render(<SourceList sources={undefined} />);
    expect(container.firstChild).toBeNull();
  });
});
