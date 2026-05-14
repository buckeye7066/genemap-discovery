// Tiny `cn` (className merge) used by the UI primitives. The previous repo
// referenced @/lib/utils from many components but the file was missing,
// breaking the production Vite build.
//
// We avoid pulling in `clsx` + `tailwind-merge` here so the runtime stays
// dependency-free; UI components don't rely on tailwind-merge's
// duplicate-class resolution today.
export function cn(...inputs) {
  const out = [];
  for (const input of inputs) {
    if (!input) continue;
    if (typeof input === 'string' || typeof input === 'number') {
      out.push(String(input));
    } else if (Array.isArray(input)) {
      const inner = cn(...input);
      if (inner) out.push(inner);
    } else if (typeof input === 'object') {
      for (const [k, v] of Object.entries(input)) {
        if (v) out.push(k);
      }
    }
  }
  return out.join(' ');
}
