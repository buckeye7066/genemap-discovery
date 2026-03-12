import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import AdaptiveExplanation from '@/components/education/AdaptiveExplanation';
import AdaptiveImage from '@/components/education/AdaptiveImage';
import LevelPicker from '@/components/education/LevelPicker';
import UsageBanner from '@/components/education/UsageBanner';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Image, MessageSquare, HelpCircle, RefreshCw, Send } from 'lucide-react';

export default function TopicExplorer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { level, levelConfig } = useEducationLevel();

  const topicId = searchParams.get('topic') || '';
  const topicTitle = searchParams.get('title') || topicId;

  const [explanation, setExplanation] = useState('');
  const [imageData, setImageData] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState({ explanation: false, image: false, chat: false });

  useEffect(() => {
    if (topicTitle && level) {
      loadExplanation();
    }
  }, [topicTitle, level]);

  const loadExplanation = async () => {
    setLoading(prev => ({ ...prev, explanation: true }));
    try {
      const res = await apiClient.getExplanation({ topic: topicTitle, level });
      setExplanation(res.explanation || '');
    } catch (err) {
      setExplanation(`Unable to load explanation: ${err.message}`);
    } finally {
      setLoading(prev => ({ ...prev, explanation: false }));
    }
  };

  const loadImage = async () => {
    setLoading(prev => ({ ...prev, image: true }));
    try {
      const res = await apiClient.generateImage({ topic: topicTitle, level });
      setImageData(res);
    } catch (err) {
      setImageData({ error: err.message });
    } finally {
      setLoading(prev => ({ ...prev, image: false }));
    }
  };

  const sendChat = async () => {
    if (!chatInput.trim()) return;
    const userMsg = { role: 'user', content: chatInput };
    const updatedMessages = [...chatMessages, userMsg];
    setChatMessages(updatedMessages);
    setChatInput('');
    setLoading(prev => ({ ...prev, chat: true }));

    try {
      const contextMsg = { role: 'system', content: `The student is learning about: ${topicTitle}. Current discussion context is genetics education.` };
      const res = await apiClient.chat({
        messages: [contextMsg, ...updatedMessages],
        level,
      });
      setChatMessages(prev => [...prev, { role: 'assistant', content: res.response }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Sorry, I encountered an error: ${err.message}` }]);
    } finally {
      setLoading(prev => ({ ...prev, chat: false }));
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 dna-bg min-h-screen">
      <div className="flex items-center gap-4 animate-slide-up">
        <Button variant="ghost" size="sm" onClick={() => navigate('/learngenetics')} className="hover:bg-blue-50">
          <ArrowLeft className="w-4 h-4 mr-1" /> Back
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">{topicTitle}</h1>
          <p className="text-sm text-slate-500">{levelConfig?.label || 'Select a level'}</p>
        </div>
        <LevelPicker compact />
      </div>

      <UsageBanner />

      <Tabs defaultValue="learn" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="learn" className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" /> Learn
          </TabsTrigger>
          <TabsTrigger value="visual" className="flex items-center gap-1">
            <Image className="w-4 h-4" /> Visual
          </TabsTrigger>
          <TabsTrigger value="tutor" className="flex items-center gap-1">
            <MessageSquare className="w-4 h-4" /> Tutor
          </TabsTrigger>
          <TabsTrigger value="quiz" className="flex items-center gap-1">
            <HelpCircle className="w-4 h-4" /> Quiz
          </TabsTrigger>
        </TabsList>

        <TabsContent value="learn" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Explanation</CardTitle>
              <Button variant="ghost" size="sm" onClick={loadExplanation} disabled={loading.explanation}>
                <RefreshCw className={`w-4 h-4 ${loading.explanation ? 'animate-spin' : ''}`} />
              </Button>
            </CardHeader>
            <CardContent>
              <AdaptiveExplanation content={explanation} loading={loading.explanation} level={level} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="visual" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Visual Illustration</CardTitle>
              <Button variant="outline" size="sm" onClick={loadImage} disabled={loading.image}>
                {imageData ? 'Regenerate' : 'Generate'} Image
              </Button>
            </CardHeader>
            <CardContent>
              <AdaptiveImage data={imageData} loading={loading.image} level={level} topic={topicTitle} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tutor" className="mt-4">
          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b border-slate-100">
              <CardTitle className="text-lg flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-blue-600" />
                AI Genetics Tutor
              </CardTitle>
              <p className="text-sm text-slate-500">Ask questions about {topicTitle}</p>
            </CardHeader>
            <CardContent className="space-y-4 p-4">
              <div className="h-80 overflow-y-auto space-y-3 p-3 bg-gradient-to-b from-slate-50/50 to-white rounded-lg scrollbar-thin">
                {chatMessages.length === 0 && (
                  <div className="text-center py-12">
                    <MessageSquare className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">Ask me anything about {topicTitle}!</p>
                    <p className="text-sm text-slate-400 mt-1">I'll explain at your level.</p>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
                        : 'bg-white border border-slate-200 text-slate-700 shadow-sm'
                    }`}>
                      {msg.content}
                    </div>
                  </div>
                ))}
                {loading.chat && (
                  <div className="flex justify-start animate-fade-in">
                    <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                      <div className="flex gap-1.5">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.15s' }} />
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChat()}
                  placeholder={`Ask about ${topicTitle}...`}
                  className="flex-1 h-11 bg-white/80"
                />
                <Button
                  onClick={sendChat}
                  disabled={loading.chat || !chatInput.trim()}
                  className="h-11 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quiz" className="mt-4">
          <Card>
            <CardContent className="p-6 text-center">
              <HelpCircle className="w-12 h-12 text-purple-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Ready to test your knowledge?</h3>
              <p className="text-slate-600 mb-4">Take a quiz on {topicTitle} at your learning level.</p>
              <Button
                className="bg-gradient-to-r from-purple-500 to-pink-500 text-white"
                onClick={() => navigate(`/quizmode?topic=${encodeURIComponent(topicId)}&title=${encodeURIComponent(topicTitle)}`)}
              >
                Start Quiz
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
