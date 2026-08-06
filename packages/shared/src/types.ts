// ─── Core User Types ────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin' | 'super_admin';

export interface UserEntitlements {
  isPremium: boolean;
  isAdmin: boolean;
  licenseInfo: {
    organizationName: string;
    licenseType: string;
  } | null;
}

export interface User {
  id: string;
  email: string;
  role: UserRole;
  display_name?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
  education_level?: string | null;
  demographics_collected?: boolean;
  banned?: boolean;
  ban_reason?: string | null;
  entitlements?: UserEntitlements;
}

// ─── Auth Request/Response Types ────────────────────────────────────────────

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  user: User;
  token?: string;
}

// ─── Billing Types ──────────────────────────────────────────────────────────

export interface CheckoutSessionRequest {
  plan?: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
}

export interface PortalSessionRequest {
  returnUrl: string;
}

export interface InstitutionalCheckoutRequest {
  organizationName: string;
  contactEmail: string;
  licenseType: 'team' | 'department' | 'enterprise';
  billing: 'monthly' | 'yearly';
  seats: number;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSessionResponse {
  url: string;
  sessionId: string;
}

export interface PortalSessionResponse {
  url: string;
}

// ─── Education Types ────────────────────────────────────────────────────────

export interface Topic {
  id: string;
  title: string;
  description?: string;
}

export interface TopicCategory {
  category: string;
  topics: Topic[];
}

export type EducationLevel =
  | 'elementary'
  | 'middle_school'
  | 'high_school'
  | 'undergraduate'
  | 'graduate'
  | 'postgraduate';

export interface ExplanationRequest {
  topic: string;
  level: EducationLevel | string;
}

/**
 * A curated, authoritative reference attached to an AI explanation. These are
 * real institutional links (verified server-side), not AI-generated citations.
 */
export interface EducationSource {
  label: string;
  url: string;
  publisher: string;
}

export interface ImageGenerationRequest {
  topic: string;
  level: EducationLevel | string;
}

export interface QuizRequest {
  topic: string;
  level: EducationLevel | string;
  questionCount?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

// User-facing chat messages may only be user/assistant; system prompts are
// supplied server-side. Callers should send only this restricted role set.
export interface UserChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/** Finite server-enforced intents available in the public education/research build. */
export type PublicationTask =
  | 'genetics_education'
  | 'aggregate_genomics_research'
  | 'candidate_gene_research'
  | 'research_hypothesis'
  | 'learning_activity_summary';

export type ResearchCohortClassification =
  | 'deidentified_aggregate'
  | 'synthetic'
  | 'public_dataset';

export type ResearchModality =
  | 'wes'
  | 'wgs'
  | 'rna_seq'
  | 'genotype'
  | 'phenotype'
  | 'cnv'
  | 'proteomics'
  | 'metabolomics'
  | 'epigenomics'
  | 'treatment_response';

export type ResearchObjective =
  | 'identify_variants'
  | 'association_analysis'
  | 'compare_cohorts'
  | 'multi_omic_hypothesis'
  | 'covariate_design'
  | 'cohort_summary';

/** Immutable, reviewed publication concept. Arbitrary client labels are never executable input. */
export interface CuratedPublicationConceptRef {
  kind: 'curated_concept';
  conceptId: string;
  canonicalLabel: string;
  conceptKind: 'disease' | 'phenotype';
  source: 'genemap_curated';
  version: 1;
}

/** Exact HPO identifier selected from a deterministic resolver/search result. */
export interface HpoPublicationReference {
  kind: 'hpo';
  identifier: string;
}

/** Exact MONDO disease identifier selected from Monarch and revalidated server-side. */
export interface MondoPublicationReference {
  kind: 'mondo';
  identifier: string;
}

export type PublicationResearchReference =
  | CuratedPublicationConceptRef
  | HpoPublicationReference
  | MondoPublicationReference;

export interface PublicationConceptSuggestion {
  kind: 'hpo' | 'mondo';
  identifier: string;
  canonicalLabel: string;
  source: 'NLM Clinical Tables HPO' | 'Monarch Initiative';
  /** Upstream HTTP API generation; this is not an ontology-data release identifier. */
  apiVersion: 'v3';
}

export interface AggregateResearchTaskInput {
  version: 1;
  cohort: {
    sampleCount: number;
    classification: ResearchCohortClassification;
    hasControls: boolean;
  };
  modalities: ResearchModality[];
  objective: ResearchObjective;
  focus?: PublicationResearchReference;
}

export interface CandidateGeneTaskInput {
  version: 1;
  operation:
    | 'classify_and_suggest'
    | 'classify'
    | 'suggest_candidates'
    | 'gene_profile';
  query?: PublicationResearchReference;
  /** Server resolves this symbol against MyGene.info before any model call. */
  gene?: { symbol: string };
  audience?: 'general' | 'undergraduate' | 'graduate' | 'researcher' | 'medical_researcher';
}

export interface LearningActivityTaskInput {
  version: 1;
  educationLevel: EducationLevel;
  recentGenes: string[];
  recentConcepts: PublicationResearchReference[];
}

export interface GeneticsTutorTaskInput {
  version: 1;
  topic: string;
  level: EducationLevel;
  interaction:
    | 'explain_another_way'
    | 'give_example'
    | 'compare_concepts'
    | 'check_understanding';
}

export type PublicationTaskInput =
  | AggregateResearchTaskInput
  | CandidateGeneTaskInput
  | LearningActivityTaskInput
  | GeneticsTutorTaskInput;

export type PublicationTaskRequest =
  | { publicationTask: 'aggregate_genomics_research'; taskInput: AggregateResearchTaskInput }
  | { publicationTask: 'research_hypothesis'; taskInput: AggregateResearchTaskInput }
  | { publicationTask: 'candidate_gene_research'; taskInput: CandidateGeneTaskInput }
  | { publicationTask: 'learning_activity_summary'; taskInput: LearningActivityTaskInput };

export interface ChatRequest {
  publicationTask: 'genetics_education';
  taskInput: GeneticsTutorTaskInput;
}

export interface LearningProgress {
  topicId: string;
  bestScore?: number;
  totalQuestions?: number;
  attempts?: number;
  score?: number;
}

// ─── LLM Types ──────────────────────────────────────────────────────────────

export interface LLMOptions {
  provider?: 'openai' | 'anthropic';
  model?: string;
  temperature?: number;
  maxTokens?: number;
  size?: string;
  quality?: string;
  /** Server-enforced intent for a publishable text-generation request. */
  publicationTask?: PublicationTask;
  /**
   * Calling persona id from the shared agent registry ('robert' | 'anastasia').
   * Sent as a sibling `agent` field on the request, not inside `options` — see
   * ApiClient#invokePublicationTask. Unknown ids are ignored server-side.
   */
  agent?: string;
}

// API actually returns { result, disclaimer } for /llm/* — fix the contract.
export interface LLMResponse {
  result: string;
  disclaimer: string;
}

export interface LLMImageResponse {
  result: { url?: string; revisedPrompt?: string };
  disclaimer: string;
}

// ─── Search History ─────────────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id?: string;
  query: string;
  queryType?: string;
  results?: unknown;
  createdAt?: string;
}

// ─── User Activity ──────────────────────────────────────────────────────────

export interface ActivityEntry {
  id?: string;
  activityType: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

// ─── Medical Data ───────────────────────────────────────────────────────────

export interface MedicalData {
  id?: string;
  dataType: string;
  title?: string | null;
  content: unknown;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

// ─── Conversations ──────────────────────────────────────────────────────────

export interface Conversation {
  id?: string;
  assistantType: string;
  title?: string;
  messages: ChatMessage[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Gene Sets ──────────────────────────────────────────────────────────────

export interface GeneSet {
  id?: string;
  name: string;
  description?: string;
  genes: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

// ─── Research Projects ──────────────────────────────────────────────────────

export interface Project {
  id?: string;
  title: string;
  description?: string;
  status?: string;
  genes?: string[];
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  version: number;
  changes: unknown;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface Collaborator {
  id?: string;
  userEmail: string;
  role?: string;
}

// ─── Messages ───────────────────────────────────────────────────────────────

export interface Message {
  id?: string;
  subject: string;
  body: string;
  category?: string;
  status?: string;
  createdAt?: string;
}

// ─── Institutional Licenses ─────────────────────────────────────────────────

export interface License {
  id: string;
  organizationName: string;
  licenseType: string;
  maxSeats: number;
  assignedSeats: number;
  status: string;
}

export interface LicenseSeatAssignment {
  id?: string;
  userEmail: string;
  department?: string | null;
  status?: string;
}

// ─── Genomics Types ─────────────────────────────────────────────────────────

export interface GeneInfo {
  symbol?: string;
  name?: string;
  chromosome?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Variant {
  id?: string;
  gene?: string;
  significance?: string;
  [key: string]: unknown;
}

export interface ClinVarResult {
  id?: string;
  gene?: string;
  condition?: string;
  significance?: string;
  [key: string]: unknown;
}

export interface PhenotypeResult {
  id?: string;
  name?: string;
  genes?: string[];
  [key: string]: unknown;
}

// ─── Clinical Trials ────────────────────────────────────────────────────────

export interface ClinicalTrialSearchParams {
  condition?: string;
  gene?: string;
  status?: string;
  pageSize?: number;
}

export interface ClinicalTrial {
  nctId: string;
  title: string;
  status?: string;
  conditions?: string[];
  [key: string]: unknown;
}

export interface ClinicalTrialSearchResponse {
  totalCount: number;
  studies: ClinicalTrial[];
}

export interface ClinicalTrialDetailResponse {
  study: ClinicalTrial;
}

export interface VcfParsedVariant {
  chromosome: string;
  position: number;
  id?: string | null;
  rsid?: string | null;
  referenceAllele: string;
  alternateAllele: string;
  ref: string;
  alt: string;
  quality?: number | null;
  filter?: string | null;
  info?: Record<string, unknown>;
  gene?: string | null;
  variantType: string;
  variant_type: string;
  genotype?: string | null;
  zygosity?: string | null;
  stableVariantKey: string;
  hgvs?: string;
  [key: string]: unknown;
}

export interface VcfParseResponse {
  variants: VcfParsedVariant[];
  summary: {
    totalVariants: number;
    total_variants: number;
    parsedVariants: number;
    parsed_variants: number;
    variantTypes: Record<string, number>;
    variant_types: Record<string, number>;
    truncated: boolean;
  };
  limits?: Record<string, number>;
}

export interface VcfEnrichment {
  originalVariant: VcfParsedVariant;
  original_variant: VcfParsedVariant;
  annotations: Record<string, unknown>;
  evidenceSummary: string;
  clinicalConfirmationRequired: boolean;
  questionsForClinician: string[];
  [key: string]: unknown;
}

export interface VcfEnrichmentResponse {
  enrichedVariants: VcfEnrichment[];
  enriched_variants: VcfEnrichment[];
}

export interface VcfCohortEnrichmentResponse {
  enrichedVariants: VcfEnrichment[];
  enriched_variants: VcfEnrichment[];
  /** Annotations keyed by stable variant key for re-joining cohort prevalence. */
  byKey: Record<string, VcfEnrichment>;
}

// ─── Consent & HIPAA ────────────────────────────────────────────────────────

export interface ConsentRecord {
  id?: string;
  consentType: string;
  version: string;
  granted: boolean;
  metadata?: Record<string, unknown> | null;
  createdAt?: string;
}

export interface DataDeletionRequest {
  deletedTypes?: string[];
}

export interface DeletionRequestStatus {
  status: string;
  requestedAt?: string;
  completedAt?: string;
}

// ─── Annotations ────────────────────────────────────────────────────────────

export interface Annotation {
  id?: string;
  projectId?: string;
  targetType: string;
  targetId: string;
  content: string;
  parentId?: string | null;
  resolved?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Admin Types ────────────────────────────────────────────────────────────

export interface AdminAnalyticsStats {
  totalUsers: number;
  activeSubscriptions: number;
  totalSearches: number;
  totalGeneSets: number;
  totalActivities: number;
}

export type AdminActivityCategory = 'page_view' | 'gene_view' | 'other';

export type AdminSearchCategory = 'free' | 'premium' | 'general' | 'other';

export interface AdminActivityTypeCount {
  activityType: AdminActivityCategory;
  count: number;
}

export interface AdminSearchTypeCount {
  queryType: AdminSearchCategory;
  count: number;
}

export interface AdminDailyActivity {
  /** UTC calendar date in YYYY-MM-DD form. */
  date: string;
  activities: number;
  searches: number;
}

/**
 * Aggregate-only administrator metrics. This contract deliberately cannot
 * carry raw query text, record contents, activity metadata, or user identity.
 */
export interface AdminAnalytics {
  stats: AdminAnalyticsStats;
  activityTypeBreakdown: AdminActivityTypeCount[];
  searchTypeBreakdown: AdminSearchTypeCount[];
  dailyActivity: AdminDailyActivity[];
}

// The admin API emits the same snake_case contract as /auth/me (a Base44
// legacy convention the whole web app is built on). Pre-banned records are
// returned in this same shape, flagged `pre_banned`.
export interface BannedUser {
  id: string;
  email: string | null;
  role?: string;
  banned?: boolean;
  display_name?: string | null;
  full_name?: string | null;
  phone_number?: string | null;
  ban_reason?: string | null;
  banned_date?: string | null;
  banned_by?: string | null;
  created_date?: string | null;
  last_active?: string | null;
  pre_banned?: boolean;
}

// Authoritative gene record resolved from MyGene.info (Ensembl/NCBI) by
// POST /genomics/enrich. `verified` is true only when real coordinates were
// resolved; the gene-search UI replaces LLM guesses with these and labels them.
export interface AuthoritativeGeneRecord {
  symbol: string;
  name: string | null;
  entrezId: string | null;
  ensemblId: string | null;
  chromosome: string | null;
  start: number | null;
  end: number | null;
  genomeBuild: string;
  mapLocation: string | null;
  summary: string | null;
  source: string;
  verified: boolean;
}

export interface PreBanRequest {
  email?: string;
  phoneNumber?: string;
  fullName?: string;
  reason?: string;
}

export interface UnbanOptions {
  preBanId?: string;
  isPreBanned?: boolean;
}

// ─── Generic API Types ──────────────────────────────────────────────────────

export interface ApiRequestOptions extends RequestInit {
  headers?: Record<string, string>;
  /**
   * Abort the request after this many ms. Without it a stalled upstream (e.g.
   * a slow LLM call behind a dead connection) leaves the browser's fetch
   * pending forever — the "perpetual spinner" users saw on gene search. 0
   * disables the timeout. Defaults to ApiClient's DEFAULT_REQUEST_TIMEOUT_MS.
   */
  timeoutMs?: number;
}

// ─── Envelope helpers (used internally by ApiClient) ────────────────────────

export interface UsersListResponse {
  users: BannedUser[] | User[];
  total?: number;
  page?: number;
  limit?: number;
}
