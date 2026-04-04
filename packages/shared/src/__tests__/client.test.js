import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApiClient } from '../client.js';

// ── Fetch mock ───────────────────────────────────────────────────────────────

let fetchCalls;

function createFetchMock() {
  fetchCalls = [];
  return vi.fn(async (url, config) => {
    fetchCalls.push({ url, ...config });
    return {
      ok: true,
      json: async () => ({ ok: true }),
    };
  });
}

let client;

beforeEach(() => {
  global.fetch = createFetchMock();
  client = new ApiClient('http://localhost:3000');
});

// ── Constructor ──────────────────────────────────────────────────────────────

describe('ApiClient constructor', () => {
  it('should create instance with custom baseURL', () => {
    const c = new ApiClient('https://api.example.com');
    expect(c.baseURL).toBe('https://api.example.com');
  });
});

// ── Auth endpoints ───────────────────────────────────────────────────────────

describe('Auth methods', () => {
  it('register() should POST to /auth/register', async () => {
    await client.register({ email: 'a@b.com', password: 'test1234' });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/auth/register');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ email: 'a@b.com', password: 'test1234' });
  });

  it('login() should POST to /auth/login', async () => {
    await client.login({ email: 'a@b.com', password: 'test1234' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/auth/login');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('logout() should POST to /auth/logout', async () => {
    await client.logout();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/auth/logout');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('getMe() should GET /auth/me', async () => {
    await client.getMe();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/auth/me');
    expect(fetchCalls[0].method).toBeUndefined(); // GET is the default
  });

  it('updateProfile() should PUT /auth/me', async () => {
    await client.updateProfile({ displayName: 'Alice' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/auth/me');
    expect(fetchCalls[0].method).toBe('PUT');
  });
});

// ── Entity endpoints ─────────────────────────────────────────────────────────

describe('Entity methods', () => {
  it('getSearchHistory() should GET /entities/search-history', async () => {
    await client.getSearchHistory();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/search-history');
  });

  it('saveSearchHistory() should POST /entities/search-history', async () => {
    await client.saveSearchHistory({ query: 'BRCA1' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/search-history');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('deleteSearchHistory(id) should DELETE /entities/search-history/:id', async () => {
    await client.deleteSearchHistory('abc');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/search-history/abc');
    expect(fetchCalls[0].method).toBe('DELETE');
  });

  it('deleteSearchHistory() without id should DELETE /entities/search-history', async () => {
    await client.deleteSearchHistory();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/search-history');
    expect(fetchCalls[0].method).toBe('DELETE');
  });

  it('getMedicalData() should GET /entities/medical-data', async () => {
    await client.getMedicalData();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/medical-data');
  });

  it('getMedicalData(type) should include dataType query param', async () => {
    await client.getMedicalData('lab_result');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/medical-data?dataType=lab_result');
  });

  it('saveMedicalData() should POST /entities/medical-data', async () => {
    await client.saveMedicalData({ dataType: 'lab', content: 'data' });
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('deleteMedicalData(id) should DELETE /entities/medical-data/:id', async () => {
    await client.deleteMedicalData('xyz');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/medical-data/xyz');
    expect(fetchCalls[0].method).toBe('DELETE');
  });

  it('getGeneSets() should GET /entities/gene-sets', async () => {
    await client.getGeneSets();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/gene-sets');
  });

  it('saveGeneSet() should POST /entities/gene-sets', async () => {
    await client.saveGeneSet({ name: 'Set', genes: ['A'] });
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('updateGeneSet(id, data) should PUT /entities/gene-sets/:id', async () => {
    await client.updateGeneSet('gs-1', { name: 'Updated' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/gene-sets/gs-1');
    expect(fetchCalls[0].method).toBe('PUT');
  });

  it('deleteGeneSet(id) should DELETE /entities/gene-sets/:id', async () => {
    await client.deleteGeneSet('gs-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/gene-sets/gs-1');
    expect(fetchCalls[0].method).toBe('DELETE');
  });

  it('getConversations() should GET /entities/conversations', async () => {
    await client.getConversations();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/conversations');
  });

  it('getConversations(type) should include assistantType query', async () => {
    await client.getConversations('genetic_counselor');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/conversations?assistantType=genetic_counselor');
  });

  it('saveConversation() should POST /entities/conversations', async () => {
    await client.saveConversation({ assistantType: 'general', messages: [] });
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('updateConversation(id, data) should PUT /entities/conversations/:id', async () => {
    await client.updateConversation('c-1', { title: 'New' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/conversations/c-1');
    expect(fetchCalls[0].method).toBe('PUT');
  });

  it('getProjects() should GET /entities/projects', async () => {
    await client.getProjects();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/projects');
  });

  it('createProject() should POST /entities/projects', async () => {
    await client.createProject({ title: 'New Project' });
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('updateProject(id, data) should PUT /entities/projects/:id', async () => {
    await client.updateProject('p-1', { title: 'Updated' });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/projects/p-1');
    expect(fetchCalls[0].method).toBe('PUT');
  });

  it('deleteProject(id) should DELETE /entities/projects/:id', async () => {
    await client.deleteProject('p-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/projects/p-1');
    expect(fetchCalls[0].method).toBe('DELETE');
  });
});

// ── Admin endpoints ──────────────────────────────────────────────────────────

describe('Admin methods', () => {
  it('getUsers() should GET /admin/users', async () => {
    await client.getUsers();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/users');
  });

  it('getUsers(params) should append query string', async () => {
    await client.getUsers({ search: 'alice', page: '2' });
    expect(fetchCalls[0].url).toContain('/admin/users?');
    expect(fetchCalls[0].url).toContain('search=alice');
  });

  it('banUser() should POST /admin/ban', async () => {
    await client.banUser('u-1', 'Spam');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/ban');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ userId: 'u-1', reason: 'Spam' });
  });

  it('unbanUser() should POST /admin/unban', async () => {
    await client.unbanUser('u-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/unban');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('getAdminAnalytics() should GET /admin/analytics', async () => {
    await client.getAdminAnalytics();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/analytics');
  });

  it('deleteUser(id) should DELETE /admin/users/:id', async () => {
    await client.deleteUser('u-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/users/u-1');
    expect(fetchCalls[0].method).toBe('DELETE');
  });

  it('grantPremium() should POST /admin/grant-premium', async () => {
    await client.grantPremium('u-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/grant-premium');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('grantAdmin() should POST /admin/grant-admin', async () => {
    await client.grantAdmin('u-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/grant-admin');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('searchUsers() should POST /admin/search-users', async () => {
    await client.searchUsers('alice');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/search-users');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('getBannedUsers() should GET /admin/banned', async () => {
    await client.getBannedUsers();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/banned');
  });
});

// ── Genomics endpoints ───────────────────────────────────────────────────────

describe('Genomics methods', () => {
  it('lookupVariant() should GET /genomics/variant/:id', async () => {
    await client.lookupVariant('rs123');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/genomics/variant/rs123');
  });

  it('lookupGene() should GET /genomics/gene/:symbol', async () => {
    await client.lookupGene('BRCA1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/genomics/gene/BRCA1');
  });

  it('searchClinVar() should GET /genomics/clinvar/search with query', async () => {
    await client.searchClinVar('pathogenic');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/genomics/clinvar/search?q=pathogenic');
  });
});

// ── Clinical Trials ──────────────────────────────────────────────────────────

describe('Clinical Trials methods', () => {
  it('searchClinicalTrials() should GET /clinical-trials/search', async () => {
    await client.searchClinicalTrials({ condition: 'cancer', gene: 'BRCA1' });
    expect(fetchCalls[0].url).toContain('/clinical-trials/search?');
    expect(fetchCalls[0].url).toContain('condition=cancer');
    expect(fetchCalls[0].url).toContain('gene=BRCA1');
  });

  it('getClinicalTrial(nctId) should GET /clinical-trials/:nctId', async () => {
    await client.getClinicalTrial('NCT001');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/clinical-trials/NCT001');
  });
});

// ── Consent / HIPAA ──────────────────────────────────────────────────────────

describe('Consent and data deletion methods', () => {
  it('recordConsent() should POST /entities/consent', async () => {
    await client.recordConsent({ consentType: 'hipaa', version: '1.0', granted: true });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/consent');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('getConsentRecords() should GET /entities/consent', async () => {
    await client.getConsentRecords();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/consent');
  });

  it('requestDataDeletion() should POST /entities/data-deletion-request', async () => {
    await client.requestDataDeletion({ deletedTypes: ['medical_data'] });
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/data-deletion-request');
    expect(fetchCalls[0].method).toBe('POST');
  });

  it('getDeletionRequestStatus() should GET /entities/data-deletion-request', async () => {
    await client.getDeletionRequestStatus();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/data-deletion-request');
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('Error handling', () => {
  it('should throw on non-ok response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Unauthorized' }),
    }));

    await expect(client.getMe()).rejects.toThrow('Unauthorized');
  });

  it('should throw generic error if JSON parse fails on error response', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => { throw new Error('not json'); },
    }));

    await expect(client.getMe()).rejects.toThrow('Request failed');
  });
});
