// Lazy-loaded saved gene-set comparison view. Original missing from repo.
// Same rationale as GeneComparison.jsx — minimal placeholder that resolves
// the dynamic import without crashing the Search page.
export default function GeneSetComparison({ geneSets = [] }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-base font-medium text-slate-900">Compare gene sets</h2>
      <p className="mt-1 text-sm text-slate-600">
        {geneSets.length === 0
          ? 'Choose two saved gene sets to compare overlap and pathway enrichment.'
          : `${geneSets.length} sets selected.`}
      </p>
    </section>
  );
}
