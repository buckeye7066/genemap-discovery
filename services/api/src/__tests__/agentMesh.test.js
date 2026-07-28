import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createPrismaMock } from './setup.js';
import {
  postAgentMessage,
  readAgentInbox,
  ackAgentMessages,
  recordAgentLesson,
  getLessonsForAgent,
  markLessonConsumed,
  consumePeerBriefing,
  recordProviderFailureLesson,
  classifyFailure,
  LESSON_TOPICS,
  MESSAGE_RETENTION_DAYS,
  MESSAGE_RETENTION_MAX_ROWS,
  MAX_MESSAGE_BODY_CHARS,
  MAX_LESSON_CLAIM_CHARS,
  FAILURE_LESSON_THRESHOLD,
  LLM_FAILURE_ACTION,
} from '../services/agentMesh.js';

let prisma;

beforeEach(() => {
  prisma = createPrismaMock();
});

const DAY_MS = 24 * 60 * 60 * 1000;

// ─── Communication ───────────────────────────────────────────────────────────

describe('postAgentMessage / readAgentInbox / ackAgentMessages', () => {
  it('delivers a directed message to the recipient only', async () => {
    await postAgentMessage(prisma, {
      fromAgent: 'robert',
      toAgent: 'anastasia',
      kind: 'provider_reliability',
      body: 'model gpt-4o-mini is flaky',
    });

    const inbox = await readAgentInbox(prisma, 'anastasia');
    expect(inbox).toHaveLength(1);
    expect(inbox[0].fromAgent).toBe('robert');
    expect(inbox[0].kind).toBe('provider_reliability');

    // The sender does not receive its own message.
    expect(await readAgentInbox(prisma, 'robert')).toHaveLength(0);
  });

  it('delivers a broadcast to every agent except the sender', async () => {
    await postAgentMessage(prisma, {
      fromAgent: 'robert',
      toAgent: 'broadcast',
      body: 'operational note',
    });

    expect(await readAgentInbox(prisma, 'anastasia')).toHaveLength(1);
    expect(await readAgentInbox(prisma, 'robert')).toHaveLength(0);
  });

  it('acking removes a message from the unread inbox but not from history', async () => {
    await postAgentMessage(prisma, { fromAgent: 'robert', toAgent: 'anastasia', body: 'note one' });

    const before = await readAgentInbox(prisma, 'anastasia');
    expect(before).toHaveLength(1);

    const acked = await ackAgentMessages(prisma, 'anastasia', before.map((m) => m.id));
    expect(acked).toBe(1);

    expect(await readAgentInbox(prisma, 'anastasia', { unreadOnly: true })).toHaveLength(0);
    expect(await readAgentInbox(prisma, 'anastasia', { unreadOnly: false })).toHaveLength(1);

    // Acking twice is a no-op, not a double count.
    expect(await ackAgentMessages(prisma, 'anastasia', before.map((m) => m.id))).toBe(0);
  });

  it('acks per-agent: robert acking a broadcast leaves it unread for anastasia', async () => {
    // Post from a third-party perspective by sending a broadcast from each side.
    await postAgentMessage(prisma, { fromAgent: 'anastasia', toAgent: 'broadcast', body: 'shared note' });
    const robertInbox = await readAgentInbox(prisma, 'robert');
    await ackAgentMessages(prisma, 'robert', robertInbox.map((m) => m.id));

    expect(await readAgentInbox(prisma, 'robert')).toHaveLength(0);
    // Anastasia authored it, so it was never in her inbox either — but the row
    // must still carry robert's ack and nobody else's.
    const [row] = prisma._store.agentMessage;
    expect(Object.keys(row.readBy)).toEqual(['robert']);
  });

  it('refuses unregistered sender and recipient ids, loudly', async () => {
    await expect(
      postAgentMessage(prisma, { fromAgent: 'melissa', toAgent: 'robert', body: 'hi' })
    ).rejects.toThrow(/registered agent id/i);

    await expect(
      postAgentMessage(prisma, { fromAgent: 'robert', toAgent: 'melissa', body: 'hi' })
    ).rejects.toThrow(/registered agent id/i);

    await expect(readAgentInbox(prisma, 'broadcast')).rejects.toThrow(/registered agent id/i);
    await expect(ackAgentMessages(prisma, 'nobody', ['x'])).rejects.toThrow(/registered agent id/i);

    expect(prisma._store.agentMessage).toHaveLength(0);
  });

  it('requires a body and caps its length (the privacy backstop)', async () => {
    await expect(
      postAgentMessage(prisma, { fromAgent: 'robert', toAgent: 'anastasia', body: '   ' })
    ).rejects.toThrow(/body/i);

    const msg = await postAgentMessage(prisma, {
      fromAgent: 'robert',
      toAgent: 'anastasia',
      body: 'x'.repeat(MAX_MESSAGE_BODY_CHARS + 500),
    });
    expect(msg.body).toHaveLength(MAX_MESSAGE_BODY_CHARS);
  });

  it('enforces bounded retention on post: age cutoff and row ceiling', async () => {
    // One ancient row + a full inbox that is one over the ceiling.
    prisma._store.agentMessage.push({
      id: 'ancient',
      fromAgent: 'robert',
      toAgent: 'anastasia',
      kind: 'note',
      body: 'old',
      readBy: {},
      createdAt: new Date(Date.now() - (MESSAGE_RETENTION_DAYS + 5) * DAY_MS),
    });
    for (let i = 0; i < MESSAGE_RETENTION_MAX_ROWS; i++) {
      prisma._store.agentMessage.push({
        id: `m-${i}`,
        fromAgent: 'robert',
        toAgent: 'anastasia',
        kind: 'note',
        body: `n${i}`,
        readBy: {},
        createdAt: new Date(),
      });
    }

    await postAgentMessage(prisma, { fromAgent: 'robert', toAgent: 'anastasia', body: 'newest' });

    const ids = prisma._store.agentMessage.map((m) => m.id);
    expect(ids).not.toContain('ancient');
    expect(prisma._store.agentMessage.length).toBeLessThanOrEqual(MESSAGE_RETENTION_MAX_ROWS);
  });
});

// ─── Learning / teaching ─────────────────────────────────────────────────────

describe('recordAgentLesson', () => {
  it('creates a lesson with timesSeen 1 and an empty consumedBy map', async () => {
    const lesson = await recordAgentLesson(prisma, {
      authorAgent: 'robert',
      topic: 'provider_reliability',
      claim: 'model gpt-4o-mini failing repeatedly (timeout)',
      evidence: { model: 'gpt-4o-mini', kind: 'timeout', count: 3 },
    });

    expect(lesson.timesSeen).toBe(1);
    expect(lesson.consumedBy).toEqual({});
    expect(prisma._store.agentLesson).toHaveLength(1);
  });

  it('dedupes on author+topic+claim: refreshes evidence/updatedAt and bumps timesSeen', async () => {
    const first = await recordAgentLesson(prisma, {
      authorAgent: 'robert',
      topic: 'provider_reliability',
      claim: 'model gpt-4o-mini failing repeatedly (timeout)',
      evidence: { count: 3 },
    });
    const firstUpdatedAt = first.updatedAt;

    await new Promise((resolve) => setTimeout(resolve, 5));

    const second = await recordAgentLesson(prisma, {
      authorAgent: 'robert',
      topic: 'provider_reliability',
      claim: 'model gpt-4o-mini failing repeatedly (timeout)',
      evidence: { count: 7 },
    });

    expect(prisma._store.agentLesson).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.timesSeen).toBe(2);
    expect(second.evidence).toEqual({ count: 7 });
    expect(new Date(second.updatedAt).getTime()).toBeGreaterThan(new Date(firstUpdatedAt).getTime());
  });

  it('treats a different author or a different claim as a different lesson', async () => {
    const base = { topic: 'provider_reliability', claim: 'same claim' };
    await recordAgentLesson(prisma, { ...base, authorAgent: 'robert' });
    await recordAgentLesson(prisma, { ...base, authorAgent: 'anastasia' });
    await recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'provider_reliability', claim: 'other claim' });
    expect(prisma._store.agentLesson).toHaveLength(3);
  });

  it('refuses unknown authors and topics outside the closed list', async () => {
    await expect(
      recordAgentLesson(prisma, { authorAgent: 'melissa', topic: 'provider_reliability', claim: 'x' })
    ).rejects.toThrow(/registered agent id/i);

    await expect(
      recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'gossip', claim: 'x' })
    ).rejects.toThrow(/topic must be one of/i);

    // Every allowed topic is genuinely accepted (the check is not a blanket no).
    for (const topic of LESSON_TOPICS) {
      await expect(
        recordAgentLesson(prisma, { authorAgent: 'robert', topic, claim: `claim for ${topic}` })
      ).resolves.toBeTruthy();
    }
    expect(prisma._store.agentLesson).toHaveLength(LESSON_TOPICS.length);
  });

  it('caps the claim length', async () => {
    const lesson = await recordAgentLesson(prisma, {
      authorAgent: 'robert',
      topic: 'safety_flag',
      claim: 'y'.repeat(MAX_LESSON_CLAIM_CHARS + 200),
    });
    expect(lesson.claim).toHaveLength(MAX_LESSON_CLAIM_CHARS);
  });
});

describe('getLessonsForAgent / markLessonConsumed', () => {
  it('excludes own-authored lessons and already-consumed ones', async () => {
    const mine = await recordAgentLesson(prisma, {
      authorAgent: 'anastasia', topic: 'usage_pattern', claim: 'mine',
    });
    const theirs = await recordAgentLesson(prisma, {
      authorAgent: 'robert', topic: 'usage_pattern', claim: 'theirs',
    });

    let forAnastasia = await getLessonsForAgent(prisma, 'anastasia');
    expect(forAnastasia.map((l) => l.id)).toEqual([theirs.id]);
    expect(forAnastasia.map((l) => l.id)).not.toContain(mine.id);

    await markLessonConsumed(prisma, theirs.id, 'anastasia');
    forAnastasia = await getLessonsForAgent(prisma, 'anastasia');
    expect(forAnastasia).toHaveLength(0);

    // Symmetric: Robert never sees the lesson he authored, but he does see
    // Anastasia's — teaching flows both ways, self-teaching never does.
    const forRobert = await getLessonsForAgent(prisma, 'robert');
    expect(forRobert.map((l) => l.id)).toEqual([mine.id]);
    expect(forRobert.map((l) => l.id)).not.toContain(theirs.id);
  });

  it('excludes stale lessons outside the freshness window', async () => {
    await recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'usage_pattern', claim: 'fresh' });
    prisma._store.agentLesson.push({
      id: 'stale',
      authorAgent: 'robert',
      topic: 'usage_pattern',
      claim: 'stale',
      consumedBy: {},
      timesSeen: 1,
      createdAt: new Date(Date.now() - 90 * DAY_MS),
      updatedAt: new Date(Date.now() - 90 * DAY_MS),
    });

    const lessons = await getLessonsForAgent(prisma, 'anastasia', { freshWithinDays: 14 });
    expect(lessons.map((l) => l.claim)).toEqual(['fresh']);
  });

  it('filters by topic and rejects an unknown topic filter', async () => {
    await recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'usage_pattern', claim: 'u' });
    await recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'safety_flag', claim: 's' });

    const filtered = await getLessonsForAgent(prisma, 'anastasia', { topics: ['safety_flag'] });
    expect(filtered.map((l) => l.claim)).toEqual(['s']);

    await expect(
      getLessonsForAgent(prisma, 'anastasia', { topics: ['nonsense'] })
    ).rejects.toThrow(/topic must be one of/i);
  });

  it('honours the limit', async () => {
    for (let i = 0; i < 6; i++) {
      await recordAgentLesson(prisma, { authorAgent: 'robert', topic: 'usage_pattern', claim: `c${i}` });
    }
    expect(await getLessonsForAgent(prisma, 'anastasia', { limit: 3 })).toHaveLength(3);
  });

  it('refuses to let an author consume its own lesson', async () => {
    const lesson = await recordAgentLesson(prisma, {
      authorAgent: 'robert', topic: 'safety_flag', claim: 'self',
    });
    await expect(markLessonConsumed(prisma, lesson.id, 'robert')).rejects.toThrow(/cannot consume/i);

    const stored = prisma._store.agentLesson.find((l) => l.id === lesson.id);
    expect(stored.consumedBy).toEqual({});
  });

  it('returns null for a missing lesson and refuses an unregistered consumer', async () => {
    expect(await markLessonConsumed(prisma, 'no-such-id', 'robert')).toBeNull();
    await expect(markLessonConsumed(prisma, 'no-such-id', 'melissa')).rejects.toThrow(/registered agent id/i);
  });
});

// ─── Run-start briefing ──────────────────────────────────────────────────────

describe('consumePeerBriefing', () => {
  it('returns null when there is nothing to say', async () => {
    expect(await consumePeerBriefing(prisma, 'anastasia')).toBeNull();
  });

  it('returns null (never throws) for an unregistered agent', async () => {
    expect(await consumePeerBriefing(prisma, 'melissa')).toBeNull();
    expect(await consumePeerBriefing(prisma, undefined)).toBeNull();
  });

  it('folds messages + lessons into one note and consumes them', async () => {
    await postAgentMessage(prisma, {
      fromAgent: 'robert', toAgent: 'anastasia', kind: 'provider_reliability', body: 'gpt-4o-mini is flaky',
    });
    const lesson = await recordAgentLesson(prisma, {
      authorAgent: 'robert', topic: 'provider_reliability', claim: 'model gpt-4o-mini failing repeatedly (timeout)',
    });

    const briefing = await consumePeerBriefing(prisma, 'anastasia');
    expect(briefing.note).toContain('gpt-4o-mini is flaky');
    expect(briefing.note).toContain('model gpt-4o-mini failing repeatedly (timeout)');
    expect(briefing.note).toContain('robert');
    // The note declares its own subordination to the honesty guard rails.
    expect(briefing.note).toMatch(/do not modify, relax, or override/i);
    expect(briefing.messageIds).toHaveLength(1);
    expect(briefing.lessonIds).toEqual([lesson.id]);

    // Second run gets nothing — everything was acked/consumed.
    expect(await consumePeerBriefing(prisma, 'anastasia')).toBeNull();
  });
});

// ─── Run-end teaching hook ───────────────────────────────────────────────────

describe('classifyFailure', () => {
  it('classifies without leaking the raw provider message', () => {
    expect(classifyFailure({ status: 503 })).toBe('http_503');
    expect(classifyFailure({ statusCode: 429 })).toBe('http_429');
    expect(classifyFailure(new Error('request timed out'))).toBe('timeout');
    expect(classifyFailure(new Error('socket hang up'))).toBe('connection_reset');
    expect(classifyFailure(new Error('something else entirely'))).toBe('error');
  });
});

describe('recordProviderFailureLesson', () => {
  // Shaped exactly like services/llm.js#sanitizeProviderError: a scrubbed
  // message plus the preserved HTTP status.
  const failure = Object.assign(
    new Error('LLM provider api.openai.com failed HTTP 503 after 3 attempt(s)'),
    { status: 503 }
  );

  it('ignores calls with no registered agent', async () => {
    expect(await recordProviderFailureLesson(prisma, { agent: undefined, model: 'gpt-4o-mini', error: failure })).toBeNull();
    expect(await recordProviderFailureLesson(prisma, { agent: 'melissa', model: 'gpt-4o-mini', error: failure })).toBeNull();
    expect(prisma._store.auditLog).toHaveLength(0);
  });

  it('audits every failure but teaches nothing on the first one', async () => {
    const result = await recordProviderFailureLesson(prisma, {
      agent: 'robert', model: 'gpt-4o-mini', error: failure, userId: 'u-1',
    });

    expect(result).toEqual({ count: 1, taught: false });
    expect(prisma._store.auditLog).toHaveLength(1);
    expect(prisma._store.auditLog[0].action).toBe(LLM_FAILURE_ACTION);
    expect(prisma._store.auditLog[0].metadata).toMatchObject({ model: 'gpt-4o-mini', agent: 'robert' });
    expect(prisma._store.agentLesson).toHaveLength(0);
    expect(prisma._store.agentMessage).toHaveLength(0);
  });

  it('teaches at the threshold: records a lesson AND messages the peer', async () => {
    let result;
    for (let i = 0; i < FAILURE_LESSON_THRESHOLD; i++) {
      result = await recordProviderFailureLesson(prisma, {
        agent: 'robert', model: 'gpt-4o-mini', error: failure, userId: 'u-1',
      });
    }

    expect(result.taught).toBe(true);
    expect(result.count).toBe(FAILURE_LESSON_THRESHOLD);

    const [lesson] = prisma._store.agentLesson;
    expect(lesson.authorAgent).toBe('robert');
    expect(lesson.topic).toBe('provider_reliability');
    expect(lesson.claim).toBe('model gpt-4o-mini failing repeatedly (http_503)');
    expect(lesson.evidence).toEqual({ model: 'gpt-4o-mini', kind: 'http_503', count: 3 });

    const [message] = prisma._store.agentMessage;
    expect(message.fromAgent).toBe('robert');
    expect(message.toAgent).toBe('anastasia');
    expect(message.body).toContain('gpt-4o-mini');

    // And the peer actually receives it on her next run.
    const briefing = await consumePeerBriefing(prisma, 'anastasia');
    expect(briefing.note).toContain('gpt-4o-mini');
  });

  it('counts per MODEL and only inside the 24h window', async () => {
    // Two old rows for the same model (outside the window) + two fresh rows for
    // a DIFFERENT model must not push gpt-4o-mini over the threshold.
    for (let i = 0; i < 2; i++) {
      prisma._store.auditLog.push({
        id: `old-${i}`,
        action: LLM_FAILURE_ACTION,
        entityType: 'llm',
        metadata: { model: 'gpt-4o-mini', kind: 'timeout', agent: 'robert' },
        createdAt: new Date(Date.now() - 3 * DAY_MS),
      });
      prisma._store.auditLog.push({
        id: `other-${i}`,
        action: LLM_FAILURE_ACTION,
        entityType: 'llm',
        metadata: { model: 'claude-3', kind: 'timeout', agent: 'robert' },
        createdAt: new Date(),
      });
    }

    const result = await recordProviderFailureLesson(prisma, {
      agent: 'robert', model: 'gpt-4o-mini', error: failure,
    });
    expect(result).toEqual({ count: 1, taught: false });
    expect(prisma._store.agentLesson).toHaveLength(0);
  });

  it('reuses one lesson row across repeated threshold crossings', async () => {
    for (let i = 0; i < FAILURE_LESSON_THRESHOLD + 2; i++) {
      await recordProviderFailureLesson(prisma, {
        agent: 'robert', model: 'gpt-4o-mini', error: failure,
      });
    }
    expect(prisma._store.agentLesson).toHaveLength(1);
    expect(prisma._store.agentLesson[0].timesSeen).toBe(3);
  });

  it('never writes user-supplied text into the mesh', async () => {
    const leaky = new Error('patient JANE DOE rs334 A>T said: my BRCA1 result');
    leaky.status = 500;
    for (let i = 0; i < FAILURE_LESSON_THRESHOLD; i++) {
      await recordProviderFailureLesson(prisma, { agent: 'robert', model: 'gpt-4o-mini', error: leaky });
    }

    const meshText = JSON.stringify([...prisma._store.agentLesson, ...prisma._store.agentMessage]);
    expect(meshText).not.toMatch(/JANE DOE|BRCA1|rs334/i);
    expect(meshText).toContain('gpt-4o-mini');
  });
});

describe('mesh failures never escape as prisma-shaped surprises', () => {
  it('propagates a store failure to the caller, who is responsible for fail-open', async () => {
    prisma.agentMessage.create = vi.fn(async () => {
      throw new Error('db down');
    });
    await expect(
      postAgentMessage(prisma, { fromAgent: 'robert', toAgent: 'anastasia', body: 'x' })
    ).rejects.toThrow('db down');
  });
});
