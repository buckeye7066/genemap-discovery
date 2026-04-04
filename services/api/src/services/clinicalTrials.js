// ─── ClinicalTrials.gov v2 API Integration ──────────────────────────────────
// Public API docs: https://clinicaltrials.gov/data-api/api

const BASE_URL = 'https://clinicaltrials.gov/api/v2/studies';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const cache = new Map();

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  // Evict old entries if cache grows too large
  if (cache.size > 200) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp);
    for (let i = 0; i < 50; i++) cache.delete(oldest[i][0]);
  }
  cache.set(key, { data, timestamp: Date.now() });
}

function parseStudy(study) {
  const proto = study.protocolSection || {};
  const id = proto.identificationModule || {};
  const status = proto.statusModule || {};
  const design = proto.designModule || {};
  const conditions = proto.conditionsModule || {};
  const arms = proto.armsInterventionsModule || {};
  const contacts = proto.contactsLocationsModule || {};
  const eligibility = proto.eligibilityModule || {};
  const description = proto.descriptionModule || {};

  const interventions = (arms.interventions || []).map(i => ({
    type: i.type || null,
    name: i.name || null,
    description: i.description || null,
  }));

  const locations = (contacts.locations || []).map(loc => ({
    facility: loc.facility || null,
    city: loc.city || null,
    state: loc.state || null,
    country: loc.country || null,
  }));

  const centralContacts = (contacts.centralContacts || []).map(c => ({
    name: c.name || null,
    role: c.role || null,
    phone: c.phone || null,
    email: c.email || null,
  }));

  return {
    nctId: id.nctId || null,
    title: id.officialTitle || id.briefTitle || null,
    briefTitle: id.briefTitle || null,
    status: status.overallStatus || null,
    startDate: status.startDateStruct?.date || null,
    completionDate: status.completionDateStruct?.date || null,
    phase: design.phases?.join(' / ') || null,
    studyType: design.studyType || null,
    enrollment: design.enrollmentInfo?.count || null,
    conditions: conditions.conditions || [],
    keywords: conditions.keywords || [],
    interventions,
    locations,
    locationSummary: buildLocationSummary(locations),
    contacts: centralContacts,
    eligibility: {
      criteria: eligibility.eligibilityCriteria || null,
      sex: eligibility.sex || null,
      minAge: eligibility.minimumAge || null,
      maxAge: eligibility.maximumAge || null,
      healthyVolunteers: eligibility.healthyVolunteers || null,
    },
    briefSummary: description.briefSummary || null,
    url: id.nctId ? `https://clinicaltrials.gov/study/${id.nctId}` : null,
  };
}

function buildLocationSummary(locations) {
  if (!locations || locations.length === 0) return null;
  const countries = [...new Set(locations.map(l => l.country).filter(Boolean))];
  const cities = [...new Set(locations.map(l => [l.city, l.state].filter(Boolean).join(', ')).filter(Boolean))];
  const summary = cities.slice(0, 3).join('; ');
  const extra = locations.length > 3 ? ` (+${locations.length - 3} more sites)` : '';
  return `${summary}${extra}${countries.length > 1 ? ` | ${countries.length} countries` : ''}`;
}

/**
 * Search ClinicalTrials.gov for studies matching the given parameters.
 */
export async function searchTrials({ condition, gene, status, pageSize = 20 } = {}) {
  const params = new URLSearchParams({ format: 'json' });

  if (condition) params.set('query.cond', condition);
  if (gene) params.set('query.term', gene);
  if (status) params.set('filter.overallStatus', status);
  if (pageSize) params.set('pageSize', String(Math.min(pageSize, 50)));

  const cacheKey = `search:${params.toString()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}?${params.toString()}`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`ClinicalTrials.gov API error (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const studies = (json.studies || []).map(parseStudy);
  const result = {
    totalCount: json.totalCount || studies.length,
    studies,
  };

  setCache(cacheKey, result);
  return result;
}

/**
 * Fetch a single study by NCT ID.
 */
export async function getTrialDetails(nctId) {
  if (!nctId || !/^NCT\d+$/i.test(nctId)) {
    throw new Error('Invalid NCT ID format');
  }

  const cacheKey = `detail:${nctId.toUpperCase()}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `${BASE_URL}/${nctId.toUpperCase()}?format=json`;
  const response = await fetch(url, {
    headers: { 'Accept': 'application/json' },
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Study ${nctId} not found`);
    }
    const text = await response.text().catch(() => '');
    throw new Error(`ClinicalTrials.gov API error (${response.status}): ${text.slice(0, 200)}`);
  }

  const json = await response.json();
  const study = parseStudy(json);

  setCache(cacheKey, study);
  return study;
}
