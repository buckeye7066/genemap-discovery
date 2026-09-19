import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const script=fileURLToPath(new URL('./manage.ps1',import.meta.url));
test('installer never overwrites PowerShell automatic HOME',()=>{
  assert.doesNotMatch(readFileSync(script,'utf8'),/\$home\s*=/i);
});
test('Windows installer validates the origin before any task or credential changes',{skip:process.platform!=='win32'},()=>{
  const p=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',script,'-Action','Install','-Url','http://example.invalid','-CodexHome','C:\\OwnerFixture'],{encoding:'utf8',windowsHide:true,timeout:10000});
  assert.notEqual(p.status,0);assert.match(p.stdout+p.stderr,/HTTPS origin is required/);
  assert.doesNotMatch(p.stdout+p.stderr,/Cannot overwrite variable HOME/);
});

test('installed task uses a stable runtime copy, not a disposable Git worktree',()=>{
  const source=readFileSync(script,'utf8');
  assert.match(source,/Join-Path \$bridgeHome 'manage\.ps1'/);
  assert.match(source,/Copy-Item/);
});
