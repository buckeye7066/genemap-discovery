const linkFocusClasses = "focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-blue-700";

export function PageNotFound() {
  return (
    <main className="min-h-[70vh] bg-slate-50 px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <section
        aria-labelledby="not-found-title"
        className="mx-auto max-w-3xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10"
      >
        <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-blue-800">
          Page not found
        </p>
        <h1 id="not-found-title" className="text-3xl font-bold tracking-tight sm:text-4xl">
          We could not find that page.
        </h1>
        <p className="mt-4 text-lg leading-8 text-slate-700">
          The link may be old, or the page may have moved. You can go back to the home page and choose a clear next step.
        </p>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <a
            href="/"
            className={`${linkFocusClasses} inline-flex min-h-12 items-center justify-center rounded-xl bg-blue-700 px-6 py-3 text-base font-semibold text-white shadow-sm hover:bg-blue-800`}
          >
            Go to home
          </a>
          <a
            href="/learn"
            className={`${linkFocusClasses} inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-950 hover:bg-slate-100`}
          >
            Learn genetics
          </a>
        </div>
        <p className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-950">
          GeneMap Discovery is for learning and exploration only. It does not provide diagnosis, personal risk estimates, treatment advice, or urgent guidance.
        </p>
      </section>
    </main>
  );
}

export default PageNotFound;
