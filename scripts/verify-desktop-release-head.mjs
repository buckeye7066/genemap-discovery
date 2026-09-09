import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const anchor = 'ops/closure-ledger/anchors/chain-anchors.jsonl';

/** Only the automated anchor record may follow the tested installer source. */
export function releaseHeadIsSafe(comparison) {
  return comparison?.status === 'ahead' &&
    comparison.ahead_by > 0 && comparison.behind_by === 0 &&
    Array.isArray(comparison.files) && comparison.files.length === 1 &&
    comparison.files[0].filename === anchor && comparison.files[0].status === 'modified';
}

export function canPublishDesktopHead(repository, tested, current, compare) {
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]*\/[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(repository ?? '') ||
      ![tested, current].every((sha) => /^[a-f0-9]{40}$/i.test(sha ?? ''))) {
    throw new Error('Expected a repository and two immutable commit IDs');
  }
  if (tested === current) return true;
  return releaseHeadIsSafe(compare(repository, tested, current));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const allowed = canPublishDesktopHead(process.env.GITHUB_REPOSITORY, process.argv[2], process.argv[3],
    (repository, tested, current) => JSON.parse(execFileSync('gh',
      ['api', `repos/${repository}/compare/${tested}...${current}`], { encoding: 'utf8' })));
  console.log(String(allowed));
}
