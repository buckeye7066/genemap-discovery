import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

/**
 * Shared "the AI is working" indicator for the slow LLM calls (10-25s).
 *
 * The old states were either a bare spinner or an indistinguishable pulse
 * skeleton that read as "hung". A live elapsed-seconds counter plus an honest
 * "this takes a bit" hint reassures the user that the request is progressing.
 */
export default function AiThinkingIndicator({
  label = 'Working…',
  hint = 'This usually takes 10–25 seconds.',
  className = '',
}) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const started = Date.now();
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => {
      clearInterval(id);
      setElapsed(0); // Reset elapsed time on unmount
    };
  }, []);

  return (
    <div className={`flex flex-col items-center justify-center py-10 text-center ${className}`}>
      <Loader2 className="w-8 h-8 text-blue-600 animate-spin mb-3" />
      <p className="text-slate-700 font-medium">{label}</p>
      <p className="text-slate-500 text-sm mt-1">{hint}</p>
      <p className="text-slate-400 text-xs mt-2 tabular-nums">{elapsed}s elapsed</p>
    </div>
  );
}
