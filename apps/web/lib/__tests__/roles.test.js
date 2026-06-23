import { describe, it, expect } from 'vitest';
import { isAdminUser, isSuperAdmin } from '../roles.js';

describe('isAdminUser', () => {
  it('is false for null / anonymous', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });

  it('is false for a plain user', () => {
    expect(isAdminUser({ role: 'user' })).toBe(false);
  });

  it('is true for admin and super_admin roles', () => {
    expect(isAdminUser({ role: 'admin' })).toBe(true);
    expect(isAdminUser({ role: 'super_admin' })).toBe(true);
  });

  it('honors an entitlements.isAdmin flag', () => {
    expect(isAdminUser({ role: 'user', entitlements: { isAdmin: true } })).toBe(true);
  });
});

describe('isSuperAdmin', () => {
  it('is true only for super_admin', () => {
    expect(isSuperAdmin({ role: 'super_admin' })).toBe(true);
    expect(isSuperAdmin({ role: 'admin' })).toBe(false);
    expect(isSuperAdmin(null)).toBe(false);
  });
});
