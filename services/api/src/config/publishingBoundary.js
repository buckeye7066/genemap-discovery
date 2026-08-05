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
const GENERATION_PATH_PREFIXES = Object.freeze(['/llm/', '/education/']);

function pathname(url = '') {
  return String(url).split('?')[0] || '/';
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

// Two-sided patterns catch both “my variant ... risk” and “risk ... for me”.
// They intentionally require personal/patient context AND a clinical-action
// concept so general coursework such as “What is pharmacogenomics?” remains
// available.
const PERSONAL_CONTEXT =
  String.raw`(?:\bmy\b|\bmine\b|\bfor me\b|\bi have\b|\bi was diagnosed\b|\bi am taking\b|\bpatient(?:'s)?\b|\bthis patient\b|\bmy (?:child|mother|father|spouse)\b)`;
const CLINICAL_ACTION =
  String.raw`(?:symptoms?|variants?|vcf|diagnos\w*|personal risk|risk level|medications?|medicines?|drugs?|dos(?:e|ing)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|pathogenic\w*|clinical management|urgent|emergency)`;
const PERSONAL_THEN_CLINICAL = new RegExp(`${PERSONAL_CONTEXT}[\\s\\S]{0,180}${CLINICAL_ACTION}`, 'i');
const CLINICAL_THEN_PERSONAL = new RegExp(`${CLINICAL_ACTION}[\\s\\S]{0,180}${PERSONAL_CONTEXT}`, 'i');

export function isPersonalClinicalPrompt(text) {
  if (typeof text !== 'string' || !text.trim()) return false;
  return PERSONAL_THEN_CLINICAL.test(text) || CLINICAL_THEN_PERSONAL.test(text);
}

export function publicationBoundaryDecision({ url, body } = {}) {
  if (HIGH_RISK_CLINICAL_FEATURES_ENABLED) return null;

  const path = pathname(url);
  if (HIDDEN_PATH_PREFIXES.some((prefix) => hasPathPrefix(path, prefix))) {
    return {
      statusCode: 404,
      code: 'FEATURE_NOT_AVAILABLE',
      message: 'This feature is not available in the education and exploratory-research build.',
    };
  }

  if (!GENERATION_PATH_PREFIXES.some((prefix) => path.startsWith(prefix))) {
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
  const decision = publicationBoundaryDecision({
    url: request?.raw?.url || request?.url,
    body: request?.body,
  });
  if (!decision) return undefined;

  request?.log?.info?.(
    { path: pathname(request?.raw?.url || request?.url), boundaryCode: decision.code },
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
  pathname,
  HIDDEN_PATH_PREFIXES,
  HIGH_RISK_AGENT_IDS,
};

