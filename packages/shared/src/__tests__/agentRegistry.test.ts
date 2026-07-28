import { describe, it, expect } from 'vitest';
import {
  AGENTS,
  AGENT_IDS,
  BROADCAST_AGENT,
  getAgentById,
  isRegisteredAgent,
  peerAgentIds,
} from '../agentRegistry.js';
import { ApiClient } from '../client.js';

describe('agent registry shape', () => {
  it('registers exactly the two shipped personas', () => {
    expect([...AGENT_IDS].sort()).toEqual(['anastasia', 'robert']);
  });

  it('keys every entry by its own id', () => {
    for (const id of AGENT_IDS) {
      expect(AGENTS[id].id).toBe(id);
    }
  });

  it('gives every agent a complete, non-empty definition', () => {
    for (const id of AGENT_IDS) {
      const agent = AGENTS[id];
      expect(agent.name.length).toBeGreaterThan(0);
      expect(agent.role.length).toBeGreaterThan(0);
      // A charter is 1-2 sentences of intent, not a placeholder.
      expect(agent.charter.length).toBeGreaterThan(40);
      expect(agent.capabilities.length).toBeGreaterThan(0);
      expect(agent.entryPoints.length).toBeGreaterThan(0);
      // Entry points are real repo-relative source paths.
      for (const path of agent.entryPoints) {
        expect(path).toMatch(/^apps\/web\/.+\.(jsx|js|ts|tsx)$/);
      }
      expect(agent.telemetry).toBe('AuditLog llm_invoke + ai_conversations assistantType');
      expect(agent.lessonsHome.length).toBeGreaterThan(0);
    }
  });

  it('is frozen so no caller can mutate the registry at runtime', () => {
    expect(Object.isFrozen(AGENTS)).toBe(true);
    expect(Object.isFrozen(AGENTS.robert)).toBe(true);
    expect(Object.isFrozen(AGENT_IDS)).toBe(true);
    // Verify the freeze actually bites, rather than trusting isFrozen alone.
    // (ESM is always strict mode, so a frozen-object write throws.)
    expect(() => {
      (AGENTS as unknown as Record<string, unknown>).newcomer = { id: 'newcomer' };
    }).toThrow();
    expect(AGENT_IDS).not.toContain('newcomer');
  });
});

describe('getAgentById / isRegisteredAgent', () => {
  it('resolves a registered id', () => {
    expect(getAgentById('robert')?.name).toBe('Robert');
    expect(getAgentById('anastasia')?.name).toBe('Anastasia');
    expect(isRegisteredAgent('robert')).toBe(true);
  });

  it('refuses unknown ids, wrong types, and the broadcast sentinel', () => {
    for (const bad of ['melissa', '', 'ROBERT', BROADCAST_AGENT, null, undefined, 42, {}]) {
      expect(getAgentById(bad)).toBeNull();
      expect(isRegisteredAgent(bad)).toBe(false);
    }
  });

  it('does not resolve inherited Object.prototype keys', () => {
    // A naive `AGENTS[id]` lookup would return a function for these.
    expect(getAgentById('toString')).toBeNull();
    expect(getAgentById('constructor')).toBeNull();
    expect(isRegisteredAgent('hasOwnProperty')).toBe(false);
  });
});

describe('peerAgentIds', () => {
  it('returns every other agent', () => {
    expect(peerAgentIds('robert')).toEqual(['anastasia']);
    expect(peerAgentIds('anastasia')).toEqual(['robert']);
  });

  it('returns the whole roster for a non-agent caller', () => {
    expect([...peerAgentIds('nobody')].sort()).toEqual(['anastasia', 'robert']);
  });
});

describe('invokeLLM agent option', () => {
  it('sends `agent` as a sibling field, not inside options', async () => {
    const calls: Array<{ url: string; body?: unknown }> = [];
    global.fetch = (async (url: string, config: { body?: string }) => {
      calls.push({ url, body: config?.body });
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 'ok' }) };
    }) as unknown as typeof fetch;

    const client = new ApiClient('http://localhost:3000');
    await client.invokeLLM('hello', { agent: 'robert', maxTokens: 100 });

    const body = JSON.parse(String(calls[0].body));
    expect(body.agent).toBe('robert');
    expect(body.options).toEqual({ maxTokens: 100 });
    expect(body.options.agent).toBeUndefined();
  });

  it('omits `agent` entirely when no persona is calling', async () => {
    const calls: Array<{ body?: unknown }> = [];
    global.fetch = (async (_url: string, config: { body?: string }) => {
      calls.push({ body: config?.body });
      return { ok: true, status: 200, text: async () => JSON.stringify({ result: 'ok' }) };
    }) as unknown as typeof fetch;

    const client = new ApiClient('http://localhost:3000');
    await client.invokeLLM('hello');

    const body = JSON.parse(String(calls[0].body));
    expect('agent' in body).toBe(false);
  });
});
