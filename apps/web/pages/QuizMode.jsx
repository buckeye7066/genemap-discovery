import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, CheckCircle2, XCircle, Trophy, RefreshCw, ArrowRight } from 'lucide-react';

export default function QuizMode() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { level, levelConfig } = useEducationLevel();

  const topicId = searchParams.get('topic') || 'what-is-dna';
  const topicTitle = searchParams.get('title') || 'Genetics';

  const [questions, setQuestions] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [finished, setFinished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadQuiz();
  }, [topicTitle, level]);

  const loadQuiz = async () => {
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setFinished(false);

    try {
      const res = await apiClient.generateQuiz({ topic: topicTitle, level, questionCount: 5 });
      const q = Array.isArray(res.questions) ? res.questions : [];
      if (q.length === 0) {
        setError('Could not generate quiz questions. Please try again.');
      } else {
        setQuestions(q);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
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
          score: score + (selectedAnswer === questions[currentIndex]?.correctIndex ? 1 : 0),
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

  if (loading) {
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
            <p className="text-slate-600 mb-4">{error}</p>
            <div className="flex gap-3 justify-center">
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

      {current && (
        <Card className="animate-slide-up delay-200 shadow-sm overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-indigo-500" />
          <CardContent className="p-6 space-y-5">
            <h2 className="text-lg font-semibold text-slate-900 leading-relaxed">{current.question}</h2>

            <div className="space-y-2.5">
              {(current.options || []).map((option, i) => {
                const optionColors = ['border-l-blue-400', 'border-l-purple-400', 'border-l-emerald-400', 'border-l-amber-400'];
                let className = 'w-full text-left p-3.5 rounded-xl border-2 border-l-4 transition-all duration-200 text-sm ';
                if (!showResult) {
                  className += selectedAnswer === i
                    ? 'border-blue-500 bg-blue-50/80 ' + optionColors[i % 4]
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 hover:shadow-sm ' + optionColors[i % 4];
                } else if (i === current.correctIndex) {
                  className += 'border-emerald-500 bg-emerald-50 text-emerald-800 border-l-emerald-500';
                } else if (i === selectedAnswer) {
                  className += 'border-red-400 bg-red-50 text-red-800 border-l-red-400';
                } else {
                  className += 'border-slate-100 opacity-40 ' + optionColors[i % 4];
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
