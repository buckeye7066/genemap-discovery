import { resolveEducationTopic } from './educationCatalog.js';

export const PUBLICATION_TASK_INPUT_VERSION = 1;

const TASKS = Object.freeze({
  GENETICS_EDUCATION: 'genetics_education',
  AGGREGATE_GENOMICS_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE_RESEARCH: 'candidate_gene_research',
  RESEARCH_HYPOTHESIS: 'research_hypothesis',
  LEARNING_ACTIVITY_SUMMARY: 'learning_activity_summary',
});

const RAW_GENERATION_FIELDS = Object.freeze(['prompt', 'messages', 'context', 'topic']);
const RESEARCH_CLASSIFICATIONS = new Set([
  'deidentified_aggregate',
  'synthetic',
  'public_dataset',
]);
const RESEARCH_MODALITIES = new Set([
  'wes',
  'wgs',
  'rna_seq',
  'genotype',
  'phenotype',
  'cnv',
  'proteomics',
  'metabolomics',
  'epigenomics',
  'treatment_response',
]);
const RESEARCH_OBJECTIVES = new Set([
  'identify_variants',
  'association_analysis',
  'compare_cohorts',
  'multi_omic_hypothesis',
  'covariate_design',
  'cohort_summary',
]);
const CANDIDATE_OPERATIONS = new Set([
  'classify_and_suggest',
  'classify',
  'suggest_candidates',
  'gene_profile',
]);
const AUDIENCES = new Set([
  'general',
  'undergraduate',
  'graduate',
  'researcher',
  'medical_researcher',
]);
const EDUCATION_LEVELS = new Set([
  'elementary',
  'middle_school',
  'high_school',
  'undergraduate',
  'graduate',
  'postgraduate',
]);
const TUTOR_INTERACTIONS = new Set([
  'explain_another_way',
  'give_example',
  'compare_concepts',
  'check_understanding',
]);
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const ENSEMBL_GENE_ID = /^ENSG\d{11}(?:\.\d+)?$/u;
const ENTREZ_GENE_ID = /^\d{1,12}$/u;
const HPO_ID = /^HP:\d{7}$/u;
const MONDO_ID = /^MONDO:\d{7}$/u;
const HPO_RESOLVER_SOURCE = 'NLM Clinical Tables HPO';
const HPO_API_VERSION = 'v3';
const MONDO_RESOLVER_SOURCE = 'Monarch Initiative';
const MONDO_API_VERSION = 'v3';
const GENE_RESOLVER_SOURCE = 'MyGene.info';

const PUBLICATION_CONCEPT_SOURCE = 'genemap_curated';
const PUBLICATION_CONCEPT_VERSION = 1;
const PUBLICATION_CONCEPTS = Object.freeze([
  ['disease:rheumatoid-arthritis', 'Rheumatoid Arthritis', 'disease'],
  ['disease:trisomy-21', 'Trisomy 21', 'disease'],
  ['disease:cystic-fibrosis', 'Cystic Fibrosis', 'disease'],
  ['disease:type-2-diabetes', 'Type 2 Diabetes', 'disease'],
  ['disease:alzheimers-disease', "Alzheimer's Disease", 'disease'],
  ['disease:breast-cancer', 'Breast Cancer', 'disease'],
  ['phenotype:polydactyly', 'polydactyly', 'phenotype'],
  ['phenotype:intellectual-disability', 'intellectual disability', 'phenotype'],
  ['phenotype:short-stature', 'short stature', 'phenotype'],
  ['phenotype:seizures', 'seizures', 'phenotype'],
  ['phenotype:early-onset-symptoms', 'early-onset symptoms', 'phenotype'],
]);
const PUBLICATION_CONCEPT_INDEX = new Map(PUBLICATION_CONCEPTS.map(
  ([conceptId, canonicalLabel, conceptKind]) => [conceptId, { conceptId, canonicalLabel, conceptKind }]
));

const MODALITY_LABELS = Object.freeze({
  wes: 'whole-exome sequencing (WES)',
  wgs: 'whole-genome sequencing (WGS)',
  rna_seq: 'RNA sequencing',
  genotype: 'genotype variables',
  phenotype: 'phenotype variables',
  cnv: 'copy-number variants',
  proteomics: 'proteomics',
  metabolomics: 'metabolomics',
  epigenomics: 'epigenomics',
  treatment_response: 'aggregate treatment-response variables',
});

const OBJECTIVE_LABELS = Object.freeze({
  identify_variants: 'identify and compare variants at cohort level',
  association_analysis: 'design an exploratory population-level association analysis',
  compare_cohorts: 'compare explicitly aggregate cohorts',
  multi_omic_hypothesis: 'generate testable cohort-level multi-omic hypotheses',
  covariate_design: 'brainstorm non-clinical cohort covariates and endpoints',
  cohort_summary: 'summarize cohort-level research patterns and limitations',
});

function hasForbiddenControlCharacter(value) {
  return Array.from(value).some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint <= 0x1f || codePoint === 0x7f;
  });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

function hasOnlyKeys(value, allowed) {
  return isPlainObject(value) && Object.keys(value).every((key) => allowed.has(key));
}

function ok(value) {
  return { ok: true, value };
}

function invalid(reason) {
  return { ok: false, reason };
}

function normalizeGeneSymbol(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return GENE_SYMBOL.test(normalized) ? normalized : null;
}

function normalizeResearchTerm(value) {
  if (value?.kind === 'hpo') {
    if (!hasOnlyKeys(value, new Set(['kind', 'identifier']))) return null;
    const identifier = typeof value.identifier === 'string' ? value.identifier.trim().toUpperCase() : '';
    return HPO_ID.test(identifier) ? { kind: 'hpo', identifier } : null;
  }
  if (value?.kind === 'mondo') {
    if (!hasOnlyKeys(value, new Set(['kind', 'identifier']))) return null;
    const identifier = typeof value.identifier === 'string' ? value.identifier.trim().toUpperCase() : '';
    return MONDO_ID.test(identifier) ? { kind: 'mondo', identifier } : null;
  }
  if (value?.kind !== 'curated_concept' || !hasOnlyKeys(value, new Set([
    'kind', 'conceptId', 'canonicalLabel', 'conceptKind', 'source', 'version',
  ]))) return null;
  const known = PUBLICATION_CONCEPT_INDEX.get(value.conceptId);
  if (
    !known
    || value.canonicalLabel !== known.canonicalLabel
    || value.conceptKind !== known.conceptKind
    || value.source !== PUBLICATION_CONCEPT_SOURCE
    || value.version !== PUBLICATION_CONCEPT_VERSION
  ) return null;
  return { kind: 'curated_concept', ...known, source: PUBLICATION_CONCEPT_SOURCE, version: PUBLICATION_CONCEPT_VERSION };
}

function normalizeStringArray(value, normalizer, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = value.map(normalizer);
  if (normalized.some((item) => item == null)) return null;
  return [...new Set(normalized)];
}

function normalizeReferenceArray(value, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = value.map(normalizeResearchTerm);
  if (normalized.some((item) => item == null)) return null;
  const seen = new Set();
  return normalized.filter((item) => {
    const key = item.kind === 'hpo' || item.kind === 'mondo' ? item.identifier : item.conceptId;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateResearchInput(input) {
  if (!hasOnlyKeys(input, new Set(['version', 'cohort', 'modalities', 'objective', 'focus']))) {
    return invalid('Research input contains unsupported fields.');
  }
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION) {
    return invalid('Unsupported research input version.');
  }
  if (!hasOnlyKeys(input.cohort, new Set(['sampleCount', 'classification', 'hasControls']))) {
    return invalid('A bounded aggregate cohort specification is required.');
  }
  const sampleCount = input.cohort.sampleCount;
  if (!Number.isInteger(sampleCount) || sampleCount < 2 || sampleCount > 1_000_000) {
    return invalid('sampleCount must be an integer from 2 to 1000000.');
  }
  if (!RESEARCH_CLASSIFICATIONS.has(input.cohort.classification)) {
    return invalid('The cohort must be explicitly deidentified aggregate, synthetic, or public.');
  }
  if (typeof input.cohort.hasControls !== 'boolean') {
    return invalid('hasControls must be a boolean.');
  }
  const modalities = normalizeStringArray(input.modalities, (value) => (
    typeof value === 'string' && RESEARCH_MODALITIES.has(value) ? value : null
  ), 6);
  if (!modalities || modalities.length === 0) {
    return invalid('At least one recognized aggregate research modality is required.');
  }
  if (!RESEARCH_OBJECTIVES.has(input.objective)) {
    return invalid('A recognized cohort-level research objective is required.');
  }
  const focus = input.focus == null ? null : normalizeResearchTerm(input.focus);
  if (input.focus != null && !focus) {
    return invalid('The optional focus must be an HPO/MONDO id or immutable reviewed concept reference.');
  }
  return ok({
    version: PUBLICATION_TASK_INPUT_VERSION,
    cohort: {
      sampleCount,
      classification: input.cohort.classification,
      hasControls: input.cohort.hasControls,
    },
    modalities,
    objective: input.objective,
    ...(focus ? { focus } : {}),
  });
}

function validateCandidateInput(input) {
  if (!hasOnlyKeys(input, new Set([
    'version', 'operation', 'query', 'gene', 'audience',
  ]))) return invalid('Candidate-gene input contains unsupported fields.');
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION || !CANDIDATE_OPERATIONS.has(input.operation)) {
    return invalid('A recognized candidate-gene operation and input version are required.');
  }

  const queryOperation = ['classify_and_suggest', 'classify', 'suggest_candidates']
    .includes(input.operation);
  const geneOperation = input.operation === 'gene_profile';
  let query;
  if (queryOperation) {
    query = normalizeResearchTerm(input.query);
    if (!query) return invalid('An HPO/MONDO id or immutable reviewed candidate-gene concept is required.');
  } else if (input.query != null) {
    return invalid('query is not accepted for this candidate-gene operation.');
  }

  let gene;
  if (geneOperation) {
    if (!hasOnlyKeys(input.gene, new Set(['symbol']))) {
      return invalid('Gene profiles accept only a symbol for server-side authoritative resolution.');
    }
    const symbol = normalizeGeneSymbol(input.gene.symbol);
    if (!symbol) return invalid('A valid symbol is required for server-side authoritative resolution.');
    gene = { symbol };
  } else if (input.gene != null) {
    return invalid('gene is not accepted for this candidate-gene operation.');
  }

  const audience = input.audience == null ? 'undergraduate' : input.audience;
  if (!AUDIENCES.has(audience)) return invalid('A recognized audience is required.');

  return ok({
    version: PUBLICATION_TASK_INPUT_VERSION,
    operation: input.operation,
    ...(query ? { query } : {}),
    ...(gene ? { gene } : {}),
    audience,
  });
}

function validateLearningActivityInput(input) {
  if (!hasOnlyKeys(input, new Set(['version', 'educationLevel', 'recentGenes', 'recentConcepts']))) {
    return invalid('Learning-activity input contains unsupported fields.');
  }
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION) return invalid('Unsupported learning input version.');
  const educationLevel = EDUCATION_LEVELS.has(input.educationLevel)
    ? input.educationLevel
    : 'undergraduate';
  const recentGenes = normalizeStringArray(input.recentGenes, normalizeGeneSymbol, 5);
  const recentConcepts = normalizeReferenceArray(input.recentConcepts, 3);
  if (!recentGenes || !recentConcepts) return invalid('Learning activity must use bounded genes and verified concepts.');
  if (recentGenes.length === 0 && recentConcepts.length === 0) {
    return invalid('At least one bounded learning-activity item is required.');
  }
  return ok({ version: PUBLICATION_TASK_INPUT_VERSION, educationLevel, recentGenes, recentConcepts });
}

function normalizeResolvedHpo(value, expectedIdentifier) {
  if (!isPlainObject(value)) return null;
  const identifier = typeof value.identifier === 'string' ? value.identifier.trim().toUpperCase() : '';
  const canonicalLabel = typeof value.canonicalLabel === 'string' ? value.canonicalLabel.trim() : '';
  if (
    identifier !== expectedIdentifier
    || !HPO_ID.test(identifier)
    || !canonicalLabel
    || canonicalLabel.length > 256
    || hasForbiddenControlCharacter(canonicalLabel)
    || value.source !== HPO_RESOLVER_SOURCE
    || value.apiVersion !== HPO_API_VERSION
    || value.obsolete !== false
  ) return null;
  return {
    kind: 'hpo',
    identifier,
    canonicalLabel,
    source: HPO_RESOLVER_SOURCE,
    apiVersion: HPO_API_VERSION,
    obsolete: false,
  };
}

function normalizeResolvedMondo(value, expectedIdentifier) {
  if (!isPlainObject(value)) return null;
  const identifier = typeof value.identifier === 'string' ? value.identifier.trim().toUpperCase() : '';
  const canonicalLabel = typeof value.canonicalLabel === 'string' ? value.canonicalLabel.trim() : '';
  if (
    identifier !== expectedIdentifier
    || !MONDO_ID.test(identifier)
    || !canonicalLabel
    || canonicalLabel.length > 256
    || hasForbiddenControlCharacter(canonicalLabel)
    || value.source !== MONDO_RESOLVER_SOURCE
    || value.apiVersion !== MONDO_API_VERSION
  ) return null;
  return {
    kind: 'mondo',
    identifier,
    canonicalLabel,
    source: MONDO_RESOLVER_SOURCE,
    apiVersion: MONDO_API_VERSION,
  };
}

function normalizeResolvedGene(value, expectedSymbol) {
  if (!isPlainObject(value)) return null;
  const symbol = normalizeGeneSymbol(value.symbol);
  const ensemblId = typeof value.ensemblId === 'string' ? value.ensemblId.trim().toUpperCase() : '';
  const entrezId = value.entrezId == null ? '' : String(value.entrezId).trim();
  if (
    symbol !== expectedSymbol
    || value.source !== GENE_RESOLVER_SOURCE
    || value.verified !== true
    || (ensemblId && !ENSEMBL_GENE_ID.test(ensemblId))
    || (entrezId && !ENTREZ_GENE_ID.test(entrezId))
    || (!ensemblId && !entrezId)
  ) return null;
  return {
    symbol,
    ...(ensemblId ? { ensemblId } : {}),
    ...(entrezId ? { entrezId } : {}),
    source: GENE_RESOLVER_SOURCE,
    verified: true,
  };
}

function resolveReference(value, options) {
  if (value.kind === 'hpo') {
    return normalizeResolvedHpo(options.resolvedHpoById?.[value.identifier], value.identifier);
  }
  if (value.kind === 'mondo') {
    return normalizeResolvedMondo(options.resolvedMondoById?.[value.identifier], value.identifier);
  }
  return value;
}

function applyServerResolutions(task, value, options) {
  if (task === TASKS.AGGREGATE_GENOMICS_RESEARCH || task === TASKS.RESEARCH_HYPOTHESIS) {
    if (!value.focus) return ok(value);
    const focus = resolveReference(value.focus, options);
    return focus ? ok({ ...value, focus }) : invalid('The HPO/MONDO focus could not be authoritatively resolved.');
  }
  if (task === TASKS.CANDIDATE_GENE_RESEARCH) {
    if (value.operation === 'gene_profile') {
      const gene = normalizeResolvedGene(options.resolvedGene, value.gene.symbol);
      return gene ? ok({ ...value, gene }) : invalid('The gene symbol could not be authoritatively resolved.');
    }
    const query = resolveReference(value.query, options);
    return query ? ok({ ...value, query }) : invalid('The HPO/MONDO query could not be authoritatively resolved.');
  }
  if (task === TASKS.LEARNING_ACTIVITY_SUMMARY) {
    const recentGenes = value.recentGenes.map((symbol) => (
      normalizeResolvedGene(options.resolvedGenesBySymbol?.[symbol], symbol)
    ));
    const recentConcepts = value.recentConcepts.map((item) => (
      resolveReference(item, options)
    ));
    return recentGenes.every(Boolean) && recentConcepts.every(Boolean)
      ? ok({ ...value, recentGenes, recentConcepts })
      : invalid('A recent gene or external concept could not be authoritatively resolved.');
  }
  return ok(value);
}

function validateTutorInput(input) {
  if (!hasOnlyKeys(input, new Set(['version', 'topic', 'level', 'interaction']))) {
    return invalid('Tutor input contains unsupported fields.');
  }
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION) return invalid('Unsupported tutor input version.');
  const topic = resolveEducationTopic(input.topic);
  if (!topic) return invalid('Tutor chat requires a canonical catalog topic identifier.');
  if (!EDUCATION_LEVELS.has(input.level)) return invalid('Tutor chat requires a recognized education level.');
  if (!TUTOR_INTERACTIONS.has(input.interaction)) return invalid('Tutor chat requires a guided interaction.');
  return ok({
    version: PUBLICATION_TASK_INPUT_VERSION,
    topic: topic.title,
    topicId: topic.id,
    topicCategory: topic.category,
    catalogVersion: topic.catalogVersion,
    level: input.level,
    interaction: input.interaction,
  });
}

export function hasRawGenerationInput(body) {
  if (!isPlainObject(body)) return false;
  return RAW_GENERATION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

/** Shape-check untrusted input without treating external identifiers as resolved. */
export function parsePublicationTaskInput(task, input, { routePath = '/llm/invoke' } = {}) {
  if (routePath === '/education/chat') {
    return task === TASKS.GENETICS_EDUCATION
      ? validateTutorInput(input)
      : invalid('Tutor chat accepts only genetics education.');
  }
  switch (task) {
    case TASKS.AGGREGATE_GENOMICS_RESEARCH:
    case TASKS.RESEARCH_HYPOTHESIS:
      return validateResearchInput(input);
    case TASKS.CANDIDATE_GENE_RESEARCH:
      return validateCandidateInput(input);
    case TASKS.LEARNING_ACTIVITY_SUMMARY:
      return validateLearningActivityInput(input);
    case TASKS.GENETICS_EDUCATION:
      return validateTutorInput(input);
    default:
      return invalid('Unknown publication task.');
  }
}

/**
 * Authorization-grade validation. External HPO/gene identities remain invalid
 * until server resolver results are supplied in options.
 */
export function validatePublicationTaskInput(task, input, options = {}) {
  const parsed = parsePublicationTaskInput(task, input, options);
  if (!parsed.ok) return parsed;
  return applyServerResolutions(task, parsed.value, options);
}

function composeResearchPrompt(task, input) {
  const mode = task === TASKS.RESEARCH_HYPOTHESIS
    ? 'Generate testable exploratory hypotheses and a research design.'
    : 'Provide a bounded exploratory cohort-research response.';
  const focus = input.focus
    ? input.focus.kind === 'curated_concept'
      ? `Research focus: ${JSON.stringify(input.focus.canonicalLabel)} (${input.focus.conceptKind}; ${input.focus.conceptId}; catalog v${input.focus.version}).`
      : `Research focus: ${JSON.stringify(input.focus.canonicalLabel)} (${input.focus.identifier}; ${input.focus.source} API ${input.focus.apiVersion}).`
    : 'No disease, phenotype, ontology, or gene focus was supplied.';
  return [
    'You are a genomics research-planning assistant. Work only at deidentified aggregate cohort level.',
    mode,
    `Validated cohort: ${input.cohort.sampleCount} samples; classification=${input.cohort.classification}; controls=${input.cohort.hasControls ? 'present' : 'not specified'}.`,
    `Validated modalities: ${input.modalities.map((item) => MODALITY_LABELS[item]).join(', ')}.`,
    `Validated objective: ${OBJECTIVE_LABELS[input.objective]}.`,
    focus,
    'Do not diagnose, recommend treatment, select medication, calculate dose, interpret an individual result, or infer family risk.',
    'Do not claim that a database was queried. Do not invent citations, identifiers, p-values, FDR values, effect sizes, expression values, or evidence grades.',
    task === TASKS.RESEARCH_HYPOTHESIS
      ? 'Return hypotheses, rationale, cohort-level analysis steps, controls/confounders, expected scenarios, limitations, and exact source-verification next steps.'
      : 'Return cohort-level methods, assumptions, limitations, and exact source-verification next steps.',
  ].join('\n');
}

function composeCandidatePrompt(input) {
  const query = input.query
    ? input.query.kind === 'hpo' || input.query.kind === 'mondo'
      ? `server-resolved ${input.query.kind.toUpperCase()} concept: ${input.query.identifier} (${JSON.stringify(input.query.canonicalLabel)}; ${input.query.source} API ${input.query.apiVersion})`
      : `${input.query.conceptKind}: ${JSON.stringify(input.query.canonicalLabel)} (${input.query.conceptId}; catalog v${input.query.version})`
    : '';
  const gene = input.gene
    ? `${input.gene.symbol} (${input.gene.ensemblId || `NCBI Gene ${input.gene.entrezId}`}; ${input.gene.source})`
    : '';
  const base = [
    'You are a genomics education and exploratory candidate-gene assistant.',
    'Treat all model output as leads for source verification, never as clinical evidence.',
    'Do not claim that OMIM, ClinVar, HPO, UniProt, GTEx, HPA, GWAS Catalog, DisGeNET, or PubMed was queried.',
    'Do not invent citations, record identifiers, evidence grades, prevalence, penetrance, numeric expression values, diagnosis, prognosis, treatment, screening, PGx, or dosing guidance.',
  ];
  const jsonGeneShape = 'symbol, name, explanation (no numeric confidence or evidence grade)';
  switch (input.operation) {
    case 'classify_and_suggest':
      return [...base,
        `Classify the bounded research term (${query}) as disease, phenotype, or ontology identifier and generate candidate-gene leads.`,
        'Order candidateGenes by research-lead usefulness only. Do not invent scores, confidence percentages, evidence grades, species mixing, or citations.',
        `Return ONLY JSON with queryType, isDisease, diseaseName, isHPOTerm, mainFeatures, synonyms, inheritancePattern, and candidateGenes (${jsonGeneShape}).`,
      ].join('\n');
    case 'classify':
      return [...base,
        `Classify the bounded research term (${query}) for candidate-gene research.`,
        'Return ONLY JSON with queryType, isDisease, diseaseName, isHPOTerm, mainFeatures, synonyms, category, and inheritancePattern.',
      ].join('\n');
    case 'suggest_candidates':
      return [...base,
        `Generate 3-15 candidate-gene leads for the bounded research term (${query}).`,
        'Order candidateGenes by research-lead usefulness only. Do not invent scores, confidence percentages, evidence grades, species mixing, or citations.',
        `Return ONLY JSON with candidateGenes (${jsonGeneShape}).`,
      ].join('\n');
    case 'gene_profile':
      return [...base,
        `Create an exploratory profile for the bounded human gene ${gene} for a ${input.audience} audience.`,
        'Return ONLY JSON with summary, keyTakeaways (array), and phenotypes (array of {name}). Exact HPO identifiers must be resolved separately from an authoritative source.',
      ].join('\n');
    default:
      throw new Error('Unsupported candidate-gene operation.');
  }
}

function composeLearningPrompt(input) {
  return [
    'You are a genetics education assistant summarizing bounded learning activity.',
    `Education level: ${input.educationLevel}.`,
    `Recently viewed server-resolved genes: ${JSON.stringify(input.recentGenes)}.`,
    `Recent verified research concepts: ${JSON.stringify(input.recentConcepts)}.`,
    'Generate three brief research-learning observations: a pattern, a conceptual connection, and a deterministic source-checking next step.',
    'Do not infer diagnosis, personal genetic risk, treatment, screening, medication, family risk, or clinical action.',
  ].join('\n');
}

function composeTutorPrompt(input) {
  const interaction = {
    explain_another_way: 'Explain this catalog topic another way, using a fresh analogy.',
    give_example: 'Give one general educational example of this catalog topic.',
    compare_concepts: 'Compare this topic with the closest related catalog concept.',
    check_understanding: 'Ask one short knowledge-check question, then provide the answer separately.',
  }[input.interaction];
  return [
    `Reviewed catalog genetics topic: ${JSON.stringify(input.topic)} (id=${input.topicId}; category=${JSON.stringify(input.topicCategory)}; catalog v${input.catalogVersion}).`,
    interaction,
    'Keep the response general and educational. Do not provide diagnosis, personal risk, treatment, screening, medication, PGx, or dosing advice.',
  ].join('\n');
}

export function composePublicationPrompt(task, input, options = {}) {
  const validation = validatePublicationTaskInput(task, input, options);
  if (!validation.ok) return validation;
  const value = validation.value;
  switch (task) {
    case TASKS.AGGREGATE_GENOMICS_RESEARCH:
    case TASKS.RESEARCH_HYPOTHESIS:
      return { ...validation, prompt: composeResearchPrompt(task, value) };
    case TASKS.CANDIDATE_GENE_RESEARCH:
      return { ...validation, prompt: composeCandidatePrompt(value) };
    case TASKS.LEARNING_ACTIVITY_SUMMARY:
      return { ...validation, prompt: composeLearningPrompt(value) };
    case TASKS.GENETICS_EDUCATION:
      return { ...validation, prompt: composeTutorPrompt(value) };
    default:
      return invalid('Unknown publication task.');
  }
}

export const __test = {
  normalizeResearchTerm,
  validateResearchInput,
  validateCandidateInput,
  validateLearningActivityInput,
  validateTutorInput,
  normalizeResolvedGene,
  normalizeResolvedHpo,
  normalizeResolvedMondo,
  applyServerResolutions,
};
