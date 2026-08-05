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
  String.raw`(?:symptoms?|variants?|genotyp\w*|vcf|diagnos\w*|personal risk|risk level|disease risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*|clinical management|urgent|emergency)`;
const MY_CLINICAL = new RegExp(
  String.raw`\bmy\s+(?:own\s+)?(?:symptoms?|variants?|genotyp\w*|vcf|diagnos\w*|personal risk|risk(?:\s+level)?|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|health|condition|care|results?)\b`,
  'i'
);
const CLINICAL_FOR_ME = new RegExp(
  `${CLINICAL_ACTION}[\\s\\S]{0,120}(?:\\bfor me\\b|\\bmine\\b)`,
  'i'
);
// First-person wording is not itself personal-clinical intent. Researchers
// naturally say "I have WES data from 50 patients" or "I need to identify
// variants across the cohort." Keep the personal anchors explicit so those
// aggregate-research requests are not rejected merely because clinical words
// appear later in a long UI prompt wrapper.
const FIRST_PERSON_DIAGNOSIS_OR_MEDICATION =
  /\bi\s+(?:(?:was|have\s+been)\s+diagnosed\b|(?:am\s+taking|take)\b)/i;
const I_HAVE_PERSONAL_CLINICAL = new RegExp(
  String.raw`\bi have\s+(?:(?:been experiencing|experienced|tested positive for|a|an|the|my|these|those|some|several|multiple|one|two|three|new|recent|current|chronic|severe|recurrent|unexplained|known|suspected)\s+){0,5}(?:symptoms?|variants?|genotyp\w*|vcf|diagnos\w*|personal risk|risk level|disease risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*|health condition|condition|results?)\b`,
  'i'
);
const I_NEED_PERSONAL_CLINICAL = new RegExp(
  String.raw`\bi need(?:\s+to\s+(?:know|understand|decide|find(?: out)?|get|choose))?[\s\S]{0,60}(?:diagnos\w*|personal risk|risk level|disease risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|clinical management)\b`,
  'i'
);
const SHOULD_I_CLINICAL = new RegExp(
  String.raw`\bshould i\b[\s\S]{0,180}(?:symptoms?|variants?|genotyp\w*|diagnos\w*|risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*)`,
  'i'
);
const PATIENT_OR_FAMILY =
  String.raw`(?:\bthis patient\b|\bmy patient(?:['’]s)?\b|\bthe patient['’]s\b|\bpatient['’]s\b|\bmy (?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member)(?:['’]s)?\b)`;
const PERSON_THEN_CLINICAL = new RegExp(`${PATIENT_OR_FAMILY}[\\s\\S]{0,240}${CLINICAL_ACTION}`, 'i');
const CLINICAL_THEN_PERSON = new RegExp(`${CLINICAL_ACTION}[\\s\\S]{0,240}${PATIENT_OR_FAMILY}`, 'i');

export function isPersonalClinicalPrompt(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return MY_CLINICAL.test(text)
    || CLINICAL_FOR_ME.test(text)
    || FIRST_PERSON_DIAGNOSIS_OR_MEDICATION.test(text)
    || I_HAVE_PERSONAL_CLINICAL.test(text)
    || I_NEED_PERSONAL_CLINICAL.test(text)
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
