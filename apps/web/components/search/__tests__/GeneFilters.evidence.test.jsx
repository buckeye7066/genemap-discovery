import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import GeneFilters from '../GeneFilters';

describe('GeneFilters evidence controls', () => {
  it('offers source-grounded evidence categories and no AI relevance-score control', () => {
    const onFilterChange = vi.fn();
    render(
      <GeneFilters
        filters={{
          symbol: '',
          name: '',
          chromosome: 'All',
          phenotype: '',
          evidenceBasis: 'all',
        }}
        onFilterChange={onFilterChange}
        onClearFilters={vi.fn()}
        resultCount={4}
      />,
    );

    expect(screen.queryByLabelText(/relevance score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/min relevance/i)).not.toBeInTheDocument();
    expect(screen.getByText(/never an AI-generated relevance score/i)).toBeInTheDocument();

    const evidenceSelect = screen.getByLabelText(/evidence category/i);
    expect(evidenceSelect).toHaveValue('all');
    expect(screen.getByRole('option', { name: /human association evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /model-organism evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /computed association evidence/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /unverified AI leads only/i })).toBeInTheDocument();

    fireEvent.change(evidenceSelect, { target: { value: 'human' } });
    expect(onFilterChange).toHaveBeenCalledWith(expect.objectContaining({
      evidenceBasis: 'human',
    }));
  });
});
