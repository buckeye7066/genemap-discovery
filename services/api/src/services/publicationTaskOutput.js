const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const TASKS = Object.freeze({
  AGGREGATE_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE: 'candidate_gene_research',
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

const CLINICAL_GUIDANCE_PATTERNS = [
  /\b(?:recommend(?:ed|ation)?|advise(?:d)?|should|must|need(?:s)? to|ought to|prescribe(?:d)?|start|stop|increase|decrease|take|avoid|undergo|administer|switch)\b[^.!?\n]{0,120}\b(?:treatment|therapy|medication|medicine|drug|screening|test|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b/iu,
  /\b(?:screening|treatment|therapy|medication|medicine|drug|test|dose|dosing|dosage|surgery|procedure|clinical care|medical care)\b[^.!?\n]{0,40}\b(?:is|are|would be|may be|should be|must be)\b[^.!?\n]{0,40}\b(?:recommended|advised|indicated|required|necessary|appropriate)\b/iu,
  /\b(?:you|your|patient|this patient|individual|family members?)\b[^.!?\n]{0,120}\b(?:personal risk|risk of|diagnos\w*|prognos\w*|treatment|therapy|medication|medicine|drug|screening|dose|dosing|clinical action)\b/iu,
  /\b(?:consult|contact|see|seek)\b[^.!?\n]{0,60}\b(?:doctor|physician|clinician|genetic counselor|medical professional|emergency department|emergency care)\b/iu,
  /\b(?:diagnos(?:e|ed|es|ing)|diagnosis|prognosis|prognostic conclusion|clinical recommendation|treatment recommendation|screening recommendation|medication recommendation|drug recommendation)\b/iu,
  /\b(?:dose|dosing|dosage)\b[^.!?\n]{0,80}\b(?:recommend\w*|should|must|take|administer|adjust|increase|decrease|mg|mcg|ug|units?)\b/iu,
  /\b\d+(?:\.\d+)?\s*(?:mg|mcg|μg|ug|ml|mL|units?)\b/u,
];

/**
 * Return true only for ordinary object records, excluding arrays, dates, class
 * instances, and other prototype-bearing values from model output.
 */
function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

/**
 * Replace C0, DEL, and C1 control characters with spaces before text reaches
 * logs, JSON responses, React, copied summaries, or printable reports.
 */
function replaceControlCharacters(value) {
  return Array.from(value, (character) => {
    const codePoint = character.codePointAt(0) ?? -1;
    const isC0OrDel = codePoint <= 0x1f || codePoint === 0x7f;
    const isC1 = codePoint >= 0x80 && codePoint <= 0x9f;
    return isC0OrDel || isC1 ? ' ' : character;
  }).join('');
}

/**
 * Remove HTML, active schemes, Markdown link targets, and bare URLs from model
 * text. Provider-generated prose is never allowed to create a source link.
 */
function stripUntrustedMarkupAndLinks(value) {
  return value
    .replace(/<[^>]*>/gu, ' ')
    .replace(/!\[([^\]]*)\]\((?:\\.|[^)])*\)/gu, '$1')
    .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/gu, '$1')
    .replace(/\b(?:javascript|data):[^\s]+/giu, ' ')
    .replace(/\bhttps?:\/\/[^\s<>()]+/giu, '[external link removed]')
    .replace(/\bwww\.[^\s<>()]+/giu, '[external link removed]');
}

/**
 * Normalize untrusted inline text, collapse whitespace, reject empty output,
 * and cap the returned string to the supplied maximum length.
 */
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = stripUntrustedMarkupAndLinks(replaceControlCharacters(value))
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

/**
 * Remove known non-clinical disclaimer phrases before policy matching. This
 * avoids rejecting text merely because it says that an output is not medical
 * advice, while preserving real instructions such as "do not stop medication".
 */
function removeAllowedBoundaryDisclaimers(value) {
  return value
    .replace(/\bnot\s+(?:a\s+)?diagnosis\b/giu, ' ')
    .replace(/\bnot\s+medical\s+advice\b/giu, ' ')
    .replace(/\bnot\s+(?:intended|suitable)\s+for\s+clinical\s+use\b/giu, ' ')
    .replace(/\bdoes\s+not\s+(?:assess|predict|establish)\s+(?:personal\s+)?(?:risk|diagnosis|prognosis)\b/giu, ' ')
    .replace(/\bdo\s+not\s+use\s+(?:this|the|these|it|output|response|result|results)\b[^.!?\n]{0,160}/giu, ' ');
}

/** Return true when model prose contains clinical or personalized guidance. */
function containsProhibitedClinicalGuidance(value) {
  if (typeof value !== 'string' || !value.trim()) return false;
  const policyText = removeAllowedBoundaryDisclaimers(value);
  return CLINICAL_GUIDANCE_PATTERNS.some((pattern) => pattern.test(policyText));
}

/** Normalize one inline field and fail closed when it crosses the clinical boundary. */
function cleanNonClinicalText(value, maxLength) {
  const cleaned = cleanText(value, maxLength);
  if (!cleaned || containsProhibitedClinicalGuidance(cleaned)) return null;
  return cleaned;
}

/**
 * Normalize a bounded, case-insensitively deduplicated list of strings while
 * discarding non-string, empty, control-only, or policy-violating entries.
 */
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

/**
 * Preserve useful Markdown line structure while stripping active markup,
 * links, controls, excessive blank lines, and output beyond the task limit.
 */
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

/**
 * Return a bounded narrative or a deterministic withholding/empty message.
 * Published research and learning tasks never pass provider prose through raw.
 */
function sanitizeNarrativeOutput(result, { maxLength, emptyMessage }) {
  const cleaned = cleanNarrativeFormatting(result, maxLength);
  if (!cleaned) return emptyMessage;
  if (containsProhibitedClinicalGuidance(cleaned)) return PUBLICATION_BOUNDARY_MESSAGE;
  return cleaned;
}

/**
 * Parse a model response that may contain JSON directly, inside a Markdown
 * fence, or surrounded by explanatory prose. Return null when no bounded JSON
 * object or array can be recovered.
 */
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

/**
 * Convert one untrusted candidate record into the publication-safe gene lead
 * shape. Only symbol, bounded name, and bounded non-clinical explanation survive.
 */
function normalizeCandidateGene(value) {
  if (!isPlainObject(value)) return null;
  const symbol = typeof value.symbol === 'string'
    ? value.symbol.trim().toUpperCase()
    : '';
  if (!GENE_SYMBOL.test(symbol)) return null;

  const name = cleanText(value.name, 256);
  const explanation = cleanNonClinicalText(value.explanation, 2_000);
  return {
    symbol,
    ...(name ? { name } : {}),
    ...(explanation ? { explanation } : {}),
  };
}

/**
 * Normalize, deduplicate, and cap candidate-gene leads while preserving model
 * order only as an uncalibrated research-lead ordering hint.
 */
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

/**
 * Derive query type from the server-validated HPO, MONDO, or curated concept so
 * contradictory model self-classification cannot change application behavior.
 */
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

/**
 * Build the bounded classification response. Trusted query metadata controls
 * type and disease status; model output may contribute only descriptive text.
 */
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
    synonyms: cleanStringArray(source.synonyms, { maxItems: 20, maxLength: 256 }),
    ...(inheritancePattern ? { inheritancePattern } : {}),
    // Model-supplied ontology identifiers are never source records.
    hpoTerms: [],
  };
}

/**
 * Reduce a model-generated gene profile to bounded educational prose and
 * phenotype names. Source identifiers and clinical-looking fields are dropped.
 */
function normalizeGeneProfile(parsed) {
  const source = isPlainObject(parsed) ? parsed : {};
  const summary = cleanNonClinicalText(source.summary, 4_000);
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
    ...(summary ? { summary } : {}),
    keyTakeaways,
    // Only a bounded name survives. HPO ids and association metadata must be
    // resolved separately through an authoritative server-owned adapter.
    phenotypes: phenotypeNames.map((name) => ({ name })),
  };
}

/**
 * Return the stable fail-closed response shape expected by each candidate-gene
 * operation when model output is missing or malformed.
 */
function safeEmptyCandidateOutput(operation, taskInput) {
  if (operation === 'classify') return normalizeClassification({}, taskInput);
  if (operation === 'gene_profile') return normalizeGeneProfile({});
  if (operation === 'suggest_candidates') return { candidateGenes: [] };
  return { ...normalizeClassification({}, taskInput), candidateGenes: [] };
}

/** Convert candidate-gene model output into the exact bounded browser contract. */
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
 * Convert untrusted model output into a task-specific bounded publication
 * contract. No recognized published task receives raw provider output.
 */
export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  if (publicationTask === TASKS.CANDIDATE_GENE) {
    return sanitizeCandidateTaskOutput(taskInput, result);
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
  // The route rejects unknown publication tasks before provider invocation.
  // Keep this helper backward compatible for non-published internal callers.
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
};
