import { apiClient } from '@genemap/shared';
import {
  aiLeadClaim,
  deriveRankingBasisFromClaims,
  humanGeneIdentityClaim,
  hpoPhenotypeClaim,
  externalFollowupClaim,
  partitionClaimsBySpecies,
  rankGenesByProvenance,
  stripLlmSelfScores,
} from '../../../../packages/shared/src/associationClaim.ts';

/**
 * PhenotypeSearchService
 *
 * Two-mode architecture:
 *   - basic:    Educator-friendly keyword search using a curated, deterministic
 *               phenotype/disease dataset. No LLM required; always available.
 *   - advanced: LLM-assisted candidate-gene research flow for researchers. It
 *               still relies on server-owned publication tasks, strips model
 *               self-scores, enriches identifiers through authoritative
 *               adapters, and clearly labels AI candidate output.
 *
 * This module is intentionally free of React dependencies so both modes can be
 * tested as plain functions.
 */

const CURATED_CONCEPTS = [
  {
    conceptId: 'phenotype:seizures',
    conceptKind: 'phenotype',
    label: 'Seizures',
    synonyms: ['seizure', 'epilepsy', 'convulsions', 'fits'],
    description: 'Episodes of abnormal electrical activity in the brain. The listed genes are educational starting points, not a diagnostic panel.',
    genes: [
      { symbol: 'SCN1A', name: 'Sodium voltage-gated channel alpha subunit 1', explanation: 'Well-established epilepsy research gene.' },
      { symbol: 'KCNQ2', name: 'Potassium voltage-gated channel subfamily Q member 2', explanation: 'Frequently studied in neonatal seizure disorders.' },
      { symbol: 'STXBP1', name: 'Syntaxin binding protein 1', explanation: 'Studied in developmental and epileptic encephalopathies.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene', 'Human Phenotype Ontology'],
  },
  {
    conceptId: 'phenotype:developmental-delay',
    conceptKind: 'phenotype',
    label: 'Developmental Delay',
    synonyms: ['developmental delay', 'delayed development', 'global developmental delay', 'learning delay'],
    description: 'A broad educational phenotype involving delayed acquisition of developmental milestones.',
    genes: [
      { symbol: 'MECP2', name: 'Methyl-CpG binding protein 2', explanation: 'Widely studied in neurodevelopmental research.' },
      { symbol: 'DDX3X', name: 'DEAD-box helicase 3 X-linked', explanation: 'Associated with neurodevelopmental research cohorts.' },
      { symbol: 'ARID1B', name: 'AT-rich interaction domain 1B', explanation: 'Studied in syndromic developmental delay.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene', 'Human Phenotype Ontology'],
  },
  {
    conceptId: 'phenotype:ataxia',
    conceptKind: 'phenotype',
    label: 'Ataxia',
    synonyms: ['ataxia', 'poor coordination', 'unsteady gait', 'balance problems'],
    description: 'A phenotype involving impaired balance or coordination. Many acquired and genetic causes exist.',
    genes: [
      { symbol: 'ATXN1', name: 'Ataxin 1', explanation: 'Classic spinocerebellar ataxia research gene.' },
      { symbol: 'CACNA1A', name: 'Calcium voltage-gated channel subunit alpha1 A', explanation: 'Studied across episodic and progressive ataxia phenotypes.' },
      { symbol: 'FXN', name: 'Frataxin', explanation: 'Well-established in Friedreich ataxia research.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene', 'Human Phenotype Ontology'],
  },
  {
    conceptId: 'phenotype:hearing-loss',
    conceptKind: 'phenotype',
    label: 'Hearing Loss',
    synonyms: ['hearing loss', 'deafness', 'hard of hearing', 'auditory impairment'],
    description: 'Reduced hearing ability. Environmental, age-related, infectious, medication-related, and genetic causes can all contribute.',
    genes: [
      { symbol: 'GJB2', name: 'Gap junction protein beta 2', explanation: 'Commonly studied in nonsyndromic hearing-loss genetics.' },
      { symbol: 'SLC26A4', name: 'Solute carrier family 26 member 4', explanation: 'Studied in Pendred syndrome and enlarged vestibular aqueduct.' },
      { symbol: 'OTOF', name: 'Otoferlin', explanation: 'Associated with auditory neuropathy research.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene', 'Human Phenotype Ontology'],
  },
  {
    conceptId: 'disease:cystic-fibrosis',
    conceptKind: 'disease',
    label: 'Cystic Fibrosis',
    synonyms: ['cystic fibrosis', 'cf', 'mucoviscidosis'],
    description: 'An inherited disorder affecting mucus-producing organs. The basic result highlights the principal gene for educational study.',
    genes: [
      { symbol: 'CFTR', name: 'CF transmembrane conductance regulator', explanation: 'The established causal gene for cystic fibrosis.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene'],
  },
  {
    conceptId: 'disease:sickle-cell',
    conceptKind: 'disease',
    label: 'Sickle Cell Disease',
    synonyms: ['sickle cell disease', 'sickle cell anemia', 'sickle-cell', 'sickle cell'],
    description: 'A group of inherited red-blood-cell disorders involving hemoglobin S.',
    genes: [
      { symbol: 'HBB', name: 'Hemoglobin subunit beta', explanation: 'The principal gene involved in sickle cell disease.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene'],
  },
  {
    conceptId: 'disease:familial-hypercholesterolemia',
    conceptKind: 'disease',
    label: 'Familial Hypercholesterolemia',
    synonyms: ['familial hypercholesterolemia', 'fh', 'inherited high cholesterol'],
    description: 'An inherited disorder characterized by very high LDL cholesterol from early life.',
    genes: [
      { symbol: 'LDLR', name: 'Low density lipoprotein receptor', explanation: 'The most common established gene in familial hypercholesterolemia.' },
      { symbol: 'APOB', name: 'Apolipoprotein B', explanation: 'An established FH-associated gene.' },
      { symbol: 'PCSK9', name: 'Proprotein convertase subtilisin/kexin type 9', explanation: 'Gain-of-function variants are an established FH mechanism.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene'],
  },
  {
    conceptId: 'phenotype:cardiomyopathy',
    conceptKind: 'phenotype',
    label: 'Cardiomyopathy',
    synonyms: ['cardiomyopathy', 'heart muscle disease', 'hypertrophic cardiomyopathy', 'dilated cardiomyopathy'],
    description: 'A broad group of disorders affecting heart muscle. Clinical diagnosis requires cardiac evaluation; this is an educational gene overview.',
    genes: [
      { symbol: 'MYH7', name: 'Myosin heavy chain 7', explanation: 'Frequently studied in inherited cardiomyopathy.' },
      { symbol: 'MYBPC3', name: 'Myosin binding protein C3', explanation: 'A major hypertrophic-cardiomyopathy research gene.' },
      { symbol: 'TTN', name: 'Titin', explanation: 'Widely studied in dilated cardiomyopathy.' },
    ],
    sources: ['MedlinePlus Genetics', 'NCBI Gene'],
  },
];

const RESEARCH_BOUNDARY = 'Research candidates only — not diagnosis, personal risk prediction, treatment, or medical advice.';
const PROFILE_UNAVAILABLE = 'Generated profile unavailable. This gene remains an unverified AI-suggested candidate lead; verify relevance in cited authoritative sources.';
const MODEL_SUGGESTION_SOURCE = 'AI-generated candidate lead';
const VERIFIED_METADATA_SOURCE = 'MyGene.info (Ensembl/NCBI)';
const HPO_VALIDATED_SOURCE = 'Human Phenotype Ontology';
const DEFAULT_BASIC_LIMIT = 8;
const DEFAULT_ADVANCED_LIMIT = 15;

function normalizeSearchTerm(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function uniqueStrings(values) {
  return [...new Set((values || []).filter(Boolean))];
}

function matchCuratedConcepts(query) {
  const normalized = normalizeSearchTerm(query);
  if (!normalized) return [];

  return CURATED_CONCEPTS.map((concept) => {
    const candidates = [concept.label, ...concept.synonyms].map(normalizeSearchTerm);
    const exact = candidates.some((value) => value === normalized);
    const partial = candidates.some((value) => value.includes(normalized) || normalized.includes(value));
    const tokenMatches = normalized.split(' ').filter((token) =>
      candidates.some((value) => value.includes(token))
    ).length;
    return {
      concept,
      score: exact ? 100 : partial ? 50 : tokenMatches,
    };
  })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);
}

async function safeEnrich(symbols, phenotypes = []) {
  if ((!symbols || symbols.length === 0) && (!phenotypes || phenotypes.length === 0)) {
    return { genes: {}, phenotypes: {}, adapterRetrievedAt: null };
  }
  try {
    return await apiClient.enrichGenomicData({ symbols, phenotypes });
  } catch (error) {
    console.warn('Authoritative enrichment unavailable:', error);
    return { genes: {}, phenotypes: {}, adapterRetrievedAt: null };
  }
}

function applyAuthoritativeData(gene, record) {
  const rec = record && record.verified ? record : null;
  if (!rec) {
    return {
      ...gene,
      coordinatesVerified: false,
      verificationStatus: 'unresolved',
      verificationSource: null,
      authoritativeRetrievedAt: null,
      chromosome: null,
      start: null,
      end: null,
      strand: null,
      ensemblId: null,
      entrezId: null,
      mapLocation: null,
      genomeBuild: null,
    };
  }

  return {
    ...gene,
    symbol: rec.symbol || gene.symbol,
    name: rec.name || gene.name,
    description: rec.summary || gene.description,
    chromosome: rec.chromosome || null,
    start: rec.start ?? null,
    end: rec.end ?? null,
    strand: rec.strand ?? null,
    ensemblId: rec.ensemblId || null,
    entrezId: rec.entrezId || null,
    mapLocation: rec.mapLocation || null,
    genomeBuild: rec.genomeBuild || null,
    coordinatesVerified: true,
    verificationStatus: 'verified',
    verificationSource: rec.source || 'MyGene.info',
    authoritativeRetrievedAt: rec.retrievedAt || null,
  };
}

function isoDateFromAdapterTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function attachProvenance(gene) {
  const claims = buildAssociationClaims(gene);
  const partition = partitionClaimsBySpecies(claims);
  const rankingBasis = deriveRankingBasisFromClaims(claims);
  const rankingReason = rankingBasis === 'human_verified'
    ? 'Ranked by human-verified gene-query association evidence.'
    : rankingBasis === 'computational'
      ? 'Ranked by computational gene-query association evidence.'
      : rankingBasis === 'animal_model'
        ? 'Ranked by animal-model gene-query association evidence; not human clinical evidence.'
        : 'AI-suggested candidate order only; gene identity, coordinates, ontology terms, and database links do not verify relevance to the query.';

  return {
    ...gene,
    associationClaims: claims,
    evidencePartition: partition,
    rankingBasis,
    rankingReason,
  };
}

function buildAssociationClaims(gene) {
  const claims = [];
  const phenotypeQuery = gene.query || gene.searchQuery || gene.phenotypeQuery || 'the search query';
  const symbol = gene.symbol || 'Unknown gene';
  const sourceSet = new Set(gene.sources || []);

  // Always preserve the AI lead as an explicit, unverified claim.
  claims.push(aiLeadClaim(symbol, phenotypeQuery));

  // Authoritative coordinate / identity verification is source metadata only;
  // it does not verify relevance to the phenotype query and cannot promote rank.
  if (gene.coordinatesVerified && (gene.ensemblId || gene.entrezId)) {
    claims.push(humanGeneIdentityClaim({
      symbol,
      ensemblId: gene.ensemblId,
      entrezId: gene.entrezId,
      genomeBuild: gene.genomeBuild,
      source: gene.verificationSource || VERIFIED_METADATA_SOURCE,
      retrievalDate: isoDateFromAdapterTimestamp(gene.authoritativeRetrievedAt),
    }));
  }

  // HPO validation confirms an ontology term exists; it is not a curated
  // gene-phenotype association and is kept as external follow-up metadata.
  for (const phenotype of gene.phenotypes || []) {
    if (phenotype?.hpoVerified && phenotype.hpoId) {
      claims.push(hpoPhenotypeClaim({
        geneSymbol: symbol,
        phenotypeName: phenotype.name,
        hpoId: phenotype.hpoId,
        retrievalDate: isoDateFromAdapterTimestamp(phenotype.retrievedAt),
      }));
    }
  }

  // External resources are links to continue checking, not automatic evidence
  // that the queried association is true. No retrieval date is recorded because
  // the browser has not retrieved these linked records.
  const resourceRows = gene.furtherReading?.resources || [];
  for (const resource of resourceRows) {
    if (!resource?.url) continue;
    claims.push(externalFollowupClaim({
      geneSymbol: symbol,
      database: resource.name || 'External database',
      url: resource.url,
      recordId: null,
    }));
  }

  if (gene.coordinatesVerified) sourceSet.add(VERIFIED_METADATA_SOURCE);
  if ((gene.phenotypes || []).some((p) => p?.hpoVerified)) sourceSet.add(HPO_VALIDATED_SOURCE);

  return claims;
}

function buildFurtherReading(symbol, sources = []) {
  const resources = [
    {
      name: 'NCBI Gene',
      url: `https://www.ncbi.nlm.nih.gov/gene/?term=${encodeURIComponent(symbol)}[sym]`,
    },
    {
      name: 'Ensembl',
      url: `https://www.ensembl.org/Multi/Search/Results?q=${encodeURIComponent(symbol)};site=ensembl`,
    },
    {
      name: 'PubMed',
      url: `https://pubmed.ncbi.nlm.nih.gov/?term=${encodeURIComponent(symbol)}[Title%2FAbstract]`,
    },
  ];

  return {
    resources,
    pubmedSearchTerms: uniqueStrings([symbol, `${symbol} genetics`, `${symbol} phenotype`]),
    sourceLabels: uniqueStrings(sources),
  };
}

function buildBasicGeneResult(gene, concept, rank) {
  return {
    ...gene,
    rank,
    query: concept.label,
    resultMode: 'basic',
    resultModeLabel: 'Curated educational result',
    isAiSuggested: false,
    confidence_score: null,
    evidenceLevel: 'curated educational summary',
    description: concept.description,
    diseases: concept.conceptKind === 'disease' ? [concept.label] : [],
    phenotypes: concept.conceptKind === 'phenotype'
      ? [{ name: concept.label, hpoId: null, hpoVerified: false }]
      : [],
    sources: uniqueStrings([...concept.sources, MODEL_SUGGESTION_SOURCE]),
    furtherReading: buildFurtherReading(gene.symbol, concept.sources),
    disclaimer: RESEARCH_BOUNDARY,
  };
}

async function basicSearch(query, options = {}) {
  const matches = matchCuratedConcepts(query);
  const limit = options.limit || DEFAULT_BASIC_LIMIT;

  if (!matches.length) {
    return {
      mode: 'basic',
      query,
      classification: {
        queryType: 'unknown',
        isDisease: false,
        diseaseName: null,
        mainFeatures: [],
        synonyms: [],
        inheritancePattern: null,
      },
      results: [],
      educationalSummary: 'No close curated match was found. Try a plain-language phenotype such as “seizures,” “ataxia,” “hearing loss,” or a named condition such as “cystic fibrosis.”',
      disclaimer: RESEARCH_BOUNDARY,
    };
  }

  const selectedConcepts = matches.slice(0, 2).map((entry) => entry.concept);
  const geneRows = [];
  for (const concept of selectedConcepts) {
    for (const gene of concept.genes) {
      if (!geneRows.some((row) => row.symbol === gene.symbol)) {
        geneRows.push(buildBasicGeneResult(gene, concept, geneRows.length + 1));
      }
    }
  }

  const limitedRows = geneRows.slice(0, limit);
  const enrichment = await safeEnrich(
    limitedRows.map((row) => row.symbol),
    selectedConcepts
      .filter((concept) => concept.conceptKind === 'phenotype')
      .map((concept) => concept.label)
  );

  const withAuthoritativeData = limitedRows.map((row) => {
    const enriched = applyAuthoritativeData(row, enrichment.genes?.[row.symbol]);
    const phenotypeRows = (enriched.phenotypes || []).map((phenotype) => {
      const validation = enrichment.phenotypes?.[normalizeSearchTerm(phenotype.name)];
      return validation
        ? {
            ...phenotype,
            hpoId: validation.hpoId || null,
            hpoVerified: Boolean(validation.verified),
            retrievedAt: validation.retrievedAt || null,
          }
        : phenotype;
    });
    return attachProvenance({ ...enriched, phenotypes: phenotypeRows });
  });

  const primaryConcept = selectedConcepts[0];
  return {
    mode: 'basic',
    query,
    classification: {
      queryType: primaryConcept.conceptKind,
      isDisease: primaryConcept.conceptKind === 'disease',
      diseaseName: primaryConcept.conceptKind === 'disease' ? primaryConcept.label : null,
      mainFeatures: primaryConcept.conceptKind === 'phenotype' ? [primaryConcept.label] : [],
      synonyms: primaryConcept.synonyms,
      inheritancePattern: null,
    },
    results: rankGenesByProvenance(withAuthoritativeData).map((row, index) => ({
      ...row,
      rank: index + 1,
    })),
    educationalSummary: primaryConcept.description,
    disclaimer: RESEARCH_BOUNDARY,
  };
}

function parseJsonObject(result) {
  if (!result) return null;
  if (typeof result === 'object') return result;
  const cleaned = String(result).replace(/```json\n?|\n?```/g, '').trim();
  return JSON.parse(cleaned);
}

async function classifyAdvancedQuery(queryReference) {
  const parsed = parseJsonObject(await apiClient.invokeLlm(
    {
      operation: 'classify',
      query: queryReference,
    },
    'candidate_gene_research',
  ));
  return {
    queryType: parsed.queryType || 'phenotype',
    isDisease: Boolean(parsed.isDisease),
    diseaseName: parsed.diseaseName || null,
    mainFeatures: Array.isArray(parsed.mainFeatures) ? parsed.mainFeatures : [],
    synonyms: Array.isArray(parsed.synonyms) ? parsed.synonyms : [],
    inheritancePattern: parsed.inheritancePattern || null,
    hpoTerms: [],
  };
}

async function suggestAdvancedCandidates(queryReference, classification, limit) {
  const parsed = parseJsonObject(await apiClient.invokeLlm(
    {
      operation: 'suggest_candidates',
      query: queryReference,
      classification: {
        queryType: classification.queryType,
        isDisease: classification.isDisease,
        diseaseName: classification.diseaseName,
        mainFeatures: classification.mainFeatures,
        synonyms: classification.synonyms,
        inheritancePattern: classification.inheritancePattern,
      },
      limit,
    },
    'candidate_gene_research',
  ));
  return (parsed.candidateGenes || []).slice(0, limit);
}

async function enrichGeneCombined(gene, queryReference, classification) {
  try {
    const profile = parseJsonObject(await apiClient.invokeLlm(
      {
        operation: 'gene_profile',
        gene: {
          symbol: gene.symbol,
          name: gene.name || gene.symbol,
        },
        query: queryReference,
        classification: {
          queryType: classification.queryType,
          diseaseName: classification.diseaseName,
          mainFeatures: classification.mainFeatures,
        },
      },
      'candidate_gene_research',
    ));

    return {
      ...gene,
      aiSummary: profile.summary || PROFILE_UNAVAILABLE,
      aiSummaryStatus: profile.summaryStatus || 'unavailable',
      keyTakeaways: Array.isArray(profile.keyTakeaways) ? profile.keyTakeaways : [],
      phenotypes: Array.isArray(profile.phenotypes) ? profile.phenotypes : [],
    };
  } catch (error) {
    console.warn(`Failed to load bounded profile for ${gene.symbol}:`, error);
    return {
      ...gene,
      aiSummary: PROFILE_UNAVAILABLE,
      aiSummaryStatus: 'unavailable',
      keyTakeaways: [],
      phenotypes: [],
    };
  }
}

async function resolveAdvancedQueryReference(query) {
  const curatedMatch = matchCuratedConcepts(query)[0]?.concept;
  if (curatedMatch) {
    return {
      kind: 'curated_concept',
      conceptId: curatedMatch.conceptId,
      canonicalLabel: curatedMatch.label,
      conceptKind: curatedMatch.conceptKind,
      source: 'genemap_curated',
      version: 1,
    };
  }

  const hpoResults = await apiClient.searchPhenotypes(query).catch(() => ({ terms: [] }));
  const hpoTerm = Array.isArray(hpoResults?.terms) ? hpoResults.terms[0] : null;
  if (hpoTerm?.id && hpoTerm?.name) {
    return {
      kind: 'hpo',
      identifier: hpoTerm.id,
      canonicalLabel: hpoTerm.name,
      source: 'NLM Clinical Tables HPO',
      apiVersion: 'v3',
      obsolete: Boolean(hpoTerm.obsolete),
    };
  }

  const mondoResults = await apiClient.searchMondoDiseases(query).catch(() => ({ diseases: [] }));
  const mondoDisease = Array.isArray(mondoResults?.diseases) ? mondoResults.diseases[0] : null;
  if (mondoDisease?.id && mondoDisease?.name) {
    return {
      kind: 'mondo',
      identifier: mondoDisease.id,
      canonicalLabel: mondoDisease.name,
      source: 'EBI OLS4 MONDO',
      obsolete: Boolean(mondoDisease.obsolete),
    };
  }

  return null;
}

async function advancedSearch(query, options = {}) {
  const limit = options.limit || DEFAULT_ADVANCED_LIMIT;
  const queryReference = await resolveAdvancedQueryReference(query);
  if (!queryReference) {
    throw new Error(
      'Advanced research search requires a recognized HPO phenotype or MONDO disease term. Try a curated basic-search term or a more specific ontology label.'
    );
  }
  const classification = await classifyAdvancedQuery(queryReference);
  const candidates = await suggestAdvancedCandidates(queryReference, classification, limit);

  const prepared = candidates.map((candidate, index) => {
    const stripped = stripLlmSelfScores(candidate);
    return {
      ...stripped,
      rank: index + 1,
      query: queryReference.canonicalLabel,
      resultMode: 'advanced',
      resultModeLabel: 'AI-assisted research candidate',
      isAiSuggested: true,
      coordinatesVerified: false,
      detailsPending: true,
      name: stripped.name || stripped.symbol,
      explanation: stripped.explanation || 'AI-suggested candidate requiring independent verification.',
      sources: [MODEL_SUGGESTION_SOURCE],
      furtherReading: buildFurtherReading(stripped.symbol, [MODEL_SUGGESTION_SOURCE]),
      disclaimer: RESEARCH_BOUNDARY,
    };
  });

  const enrichment = await safeEnrich(prepared.map((row) => row.symbol));
  const authoritative = prepared.map((row) => applyAuthoritativeData(row, enrichment.genes?.[row.symbol]));

  const detailed = [];
  const concurrency = 3;
  for (let index = 0; index < authoritative.length; index += concurrency) {
    const batch = authoritative.slice(index, index + concurrency);
    const enrichedBatch = await Promise.all(
      batch.map((row) => enrichGeneCombined(row, queryReference, classification))
    );
    detailed.push(...enrichedBatch);
  }

  const phenotypeNames = uniqueStrings(
    detailed.flatMap((row) => (row.phenotypes || []).map((phenotype) => phenotype?.name))
  ).slice(0, 100);
  const hpoValidation = phenotypeNames.length
    ? await safeEnrich([], phenotypeNames)
    : { phenotypes: {} };

  const withHpoValidation = detailed.map((row) => ({
    ...row,
    phenotypes: (row.phenotypes || []).map((phenotype) => {
      const validation = hpoValidation.phenotypes?.[normalizeSearchTerm(phenotype?.name)];
      return validation
        ? {
            ...phenotype,
            hpoId: validation.hpoId || null,
            hpoVerified: Boolean(validation.verified),
            retrievedAt: validation.retrievedAt || null,
          }
        : { ...phenotype, hpoId: null, hpoVerified: false, retrievedAt: null };
    }),
  }));

  const withProvenance = withHpoValidation.map(attachProvenance);
  const ranked = rankGenesByProvenance(withProvenance).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));

  return {
    mode: 'advanced',
    query,
    classification,
    results: ranked,
    educationalSummary: `Advanced mode produced ${ranked.length} AI-assisted research candidates. Treat them as leads until each claim is verified in primary databases and literature.`,
    disclaimer: RESEARCH_BOUNDARY,
  };
}

export const PhenotypeSearchService = {
  async search(query, options = {}) {
    const mode = options.mode === 'advanced' ? 'advanced' : 'basic';
    if (!String(query || '').trim()) {
      throw new Error('A phenotype or disease search term is required.');
    }
    return mode === 'advanced'
      ? advancedSearch(query, options)
      : basicSearch(query, options);
  },

  getAvailableModes() {
    return [
      {
        id: 'basic',
        label: 'Basic / Educator',
        description: 'Fast curated educational results without AI. Best for classrooms, families, and introductory learning.',
      },
      {
        id: 'advanced',
        label: 'Advanced / Research',
        description: 'AI-assisted candidate exploration with authoritative identifier enrichment and explicit research boundaries.',
      },
    ];
  },

  getCuratedConcepts() {
    return CURATED_CONCEPTS.map((concept) => ({
      conceptId: concept.conceptId,
      label: concept.label,
      conceptKind: concept.conceptKind,
      synonyms: [...concept.synonyms],
    }));
  },
};

export default PhenotypeSearchService;
