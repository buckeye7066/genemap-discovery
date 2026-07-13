import React from 'react';
import { ExternalLink, BookMarked } from 'lucide-react';

/**
 * Renders the curated authoritative references attached to an AI explanation
 * (see services/api/src/services/educationSources.js). These are real,
 * server-verified institutional links — the visible provenance behind the
 * "source-grounded" promise. Framed as further reading / verification, not as
 * citations that produced the AI text.
 *
 * Kept to plain elements + typed lucide icons because components/shared/** is
 * type-checked with `types: []`.
 */
export default function SourceList({ sources, className = '', title = 'Authoritative references' }) {
  if (!Array.isArray(sources) || sources.length === 0) return null;

  return (
    <section className={`mt-6 rounded-lg border border-slate-200 bg-slate-50 p-4 ${className}`} aria-label={title}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800 mb-1">
        <BookMarked className="h-4 w-4 text-slate-500" />
        {title}
      </h3>
      <p className="text-xs text-slate-500 mb-3">
        Learn more and verify with these trusted public sources. They are not the direct source of the
        explanation above.
      </p>
      <ul className="space-y-2">
        {sources.map((s) => (
          <li key={s.url}>
            <a
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex items-start gap-1.5 text-sm text-blue-700 hover:text-blue-900 hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-70 group-hover:opacity-100" />
              <span>
                {s.label}
                {s.publisher ? <span className="text-slate-500 font-normal"> — {s.publisher}</span> : null}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
