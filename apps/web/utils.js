// Build a router-friendly URL for a page name. The original module was
// missing from the repo. Page names live in pages.config.js and are routed
// at lower-case paths (see App.jsx).
export function createPageUrl(name) {
  if (!name) return '/';
  return `/${String(name).toLowerCase()}`;
}
