import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';

let app;
let prisma;

const USER_A = { userId: 'user-a', email: 'a@example.com', role: 'user' };
const USER_B = { userId: 'user-b', email: 'b@example.com', role: 'user' };
const cookieA = authCookie(USER_A);
const cookieB = authCookie(USER_B);

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
  it('POST /entities/medical-data — should create record', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/medical-data',
      headers: { cookie: cookieA },
      payload: { dataType: 'lab_result', content: 'WBC: 7.2', title: 'Blood Work' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.record.dataType).toBe('lab_result');
    // Content is returned plaintext to the client
    expect(body.record.content).toBe('WBC: 7.2');
  });

  it('POST /entities/medical-data — should reject missing required fields', async () => {
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
  it('POST /entities/data-deletion-request — should create request', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/entities/data-deletion-request',
      headers: { cookie: cookieA },
      payload: { deletedTypes: ['medical_data', 'search_history'] },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.request.status).toBe('pending');
    expect(body.request.userId).toBe('user-a');
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
