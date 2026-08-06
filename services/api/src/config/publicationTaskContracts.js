import { TOPICS_CATALOG } from './educationCatalog.js';

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
const RESEARCH_TERM_KINDS = new Set(['disease', 'phenotype', 'hpo', 'gene']);
const CANDIDATE_OPERATIONS = new Set([
  'classify_and_suggest',
  'classify',
  'suggest_candidates',
  'gene_profile',
]);
const CANDIDATE_QUERY_KINDS = new Set(['disease', 'phenotype', 'hpo']);
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
const SUBJECT_LABEL = /^[\p{L}\p{N}][\p{L}\p{N} &+,'’().:/_-]{0,119}$/u;
const GENE_SYMBOL = /^[A-Z0-9][A-Z0-9-]{1,14}$/u;
const ENSEMBL_GENE_ID = /^ENSG\d{11}(?:\.\d+)?$/u;
const ENTREZ_GENE_ID = /^\d{1,12}$/u;
const HPO_ID = /^HP:\d{7}$/u;
const PROMPT_CONTROL = /\b(?:ignore|disregard|override|bypass|system|developer|prompt|instructions?|diagnos\w*|prescribe|recommend|dos(?:e|ing|age)|what should i|should (?:i|you)|for me|for myself)\b/i;
const PERSONAL_OR_IDENTIFIED = /\b(?:i|me|my|mine|you|your|yours|mom|mother|dad|father|child|patient|participant|subject|jane doe|john smith|date of birth|dob|mrn|ssn)\b/i;
const INSTRUCTION_LIKE_LABEL = /\b(?:analy[sz]e|assess|calculate|choose|compare|compose|create|draft|explain|generate|give|include|interpret|start|stop|take|tell|write)\b/i;

const KNOWN_TOPIC_VALUES = new Set();
for (const { topics } of TOPICS_CATALOG) {
  for (const topic of topics) {
    KNOWN_TOPIC_VALUES.add(topic.id.trim().toLowerCase());
    KNOWN_TOPIC_VALUES.add(topic.title.trim().toLowerCase());
  }
}

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

function normalizeSubjectLabel(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  if (!SUBJECT_LABEL.test(normalized) || PROMPT_CONTROL.test(normalized)) return null;
  if (PERSONAL_OR_IDENTIFIED.test(normalized)) return null;
  if (INSTRUCTION_LIKE_LABEL.test(normalized) || normalized.split(/\s+/u).length > 10) return null;
  // All-uppercase multiword phrases are not gene symbols or ontology ids.
  // Reject rather than treating arbitrary headings (BUSINESS STRATEGY, etc.)
  // as candidate-gene research terms.
  if (/\s/u.test(normalized) && /\p{Lu}/u.test(normalized) && normalized === normalized.toUpperCase()) {
    return null;
  }
  return normalized;
}

function normalizeGeneSymbol(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toUpperCase();
  return GENE_SYMBOL.test(normalized) ? normalized : null;
}

function normalizeResearchTerm(value, allowedKinds = RESEARCH_TERM_KINDS) {
  if (!hasOnlyKeys(value, new Set(['kind', 'term']))) return null;
  if (!allowedKinds.has(value.kind)) return null;
  if (value.kind === 'hpo') {
    const term = typeof value.term === 'string' ? value.term.trim().toUpperCase() : '';
    return HPO_ID.test(term) ? { kind: value.kind, term } : null;
  }
  if (value.kind === 'gene') {
    const term = normalizeGeneSymbol(value.term);
    return term ? { kind: value.kind, term } : null;
  }
  const term = normalizeSubjectLabel(value.term);
  return term ? { kind: value.kind, term } : null;
}

function normalizeStringArray(value, normalizer, maxItems) {
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized = value.map(normalizer);
  if (normalized.some((item) => item == null)) return null;
  return [...new Set(normalized)];
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
    return invalid('The optional focus must be a bounded disease, phenotype, HPO id, or gene symbol.');
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
    query = normalizeResearchTerm(input.query, CANDIDATE_QUERY_KINDS);
    if (!query) return invalid('A bounded candidate-gene query term is required.');
  } else if (input.query != null) {
    return invalid('query is not accepted for this candidate-gene operation.');
  }

  let gene;
  if (geneOperation) {
    if (!hasOnlyKeys(input.gene, new Set(['symbol', 'ensemblId', 'entrezId']))) {
      return invalid('A verified gene identifier object is required.');
    }
    const symbol = normalizeGeneSymbol(input.gene.symbol);
    const ensemblId = typeof input.gene.ensemblId === 'string'
      ? input.gene.ensemblId.trim().toUpperCase()
      : '';
    const entrezId = input.gene.entrezId == null ? '' : String(input.gene.entrezId).trim();
    if (
      !symbol
      || (ensemblId && !ENSEMBL_GENE_ID.test(ensemblId))
      || (entrezId && !ENTREZ_GENE_ID.test(entrezId))
      || (!ensemblId && !entrezId)
    ) return invalid('A valid symbol plus verified Ensembl or NCBI Gene identifier is required.');
    gene = { symbol, ...(ensemblId ? { ensemblId } : {}), ...(entrezId ? { entrezId } : {}) };
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
  if (!hasOnlyKeys(input, new Set(['version', 'educationLevel', 'recentGenes', 'recentTopics']))) {
    return invalid('Learning-activity input contains unsupported fields.');
  }
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION) return invalid('Unsupported learning input version.');
  const educationLevel = EDUCATION_LEVELS.has(input.educationLevel)
    ? input.educationLevel
    : 'undergraduate';
  const recentGenes = normalizeStringArray(input.recentGenes, normalizeGeneSymbol, 5);
  const recentTopics = normalizeStringArray(
    input.recentTopics,
    (value) => normalizeSubjectLabel(value),
    3
  );
  if (!recentGenes || !recentTopics) return invalid('Learning activity must use bounded gene/topic labels.');
  if (recentGenes.length === 0 && recentTopics.length === 0) {
    return invalid('At least one bounded learning-activity item is required.');
  }
  return ok({ version: PUBLICATION_TASK_INPUT_VERSION, educationLevel, recentGenes, recentTopics });
}

function validateTutorInput(input) {
  if (!hasOnlyKeys(input, new Set(['version', 'topic', 'level', 'interaction']))) {
    return invalid('Tutor input contains unsupported fields.');
  }
  if (input.version !== PUBLICATION_TASK_INPUT_VERSION) return invalid('Unsupported tutor input version.');
  const topic = typeof input.topic === 'string' ? input.topic.trim() : '';
  if (!KNOWN_TOPIC_VALUES.has(topic.toLowerCase())) return invalid('Tutor chat requires a catalog topic.');
  if (!EDUCATION_LEVELS.has(input.level)) return invalid('Tutor chat requires a recognized education level.');
  if (!TUTOR_INTERACTIONS.has(input.interaction)) return invalid('Tutor chat requires a guided interaction.');
  return ok({ version: PUBLICATION_TASK_INPUT_VERSION, topic, level: input.level, interaction: input.interaction });
}

export function hasRawGenerationInput(body) {
  if (!isPlainObject(body)) return false;
  return RAW_GENERATION_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(body, field));
}

export function validatePublicationTaskInput(task, input, { routePath = '/llm/invoke' } = {}) {
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

function composeResearchPrompt(task, input) {
  const mode = task === TASKS.RESEARCH_HYPOTHESIS
    ? 'Generate testable exploratory hypotheses and a research design.'
    : 'Provide a bounded exploratory cohort-research response.';
  const focus = input.focus
    ? `Research focus (${input.focus.kind}): ${JSON.stringify(input.focus.term)}.`
    : 'No disease, phenotype, HPO, or gene focus was supplied.';
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
  const query = input.query ? `${input.query.kind}: ${JSON.stringify(input.query.term)}` : '';
  const gene = input.gene
    ? `${input.gene.symbol} (${input.gene.ensemblId || `NCBI Gene ${input.gene.entrezId}`})`
    : '';
  const base = [
    'You are a genomics education and exploratory candidate-gene assistant.',
    'Treat all model output as leads for source verification, never as clinical evidence.',
    'Do not claim that OMIM, ClinVar, HPO, UniProt, GTEx, HPA, GWAS Catalog, DisGeNET, or PubMed was queried.',
    'Do not invent citations, record identifiers, evidence grades, prevalence, penetrance, numeric expression values, diagnosis, prognosis, treatment, screening, PGx, or dosing guidance.',
  ];
  const jsonGeneShape = 'symbol, name, score, explanation';
  switch (input.operation) {
    case 'classify_and_suggest':
      return [...base,
        `Classify the bounded research term (${query}) as disease, phenotype, or HPO identifier and generate candidate-gene leads.`,
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
    `Recently viewed gene symbols: ${JSON.stringify(input.recentGenes)}.`,
    `Recent research-topic labels: ${JSON.stringify(input.recentTopics)}.`,
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
    `Catalog genetics topic: ${JSON.stringify(input.topic)}.`,
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
  normalizeSubjectLabel,
  normalizeResearchTerm,
  validateResearchInput,
  validateCandidateInput,
  validateLearningActivityInput,
  validateTutorInput,
};
