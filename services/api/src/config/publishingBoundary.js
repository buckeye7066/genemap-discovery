/**
 * Fail-closed publication boundary for the public education/research build.
 *
 * The boundary is an allow contract, not a growing disease/drug dictionary.
 * Arbitrary generation is unavailable. A request must name one of the small
 * publication tasks below and must positively satisfy that task's contract.
 * Fixed education routes receive their task from the matched server route.
 */
export const PUBLICATION_MODE = 'education_research';
export const HIGH_RISK_CLINICAL_FEATURES_ENABLED = false;

export const PUBLICATION_TASKS = Object.freeze({
  GENETICS_EDUCATION: 'genetics_education',
  AGGREGATE_GENOMICS_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE_RESEARCH: 'candidate_gene_research',
  RESEARCH_HYPOTHESIS: 'research_hypothesis',
  LEARNING_ACTIVITY_SUMMARY: 'learning_activity_summary',
});

export const PUBLICATION_TASK_VALUES = Object.freeze(Object.values(PUBLICATION_TASKS));

const HIDDEN_PATH_PREFIXES = Object.freeze([
  '/clinical-trials',
  '/genomics/vcf',
  '/entities/medical-data',
  '/entities/conversations',
]);

const HIGH_RISK_AGENT_IDS = new Set(['robert', 'anastasia']);
const MAX_PATH_DECODE_PASSES = 2;
const ALL_PUBLICATION_TASKS = new Set(PUBLICATION_TASK_VALUES);

// Fixed education routes accept the curated catalog verbatim. Custom topics
// remain useful, but they must be a short, single genetics subject rather than
// an arbitrary instruction that happens to be posted to an education URL.
// Keep both ids and display titles because the web client currently sends the
// title while API consumers may use the stable id returned by /education/topics.
const KNOWN_EDUCATION_TOPIC_VALUES = Object.freeze([
  'what-is-dna', 'what is dna?',
  'dna-structure', 'dna structure',
  'dna-replication', 'dna replication',
  'genes-and-chromosomes', 'genes & chromosomes',
  'transcription',
  'translation',
  'gene-expression', 'gene expression',
  'gene-regulation', 'gene regulation',
  'mendelian-genetics', 'mendelian genetics',
  'punnett-squares', 'punnett squares',
  'sex-linked-traits', 'sex-linked traits',
  'complex-inheritance', 'complex inheritance',
  'what-are-mutations', 'what are mutations?',
  'types-of-mutations', 'types of mutations',
  'genetic-variation', 'genetic variation',
  'snps-and-polymorphisms', 'snps & polymorphisms',
  'human-genome-project', 'the human genome project',
  'dna-sequencing', 'dna sequencing',
  'crispr', 'crispr gene editing',
  'genetic-testing', 'genetic testing',
  'genetic-diseases', 'genetic diseases',
  'cancer-genetics', 'cancer genetics',
  'pharmacogenomics',
  'gene-therapy', 'gene therapy',
  'natural-selection', 'natural selection',
  'population-genetics', 'population genetics',
  'molecular-evolution', 'molecular evolution',
  'phylogenetics',
  'epigenetics',
  'rna-world', 'the rna world',
  'systems-biology', 'systems biology',
  'synthetic-biology', 'synthetic biology',
]);
const KNOWN_EDUCATION_TOPICS = new Set(KNOWN_EDUCATION_TOPIC_VALUES);

const ROUTE_OWNED_TASKS = new Map([
  ['/education/explain', PUBLICATION_TASKS.GENETICS_EDUCATION],
  ['/education/quiz', PUBLICATION_TASKS.GENETICS_EDUCATION],
  ['/education/image', PUBLICATION_TASKS.GENETICS_EDUCATION],
]);

const CLIENT_TASK_ROUTES = new Set([
  '/llm/invoke',
  '/llm/chat',
  '/education/chat',
]);

const SAFE_NON_GENERATION_EDUCATION_ROUTES = new Set([
  '/education/topics',
  '/education/progress',
  '/education/entitlements',
]);

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

// A bounded decode catches encoded route letters/slashes and one layer of
// double encoding without letting malformed escapes throw from the hook.
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

// Fastify's matched template is authoritative in preHandler. Wildcard routes
// fall back to the safely decoded raw URL so encoded/dot-segment probes cannot
// route around the policy.
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

function splitIntentClauses(text) {
  return String(text)
    .split(/(?:[.;!?]+|\b(?:then|but|however|also)\b)/i)
    .map((clause) => clause.trim())
    .filter(Boolean);
}

const AGGREGATE_EVIDENCE =
  /(?:\b(?:anonymized|de-identified|deidentified|non-identifiable|aggregate|synthetic|public)\b[\s\S]{0,100}\b(?:cohort|population|data ?set|data|records?|samples?|biobank|repository)\b|\b\d+(?:\s+|-)\s*(?:patients?|participants?|subjects?|samples?|controls?)\b|\b(?:patient|participant|subject) cohort\b|\bpatients?\b[\s\S]{0,80}\bcontrols?\b|\bcohort[- ]level\b|\bpopulation[- ]level\b|\bassociation research\b)/i;
const COHORT_OPERATION =
  /\b(?:analy[sz](?:e|ing|is)|compar(?:e|ing|ison)|identif(?:y|ying|ication)|associat(?:e|ion)|model(?:ing)?|estimat(?:e|ing|ion)|test(?:ing)?|evaluat(?:e|ing|ion)|explor(?:e|ing|atory)|investigat(?:e|ing|ion)|includ(?:e|ing)|review(?:ing)?|summari[sz](?:e|ing)|prioriti[sz](?:e|ing)|annotat(?:e|ing|ion)|variant calling|covariates?|endpoints?|outcomes?|variables?|population[- ]level|cohort[- ]level|association research)\b/i;

function isAggregateResearchIntent(text) {
  return AGGREGATE_EVIDENCE.test(text) && COHORT_OPERATION.test(text);
}

const IDENTIFIER =
  /\b(?:date of birth|dob|social security(?: number)?|ssn|medical record number|mrn|email address|phone number|home address)\b|\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DATA_EXECUTION =
  /\b(?:analy[sz]e|process|review|interpret|classify|evaluate|assess|upload|use|summari[sz]e|annotate)\b/i;
const SENSITIVE_DATA_MATERIAL =
  /\b(?:raw\s+)?(?:patient|participant|subject|individual)[- ]level\b|\b(?:raw\s+)?(?:genomic|genetic|dna|vcf|variant|genotype|wes|wgs|rna[- ]?seq)\s+(?:data|records?|files?|results?)\b|\b(?:patient|participant|subject)\s+(?:records?|files?|data)\b/i;
const EXPLICITLY_IDENTIFIABLE =
  /\b(?:identifiable|identified|non[- ]anonymized|not anonymized)\b[\s\S]{0,100}\b(?:patient|participant|subject|individual|data|records?|files?)\b/i;
const NAMED_SENSITIVE_SOURCE =
  /\bfrom\s+(?:(?:patient|participant|subject|dr)\.?\s+)?(?:\p{Lu}\.?|\p{Lu}[\p{Ll}'-]+)(?:\s+(?:\p{Lu}\.?|\p{Lu}[\p{Ll}'-]+)){1,2}\b/u;

function hasUnsafeSensitiveData(text) {
  if (IDENTIFIER.test(text) || EXPLICITLY_IDENTIFIABLE.test(text)) return true;

  return splitIntentClauses(text).some((clause) => {
    if (!DATA_EXECUTION.test(clause) || !SENSITIVE_DATA_MATERIAL.test(clause)) return false;
    if (NAMED_SENSITIVE_SOURCE.test(clause)) return true;
    return !isAggregateResearchIntent(clause);
  });
}

const PERSONAL_SENSITIVE_OWNERSHIP =
  /\b(?:my|your|mine|yours)\s+(?:own\s+)?(?:[\w-]+\s+){0,3}(?:symptoms?|pain|headaches?|variants?|mutations?|genotyp\w*|phenotyp\w*|vcf|diagnos\w*|risk|medications?|medicines?|drugs?|dos(?:e|ing|age)|treatments?|therap(?:y|ies)|screening|prognosis|metabolizer|pharmacogen\w*|health|condition|disease|care|results?|report|test)\b/i;
const OWNED_OR_CARRIED_GENOMICS =
  /\b(?:variants?|mutations?|vcf|genotyp\w*|genomic data|genetic data|dna results?)\b[\s\S]{0,100}\b(?:belongs? to me|is mine|are mine|came from my|i (?:carry|carried|inherited))\b|\b(?:variants?|mutations?)\s+i\s+(?:carry|carried|inherited)\b/i;
const FAMILY_OR_PATIENT_CARE =
  /(?:\b(?:my|your)\s+(?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member|patient)\b[\s\S]{0,160}\b(?:risk|diagnos\w*|symptoms?|pain|variants?|mutations?|genotyp\w*|medications?|dos(?:e|ing)|treatments?|screen\w*|prognosis|pathogenic\w*)\b|\b(?:risk|diagnos\w*|symptoms?|pain|variants?|mutations?|genotyp\w*|medications?|dos(?:e|ing)|treatments?|screen\w*|prognosis|pathogenic\w*)\b[\s\S]{0,160}\b(?:my|your)\s+(?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member|patient)\b|\bthis patient\b[\s\S]{0,120}\b(?:risk|diagnos\w*|symptoms?|pain|treatment|medication|dose|screening)\b)/i;

const SAFE_FIRST_PERSON_RESEARCH_OBJECT =
  /^(?:\s*(?:an?|the|my)\s+)?(?:question|research question|idea|hypothesis|course|class|lesson|study|project|data ?set|data|model|analysis|research task|workflow|tool|method|software|script|pipeline)\b/i;

function hasUnsafeFirstPersonClaim(text) {
  const aggregateResearchIntent = isAggregateResearchIntent(text);
  for (const clause of splitIntentClauses(text)) {
    const claim = /\b(?:i have|i['’]ve got)\b([\s\S]*)/i.exec(clause);
    if (!claim) continue;
    if (isAggregateResearchIntent(clause)) continue;
    // A cohort operation may be stated in the next semicolon-delimited clause
    // (the exact RNA-seq workflow does this). The ownership clause itself must
    // still carry explicit aggregate evidence; generic "I have ..." cannot
    // borrow safe-looking research boilerplate from a later clause.
    if (aggregateResearchIntent && AGGREGATE_EVIDENCE.test(clause)) continue;
    if (SAFE_FIRST_PERSON_RESEARCH_OBJECT.test(claim[1])) continue;
    return true;
  }
  return false;
}

const SAFE_TAKING_OR_USING_OBJECT =
  /^(?:\s*(?:a|an|the|this|that|my)\s+)?(?:course|class|workshop|lesson|training|notes?|break|walk|look|approach|position|survey|exam|test|route|photos?|samples?|measurements?|data|data ?set|steps?|study|project|analysis|research|experiment|tool|method|software|package|library|algorithm|protocol|assay|code|script|pipeline|workflow|model)\b/i;

function hasUnsafeMedicationDisclosure(text) {
  const disclosures = text.matchAll(/\bi\s+(?:am\s+|['’]m\s+)?(?:currently\s+)?(?:take|taking|use|using)\b([^.;!?]*)/gi);
  for (const match of disclosures) {
    const prefix = text.slice(Math.max(0, match.index - 16), match.index);
    // Modal choices are evaluated below as either a personal care decision or
    // an explicit cohort-design decision; they are not bare disclosures.
    if (/\b(?:should|can|could|would)\s*$/i.test(prefix)) continue;
    if (!SAFE_TAKING_OR_USING_OBJECT.test(match[1])) return true;
  }
  return /\bi am positive for\s+(?!(?:using|taking)\s+(?:(?:a|an|the|this|that|my)\s+)?(?:course|class|study|project|method|tool|software|model)\b)\S+/i.test(text);
}

const DIRECT_DIAGNOSIS_OR_CARE =
  /(?:\b(?:can|could|would|will)\s+you\s+(?:diagnos\w*|treat|screen|prescribe|recommend)\b|(?:^|[.!?]\s*)\s*(?:diagnos\w*|treat me|screen me|prescribe)\b|\b(?:diagnos\w*|treat|screen|assess|evaluate|interpret|classify)\s+(?:me|myself)\b)/i;
const PERSONAL_CLINICAL_DECISION =
  /\b(?:should|can|could|would)\s+i\s+(?:take|use|choose|receive|start|stop|change|increase|decrease)\b|\bwhat\s+(?:treatment|medicine|medication|drug|dose)\s+should\s+i\s+(?:take|use|choose|receive)\b|\b(?:for|to)\s+myself\b/i;
const RESEARCH_DESIGN_DECISION =
  /\b(?:include|use|choose)\b[\s\S]{0,100}\bas\s+(?:an?\s+)?(?:[\w-]+\s+){0,2}(?:covariate|endpoint|outcome|variable)\b/i;
const PERSONAL_CLINICAL_HELP =
  /\bi\s+(?:need|want)\b[\s\S]{0,100}\b(?:help|advice|guidance|options?)\b[\s\S]{0,100}\b(?:symptoms?|pain|diagnos\w*|risk|variants?|mutations?|medications?|dos(?:e|ing)|treatments?|screen\w*|disease|condition)\b|\bi\s+(?:need|want)\b[\s\S]{0,100}\b(?:symptoms?|pain|diagnos\w*|risk|variants?|mutations?|medications?|dos(?:e|ing)|treatments?|screen\w*)\b[\s\S]{0,80}\b(?:help|advice|guidance|options?)\b/i;
const PERSONAL_SYMPTOM_OR_FUTURE_DISEASE =
  /\bmy\s+(?:[\w-]+\s+){0,2}(?:hurts?|aches?|is painful)\b|\b(?:symptoms?|pain)\b[\s\S]{0,100}\b(?:what should i do|what do i do|what could it be|could it be|do i need a doctor)\b|\bi(?:['’]ve| have)\s+been\s+(?:having|experiencing|feeling)\b[\s\S]{0,100}\b(?:symptoms?|pain)\b|\b(?:this|these|that|those)\s+(?:variants?|mutations?)\b[\s\S]{0,120}\b(?:symptoms?|pain)\b[\s\S]{0,80}\bi(?:['’]ve| have)\s+been\b|\b(?:will|might|could|may)\s+i\s+(?:get|develop|have|be diagnosed)\b/i;
const PERSONAL_EXPLANATION_OR_ACTION =
  /\bwhat does\b[\s\S]{0,100}\b(?:mean for me|my\s+(?:care|health|risk))\b|\bwhat should i do\s+(?:about|with|for)\s+my\b|\b(?:do|could|can|would)\s+(?:these|this|my)\s+(?:symptoms?|pain)\b[\s\S]{0,100}\b(?:mean|indicate|suggest|show|explain)\b/i;
const DIRECT_SENSITIVE_OBJECT =
  /\b(?:interpret|explain|assess|evaluate|classify)\w*\b[\s\S]{0,80}\b(?:this|these|that|those|my|your)\s+(?:genetic\s+)?(?:variants?|mutations?|vcf|results?|report|test)\b/i;
const PERSONALIZED_PGX_OR_DOSING =
  /\b(?:calculate|determine|estimate|recommend|adjust|choose)\b[\s\S]{0,140}\b(?:warfarin|dos(?:e|ing|age)|amount|requirement)\b[\s\S]{0,140}\b(?:cyp[0-9a-z-]*|genotyp\w*|phenotyp\w*|metabolizer|pharmacogen\w*)\b|\b(?:warfarin|medications?|medicines?|drugs?)\b[\s\S]{0,140}\b(?:cyp[0-9a-z-]*|genotyp\w*|phenotyp\w*|metabolizer|pharmacogen\w*)\b[\s\S]{0,100}\b(?:dose|dosing|amount|tonight|change|adjust|increase|decrease)\b/i;
const PERSONAL_HEREDITY =
  /\b(?:could|can|might)\s+my\s+(?!(?:data|data ?set|model|study|analysis|experiment|lab|research|project)\b)[\w -]{1,60}\s+be\s+(?:genetic|hereditary|inherited)\b|\b(?:is|could|does)\s+[a-z0-9_-]{2,20}\s+(?:the reason\s+)?why\s+i have\b/i;

function hasDirectPersonalOrClinicalExecution(text) {
  if (
    PERSONAL_SENSITIVE_OWNERSHIP.test(text)
    || OWNED_OR_CARRIED_GENOMICS.test(text)
    || FAMILY_OR_PATIENT_CARE.test(text)
    || hasUnsafeFirstPersonClaim(text)
    || hasUnsafeMedicationDisclosure(text)
    || DIRECT_DIAGNOSIS_OR_CARE.test(text)
    || PERSONAL_CLINICAL_HELP.test(text)
    || PERSONAL_SYMPTOM_OR_FUTURE_DISEASE.test(text)
    || PERSONAL_EXPLANATION_OR_ACTION.test(text)
    || DIRECT_SENSITIVE_OBJECT.test(text)
    || PERSONALIZED_PGX_OR_DOSING.test(text)
    || PERSONAL_HEREDITY.test(text)
  ) return true;

  if (PERSONAL_CLINICAL_DECISION.test(text)) {
    return !(isAggregateResearchIntent(text) && RESEARCH_DESIGN_DECISION.test(text));
  }
  return false;
}

const GENETICS_DOMAIN =
  /\b(?:gene|genes|genetic|genetics|genomic|genomics|dna|rna|chromosome|variant|mutation|allele|inheritance|phenotype|genotype|protein|cell|molecular|transcription|translation|crispr|gwas|hpo|vcf|pharmacogenomics?)\b/i;
const GENE_SYMBOL = /\b[A-Z]{2,}[A-Z0-9-]{0,9}\b/;
const EDUCATION_FRAME =
  /\b(?:explain|describe|teach|learn(?:ing)?|lesson|course|what (?:is|are)|how (?:does|do|is|are)|why (?:does|do|is|are)|overview|definition|difference between|help me understand|tell me about|tell me more)\b/i;
const CANDIDATE_RESEARCH_CONTRACT =
  /\b(?:candidate[- ]gene|candidate genes|gene[- ]phenotype|genomics assistant|genetics search|gene symbols?|for the (?:human )?gene|phenotype terms?|hpo terms?)\b/i;
const HYPOTHESIS_CONTRACT =
  /\b(?:scientific hypothesis generator|generate (?:novel,? )?testable hypotheses|research hypotheses|multi-omic integration|experimental design|data analysis pipeline)\b/i;
const LEARNING_SUMMARY_CONTRACT =
  /\bgenetics education and research assistant\b[\s\S]{0,500}\blearning activity\b[\s\S]{0,1000}\bresearch-learning observations?\b/i;
const PROMPT_CONTROL_OR_UNRELATED_OUTPUT =
  /\b(?:ignore|disregard|override|bypass|forget)\b[\s\S]{0,80}\b(?:previous|prior|above|system|developer|instructions?|prompt|rules?)\b|\b(?:system|developer)\s*:\s*|\b(?:reveal|repeat|print|show)\b[\s\S]{0,80}\b(?:system|developer)\s+(?:message|prompt|instructions?)\b|\b(?:phish(?:ing)?|malware|ransomware|credential theft|steal (?:a )?password|real[- ]estate advertisement|marketing copy|quarterly sales|sales forecast|vacation itinerary)\b|\b(?:write|compose|draft|send|create|generate)\b[\s\S]{0,80}\b(?:phishing\s+)?(?:email|advertisement|ad copy|malware|ransomware|exploit|social media post)\b/i;
const CUSTOM_EDUCATION_TOPIC_SHAPE =
  /^[\p{L}\p{N}][\p{L}\p{N} \t&'’()+,./?-]{0,159}$/u;

function isGenericGeneticsEducation(text) {
  return !PROMPT_CONTROL_OR_UNRELATED_OUTPUT.test(text)
    && EDUCATION_FRAME.test(text)
    && (GENETICS_DOMAIN.test(text) || GENE_SYMBOL.test(text));
}

function isRouteOwnedGeneticsTopic(body) {
  const topic = typeof body?.topic === 'string' ? body.topic.trim() : '';
  if (!topic) return false;
  if (typeof body?.context === 'string' && body.context.trim()) return false;

  const topicKey = topic.toLowerCase().replace(/\s+/g, ' ');
  if (KNOWN_EDUCATION_TOPICS.has(topicKey)) return true;
  return CUSTOM_EDUCATION_TOPIC_SHAPE.test(topic)
    && !PROMPT_CONTROL_OR_UNRELATED_OUTPUT.test(topic)
    && (GENETICS_DOMAIN.test(topic) || GENE_SYMBOL.test(topic));
}

function taskContractAllows(task, text) {
  if (!text.trim()) return false;
  if (PROMPT_CONTROL_OR_UNRELATED_OUTPUT.test(text)) return false;

  switch (task) {
    case PUBLICATION_TASKS.GENETICS_EDUCATION:
      return isGenericGeneticsEducation(text);
    case PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH:
      return isAggregateResearchIntent(text);
    case PUBLICATION_TASKS.CANDIDATE_GENE_RESEARCH:
      return CANDIDATE_RESEARCH_CONTRACT.test(text)
        && (GENETICS_DOMAIN.test(text) || GENE_SYMBOL.test(text) || isAggregateResearchIntent(text));
    case PUBLICATION_TASKS.RESEARCH_HYPOTHESIS:
      return HYPOTHESIS_CONTRACT.test(text)
        && (GENETICS_DOMAIN.test(text) || isAggregateResearchIntent(text));
    case PUBLICATION_TASKS.LEARNING_ACTIVITY_SUMMARY:
      return LEARNING_SUMMARY_CONTRACT.test(text);
    default:
      return false;
  }
}

function requestedTask(body) {
  const topLevel = typeof body?.publicationTask === 'string' ? body.publicationTask.trim() : '';
  const optionLevel = typeof body?.options?.publicationTask === 'string'
    ? body.options.publicationTask.trim()
    : '';
  if (topLevel && optionLevel && topLevel !== optionLevel) return null;
  return topLevel || optionLevel || '';
}

function block(message) {
  return {
    statusCode: 403,
    code: 'EDUCATION_RESEARCH_BOUNDARY',
    message,
  };
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

  if (SAFE_NON_GENERATION_EDUCATION_ROUTES.has(path)) return null;

  const routeOwnedTask = ROUTE_OWNED_TASKS.get(path);
  const needsClientTask = CLIENT_TASK_ROUTES.has(path);
  const isUnknownGenerationRoute = !routeOwnedTask
    && !needsClientTask
    && (hasPathPrefix(path, '/llm') || hasPathPrefix(path, '/education'));
  if (!routeOwnedTask && !needsClientTask && !isUnknownGenerationRoute) return null;

  const agent = typeof body?.agent === 'string' ? body.agent.trim().toLowerCase() : '';
  if (HIGH_RISK_AGENT_IDS.has(agent)) {
    return block('Personalized clinical AI is not available in this published build.');
  }

  const suppliedTask = requestedTask(body);
  if (suppliedTask === null) {
    return block('Conflicting publication tasks are not accepted.');
  }
  if (isUnknownGenerationRoute) {
    return block('This generation route is not available in the published build.');
  }

  const task = routeOwnedTask || suppliedTask;
  if (routeOwnedTask && suppliedTask && suppliedTask !== routeOwnedTask) {
    return block('The supplied publication task does not match this education route.');
  }
  if (!routeOwnedTask && (!task || !ALL_PUBLICATION_TASKS.has(task))) {
    return block('A recognized education or research publication task is required.');
  }

  const text = generationText(body);
  if (hasUnsafeSensitiveData(text) || hasDirectPersonalOrClinicalExecution(text)) {
    return block('GeneMap supports general genetics education and explicit aggregate research, not personal or identifiable clinical/genomic requests.');
  }

  const satisfiesTaskContract = routeOwnedTask
    ? isRouteOwnedGeneticsTopic(body)
    : taskContractAllows(task, text);
  if (!satisfiesTaskContract) {
    return block('This request does not satisfy the declared education or aggregate-research task.');
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
  hasDirectPersonalOrClinicalExecution,
  hasUnsafeSensitiveData,
  isAggregateResearchIntent,
  isRouteOwnedGeneticsTopic,
  normalizePath,
  policyPath,
  requestedTask,
  safeDecodePath,
  splitIntentClauses,
  taskContractAllows,
  HIDDEN_PATH_PREFIXES,
  HIGH_RISK_AGENT_IDS,
};
