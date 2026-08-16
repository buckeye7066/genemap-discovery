import React from 'react';
import { Link } from 'react-router-dom';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

export default function FriendlyPlaceholderPage({ eyebrow, title, description, bullets = [], primaryLink, secondaryLink }) {
  return (
    <article className="mx-auto max-w-4xl space-y-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-8">
      {eyebrow ? <p className="inline-flex rounded-full bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-900">{eyebrow}</p> : null}
      <div className="space-y-3">
        <h1 className="text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">{title}</h1>
        <p className="text-lg leading-8 text-slate-700">{description}</p>
      </div>

      {bullets.length > 0 ? (
        <section aria-labelledby="what-you-can-do" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 id="what-you-can-do" className="text-xl font-bold text-slate-950">What you can do here</h2>
          <ul className="mt-3 space-y-3 text-base leading-7 text-slate-700">
            {bullets.map((bullet) => (
              <li key={bullet} className="flex gap-3">
                <span aria-hidden="true" className="mt-1 text-blue-700">•</span>
                <span>{bullet}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <h2 className="text-xl font-bold">A quick note</h2>
        <p className="mt-2 leading-7">
          GeneMap Discovery is for education and exploration. It does not provide diagnosis, personal risk estimates, treatment choices, dosing advice, or medical instructions.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        {primaryLink ? (
          <Link
            to={primaryLink.route}
            className={`inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white hover:bg-blue-800 ${focusClass}`}
          >
            {primaryLink.label}
          </Link>
        ) : null}
        {secondaryLink ? (
          <Link
            to={secondaryLink.route}
            className={`inline-flex min-h-12 items-center justify-center rounded-xl border-2 border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-950 hover:bg-slate-100 ${focusClass}`}
          >
            {secondaryLink.label}
          </Link>
        ) : null}
      </div>
    </article>
  );
}
