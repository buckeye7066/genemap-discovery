import React from 'react';
import NavBar from './components/layout/NavBar';

export default function Layout({ children }) {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-950">
      <NavBar />
      <div>{children}</div>
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 text-sm leading-6 text-slate-700 sm:px-6 lg:px-8">
          GeneMap Discovery is for education and exploration only. It does not provide diagnosis, personal risk estimates, treatment advice, dosing advice, drug-avoidance advice, screening advice, urgency guidance, pharmacogenomics guidance, or clinical trial guidance.
        </div>
      </footer>
    </div>
  );
}
