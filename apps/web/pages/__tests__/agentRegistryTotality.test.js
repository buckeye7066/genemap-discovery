import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// This is a source-maintenance test for retired internal personas. Production
// browser aliases deliberately expose only shared/client.ts, so importing the
// registry through the application package entry would put clinical persona
// copy back into the public bundle.
import { AGENT_IDS } from '../../../../packages/shared/src/agentRegistry.ts';

// ─── Totality: the app and the agent registry cannot drift ───────────────────
//
// The registry (packages/shared/src/agentRegistry.ts) is hand-maintained, so
// nothing structural stops someone adding a third persona page and never
// registering it — which would silently exclude that persona from the agent
// mesh (no peer notes, no lessons, no attribution) and from the owner report.
//
// This test closes that hole mechanically: it source-scans the web app for
// every place a persona id is written down, and asserts the set of ids the APP
// uses is EXACTLY the set of ids the REGISTRY declares. Adding a persona
// without registering it fails here; registering a persona nobody uses also
// fails here.
//
// The scan is deliberately dumb (regex over file text) so it keeps working
// without a parser and cannot be fooled by import indirection.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB_ROOT = path.resolve(HERE, '../..');
const SCAN_DIRS = ['pages', 'components'];
const SOURCE_EXT = new Set(['.js', '.jsx']);
// Built/vendored trees (Capacitor's android asset bundle, vite output,
// node_modules) contain minified copies of this same source — scanning them
// would double-count and, worse, keep a deleted persona "alive" via a stale
// bundle. Tests are excluded so this file's own literals never satisfy it.
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'android', 'ios', '__tests__']);

/**
 * Every persona-id literal the app writes down, keyed by what wrote it so a
 * failure says which source of truth drifted.
 *
 *  - usePersistConversation('<id>')  → which chat gets persisted as which type
 *  - assistantType === / : '<id>'    → readers of ai_conversations.assistantType
 *  - agent: '<id>'                   → the agent-mesh identity sent to /llm/*
 *  - ASSISTANT_IDS = [...]           → AIAssistants' activeAssistant tab values
 */
const ID_PATTERNS = [
  ['usePersistConversation', /usePersistConversation\(\s*['"]([a-z0-9_]+)['"]\s*\)/g],
  ['assistantType', /assistantType\s*(?:===|==|:)\s*['"]([a-z0-9_]+)['"]/g],
  ['agent', /\bagent:\s*['"]([a-z0-9_]+)['"]/g],
];
const ASSISTANT_IDS_PATTERN = /ASSISTANT_IDS\s*=\s*\[([^\]]*)\]/g;
const QUOTED = /['"]([a-z0-9_]+)['"]/g;

function collectSourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      collectSourceFiles(path.join(dir, entry.name), acc);
    } else if (SOURCE_EXT.has(path.extname(entry.name))) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function scanPersonaIds() {
  const found = new Map(); // id -> Set of "file :: source" citations
  const record = (id, file, source) => {
    const rel = path.relative(WEB_ROOT, file).replace(/\\/g, '/');
    if (!found.has(id)) found.set(id, new Set());
    found.get(id).add(`${rel} (${source})`);
  };

  for (const scanDir of SCAN_DIRS) {
    for (const file of collectSourceFiles(path.join(WEB_ROOT, scanDir))) {
      const text = fs.readFileSync(file, 'utf8');
      for (const [source, pattern] of ID_PATTERNS) {
        for (const match of text.matchAll(new RegExp(pattern.source, 'g'))) {
          record(match[1], file, source);
        }
      }
      for (const listMatch of text.matchAll(ASSISTANT_IDS_PATTERN)) {
        for (const idMatch of listMatch[1].matchAll(QUOTED)) {
          record(idMatch[1], file, 'ASSISTANT_IDS');
        }
      }
    }
  }
  return found;
}

describe('agent registry totality', () => {
  const found = scanPersonaIds();
  const usedIds = [...found.keys()].sort();
  const registeredIds = [...AGENT_IDS].sort();

  it('finds persona ids at all (the scan itself is not silently broken)', () => {
    // Guards against the failure mode where a refactor moves the sources and
    // this test starts passing vacuously by comparing two empty sets.
    expect(usedIds.length).toBeGreaterThan(0);
    expect(found.get('robert')?.size).toBeGreaterThan(0);
    expect(found.get('anastasia')?.size).toBeGreaterThan(0);
  });

  it('registers every persona id the app uses', () => {
    const unregistered = usedIds
      .filter((id) => !registeredIds.includes(id))
      .map((id) => `${id} — used in: ${[...found.get(id)].join(', ')}`);
    expect(unregistered, 'persona ids used by apps/web but missing from AGENTS').toEqual([]);
  });

  it('uses every persona id it registers', () => {
    const unused = registeredIds.filter((id) => !usedIds.includes(id));
    expect(unused, 'persona ids in AGENTS that apps/web never references').toEqual([]);
  });

  it('agrees exactly, in both directions', () => {
    expect(usedIds).toEqual(registeredIds);
  });

  it('reaches every registered agent through the mesh `agent:` field', () => {
    // Awareness is not enough: an agent the server is never told about can
    // neither receive peer notes nor author lessons. Every registered id must
    // appear as an `agent:` argument on some LLM call site — literally, or via
    // the ASSISTANT_IDS list that AIAssistants passes through as `agent`.
    const meshTagged = new Set();
    for (const [id, citations] of found) {
      for (const citation of citations) {
        if (citation.endsWith('(agent)') || citation.endsWith('(ASSISTANT_IDS)')) {
          meshTagged.add(id);
        }
      }
    }
    expect([...meshTagged].sort()).toEqual(registeredIds);
  });
});
