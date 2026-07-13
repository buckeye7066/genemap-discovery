// ─── Curated, verified authoritative references for education topics ─────────
//
// The "source-grounded" pillar for AI narrative output. Instead of asking the
// LLM to cite its sources — which invites fabricated URLs the scientific-honesty
// directive explicitly forbids — the server attaches a curated list of real,
// authoritative references to each explanation. Every URL here was checked to
// return HTTP 200 (see the commit that added this file); they point only to
// public institutions (NIH/NLM MedlinePlus, NHGRI genome.gov, NCBI, Ensembl,
// the Human Phenotype Ontology).
//
// These are framed to the learner as "authoritative references to learn more
// and verify" — NOT as citations that generated the AI text — which keeps the
// claim honest (the prose was not literally derived from these pages).

const src = (label, url, publisher) => ({ label, url, publisher });

// Always included (deduped) so every explanation carries at least these.
export const GENERAL_SOURCES = [
  src('MedlinePlus Genetics', 'https://medlineplus.gov/genetics/', 'U.S. National Library of Medicine (NIH)'),
  src('Talking Glossary of Genomic Terms', 'https://www.genome.gov/genetics-glossary', 'National Human Genome Research Institute'),
];

// Keyed by the category names in education.js TOPICS_CATALOG.
export const CATEGORY_SOURCES = {
  'DNA Basics': [
    src('Cells & DNA — the basics', 'https://medlineplus.gov/genetics/understanding/basics/', 'MedlinePlus Genetics (NIH)'),
  ],
  'How Genes Work': [
    src('How genes work', 'https://medlineplus.gov/genetics/understanding/howgeneswork/', 'MedlinePlus Genetics (NIH)'),
  ],
  'Inheritance': [
    src('How genetic conditions are inherited', 'https://medlineplus.gov/genetics/understanding/inheritance/', 'MedlinePlus Genetics (NIH)'),
  ],
  'Mutations & Variation': [
    src('Genetic mutations & health', 'https://medlineplus.gov/genetics/understanding/mutationsanddisorders/', 'MedlinePlus Genetics (NIH)'),
  ],
  'Genomics & Technology': [
    src('About genomics', 'https://www.genome.gov/about-genomics', 'National Human Genome Research Institute'),
    src('The Human Genome Project', 'https://www.genome.gov/human-genome-project', 'National Human Genome Research Institute'),
  ],
  'Genetics & Health': [
    src('Precision medicine', 'https://medlineplus.gov/genetics/understanding/precisionmedicine/', 'MedlinePlus Genetics (NIH)'),
    src('ClinVar (clinical variants)', 'https://www.ncbi.nlm.nih.gov/clinvar/', 'NCBI'),
  ],
  'Evolution & Population Genetics': [
    src('Genomics fact sheets', 'https://www.genome.gov/about-genomics/fact-sheets', 'National Human Genome Research Institute'),
  ],
  'Advanced Topics': [
    src('Understanding genetics (handbook)', 'https://medlineplus.gov/genetics/understanding/', 'MedlinePlus Genetics (NIH)'),
  ],
};

// Topic-specific NHGRI glossary term pages (verified 200). Keyed by the topic
// id in TOPICS_CATALOG. Only terms with a real glossary page are listed; the
// rest fall back to their category + general sources.
export const TOPIC_GLOSSARY = {
  'what-is-dna': src('DNA — glossary entry', 'https://www.genome.gov/genetics-glossary/Deoxyribonucleic-Acid-DNA', 'National Human Genome Research Institute'),
  'genes-and-chromosomes': src('Chromosome — glossary entry', 'https://www.genome.gov/genetics-glossary/Chromosome', 'National Human Genome Research Institute'),
  'transcription': src('Transcription — glossary entry', 'https://www.genome.gov/genetics-glossary/Transcription', 'National Human Genome Research Institute'),
  'translation': src('Translation — glossary entry', 'https://www.genome.gov/genetics-glossary/Translation', 'National Human Genome Research Institute'),
  'what-are-mutations': src('Mutation — glossary entry', 'https://www.genome.gov/genetics-glossary/Mutation', 'National Human Genome Research Institute'),
  'crispr': src('CRISPR — glossary entry', 'https://www.genome.gov/genetics-glossary/CRISPR', 'National Human Genome Research Institute'),
  'gene-therapy': src('Gene therapy — glossary entry', 'https://www.genome.gov/genetics-glossary/Gene-Therapy', 'National Human Genome Research Institute'),
  'human-genome-project': src('Human Genome Project — glossary entry', 'https://www.genome.gov/genetics-glossary/Human-Genome-Project', 'National Human Genome Research Institute'),
  'pharmacogenomics': src('Pharmacogenomics — glossary entry', 'https://www.genome.gov/genetics-glossary/Pharmacogenomics', 'National Human Genome Research Institute'),
  'epigenetics': src('Epigenetics — glossary entry', 'https://www.genome.gov/genetics-glossary/Epigenetics', 'National Human Genome Research Institute'),
};

/**
 * Resolve the authoritative references for a topic. Order: the topic-specific
 * glossary entry (if any), then its category references, then the general
 * references — deduped by URL. Unknown topics still get the general references,
 * so every explanation is grounded in at least NIH/NHGRI sources.
 */
export function getSources({ topicId, category } = {}) {
  const ordered = [];
  if (topicId && TOPIC_GLOSSARY[topicId]) ordered.push(TOPIC_GLOSSARY[topicId]);
  if (category && CATEGORY_SOURCES[category]) ordered.push(...CATEGORY_SOURCES[category]);
  ordered.push(...GENERAL_SOURCES);

  const seen = new Set();
  const deduped = [];
  for (const s of ordered) {
    if (seen.has(s.url)) continue;
    seen.add(s.url);
    deduped.push(s);
  }
  return deduped;
}
