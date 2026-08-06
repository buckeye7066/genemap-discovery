import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import AutocompleteSearch from '../AutocompleteSearch';
import SearchForm from '../SearchForm';

vi.mock('@genemap/shared', () => ({
  apiClient: { searchPublicationConcepts: vi.fn() },
}));

function Harness({ onSelect = vi.fn(), searchMode = 'free_text' }) {
  const [value, setValue] = useState('');
  return (
    <AutocompleteSearch
      value={value}
      onChange={setValue}
      onSelect={onSelect}
      searchMode={searchMode}
    />
  );
}

describe('resolver-backed publication autocomplete', () => {
  beforeEach(() => vi.clearAllMocks());

  it('clicks a remote HPO suggestion once and passes identifier-only generation input', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [{
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
    }] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(screen.getByLabelText(/reviewed research concept/i), {
      target: { value: 'remote seizure' },
    });
    fireEvent.click(await screen.findByRole('button', { name: /seizure/i }));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith(
      'Seizure',
      false,
      'free_text',
      { kind: 'hpo', identifier: 'HP:0001250' },
    );
    expect(JSON.stringify(onSearch.mock.calls[0])).not.toContain('NLM Clinical Tables HPO');
  });

  it('drops a late response after the query changes', async () => {
    let resolveFirst;
    apiClient.searchPublicationConcepts.mockImplementation((query) => {
      if (query === 'alpha') {
        return new Promise((resolve) => { resolveFirst = resolve; });
      }
      return Promise.resolve({ suggestions: [{
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Beta result',
        source: 'NLM Clinical Tables HPO',
        apiVersion: 'v3',
      }] });
    });
    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'alpha' } });
    await waitFor(() => expect(apiClient.searchPublicationConcepts).toHaveBeenCalledWith('alpha', 'phenotype'));
    fireEvent.change(input, { target: { value: 'beta' } });
    expect(await screen.findByText('Beta result')).toBeInTheDocument();
    await act(async () => {
      resolveFirst({ suggestions: [{
        kind: 'hpo',
        identifier: 'HP:0004322',
        canonicalLabel: 'Stale alpha result',
        source: 'NLM Clinical Tables HPO',
        apiVersion: 'v3',
      }] });
    });
    expect(screen.queryByText('Stale alpha result')).not.toBeInTheDocument();
  });

  it('drops a late response after the resolver mode changes', async () => {
    let resolvePhenotype;
    apiClient.searchPublicationConcepts.mockImplementation((_query, kind) => {
      if (kind === 'phenotype') {
        return new Promise((resolve) => { resolvePhenotype = resolve; });
      }
      return Promise.resolve({ suggestions: [{
        kind: 'mondo',
        identifier: 'MONDO:0009061',
        canonicalLabel: 'Current disease result',
        source: 'Monarch Initiative',
        apiVersion: 'v3',
      }] });
    });
    const { rerender } = render(<Harness searchMode="free_text" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cystic' } });
    await waitFor(() => expect(apiClient.searchPublicationConcepts)
      .toHaveBeenCalledWith('cystic', 'phenotype'));
    rerender(<Harness searchMode="disease" />);
    expect(await screen.findByText('Current disease result')).toBeInTheDocument();
    await act(async () => {
      resolvePhenotype({ suggestions: [{
        kind: 'hpo',
        identifier: 'HP:0001250',
        canonicalLabel: 'Stale phenotype result',
        source: 'NLM Clinical Tables HPO',
        apiVersion: 'v3',
      }] });
    });
    expect(screen.queryByText('Stale phenotype result')).not.toBeInTheDocument();
  });

  it('Enter selects only the highlighted current suggestion', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [{
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
    }] });
    const onSelect = vi.fn();
    render(<Harness onSelect={onSelect} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'remote seizure' } });
    await screen.findByText('Seizure');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalledOnce();
    expect(onSelect.mock.calls[0][0].publicationReference).toEqual({
      kind: 'hpo',
      identifier: 'HP:0001250',
    });
  });

  it('resolver outage exposes only reviewed local fallback and no false verification copy', async () => {
    apiClient.searchPublicationConcepts.mockRejectedValue(new Error('resolver unavailable'));
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'poly' } });
    expect(await screen.findByText('polydactyly')).toBeInTheDocument();
    expect(screen.getByText('Reviewed GeneMap publication concept')).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it('maps HPO-mode remote suggestions consistently', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [{
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
    }] });
    render(<Harness searchMode="hpo_term" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'seiz' } });
    await screen.findByText('Seizure');
    expect(screen.getByText('hpo')).toBeInTheDocument();
  });

  it('submits pasted raw text as raw text; downstream typed service remains the fail-closed gate', () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    const input = screen.getByLabelText(/reviewed research concept/i);
    fireEvent.change(input, { target: { value: 'Alice Smith BRCA1 result' } });
    fireEvent.submit(input.closest('form'));
    expect(onSearch).toHaveBeenCalledWith('Alice Smith BRCA1 result', false, 'free_text');
  });

  it('does not carry a selected HPO reference into curated example searches', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [{
      kind: 'hpo',
      identifier: 'HP:0001250',
      canonicalLabel: 'Seizure',
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
    }] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    const input = screen.getByLabelText(/reviewed research concept/i);
    fireEvent.change(input, { target: { value: 'remote seizure' } });
    fireEvent.click(await screen.findByRole('button', { name: /seizure/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Cystic Fibrosis' }));
    fireEvent.click(screen.getByRole('button', { name: 'polydactyly' }));

    expect(onSearch.mock.calls[0][3]).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
    expect(onSearch.mock.calls[1]).toEqual(['Cystic Fibrosis', false, 'disease']);
    expect(onSearch.mock.calls[2]).toEqual(['polydactyly', false, 'free_text']);
    expect(JSON.stringify(onSearch.mock.calls.slice(1))).not.toContain('HP:0001250');
  });

  it('does not carry a selected MONDO reference into pasted raw submission', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [{
      kind: 'mondo',
      identifier: 'MONDO:0007947',
      canonicalLabel: 'Marfan syndrome',
      source: 'Monarch Initiative',
      apiVersion: 'v3',
    }] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cystic Fibrosis' }));
    const input = screen.getByLabelText(/reviewed research concept/i);
    fireEvent.change(input, { target: { value: 'marfan' } });
    fireEvent.click(await screen.findByRole('button', { name: /marfan syndrome/i }));
    fireEvent.change(input, { target: { value: 'Alice Smith BRCA1 result' } });
    fireEvent.submit(input.closest('form'));

    const mondoCall = onSearch.mock.calls.find((call) => call[3]?.kind === 'mondo');
    expect(mondoCall[3]).toEqual({ kind: 'mondo', identifier: 'MONDO:0007947' });
    const finalCall = onSearch.mock.calls.at(-1);
    expect(finalCall).toEqual(['Alice Smith BRCA1 result', false, 'disease']);
    expect(JSON.stringify(finalCall)).not.toContain('MONDO:0007947');
  });
});
