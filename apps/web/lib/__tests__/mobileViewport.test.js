import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
const css = readFileSync(resolve(process.cwd(), 'index.css'), 'utf8');

describe('mobile viewport contract', () => {
  it('preserves pinch zoom, safe areas, and dynamic Safari viewport height', () => {
    expect(html).toContain('viewport-fit=cover');
    expect(html).not.toMatch(/maximum-scale|user-scalable\s*=\s*no/i);
    expect(css).toContain('min-height: 100dvh');
  });
});
