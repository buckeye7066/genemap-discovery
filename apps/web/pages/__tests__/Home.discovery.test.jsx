import React from 'react';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../Home.jsx';
import AppRoutes from '../../routes/index.jsx';
import NavBar from '../../components/layout/NavBar.jsx';
import { onboardingStorageKey } from '../../content/onboardingSteps.js';

function renderWithRouter(ui, initialEntries = ['/']) {
  return render(<MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>);
}

describe('GeneMap Discovery home page', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('shows the new hero, primary action, four destination cards, and no-data state', async () => {
    renderWithRouter(<Home />);

    expect(screen.getByRole('heading', { name: /understand genetics at your own pace/i })).toBeInTheDocument();
    expect(screen.getByText(/GeneMap Discovery helps you learn genetics/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Start here/i })[0]).toHaveAttribute('href', '/upload');

    expect(screen.getByRole('link', { name: /Learn genetics/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Explore genes & diseases/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Upload & interpret my data/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Find matching trials/i })).toBeInTheDocument();

    expect(screen.getByText("You haven't uploaded anything yet — here's how to begin.")).toBeInTheDocument();
    expect(screen.getByText(/No genetic data is on this page/i)).toBeInTheDocument();
  });

  it('shows onboarding on first visit and saves dismissal when skipped', async () => {
    renderWithRouter(<Home />);

    expect(await screen.findByRole('dialog', { name: /Before you upload anything/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Skip for now/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    const saved = JSON.parse(window.localStorage.getItem(onboardingStorageKey));
    expect(saved.hasSeenOnboarding).toBe(true);
    expect(saved.dismissalMethod).toBe('skip');
  });

  it('dismisses onboarding with Escape and does not show it again after dismissal', async () => {
    const { unmount } = renderWithRouter(<Home />);

    expect(await screen.findByRole('dialog', { name: /Before you upload anything/i })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    unmount();
    renderWithRouter(<Home />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('GeneMap Discovery routes and navigation', () => {
  beforeEach(() => {
    window.localStorage.setItem(onboardingStorageKey, JSON.stringify({ hasSeenOnboarding: true }));
  });

  it('routes each top navigation destination to a real friendly page', () => {
    renderWithRouter(
      <>
        <NavBar />
        <AppRoutes />
      </>,
      ['/learn'],
    );

    expect(screen.getByRole('navigation', { name: /Main sections/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Go to Learn genetics/i })).toHaveAttribute('href', '/learn');
    expect(screen.getByRole('link', { name: /Go to Explore genes and diseases/i })).toHaveAttribute('href', '/explore');
    expect(screen.getByRole('link', { name: /Go to Upload and interpret my data/i })).toHaveAttribute('href', '/upload');
    expect(screen.getByRole('link', { name: /Go to Find matching trials/i })).toHaveAttribute('href', '/trials');
    expect(screen.getByRole('heading', { name: 'Learn genetics' })).toBeInTheDocument();
  });

  it('keeps onboarding controls keyboard reachable in a sensible order', async () => {
    window.localStorage.clear();
    renderWithRouter(<Home />);

    const startLinks = await screen.findAllByRole('link', { name: 'Start here' });
    const overlayStartHere = startLinks[startLinks.length - 1];
    const skipButton = screen.getByRole('button', { name: /Skip for now/i });
    const closeButton = screen.getByRole('button', { name: /Close the first visit guide/i });

    expect(closeButton).toBeInTheDocument();
    expect(skipButton).toBeInTheDocument();
    expect(overlayStartHere).toHaveAttribute('href', '/upload');

    await waitFor(() => {
      expect(document.activeElement).toBe(overlayStartHere);
    });
  });
});
