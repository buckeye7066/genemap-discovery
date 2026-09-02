import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  buildTestApp,
  createPrismaMock,
  authCookie,
  seedAuthUser,
  seedPremiumSubscription,
} from './setup.js';

let app;
let prisma;

const OWNER = { userId: 'owner-1', email: 'owner@example.com', role: 'user' };
const MEMBER = { userId: 'member-1', email: 'member@example.com', role: 'user' };

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma, { csrf: false });
});

afterAll(async () => app.close());

beforeEach(() => {
  prisma._reset();
  seedAuthUser(prisma, OWNER);
  seedAuthUser(prisma, MEMBER);
  seedPremiumSubscription(prisma, OWNER.userId);
  seedPremiumSubscription(prisma, MEMBER.userId);
});

const ownerCookie = () => authCookie(OWNER, prisma);

async function createProject() {
  const res = await app.inject({
    method: 'POST',
    url: '/entities/projects',
    headers: { cookie: ownerCookie() },
    payload: { title: 'Test Project', genes: ['BRCA1'] },
  });
  expect(res.statusCode).toBe(200);
  return JSON.parse(res.body).project;
}

describe('Project collaborator role enforcement', () => {
  it('rejects a privilege-escalating role like "owner" or "admin"', async () => {
    const project = await createProject();
    const res = await app.inject({
      method: 'POST',
      url: `/entities/projects/${project.id}/collaborators`,
      headers: { cookie: ownerCookie() },
      payload: { userEmail: MEMBER.email, role: 'owner' },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/role must be one of/i);
  });

  it('accepts a valid editor role and is idempotent (no duplicate rows)', async () => {
    const project = await createProject();
    const payload = { userEmail: MEMBER.email, role: 'editor' };

    const first = await app.inject({
      method: 'POST', url: `/entities/projects/${project.id}/collaborators`,
      headers: { cookie: ownerCookie() }, payload,
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: 'POST', url: `/entities/projects/${project.id}/collaborators`,
      headers: { cookie: ownerCookie() }, payload: { userEmail: MEMBER.email, role: 'viewer' },
    });
    expect(second.statusCode).toBe(200);

    // Exactly one collaborator row exists, with the updated role.
    const rows = prisma._store.projectCollaborator.filter(
      (c) => c.projectId === project.id && c.userId === MEMBER.userId,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('viewer');
  });

  it('refuses to add the owner as their own collaborator', async () => {
    const project = await createProject();
    const res = await app.inject({
      method: 'POST', url: `/entities/projects/${project.id}/collaborators`,
      headers: { cookie: ownerCookie() }, payload: { userEmail: OWNER.email, role: 'editor' },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('Institutional license seat safety', () => {
  function seedLicense({
    id = 'lic-1',
    maxSeats = 1,
    status = 'active',
    startDate,
    endDate,
    stripeCustomerId = 'cus_institution_owner',
  } = {}) {
    const now = Date.now();
    const license = {
      id, maxSeats, assignedSeats: 0, adminUsers: [OWNER.userId],
      organizationName: 'Test Institute', contactEmail: 'billing@example.com', licenseType: 'team',
      status, startDate: startDate || new Date(now - 60_000),
      endDate: endDate || new Date(now + 86_400_000), renewalDate: new Date(now + 86_400_000),
      autoRenew: true, stripeCustomerId, stripeSubscriptionId: 'sub_institution_owner',
      pricing: { monthly: 7.99 },
      createdAt: new Date(), updatedAt: new Date(),
    };
    prisma._store.institutionalLicense.push(license);
    return license;
  }

  it('returns only the owner-facing license projection and withholds Stripe/internal ownership fields', async () => {
    const license = seedLicense({ maxSeats: 5 });
    license.assignments = [{
      id: 'seat-safe', userEmail: 'seat@example.com', status: 'active',
      department: 'Research', assignedBy: OWNER.userId, invitationSent: false,
      createdAt: new Date(), updatedAt: new Date(),
    }];
    license.usageLogs = [{
      id: 'usage-safe', userEmail: 'seat@example.com', action: 'seat_assigned',
      metadata: { assignedBy: OWNER.userId }, createdAt: new Date(),
    }];

    const res = await app.inject({
      method: 'GET', url: '/entities/licenses', headers: { cookie: ownerCookie() },
    });

    expect(res.statusCode).toBe(200);
    const [returned] = JSON.parse(res.body).licenses;
    expect(returned).toMatchObject({
      id: license.id,
      organizationName: 'Test Institute',
      canManageBilling: true,
      assignments: [expect.objectContaining({ userEmail: 'seat@example.com' })],
      usageLogs: [expect.objectContaining({ action: 'seat_assigned' })],
    });
    expect(returned).not.toHaveProperty('adminUsers');
    expect(returned).not.toHaveProperty('stripeCustomerId');
    expect(returned).not.toHaveProperty('stripeSubscriptionId');
    expect(returned).not.toHaveProperty('pricing');
    expect(returned.assignments[0]).not.toHaveProperty('assignedBy');
    expect(returned.usageLogs[0]).not.toHaveProperty('metadata');
  });

  it('allows a historical owner to view renewal state without restoring the expired tier', async () => {
    seedLicense({ status: 'expired', endDate: new Date(Date.now() - 1_000) });

    const res = await app.inject({
      method: 'GET', url: '/entities/licenses', headers: { cookie: ownerCookie() },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).licenses).toHaveLength(1);
  });

  it('does not grant organization management to an assigned institutional seat', async () => {
    const license = seedLicense({ maxSeats: 5 });
    prisma._store.licenseAssignment.push({
      id: 'member-seat',
      licenseId: license.id,
      userEmail: MEMBER.email,
      status: 'active',
      license,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'GET',
      url: '/entities/licenses',
      headers: { cookie: authCookie(MEMBER, prisma) },
    });

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({
      code: 'ENTITLEMENT_REQUIRED',
      details: { entitlement: { feature: 'institution.manage', currentTier: 'institutional' } },
    });
  });

  it('assigns a seat, then rejects a duplicate active seat for the same user', async () => {
    seedLicense({ maxSeats: 5 });

    const first = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'seat@example.com' },
    });
    expect(first.statusCode).toBe(200);

    const dup = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'Seat@Example.com' },
    });
    expect(dup.statusCode).toBe(400);
    expect(JSON.parse(dup.body).error).toMatch(/already has an active seat/i);

    // Only one seat consumed despite two requests.
    const lic = prisma._store.institutionalLicense.find((l) => l.id === 'lic-1');
    expect(lic.assignedSeats).toBe(1);
  });

  it('rejects assignment when no seats remain', async () => {
    seedLicense({ maxSeats: 1 });

    const ok = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'a@example.com' },
    });
    expect(ok.statusCode).toBe(200);

    const full = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'b@example.com' },
    });
    expect(full.statusCode).toBe(400);
    expect(JSON.parse(full.body).error).toMatch(/no available seats/i);
  });

  it('releasing a seat decrements the counter and never goes negative', async () => {
    seedLicense({ maxSeats: 2 });

    const assign = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'c@example.com' },
    });
    const assignmentId = JSON.parse(assign.body).assignment.id;

    const del = await app.inject({
      method: 'DELETE', url: `/entities/licenses/lic-1/assignments/${assignmentId}`,
      headers: { cookie: ownerCookie() },
    });
    expect(del.statusCode).toBe(200);

    const lic = prisma._store.institutionalLicense.find((l) => l.id === 'lic-1');
    expect(lic.assignedSeats).toBe(0);
  });

  it('denies seat administration to a non-admin of the license', async () => {
    seedLicense({ maxSeats: 5 });
    const res = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: authCookie(MEMBER, prisma) }, payload: { userEmail: 'x@example.com' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('cannot assign seats to an expired target license through another valid administrator entitlement', async () => {
    const now = Date.now();
    seedLicense({ endDate: new Date(now - 1_000) });
    seedLicense({ id: 'lic-current', maxSeats: 5 });

    const res = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'late@example.com' },
    });

    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/active, current license/i);
    expect(prisma._store.licenseAssignment).toHaveLength(0);
    expect(prisma._store.institutionalLicense.find((row) => row.id === 'lic-1').assignedSeats).toBe(0);
  });

  it('assigns a bulk seat request atomically and normalizes every email', async () => {
    seedLicense({ maxSeats: 3 });

    const res = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign-bulk',
      headers: { cookie: ownerCookie() },
      payload: {
        userEmails: [' First@Example.com ', 'second@example.com'],
        department: 'Research',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).assignments.map((row) => row.userEmail)).toEqual([
      'first@example.com',
      'second@example.com',
    ]);
    expect(prisma._store.licenseAssignment).toHaveLength(2);
    expect(prisma._store.licenseUsageLog).toHaveLength(2);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(2);
  });

  it('leaves the full batch unapplied when capacity is insufficient', async () => {
    seedLicense({ maxSeats: 1 });

    const res = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign-bulk',
      headers: { cookie: ownerCookie() },
      payload: { userEmails: ['one@example.com', 'two@example.com'] },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.licenseAssignment).toHaveLength(0);
    expect(prisma._store.licenseUsageLog).toHaveLength(0);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(0);
  });

  it('leaves the new addresses unapplied when any address already has a seat', async () => {
    seedLicense({ maxSeats: 4 });
    const first = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign',
      headers: { cookie: ownerCookie() }, payload: { userEmail: 'existing@example.com' },
    });
    expect(first.statusCode).toBe(200);

    const res = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign-bulk',
      headers: { cookie: ownerCookie() },
      payload: { userEmails: ['existing@example.com', 'new@example.com'] },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma._store.licenseAssignment.map((row) => row.userEmail)).toEqual([
      'existing@example.com',
    ]);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(1);
  });

  it('rejects invalid or repeated email addresses before reserving seats', async () => {
    seedLicense({ maxSeats: 4 });

    const invalid = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign-bulk',
      headers: { cookie: ownerCookie() },
      payload: { userEmails: ['not-an-email', 'valid@example.com'] },
    });
    expect(invalid.statusCode).toBe(400);

    const duplicate = await app.inject({
      method: 'POST', url: '/entities/licenses/lic-1/assign-bulk',
      headers: { cookie: ownerCookie() },
      payload: { userEmails: ['same@example.com', 'Same@Example.com'] },
    });
    expect(duplicate.statusCode).toBe(400);
    expect(prisma._store.licenseAssignment).toHaveLength(0);
    expect(prisma._store.institutionalLicense[0].assignedSeats).toBe(0);
  });
});

describe('Entities input bounds', () => {
  it('rejects a gene set with an oversized genes array', async () => {
    const genes = Array.from({ length: 5001 }, (_, i) => `G${i}`);
    const res = await app.inject({
      method: 'POST', url: '/entities/gene-sets',
      headers: { cookie: ownerCookie() }, payload: { name: 'big', genes },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/items or fewer/i);
  });

  it('rejects non-string entries in a genes array', async () => {
    const res = await app.inject({
      method: 'POST', url: '/entities/gene-sets',
      headers: { cookie: ownerCookie() }, payload: { name: 'bad', genes: ['BRCA1', 42] },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/only strings/i);
  });

  it('rejects an over-long message body', async () => {
    const res = await app.inject({
      method: 'POST', url: '/entities/messages',
      headers: { cookie: ownerCookie() },
      payload: { subject: 'hi', body: 'x'.repeat(20001) },
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toMatch(/characters or fewer/i);
  });

  it('accepts a normal gene set (guards do not reject valid payloads)', async () => {
    const res = await app.inject({
      method: 'POST', url: '/entities/gene-sets',
      headers: { cookie: ownerCookie() },
      payload: { name: 'My set', description: 'notes', genes: ['BRCA1', 'TP53'], metadata: { tags: ['x'] } },
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).set.genes).toEqual(['BRCA1', 'TP53']);
  });
});
