/**
 * Fail-closed publication boundary for the public education/research build.
 *
 * Public model execution is authorized only by a server-owned route or a
 * versioned, structured task contract. Arbitrary prompt text is never an
 * authorization signal and is rejected on the public generation routes.
 */
import { resolveEducationTopic } from './educationCatalog.js';
import {
  hasRawGenerationInput,
  parsePublicationTaskInput,
} from './publicationTaskContracts.js';

export const PUBLICATION_MODE = 'education_research';
export const HIGH_RISK_CLINICAL_FEATURES_ENABLED = false;

export const PUBLICATION_TASKS = Object.freeze({
  GENETICS_EDUCATION: 'genetics_education',
  AGGREGATE_GENOMICS_RESEARCH: 'aggregate_genomics_research',
  CANDIDATE_GENE_RESEARCH: 'candidate_gene_research',
  RESEARCH_HYPOTHESIS: 'research_hypothesis',
  LEARNING_ACTIVITY_SUMMARY: 'learning_activity_summary',
});

export const PUBLICATION_TASK_VALUES = Object.freeze(Object.values(PUBLICATION_TASKS));

const HIDDEN_PATH_PREFIXES = Object.freeze([
  '/clinical-trials',
  '/genomics/vcf',
  '/genomics/variant',
  '/genomics/clinvar',
  '/entities/medical-data',
  '/entities/conversations',
  '/admin/self-test',
]);
const MAX_PATH_DECODE_PASSES = 2;

const ROUTE_OWNED_TASKS = new Map([
  ['/education/explain', PUBLICATION_TASKS.GENETICS_EDUCATION],
  ['/education/quiz', PUBLICATION_TASKS.GENETICS_EDUCATION],
  ['/education/image', PUBLICATION_TASKS.GENETICS_EDUCATION],
]);

const CLIENT_TASK_ROUTES = new Map([
  ['/llm/invoke', new Set([
    PUBLICATION_TASKS.AGGREGATE_GENOMICS_RESEARCH,
    PUBLICATION_TASKS.CANDIDATE_GENE_RESEARCH,
    PUBLICATION_TASKS.RESEARCH_HYPOTHESIS,
    PUBLICATION_TASKS.LEARNING_ACTIVITY_SUMMARY,
  ])],
  ['/education/chat', new Set([PUBLICATION_TASKS.GENETICS_EDUCATION])],
]);

const SAFE_NON_GENERATION_EDUCATION_ROUTES = new Set([
  '/education/topics',
  '/education/progress',
  '/education/entitlements',
]);

function rawPathname(url = '') {
  return String(url).split('?')[0].split('#')[0] || '/';
}

function decodeAsciiEscapes(value) {
  return value.replace(/%([0-9a-f]{2})/gi, (match, hex) => {
    const codePoint = Number.parseInt(hex, 16);
    return codePoint >= 0x20 && codePoint <= 0x7e
      ? String.fromCharCode(codePoint)
      : match;
  });
}

function safeDecodePath(value) {
  let current = value;
  for (let pass = 0; pass < MAX_PATH_DECODE_PASSES; pass += 1) {
    let decoded;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      decoded = decodeAsciiEscapes(current);
    }
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

function normalizeDotSegments(value) {
  const segments = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') {
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return `/${segments.join('/')}`;
}

function normalizePath(value = '') {
  const decoded = safeDecodePath(rawPathname(value)).replace(/\/{2,}/g, '/');
  return normalizeDotSegments(decoded).toLowerCase();
}

// Fastify's matched route template is authoritative in preHandler. Wildcard
// routes use the safely decoded raw URL so encoded and dot-segment probes
// cannot route around the policy.
function policyPath({ routeUrl, url } = {}) {
  const matchedRoute = typeof routeUrl === 'string'
    && routeUrl.startsWith('/')
    && !routeUrl.includes('*')
    ? routeUrl
    : null;
  return normalizePath(matchedRoute || url);
}

function hasPathPrefix(path, prefix) {
  return path === prefix || path.startsWith(`${prefix}/`);
}

function requestedTask(body) {
  return typeof body?.publicationTask === 'string' ? body.publicationTask.trim() : '';
}

function isKnownEducationTopic(value) {
  return resolveEducationTopic(value) !== null;
}

function isRouteOwnedGeneticsTopic(body) {
  const topic = typeof body?.topic === 'string' ? body.topic : '';
  if (!topic) return false;
  if (['prompt', 'messages', 'context', 'taskInput'].some(
    (field) => Object.prototype.hasOwnProperty.call(body, field)
  )) return false;
  // Fixed education routes are catalog-only. A genetics keyword in arbitrary
  // prose is not authorization to execute a prompt. New concepts must be
  // reviewed and added to educationCatalog.js before publication.
  return isKnownEducationTopic(topic);
}

function block(message) {
  return {
    statusCode: 403,
    code: 'EDUCATION_RESEARCH_BOUNDARY',
    message,
  };
}

export function hiddenPathBoundaryDecision({ url, routeUrl } = {}) {
  if (HIGH_RISK_CLINICAL_FEATURES_ENABLED) return null;
  const path = policyPath({ routeUrl, url });
  if (!HIDDEN_PATH_PREFIXES.some((prefix) => hasPathPrefix(path, prefix))) return null;
  return {
    statusCode: 404,
    code: 'FEATURE_NOT_AVAILABLE',
    message: 'This feature is not available in the education and exploratory-research build.',
  };
}

export function publicationBoundaryDecision({ url, routeUrl, body } = {}) {
  if (HIGH_RISK_CLINICAL_FEATURES_ENABLED) return null;

  const hiddenDecision = hiddenPathBoundaryDecision({ url, routeUrl });
  if (hiddenDecision) return hiddenDecision;

  const path = policyPath({ routeUrl, url });
  if (SAFE_NON_GENERATION_EDUCATION_ROUTES.has(path)) return null;

  const routeOwnedTask = ROUTE_OWNED_TASKS.get(path);
  const allowedClientTasks = CLIENT_TASK_ROUTES.get(path);
  const isUnknownGenerationRoute = !routeOwnedTask
    && !allowedClientTasks
    && (hasPathPrefix(path, '/llm') || hasPathPrefix(path, '/education'));
  if (!routeOwnedTask && !allowedClientTasks && !isUnknownGenerationRoute) return null;

  const hasOwn = (value, key) => Boolean(
    value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, key)
  );
  if (hasOwn(body, 'agent') || hasOwn(body?.options, 'agent')) {
    return block('Persona-routed generation is not available in this published build.');
  }
  if (hasOwn(body?.options, 'publicationTask')) {
    return block('The publication task must be supplied as a top-level structured field.');
  }

  const suppliedTask = requestedTask(body);
  if (isUnknownGenerationRoute) {
    return block('This generation route is not available in the published build.');
  }

  if (routeOwnedTask) {
    if (suppliedTask && suppliedTask !== routeOwnedTask) {
      return block('The supplied publication task does not match this education route.');
    }
    return isRouteOwnedGeneticsTopic(body)
      ? null
      : block('This route accepts only a bounded genetics education topic.');
  }

  if (!suppliedTask || !allowedClientTasks.has(suppliedTask)) {
    return block('This route requires a recognized structured publication task.');
  }
  if (hasRawGenerationInput(body)) {
    return block('Raw prompts and message histories are not accepted by the published build.');
  }
  // This choke point validates the finite request shape. External identifiers
  // are authoritatively resolved in the authenticated route preHandler before
  // any generation handler can run.
  const validation = parsePublicationTaskInput(suppliedTask, body?.taskInput, {
    routePath: path,
  });
  if (!validation.ok) {
    return block(validation.reason || 'The structured publication task is invalid.');
  }
  return null;
}

export async function enforceHiddenPathBoundary(request, reply) {
  const rawUrl = request?.raw?.url || request?.url;
  const routeUrl = request?.routeOptions?.url;
  const decision = hiddenPathBoundaryDecision({ url: rawUrl, routeUrl });
  if (!decision) return undefined;

  request?.log?.info?.(
    { path: policyPath({ routeUrl, url: rawUrl }), boundaryCode: decision.code },
    'publication boundary blocked request'
  );
  return reply.code(decision.statusCode).send({
    error: decision.message,
    code: decision.code,
    publicationMode: PUBLICATION_MODE,
  });
}

export async function enforcePublishingBoundary(request, reply) {
  const rawUrl = request?.raw?.url || request?.url;
  const routeUrl = request?.routeOptions?.url;
  const decision = publicationBoundaryDecision({
    url: rawUrl,
    routeUrl,
    body: request?.body,
  });
  if (!decision) return undefined;

  request?.log?.info?.(
    { path: policyPath({ routeUrl, url: rawUrl }), boundaryCode: decision.code },
    'publication boundary blocked request'
  );
  return reply.code(decision.statusCode).send({
    error: decision.message,
    code: decision.code,
    publicationMode: PUBLICATION_MODE,
  });
}

export const __test = {
  isKnownEducationTopic,
  isRouteOwnedGeneticsTopic,
  normalizePath,
  policyPath,
  requestedTask,
  safeDecodePath,
  HIDDEN_PATH_PREFIXES,
  hiddenPathBoundaryDecision,
  // Read-only views of the authorization registries, so the boundary-coverage
  // sweep (src/__tests__/routeBoundaryCoverage.test.js) can assert against the
  // real registries instead of a hand-copied duplicate that would silently
  // drift. Copies, not the live Maps/Sets: a reader cannot register a route.
  routeOwnedTaskPaths: () => new Set(ROUTE_OWNED_TASKS.keys()),
  clientTaskRoutePaths: () => new Set(CLIENT_TASK_ROUTES.keys()),
  safeNonGenerationRoutePaths: () => new Set(SAFE_NON_GENERATION_EDUCATION_ROUTES),
};
