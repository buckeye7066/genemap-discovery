import React from "react";
import { Link } from "react-router-dom";
import DestinationCard from "../src/components/home/DestinationCard.jsx";
import EmptyDataState from "../src/components/home/EmptyDataState.jsx";
import OnboardingOverlay from "../src/components/onboarding/OnboardingOverlay.jsx";
import { homeDestinations } from "../src/content/homeDestinations.js";

const heroSentence =
  "GeneMap Discovery helps you learn genetics, explore trusted gene and disease information, and prepare to review your data safely.";

const focusClass =
  "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

export default function Home() {
  return (
    <>
      <div className="bg-slate-50">
        <section className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-12" aria-labelledby="home-title">
          <div className="flex flex-col justify-center rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 lg:p-10">
            <p className="mb-3 inline-flex w-fit rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-950">
              Educational and privacy-first
            </p>
            <h1 id="home-title" className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
              Understand genetics at your own pace.
            </h1>
            <p className="mt-5 max-w-2xl text-xl leading-8 text-slate-800">{heroSentence}</p>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-700">
              You stay in control. Nothing is uploaded from this page, and you can explore before sharing any file.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                to="/upload"
                className={`inline-flex min-h-12 items-center justify-center rounded-2xl bg-blue-700 px-7 py-4 text-lg font-bold text-white shadow-sm transition hover:bg-blue-800 ${focusClass}`}
                aria-label="Start here by seeing the upload and interpretation preparation steps"
              >
                Start here
              </Link>
              <Link
                to="/learn"
                className={`inline-flex min-h-12 items-center justify-center rounded-2xl border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-slate-100 ${focusClass}`}
              >
                Learn first instead
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-950 shadow-sm sm:p-8">
            <h2 className="text-2xl font-bold">Before any upload</h2>
            <p className="mt-3 text-base leading-7">
              This app is for learning and exploration. It does not give a diagnosis, personal risk estimate, treatment advice, medicine advice, or research-study guidance.
            </p>
            <div className="mt-6">
              <EmptyDataState />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 pb-12 sm:px-6 lg:px-8" aria-labelledby="destinations-title">
          <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 id="destinations-title" className="text-3xl font-bold text-slate-950">
                Choose what you want to do
              </h2>
              <p className="mt-2 max-w-2xl text-slate-700">
                Pick one clear path. You can change direction at any time.
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {homeDestinations.map((destination) => (
              <DestinationCard key={destination.id} destination={destination} />
            ))}
          </div>
        </section>
      </div>
      <OnboardingOverlay />
    </>
  );
}
