import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MedicalDisclaimer from '../MedicalDisclaimer.jsx';

// The disclaimer is the visible counterpart to the server-side honesty
// directive. These tests lock the non-negotiable phrasing per variant so the
// promise cannot be silently softened or dropped.
describe('MedicalDisclaimer', () => {
  it('renders the education notice with the "not medical advice" promise', () => {
    render(<MedicalDisclaimer variant="education" />);
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
    expect(screen.getByText(/genetic counselor/i)).toBeInTheDocument();
    // Education framing must reject genetic determinism.
    expect(screen.getByText(/single gene rarely determines/i)).toBeInTheDocument();
  });

  it('renders the research notice scoped away from clinical use', () => {
    render(<MedicalDisclaimer variant="research" />);
    expect(screen.getByText(/not clinical guidance/i)).toBeInTheDocument();
    expect(screen.getByText(/diagnosis or patient care/i)).toBeInTheDocument();
  });

  it('renders the clinical notice for assistant chat', () => {
    render(<MedicalDisclaimer variant="clinical" />);
    expect(screen.getByText(/not medical advice/i)).toBeInTheDocument();
    expect(screen.getByText(/verify any cited source/i)).toBeInTheDocument();
  });

  it('defaults to the education variant and exposes a note role', () => {
    render(<MedicalDisclaimer />);
    expect(screen.getByRole('note')).toBeInTheDocument();
    expect(screen.getByText(/educational use only/i)).toBeInTheDocument();
  });
});
