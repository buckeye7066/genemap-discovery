import React from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen } from 'lucide-react';

export default function AdaptiveExplanation({ content, loading, level }) {
  if (loading) {
    return (
      <div className="space-y-3 animate-pulse p-1">
        <div className="h-5 bg-gradient-to-r from-slate-200 to-slate-100 rounded-lg w-1/3" />
        <div className="h-3.5 bg-slate-100 rounded w-full" />
        <div className="h-3.5 bg-slate-100 rounded w-5/6" />
        <div className="h-3.5 bg-slate-100 rounded w-full" />
        <div className="h-3.5 bg-slate-100 rounded w-2/3" />
        <div className="h-8 mt-3" />
        <div className="h-5 bg-gradient-to-r from-slate-200 to-slate-100 rounded-lg w-1/4" />
        <div className="h-3.5 bg-slate-100 rounded w-full" />
        <div className="h-3.5 bg-slate-100 rounded w-4/5" />
        <div className="h-3.5 bg-slate-100 rounded w-full" />
      </div>
    );
  }

  if (!content) {
    return (
      <div className="text-center py-12 text-slate-400">
        <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm font-medium">No explanation loaded yet.</p>
        <p className="text-xs mt-1">Click refresh to generate one.</p>
      </div>
    );
  }

  const fontSizeClass = ['elementary', 'middle_school'].includes(level)
    ? 'text-base leading-relaxed'
    : 'text-sm leading-relaxed';

  return (
    <div className={`prose prose-slate max-w-none ${fontSizeClass} animate-fade-in`}>
      <ReactMarkdown
        components={{
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-slate-900 mt-6 mb-2.5 first:mt-0 flex items-center gap-2">
              <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-slate-800 mt-5 mb-1.5">{children}</h3>
          ),
          p: ({ children }) => (
            <p className="text-slate-700 mb-3 leading-relaxed">{children}</p>
          ),
          strong: ({ children }) => (
            <strong className="font-semibold text-slate-900">{children}</strong>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside space-y-1.5 mb-3 text-slate-700">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside space-y-1.5 mb-3 text-slate-700">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-slate-700 leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-blue-300 bg-blue-50/50 pl-4 py-2 my-3 rounded-r-lg text-blue-900 italic">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
              {children}
            </code>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
