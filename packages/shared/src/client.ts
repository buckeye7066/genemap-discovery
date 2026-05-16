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
  Topic,
  ExplanationRequest,
  ImageGenerationRequest,
  QuizRequest,
  ChatRequest,
  LearningProgress,
  LLMOptions,
  LLMResponse,
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
  ClinicalTrial,
  ConsentRecord,
  DataDeletionRequest,
  DeletionRequestStatus,
  Annotation,
  AdminAnalytics,
  BannedUser,
  PreBanRequest,
  UnbanOptions,
} from './types.js';

// Determine a sensible base URL automatically.  In development the API runs
// on port 3000 with the Vite dev server on 5173.  In production the API
// is typically mounted at `/api` relative to the web app.  Consumers may
// override this by passing a custom baseURL into the ApiClient constructor.
const DEFAULT_BASE_URL = typeof window !== 'undefined'
  ? (window.location.hostname === 'localhost' ? 'http://localhost:3000' : '/api')
  : 'http://localhost:3000';

/**
 * Attempt to read the CSRF token from cookies.  The backend issues a
 * cookie named `csrfToken` alongside authenticated responses.  When a
 * state‑changing request is made (POST/PUT/DELETE/PATCH), the token must
 * be sent back in the `X-CSRF-Token` header to satisfy Fastify's
 * double‑submit CSRF middleware.  If no token is present (e.g. first
 * page load, unauthenticated user) the header is omitted.
 */
function getCsrfToken(): string | null {
  if (typeof document === 'undefined') {
    return null;
  }
  const match = document.cookie.match(/(?:^|; )csrfToken=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
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
    // Inject the CSRF token on mutating requests.  We treat GET and HEAD
    // methods as safe.  Options without an explicit method default to
    // GET according to the fetch API.
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
      const error = await response.json().catch(() => ({ error: 'Request failed' }));
      throw new Error(error.error || `Request failed with status ${response.status}`);
    }
    return response.json() as Promise<T>;
  }

  // ─── Auth ────────────────────────────────────────────────────────
  async register(data: RegisterRequest): Promise<AuthResponse> {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async login(data: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async logout(): Promise<{ ok: boolean }> {
    return this.request('/auth/logout', {
      method: 'POST',
    });
  }
  async getMe(): Promise<User> {
    return this.request('/auth/me');
  }
  // ─── Billing ───────────────────────────────────────────────────────
  async createCheckoutSession(data: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/checkout-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async createPortalSession(data: PortalSessionRequest): Promise<PortalSessionResponse> {
    return this.request('/billing/portal-session', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async createInstitutionalCheckout(data: InstitutionalCheckoutRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/institutional-checkout', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  // ─── Education ──────────────────────────────────────────────────────
  async getTopics(): Promise<Topic[]> {
    return this.request('/education/topics');
  }
  async getExplanation(data: ExplanationRequest): Promise<{ explanation: string }> {
    return this.request('/education/explain', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async generateImage(data: ImageGenerationRequest): Promise<{ url: string }> {
    return this.request('/education/image', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async generateQuiz(data: QuizRequest): Promise<unknown> {
    return this.request('/education/quiz', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async chat(data: ChatRequest): Promise<{ reply: string }> {
    return this.request('/education/chat', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async getLearningProgress(): Promise<LearningProgress[]> {
    return this.request('/education/progress');
  }
  async getEducationEntitlements(): Promise<unknown> {
    return this.request('/education/entitlements');
  }
  async updateLearningProgress(data: Partial<LearningProgress>): Promise<LearningProgress> {
    return this.request('/education/progress', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  // ─── User Profile ───────────────────
  async updateProfile(data: Partial<User>): Promise<User> {
    return this.request('/auth/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  // ─── LLM ───────────────────
  async invokeLLM(prompt: string, options: LLMOptions = {}): Promise<LLMResponse> {
    return this.request('/llm/invoke', {
      method: 'POST',
      body: JSON.stringify({ prompt, options }),
    });
  }
  async llmChat(messages: Array<{ role: string; content: string }>, options: LLMOptions = {}): Promise<LLMResponse> {
    return this.request('/llm/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, options }),
    });
  }
  async llmImage(prompt: string, options: LLMOptions = {}): Promise<{ url: string }> {
    return this.request('/llm/image', {
      method: 'POST',
      body: JSON.stringify({ prompt, options }),
    });
  }
  // ─── Admin ───────────────────────────────────────────────
  async getUsers(params: Record<string, string> = {}): Promise<User[]> {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/admin/users${qs ? `?${qs}` : ''}`);
  }
  async searchUsers(query: string): Promise<User[]> {
    return this.request('/admin/search-users', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }
  async getBannedUsers(): Promise<BannedUser[]> {
    return this.request('/admin/banned');
  }
  async banUser(userId: string, reason: string): Promise<{ ok: boolean }> {
    return this.request('/admin/ban', {
      method: 'POST',
      body: JSON.stringify({ userId, reason }),
    });
  }
  async unbanUser(userId: string, { preBanId, isPreBanned }: UnbanOptions = {}): Promise<{ ok: boolean }> {
    return this.request('/admin/unban', {
      method: 'POST',
      body: JSON.stringify({ userId, preBanId, isPreBanned }),
    });
  }
  async preBanUser(data: PreBanRequest): Promise<{ ok: boolean }> {
    return this.request('/admin/pre-ban', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async grantPremium(userId: string): Promise<{ ok: boolean }> {
    return this.request('/admin/grant-premium', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }
  async grantAdmin(userId: string): Promise<{ ok: boolean }> {
    return this.request('/admin/grant-admin', {
      method: 'POST',
      body: JSON.stringify({ userId }),
    });
  }
  async getAdminAnalytics(): Promise<AdminAnalytics> {
    return this.request('/admin/analytics');
  }
  async getAdminMessages(params: Record<string, string> = {}): Promise<Message[]> {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/admin/messages${qs ? `?${qs}` : ''}`);
  }
  async replyToMessage(messageId: string, body: string): Promise<Message> {
    return this.request(`/admin/messages/${messageId}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }
  async closeMessage(messageId: string): Promise<{ ok: boolean }> {
    return this.request(`/admin/messages/${messageId}/close`, {
      method: 'POST',
    });
  }
  async deleteUser(userId: string): Promise<{ ok: boolean }> {
    return this.request(`/admin/users/${userId}`, {
      method: 'DELETE',
    });
  }
  // ─── Search History ─────────────────
  async getSearchHistory(): Promise<SearchHistoryEntry[]> {
    return this.request('/entities/search-history');
  }
  async saveSearchHistory(data: Omit<SearchHistoryEntry, 'id'>): Promise<SearchHistoryEntry> {
    return this.request('/entities/search-history', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async deleteSearchHistory(id?: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/search-history${id ? `/${id}` : ''}`, {
      method: 'DELETE',
    });
  }
  // ─── User Activity ─────────────────
  async getUserActivity(): Promise<ActivityEntry[]> {
    return this.request('/entities/activity');
  }
  async logActivity(data: Omit<ActivityEntry, 'id'>): Promise<ActivityEntry> {
    return this.request('/entities/activity', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  // ─── Medical Data ─────────────────
  async getMedicalData(dataType?: string): Promise<MedicalData[]> {
    const qs = dataType ? `?dataType=${dataType}` : '';
    return this.request(`/entities/medical-data${qs}`);
  }
  async saveMedicalData(data: Omit<MedicalData, 'id'>): Promise<MedicalData> {
    return this.request('/entities/medical-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async deleteMedicalData(id: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/medical-data/${id}`, {
      method: 'DELETE',
    });
  }
  // ─── AI Conversations ─────────────────
  async getConversations(assistantType?: string): Promise<Conversation[]> {
    const qs = assistantType ? `?assistantType=${assistantType}` : '';
    return this.request(`/entities/conversations${qs}`);
  }
  async saveConversation(data: Omit<Conversation, 'id'>): Promise<Conversation> {
    return this.request('/entities/conversations', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async updateConversation(id: string, data: Partial<Conversation>): Promise<Conversation> {
    return this.request(`/entities/conversations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  // ─── Gene Sets ──────────────────
  async getGeneSets(): Promise<GeneSet[]> {
    return this.request('/entities/gene-sets');
  }
  async saveGeneSet(data: Omit<GeneSet, 'id'>): Promise<GeneSet> {
    return this.request('/entities/gene-sets', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async updateGeneSet(id: string, data: Partial<GeneSet>): Promise<GeneSet> {
    return this.request(`/entities/gene-sets/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  async deleteGeneSet(id: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/gene-sets/${id}`, {
      method: 'DELETE',
    });
  }
  // ─── Research Projects ─────────────────
  async getProjects(): Promise<Project[]> {
    return this.request('/entities/projects');
  }
  async createProject(data: Omit<Project, 'id'>): Promise<Project> {
    return this.request('/entities/projects', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async updateProject(id: string, data: Partial<Project>): Promise<Project> {
    return this.request(`/entities/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  async deleteProject(id: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/projects/${id}`, {
      method: 'DELETE',
    });
  }
  async getProjectVersions(projectId: string): Promise<ProjectVersion[]> {
    return this.request(`/entities/projects/${projectId}/versions`);
  }
  async addCollaborator(projectId: string, data: Collaborator): Promise<Collaborator> {
    return this.request(`/entities/projects/${projectId}/collaborators`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async removeCollaborator(projectId: string, collabId: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/projects/${projectId}/collaborators/${collabId}`, {
      method: 'DELETE',
    });
  }
  // ─── Messages ─────────────────
  async getMyMessages(): Promise<Message[]> {
    return this.request('/entities/messages');
  }
  async sendMessage(data: Omit<Message, 'id'>): Promise<Message> {
    return this.request('/entities/messages', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  // ─── Institutional Licenses ──────────────────
  async getMyLicenses(): Promise<License[]> {
    return this.request('/entities/licenses');
  }
  async assignLicenseSeat(licenseId: string, data: Omit<LicenseSeatAssignment, 'id'>): Promise<LicenseSeatAssignment> {
    return this.request(`/entities/licenses/${licenseId}/assign`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async removeLicenseSeat(licenseId: string, assignmentId: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/licenses/${licenseId}/assignments/${assignmentId}`, {
      method: 'DELETE',
    });
  }
  // ─── Genomic Databases ───────────────
  async lookupVariant(variantId: string): Promise<Variant> {
    return this.request(`/genomics/variant/${encodeURIComponent(variantId)}`);
  }
  async searchVariants(query: string): Promise<Variant[]> {
    return this.request(`/genomics/variant/search?q=${encodeURIComponent(query)}`);
  }
  async lookupGene(symbol: string): Promise<GeneInfo> {
    return this.request(`/genomics/gene/${encodeURIComponent(symbol)}`);
  }
  async searchClinVar(query: string): Promise<ClinVarResult[]> {
    return this.request(`/genomics/clinvar/search?q=${encodeURIComponent(query)}`);
  }
  async searchPhenotypes(query: string): Promise<PhenotypeResult[]> {
    return this.request(`/genomics/phenotype/search?q=${encodeURIComponent(query)}`);
  }
  // ─── Clinical Trials ────────────────
  async searchClinicalTrials(params: ClinicalTrialSearchParams = {}): Promise<ClinicalTrial[]> {
    const qs = new URLSearchParams();
    if (params.condition) qs.set('condition', params.condition);
    if (params.gene) qs.set('gene', params.gene);
    if (params.status) qs.set('status', params.status);
    if (params.pageSize) qs.set('pageSize', String(params.pageSize));
    return this.request(`/clinical-trials/search?${qs.toString()}`);
  }
  async getClinicalTrial(nctId: string): Promise<ClinicalTrial> {
    return this.request(`/clinical-trials/${encodeURIComponent(nctId)}`);
  }
  // ─── Consent & HIPAA Compliance ───────────────
  async recordConsent(data: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    return this.request('/entities/consent', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async getConsentRecords(): Promise<ConsentRecord[]> {
    return this.request('/entities/consent');
  }
  async requestDataDeletion(data: DataDeletionRequest = {}): Promise<{ ok: boolean }> {
    return this.request('/entities/data-deletion-request', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async getDeletionRequestStatus(): Promise<DeletionRequestStatus> {
    return this.request('/entities/data-deletion-request');
  }
  // ─── Project Annotations (Collaboration) ───────────
  async getProjectAnnotations(projectId: string, params: Record<string, string> = {}): Promise<Annotation[]> {
    const qs = new URLSearchParams(params).toString();
    return this.request(`/entities/projects/${projectId}/annotations${qs ? `?${qs}` : ''}`);
  }
  async createAnnotation(projectId: string, data: Omit<Annotation, 'id' | 'projectId'>): Promise<Annotation> {
    return this.request(`/entities/projects/${projectId}/annotations`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }
  async updateAnnotation(projectId: string, annotationId: string, data: Partial<Annotation>): Promise<Annotation> {
    return this.request(`/entities/projects/${projectId}/annotations/${annotationId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
  async deleteAnnotation(projectId: string, annotationId: string): Promise<{ ok: boolean }> {
    return this.request(`/entities/projects/${projectId}/annotations/${annotationId}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
