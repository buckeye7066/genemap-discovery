import React from "react";
import { Link } from "react-router-dom";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const icons = {
  "book-open": "📘",
  search: "🔎",
  "upload-cloud": "☁️",
  "clipboard-list": "📋",
};

export default function DestinationCard({ destination }) {
  return (
    <Link
      to={destination.route}
      className={`group flex min-h-56 flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-blue-300 hover:shadow-md ${focusClass}`}
      aria-label={`${destination.title}. ${destination.plainLanguageDescription} ${destination.primaryActionLabel}.`}
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-2xl" aria-hidden="true">
        {icons[destination.iconName] || "•"}
      </span>
      <h3 className="mt-4 text-xl font-bold text-slate-950">{destination.title}</h3>
      <p className="mt-3 flex-1 text-base leading-7 text-slate-700">{destination.plainLanguageDescription}</p>
      <span className="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-950 group-hover:bg-blue-700 group-hover:text-white">
        {destination.primaryActionLabel}
      </span>
    </Link>
  );
}
