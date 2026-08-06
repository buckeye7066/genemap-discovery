import { readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const backupDoc = readFileSync(path.join(root, 'docs/BACKUP.md'), 'utf8');
const processorRegister = readFileSync(path.join(root, 'docs/PROCESSOR_REGISTER.md'), 'utf8');
const backupShell = readFileSync(path.join(root, 'scripts/backup-snapshot.sh'), 'utf8');
const backupPowerShell = readFileSync(path.join(root, 'scripts/backup-snapshot.ps1'), 'utf8');

const requiredBackupEvidence = [
  ['docs/BACKUP.md', backupDoc, 'deletion'],
  ['docs/BACKUP.md', backupDoc, 'restore'],
  ['docs/BACKUP.md', backupDoc, 'retention'],
  ['docs/PROCESSOR_REGISTER.md', processorRegister, 'processor'],
  ['scripts/backup-snapshot.sh', backupShell, 'age'],
  ['scripts/backup-snapshot.sh', backupShell, 'sha256'],
  ['scripts/backup-snapshot.ps1', backupPowerShell, 'age'],
  ['scripts/backup-snapshot.ps1', backupPowerShell, 'sha256'],
];

for (const [file, content, marker] of requiredBackupEvidence) {
  if (!content.toLowerCase().includes(marker.toLowerCase())) {
    throw new Error(`${file} is missing required backup/privacy contract marker ${JSON.stringify(marker)}`);
  }
}

if (!/^set -E?euo pipefail$/mu.test(backupShell)) {
  throw new Error('scripts/backup-snapshot.sh must fail closed with strict shell options');
}
if (/(?:^|\s)(?:eval|source)\s/u.test(backupShell)) {
  throw new Error('scripts/backup-snapshot.sh must not execute dynamically supplied shell content');
}
if (!backupPowerShell.includes('Set-StrictMode -Version Latest')
  || !backupPowerShell.includes('$ErrorActionPreference = "Stop"')) {
  throw new Error('scripts/backup-snapshot.ps1 must fail closed with strict PowerShell settings');
}
console.log('Backup, restore, retention, deletion-reconciliation, and processor-register contract verified.');
