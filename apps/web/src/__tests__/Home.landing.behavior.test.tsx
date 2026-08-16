import '@testing-library/jest-dom/vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import Home from '../pages/Home';

function renderHome() {
  return render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

function allLinksWithHref(path: string) {
  return screen
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href') === path);
}

describe('Home landing page', () => {
  it('makes the app purpose and next step clear on the first screen', () => {
    renderHome();

    expect(
      screen.getByRole('heading', { name: /understand your genes/i }),
    ).toBeInTheDocument();

    expect(
      screen.getByText(/learning, exploration, and data interpretation/i),
    ).toBeInTheDocument();

    const primaryStartLinks = screen.getAllByRole('link').filter((link) => {
      const label = link.textContent?.replace(/\s+/g, ' ').trim() ?? '';
      return (
        link.getAttribute('href') === '/interpret' &&
        /(start|begin|get started|guided)/i.test(label)
      );
    });

    expect(primaryStartLinks).toHaveLength(1);
    expect(primaryStartLinks[0]).toBeVisible();
  });

  it('shows the three plain-language feature cards and links each one to a working route', () => {
    renderHome();

    const expectedCards = [
      { title: /learn genetics/i, route: '/learn' },
      { title: /explore genes & diseases/i, route: '/explore' },
      { title: /interpret my data/i, route: '/interpret' },
    ];

    for (const card of expectedCards) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
      expect(allLinksWithHref(card.route).length).toBeGreaterThan(0);
    }
  });

  it('presents the 8-step interpretation flow in a readable How it works section', () => {
    renderHome();

    const heading = screen.getByRole('heading', { name: /how it works/i });
    const section = heading.closest('section');

    expect(section).toBeTruthy();
    expect(within(section as HTMLElement).getAllByRole('listitem')).toHaveLength(8);

    expect(within(section as HTMLElement).getByText(/upload/i)).toBeInTheDocument();
    expect(within(section as HTMLElement).getByText(/plain/i)).toBeInTheDocument();
  });

  it('keeps the education-only scope visible and avoids medical guidance promises', () => {
    renderHome();

    const pageText = document.body.textContent ?? '';

    expect(pageText).toMatch(/education|learning|exploration/i);
    expect(pageText).toMatch(/no diagnosis|not a diagnosis/i);
    expect(pageText).toMatch(/no personal medical records|no VCF uploads|VCF/i);
    expect(pageText).not.toMatch(/treatment plan|drug dosing|urgent medical|clinical trial match/i);
  });
});
