import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Atom,
  BookOpen,
  CircleCheck,
  Compass,
  Dna,
  ExternalLink,
  GraduationCap,
  Microscope,
  Search,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';

const pathways = [
  {
    eyebrow: 'FOUNDATIONS',
    title: 'Build your genetics intuition',
    description: 'Move from the central dogma to inheritance, variation, and gene–phenotype relationships with reviewed learning material matched to your level.',
    action: 'Start learning',
    to: 'LearnGenetics',
    icon: GraduationCap,
    accent: 'from-violet-600 to-indigo-700',
    surface: 'bg-violet-50 border-violet-100',
  },
  {
    eyebrow: 'DISCOVER',
    title: 'Explore a phenotype or condition',
    description: 'Begin with a reviewed concept, inspect candidate genes, and keep source evidence, species, and uncertainty visible at every step.',
    action: 'Open gene search',
    to: 'Search',
    icon: Search,
    accent: 'from-cyan-600 to-blue-700',
    surface: 'bg-cyan-50 border-cyan-100',
  },
  {
    eyebrow: 'RESEARCH',
    title: 'Turn a question into a project',
    description: 'Organize exploratory questions and candidate sets into a transparent research workspace designed for review and follow-up.',
    action: 'Enter research mode',
    to: 'ResearchMode',
    icon: Microscope,
    accent: 'from-emerald-600 to-teal-700',
    surface: 'bg-emerald-50 border-emerald-100',
  },
];

const evidence = [
  { icon: CircleCheck, label: 'Human association evidence', detail: 'Source-grounded records where available', tone: 'text-emerald-700 bg-emerald-50 border-emerald-100' },
  { icon: Atom, label: 'Computational or model evidence', detail: 'Clearly separated from human evidence', tone: 'text-sky-700 bg-sky-50 border-sky-100' },
  { icon: Sparkles, label: 'AI research leads', detail: 'Starting points for review—not conclusions', tone: 'text-amber-700 bg-amber-50 border-amber-100' },
];

export default function DiscoveryStudio() {
  const { user } = useAuth();
  const firstName = user?.name?.trim()?.split(/\s+/)[0] || user?.email?.split('@')[0] || 'Explorer';

  return (
    <main className="min-h-full overflow-x-hidden bg-[#f7f9fc] text-slate-950">
      <section className="relative isolate overflow-hidden border-b border-slate-200 bg-slate-950">
        <div className="absolute inset-0 opacity-70" aria-hidden="true">
          <div className="absolute -left-20 -top-24 h-80 w-80 rounded-full bg-cyan-500 blur-3xl" />
          <div className="absolute right-0 top-8 h-96 w-96 rounded-full bg-indigo-600 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-44 w-96 rounded-full bg-emerald-500/50 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 pb-14 pt-10 sm:px-8 lg:px-12 lg:pb-20 lg:pt-14">
          <div className="mb-12 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">
            <Compass className="h-4 w-4" />
            GeneMap Discovery Studio
          </div>
          <div className="grid items-end gap-10 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <p className="mb-4 text-sm font-medium text-slate-300">Welcome back, {firstName}.</p>
              <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-white sm:text-5xl lg:text-6xl">
                Make each genetics question <span className="text-cyan-300">traceable.</span>
              </h1>
              <p className="mt-6 max-w-2xl text-base leading-7 text-slate-300 sm:text-lg">
                GeneMap connects reviewed learning with early-stage gene exploration, while making the origin and limits of every result easy to inspect.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to={createPageUrl('Search')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-semibold text-slate-950 shadow-lg shadow-cyan-950/30 transition hover:-translate-y-0.5 hover:bg-cyan-50 focus-visible:outline-white"
                >
                  Explore a question <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to={createPageUrl('LearningPath')}
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10 focus-visible:outline-white"
                >
                  View my learning path
                </Link>
              </div>
            </div>
            <aside className="rounded-2xl border border-white/15 bg-white/[0.08] p-5 backdrop-blur sm:p-6">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-cyan-300 text-slate-950">
                  <Dna className="h-6 w-6" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-white">Research boundary</p>
                  <p className="text-xs text-slate-300">Education and early research only</p>
                </div>
              </div>
              <p className="mt-5 text-sm leading-6 text-slate-200">
                This workspace does not provide diagnosis, personal risk, treatment, medication, or dosing guidance. Use it to learn, investigate, and review primary sources.
              </p>
              <Link to={createPageUrl('TermsOfService')} className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-cyan-200 hover:text-white">
                Read the research-use terms <ExternalLink className="h-3 w-3" />
              </Link>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-600">Choose your next move</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Three paths, one coherent workspace.</h2>
          </div>
          <Link to={createPageUrl('Dashboard')} className="inline-flex items-center gap-1 text-sm font-semibold text-slate-700 hover:text-indigo-700">
            View my activity <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          {pathways.map((pathway) => {
            const Icon = pathway.icon;
            return (
              <article key={pathway.to} className={"group relative overflow-hidden rounded-2xl border p-6 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-xl " + pathway.surface}>
                <div className={"mb-8 flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg " + pathway.accent}>
                  <Icon className="h-6 w-6" />
                </div>
                <p className="text-[11px] font-bold tracking-[0.16em] text-slate-500">{pathway.eyebrow}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-950">{pathway.title}</h3>
                <p className="mt-3 min-h-[72px] text-sm leading-6 text-slate-600">{pathway.description}</p>
                <Link to={createPageUrl(pathway.to)} className="mt-7 inline-flex min-h-10 items-center gap-2 text-sm font-bold text-slate-900 transition group-hover:gap-3">
                  {pathway.action} <ArrowRight className="h-4 w-4" />
                </Link>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:px-12">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Evidence clarity, by design</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Know what you are looking at before you act on it.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-slate-600">
              A gene symbol, a database link, and an AI suggestion are not interchangeable evidence. GeneMap labels those differences so learners and researchers can decide what deserves follow-up.
            </p>
            <Link to={createPageUrl('Search')} className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-800">
              See provenance in gene search <Search className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid gap-3">
            {evidence.map(({ icon: Icon, label, detail, tone }) => (
              <div key={label} className={"flex items-start gap-4 rounded-xl border p-4 " + tone}>
                <Icon className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <h3 className="text-sm font-bold text-slate-900">{label}</h3>
                  <p className="mt-1 text-sm text-slate-600">{detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-5 py-12 sm:px-8 lg:px-12">
        <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-100 p-6 shadow-sm sm:p-8">
          <div className="flex flex-col justify-between gap-6 md:flex-row md:items-center">
            <div className="flex items-start gap-4">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-950">A research workspace that keeps its promises.</h2>
                <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">No personal genomic uploads. No hidden clinical recommendations. Just a clearer path from a question to the sources needed to evaluate it.</p>
              </div>
            </div>
            <Link to={createPageUrl('TopicExplorer')} className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 transition hover:border-slate-400 hover:bg-slate-50">
              Explore reviewed topics <BookOpen className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
