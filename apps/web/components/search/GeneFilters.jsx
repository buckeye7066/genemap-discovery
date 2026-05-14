// Filters sidebar for gene search results. Original missing from repo;
// minimal implementation supports the common props GeneResults passes
// (filters object + onChange callback). UI is intentionally austere so
// that the real filter UX, when restored, can replace this without
// migration.
export default function GeneFilters({ filters = {}, onChange }) {
  const setFilter = (key, value) => {
    if (!onChange) return;
    onChange({ ...filters, [key]: value });
  };
  return (
    <aside className="w-full max-w-xs space-y-4 rounded-md border border-slate-200 bg-white p-4">
      <h3 className="text-sm font-medium text-slate-900">Filters</h3>
      <div className="space-y-2">
        <label className="block text-xs text-slate-600" htmlFor="gene-filter-chromosome">
          Chromosome
        </label>
        <input
          id="gene-filter-chromosome"
          type="text"
          value={filters.chromosome ?? ''}
          onChange={(e) => setFilter('chromosome', e.target.value)}
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
          placeholder="any"
        />
      </div>
      <div className="space-y-2">
        <label className="block text-xs text-slate-600" htmlFor="gene-filter-min-score">
          Min relevance score
        </label>
        <input
          id="gene-filter-min-score"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={filters.minScore ?? 0}
          onChange={(e) => setFilter('minScore', Number(e.target.value))}
          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
        />
      </div>
    </aside>
  );
}
