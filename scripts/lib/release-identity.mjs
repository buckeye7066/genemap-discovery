export const RELEASE_SHA_PATTERN = /^[a-f0-9]{40}$/u;

const VOID_ELEMENTS = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
  'link', 'meta', 'param', 'source', 'track', 'wbr',
]);

function readTagAt(html, start) {
  let quote = null;
  for (let index = start + 1; index < html.length; index += 1) {
    const char = html[index];
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') {
      return {
        raw: html.slice(start, index + 1),
        nextIndex: index + 1,
      };
    }
  }
  return null;
}

function parseAttributes(source, startIndex) {
  const attributes = new Map();
  let index = startIndex;

  while (index < source.length) {
    while (/\s/u.test(source[index] || '')) index += 1;
    if (index >= source.length || source[index] === '/') break;

    const nameStart = index;
    while (
      index < source.length
      && !/[\s=]/u.test(source[index])
      && source[index] !== '/'
    ) {
      index += 1;
    }
    const name = source.slice(nameStart, index).toLowerCase();
    if (!name || attributes.has(name)) return { valid: false, attributes };

    while (/\s/u.test(source[index] || '')) index += 1;
    let value = '';
    if (source[index] === '=') {
      index += 1;
      while (/\s/u.test(source[index] || '')) index += 1;
      const quote = source[index];
      if (quote === '"' || quote === "'") {
        index += 1;
        const valueStart = index;
        while (index < source.length && source[index] !== quote) index += 1;
        if (index >= source.length) return { valid: false, attributes };
        value = source.slice(valueStart, index);
        index += 1;
      } else {
        const valueStart = index;
        while (
          index < source.length
          && !/\s/u.test(source[index])
          && source[index] !== '/'
        ) {
          index += 1;
        }
        value = source.slice(valueStart, index);
      }
    }
    attributes.set(name, value);
  }

  return { valid: true, attributes };
}

function parseTag(raw) {
  let source = raw.slice(1, -1).trim();
  if (!source || source.startsWith('!') || source.startsWith('?')) {
    return { kind: 'declaration' };
  }

  const closing = source.startsWith('/');
  if (closing) source = source.slice(1).trimStart();
  const nameMatch = source.match(/^[A-Za-z][A-Za-z0-9:-]*/u);
  if (!nameMatch) return { kind: 'invalid' };

  const name = nameMatch[0].toLowerCase();
  if (closing) return { kind: 'tag', closing: true, name };

  const selfClosing = /\/\s*$/u.test(source);
  const parsed = parseAttributes(source, nameMatch[0].length);
  return {
    kind: 'tag',
    closing: false,
    selfClosing,
    name,
    validAttributes: parsed.valid,
    attributes: parsed.attributes,
  };
}

/**
 * Read the one active release marker from the actual document head.
 *
 * This deliberately implements only the small fail-closed subset needed for
 * the generated Vite shell: comments are skipped, tag ends honor quoted
 * attributes, nested/inert markup cannot contribute a marker, duplicate
 * attributes are rejected, and exactly one explicit head is required.
 */
export function extractWebReleaseSha(html) {
  if (typeof html !== 'string') return null;

  let index = 0;
  let htmlCount = 0;
  let headCount = 0;
  let inHead = false;
  const stack = [];
  const candidates = [];

  while (index < html.length) {
    const open = html.indexOf('<', index);
    if (open === -1) break;

    if (html.startsWith('<!--', open)) {
      const commentEnd = html.indexOf('-->', open + 4);
      if (commentEnd === -1) return null;
      index = commentEnd + 3;
      continue;
    }

    const token = readTagAt(html, open);
    if (!token) return null;
    index = token.nextIndex;
    const tag = parseTag(token.raw);
    if (tag.kind === 'declaration') continue;
    if (tag.kind !== 'tag') return null;

    if (tag.closing) {
      if (stack.length === 0 || stack.at(-1) !== tag.name) return null;
      stack.pop();
      if (tag.name === 'head') inHead = false;
      continue;
    }

    if (tag.name === 'html') {
      if (htmlCount !== 0 || tag.selfClosing || stack.length !== 0) return null;
      htmlCount = 1;
      stack.push('html');
      continue;
    }

    // No element may appear outside the one explicit html root.
    if (stack.length === 0) return null;

    if (tag.name === 'head') {
      // The generated shell must have one explicit head directly under html.
      // A head-shaped string in body/script or a browser-invalid body/head
      // sequence is never accepted as release evidence.
      if (
        headCount !== 0
        || tag.selfClosing
        || stack.length !== 1
        || stack[0] !== 'html'
      ) {
        return null;
      }
      headCount = 1;
      inHead = true;
      stack.push('head');
      continue;
    }

    if (tag.name === 'meta' && inHead && stack.at(-1) === 'head') {
      if (!tag.validAttributes) return null;
      if ((tag.attributes.get('name') || '').toLowerCase() === 'genemap-release-sha') {
        candidates.push(tag.attributes.get('content') || '');
      }
    }

    if (!tag.selfClosing && !VOID_ELEMENTS.has(tag.name)) {
      stack.push(tag.name);
    }
  }

  if (htmlCount !== 1 || headCount !== 1 || inHead || stack.length !== 0) return null;
  if (candidates.length !== 1) return null;
  return RELEASE_SHA_PATTERN.test(candidates[0]) ? candidates[0] : null;
}
