import {
  EDUCATION_CATALOG_VERSION,
  TOPICS_CATALOG,
} from '../config/educationCatalog.js';

export const CURATED_EDUCATION_VERSION = EDUCATION_CATALOG_VERSION;

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

const LEVEL_FRAMES = Object.freeze({
  elementary: 'This version uses short sentences and focuses on one idea at a time.',
  middle_school: 'This version introduces the main scientific words and explains how the pieces connect.',
  high_school: 'This version uses standard biology terms and distinguishes mechanisms from outcomes.',
  undergraduate: 'This version emphasizes molecular mechanisms, evidence, and limits on inference.',
  graduate: 'This version emphasizes interacting mechanisms, measurement choices, and uncertainty.',
  postgraduate: 'This version emphasizes model assumptions, evidentiary limits, and unresolved research questions.',
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

function rotateOptions(options, seed) {
  const shift = seed % options.length;
  return [...options.slice(shift), ...options.slice(0, shift)];
}

function question(topic, prompt, field, seed) {
  const correct = LESSONS[topic.id][field];
  const options = rotateOptions([
    correct,
    lessonForOffset(topic.id, 5)[field],
    lessonForOffset(topic.id, 11)[field],
    lessonForOffset(topic.id, 19)[field],
  ], seed);
  return {
    question: `${prompt} ${topic.title}`,
    options,
    correctIndex: options.indexOf(correct),
    explanation: correct,
  };
}

export function curatedEducationExplanation(topic, level) {
  const lesson = assertTopic(topic);
  const frame = LEVEL_FRAMES[level];
  if (!frame) throw new Error('A supported education level is required.');
  return [
    `# ${topic.title}`,
    '',
    '## The Big Picture',
    `${lesson.bigPicture} ${frame}`,
    '',
    '## How It Works',
    lesson.mechanism,
    '',
    '## Why It Matters',
    lesson.significance,
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
    question(topic, 'Which description best matches', 'bigPicture', seed),
    question(topic, 'Which mechanism is most closely associated with', 'mechanism', seed + 1),
    question(topic, 'Why does this topic matter when studying', 'significance', seed + 2),
  ];
  return questions.slice(0, Math.max(1, Math.min(requestedItems, questions.length)));
}

export const __test = { LESSONS, LEVEL_FRAMES, TOPIC_IDS };
