import React from 'react';
import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const REUSABLE_STATUSES = new Set(['available', 'partial']);
const PUBLICATION_STATUSES = new Set([
  'available',
  'partial',
  'withheld',
  'unavailable',
  'superseded',
]);
const CORRELATION_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
const REASON_CODE = /^[a-z0-9][a-z0-9_.-]{0,63}$/u;

export function isCanonicalPublicationArtifact(artifact) {
  if (!artifact || typeof artifact !== 'object') return false;
  if (artifact.contractVersion !== 1 || !PUBLICATION_STATUSES.has(artifact.status)) return false;
  if (!Object.prototype.hasOwnProperty.call(artifact, 'content')) return false;
  if (typeof artifact.correlationId !== 'string' || !CORRELATION_ID.test(artifact.correlationId)) return false;
  if (artifact.reasonCode !== null && (
    typeof artifact.reasonCode !== 'string'
    || !REASON_CODE.test(artifact.reasonCode)
  )) return false;
  if (artifact.status !== 'available' && artifact.reasonCode === null) return false;
  if (!Array.isArray(artifact.limitations) || !artifact.limitations.every((item) => (
    typeof item === 'string'
    && item.length > 0
    && item === item.trim()
  )) || new Set(artifact.limitations).size !== artifact.limitations.length) return false;

  if (REUSABLE_STATUSES.has(artifact.status)) {
    if (artifact.content === null || artifact.content === undefined) return false;
    return artifact.status !== 'partial' || artifact.limitations.length > 0;
  }
  return artifact.content === null;
}

/**
 * Treat the publication envelope as the authority for generated content.
 * Legacy aliases such as `result`, `response`, or `explanation` are never a
 * fallback: without a valid reusable envelope, generated content stays hidden.
 */
export function hasReusablePublicationContent(artifact) {
  return Boolean(
    isCanonicalPublicationArtifact(artifact)
    && REUSABLE_STATUSES.has(artifact.status)
  );
}

export function publicationContent(artifact) {
  return hasReusablePublicationContent(artifact) ? artifact.content : null;
}

export function enforcePublicationContentType(
  artifact,
  acceptsContent,
  reasonCode = 'invalid_publication_content',
) {
  if (!artifact || typeof artifact !== 'object') return null;
  if (isCanonicalPublicationArtifact(artifact) && !REUSABLE_STATUSES.has(artifact.status)) return artifact;
  if (hasReusablePublicationContent(artifact) && acceptsContent(artifact.content)) return artifact;
  return {
    contractVersion: 1,
    status: 'unavailable',
    content: null,
    reasonCode,
    correlationId: typeof artifact.correlationId === 'string' && CORRELATION_ID.test(artifact.correlationId)
      ? artifact.correlationId
      : 'client-invalid-publication',
    limitations: [],
  };
}

function statusCopy(status) {
  if (status === 'partial') {
    return {
      label: 'Partial publication',
      detail: 'This generated material is incomplete. Review the limitations before using it.',
      className: 'border-amber-200 bg-amber-50 text-amber-950',
      Icon: Info,
    };
  }
  if (status === 'withheld') {
    return {
      label: 'Publication withheld',
      detail: 'Generated material crossed the publication boundary and was not shown.',
      className: 'border-red-200 bg-red-50 text-red-950',
      Icon: AlertCircle,
    };
  }
  if (status === 'superseded') {
    return {
      label: 'Publication superseded',
      detail: 'This older generated artifact is no longer reusable and was not shown.',
      className: 'border-slate-300 bg-slate-50 text-slate-800',
      Icon: Info,
    };
  }
  if (status === 'unavailable') {
    return {
      label: 'Publication unavailable',
      detail: 'No reusable generated material is available for this request.',
      className: 'border-slate-300 bg-slate-50 text-slate-800',
      Icon: AlertCircle,
    };
  }
  if (status === 'available') {
    return {
      label: 'Publication available',
      detail: 'This generated material passed the publication boundary.',
      className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
      Icon: CheckCircle2,
    };
  }
  return {
    label: 'Publication status invalid',
    detail: 'The publication envelope was not recognized, so generated material was not shown.',
    className: 'border-red-200 bg-red-50 text-red-950',
    Icon: AlertCircle,
  };
}

export default function PublicationState({ artifact, className = '', showAvailable = false }) {
  if (!artifact || typeof artifact !== 'object') return null;
  const canonical = isCanonicalPublicationArtifact(artifact);
  const reusable = hasReusablePublicationContent(artifact);
  if (artifact.status === 'available' && reusable && !showAvailable) return null;

  const displayStatus = canonical ? artifact.status : 'invalid';
  const copy = statusCopy(displayStatus);
  const limitations = canonical ? artifact.limitations : [];
  const Icon = copy.Icon;

  return (
    <div
      className={`rounded-md border px-3 py-2 text-sm ${copy.className} ${className}`.trim()}
      role={['available', 'partial', 'superseded'].includes(displayStatus) ? 'status' : 'alert'}
      data-publication-status={artifact.status || 'unknown'}
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold">{copy.label}</p>
          <p className="mt-0.5 text-xs opacity-90">{copy.detail}</p>
          {canonical && ['withheld', 'unavailable', 'superseded'].includes(artifact.status) && (
            <p className="mt-1 text-xs">Support ID: <code>{artifact.correlationId}</code></p>
          )}
          {limitations.length > 0 && (
            <div className="mt-2">
              <p className="text-xs font-semibold">Limitations</p>
              <ul className="ml-4 mt-1 list-disc space-y-1 text-xs">
                {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
