import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import Home from '../Home.jsx';

const ONBOARDING_STORAGE_KEY = 'genemap-discovery:onboarding-dismissed';

function renderHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Home />
    </MemoryRouter>,
  );
}

describe('Home page content', () => {
  beforeEach(() => {
    window.localStorage.setItem(
      ONBOARDING_STORAGE_KEY,
      JSON.stringify({
        hasSeenOnboarding: true,
        dismissedAt: '2026-08-16T00:00:00.000Z',
        dismissalMethod: 'skip',
      }),
    );
  });

  it('renders the plain-language hero sentence and privacy-first message', () => {
    renderHome();

    expect(
      screen.getByText(
        'GeneMap Discovery helps you learn genetics, explore trusted gene and disease information, and prepare to review your data safely.',
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'You stay in control. Nothing is uploaded from this page, and you can explore before sharing any file.',
      ),
    ).toBeInTheDocument();
  });

  it('shows one obvious Start here action that leads to the upload area', () => {
    renderHome();

    const startHereLinks = screen.getAllByRole('link', { name: /^Start here$/i });

    expect(startHereLinks).toHaveLength(1);
    expect(startHereLinks[0]).toHaveAttribute('href', '/upload');
  });

  it('renders all four destination cards with exact labels and useful actions', () => {
    renderHome();

    const expectedCards = [
      {
        title: 'Learn genetics',
        description: 'Start with simple explanations of genes, DNA, and common terms.',
        action: 'Learn the basics',
        route: '/learn',
      },
      {
        title: 'Explore genes & diseases',
        description: 'Look through trusted information in a clear, educational way.',
        action: 'Explore information',
        route: '/explore',
      },
      {
        title: 'Upload & interpret my data',
        description: 'See how the upload process will work before you choose any file.',
        action: 'See upload steps',
        route: '/upload',
      },
      {
        title: 'Find matching trials',
        description: 'Learn how research study information may be explored in the future.',
        action: 'Learn about studies',
        route: '/trials',
      },
    ];

    for (const card of expectedCards) {
      const cardLink = screen.getByRole('link', { name: new RegExp(card.title, 'i') });
      expect(cardLink).toHaveAttribute('href', card.route);

      expect(within(cardLink).getByText(card.title)).toBeInTheDocument();
      expect(within(cardLink).getByText(card.description)).toBeInTheDocument();
      expect(within(cardLink).getByText(card.action)).toBeInTheDocument();
    }
  });

  it('shows the truthful no-upload empty state with a clear upload next action', () => {
    renderHome();

    expect(
      screen.getByText("You haven't uploaded anything yet — here's how to begin."),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'Start by learning what the upload process looks like. You can decide later whether you want to choose a file.',
      ),
    ).toBeInTheDocument();

    expect(
      screen.getByText(
        'No genetic data is on this page, and nothing is sent anywhere from the home screen.',
      ),
    ).toBeInTheDocument();

    const uploadLinks = screen.getAllByRole('link', { name: /^See upload steps$/i });
    expect(uploadLinks.some((link) => link.getAttribute('href') === '/upload')).toBe(true);
  });
});
