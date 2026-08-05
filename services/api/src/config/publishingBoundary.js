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
const RESEARCH_DESIGN_CARE_SELECTION =
  /\b(?:should|can|could|would)\s+i\s+(?:choose|use|include)\b[\s\S]{0,80}\bas\s+(?:an?\s+)?(?:[\w-]+\s+){0,2}(?:endpoint|outcome|covariate|variable)\b/i;
const NONCLINICAL_PERSONAL_TARGET =
  String.raw`(?:data|data ?sets?|samples?|sample size|statistical power|power|variance|coverage|replicates?|controls?|models?|stud(?:y|ies)|analys(?:is|es)|experiments?|research|projects?|workflows?|tools?|methods?|software|courses?|classes?|lessons?|notes?|code|scripts?|pipelines?|results? tables?|figures?|plots?)`;
const EXPLICIT_PERSONAL_CARE_FOLLOWUP = new RegExp(
  String.raw`(?:\b(?:tell me\s+)?how much\s+(?!${NONCLINICAL_PERSONAL_TARGET}\b)(?=[\s\S]{0,100}\b(?:safe|right|appropriate|recommended|best)\b)(?=[\s\S]{0,120}\bfor (?:me|myself)\b)|\b(?:choose|select|recommend)\s+(?:(?:the|a)\s+)?(?:(?:right|best|appropriate)\s+)?(?!${NONCLINICAL_PERSONAL_TARGET}\b)(?=[\s\S]{0,100}\bfor (?:me|myself)\b)|\bwhat should i do\s+(?:about|with|for)\s+my\s+(?!${NONCLINICAL_PERSONAL_TARGET}\b)|\b(?:medication|medicine|drug|treatment)\b[\s\S]{0,80}\b(?:should i|i should)\s+(?:take|use|choose|start|stop|change)\b)`,
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
const DIRECT_DIAGNOSIS_OF_PERSONAL_EXPERIENCE =
  /\bdiagnos\w*\b[\s\S]{0,100}\b(?:what(?:ever)?|the\s+(?:issue|problem|condition|thing))\s+(?:i\s+(?:(?:am|was|have been)\s+)?(?:experienc(?:e|ed|ing)|feel(?:t|ing)?|hav(?:e|ing))|i(?:['’]ve)\s+been\s+(?:experiencing|feeling|having))\b/i;
const CLINICAL_THEN_PERSONAL_EXPERIENCE =
  /\b(?:symptoms?|pain)\b(?:\s+(?:that|which))?\s+i\s+(?:(?:am|was|have been)\s+)?(?:experienc(?:e|ed|ing)|feel(?:t|ing)?|hav(?:e|ing)\s+(?:symptoms?|pain))\b/i;
const DIRECT_CLINICAL_ACTION_ON_SELF = new RegExp(
  String.raw`(?:\b(?:diagnos\w*|screen\w*|treat)\s+(?:me|myself)\b|\b(?:assess|evaluate|interpret|classify)\s+(?:me|myself)\b[\s\S]{0,40}\b(?:for|based on|using|with|because of|from)\b[\s\S]{0,80}${CLINICAL_ACTION})`,
  'i'
);
const DIRECT_GENETIC_ACTION_ON_SELF =
  /\b(?:[Aa]ssess|[Ee]valuate|[Ii]nterpret|[Cc]lassify)\s+(?:me|myself)\b[\s\S]{0,40}\b(?:for|based on|using|with|because of|from)\s+(?:my\s+)?(?:[A-Z][A-Z-]{1,15}|[A-Za-z][A-Za-z0-9-]*\d[A-Za-z0-9-]*)\b/;
const DIRECT_SYMPTOM_ACTION =
  /\b(?:[\w-]+\s+)?pain\b(?!\s+(?:point|points|index|score|scale|measure|measurement|variable|variables|phenotype|phenotypes)\b)[\s\S]{0,120}\b(?:what should i do|what do i do|what could it be|could it be|should i seek|is this (?:serious|urgent)|do i need (?:a )?doctor)\b/i;
const PERSONAL_BODY_COMPLAINT =
  /\bmy\s+(?:[\w-]+\s+){0,2}(?:hurts?|aches?|is painful)\b/i;
const NONCLINICAL_I_HAVE_OBJECT =
  String.raw`(?:a\s+(?:question|course|class|lesson|study|project|dataset|data set|model|analysis|research task)|(?:(?:anonymized|de-identified|deidentified|aggregate)(?:\s+aggregate)?\s+)?(?:wes|wgs|rna[- ]?seq|genotype|genomic|transcriptomic|proteomic)\s+data|(?:(?:an?|the)\s+)?(?:anonymized|de-identified|deidentified|aggregate)(?:\s+aggregate)?\s+cohort|pilot study|condition labels)`;
const FIRST_PERSON_UNSPECIFIED_CARE_FOLLOWUP = new RegExp(
  String.raw`\bi have\s+(?!${NONCLINICAL_I_HAVE_OBJECT}\b)[\s\S]{0,140}\b(?:what are my options|what can i do|what should i do|what now|what does that mean|what do they mean|explain it)\b`,
  'i'
);
const REPORTED_PERSONAL_CONDITION = new RegExp(
  String.raw`(?:\bi was told\s+(?:that\s+)?i have\s+(?!${NONCLINICAL_I_HAVE_OBJECT}\b)|\b(?:my|the|a)\s+doctor\s+(?:says|said|told me)\b[\s\S]{0,80}\bi have\s+(?!${NONCLINICAL_I_HAVE_OBJECT}\b))`,
  'i'
);
const PERSONAL_HEREDITY_QUESTION =
  /\b(?:could|can|might)\s+my\s+(?!(?:dataset|data|model|study|analysis|experiment|lab|research|project)\b)[\w -]{1,60}\s+be\s+(?:genetic|hereditary|inherited)\b/i;
const PERSONAL_GENE_CAUSATION_QUESTION =
  /\b(?:is|could|does)\s+[a-z0-9_-]{2,20}\s+(?:the reason\s+)?why\s+i have\s+(?!no\s+(?:association|signal|result)\b)/i;
const PERSONALIZED_DOSE_CALCULATION =
  /\b(?:calculate|determine|estimate|recommend|choose|adjust)\b[\s\S]{0,160}\b(?:dose|dosing|dosage|amount|requirement)\b[\s\S]{0,160}\b(?:for|based on)\s+my\b[\s\S]{0,80}\b(?:cyp[0-9a-z-]*|genotyp\w*|phenotyp\w*|variants?|mutations?|metabolizer|pharmacogen\w*)\b/i;
const SAFE_RESEARCH_AMOUNT_CALCULATION =
  /\b(?:calculate|determine|estimate|recommend|choose|adjust)\s+(?:the\s+)?(?:(?:sequencing(?:[- ]depth)?|read(?:s| depth)?|coverage|depth|sample size|panel size|library size|assay size|replicates?|statistical power)\s+(?:amount|requirement)|(?:amount|requirement)\s+(?:of|for)\s+(?:sequencing(?:[- ]depth)?|read(?:s| depth)?|coverage|depth|sample size|panel size|library size|assay size|replicates?|statistical power))\b[\s\S]{0,160}\b(?:for|based on)\s+my\b[\s\S]{0,80}\b(?:genotyp\w*|phenotyp\w*|genomic|genetic|transcriptomic|proteomic)\s+(?:study|data ?set|analysis|model|cohort|project|experiment)\b/gi;
const PERSONAL_CARRIED_VARIANT_INTERPRETATION =
  /\b(?:assess|interpret|classify|evaluate|determine)\w*\b[\s\S]{0,140}\b(?:variants?|mutations?)\s+i\s+(?:carry|have|inherited)\b/i;
const PERSONAL_INHERITED_VARIANT_CARE =
  /\b(?:recommend|create|provide|design|suggest)\w*\b[\s\S]{0,140}\b(?:screen\w*|treatments?|therap(?:y|ies)|monitoring|surveillance)\b[\s\S]{0,180}\b(?:variants?|mutations?|results?)\s+i\s+(?:inherited|carry|have)\b/i;
const PERSONAL_GENETIC_MATERIAL_OWNERSHIP =
  /\b(?:vcf|variants?|mutations?|genotyp\w*|genomic data|genetic data|dna results?)\b[\s\S]{0,120}\b(?:belongs? to me|is mine|are mine|came from my|from my (?:test|sample|data))\b/i;
const PERSONAL_MEDICATION_PGX =
  /\b(?:medications?|medicines?|drugs?)\s+i\s+(?:use|take|am taking|am using)\b[\s\S]{0,180}\b(?:my\s+)?(?:cyp[0-9a-z-]*|genotyp\w*|phenotyp\w*|metabolizer|pharmacogen\w*)\b/i;
const PERSONAL_PGX_INTERPRETATION =
  /\b(?:what does|interpret|explain|assess)\s+my\s+(?:cyp[0-9a-z-]+|[\w-]+)\s+(?:genotyp\w*|phenotyp\w*|status|results?)\b[\s\S]{0,120}\b(?:mean|medications?|medicines?|drugs?|dos(?:e|ing)|warfarin)\b/i;
const PERSONAL_MEDICATION_ADJUSTMENT_BY_MARKER = new RegExp(
  String.raw`\b(?:how|what)\s+should\s+my\s+(?!${NONCLINICAL_PERSONAL_TARGET}\b)[\w-]+\b[\s\S]{0,100}\b(?:change|adjust|increase|decrease)\b[\s\S]{0,140}\b(?:cyp[0-9a-z-]+|genotyp\w*|phenotyp\w*|metabolizer|pharmacogen\w*)\b`,
  'i'
);
const NONCLINICAL_TAKING_ACTIVITY =
  String.raw`(?:(?:a|an|the|this|that|my)\s+)?(?:[\w-]+\s+){0,3}(?:course|class|workshop|lesson|training|notes?|break|walk|look|approach|position|survey|exam|test|route|train|bus|taxi|photos?|pictures?|samples?|measurements?|data|dataset|steps?|part|interest|issue|action|time|study|project|analysis|research|experiment|tool|method|software|package|library|algorithm|protocol|assay|code|script|pipeline|workflow|search|review|reading|writing|calculation|simulation|model|modeling|size|coverage|power|resolution|quality|replicates?|controls?|design)\b`;
const NONCLINICAL_POSITIVE_FOR_OBJECT =
  String.raw`(?:(?:using|taking)\s+)?${NONCLINICAL_TAKING_ACTIVITY}`;
const PERSONAL_TEST_OR_RESULT = new RegExp(
  String.raw`(?:\bmy\s+(?:raw\s+)?(?:(?:lab|dna|genetic|genomic)\s+)?(?:report|results?|test)\b[\s\S]{0,160}\b(?:shows?|found|positive|mean|interpret|explain)\b|\bhere (?:are|is) my\s+(?:raw\s+)?(?:dna|genetic|genomic)\s+(?:report|results?|test)\b[\s\S]{0,120}\b(?:mean|interpret|explain)\b|\bi am positive for\s+(?!${NONCLINICAL_POSITIVE_FOR_OBJECT})\S+)`,
  'i'
);
const FIRST_PERSON_FUTURE_DISEASE =
  /(?:\bi\s+need\s+to\s+know\b[\s\S]{0,180}\bi\s+(?:will|might|could|may)\s+(?:get|develop|have|be diagnosed)|\b(?:will|might|could|may)\s+i\s+(?:get|develop|have|be diagnosed))/i;
const DIRECT_PERSONAL_CLINICAL_HELP =
  /(?:\bi need\s+(?:help|advice|guidance)\s+(?:(?:with|on|for)\s+)?(?:(?:these|this|my)\s+)?(?:\w+\s+)?(?:symptoms?|pain)\b|\bi need\s+(?:symptoms?|pain)\s+(?:help|advice|guidance)\b)/i;
const CLEAR_NONCLINICAL_TAKING = new RegExp(
  String.raw`\bi(?:['’]m| am)\s+(?:currently\s+)?taking\s+${NONCLINICAL_TAKING_ACTIVITY}`,
  'i'
);
const CLEAR_NONCLINICAL_USING = new RegExp(
  String.raw`\bi(?:['’]m| am)\s+(?:currently\s+)?using\s+${NONCLINICAL_TAKING_ACTIVITY}`,
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
  /\b(?:analy[sz](?:e|ing|is)|assess(?:ing|ment)?|calculat(?:e|ing|ion)|compar(?:e|ing|ison)|identif(?:y|ying)|associat(?:e|ion)|model(?:ing)?|estimat(?:e|ing)|test(?:ing)?|evaluat(?:e|ing|ion)|explor(?:e|ing|atory)|investigat(?:e|ing|ion)|includ(?:e|ing)|review(?:ing)?|summari[sz](?:e|ing)|prioriti[sz](?:e|ing)|annotat(?:e|ing|ion)|covariates?|endpoints?|outcomes?|variables?|data ?sets?|cohort[- ]level|population[- ]level|variant calling)\b/i;
const RESEARCH_WORK_PRODUCT =
  /\b(?:pilot study|research (?:study|project|analysis)|case-control (?:study|analysis)|observational study|exploratory analysis)\b/i;
const STRUCTURED_RESEARCH_MATERIAL =
  /\b(?:data|data ?sets?|counts?|annotations?|variables?|samples?|cohort|controls?|case-control|population[- ]level)\b/i;
const SENSITIVE_PATIENT_DATA_ACTION =
  String.raw`(?:\b(?:i|we)\s+(?:have|hold|possess|received)\b|\bi was told\s+(?:that\s+)?i have\b|\b(?:analy[sz]e|process|use|review|summari[sz]e|upload|interpret)\s+(?:these|this|the|my|our)\b|\bhere (?:are|is)\b|\b(?:these|this) (?:are|is)\b)`;
const SENSITIVE_PATIENT_DATA_OBJECT =
  String.raw`(?:(?:(?<!\bnon-)(?<!\bnon )(?<!\bnot )\bidentifiable\b|\b(?:non[- ]anonymized|not anonymized)\b)[\s\S]{0,100}\b(?:patient|participant|subject|individual|data|records?|files?|wes|wgs|rna[- ]?seq|genotyp\w*|variants?)\b|\braw\s+(?:patient|participant|subject|individual)[- ]level\b[\s\S]{0,100}\b(?:data|records?|files?|wes|wgs|rna[- ]?seq|genotyp\w*|variants?)\b)`;
const EXPLICIT_IDENTIFIABLE_PATIENT_DATA = new RegExp(
  String.raw`(?:${SENSITIVE_PATIENT_DATA_ACTION}[\s\S]{0,240}${SENSITIVE_PATIENT_DATA_OBJECT}|${SENSITIVE_PATIENT_DATA_OBJECT}[\s\S]{0,240}${SENSITIVE_PATIENT_DATA_ACTION})`,
  'i'
);
const RAW_GENOMIC_DATA_WITH_IDENTIFIER =
  /\b(?:raw\s+)?(?:genomic|genetic|dna|vcf|variant)\s+(?:data|records?|files?)\b[\s\S]{0,240}\b(?:date of birth|dob|social security(?: number)?|ssn|medical record number|mrn|email address|phone number|home address)\b/i;
const RAW_GENOMIC_DATA_SOURCE_REQUEST =
  /\b(?:analy[sz]e|process|review|interpret|use)\b[\s\S]{0,140}\braw\s+(?:genomic|genetic|dna|vcf|variant)\s+(?:data|records?|files?)\b[\s\S]{0,120}\bfrom\s+([\p{L}'-]+\s+[\p{L}'-]+)/giu;
const PROPER_NAMED_PERSON =
  /^\p{Lu}[\p{L}'-]+\s+\p{Lu}[\p{L}'-]+$/u;
const SAFE_RAW_GENOMIC_RESEARCH_SOURCE =
  /^(?:(?:an?|the)\s+)?(?:anonymized|de-identified|deidentified|aggregate|public|synthetic|cohort|study|data ?set|samples?|controls?|repository|database|biobank|sequencing)\b/i;

function hasRawGenomicDataFromNamedPerson(text) {
  return [...text.matchAll(RAW_GENOMIC_DATA_SOURCE_REQUEST)].some((match) => {
    const source = match[1];
    return !SAFE_RAW_GENOMIC_RESEARCH_SOURCE.test(source)
      && PROPER_NAMED_PERSON.test(source);
  });
}
const SAFE_AGGREGATE_GENETIC_PROVENANCE =
  /\b(?:vcf|variants?|mutations?|genotyp\w*|genomic data|genetic data|dna results?)\b[\s\S]{0,120}\b(?:came from|from) my\s+(?:(?:anonymized|de-identified|deidentified|aggregate)\s+)+(?:cohort|data ?set|study|samples?|records?)\b/gi;
const SAFE_AGGREGATE_VARIANTS_I_HAVE =
  /\b(?:assess|interpret|classify|evaluate|determine)\w*\b[\s\S]{0,140}\b(?:variants?|mutations?)\s+i\s+have\b[\s\S]{0,80}\b(?:in|from|for)\s+(?:my\s+)?(?:(?:an?|the)\s+)?(?:(?:anonymized|de-identified|deidentified|aggregate)\s+)*(?:cohort|data ?set|study|samples?|records?)\b/gi;
const SAFE_AGGREGATE_MY_RESULTS =
  /\bmy results?\b[\s\S]{0,100}\b(?:anonymized|de-identified|deidentified|aggregate)\b[\s\S]{0,80}\b(?:cohort|samples?|data)\b/gi;
const SAFE_AGGREGATE_MY_RESEARCH_MEASURE =
  /\bmy\s+(?:(?:genetic\s+)?(?:variants?|mutations?|genotyp\w*|symptoms?|conditions?|treatments?|medications?|drugs?)[- ](?:data|annotations?|counts?|labels?|variables?|covariates?|responses?|endpoints?|outcomes?|tables?|models?)|(?:treatment|medication|drug)[- ]responses?(?:\s+(?:data|variables?|covariates?|endpoints?|outcomes?|tables?|models?))?)\b/gi;
const SAFE_MY_RESEARCH_CONTEXT =
  /\bmy\s+(?:(?:genetic\s+)?(?:variants?|mutations?)|genotyp\w*|phenotyp\w*|genomic|genetic|transcriptomic|proteomic)\s+(?:study|data ?set|analysis|model|cohort|project|experiment)\b/gi;
const SAFE_AGGREGATE_PATIENT_RESEARCH_MEASURE =
  /\b(?:each|every|the)\s+patient(?:['’]s)\s+(?:(?:genetic\s+)?(?:variants?|mutations?|genotyp\w*|symptoms?|conditions?|treatments?|medications?|drugs?)[- ](?:data|annotations?|counts?|labels?|variables?|covariates?|responses?|endpoints?|outcomes?|tables?|models?)|(?:treatment|medication|drug)[- ]responses?(?:\s+(?:data|variables?|covariates?|endpoints?|outcomes?|tables?|models?))?)\b/gi;
const PATIENT_OR_FAMILY =
  String.raw`(?:\bthis patient\b(?!\s+(?:cohort|group|population|sample|data ?set|data|records?)\b)|\bmy patient(?:['’]s)?\b|\bthe patient['’]s\b|\bpatient['’]s\b|\bmy (?:child|son|daughter|mother|father|parent|sibling|brother|sister|spouse|partner|family member)(?:['’]s)?\b)`;
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
  const aggregateResearchIntent = isAggregateResearchIntent(text);
  const clearNonclinicalProgressiveActivity = CLEAR_NONCLINICAL_TAKING.test(text)
    || (aggregateResearchIntent && CLEAR_NONCLINICAL_USING.test(text));
  const exposesPatientLevelData = EXPLICIT_IDENTIFIABLE_PATIENT_DATA.test(text);
  const researchContextText = text.replace(SAFE_MY_RESEARCH_CONTEXT, '');
  const broadClinicalText = aggregateResearchIntent
    ? researchContextText
      .replace(SAFE_AGGREGATE_MY_RESULTS, '')
      .replace(SAFE_AGGREGATE_MY_RESEARCH_MEASURE, '')
      .replace(SAFE_AGGREGATE_PATIENT_RESEARCH_MEASURE, '')
    : researchContextText;
  const personalCarriedVariantText = aggregateResearchIntent
    ? text.replace(SAFE_AGGREGATE_VARIANTS_I_HAVE, '')
    : text;
  const personalGeneticMaterialText = aggregateResearchIntent
    ? text.replace(SAFE_AGGREGATE_GENETIC_PROVENANCE, '')
    : text;
  const personalizedDoseText = text.replace(SAFE_RESEARCH_AMOUNT_CALCULATION, '');
  if (
    exposesPatientLevelData
    || DIRECT_PERSONAL_CARE_REQUEST.test(text)
    || (
      CARE_THEN_PERSONAL_DECISION.test(text)
      && !(aggregateResearchIntent && RESEARCH_DESIGN_CARE_SELECTION.test(text))
    )
    || (
      EXPLICIT_PERSONAL_CARE_FOLLOWUP.test(text)
      && !(aggregateResearchIntent && RESEARCH_DESIGN_CARE_SELECTION.test(text))
    )
    || PERSONAL_VARIANT_INTERPRETATION.test(text)
    || PERSONAL_RESULT_INTERPRETATION.test(text)
    || PERSONAL_VARIANT_SYMPTOM_LINK.test(text)
    || PERSONAL_SYMPTOM_DIAGNOSIS_QUESTION.test(text)
    || DIRECT_DIAGNOSIS_OF_PERSONAL_EXPERIENCE.test(text)
    || CLINICAL_THEN_PERSONAL_EXPERIENCE.test(text)
    || DIRECT_CLINICAL_ACTION_ON_SELF.test(text)
    || DIRECT_GENETIC_ACTION_ON_SELF.test(text)
    || DIRECT_SYMPTOM_ACTION.test(text)
    || PERSONAL_BODY_COMPLAINT.test(text)
    || FIRST_PERSON_UNSPECIFIED_CARE_FOLLOWUP.test(text)
    || REPORTED_PERSONAL_CONDITION.test(text)
    || PERSONAL_HEREDITY_QUESTION.test(text)
    || PERSONAL_GENE_CAUSATION_QUESTION.test(text)
    || PERSONALIZED_DOSE_CALCULATION.test(personalizedDoseText)
    || PERSONAL_CARRIED_VARIANT_INTERPRETATION.test(personalCarriedVariantText)
    || PERSONAL_INHERITED_VARIANT_CARE.test(text)
    || PERSONAL_GENETIC_MATERIAL_OWNERSHIP.test(personalGeneticMaterialText)
    || PERSONAL_MEDICATION_PGX.test(text)
    || PERSONAL_PGX_INTERPRETATION.test(text)
    || PERSONAL_MEDICATION_ADJUSTMENT_BY_MARKER.test(text)
    || PERSONAL_TEST_OR_RESULT.test(text)
    || RAW_GENOMIC_DATA_WITH_IDENTIFIER.test(text)
    || hasRawGenomicDataFromNamedPerson(text)
    || FIRST_PERSON_FUTURE_DISEASE.test(text)
    || DIRECT_PERSONAL_CLINICAL_HELP.test(text)
    || FIRST_PERSON_DIAGNOSIS.test(text)
    || MY_CLINICAL.test(broadClinicalText)
    || CLINICAL_FOR_ME.test(text)
    || PERSON_THEN_CLINICAL.test(broadClinicalText)
    || CLINICAL_THEN_PERSON.test(broadClinicalText)
    || SIMPLE_MEDICATION_DISCLOSURE.test(text)
    || SIMPLE_MEDICATION_DECISION.test(text)
    || (
      PROGRESSIVE_MEDICATION_DISCLOSURE.test(text)
      && !clearNonclinicalProgressiveActivity
    )
  ) return true;

  if (aggregateResearchIntent) return false;

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
