import {
  createPublicationArtifact,
  PUBLICATION_STATUSES,
} from '@genemap/shared';

const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const TASKS = Object.freeze({
  AGGREGATE_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE: 'candidate_gene_research',
  GENETICS_EDUCATION: 'genetics_education',
  RESEARCH_HYPOTHESIS: 'research_hypothesis',
  LEARNING_ACTIVITY: 'learning_activity_summary',
});
const RESEARCH_TASKS = new Set([
  TASKS.AGGREGATE_RESEARCH,
  TASKS.RESEARCH_HYPOTHESIS,
]);
const ALLOWED_QUERY_TYPES = new Set(['disease', 'phenotype', 'hpo_term']);
const WITHHELD_PROFILE_SUMMARY = 'Generated profile withheld because the response crossed GeneMap Discovery\'s non-clinical publication boundary. No clinical guidance was shown.';
const UNAVAILABLE_PROFILE_SUMMARY = 'Generated profile unavailable. This gene remains an unverified AI-suggested candidate lead; verify relevance in cited authoritative sources.';

const MEDICATION_NAME_PATTERN = '(?:aspirin|ibuprofen|acetaminophen|paracetamol|naproxen|warfarin|heparin|insulin|metformin|glipizide|semaglutide|liraglutide|atorvastatin|rosuvastatin|simvastatin|lisinopril|losartan|amlodipine|metoprolol|carvedilol|levothyroxine|methimazole|prednisone|amoxicillin|azithromycin|doxycycline|ciprofloxacin|gabapentin|pregabalin|sertraline|fluoxetine|escitalopram|omeprazole|pantoprazole|albuterol|epinephrine|naloxone|[a-z]{4,}(?:mab|nib|pril|sartan|olol|statin|cillin|cycline|azole|vir|caine))';

const OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET = '(?:(?:(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+)?(?:(?:a|an|the|this|that|these|those)\\s+)?(?:(?:new|current|proposed|statistical|research|analytical|alternative|further|additional)\\s+)?(?:look|care|caution|example|examples|following|case|cases|concept|concepts|data|dataset|datasets|analysis|analyses|research|reviewing|comparing|examining|analyzing|checking|reading|validating|verifying|exploring|bias|selection|ascertainment|confounding|pipeline|workflow|iteration|simulation|model|models|server|service|process|query|queries|study|studies|experiment|experiments|calculation|calculations|comparison|comparisons|code|script|job|request|requests|method|methods|algorithm|algorithms|regression|software|tool|tools|database|databases|reference|references|equation|equations|formula|formulas|hypothesis|hypotheses|metric|metrics|result|results|evidence|field|fields|variable|variables|record|records|table|tables|figure|figures|chart|charts|sample|samples|specimen|specimens|cell|cells|culture|cultures|reagent|reagents|assay|assays|protein|proteins|cohort|cohorts|variant|variants|gene|genes|chromosome|chromosomes|dna|rna|measurement|measurements|source|sources|lesson|section|reading|learning|education|validation|verification|review|coverage|threshold|resolution|sensitivity|specificity|power))';
const GENERIC_CLINICAL_ACTION = '(?:take|try|consume|ingest|swallow|chew|drink|dissolve|inhale|spray|inject|administer|prescribe|receive|give|initiate|manage|start|begin|resume|continue|stop|discontinue|skip|taper|increase|decrease|avoid|apply|rub|insert|place|wear|use|undergo|schedule|screen|test|diagnose|treat|monitor|switch(?:\\s+to)?)';
const GENERIC_CLINICAL_ACTION_GERUND = '(?:taking|trying|consuming|ingesting|swallowing|chewing|drinking|dissolving|inhaling|spraying|injecting|administering|prescribing|receiving|giving|initiating|managing|starting|beginning|resuming|continuing|stopping|discontinuing|skipping|tapering|increasing|decreasing|avoiding|applying|rubbing|inserting|placing|wearing|using|undergoing|scheduling|screening|testing|diagnosing|treating|monitoring|switching(?:\\s+to)?)';
const GENERIC_CLINICAL_ACTION_PAST = '(?:taken|tried|consumed|ingested|swallowed|chewed|drunk|dissolved|inhaled|sprayed|injected|administered|prescribed|received|given|initiated|managed|started|resumed|continued|stopped|discontinued|skipped|tapered|increased|decreased|avoided|applied|rubbed|inserted|placed|worn|undergone|scheduled|screened|tested|diagnosed|treated|monitored|switched\\s+to)';
const PASSIVE_CLINICAL_ACTION_PAST = `(?:used|${GENERIC_CLINICAL_ACTION_PAST})`;
const CLINICAL_SUBJECT = '(?:you|patients?|the\\s+patients?|this\\s+patient|these\\s+patients|the\\s+individual|individuals?|your\\s+child|children|adults?|family\\s+members?)';
const PASSIVE_USE_SUBJECT = `[\\p{L}][\\p{L}\\p{N}'-]{0,63}`;
const PASSIVE_USE_AUXILIARY = '(?:is|are|has|have|had|may|might|can|could|would|should|must|will|needs?|ought)';
const PASSIVE_USE_STRONG_MODAL_AUXILIARY = '(?:(?:should|must|will|needs?|has|have|had|ought)\\b|is\\s+to\\b)';
const PASSIVE_USE_PERSON_TARGET = `(?:you|your\\s+child|(?:(?:the|this|these)\\s+)?(?:patients?|individuals?|children)(?![-\\s]+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?))|(?:the|this)\\s+child|family\\s+members?)`;
const PASSIVE_USE_PERSONALIZED_CONTEXT = `(?:(?:for|on|in|into|to|by|among)\\s+${PASSIVE_USE_PERSON_TARGET}|when\\s+(?:treating|screening|monitoring|diagnosing)\\s+${PASSIVE_USE_PERSON_TARGET}|your\\s+(?:symptoms?|treatment|therapy|medication|medicine|drug|dose|dosing|screening|diagnosis|prognosis|genes?|genome|dna|variants?)|(?:in|for)\\s+(?:clinical|medical)\\s+care|during\\s+your\\s+(?:treatment|therapy|screening|clinical\\s+care|medical\\s+care))`;
const PASSIVE_USE_CLINICAL_INDICATION = '(?:pain|symptoms?|headaches?|migraines?|inflammation|hypertension|diabetes|cancer|asthma|fever|seizures?|infections?|cystic\\s+fibrosis|(?:[\\p{L}-]+\\s+){0,2}(?:disease|disorder|syndrome)|(?!(?:mitosis|meiosis)\\b)[\\p{L}-]+(?:itis|osis|emia|oma|pathy))';
const PASSIVE_USE_CLINICAL_TARGET = `(?:${PASSIVE_USE_CLINICAL_INDICATION}|(?:you|your\\s+child|(?:the|this|these)\\s+(?:patients?|individuals?|children)|patients?|individuals?|children)(?!-(?:derived|reported)\\b|\\s+(?:derived|samples?|data|records?|cohorts?|cells?|specimens?)))`;
const PASSIVE_USE_CLINICAL_PURPOSE = `(?:(?:to|for|in)\\s+(?:treat|treating|manage|managing|diagnose|diagnosing|screen|screening|monitor|monitoring|relieve|relieving|reduce|reducing|prevent|preventing)\\s+(?:(?:a|an|the|this|these)\\s+)?${PASSIVE_USE_CLINICAL_TARGET}\\b|(?:for|against)\\s+${PASSIVE_USE_CLINICAL_INDICATION}\\b(?!\\s+(?:research|stud(?:y|ies)|analysis|model(?:s|ing)?|dataset|samples?|cells?))|(?:as|for)\\s+(?:a\\s+|the\\s+)?(?:treatment|therapy|medication)(?:\\s+of\\s+${PASSIVE_USE_CLINICAL_INDICATION})?)`;
const PASSIVE_USE_ADMINISTRATION_CONTEXT = '(?:(?:(?:orally|topically|intravenously|intramuscularly|subcutaneously)\\s+)?(?:daily|nightly|weekly|once\\s+(?:a\\s+)?day|(?:one|two|three|four|five|six|seven|eight|nine|ten|twice)\\s+times?\\s+(?:a\\s+)?day|twice\\s+(?:a\\s+)?day|twice\\s+daily|every\\s+(?:morning|evening|day|night|week|\\w+\\s+hours?)|at\\s+bedtime|with\\s+meals?|as\\s+needed)|at\\s+(?:a\\s+)?(?:dose\\s+of\\s+)?(?:\\d+(?:\\.\\d+)?|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(?:mg|mcg|μg|ug|ml|g|units?|grams?|milli?grams?|micrograms?|milliliters?)|as\\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|\\d+)\\s+(?:tablets?|capsules?|pills?|drops?|puffs?|sprays?|inhalations?)(?:\\s+(?:once|twice|(?:one|two|three|four|five)\\s+times?)\\s+(?:a\\s+day|daily))?)';
const PASSIVE_USE_RESEARCH_CONTEXT = '(?:research|stud(?:y|ies)|analysis|assays?|samples?|workflows?|simulations?|models?|calibration|quality[ -]control|aggregate\\s+research|genomic\\s+library|patient-derived\\s+(?:samples?|cells?)|selection\\s+marker|cultured\\s+cells|cell\\s+growth|mitosis|meiosis|absorbance|culture\\s+cells|edit\\s+genes|amplify\\s+dna|tumor\\s+genomes)';
const PASSIVE_USE_CONCRETE_LAB_CONTEXT = '(?:assays?|quality[ -]control|genomic\\s+library|selection\\s+marker|cultured\\s+cells|cell\\s+growth|mitosis|meiosis|absorbance|culture\\s+cells|tumor\\s+genomes|(?:patient-derived\\s+(?:samples?|cells?)[^.!?;\\n]{0,60}\\b(?:aggregate\\s+research|laborator(?:y|ies)|lab|assays?)|(?:aggregate\\s+research|laborator(?:y|ies)|lab|assays?)[^.!?;\\n]{0,60}\\bpatient-derived\\s+(?:samples?|cells?)))';

const CLINICAL_GUIDANCE_PATTERNS = [
  new RegExp(`(?:^|[.!?;:,\\n]\\s*|\\b(?:and|then)\\s+)(?:(?:["'(]|\\[|\\{)\\s*)*(?:please\\s+)?(?:(?:do\\s+not|don't|never)\\s+)?${GENERIC_CLINICAL_ACTION}\\s+(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}]`, 'iu'),
  /(?:^|[.!?;:,\n]\s*|\b(?:and|then)\s+)(?:please\s+)?(?:get|obtain|order|request|book)\s+(?:(?:a|an|the|your)\s+)?(?:(?:genetic|diagnostic|medical|clinical|cancer|carrier)\s+)?(?:test|testing|screen|screening|scan|biopsy|exam|examination)\b/iu,
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:should|must|need(?:s)?\\s+to|ought\\s+to)\\s+|(?:are|is)\\s+(?:advised|instructed)\\s+to\\s+)${GENERIC_CLINICAL_ACTION}\\s+(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:definitely|certainly|probably|likely|clearly|really)\\s+)?(?:need(?:s)?|require(?:s)?|would\\s+benefit\\s+from)\\s+(?!to\\b)(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}]`, 'iu'),
  new RegExp(`\\b(?:recommend(?:s|ed|ing)?|suggest(?:s|ed|ing)?|advise(?:s|d|ing)?|instruct(?:s|ed|ing)?|urge(?:s|d|ing)?)\\s+(?:(?:that\\s+)?${CLINICAL_SUBJECT}\\s+)?(?:to\\s+)?(?:${GENERIC_CLINICAL_ACTION}|${GENERIC_CLINICAL_ACTION_GERUND})\\s+(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)`, 'iu'),
  new RegExp(`\\b(?:recommend(?:s|ed|ing)?|suggest(?:s|ed|ing)?)\\s+(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}]`, 'iu'),
  new RegExp(`\\b(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}(?:\\s+[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}){0,2}\\s+(?:is|are|may\\s+be|would\\s+be|should\\s+be|must\\s+be)\\s+(?:recommended|advised|indicated|prescribed|avoided)\\b`, 'iu'),
  new RegExp(`\\b(?!${OBVIOUS_NONCLINICAL_IMPERATIVE_TARGET}\\b)[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}(?:\\s+[\\p{L}\\p{N}][\\p{L}\\p{N}'-]{1,63}){0,2}\\s+(?:may|might|can|could|will|should)\\s+(?:help|relieve|reduce|improve|treat|manage)\\s+(?:you|your|the\\s+patient|the\\s+patient's)\\b`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:[\\p{L}-]+|very)\\s+){0,3}(?:have|has|suffer(?:s)?\\s+from|test(?:s|ed)?\\s+positive\\s+for|are\\s+positive\\s+for|show(?:s)?\\s+signs\\s+of|meet(?:s)?\\s+(?:the\\s+)?criteria\\s+for|are\\s+diagnosed\\s+with|is\\s+diagnosed\\s+with)\\b[^.!?\\n]{0,100}`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:(?:may|might|could)\\s+)?(?:carry|carries|harbor|harbors)\\b[^.!?\\n]{0,100}`, 'iu'),
  new RegExp(`\\b${CLINICAL_SUBJECT}\\s+(?:is|are|tests?|tested)\\s+positive\\s+for\\b[^.!?\\n]{0,100}`, 'iu'),
  /\b(?:the|these|those|this|your)\s+(?:findings?|results?|tests?|test\s+results?|genotype|variants?|data)\s+(?:is|are)\s+(?:diagnostic\s+of|consistent\s+with|indicative\s+of|positive\s+for)\b[^.!?\n]{0,100}/iu,
  /\byour\s+(?:findings?|results?|tests?|test\s+results?|genotype|variants?)\s+(?:confirm|confirms|show|shows|indicate|indicates|prove|proves)\b[^.!?\n]{0,100}/iu,
  /\byour\s+(?:symptoms|results|genotype|variant|variants|test|tests)\s+(?:mean|means|show|shows|indicate|indicates|confirm|confirms|prove|proves)\s+(?:(?:that\s+)?you\s+have|(?:a\s+)?diagnosis\s+of)\b/iu,
  /\byour\s+(?:symptoms|results|genotype|variant|variants|test|tests)\s+(?:is|are)\s+(?:diagnostic\s+of|consistent\s+with|indicative\s+of)\b/iu,
  /\b(?:recommend(?:ed|ation)?|advise(?:d)?|should|must|need(?:s)? to|ought to|prescribe(?:d)?|start|stop|increase|decrease|take|avoid|undergo|administer|switch)\b[^.!?\n]{0,120}\b(?:treatment|therapy|medication|medicine|drug|screening|test|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b/iu,
  /\b(?:screening|treatment|therapy|medication|medicine|drug|test|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b[^.!?\n]{0,40}\b(?:is|are|would be|may be|should be|must be)\b[^.!?\n]{0,40}\b(?:recommended|advised|indicated|required|necessary|appropriate)\b/iu,
  /\b(?:you|your|patient|this patient|individual|family members?)\b[^.!?\n]{0,120}\b(?:personal risk|risk of|diagnos\w*|prognos\w*|treatment|therapy|medication|medicine|drug|screening|dose|dosing|clinical action)\b/iu,
  /\b(?:consult|contact|see|seek)\b[^.!?\n]{0,60}\b(?:doctor|physician|clinician|genetic counselor|medical professional|emergency department|emergency care)\b/iu,
  /\b(?:diagnos(?:e|ed|es|ing)|diagnosis|prognosis|prognostic conclusion|clinical recommendation|treatment recommendation|screening recommendation|medication recommendation|drug recommendation)\b/iu,
  /\b(?:dose|dosing|dosage)\b[^.!?\n]{0,80}\b(?:recommend\w*|should|must|take|administer|adjust|increase|decrease|mg|mcg|ug|units?)\b/iu,
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|μg|ug|ml|units?)\b/iu,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half|quarter)\s+(?:milli?grams?|micrograms?|grams?|milliliters?|units?)\b/iu,
  /\b(?:take|start|stop|avoid|administer|inject|swallow|apply|use)\b[^.!?\n]{0,100}\b(?:one|two|three|four|five|six|seven|eight|nine|ten|half|a|an|\d+)\s+(?:tablets?|capsules?|pills?|drops?|puffs?|sprays?|inhalations?|teaspoons?|tablespoons?|units?)\b/iu,
  /\b(?:take|start|stop|avoid|administer|inject|swallow|apply|use)\b[^.!?\n]{0,100}\b(?:daily|nightly|weekly|once\s+(?:a\s+)?day|twice\s+(?:a\s+)?day|every\s+\w+\s+hours?|at\s+bedtime|with\s+meals?|as\s+needed)\b/iu,
  new RegExp(`\\b(?:take|start|stop|avoid|use|administer|prescribe|switch(?:\\s+to)?)\\b[^.!?\\n]{0,80}\\b${MEDICATION_NAME_PATTERN}\\b`, 'iu'),
  new RegExp(`\\b${MEDICATION_NAME_PATTERN}\\b[^.!?\\n]{0,80}\\b(?:is|are|may be|should be|must be)\\b[^.!?\\n]{0,40}\\b(?:recommended|advised|indicated|prescribed|avoided)\\b`, 'iu'),
];

const PASSIVE_ACTION_CLAUSE_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_SUBJECT}\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]{0,80}\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_USE_PERSONALIZED_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_PERSONALIZED_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_USE_CLINICAL_PURPOSE_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_CLINICAL_PURPOSE}\\b`,
  'iu',
);
const PASSIVE_ACTION_ADMINISTRATION_PATTERN = new RegExp(
  `\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b\\s*,?\\s+${PASSIVE_USE_ADMINISTRATION_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_USE_RESEARCH_CONTEXT_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_RESEARCH_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_CONCRETE_LAB_CONTEXT}\\b`,
  'iu',
);
const PASSIVE_ACTION_KNOWN_MEDICATION_PATTERN = new RegExp(
  `\\b(?:${MEDICATION_NAME_PATTERN}|medications?|medicines?|drugs?)\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]{0,80}\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_ACTION_PERSON_SUBJECT_PATTERN = new RegExp(
  `\\b${CLINICAL_SUBJECT}\\s+${PASSIVE_USE_AUXILIARY}\\b[^.!?;\\n]{0,80}\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);
const PASSIVE_ACTION_NONCLINICAL_PERSON_SUBJECT_PATTERN = new RegExp(
  '(?:\\byou\\s+are\\s+used\\s+to\\s+[\\p{L}-]+ing\\b|\\bpatients?\\s+are\\s+used\\s+as\\s+controls?\\b[^.!?;\\n]{0,80}\\bresearch\\b)',
  'iu',
);
const PASSIVE_ACTION_STRONG_MODAL_PATTERN = new RegExp(
  `\\b${PASSIVE_USE_SUBJECT}\\s+${PASSIVE_USE_STRONG_MODAL_AUXILIARY}[^.!?;\\n]{0,80}\\b${PASSIVE_CLINICAL_ACTION_PAST}\\b`,
  'iu',
);

const NAMED_HTML_ENTITIES = Object.freeze({
  amp: '&',
  apos: "'",
  ast: '*',
  bsol: '\\',
  colon: ':',
  comma: ',',
  copy: '\u00a9',
  dash: '-',
  emsp: ' ',
  ensp: ' ',
  excl: '!',
  gt: '>',
  hairsp: ' ',
  hyphen: '-',
  lpar: '(',
  lrm: '',
  lsqb: '[',
  lt: '<',
  nbsp: ' ',
  newline: '\n',
  num: '#',
  period: '.',
  quest: '?',
  quot: '"',
  reg: '\u00ae',
  rlm: '',
  rpar: ')',
  rsqb: ']',
  semi: ';',
  shy: '',
  sol: '/',
  tab: '\t',
  thinsp: ' ',
  zerowidthspace: '',
  zwj: '',
  zwnj: '',
});

const SAFETY_CONFUSABLES = new Map(Object.entries({
  'Α': 'A', 'Β': 'B', 'Ε': 'E', 'Ζ': 'Z', 'Η': 'H', 'Ι': 'I', 'Κ': 'K', 'Μ': 'M', 'Ν': 'N', 'Ο': 'O', 'Ρ': 'P', 'Τ': 'T', 'Υ': 'Y', 'Χ': 'X',
  'α': 'a', 'β': 'b', 'ε': 'e', 'ι': 'i', 'κ': 'k', 'ν': 'v', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'y', 'χ': 'x', 'ϲ': 'c',
  'А': 'A', 'В': 'B', 'Е': 'E', 'К': 'K', 'М': 'M', 'Н': 'H', 'О': 'O', 'Р': 'P', 'С': 'C', 'Т': 'T', 'Х': 'X',
  'а': 'a', 'е': 'e', 'і': 'i', 'ј': 'j', 'к': 'k', 'м': 'm', 'н': 'h', 'о': 'o', 'р': 'p', 'с': 'c', 'т': 't', 'х': 'x', 'у': 'y', 'ѕ': 's', 'һ': 'h', 'ԁ': 'd', 'ԛ': 'q', 'ӏ': 'l',
  'ս': 'u', 'հ': 'h', 'ո': 'n', 'օ': 'o',
  'ᴀ': 'a', 'ʙ': 'b', 'ᴄ': 'c', 'ᴅ': 'd', 'ᴇ': 'e', 'ꜰ': 'f', 'ɢ': 'g', 'ʜ': 'h', 'ɪ': 'i', 'ᴊ': 'j', 'ᴋ': 'k', 'ʟ': 'l', 'ᴍ': 'm', 'ɴ': 'n', 'ᴏ': 'o', 'ᴘ': 'p', 'ʀ': 'r', 'ꜱ': 's', 'ᴛ': 't', 'ᴜ': 'u', 'ᴠ': 'v', 'ᴡ': 'w', 'ʏ': 'y', 'ᴢ': 'z',
}));

const CLINICAL_SKELETON_WORDS = Object.freeze([
  'administer', 'advised', 'applied', 'apply', 'avoid', 'chew', 'consume', 'diagnose', 'diagnosed',
  'dissolve', 'dose', 'drink', 'inhale', 'inject', 'injected', 'ingest', 'insert', 'medication', 'monitor', 'must', 'need',
  'pain', 'patient', 'prescribe', 'recommend', 'require', 'screen', 'should',
  'skip', 'spray', 'start', 'stop', 'swallow', 'symptoms', 'take', 'taken', 'taper', 'test', 'tested', 'treat', 'treated', 'try', 'used',
]);

function containsUnsupportedNamedHtmlEntity(value) {
  if (typeof value !== 'string') return false;
  for (const match of value.matchAll(/&([a-z][a-z0-9]+);/giu)) {
    if (!Object.hasOwn(NAMED_HTML_ENTITIES, match[1].toLowerCase())) return true;
  }
  return false;
}

function collapseObfuscatedClinicalWords(value) {
  let collapsed = value;
  for (const word of CLINICAL_SKELETON_WORDS) {
    const letters = Array.from(word).join('\\s*');
    collapsed = collapsed.replace(
      new RegExp(`(?<!\\p{L})${letters}(?!\\p{L})`, 'giu'),
      word,
    );
  }
  return collapsed;
}

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function decodeHtmlEntities(value, { preserveUnknownNamed = true } = {}) {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z][a-z0-9]+);/giu, (match, entity) => {
    if (entity[0] !== '#') {
      // The safety projection removes unknown names conservatively because a
      // renderer may know more named references than this finite table. The
      // visible-output normalizer preserves them to avoid corrupting neutral
      // scientific notation such as an unlisted Greek entity.
      return NAMED_HTML_ENTITIES[entity.toLowerCase()]
        ?? (preserveUnknownNamed ? match : '');
    }
    const hex = entity[1]?.toLowerCase() === 'x';
    const numeric = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
    if (!Number.isInteger(numeric) || numeric < 0 || numeric > 0x10ffff
      || (numeric >= 0xd800 && numeric <= 0xdfff)) return ' ';
    return String.fromCodePoint(numeric);
  });
}

function removeInvisibleFormatCharacters(value) {
  return value.replace(/[\p{Cf}\u034f\u061c\u180e]/gu, '');
}

function normalizeVisibleText(value) {
  return removeInvisibleFormatCharacters(decodeHtmlEntities(value).normalize('NFKC'));
}

function stripRenderedMarkupForSafety(value, { separateFormatting = false } = {}) {
  // HTML and Markdown inline markup do not create visible characters. Remove
  // them without inserting a separator so T<em>ak</em>e and T**ak**e project
  // to the same safety text the reader sees: Take.
  const withoutHtml = value
    .replace(/<!--[\s\S]*?-->/gu, '')
    .replace(/<(?:[^"'<>]|"[^"]*"|'[^']*')*>/gu, '');
  return stripUntrustedMarkupAndLinks(withoutHtml)
    .replace(/\\([\\`*{}[\]()#+\-.!_>~|])/gu, '$1')
    .replace(/[`*_~]+/gu, separateFormatting ? ' ' : '')
    .replace(/^\s{0,3}#{1,6}\s*/gmu, '')
    .replace(/^\s*>\s?/gmu, ' ')
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, '');
}

function semanticSafetyText(value, { separatePunctuation = false } = {}) {
  if (typeof value !== 'string') return '';
  const normalized = replaceControlCharacters(removeInvisibleFormatCharacters(
    decodeHtmlEntities(value, { preserveUnknownNamed: false }).normalize('NFKD'),
  ), { preserveLineBreaks: true });
  const confusableMapped = Array.from(normalized, (character) => (
    SAFETY_CONFUSABLES.get(character) ?? character
  )).join('');
  return stripRenderedMarkupForSafety(confusableMapped, {
    separateFormatting: separatePunctuation,
  })
    .replace(/\p{M}+/gu, '')
    .replace(/([\p{L}\p{N}])[\p{Pd}._/\\,:;|\u00b7\u2022]+(?=[\p{L}\p{N}])/gu, (
      _match,
      letter,
    ) => `${letter}${separatePunctuation ? ' ' : ''}`)
    .replace(/(\p{L})(?=\p{N})/gu, '$1 ')
    .replace(/(\p{N})(?=\p{L})/gu, '$1 ')
    .replace(/[\r\n\u0085\u2028\u2029]+/gu, '\n')
    .replace(/[\p{Z}\t\f\v ]+/gu, ' ')
    .trim();
}

function confusableEditBudget(targetLength) {
  // Short safety keywords have too few characters for a fixed fuzzy-match
  // budget to be selective. Keep a one-edit floor so three-letter directives
  // cannot bypass the boundary with one unmapped non-Latin character, and use
  // the full two-edit fail-closed budget only for words of eight or more.
  return Math.min(2, Math.max(1, Math.floor(targetLength / 4)));
}

function withinEditBudget(left, right, maxEdits) {
  if (left === right) return true;
  if (Math.abs(left.length - right.length) > maxEdits) return false;
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = current[0];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1]
        + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
      rowMinimum = Math.min(rowMinimum, current[rightIndex]);
    }
    if (rowMinimum > maxEdits) return false;
    previous = current;
  }
  return previous[right.length] <= maxEdits;
}

/**
 * UTS-39-style defense for mixed/confusable clinical keywords. The explicit
 * skeleton map handles common Greek/Cyrillic lookalikes; for an unmapped
 * non-Latin letter embedded in an otherwise Latin token, a length-scaled
 * comparison of up to two edits fails closed instead of assuming safety.
 */
function containsSuspiciousClinicalConfusable(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const normalized = removeInvisibleFormatCharacters(
    decodeHtmlEntities(value, { preserveUnknownNamed: false }).normalize('NFKD'),
  ).replace(/\p{M}+/gu, '');
  for (const match of normalized.matchAll(/\p{L}{2,}/gu)) {
    const token = match[0];
    if (!Array.from(token).some((character) => (character.codePointAt(0) ?? 0) > 0x7f)) continue;
    const skeleton = Array.from(token, (character) => {
      const mapped = SAFETY_CONFUSABLES.get(character);
      if (mapped) return mapped;
      return /[A-Za-z]/u.test(character) ? character : '';
    }).join('').toLowerCase();
    if (skeleton.length < 2) continue;
    if (CLINICAL_SKELETON_WORDS.some((word) => (
      withinEditBudget(skeleton, word, confusableEditBudget(word.length))
    ))) {
      return true;
    }
  }
  return false;
}

function replaceControlCharacters(value, { preserveLineBreaks = false } = {}) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    if (preserveLineBreaks
      && (codePoint === 0x0a || codePoint === 0x0d || codePoint === 0x85)) return '\n';
    const isC0OrDel = codePoint <= 0x1f || codePoint === 0x7f;
    const isC1 = codePoint >= 0x80 && codePoint <= 0x9f;
    return isC0OrDel || isC1 ? ' ' : character;
  }).join('');
}

function stripUntrustedMarkupAndLinks(value) {
  return value
    .replace(/!\[([^\]]*)\]\s*\[[^\]]*\]/gu, '$1')
    .replace(/\[([^\]]+)\]\s*\[[^\]]*\]/gu, '$1')
    .replace(/^\s*\[[^\]\n]{1,128}\]:\s*.*$/gmu, ' ')
    .replace(/<[^>]*>/gu, ' ')
    .replace(/!\[([^\]]*)\]\((?:\\.|[^()]|\([^()]*\))*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\((?:\\.|[^()]|\([^()]*\))*\)/gu, '$1')
    .replace(/\b(?:javascript|data):[^\s]+/giu, ' ')
    .replace(/\bhttps?:\/\/[^\s<>()]+/giu, '[external link removed]')
    .replace(/(^|[\s(])\/\/[A-Za-z0-9.-]+(?:\/[^\s<>()]*)?/gmu, '$1[external link removed]')
    .replace(/\bwww\.[^\s<>()]+/giu, '[external link removed]');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = stripUntrustedMarkupAndLinks(replaceControlCharacters(normalizeVisibleText(value)))
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

function removeAllowedBoundaryDisclaimers(value) {
  return value
    .replace(/\bnot\s+(?:a\s+)?diagnosis\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bnot\s+medical\s+advice\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bnot\s+(?:intended|suitable)\s+for\s+clinical\s+use\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bdoes\s+not\s+(?:assess|predict|establish)\s+(?:personal\s*)?(?:risk|diagnosis|prognosis)\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bdo\s+not\s+use\s+(?:it|(?:this|the)\s+(?:output|response|result|results)|these\s+results|output|response|result|results)\s+(?:medically|for\s+(?:medical\s+advice|clinical\s+use|clinical\s+decisions?|(?:diagnosis|personal(?:-|\s)?risk(?:\s+prediction)?|treatment|dosing|screening)(?:\s*(?:,|and|or)\s*(?:diagnosis|personal(?:-|\s)?risk(?:\s+prediction)?|treatment|dosing|screening))*(?:\s*,?\s*(?:and|or)\s+(?:other\s+)?clinical\s+decisions?)?))\b(?=$|[.!?;:\n])/giu, ' ');
}

function containsPassiveClinicalAction(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  return value.split(/[.!?;\n]+/u).some((clause) => {
    if (!PASSIVE_ACTION_CLAUSE_PATTERN.test(clause)) return false;
    if (
      PASSIVE_ACTION_PERSON_SUBJECT_PATTERN.test(clause)
      && !PASSIVE_ACTION_NONCLINICAL_PERSON_SUBJECT_PATTERN.test(clause)
    ) return true;
    if (PASSIVE_USE_PERSONALIZED_PATTERN.test(clause)) return true;
    if (PASSIVE_USE_CLINICAL_PURPOSE_PATTERN.test(clause)) return true;

    const hasReviewedResearchContext = PASSIVE_USE_RESEARCH_CONTEXT_PATTERN.test(clause);
    const hasConcreteLabContext = PASSIVE_USE_CONCRETE_LAB_CONTEXT_PATTERN.test(clause);
    if (PASSIVE_ACTION_ADMINISTRATION_PATTERN.test(clause) && !hasConcreteLabContext) {
      return true;
    }
    if (PASSIVE_ACTION_KNOWN_MEDICATION_PATTERN.test(clause) && !hasConcreteLabContext) {
      return true;
    }
    return PASSIVE_ACTION_STRONG_MODAL_PATTERN.test(clause) && !hasReviewedResearchContext;
  });
}

function containsProhibitedClinicalGuidance(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  // CommonMark decodes the complete HTML named-reference table. This service
  // intentionally keeps only a small reviewed decoder; an unrecognized entity
  // in visible text therefore fails closed instead of being deleted from the
  // safety projection while the browser renders a confusable character.
  const visibleMarkup = stripRenderedMarkupForSafety(value);
  if (containsUnsupportedNamedHtmlEntity(visibleMarkup)) return true;
  if (containsSuspiciousClinicalConfusable(value)) return true;
  const policyTexts = new Set([
    collapseObfuscatedClinicalWords(semanticSafetyText(value)),
    collapseObfuscatedClinicalWords(semanticSafetyText(value, { separatePunctuation: true })),
  ]);
  return [...policyTexts].some((policyText) => {
    const withoutAllowedDisclaimers = removeAllowedBoundaryDisclaimers(policyText);
    return CLINICAL_GUIDANCE_PATTERNS.some((pattern) => pattern.test(withoutAllowedDisclaimers))
      || containsPassiveClinicalAction(withoutAllowedDisclaimers);
  });
}

function cleanNonClinicalText(value, maxLength) {
  if (containsProhibitedClinicalGuidance(value)) return null;
  const cleaned = cleanText(value, maxLength);
  if (!cleaned || (cleaned !== value && containsProhibitedClinicalGuidance(cleaned))) return null;
  return cleaned;
}

function cleanStringArray(value, { maxItems, maxLength, nonClinical = false }) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const item of value) {
    const text = nonClinical
      ? cleanNonClinicalText(item, maxLength)
      : cleanText(item, maxLength);
    if (!text) continue;
    const key = text.toLocaleLowerCase('en-US');
    if (seen.has(key)) continue;
    seen.add(key);
    cleaned.push(text);
    if (cleaned.length >= maxItems) break;
  }
  return cleaned;
}

function normalizeNarrativeFormatting(value) {
  if (typeof value !== 'string') return null;
  const lines = normalizeVisibleText(value)
    .replace(/\r\n?/gu, '\n')
    .split('\n')
    .map((line) => stripUntrustedMarkupAndLinks(replaceControlCharacters(line))
      .replace(/[ \t]+/gu, ' ')
      .trimEnd());
  const normalized = lines
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
  if (!normalized) return null;
  return normalized;
}

function sanitizeNarrativeArtifact(result, {
  maxLength,
  correlationId,
  emptyReasonCode,
}) {
  if (containsProhibitedClinicalGuidance(result)) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'clinical_boundary',
      correlationId,
    });
  }
  const normalized = normalizeNarrativeFormatting(result);
  if (!normalized) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: emptyReasonCode,
      correlationId,
    });
  }
  const locallyTruncated = normalized.length > maxLength;
  const cleaned = normalized.slice(0, maxLength);
  if (containsProhibitedClinicalGuidance(cleaned)) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'clinical_boundary',
      correlationId,
    });
  }
  return createPublicationArtifact({
    status: locallyTruncated
      ? PUBLICATION_STATUSES.PARTIAL
      : PUBLICATION_STATUSES.AVAILABLE,
    content: cleaned,
    reasonCode: locallyTruncated ? 'local_output_truncated' : null,
    correlationId,
    limitations: locallyTruncated
      ? ['The response exceeded the local publication length limit and was truncated.']
      : [],
  });
}

function parseJsonCandidate(result) {
  if (isPlainObject(result) || Array.isArray(result)) return result;
  if (typeof result !== 'string') return null;

  const trimmed = result.trim();
  if (!trimmed) return null;
  const attempts = [trimmed];

  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '')
    .trim();
  if (unfenced !== trimmed) attempts.push(unfenced);

  const firstObject = unfenced.indexOf('{');
  const lastObject = unfenced.lastIndexOf('}');
  if (firstObject >= 0 && lastObject > firstObject) {
    attempts.push(unfenced.slice(firstObject, lastObject + 1));
  }

  const firstArray = unfenced.indexOf('[');
  const lastArray = unfenced.lastIndexOf(']');
  if (firstArray >= 0 && lastArray > firstArray) {
    attempts.push(unfenced.slice(firstArray, lastArray + 1));
  }

  for (const attempt of [...new Set(attempts)]) {
    try {
      const parsed = JSON.parse(attempt);
      if (isPlainObject(parsed) || Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next bounded representation.
    }
  }
  return null;
}

function normalizeCandidateGene(value) {
  if (!isPlainObject(value)) return null;
  const symbol = typeof value.symbol === 'string'
    ? value.symbol.trim().toUpperCase()
    : '';
  if (!GENE_SYMBOL.test(symbol)) return null;

  const symbolPolicyText = symbol
    .replace(/-/gu, ' ')
    .replace(/(\d)(MG|MCG|UG|ML|UNITS?)\b/gu, '$1 $2');
  if (/^(?:TAKE|START|STOP|AVOID|USE|ADMINISTER|INJECT|SWALLOW|APPLY|PRESCRIBE|SWITCH)\b/u.test(symbolPolicyText)) return null;
  if (containsProhibitedClinicalGuidance(symbolPolicyText)) return null;

  const name = cleanNonClinicalText(value.name, 256);
  const explanation = cleanNonClinicalText(value.explanation, 2_000);
  return {
    symbol,
    ...(name ? { name } : {}),
    ...(explanation ? { explanation } : {}),
  };
}

function normalizeCandidateGenes(value, maxItems = 15) {
  const input = Array.isArray(value) ? value : [];
  const seen = new Set();
  const genes = [];
  for (const item of input) {
    const gene = normalizeCandidateGene(item);
    if (!gene || seen.has(gene.symbol)) continue;
    seen.add(gene.symbol);
    genes.push(gene);
    if (genes.length >= maxItems) break;
  }
  return genes;
}

function trustedQueryClassification(taskInput) {
  const query = isPlainObject(taskInput?.query) ? taskInput.query : null;
  if (!query) return null;

  if (query.kind === 'hpo') {
    return {
      queryType: 'hpo_term',
      isDisease: false,
      isHPOTerm: true,
      diseaseName: null,
    };
  }

  if (query.kind === 'mondo') {
    return {
      queryType: 'disease',
      isDisease: true,
      isHPOTerm: false,
      diseaseName: cleanText(query.canonicalLabel, 256),
    };
  }

  if (query.kind === 'curated_concept'
    && (query.conceptKind === 'disease' || query.conceptKind === 'phenotype')) {
    const isDisease = query.conceptKind === 'disease';
    return {
      queryType: query.conceptKind,
      isDisease,
      isHPOTerm: false,
      diseaseName: isDisease ? cleanText(query.canonicalLabel, 256) : null,
    };
  }

  return null;
}

function normalizeClassification(parsed, taskInput = {}) {
  const source = isPlainObject(parsed) ? parsed : {};
  const trusted = trustedQueryClassification(taskInput);
  const modelIsDisease = source.isDisease === true;
  const modelQueryType = ALLOWED_QUERY_TYPES.has(source.queryType)
    ? source.queryType
    : (modelIsDisease ? 'disease' : 'phenotype');
  const queryType = trusted?.queryType ?? modelQueryType;
  const isDisease = trusted?.isDisease ?? modelIsDisease;
  const isHPOTerm = trusted?.isHPOTerm ?? source.isHPOTerm === true;
  const diseaseName = isDisease
    ? trusted?.diseaseName ?? cleanNonClinicalText(source.diseaseName, 256)
    : null;
  const inheritancePattern = cleanNonClinicalText(source.inheritancePattern, 256);
  return {
    queryType,
    isDisease,
    ...(diseaseName ? { diseaseName } : {}),
    isHPOTerm,
    mainFeatures: cleanStringArray(source.mainFeatures, {
      maxItems: 20,
      maxLength: 256,
      nonClinical: true,
    }),
    synonyms: cleanStringArray(source.synonyms, {
      maxItems: 20,
      maxLength: 256,
      nonClinical: true,
    }),
    ...(inheritancePattern ? { inheritancePattern } : {}),
    hpoTerms: [],
  };
}

function normalizeGeneProfile(parsed) {
  const source = isPlainObject(parsed) ? parsed : {};
  const candidateSummary = cleanText(source.summary, 4_000);
  const summaryStatus = !candidateSummary
    ? 'unavailable'
    : containsProhibitedClinicalGuidance(source.summary)
      || containsProhibitedClinicalGuidance(candidateSummary)
      ? 'withheld'
      : 'available';
  const summary = summaryStatus === 'available'
    ? candidateSummary
    : summaryStatus === 'withheld'
      ? WITHHELD_PROFILE_SUMMARY
      : UNAVAILABLE_PROFILE_SUMMARY;
  const keyTakeaways = cleanStringArray(source.keyTakeaways, {
    maxItems: 12,
    maxLength: 500,
    nonClinical: true,
  });
  const phenotypeNames = cleanStringArray(
    Array.isArray(source.phenotypes)
      ? source.phenotypes.map((item) => (isPlainObject(item) ? item.name : item))
      : [],
    { maxItems: 20, maxLength: 256, nonClinical: true },
  );
  return {
    summary,
    summaryStatus,
    keyTakeaways,
    phenotypes: phenotypeNames.map((name) => ({ name })),
  };
}

function safeEmptyCandidateOutput(operation, taskInput) {
  if (operation === 'classify') return normalizeClassification({}, taskInput);
  if (operation === 'gene_profile') return normalizeGeneProfile({});
  if (operation === 'suggest_candidates') return { candidateGenes: [] };
  return { ...normalizeClassification({}, taskInput), candidateGenes: [] };
}

function sanitizeCandidateTaskOutput(taskInput, result) {
  const operation = taskInput?.operation;
  const parsed = parseJsonCandidate(result);
  if (!parsed) return JSON.stringify(safeEmptyCandidateOutput(operation, taskInput));

  if (operation === 'gene_profile') {
    return JSON.stringify(normalizeGeneProfile(parsed));
  }

  if (operation === 'classify') {
    return JSON.stringify(normalizeClassification(parsed, taskInput));
  }

  const candidateSource = Array.isArray(parsed)
    ? parsed
    : parsed.candidateGenes;
  const candidateGenes = normalizeCandidateGenes(candidateSource);
  if (operation === 'suggest_candidates') {
    return JSON.stringify({ candidateGenes });
  }

  return JSON.stringify({
    ...normalizeClassification(parsed, taskInput),
    candidateGenes,
  });
}

/**
 * Fail closed on malformed or policy-violating quiz fields without changing the
 * option order or correct index. Dropping an individual option could silently
 * turn a valid index into a different answer, so any invalid option rejects the
 * entire question.
 */
function sanitizeEducationQuizItems(result, maxItems) {
  if (!Array.isArray(result)) {
    return { questions: [], rejectedCount: 0 };
  }
  const questions = [];
  let rejectedCount = 0;
  for (const item of result) {
    if (!isPlainObject(item) || !Array.isArray(item.options)) {
      rejectedCount += 1;
      continue;
    }
    const question = cleanNonClinicalText(item.question, 1_000);
    const options = item.options.slice(0, 6).map((option) => cleanNonClinicalText(option, 500));
    const explanation = cleanNonClinicalText(item.explanation, 2_000);
    const correctIndex = item.correctIndex;
    if (
      !question
      || options.length < 2
      || options.some((option) => !option)
      || !Number.isInteger(correctIndex)
      || correctIndex < 0
      || correctIndex >= options.length
      || !explanation
    ) {
      rejectedCount += 1;
      continue;
    }
    questions.push({ question, options, correctIndex, explanation });
    if (questions.length >= maxItems) break;
  }
  return { questions, rejectedCount };
}

export function sanitizeEducationQuizOutput(result, maxItems = 20) {
  return sanitizeEducationQuizItems(result, maxItems).questions;
}

const PROVIDER_COMPLETIONS = new Set(['complete', 'unknown', 'truncated', 'filtered', 'failed']);

function providerCompletion(result) {
  if (isPlainObject(result)) {
    const hasText = Object.hasOwn(result, 'text');
    const hasCompletionMetadata = Object.hasOwn(result, 'completion');
    if (!hasText && !hasCompletionMetadata) {
      return { text: result, completion: 'unknown' };
    }
    const suppliedCompletion = result.completion;
    const structuredText = hasText
      ? result.text
      : Object.fromEntries(
        Object.entries(result).filter(([key]) => key !== 'completion'),
      );
    return {
      text: structuredText,
      completion: typeof suppliedCompletion === 'string'
        && PROVIDER_COMPLETIONS.has(suppliedCompletion)
        ? suppliedCompletion
        : hasCompletionMetadata
          ? 'failed'
          : 'unknown',
    };
  }
  return { text: result, completion: 'unknown' };
}

function containsProhibitedClinicalGuidanceDeep(value) {
  if (typeof value === 'string') return containsProhibitedClinicalGuidance(value);
  if (Array.isArray(value)) {
    return value.some((item) => containsProhibitedClinicalGuidanceDeep(item));
  }
  if (!isPlainObject(value)) return false;
  return Object.values(value).some((item) => containsProhibitedClinicalGuidanceDeep(item));
}

function completionArtifact(completion, correlationId) {
  if (completion === 'filtered') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.WITHHELD,
      reasonCode: 'provider_filtered',
      correlationId,
    });
  }
  if (completion === 'failed') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'provider_incomplete',
      correlationId,
    });
  }
  return null;
}

export function sanitizeEducationQuizArtifact(result, expectedItems = 5, options = {}) {
  const correlationId = options.correlationId || 'internal-publication';
  const requestedItems = Number.isInteger(expectedItems) && expectedItems > 0
    ? Math.min(expectedItems, 20)
    : 5;
  const provider = providerCompletion(result);
  const terminal = completionArtifact(provider.completion, correlationId);
  if (terminal) return terminal;
  if (provider.completion === 'truncated') {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'provider_truncated_structured_output',
      correlationId,
    });
  }

  const { questions, rejectedCount } = sanitizeEducationQuizItems(provider.text, requestedItems);
  if (questions.length === 0) {
    const crossedClinicalBoundary = containsProhibitedClinicalGuidanceDeep(provider.text);
    return createPublicationArtifact({
      status: crossedClinicalBoundary
        ? PUBLICATION_STATUSES.WITHHELD
        : PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: crossedClinicalBoundary
        ? 'clinical_boundary'
        : 'provider_malformed',
      correlationId,
    });
  }

  if (questions.length < requestedItems || rejectedCount > 0) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.PARTIAL,
      content: questions,
      reasonCode: 'items_withheld_or_missing',
      correlationId,
      limitations: [`Returned ${questions.length} of ${requestedItems} requested safe questions; ${rejectedCount} provider item(s) were rejected.`],
    });
  }
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.AVAILABLE,
    content: questions,
    correlationId,
  });
}

export function sanitizePublicationArtifact(publicationTask, taskInput, result, options = {}) {
  const correlationId = options.correlationId || 'internal-publication';
  const provider = providerCompletion(result);
  const terminal = completionArtifact(provider.completion, correlationId);
  if (terminal) return terminal;

  if (publicationTask === TASKS.CANDIDATE_GENE) {
    if (provider.completion === 'truncated') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_truncated_structured_output',
        correlationId,
      });
    }
    const parsed = parseJsonCandidate(provider.text);
    if (!parsed) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_malformed',
        correlationId,
      });
    }
    const content = JSON.parse(sanitizeCandidateTaskOutput(taskInput, parsed));
    const crossedClinicalBoundary = containsProhibitedClinicalGuidanceDeep(parsed);
    if (taskInput?.operation === 'gene_profile'
      && content.summaryStatus === 'withheld') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.WITHHELD,
        reasonCode: 'clinical_boundary',
        correlationId,
      });
    }
    if (taskInput?.operation === 'gene_profile'
      && content.summaryStatus === 'unavailable') {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'profile_summary_unavailable',
        correlationId,
      });
    }
    const hasSafeCandidateContent = Array.isArray(content.candidateGenes)
      ? content.candidateGenes.length > 0
      : taskInput?.operation === 'gene_profile'
        ? content.summaryStatus === 'available'
          || content.keyTakeaways?.length > 0
          || content.phenotypes?.length > 0
        : true;
    if (crossedClinicalBoundary && !hasSafeCandidateContent) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.WITHHELD,
        reasonCode: 'clinical_boundary',
        correlationId,
      });
    }
    if (crossedClinicalBoundary) {
      // The normalized candidate output contains only fields that passed the
      // boundary. A partial status makes the omission visible without ever
      // carrying the blocked provider text inside the artifact.
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.PARTIAL,
        content,
        reasonCode: 'clinical_fields_withheld',
        correlationId,
        limitations: ['One or more provider fields crossed the non-clinical publication boundary and were omitted.'],
      });
    }
    const candidateCount = Array.isArray(content.candidateGenes)
      ? content.candidateGenes.length
      : null;
    const hasClassificationDetail = Boolean(
      content.diseaseName
      || content.inheritancePattern
      || content.mainFeatures?.length
      || content.synonyms?.length,
    );
    if (taskInput?.operation === 'suggest_candidates' && candidateCount === 0) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_empty',
        correlationId,
      });
    }
    if (taskInput?.operation === 'classify' && !hasClassificationDetail) {
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.UNAVAILABLE,
        reasonCode: 'provider_empty',
        correlationId,
      });
    }
    if (taskInput?.operation === 'classify_and_suggest' && candidateCount === 0) {
      if (!hasClassificationDetail) {
        return createPublicationArtifact({
          status: PUBLICATION_STATUSES.UNAVAILABLE,
          reasonCode: 'provider_empty',
          correlationId,
        });
      }
      return createPublicationArtifact({
        status: PUBLICATION_STATUSES.PARTIAL,
        content,
        reasonCode: 'candidate_leads_missing',
        correlationId,
        limitations: ['The reviewed query classification is available, but the provider returned no reusable candidate-gene leads.'],
      });
    }
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.AVAILABLE,
      content,
      correlationId,
    });
  }

  const taskConfig = publicationTask === TASKS.GENETICS_EDUCATION
    ? { maxLength: 8_000, emptyReasonCode: 'provider_empty' }
    : RESEARCH_TASKS.has(publicationTask)
      ? { maxLength: 12_000, emptyReasonCode: 'provider_empty' }
      : publicationTask === TASKS.LEARNING_ACTIVITY
        ? { maxLength: 3_000, emptyReasonCode: 'provider_empty' }
        : null;
  if (!taskConfig) {
    return createPublicationArtifact({
      status: PUBLICATION_STATUSES.UNAVAILABLE,
      reasonCode: 'unsupported_publication_task',
      correlationId,
    });
  }

  const artifact = sanitizeNarrativeArtifact(provider.text, {
    ...taskConfig,
    correlationId,
  });
  if (provider.completion !== 'truncated'
    || ![PUBLICATION_STATUSES.AVAILABLE, PUBLICATION_STATUSES.PARTIAL].includes(artifact.status)) {
    return artifact;
  }
  return createPublicationArtifact({
    status: PUBLICATION_STATUSES.PARTIAL,
    content: artifact.content,
    reasonCode: 'provider_truncated',
    correlationId,
    limitations: [
      'The provider reached its output limit; the response may be incomplete.',
      ...artifact.limitations,
    ],
  });
}

export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  return sanitizePublicationArtifact(publicationTask, taskInput, result, {
    correlationId: 'legacy-publication-boundary',
  });
}

export const __test = {
  decodeHtmlEntities,
  normalizeVisibleText,
  semanticSafetyText,
  cleanText,
  cleanNonClinicalText,
  cleanStringArray,
  containsProhibitedClinicalGuidance,
  parseJsonCandidate,
  normalizeCandidateGene,
  normalizeCandidateGenes,
  trustedQueryClassification,
  normalizeClassification,
  normalizeGeneProfile,
  WITHHELD_PROFILE_SUMMARY,
  UNAVAILABLE_PROFILE_SUMMARY,
};
