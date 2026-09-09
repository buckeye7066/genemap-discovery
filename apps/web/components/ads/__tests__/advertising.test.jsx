import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Advertisement, { liveCreatives } from '../Advertisement';
import { runEnd } from '../AdvertisingManager';

const state = vi.hoisted(() => ({ canManage: false, request: vi.fn(), user: { id: 'viewer' } }));
vi.mock('@genemap/shared', () => ({ apiClient: { request: (...args) => state.request(...args) } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: state.user }) }));
let observer;
const creatives = [1, 2].map((number) => ({ id: String(number), revision: 1, advertiser: 'Test fixture', headline: `Fixture ${number}`, body: 'Test advertisement', targetUrl: 'https://example.org', seconds: 15, startsAt: '2026-09-01T00:00:00Z', endsAt: '2026-10-01T00:00:00Z', paused: false }));
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-09-09T00:00:00Z'));
  state.canManage = false; state.user = { id: 'viewer' }; state.request.mockReset();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  vi.stubGlobal('IntersectionObserver', class { constructor(callback) { observer = callback; } observe() {} disconnect() {} });
  state.request.mockImplementation(async (path) => {
    if (path.endsWith('/capability')) return { canManage: state.canManage };
    if (path.endsWith('/feed')) return { creatives };
    if (path.endsWith('/image')) return { image: 'data:image/png;base64,AA==' };
    if (path.endsWith('/display')) return { ticket: 'signed-display' };
    return { counted: true };
  });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('advertisement rendering and foreground measurements', () => {
  it('renders labelled inline ads with safe external links and no owner controls for viewers', async () => {
    render(<Advertisement />); await flush();
    expect(screen.getByLabelText('Advertisement')).toBeTruthy();
    expect(screen.queryByText('Manage advertisements')).toBeNull();
    const link = screen.getByRole('link');
    expect(link.getAttribute('rel')).toContain('noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(document.querySelector('aside').className).toContain('print:hidden');
    expect(state.request.mock.calls.some(([path]) => path.endsWith('/display'))).toBe(false);
  });
  it('counts only loaded, half-visible foreground impressions after dwell, then clicks', async () => {
    render(<Advertisement />); await flush();
    fireEvent.load(screen.getByRole('img'));
    act(() => observer([{ isIntersecting: true, intersectionRatio: 0.6 }])); await flush();
    expect(state.request.mock.calls.some(([path]) => path.endsWith('/event'))).toBe(false);
    await act(async () => { vi.advanceTimersByTime(1100); }); await flush();
    const impressions = state.request.mock.calls.filter(([path, options]) => path.endsWith('/event') && JSON.parse(options.body).kind === 'impression');
    expect(impressions).toHaveLength(1);
    fireEvent.click(screen.getByRole('link')); await flush();
    expect(state.request.mock.calls.some(([path, options]) => path.endsWith('/event') && JSON.parse(options.body).kind === 'click')).toBe(true);
  });
  it('cancels measurement and rotation when hidden; rotates visible ads at selected duration', async () => {
    render(<Advertisement />); await flush();
    fireEvent.load(screen.getByRole('img'));
    act(() => observer([{ isIntersecting: true, intersectionRatio: 1 }])); await flush();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    fireEvent(document, new Event('visibilitychange'));
    await act(async () => { vi.advanceTimersByTime(30_000); }); await flush();
    expect(screen.getByText('Fixture 1')).toBeTruthy();
    expect(state.request.mock.calls.some(([path]) => path.endsWith('/event'))).toBe(false);
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    fireEvent(document, new Event('visibilitychange')); await flush();
    await act(async () => { vi.advanceTimersByTime(15_000); }); await flush();
    expect(screen.getByText('Fixture 2')).toBeTruthy();
  });
  it('shows owner management only with server capability and excludes owner previews', async () => {
    state.canManage = true;
    render(<Advertisement />); await flush();
    expect(screen.getByText('Manage advertisements')).toBeTruthy();
    fireEvent.load(screen.getByRole('img'));
    act(() => observer([{ isIntersecting: true, intersectionRatio: 1 }])); await flush();
    await act(async () => { vi.advanceTimersByTime(2000); });
    expect(state.request.mock.calls.some(([path]) => path.endsWith('/display'))).toBe(false);
  });
  it('does not render ads or owner tools for a shared-link visitor without their own session', async () => {
    state.user = null;
    render(<Advertisement />); await flush();
    expect(screen.queryByLabelText('Advertisement')).toBeNull();
    expect(state.request).not.toHaveBeenCalled();
  });
});
describe('run windows and presets', () => {
  it('uses inclusive start and exclusive end and excludes paused creatives', () => {
    expect(liveCreatives(creatives, Date.parse(creatives[0].startsAt))).toHaveLength(2);
    expect(liveCreatives(creatives, Date.parse(creatives[0].endsAt))).toHaveLength(0);
    expect(liveCreatives([{ ...creatives[0], paused: true }])).toHaveLength(0);
  });
  it('supports week/two-week/month presets without month-end overflow', () => {
    expect(runEnd('2026-01-01T10:00', 'week')).toBe('2026-01-08T10:00');
    expect(runEnd('2026-01-01T10:00', 'two-weeks')).toBe('2026-01-15T10:00');
    expect(runEnd('2026-01-31T10:00', 'month')).toBe('2026-02-28T10:00');
  });
});
