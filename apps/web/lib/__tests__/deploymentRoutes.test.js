import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import process from 'node:process';

const config = JSON.parse(readFileSync(resolve(process.cwd(), '../../vercel.json'), 'utf8'));

describe('production web-to-API routing', () => {
  it('proxies every API surface used by the published client before the SPA fallback', () => {
    const expected = [
      '/account/:path*',
      '/admin/:path*',
      '/assistants/:path*',
      '/auth/:path*',
      '/billing/:path*',
      '/education/:path*',
      '/entities/:path*',
      '/genomics/:path*',
      '/llm/:path*',
      '/report-client-error',
    ];
    const sources = config.rewrites.map((rewrite) => rewrite.source);
    for (const source of expected) {
      const index = sources.indexOf(source);
      expect(index, `${source} must have a production API proxy`).toBeGreaterThanOrEqual(0);
      expect(config.rewrites[index].destination).toContain('genemap-api-production.up.railway.app');
      expect(index).toBeLessThan(config.rewrites.length - 1);
    }
    expect(config.rewrites.at(-1)?.destination).toBe('/index.html');
  });

  it('does not route local OCR or mobile artifacts into the SPA document', () => {
    const fallback = config.rewrites.at(-1)?.source || '';
    expect(fallback).toContain('assets/');
    expect(fallback).toContain('mobile/');
    expect(fallback).toContain('ocr/');
  });
});
