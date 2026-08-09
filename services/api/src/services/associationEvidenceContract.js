import { getAssociationEvidence } from './associationEvidence.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 128;
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/u;
const EVIDENCE_CLASSES = new Set([
  'human_verified',
  'animal_model',
  'computational',
]);
const EVIDENCE_TYPES = new Set([
  'gene_disease_association',
  'gene_phenotype_association',
  'computed_gene_query_association',
  'computed_target_disease_association',
  'ortholog_phenotype_inference',
]);
const SOURCE_STATUSES = new Set([
  'available',
  'no_matching_associations',
  'unresolved_query',
  'unavailable',
]);

const cache = new Map();

function replaceControls(value) {
  return Array.from(String(value || ''), (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    const control = codePoint <= 0x1f
      || codePoint === 0x7f
      || (codePoint >= 0x80 && codePoint <= 0x9f);
    return control ? ' ' : character;
  }).join('');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const cleaned = replaceControls(value).replace(/\s+/gu, ' ').trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function safeUrl(value) {
  const text = cleanText(value, 2_000);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function validDateOnly(value) {
  if (!DATE_ONLY.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeDate(value) {
  const date = cleanText(value, 32);
  if (!date) return null;
  if (validDateOnly(date)) return date;
  if (ISO_DATE_TIME.test(date) && Number.isFinite(Date.parse(date))) return date.slice(0, 10);
  return null;
}

function safeDateTime(value) {
  const date = cleanText(value, 64);
  return date && ISO_DATE_TIME.test(date) && Number.isFinite(Date.parse(date)) ? date : null;
}

/**
 * Monarch KG releases are date strings. API package/build versions such as
 * `0.1.0` are not dataset release provenance and must remain unrecorded rather
 * than being displayed as though they identify the underlying knowledge graph.
 */
function safeReleaseVersion(value) {
  const release = cleanText(value, 32);
  return release && validDateOnly(release) ? release : null;
}

function cleanSymbol(value) {
  const symbol = cleanText(value, 15)?.toUpperCase() || null;
  return symbol && GENE_SYMBOL.test(symbol) ? symbol : null;
}

function safeTaxon(value) {
  const taxon = cleanText(value, 32);
  if (!taxon) return 'unspecified';
  if (taxon === 'other' || taxon === 'unspecified') return taxon;
  if (/^\d{1,12}$/u.test(taxon)) return taxon;
  if (/^(?:NCBITaxon:)?\d{1,12}$/iu.test(taxon)) return taxon.replace(/^NCBITaxon:/iu, '');
  return 'unspecified';
}

function safeEvidenceStrength(value) {
  // Upstream evidence counts and association categories are not a calibrated
  // strength scale. Preserve only a conservative supporting/unknown statement;
  // never expose a locally inferred “strong” label as source-reported fact.
  return value === 'unknown' || value == null ? 'unknown' : 'supporting';
}

function sanitizeClaim(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const evidenceClass = EVIDENCE_CLASSES.has(value.evidenceClass)
    ? value.evidenceClass
    : null;
  const evidenceType = EVIDENCE_TYPES.has(value.evidenceType)
    ? value.evidenceType
    : null;
  const source = cleanText(value.source, 256);
  const claim = cleanText(value.claim, 2_000);
  if (!evidenceClass || !evidenceType || !source || !claim) return null;

  return {
    source,
    recordId: cleanText(value.recordId, 256),
    claim,
    taxon: safeTaxon(value.taxon),
    species: cleanText(value.species, 256) || 'Unspecified',
    evidenceClass,
    evidenceType,
    evidenceStrength: safeEvidenceStrength(value.evidenceStrength),
    releaseVersion: safeReleaseVersion(value.releaseVersion),
    referenceAssembly: null,
    retrievalDate: safeDate(value.retrievalDate),
    directLink: safeUrl(value.directLink),
    isAiLead: false,
  };
}

function sanitizeQuery(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = value.kind === 'hpo' || value.kind === 'mondo' ? value.kind : null;
  const identifier = cleanText(value.identifier, 32)?.toUpperCase() || null;
  const validIdentifier = kind === 'hpo'
    ? /^HP:\d{7}$/u.test(identifier || '')
    : kind === 'mondo'
      ? /^MONDO:\d{7}$/u.test(identifier || '')
      : false;
  if (!kind || !validIdentifier) return null;

  return {
    kind,
    identifier,
    canonicalLabel: cleanText(value.canonicalLabel, 256) || identifier,
    source: cleanText(value.source, 256) || null,
    apiVersion: cleanText(value.apiVersion, 64) || null,
    ontologyVersion: safeReleaseVersion(value.ontologyVersion),
    obsolete: value.obsolete === true,
    curatedConceptId: cleanText(value.curatedConceptId, 128) || null,
  };
}

function sanitizeSource(value, fallbackApiVersion) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    apiVersion: cleanText(source.apiVersion, 64) || fallbackApiVersion,
    releaseVersion: safeReleaseVersion(source.releaseVersion),
  };
}

function normalizeSymbols(symbols) {
  return [...new Set((Array.isArray(symbols) ? symbols : []).map(cleanSymbol).filter(Boolean))]
    .slice(0, 15);
}

function cacheKey(reference, symbols) {
  const query = reference && typeof reference === 'object' && !Array.isArray(reference)
    ? Object.fromEntries(Object.entries(reference).sort(([a], [b]) => a.localeCompare(b)))
    : null;
  return JSON.stringify({ query, symbols: normalizeSymbols(symbols) });
}

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return null;
  }
  cache.delete(key);
  cache.set(key, entry);
  return entry.value;
}

function cacheSet(key, value) {
  if (!cache.has(key) && cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
  return value;
}

/**
 * Convert raw public-adapter results into the exact bounded API contract.
 * Numeric provider scores are intentionally absent. A candidate can gain a
 * ranked evidence class only from a complete, source-labelled claim tuple.
 */
export function sanitizeAssociationEvidence(raw, requestedSymbols = []) {
  const symbols = normalizeSymbols(requestedSymbols);
  const sourceClaims = raw?.claimsByGene && typeof raw.claimsByGene === 'object'
    ? raw.claimsByGene
    : {};
  const claimsByGene = {};
  let claimCount = 0;

  for (const symbol of symbols) {
    const seen = new Set();
    const claims = [];
    const input = Array.isArray(sourceClaims[symbol]) ? sourceClaims[symbol] : [];
    for (const item of input) {
      const claim = sanitizeClaim(item);
      if (!claim) continue;
      const key = [
        claim.source,
        claim.recordId,
        claim.evidenceType,
        claim.taxon,
        claim.claim,
      ].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      claims.push(claim);
      if (claims.length >= 12) break;
    }
    claimsByGene[symbol] = claims;
    claimCount += claims.length;
  }

  const rawStatus = SOURCE_STATUSES.has(raw?.sourceStatus) ? raw.sourceStatus : 'unavailable';
  return {
    query: sanitizeQuery(raw?.query),
    claimsByGene,
    adapterRetrievedAt: safeDateTime(raw?.retrievedAt) || new Date().toISOString(),
    sources: {
      monarch: sanitizeSource(raw?.sources?.monarch, 'v3'),
      openTargets: sanitizeSource(raw?.sources?.openTargets, 'v4'),
    },
    sourceStatus: claimCount > 0
      ? 'available'
      : rawStatus === 'available'
        ? 'no_matching_associations'
        : rawStatus,
    claimCount,
  };
}

/**
 * Resolve and cache one bounded evidence request. The final publication
 * contract is cached after the raw adapters complete, so repeated requests use
 * the same source-retrieval dates until both the contract and upstream caches
 * expire rather than assigning a new date to cached source records.
 */
export async function getPublicationAssociationEvidence(reference, symbols, dependencies = {}) {
  const key = cacheKey(reference, symbols);
  const cached = cacheGet(key);
  if (cached) return cached;
  const raw = await getAssociationEvidence(reference, normalizeSymbols(symbols), dependencies);
  return cacheSet(key, sanitizeAssociationEvidence(raw, symbols));
}

export const __test = {
  cleanText,
  safeDate,
  safeDateTime,
  safeEvidenceStrength,
  safeReleaseVersion,
  safeTaxon,
  safeUrl,
  sanitizeClaim,
  sanitizeQuery,
  resetCache: () => cache.clear(),
};
