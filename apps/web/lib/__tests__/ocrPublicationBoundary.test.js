import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('production OCR publication boundary', () => {
  it('uses only application-hosted worker, core, and language assets', () => {
    const parser = read('../healthDocumentParser.js');
    const vite = read('../../vite.config.js');

    expect(parser).toContain("import('tesseract.js/dist/worker.min.js?url')");
    expect(parser).toContain("import('tesseract.js-core/tesseract-core-lstm.wasm.js?url')");
    expect(parser).toContain('workerBlobURL: false');
    expect(parser).toContain("new URL('/ocr', window.location.origin)");
    expect(parser).not.toMatch(/https?:\/\/(?:cdn\.jsdelivr\.net|unpkg\.com)/u);

    expect(vite).toContain("'4.0.0_best_int', 'eng.traineddata.gz'");
    expect(vite).toContain("const publicPath = '/ocr/eng.traineddata.gz'");
    expect(vite).toContain('this.emitFile({');
  });

  it('keeps the production CSP same-origin while permitting local OCR execution', () => {
    const vercel = JSON.parse(read('../../../../vercel.json'));
    const headers = vercel.headers.flatMap((entry) => entry.headers || []);
    const csp = headers.find((header) => header.key === 'Content-Security-Policy')?.value || '';

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).not.toContain('cdn.jsdelivr.net');
    expect(csp).not.toContain('unpkg.com');

    const assistantProxy = vercel.rewrites.find(
      (rewrite) => rewrite.source === '/assistants/:assistantType/chat',
    );
    expect(assistantProxy?.destination).toContain('/assistants/:assistantType/chat');
    const spaFallback = vercel.rewrites.at(-1)?.source || '';
    expect(spaFallback).toContain('ocr/');
    expect(spaFallback).toContain('mobile/');
  });
});
