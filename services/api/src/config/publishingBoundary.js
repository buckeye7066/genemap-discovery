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
  String.raw`(?:pain|symptoms?|variants?|mutations?|genotyp\w*|vcf|diagnos\w*|risk(?:\s+level)?|disease risk|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*|clinical management|urgent|emergency)`;
const MY_CLINICAL = new RegExp(
  String.raw`\bmy\s+(?:own\s+)?(?:symptoms?|variants?|mutations?|genotyp\w*|vcf|diagnos\w*|personal risk|risk(?:\s+level)?|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|health|condition|care|results?)\b`,
  'i'
);
const CLINICAL_FOR_ME = new RegExp(
  `${CLINICAL_ACTION}[\\s\\S]{0,120}(?:\\bfor (?:me|myself)\\b|\\bmine\\b)`,
  'i'
);
// First-person wording is not itself personal-clinical intent. Researchers
// naturally say "I have WES data from 50 patients". Classify high-specificity
// personal-care requests first, then allow only explicit aggregate research
// context paired with a cohort-level operation. All remaining first-person
// clinical wording fails closed.
const FIRST_PERSON_DIAGNOSIS = /\bi\s+(?:was|have\s+been)\s+diagnosed\b/i;
const DIRECT_CARE_ACTION = String.raw`(?:diagnos\w*|personal risk|risk level|disease risk|medication advice|medicine advice|drug advice|dos(?:e|ing)|treatment(?:s| options?)?(?!\s+response)|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|clinical management|medical advice|urgent|emergency)`;
const DIRECT_PERSONAL_CARE_REQUEST = new RegExp(
  String.raw`(?:\b(?:i|me|my|mine)\b[\s\S]{0,160}\b(?:want|need|tell me|advise me|how should i|what should i|should i|can i|could i)\b[\s\S]{0,120}${DIRECT_CARE_ACTION}|\b(?:what|which)\s+dose\s+should\s+i\b)`,
  'i'
);
const CARE_THEN_PERSONAL_DECISION = new RegExp(
  String.raw`${DIRECT_CARE_ACTION}[\s\S]{0,120}\b(?:should|can|could|would)\s+i\s+(?:choose|use|take|receive|start|stop|change|increase|decrease)\b`,
  'i'
);
const PERSONAL_VARIANT_INTERPRETATION =
  /\b(?:interpret|explain|assess|evaluate|classify)\w*\b[\s\S]{0,80}\b(?:my|this|these|that|those)\s+(?:genetic\s+)?(?:variants?|mutations?|vcf|results?)\b/i;
const PERSONAL_RESULT_INTERPRETATION =
  /\bwhat does\s+my\s+(?:[\w-]+\s+){0,3}results?\s+mean(?:\s+for\s+me)?\b/i;
const PERSONAL_VARIANT_SYMPTOM_LINK =
  /\b(?:my|this|these|that|those)\s+(?:genetic\s+)?(?:variants?|mutations?|results?)\b[\s\S]{0,120}\b(?:pain|symptoms?)\b[\s\S]{0,60}\bi(?:['’]ve| have)\s+been\s+(?:having|experiencing|feeling)\b/i;
const PERSONAL_SYMPTOM_DIAGNOSIS_QUESTION =
  /\b(?:do|could|can|would)\s+(?:my|these|this)\s+(?:symptoms?|pain)\b[\s\S]{0,100}\b(?:mean|indicate|suggest|show)\b[\s\S]{0,80}\bi\s+(?:have|might have|could have)\b/i;
const DIRECT_SYMPTOM_ACTION =
  /\b(?:[\w-]+\s+)?pain\b[\s\S]{0,120}\b(?:what should i do|what do i do|what could it be|could it be|should i seek|is this (?:serious|urgent)|do i need (?:a )?doctor)\b/i;
const PERSONAL_BODY_COMPLAINT =
  /\bmy\s+(?:[\w-]+\s+){0,2}(?:hurts?|aches?|is painful)\b/i;
const FIRST_PERSON_FUTURE_DISEASE =
  /(?:\bi\s+need\s+to\s+know\b[\s\S]{0,180}\bi\s+(?:will|might|could|may)\s+(?:get|develop|have|be diagnosed)|\b(?:will|might|could|may)\s+i\s+(?:get|develop|have|be diagnosed))/i;
const DIRECT_PERSONAL_CLINICAL_HELP =
  /(?:\bi need\s+(?:help|advice|guidance)\s+(?:(?:with|on|for)\s+)?(?:(?:these|this|my)\s+)?(?:\w+\s+)?(?:symptoms?|pain)\b|\bi need\s+(?:symptoms?|pain)\s+(?:help|advice|guidance)\b)/i;
const NONCLINICAL_TAKING_ACTIVITY =
  String.raw`(?:(?:a|an|the|this|that|my)\s+)?(?:[\w-]+\s+){0,3}(?:course|class|workshop|lesson|training|notes?|break|walk|look|approach|position|survey|exam|test|route|train|bus|taxi|photos?|pictures?|samples?|measurements?|data|dataset|steps?|part|interest|issue|action|time|study|project|analysis|research|experiment|pipeline|workflow|search|review|reading|writing|calculation|simulation|model|modeling|size|coverage|power|resolution|quality|replicates?|controls?|design)\b`;
const CLEAR_NONCLINICAL_TAKING = new RegExp(
  String.raw`\bi(?:['’]m| am)\s+(?:currently\s+)?taking\s+${NONCLINICAL_TAKING_ACTIVITY}`,
  'i'
);
const SIMPLE_MEDICATION_DISCLOSURE = new RegExp(
  String.raw`\bi take\s+(?!${NONCLINICAL_TAKING_ACTIVITY})\S+`,
  'i'
);
const PROGRESSIVE_MEDICATION_DISCLOSURE =
  /\bi(?:['’]m| am)\s+(?:currently\s+)?(?:taking|using)\b/i;
const SIMPLE_MEDICATION_DECISION =
  /\bi\s+(?:take|use)\b[\s\S]{0,160}\b(?:how much|what dose|which dose|dos(?:e|ing)|tonight|today|each day|per day|should i|can i|could i|stop|start|increase|decrease)\b/i;
const GENERIC_I_HAVE_CLINICAL = new RegExp(
  String.raw`\bi have\b[\s\S]{0,320}${CLINICAL_ACTION}`,
  'i'
);
const FIRST_PERSON_CLINICAL_HELP = new RegExp(
  String.raw`\bi need\b(?=[\s\S]{0,220}${CLINICAL_ACTION})(?=[\s\S]{0,220}\b(?:help|advice|guidance)\b)`,
  'i'
);
const SHOULD_I_CARE = new RegExp(
  String.raw`\bshould i\b[\s\S]{0,180}(?:pain|symptoms?|diagnos\w*|risk(?:\s+level)?|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?(?!\s+response)|therap(?:y|ies)|screen\w*|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*)`,
  'i'
);
const SHOULD_I_UNKNOWN_MEDICATION =
  new RegExp(
    String.raw`\bshould i\s+(?:take|stop|start|change|increase|decrease)\s+(?!${NONCLINICAL_TAKING_ACTIVITY})\S+`,
    'i'
  );
const AGGREGATE_RESEARCH_EVIDENCE =
  /(?:\b(?:anonymized|de-identified|deidentified|aggregate)\b|\b\d+(?:\s+|-)\s*(?:patients?|participants?|subjects?|samples?|controls?)\b|\bpatients?\b[\s\S]{0,100}\bcontrols?\b|\bcohort\b|\bpopulation[- ]level\b|\bassociation research\b)/i;
const COHORT_RESEARCH_OPERATION =
  /\b(?:analy[sz](?:e|ing|is)|compar(?:e|ing|ison)|identif(?:y|ying)|associat(?:e|ion)|model(?:ing)?|estimat(?:e|ing)|test(?:ing)?|evaluat(?:e|ing|ion)|explor(?:e|ing|atory)|investigat(?:e|ing|ion)|includ(?:e|ing)|review(?:ing)?|summari[sz](?:e|ing)|prioriti[sz](?:e|ing)|annotat(?:e|ing|ion)|covariates?|variables?|data ?sets?|cohort[- ]level|population[- ]level|variant calling)\b/i;
const RESEARCH_WORK_PRODUCT =
  /\b(?:pilot study|research (?:study|project|analysis)|case-control (?:study|analysis)|observational study|exploratory analysis)\b/i;
const STRUCTURED_RESEARCH_MATERIAL =
  /\b(?:data|data ?sets?|counts?|annotations?|variables?|samples?|cohort|controls?|case-control|population[- ]level)\b/i;
const PATIENT_OR_FAMILY =
  String.raw`(?:\bthis patient\b|\bmy patient(?:['’]s)?\b|\bthe patient['’]s\b|\bpatient['’]s\b|\bmy (?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member)(?:['’]s)?\b)`;
const PERSON_THEN_CLINICAL = new RegExp(`${PATIENT_OR_FAMILY}[\\s\\S]{0,240}${CLINICAL_ACTION}`, 'i');
const CLINICAL_THEN_PERSON = new RegExp(`${CLINICAL_ACTION}[\\s\\S]{0,240}${PATIENT_OR_FAMILY}`, 'i');

function isAggregateResearchIntent(text) {
  const explicitCohortWork = AGGREGATE_RESEARCH_EVIDENCE.test(text)
    && COHORT_RESEARCH_OPERATION.test(text);
  const structuredResearchWorkProduct = RESEARCH_WORK_PRODUCT.test(text)
    && STRUCTURED_RESEARCH_MATERIAL.test(text)
    && COHORT_RESEARCH_OPERATION.test(text);
  return explicitCohortWork || structuredResearchWorkProduct;
}

export function isPersonalClinicalPrompt(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  if (
    DIRECT_PERSONAL_CARE_REQUEST.test(text)
    || CARE_THEN_PERSONAL_DECISION.test(text)
    || PERSONAL_VARIANT_INTERPRETATION.test(text)
    || PERSONAL_RESULT_INTERPRETATION.test(text)
    || PERSONAL_VARIANT_SYMPTOM_LINK.test(text)
    || PERSONAL_SYMPTOM_DIAGNOSIS_QUESTION.test(text)
    || DIRECT_SYMPTOM_ACTION.test(text)
    || PERSONAL_BODY_COMPLAINT.test(text)
    || FIRST_PERSON_FUTURE_DISEASE.test(text)
    || DIRECT_PERSONAL_CLINICAL_HELP.test(text)
    || FIRST_PERSON_DIAGNOSIS.test(text)
    || MY_CLINICAL.test(text)
    || CLINICAL_FOR_ME.test(text)
    || PERSON_THEN_CLINICAL.test(text)
    || CLINICAL_THEN_PERSON.test(text)
    || SIMPLE_MEDICATION_DISCLOSURE.test(text)
    || SIMPLE_MEDICATION_DECISION.test(text)
    || (
      PROGRESSIVE_MEDICATION_DISCLOSURE.test(text)
      && !CLEAR_NONCLINICAL_TAKING.test(text)
    )
  ) return true;

  if (isAggregateResearchIntent(text)) return false;

  return GENERIC_I_HAVE_CLINICAL.test(text)
    || FIRST_PERSON_CLINICAL_HELP.test(text)
    || SHOULD_I_CARE.test(text)
    || SHOULD_I_UNKNOWN_MEDICATION.test(text)
    || /\bi(?:['’]ve| have)\s+got\b[\s\S]{0,160}(?:pain|symptoms?|variants?|mutations?|diagnos\w*|risk|condition|disease)/i.test(text);
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
