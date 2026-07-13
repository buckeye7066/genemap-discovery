/**
 * Single source of truth for LLM *input* size ceilings.
 *
 * These bound cost / DoS — NOT model capability. The default text model
 * (gpt-4o-mini) accepts ~128k tokens of context and Claude ~200k, so a
 * 200,000-character prompt (~50k tokens) leaves ample headroom for the
 * context-enriched prompts the app legitimately builds (patient medical data,
 * cohort statistics, VCF-derived summaries, multi-turn tutor history) while
 * still rejecting a runaway multi-megabyte paste.
 *
 * The previous 24,000-character ceiling (~6k tokens) was far below what these
 * enriched prompts need: a user could type a two-line question yet still be
 * rejected because the component prepended their genomic/medical context.
 *
 * Every value is overridable per-deployment via an env var so operators can
 * retune without a code change. Import these everywhere an LLM input is
 * validated so the limit can never silently diverge between routes again.
 */

function positiveIntFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

// Max characters for a single-prompt completion (/llm/invoke, /llm/image).
export const MAX_PROMPT_CHARS = positiveIntFromEnv('LLM_MAX_PROMPT_CHARS', 200_000);

// Max characters for any one message in a chat array (/llm/chat, /education/chat).
export const MAX_MESSAGE_CHARS = positiveIntFromEnv('LLM_MAX_MESSAGE_CHARS', 200_000);

// Max number of turns in a chat array.
export const MAX_CHAT_MESSAGES = positiveIntFromEnv('LLM_MAX_CHAT_MESSAGES', 50);

export default { MAX_PROMPT_CHARS, MAX_MESSAGE_CHARS, MAX_CHAT_MESSAGES };
