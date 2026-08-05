// Curated map of the application's notable functions/endpoints, used by the
// admin-only Function Reviewer to browse the codebase surface. `filePath` is
// the source of truth the page uses to split "Backend" (services/api/...) from
// "Frontend" (pages/... | components/...), and `category` drives grouping/colors.
//
// This is a hand-maintained catalog (there is no build-time reflection step);
// keep it roughly in sync when adding major routes/services. An empty registry
// previously rendered a misleading "0 backend / 0 frontend / 0 functions" page.
export const KNOWN_FUNCTIONS = [
  // ─── Auth / user management (backend) ───────────────────────────────
  { functionId: 'auth.register', filePath: 'services/api/src/routes/auth.js', category: 'user_management', description: 'POST /auth/register — create an account, set JWT + refresh cookies.' },
  { functionId: 'auth.login', filePath: 'services/api/src/routes/auth.js', category: 'user_management', description: 'POST /auth/login — verify credentials, issue session + CSRF token.' },
  { functionId: 'auth.refresh', filePath: 'services/api/src/routes/auth.js', category: 'user_management', description: 'POST /auth/refresh — rotate the access token from the refresh cookie.' },
  { functionId: 'auth.me', filePath: 'services/api/src/routes/auth.js', category: 'user_management', description: 'GET/PUT /auth/me — read or update the current user profile.' },

  // ─── Billing / Stripe (backend) ─────────────────────────────────────
  { functionId: 'billing.checkoutSession', filePath: 'services/api/src/routes/billing.js', category: 'stripe', description: 'POST /billing/checkout-session — start a Stripe subscription checkout.' },
  { functionId: 'billing.portalSession', filePath: 'services/api/src/routes/billing.js', category: 'stripe', description: 'POST /billing/portal-session — open the Stripe customer portal.' },
  { functionId: 'billing.webhook', filePath: 'services/api/src/routes/billing.js', category: 'stripe', description: 'POST /billing/webhook — Stripe signed webhook (raw-body, idempotent).' },

  // ─── Education (backend) ────────────────────────────────────────────
  { functionId: 'education.topics', filePath: 'services/api/src/routes/education.js', category: 'service', description: 'GET /education/topics — curriculum catalog.' },
  { functionId: 'education.explain', filePath: 'services/api/src/routes/education.js', category: 'service', description: 'POST /education/explain — level-adaptive topic explanation.' },
  { functionId: 'education.image', filePath: 'services/api/src/routes/education.js', category: 'service', description: 'POST /education/image — generate an educational illustration.' },
  { functionId: 'education.quiz', filePath: 'services/api/src/routes/education.js', category: 'service', description: 'POST /education/quiz — generate a level-tuned quiz.' },
  { functionId: 'education.chat', filePath: 'services/api/src/routes/education.js', category: 'service', description: 'POST /education/chat — genetics tutor chat.' },

  // ─── LLM proxy (backend) ────────────────────────────────────────────
  { functionId: 'llm.invoke', filePath: 'services/api/src/routes/llm.js', category: 'service', description: 'POST /llm/invoke — guarded single-prompt LLM completion.' },
  { functionId: 'llm.chat', filePath: 'services/api/src/routes/llm.js', category: 'service', description: 'POST /llm/chat — guarded multi-turn LLM chat.' },
  { functionId: 'llm.parseJsonFromLLM', filePath: 'services/api/src/services/llm.js', category: 'shared', description: 'Robustly extract JSON from a raw LLM completion.' },

  // ─── Agent mesh (backend + shared) ──────────────────────────────────
  { functionId: 'agentMesh.registry', filePath: 'packages/shared/src/agentRegistry.ts', category: 'shared', description: 'Frozen registry of the LLM personas (Robert, Anastasia) shared by web + API.' },
  { functionId: 'agentMesh.consumePeerBriefing', filePath: 'services/api/src/services/agentMesh.js', category: 'service', description: 'Run-start hook: fold peer messages + fresh lessons into one note, then ack/consume.' },
  { functionId: 'agentMesh.recordProviderFailureLesson', filePath: 'services/api/src/services/agentMesh.js', category: 'service', description: 'Run-end hook: teach peers when a model fails repeatedly in 24h.' },

  // ─── Genomics (backend) ─────────────────────────────────────────────
  { functionId: 'genomics.lookupGene', filePath: 'services/api/src/routes/genomics.js', category: 'service', description: 'GET /genomics/gene/:symbol — gene metadata lookup.' },
  { functionId: 'genomics.searchPhenotypes', filePath: 'services/api/src/routes/genomics.js', category: 'service', description: 'GET /genomics/phenotype/search — HPO/phenotype search.' },
  { functionId: 'genomics.vcfParse', filePath: 'services/api/src/services/vcf.js', category: 'processor', description: 'Parse uploaded VCF text into structured variants.' },
  { functionId: 'genomics.databases', filePath: 'services/api/src/services/genomicDatabases.js', category: 'service', description: 'Adapters for MyGene/Ensembl/ClinVar/etc. lookups.' },

  // ─── Clinical trials (backend) ──────────────────────────────────────
  { functionId: 'clinicalTrials.search', filePath: 'services/api/src/routes/clinicalTrials.js', category: 'service', description: 'GET /clinical-trials/search — ClinicalTrials.gov search.' },

  // ─── Admin (backend) ────────────────────────────────────────────────
  { functionId: 'admin.users', filePath: 'services/api/src/routes/admin.js', category: 'admin', description: 'GET /admin/users — paginated user directory.' },
  { functionId: 'admin.analytics', filePath: 'services/api/src/routes/admin.js', category: 'admin', description: 'GET /admin/analytics — usage analytics.' },
  { functionId: 'admin.grantFreePeriod', filePath: 'services/api/src/routes/admin.js', category: 'admin', description: 'POST /admin/grant-free-period — comp a user (super_admin).' },
  { functionId: 'admin.selfTest', filePath: 'services/api/src/routes/admin.js', category: 'system', description: 'GET /admin/self-test — real backend health/self-test suite.' },

  // ─── Shared client + key frontend services (frontend) ───────────────
  { functionId: 'client.ApiClient', filePath: 'packages/shared/src/client.ts', category: 'shared', description: 'Typed fetch client: CSRF, single-flight refresh, error mapping.' },
  { functionId: 'search.PhenotypeSearchService', filePath: 'components/search/PhenotypeSearchService.jsx', category: 'service', description: 'Disease/phenotype → candidate-gene discovery + enrichment.' },
  { functionId: 'search.AutocompleteSearch', filePath: 'components/search/AutocompleteSearch.jsx', category: 'service', description: 'Debounced LLM-backed search autocomplete.' },
  { functionId: 'shared.parseLLMJson', filePath: 'components/shared/llmJson.js', category: 'shared', description: 'Browser-side robust LLM JSON extraction (fences/prose tolerant).' },
  { functionId: 'page.GSEA', filePath: 'pages/GSEA.jsx', category: 'service', description: 'Gene Set Enrichment Analysis page + result rendering.' },
  { functionId: 'page.TopicExplorer', filePath: 'pages/TopicExplorer.jsx', category: 'service', description: 'Learn/Visual/Tutor/Quiz explorer for a topic.' },
];

export function getFunctionById(id) {
  return KNOWN_FUNCTIONS.find((f) => f.functionId === id) || null;
}

export function getAllCategories() {
  const categories = new Set();
  for (const fn of KNOWN_FUNCTIONS) {
    if (fn?.category) categories.add(fn.category);
  }
  return [...categories];
}

export default { KNOWN_FUNCTIONS, getFunctionById, getAllCategories };
