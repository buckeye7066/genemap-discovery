import React from "react";
import { Link } from "react-router-dom";
import { emptyDataState } from "../../content/emptyDataState.js";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function EmptyDataState() {
  return (
    <section className="rounded-3xl border border-amber-200 bg-white p-5" aria-labelledby="empty-data-title">
      <h2 id="empty-data-title" className="text-2xl font-bold text-slate-950">
        {emptyDataState.headline}
      </h2>
      <p className="mt-3 text-base leading-7 text-slate-700">{emptyDataState.message}</p>
      <p className="mt-3 text-sm leading-6 text-slate-700">{emptyDataState.privacyReassurance}</p>
      <Link
        to={emptyDataState.primaryActionRoute}
        className={`mt-5 inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800 ${focusClass}`}
      >
        {emptyDataState.primaryActionLabel}
      </Link>
    </section>
  );
}
