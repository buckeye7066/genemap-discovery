import { sanitizeScoreComponents } from '@genemap/shared';
import { getAssociationEvidence } from './associationEvidence.js';
import { enrichGenesWithStatus } from './genomicDatabases.js';

const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 128;
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const CLINICAL_COMMAND = /^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/u;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T/u;
const PROVIDER_DEADLINE_MS = 5_000;
const ORTHOLOG_CANDIDATE_LIMIT = 8;
const EVIDENCE_CLASSES = new Set(['human_verified', 'animal_model', 'computational', 'literature']);
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
  'partial_coverage',
]);
const SOURCE_HEALTH = new Set(['available', 'partial', 'unavailable', 'not_applicable']);

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

// A source release identifier is an OPAQUE TOKEN, not a date.
//
// This used to accept only YYYY-MM-DD, so a real upstream release - Open
// Targets "26.06", a semver "0.1.0", a KG build tag - was silently discarded
// and the UI then said "Not recorded". That is provenance LOSS reported as
// ABSENCE: a false statement about our own data, and precisely the class of
// defect this product exists to avoid.
//
// So: validate the SHAPE, never the format. Bounded length, printable ASCII
// only, no whitespace, no markup or quote characters that could escape a
// rendering context. Do not parse it, do not normalise it, do not attempt to
// turn it into a date. "Not recorded" must from now on mean the source stated
// no version - never that we rejected the one it gave us.
const RELEASE_VERSION = /^[A-Za-z0-9][A-Za-z0-9._+:-]{0,63}$/u;

function safeReleaseVersion(value) {
  if (typeof value !== 'string') return null;
  // REJECT, never repair. Truncating an over-long value or stripping control
  // characters out of one would record a version the source never stated -
  // a fabricated identifier wearing the source's name. Take it verbatim or
  // take nothing.
  if (value.length > 64) return null;
  // Matching control characters is the entire point here: they must be
  // REJECTED, not stripped into a value the source never stated.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) return null;
  const release = value.trim();
  return release && RELEASE_VERSION.test(release) ? release : null;
}

function syntacticSymbol(value) {
  const symbol = cleanText(value, 15)?.toUpperCase() || null;
  return symbol && GENE_SYMBOL.test(symbol) ? symbol : null;
}

export function isPublicationGeneSymbol(value) {
  const symbol = syntacticSymbol(value);
  if (!symbol) return false;
  const policyText = symbol
    .replace(/-/gu, ' ')
    .replace(/(\d)(MG|MCG|UG|ML|UNITS?)\b/gu, '$1 $2');
  return !CLINICAL_COMMAND.test(policyText);
}

function cleanSymbol(value) {
  const symbol = syntacticSymbol(value);
  return symbol && isPublicationGeneSymbol(symbol) ? symbol : null;
}

function safeTaxon(value) {
  const taxon = cleanText(value, 32);
  if (!taxon) return 'unspecified';
  if (taxon === 'other' || taxon === 'unspecified') return taxon;
  if (/^\d{1,12}$/u.test(taxon)) return taxon;
  if (/^(?:NCBITaxon:)?\d{1,12}$/iu.test(taxon)) return taxon.replace(/^NCBITaxon:/iu, '');
  return 'unspecified';
}

// DELIBERATE, AND VERIFIED. DO NOT "FIX" THIS.
//
// Upstream `evidenceStrength()` in associationEvidence.js derives 'strong' from
// GeneMap's OWN heuristic (evidence_count >= 2, or a causal predicate). No
// source hands us that grade. Publishing it would mean GeneMap inventing an
// evidence grade and presenting it as though a database had assigned it, so the
// publication boundary collapses everything that is not explicitly unknown down
// to 'supporting'.
//
// This is NOT the same question as the decomposed source scores added in
// `sanitizeScoreComponents`: those are numbers the SOURCE published, carried
// with the source, class and provenance needed to interpret them. A
// GeneMap-computed ordinal has no such provenance and stays out.
function safeEvidenceStrength(value) {
  return value === 'unknown' || value == null ? 'unknown' : 'supporting';
}

function sanitizeClaim(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const evidenceClass = EVIDENCE_CLASSES.has(value.evidenceClass) ? value.evidenceClass : null;
  const evidenceType = EVIDENCE_TYPES.has(value.evidenceType) ? value.evidenceType : null;
  const source = cleanText(value.source, 256);
  const claim = cleanText(value.claim, 2_000);
  const taxon = safeTaxon(value.taxon);
  if (!evidenceClass || !evidenceType || !source || !claim) return null;
  if (evidenceClass === 'human_verified' && taxon !== '9606') return null;
  if (evidenceClass === 'animal_model' && (taxon === '9606' || taxon === 'unspecified')) return null;

  const releaseVersion = safeReleaseVersion(value.releaseVersion);
  const retrievalDate = safeDate(value.retrievalDate);

  return {
    source,
    recordId: safeIdentifier(value.recordId, 256),
    claim,
    subject: safeClaimEntity(value.subject),
    object: safeClaimEntity(value.object),
    taxon,
    species: cleanText(value.species, 256) || 'Unspecified',
    evidenceClass,
    evidenceType,
    evidenceStrength: safeEvidenceStrength(value.evidenceStrength),
    // Source-published score parts. Refused wholesale unless this claim can say
    // where it came from, which release, and when - see sanitizeScoreComponents.
    scoreComponents: sanitizeScoreComponents(value.scoreComponents, {
      source,
      releaseVersion,
      retrievalDate,
    }),
    releaseVersion,
    referenceAssembly: null,
    retrievalDate,
    directLink: safeUrl(value.directLink),
    isAiLead: false,
  };
}

const CLAIM_ENTITY_KINDS = new Set(['gene', 'phenotype', 'disease', 'pathway', 'variant']);

// A subject/object is only useful if it can be looked up, so an entity missing
// its kind, id, or label is dropped entirely rather than half-rendered.
// An identifier is not prose: truncating it yields a DIFFERENT identifier that
// resolves to nothing, which is a fabricated id wearing the source's name.
// Same reject-don't-repair rule as safeReleaseVersion. Prose fields (claim,
// species) are still bounded by cleanText, where clipping is honest display.
function safeIdentifier(value, maxLength) {
  if (typeof value === 'string' && value.length > maxLength) return null;
  return cleanText(value, maxLength);
}

function safeClaimEntity(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!CLAIM_ENTITY_KINDS.has(value.kind)) return null;
  const id = cleanText(value.id, 128);
  const label = cleanText(value.label, 256);
  if (!id || !label) return null;
  return { kind: value.kind, id, label };
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

function safeCount(value, max = 15) {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? Math.min(count, max) : null;
}

function sanitizeSource(value, fallbackApiVersion) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const candidateLimit = safeCount(source.candidateLimit);
  const candidatesRequested = safeCount(source.candidatesRequested);
  const candidatesSkipped = safeCount(source.candidatesSkipped);
  return {
    apiVersion: cleanText(source.apiVersion, 64) || fallbackApiVersion,
    releaseVersion: safeReleaseVersion(source.releaseVersion),
    status: SOURCE_HEALTH.has(source.status) ? source.status : 'unavailable',
    truncated: source.truncated === true,
    retrievedAt: safeDateTime(source.retrievedAt),
    ...(candidateLimit != null ? { candidateLimit } : {}),
    ...(candidatesRequested != null ? { candidatesRequested } : {}),
    ...(candidatesSkipped != null ? { candidatesSkipped } : {}),
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

function boundedFetch(fetchImpl = globalThis.fetch, timeoutMs = PROVIDER_DEADLINE_MS) {
  return (url, options = {}) => {
    const deadline = AbortSignal.timeout(timeoutMs);
    const signal = options.signal && typeof AbortSignal.any === 'function'
      ? AbortSignal.any([options.signal, deadline])
      : deadline;
    return fetchImpl(url, { ...options, signal });
  };
}

function timedGeneLookup(symbols, lookup = enrichGenesWithStatus, timeoutMs = PROVIDER_DEADLINE_MS) {
  return Promise.race([
    lookup(symbols),
    new Promise((resolve) => setTimeout(() => resolve({
      records: Object.fromEntries(symbols.map((symbol) => [symbol, null])),
      status: 'unavailable',
      retrievedAt: null,
      error: 'gene_lookup_deadline_exceeded',
    }), timeoutMs)),
  ]);
}

function defaultDependencies(overrides = {}) {
  const upstreamFetch = overrides.fetchImpl || globalThis.fetch;
  const upstreamGeneLookup = overrides.geneLookup || enrichGenesWithStatus;
  return {
    ...overrides,
    fetchImpl: boundedFetch(upstreamFetch, overrides.providerDeadlineMs || PROVIDER_DEADLINE_MS),
    geneLookup: (symbols) => timedGeneLookup(
      symbols,
      upstreamGeneLookup,
      overrides.providerDeadlineMs || PROVIDER_DEADLINE_MS,
    ),
  };
}

function applyOrthologCoverage(raw, symbols) {
  const requested = normalizeSymbols(symbols).length;
  const skipped = Math.max(0, requested - ORTHOLOG_CANDIDATE_LIMIT);
  if (skipped === 0) return raw;
  const sources = raw?.sources || {};
  const monarch = sources.monarch || {};
  return {
    ...raw,
    sourceStatus: raw?.sourceStatus === 'unavailable' || raw?.sourceStatus === 'unresolved_query'
      ? raw.sourceStatus
      : 'partial_coverage',
    sources: {
      ...sources,
      monarch: {
        ...monarch,
        status: monarch.status === 'unavailable' ? 'unavailable' : 'partial',
        truncated: true,
        candidateLimit: ORTHOLOG_CANDIDATE_LIMIT,
        candidatesRequested: requested,
        candidatesSkipped: skipped,
      },
    },
  };
}

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
      const key = [claim.source, claim.recordId, claim.evidenceType, claim.taxon, claim.claim].join('|');
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
      myGene: sanitizeSource(raw?.sources?.myGene, 'v3'),
      monarch: sanitizeSource(raw?.sources?.monarch, 'v3'),
      openTargets: sanitizeSource(raw?.sources?.openTargets, 'v4'),
    },
    sourceStatus: claimCount > 0
      ? rawStatus === 'partial_coverage' ? 'partial_coverage' : 'available'
      : rawStatus === 'available'
        ? 'no_matching_associations'
        : rawStatus,
    claimCount,
  };
}

export async function getPublicationAssociationEvidence(reference, symbols, dependencies = {}) {
  const cleanSymbols = normalizeSymbols(symbols);
  const key = cacheKey(reference, cleanSymbols);
  const cached = cacheGet(key);
  if (cached) return cached;
  const raw = await getAssociationEvidence(reference, cleanSymbols, defaultDependencies(dependencies));
  const coverageAware = applyOrthologCoverage(raw, cleanSymbols);
  return cacheSet(key, sanitizeAssociationEvidence(coverageAware, cleanSymbols));
}

export const __test = {
  ORTHOLOG_CANDIDATE_LIMIT,
  PROVIDER_DEADLINE_MS,
  applyOrthologCoverage,
  boundedFetch,
  cleanText,
  defaultDependencies,
  isPublicationGeneSymbol,
  safeDate,
  safeDateTime,
  safeEvidenceStrength,
  safeReleaseVersion,
  safeClaimEntity,
  safeIdentifier,
  safeTaxon,
  safeUrl,
  sanitizeClaim,
  sanitizeQuery,
  timedGeneLookup,
  resetCache: () => cache.clear(),
};
