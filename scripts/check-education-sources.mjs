#!/usr/bin/env node
// Link-health check for the curated education references.
//
// The "source-grounded" promise depends on those authoritative links staying
// live — institutional URLs move over time. This script fetches every URL in
// services/api/src/services/educationSources.js and exits non-zero if any does
// not return a healthy (2xx/3xx) status, so a scheduled run (see
// .github/workflows/education-sources-linkcheck.yml) surfaces rot before a
// learner clicks a dead reference.
//
// Run locally:  node scripts/check-education-sources.mjs

import {
  GENERAL_SOURCES,
  CATEGORY_SOURCES,
  TOPIC_GLOSSARY,
} from '../services/api/src/services/educationSources.js';

const TIMEOUT_MS = 20_000;
// Use a browser-like User-Agent: several government/institution WAFs (e.g.
// genome.gov) answer 403 to non-browser agents, which would be a false
// "dead link". These hosts serve 200 to a normal browser.
const UA =
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
// Cap concurrency so a burst of same-host requests is not itself throttled.
const CONCURRENCY = 4;

// Collect the unique URL set (with a representative label for reporting).
const byUrl = new Map();
const add = (s) => { if (s && !byUrl.has(s.url)) byUrl.set(s.url, s.label); };
GENERAL_SOURCES.forEach(add);
Object.values(TOPIC_GLOSSARY).forEach(add);
Object.values(CATEGORY_SOURCES).flat().forEach(add);

async function probe(url) {
  // Prefer a lightweight HEAD; fall back to GET since some CDNs reject HEAD.
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, {
        method,
        redirect: 'follow',
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.status === 405 && method === 'HEAD') continue; // method not allowed → retry GET
      return res.status;
    } catch (err) {
      if (method === 'GET') return `ERR ${err.name || err.message}`;
    }
  }
  return 'ERR';
}

const healthy = (status) => typeof status === 'number' && status >= 200 && status < 400;

// Bounded-concurrency map so we do not fire every same-host request at once.
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

const results = await mapLimit([...byUrl.keys()], CONCURRENCY, async (url) => ({
  url,
  label: byUrl.get(url),
  status: await probe(url),
}));

const bad = results.filter((r) => !healthy(r.status));

for (const r of results.sort((a, b) => String(a.status).localeCompare(String(b.status)))) {
  const mark = healthy(r.status) ? 'OK ' : 'BAD';
  console.log(`${mark} ${String(r.status).padEnd(6)} ${r.url}  (${r.label})`);
}

console.log(`\nChecked ${results.length} URLs — ${results.length - bad.length} healthy, ${bad.length} unhealthy.`);

if (bad.length > 0) {
  console.error(`\nUnhealthy references:\n${bad.map((r) => `  - ${r.url} → ${r.status}`).join('\n')}`);
  process.exit(1);
}
