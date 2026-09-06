import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../../public/service-worker.js', import.meta.url), 'utf8');
function worker({ network = async () => new Response('online'), stored = new Map(), storageFails = false } = {}) {
  const handlers = {};
  const deleted = [];
  const puts = [];
  const cache = {
    addAll: async () => {},
    match: async (key) => stored.get(typeof key === 'string' ? key : key.url)?.clone(),
    put: async (key, response) => {
      if (storageFails) throw new Error('quota');
      puts.push(typeof key === 'string' ? key : key.url);
      stored.set(typeof key === 'string' ? key : key.url, response);
    },
  };
  runInNewContext(source, {
    URL, Response, fetch: network,
    caches: {
      open: async () => cache,
      keys: async () => ['genemap-v1', 'genemap-shell-v2', 'unrelated-app'],
      delete: async (key) => { deleted.push(key); },
    },
    self: {
      location: { origin: 'https://genemap.test' },
      addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {}, clients: { claim: async () => {} },
    },
  });
  return {
    puts, deleted,
    async activate() { let work; handlers.activate({ waitUntil: (promise) => { work = promise; } }); await work; },
    async request(path = '/search', mode = 'navigate', method = 'GET') {
      let response;
      handlers.fetch({
        request: { url: path.startsWith('http') ? path : `https://genemap.test${path}`, mode, method },
        respondWith: (promise) => { response = promise; },
      });
      return response ? await response : null;
    },
  };
}

test('offline /search navigation recovers the public app shell', async () => {
  const app = worker({ network: async () => { throw new Error('offline'); }, stored: new Map([
    ['/index.html', new Response('<html>GeneMap</html>', { headers: { 'Content-Type': 'text/html' } })],
  ]) });
  const response = await app.request();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /GeneMap/);
});

test('transient navigation 503 can recover a cached shell, not a blank error', async () => {
  const app = worker({ network: async () => new Response('unavailable', { status: 503 }), stored: new Map([
    ['/index.html', new Response('cached shell')],
  ]) });
  assert.equal(await (await app.request()).text(), 'cached shell');
});

test('cross-origin Railway and same-origin API/health-data requests are never intercepted', async () => {
  const app = worker({ network: () => assert.fail('must use the browser network directly') });
  for (const path of ['https://api.test/genomics/publication-concepts/search', '/api/search', '/entities/medical-data', '/genomics/enrich', '/llm/invoke', '/auth/me', '/education/explain', '/assistants/robert/chat']) {
    assert.equal(await app.request(path, 'cors'), null);
  }
});

test('only public navigation and asset responses can enter the cache', async () => {
  const app = worker({ network: async () => new Response('<html>shell</html>', { headers: { 'Content-Type': 'text/html' } }) });
  await app.request('/search?query=example');
  assert.deepEqual(app.puts, ['/index.html']);
  assert.equal(await app.request('/private-data', 'cors'), null);
  assert.equal(await app.request('/search', 'navigate', 'POST'), null);
});

test('cache write failures do not replace successful network responses', async () => {
  const app = worker({ storageFails: true, network: async () => new Response('good', { headers: { 'Content-Type': 'text/html' } }) });
  assert.equal(await (await app.request()).text(), 'good');
});

test('an uncached offline navigation shows honest recovery instructions and a retry link', async () => {
  const app = worker({ network: async () => { throw new Error('offline'); } });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.match(await response.text(), /Try again/);
});

test('real HTTP failures without a cached shell retain their original status/body', async () => {
  const app = worker({ network: async () => new Response('real upstream error', { status: 503 }) });
  const response = await app.request();
  assert.equal(response.status, 503);
  assert.equal(await response.text(), 'real upstream error');
});

test('activation retires only old GeneMap caches, not another app cache', async () => {
  const app = worker();
  await app.activate();
  assert.deepEqual(app.deleted, ['genemap-v1']);
});
