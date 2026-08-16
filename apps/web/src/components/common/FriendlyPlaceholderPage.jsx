import React from "react";
import { Link } from "react-router-dom";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function FriendlyPlaceholderPage({ eyebrow, title, description, details, nextLabel, nextRoute }) {
  return (
    <div className="bg-slate-50 px-4 py-10 sm:px-6 lg:px-8">
      <section className="mx-auto max-w-4xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10" aria-labelledby="placeholder-title">
        {eyebrow ? (
          <p className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-950">
            {eyebrow}
          </p>
        ) : null}
        <h1 id="placeholder-title" className="text-4xl font-bold tracking-tight text-slate-950">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-8 text-slate-800">{description}</p>
        {details ? <p className="mt-4 text-base leading-7 text-slate-700">{details}</p> : null}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Link
            to={nextRoute || "/"}
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-700 px-6 py-3 font-bold text-white hover:bg-blue-800 ${focusClass}`}
          >
            {nextLabel || "Continue"}
          </Link>
          <Link
            to="/"
            className={`inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-3 font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}
          >
            Back to home
          </Link>
        </div>
      </section>
    </div>
  );
}
