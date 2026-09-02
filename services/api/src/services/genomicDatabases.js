// ─── In-Memory Cache with TTL + LRU bound ────────────────────────────────────
//
// Without a size cap an attacker (or a buggy client) can trigger unbounded
// memory growth by sending many distinct queries. A simple Map insertion
// order is preserved by spec, so promoting an entry on `get` and evicting
// the oldest entry on overflow gives us LRU semantics in O(1).

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes
const DEFAULT_MAX = 500;

export class TTLCache {
  constructor({ ttl = DEFAULT_TTL, max = DEFAULT_MAX } = {}) {
    this.ttl = ttl;
    this.max = max;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return undefined;
    }

    // Move to most-recently-used position.
    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(key, value) {
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.max) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, { value, expiry: Date.now() + this.ttl });
  }

  size() {
    return this.store.size;
  }
}

const cache = new TTLCache();

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MAX_QUERY_LENGTH = 256;

/**
 * Normalize a user-supplied query for use in a cache key and upstream request.
 * Trims, lower-cases (gene/phenotype lookups are case-insensitive), and bounds
 * the length so a multi-megabyte "query" can neither poison the cache nor be
 * forwarded to an upstream database.
 */
export function normalizeQuery(query) {
  const trimmed = String(query ?? '').trim();
  if (!trimmed) return '';
  return trimmed.slice(0, MAX_QUERY_LENGTH).toLowerCase();
}

const TRANSIENT_STATUS = new Set([408, 429, 500, 502, 503, 504]);

// Only GET/HEAD are safely retryable by default: they are idempotent, so a
// transient failure + retry can never double-apply a side effect. Retrying a
// non-idempotent method (POST/PUT/PATCH/DELETE) risks executing a write twice.
// A caller that KNOWS its non-GET request is a pure read (e.g. MyGene.info's
// batch /query, which is POST only because the id list is large) may opt back
// in with `idempotent: true`. Everything else fails fast on the first error.
export function isRetryableRequest(method, options = {}) {
  if (options.idempotent === true) return true;
  const verb = String(method || 'GET').toUpperCase();
  return verb === 'GET' || verb === 'HEAD';
}

/**
 * fetch + JSON with a bounded timeout and a small exponential backoff for
 * transient failures (network errors, timeouts, 429/5xx). 4xx responses other
 * than 429 are treated as permanent and fail fast. Retries are limited to
 * idempotent requests (GET/HEAD, or an explicit `idempotent: true` read) so a
 * write is NEVER retried. The thrown error never includes the full upstream
 * URL — only the host — so a leaked error message can't reveal exact query
 * strings or internal paths to the client.
 */
async function fetchJSON(url, options = {}) {
  const host = (() => {
    try { return new URL(url).host; } catch { return 'upstream'; }
  })();
  const retryable = isRetryableRequest(options.method, options);
  const attempts = retryable ? 3 : 1;
  let lastErr;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) {
      const backoff = 150 * 2 ** (attempt - 1) + Math.floor(Math.random() * 100);
      await new Promise((resolve) => setTimeout(resolve, backoff));
    }
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json', ...options.headers },
        signal: AbortSignal.timeout(15_000),
        ...options,
      });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} from ${host}`);
        err.status = res.status;
        if (retryable && TRANSIENT_STATUS.has(res.status) && attempt < attempts - 1) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      return await res.json();
    } catch (err) {
      // AbortError / network errors are transient — retry until attempts run
      // out, but only for idempotent requests.
      lastErr = err;
      const isPermanent = typeof err.status === 'number' && !TRANSIENT_STATUS.has(err.status);
      if (!retryable || isPermanent || attempt === attempts - 1) throw err;
    }
  }
  throw lastErr;
}

// ─── HPO (Human Phenotype Ontology) ─────────────────────────────────────────

/**
 * Search HPO terms by query string. The adapter stamps successful upstream
 * responses once, before caching, so every downstream provenance row carries
 * the actual adapter-retrieval time rather than its own construction time.
 */
export async function searchPhenotypes(query) {
  const q = normalizeQuery(query);
  if (!q) return { terms: [], retrievedAt: null };
  const cacheKey = `hpo:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const upstream = await fetchJSON(
      `https://ontology.jax.org/api/hp/search?q=${encodeURIComponent(q)}`
    );
    const data = {
      ...(upstream && typeof upstream === 'object' && !Array.isArray(upstream) ? upstream : {}),
      terms: Array.isArray(upstream?.terms) ? upstream.terms : [],
      retrievedAt: new Date().toISOString(),
    };
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] searchPhenotypes(${query}) failed:`, err.message);
    return { terms: [], retrievedAt: null };
  }
}

// ─── Authoritative gene records (MyGene.info → Ensembl/NCBI) ──────────────────
//
// Gene-search candidate genes come from an LLM, which can hallucinate
// coordinates and identifiers. These functions fetch the AUTHORITATIVE record
// for a symbol from MyGene.info (which aggregates Ensembl + NCBI/Entrez), so the
// UI can replace AI guesses with real data and label provenance. Everything is
// cached, batched, and fails soft: a missing/unreachable record yields `null`
// and the caller keeps the (clearly-labeled) AI value.

const MYGENE_FIELDS = 'symbol,name,entrezgene,ensembl.gene,genomic_pos,map_location,summary';
const MAX_ENRICH_SYMBOLS = 50;

function firstOf(value) {
  return Array.isArray(value) ? value[0] : value;
}

function toGeneRecord(querySymbol, hit, retrievedAt) {
  const pos = firstOf(hit.genomic_pos) || {};
  const ensembl = firstOf(hit.ensembl) || {};
  const chromosome = pos.chr != null && pos.chr !== '' ? String(pos.chr) : null;
  const start = Number.isFinite(pos.start) ? pos.start : null;
  const end = Number.isFinite(pos.end) ? pos.end : null;
  return {
    symbol: hit.symbol || querySymbol,
    name: typeof hit.name === 'string' ? hit.name : null,
    entrezId: hit.entrezgene != null ? String(hit.entrezgene) : null,
    ensemblId: ensembl.gene || null,
    chromosome,
    start,
    end,
    genomeBuild: 'GRCh38',
    mapLocation: typeof hit.map_location === 'string' ? hit.map_location : null,
    summary: typeof hit.summary === 'string' ? hit.summary : null,
    source: 'MyGene.info',
    retrievedAt,
    // "verified" means we actually resolved authoritative coordinates.
    verified: chromosome != null && start != null && end != null,
  };
}

/**
 * Resolve authoritative gene records for a list of symbols. Returns a map of
 * the ORIGINAL symbol → record (or null if unresolved). One batched MyGene.info
 * request for all uncached symbols; per-symbol results (including misses) are
 * cached so repeat searches preserve the original adapter-retrieval timestamp.
 */
async function enrichGenesInternal(symbols) {
  const clean = [
    ...new Set(
      (symbols || [])
        .map((s) => String(s ?? '').trim())
        .filter(Boolean)
    ),
  ].slice(0, MAX_ENRICH_SYMBOLS);

  const records = {};
  if (clean.length === 0) {
    return { records, ok: true, partial: false, retrievedAt: null };
  }

  const toFetch = [];
  for (const sym of clean) {
    const cached = cache.get(`generec:${sym.toLowerCase()}`);
    if (cached !== undefined) records[sym] = cached;
    else toFetch.push(sym);
  }

  let fetchFailed = false;
  if (toFetch.length > 0) {
    try {
      const body = new URLSearchParams({
        q: toFetch.join(','),
        scopes: 'symbol',
        species: 'human',
        fields: MYGENE_FIELDS,
      }).toString();
      const hits = await fetchJSON('https://mygene.info/v3/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
        // POST here is a pure batch READ (the id list is too large for a query
        // string), so it is safe to retry on transient failures.
        idempotent: true,
      });

      // MyGene returns one entry per query term, in order; a missed term has
      // `notfound: true`. Keep the first (best-scoring) hit per query symbol.
      const byQuery = new Map();
      for (const h of Array.isArray(hits) ? hits : []) {
        const key = String(h?.query ?? '').toLowerCase();
        if (key && !h.notfound && !byQuery.has(key)) byQuery.set(key, h);
      }

      const retrievedAt = new Date().toISOString();
      for (const sym of toFetch) {
        const hit = byQuery.get(sym.toLowerCase());
        const record = hit ? toGeneRecord(sym, hit, retrievedAt) : null;
        cache.set(`generec:${sym.toLowerCase()}`, record);
        records[sym] = record;
      }
    } catch (err) {
      fetchFailed = true;
      console.error('[genomicDatabases] enrichGenes failed:', err.message);
      // Fail soft: leave unresolved symbols as null so the caller keeps AI data.
      // Do not cache transport failures as authoritative "not found" records.
      for (const sym of toFetch) if (!(sym in records)) records[sym] = null;
    }
  }

  const successfulRecords = Object.values(records).filter((record) => record?.verified);
  const retrievedAt = successfulRecords
    .map((record) => record.retrievedAt)
    .filter(Boolean)
    .sort()
    .at(-1) || null;
  const hasAuthoritativeCachedRecord = successfulRecords.length > 0;
  return {
    records,
    ok: !fetchFailed || hasAuthoritativeCachedRecord,
    partial: fetchFailed && hasAuthoritativeCachedRecord,
    retrievedAt,
  };
}

export async function enrichGenes(symbols) {
  return (await enrichGenesInternal(symbols)).records;
}

/**
 * Association evidence needs transport health in addition to records. This
 * companion API preserves the existing `enrichGenes()` shape for ordinary
 * callers while preventing a MyGene outage from being reported as an
 * authoritative no-match in the research evidence workflow.
 */
export async function enrichGenesWithStatus(symbols) {
  return enrichGenesInternal(symbols);
}

const MAX_HPO_TERMS = 80;
const HPO_CONCURRENCY = 5;

/**
 * Validate phenotype names against the Human Phenotype Ontology, returning a map
 * of normalized name → { hpoId, name, verified, retrievedAt }. Uses the cached
 * HPO search; bounded concurrency keeps us well under the public API's rate
 * limits. An unmatched or failed term yields `verified: false` and does not
 * create a source claim in the browser.
 */
export async function validateHpoTerms(names) {
  const clean = [
    ...new Set((names || []).map((n) => normalizeQuery(n)).filter(Boolean)),
  ].slice(0, MAX_HPO_TERMS);

  const out = {};
  for (let i = 0; i < clean.length; i += HPO_CONCURRENCY) {
    const batch = clean.slice(i, i + HPO_CONCURRENCY);
    const settled = await Promise.all(
      batch.map(async (name) => {
        const cacheKey = `hpoterm:${name}`;
        const cached = cache.get(cacheKey);
        if (cached !== undefined) return [name, cached];
        const data = await searchPhenotypes(name);
        const top = (data?.terms || [])[0];
        const rec = top && typeof top.id === 'string'
          ? {
              hpoId: top.id,
              name: top.name || name,
              verified: true,
              retrievedAt: data.retrievedAt || null,
            }
          : {
              hpoId: null,
              name,
              verified: false,
              retrievedAt: data?.retrievedAt || null,
            };
        cache.set(cacheKey, rec);
        return [name, rec];
      })
    );
    for (const [name, rec] of settled) out[name] = rec;
  }
  return out;
}
