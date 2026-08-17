import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEducationLevel, EDUCATION_LEVELS } from '@/lib/EducationLevelContext';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import LevelPicker from '@/components/education/LevelPicker';
import { getTopicStatus as getStatus } from '@/lib/learningProgress';
import { CheckCircle2, Circle, Lock, ArrowRight, GraduationCap, BookOpen, Trophy } from 'lucide-react';

// One-line blurb per catalog category. The topic LIST itself is NOT defined
// here — it comes from the canonical catalog the API serves (GET
// /education/topics), the SAME source LearnGenetics and Premium use. Previously
// this file hardcoded its own 23-topic curriculum, silently dropping 9 of the
// 32 catalog topics (Gene Regulation, Epigenetics, Phylogenetics, Natural
// Selection, Synthetic Biology, …). Deriving from the API makes drift impossible.
const CATEGORY_BLURBS = {
  'DNA Basics': 'The building blocks of genetics',
  'How Genes Work': 'How genetic information flows',
  'Inheritance': 'How traits pass between generations',
  'Mutations & Variation': 'What makes us different',
  'Genomics & Technology': 'Technology and the future of genetics',
  'Genetics & Health': 'Genes in medicine',
  'Evolution & Population Genetics': 'Genes across populations and time',
  'Advanced Topics': 'Frontiers of modern genetics',
};

export default function LearningPath() {
  const { level, levelConfig, needsOnboarding } = useEducationLevel();
  const navigate = useNavigate();
  const [progress, setProgress] = useState([]);
  const [curriculum, setCurriculum] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Pull the curriculum from the canonical topic catalog (same source as
      // Learn Genetics) so every catalog topic is included — no hardcoded subset.
      const settled = await Promise.allSettled([
        apiClient.getTopics(),
        apiClient.getLearningProgress(),
      ]);
      if (!Array.isArray(settled) || settled.length !== 2) {
        return;
      }
      const [topicsRes, progressRes] = settled;

      if (topicsRes.status === 'fulfilled') {
        const categories = topicsRes.value || [];
        setCurriculum(
          categories.map((c) => ({
            module: c.category,
            description: CATEGORY_BLURBS[c.category] || 'Core genetics topics',
            topics: (c.topics || []).map((t) => ({ id: t.id, title: t.title })),
          }))
        );
      }
      if (progressRes.status === 'fulfilled') {
        setProgress(progressRes.value?.progress || []);
      }
    } finally {
      setLoading(false);
    }
  };

  const getTopicStatus = (topicId) => getStatus(progress, topicId);

  const allTopics = curriculum.flatMap(m => m.topics);
  const completedTopics = allTopics.filter(t => getTopicStatus(t.id) === 'mastered');
  const completedCount = completedTopics.length;
  const totalCount = allTopics.length;
  const overallProgress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  // Bridge from educational completion into research/discovery modes. Unlocks
  // once the learner has mastered enough topics, carrying lesson context
  // (the most recently mastered topic) into the research search/explorer.
  const RESEARCH_UNLOCK_THRESHOLD = 3;
  const researchUnlocked = completedCount >= RESEARCH_UNLOCK_THRESHOLD;
  const lastMasteredTopic = completedTopics[completedTopics.length - 1];
  const goToResearch = () => {
    const params = new URLSearchParams();
    if (lastMasteredTopic) {
      params.set('q', lastMasteredTopic.title);
      params.set('from', 'learning-path');
      params.set('topic', lastMasteredTopic.id);
    }
    const qs = params.toString();
    navigate(`/search${qs ? `?${qs}` : ''}`);
  };

  if (needsOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <LevelPicker onComplete={() => {}} showTitle={true} />
      </div>
    );
  }

  const MODULE_ACCENTS = [
    { gradient: 'from-blue-500 to-indigo-500', bg: 'from-blue-50 to-indigo-50', text: 'text-blue-700' },
    { gradient: 'from-purple-500 to-violet-500', bg: 'from-purple-50 to-violet-50', text: 'text-purple-700' },
    { gradient: 'from-emerald-500 to-teal-500', bg: 'from-emerald-50 to-teal-50', text: 'text-emerald-700' },
    { gradient: 'from-orange-500 to-amber-500', bg: 'from-orange-50 to-amber-50', text: 'text-orange-700' },
    { gradient: 'from-rose-500 to-pink-500', bg: 'from-rose-50 to-pink-50', text: 'text-rose-700' },
    { gradient: 'from-cyan-500 to-blue-500', bg: 'from-cyan-50 to-blue-50', text: 'text-cyan-700' },
  ];

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 dna-bg min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <GraduationCap className="w-5 h-5 text-white" />
            </div>
            Learning Path
          </h1>
          <p className="text-slate-500 mt-1.5 ml-14">Your guided genetics curriculum</p>
        </div>
        <LevelPicker compact />
      </div>

      <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200/60 shadow-sm animate-slide-up delay-100 overflow-hidden">
        <CardContent className="p-5 relative">
          <div className="absolute right-0 top-0 w-24 h-24 bg-emerald-200/20 rounded-full -translate-y-8 translate-x-8" />
          <div className="flex items-center gap-4 relative">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Trophy className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-slate-900">Overall Progress</span>
                <span className="text-sm text-slate-600 font-medium">{completedCount}/{totalCount} mastered</span>
              </div>
              <Progress value={overallProgress} className="h-3" />
            </div>
          </div>
          {researchUnlocked && (
            <div className="mt-4 pt-4 border-t border-emerald-200/60 relative">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-emerald-600" />
                  <span className="text-sm text-slate-700">
                    You've mastered enough to start exploring real genes.
                    {lastMasteredTopic ? ` Continue from “${lastMasteredTopic.title}”.` : ''}
                  </span>
                </div>
                <Button
                  onClick={goToResearch}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white shrink-0"
                >
                  Continue to Research
                  <ArrowRight className="w-4 h-4 ml-1.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Loading your curriculum...</p>
        </div>
      ) : (
        <div className="space-y-5">
          {curriculum.map((module, moduleIndex) => {
            const moduleTopics = module.topics;
            const moduleMastered = moduleTopics.filter(t => getTopicStatus(t.id) === 'mastered').length;
            const moduleProgress = moduleTopics.length > 0 ? Math.round((moduleMastered / moduleTopics.length) * 100) : 0;
            const accent = MODULE_ACCENTS[moduleIndex % MODULE_ACCENTS.length];

            return (
              <Card
                key={module.module}
                className="overflow-hidden shadow-sm animate-slide-up"
                style={{ animationDelay: `${0.15 + moduleIndex * 0.06}s` }}
              >
                <div className={`h-1 bg-gradient-to-r ${accent.gradient}`} />
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`w-8 h-8 rounded-lg bg-gradient-to-br ${accent.gradient} flex items-center justify-center text-sm font-bold text-white shadow-sm`}>
                        {moduleIndex + 1}
                      </span>
                      <div>
                        <CardTitle className="text-lg">{module.module}</CardTitle>
                        <p className="text-sm text-slate-500 mt-0.5">{module.description}</p>
                      </div>
                    </div>
                    <Badge
                      variant={moduleProgress === 100 ? 'default' : 'secondary'}
                      className={moduleProgress === 100 ? 'bg-emerald-600' : ''}
                    >
                      {moduleProgress}%
                    </Badge>
                  </div>
                  <Progress value={moduleProgress} className="h-1.5 mt-3" />
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1">
                    {moduleTopics.map((topic) => {
                      const status = getTopicStatus(topic.id);
                      return (
                        <button
                          key={topic.id}
                          onClick={() => navigate(`/topicexplorer?topic=${encodeURIComponent(topic.id)}&title=${encodeURIComponent(topic.title)}`)}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-all text-left group"
                        >
                          {status === 'mastered' ? (
                            <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            </div>
                          ) : status === 'in_progress' ? (
                            <div className="w-7 h-7 rounded-lg bg-blue-100 flex items-center justify-center flex-shrink-0">
                              <Circle className="w-4 h-4 text-blue-500" />
                            </div>
                          ) : (
                            <div className="w-7 h-7 rounded-lg bg-slate-100 group-hover:bg-blue-50 flex items-center justify-center flex-shrink-0 transition-colors">
                              <Circle className="w-4 h-4 text-slate-300 group-hover:text-blue-400 transition-colors" />
                            </div>
                          )}
                          <span className={`flex-1 text-sm ${status === 'mastered' ? 'text-emerald-700 font-medium' : 'text-slate-700'}`}>
                            {topic.title}
                          </span>
                          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all" />
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
