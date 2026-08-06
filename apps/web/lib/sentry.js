/**
 * External browser exception export is disabled in the education/research
 * publication build. Error objects, messages, and stacks can contain user text.
 */
export function initSentry() {
  return false;
}

export function captureException() {
  // Intentionally disabled.
}
