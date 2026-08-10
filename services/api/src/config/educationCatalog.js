/** Curated public genetics-learning topics shared by routing and policy tests. */
export const EDUCATION_CATALOG_VERSION = 1;

export const TOPICS_CATALOG = Object.freeze([
  {
    category: 'DNA Basics',
    topics: [
      { id: 'what-is-dna', title: 'What is DNA?', description: 'The molecule of life' },
      { id: 'dna-structure', title: 'DNA Structure', description: 'The double helix and base pairing' },
      { id: 'dna-replication', title: 'DNA Replication', description: 'How DNA copies itself' },
      { id: 'genes-and-chromosomes', title: 'Genes & Chromosomes', description: 'How DNA is organized' },
    ],
  },
  {
    category: 'How Genes Work',
    topics: [
      { id: 'transcription', title: 'Transcription', description: 'From DNA to RNA' },
      { id: 'translation', title: 'Translation', description: 'From RNA to Protein' },
      { id: 'gene-expression', title: 'Gene Expression', description: 'When and how genes are turned on' },
      { id: 'gene-regulation', title: 'Gene Regulation', description: 'Controlling gene activity' },
    ],
  },
  {
    category: 'Inheritance',
    topics: [
      { id: 'mendelian-genetics', title: 'Mendelian Genetics', description: 'Dominant and recessive traits' },
      { id: 'punnett-squares', title: 'Punnett Squares', description: 'Predicting offspring traits' },
      { id: 'sex-linked-traits', title: 'Sex-Linked Traits', description: 'Genes on the X and Y chromosomes' },
      { id: 'complex-inheritance', title: 'Complex Inheritance', description: 'Beyond simple dominance' },
    ],
  },
  {
    category: 'Mutations & Variation',
    topics: [
      { id: 'what-are-mutations', title: 'What Are Mutations?', description: 'Changes in the DNA sequence' },
      { id: 'types-of-mutations', title: 'Types of Mutations', description: 'Point mutations, insertions, deletions' },
      { id: 'genetic-variation', title: 'Genetic Variation', description: 'Why we are all different' },
      { id: 'snps-and-polymorphisms', title: 'SNPs & Polymorphisms', description: 'Common genetic differences' },
    ],
  },
  {
    category: 'Genomics & Technology',
    topics: [
      { id: 'human-genome-project', title: 'The Human Genome Project', description: 'Mapping all human genes' },
      { id: 'dna-sequencing', title: 'DNA Sequencing', description: 'Reading the genetic code' },
      { id: 'crispr', title: 'CRISPR Gene Editing', description: 'Editing genes with molecular scissors' },
      { id: 'genetic-testing', title: 'Genetic Testing', description: 'What your DNA can tell you' },
    ],
  },
  {
    category: 'Genetics & Health',
    topics: [
      { id: 'genetic-diseases', title: 'Genetic Diseases', description: 'When genes cause illness' },
      { id: 'cancer-genetics', title: 'Cancer Genetics', description: 'How genes relate to cancer' },
      { id: 'pharmacogenomics', title: 'Pharmacogenomics', description: 'How genes affect drug response' },
      { id: 'gene-therapy', title: 'Gene Therapy', description: 'Treating disease by fixing genes' },
    ],
  },
  {
    category: 'Evolution & Population Genetics',
    topics: [
      { id: 'natural-selection', title: 'Natural Selection', description: 'Survival of the fittest' },
      { id: 'population-genetics', title: 'Population Genetics', description: 'Genes in groups' },
      { id: 'molecular-evolution', title: 'Molecular Evolution', description: 'How DNA changes over time' },
      { id: 'phylogenetics', title: 'Phylogenetics', description: 'The tree of life' },
    ],
  },
  {
    category: 'Advanced Topics',
    topics: [
      { id: 'epigenetics', title: 'Epigenetics', description: 'Changes beyond the DNA sequence' },
      { id: 'rna-world', title: 'The RNA World', description: 'Non-coding RNA and regulation' },
      { id: 'systems-biology', title: 'Systems Biology', description: 'Networks and pathways' },
      { id: 'synthetic-biology', title: 'Synthetic Biology', description: 'Engineering life' },
    ],
  },
]);

const TOPIC_BY_ID = new Map();
for (const { category, topics } of TOPICS_CATALOG) {
  for (const topic of topics) {
    TOPIC_BY_ID.set(topic.id, Object.freeze({
      ...topic,
      category,
      catalogVersion: EDUCATION_CATALOG_VERSION,
    }));
  }
}

/**
 * Resolve only a canonical catalog identifier. Titles, labels, aliases, and
 * arbitrary free text are deliberately not executable provider input.
 */
export function resolveEducationTopic(value) {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id) || id !== value) return null;
  const topic = TOPIC_BY_ID.get(id);
  if (!topic || topic.deprecated === true) return null;
  return topic;
}
