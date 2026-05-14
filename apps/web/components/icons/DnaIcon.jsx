// Minimal DNA helix icon (the original SVG asset was missing from the repo
// and broke the production build). Visually distinct enough to read as
// "genetics" in headers without pulling in a new icon dependency.
export default function DnaIcon({ className = 'w-6 h-6', ...rest }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      {...rest}
    >
      <path d="M4 3c4 4 12 4 16 0" />
      <path d="M4 9c4 4 12 4 16 0" />
      <path d="M4 15c4 4 12 4 16 0" />
      <path d="M4 21c4-4 12-4 16 0" />
      <path d="M4 3v18" />
      <path d="M20 3v18" />
    </svg>
  );
}
