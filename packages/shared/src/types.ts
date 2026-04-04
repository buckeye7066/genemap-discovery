// ─── Core User Types ────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  role: string;
  entitlements?: {
    isPremium: boolean;
    licenseInfo: {
      organizationName: string;
      licenseType: string;
    } | null;
  };
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
  priceId?: string;
  plan?: 'monthly' | 'yearly';
  successUrl: string;
  cancelUrl: string;
  _selfTest?: boolean;
}

export interface PortalSessionRequest {
  returnUrl: string;
  _selfTest?: boolean;
}

export interface InstitutionalCheckoutRequest {
  organizationName: string;
  contactEmail: string;
  licenseType: 'team' | 'department' | 'enterprise';
  billing: 'monthly' | 'yearly';
  seats: number;
  successUrl: string;
  cancelUrl: string;
  _selfTest?: boolean;
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
  name: string;
  description?: string;
}

export interface ExplanationRequest {
  topic: string;
  level?: string;
}

export interface ImageGenerationRequest {
  prompt: string;
  style?: string;
}

export interface QuizRequest {
  topic: string;
  count?: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  assistantType?: string;
}

export interface LearningProgress {
  topicId: string;
  progress: number;
  completedAt?: string;
}

// ─── LLM Types ──────────────────────────────────────────────────────────────

export interface LLMOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  [key: string]: unknown;
}

export interface LLMResponse {
  text: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

// ─── Search History ─────────────────────────────────────────────────────────

export interface SearchHistoryEntry {
  id?: string;
  query: string;
  timestamp?: string;
  resultCount?: number;
}

// ─── User Activity ──────────────────────────────────────────────────────────

export interface ActivityEntry {
  id?: string;
  action: string;
  details?: Record<string, unknown>;
  timestamp?: string;
}

// ─── Medical Data ───────────────────────────────────────────────────────────

export interface MedicalData {
  id?: string;
  dataType: string;
  content: unknown;
  createdAt?: string;
}

// ─── Conversations ──────────────────────────────────────────────────────────

export interface Conversation {
  id?: string;
  assistantType: string;
  title?: string;
  messages: ChatMessage[];
  createdAt?: string;
  updatedAt?: string;
}

// ─── Gene Sets ──────────────────────────────────────────────────────────────

export interface GeneSet {
  id?: string;
  name: string;
  description?: string;
  genes: string[];
  createdAt?: string;
}

// ─── Research Projects ──────────────────────────────────────────────────────

export interface Project {
  id?: string;
  title: string;
  description?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
}

export interface Collaborator {
  id?: string;
  email: string;
  role?: string;
}

// ─── Messages ───────────────────────────────────────────────────────────────

export interface Message {
  id?: string;
  subject?: string;
  body: string;
  status?: string;
  createdAt?: string;
}

// ─── Institutional Licenses ─────────────────────────────────────────────────

export interface License {
  id: string;
  organizationName: string;
  licenseType: string;
  seats: number;
  usedSeats: number;
}

export interface LicenseSeatAssignment {
  id?: string;
  email: string;
  assignedAt?: string;
}

// ─── Genomics Types ─────────────────────────────────────────────────────────

export interface GeneInfo {
  symbol: string;
  name?: string;
  chromosome?: string;
  description?: string;
  [key: string]: unknown;
}

export interface Variant {
  id: string;
  gene?: string;
  significance?: string;
  [key: string]: unknown;
}

export interface ClinVarResult {
  id: string;
  gene?: string;
  condition?: string;
  significance?: string;
  [key: string]: unknown;
}

export interface PhenotypeResult {
  id: string;
  name: string;
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

// ─── Consent & HIPAA ────────────────────────────────────────────────────────

export interface ConsentRecord {
  id?: string;
  consentType: string;
  version: string;
  granted: boolean;
  timestamp?: string;
}

export interface DataDeletionRequest {
  deletedTypes?: string[];
  [key: string]: unknown;
}

export interface DeletionRequestStatus {
  status: string;
  requestedAt?: string;
  completedAt?: string;
}

// ─── Annotations ────────────────────────────────────────────────────────────

export interface Annotation {
  id?: string;
  projectId: string;
  content: string;
  type?: string;
  createdAt?: string;
  updatedAt?: string;
}

// ─── Admin Types ────────────────────────────────────────────────────────────

export interface AdminAnalytics {
  totalUsers: number;
  premiumUsers: number;
  [key: string]: unknown;
}

export interface BannedUser {
  id: string;
  email: string;
  reason?: string;
  bannedAt?: string;
}

export interface PreBanRequest {
  email?: string;
  identifier?: string;
  reason: string;
}

export interface UnbanOptions {
  preBanId?: string;
  isPreBanned?: boolean;
}

// ─── Generic API Types ──────────────────────────────────────────────────────

export interface ApiRequestOptions extends RequestInit {
  headers?: Record<string, string>;
}
