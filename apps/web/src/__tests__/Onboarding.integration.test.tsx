import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';

function resetBrowserState() {
  window.localStorage.clear();
  window.history.pushState({}, 'GeneMap', '/');
}

function getHelpControl() {
  const navigation = screen.getByRole('navigation');

  const button = within(navigation).queryByRole('button', {
    name: /help|guide|onboarding|show help|open help/i,
  });

  if (button) return button;

  return within(navigation).getByRole('link', {
    name: /help|guide|onboarding|show help|open help/i,
  });
}

describe('first-visit onboarding', () => {
  beforeEach(() => {
    resetBrowserState();
  });

  it('appears on the first visit, dismisses with Escape, and does not appear again automatically', async () => {
    const user = userEvent.setup();

    render(<App />);

    expect(await screen.findByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    cleanup();
    window.history.pushState({}, 'GeneMap', '/');

    render(<App />);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('can be dismissed with the labeled button and reopened from the top navigation', async () => {
    const user = userEvent.setup();

    render(<App />);

    const firstDialog = await screen.findByRole('dialog');
    const dismissButton = within(firstDialog).getByRole('button', {
      name: /got it|close|dismiss|done/i,
    });

    await user.click(dismissButton);

    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    await user.click(getHelpControl());

    const reopenedDialog = await screen.findByRole('dialog');
    expect(reopenedDialog).toBeVisible();
    expect(reopenedDialog).toHaveTextContent(/GeneMap|genes|data|help/i);
  });
});
