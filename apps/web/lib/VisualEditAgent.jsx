// Dev-only visual editor agent. App.jsx already gates the import behind
// `import.meta.env.DEV`, but Vite must still be able to resolve the path
// during the production build. Shipping a no-op default export keeps the
// production bundle small (this module is never executed in production)
// while satisfying the static analyzer.
export default function VisualEditAgent() {
  return null;
}
