import { isCanonicalPublicationArtifact } from '@genemap/shared/publicationStatus';

export function reusablePublicationArtifact(raw) {
  const artifact = raw && typeof raw === 'object' ? raw.publication : null;
  const canUseContent = Boolean(
    isCanonicalPublicationArtifact(artifact)
    && (artifact.status === 'available' || artifact.status === 'partial')
  );
  return canUseContent ? artifact : null;
}

/**
 * Robustly extract a JSON value from a raw LLM completion (browser side).
 *
 * Mirrors the backend helper in services/api/src/services/llm.js. Every search
 * call-site used to inline `JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}')`,
 * which silently returns `{}` (→ "0 candidate genes", empty summaries, etc.)
 * the moment the model wraps its JSON in ```json fences or adds a sentence of
 * prose. Centralizing the handling fixes all of those at once:
 *   1. strip Markdown code fences,
 *   2. extract the first balanced {...} / [...] block (ignoring surrounding prose),
 *   3. parse without throwing.
 *
 * @param {*} raw - the API response carrying a canonical publication envelope.
 * @param {*} [fallback={}] - returned when parsing fails.
 */
export function parseLLMJson(raw, fallback = {}) {
  const artifact = reusablePublicationArtifact(raw);
  if (!artifact) return fallback;
  const value = artifact.content;

  if (value && typeof value === 'object') return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;

  let text = value.trim();

  // Drop ```json ... ``` (or plain ```) fences if present.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();

  // Grab the first {...} or [...] block so leading/trailing prose can't break parse.
  const block = text.match(/[[{][\s\S]*[\]}]/);
  const candidate = block ? block[0] : text;

  try {
    return JSON.parse(candidate);
  } catch {
    return fallback;
  }
}
