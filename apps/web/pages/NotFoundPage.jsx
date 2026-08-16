import React from 'react';
import { Link } from 'react-router-dom';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export default function NotFoundPage() {
  return (
    <section className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-10" aria-labelledby="not-found-title">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-800">Page not found</p>
      <h1 id="not-found-title" className="mt-3 text-3xl font-bold text-slate-950 sm:text-4xl">
        We could not find that page.
      </h1>
      <p className="mt-4 text-lg leading-8 text-slate-700">
        The link may be old or typed differently than expected. You can go back home and choose a clear next step.
      </p>
      <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
        <Link to="/" className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800 ${focusClass}`}>
          Back home
        </Link>
        <Link to="/learn" className={`inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}>
          Learn genetics
        </Link>
      </div>
    </section>
  );
}
