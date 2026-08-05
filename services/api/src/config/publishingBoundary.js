/**
 * Fail-closed publication boundary for the public education/research build.
 *
 * This is intentionally a code constant rather than an environment switch.
 * A deployment with missing or incorrect variables must not silently expose
 * personalized clinical, medical-record, VCF, pharmacogenomic, dosing, or
 * diagnostic execution paths.
 */
export const PUBLICATION_MODE = 'education_research';
export const HIGH_RISK_CLINICAL_FEATURES_ENABLED = false;

const HIDDEN_PATH_PREFIXES = Object.freeze([
  '/clinical-trials',
  '/genomics/vcf',
  '/entities/medical-data',
  '/entities/conversations',
]);

const HIGH_RISK_AGENT_IDS = new Set(['robert', 'anastasia']);
const GENERATION_PATH_PREFIXES = Object.freeze(['/llm', '/education']);
const MAX_PATH_DECODE_PASSES = 2;

function rawPathname(url = '') {
  return String(url).split('?')[0].split('#')[0] || '/';
}

function decodeAsciiEscapes(value) {
  return value.replace(/%([0-9a-f]{2})/gi, (match, hex) => {
    const codePoint = Number.parseInt(hex, 16);
    return codePoint >= 0x20 && codePoint <= 0x7e
      ? String.fromCharCode(codePoint)
      : match;
  });
}

// Decode a bounded number of times so encoded route letters, encoded slashes,
// and one layer of double-encoding cannot bypass the boundary. A malformed
// escape must never throw from a request hook; in that case, decode only valid
// ASCII escapes and leave the malformed bytes untouched for Fastify's normal
// 400/404 handling.
function safeDecodePath(value) {
  let current = value;
  for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      decoded = decodeAsciiEscapes(current);
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function normalizeDotSegments(value) {
  const segments = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

function normalizePath(value = '') {
  const decoded = safeDecodePath(rawPathname(value)).replace(/\/{2,}/g, '/');
  return normalizeDotSegments(decoded).toLowerCase();
}

// In preHandler, Fastify has already matched the route. Its route template is
// the authoritative path (for example `/clinical-trials/:trialId`) even when
// the raw URL encoded route letters. Wildcard/not-found routes are not
// authoritative, so they fall back to bounded, safe raw-path normalization.
function policyPath({ routeUrl, url } = {}) {
  const matchedRoute = typeof routeUrl === 'string'
    && routeUrl.startsWith('/')
    && !routeUrl.includes('*')
    ? routeUrl
    : null;
  return normalizePath(matchedRoute || url);
}

function hasPathPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function generationText(body) {
  if (!body || typeof body !== 'object') return '';
  const values = [body.prompt, body.topic, body.context];
  if (Array.isArray(body.messages)) {
    values.push(...body.messages.map((message) => message?.content));
  }
  return values.filter((value) => typeof value === 'string').join('\n');
}

const CLINICAL_ACTION =
  String.raw`(?:symptoms?|variants?|mutations?|genotyp\w*|vcf|diagnos\w*|personal risk|risk level|disease risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*|clinical management|urgent|emergency)`;
const MY_CLINICAL = new RegExp(
  String.raw`\bmy\s+(?:own\s+)?(?:symptoms?|variants?|mutations?|genotyp\w*|vcf|diagnos\w*|personal risk|risk(?:\s+level)?|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|health|condition|care|results?)\b`,
  'i'
);
const CLINICAL_FOR_ME = new RegExp(
  `${CLINICAL_ACTION}[\\s\\S]{0,120}(?:\\bfor me\\b|\\bmine\\b)`,
  'i'
);
// First-person wording is not itself personal-clinical intent. Researchers
// naturally say "I have WES data from 50 patients". Personal-care requests are
// evaluated first; only explicit aggregate data ownership paired with a
// cohort-level research output can neutralize the otherwise fail-closed
// "I have ... clinical action" rule.
const FIRST_PERSON_DIAGNOSIS_OR_MEDICATION =
  /\bi\s+(?:(?:was|have\s+been)\s+diagnosed\b|(?:am\s+taking|take)\b)/i;
const DIRECT_CARE_ACTION =
  String.raw`(?:diagnos\w*|personal risk|risk level|disease risk|medication(?:s| advice)?|medicine(?:s| advice)?|drug(?:s| advice)?|dos(?:e|ing)|treatment(?:s| options?)?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|clinical management|medical advice|urgent|emergency)`;
const DIRECT_PERSONAL_CARE_REQUEST = new RegExp(
  String.raw`\b(?:i|me|my|mine)\b[\s\S]{0,160}\b(?:want|need|tell me|advise me|how should i|what should i|should i|can i)\b[\s\S]{0,120}${DIRECT_CARE_ACTION}`,
  'i'
);
const GENERIC_I_HAVE_CLINICAL = new RegExp(
  String.raw`\bi have\b[\s\S]{0,320}${CLINICAL_ACTION}`,
  'i'
);
const SHOULD_I_CLINICAL = new RegExp(
  String.raw`\bshould i\b[\s\S]{0,180}(?:symptoms?|variants?|mutations?|genotyp\w*|diagnos\w*|risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*)`,
  'i'
);
const AGGREGATE_DATA_OWNERSHIP =
  /\bi have\b[\s\S]{0,140}(?:\b(?:wes|whole[- ]exome|whole[- ]genome|wgs|rna[- ]?seq|transcriptom\w*|genom\w*|proteom\w*|metabolom\w*)\b(?:\s+data)?|\bdata ?sets?\b|\b(?:anonymized|de-identified|aggregate)\s+cohort\b)/i;
const AGGREGATE_RESEARCH_EVIDENCE =
  /(?:\b(?:anonymized|de-identified|aggregate)\b|\b\d+\s+(?:patients?|participants?|subjects?|samples?)\b|\bpatients?\b[\s\S]{0,100}\bcontrols?\b|\bcohort\b|\bpopulation[- ]level\b|\bassociation research\b)/i;
const COHORT_LEVEL_RESEARCH_OUTPUT =
  /(?:\b(?:across|within|for|at)\s+(?:the\s+)?cohort\b|\bcohort[- ]level\b|\bpopulation[- ]level\b|\bassociation research\b|\bcompare\b[\s\S]{0,120}\b(?:cohort|patients?|controls?|samples?)\b|\bidentify\b[\s\S]{0,100}\b(?:variants?|mutations?|genes?|associations?)\b[\s\S]{0,100}\b(?:cohort|patients?|controls?|population)\b)/i;
const PATIENT_OR_FAMILY =
  String.raw`(?:\bthis patient\b|\bmy patient(?:['’]s)?\b|\bthe patient['’]s\b|\bpatient['’]s\b|\bmy (?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member)(?:['’]s)?\b)`;
const PERSON_THEN_CLINICAL = new RegExp(`${PATIENT_OR_FAMILY}[\\s\\S]{0,240}${CLINICAL_ACTION}`, 'i');
const CLINICAL_THEN_PERSON = new RegExp(`${CLINICAL_ACTION}[\\s\\S]{0,240}${PATIENT_OR_FAMILY}`, 'i');

function isAggregateResearchOwnership(text) {
  return AGGREGATE_DATA_OWNERSHIP.test(text)
    && AGGREGATE_RESEARCH_EVIDENCE.test(text)
    && COHORT_LEVEL_RESEARCH_OUTPUT.test(text)
    && !DIRECT_PERSONAL_CARE_REQUEST.test(text);
}

export function isPersonalClinicalPrompt(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (DIRECT_PERSONAL_CARE_REQUEST.test(text)) return true;

  return MY_CLINICAL.test(text)
    || CLINICAL_FOR_ME.test(text)
    || FIRST_PERSON_DIAGNOSIS_OR_MEDICATION.test(text)
    || (GENERIC_I_HAVE_CLINICAL.test(text) && !isAggregateResearchOwnership(text))
    || SHOULD_I_CLINICAL.test(text)
    || PERSON_THEN_CLINICAL.test(text)
    || CLINICAL_THEN_PERSON.test(text);
}

export function publicationBoundaryDecision({ url, routeUrl, body } = {}) {
  if (HIGH_RISK_CLINICAL_FEATURES_ENABLED) return null;

  const path = policyPath({ routeUrl, url });
  if (HIDDEN_PATH_PREFIXES.some((prefix) => hasPathPrefix(path, prefix))) {
    return {
      statusCode: 404,
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'This feature is not available in the education and exploratory-research build.',
    };
  }

  if (!GENERATION_PATH_PREFIXES.some((prefix) => hasPathPrefix(path, prefix))) {
    return null;
  }

  const agent = typeof body?.agent === 'string' ? body.agent.trim().toLowerCase() : '';
  if (HIGH_RISK_AGENT_IDS.has(agent)) {
    return {
      statusCode: 403,
      code: 'EDUCATION_RESEARCH_BOUNDARY',
      message: 'Personalized clinical AI is not available in this published build.',
    };
  }

  if (isPersonalClinicalPrompt(generationText(body))) {
    return {
      statusCode: 403,
      code: 'EDUCATION_RESEARCH_BOUNDARY',
      message: 'GeneMap can explain genetics generally, but cannot interpret personal symptoms, variants, medications, risk, diagnosis, treatment, screening, pharmacogenomics, or dosing.',
    };
  }

  return null;
}

export async function enforcePublishingBoundary(request, reply) {
  const rawUrl = request?.raw?.url || request?.url;
  const routeUrl = request?.routeOptions?.url;
  const decision = publicationBoundaryDecision({
    url: rawUrl,
    routeUrl,
    body: request?.body,
  });
  if (!decision) return undefined;

  request?.log?.info?.(
    { path: policyPath({ routeUrl, url: rawUrl }), boundaryCode: decision.code },
    'publication boundary blocked request'
  );
  return reply.code(decision.statusCode).send({
    error: decision.message,
    code: decision.code,
    publicationMode: PUBLICATION_MODE,
  });
}

export const __test = {
  generationText,
  normalizePath,
  policyPath,
  safeDecodePath,
  HIDDEN_PATH_PREFIXES,
  HIGH_RISK_AGENT_IDS,
};
