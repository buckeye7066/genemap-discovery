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
  EducationSource,
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
  VcfCohortEnrichmentResponse,
  ConsentRecord,
  DataDeletionRequest,
  DeletionRequestStatus,
  Annotation,
  AdminAnalytics,
  BannedUser,
  PreBanRequest,
  UnbanOptions,
  AuthoritativeGeneRecord,
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
/**
 * Sanitize a base URL. Env values pasted into a .env file or a Railway/Vercel
 * dashboard field frequently pick up a trailing newline; left unstripped that
 * `\r\n` lands between the host and the path (e.g. `…railway.app\r\n/auth/me`),
 * which browsers handle inconsistently — sometimes 200, sometimes a silent
 * failure that resets the form. Strip ALL control characters (CR/LF/tab/etc.),
 * trim surrounding whitespace, and drop any trailing slash so `${base}${path}`
 * is always well-formed. Resilient even if a stray newline sneaks back in later.
 */
export function sanitizeBaseURL(raw: string | undefined | null): string {
  if (!raw) return '';
  return String(raw)
    // eslint-disable-next-line no-control-regex -- intentionally stripping CR/LF/control chars
    .replace(/[\u0000-\u001F\u007F]+/g, '')
    .trim()
    .replace(/\/+$/, '');
}

/**
 * Fields that belong INSIDE the encrypted `content` blob of a medical record.
 * Everything the Base44-era UI expects to read/write as a flat property is
 * packed here on write and spread back out on read.
 */
const MEDICAL_CONTENT_KEYS = [
  'summary',
  'relevant_genes',
  'phenotypes_identified',
  'extracted_data',
  'vcf_variants',
  'key_findings',
  'risks',
  'recommendations',
  'notes',
  'file_name',
] as const;

/** Translate a UI-shaped medical record into the backend contract. */
function toBackendMedicalPayload(ui: Record<string, unknown>): Record<string, unknown> {
  const dataType = (ui.dataType ?? ui.file_type ?? 'other') as string;
  const content: Record<string, unknown> = {};
  for (const key of MEDICAL_CONTENT_KEYS) {
    if (ui[key] !== undefined) content[key] = ui[key];
  }
  const payload: Record<string, unknown> = {
    dataType,
    title: (ui.title ?? null) as string | null,
    content,
    metadata: (ui.metadata ?? null) as unknown,
  };
  const fileUrl = ui.fileUrl ?? ui.file_url;
  if (fileUrl !== undefined) payload.fileUrl = fileUrl;
  return payload;
}

/**
 * Translate a backend medical record into the flat shape every UI consumer
 * (MedicalData, Anastasia, Dashboard, AIAssistants, comparison/clinical
 * components) reads. Tolerant of legacy rows where `content` is a raw string
 * or already-flattened.
 */
function normalizeMedicalRecord(rec: unknown): Record<string, unknown> {
  const r = (rec ?? {}) as Record<string, unknown>;
  const rawContent = r.content;
  const content: Record<string, unknown> =
    rawContent && typeof rawContent === 'object' && !Array.isArray(rawContent)
      ? (rawContent as Record<string, unknown>)
      : {};
  const dataType = (r.dataType ?? r.file_type ?? content.file_type ?? 'other') as string;
  return {
    ...content,
    id: r.id,
    dataType,
    file_type: dataType,
    title: (r.title ?? content.title ?? null) as unknown,
    file_url: (r.fileUrl ?? content.file_url ?? null) as unknown,
    created_date: (r.createdAt ?? content.created_date ?? null) as unknown,
    createdAt: (r.createdAt ?? null) as unknown,
    metadata: (r.metadata ?? null) as unknown,
    summary:
      (content.summary as string) ??
      (typeof rawContent === 'string' ? rawContent : '') ??
      '',
    relevant_genes: content.relevant_genes ?? [],
    phenotypes_identified: content.phenotypes_identified ?? [],
    extracted_data: content.extracted_data ?? {},
    vcf_variants: content.vcf_variants ?? null,
    notes: content.notes ?? '',
  };
}

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

  const cleanedEnv = sanitizeBaseURL(envApiUrl);
  if (cleanedEnv) return cleanedEnv;

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
 * CSRF token store.
 *
 * On a same-origin deployment the API's non-HttpOnly `csrfToken` cookie is
 * readable via document.cookie. On a cross-site deployment (Vercel web ↔
 * Railway API) that cookie lives on a different registrable domain and is
 * invisible to this JS, so the API also returns the token in auth response
 * bodies (login/register/refresh/me). We cache that value here — in memory,
 * mirrored to localStorage so it survives reloads — and prefer it over the
 * cookie. See services/api/src/middleware/csrf.js.
 */
const CSRF_STORAGE_KEY = 'genemap.csrfToken';
let inMemoryCsrfToken: string | null = readStoredCsrfToken();

function readStoredCsrfToken(): string | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage.getItem(CSRF_STORAGE_KEY) : null;
  } catch {
    return null;
  }
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
  try {
    if (typeof localStorage === 'undefined') return;
    if (token) localStorage.setItem(CSRF_STORAGE_KEY, token);
    else localStorage.removeItem(CSRF_STORAGE_KEY);
  } catch {
    /* localStorage may be unavailable (private mode, SSR) — memory cache still works */
  }
}

function getCsrfToken(): string | null {
  if (inMemoryCsrfToken) return inMemoryCsrfToken;
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

/**
 * Auth endpoints where a 401 means "these credentials/this session are
 * genuinely invalid" rather than "the short-lived access token expired."
 * We must NOT attempt a silent token refresh for these, or we'd (a) recurse
 * on /auth/refresh itself and (b) mask a real bad-password 401 on login.
 */
const NO_REFRESH_PATHS = new Set([
  '/auth/refresh',
  '/auth/login',
  '/auth/register',
  '/auth/logout',
]);

// Hard ceiling on how long the browser will wait for any single request.
// Chosen to sit just ABOVE the API's own LLM timeout (~30s) so that when an AI
// call is merely slow the server still wins the race and returns a real
// JSON error; the client only aborts when the connection is genuinely dead,
// turning the old "perpetual spinner" into a clean, retryable error.
const DEFAULT_REQUEST_TIMEOUT_MS = 40_000;

export class ApiClient {
  baseURL: string;

  /**
   * Single-flight guard for token refresh. When several requests 401 at once
   * (e.g. a page that fires getMe + getTopics together after the 15-min access
   * token expired) they must share ONE /auth/refresh round-trip, not stampede
   * the endpoint and rotate the refresh token N times. Concurrent callers await
   * this same promise; it's cleared once settled.
   */
  private refreshPromise: Promise<boolean> | null = null;

  /**
   * Transient-failure retry policy. A Railway/Vercel redeploy briefly makes the
   * API unreachable: the edge proxy returns 502/503/504 or the connection is
   * refused/reset for a few seconds. Without retry these surface to the user as
   * hard "connectivity / API errors" that would have cleared on their own. We
   * retry ONLY idempotent (GET/HEAD) requests, a bounded number of times, with
   * exponential backoff — never a POST/PUT/DELETE, which could double-write.
   */
  private readonly maxRetries: number;
  private readonly retryBaseDelayMs: number;

  constructor(
    baseURL: string = DEFAULT_BASE_URL,
    options: { maxRetries?: number; retryBaseDelayMs?: number } = {}
  ) {
    // Sanitize here too so a polluted constructor override (or env value that
    // sneaks a newline back in) can never produce a malformed request URL.
    this.baseURL = sanitizeBaseURL(baseURL);
    this.maxRetries = Math.max(0, options.maxRetries ?? 2);
    this.retryBaseDelayMs = Math.max(0, options.retryBaseDelayMs ?? 300);
  }

  /**
   * Wait before a transient-failure retry: base, 2×base, 4×base … Resolves
   * early if the caller aborts so a cancelled request never lingers in backoff.
   */
  private backoff(attempt: number, signal?: AbortSignal | null): Promise<void> {
    const ms = this.retryBaseDelayMs * 2 ** attempt;
    if (ms <= 0) return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(resolve, ms);
      if (signal) {
        signal.addEventListener(
          'abort',
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      }
    });
  }

  /**
   * Attempt to mint a fresh access token from the (httpOnly) refresh cookie.
   * Returns true on success. De-duplicated via {@link refreshPromise} so a
   * burst of 401s triggers exactly one rotation.
   */
  private tryRefresh(): Promise<boolean> {
    if (!this.refreshPromise) {
      this.refreshPromise = fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      })
        .then(async (res) => {
          if (!res.ok) return false;
          // /auth/refresh returns a fresh CSRF token in its body for cross-site
          // SPAs that cannot read the rotated cookie — cache it before retrying.
          const data = await res.json().catch(() => null);
          const token = (data as { csrfToken?: unknown } | null)?.csrfToken;
          if (typeof token === 'string') setCsrfToken(token);
          return true;
        })
        .catch(() => false)
        .finally(() => {
          this.refreshPromise = null;
        });
    }
    return this.refreshPromise;
  }

  async request<T = unknown>(
    path: string,
    options: ApiRequestOptions = {},
    isRetry = false
  ): Promise<T> {
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

    const { timeoutMs = DEFAULT_REQUEST_TIMEOUT_MS, signal: callerSignal, ...restOptions } = options;

    // Only idempotent methods may be transparently retried — replaying a write
    // (POST/PUT/DELETE) risks a double-effect. GET/HEAD are safe to repeat.
    const isIdempotent = method === 'GET' || method === 'HEAD';

    // `!` (definite assignment): the loop only exits via `break` — which always
    // runs after `response` has been assigned — or via `throw`/`return`.
    let response!: Response;
    for (let attempt = 0; ; attempt++) {
      // Bound every attempt with its own AbortController so a stalled connection
      // can never hang the UI forever. Compose with any caller-supplied signal so
      // explicit cancellation still works.
      const controller = new AbortController();
      const timer =
        timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : undefined;
      const onCallerAbort = () => controller.abort();
      if (callerSignal) {
        if (callerSignal.aborted) controller.abort();
        else callerSignal.addEventListener('abort', onCallerAbort, { once: true });
      }

      const config: RequestInit = {
        ...restOptions,
        credentials: 'include',
        headers,
        signal: controller.signal,
      };

      try {
        response = await fetch(url, config);
      } catch (err) {
        // Our own timeout fired (not a caller cancel): surface a clean 408. A
        // timeout means the server is too slow, not a transient blip — no retry.
        if (controller.signal.aborted && !callerSignal?.aborted) {
          throw new ApiError(
            'The request timed out — the server took too long to respond. Please try again.',
            408
          );
        }
        // A genuine network error (connection refused/reset, DNS, offline) — the
        // exact signature of a redeploy window. Retry idempotent requests a
        // bounded number of times with backoff before giving up.
        if (isIdempotent && !callerSignal?.aborted && attempt < this.maxRetries) {
          await this.backoff(attempt, callerSignal);
          continue;
        }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        if (callerSignal) callerSignal.removeEventListener('abort', onCallerAbort);
      }

      // A 502/503/504 from the edge proxy is what an in-flight deploy looks like
      // to the browser. Treat it as transient for idempotent requests and retry
      // before surfacing the error.
      if (
        isIdempotent &&
        (response.status === 502 || response.status === 503 || response.status === 504) &&
        attempt < this.maxRetries
      ) {
        await this.backoff(attempt, callerSignal);
        continue;
      }

      break;
    }

    // Silent token refresh: an expired 15-min access token surfaces as a 401.
    // Rather than dumping the user back to /login (the old behaviour that
    // trapped them mid-flow with endless `401 ()` console errors), rotate the
    // access token once via the long-lived refresh cookie and replay the
    // request. We only do this when we have a cached CSRF token — i.e. a prior
    // authenticated session existed — so anonymous visitors don't pay an extra
    // round-trip on every 401.
    if (
      response.status === 401 &&
      !isRetry &&
      !NO_REFRESH_PATHS.has(path) &&
      getCsrfToken()
    ) {
      const refreshed = await this.tryRefresh();
      if (refreshed) {
        return this.request<T>(path, options, true);
      }
    }

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

    // Read the body defensively. A real fetch Response exposes text(); reading
    // text first lets an empty or non-JSON 2xx response (e.g. a gateway that
    // returned 200 with no body when an upstream AI call timed out) surface as a
    // clear, actionable error instead of the cryptic "Failed to execute 'json'
    // on 'Response': Unexpected end of JSON input" that crashed every
    // /education/* feature. (Some test doubles only stub json(); fall back to it.)
    let data: T;
    if (typeof response.text === 'function') {
      const raw = await response.text();
      if (!raw) {
        throw new ApiError(
          'The server returned an empty response. The request may have timed out — please try again.',
          response.status
        );
      }
      try {
        data = JSON.parse(raw) as T;
      } catch {
        throw new ApiError(
          'The server returned an unreadable response. The request may have timed out — please try again.',
          response.status
        );
      }
    } else {
      data = (await response.json()) as T;
    }

    // Auth responses carry a fresh CSRF token in the body so cross-site SPAs
    // (which cannot read the API's cookie) can echo it on later writes. Capture
    // it transparently; callers keep their existing typed return shape.
    if (data && typeof data === 'object' && 'csrfToken' in data) {
      const token = (data as { csrfToken?: unknown }).csrfToken;
      if (typeof token === 'string') setCsrfToken(token);
    }

    return data;
  }

  // ─── Auth ────────────────────────────────────────────────────────
  register(data: RegisterRequest): Promise<AuthResponse> {
    return this.request('/auth/register', { method: 'POST', body: JSON.stringify(data) });
  }
  login(data: LoginRequest): Promise<AuthResponse> {
    return this.request('/auth/login', { method: 'POST', body: JSON.stringify(data) });
  }
  async logout(): Promise<{ success: boolean }> {
    try {
      return await this.request('/auth/logout', { method: 'POST' });
    } finally {
      // Drop the cached CSRF token so a subsequent login starts clean and a
      // stale token can't leak across sessions on a shared device.
      setCsrfToken(null);
    }
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
    sources: EducationSource[];
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
    // Image generation (DALL·E, plus a possible dall-e-2 fallback) is slower
    // than a text call and can exceed the default request timeout — give it a
    // longer budget so the browser doesn't abort a still-running generation.
    return this.request('/education/image', { method: 'POST', body: JSON.stringify(data), timeoutMs: 90_000 });
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
    sources: EducationSource[];
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
    // Image generation is slower than a text call and can exceed the 40s
    // default; give it the same 90s budget as generateImage() so the browser
    // doesn't abort a still-running generation. (Without this, generic image
    // generation was cut off at 40s while /education/image was not.)
    return this.request('/llm/image', { method: 'POST', body: JSON.stringify({ prompt, options }), timeoutMs: 90_000 });
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
  runFunctionTests(): Promise<{
    ok: boolean;
    data: { checked: number; passed: number; failed: number; skipped: number; errorReport: string; checks?: unknown[] };
    run_duration_ms: number;
  }> {
    return this.request('/admin/self-test');
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
  //
  // The backend `medical_data` model is deliberately minimal: `dataType`,
  // `title`, a single encrypted `content` JSON blob, `fileUrl`, `metadata`.
  // The UI (carried over from Base44) speaks a flatter, richer shape —
  // `file_type`, `summary`, `relevant_genes`, `phenotypes_identified`,
  // `extracted_data`, `vcf_variants`, `created_date`, `file_url`. Rather than
  // rewrite every consumer page, the client is the single translation layer:
  // it flattens `content` OUT on read and packs the rich fields back IN on
  // write. This keeps the API contract clean while the whole app keeps working.
  async getMedicalData(dataType?: string): Promise<MedicalData[]> {
    const qs = dataType ? `?dataType=${encodeURIComponent(dataType)}` : '';
    const res = await this.request<{ records: MedicalData[] }>(`/entities/medical-data${qs}`);
    return (res.records || []).map((r) => normalizeMedicalRecord(r)) as unknown as MedicalData[];
  }
  async saveMedicalData(data: Record<string, unknown>): Promise<MedicalData> {
    // Deletion was historically overloaded onto this call with a `_delete`
    // flag; route it to the dedicated DELETE endpoint.
    if (data && data._delete && data.id) {
      await this.deleteMedicalData(String(data.id));
      return { id: String(data.id), deleted: true } as unknown as MedicalData;
    }
    // Record sharing has no backend model yet. Fail with a clear message
    // instead of POSTing a payload the API rejects with a cryptic error.
    if (data && (data._shareAction || data._revokeShareAction)) {
      throw new Error('Sharing medical records is not available yet.');
    }

    const payload = toBackendMedicalPayload(data);

    // A record `id` means "update"; PUT merges `content` server-side so a
    // partial patch (e.g. just parsed VCF variants) won't wipe the summary.
    if (data.id) {
      const res = await this.request<{ record: MedicalData }>(
        `/entities/medical-data/${data.id}`,
        { method: 'PUT', body: JSON.stringify(payload) }
      );
      return normalizeMedicalRecord(res.record) as unknown as MedicalData;
    }

    const res = await this.request<{ record: MedicalData }>('/entities/medical-data', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    return normalizeMedicalRecord(res.record) as unknown as MedicalData;
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
  /**
   * Resolve authoritative gene records (MyGene.info → Ensembl/NCBI) and validate
   * phenotype names against HPO. Used by gene search to replace LLM-guessed
   * coordinates/IDs/HPO ids with real data. Fails soft on the server, so a slow
   * upstream can't hang the search — give it a bounded timeout here too.
   */
  enrichGenomicData(
    symbols: string[],
    phenotypes: string[] = []
  ): Promise<{
    genes: Record<string, AuthoritativeGeneRecord | null>;
    phenotypes: Record<string, { hpoId: string | null; name: string; verified: boolean }>;
  }> {
    return this.request('/genomics/enrich', {
      method: 'POST',
      body: JSON.stringify({ symbols, phenotypes }),
      timeoutMs: 25_000,
    });
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
  /**
   * Annotate the deduplicated union of variants across a study cohort in one
   * request. Slower than a single-file enrich because it fans out over many
   * distinct variants against public databases — give it a longer budget so a
   * still-running batch isn't aborted at the 40s default.
   */
  enrichVcfCohort(variants: Partial<VcfParsedVariant>[]): Promise<VcfCohortEnrichmentResponse> {
    return this.request('/genomics/vcf/enrich-cohort', {
      method: 'POST',
      body: JSON.stringify({ variants }),
      timeoutMs: 90_000,
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
