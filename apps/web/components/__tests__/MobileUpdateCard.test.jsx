import React from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import MobileUpdateCard from '../settings/MobileUpdateCard';

/**
 * The platform gate IS the feature here. This card must be invisible on the
 * web (where "install a signed Android release" is meaningless) and on iOS
 * (where the link points at the wrong store), and it must never turn into an
 * in-app updater — the sibling app removed exactly that as
 * "fix(android): remove unsigned OTA update path", because executing a
 * downloaded bundle means the running code is no longer the signed code.
 */

function setCapacitor(value) {
  Object.defineProperty(window, 'Capacitor', {
    value,
    configurable: true,
    writable: true,
  });
}

afterEach(() => {
  delete window.Capacitor;
  vi.restoreAllMocks();
});

describe('MobileUpdateCard', () => {
  it('renders nothing in a plain web browser', () => {
    delete window.Capacitor;
    const { container } = render(<MobileUpdateCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing on iOS - the signed-release link is Android-specific', () => {
    setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'ios' });
    const { container } = render(<MobileUpdateCard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a link to signed releases on native Android', () => {
    setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android' });
    render(<MobileUpdateCard />);
    const link = screen.getByRole('link', { name: /View signed releases/i });
    expect(link).toHaveAttribute(
      'href',
      'https://github.com/buckeye7066/genemap-discovery/releases',
    );
  });

  it('never offers an in-app download or auto-update action', () => {
    setCapacitor({ isNativePlatform: () => true, getPlatform: () => 'android' });
    const { container } = render(<MobileUpdateCard />);
    // A pointer to signed releases is a LINK. A button that fetches and applies
    // a bundle would be the unsigned-OTA path this deliberately does not have.
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/download|install now|apply update/i);
  });
});
