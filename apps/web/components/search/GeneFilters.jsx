const EVIDENCE_OPTIONS = Object.freeze([
  { value: 'all', label: 'All candidate leads' },
  { value: 'human', label: 'Has human association evidence' },
  { value: 'animal', label: 'Has model-organism evidence' },
  { value: 'computational', label: 'Has computed association evidence' },
  { value: 'unverified', label: 'Unverified AI leads only' },
]);

export default function GeneFilters({
  filters = {},
  onFilterChange,
  onChange,
  onClearFilters,
  resultCount,
}) {
  const changeHandler = onFilterChange || onChange;
  const setFilter = (key, value) => {
    if (!changeHandler) return;
    changeHandler({ ...filters, [key]: value });
  };

  const hasActiveFilters = Boolean(
    filters.symbol
    || filters.name
    || (filters.chromosome && filters.chromosome !== 'All')
    || filters.phenotype
    || (filters.evidenceBasis && filters.evidenceBasis !== 'all'),
  );

  return (
    <section className="w-full space-y-4 rounded-lg border border-slate-200 bg-white p-4" aria-labelledby="gene-filters-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="gene-filters-heading" className="text-sm font-semibold text-slate-900">Filter candidate evidence</h3>
          <p className="mt-1 text-xs text-slate-500">
            Evidence filters use cited source records, never an AI-generated relevance score.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {Number.isInteger(resultCount) && (
            <span className="text-xs font-medium text-slate-600" aria-live="polite">
              {resultCount} result{resultCount === 1 ? '' : 's'}
            </span>
          )}
          {onClearFilters && (
            <button
              type="button"
              onClick={onClearFilters}
              disabled={!hasActiveFilters}
              className="rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="gene-filter-symbol">
            Gene symbol
          </label>
          <input
            id="gene-filter-symbol"
            type="text"
            value={filters.symbol ?? ''}
            onChange={(event) => setFilter('symbol', event.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="e.g. CFTR"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="gene-filter-name">
            Gene name
          </label>
          <input
            id="gene-filter-name"
            type="text"
            value={filters.name ?? ''}
            onChange={(event) => setFilter('name', event.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="contains…"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="gene-filter-chromosome">
            Chromosome
          </label>
          <input
            id="gene-filter-chromosome"
            type="text"
            value={filters.chromosome === 'All' ? '' : filters.chromosome ?? ''}
            onChange={(event) => setFilter('chromosome', event.target.value || 'All')}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="Any"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="gene-filter-phenotype">
            Candidate phenotype term
          </label>
          <input
            id="gene-filter-phenotype"
            type="text"
            value={filters.phenotype ?? ''}
            onChange={(event) => setFilter('phenotype', event.target.value)}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm"
            placeholder="contains…"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-slate-700" htmlFor="gene-filter-evidence">
            Evidence category
          </label>
          <select
            id="gene-filter-evidence"
            value={filters.evidenceBasis ?? 'all'}
            onChange={(event) => setFilter('evidenceBasis', event.target.value)}
            className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm"
          >
            {EVIDENCE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
      </div>
    </section>
  );
}

export const __test = { EVIDENCE_OPTIONS };
