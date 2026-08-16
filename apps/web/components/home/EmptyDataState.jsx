import React from 'react';
import { Link } from 'react-router-dom';
import { emptyDataState } from '../../content/emptyDataState.js';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export default function EmptyDataState() {
  return (
    <section aria-labelledby="empty-data-title" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center">
        <div>
          <h2 id="empty-data-title" className="text-2xl font-bold text-slate-950">
            {emptyDataState.headline}
          </h2>
          <p className="mt-2 text-base leading-7 text-slate-700">{emptyDataState.message}</p>
          <p className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-950">
            {emptyDataState.privacyReassurance}
          </p>
        </div>
        <Link
          to={emptyDataState.primaryActionRoute}
          className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800 ${focusClass}`}
          aria-label="See the upload steps before choosing any file"
        >
          {emptyDataState.primaryActionLabel}
        </Link>
      </div>
    </section>
  );
}
