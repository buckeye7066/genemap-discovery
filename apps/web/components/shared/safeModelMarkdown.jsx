import React from 'react';

/**
 * Render model-authored Markdown without allowing links or images to become
 * browser navigation or network-request surfaces. The server already strips
 * link-capable syntax; these renderers are a defense-in-depth publication lock.
 */
export const safeModelMarkdownComponents = Object.freeze({
  a: ({ children }) => <span>{children}</span>,
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
});
