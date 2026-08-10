import {
  parsePublicationTaskInput,
} from '../config/publicationTaskContracts.js';
import {
  resolvePublicationHpo,
  resolvePublicationMondo,
  searchPublicationConcepts,
} from './publicationResolvers.js';
import { enrichGenesWithStatus } from './genomicDatabases.js';

const MONARCH_API_BASE = 'https://api.monarchinitiative.org/v3/api';
const OPEN_TARGETS_GRAPHQL = 'https://api.platform.opentargets.org/api/v4/graphql';
const UPSTREAM_TIMEOUT_MS = 12_000;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 128;
const MAX_SYMBOLS = 15;
const MAX_DIRECT_ASSOCIATIONS = 500;
const MAX_ORTHOLOG_CANDIDATES = 8;
const MAX_ORTHOLOG_ROWS = 100;
const MAX_OPEN_TARGET_ROWS = 500;
const ORTHOLOG_CONCURRENCY = 3;
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const MONDO_ID = /^MONDO:\d{7}$/u;
const HPO_ID = /^HP:\d{7}$/u;

const ASSOCIATION_CATEGORIES = new Set([
  'biolink:causalgenetodiseaseassociation',
  'biolink:correlatedgenetodiseaseassociation',
  'biolink:genetodiseaseassociation',
  'biolink:genetophenotypicfeatureassociation',
]);

const cache = new Map();

function cacheGet(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
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

function cleanSymbol(value) {
  const symbol = String(value || '').trim().toUpperCase();
  return GENE_SYMBOL.test(symbol) ? symbol : null;
}

function normalizeLabel(value) {
  return String(value || '').trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  return value == null ? [] : [value];
}

function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function safeHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

function curieUrl(value) {
  const curie = String(value || '').trim();
  if (/^PMID:\d+$/iu.test(curie)) {
    return `https://pubmed.ncbi.nlm.nih.gov/${encodeURIComponent(curie.split(':')[1])}/`;
  }
  if (/^DOI:/iu.test(curie)) {
    return `https://doi.org/${curie.slice(4)}`;
  }
  return safeHttpUrl(curie);
}

/**
 * Fetch one upstream JSON document while preserving whether the request itself
 * succeeded and the exact time that successful payload was received. Callers
 * must never convert an outage, timeout, non-2xx response, or invalid JSON into
 * an empty successful result.
 */
async function fetchJson(url, options = {}, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, payload: null, retrievedAt: null, httpStatus: null };
  }
  try {
    const response = await fetchImpl(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        ...(options.headers || {}),
      },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!response?.ok) {
      return {
        ok: false,
        payload: null,
        retrievedAt: null,
        httpStatus: Number(response?.status) || null,
      };
    }
    const payload = await response.json();
    return {
      ok: true,
      payload,
      retrievedAt: new Date().toISOString(),
      httpStatus: Number(response.status) || 200,
    };
  } catch {
    return { ok: false, payload: null, retrievedAt: null, httpStatus: null };
  }
}

function payloadItems(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['items', 'associations', 'results', 'rows', 'docs']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function payloadTotal(payload) {
  const values = [
    payload?.total,
    payload?.total_count,
    payload?.totalCount,
    payload?.meta?.total,
    payload?.pagination?.total,
  ];
  for (const value of values) {
    const total = Number(value);
    if (Number.isFinite(total) && total >= 0) return total;
  }
  return null;
}

function boundedCoverage(payload, rows, limit) {
  const total = payloadTotal(payload);
  const truncated = total != null ? total > rows.length : rows.length >= limit;
  return { total, truncated };
}

function entityValue(value) {
  if (typeof value === 'string') return value.trim();
  return firstString(value?.id, value?.identifier, value?.curie);
}

function categoryValues(value) {
  return asArray(value).map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function isGeneCategory(value) {
  return categoryValues(value).some((category) => (
    category === 'gene'
    || category === 'biolink:gene'
    || category === 'biolink:geneorproteincodinggene'
  ));
}

function isPhenotypeCategory(value) {
  return categoryValues(value).some((category) => (
    category === 'phenotypicfeature'
    || category === 'biolink:phenotypicfeature'
  ));
}

function associationCategoryAllowed(association) {
  return categoryValues(association?.category).some((category) => ASSOCIATION_CATEGORIES.has(category));
}

function taxonCode(value) {
  const taxon = String(value || '').trim();
  if (/(?:^|:)9606$/u.test(taxon)) return '9606';
  if (/(?:^|:)10090$/u.test(taxon)) return '10090';
  return taxon ? 'other' : 'unspecified';
}

function speciesLabel(code, value) {
  const label = firstString(value);
  if (label) return label;
  if (code === '9606') return 'Homo sapiens';
  if (code === '10090') return 'Mus musculus';
  return code === 'other' ? 'Other / non-human' : 'Unspecified';
}

function sourceRecordLink(association) {
  const expandedCandidates = [
    ...asArray(association?.publications_links),
    ...asArray(association?.has_evidence_links),
    association?.provided_by_link,
  ];
  for (const candidate of expandedCandidates) {
    const url = safeHttpUrl(candidate?.url || candidate?.href);
    if (url) return url;
    const expanded = curieUrl(candidate?.id);
    if (expanded) return expanded;
  }
  for (const publication of asArray(association?.publications)) {
    const url = curieUrl(publication);
    if (url) return url;
  }
  for (const source of asArray(association?.sources)) {
    const url = safeHttpUrl(source?.url || source);
    if (url) return url;
  }
  return null;
}

function sourceName(association, fallback = 'Monarch Initiative') {
  return firstString(
    association?.primary_knowledge_source,
    association?.provided_by,
    asArray(association?.sources)[0]?.id,
    asArray(association?.sources)[0],
    fallback,
  );
}

function evidenceCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : null;
}

function evidenceStrength(association, { causal = false } = {}) {
  const count = evidenceCount(association?.evidence_count);
  if (causal || (count != null && count >= 2)) return 'strong';
  if (count != null && count >= 1) return 'supporting';
  return 'unknown';
}

function isComputationalAssociation(association) {
  const text = [
    association?.knowledge_level,
    association?.agent_type,
    association?.predicate,
    association?.original_predicate,
    association?.provided_by,
    association?.primary_knowledge_source,
  ].map((value) => String(value || '').toLocaleLowerCase('en-US')).join(' ');
  return /prediction|predicted|computational|automated|statistical_association|machine_learning|knowledge_graph_inference/u.test(text);
}

function predicateLabel(value) {
  const raw = String(value || '').replace(/^biolink:/iu, '').replace(/_/gu, ' ').trim();
  if (!raw) return 'has a source-recorded association with';
  if (/causes?/iu.test(raw)) return 'is represented as causally associated with';
  if (/contributes? to/iu.test(raw)) return 'is represented as contributing to';
  if (/has phenotype/iu.test(raw)) return 'has a curated phenotype association to';
  if (/associated with/iu.test(raw)) return 'has a source-recorded association with';
  return `has the source-recorded relation “${raw}” to`;
}

function normalizedId(value) {
  return String(value || '').trim().toUpperCase();
}

function hgncId(value) {
  const raw = String(value || '').trim().toUpperCase();
  if (/^HGNC:\d+$/u.test(raw)) return raw;
  if (/^\d+$/u.test(raw)) return `HGNC:${raw}`;
  return null;
}

function geneIdentifiers(record, symbol) {
  const ids = new Set();
  const add = (value) => {
    const normalized = normalizedId(value);
    if (normalized) ids.add(normalized);
  };
  add(record?.hgncId);
  if (record?.entrezId) add(`NCBIGENE:${record.entrezId}`);
  if (record?.ensemblId) {
    add(record.ensemblId);
    add(`ENSEMBL:${record.ensemblId}`);
  }
  add(symbol);
  return ids;
}

function directGeneSide(association, queryId) {
  const subjectId = entityValue(association?.subject);
  const objectId = entityValue(association?.object);
  if (normalizedId(subjectId) === normalizedId(queryId) && isGeneCategory(association?.object_category)) {
    return {
      id: objectId,
      label: firstString(association?.object_label, association?.object_name),
      taxon: association?.object_taxon,
      taxonLabel: association?.object_taxon_label,
    };
  }
  if (normalizedId(objectId) === normalizedId(queryId) && isGeneCategory(association?.subject_category)) {
    return {
      id: subjectId,
      label: firstString(association?.subject_label, association?.subject_name),
      taxon: association?.subject_taxon,
      taxonLabel: association?.subject_taxon_label,
    };
  }
  return null;
}

function matchingGene(geneSide, recordsBySymbol) {
  if (!geneSide) return null;
  const id = normalizedId(geneSide.id);
  for (const [symbol, record] of Object.entries(recordsBySymbol || {})) {
    if (geneIdentifiers(record, symbol).has(id)) {
      return { symbol, matchedByAuthoritativeIdentifier: true };
    }
  }
  // Symbol-label fallback is allowed only when the upstream explicitly labels
  // the edge as human. Missing taxon is never promoted by label alone.
  if (taxonCode(geneSide.taxon) !== '9606') return null;
  const label = cleanSymbol(geneSide.label);
  return label && recordsBySymbol?.[label]
    ? { symbol: label, matchedByAuthoritativeIdentifier: false }
    : null;
}

function matchingSymbol(geneSide, recordsBySymbol) {
  return matchingGene(geneSide, recordsBySymbol)?.symbol || null;
}

function directAssociationClaim({
  association,
  query,
  geneSide,
  symbol,
  releaseVersion,
  retrievedAt,
  matchedByAuthoritativeIdentifier = false,
}) {
  const sourceTaxon = taxonCode(geneSide.taxon);
  // An omitted taxon is ambiguous even when a symbol or identifier happens to
  // match a human record. The edge is withheld rather than silently promoted.
  if (sourceTaxon === 'unspecified') return null;

  const computational = isComputationalAssociation(association);
  const evidenceClass = sourceTaxon === '9606'
    ? computational ? 'computational' : 'human_verified'
    : 'animal_model';
  const causal = /causal|causes/iu.test(`${association?.category || ''} ${association?.predicate || ''}`);
  const identifierNote = matchedByAuthoritativeIdentifier
    ? ''
    : ' (matched through an explicit human source label)';
  return {
    source: sourceName(association),
    recordId: firstString(association?.id),
    claim: `${symbol} ${predicateLabel(association?.predicate || association?.original_predicate)} ${query.canonicalLabel}${identifierNote}`,
    taxon: sourceTaxon,
    species: speciesLabel(sourceTaxon, geneSide.taxonLabel),
    evidenceClass,
    evidenceType: computational
      ? 'computed_gene_query_association'
      : query.kind === 'hpo'
        ? 'gene_phenotype_association'
        : 'gene_disease_association',
    evidenceStrength: evidenceStrength(association, { causal }),
    releaseVersion,
    referenceAssembly: null,
    retrievalDate: retrievedAt ? retrievedAt.slice(0, 10) : null,
    directLink: sourceRecordLink(association),
    isAiLead: false,
  };
}

function phenotypeIdsForQuery(query, associations) {
  if (query.kind === 'hpo') return new Map([[query.identifier, query.canonicalLabel]]);
  const phenotypes = new Map();
  for (const association of associations) {
    if (association?.negated === true) continue;
    const subjectId = entityValue(association?.subject);
    const objectId = entityValue(association?.object);
    if (normalizedId(subjectId) === normalizedId(query.identifier) && isPhenotypeCategory(association?.object_category)) {
      if (HPO_ID.test(String(objectId || '').toUpperCase())) {
        phenotypes.set(String(objectId).toUpperCase(), firstString(association?.object_label) || String(objectId));
      }
    }
    if (normalizedId(objectId) === normalizedId(query.identifier) && isPhenotypeCategory(association?.subject_category)) {
      if (HPO_ID.test(String(subjectId || '').toUpperCase())) {
        phenotypes.set(String(subjectId).toUpperCase(), firstString(association?.subject_label) || String(subjectId));
      }
    }
    if (phenotypes.size >= 20) break;
  }
  return phenotypes;
}

function rowIdentifiers(row) {
  const ids = new Set([normalizedId(row?.id)]);
  const clique = row?.cross_species_term_clique || row?.crossSpeciesTermClique;
  for (const entity of asArray(clique?.clique_entities || clique?.cliqueEntities)) {
    ids.add(normalizedId(entity?.id || entity));
  }
  for (const value of asArray(row?.super_classes || row?.superClasses)) ids.add(normalizedId(value));
  ids.delete('');
  return ids;
}

function publicationLink(publications) {
  for (const publication of asArray(publications)) {
    const url = curieUrl(publication?.id || publication);
    if (url) return url;
  }
  return null;
}

function orthologClaimsFromGrid({ grid, symbol, phenotypeIds, releaseVersion, retrievedAt }) {
  const claims = [];
  const columns = Array.isArray(grid?.columns) ? grid.columns : [];
  const rows = Array.isArray(grid?.rows) ? grid.rows : [];
  const cells = grid?.cells && typeof grid.cells === 'object' ? grid.cells : {};

  for (const column of columns) {
    const code = taxonCode(column?.taxon || column?.in_taxon);
    if (code === '9606' || code === 'unspecified') continue;
    for (const row of rows) {
      const matchedPhenotypeId = [...rowIdentifiers(row)].find((id) => phenotypeIds.has(id));
      if (!matchedPhenotypeId) continue;
      const cell = cells[`${column.id}:${row.id}`];
      if (!cell || cell.present === false || cell.negated === true) continue;
      const orthologLabel = firstString(column?.symbol, column?.name, column?.label, column?.id) || 'ortholog';
      const phenotypeLabel = phenotypeIds.get(matchedPhenotypeId) || firstString(row?.name, row?.label) || matchedPhenotypeId;
      claims.push({
        source: 'Monarch Initiative ortholog-phenotype grid',
        recordId: firstString(cell?.id),
        claim: `${speciesLabel(code, column?.taxon_label || column?.taxonLabel)} ortholog ${orthologLabel} has phenotype evidence overlapping ${phenotypeLabel} for the ${symbol} research lead; this is cross-species inference, not direct human evidence`,
        taxon: code,
        species: speciesLabel(code, column?.taxon_label || column?.taxonLabel),
        evidenceClass: 'animal_model',
        evidenceType: 'ortholog_phenotype_inference',
        evidenceStrength: evidenceStrength(cell),
        releaseVersion,
        referenceAssembly: null,
        retrievalDate: retrievedAt ? retrievedAt.slice(0, 10) : null,
        directLink: publicationLink(cell?.publications),
        isAiLead: false,
      });
      if (claims.length >= 3) return claims;
    }
  }
  return claims;
}

function openTargetsDiseaseId(mondoId) {
  return MONDO_ID.test(mondoId) ? mondoId.replace(':', '_') : null;
}

async function fetchOpenTargetsClaims({ query, symbols, fetchImpl }) {
  if (query.kind !== 'mondo') {
    return {
      applicable: false,
      ok: true,
      claimsByGene: {},
      retrievedAt: null,
      truncated: false,
      total: null,
    };
  }
  const diseaseId = openTargetsDiseaseId(query.identifier);
  if (!diseaseId) {
    return {
      applicable: true,
      ok: false,
      claimsByGene: {},
      retrievedAt: null,
      truncated: false,
      total: null,
    };
  }
  const graphQl = `
    query GeneMapDiseaseTargets($diseaseId: String!) {
      disease(efoId: $diseaseId) {
        id
        name
        associatedTargets(page: { index: 0, size: ${MAX_OPEN_TARGET_ROWS} }) {
          count
          rows {
            target { id approvedSymbol approvedName }
            score
            datatypeScores { id score }
          }
        }
      }
    }
  `;
  const response = await fetchJson(
    OPEN_TARGETS_GRAPHQL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: graphQl, variables: { diseaseId } }),
    },
    fetchImpl,
  );
  const payload = response.payload;
  if (!response.ok || (Array.isArray(payload?.errors) && payload.errors.length)) {
    return {
      applicable: true,
      ok: false,
      claimsByGene: {},
      retrievedAt: null,
      truncated: false,
      total: null,
    };
  }
  const associatedTargets = payload?.data?.disease?.associatedTargets;
  const rows = associatedTargets?.rows;
  if (!Array.isArray(rows)) {
    return {
      applicable: true,
      ok: false,
      claimsByGene: {},
      retrievedAt: null,
      truncated: false,
      total: null,
    };
  }
  const totalValue = Number(associatedTargets?.count);
  const total = Number.isFinite(totalValue) && totalValue >= 0 ? totalValue : null;
  const truncated = total != null ? total > rows.length : rows.length >= MAX_OPEN_TARGET_ROWS;
  const expected = new Set(symbols);
  const claimsByGene = {};
  for (const row of rows) {
    const symbol = cleanSymbol(row?.target?.approvedSymbol);
    if (!symbol || !expected.has(symbol)) continue;
    const score = Number(row?.score);
    if (!Number.isFinite(score) || score <= 0) continue;
    claimsByGene[symbol] = [{
      source: 'Open Targets Platform GraphQL API v4',
      recordId: firstString(row?.target?.id),
      claim: `Open Targets aggregates human genetic, literature, pathway, model, and other source evidence for ${symbol} and ${query.canonicalLabel}; this computed association is a research comparison signal, not a clinical conclusion`,
      taxon: '9606',
      species: 'Homo sapiens',
      evidenceClass: 'computational',
      evidenceType: 'computed_target_disease_association',
      evidenceStrength: 'supporting',
      releaseVersion: null,
      referenceAssembly: null,
      retrievalDate: response.retrievedAt?.slice(0, 10) || null,
      directLink: `https://platform.opentargets.org/disease/${encodeURIComponent(diseaseId)}/associations`,
      isAiLead: false,
    }];
  }
  return {
    applicable: true,
    ok: true,
    claimsByGene,
    retrievedAt: response.retrievedAt,
    truncated,
    total,
  };
}

function parseVersion(payload) {
  if (typeof payload === 'string' && payload.trim()) return payload.trim().slice(0, 128);
  return firstString(
    payload?.version,
    payload?.release,
    payload?.release_version,
    payload?.kg_version,
    payload?.monarch_version,
    payload?.data_version,
  )?.slice(0, 128) || null;
}

async function monarchVersion(fetchImpl) {
  const cached = cacheGet('monarch:version');
  if (cached !== undefined) return cached;
  const response = await fetchJson(`${MONARCH_API_BASE}/version`, {}, fetchImpl);
  return cacheSet('monarch:version', response.ok ? parseVersion(response.payload) : null);
}

async function resolveEvidenceReference(reference, dependencies = {}) {
  const parsed = parsePublicationTaskInput('candidate_gene_research', {
    version: 1,
    operation: 'suggest_candidates',
    query: reference,
    audience: 'researcher',
  });
  if (!parsed.ok) return null;
  const query = parsed.value.query;
  if (query.kind === 'hpo') {
    const resolved = await resolvePublicationHpo(query.identifier, dependencies);
    return resolved ? { kind: 'hpo', ...resolved } : null;
  }
  if (query.kind === 'mondo') {
    const resolved = await resolvePublicationMondo(query.identifier, dependencies);
    return resolved ? { kind: 'mondo', ...resolved } : null;
  }
  const kind = query.conceptKind === 'disease' ? 'disease' : 'phenotype';
  const suggestions = await searchPublicationConcepts(query.canonicalLabel, kind, dependencies);
  const exact = suggestions.find((item) => (
    normalizeLabel(item.canonicalLabel) === normalizeLabel(query.canonicalLabel)
  ));
  if (!exact) return null;
  if (exact.kind === 'hpo') {
    const resolved = await resolvePublicationHpo(exact.identifier, dependencies);
    return resolved ? { kind: 'hpo', ...resolved, curatedConceptId: query.conceptId } : null;
  }
  if (exact.kind === 'mondo') {
    const resolved = await resolvePublicationMondo(exact.identifier, dependencies);
    return resolved ? { kind: 'mondo', ...resolved, curatedConceptId: query.conceptId } : null;
  }
  return null;
}

async function fetchMonarchAssociations(queryId, fetchImpl) {
  const cacheKey = `monarch:associations:${queryId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const url = new URL(`${MONARCH_API_BASE}/association`);
  url.searchParams.set('entity', queryId);
  url.searchParams.set('limit', String(MAX_DIRECT_ASSOCIATIONS));
  const response = await fetchJson(url, {}, fetchImpl);
  if (!response.ok) {
    return cacheSet(cacheKey, {
      ok: false,
      items: [],
      retrievedAt: null,
      total: null,
      truncated: false,
    });
  }
  const items = payloadItems(response.payload);
  const coverage = boundedCoverage(response.payload, items, MAX_DIRECT_ASSOCIATIONS);
  return cacheSet(cacheKey, {
    ok: true,
    items,
    retrievedAt: response.retrievedAt,
    ...coverage,
  });
}

async function fetchOrthologGrid(geneId, fetchImpl) {
  const cacheKey = `monarch:ortholog-grid:${geneId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;
  const url = new URL(`${MONARCH_API_BASE}/entity/${encodeURIComponent(geneId)}/ortholog-phenotype-grid`);
  url.searchParams.set('direct_only', 'true');
  url.searchParams.set('limit', String(MAX_ORTHOLOG_ROWS));
  const response = await fetchJson(url, {}, fetchImpl);
  if (!response.ok) {
    return cacheSet(cacheKey, {
      ok: false,
      grid: null,
      retrievedAt: null,
      total: null,
      truncated: false,
    });
  }
  const rows = Array.isArray(response.payload?.rows) ? response.payload.rows : [];
  const coverage = boundedCoverage(response.payload, rows, MAX_ORTHOLOG_ROWS);
  return cacheSet(cacheKey, {
    ok: true,
    grid: response.payload,
    retrievedAt: response.retrievedAt,
    ...coverage,
  });
}

function preferredMonarchGeneId(record) {
  return hgncId(record?.hgncId)
    || (record?.entrezId ? `NCBIGene:${record.entrezId}` : null)
    || record?.ensemblId
    || null;
}

function sourceHealth({ ok, truncated = false, applicable = true }) {
  if (!applicable) return 'not_applicable';
  if (!ok) return 'unavailable';
  return truncated ? 'partial' : 'available';
}

function overallSourceStatus({ claimCount, relevantSources }) {
  const active = relevantSources.filter((source) => source.applicable !== false);
  const unavailableCount = active.filter((source) => !source.ok).length;
  const partialCount = active.filter((source) => source.truncated).length;
  const successfulCount = active.length - unavailableCount;

  if (claimCount > 0) {
    return unavailableCount > 0 || partialCount > 0 ? 'partial_coverage' : 'available';
  }
  if (successfulCount === 0) return 'unavailable';
  if (unavailableCount > 0 || partialCount > 0) return 'partial_coverage';
  return 'no_matching_associations';
}

/**
 * Retrieve source-grounded association evidence for bounded candidate genes.
 * This service never creates candidates and never interprets a person's data.
 * Direct human/computational edges and cross-species inferences are separated,
 * versioned where the upstream reports a version, and source outages/coverage
 * limits remain explicit rather than becoming false negative evidence.
 */
export async function getAssociationEvidence(reference, symbols, dependencies = {}) {
  const fetchImpl = dependencies.fetchImpl || globalThis.fetch;
  const cleanSymbols = [...new Set((symbols || []).map(cleanSymbol).filter(Boolean))].slice(0, MAX_SYMBOLS);
  if (!cleanSymbols.length || typeof fetchImpl !== 'function') {
    return { query: null, claimsByGene: {}, retrievedAt: null, sourceStatus: 'unavailable' };
  }

  const query = await resolveEvidenceReference(reference, dependencies);
  if (!query) {
    return { query: null, claimsByGene: {}, retrievedAt: null, sourceStatus: 'unresolved_query' };
  }

  const geneLookup = dependencies.geneLookup || enrichGenesWithStatus;
  let geneIdentity;
  try {
    const lookupResult = await geneLookup(cleanSymbols);
    geneIdentity = lookupResult && lookupResult.records
      ? lookupResult
      : { records: lookupResult || {}, ok: true, partial: false, retrievedAt: null };
  } catch {
    geneIdentity = { records: {}, ok: false, partial: false, retrievedAt: null };
  }
  const recordsBySymbol = geneIdentity.records || {};
  const monarchAssociations = await fetchMonarchAssociations(query.identifier, fetchImpl);
  const associations = monarchAssociations.items;
  const releaseVersion = await monarchVersion(fetchImpl);
  const claimsByGene = Object.fromEntries(cleanSymbols.map((symbol) => [symbol, []]));

  for (const association of associations) {
    if (association?.negated === true || !associationCategoryAllowed(association)) continue;
    const geneSide = directGeneSide(association, query.identifier);
    const match = matchingGene(geneSide, recordsBySymbol);
    if (!match) continue;
    const claim = directAssociationClaim({
      association,
      query,
      geneSide,
      symbol: match.symbol,
      releaseVersion,
      retrievedAt: monarchAssociations.retrievedAt,
      matchedByAuthoritativeIdentifier: match.matchedByAuthoritativeIdentifier,
    });
    if (claim) claimsByGene[match.symbol].push(claim);
  }

  const phenotypeIds = phenotypeIdsForQuery(query, associations);
  const orthologResults = [];
  if (phenotypeIds.size) {
    const candidateRecords = cleanSymbols
      .map((symbol) => ({ symbol, record: recordsBySymbol?.[symbol] }))
      .filter(({ record }) => record?.verified)
      .slice(0, MAX_ORTHOLOG_CANDIDATES);
    for (let index = 0; index < candidateRecords.length; index += ORTHOLOG_CONCURRENCY) {
      const batch = candidateRecords.slice(index, index + ORTHOLOG_CONCURRENCY);
      const grids = await Promise.all(batch.map(({ record }) => {
        const geneId = preferredMonarchGeneId(record);
        return geneId ? fetchOrthologGrid(geneId, fetchImpl) : null;
      }));
      for (let offset = 0; offset < batch.length; offset += 1) {
        const { symbol } = batch[offset];
        const gridResult = grids[offset];
        if (!gridResult) continue;
        orthologResults.push(gridResult);
        if (!gridResult.ok || !gridResult.grid) continue;
        claimsByGene[symbol].push(...orthologClaimsFromGrid({
          grid: gridResult.grid,
          symbol,
          phenotypeIds,
          releaseVersion,
          retrievedAt: gridResult.retrievedAt,
        }));
      }
    }
  }

  const openTargets = await fetchOpenTargetsClaims({
    query,
    symbols: cleanSymbols,
    fetchImpl,
  });
  for (const [symbol, claims] of Object.entries(openTargets.claimsByGene)) {
    claimsByGene[symbol] ||= [];
    claimsByGene[symbol].push(...claims);
  }

  let claimCount = 0;
  for (const symbol of cleanSymbols) {
    const seen = new Set();
    claimsByGene[symbol] = (claimsByGene[symbol] || []).filter((claim) => {
      const key = [claim.source, claim.recordId, claim.evidenceType, claim.taxon].join('|');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 12);
    claimCount += claimsByGene[symbol].length;
  }

  const orthologIncomplete = orthologResults.some((result) => (
    !result.ok || result.truncated
  ));
  const monarchOk = monarchAssociations.ok;
  const monarchTruncated = monarchAssociations.truncated || orthologIncomplete;
  const monarchRetrievedAt = [
    monarchAssociations.retrievedAt,
    ...orthologResults.map((result) => result.retrievedAt),
  ].filter(Boolean).sort().at(-1) || null;

  // MyGene resolves candidate identity but does not establish a gene-query
  // association. Keep its health visible in `sources`, but do not let an
  // identity lookup turn failed association providers into `partial_coverage`.
  const relevantSources = [
    { applicable: true, ok: monarchOk, truncated: monarchTruncated },
    { applicable: openTargets.applicable, ok: openTargets.ok, truncated: openTargets.truncated },
  ];

  return {
    query,
    claimsByGene,
    retrievedAt: new Date().toISOString(),
    sources: {
      myGene: {
        apiVersion: 'v3',
        releaseVersion: null,
        status: sourceHealth({ ok: geneIdentity.ok, truncated: geneIdentity.partial }),
        truncated: geneIdentity.partial === true,
        retrievedAt: geneIdentity.retrievedAt || null,
      },
      monarch: {
        apiVersion: 'v3',
        releaseVersion,
        status: sourceHealth({ ok: monarchOk, truncated: monarchTruncated }),
        truncated: monarchTruncated,
        retrievedAt: monarchRetrievedAt,
      },
      openTargets: {
        apiVersion: 'v4',
        releaseVersion: null,
        status: sourceHealth(openTargets),
        truncated: openTargets.truncated,
        retrievedAt: openTargets.retrievedAt,
      },
    },
    sourceStatus: overallSourceStatus({ claimCount, relevantSources }),
  };
}

export const __test = {
  associationCategoryAllowed,
  boundedCoverage,
  directGeneSide,
  directAssociationClaim,
  evidenceStrength,
  fetchJson,
  isComputationalAssociation,
  matchingGene,
  matchingSymbol,
  openTargetsDiseaseId,
  orthologClaimsFromGrid,
  overallSourceStatus,
  parseVersion,
  payloadTotal,
  phenotypeIdsForQuery,
  preferredMonarchGeneId,
  resolveEvidenceReference,
  rowIdentifiers,
  resetCache: () => cache.clear(),
  sourceHealth,
};
