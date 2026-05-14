// Lazy-loaded gene comparison panel. Original missing from repo. Renders a
// minimal placeholder so the dynamic import in pages/Search.jsx resolves
// and the comparison drawer is gracefully empty until the real
// implementation is restored.
export default function GeneComparison({ genes = [] }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4">
      <h2 className="text-base font-medium text-slate-900">Gene comparison</h2>
      <p className="mt-1 text-sm text-slate-600">
        {genes.length === 0
          ? 'Select genes to compare side-by-side.'
          : `${genes.length} gene${genes.length === 1 ? '' : 's'} selected.`}
      </p>
    </section>
  );
}
