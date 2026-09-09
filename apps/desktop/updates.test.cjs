const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createDesktopUpdater } = require('./updates.cjs');
function setup(responses, options = {}) {
  const app = new EventEmitter();
  app.isPackaged = true;
  app.getVersion = () => '1.1.1';
  const updater = new EventEmitter();
  let downloads = 0, installs = 0;
  updater.checkForUpdates = async () => ({ isUpdateAvailable: true, updateInfo: { version: '1.1.2' } });
  updater.downloadUpdate = async () => { downloads++; if (options.badDownload) throw new Error('hash mismatch'); };
  updater.quitAndInstall = () => { installs++; };
  const messages = [];
  const controller = createDesktopUpdater({ app, autoUpdater: updater, getWindow: () => null,
    dialog: { showMessageBox: async (message) => { messages.push(message); return { response: responses.shift() ?? 1 }; } } });
  return { controller, updater, messages, counts: () => ({ downloads, installs }) };
}
test('background detection waits for Update and Later never downloads', async () => {
  const s = setup([1]); await s.controller.check();
  assert.deepEqual(s.counts(), { downloads: 0, installs: 0 });
  assert.equal(s.updater.autoDownload, false);
  assert.equal(s.updater.autoInstallOnAppQuit, false);
  await s.controller.check(); assert.equal(s.messages.length, 1);
});
test('download and restart require separate explicit choices', async () => {
  const s = setup([0, 1, 0]); await s.controller.check();
  assert.deepEqual(s.counts(), { downloads: 1, installs: 0 });
  await s.controller.check(true);
  assert.deepEqual(s.counts(), { downloads: 1, installs: 1 });
});
test('failed integrity/download never offers install and remains retryable', async () => {
  const s = setup([0, 1, 0, 1], { badDownload: true });
  await s.controller.check(); await s.controller.check(true);
  assert.deepEqual(s.counts(), { downloads: 2, installs: 0 });
  assert.equal(s.messages.filter(x => x.title === 'Update ready').length, 0);
});
