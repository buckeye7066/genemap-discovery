import React, { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Info, Network } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  fetchGeneNetwork,
  GENE_NETWORK_MAX_SYMBOLS,
} from '@/lib/geneNetworkClient';

const WIDTH = 720;
const HEIGHT = 360;

function safeStringUrl(value) {
  try {
    const parsed = new URL(String(value || ''));
    if (parsed.protocol !== 'https:') return null;
    if (parsed.hostname !== 'string-db.org' && !parsed.hostname.endsWith('.string-db.org')) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function layoutNodes(nodes) {
  const ordered = [...(Array.isArray(nodes) ? nodes : [])].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === 'query' ? -1 : 1;
    return String(left.symbol).localeCompare(String(right.symbol));
  });
  if (ordered.length === 1) {
    return [{ ...ordered[0], x: WIDTH / 2, y: HEIGHT / 2 }];
  }
  const radius = Math.min(140, 52 + ordered.length * 10);
  return ordered.map((node, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / ordered.length;
    return {
      ...node,
      x: WIDTH / 2 + Math.cos(angle) * radius,
      y: HEIGHT / 2 + Math.sin(angle) * radius,
    };
  });
}

function visibleEdges(edges, minimumScore, selectedNode) {
  return (Array.isArray(edges) ? edges : []).filter((edge) => {
    if (!Number.isFinite(edge?.score) || edge.score < minimumScore) return false;
    return !selectedNode || edge.source === selectedNode || edge.target === selectedNode;
  });
}

function formatRetrievedAt(value) {
  if (!value) return 'retrieval time not recorded';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'retrieval time not recorded' : date.toISOString();
}

export default function GeneNetwork({ symbols = [] }) {
  const symbolKey = useMemo(
    () => [...new Set(symbols.map((symbol) => String(symbol || '').trim().toUpperCase()).filter(Boolean))]
      .sort((left, right) => left.localeCompare(right))
      .join('|'),
    [symbols],
  );
  const [network, setNetwork] = useState(null);
  const [loading, setLoading] = useState(false);
  const [minimumScore, setMinimumScore] = useState(0.4);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const cleanSymbols = symbolKey ? symbolKey.split('|') : [];
    setSelectedNode(null);
    if (cleanSymbols.length < 2) {
      setNetwork(null);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    fetchGeneNetwork(cleanSymbols, { requiredScore: 400, addNodes: 3 })
      .then((result) => {
        if (!cancelled) setNetwork(result);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbolKey]);

  const positionedNodes = useMemo(() => layoutNodes(network?.nodes), [network?.nodes]);
  const nodePositions = useMemo(
    () => new Map(positionedNodes.map((node) => [node.id, node])),
    [positionedNodes],
  );
  const filteredEdges = useMemo(
    () => visibleEdges(network?.edges, minimumScore, selectedNode),
    [network?.edges, minimumScore, selectedNode],
  );
  const visibleNodeIds = useMemo(
    () => new Set(filteredEdges.flatMap((edge) => [edge.source, edge.target])),
    [filteredEdges],
  );
  const documentationUrl = safeStringUrl(network?.source?.documentationUrl)
    || 'https://string-db.org/help/api/';
  const networkUrl = safeStringUrl(network?.source?.networkUrl);
  const omittedSymbols = Array.isArray(network?.omittedSymbols) ? network.omittedSymbols : [];
  const querySymbols = Array.isArray(network?.querySymbols) ? network.querySymbols : [];
  const aliasMappings = (Array.isArray(network?.queryMappings) ? network.queryMappings : [])
    .map((mapping) => ({
      submittedSymbol: String(mapping?.submittedSymbol || '').trim().toUpperCase(),
      preferredSymbol: String(mapping?.preferredSymbol || '').trim().toUpperCase(),
      resolved: mapping?.resolved === true,
    }))
    .filter((mapping) => mapping.resolved
      && mapping.submittedSymbol
      && mapping.preferredSymbol
      && mapping.submittedSymbol !== mapping.preferredSymbol);

  return (
    <Card className="border-indigo-200" aria-labelledby="gene-network-heading">
      <CardHeader className="pb-3">
        <CardTitle id="gene-network-heading" className="text-base flex items-center gap-2">
          <Network className="h-4 w-4 text-indigo-700" />
          Interactive functional association network
        </CardTitle>
        <p className="text-sm text-slate-600">
          A live, source-grounded human-gene network from STRING. Added neighbors are labeled
          separately from genes selected for comparison.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading && <p role="status" className="text-sm text-slate-600">Loading source network…</p>}

        {!loading && omittedSymbols.length > 0 && (
          <Alert role="status" className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-950">
              STRING network requests are limited to {GENE_NETWORK_MAX_SYMBOLS} compared genes.
              This network includes {querySymbols.join(', ')}. Not included in this network:{' '}
              {omittedSymbols.join(', ')}. Every selected gene remains in the comparison table and
              evidence sections above.
            </AlertDescription>
          </Alert>
        )}

        {!loading && aliasMappings.length > 0 && (
          <Alert role="status" className="border-blue-200 bg-blue-50">
            <Info className="h-4 w-4 text-blue-700" />
            <AlertDescription className="text-blue-950">
              STRING identifier mapping:{' '}
              {aliasMappings
                .map((mapping) => `${mapping.submittedSymbol} → ${mapping.preferredSymbol}`)
                .join(', ')}. Network nodes use STRING-preferred symbols; the selected-gene
              evidence above remains unchanged.
            </AlertDescription>
          </Alert>
        )}

        {!loading && network?.sourceStatus === 'unavailable' && (
          <Alert className="border-amber-200 bg-amber-50">
            <Info className="h-4 w-4 text-amber-700" />
            <AlertDescription className="text-amber-900">
              STRING is temporarily unavailable. The comparison evidence above remains unchanged.
            </AlertDescription>
          </Alert>
        )}

        {!loading && network?.sourceStatus === 'no_associations' && (
          <p className="text-sm text-slate-600">
            STRING returned no functional associations at the requested source threshold.
          </p>
        )}

        {!loading && network?.sourceStatus === 'available' && (
          <>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <svg
                  viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
                  className="h-auto w-full"
                  role="img"
                  aria-label={`STRING functional association network with ${positionedNodes.length} nodes and ${filteredEdges.length} visible edges`}
                >
                  {filteredEdges.map((edge) => {
                    const source = nodePositions.get(edge.source);
                    const target = nodePositions.get(edge.target);
                    if (!source || !target) return null;
                    return (
                      <line
                        key={edge.id}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        stroke="#6366f1"
                        strokeOpacity={0.25 + edge.score * 0.65}
                        strokeWidth={1 + edge.score * 4}
                      />
                    );
                  })}
                  {positionedNodes.map((node) => {
                    const isVisible = visibleNodeIds.has(node.id);
                    const isSelected = selectedNode === node.id;
                    return (
                      <g key={node.id} opacity={isVisible ? 1 : 0.3}>
                        <circle
                          cx={node.x}
                          cy={node.y}
                          r={isSelected ? 24 : 20}
                          fill={node.kind === 'query' ? '#2563eb' : '#f59e0b'}
                          stroke={isSelected ? '#111827' : '#ffffff'}
                          strokeWidth={isSelected ? 4 : 2}
                        />
                        <text
                          x={node.x}
                          y={node.y + 36}
                          textAnchor="middle"
                          className="fill-slate-800 text-[13px] font-semibold"
                        >
                          {node.symbol}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <div className="space-y-4">
                <div>
                  <label htmlFor="network-minimum-score" className="text-sm font-medium text-slate-800">
                    Minimum source score: {minimumScore.toFixed(1)}
                  </label>
                  <input
                    id="network-minimum-score"
                    aria-label="Minimum functional association score"
                    type="range"
                    min="0.4"
                    max="0.9"
                    step="0.1"
                    value={minimumScore}
                    onChange={(event) => setMinimumScore(Number(event.target.value))}
                    className="mt-2 w-full accent-indigo-600"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    This is a provider score, not a probability or clinical grade.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-medium text-slate-800">Focus a node</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {positionedNodes.map((node) => (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => setSelectedNode((current) => current === node.id ? null : node.id)}
                        aria-pressed={selectedNode === node.id}
                        className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                          node.kind === 'query'
                            ? 'border-blue-300 bg-blue-50 text-blue-800'
                            : 'border-amber-300 bg-amber-50 text-amber-800'
                        }`}
                      >
                        {node.symbol}{node.kind === 'expanded' ? ' · added' : ''}
                      </button>
                    ))}
                  </div>
                  {selectedNode && (
                    <button
                      type="button"
                      onClick={() => setSelectedNode(null)}
                      className="mt-2 text-xs font-medium text-indigo-700 hover:underline"
                    >
                      Show all associations
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-md border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Association</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Source score</th>
                    <th className="px-3 py-2 text-left font-semibold text-slate-700">Positive channels</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredEdges.map((edge) => (
                    <tr key={edge.id}>
                      <td className="px-3 py-2 font-medium text-slate-900">
                        {edge.source} ↔ {edge.target}
                      </td>
                      <td className="px-3 py-2">{edge.score.toFixed(3)}</td>
                      <td className="px-3 py-2 text-xs text-slate-600">
                        {(edge.evidenceChannels || [])
                          .map((channel) => `${channel.label} ${channel.score.toFixed(3)}`)
                          .join(', ') || 'none reported'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredEdges.length === 0 && (
                <p className="p-3 text-sm text-slate-600">
                  No associations match the current score and node filters.
                </p>
              )}
            </div>
          </>
        )}

        <Alert role="note" className="border-indigo-200 bg-indigo-50">
          <Info className="h-4 w-4 text-indigo-700" />
          <AlertDescription className="text-indigo-950">
            STRING functional associations may reflect indirect evidence and do not establish
            physical binding, causality, diagnosis, or treatment relevance.
          </AlertDescription>
        </Alert>

        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <span>Source: STRING public API</span>
          <span>Species: Homo sapiens (taxon 9606)</span>
          <span>Retrieved: {formatRetrievedAt(network?.retrievedAt)}</span>
          <a
            href={documentationUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
          >
            API documentation <ExternalLink className="h-3 w-3" />
          </a>
          {networkUrl && (
            <a
              href={networkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-medium text-indigo-700 hover:underline"
            >
              Open in STRING <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

export const __test = { formatRetrievedAt, layoutNodes, safeStringUrl, visibleEdges };
