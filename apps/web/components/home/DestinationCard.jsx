import React from 'react';
import { Link } from 'react-router-dom';

const focusClass = 'focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600';

const icons = {
  'book-open': '📘',
  search: '🔎',
  'upload-cloud': '☁️',
  'clipboard-list': '📋',
};

export default function DestinationCard({ destination }) {
  return (
    <Link
      to={destination.route}
      className={`group flex min-h-56 flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${focusClass}`}
      aria-label={`${destination.title}. ${destination.plainLanguageDescription} ${destination.primaryActionLabel}.`}
    >
      <div className="space-y-4">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl" aria-hidden="true">
          {icons[destination.iconName] ?? '•'}
        </span>
        <div>
          <h3 className="text-xl font-bold text-slate-950">{destination.title}</h3>
          <p className="mt-3 text-base leading-7 text-slate-700">{destination.plainLanguageDescription}</p>
        </div>
      </div>
      <span className="mt-5 inline-flex min-h-11 items-center font-semibold text-blue-800 group-hover:text-blue-950">
        {destination.primaryActionLabel}
        <span className="ml-2" aria-hidden="true">→</span>
      </span>
    </Link>
  );
}
