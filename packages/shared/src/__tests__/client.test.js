import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ApiClient, sanitizeBaseURL, setCsrfToken } from '../client.js';

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

describe('sanitizeBaseURL (guards against CR/LF-polluted env values)', () => {
  it('strips control characters, trims, and removes trailing slashes', () => {
    expect(sanitizeBaseURL('https://genemap-api-production.up.railway.app\r\n')).toBe(
      'https://genemap-api-production.up.railway.app',
    );
    expect(sanitizeBaseURL('https://x.com\n')).toBe('https://x.com');
    expect(sanitizeBaseURL('  https://api.example.com/  ')).toBe('https://api.example.com');
    expect(sanitizeBaseURL('')).toBe('');
    expect(sanitizeBaseURL(undefined)).toBe('');
    expect(sanitizeBaseURL(null)).toBe('');
  });

  it('a CR/LF-polluted baseURL still yields a well-formed request URL', async () => {
    const c = new ApiClient('https://genemap-api-production.up.railway.app\r\n');
    expect(c.baseURL).toBe('https://genemap-api-production.up.railway.app');
    await c.request('/auth/me', { method: 'GET' });
    expect(fetchCalls[0].url).toBe('https://genemap-api-production.up.railway.app/auth/me');
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

  // ── Base44 → backend contract adapter (regression: "dataType and content
  //    are required" upload failure) ──────────────────────────────────────
  it('saveMedicalData() maps the UI shape (file_type + flat fields) into {dataType, content}', async () => {
    await client.saveMedicalData({
      file_type: 'genetic_test',
      summary: 'A summary',
      relevant_genes: ['BRCA1'],
      phenotypes_identified: ['cancer'],
      notes: 'hi',
      file_name: 'report.txt',
      extracted_data: { key_findings: ['f1'] },
    });
    expect(fetchCalls[0].method).toBe('POST');
    const sent = JSON.parse(fetchCalls[0].body);
    expect(sent.dataType).toBe('genetic_test'); // derived from file_type
    expect(sent.content.summary).toBe('A summary');
    expect(sent.content.relevant_genes).toEqual(['BRCA1']);
    expect(sent.content.phenotypes_identified).toEqual(['cancer']);
    expect(sent.content.extracted_data).toEqual({ key_findings: ['f1'] });
    expect(sent.content.file_name).toBe('report.txt');
  });

  it('saveMedicalData({id}) routes to PUT for a partial update', async () => {
    await client.saveMedicalData({ id: 'md-1', vcf_variants: [{ gene: 'TP53' }] });
    expect(fetchCalls[0].method).toBe('PUT');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/medical-data/md-1');
    const sent = JSON.parse(fetchCalls[0].body);
    expect(sent.content.vcf_variants).toEqual([{ gene: 'TP53' }]);
  });

  it('saveMedicalData({id, _delete}) routes to DELETE', async () => {
    await client.saveMedicalData({ id: 'md-1', _delete: true });
    expect(fetchCalls[0].method).toBe('DELETE');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/entities/medical-data/md-1');
  });

  it('saveMedicalData({_shareAction}) throws (no backend sharing model)', async () => {
    await expect(client.saveMedicalData({ _shareAction: true, record_id: 'x' })).rejects.toThrow(/sharing/i);
    expect(fetchCalls).toHaveLength(0);
  });

  it('getMedicalData() flattens content back into UI fields', async () => {
    global.fetch = vi.fn(async (url, config) => {
      fetchCalls.push({ url, ...config });
      return {
        ok: true,
        json: async () => ({
          records: [
            {
              id: 'md-1',
              dataType: 'genetic_test',
              title: 'Genetic Test Report',
              createdAt: '2026-07-11T00:00:00.000Z',
              content: { summary: 'S', relevant_genes: ['BRCA1'], phenotypes_identified: ['x'] },
            },
          ],
        }),
      };
    });
    const records = await client.getMedicalData();
    expect(records).toHaveLength(1);
    const r = records[0];
    expect(r.file_type).toBe('genetic_test'); // UI reads file_type
    expect(r.summary).toBe('S');
    expect(r.relevant_genes).toEqual(['BRCA1']);
    expect(r.phenotypes_identified).toEqual(['x']);
    expect(r.created_date).toBe('2026-07-11T00:00:00.000Z'); // UI reads created_date
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

  it('grantFreePeriod() should POST a 7-day free period', async () => {
    await client.grantFreePeriod('u-1', 'week');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/grant-free-period');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ userId: 'u-1', period: 'week' });
  });

  it('grantFreePeriod() should POST a 30-day free period', async () => {
    await client.grantFreePeriod('u-1', 'month');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/grant-free-period');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ userId: 'u-1', period: 'month' });
  });

  it('grantFreePeriodAll() should POST a bulk free-period grant', async () => {
    await client.grantFreePeriodAll('month');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/grant-free-period');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ scope: 'all', period: 'month' });
  });

  it('revokeFreePeriod() should POST /admin/revoke-free-period', async () => {
    await client.revokeFreePeriod('u-1');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/revoke-free-period');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ userId: 'u-1' });
  });

  it('revokeFreePeriodAll() should POST a bulk revoke request', async () => {
    await client.revokeFreePeriodAll();
    expect(fetchCalls[0].url).toBe('http://localhost:3000/admin/revoke-free-period');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({ scope: 'all' });
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

  it('parseVcf() should POST /genomics/vcf/parse', async () => {
    await client.parseVcf('#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO', 25);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/genomics/vcf/parse');
    expect(fetchCalls[0].method).toBe('POST');
    expect(JSON.parse(fetchCalls[0].body)).toEqual({
      text: '#CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO',
      maxVariants: 25,
    });
  });

  it('enrichVcfVariants() should POST /genomics/vcf/enrich', async () => {
    await client.enrichVcfVariants([{
      chromosome: 'chr1',
      position: 10,
      referenceAllele: 'A',
      alternateAllele: 'G',
      ref: 'A',
      alt: 'G',
      variantType: 'SNV',
      variant_type: 'SNV',
      stableVariantKey: 'chr1:10:A>G',
    }]);
    expect(fetchCalls[0].url).toBe('http://localhost:3000/genomics/vcf/enrich');
    expect(fetchCalls[0].method).toBe('POST');
  });
});

// ── Clinical Trials ──────────────────────────────────────────────────────────

describe('Clinical Trials methods', () => {
  it('searchClinicalTrials() should GET /clinical-trials/search', async () => {
    global.fetch = vi.fn(async (url, config) => {
      fetchCalls.push({ url, ...config });
      return {
        ok: true,
        json: async () => ({ totalCount: 1, studies: [{ nctId: 'NCT001', title: 'Trial' }] }),
      };
    });
    const result = await client.searchClinicalTrials({ condition: 'cancer', gene: 'BRCA1' });
    expect(fetchCalls[0].url).toContain('/clinical-trials/search?');
    expect(fetchCalls[0].url).toContain('condition=cancer');
    expect(fetchCalls[0].url).toContain('gene=BRCA1');
    expect(result).toEqual({ totalCount: 1, studies: [{ nctId: 'NCT001', title: 'Trial' }] });
  });

  it('getClinicalTrial(nctId) should GET /clinical-trials/:nctId', async () => {
    global.fetch = vi.fn(async (url, config) => {
      fetchCalls.push({ url, ...config });
      return {
        ok: true,
        json: async () => ({ study: { nctId: 'NCT001', title: 'Trial' } }),
      };
    });
    const result = await client.getClinicalTrial('NCT001');
    expect(fetchCalls[0].url).toBe('http://localhost:3000/clinical-trials/NCT001');
    expect(result).toEqual({ study: { nctId: 'NCT001', title: 'Trial' } });
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

  it('should throw a clear error on an empty 200 body (timed-out gateway)', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => { throw new Error('Unexpected end of JSON input'); },
    }));

    await expect(client.getMe()).rejects.toThrow(/empty response/i);
  });

  it('should throw a readable error on a non-JSON 200 body', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => '<html>502 Bad Gateway</html>',
      json: async () => { throw new Error('Unexpected token <'); },
    }));

    await expect(client.getMe()).rejects.toThrow(/unreadable response/i);
  });
});

// ── Silent token refresh on 401 ───────────────────────────────────────────────

describe('401 auto-refresh interceptor', () => {
  afterEach(() => {
    // The CSRF token cache is module-level + in-memory; reset between tests so
    // the "no prior session" guard test isn't polluted by an earlier login.
    setCsrfToken(null);
  });

  it('refreshes the access token once and replays the original request', async () => {
    setCsrfToken('csrf-abc'); // simulate a prior authenticated session
    let meCalls = 0;
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-new' }) };
      }
      // First /auth/me 401s (expired access token); the replay succeeds.
      meCalls += 1;
      if (meCalls === 1) {
        return { ok: false, status: 401, json: async () => ({ error: 'Authentication required' }) };
      }
      return { ok: true, status: 200, json: async () => ({ id: 'u1', email: 'a@b.com' }) };
    });

    const user = await client.getMe();
    expect(user).toEqual({ id: 'u1', email: 'a@b.com' });
    expect(meCalls).toBe(2); // original + one replay
    const refreshCalls = global.fetch.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });

  it('propagates the 401 when refresh fails', async () => {
    setCsrfToken('csrf-abc');
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        return { ok: false, status: 401, json: async () => ({ error: 'No refresh token' }) };
      }
      return { ok: false, status: 401, json: async () => ({ error: 'Authentication required' }) };
    });

    await expect(client.getMe()).rejects.toThrow('Authentication required');
  });

  it('does NOT attempt refresh for an anonymous visitor (no cached CSRF token)', async () => {
    // No setCsrfToken — represents a logged-out visitor whose getMe 401s.
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Authentication required' }),
    }));

    await expect(client.getMe()).rejects.toThrow('Authentication required');
    const refreshCalls = global.fetch.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(0);
  });

  it('does NOT recurse when /auth/refresh itself 401s during a login flow', async () => {
    setCsrfToken('csrf-abc');
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      json: async () => ({ error: 'Invalid credentials' }),
    }));

    // login() is in NO_REFRESH_PATHS, so a 401 must surface immediately with
    // exactly one network call — no refresh attempt, no retry storm.
    await expect(client.login({ email: 'a@b.com', password: 'wrong' })).rejects.toThrow(
      'Invalid credentials',
    );
    expect(global.fetch.mock.calls).toHaveLength(1);
  });

  it('de-duplicates concurrent 401s into a single refresh (single-flight)', async () => {
    setCsrfToken('csrf-abc');
    const expired = new Set();
    global.fetch = vi.fn(async (url) => {
      if (url.endsWith('/auth/refresh')) {
        return { ok: true, status: 200, json: async () => ({ csrfToken: 'csrf-new' }) };
      }
      // Each distinct endpoint 401s once, then succeeds on replay.
      if (!expired.has(url)) {
        expired.add(url);
        return { ok: false, status: 401, json: async () => ({ error: 'Authentication required' }) };
      }
      return { ok: true, status: 200, json: async () => ({ entries: [] }) };
    });

    await Promise.all([
      client.getSearchHistory(),
      client.getUserActivity(),
    ]);

    const refreshCalls = global.fetch.mock.calls.filter(([u]) => u.endsWith('/auth/refresh'));
    expect(refreshCalls).toHaveLength(1);
  });
});
