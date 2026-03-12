import React from 'react';
import { useEducationLevel, EDUCATION_LEVELS, LEVEL_ORDER } from '@/lib/EducationLevelContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { GraduationCap, BookOpen, Microscope, FlaskConical, Brain, Award } from 'lucide-react';

const LEVEL_ICONS = {
  elementary: BookOpen,
  middle_school: BookOpen,
  high_school: Microscope,
  undergraduate: GraduationCap,
  graduate: FlaskConical,
  postgraduate: Brain,
};

const LEVEL_COLORS = {
  elementary: 'from-green-400 to-emerald-500',
  middle_school: 'from-blue-400 to-cyan-500',
  high_school: 'from-purple-400 to-violet-500',
  undergraduate: 'from-orange-400 to-amber-500',
  graduate: 'from-rose-400 to-pink-500',
  postgraduate: 'from-indigo-400 to-blue-600',
};

const LEVEL_BG = {
  elementary: 'hover:border-green-300 hover:bg-green-50',
  middle_school: 'hover:border-blue-300 hover:bg-blue-50',
  high_school: 'hover:border-purple-300 hover:bg-purple-50',
  undergraduate: 'hover:border-orange-300 hover:bg-orange-50',
  graduate: 'hover:border-rose-300 hover:bg-rose-50',
  postgraduate: 'hover:border-indigo-300 hover:bg-indigo-50',
};

const SELECTED_BG = {
  elementary: 'border-green-400 bg-green-50 ring-2 ring-green-200',
  middle_school: 'border-blue-400 bg-blue-50 ring-2 ring-blue-200',
  high_school: 'border-purple-400 bg-purple-50 ring-2 ring-purple-200',
  undergraduate: 'border-orange-400 bg-orange-50 ring-2 ring-orange-200',
  graduate: 'border-rose-400 bg-rose-50 ring-2 ring-rose-200',
  postgraduate: 'border-indigo-400 bg-indigo-50 ring-2 ring-indigo-200',
};

export default function LevelPicker({ onComplete, showTitle = true, compact = false }) {
  const { level: currentLevel, setLevel } = useEducationLevel();

  const handleSelect = (levelId) => {
    setLevel(levelId);
    if (onComplete) {
      onComplete(levelId);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-wrap gap-2">
        {LEVEL_ORDER.map((levelId) => {
          const config = EDUCATION_LEVELS[levelId];
          const isSelected = currentLevel === levelId;
          return (
            <Button
              key={levelId}
              variant={isSelected ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleSelect(levelId)}
              className={isSelected ? 'bg-gradient-to-r ' + LEVEL_COLORS[levelId] + ' text-white border-0' : ''}
            >
              {config.shortLabel}
            </Button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-4 relative">
      {showTitle && (
        <div className="text-center mb-10 relative">
          <div className="absolute inset-0 -top-20 -z-10 overflow-hidden pointer-events-none">
            <div className="absolute top-8 left-1/4 w-64 h-64 bg-blue-200/30 rounded-full blur-3xl animate-pulse-soft" />
            <div className="absolute top-0 right-1/4 w-48 h-48 bg-indigo-200/30 rounded-full blur-3xl animate-pulse-soft delay-200" />
            <div className="absolute top-16 left-1/2 w-56 h-56 bg-purple-200/20 rounded-full blur-3xl animate-pulse-soft delay-400" />
          </div>

          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 mb-5 shadow-xl shadow-blue-500/25 animate-float">
            <GraduationCap className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-4xl font-extrabold text-slate-900 mb-3 tracking-tight">Welcome to GeneMap</h2>
          <p className="text-lg text-slate-600 max-w-lg mx-auto leading-relaxed">
            Choose your learning level and we'll tailor every explanation, visual, and activity just for you.
          </p>
          <p className="text-sm text-slate-400 mt-3">You can change this anytime.</p>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {LEVEL_ORDER.map((levelId, idx) => {
          const config = EDUCATION_LEVELS[levelId];
          const Icon = LEVEL_ICONS[levelId];
          const isSelected = currentLevel === levelId;

          return (
            <Card
              key={levelId}
              className={`cursor-pointer transition-all duration-300 border-2 topic-card-hover animate-slide-up ${
                isSelected ? SELECTED_BG[levelId] : 'border-slate-200/80 ' + LEVEL_BG[levelId]
              }`}
              style={{ animationDelay: `${idx * 0.07}s` }}
              onClick={() => handleSelect(levelId)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-11 h-11 rounded-xl bg-gradient-to-br ${LEVEL_COLORS[levelId]} flex items-center justify-center shadow-lg shadow-black/10`}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-slate-900">{config.label}</h3>
                      {isSelected && <Badge variant="secondary" className="text-xs">Selected</Badge>}
                    </div>
                    <p className="text-xs text-slate-500 mb-1.5">{config.ageRange}</p>
                    <p className="text-sm text-slate-600 leading-snug">{config.description}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {currentLevel && onComplete && (
        <div className="text-center mt-8 animate-fade-in">
          <Button
            size="lg"
            className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-10 py-6 text-base shadow-xl shadow-blue-500/25 hover:shadow-blue-500/40 transition-shadow"
            onClick={() => onComplete(currentLevel)}
          >
            Start Learning
          </Button>
        </div>
      )}
    </div>
  );
}
