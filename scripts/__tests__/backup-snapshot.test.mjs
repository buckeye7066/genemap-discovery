import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const scriptPath = path.join(repoRoot, 'scripts', 'backup-snapshot.sh');
const backupDir = path.join(repoRoot, 'backups');

function artifacts() {
  if (!existsSync(backupDir)) return new Set();
  return new Set(
    readdirSync(backupDir)
      .filter((name) => name.startsWith('genemap-backup-'))
      .map((name) => path.join(backupDir, name)),
  );
}

function removeNewArtifacts(before) {
  for (const file of artifacts()) {
    if (!before.has(file)) rmSync(file, { force: true });
  }
}

function runBackup(overrides = {}) {
  const env = { ...process.env };
  for (const key of ['DATABASE_URL', 'BACKUP_CODE_ONLY', 'BACKUP_AGE_RECIPIENT', 'DRIVE_DIR']) {
    delete env[key];
  }
  Object.assign(env, overrides);
  return spawnSync('bash', [scriptPath], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
}

describe('backup snapshot fail-closed contract', { concurrency: false }, () => {
  it('requires an explicit database or code-only mode and emits no artifact on refusal', () => {
    const before = artifacts();
    try {
      const result = runBackup();
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /DATABASE_URL is not set/u);
      assert.deepEqual(artifacts(), before);
    } finally {
      removeNewArtifacts(before);
    }
  });

  it('archives tracked HEAD only in explicit code-only mode', () => {
    const before = artifacts();
    const sentinel = path.join(repoRoot, `backup-test-untracked-${process.pid}.txt`);
    writeFileSync(sentinel, 'must not enter backup\n', { mode: 0o600 });

    try {
      const result = runBackup({ BACKUP_CODE_ONLY: 'true' });
      assert.equal(result.status, 0, result.stderr || result.stdout);

      const created = [...artifacts()].filter((file) => !before.has(file));
      const archive = created.find((file) => file.endsWith('.tar.gz'));
      assert.ok(archive, `expected a code-only tar.gz; created: ${created.join(', ')}`);
      assert.ok(created.includes(`${archive}.sha256`));
      assert.equal(statSync(archive).mode & 0o777, 0o600);

      const listing = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' });
      assert.ok(!listing.includes(path.basename(sentinel)), 'untracked sentinel reached backup');
      assert.ok(listing.includes('backup-info.txt'));
    } finally {
      rmSync(sentinel, { force: true });
      removeNewArtifacts(before);
    }
  });

  it('emits no final artifact when pg_dump fails', () => {
    const before = artifacts();
    const fakeBin = mkdtempSync(path.join(tmpdir(), 'genemap-backup-test-'));
    const pgDump = path.join(fakeBin, 'pg_dump');
    const age = path.join(fakeBin, 'age');

    writeFileSync(pgDump, '#!/usr/bin/env bash\nexit 17\n');
    writeFileSync(age, `#!/usr/bin/env bash
out=""
while ((\$#)); do
  if [[ "\$1" == "--output" ]]; then out="\$2"; shift 2; else shift; fi
done
if [[ -n "\$out" ]]; then cat > "\$out"; else cat; fi
`);
    chmodSync(pgDump, 0o700);
    chmodSync(age, 0o700);

    try {
      const result = runBackup({
        DATABASE_URL: 'postgresql://backup.invalid/db',
        BACKUP_AGE_RECIPIENT: 'age1testrecipient',
        PATH: `${fakeBin}:${process.env.PATH || ''}`,
      });
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /database dump or encryption failed/u);
      assert.deepEqual(artifacts(), before);
    } finally {
      rmSync(fakeBin, { recursive: true, force: true });
      removeNewArtifacts(before);
    }
  });
});
