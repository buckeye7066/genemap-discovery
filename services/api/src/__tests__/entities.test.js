import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie, seedAuthUser } from './setup.js';

let app;
let prisma;

const USER_A = { userId: 'user-a', email: 'a@example.com', role: 'user' };
const USER_B = { userId: 'user-b', email: 'b@example.com', role: 'user' };
const cookieA = authCookie(USER_A);

/**
 * Seed a granted consent record so the medical-data write path passes
 * requireConsent. Tests that exercise the negative path can clear the
 * consentRecord store before issuing the request.
 */
function seedMedicalConsent(prisma, userId) {
  prisma._store.consentRecord.push({
    id: `consent-${userId}`,
    userId,
    consentType: 'medical_data_storage',
    version: '1.0',
    granted: true,
    createdAt: new Date(),
  });
}

beforeAll(async () => {
  prisma = createPrismaMock();
  // CSRF is enforced by default; disabled here so the existing entity tests
  // exercise route logic without re-implementing the double-submit cookie
  // pattern (CSRF itself is covered by csrf.test.js).
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  prisma._reset();
  // The new DB-hydrating authenticate middleware needs the cookie's user
  // record to exist. Seed both standard test principals on every test.
  seedAuthUser(prisma, USER_A);
  seedAuthUser(prisma, USER_B);
});

// ─── Search History ──────────────────────────────────────────────────────────

describe('Search History CRUD', () => {
  it('POST /entities/search-history — should create entry', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/search-history',
      headers: { cookie: cookieA },
      payload: { query: 'BRCA1', queryType: 'gene' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entry.query).toBe('BRCA1');
    expect(body.entry.userId).toBe('user-a');
  });

  it('POST /entities/search-history — should reject missing query', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/search-history',
      headers: { cookie: cookieA },
      payload: { queryType: 'gene' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /entities/search-history — should return only own entries', async () => {
    // Seed entries for two users
    prisma._store.searchHistory.push(
      { id: 'sh-1', userId: 'user-a', query: 'TP53', queryType: 'gene', createdAt: new Date() },
      { id: 'sh-2', userId: 'user-b', query: 'EGFR', queryType: 'gene', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/search-history',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].query).toBe('TP53');
  });

  it('DELETE /entities/search-history/:id — should delete own entry', async () => {
    prisma._store.searchHistory.push(
      { id: 'sh-1', userId: 'user-a', query: 'TP53', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/search-history/sh-1',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('DELETE /entities/search-history — should clear all own entries', async () => {
    prisma._store.searchHistory.push(
      { id: 'sh-1', userId: 'user-a', query: 'A', createdAt: new Date() },
      { id: 'sh-2', userId: 'user-a', query: 'B', createdAt: new Date() },
      { id: 'sh-3', userId: 'user-b', query: 'C', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/search-history',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    // user-b entry should survive
    expect(prisma._store.searchHistory).toHaveLength(1);
    expect(prisma._store.searchHistory[0].userId).toBe('user-b');
  });

  it('should reject unauthenticated access', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/entities/search-history',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── Medical Data ────────────────────────────────────────────────────────────

describe('Medical Data CRUD', () => {
  it('POST /entities/medical-data — should create record after consent is granted', async () => {
    seedMedicalConsent(prisma, USER_A.userId);

    const res = await app.inject({
      method: 'POST',
      url: '/entities/medical-data',
      headers: { cookie: cookieA },
      payload: { dataType: 'lab_result', content: 'WBC: 7.2', title: 'Blood Work' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.record.dataType).toBe('lab_result');
    expect(body.record.content).toBe('WBC: 7.2');
  });

  it('POST /entities/medical-data — encrypts BOTH content and metadata at rest, decrypts on read', async () => {
    // With a real key, nothing sensitive may be persisted as plaintext — and
    // metadata (a free-form blob that can hold the same genetic detail as
    // content) must be encrypted too, not just content.
    const prevKey = process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    process.env.MEDICAL_DATA_ENCRYPTION_KEY = 'a'.repeat(64);
    try {
      seedMedicalConsent(prisma, USER_A.userId);
      const secretContent = { summary: 'BRCA1 pathogenic variant', relevant_genes: ['BRCA1'] };
      const secretMetadata = { rsid: 'rs80357906', clinvar: 'pathogenic' };

      const res = await app.inject({
        method: 'POST',
        url: '/entities/medical-data',
        headers: { cookie: cookieA },
        payload: { dataType: 'genetic_test', title: 'Report', content: secretContent, metadata: secretMetadata },
      });
      expect(res.statusCode).toBe(200);

      // At rest: the stored row must NOT contain the plaintext values.
      const stored = prisma._store.medicalData.find((r) => r.userId === USER_A.userId);
      expect(typeof stored.content).toBe('string');
      expect(typeof stored.metadata).toBe('string');
      expect(stored.content).not.toContain('BRCA1');
      expect(stored.metadata).not.toContain('rs80357906');
      expect(stored.metadata).not.toContain('pathogenic');

      // The caller still gets plaintext back on write.
      const body = JSON.parse(res.body);
      expect(body.record.metadata).toEqual(secretMetadata);

      // And read decrypts both content and metadata.
      const readRes = await app.inject({
        method: 'GET',
        url: '/entities/medical-data',
        headers: { cookie: cookieA },
      });
      const read = JSON.parse(readRes.body).records[0];
      expect(read.content).toEqual(secretContent);
      expect(read.metadata).toEqual(secretMetadata);
    } finally {
      if (prevKey === undefined) delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
      else process.env.MEDICAL_DATA_ENCRYPTION_KEY = prevKey;
    }
  });

  it('POST /entities/medical-data — should refuse without consent (legacy gate)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/medical-data',
      headers: { cookie: cookieA },
      payload: { dataType: 'lab_result', content: 'WBC: 7.2' },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error).toMatch(/consent required/i);
  });

  it('POST /entities/medical-data — should reject missing required fields', async () => {
    seedMedicalConsent(prisma, USER_A.userId);

    const res = await app.inject({
      method: 'POST',
      url: '/entities/medical-data',
      headers: { cookie: cookieA },
      payload: { title: 'No content' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /entities/medical-data — should return only own records', async () => {
    prisma._store.medicalData.push(
      { id: 'md-1', userId: 'user-a', dataType: 'lab', content: 'data-a', createdAt: new Date() },
      { id: 'md-2', userId: 'user-b', dataType: 'lab', content: 'data-b', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/medical-data',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].id).toBe('md-1');
  });

  it('PUT /entities/medical-data/:id — should merge content, preserving existing fields', async () => {
    prisma._store.medicalData.push({
      id: 'md-put',
      userId: 'user-a',
      dataType: 'genetic_test',
      title: 'Genetic Test Report',
      content: { summary: 'original summary', relevant_genes: ['BRCA1'] },
      createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/medical-data/md-put',
      headers: { cookie: cookieA },
      payload: { content: { vcf_variants: [{ gene: 'TP53' }] } },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    // Patched field is added…
    expect(body.record.content.vcf_variants).toEqual([{ gene: 'TP53' }]);
    // …and pre-existing fields survive the partial update.
    expect(body.record.content.summary).toBe('original summary');
    expect(body.record.content.relevant_genes).toEqual(['BRCA1']);
  });

  it('PUT /entities/medical-data/:id — should not update another user\'s record', async () => {
    prisma._store.medicalData.push({
      id: 'md-other', userId: 'user-b', dataType: 'lab', content: { summary: 'b' }, createdAt: new Date(),
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/medical-data/md-other',
      headers: { cookie: cookieA },
      payload: { content: { summary: 'hacked' } },
    });

    expect(res.statusCode).toBe(400);
  });

  it('DELETE /entities/medical-data/:id — should delete own record', async () => {
    prisma._store.medicalData.push(
      { id: 'md-1', userId: 'user-a', dataType: 'lab', content: 'x', createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/medical-data/md-1',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
  });
});

// ─── Gene Sets ───────────────────────────────────────────────────────────────

describe('Gene Sets CRUD', () => {
  it('POST /entities/gene-sets — should create gene set', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/gene-sets',
      headers: { cookie: cookieA },
      payload: { name: 'Breast Cancer Genes', genes: ['BRCA1', 'BRCA2', 'TP53'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.set.name).toBe('Breast Cancer Genes');
    expect(body.set.genes).toEqual(['BRCA1', 'BRCA2', 'TP53']);
  });

  it('POST /entities/gene-sets — should reject missing name', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/gene-sets',
      headers: { cookie: cookieA },
      payload: { genes: ['BRCA1'] },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /entities/gene-sets — should reject missing genes', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/gene-sets',
      headers: { cookie: cookieA },
      payload: { name: 'Empty set' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /entities/gene-sets — should return only own sets', async () => {
    prisma._store.geneSet.push(
      { id: 'gs-1', userId: 'user-a', name: 'Set A', genes: ['X'], updatedAt: new Date() },
      { id: 'gs-2', userId: 'user-b', name: 'Set B', genes: ['Y'], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/gene-sets',
      headers: { cookie: cookieA },
    });

    const body = JSON.parse(res.body);
    expect(body.sets).toHaveLength(1);
    expect(body.sets[0].name).toBe('Set A');
  });

  it('PUT /entities/gene-sets/:id — should update own set', async () => {
    prisma._store.geneSet.push(
      { id: 'gs-1', userId: 'user-a', name: 'Old Name', genes: ['A'], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/gene-sets/gs-1',
      headers: { cookie: cookieA },
      payload: { name: 'New Name', genes: ['A', 'B'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.set.name).toBe('New Name');
  });

  it('PUT /entities/gene-sets/:id — should forbid updating another user\'s set', async () => {
    prisma._store.geneSet.push(
      { id: 'gs-1', userId: 'user-b', name: 'Not Mine', genes: ['Z'], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/gene-sets/gs-1',
      headers: { cookie: cookieA },
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('DELETE /entities/gene-sets/:id — should delete own set', async () => {
    prisma._store.geneSet.push(
      { id: 'gs-1', userId: 'user-a', name: 'Delete Me', genes: ['X'], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/gene-sets/gs-1',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });
});

// ─── AI Conversations ────────────────────────────────────────────────────────

describe('AI Conversations CRUD', () => {
  it('POST /entities/conversations — should create conversation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/conversations',
      headers: { cookie: cookieA },
      payload: {
        assistantType: 'genetic_counselor',
        title: 'BRCA Discussion',
        messages: [{ role: 'user', content: 'Tell me about BRCA1' }],
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversation.assistantType).toBe('genetic_counselor');
  });

  it('POST /entities/conversations — should reject missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/conversations',
      headers: { cookie: cookieA },
      payload: { title: 'No assistant type or messages' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('POST /entities/conversations — encrypts messages + metadata at rest, decrypts on read', async () => {
    // Robert/tutor chats routinely contain the user's genetic results, so the
    // conversation body must not sit in the DB as plaintext.
    const prevKey = process.env.MEDICAL_DATA_ENCRYPTION_KEY;
    process.env.MEDICAL_DATA_ENCRYPTION_KEY = 'b'.repeat(64);
    try {
      const messages = [{ role: 'user', content: 'My report shows a BRCA1 variant rs80357906' }];
      const metadata = { linkedRecordId: 'md-42' };
      // The client derives title from the first user message, so it can carry PHI.
      const title = 'My report shows a BRCA1 variant rs80357906';

      const res = await app.inject({
        method: 'POST',
        url: '/entities/conversations',
        headers: { cookie: cookieA },
        payload: { assistantType: 'robert', title, messages, metadata },
      });
      expect(res.statusCode).toBe(200);

      const stored = prisma._store.aIConversation.find((c) => c.userId === USER_A.userId);
      expect(typeof stored.messages).toBe('string');
      expect(typeof stored.metadata).toBe('string');
      expect(typeof stored.title).toBe('string');
      expect(stored.messages).not.toContain('BRCA1');
      expect(stored.messages).not.toContain('rs80357906');
      expect(stored.metadata).not.toContain('md-42');
      // The PHI-derived title must not sit in the DB as plaintext.
      expect(stored.title).not.toContain('BRCA1');
      expect(stored.title).not.toContain('rs80357906');

      // Caller gets plaintext back on write, and read decrypts.
      expect(JSON.parse(res.body).conversation.messages).toEqual(messages);
      expect(JSON.parse(res.body).conversation.title).toBe(title);
      const readRes = await app.inject({
        method: 'GET',
        url: '/entities/conversations',
        headers: { cookie: cookieA },
      });
      const conv = JSON.parse(readRes.body).conversations[0];
      expect(conv.messages).toEqual(messages);
      expect(conv.metadata).toEqual(metadata);
      expect(conv.title).toBe(title);
    } finally {
      if (prevKey === undefined) delete process.env.MEDICAL_DATA_ENCRYPTION_KEY;
      else process.env.MEDICAL_DATA_ENCRYPTION_KEY = prevKey;
    }
  });

  it('GET /entities/conversations — should return only own conversations', async () => {
    prisma._store.aIConversation.push(
      { id: 'c-1', userId: 'user-a', assistantType: 'general', messages: [], updatedAt: new Date() },
      { id: 'c-2', userId: 'user-b', assistantType: 'general', messages: [], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/conversations',
      headers: { cookie: cookieA },
    });

    const body = JSON.parse(res.body);
    expect(body.conversations).toHaveLength(1);
    expect(body.conversations[0].id).toBe('c-1');
  });

  it('PUT /entities/conversations/:id — should update own conversation', async () => {
    prisma._store.aIConversation.push(
      { id: 'c-1', userId: 'user-a', assistantType: 'general', title: 'Old', messages: [], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/conversations/c-1',
      headers: { cookie: cookieA },
      payload: { title: 'Updated Title' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.conversation.title).toBe('Updated Title');
  });

  it('PUT /entities/conversations/:id — should forbid updating another user\'s conversation', async () => {
    prisma._store.aIConversation.push(
      { id: 'c-1', userId: 'user-b', assistantType: 'general', title: 'Theirs', messages: [], updatedAt: new Date() },
    );

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/conversations/c-1',
      headers: { cookie: cookieA },
      payload: { title: 'Stolen' },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── Research Projects ───────────────────────────────────────────────────────

describe('Research Projects CRUD', () => {
  it('POST /entities/projects — should create project with initial version', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/projects',
      headers: { cookie: cookieA },
      payload: { title: 'My Research', description: 'Studying BRCA1', genes: ['BRCA1'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.project.title).toBe('My Research');
    expect(body.project.userId).toBe('user-a');

    // Should have created an initial project version
    expect(prisma.projectVersion.create).toHaveBeenCalled();
  });

  it('POST /entities/projects — should reject missing title', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/projects',
      headers: { cookie: cookieA },
      payload: { description: 'No title provided' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('PUT /entities/projects/:id — should update own project', async () => {
    prisma._store.researchProject.push({
      id: 'proj-1',
      userId: 'user-a',
      title: 'Old Title',
      description: null,
      genes: [],
      updatedAt: new Date(),
    });

    // Mock projectVersion.findFirst for the version increment logic
    prisma.projectVersion.findFirst = vi.fn(async () => ({ version: 1 }));

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/projects/proj-1',
      headers: { cookie: cookieA },
      payload: { title: 'Updated Title' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.project.title).toBe('Updated Title');
  });

  it('PUT /entities/projects/:id — should forbid updating another user\'s project', async () => {
    prisma._store.researchProject.push({
      id: 'proj-1',
      userId: 'user-b',
      title: 'Not Mine',
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'PUT',
      url: '/entities/projects/proj-1',
      headers: { cookie: cookieA },
      payload: { title: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });

  it('DELETE /entities/projects/:id — should delete own project', async () => {
    prisma._store.researchProject.push({
      id: 'proj-1',
      userId: 'user-a',
      title: 'Delete Me',
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/projects/proj-1',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).success).toBe(true);
  });

  it('DELETE /entities/projects/:id — should forbid deleting another user\'s project', async () => {
    prisma._store.researchProject.push({
      id: 'proj-1',
      userId: 'user-b',
      title: 'Not Mine',
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/entities/projects/proj-1',
      headers: { cookie: cookieA },
    });

    expect(res.statusCode).toBe(403);
  });
});

// ─── Messages (Support) ─────────────────────────────────────────────────────

describe('Messages CRUD', () => {
  it('POST /entities/messages — should create a support message', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/messages',
      headers: { cookie: cookieA },
      payload: { subject: 'Help needed', body: 'I have a question about my data.' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.message.subject).toBe('Help needed');
    expect(body.message.senderId).toBe('user-a');
  });

  it('POST /entities/messages — should reject missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/messages',
      headers: { cookie: cookieA },
      payload: { subject: 'No body' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── Consent Records ─────────────────────────────────────────────────────────

describe('Consent Records', () => {
  it('POST /entities/consent — should record consent', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/consent',
      headers: { cookie: cookieA },
      payload: { consentType: 'data_processing', version: '1.0', granted: true },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.record.consentType).toBe('data_processing');
    expect(body.record.granted).toBe(true);
  });

  it('POST /entities/consent — should reject missing fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/consent',
      headers: { cookie: cookieA },
      payload: { consentType: 'data_processing' },
    });

    expect(res.statusCode).toBe(400);
  });

  it('GET /entities/consent — should return own records', async () => {
    prisma._store.consentRecord.push(
      { id: 'cr-1', userId: 'user-a', consentType: 'hipaa', version: '1.0', granted: true, createdAt: new Date() },
      { id: 'cr-2', userId: 'user-b', consentType: 'hipaa', version: '1.0', granted: true, createdAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/consent',
      headers: { cookie: cookieA },
    });

    const body = JSON.parse(res.body);
    expect(body.records).toHaveLength(1);
    expect(body.records[0].userId).toBe('user-a');
  });
});

// ─── Data Deletion Requests ──────────────────────────────────────────────────

describe('Data Deletion Requests', () => {
  it('POST /entities/data-deletion-request — completes only the finite content purge', async () => {
    const canary = 'free-form patient deletion category';
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      prisma._store[storeName].push(
        { id: `${storeName}-a`, userId: 'user-a' },
        { id: `${storeName}-b`, userId: 'user-b' },
      );
    }

    const res = await app.inject({
      method: 'POST',
      url: '/entities/data-deletion-request',
      headers: { cookie: cookieA },
      payload: { deletedTypes: [canary] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.request).toMatchObject({
      status: 'completed',
      userId: 'user-a',
      deletedTypes: ['medicalData', 'aiConversations', 'searchHistory'],
    });
    expect(JSON.stringify(body)).not.toContain(canary);
    for (const storeName of ['medicalData', 'aIConversation', 'searchHistory']) {
      expect(prisma._store[storeName].map((row) => row.userId)).toEqual(['user-b']);
    }
    expect(JSON.stringify(prisma._store.auditLog)).not.toContain(canary);
  });

  it('returns a retained failed state instead of a stale pending success', async () => {
    const originalTransaction = prisma.$transaction;
    prisma.$transaction = vi.fn().mockRejectedValue(new Error('private database canary'));
    try {
      const res = await app.inject({
        method: 'POST',
        url: '/entities/data-deletion-request',
        headers: { cookie: cookieA },
        payload: { deletedTypes: ['patient@example.invalid'] },
      });

      expect(res.statusCode).toBe(503);
      const body = JSON.parse(res.body);
      expect(body).toMatchObject({
        code: 'DELETION_NOT_COMPLETED',
        request: { status: 'failed', userId: 'user-a' },
      });
      expect(JSON.stringify(body)).not.toMatch(/patient@example\.invalid|database canary/u);
    } finally {
      prisma.$transaction = originalTransaction;
    }
  });

  it('GET /entities/data-deletion-request — should return own requests', async () => {
    prisma._store.dataDeletionRequest.push(
      { id: 'dr-1', userId: 'user-a', status: 'pending', requestedAt: new Date() },
      { id: 'dr-2', userId: 'user-b', status: 'pending', requestedAt: new Date() },
    );

    const res = await app.inject({
      method: 'GET',
      url: '/entities/data-deletion-request',
      headers: { cookie: cookieA },
    });

    const body = JSON.parse(res.body);
    expect(body.requests).toHaveLength(1);
    expect(body.requests[0].userId).toBe('user-a');
  });
});
