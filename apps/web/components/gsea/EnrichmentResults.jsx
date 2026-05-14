// Stub: EnrichmentResults was referenced by pages/GSEA.jsx but missing from
// the repo. Renders a minimal, honest table of results so the page is usable.
export default function EnrichmentResults({ results }) {
  if (!results || results.length === 0) {
    return (
      <p className="text-sm text-slate-500">No enrichment results to display.</p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left">
            <th className="py-2 pr-4 font-medium text-slate-700">Pathway</th>
            <th className="py-2 pr-4 font-medium text-slate-700">Genes</th>
            <th className="py-2 pr-4 font-medium text-slate-700">p-value</th>
            <th className="py-2 pr-4 font-medium text-slate-700">FDR</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r, i) => (
            <tr key={r.pathwayId || i} className="border-b border-slate-100">
              <td className="py-2 pr-4">{r.pathway || r.name || '—'}</td>
              <td className="py-2 pr-4">{Array.isArray(r.genes) ? r.genes.length : (r.geneCount ?? '—')}</td>
              <td className="py-2 pr-4">{typeof r.pValue === 'number' ? r.pValue.toExponential(2) : '—'}</td>
              <td className="py-2 pr-4">{typeof r.fdr === 'number' ? r.fdr.toExponential(2) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
