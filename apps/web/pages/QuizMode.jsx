import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle2, XCircle, Trophy, RefreshCw, ArrowRight, HelpCircle, Sparkles } from 'lucide-react';
import MedicalDisclaimer from '@/components/shared/MedicalDisclaimer';
import PublicationState, {
  enforcePublicationContentType,
  publicationContent,
} from '@/components/shared/PublicationState';

function isReusableQuiz(content) {
  return Array.isArray(content) && content.length > 0 && content.every((item) => (
    item
    && typeof item === 'object'
    && typeof item.question === 'string'
    && item.question.trim()
    && Array.isArray(item.options)
    && item.options.length >= 2
    && item.options.every((option) => typeof option === 'string' && option.trim())
    && Number.isInteger(item.correctIndex)
    && item.correctIndex >= 0
    && item.correctIndex < item.options.length
    && typeof item.explanation === 'string'
    && item.explanation.trim()
  ));
}

// Shown when the user reaches /quizmode without choosing a topic (e.g. the
// sidebar "Take a Quiz" link). Without this, the page silently defaulted to a
// hidden "what-is-dna / Genetics" quiz, so the user never knew what subject
// they were being tested on until questions appeared.
function QuizTopicPicker({ onSelect, levelConfig }) {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    apiClient.getTopics()
      .then((cats) => { if (active) setCategories(Array.isArray(cats) ? cats : []); })
      .catch((err) => { if (active) setError(err.message || 'Could not load topics'); });
    return () => { active = false; };
  }, []);

  const availableTopics = (categories || []).flatMap((category) => category.topics || []);
  const selectSurpriseTopic = () => {
    if (availableTopics.length === 0) return;
    const index = Math.floor(Math.random() * availableTopics.length);
    onSelect(availableTopics[index]);
  };

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-6 dna-bg min-h-screen">
      <div className="text-center space-y-2 animate-slide-up">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20">
          <HelpCircle className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Take a Quiz</h1>
        <p className="text-sm text-slate-500">
          Choose a topic and we'll generate 5 questions{levelConfig?.label ? ` at ${levelConfig.label} level` : ''}.
        </p>
      </div>

      <Card className="animate-slide-up delay-100">
        <CardContent className="p-5">
          <button
            onClick={selectSurpriseTopic}
            disabled={availableTopics.length === 0}
            className="w-full flex items-center gap-3 p-3.5 mb-4 rounded-xl border-2 border-purple-200 bg-purple-50/60 hover:bg-purple-50 hover:border-purple-300 transition-all text-left"
          >
            <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <div>
              <p className="font-semibold text-slate-900 text-sm">Surprise me</p>
              <p className="text-xs text-slate-500">A mixed quiz on general genetics</p>
            </div>
          </button>

          {error && <p className="text-sm text-red-500 py-4 text-center">{error}</p>}
          {!categories && !error && (
            <p className="text-sm text-slate-400 py-4 text-center">Loading topics…</p>
          )}
          {categories && categories.length === 0 && !error && (
            <p className="text-sm text-slate-400 py-4 text-center">No topics available right now.</p>
          )}

          <div className="space-y-5">
            {(categories || []).map((cat) => (
              <div key={cat.category}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{cat.category}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {(cat.topics || []).map((topic) => (
                    <button
                      key={topic.id}
                      onClick={() => onSelect(topic)}
                      className="text-left p-3 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 transition-all text-sm font-medium text-slate-700"
                    >
                      {topic.title}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default function QuizMode() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { level, levelConfig } = useEducationLevel();

  const topicParam = searchParams.get('topic');
  const topicId = topicParam || 'what-is-dna';
  const quizLevel = level || 'undergraduate';
  const quizRequestScope = `${topicId}\u0000${quizLevel}`;
  const quizRequestRef = useRef({ scope: quizRequestScope, sequence: 0 });
  if (quizRequestRef.current.scope !== quizRequestScope) {
    quizRequestRef.current = {
      scope: quizRequestScope,
      sequence: quizRequestRef.current.sequence + 1,
    };
  }

  const [catalogTopic, setCatalogTopic] = useState(null);
  const [topicMetadata, setTopicMetadata] = useState(null);
  const [quizPublication, setQuizPublication] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  // Only auto-load a quiz when a topic was explicitly chosen; otherwise the
  // picker below is shown first.
  const [loading, setLoading] = useState(!!topicParam);
  const [error, setError] = useState(null);
  const [quizStateScope, setQuizStateScope] = useState(quizRequestScope);

  useEffect(() => {
    let active = true;
    setQuizStateScope(quizRequestScope);
    setCatalogTopic(null);
    setTopicMetadata(null);
    setQuizPublication(null);
    setQuestions([]);
    setError(null);
    if (!topicParam) {
      setLoading(false);
      return () => { active = false; };
    }

    setLoading(true);
    apiClient.getTopics()
      .then((categories) => {
        if (!active) return;
        const match = (Array.isArray(categories) ? categories : [])
          .flatMap((category) => (Array.isArray(category?.topics) ? category.topics : []).map((topic) => ({
            ...topic,
            category: category.category,
          })))
          .find((topic) => topic?.id === topicId);
        if (!match) {
          setError('This education topic is unavailable because it is not in the reviewed catalog.');
          setLoading(false);
          return;
        }
        setCatalogTopic(match);
        setTopicMetadata(match);
      })
      .catch((catalogError) => {
        if (!active) return;
        setError(catalogError?.message || 'The reviewed topic catalog is unavailable.');
        setLoading(false);
      });
    return () => { active = false; };
  }, [topicParam]);

  useEffect(() => {
    if (catalogTopic?.id === topicId) loadQuiz();
  }, [catalogTopic?.id, quizRequestScope]);

  if (!topicParam) {
    return (
      <QuizTopicPicker
        levelConfig={levelConfig}
        onSelect={(topic) =>
          navigate(`/quizmode?topic=${encodeURIComponent(topic.id)}`)
        }
      />
    );
  }

  const loadQuiz = async () => {
    if (!topicParam || catalogTopic?.id !== topicId) return;
    const requestSequence = quizRequestRef.current.sequence + 1;
    quizRequestRef.current.sequence = requestSequence;
    const isCurrentRequest = () => (
      quizRequestRef.current.scope === quizRequestScope
      && quizRequestRef.current.sequence === requestSequence
    );
    setQuizStateScope(quizRequestScope);
    setLoading(true);
    setError(null);
    setQuizPublication(null);
    setTopicMetadata(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setFinished(false);

    try {
      const res = await apiClient.generateQuiz({ topic: topicId, level: quizLevel, questionCount: 5 });
      if (!isCurrentRequest()) return;
      if (res?.topicMetadata?.id !== topicId) {
        throw new Error('The server returned mismatched topic metadata.');
      }
      const publication = enforcePublicationContentType(
        res?.publication,
        isReusableQuiz,
      );
      const content = publicationContent(publication);
      setQuizPublication(publication);
      setTopicMetadata(res?.topicMetadata || null);
      setQuestions(Array.isArray(content) ? content : []);
    } catch (err) {
      if (isCurrentRequest()) setError(err?.message || 'Unable to generate this quiz.');
    } finally {
      if (isCurrentRequest()) setLoading(false);
    }
  };

  const handleAnswer = (index) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    if (index === questions[currentIndex]?.correctIndex) {
      setScore(prev => prev + 1);
    }
  };

  const nextQuestion = async () => {
    if (currentIndex + 1 >= questions.length) {
      setFinished(true);
      try {
        await apiClient.updateLearningProgress({
          topicId,
          score,
          totalQuestions: questions.length,
        });
      } catch {
        // Non-critical
      }
    } else {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    }
  };

  const current = questions[currentIndex];
  const progressPercent = questions.length > 0 ? ((currentIndex + (showResult ? 1 : 0)) / questions.length) * 100 : 0;
  const topicTitle = topicMetadata?.title || catalogTopic?.title || 'Genetics topic';
  const visibleLoading = quizStateScope === quizRequestScope ? loading : Boolean(topicParam);

  if (visibleLoading) {
    return (
      <div className="p-6 max-w-2xl mx-auto dna-bg min-h-screen">
        <div className="flex flex-col items-center justify-center py-24">
          <div className="w-16 h-16 border-4 border-purple-100 border-t-purple-600 rounded-full animate-spin mb-5" />
          <p className="text-slate-700 font-medium text-lg">Generating quiz questions...</p>
          <p className="text-sm text-slate-400 mt-2">Tailored for {levelConfig?.label || 'your'} level</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Card>
          <CardContent className="p-6 text-center">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
            <h3 className="text-lg font-semibold mb-2">Quiz Error</h3>
            <p className="text-slate-600 mb-4" role="alert">{error}</p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
              {catalogTopic && <Button onClick={loadQuiz}>Try Again</Button>}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="p-6 max-w-2xl mx-auto dna-bg min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>{topicTitle} Quiz</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <PublicationState artifact={quizPublication} />
            {!quizPublication && (
              <p className="text-sm text-slate-600">No reusable quiz publication was returned.</p>
            )}
            <div className="flex gap-3">
              <Button variant="outline" onClick={() => navigate(-1)}>Go Back</Button>
              <Button onClick={loadQuiz}>Try Again</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (finished) {
    const percentage = Math.round((score / questions.length) * 100);
    return (
      <div className="p-6 max-w-2xl mx-auto dna-bg min-h-screen flex items-start justify-center pt-12">
        <Card className="overflow-hidden shadow-xl w-full animate-slide-up">
          <div className={`p-10 text-center text-white relative overflow-hidden ${
            percentage >= 80 ? 'bg-gradient-to-br from-emerald-500 to-teal-600' :
            percentage >= 60 ? 'bg-gradient-to-br from-blue-500 to-indigo-600' :
            'bg-gradient-to-br from-orange-500 to-amber-600'
          }`}>
            <div className="absolute inset-0 opacity-10">
              <div className="absolute top-4 left-8 w-32 h-32 border border-white/40 rounded-full" />
              <div className="absolute bottom-4 right-8 w-24 h-24 border border-white/40 rounded-full" />
              <div className="absolute top-12 right-16 w-16 h-16 border border-white/30 rounded-full" />
            </div>
            <div className="relative">
              <Trophy className="w-20 h-20 mx-auto mb-5 animate-float" />
              <p className="text-6xl font-extrabold mb-2 tracking-tight">{score}/{questions.length}</p>
              <p className="text-2xl font-medium opacity-90">{percentage}%</p>
              <p className="mt-3 text-lg opacity-80 font-medium">
                {percentage >= 80 ? 'Excellent work!' : percentage >= 60 ? 'Good job!' : 'Keep practicing!'}
              </p>
            </div>
          </div>
          <CardContent className="p-6">
            <PublicationState artifact={quizPublication} className="mb-4" />
            <h3 className="font-semibold text-center mb-5 text-slate-700">{topicTitle} Quiz Results</h3>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => navigate('/learngenetics')} className="h-10">
                <ArrowLeft className="w-4 h-4 mr-1" /> Back to Topics
              </Button>
              <Button onClick={loadQuiz} className="h-10 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-500/20">
                <RefreshCw className="w-4 h-4 mr-1" /> Try Again
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto space-y-5 dna-bg min-h-screen">
      <div className="flex items-center gap-3 animate-slide-up">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="hover:bg-purple-50">
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-slate-900">{topicTitle} Quiz</h1>
          <p className="text-xs text-slate-500">{levelConfig?.label} level</p>
        </div>
        <Badge variant="secondary" className="font-mono text-xs">
          {currentIndex + 1}/{questions.length}
        </Badge>
      </div>

      <Progress value={progressPercent} className="h-2 animate-slide-up delay-100" />

      <MedicalDisclaimer variant="education" compact />

      <PublicationState artifact={quizPublication} />

      {current && (
        <Card className="animate-slide-up delay-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500" />
          <CardContent className="p-6 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 leading-relaxed">{current.question}</h2>

            <div className="space-y-2.5">
              {(current.options || []).map((option, i) => {
                // Use a NEUTRAL left border before the answer is revealed. The
                // old per-index palette put a green (emerald) border on option
                // index 2, which looked exactly like a "this is the correct
                // answer" hint whenever correctIndex was 2. Colors must only
                // convey correctness AFTER the user answers.
                let className = 'w-full text-left p-3.5 rounded-xl border-2 border-l-4 transition-all duration-200 text-sm ';
                if (!showResult) {
                  className += selectedAnswer === i
                    ? 'border-blue-500 bg-blue-50/80 border-l-blue-500'
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm border-l-slate-300';
                } else if (i === current.correctIndex) {
                  className += 'border-emerald-500 bg-emerald-50 text-emerald-800 border-l-emerald-500';
                } else if (i === selectedAnswer) {
                  className += 'border-red-400 bg-red-50 text-red-800 border-l-red-400';
                } else {
                  className += 'border-slate-100 opacity-40 border-l-slate-300';
                }

                return (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    disabled={showResult}
                    className={className}
                  >
                    <div className="flex items-center gap-3">
                      <span className={`flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold ${
                        showResult && i === current.correctIndex ? 'bg-emerald-200 text-emerald-800'
                        : showResult && i === selectedAnswer ? 'bg-red-200 text-red-800'
                        : selectedAnswer === i ? 'bg-blue-200 text-blue-800'
                        : 'bg-slate-100 text-slate-600'
                      }`}>
                        {String.fromCharCode(65 + i)}
                      </span>
                      <span className="flex-1">{option}</span>
                      {showResult && i === current.correctIndex && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                      )}
                      {showResult && i === selectedAnswer && i !== current.correctIndex && (
                        <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {showResult && current.explanation && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200/60 rounded-xl text-sm text-blue-800 leading-relaxed animate-slide-up">
                <strong>Explanation:</strong> {current.explanation}
              </div>
            )}

            {showResult && (
              <Button
                onClick={nextQuestion}
                className="w-full h-11 bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/20 animate-fade-in"
              >
                {currentIndex + 1 >= questions.length ? 'See Results' : 'Next Question'}
                <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
