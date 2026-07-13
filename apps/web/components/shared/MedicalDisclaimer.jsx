import React from 'react';
import { Info } from 'lucide-react';

/**
 * The single source of truth for the user-facing honesty notice shown beneath
 * every AI-generated surface. It is the visible counterpart to the server-side
 * scientific-honesty directive (services/api/src/services/scientificHonesty.js):
 * the model is instructed not to fabricate, over-claim, or give medical advice,
 * and this tells the reader the same thing so the UI never presents AI output
 * as authoritative or clinical.
 *
 * Keep the wording here and nowhere else — a promise copy-pasted across nine
 * screens drifts. `variant` scopes the framing to the surface:
 *   - education: learning explanations, quizzes, tutor chat
 *   - research:  gene/pathway/research tools (not consumer health framing)
 *   - clinical:  chat assistants that touch personal/clinical questions
 *
 * Rendered as a plain styled element (not the ui/alert primitive) so this
 * shared, type-checked component carries no dependency on an untyped forwardRef.
 */
const VARIANTS = {
  education: (
    <>
      <strong className="font-semibold">Educational use only — not medical advice.</strong>{' '}
      AI-generated explanations can be incomplete or wrong. Confirm anything
      important with a qualified clinician or a certified genetic counselor, and
      remember that most traits and conditions are influenced by many genes and
      by environment — a single gene rarely determines an outcome.
    </>
  ),
  research: (
    <>
      <strong className="font-semibold">For research and educational use only — not clinical guidance.</strong>{' '}
      AI-generated results may be incomplete or wrong; treat them as leads to
      verify against primary sources, not conclusions. Do not use them for
      diagnosis or patient care.
    </>
  ),
  clinical: (
    <>
      <strong className="font-semibold">Educational &amp; research use only — not medical advice.</strong>{' '}
      Responses are AI-generated and may be incomplete or wrong. Always confirm
      with a qualified clinician or genetic counselor, and verify any cited
      source before relying on it. Do not make medical decisions based on this.
    </>
  ),
};

export default function MedicalDisclaimer({ variant = 'education', className = '', compact = false }) {
  const body = VARIANTS[variant] || VARIANTS.education;

  return (
    <div
      role="note"
      className={`flex gap-2.5 items-start w-full rounded-lg border border-amber-200 bg-amber-50 text-amber-900 ${
        compact ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'
      } ${className}`}
    >
      <Info className={`shrink-0 text-amber-600 mt-0.5 ${compact ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
      <div className="leading-relaxed">{body}</div>
    </div>
  );
}
