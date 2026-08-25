/**
 * Provenance-first association claim contract.
 *
 * AI candidate leads are never treated as calibrated evidence grades.
 * Every material claim must carry source, record id, taxon/species,
 * evidence class, release/version, and a direct link when known. Retrieval dates
 * are recorded only when an authoritative adapter actually returned a record.
 */

export type EvidenceClass =
  | 'ai_lead'
  | 'human_verified'
  | 'animal_model'
  | 'computational'
  // Text-mined or citation-derived, e.g. an Open Targets `literature` datatype
  // score. Kept apart from `computational` because a reader must be able to
  // tell "an algorithm aggregated other evidence" from "this came out of
  // published text", and apart from `human_verified` because co-occurrence in
  // a paper is not a curated assertion.
  | 'literature'
  | 'external_followup';

export type EvidenceStrength = 'none' | 'lead' | 'supporting' | 'strong' | 'unknown';

export type TaxonCode = '9606' | '10090' | 'other' | 'unspecified';

export type ClaimProvenanceRole =
  | 'association_evidence'
  | 'ai_candidate_lead'
  | 'source_metadata';

export interface AssociationClaim {
  source: string;
  recordId: string | null;
  claim: string;
  /** Machine-checkable ends of the statement, when the adapter knows them. */
  subject: ClaimEntity | null;
  object: ClaimEntity | null;
  /**
   * The source's own score, broken into the parts that produced it. Empty when
   * the source publishes no numbers, or when its numbers arrived without the
   * provenance required to interpret them - see `sanitizeScoreComponents`.
   */
  scoreComponents: EvidenceScoreComponent[];
  taxon: TaxonCode;
  species: string;
  evidenceClass: EvidenceClass;
  evidenceType: string;
  evidenceStrength: EvidenceStrength;
  releaseVersion: string | null;
  referenceAssembly: string | null;
  /** Date the cited authoritative record was actually retrieved; null when no lookup occurred. */
  retrievalDate: string | null;
  directLink: string | null;
  isAiLead: boolean;
}

export const EVIDENCE_CLASS_RANK: Record<EvidenceClass, number> = {
  human_verified: 400,
  computational: 300,
  animal_model: 200,
  // Below a curated model-organism assertion: text mining establishes that two
  // things were discussed together, not that a relationship was demonstrated.
  literature: 150,
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

// ─── Structured subject / object identity ───────────────────────────────────
//
// `claim` is a sentence for a human. These are the machine-checkable ends of
// the same statement, so a screen can group, link, and deduplicate without
// parsing prose. Null when the adapter genuinely does not know them - never
// guessed from the sentence.

export const CLAIM_ENTITY_KINDS = ['gene', 'phenotype', 'disease', 'pathway', 'variant'] as const;
export type ClaimEntityKind = typeof CLAIM_ENTITY_KINDS[number];

export interface ClaimEntity {
  kind: ClaimEntityKind;
  /** Namespaced exactly as the source namespaces it: HP:0001250, MONDO:0007739, ENSG00000197386. */
  id: string;
  label: string;
}

export function isClaimEntity(value: unknown): value is ClaimEntity {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const entity = value as Partial<ClaimEntity>;
  return (
    typeof entity.kind === 'string'
    && (CLAIM_ENTITY_KINDS as readonly string[]).includes(entity.kind)
    && typeof entity.id === 'string' && entity.id.trim().length > 0
    && typeof entity.label === 'string' && entity.label.trim().length > 0
  );
}

// ─── Decomposed source scores ───────────────────────────────────────────────
//
// THE OPEN TARGETS RULE, ENFORCED IN CODE.
//
// A rolled-up confidence number tells a reader nothing they can check. A score
// broken into its parts, each naming the kind of evidence behind it, does.
// That is why the decomposition is publishable where the bare aggregate is not.
//
// A component may only reach the browser carrying (a) its own evidence class
// and (b) the provenance of the claim it belongs to - source, release version,
// retrieval date. `sanitizeScoreComponents` refuses the whole set otherwise:
// an unattributable number is exactly what this contract exists to keep out.
//
// This governs SOURCE-PROVIDED scores only. A model's self-score is not
// evidence and is still deleted by `stripLlmSelfScores`.

export interface EvidenceScoreComponent {
  /** The source's own component id, e.g. "genetic_association", "animal_model". */
  id: string;
  label: string;
  /** Finite number on the stated scale. Never produced from a missing value. */
  score: number;
  /** Which evidence class this part represents, so a UI can keep it distinct. */
  evidenceClass: EvidenceClass;
  /** Names the scale so a number is never misread as a universal probability. */
  scale: string;
}

/** Provenance a score set must be able to point at before it may be shown. */
export interface ScoreProvenanceContext {
  source?: string | null;
  releaseVersion?: string | null;
  retrievalDate?: string | null;
}

export const OPEN_TARGETS_SCORE_SCALE = 'open_targets_datatype_score_0_1';

const OPEN_TARGETS_DATATYPE_LABELS: Record<string, string> = {
  genetic_association: 'Genetic association',
  genetic_literature: 'Genetic literature',
  somatic_mutation: 'Somatic mutation',
  known_drug: 'Known drug',
  clinical: 'Clinical',
  animal_model: 'Animal model',
  literature: 'Literature',
  rna_expression: 'RNA expression',
  affected_pathway: 'Affected pathway',
};

/**
 * Map an Open Targets datatype id onto the evidence class a reader should see.
 * Unknown ids fall back to `computational`: an aggregation we cannot attribute
 * is still an aggregation, and must never be promoted to human evidence.
 */
export function openTargetsDatatypeEvidenceClass(datatypeId: string): EvidenceClass {
  switch (datatypeId) {
    case 'genetic_association':
    case 'somatic_mutation':
    case 'known_drug':
    case 'clinical':
      return 'human_verified';
    case 'animal_model':
      return 'animal_model';
    case 'literature':
    case 'genetic_literature':
      return 'literature';
    default:
      return 'computational';
  }
}

export function openTargetsDatatypeLabel(datatypeId: string): string {
  return OPEN_TARGETS_DATATYPE_LABELS[datatypeId]
    || datatypeId.replace(/_/gu, ' ').replace(/^./u, (c) => c.toUpperCase());
}

const SCORE_COMPONENT_ID = /^[a-z0-9][a-z0-9_]{0,63}$/u;
const MAX_SCORE_COMPONENTS = 12;

/**
 * A missing score is NOT zero.
 *
 * `Number(null)` is 0 and `Number.isFinite(0)` is true, so a naive coercion
 * turns "this source said nothing" into a confident 0.00 on screen. Only an
 * actual finite number in range is accepted here.
 */
export function isRenderableScore(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Keep only components that can be interpreted and audited.
 *
 * Returns [] - refusing the entire set - when the owning claim cannot say where
 * it came from, which release, and when. Partial provenance is not a partial
 * permission: a number nobody can trace is worse than no number.
 */
export function sanitizeScoreComponents(
  components: unknown,
  provenance: ScoreProvenanceContext,
): EvidenceScoreComponent[] {
  const traceable = (['source', 'releaseVersion', 'retrievalDate'] as const)
    .every((field) => {
      const value = provenance?.[field];
      return typeof value === 'string' && value.trim().length > 0;
    });
  if (!traceable || !Array.isArray(components)) return [];

  const seen = new Set<string>();
  const kept: EvidenceScoreComponent[] = [];
  for (const raw of components) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const candidate = raw as Partial<EvidenceScoreComponent>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim().toLowerCase() : '';
    if (!SCORE_COMPONENT_ID.test(id) || seen.has(id)) continue;
    if (!isRenderableScore(candidate.score)) continue;
    const evidenceClass = candidate.evidenceClass && EVIDENCE_CLASS_RANK[candidate.evidenceClass] !== undefined
      ? candidate.evidenceClass
      : null;
    if (!evidenceClass) continue;
    const scale = typeof candidate.scale === 'string' && candidate.scale.trim() ? candidate.scale.trim() : null;
    if (!scale) continue;
    seen.add(id);
    kept.push({
      id,
      label: typeof candidate.label === 'string' && candidate.label.trim()
        ? candidate.label.trim().slice(0, 64)
        : openTargetsDatatypeLabel(id),
      score: candidate.score,
      evidenceClass,
      scale,
    });
    if (kept.length >= MAX_SCORE_COMPONENTS) break;
  }
  return kept;
}

/** Group components by evidence class so a UI can keep the five kinds distinct. */
export function groupScoreComponents(components: EvidenceScoreComponent[] | null | undefined) {
  const groups = new Map<EvidenceClass, EvidenceScoreComponent[]>();
  for (const component of components || []) {
    const bucket = groups.get(component.evidenceClass) || [];
    bucket.push(component);
    groups.set(component.evidenceClass, bucket);
  }
  return groups;
}

/** Create a normalized claim with stable species, link, and AI-lead fields. */
export function createAssociationClaim(
  partial: Omit<
    AssociationClaim,
    'species' | 'isAiLead' | 'retrievalDate' | 'referenceAssembly'
    | 'subject' | 'object' | 'scoreComponents'
  > & {
    species?: string;
    isAiLead?: boolean;
    retrievalDate?: string | null;
    referenceAssembly?: string | null;
    subject?: ClaimEntity | null;
    object?: ClaimEntity | null;
    scoreComponents?: EvidenceScoreComponent[];
  },
): AssociationClaim {
  const evidenceClass = partial.evidenceClass;
  return {
    source: partial.source,
    recordId: partial.recordId ?? null,
    claim: partial.claim,
    subject: isClaimEntity(partial.subject) ? partial.subject : null,
    object: isClaimEntity(partial.object) ? partial.object : null,
    scoreComponents: Array.isArray(partial.scoreComponents) ? partial.scoreComponents : [],
    taxon: partial.taxon,
    species: partial.species || SPECIES_LABEL[partial.taxon] || SPECIES_LABEL.unspecified,
    evidenceClass,
    evidenceType: partial.evidenceType,
    evidenceStrength: partial.evidenceStrength,
    releaseVersion: partial.releaseVersion ?? null,
    referenceAssembly: partial.referenceAssembly ?? null,
    // Never substitute the claim-construction date for an upstream retrieval.
    retrievalDate: partial.retrievalDate ?? null,
    directLink: safeExternalHttpUrl(partial.directLink),
    isAiLead: partial.isAiLead ?? evidenceClass === 'ai_lead',
  };
}

/** Build the AI-lead claim that must accompany every untrusted model suggestion. */
export function aiLeadClaim(symbol: string, phenotypeQuery: string): AssociationClaim {
  return createAssociationClaim({
    source: 'GeneMap AI candidate generator',
    recordId: null,
    claim: `${symbol} is an AI-suggested candidate lead for follow-up research related to "${phenotypeQuery}"`,
    taxon: '9606',
    evidenceClass: 'ai_lead',
    evidenceType: 'model_suggestion',
    evidenceStrength: 'lead',
    releaseVersion: 'publication-task/candidate_gene_research@1',
    retrievalDate: null,
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
  sourceVersion?: string | null;
  retrievalDate?: string | null;
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
    // A genome assembly is not a database release. Record the assembly in its
    // own field and leave source release/version unknown unless the adapter
    // supplies an actual dataset or service release identifier.
    releaseVersion: input.sourceVersion ?? null,
    referenceAssembly: input.genomeBuild ?? null,
    retrievalDate: input.retrievalDate ?? null,
    directLink: link,
    isAiLead: false,
  });
}

/** HPO phenotype term claim, limited to ontology-term verification. */
export function hpoPhenotypeClaim(input: {
  geneSymbol: string;
  phenotypeName: string;
  hpoId: string;
  retrievalDate?: string | null;
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
    releaseVersion: null,
    retrievalDate: input.retrievalDate ?? null,
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
  retrievalDate?: string | null;
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
    retrievalDate: input.retrievalDate ?? null,
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

/** Classify a provenance row without presenting identity metadata as an association. */
export function claimProvenanceRole(claim: AssociationClaim): ClaimProvenanceRole {
  if (claim.isAiLead || claim.evidenceClass === 'ai_lead') return 'ai_candidate_lead';
  return claimSortKey(claim) > 0 ? 'association_evidence' : 'source_metadata';
}

/**
 * Resolve the ranking basis used by cards, printable reports, and copied text.
 * Metadata-only claims never upgrade an AI candidate to verified association.
 */
export function deriveRankingBasisFromClaims(
  claims: AssociationClaim[] | null | undefined,
): EvidenceClass {
  let bestClass: EvidenceClass = 'ai_lead';
  let bestScore = 0;
  for (const claim of claims || []) {
    const score = claimSortKey(claim);
    if (score > bestScore) {
      bestScore = score;
      bestClass = claim.evidenceClass;
    }
  }
  return bestClass;
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

/**
 * Partition only genuine association evidence into species/computational buckets.
 * Identity, ontology, and follow-up rows remain source metadata even when their
 * evidenceClass or taxon looks human. `external` is retained as a compatibility
 * subset of metadata so existing UI notes can identify follow-up links without
 * ever counting them as human or other association evidence.
 */
export function partitionClaimsBySpecies(claims: AssociationClaim[]) {
  const human: AssociationClaim[] = [];
  const animal: AssociationClaim[] = [];
  const computational: AssociationClaim[] = [];
  const literature: AssociationClaim[] = [];
  const aiLeads: AssociationClaim[] = [];
  const external: AssociationClaim[] = [];
  const metadata: AssociationClaim[] = [];

  for (const claim of claims || []) {
    const role = claimProvenanceRole(claim);
    if (role === 'ai_candidate_lead') {
      aiLeads.push(claim);
      continue;
    }
    if (role === 'source_metadata') {
      metadata.push(claim);
      if (claim.evidenceClass === 'external_followup') external.push(claim);
      continue;
    }
    if (claim.evidenceClass === 'animal_model' || claim.taxon === '10090') animal.push(claim);
    else if (claim.evidenceClass === 'computational') computational.push(claim);
    else if (claim.evidenceClass === 'literature') literature.push(claim);
    else human.push(claim);
  }

  return { human, animal, computational, literature, aiLeads, external, metadata };
}