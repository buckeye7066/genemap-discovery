import { EDUCATION_LEVELS } from './EducationLevelContext';

const LEVEL_VOCABULARY = {
  elementary: {
    gene: 'instruction',
    DNA: 'the body\'s instruction book',
    chromosome: 'instruction package',
    protein: 'tiny worker',
    mutation: 'a change in the instructions',
    allele: 'a version of an instruction',
    phenotype: 'how something looks or works',
    genotype: 'the actual instructions inside',
    transcription: 'copying the instructions',
    translation: 'building the worker from the copy',
    expression: 'when an instruction gets used',
    inheritance: 'passing instructions from parents to kids',
  },
  middle_school: {
    gene: 'gene (a section of DNA that codes for a trait)',
    DNA: 'DNA (deoxyribonucleic acid — the molecule that stores genetic information)',
    chromosome: 'chromosome (a long strand of packaged DNA)',
    protein: 'protein (a molecule that does work in cells)',
    mutation: 'mutation (a change in the DNA sequence)',
    allele: 'allele (a different version of a gene)',
    phenotype: 'phenotype (the visible trait)',
    genotype: 'genotype (the genetic makeup)',
  },
  high_school: {},
  undergraduate: {},
  graduate: {},
  postgraduate: {},
};

const ANALOGY_BANKS = {
  elementary: {
    dna: 'Think of DNA like a very long recipe book that tells your body how to build everything it needs.',
    gene: 'A gene is like one recipe in the book — it tells the body how to make one specific thing.',
    chromosome: 'Imagine rolling up a very long piece of paper into a neat scroll. That scroll is like a chromosome — it keeps the DNA organized.',
    mutation: 'Sometimes when you copy a recipe, you might accidentally change a word. A mutation is like that — a small change in the instructions.',
    protein: 'Proteins are like tiny robots in your body. Each one has a special job, like carrying oxygen or fighting germs.',
    cell: 'Your body is made of tiny building blocks called cells — like LEGO bricks that are alive!',
    inheritance: 'You get half your recipe book from your mom and half from your dad. That\'s why you might have your mom\'s eyes and your dad\'s smile.',
  },
  middle_school: {
    dna: 'DNA is like computer code for living things. It\'s written in a 4-letter alphabet (A, T, C, G) and contains all the instructions to build and run an organism.',
    gene: 'A gene is a specific segment of DNA that contains the instructions for making one particular protein. Think of it as a single app on a phone.',
    chromosome: 'Chromosomes are like folders on a computer — they organize your DNA into manageable packages. Humans have 23 pairs.',
    mutation: 'A mutation is a change in the DNA sequence. Some mutations are harmless (like a typo that doesn\'t change the meaning), while others can cause problems.',
    protein: 'Proteins are molecular machines. They do almost everything in your cells: build structures, speed up chemical reactions, and send signals.',
  },
  high_school: {
    dna: 'DNA is a double-stranded helical polymer of nucleotides. The complementary base pairing (A-T, G-C) enables both replication and transcription.',
    gene: 'A gene is a functional unit of heredity — a sequence of nucleotides that encodes a functional RNA or polypeptide product.',
    mutation: 'Mutations range from single nucleotide polymorphisms (SNPs) to large chromosomal rearrangements. Their effect depends on location and type.',
  },
  undergraduate: {},
  graduate: {},
  postgraduate: {},
};

export function buildExplanationPrompt(topic, level, additionalContext = '') {
  const config = EDUCATION_LEVELS[level];
  if (!config) {
    return `Explain the following genetics topic: ${topic}`;
  }

  const vocabMap = LEVEL_VOCABULARY[level] || {};
  const vocabInstructions = Object.keys(vocabMap).length > 0
    ? `\n\nVocabulary guidance — when mentioning these terms, use the following phrasing:\n${Object.entries(vocabMap).map(([term, replacement]) => `- "${term}" → "${replacement}"`).join('\n')}`
    : '';

  return [
    `You are a genetics educator. ${config.promptGuidance}`,
    vocabInstructions,
    additionalContext ? `\nAdditional context: ${additionalContext}` : '',
    `\nTopic to explain: ${topic}`,
    '\nStructure your response with these sections:',
    '1. **The Big Picture** — A high-level overview',
    '2. **How It Works** — The mechanism or process',
    '3. **Why It Matters** — Real-world relevance',
    '4. **Key Takeaways** — 3-5 bullet points summarizing the essentials',
  ].join('\n');
}

export function buildImagePrompt(topic, level) {
  const styleMap = {
    elementary: 'Friendly cartoon-style educational illustration with bright colors, large labels, and cute characters. No scary or complex imagery. Style: children\'s science book illustration.',
    middle_school: 'Clean, colorful educational diagram suitable for a middle school science textbook. Clear labels, moderate detail, engaging but accurate.',
    high_school: 'Detailed scientific diagram in textbook style. Proper labels, accurate structures, clear color coding. AP Biology level illustration.',
    undergraduate: 'University-level scientific figure. Molecular-level detail, proper nomenclature, pathway arrows, data annotations. Style: college genetics textbook.',
    graduate: 'Publication-quality scientific figure with detailed molecular representations, experimental data overlays, and comprehensive annotations.',
    postgraduate: 'Journal-quality figure with maximum detail, structural biology representations, multi-panel layout showing mechanisms, data, and models.',
  };

  const style = styleMap[level] || styleMap.undergraduate;
  return `Create an educational genetics illustration about: ${topic}. ${style} The image should be clear, accurate, and educational.`;
}

export function buildQuizPrompt(topic, level, questionCount = 5) {
  const config = EDUCATION_LEVELS[level];
  const difficultyMap = {
    elementary: 'very easy, multiple choice with 3 options, simple language',
    middle_school: 'easy to moderate, multiple choice with 4 options',
    high_school: 'moderate, mix of multiple choice and short answer',
    undergraduate: 'moderate to challenging, requires understanding of mechanisms',
    graduate: 'challenging, requires synthesis of multiple concepts',
    postgraduate: 'expert-level, may reference specific research findings',
  };

  const difficulty = difficultyMap[level] || difficultyMap.undergraduate;

  return [
    `You are creating a genetics quiz. ${config?.promptGuidance || ''}`,
    `\nTopic: ${topic}`,
    `Difficulty: ${difficulty}`,
    `Number of questions: ${questionCount}`,
    '\nReturn the quiz as a JSON array with this structure:',
    '```json',
    '[{',
    '  "question": "the question text",',
    '  "options": ["A", "B", "C", "D"],',
    '  "correctIndex": 0,',
    '  "explanation": "why the answer is correct"',
    '}]',
    '```',
    'Only return the JSON array, no other text.',
  ].join('\n');
}

export function getAnalogyForConcept(concept, level) {
  const bank = ANALOGY_BANKS[level] || {};
  const key = concept.toLowerCase().trim();
  return bank[key] || null;
}

export function getComplexitySettings(level) {
  const config = EDUCATION_LEVELS[level];
  if (!config) {
    return { showMolecularDetail: true, showStatistics: false, showRawData: false, showResearchRefs: false, animationSpeed: 'normal' };
  }

  return {
    showMolecularDetail: config.detailDepth >= 3,
    showStatistics: config.detailDepth >= 4,
    showRawData: config.detailDepth >= 5,
    showResearchRefs: config.detailDepth >= 5,
    showInteractiveControls: config.detailDepth >= 3,
    maxLabelLength: config.detailDepth <= 2 ? 20 : config.detailDepth <= 4 ? 40 : 100,
    animationSpeed: config.detailDepth <= 2 ? 'slow' : 'normal',
    fontSize: config.detailDepth <= 2 ? 'large' : 'normal',
    colorScheme: config.detailDepth <= 2 ? 'vibrant' : 'scientific',
  };
}
