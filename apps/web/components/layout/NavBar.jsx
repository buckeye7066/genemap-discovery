import React, { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { navigationItems } from '../../content/navigationItems.js';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export default function NavBar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const linkClass = ({ isActive }) =>
    [
      'inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition',
      focusClass,
      isActive
        ? 'border-2 border-blue-700 bg-blue-50 text-blue-950 shadow-sm'
        : 'border-2 border-transparent text-slate-800 hover:border-slate-300 hover:bg-white hover:text-slate-950',
    ].join(' ');

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <Link
          to="/"
          className={`inline-flex min-h-11 items-center rounded-xl px-2 text-lg font-bold text-slate-950 ${focusClass}`}
          aria-label="GeneMap Discovery home"
          onClick={() => setIsMenuOpen(false)}
        >
          GeneMap Discovery
        </Link>

        <a
          href="#main-content"
          className={`sr-only rounded-xl bg-white px-4 py-3 font-semibold text-blue-900 focus:not-sr-only focus:absolute focus:left-4 focus:top-4 ${focusClass}`}
        >
          Skip to main content
        </a>

        <button
          type="button"
          className={`inline-flex min-h-11 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-slate-100 md:hidden ${focusClass}`}
          aria-expanded={isMenuOpen}
          aria-controls="primary-navigation"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          Menu
        </button>

        <nav
          id="primary-navigation"
          className={`${isMenuOpen ? 'absolute left-4 right-4 top-16 block rounded-2xl border border-slate-200 bg-white p-3 shadow-lg' : 'hidden'} md:static md:block md:border-0 md:bg-transparent md:p-0 md:shadow-none`}
          aria-label="Main destinations"
        >
          <ul className="flex flex-col gap-2 md:flex-row md:items-center">
            {navigationItems.map((item) => (
              <li key={item.route}>
                <NavLink to={item.route} className={linkClass} aria-label={item.ariaLabel} onClick={() => setIsMenuOpen(false)}>
                  {item.label}
                  {item.isPrimary ? <span className="ml-2 rounded-full bg-blue-700 px-2 py-0.5 text-xs text-white">Start</span> : null}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
