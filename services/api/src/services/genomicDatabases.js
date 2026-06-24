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

/**
 * fetch + JSON with a bounded timeout and a small exponential backoff for
 * transient failures (network errors, timeouts, 429/5xx). 4xx responses other
 * than 429 are treated as permanent and fail fast. The thrown error never
 * includes the full upstream URL — only the host — so a leaked error message
 * can't reveal exact query strings or internal paths to the client.
 */
async function fetchJSON(url, options = {}) {
  const host = (() => {
    try { return new URL(url).host; } catch { return 'upstream'; }
  })();
  const attempts = 3;
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
        if (TRANSIENT_STATUS.has(res.status) && attempt < attempts - 1) {
          lastErr = err;
          continue;
        }
        throw err;
      }
      return await res.json();
    } catch (err) {
      // AbortError / network errors are transient — retry until attempts run out.
      lastErr = err;
      const isPermanent = typeof err.status === 'number' && !TRANSIENT_STATUS.has(err.status);
      if (isPermanent || attempt === attempts - 1) throw err;
    }
  }
  throw lastErr;
}

// ─── MyVariant.info ──────────────────────────────────────────────────────────

/**
 * Look up a specific variant by ID (rsid, HGVS, etc.)
 * Returns annotation data including dbSNP, ClinVar, gnomAD, CADD.
 */
export async function lookupVariant(variantId) {
  const cacheKey = `variant:${variantId}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://myvariant.info/v1/variant/${encodeURIComponent(variantId)}`
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] lookupVariant(${variantId}) failed:`, err.message);
    return null;
  }
}

/**
 * Search variants by gene, rsid, or HGVS notation.
 */
export async function searchVariants(query) {
  const q = normalizeQuery(query);
  if (!q) return { hits: [] };
  const cacheKey = `variant-search:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://myvariant.info/v1/query?q=${encodeURIComponent(q)}&size=20`
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] searchVariants(${query}) failed:`, err.message);
    return { hits: [] };
  }
}

// ─── Ensembl REST ────────────────────────────────────────────────────────────

/**
 * Look up a gene by its symbol (e.g. BRCA1).
 * Returns gene info, location, biotype.
 */
export async function lookupGene(geneSymbol) {
  const symbol = normalizeQuery(geneSymbol);
  if (!symbol) return null;
  const cacheKey = `gene:${symbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${encodeURIComponent(symbol)}?expand=1`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] lookupGene(${geneSymbol}) failed:`, err.message);
    return null;
  }
}

/**
 * Get the sequence for a gene by Ensembl stable ID.
 * @param {string} geneId  Ensembl ID (e.g. ENSG00000012048)
 * @param {string} type    "genomic" | "cds" | "protein"
 */
export async function getGeneSequence(geneId, type = 'genomic') {
  const cacheKey = `gene-seq:${geneId}:${type}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://rest.ensembl.org/sequence/id/${encodeURIComponent(geneId)}?type=${encodeURIComponent(type)}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] getGeneSequence(${geneId}, ${type}) failed:`, err.message);
    return null;
  }
}

// ─── ClinVar (NCBI E-utilities) ─────────────────────────────────────────────

/**
 * Search ClinVar for clinical variants matching a query.
 */
export async function searchClinVar(query) {
  const q = normalizeQuery(query);
  if (!q) return { esearchresult: { idlist: [] } };
  const cacheKey = `clinvar-search:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const searchData = await fetchJSON(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(q)}&retmode=json&retmax=20`
    );
    cache.set(cacheKey, searchData);
    return searchData;
  } catch (err) {
    console.error(`[genomicDatabases] searchClinVar(${query}) failed:`, err.message);
    return { esearchresult: { idlist: [] } };
  }
}

/**
 * Get details for a specific ClinVar variant by UID.
 */
export async function getClinVarVariant(uid) {
  const cacheKey = `clinvar:${uid}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=clinvar&id=${encodeURIComponent(uid)}&retmode=json`
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] getClinVarVariant(${uid}) failed:`, err.message);
    return null;
  }
}

// ─── HPO (Human Phenotype Ontology) ─────────────────────────────────────────

/**
 * Search HPO terms by query string.
 */
export async function searchPhenotypes(query) {
  const q = normalizeQuery(query);
  if (!q) return { terms: [] };
  const cacheKey = `hpo:${q}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://ontology.jax.org/api/hp/search?q=${encodeURIComponent(q)}`
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] searchPhenotypes(${query}) failed:`, err.message);
    return { terms: [] };
  }
}
