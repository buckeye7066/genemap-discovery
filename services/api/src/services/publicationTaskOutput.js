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
const PUBLICATION_BOUNDARY_MESSAGE = 'The AI response was withheld because it crossed GeneMap Discovery\'s education and non-clinical publication boundary. No model-generated clinical guidance was shown.';
const EMPTY_RESEARCH_MESSAGE = 'No bounded research narrative was returned. Review the structured cohort fields and try again.';
const EMPTY_LEARNING_MESSAGE = 'No bounded learning observation was returned. Refresh after additional verified learning activity.';
const EMPTY_EDUCATION_MESSAGE = 'No bounded genetics-education response was returned. Review the selected topic and try again.';
const WITHHELD_PROFILE_SUMMARY = 'Generated profile withheld because the response crossed GeneMap Discovery\'s non-clinical publication boundary. No clinical guidance was shown.';
const UNAVAILABLE_PROFILE_SUMMARY = 'Generated profile unavailable. This gene remains an unverified AI-suggested candidate lead; verify relevance in cited authoritative sources.';

const MEDICATION_NAME_PATTERN = '(?:aspirin|ibuprofen|acetaminophen|paracetamol|naproxen|warfarin|heparin|insulin|metformin|glipizide|semaglutide|liraglutide|atorvastatin|rosuvastatin|simvastatin|lisinopril|losartan|amlodipine|metoprolol|carvedilol|levothyroxine|methimazole|prednisone|amoxicillin|azithromycin|doxycycline|ciprofloxacin|gabapentin|pregabalin|sertraline|fluoxetine|escitalopram|omeprazole|pantoprazole|albuterol|epinephrine|naloxone|[a-z]{4,}(?:mab|nib|pril|sartan|olol|statin|cillin|cycline|azole|vir|caine))';

const CLINICAL_GUIDANCE_PATTERNS = [
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

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function replaceControlCharacters(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
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
    .replace(/!\[([^\]]*)\]\((?:\\.|[^)])*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/gu, '$1')
    .replace(/\b(?:javascript|data):[^\s]+/giu, ' ')
    .replace(/\bhttps?:\/\/[^\s<>()]+/giu, '[external link removed]')
    .replace(/(^|[\s(])\/\/[A-Za-z0-9.-]+(?:\/[^\s<>()]*)?/gmu, '$1[external link removed]')
    .replace(/\bwww\.[^\s<>()]+/giu, '[external link removed]');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = stripUntrustedMarkupAndLinks(replaceControlCharacters(value))
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
    .replace(/\bdoes\s+not\s+(?:assess|predict|establish)\s+(?:personal\s+)?(?:risk|diagnosis|prognosis)\b(?=$|[.!?;:\n])/giu, ' ')
    .replace(/\bdo\s+not\s+use\s+(?:it|(?:this|the)\s+(?:output|response|result|results)|these\s+results|output|response|result|results)\s+(?:medically|for\s+(?:medical\s+advice|clinical\s+use|clinical\s+decisions?|(?:diagnosis|personal(?:-|\s)risk(?:\s+prediction)?|treatment|dosing|screening)(?:\s*(?:,|and|or)\s*(?:diagnosis|personal(?:-|\s)risk(?:\s+prediction)?|treatment|dosing|screening))*(?:\s*,?\s*(?:and|or)\s+(?:other\s+)?clinical\s+decisions?)?))\b(?=$|[.!?;:\n])/giu, ' ');
}

function containsProhibitedClinicalGuidance(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const policyText = removeAllowedBoundaryDisclaimers(value);
  return CLINICAL_GUIDANCE_PATTERNS.some((pattern) => pattern.test(policyText));
}

function cleanNonClinicalText(value, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned || containsProhibitedClinicalGuidance(cleaned)) return null;
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

function cleanNarrativeFormatting(value, maxLength) {
  if (typeof value !== 'string') return null;
  const lines = value
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
  return normalized.slice(0, maxLength);
}

function sanitizeNarrativeOutput(result, { maxLength, emptyMessage }) {
  const cleaned = cleanNarrativeFormatting(result, maxLength);
  if (!cleaned) return emptyMessage;
  if (containsProhibitedClinicalGuidance(cleaned)) return PUBLICATION_BOUNDARY_MESSAGE;
  return cleaned;
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
    : containsProhibitedClinicalGuidance(candidateSummary)
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
export function sanitizeEducationQuizOutput(result, maxItems = 20) {
  if (!Array.isArray(result)) return [];
  const sanitized = [];
  for (const item of result) {
    if (!isPlainObject(item) || !Array.isArray(item.options)) continue;
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
    ) continue;
    sanitized.push({ question, options, correctIndex, explanation });
    if (sanitized.length >= maxItems) break;
  }
  return sanitized;
}

export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  if (publicationTask === TASKS.CANDIDATE_GENE) {
    return sanitizeCandidateTaskOutput(taskInput, result);
  }
  if (publicationTask === TASKS.GENETICS_EDUCATION) {
    return sanitizeNarrativeOutput(result, {
      maxLength: 8_000,
      emptyMessage: EMPTY_EDUCATION_MESSAGE,
    });
  }
  if (RESEARCH_TASKS.has(publicationTask)) {
    return sanitizeNarrativeOutput(result, {
      maxLength: 12_000,
      emptyMessage: EMPTY_RESEARCH_MESSAGE,
    });
  }
  if (publicationTask === TASKS.LEARNING_ACTIVITY) {
    return sanitizeNarrativeOutput(result, {
      maxLength: 3_000,
      emptyMessage: EMPTY_LEARNING_MESSAGE,
    });
  }
  return typeof result === 'string' ? result : String(result ?? '');
}

export const __test = {
  cleanText,
  cleanNonClinicalText,
  cleanStringArray,
  cleanNarrativeFormatting,
  containsProhibitedClinicalGuidance,
  sanitizeNarrativeOutput,
  parseJsonCandidate,
  normalizeCandidateGene,
  normalizeCandidateGenes,
  trustedQueryClassification,
  normalizeClassification,
  normalizeGeneProfile,
  PUBLICATION_BOUNDARY_MESSAGE,
  EMPTY_RESEARCH_MESSAGE,
  EMPTY_LEARNING_MESSAGE,
  EMPTY_EDUCATION_MESSAGE,
  WITHHELD_PROFILE_SUMMARY,
  UNAVAILABLE_PROFILE_SUMMARY,
};