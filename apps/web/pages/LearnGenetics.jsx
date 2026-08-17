import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import LevelPicker from '@/components/education/LevelPicker';
import TopicCard from '@/components/education/TopicCard';
import LearningProgressBar from '@/components/education/LearningProgressBar';
import UsageBanner from '@/components/education/UsageBanner';
import { countMastered } from '@/lib/learningProgress';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen, Search, GraduationCap, Trophy, MessageSquare, Sparkles } from 'lucide-react';

export default function LearnGenetics() {
  const { level, needsOnboarding, levelConfig } = useEducationLevel();
  const navigate = useNavigate();
  const [categories, setCategories] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [topicsError, setTopicsError] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setTopicsError(false);
    try {
      const [topicsRes, progressRes] = await Promise.allSettled([
        apiClient.getTopics(),
        apiClient.getLearningProgress(),
      ]);
      if (topicsRes.status === 'fulfilled' && Array.isArray(topicsRes.value) && topicsRes.value.length > 0) {
        // apiClient.getTopics() already unwraps to the categories ARRAY.
        // (Reading `.categories` off the array yielded undefined → an empty
        // "Learn Genetics" page with 0/0 topics.)
        setCategories(topicsRes.value);
      } else {
        // Topics are a static catalog the page is useless without. Surface the
        // failure with a retry instead of silently rendering an empty 0/0 page.
        setTopicsError(true);
      }
      if (progressRes.status === 'fulfilled') {
        setProgress(progressRes.value.progress || []);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      setTopicsError(true);
    } finally {
      setLoading(false);
    }
  };

  const q = searchQuery.toLowerCase();
  const filteredCategories = categories.map(cat => ({
    ...cat,
    topics: (cat.topics || []).filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.description || '').toLowerCase().includes(q)
    ),
  })).filter(cat => cat.topics.length > 0);

  // "Mastered" uses the same 80%-quiz-score definition as the Learning Path
  // page (see lib/learningProgress.js) so the two never show conflicting counts.
  const masteredTopics = countMastered(progress);
  const totalTopics = categories.reduce((sum, cat) => sum + cat.topics.length, 0);

  if (needsOnboarding) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50">
        <LevelPicker onComplete={() => {}} showTitle={true} />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6 dna-bg min-h-screen">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 animate-slide-up">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 flex items-center gap-3 tracking-tight">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            Learn Genetics
          </h1>
          <p className="text-slate-500 mt-1.5 ml-14">
            {levelConfig ? `Learning at ${levelConfig.label} level` : 'Choose a topic to explore'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <LevelPicker compact />
        </div>
      </div>

      <UsageBanner />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-slide-up delay-100">
        <Card
          className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white border-0 shadow-lg shadow-blue-500/20 topic-card-hover"
          title="Topics where you've scored 80% or higher on a quiz"
        >
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Trophy className="w-6 h-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{masteredTopics}/{totalTopics}</p>
                <p className="text-blue-100 text-sm">Topics Mastered</p>
                <p className="text-blue-200 text-[11px] mt-0.5">Score 80%+ on a quiz</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500 to-pink-600 text-white border-0 shadow-lg shadow-purple-500/20 cursor-pointer topic-card-hover" onClick={() => navigate('/quizmode')}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <Sparkles className="w-6 h-6" />
              </div>
              <div>
                <p className="text-lg font-bold">Take a Quiz</p>
                <p className="text-purple-100 text-sm">Test your knowledge</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white border-0 shadow-lg shadow-emerald-500/20 cursor-pointer topic-card-hover" onClick={() => navigate('/learningpath')}>
          <CardContent className="p-5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-white/20 flex items-center justify-center">
                <GraduationCap className="w-6 h-6" />
              </div>
              <div>
                <p className="text-lg font-bold">Learning Path</p>
                <p className="text-emerald-100 text-sm">Guided curriculum</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="relative animate-slide-up delay-200">
        <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="Search topics..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10 h-11 bg-white/80 backdrop-blur-sm border-slate-200/80 shadow-sm"
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20">
          <div className="w-10 h-10 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin mb-3" />
          <p className="text-slate-500 text-sm">Loading topics...</p>
        </div>
      ) : topicsError ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-700 font-medium">We couldn't load the genetics topics.</p>
          <p className="text-slate-500 text-sm mt-1 mb-4">This is usually a temporary connection hiccup.</p>
          <Button onClick={loadData} className="bg-blue-600 hover:bg-blue-700">Try again</Button>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Search className="w-10 h-10 text-slate-300 mb-3" />
          <p className="text-slate-700 font-medium">No topics match "{searchQuery}".</p>
          <p className="text-slate-500 text-sm mt-1">Try a different search term.</p>
        </div>
      ) : (
        <div className="space-y-10">
          {filteredCategories.map((category, catIdx) => (
            <div key={category.category} className="animate-slide-up" style={{ animationDelay: `${0.15 + catIdx * 0.08}s` }}>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-1 h-6 rounded-full bg-gradient-to-b from-blue-500 to-indigo-500" />
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {category.category}
                </h2>
                <Badge variant="secondary" className="text-xs font-medium">{category.topics.length} {category.topics.length === 1 ? 'topic' : 'topics'}</Badge>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {category.topics.map((topic) => {
                  const topicProgress = progress.find(p => p.topicId === topic.id);
                  return (
                    <TopicCard
                      key={topic.id}
                      topic={topic}
                      progress={topicProgress}
                      onClick={() => navigate(`/topicexplorer?topic=${encodeURIComponent(topic.id)}&title=${encodeURIComponent(topic.title)}`)}
                    />
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
