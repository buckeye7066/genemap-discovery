import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Trophy, Target } from 'lucide-react';

export default function LearningProgressBar({ completed, total, label = 'Progress' }) {
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600 flex items-center gap-1">
          {percent === 100 ? <Trophy className="w-4 h-4 text-amber-500" /> : <Target className="w-4 h-4 text-slate-400" />}
          {label}
        </span>
        <span className="text-slate-500 text-xs">{completed}/{total} ({percent}%)</span>
      </div>
      <Progress value={percent} className="h-2" />
    </div>
  );
}
