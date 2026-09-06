import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { once } from 'node:events'
import { test } from 'node:test'
import { localOcrData, resolveWebPort } from '../vite.runtime.mjs'

test('UI port preserves the default and accepts an explicit isolated port', () => {
  assert.equal(resolveWebPort({}), 5173)
  assert.equal(resolveWebPort({ VITE_PORT: '' }), 5173)
  assert.equal(resolveWebPort({ VITE_PORT: '45202' }), 45202)
})

test('invalid UI ports fail before launching or probing an unrelated service', () => {
  for (const VITE_PORT of ['0', '-1', '65536', '1.5', '3000junk', '0x1000', ' ', 'NaN']) {
    assert.throws(() => resolveWebPort({ VITE_PORT }), /VITE_PORT/)
  }
})

test('OCR emits its exact packaged bytes only from a build-only hook', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'genemap-vite-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'eng.traineddata.gz')
  const bytes = Buffer.from([31, 139, 8, 0, 1, 2, 3])
  writeFileSync(file, bytes)
  const plugin = localOcrData(file)
  assert.equal(plugin.buildStart, undefined, 'Vite dev calls buildStart without emitFile support')
  let emitted
  plugin.generateBundle.call({ emitFile(asset) { emitted = asset } })
  assert.equal(emitted.type, 'asset')
  assert.equal(emitted.fileName, 'ocr/eng.traineddata.gz')
  assert.deepEqual(emitted.source, bytes)
})

async function servePlugin(t, file) {
  let handler
  localOcrData(file).configureServer({ middlewares: { use(fn) { handler = fn } } })
  const server = createServer((req, res) => handler(req, res, () => {
    res.statusCode = 404
    res.end('next')
  }))
  t.after(async () => {
    server.closeAllConnections()
    await new Promise((resolve) => server.close(resolve))
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  return `http://127.0.0.1:${server.address().port}`
}

test('dev serves local OCR bytes and delegates unrelated requests', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'genemap-vite-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const file = join(dir, 'eng.traineddata.gz')
  const bytes = Buffer.from([31, 139, 8, 0, 1, 2, 3])
  writeFileSync(file, bytes)
  const base = await servePlugin(t, file)
  const response = await fetch(`${base}/ocr/eng.traineddata.gz?v=1`)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('content-type'), 'application/gzip')
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes)
  assert.equal((await fetch(`${base}/other`)).status, 404)
})

test('missing dev OCR data returns an explicit error instead of crashing the server', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'genemap-vite-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const base = await servePlugin(t, join(dir, 'missing.gz'))
  const response = await fetch(`${base}/ocr/eng.traineddata.gz`)
  assert.equal(response.status, 500)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(await response.text(), 'Local OCR data unavailable')
  assert.equal((await fetch(`${base}/other`)).status, 404)
})

test('Vite config uses the tested OCR lifecycle and port resolver', () => {
  const source = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')
  assert.match(source, /import\s*\{\s*localOcrData,\s*resolveWebPort\s*\}\s*from\s*['"]\.\/vite\.runtime\.mjs['"]/)
  assert.match(source, /localOcrData\(englishTessdata\)/)
  assert.match(source, /port:\s*resolveWebPort\(process\.env\)/)
  assert.doesNotMatch(source, /buildStart\s*\(/)
})
