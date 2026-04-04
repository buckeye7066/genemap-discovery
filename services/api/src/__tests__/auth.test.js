import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { buildTestApp, createPrismaMock, authCookie } from './setup.js';
import { hashPassword } from '../utils/auth.js';

let app;
let prisma;

beforeAll(async () => {
  prisma = createPrismaMock();
  app = await buildTestApp(prisma);
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  prisma._reset();
});

// ─── POST /auth/register ─────────────────────────────────────────────────────

describe('POST /auth/register', () => {
  it('should register a new user and return user object with cookies', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.user.role).toBe('user');
    expect(body.user.id).toBeDefined();

    // Should set accessToken and refreshToken cookies
    const cookies = res.cookies;
    const accessCookie = cookies.find((c) => c.name === 'accessToken');
    const refreshCookie = cookies.find((c) => c.name === 'refreshToken');
    expect(accessCookie).toBeDefined();
    expect(refreshCookie).toBeDefined();
  });

  it('should reject duplicate email', async () => {
    // Seed a user first
    prisma._store.user = [];
    const passwordHash = await hashPassword('StrongPass1!');
    prisma._store.user.push({
      id: 'existing-id',
      email: 'alice@example.com',
      passwordHash,
      role: 'user',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'alice@example.com', password: 'AnotherPass1!' },
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/already registered/i);
  });

  it('should reject a weak password (less than 8 chars)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'bob@example.com', password: 'short' },
    });

    // Zod validation should fail -> 400
    expect(res.statusCode).toBe(400);
  });

  it('should reject an invalid email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'not-an-email', password: 'StrongPass1!' },
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /auth/login ────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  beforeEach(async () => {
    prisma._reset();
    const passwordHash = await hashPassword('CorrectPass1!');
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      passwordHash,
      role: 'user',
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should log in with correct credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'CorrectPass1!' },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.user.email).toBe('alice@example.com');

    const cookies = res.cookies;
    expect(cookies.find((c) => c.name === 'accessToken')).toBeDefined();
    expect(cookies.find((c) => c.name === 'refreshToken')).toBeDefined();
  });

  it('should reject wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'WrongPassword!' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/invalid credentials/i);
  });

  it('should reject non-existent user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'Whatever1!' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('should reject a banned user', async () => {
    prisma._store.user[0].banned = true;
    prisma._store.user[0].banReason = 'TOS violation';

    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'alice@example.com', password: 'CorrectPass1!' },
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toMatch(/suspended/i);
  });
});

// ─── POST /auth/logout ──────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  it('should log out an authenticated user and clear cookies', async () => {
    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
  });

  it('should reject unauthenticated logout', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── GET /auth/me ────────────────────────────────────────────────────────────

describe('GET /auth/me', () => {
  beforeEach(() => {
    prisma._reset();
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      role: 'user',
      displayName: 'Alice',
      fullName: 'Alice Smith',
      phoneNumber: null,
      educationLevel: 'graduate',
      demographicsCollected: true,
      banned: false,
      banReason: null,
      subscriptions: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should return current user profile for authenticated request', async () => {
    // Make user.findUnique return the user with subscriptions included
    prisma.user.findUnique = vi.fn(async () => ({
      ...prisma._store.user[0],
      subscriptions: [],
    }));
    prisma.licenseAssignment.findFirst = vi.fn(async () => null);

    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.email).toBe('alice@example.com');
    expect(body.display_name).toBe('Alice');
    expect(body.entitlements).toBeDefined();
    expect(body.entitlements.isPremium).toBe(false);
  });

  it('should return 401 for unauthenticated request', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });

    expect(res.statusCode).toBe(401);
  });
});

// ─── PUT /auth/me ────────────────────────────────────────────────────────────

describe('PUT /auth/me', () => {
  beforeEach(() => {
    prisma._reset();
    prisma._store.user.push({
      id: 'user-1',
      email: 'alice@example.com',
      role: 'user',
      displayName: 'Alice',
      fullName: null,
      phoneNumber: null,
      educationLevel: null,
      demographicsCollected: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  it('should update profile fields', async () => {
    const cookie = authCookie({ userId: 'user-1', email: 'alice@example.com', role: 'user' });

    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      headers: { cookie },
      payload: {
        displayName: 'Alice Updated',
        fullName: 'Alice B. Smith',
        educationLevel: 'phd',
      },
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.display_name).toBe('Alice Updated');
    expect(body.full_name).toBe('Alice B. Smith');
    expect(body.education_level).toBe('phd');
  });

  it('should reject unauthenticated update', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/auth/me',
      payload: { displayName: 'Hacker' },
    });

    expect(res.statusCode).toBe(401);
  });
});
