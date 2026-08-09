/**
 * Provenance-first association claim contract.
 *
 * AI candidate leads are never treated as calibrated evidence grades.
 * Every material claim must carry source, record id, taxon/species,
 * evidence class, release/version, retrieval date, and a direct link when known.
 */

export type EvidenceClass =
  | 'ai_lead'
  | 'human_verified'
  | 'animal_model'
  | 'computational'
  | 'external_followup';

export type EvidenceStrength = 'none' | 'lead' | 'supporting' | 'strong' | 'unknown';

export type TaxonCode = '9606' | '10090' | 'other' | 'unspecified';

export interface AssociationClaim {
  source: string;
  recordId: string | null;
  claim: string;
  taxon: TaxonCode;
  species: string;
  evidenceClass: EvidenceClass;
  evidenceType: string;
  evidenceStrength: EvidenceStrength;
  releaseVersion: string | null;
  retrievalDate: string;
  directLink: string | null;
  isAiLead: boolean;
}

export const EVIDENCE_CLASS_RANK: Record<EvidenceClass, number> = {
  human_verified: 400,
  computational: 300,
  animal_model: 200,
  external_followup: 100,
  ai_lead: 0,
};

export const SPECIES_LABEL: Record<TaxonCode, string> = {
  '9606': 'Homo sapiens',
  '10090': 'Mus musculus',
  other: 'Other / non-human',
  unspecified: 'Unspecified',
};

const NON_ASSOCIATION_EVIDENCE_TYPES = new Set([
  'gene_identity',
  'phenotype_ontology',
  'database_link',
]);

/** Return a calendar-date stamp for claim retrieval provenance. */
export function isoRetrievalDate(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Association links are rendered by both React and printable HTML surfaces.
 * Keep only absolute HTTP(S) URLs at the shared contract boundary so every
 * downstream consumer receives the same safe, canonical value.
 */
export function safeExternalHttpUrl(value: string | null | undefined): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    return url.href;
  } catch {
    return null;
  }
}

/** Create a normalized claim with stable species, date, link, and AI-lead fields. */
export function createAssociationClaim(
  partial: Omit<AssociationClaim, 'species' | 'isAiLead' | 'retrievalDate'> & {
    species?: string;
    isAiLead?: boolean;
    retrievalDate?: string;
  },
): AssociationClaim {
  const evidenceClass = partial.evidenceClass;
  return {
    source: partial.source,
    recordId: partial.recordId ?? null,
    claim: partial.claim,
    taxon: partial.taxon,
    species: partial.species || SPECIES_LABEL[partial.taxon] || SPECIES_LABEL.unspecified,
    evidenceClass,
    evidenceType: partial.evidenceType,
    evidenceStrength: partial.evidenceStrength,
    releaseVersion: partial.releaseVersion ?? null,
    retrievalDate: partial.retrievalDate || isoRetrievalDate(),
    directLink: safeExternalHttpUrl(partial.directLink),
    isAiLead: partial.isAiLead ?? evidenceClass === 'ai_lead',
  };
}

/** Build the AI-lead claim that must accompany every untrusted model suggestion. */
export function aiLeadClaim(symbol: string, phenotypeQuery: string, retrievalDate?: string): AssociationClaim {
  return createAssociationClaim({
    source: 'GeneMap AI candidate generator',
    recordId: null,
    claim: `${symbol} is an AI-suggested candidate lead for follow-up research related to "${phenotypeQuery}"`,
    taxon: '9606',
    evidenceClass: 'ai_lead',
    evidenceType: 'model_suggestion',
    evidenceStrength: 'lead',
    releaseVersion: 'publication-task/candidate_gene_research@1',
    retrievalDate,
    directLink: null,
    isAiLead: true,
  });
}

/** Authoritative human gene-identity claim from MyGene/Ensembl/NCBI. */
export function humanGeneIdentityClaim(input: {
  symbol: string;
  ensemblId?: string | null;
  entrezId?: string | null;
  genomeBuild?: string | null;
  source?: string | null;
  retrievalDate?: string;
}): AssociationClaim {
  const recordId = input.ensemblId || (input.entrezId ? `ENTREZ:${input.entrezId}` : null);
  const link = input.ensemblId
    ? `https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${encodeURIComponent(input.ensemblId)}`
    : input.entrezId
      ? `https://www.ncbi.nlm.nih.gov/gene/${encodeURIComponent(input.entrezId)}`
      : null;
  return createAssociationClaim({
    source: input.source || 'MyGene.info (Ensembl/NCBI)',
    recordId,
    claim: `${input.symbol} gene identity verified in Homo sapiens`,
    taxon: '9606',
    evidenceClass: 'human_verified',
    evidenceType: 'gene_identity',
    evidenceStrength: 'supporting',
    releaseVersion: input.genomeBuild || 'GRCh38',
    retrievalDate: input.retrievalDate,
    directLink: link,
    isAiLead: false,
  });
}

/** HPO phenotype term claim, limited to ontology-term verification. */
export function hpoPhenotypeClaim(input: {
  geneSymbol: string;
  phenotypeName: string;
  hpoId: string;
  retrievalDate?: string;
}): AssociationClaim {
  return createAssociationClaim({
    source: 'Human Phenotype Ontology',
    recordId: input.hpoId,
    // This verifies the phenotype term itself (ontology record), not a curated
    // gene-phenotype association. Keep wording neutral and non-associative.
    claim: `Phenotype term validated in HPO: ${input.phenotypeName}`,
    taxon: '9606',
    // Presence of an HPO term is a follow-up pointer, not curated association evidence.
    evidenceClass: 'external_followup',
    evidenceType: 'phenotype_ontology',
    evidenceStrength: 'supporting',
    releaseVersion: 'HPO',
    retrievalDate: input.retrievalDate,
    directLink: `https://hpo.jax.org/app/browse/term/${input.hpoId}`,
    isAiLead: false,
  });
}

/** External database follow-up links are not automatic claim-level citations. */
export function externalFollowupClaim(input: {
  geneSymbol: string;
  database: string;
  url: string;
  recordId?: string | null;
  retrievalDate?: string;
}): AssociationClaim {
  return createAssociationClaim({
    source: input.database,
    recordId: input.recordId ?? null,
    claim: `${input.geneSymbol} external follow-up source (not an automatic association citation)`,
    taxon: 'unspecified',
    evidenceClass: 'external_followup',
    evidenceType: 'database_link',
    evidenceStrength: 'none',
    releaseVersion: null,
    retrievalDate: input.retrievalDate,
    directLink: input.url,
    isAiLead: false,
  });
}

/**
 * Return an association-ranking score only for evidence that actually supports
 * a gene-query association. Gene identity, ontology-term verification, and
 * database links remain visible provenance but cannot promote a candidate.
 */
export function claimSortKey(claim: AssociationClaim): number {
  if (
    claim.isAiLead
    || claim.evidenceClass === 'external_followup'
    || claim.evidenceStrength === 'none'
    || NON_ASSOCIATION_EVIDENCE_TYPES.has(claim.evidenceType)
  ) return 0;
  return EVIDENCE_CLASS_RANK[claim.evidenceClass] ?? 0;
}

/**
 * Rank only by genuine association evidence. Candidates tied at the same
 * evidence level retain their original model-lead order; coordinate or identity
 * verification never substitutes for relevance evidence.
 */
export function rankGenesByProvenance<T extends {
  associationClaims?: AssociationClaim[];
}>(genes: T[]): T[] {
  return genes
    .map((gene, originalIndex) => ({
      gene,
      originalIndex,
      bestAssociationScore: Math.max(0, ...(gene.associationClaims || []).map(claimSortKey)),
    }))
    .sort((a, b) => (
      b.bestAssociationScore - a.bestAssociationScore
      || a.originalIndex - b.originalIndex
    ))
    .map(({ gene }) => gene);
}

/** Strip LLM self-scores so they cannot be treated as evidence. */
export function stripLlmSelfScores<T extends Record<string, unknown>>(gene: T): T {
  const next = { ...gene };
  delete next.score;
  delete next.confidence_score;
  delete next.confidenceScore;
  delete next.aiRelevance;
  delete next.relevanceScore;
  return next;
}

/** Partition claims so human, animal, computational, AI, and follow-up evidence never mix silently. */
export function partitionClaimsBySpecies(claims: AssociationClaim[]) {
  const human: AssociationClaim[] = [];
  const animal: AssociationClaim[] = [];
  const computational: AssociationClaim[] = [];
  const aiLeads: AssociationClaim[] = [];
  const external: AssociationClaim[] = [];

  for (const claim of claims || []) {
    if (claim.evidenceClass === 'ai_lead') aiLeads.push(claim);
    else if (claim.evidenceClass === 'animal_model' || claim.taxon === '10090') animal.push(claim);
    else if (claim.evidenceClass === 'computational') computational.push(claim);
    else if (claim.evidenceClass === 'external_followup') external.push(claim);
    else human.push(claim);
  }

  return { human, animal, computational, aiLeads, external };
}