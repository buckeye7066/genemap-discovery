import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const networkClient = vi.hoisted(() => ({
  fetchGeneNetwork: vi.fn(),
  GENE_NETWORK_MAX_SYMBOLS: 10,
}));

vi.mock('../../../lib/geneNetworkClient', () => networkClient);

import GeneNetwork, { __test } from '../GeneNetwork';

const network = {
  querySymbols: ['SCN1A', 'SCN2A'],
  nodes: [
    { id: 'SCN1A', symbol: 'SCN1A', kind: 'query' },
    { id: 'SCN2A', symbol: 'SCN2A', kind: 'query' },
    { id: 'SCN3A', symbol: 'SCN3A', kind: 'expanded' },
  ],
  edges: [
    {
      id: 'SCN1A::SCN2A',
      source: 'SCN1A',
      target: 'SCN2A',
      score: 0.91,
      evidenceChannels: [{ label: 'experiments', score: 0.8 }],
    },
    {
      id: 'SCN1A::SCN3A',
      source: 'SCN1A',
      target: 'SCN3A',
      score: 0.55,
      evidenceChannels: [{ label: 'co-expression', score: 0.4 }],
    },
    {
      id: 'SCN2A::SCN3A',
      source: 'SCN2A',
      target: 'SCN3A',
      score: 0.45,
      evidenceChannels: [],
    },
  ],
  sourceStatus: 'available',
  source: {
    name: 'STRING',
    documentationUrl: 'https://string-db.org/help/api/',
    networkUrl: 'https://string-db.org/cgi/network?identifiers=SCN1A%0DSCN2A&species=9606',
    species: 'Homo sapiens',
    taxon: '9606',
    networkType: 'functional',
  },
  retrievedAt: '2026-08-25T12:00:00.000Z',
};

describe('GeneNetwork', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    networkClient.fetchGeneNetwork.mockResolvedValue(network);
  });

  it('renders a source-cited network and interactively filters by score and node', async () => {
    render(<GeneNetwork symbols={['SCN2A', 'SCN1A']} />);

    await screen.findByRole('img', { name: /3 nodes and 3 visible edges/i });
    expect(networkClient.fetchGeneNetwork).toHaveBeenCalledWith(
      ['SCN1A', 'SCN2A'],
      { requiredScore: 400, addNodes: 3 },
    );
    expect(screen.getByText('SCN3A · added')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /api documentation/i })).toHaveAttribute(
      'href',
      'https://string-db.org/help/api/',
    );
    expect(screen.getByText('0.450')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: /minimum functional association score/i }), {
      target: { value: '0.8' },
    });
    expect(screen.getByText('0.910')).toBeInTheDocument();
    expect(screen.queryByText('0.550')).not.toBeInTheDocument();
    expect(screen.queryByText('0.450')).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole('slider', { name: /minimum functional association score/i }), {
      target: { value: '0.4' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'SCN1A' }));
    await waitFor(() => {
      expect(screen.getByText('0.550')).toBeInTheDocument();
      expect(screen.queryByText('0.450')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /show all associations/i })).toBeInTheDocument();
  });

  it('labels an upstream outage without changing comparison evidence', async () => {
    networkClient.fetchGeneNetwork.mockResolvedValue({
      ...network,
      nodes: [],
      edges: [],
      sourceStatus: 'unavailable',
      retrievedAt: null,
    });

    render(<GeneNetwork symbols={['SCN1A', 'SCN2A']} />);

    expect(await screen.findByText(/temporarily unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/comparison evidence above remains unchanged/i)).toBeInTheDocument();
    expect(screen.getByText(/do not establish physical binding, causality, diagnosis, or treatment relevance/i))
      .toBeInTheDocument();
  });

  it('keeps a selected gene visible when it has no qualifying association edge', async () => {
    networkClient.fetchGeneNetwork.mockResolvedValue({
      ...network,
      querySymbols: ['SCN1A', 'SCN2A', 'SCN4A'],
      nodes: [
        ...network.nodes,
        { id: 'SCN4A', symbol: 'SCN4A', kind: 'query' },
      ],
    });

    render(<GeneNetwork symbols={['SCN4A', 'SCN2A', 'SCN1A']} />);

    expect(await screen.findByRole('img', { name: /4 nodes and 3 visible edges/i }))
      .toBeInTheDocument();
    expect(screen.getAllByText('SCN4A')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'SCN4A' })).toBeInTheDocument();
  });

  it('shows provider-preferred symbols when STRING resolves a selected alias', async () => {
    networkClient.fetchGeneNetwork.mockResolvedValue({
      ...network,
      querySymbols: ['P53', 'SCN1A'],
      resolvedQuerySymbols: ['SCN1A', 'TP53'],
      queryMappings: [
        {
          submittedSymbol: 'P53',
          preferredSymbol: 'TP53',
          resolved: true,
        },
        {
          submittedSymbol: 'SCN1A',
          preferredSymbol: 'SCN1A',
          resolved: true,
        },
      ],
      nodes: [
        { id: 'SCN1A', symbol: 'SCN1A', kind: 'query' },
        { id: 'TP53', symbol: 'TP53', kind: 'query' },
      ],
      edges: [{
        id: 'SCN1A::TP53',
        source: 'SCN1A',
        target: 'TP53',
        score: 0.88,
        evidenceChannels: [{ label: 'experiments', score: 0.7 }],
      }],
    });

    render(<GeneNetwork symbols={['P53', 'SCN1A']} />);

    const mapping = await screen.findByText(/STRING identifier mapping/i);
    expect(mapping).toHaveTextContent('P53 → TP53');
    expect(mapping).toHaveTextContent('Network nodes use STRING-preferred symbols');
    expect(screen.getByRole('button', { name: 'TP53' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'P53' })).not.toBeInTheDocument();
  });

  it('names unresolved selections without presenting them as queried nodes', async () => {
    networkClient.fetchGeneNetwork.mockResolvedValue({
      ...network,
      querySymbols: ['SCN1A', 'SCN2A', 'UNKNOWN'],
      resolvedQuerySymbols: ['SCN1A', 'SCN2A'],
      queryMappings: [
        { submittedSymbol: 'SCN1A', preferredSymbol: 'SCN1A', resolved: true },
        { submittedSymbol: 'SCN2A', preferredSymbol: 'SCN2A', resolved: true },
        { submittedSymbol: 'UNKNOWN', preferredSymbol: 'UNKNOWN', resolved: false },
      ],
    });

    render(<GeneNetwork symbols={['UNKNOWN', 'SCN2A', 'SCN1A']} />);

    const unresolved = await screen.findByText(/STRING did not resolve/i);
    expect(unresolved).toHaveTextContent('UNKNOWN');
    expect(unresolved).toHaveTextContent('not shown as network nodes');
    expect(screen.queryByRole('button', { name: 'UNKNOWN' })).not.toBeInTheDocument();
  });

  it('names selected genes outside the bounded STRING network scope', async () => {
    const requestedSymbols = Array.from(
      { length: 12 },
      (_, index) => `G${String(index + 1).padStart(2, '0')}`,
    );
    networkClient.fetchGeneNetwork.mockResolvedValue({
      ...network,
      requestedSymbols,
      querySymbols: requestedSymbols.slice(0, 10),
      omittedSymbols: requestedSymbols.slice(10),
      nodes: [],
      edges: [],
      sourceStatus: 'no_associations',
    });

    render(<GeneNetwork symbols={[...requestedSymbols].reverse()} />);

    const scopeNotice = await screen.findByText(/STRING network requests are limited to 10/i);
    expect(networkClient.fetchGeneNetwork).toHaveBeenCalledWith(
      requestedSymbols,
      { requiredScore: 400, addNodes: 3 },
    );
    expect(scopeNotice).toHaveTextContent('Not included in this network: G11, G12');
    expect(scopeNotice).toHaveTextContent(
      'Every selected gene remains in the comparison table and evidence sections above.',
    );
  });

  it('rejects non-STRING source links and computes stable node positions', () => {
    expect(__test.safeStringUrl('https://evil.example/network')).toBeNull();
    expect(__test.safeStringUrl('https://string-db.org/help/api/')).toBe(
      'https://string-db.org/help/api/',
    );
    expect(__test.layoutNodes([...network.nodes].reverse()).map((node) => node.id)).toEqual([
      'SCN1A',
      'SCN2A',
      'SCN3A',
    ]);
  });
});
