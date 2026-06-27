import type {
  ApiRequestOptions,
  User,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  PortalSessionRequest,
  PortalSessionResponse,
  InstitutionalCheckoutRequest,
  TopicCategory,
  ExplanationRequest,
  ImageGenerationRequest,
  QuizRequest,
  ChatRequest,
  LearningProgress,
  LLMOptions,
  LLMResponse,
  LLMImageResponse,
  SearchHistoryEntry,
  ActivityEntry,
  MedicalData,
  Conversation,
  GeneSet,
  Project,
  ProjectVersion,
  Collaborator,
  Message,
  License,
  LicenseSeatAssignment,
  GeneInfo,
  Variant,
  ClinVarResult,
  PhenotypeResult,
  ClinicalTrialSearchParams,
  ClinicalTrialSearchResponse,
  ClinicalTrialDetailResponse,
  VcfParsedVariant,
  VcfParseResponse,
  VcfEnrichmentResponse,
  ConsentRecord,
  DataDeletionRequest,
  DeletionRequestStatus,
  Annotation,
  AdminAnalytics,
  BannedUser,
  PreBanRequest,
  UnbanOptions,
} from './types.js';

/**
 * Resolve the API base URL.
 *
 *  1. `VITE_API_URL` if injected by the bundler (Vite production builds bake
 *     the value at build time, so this is preferred when available).
 *  2. `http://localhost:3000` when the SPA is served from localhost.
 *  3. Empty string ("") for production deploys where a reverse proxy /
 *     Vercel rewrite forwards `/api/*` and `/auth/*` to the API. We do NOT
 *     hard-code `/api` here because rewriting that consistently across
 *     every endpoint requires per-deploy proxy config.
 *
 * Override at runtime by passing a baseURL to the ApiClient constructor.
 */
function resolveDefaultBaseURL(): string {
  // Vite injects import.meta.env at build time; guard against non-browser
  // environments (Node tests) where import.meta.env is undefined.
  let envApiUrl: string | undefined;
  try {
    // @ts-expect-error -- Vite-specific augmentation is not in tsconfig.
    envApiUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
  } catch {
    envApiUrl = undefined;
  }

  if (envApiUrl) return envApiUrl;

  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return 'http://localhost:3000';
    }
    // Production: assume same-origin proxy. Empty string keeps fetch URLs
    // relative ("/auth/me") so the browser sends them to the same host.
    return '';
  }

  return 'http://localhost:3000';
}

const DEFAULT_BASE_URL = resolveDefaultBaseURL();

/**
 * Read the CSRF token from the non-HttpOnly cookie set by the API on
 * every authenticated GET response (see services/api/src/middleware/csrf.js).
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Typed API error that preserves HTTP status and any structured `code` /
 * `details` from the backend. Replaces the previous `new Error(message)`
 * which discarded everything AuthContext wanted to inspect.
 */
export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export class ApiClient {
  baseURL: string;

  constructor(baseURL: string = DEFAULT_BASE_URL) {
    this.baseURL = baseURL;
  }

  async request<T = unknown>(path: string, options: ApiRequestOptions = {}): Promise<T> {
    const url = `${this.baseURL}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string> | undefined),
    };

    const method = (options.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      const csrf = getCsrfToken();
      if (csrf) {
        headers['X-CSRF-Token'] = csrf;
      }
    }

    const config: RequestInit = {
      ...options,
      credentials: 'include',
      headers,
    };

    const response = await fetch(url, config);
    if (!response.ok) {
      const body: { error?: string; code?: string; details?: unknown } =
        await response.json().catch(() => ({}));
      throw new ApiError(
        body.error || `Request failed with status ${response.status}`,
        response.status,
        body.code,
        body.details
      );
    }

    // 204 No Content: callers expect undefined. Avoid response.json() throw.
    if (response.status === 204) return undefined as T;

    return (await response.json()) as T;
  }

  // ─── Auth ────────────────────────────────────────────────────────
  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  }
  login(data: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }
  logout(): Promise<{ success: boolean }> {
    return this.request('/auth/logout', { method: 'POST' });
  }
  getMe(): Promise<User> {
    return this.request('/auth/me');
  }
  updateProfile(data: Partial<User>): Promise<User> {
    return this.request('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  }

  // ─── Billing ───────────────────────────────────────────────────────
  createCheckoutSession(data: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/checkout-session', { method: 'POST', body: JSON.stringify(data) });
  }
  createPortalSession(data: PortalSessionRequest): Promise<PortalSessionResponse> {
    return this.request('/billing/portal-session', { method: 'POST', body: JSON.stringify(data) });
  }
  createInstitutionalCheckout(data: InstitutionalCheckoutRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/institutional-checkout', { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── Education ──────────────────────────────────────────────────────
  async getTopics(): Promise<TopicCategory[]> {
    const res = await this.request<{ categories: TopicCategory[] }>('/education/topics');
    return res.categories;
  }
  getExplanation(data: ExplanationRequest): Promise<{
    explanation: string;
    topic: string;
    level: string;
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/explain', { method: 'POST', body: JSON.stringify(data) });
  }
  generateImage(data: ImageGenerationRequest): Promise<{
    imageUrl: string;
    revisedPrompt?: string;
    topic: string;
    level: string;
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/image', { method: 'POST', body: JSON.stringify(data) });
  }
  generateQuiz(data: QuizRequest): Promise<{
    questions: unknown[];
    topic: string;
    level: string;
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/quiz', { method: 'POST', body: JSON.stringify(data) });
  }
  chat(data: ChatRequest): Promise<{
    response: string;
    role: 'assistant';
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/chat', { method: 'POST', body: JSON.stringify(data) });
  }
  getLearningProgress(): Promise<{ sessions: unknown[]; progress: LearningProgress[] }> {
    return this.request('/education/progress');
  }
  getEducationEntitlements(): Promise<unknown> {
    return this.request('/education/entitlements');
  }
  updateLearningProgress(data: Partial<LearningProgress>): Promise<LearningProgress> {
    return this.request('/education/progress', { method: 'POST', body: JSON.stringify(data) });
  }

  // ─── LLM ───────────────────────────────────────────────────────────
  invokeLLM(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    return this.request('/llm/invoke', { method: 'POST', body: JSON.stringify({ prompt, options }) });
  }
  llmChat(messages: Array<{ role: string; content: string }>, options: LLMOptions = {}): Promise<LLMResponse> {
    return this.request('/llm/chat', { method: 'POST', body: JSON.stringify({ messages, options }) });
  }
  llmImage(prompt: string, options: LLMOptions = {}): Promise<LLMImageResponse> {
    return this.request('/llm/image', { method: 'POST', body: JSON.stringify({ prompt, options }) });
  }

  // ─── Admin ───────────────────────────────────────────────
  async getUsers(params: Record<string, string> = {}): Promise<{
    users: User[];
    total: number;
    page: number;
    limit: number;
  }> {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/admin/users${qs ? `?${qs}` : ''}`);
  }
  async searchUsers(query: string): Promise<{ users: User[] }> {
    return this.request('/admin/search-users', { method: 'POST', body: JSON.stringify({ query }) });
  }
  async getBannedUsers(): Promise<{ bannedUsers: BannedUser[]; preBannedUsers: unknown[] }> {
    return this.request('/admin/banned');
  }
  banUser(userId: string, reason: string): Promise<{ success: boolean }> {
    return this.request('/admin/ban', { method: 'POST', body: JSON.stringify({ userId, reason }) });
  }
  unbanUser(userId: string, { preBanId, isPreBanned }: UnbanOptions = {}): Promise<{ success: boolean }> {
    return this.request('/admin/unban', { method: 'POST', body: JSON.stringify({ userId, preBanId, isPreBanned }) });
  }
  preBanUser(data: PreBanRequest): Promise<{ success: boolean }> {
    return this.request('/admin/pre-ban', { method: 'POST', body: JSON.stringify(data) });
  }
  grantPremium(userId: string): Promise<{ success: boolean }> {
    return this.request('/admin/grant-premium', { method: 'POST', body: JSON.stringify({ userId }) });
  }
  grantFreePeriod(
    userId: string,
    period: 'week' | 'month'
  ): Promise<{ success: boolean; period: string; currentPeriodEnd: string }> {
    return this.request('/admin/grant-free-period', {
      method: 'POST',
      body: JSON.stringify({ userId, period }),
    });
  }
  grantFreePeriodAll(
    period: 'week' | 'month'
  ): Promise<{ success: boolean; scope: 'all'; period: string; extended: number; created: number; total: number }> {
    return this.request('/admin/grant-free-period', {
      method: 'POST',
      body: JSON.stringify({ scope: 'all', period }),
    });
  }
  revokeFreePeriod(userId: string): Promise<{ success: boolean; revoked: number }> {
    return this.request('/admin/revoke-free-period', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }
  revokeFreePeriodAll(): Promise<{ success: boolean; scope: 'all'; revoked: number }> {
    return this.request('/admin/revoke-free-period', {
      method: 'POST',
      body: JSON.stringify({ scope: 'all' }),
    });
  }
  grantAdmin(userId: string): Promise<{ success: boolean }> {
    return this.request('/admin/grant-admin', { method: 'POST', body: JSON.stringify({ userId }) });
  }
  getAdminAnalytics(): Promise<AdminAnalytics> {
    return this.request('/admin/analytics');
  }
  async getAdminMessages(params: Record<string, string> = {}): Promise<{ messages: Message[] }> {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/admin/messages${qs ? `?${qs}` : ''}`);
  }
  replyToMessage(messageId: string, body: string): Promise<{ reply: Message }> {
    return this.request(`/admin/messages/${messageId}/reply`, { method: 'POST', body: JSON.stringify({ body }) });
  }
  closeMessage(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/messages/${messageId}/close`, { method: 'POST' });
  }
  deleteUser(userId: string): Promise<{ success: boolean }> {
    return this.request(`/admin/users/${userId}`, { method: 'DELETE' });
  }

  // ─── Search History ─────────────────
  async getSearchHistory(): Promise<SearchHistoryEntry[]> {
    const res = await this.request<{ entries: SearchHistoryEntry[] }>('/entities/search-history');
    return res.entries;
  }
  async saveSearchHistory(data: Omit<SearchHistoryEntry, 'id'>): Promise<SearchHistoryEntry> {
    const res = await this.request<{ entry: SearchHistoryEntry }>('/entities/search-history', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.entry;
  }
  deleteSearchHistory(id?: string): Promise<{ success: boolean }> {
    return this.request(`/entities/search-history${id ? `/${id}` : ''}`, { method: 'DELETE' });
  }

  // ─── User Activity ─────────────────
  async getUserActivity(): Promise<ActivityEntry[]> {
    const res = await this.request<{ entries: ActivityEntry[] }>('/entities/activity');
    return res.entries;
  }
  async logActivity(data: Omit<ActivityEntry, 'id'>): Promise<ActivityEntry> {
    const res = await this.request<{ entry: ActivityEntry }>('/entities/activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.entry;
  }

  // ─── Medical Data ─────────────────
  async getMedicalData(dataType?: string): Promise<MedicalData[]> {
    const qs = dataType ? `?dataType=${encodeURIComponent(dataType)}` : '';
    const res = await this.request<{ records: MedicalData[] }>(`/entities/medical-data${qs}`);
    return res.records;
  }
  async saveMedicalData(data: Omit<MedicalData, 'id'>): Promise<MedicalData> {
    const res = await this.request<{ record: MedicalData }>('/entities/medical-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.record;
  }
  deleteMedicalData(id: string): Promise<{ success: boolean }> {
    return this.request(`/entities/medical-data/${id}`, { method: 'DELETE' });
  }

  // ─── AI Conversations ─────────────────
  async getConversations(assistantType?: string): Promise<Conversation[]> {
    const qs = assistantType ? `?assistantType=${encodeURIComponent(assistantType)}` : '';
    const res = await this.request<{ conversations: Conversation[] }>(`/entities/conversations${qs}`);
    return res.conversations;
  }
  async saveConversation(data: Omit<Conversation, 'id'>): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>('/entities/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.conversation;
  }
  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    const res = await this.request<{ conversation: Conversation }>(`/entities/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.conversation;
  }

  // ─── Gene Sets ──────────────────
  async getGeneSets(): Promise<GeneSet[]> {
    const res = await this.request<{ sets: GeneSet[] }>('/entities/gene-sets');
    return res.sets;
  }
  async saveGeneSet(data: Omit<GeneSet, 'id'>): Promise<GeneSet> {
    const res = await this.request<{ set: GeneSet }>('/entities/gene-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.set;
  }
  async updateGeneSet(id: string, data: Partial<GeneSet>): Promise<GeneSet> {
    const res = await this.request<{ set: GeneSet }>(`/entities/gene-sets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.set;
  }
  deleteGeneSet(id: string): Promise<{ success: boolean }> {
    return this.request(`/entities/gene-sets/${id}`, { method: 'DELETE' });
  }

  // ─── Research Projects ─────────────────
  async getProjects(): Promise<Project[]> {
    const res = await this.request<{ projects: Project[] }>('/entities/projects');
    return res.projects;
  }
  async createProject(data: Omit<Project, 'id'>): Promise<Project> {
    const res = await this.request<{ project: Project }>('/entities/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.project;
  }
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    const res = await this.request<{ project: Project }>(`/entities/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.project;
  }
  deleteProject(id: string): Promise<{ success: boolean }> {
    return this.request(`/entities/projects/${id}`, { method: 'DELETE' });
  }
  async getProjectVersions(projectId: string): Promise<ProjectVersion[]> {
    const res = await this.request<{ versions: ProjectVersion[] }>(`/entities/projects/${projectId}/versions`);
    return res.versions;
  }
  async addCollaborator(projectId: string, data: Collaborator): Promise<Collaborator> {
    const res = await this.request<{ collaborator: Collaborator }>(
      `/entities/projects/${projectId}/collaborators`,
      { method: 'POST', body: JSON.stringify(data) }
    );
    return res.collaborator;
  }
  removeCollaborator(projectId: string, collabId: string): Promise<{ success: boolean }> {
    return this.request(`/entities/projects/${projectId}/collaborators/${collabId}`, { method: 'DELETE' });
  }

  // ─── Messages ─────────────────
  async getMyMessages(): Promise<Message[]> {
    const res = await this.request<{ messages: Message[] }>('/entities/messages');
    return res.messages;
  }
  async sendMessage(data: Omit<Message, 'id'>): Promise<Message> {
    const res = await this.request<{ message: Message }>('/entities/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.message;
  }

  // ─── Institutional Licenses ──────────────────
  async getMyLicenses(): Promise<License[]> {
    const res = await this.request<{ licenses: License[] }>('/entities/licenses');
    return res.licenses;
  }
  async assignLicenseSeat(
    licenseId: string,
    data: Omit<LicenseSeatAssignment, 'id'>
  ): Promise<LicenseSeatAssignment> {
    const res = await this.request<{ assignment: LicenseSeatAssignment }>(
      `/entities/licenses/${licenseId}/assign`,
      { method: 'POST', body: JSON.stringify(data) }
    );
    return res.assignment;
  }
  removeLicenseSeat(licenseId: string, assignmentId: string): Promise<{ success: boolean }> {
    return this.request(`/entities/licenses/${licenseId}/assignments/${assignmentId}`, { method: 'DELETE' });
  }

  // ─── Genomic Databases ───────────────
  lookupVariant(variantId: string): Promise<Variant> {
    return this.request(`/genomics/variant/${encodeURIComponent(variantId)}`);
  }
  searchVariants(query: string): Promise<{ hits?: Variant[] } | Variant[]> {
    return this.request(`/genomics/variant/search?q=${encodeURIComponent(query)}`);
  }
  lookupGene(symbol: string): Promise<GeneInfo> {
    return this.request(`/genomics/gene/${encodeURIComponent(symbol)}`);
  }
  searchClinVar(query: string): Promise<{ esearchresult?: { idlist?: string[] } } | ClinVarResult[]> {
    return this.request(`/genomics/clinvar/search?q=${encodeURIComponent(query)}`);
  }
  searchPhenotypes(query: string): Promise<{ terms?: PhenotypeResult[] } | PhenotypeResult[]> {
    return this.request(`/genomics/phenotype/search?q=${encodeURIComponent(query)}`);
  }
  parseVcf(text: string, maxVariants?: number): Promise<VcfParseResponse> {
    return this.request('/genomics/vcf/parse', {
      method: 'POST',
      body: JSON.stringify({ text, maxVariants }),
    });
  }
  enrichVcfVariants(variants: VcfParsedVariant[]): Promise<VcfEnrichmentResponse> {
    return this.request('/genomics/vcf/enrich', {
      method: 'POST',
      body: JSON.stringify({ variants }),
    });
  }

  // ─── Clinical Trials ────────────────
  searchClinicalTrials(params: ClinicalTrialSearchParams = {}): Promise<ClinicalTrialSearchResponse> {
    const qs = new URLSearchParams();
    if (params.condition) qs.set('condition', params.condition);
    if (params.gene) qs.set('gene', params.gene);
    if (params.status) qs.set('status', params.status);
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return this.request(`/clinical-trials/search?${qs.toString()}`);
  }
  getClinicalTrial(nctId: string): Promise<ClinicalTrialDetailResponse> {
    return this.request(`/clinical-trials/${encodeURIComponent(nctId)}`);
  }

  // ─── Consent & HIPAA Compliance ───────────────
  async recordConsent(data: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const res = await this.request<{ record: ConsentRecord }>('/entities/consent', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.record;
  }
  async getConsentRecords(): Promise<ConsentRecord[]> {
    const res = await this.request<{ records: ConsentRecord[] }>('/entities/consent');
    return res.records;
  }
  async requestDataDeletion(data: DataDeletionRequest = {}): Promise<{ request: { id: string } }> {
    return this.request('/entities/data-deletion-request', { method: 'POST', body: JSON.stringify(data) });
  }
  async getDeletionRequestStatus(): Promise<DeletionRequestStatus[]> {
    const res = await this.request<{ requests: DeletionRequestStatus[] }>(
      '/entities/data-deletion-request'
    );
    return res.requests;
  }

  // ─── Project Annotations (Collaboration) ───────────
  async getProjectAnnotations(projectId: string, params: Record<string, string> = {}): Promise<Annotation[]> {
    const qs = new URLSearchParams(params).toString();
    const res = await this.request<{ annotations: Annotation[] }>(
      `/entities/projects/${projectId}/annotations${qs ? `?${qs}` : ''}`
    );
    return res.annotations;
  }
  async createAnnotation(projectId: string, data: Omit<Annotation, 'id' | 'projectId'>): Promise<Annotation> {
    const res = await this.request<{ annotation: Annotation }>(
      `/entities/projects/${projectId}/annotations`,
      { method: 'POST', body: JSON.stringify(data) }
    );
    return res.annotation;
  }
  async updateAnnotation(
    projectId: string,
    annotationId: string,
    data: Partial<Annotation>
  ): Promise<Annotation> {
    const res = await this.request<{ annotation: Annotation }>(
      `/entities/projects/${projectId}/annotations/${annotationId}`,
      { method: 'PUT', body: JSON.stringify(data) }
    );
    return res.annotation;
  }
  deleteAnnotation(projectId: string, annotationId: string): Promise<{ success: boolean }> {
    return this.request(`/entities/projects/${projectId}/annotations/${annotationId}`, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
