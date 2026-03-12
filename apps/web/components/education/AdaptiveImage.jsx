import React from 'react';
import { Image, AlertCircle, Sparkles } from 'lucide-react';

export default function AdaptiveImage({ data, loading, level, topic }) {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-gradient-to-b from-slate-50 to-white rounded-xl border border-slate-100">
        <div className="relative mb-5">
          <div className="w-14 h-14 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
          <Sparkles className="w-5 h-5 text-blue-500 absolute -right-1 -top-1 animate-pulse-soft" />
        </div>
        <p className="text-slate-600 font-medium">Generating illustration...</p>
        <p className="text-slate-400 text-xs mt-1.5">This may take 10-20 seconds</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-gradient-to-b from-slate-50/50 to-white rounded-xl border border-dashed border-slate-200">
        <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
          <Image className="w-8 h-8 text-slate-300" />
        </div>
        <p className="text-sm font-medium text-slate-500">Generate a visual illustration</p>
        <p className="text-xs text-slate-400 mt-1">Tailored to your learning level</p>
      </div>
    );
  }

  if (data.error) {
    return (
      <div className="flex flex-col items-center justify-center py-14 bg-red-50 rounded-xl border border-red-100">
        <AlertCircle className="w-10 h-10 text-red-400 mb-3" />
        <p className="text-red-600 text-sm font-medium">{data.error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 animate-fade-in">
      <div className="rounded-xl overflow-hidden border border-slate-200 bg-white shadow-sm">
        <img
          src={data.imageUrl}
          alt={`Educational illustration of ${topic}`}
          className="w-full h-auto"
          loading="lazy"
        />
      </div>
      {data.revisedPrompt && (
        <p className="text-xs text-slate-400 italic px-1">{data.revisedPrompt}</p>
      )}
    </div>
  );
}
