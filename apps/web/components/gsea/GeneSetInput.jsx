// Stub: GeneSetInput was referenced by pages/GSEA.jsx but the component file
// was missing from the repository. We render a minimal, functional textarea
// so the GSEA page renders without crashing; the parent page wires the
// onSubmit handler and validates the input itself.
import { useState } from 'react';

export default function GeneSetInput({ onSubmit, isLoading }) {
  const [text, setText] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const genes = text
      .split(/[\s,;\n]+/)
      .map((g) => g.trim())
      .filter(Boolean);
    onSubmit(genes);
  };
  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <label htmlFor="gsea-input" className="block text-sm font-medium text-slate-700">
        Gene set (one symbol per line, or comma/space separated)
      </label>
      <textarea
        id="gsea-input"
        rows={8}
        className="w-full rounded-md border border-slate-200 p-3 text-sm font-mono"
        placeholder="BRCA1\nTP53\nMYC"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={isLoading}
      />
      <button
        type="submit"
        className="inline-flex items-center px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        disabled={isLoading || text.trim().length === 0}
      >
        {isLoading ? 'Running…' : 'Run enrichment'}
      </button>
    </form>
  );
}
