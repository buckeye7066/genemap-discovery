import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Home from '../../../pages/Home.jsx';
import UploadInterpretPage from '../../../pages/UploadInterpretPage.jsx';
import { ONBOARDING_STORAGE_KEY, onboardingSteps } from '../../../content/onboardingSteps.js';

function renderHome(initialEntries = ['/']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/upload" element={<UploadInterpretPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('OnboardingOverlay behavior', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it('appears for a first-time visitor and shows all eight upload overview steps', async () => {
    renderHome();

    const dialog = await screen.findByRole('dialog', { name: /see the upload path before choosing a file/i });
    expect(dialog).toBeInTheDocument();

    for (const step of onboardingSteps) {
      expect(within(dialog).getByText(step.title)).toBeInTheDocument();
      expect(within(dialog).getByText(step.plainLanguageDescription)).toBeInTheDocument();
    }

    expect(within(dialog).getByRole('button', { name: /start here/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /skip/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /close onboarding guide/i })).toBeInTheDocument();
  });

  it('can be dismissed with Skip and saves the local preference', async () => {
    renderHome();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /skip/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const saved = JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
    expect(saved.hasSeenOnboarding).toBe(true);
    expect(saved.dismissalMethod).toBe('skip');
    expect(saved.dismissedAt).toEqual(expect.any(String));
  });

  it('can be dismissed with the Close button and saves the local preference', async () => {
    renderHome();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /close onboarding guide/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const saved = JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
    expect(saved.hasSeenOnboarding).toBe(true);
    expect(saved.dismissalMethod).toBe('close_button');
  });

  it('Start here dismisses onboarding and routes to the upload preparation page', async () => {
    renderHome();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /start here/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /upload & interpret my data/i })).toBeInTheDocument();
    });

    const saved = JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
    expect(saved.hasSeenOnboarding).toBe(true);
    expect(saved.dismissalMethod).toBe('start_here');
  });

  it('can be dismissed with Escape and saves the local preference', async () => {
    renderHome();

    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape', code: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const saved = JSON.parse(window.localStorage.getItem(ONBOARDING_STORAGE_KEY));
    expect(saved.hasSeenOnboarding).toBe(true);
    expect(saved.dismissalMethod).toBe('escape_key');
  });

  it('does not reappear on a later render after dismissal is saved', async () => {
    const firstRender = renderHome();

    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: /skip/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    firstRender.unmount();
    renderHome();

    expect(screen.getByRole('heading', { name: /understand genetics in plain language/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
  });
});
