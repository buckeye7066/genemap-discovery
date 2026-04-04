// ─── In-Memory Cache with TTL ────────────────────────────────────────────────

const DEFAULT_TTL = 10 * 60 * 1000; // 10 minutes

class TTLCache {
  constructor(ttl = DEFAULT_TTL) {
    this.ttl = ttl;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiry) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.store.set(key, { value, expiry: Date.now() + this.ttl });
  }
}

const cache = new TTLCache();

// ─── Helper ──────────────────────────────────────────────────────────────────

async function fetchJSON(url, options = {}) {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', ...options.headers },
    signal: AbortSignal.timeout(15_000),
    ...options,
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from ${url}`);
  }
  return res.json();
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
  const cacheKey = `variant-search:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://myvariant.info/v1/query?q=${encodeURIComponent(query)}&size=20`
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
  const cacheKey = `gene:${geneSymbol}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${encodeURIComponent(geneSymbol)}?expand=1`,
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
  const cacheKey = `clinvar-search:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const searchData = await fetchJSON(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(query)}&retmode=json&retmax=20`
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
  const cacheKey = `hpo:${query}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  try {
    const data = await fetchJSON(
      `https://ontology.jax.org/api/hp/search?q=${encodeURIComponent(query)}`
    );
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[genomicDatabases] searchPhenotypes(${query}) failed:`, err.message);
    return { terms: [] };
  }
}
