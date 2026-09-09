import test from 'node:test';
import assert from 'node:assert/strict';
import { canPublishDesktopHead, releaseHeadIsSafe } from '../verify-desktop-release-head.mjs';

const anchor = { filename: 'ops/closure-ledger/anchors/chain-anchors.jsonl', status: 'modified' };
const safe = { status: 'ahead', ahead_by: 1, behind_by: 0, files: [anchor] };

test('allows the current tested commit without an API comparison', () => {
  const sha = 'a'.repeat(40);
  assert.equal(canPublishDesktopHead('buckeye7066/genemap-discovery', sha, sha, () => assert.fail('unnecessary API call')), true);
});
test('allows only an ancestor with a modified closure anchor and unchanged application source', () => {
  assert.equal(releaseHeadIsSafe(safe), true);
  for (const comparison of [null, {}, { ...safe, status: 'diverged' }, { ...safe, behind_by: 1 },
    { ...safe, ahead_by: 0 }, { ...safe, files: [] }, { ...safe, files: [{ ...anchor, status: 'renamed' }] },
    { ...safe, files: [{ filename: 'apps/desktop/main.cjs', status: 'modified' }] },
    { ...safe, files: [anchor, { filename: 'package.json', status: 'modified' }] }]) {
    assert.equal(releaseHeadIsSafe(comparison), false);
  }
});
test('compares immutable tested and current commits; rejects invalid inputs', () => {
  const tested = 'a'.repeat(40), current = 'b'.repeat(40);
  assert.equal(canPublishDesktopHead('buckeye7066/genemap-discovery', tested, current, (repo, base, head) => {
    assert.equal(repo, 'buckeye7066/genemap-discovery'); assert.equal(base, tested); assert.equal(head, current); return safe;
  }), true);
  assert.throws(() => canPublishDesktopHead('../repo', tested, current, () => safe));
  assert.throws(() => canPublishDesktopHead('owner/repo', 'main', current, () => safe));
  assert.throws(() => canPublishDesktopHead('owner/repo', tested, current, () => { throw new Error('API unavailable'); }), /API unavailable/);
});
