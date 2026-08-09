const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const CANDIDATE_TASK = 'candidate_gene_research';
const ALLOWED_QUERY_TYPES = new Set(['disease', 'phenotype', 'hpo_term']);
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/gu;

function isPlainObject(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype
      || Object.getPrototypeOf(value) === null);
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string') return null;
  const normalized = value
    .replace(CONTROL_CHARACTERS, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (!normalized) return null;
  return normalized.slice(0, maxLength);
}

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

  const name = cleanText(value.name, 256);
  const explanation = cleanText(value.explanation, 2_000);
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

function normalizeClassification(parsed) {
  const source = isPlainObject(parsed) ? parsed : {};
  const isDisease = source.isDisease === true;
  const queryType = ALLOWED_QUERY_TYPES.has(source.queryType)
    ? source.queryType
    : (isDisease ? 'disease' : 'phenotype');
  const diseaseName = cleanText(source.diseaseName, 256);
  const inheritancePattern = cleanText(source.inheritancePattern, 256);
  return {
    queryType,
    isDisease,
    ...(diseaseName ? { diseaseName } : {}),
    isHPOTerm: source.isHPOTerm === true,
    mainFeatures: cleanStringArray(source.mainFeatures, { maxItems: 20, maxLength: 256 }),
    synonyms: cleanStringArray(source.synonyms, { maxItems: 20, maxLength: 256 }),
    ...(inheritancePattern ? { inheritancePattern } : {}),
    // Model-supplied ontology identifiers are never source records.
    hpoTerms: [],
  };
}

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

function safeEmptyCandidateOutput(operation) {
  if (operation === 'classify') return normalizeClassification({});
  if (operation === 'gene_profile') return normalizeGeneProfile({});
  if (operation === 'suggest_candidates') return { candidateGenes: [] };
  return { ...normalizeClassification({}), candidateGenes: [] };
}

/**
 * Convert untrusted model output into the exact bounded browser contract for a
 * structured publication task. Candidate-gene output fails closed: malformed
 * JSON, invalid symbols, unsupported fields, control characters, duplicates,
 * and oversized collections never reach the client.
 */
export function sanitizePublicationTaskOutput(publicationTask, taskInput, result) {
  if (publicationTask !== CANDIDATE_TASK) {
    return typeof result === 'string' ? result : String(result ?? '');
  }

  const operation = taskInput?.operation;
  const parsed = parseJsonCandidate(result);
  if (!parsed) return JSON.stringify(safeEmptyCandidateOutput(operation));

  if (operation === 'gene_profile') {
    return JSON.stringify(normalizeGeneProfile(parsed));
  }

  if (operation === 'classify') {
    return JSON.stringify(normalizeClassification(parsed));
  }

  const candidateSource = Array.isArray(parsed)
    ? parsed
    : parsed.candidateGenes;
  const candidateGenes = normalizeCandidateGenes(candidateSource);
  if (operation === 'suggest_candidates') {
    return JSON.stringify({ candidateGenes });
  }

  return JSON.stringify({
    ...normalizeClassification(parsed),
    candidateGenes,
  });
}

export const __test = {
  cleanText,
  cleanStringArray,
  parseJsonCandidate,
  normalizeCandidateGene,
  normalizeCandidateGenes,
  normalizeClassification,
  normalizeGeneProfile,
};
