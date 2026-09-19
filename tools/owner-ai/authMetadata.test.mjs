import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { PassThrough, Writable } from 'node:stream'
import { runChild } from './officialCli.mjs'
function fixture(stderr) {
  return () => {
    const child = new EventEmitter()
    child.stdout = new PassThrough(); child.stderr = new PassThrough()
    child.kill = () => { child.emit('close', 1); return true }
    child.stdin = new Writable({ write(_data, _encoding, done) { done() }, final(done) {
      done(); queueMicrotask(() => { child.stderr.end(stderr); child.stdout.end(); child.emit('close', 0) })
    } })
    return child
  }
}
for (const executable of ['codex', '/usr/local/bin/codex', 'codex.exe']) {
  test('explicit authentication metadata includes stderr from ' + executable, async () => {
    assert.equal(await runChild(executable, ['login', 'status'], { env: {}, captureAuthMetadata: true, spawnImpl: fixture('Logged in using ChatGPT\n'), platform: 'linux' }), 'Logged in using ChatGPT\n')
  })
}
test('inference stderr is not returned as model output', async () => {
  assert.equal(await runChild('codex', ['exec', '--json'], { env: {}, input: 'synthetic', captureAuthMetadata: true, spawnImpl: fixture('not response text'), platform: 'linux' }), '')
})
