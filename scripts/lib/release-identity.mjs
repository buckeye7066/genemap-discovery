export const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;

function parseAttributes(tag) {
  const attributes = new Map();
  const source = tag.replace(/^<meta\b|\/?\s*>$/giu, '');
  const pattern = /([^\s"'=<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>]+)))?/gu;
  for (const match of source.matchAll(pattern)) {
    attributes.set(
      match[1].toLowerCase(),
      match[2] ?? match[3] ?? match[4] ?? ''
    );
  }
  return attributes;
}

/**
 * Read the one active release marker from the actual document head.
 * Comments and inert/scripted text are removed before meta elements are
 * considered, and duplicate markers fail closed.
 */
export function extractWebReleaseSha(html) {
  if (typeof html !== 'string') return null;
  const uncommented = html.replace(/<!--[\s\S]*?-->/gu, '');
  const heads = [...uncommented.matchAll(/<head\b[^>]*>([\s\S]*?)<\/head\s*>/giu)];
  if (heads.length !== 1) return null;

  const activeHead = heads[0][1].replace(
    /<(?:script|style|template|noscript)\b[^>]*>[\s\S]*?<\/(?:script|style|template|noscript)\s*>/giu,
    ''
  );
  const candidates = [];
  for (const match of activeHead.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = parseAttributes(match[0]);
    if ((attributes.get('name') || '').toLowerCase() === 'genemap-release-sha') {
      candidates.push(attributes.get('content') || '');
    }
  }

  if (candidates.length !== 1) return null;
  return RELEASE_SHA_PATTERN.test(candidates[0]) ? candidates[0] : null;
}
