const HPO_ID = /^HP:\d{7}$/u;
const MONDO_ID = /^MONDO:\d{7}$/u;
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const ENSEMBL_GENE_ID = /^ENSG\d{11}(?:\.\d+)?$/u;
const ENTREZ_GENE_ID = /^\d{1,12}$/u;
const HPO_ENDPOINT = 'https://clinicaltables.nlm.nih.gov/api/hpo/v3/search';
const MONARCH_API_BASE = 'https://api.monarchinitiative.org/v3/api';
const HPO_SOURCE = 'NLM Clinical Tables HPO';
const HPO_API_VERSION = 'v3';
const MONDO_SOURCE = 'Monarch Initiative';
const MONDO_API_VERSION = 'v3';
const PUBLICATION_RESOLVER_TIMEOUT_MS = 12_000;
const HPO_CACHE_TTL_MS = 10 * 60 * 1000;
const HPO_CACHE_MAX = 256;

const hpoCache = new Map();

function normalizedGeneSymbol(value) {
  const symbol = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return GENE_SYMBOL.test(symbol) ? symbol : null;
}

function cachedHpo(identifier) {
  const cached = hpoCache.get(identifier);
  if (!cached) return undefined;
  if (Date.now() >= cached.expiresAt) {
    hpoCache.delete(identifier);
    return undefined;
  }
  hpoCache.delete(identifier);
  hpoCache.set(identifier, cached);
  return cached.value;
}

function rememberHpo(identifier, value) {
  if (!hpoCache.has(identifier) && hpoCache.size >= HPO_CACHE_MAX) {
    const oldest = hpoCache.keys().next().value;
    if (oldest) hpoCache.delete(oldest);
  }
  hpoCache.set(identifier, { value, expiresAt: Date.now() + HPO_CACHE_TTL_MS });
}

function isExplicitlyDeprecated(rawValue) {
  return rawValue === true
    || rawValue === 1
    || (typeof rawValue === 'string' && rawValue.trim().toLowerCase() === 'true');
}

function hasReplacement(rawValue) {
  if (Array.isArray(rawValue)) return rawValue.some(Boolean);
  return rawValue != null && String(rawValue).trim() !== '';
}

function hasObsoleteLabel(value) {
  return /^obsolete\s+/iu.test(String(value || '').trim());
}

function hasForbiddenControlCharacter(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function safeCanonicalLabel(value) {
  const label = String(value || '').trim();
  return label && label.length <= 256 && !hasForbiddenControlCharacter(label)
    ? label
    : '';
}

async function fetchJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(PUBLICATION_RESOLVER_TIMEOUT_MS),
    });
    if (!response?.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Resolve a browser-supplied gene symbol through the existing server-owned
 * MyGene.info adapter. Client-supplied Ensembl/Entrez tuples are deliberately
 * not accepted: only the exact normalized record returned here can be composed
 * into a model prompt.
 */
import { enrichGenes } from './genomicDatabases.js';

export async function resolvePublicationGene(symbolValue, { geneLookup } = {}) {
  const symbol = normalizedGeneSymbol(symbolValue);
  if (!symbol) return null;
  const lookup = geneLookup || enrichGenes;
  const records = await lookup([symbol]);
  const record = Object.values(records || {}).find((candidate) => (
    candidate && String(candidate.symbol || '').trim().toUpperCase() === symbol
  ));
  if (!record || record.verified !== true || record.source !== 'MyGene.info') return null;
  const ensemblId = typeof record.ensemblId === 'string'
    ? record.ensemblId.trim().toUpperCase()
    : '';
  const entrezId = record.entrezId == null ? '' : String(record.entrezId).trim();
  if (
    (ensemblId && !ENSEMBL_GENE_ID.test(ensemblId))
    || (entrezId && !ENTREZ_GENE_ID.test(entrezId))
    || (!ensemblId && !entrezId)
    || (entrezId && !ENTREZ_GENE_ID.test(entrezId))
  ) return null;
  return {
    symbol,
    ...(ensemblId ? { ensemblId } : {}),
    ...(entrezId ? { entrezId } : {}),
    source: 'MyGene.info',
    verified: true,
  };
}

/**
 * Revalidate an exact HPO id against NLM Clinical Tables before generation.
 * The browser may suggest an id, but its label/validity is never trusted. An
 * unavailable, missing, or obsolete record fails closed.
 */
export async function resolvePublicationHpo(identifierValue, { fetchImpl = globalThis.fetch } = {}) {
  const identifier = typeof identifierValue === 'string'
    ? identifierValue.trim().toUpperCase()
    : '';
  if (!HPO_ID.test(identifier) || typeof fetchImpl !== 'function') return null;
  const cached = cachedHpo(identifier);
  if (cached !== undefined) return cached;

  const url = new URL(HPO_ENDPOINT);
  url.searchParams.set('terms', identifier);
  url.searchParams.set('sf', 'id');
  url.searchParams.set('cf', 'id');
  url.searchParams.set('df', 'id,name');
  url.searchParams.set('ef', 'name,is_obsolete,replaced_by');
  url.searchParams.set('count', '10');

  try {
    const payload = await fetchJson(url, fetchImpl);
    if (!payload) return null;
    const codes = Array.isArray(payload?.[1]) ? payload[1] : [];
    const extras = payload?.[2] && typeof payload[2] === 'object' ? payload[2] : {};
    const rows = Array.isArray(payload?.[3]) ? payload[3] : [];
    const index = codes.findIndex((code) => String(code).trim().toUpperCase() === identifier);
    if (index < 0) {
      rememberHpo(identifier, null);
      return null;
    }
    const rawObsolete = extras.is_obsolete?.[index];
    const replacement = extras.replaced_by?.[index];
    const canonicalLabel = safeCanonicalLabel(extras.name?.[index] || rows[index]?.[1]);
    // NLM currently represents active HPO records with is_obsolete=null.
    // Exact returned id + canonical name is the positive record evidence;
    // explicit obsolete/replacement metadata still fails closed.
    if (
      isExplicitlyDeprecated(rawObsolete)
      || hasReplacement(replacement)
      || !canonicalLabel
      || hasObsoleteLabel(canonicalLabel)
    ) {
      rememberHpo(identifier, null);
      return null;
    }
    const record = {
      identifier,
      canonicalLabel,
      source: HPO_SOURCE,
      apiVersion: HPO_API_VERSION,
      obsolete: false,
    };
    rememberHpo(identifier, record);
    return record;
  } catch {
    return null;
  }
}

function monarchItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.docs)) return payload.docs;
  return [];
}

function monarchEntity(payload) {
  return payload?.item || payload?.entity || payload;
}

function monarchLabel(item) {
  const raw = item?.name ?? item?.label;
  if (Array.isArray(raw)) return String(raw[0] || '').trim();
  return typeof raw === 'string' ? raw.trim() : '';
}

function hasDiseaseCategory(item) {
  const category = item?.category ?? item?.categories ?? item?.type;
  const values = Array.isArray(category) ? category : [category];
  return values.some((value) => {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'disease' || normalized === 'biolink:disease';
  });
}

/** Revalidate an exact MONDO id against the server-owned Monarch entity API. */
export async function resolvePublicationMondo(identifierValue, { fetchImpl = globalThis.fetch } = {}) {
  const identifier = typeof identifierValue === 'string'
    ? identifierValue.trim().toUpperCase()
    : '';
  if (!MONDO_ID.test(identifier) || typeof fetchImpl !== 'function') return null;
  const payload = await fetchJson(
    `${MONARCH_API_BASE}/entity/${encodeURIComponent(identifier)}`,
    fetchImpl,
  );
  const entity = monarchEntity(payload);
  const returnedId = String(entity?.id || '').trim().toUpperCase();
  const canonicalLabel = safeCanonicalLabel(monarchLabel(entity));
  if (
    returnedId !== identifier
    || !canonicalLabel
    || !hasDiseaseCategory(entity)
    || isExplicitlyDeprecated(entity?.deprecated)
  ) return null;
  return {
    identifier,
    canonicalLabel,
    source: MONDO_SOURCE,
    apiVersion: MONDO_API_VERSION,
  };
}

function parsedHpoSuggestions(payload) {
  const codes = Array.isArray(payload?.[1]) ? payload[1] : [];
  const extras = payload?.[2] && typeof payload[2] === 'object' ? payload[2] : {};
  const rows = Array.isArray(payload?.[3]) ? payload[3] : [];
  return codes.flatMap((rawCode, index) => {
    const identifier = String(rawCode || '').trim().toUpperCase();
    const canonicalLabel = safeCanonicalLabel(
      extras.name?.[index] || rows[index]?.[1] || rows[index]?.[0],
    );
    if (
      !HPO_ID.test(identifier)
      || !canonicalLabel
      || hasObsoleteLabel(canonicalLabel)
      || isExplicitlyDeprecated(extras.is_obsolete?.[index])
      || hasReplacement(extras.replaced_by?.[index])
    ) return [];
    return [{
      kind: 'hpo',
      identifier,
      canonicalLabel,
      source: HPO_SOURCE,
      apiVersion: HPO_API_VERSION,
    }];
  });
}

/**
 * Deterministic typeahead only. No model is invoked and no returned label is
 * itself executable; callers submit the selected ID, which generation routes
 * revalidate through resolvePublicationHpo/resolvePublicationMondo.
 */
export async function searchPublicationConcepts(queryValue, kind, { fetchImpl = globalThis.fetch } = {}) {
  const query = typeof queryValue === 'string' ? queryValue.trim() : '';
  if (query.length < 2 || query.length > 80 || /[\r\n]/u.test(query) || typeof fetchImpl !== 'function') {
    return [];
  }
  if (kind === 'phenotype') {
    const url = new URL(HPO_ENDPOINT);
    url.searchParams.set('terms', query);
    url.searchParams.set('cf', 'id');
    url.searchParams.set('df', 'id,name');
    url.searchParams.set('ef', 'name,is_obsolete,replaced_by');
    url.searchParams.set('count', '10');
    const payload = await fetchJson(url, fetchImpl);
    return payload ? parsedHpoSuggestions(payload).slice(0, 10) : [];
  }
  if (kind === 'disease') {
    const url = new URL(`${MONARCH_API_BASE}/autocomplete`);
    url.searchParams.set('q', query);
    const payload = await fetchJson(url, fetchImpl);
    return monarchItems(payload).flatMap((item) => {
      const identifier = String(item?.id || '').trim().toUpperCase();
      const canonicalLabel = safeCanonicalLabel(monarchLabel(item));
      if (
        !MONDO_ID.test(identifier)
        || !canonicalLabel
        || !hasDiseaseCategory(item)
        || isExplicitlyDeprecated(item?.deprecated)
      ) return [];
      return [{
        kind: 'mondo',
        identifier,
        canonicalLabel,
        source: MONDO_SOURCE,
        apiVersion: MONDO_API_VERSION,
      }];
    }).slice(0, 10);
  }
  return [];
}

function collectHpoIdentifiers(value, output = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectHpoIdentifiers(item, output);
    return output;
  }
  if (!value || typeof value !== 'object') return output;
  if ((value.kind === 'hpo' || value.kind === 'mondo') && typeof value.identifier === 'string') {
    output.add(value.identifier.trim().toUpperCase());
  }
  for (const nested of Object.values(value)) collectHpoIdentifiers(nested, output);
  return output;
}

/** Resolve every external identity needed by one already shape-checked task. */
export async function resolvePublicationTaskReferences(task, taskInput, dependencies = {}) {
  const resolvedHpoById = {};
  const resolvedMondoById = {};
  const identifiers = [...collectHpoIdentifiers(taskInput)];
  const hpoIdentifiers = identifiers.filter((identifier) => HPO_ID.test(identifier));
  const mondoIdentifiers = identifiers.filter((identifier) => MONDO_ID.test(identifier));
  const resolvedHpo = await Promise.all(hpoIdentifiers.map((identifier) => (
    resolvePublicationHpo(identifier, dependencies)
  )));
  const resolvedMondo = await Promise.all(mondoIdentifiers.map((identifier) => (
    resolvePublicationMondo(identifier, dependencies)
  )));
  for (let index = 0; index < hpoIdentifiers.length; index += 1) {
    if (resolvedHpo[index]) resolvedHpoById[hpoIdentifiers[index]] = resolvedHpo[index];
  }
  for (let index = 0; index < mondoIdentifiers.length; index += 1) {
    if (resolvedMondo[index]) resolvedMondoById[mondoIdentifiers[index]] = resolvedMondo[index];
  }

  let resolvedGene;
  const resolvedGenesBySymbol = {};
  if (task === 'candidate_gene_research' && taskInput?.operation === 'gene_profile') {
    resolvedGene = await resolvePublicationGene(taskInput?.gene?.symbol, dependencies);
  }
  if (task === 'learning_activity_summary') {
    const symbols = [...new Set((taskInput?.recentGenes || []).map((value) => (
      String(value).trim().toUpperCase()
    )))];
    const records = await Promise.all(symbols.map((symbol) => (
      resolvePublicationGene(symbol, dependencies)
    )));
    for (let index = 0; index < symbols.length; index += 1) {
      if (records[index]) resolvedGenesBySymbol[symbols[index]] = records[index];
    }
  }
  return { resolvedHpoById, resolvedMondoById, resolvedGene, resolvedGenesBySymbol };
}

export const __test = {
  collectHpoIdentifiers,
  hasReplacement,
  hasObsoleteLabel,
  hasDiseaseCategory,
  isExplicitlyDeprecated,
  monarchItems,
  parsedHpoSuggestions,
  PUBLICATION_RESOLVER_TIMEOUT_MS,
  safeCanonicalLabel,
  normalizedGeneSymbol,
  resetHpoCache: () => hpoCache.clear(),
};
