import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '@genemap/shared';
import AutocompleteSearch from '../AutocompleteSearch';
import SearchForm from '../SearchForm';

vi.mock('@genemap/shared', () => ({ apiClient: { searchPublicationConcepts: vi.fn() } }));
const HPO = { kind: 'hpo', identifier: 'HP:0001250', canonicalLabel: 'Seizure', source: 'NLM Clinical Tables HPO', apiVersion: 'v3' };
// Synthetic fixture identity, not a production ontology assertion.
const MONDO = { kind: 'mondo', identifier: 'MONDO:0009999', canonicalLabel: 'relapsing polychondritis', source: 'Monarch Initiative', apiVersion: 'v3' };
function Harness({ onSelect = vi.fn(), searchMode = 'free_text' }) {
  const [value, setValue] = useState('');
  return <AutocompleteSearch value={value} onChange={setValue} onSelect={onSelect} searchMode={searchMode} />;
}
const formInput = () => screen.getByLabelText(/reviewed research concept/i);
const submit = () => fireEvent.submit(formInput().closest('form'));

describe('resolver-backed publication autocomplete and submission', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [] });
  });

  it('clicks a remote HPO suggestion once and passes identifier-only generation input', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [HPO] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'remote seizure' } });
    fireEvent.click((await screen.findByText('HP:0001250 · NLM Clinical Tables HPO API v3')).closest('button'));
    expect(onSearch).toHaveBeenCalledOnce();
    expect(onSearch).toHaveBeenCalledWith('Seizure', false, 'free_text', { kind: 'hpo', identifier: 'HP:0001250' });
    expect(JSON.stringify(onSearch.mock.calls[0])).not.toContain('NLM Clinical Tables HPO');
  });

  it('drops all late responses after the query changes', async () => {
    const pending = [];
    apiClient.searchPublicationConcepts.mockImplementation((query) => query === 'alpha'
      ? new Promise((resolve) => pending.push(resolve))
      : Promise.resolve({ suggestions: [{ ...HPO, canonicalLabel: 'Beta result' }] }));
    render(<Harness />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'alpha' } });
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.change(input, { target: { value: 'beta' } });
    expect(await screen.findByText('Beta result')).toBeInTheDocument();
    await act(async () => pending.forEach((resolve) => resolve({ suggestions: [{ ...HPO, canonicalLabel: 'Stale alpha result' }] })));
    expect(screen.queryByText('Stale alpha result')).not.toBeInTheDocument();
  });

  it('drops a late response after the resolver mode changes', async () => {
    let resolvePhenotype;
    apiClient.searchPublicationConcepts.mockImplementation((_query, kind) => kind === 'phenotype'
      ? new Promise((resolve) => { resolvePhenotype = resolve; })
      : Promise.resolve({ suggestions: [MONDO] }));
    const { rerender } = render(<Harness searchMode="free_text" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'polychondritis' } });
    await waitFor(() => expect(apiClient.searchPublicationConcepts).toHaveBeenCalledWith('polychondritis', 'phenotype'));
    rerender(<Harness searchMode="disease" />);
    expect(await screen.findByText('relapsing polychondritis')).toBeInTheDocument();
    await act(async () => resolvePhenotype({ suggestions: [{ ...HPO, canonicalLabel: 'Stale phenotype result' }] }));
    expect(screen.queryByText('Stale phenotype result')).not.toBeInTheDocument();
  });

  it('Enter selects only the highlighted current suggestion', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [HPO] });
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
    expect(onSelect.mock.calls[0][0].publicationReference).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
  });

  it('resolver outage retains only reviewed local fallback without false verification copy', async () => {
    apiClient.searchPublicationConcepts.mockRejectedValue(new Error('resolver unavailable'));
    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'poly' } });
    expect(await screen.findByText('polydactyly')).toBeInTheDocument();
    expect(screen.getByText('Reviewed GeneMap publication concept')).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/lookup is temporarily unavailable/i)).toBeInTheDocument();
  });

  it('maps HPO-mode remote suggestions consistently', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [HPO] });
    render(<Harness searchMode="hpo_term" />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'seiz' } });
    await screen.findByText('Seizure');
    expect(screen.getByText('hpo')).toBeInTheDocument();
  });

  it('unmatched pasted text never reaches the generation callback', async () => {
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'Alice Smith BRCA1 result' } });
    submit();
    await screen.findByText(/No matching concept was found/i);
    expect(onSearch).not.toHaveBeenCalled();
    expect(formInput()).toHaveValue('Alice Smith BRCA1 result');
  });

  it('does not carry a selected HPO reference into curated example searches', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [HPO] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'remote seizure' } });
    fireEvent.click((await screen.findByText('HP:0001250 · NLM Clinical Tables HPO API v3')).closest('button'));
    fireEvent.click(screen.getByRole('button', { name: 'Cystic Fibrosis' }));
    fireEvent.click(screen.getByRole('button', { name: 'polydactyly' }));
    expect(onSearch.mock.calls[0][3]).toEqual({ kind: 'hpo', identifier: 'HP:0001250' });
    expect(onSearch.mock.calls[1]).toEqual(['Cystic Fibrosis', false, 'disease']);
    expect(onSearch.mock.calls[2]).toEqual(['polydactyly', false, 'free_text']);
    expect(JSON.stringify(onSearch.mock.calls.slice(1))).not.toContain('HP:0001250');
  });

  it('editing a selected MONDO label discards its reference before raw submission', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [MONDO] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'polychondritis' } });
    fireEvent.click(await screen.findByRole('button', { name: /relapsing polychondritis/i }));
    expect(onSearch).toHaveBeenCalledOnce();
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [] });
    fireEvent.change(formInput(), { target: { value: 'Alice Smith BRCA1 result' } });
    submit();
    await screen.findByText(/No matching concept was found/i);
    expect(onSearch).toHaveBeenCalledOnce();
    expect(formInput()).toHaveValue('Alice Smith BRCA1 result');
  });

  it('typing a disease in the default field finds disease suggestions without switching modes', async () => {
    apiClient.searchPublicationConcepts.mockImplementation(async (_query, kind) => ({ suggestions: kind === 'disease' ? [MONDO] : [] }));
    render(<SearchForm onSearch={vi.fn()} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'polychondritis' } });
    expect(await screen.findByText('relapsing polychondritis')).toBeInTheDocument();
    expect(apiClient.searchPublicationConcepts).toHaveBeenCalledWith('polychondritis', 'disease');
    expect(apiClient.searchPublicationConcepts).toHaveBeenCalledWith('polychondritis', 'phenotype');
  });

  it('Search/Enter before typeahead finishes offers fuzzy choices rather than an artifact error', async () => {
    apiClient.searchPublicationConcepts.mockImplementation(async (_query, kind) => ({ suggestions: kind === 'disease' ? [MONDO] : [] }));
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'polychondritis' } });
    submit();
    await screen.findByText(/No AI search has run yet/i);
    expect(onSearch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /relapsing polychondritis/i }));
    expect(onSearch).toHaveBeenCalledWith('relapsing polychondritis', false, 'disease', { kind: 'mondo', identifier: 'MONDO:0009999' });
    expect(screen.queryByText(/publication artifact/i)).not.toBeInTheDocument();
  });

  it('a unique exact canonical disease name can submit directly with a typed identifier', async () => {
    apiClient.searchPublicationConcepts.mockImplementation(async (_query, kind) => ({ suggestions: kind === 'disease' ? [MONDO] : [] }));
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'relapsing polychondritis' } });
    submit();
    await waitFor(() => expect(onSearch).toHaveBeenCalledWith('relapsing polychondritis', false, 'free_text', { kind: 'mondo', identifier: 'MONDO:0009999' }));
  });

  it('a selected remote reference survives a second Search click', async () => {
    apiClient.searchPublicationConcepts.mockResolvedValue({ suggestions: [HPO] });
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'remote seizure' } });
    fireEvent.click((await screen.findByText('HP:0001250 · NLM Clinical Tables HPO API v3')).closest('button'));
    apiClient.searchPublicationConcepts.mockClear();
    submit();
    await waitFor(() => expect(onSearch).toHaveBeenCalledTimes(2));
    expect(onSearch.mock.calls[1]).toEqual(['Seizure', false, 'free_text', { kind: 'hpo', identifier: 'HP:0001250' }]);
    expect(apiClient.searchPublicationConcepts).not.toHaveBeenCalled();
  });

  it('a 503 leaves the typed query intact and offers retry guidance without generation', async () => {
    apiClient.searchPublicationConcepts.mockRejectedValue(Object.assign(new Error('offline'), { status: 503 }));
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'polychondritis' } });
    submit();
    await screen.findByText(/Your text has been kept/i);
    expect(formInput()).toHaveValue('polychondritis');
    expect(onSearch).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Search (Free)' })).not.toBeDisabled();
  });

  it('editing during submitted lookup prevents a late result from starting an obsolete search', async () => {
    const pending = [];
    apiClient.searchPublicationConcepts.mockImplementation(() => new Promise((resolve) => pending.push(resolve)));
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'relapsing polychondritis' } });
    submit();
    await waitFor(() => expect(pending).toHaveLength(2));
    fireEvent.change(formInput(), { target: { value: 'new question' } });
    await act(async () => pending.forEach((resolve) => resolve({ suggestions: [MONDO] })));
    expect(onSearch).not.toHaveBeenCalled();
    expect(formInput()).toHaveValue('new question');
  });

  it('typing a curated disease in the default field does not require network resolution', async () => {
    const onSearch = vi.fn();
    render(<SearchForm onSearch={onSearch} isLoading={false} />);
    fireEvent.change(formInput(), { target: { value: 'Cystic Fibrosis' } });
    submit();
    await waitFor(() => expect(onSearch).toHaveBeenCalledOnce());
    expect(onSearch.mock.calls[0][3].conceptId).toBe('disease:cystic-fibrosis');
    expect(apiClient.searchPublicationConcepts).not.toHaveBeenCalled();
  });
});
