import {
  TOPICS_CATALOG,
} from '../config/educationCatalog.js';

// This revision identifies the reviewed lesson and quiz text independently of
// the topic-catalog schema. Bump it whenever any curriculum wording or level
// adaptation changes.
export const CURATED_EDUCATION_VERSION = 3;

// Reviewed, non-clinical continuity lessons. These are intentionally bounded
// facts, not generated prose. The route publishes them only when its configured
// model provider cannot return reusable content and still attaches the
// authoritative NIH/NLM/NHGRI references selected by educationSources.js.
const LESSONS = Object.freeze({
  'what-is-dna': {
    bigPicture: 'DNA, or deoxyribonucleic acid, is the long-lived molecule cells use to store hereditary information.',
    mechanism: 'Its order of four nucleotide bases—adenine, thymine, cytosine, and guanine—forms a sequence that cells can copy and read.',
    significance: 'DNA connects inheritance with cell function because genes and many regulatory elements are encoded within those sequences.',
  },
  'dna-structure': {
    bigPicture: 'DNA usually forms a double helix made from two nucleotide strands that run in opposite directions.',
    mechanism: 'Adenine pairs with thymine and cytosine pairs with guanine, while sugar-phosphate backbones form the outside of the helix.',
    significance: 'Complementary base pairing helps DNA remain stable and gives cells a direct template for copying genetic information.',
  },
  'dna-replication': {
    bigPicture: 'DNA replication is the process cells use to copy their genomes before cell division.',
    mechanism: 'The two strands separate, DNA polymerases build complementary strands, and proofreading and repair systems reduce copying errors.',
    significance: 'Accurate replication lets daughter cells inherit genomes while occasional sequence changes still provide a source of variation.',
  },
  'genes-and-chromosomes': {
    bigPicture: 'A gene is a functional DNA region, while a chromosome is a much larger DNA molecule packaged with proteins.',
    mechanism: 'Chromosomes organize many genes and regulatory regions into physical structures that can be copied and distributed during cell division.',
    significance: 'This organization links a particular DNA sequence to its genomic location and patterns of inheritance.',
  },
  transcription: {
    bigPicture: 'Transcription copies information from a DNA template into an RNA molecule.',
    mechanism: 'RNA polymerase binds regulatory DNA, reads one template strand, and joins RNA nucleotides in a complementary sequence.',
    significance: 'Transcription is a major control point between stored genetic information and the RNA products a cell uses.',
  },
  translation: {
    bigPicture: 'Translation is the process by which ribosomes use messenger RNA information to assemble a polypeptide.',
    mechanism: 'The ribosome reads three-base codons, and transfer RNAs bring corresponding amino acids that are linked in sequence.',
    significance: 'Translation connects the nucleotide code in messenger RNA with the amino-acid sequence of a protein.',
  },
  'gene-expression': {
    bigPicture: 'Gene expression includes the steps that turn information in a gene into a functional RNA or protein product.',
    mechanism: 'Cells coordinate transcription, RNA processing, translation, and molecule turnover, with different steps used for different genes.',
    significance: 'Differences in expression help cells with the same genome develop distinct structures and perform distinct jobs.',
  },
  'gene-regulation': {
    bigPicture: 'Gene regulation controls when, where, and how strongly a gene is expressed.',
    mechanism: 'Regulatory DNA, transcription factors, chromatin state, RNA processing, and feedback networks can each alter expression.',
    significance: 'Coordinated regulation lets cells respond to signals while maintaining stable cell identities without changing their DNA sequence.',
  },
  'mendelian-genetics': {
    bigPicture: 'Mendelian genetics describes inheritance patterns that can arise when discrete alleles strongly influence a trait.',
    mechanism: 'Alleles segregate during gamete formation, and alleles at different loci may assort independently when their genomic behavior permits it.',
    significance: 'The framework is useful for tracing many single-gene traits, while not every biological trait follows a simple dominant-recessive pattern.',
  },
  'punnett-squares': {
    bigPicture: 'A Punnett square is a probability model for combining specified parental alleles.',
    mechanism: 'Possible gametes are placed along the grid edges, and each cell shows one possible offspring genotype under the model assumptions.',
    significance: 'It clarifies expected genotype proportions but does not guarantee outcomes in a small number of offspring.',
  },
  'sex-linked-traits': {
    bigPicture: 'Sex-linked traits are influenced by genes located on sex chromosomes.',
    mechanism: 'Different numbers and inheritance paths of X- and Y-linked copies can produce pedigree patterns unlike those of autosomal loci.',
    significance: 'Chromosome location is therefore essential when reasoning about how an allele may pass through a family.',
  },
  'complex-inheritance': {
    bigPicture: 'Complex traits reflect contributions from multiple genetic variants, environmental factors, and interactions among them.',
    mechanism: 'Many small effects can combine across pathways, and the same genotype may have different outcomes in different contexts.',
    significance: 'Complex inheritance explains why many traits do not separate into simple Mendelian categories or deterministic predictions.',
  },
  'what-are-mutations': {
    bigPicture: 'A mutation is a change in a DNA sequence relative to a reference or earlier sequence.',
    mechanism: 'Changes can arise through replication errors, DNA damage, mobile elements, or imperfect repair and may occur in germline or somatic cells.',
    significance: 'Mutations can be neutral, harmful, or beneficial depending on their location, biological context, and effect on function.',
  },
  'types-of-mutations': {
    bigPicture: 'Mutations range from single-base substitutions to insertions, deletions, duplications, inversions, and larger chromosome changes.',
    mechanism: 'A change can alter a coding frame, a protein sequence, gene dosage, or regulation, or it may leave measurable function unchanged.',
    significance: 'Naming the molecular change helps researchers test its consequences instead of assuming that every variant has the same effect.',
  },
  'genetic-variation': {
    bigPicture: 'Genetic variation is the collection of DNA sequence differences observed among individuals and populations.',
    mechanism: 'Mutation creates new variants, while recombination, inheritance, migration, drift, and selection shape their combinations and frequencies.',
    significance: 'Variation supports biodiversity and research on traits, ancestry, evolution, and differences in biological responses.',
  },
  'snps-and-polymorphisms': {
    bigPicture: 'A single-nucleotide polymorphism, or SNP, is a common difference at one DNA position in a population.',
    mechanism: 'SNPs can occur in coding or noncoding regions and may be directly functional, linked to another variant, or have no detected effect.',
    significance: 'Their abundance makes SNPs useful as markers, but association alone does not establish biological causation.',
  },
  'human-genome-project': {
    bigPicture: 'The Human Genome Project was an international effort that produced a reference human genome sequence and foundational genomic resources.',
    mechanism: 'Researchers mapped and sequenced DNA, assembled overlapping fragments, and released data and tools for broad scientific use.',
    significance: 'Its reference resources accelerated gene discovery, comparative genomics, sequencing technology, and open genomic data practices.',
  },
  'dna-sequencing': {
    bigPicture: 'DNA sequencing determines the order of nucleotide bases in a DNA sample.',
    mechanism: 'Platforms convert molecular signals into reads, after which software performs quality control, alignment or assembly, and variant calling.',
    significance: 'A sequence result depends on both laboratory and computational steps, so coverage, error models, and reference choice matter.',
  },
  crispr: {
    bigPicture: 'CRISPR systems are RNA-guided molecular tools adapted from microbial defense mechanisms for targeted genome editing and regulation.',
    mechanism: 'A guide RNA directs a CRISPR-associated protein to a matching sequence, where the protein can cut DNA or carry another molecular activity.',
    significance: 'CRISPR supports controlled research on gene function, but specificity, delivery, cellular context, and unintended changes require measurement.',
  },
  'genetic-testing': {
    bigPicture: 'Genetic testing examines chromosomes, genes, or variants for a defined laboratory and interpretive purpose.',
    mechanism: 'Methods differ in what they can detect, and results are compared with references and classified using evidence that can change over time.',
    significance: 'Scope, analytical limits, uncertainty, consent, and qualified interpretation are essential parts of understanding a test result.',
  },
  'genetic-diseases': {
    bigPicture: 'A genetic condition involves one or more genomic changes that contribute to a disease process or trait.',
    mechanism: 'Effects can involve altered protein function, gene dosage, regulation, chromosomes, mitochondrial DNA, or combinations of variants and environment.',
    significance: 'Genetic contribution does not always mean simple inheritance, certainty, or the same outcome for every person with a variant.',
  },
  'cancer-genetics': {
    bigPicture: 'Cancer genetics studies genomic changes that allow cell populations to grow and evolve abnormally.',
    mechanism: 'Somatic variants accumulate within cells, while inherited variants can sometimes change baseline susceptibility without determining an outcome.',
    significance: 'Separating tumor changes from inherited changes is important for accurate research interpretation and communication.',
  },
  pharmacogenomics: {
    bigPicture: 'Pharmacogenomics studies how genomic variation relates to differences in drug processing and response across people or populations.',
    mechanism: 'Variants may influence enzymes, transporters, receptors, or immune recognition, alongside many non-genetic factors.',
    significance: 'Research associations require validated evidence and clinical context; an educational genomic result is not a personalized instruction for a specific person.',
  },
  'gene-therapy': {
    bigPicture: 'Gene therapy aims to alter genetic material or gene activity in cells for a defined therapeutic purpose.',
    mechanism: 'Strategies can add a functional sequence, edit a target, or change expression, using delivery systems suited to particular cells.',
    significance: 'Durability, delivery, immune response, off-target effects, manufacturing, and long-term follow-up are central areas of evaluation.',
  },
  'natural-selection': {
    bigPicture: 'Natural selection is a change in populations that occurs when heritable differences affect reproductive success in a particular environment.',
    mechanism: 'Variants associated with greater reproductive contribution can become more common across generations, while conditions and tradeoffs can change.',
    significance: 'Selection acts on existing variation and populations over time; it does not give organisms traits because they need them.',
  },
  'population-genetics': {
    bigPicture: 'Population genetics studies allele and genotype frequencies and how they change through time.',
    mechanism: 'Mutation, recombination, selection, genetic drift, migration, mating patterns, and population structure all influence those frequencies.',
    significance: 'The field provides quantitative models for evolution, ancestry, diversity, and the interpretation of association studies.',
  },
  'molecular-evolution': {
    bigPicture: 'Molecular evolution examines how DNA, RNA, and protein sequences change across generations and lineages.',
    mechanism: 'Researchers compare sequences and model mutation, selection, drift, duplication, recombination, and constraint.',
    significance: 'Sequence change can reveal shared ancestry and functional constraint, but conclusions depend on models, sampling, and alignment quality.',
  },
  phylogenetics: {
    bigPicture: 'Phylogenetics reconstructs hypotheses about evolutionary relationships among sampled organisms, genes, or sequences.',
    mechanism: 'Methods compare characters or sequences to estimate branching trees or networks and quantify support under explicit models.',
    significance: 'A phylogeny is an evidence-based hypothesis with uncertainty, not a ladder of progress or a complete record of every ancestor.',
  },
  epigenetics: {
    bigPicture: 'Epigenetics studies persistent changes in gene activity or chromatin state that do not require a change in DNA sequence.',
    mechanism: 'DNA methylation, histone modifications, chromatin organization, and regulatory RNAs can influence access to genes.',
    significance: 'Epigenetic states help coordinate development and cell identity and can be dynamic, context-dependent, and sometimes heritable through cell division.',
  },
  'rna-world': {
    bigPicture: 'The RNA world hypothesis proposes that early life may have relied heavily on RNA for both information storage and chemical activity.',
    mechanism: 'RNA can base-pair like an information molecule and some RNAs can catalyze reactions, offering a possible bridge to later DNA-protein systems.',
    significance: 'The hypothesis guides testable origin-of-life research, but the historical pathway and prebiotic steps remain active questions.',
  },
  'systems-biology': {
    bigPicture: 'Systems biology studies how interacting components produce the behavior of a biological system.',
    mechanism: 'Researchers combine quantitative experiments with network and dynamic models across genes, proteins, metabolites, cells, and environments.',
    significance: 'The approach helps identify feedback, redundancy, and emergent behavior that may be missed by studying one component alone.',
  },
  'synthetic-biology': {
    bigPicture: 'Synthetic biology applies engineering principles to design, build, and evaluate biological components and systems.',
    mechanism: 'Workflows specify a function, assemble genetic or cellular parts, measure behavior, and iterate using standardized evidence where possible.',
    significance: 'Reliable design requires attention to biological context, evolution, containment, ethics, and the difference between a model and observed behavior.',
  },
});

const PLAIN_LANGUAGE_TERMS = Object.freeze([
  [/\bdeoxyribonucleic acid\b/giu, 'DNA'],
  [/\bnucleotide bases\b/giu, 'chemical letters'],
  [/\bnucleotides\b/giu, 'chemical letters'],
  [/\bnucleotide\b/giu, 'chemical letter'],
  [/\bgenomes\b/giu, 'complete sets of DNA'],
  [/\bgenome\b/giu, 'complete set of DNA'],
  [/\bDNA polymerases\b/gu, 'copying proteins called DNA polymerases'],
  [/\bcomplementary strands\b/giu, 'matching DNA strands'],
  [/\bpolypeptide\b/giu, 'protein chain'],
  [/\bchromatin\b/giu, 'DNA packaging'],
  [/\bgenotypes\b/giu, 'sets of gene versions'],
  [/\bgenotype\b/giu, 'set of gene versions'],
  [/\balleles\b/giu, 'versions of a gene'],
  [/\ballele\b/giu, 'version of a gene'],
]);

function plainLanguage(value) {
  return PLAIN_LANGUAGE_TERMS.reduce(
    (adapted, [pattern, replacement]) => adapted.replace(pattern, replacement),
    value,
  );
}

const LEVEL_FRAMES = Object.freeze({
  elementary: Object.freeze({
    bigPicture: (value) => `One clear idea: ${plainLanguage(value)}`,
    mechanism: (value) => `What happens: ${plainLanguage(value)}`,
    significance: (value) => `Why scientists care: ${plainLanguage(value)}`,
    focus: 'Look for one thing that changes and one result that follows. New science words are introduced beside plain-language meanings.',
    prompts: Object.freeze({
      bigPicture: 'Which simple idea best matches',
      mechanism: 'Which description best shows what happens in',
      significance: 'Which sentence best explains why scientists study',
    }),
  }),
  middle_school: Object.freeze({
    bigPicture: (value) => `Core concept: ${value}`,
    mechanism: (value) => `Connected steps: ${value}`,
    significance: (value) => `Connection to biology: ${value}`,
    focus: 'Connect each scientific term to the part, process, or pattern it names, then separate the mechanism from its result.',
    prompts: Object.freeze({
      bigPicture: 'Which core concept belongs with',
      mechanism: 'Which sequence of connected steps describes',
      significance: 'Which biological connection matters for',
    }),
  }),
  high_school: Object.freeze({
    bigPicture: (value) => `Biology account: ${value}`,
    mechanism: (value) => `Mechanism-to-outcome link: ${value}`,
    significance: (value) => `Interpretation boundary: ${value}`,
    focus: 'Relate molecular events to observable outcomes while distinguishing a supported mechanism from a broader inference.',
    prompts: Object.freeze({
      bigPicture: 'Which biological account accurately describes',
      mechanism: 'Which mechanism-to-outcome link fits',
      significance: 'Which interpretation remains appropriately bounded for',
    }),
  }),
  undergraduate: Object.freeze({
    bigPicture: (value) => `Molecular scope: ${value}`,
    mechanism: (value) => `Causal sequence: ${value}`,
    significance: (value) => `Experimental relevance: ${value}`,
    focus: 'Trace the molecular entities and causal sequence, then identify which observations would support the account and which conclusions remain outside it.',
    prompts: Object.freeze({
      bigPicture: 'Which molecular framing is accurate for',
      mechanism: 'Which causal sequence is associated with',
      significance: 'Which statement captures the experimental relevance of',
    }),
  }),
  graduate: Object.freeze({
    bigPicture: (value) => `Research framing: ${value}`,
    mechanism: (value) => `Interacting mechanisms: ${value}`,
    significance: (value) => `Measurement and uncertainty: ${value}`,
    focus: 'Compare plausible mechanisms, measurement choices, uncertainty sources, and alternative explanations; a causal account requires evidence that distinguishes those alternatives.',
    prompts: Object.freeze({
      bigPicture: 'Which research framing best scopes',
      mechanism: 'Which account preserves the interacting mechanisms in',
      significance: 'Which measurement-aware interpretation fits',
    }),
  }),
  postgraduate: Object.freeze({
    bigPicture: (value) => `Model scope: ${value}`,
    mechanism: (value) => `Mechanistic assumptions: ${value}`,
    significance: (value) => `Open evidentiary boundary: ${value}`,
    focus: 'Interrogate causal identifiability, model assumptions, competing explanations, and the evidence needed to resolve an open research question.',
    prompts: Object.freeze({
      bigPicture: 'Which model-scoped statement best characterizes',
      mechanism: 'Which statement makes the mechanistic assumptions explicit for',
      significance: 'Which evidentiary boundary remains defensible for',
    }),
  }),
});

// Each level contributes section-specific reasoning, not just a heading or a
// vocabulary label around the same sentence. The base lesson remains the
// reviewed scientific anchor; these deterministic expansions change what the
// learner is asked to represent, compare, and infer at every level. Keeping
// the transformations centralized also makes all 32 topics auditable as one
// versioned curriculum instead of maintaining 192 drifting copies.
const LEVEL_SECTION_DEPTH = Object.freeze({
  elementary: Object.freeze({
    bigPicture: (value) => `${plainLanguage(value)} Name the main part and tell, in your own words, what it does.`,
    mechanism: (value) => `${plainLanguage(value)} Follow the change from its first step to the result.`,
    significance: (value) => `${plainLanguage(value)} Connect the idea to one thing scientists can observe.`,
  }),
  middle_school: Object.freeze({
    bigPicture: (value) => `${value} Sort the terms in this account into structures, processes, and observed patterns.`,
    mechanism: (value) => `${value} Trace which part acts first, what it changes, and which outcome follows.`,
    significance: (value) => `${value} Link the mechanism to a biological pattern while keeping cause separate from correlation.`,
  }),
  high_school: Object.freeze({
    bigPicture: (value) => `${value} Define each molecular component in this account and state the biological scale at which it operates.`,
    mechanism: (value) => `${value} Distinguish the molecular event, its predicted downstream effect, and the evidence that could support the link.`,
    significance: (value) => `${value} Explain which observations this account supports and which broader conclusions remain outside its scope.`,
  }),
  undergraduate: Object.freeze({
    bigPicture: (value) => `${value} Frame this account in terms of molecular entities, cellular context, and boundary conditions.`,
    mechanism: (value) => `${value} Represent the causal sequence as perturbation, comparison, and downstream readout, with each step mapped to a predicted change.`,
    significance: (value) => `${value} Connect the mechanism to experimental design by defining controls, measurements, and the conclusion each observation can support.`,
  }),
  graduate: Object.freeze({
    bigPicture: (value) => `${value} Compare this account with plausible alternatives and state which assumptions make the competing accounts distinguishable.`,
    mechanism: (value) => `${value} Derive contrasting predictions for the mechanisms, specify orthogonal measurements, and identify confounders and uncertainty sources.`,
    significance: (value) => `${value} Interpret the evidence within its sampling and measurement limits, and identify the result that would favor one causal account over another.`,
  }),
  postgraduate: Object.freeze({
    bigPicture: (value) => `${value} Formalize the account as competing models with explicit scope, identifiability conditions, and assumptions that could fail.`,
    mechanism: (value) => `${value} Map latent variables, feedback, measurement error, and alternative causal structures to discriminating observations.`,
    significance: (value) => `${value} State the unresolved question, the decisive evidence needed to separate models, and the boundary beyond which no inference is justified.`,
  }),
});

const TOPIC_IDS = TOPICS_CATALOG.flatMap((category) => category.topics.map((topic) => topic.id));
if (TOPIC_IDS.length !== Object.keys(LESSONS).length
  || TOPIC_IDS.some((id) => !Object.hasOwn(LESSONS, id))) {
  throw new Error('Curated education continuity lessons must cover the complete topic catalog.');
}

function assertTopic(topic) {
  if (!topic || !Object.hasOwn(LESSONS, topic.id)) {
    throw new Error('A canonical education topic is required for curated continuity content.');
  }
  return LESSONS[topic.id];
}

function lessonForOffset(topicId, offset) {
  const start = TOPIC_IDS.indexOf(topicId);
  const candidate = TOPIC_IDS[(start + offset) % TOPIC_IDS.length];
  return LESSONS[candidate];
}

function adaptLesson(lesson, level) {
  const frame = LEVEL_FRAMES[level];
  const depth = LEVEL_SECTION_DEPTH[level];
  if (!frame || !depth) throw new Error('A supported education level is required.');
  return {
    bigPicture: frame.bigPicture(depth.bigPicture(lesson.bigPicture)),
    mechanism: frame.mechanism(depth.mechanism(lesson.mechanism)),
    significance: frame.significance(depth.significance(lesson.significance)),
  };
}

function rotateOptions(options, seed) {
  const shift = seed % options.length;
  return [...options.slice(shift), ...options.slice(0, shift)];
}

function question(topic, level, field, seed) {
  const frame = LEVEL_FRAMES[level];
  const correct = adaptLesson(LESSONS[topic.id], level)[field];
  const options = rotateOptions([
    correct,
    adaptLesson(lessonForOffset(topic.id, 5), level)[field],
    adaptLesson(lessonForOffset(topic.id, 11), level)[field],
    adaptLesson(lessonForOffset(topic.id, 19), level)[field],
  ], seed);
  return {
    question: `${frame.prompts[field]} ${topic.title}`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: correct,
  };
}

export function curatedEducationExplanation(topic, level) {
  const lesson = adaptLesson(assertTopic(topic), level);
  const frame = LEVEL_FRAMES[level];
  return [
    `# ${topic.title}`,
    '',
    '## The Big Picture',
    lesson.bigPicture,
    '',
    '## How It Works',
    lesson.mechanism,
    '',
    '## Why It Matters',
    lesson.significance,
    '',
    '## Level Focus',
    frame.focus,
    '',
    '## Key Takeaways',
    `- ${lesson.bigPicture}`,
    `- ${lesson.mechanism}`,
    `- ${lesson.significance}`,
  ].join('\n');
}

export function curatedEducationQuiz(topic, level, requestedItems = 5) {
  assertTopic(topic);
  if (!LEVEL_FRAMES[level]) throw new Error('A supported education level is required.');
  const seed = topic.id.length + level.length;
  const questions = [
    question(topic, level, 'bigPicture', seed),
    question(topic, level, 'mechanism', seed + 1),
    question(topic, level, 'significance', seed + 2),
  ];
  return questions.slice(0, Math.max(1, Math.min(requestedItems, questions.length)));
}

export const __test = {
  LESSONS,
  LEVEL_FRAMES,
  LEVEL_SECTION_DEPTH,
  TOPIC_IDS,
};
