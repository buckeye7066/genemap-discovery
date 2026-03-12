import React, { memo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, BookOpen, ArrowRight } from 'lucide-react';

function TopicCard({ topic, progress, onClick }) {
  const hasProgress = progress && progress.attempts > 0;
  const isMastered = progress && progress.bestScore >= progress.totalQuestions * 0.8;

  return (
    <Card
      className={`cursor-pointer topic-card-hover group overflow-hidden ${
        isMastered
          ? 'border-emerald-200 bg-gradient-to-br from-emerald-50/80 to-white'
          : 'border-slate-200/80 bg-white/80 backdrop-blur-sm hover:border-blue-200'
      }`}
      onClick={onClick}
    >
      <CardContent className="p-4 relative">
        <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-r-full ${
          isMastered ? 'bg-gradient-to-b from-emerald-400 to-emerald-600' : 'bg-gradient-to-b from-blue-300 to-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity duration-300'
        }`} />

        <div className="flex items-start justify-between mb-2.5 pl-2">
          <div className="flex items-center gap-2.5">
            {isMastered ? (
              <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              </div>
            ) : (
              <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center flex-shrink-0 transition-colors">
                <BookOpen className="w-4 h-4 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
            )}
            <h3 className="font-semibold text-sm text-slate-900 leading-tight">{topic.title}</h3>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
        </div>
        <p className="text-xs text-slate-500 mb-2 line-clamp-2 pl-2">{topic.description}</p>
        {hasProgress && (
          <div className="pl-2">
            <Badge
              variant={isMastered ? 'default' : 'secondary'}
              className={`text-xs ${isMastered ? 'bg-emerald-600' : ''}`}
            >
              {isMastered ? 'Mastered' : `${progress.bestScore}/${progress.totalQuestions}`}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(TopicCard);
