import React from "react";
import { Link, NavLink } from "react-router-dom";
import { navigationItems } from "../../content/navigationItems.js";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

function linkClass({ isActive }, isPrimary) {
  const base = `inline-flex min-h-11 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold transition ${focusClass}`;

  if (isPrimary) {
    return `${base} ${isActive ? "bg-blue-900 text-white ring-2 ring-blue-300" : "bg-blue-700 text-white hover:bg-blue-800"}`;
  }

  return `${base} ${isActive ? "bg-slate-900 text-white underline decoration-2 underline-offset-4" : "text-slate-800 hover:bg-slate-100 hover:text-slate-950"}`;
}

export default function NavBar() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur">
      <a
        href="#main-content"
        className={`sr-only ${focusClass} focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-white focus:px-4 focus:py-3 focus:text-slate-950`}
      >
        Skip to main content
      </a>
      <nav className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8" aria-label="Main navigation">
        <Link
          to="/"
          className={`inline-flex min-h-11 items-center gap-3 rounded-xl pr-3 text-slate-950 ${focusClass}`}
          aria-label="GeneMap Discovery home"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-700 text-lg font-bold text-white" aria-hidden="true">
            G
          </span>
          <span>
            <span className="block text-base font-bold leading-5">GeneMap Discovery</span>
            <span className="block text-xs font-medium text-slate-600">Learn before you share</span>
          </span>
        </Link>

        <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Main sections">
          {navigationItems.map((item) => (
            <div role="listitem" key={item.route}>
              <NavLink to={item.route} className={(state) => linkClass(state, item.isPrimary)} aria-label={item.ariaLabel}>
                {item.label}
              </NavLink>
            </div>
          ))}
        </div>
      </nav>
    </header>
  );
}
