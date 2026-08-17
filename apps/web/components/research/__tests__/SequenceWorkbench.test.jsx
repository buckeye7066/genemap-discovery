import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import SequenceWorkbench from '../SequenceWorkbench';

function workbenchCards() {
  return {
    analysis: screen.getByText('Sequence workbench').closest('.rounded-xl'),
    alignment: screen.getByText('Short pairwise alignment').closest('.rounded-xl'),
  };
}

describe('SequenceWorkbench', () => {
  it('clears stale primary analysis and reports a primary error in the analysis card', () => {
    render(<SequenceWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: /analyze sequence/i }));
    expect(screen.getByText(/39 bases/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/DNA or FASTA/i), { target: { value: 'ACGT?' } });
    fireEvent.click(screen.getByRole('button', { name: /align teaching sequences/i }));

    const cards = workbenchCards();
    expect(within(cards.analysis).getByRole('alert')).toHaveTextContent(/unsupported DNA symbol/i);
    expect(within(cards.analysis).queryByText(/39 bases/i)).not.toBeInTheDocument();
    expect(within(cards.alignment).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps valid primary analysis while isolating comparison errors to the alignment card', () => {
    render(<SequenceWorkbench />);
    fireEvent.change(screen.getByLabelText(/comparison DNA/i), { target: { value: 'TGCA?' } });
    fireEvent.click(screen.getByRole('button', { name: /align teaching sequences/i }));

    const cards = workbenchCards();
    expect(within(cards.analysis).getByText(/39 bases/i)).toBeInTheDocument();
    expect(within(cards.analysis).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(cards.alignment).getByRole('alert')).toHaveTextContent(/unsupported DNA symbol/i);
  });

  it('rejects multi-record FASTA without retaining prior alignment output', () => {
    render(<SequenceWorkbench />);
    fireEvent.click(screen.getByRole('button', { name: /align teaching sequences/i }));
    expect(screen.getByText(/Identity/i)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/DNA or FASTA/i), {
      target: { value: '>one\nACGT\n>two\nTGCA' },
    });
    fireEvent.click(screen.getByRole('button', { name: /align teaching sequences/i }));

    const cards = workbenchCards();
    expect(within(cards.analysis).getByRole('alert')).toHaveTextContent(/one FASTA record at a time/i);
    expect(screen.queryByText(/Identity/i)).not.toBeInTheDocument();
  });
});
