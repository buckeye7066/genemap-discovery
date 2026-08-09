const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const CANDIDATE_TASK = 'candidate_gene_research';
const ALLOWED_QUERY_TYPES = new Set(['disease', 'phenotype', 'hpo_term']);

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
 * Normalize untrusted text, collapse whitespace, reject empty output, and cap
 * the returned string to the supplied maximum length.
 */
function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = replaceControlCharacters(value)
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

/**
 * Normalize a bounded, case-insensitively deduplicated list of strings while
 * discarding non-string, empty, and control-only entries.
 */
function cleanStringArray(value, { maxItems, maxLength }) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const cleaned = [];
  for (const item of value) {
    const text = cleanText(item, maxLength);
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
 * shape. Only symbol, bounded name, and bounded explanation survive.
 */
function normalizeCandidateGene(value) {
  if (!isPlainObject(value)) return null;
  const symbol = typeof value.symbol === 'string'
    ? value.symbol.trim().toUpperCase()
    : '';
  if (!GENE_SYMBOL.test(symbol)) return null;

  const name = cleanText(value.name, 256);
  const explanation = cleanText(value.explanation, 2_000);
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
    ? trusted?.diseaseName ?? cleanText(source.diseaseName, 256)
    : null;
  const inheritancePattern = cleanText(source.inheritancePattern, 256);
  return {
    queryType,
    isDisease,
    ...(diseaseName ? { diseaseName } : {}),
    isHPOTerm,
    mainFeatures: cleanStringArray(source.mainFeatures, { maxItems: 20, maxLength: 256 }),
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
  const summary = cleanText(source.summary, 4_000);
  const keyTakeaways = cleanStringArray(source.keyTakeaways, {
    maxItems: 12,
    maxLength: 500,
  });
  const phenotypeNames = cleanStringArray(
    Array.isArray(source.phenotypes)
      ? source.phenotypes.map((item) => (isPlainObject(item) ? item.name : item))
      : [],
    { maxItems: 20, maxLength: 256 },
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

/**
 * Convert untrusted model output into the exact bounded browser contract for a
 * structured publication task. Candidate-gene output fails closed: malformed
 * JSON, invalid symbols, unsupported fields, control characters, duplicates,
 * and oversized collections never reach the client. Query classification is
 * derived from the validated server-owned reference rather than model claims.
 */
export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  if (publicationTask !== CANDIDATE_TASK) {
    return typeof result === 'string' ? result : String(result ?? '');
  }

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

export const __test = {
  cleanText,
  cleanStringArray,
  parseJsonCandidate,
  normalizeCandidateGene,
  normalizeCandidateGenes,
  trustedQueryClassification,
  normalizeClassification,
  normalizeGeneProfile,
};