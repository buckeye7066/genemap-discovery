// Registry of admin-tester functions. Original module missing from the
// repo; we ship an empty registry so pages/FunctionReviewer.jsx renders an
// empty state instead of crashing the whole app at import time. The page
// is admin-only and is not part of any user-facing flow.
export const KNOWN_FUNCTIONS = [];

export function getFunctionById(id) {
  return KNOWN_FUNCTIONS.find((f) => f.id === id) || null;
}

export function getAllCategories() {
  const categories = new Set();
  for (const fn of KNOWN_FUNCTIONS) {
    if (fn?.category) categories.add(fn.category);
  }
  return [...categories];
}

export default { KNOWN_FUNCTIONS, getFunctionById, getAllCategories };
