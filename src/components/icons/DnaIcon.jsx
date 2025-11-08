import React from 'react';

/**
 * A custom DNA strand icon component using SVG.
 * It accepts a className prop to allow for styling.
 */
export default function DnaIcon({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M14.5 3.5C17.5 6.5 17.5 11.5 14.5 14.5" />
      <path d="M9.5 9.5C6.5 12.5 6.5 17.5 9.5 20.5" />
      <path d="M9.5 3.5C6.5 6.5 6.5 11.5 9.5 14.5" />
      <path d="M14.5 9.5C17.5 12.5 17.5 17.5 14.5 20.5" />
      <path d="M7 7.5L17 7.5" />
      <path d="M7 16.5L17 16.5" />
      <path d="M10.5 3L13.5 3" />
      <path d="M10.5 21L13.5 21" />
    </svg>
  );
}