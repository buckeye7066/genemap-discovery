import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MedicalDisclaimer from '../MedicalDisclaimer.jsx';

// The disclaimer is the visible counterpart to the server-side honesty
// directive. These tests lock the non-negotiable phrasing per variant so the
// promise cannot be silently softened or dropped.
//
// NB: this file sits under components/shared/**, which jsconfig.typecheck.json
// type-checks with `types: []` — so jest-dom matchers (toBeInTheDocument) are
// not in scope here. `getByText`/`getByRole` already throw when the element is
// absent, so a truthiness assertion is a sufficient (and type-safe) presence
// check.
describe('MedicalDisclaimer', () => {
  it('renders the education notice with the "not medical advice" promise', () => {
    render(<MedicalDisclaimer variant="education" />);
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    expect(screen.getByText(/genetic counselor/i)).toBeTruthy();
    // Education framing must reject genetic determinism.
    expect(screen.getByText(/single gene rarely determines/i)).toBeTruthy();
  });

  it('renders the research notice scoped away from clinical use', () => {
    render(<MedicalDisclaimer variant="research" />);
    expect(screen.getByText(/not clinical guidance/i)).toBeTruthy();
    expect(screen.getByText(/diagnosis or patient care/i)).toBeTruthy();
  });

  it('renders the clinical notice for assistant chat', () => {
    render(<MedicalDisclaimer variant="clinical" />);
    expect(screen.getByText(/not medical advice/i)).toBeTruthy();
    expect(screen.getByText(/verify any cited source/i)).toBeTruthy();
  });

  it('defaults to the education variant and exposes a note role', () => {
    render(<MedicalDisclaimer />);
    expect(screen.getByRole('note')).toBeTruthy();
    expect(screen.getByText(/educational use only/i)).toBeTruthy();
  });
});
