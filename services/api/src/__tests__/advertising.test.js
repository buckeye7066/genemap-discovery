import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import sharp from 'sharp';
import advertisingRoutes, { advertisingLinkRoutes } from '../routes/advertising.js';
import { activeWhere, creativeData, isAdvertisingOwner, rasterImage, signDisplay, verifyDisplay, viewerHash } from '../services/advertising.js';
import { authCookie } from './setup.js';
import { requireCsrf, __test__ as csrf } from '../middleware/csrf.js';

const ownerId = crypto.randomUUID();
const ordinaryId = crypto.randomUUID();
const adminId = crypto.randomUUID();
const otherSuperId = crypto.randomUUID();
const viewer = crypto.randomUUID();
let app;
let ads;
let events;
let users;
let image;
const input = () => ({ advertiser: 'Example advertiser', headline: 'An educational event', body: 'Details', targetUrl: 'https://example.org/event', seconds: 15, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), paused: false });
const matches = (row, where) => Object.entries(where).every(([key, value]) => value && typeof value === 'object' ? (!('lte' in value) || row[key] <= value.lte) && (!('gt' in value) || row[key] > value.gt) : row[key] === value);
const project = (row, select) => !row ? null : select ? Object.fromEntries(Object.keys(select).map((key) => [key, row[key]])) : row;
const request = (method, url, body, id = ownerId, claimedRole = 'super_admin') => {
  const token = csrf.issueCsrfToken(id);
  return app.inject({ method, url: `/advertising${url}`, ...(body === undefined ? {} : { payload: body }), headers: { cookie: `${authCookie({ userId: id, email: 'test@example.invalid', role: claimedRole })}; csrfToken=${token}`, 'x-csrf-token': token } });
};
beforeEach(async () => {
  process.env.ADVERTISING_OWNER_USER_ID = ownerId;
  ads = []; events = [];
  users = [ { id: ownerId, role: 'super_admin' }, { id: ordinaryId, role: 'user' }, { id: adminId, role: 'admin' }, { id: otherSuperId, role: 'super_admin' } ];
  image = `data:image/png;base64,${(await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer()).toString('base64')}`;
  app = Fastify();
  app.decorate('prisma', {
    user: { findUnique: async ({ where }) => users.find((user) => user.id === where.id) },
    adCreative: {
      findMany: async ({ where, select }) => ads.filter((ad) => matches(ad, where)).map((ad) => project(ad, select)),
      findFirst: async ({ where, select }) => project(ads.find((ad) => matches(ad, where)), select),
      count: async ({ where }) => ads.filter((ad) => matches(ad, where)).length,
      create: async ({ data, select }) => { const ad = { id: crypto.randomUUID(), revision: 1, deletedAt: null, ...data }; ads.push(ad); return project(ad, select); },
      updateMany: async ({ where, data }) => { const selected = ads.filter((ad) => matches(ad, where)); selected.forEach((ad) => { const revision = ad.revision + 1; Object.assign(ad, data, { revision }); }); return { count: selected.length }; },
    },
    adEvent: {
      findUnique: async ({ where }) => events.find((event) => matches(event, where.displayKey_kind)),
      createMany: async ({ data }) => { let count = 0; for (const event of data) { if (!events.some((entry) => entry.displayKey === event.displayKey && entry.kind === event.kind)) { events.push({ id: crypto.randomUUID(), ...event }); count++; } } return { count }; },
    },
    $queryRaw: async () => [],
  });
  await app.register(cookie);
  app.addHook('preHandler', requireCsrf);
  app.setErrorHandler((error, _request, reply) => reply.code(error.statusCode || (error.name === 'ZodError' ? 400 : 500)).send({ error: 'Rejected' }));
  await app.register(advertisingRoutes, { prefix: '/advertising' });
  await app.register(advertisingLinkRoutes, { prefix: '/advertising-link' });
  await app.ready();
});
afterEach(async () => { delete process.env.ADVERTISING_OWNER_USER_ID; await app.close(); });

describe('owner authorization and independent sessions', () => {
  it('fails closed with no owner configuration, no email or generic-role fallback', () => {
    expect(isAdvertisingOwner({ userId: ownerId, role: 'super_admin' }, {})).toBe(false);
    expect(isAdvertisingOwner({ userId: otherSuperId, role: 'super_admin' })).toBe(false);
    expect(isAdvertisingOwner({ userId: ownerId, role: 'user' })).toBe(false);
  });
  it('rejects every guest API, owner-ID query and claimed role', async () => {
    for (const [method, url] of [['GET', '/feed'], ['GET', '/manage'], ['GET', '/manage/stats'], ['POST', '/manage'], ['PUT', `/manage/${ownerId}`], ['DELETE', `/manage/${ownerId}`]]) {
      expect((await app.inject({ method, url: `/advertising${url}?userId=${ownerId}&role=super_admin` })).statusCode).toBe(401);
    }
  });
  it('DB-hydrates roles; only pinned owner can manage; ordinary users view published ads', async () => {
    for (const id of [ordinaryId, adminId, otherSuperId]) {
      expect((await request('GET', '/capability', undefined, id)).json()).toEqual({ canManage: false });
      for (const [method, path] of [['GET', '/manage'], ['GET', '/manage/stats'], ['POST', '/manage'], ['PUT', `/manage/${ownerId}`], ['DELETE', `/manage/${ownerId}`]]) expect((await request(method, path, undefined, id)).statusCode).toBe(403);
    }
    expect((await request('POST', '/manage', { ...input(), image })).statusCode).toBe(201);
    const feed = await request('GET', '/feed', undefined, ordinaryId);
    expect(feed.json().creatives).toHaveLength(1);
    expect(feed.body).not.toMatch(/email|userId|password|image|viewer/);
    expect(feed.headers['cache-control']).toBe('private, no-store');
    users[0].banned = true;
    expect((await request('GET', '/manage')).statusCode).toBe(401);
  });
  it('requires CSRF for authenticated owner mutations', async () => {
    expect((await app.inject({ method: 'POST', url: '/advertising/manage', payload: { ...input(), image }, headers: { cookie: authCookie({ userId: ownerId, role: 'super_admin' }) } })).statusCode).toBe(403);
  });
});
describe('images, schedules, edits, and removal', () => {
  it('decodes/re-encodes raster bytes and rejects SVG, remote URL, corruption and oversized raster', async () => {
    expect((await sharp(await rasterImage(image)).metadata()).format).toBe('webp');
    for (const invalid of ['https://example.org/a.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,YmFk']) await expect(rasterImage(invalid)).rejects.toThrow();
    const large = `data:image/png;base64,${(await sharp({ create: { width: 4097, height: 1, channels: 3, background: 'blue' } }).png().toBuffer()).toString('base64')}`;
    await expect(rasterImage(large)).rejects.toThrow();
  });
  it('rejects unsafe links, inverted dates, unknown targeting and invalid rotation times', () => {
    for (const change of [{ targetUrl: 'javascript:alert(1)' }, { targetUrl: 'https://user:password@example.org' }, { endsAt: '2020-01-01T00:00:00.000Z' }, { seconds: 0 }, { seconds: 301 }, { diagnosis: 'private' }]) expect(() => creativeData({ ...input(), ...change })).toThrow();
    expect(activeWhere(new Date(0)).endsAt.gt.getTime()).toBe(0);
  });
  it('creates independent creatives, enforces run windows, pauses, edits, and removes images', async () => {
    for (let i = 0; i < 2; i++) await request('POST', '/manage', { ...input(), image });
    expect(new Set(ads.map((ad) => ad.id)).size).toBe(2);
    const id = ads[0].id;
    await request('PUT', `/manage/${id}`, { ...input(), paused: true, headline: 'Changed' });
    expect((await request('GET', '/feed', undefined, ordinaryId)).json().creatives).toHaveLength(1);
    expect((await request('GET', `/${id}/image`, undefined, ordinaryId)).statusCode).toBe(404);
    expect((await request('GET', `/${id}/image`)).statusCode).toBe(200);
    ads[1].endsAt = new Date(0);
    expect((await request('GET', '/feed', undefined, ordinaryId)).json().creatives).toHaveLength(0);
    await request('DELETE', `/manage/${id}`);
    expect(ads[0].image.length).toBe(0);
    expect((await request('GET', `/${id}/image`)).statusCode).toBe(404);
  });
});
describe('honest deduplicated measurements', () => {
  it('requires signed, dwelled displays and preceding impressions for clicks; rejects replays', async () => {
    await request('POST', '/manage', { ...input(), image });
    const id = ads[0].id;
    const secret = process.env.COOKIE_SECRET;
    const ticket = signDisplay({ id, revision: 1, viewer: viewerHash(viewer, secret), at: Date.now() - 2000 }, secret);
    expect((await request('POST', '/event', { ticket, kind: 'click' }, ordinaryId)).json().counted).toBe(false);
    expect((await request('POST', '/event', { ticket: `${ticket}x`, kind: 'impression' }, ordinaryId)).statusCode).toBe(400);
    expect((await request('POST', '/event', { ticket, kind: 'impression' }, ordinaryId)).json().counted).toBe(true);
    expect((await request('POST', '/event', { ticket, kind: 'impression' }, ordinaryId)).json().counted).toBe(false);
    expect((await request('POST', '/event', { ticket, kind: 'click' }, ordinaryId)).json().counted).toBe(true);
    expect((await request('POST', '/event', { ticket, kind: 'click' }, ordinaryId)).json().counted).toBe(false);
    expect(events).toHaveLength(2);
    expect(events[0]).not.toHaveProperty('userId');
    expect(events[0].viewer).not.toBe(viewer);
    expect(verifyDisplay(signDisplay({ at: Date.now() }, secret), secret)).toBeNull();
    expect(verifyDisplay(ticket, secret, Date.now() + 700_000)).toBeNull();
    await request('PUT', `/manage/${id}`, { ...input(), headline: 'New revision' });
    expect((await request('POST', '/event', { ticket, kind: 'impression' }, ordinaryId)).json().counted).toBe(false);
  });
  it('never counts owner previews and does not send account or health identifiers in tickets', async () => {
    await request('POST', '/manage', { ...input(), image });
    const id = ads[0].id;
    expect((await request('POST', `/${id}/display`, { viewer })).json()).toEqual({ ticket: null });
    const { ticket } = (await request('POST', `/${id}/display`, { viewer }, ordinaryId)).json();
    const decoded = JSON.parse(Buffer.from(ticket.split('.')[0], 'base64url'));
    expect(Object.keys(decoded).sort()).toEqual(['at', 'id', 'revision', 'viewer']);
    expect(JSON.stringify(decoded)).not.toContain(ordinaryId);
  });
});

it('opens only currently published owner-approved destinations without transferring a session', async () => {
  await request('POST', '/manage', { ...input(), image });
  const ad = ads[0];
  const response = await app.inject({ method: 'GET', url: `/advertising-link/${ad.id}?url=https://evil.invalid` });
  expect(response.statusCode).toBe(302);
  expect(response.headers.location).toBe(input().targetUrl);
  expect(response.headers['referrer-policy']).toBe('no-referrer');
  expect(response.headers['set-cookie']).toBeUndefined();
  ad.paused = true;
  expect((await app.inject({ method: 'GET', url: `/advertising-link/${ad.id}` })).statusCode).toBe(404);
});
