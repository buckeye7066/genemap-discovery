// ─── Agent registry (awareness layer of the agent mesh) ──────────────────────
//
// GeneMap ships two LLM personas — Robert (clinical genomics) and Anastasia
// (genetic counselling). Until now neither the browser nor the API had a single
// place that said *who exists*: the personas were implicit in a page-level
// `activeAssistant` string, an `assistantType` column value, and a charter
// pasted into a template literal. Nothing linked them, so the server could not
// tell which persona was calling and the two could never learn from each other.
//
// This module is that missing single source of truth. It is deliberately a
// hand-maintained, frozen catalog in the same spirit as
// `apps/web/components/functionRegistry.js` — there is no build-time
// reflection step. What keeps it honest is a totality test
// (`apps/web/pages/__tests__/agentRegistryTotality.test.js`) which source-scans
// the web app for persona identifiers and fails if the app uses an id that is
// not registered here, or registers an id the app never uses.
//
// It lives in @genemap/shared because BOTH sides need it: the web app tags each
// LLM call with its persona id, and the API validates that id before writing
// anything to the mesh stores.
//
// PRIVACY CONTRACT: this registry, and every mesh store keyed off it, carries
// OPERATIONAL metadata only — assistant ids, roles, file paths, failure kinds,
// counts, model names. No user content, no medical content, ever.

export interface AgentDefinition {
  /** Stable identifier. Matches `ai_conversations.assistant_type` values. */
  readonly id: string;
  /** Human-facing display name. */
  readonly name: string;
  /** One-line role summary. */
  readonly role: string;
  /** 1-2 sentence charter — what this agent is for and how it behaves. */
  readonly charter: string;
  /** What this agent is expected to be good at. */
  readonly capabilities: readonly string[];
  /** Source files where this agent is surfaced to users. */
  readonly entryPoints: readonly string[];
  /** Where this agent's activity is observable. */
  readonly telemetry: string;
  /** Where lessons authored by / addressed to this agent are stored. */
  readonly lessonsHome: string;
}

const TELEMETRY = 'AuditLog llm_invoke + ai_conversations assistantType';
const LESSONS_HOME = 'agent_lessons (services/api/src/services/agentMesh.js)';

export const AGENTS: Readonly<Record<string, AgentDefinition>> = Object.freeze({
  robert: Object.freeze({
    id: 'robert',
    name: 'Robert',
    role: 'Clinical genomics assistant',
    charter:
      'Robert answers genomics and clinical-genetics questions with PhD-level rigour, grounding every claim in named authoritative sources and grading its evidence. He provides decision support and never a diagnosis.',
    capabilities: Object.freeze([
      'variant interpretation (ACMG/AMP framing)',
      'pharmacogenomic analysis',
      'gene-disease association assessment',
      'clinical decision support narratives',
      'evidence grading and source attribution',
    ]),
    entryPoints: Object.freeze([
      'apps/web/pages/RobertClinical.jsx',
      'apps/web/components/clinical/RobertClinicalSupport.jsx',
      'apps/web/pages/AIAssistants.jsx',
    ]),
    telemetry: TELEMETRY,
    lessonsHome: LESSONS_HOME,
  }),
  anastasia: Object.freeze({
    id: 'anastasia',
    name: 'Anastasia',
    role: 'Genetic-counselling companion',
    charter:
      'Anastasia translates genetics into plain, warm, non-alarming language for people reading their own results. She explains, reassures, and routes anyone facing a real decision to a qualified clinician or certified genetic counselor.',
    capabilities: Object.freeze([
      'plain-language explanation of results',
      'risk framing without genetic determinism',
      'emotional support around genetic findings',
      'next-step and referral guidance',
      'jargon translation',
    ]),
    entryPoints: Object.freeze([
      'apps/web/pages/Anastasia.jsx',
      'apps/web/pages/AIAssistants.jsx',
    ]),
    telemetry: TELEMETRY,
    lessonsHome: LESSONS_HOME,
  }),
});

/** Every registered agent id, in a stable order. */
export const AGENT_IDS: readonly string[] = Object.freeze(Object.keys(AGENTS));

/**
 * Reserved `toAgent` value meaning "every agent". Never a registered id, so
 * `isRegisteredAgent(BROADCAST_AGENT)` is deliberately false.
 */
export const BROADCAST_AGENT = 'broadcast';

/** Look up an agent definition, or null when the id is not registered. */
export function getAgentById(id: unknown): AgentDefinition | null {
  if (typeof id !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(AGENTS, id) ? AGENTS[id] : null;
}

/** Type guard: is this a known agent id? */
export function isRegisteredAgent(id: unknown): id is string {
  return getAgentById(id) !== null;
}

/** Every registered agent except `id` — the peers a lesson is taught to. */
export function peerAgentIds(id: unknown): readonly string[] {
  return AGENT_IDS.filter((agentId) => agentId !== id);
}
