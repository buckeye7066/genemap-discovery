import type {
  ApiRequestOptions,
  User,
  ProfileUpdateRequest,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  CheckoutSessionRequest,
  CheckoutSessionResponse,
  CheckoutActivationStatus,
  PortalSessionRequest,
  PortalSessionResponse,
  BillingCatalog,
  InstitutionalCheckoutRequest,
  TopicCategory,
  ExplanationRequest,
  EducationSource,
  QuizRequest,
  ChatRequest,
  LearningProgress,
  LLMResponse,
  PublicationInvocationOptions,
  PublicationTaskContent,
  PublicationTaskRequest,
  SearchHistoryEntry,
  ActivityEntry,
  AssistantChatRequest,
  AssistantChatResponse,
  AssistantId,
  Conversation,
  MedicalData,
  GeneSet,
  Project,
  ProjectVersion,
  Collaborator,
  Message,
  SupportMessageRequest,
  License,
  LicenseSeatAssignment,
  ConsentRecord,
  DataDeletionRequest,
  DeletionRequestStatus,
  Annotation,
  AdminAnalytics,
  BannedUser,
  PreBanRequest,
  UnbanOptions,
  AuthoritativeGeneRecord,
  PublicationConceptSuggestion,
  Topic,
} from './types.js';
import type { PublicationArtifact } from './publicationStatus.js';

/**
 * Resolve the API base URL.
 *
 *  1. Empty string ("") for hosted HTTPS web deployments so authenticated
 *     requests use same-origin Vercel rewrites and first-party cookies.
 *  2. `VITE_API_URL` for native, desktop, and other non-hosted runtimes.
 *  3. `http://localhost:3000` for local development when no URL is injected.
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

function resolveDefaultBaseURL(): string {
  // Vite injects import.meta.env at build time; guard against non-browser
  // environments (Node tests) where import.meta.env is undefined.
  let envApiUrl: string | undefined;
  try {
    // @ts-expect-error -- Vite-specific augmentation is not in tsconfig.
    envApiUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_API_URL : undefined;
  } catch (error) {
    console.error('Failed to access the environment API URL:', error);
    envApiUrl = undefined;
  }

  const cleanedEnv = sanitizeBaseURL(envApiUrl);

  if (typeof window !== 'undefined') {
    const { hostname, protocol } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';

    // Native Capacitor and local development run on localhost (sometimes over
    // HTTPS), where there is no Vercel proxy. Keep using an explicit injected
    // API URL there, falling back to the local API during development.
    if (isLocalHost) {
      return cleanedEnv || 'http://localhost:3000';
    }

    // Hosted HTTPS web deployments must use the same-origin Vercel rewrites.
    // A baked VITE_API_URL that points at Railway would make auth cookies
    // third-party and browsers can reject them, leaving login apparently
    // successful but every subsequent authenticated request unauthorized.
    if (protocol === 'https:') {
      return '';
    }
  }

  // Desktop/file runtimes and non-HTTPS custom environments have no hosted
  // same-origin proxy, so retain the configured direct API endpoint.
  if (cleanedEnv) return cleanedEnv;

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
 * Whether any evidence of a prior authenticated session exists on this
 * browser (a CSRF token cached from a login/register/refresh response, or a
 * readable same-origin csrfToken cookie). The session cookies themselves are
 * HttpOnly and invisible to JS, so this hint is the ONLY client-side signal.
 *
 * Used by AuthContext to skip the startup GET /auth/me for anonymous
 * visitors: without the hint that request can only 401, and the browser
 * unconditionally logs every 401 response as a console error — noise that
 * plagued the login page (and EVA's console-clean journeys) on every fresh
 * visit. A visitor with valid HttpOnly cookies but a wiped localStorage on a
 * cross-site deploy will look logged-out and simply signs in again — an
 * acceptable trade for a quiet, instant login page.
 */
export function hasStoredSession(): boolean {
  return getCsrfToken() !== null;
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
  receiptId?: string;

  constructor(
    message: string,
    status: number,
    code?: string,
    details?: unknown,
    receiptId?: string
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.receiptId = receiptId;
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
    // Normalize to FINITE values. Math.max alone preserves Infinity (→ retry a
    // persistent failure forever) and yields NaN for junk input; guard both so
    // the retry loop is always bounded.
    const maxRetries = options.maxRetries ?? 2;
    const retryBaseDelayMs = options.retryBaseDelayMs ?? 300;
    this.maxRetries = Number.isFinite(maxRetries) ? Math.max(0, Math.floor(maxRetries)) : 2;
    this.retryBaseDelayMs = Number.isFinite(retryBaseDelayMs) ? Math.max(0, retryBaseDelayMs) : 300;
  }

  /**
   * Wait before a transient-failure retry: base, 2×base, 4×base … Resolves
   * early if the caller aborts so a cancelled request never lingers in backoff.
   */
  private backoff(attempt: number, signal?: AbortSignal | null): Promise<void> {
    const ms = this.retryBaseDelayMs * 2 ** attempt;
    if (ms <= 0 || signal?.aborted) return Promise.resolve();
    return new Promise((resolve) => {
      let settled = false;
      let timer: ReturnType<typeof setTimeout>;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', settle);
        resolve();
      };
      timer = setTimeout(settle, ms);
      if (signal) signal.addEventListener('abort', settle, { once: true });
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
          if (!res.ok) {
            console.error(`Error refreshing token: ${res.status} ${res.statusText}`);
            return false;
          }
          // /auth/refresh returns a fresh CSRF token in its body for cross-site
          // SPAs that cannot read the rotated cookie — cache it before retrying.
          const data = await res.json().catch(() => null);
          const token = (data as { csrfToken?: unknown } | null)?.csrfToken;
          if (typeof token === 'string') setCsrfToken(token);
          return true;
        })
        .catch((error) => {
          console.error('Token refresh failed:', error);
          return false;
        })
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
      const body: {
        error?: string;
        code?: string;
        details?: unknown;
        receiptId?: string;
      } = await response.json().catch(() => ({}));
      throw new ApiError(
        body.error || `Request failed with status ${response.status}`,
        response.status,
        body.code,
        body.details,
        body.receiptId
      );
    }

    // 204 No Content — and a successful HEAD, which by definition carries no
    // body — yield undefined. Without the HEAD guard the empty-body check below
    // would turn a healthy HEAD 200 into a spurious "empty response" ApiError.
    if (method === 'HEAD' || response.status === 204) return undefined as T;

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
  updateProfile(data: ProfileUpdateRequest): Promise<User> {
    return this.request('/auth/me', { method: 'PUT', body: JSON.stringify(data) });
  }

  // ─── Billing ───────────────────────────────────────────────────────
  getBillingCatalog(): Promise<BillingCatalog> {
    return this.request('/billing/catalog');
  }
  createCheckoutSession(data: CheckoutSessionRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/checkout-session', { method: 'POST', body: JSON.stringify(data) });
  }
  createPortalSession(data: PortalSessionRequest): Promise<PortalSessionResponse> {
    return this.request('/billing/portal-session', { method: 'POST', body: JSON.stringify(data) });
  }
  createInstitutionalCheckout(data: InstitutionalCheckoutRequest): Promise<CheckoutSessionResponse> {
    return this.request('/billing/institutional-checkout', { method: 'POST', body: JSON.stringify(data) });
  }
  getCheckoutActivationStatus(sessionId: string): Promise<CheckoutActivationStatus> {
    return this.request(`/billing/checkout-status?sessionId=${encodeURIComponent(sessionId)}`);
  }

  // ─── Education ──────────────────────────────────────────────────────
  async getTopics(): Promise<TopicCategory[]> {
    const res = await this.request<{ categories: TopicCategory[] }>('/education/topics');
    return res.categories;
  }
  getExplanation(data: ExplanationRequest): Promise<{
    publication: PublicationArtifact<string>;
    topic: string;
    topicMetadata: Topic & { category: string; catalogVersion: number };
    level: string;
    sources: EducationSource[];
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/explain', { method: 'POST', body: JSON.stringify(data) });
  }
  generateQuiz(data: QuizRequest): Promise<{
    publication: PublicationArtifact<unknown[]>;
    topic: string;
    topicMetadata: Topic & { category: string; catalogVersion: number };
    level: string;
    sources: EducationSource[];
    usage: unknown;
    tier: string;
  }> {
    return this.request('/education/quiz', { method: 'POST', body: JSON.stringify(data) });
  }
  chat(data: ChatRequest): Promise<{
    publication: PublicationArtifact<string>;
    role: 'assistant';
    topicMetadata: Topic & { category: string; catalogVersion: number };
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

  // ─── Bounded publication tasks ──────────────────────────────────────
  invokePublicationTask<T extends PublicationTaskRequest>(
    publicationTask: T['publicationTask'],
    taskInput: T['taskInput'],
    options: PublicationInvocationOptions = {},
  ): Promise<LLMResponse<PublicationTaskContent<T['publicationTask']>>> {
    // Build the wire options from an explicit allow-list. TypeScript callers
    // get the narrow contract above, while plain-JS or casted callers still
    // cannot smuggle model/image/task controls into the request body.
    const llmOptions: PublicationInvocationOptions = {};
    if (options?.temperature !== undefined) llmOptions.temperature = options.temperature;
    if (options?.maxTokens !== undefined) llmOptions.maxTokens = options.maxTokens;
    return this.request('/llm/invoke', {
      method: 'POST',
      body: JSON.stringify({
        publicationTask,
        taskInput,
        options: llmOptions,
      }),
    });
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

  // ─── Encrypted health records ───────────────────────────────
  async getMedicalData<T = unknown>(dataType?: string): Promise<Array<MedicalData<T>>> {
    const query = dataType ? `?dataType=${encodeURIComponent(dataType)}` : '';
    const res = await this.request<{ records: Array<MedicalData<T>> }>(`/entities/medical-data${query}`);
    return res.records;
  }
  async createMedicalData<T = unknown>(data: Omit<MedicalData<T>, 'id' | 'createdAt' | 'updatedAt'>): Promise<MedicalData<T>> {
    const res = await this.request<{ record: MedicalData<T> }>('/entities/medical-data', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.record;
  }
  async updateMedicalData<T = unknown>(id: string, data: Partial<MedicalData<T>>): Promise<MedicalData<T>> {
    const res = await this.request<{ record: MedicalData<T> }>(`/entities/medical-data/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
    return res.record;
  }
  deleteMedicalData(id: string): Promise<{ success: boolean }> {
    return this.request(`/entities/medical-data/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ─── Profile-aware assistants ──────────────────────────────
  chatWithAssistant(assistant: AssistantId, data: AssistantChatRequest): Promise<AssistantChatResponse> {
    return this.request(`/assistants/${assistant}/chat`, {
      method: 'POST',
      body: JSON.stringify(data),
      timeoutMs: 45_000,
    });
  }
  async getConversations(assistantType?: AssistantId): Promise<Conversation[]> {
    const query = assistantType ? `?assistantType=${encodeURIComponent(assistantType)}` : '';
    const res = await this.request<{ conversations: Conversation[] }>(`/entities/conversations${query}`);
    return res.conversations;
  }
  deleteConversation(id: string): Promise<{ success: boolean; deleted: boolean }> {
    return this.request(`/entities/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
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
  async sendMessage(data: SupportMessageRequest): Promise<Message> {
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
  async assignLicenseSeats(
    licenseId: string,
    data: { userEmails: string[]; department?: string | null }
  ): Promise<LicenseSeatAssignment[]> {
    const res = await this.request<{ assignments: LicenseSeatAssignment[] }>(
      `/entities/licenses/${licenseId}/assign-bulk`,
      { method: 'POST', body: JSON.stringify(data) }
    );
    return res.assignments;
  }
  removeLicenseSeat(licenseId: string, assignmentId: string): Promise<{ success: boolean }> {
    return this.request(`/entities/licenses/${licenseId}/assignments/${assignmentId}`, { method: 'DELETE' });
  }

  // ─── Genomic Databases ───────────────
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
  /** Deterministic NLM HPO / Monarch typeahead. This endpoint never invokes an LLM. */
  searchPublicationConcepts(
    query: string,
    kind: 'phenotype' | 'disease'
  ): Promise<{ suggestions: PublicationConceptSuggestion[] }> {
    return this.request(
      `/genomics/publication-concepts/search?q=${encodeURIComponent(query)}&kind=${encodeURIComponent(kind)}`,
      // Monarch entity/autocomplete calls can legitimately take several
      // seconds. Keep this above the API's bounded 12s upstream budget while
      // still failing closed instead of presenting stale data as resolved.
      { timeoutMs: 15_000 },
    );
  }
  // ─── Consent and data-deletion requests ───────────────
  async recordConsent(data: Omit<ConsentRecord, 'id'>): Promise<ConsentRecord> {
    const res = await this.request<{ record: ConsentRecord }>('/entities/consent', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.record;
  }
  async recordConsents(data: Array<Omit<ConsentRecord, 'id'>>): Promise<ConsentRecord[]> {
    const res = await this.request<{ records: ConsentRecord[] }>('/entities/consent/batch', {
      method: 'POST',
      body: JSON.stringify({ choices: data }),
    });
    return res.records;
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
