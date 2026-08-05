import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEducationLevel } from '@/lib/EducationLevelContext';
import AdaptiveExplanation from '@/components/education/AdaptiveExplanation';
import AdaptiveImage from '@/components/education/AdaptiveImage';
import LevelPicker from '@/components/education/LevelPicker';
import UsageBanner from '@/components/education/UsageBanner';
import MedicalDisclaimer from '@/components/shared/MedicalDisclaimer';
import SourceList from '@/components/shared/SourceList';
import { apiClient } from '@genemap/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BookOpen, Image, MessageSquare, HelpCircle, RefreshCw, Send } from 'lucide-react';
import ReactMarkdown from 'react-markdown';

/**
 * Memoized chat bubble. ReactMarkdown parsing is synchronous and runs on the
 * main thread; rendering every message's markdown on each parent re-render
 * (e.g. on every keystroke in the chat input) blocked the thread and caused the
 * renderer timeouts. Memoizing on `msg` means a bubble only re-parses when its
 * own content changes.
 */
const ChatBubble = React.memo(function ChatBubble({ msg }) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-slide-up`}>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        msg.role === 'user'
          ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20'
          : 'bg-white border border-slate-200 text-slate-700 shadow-sm'
      }`}>
        {msg.role === 'assistant' ? (
          <div className="prose prose-sm max-w-none prose-p:my-1 prose-li:my-0">
            <ReactMarkdown>{msg.content}</ReactMarkdown>
          </div>
        ) : (
          msg.content
        )}
      </div>
    </div>
  );
});

// Landing view for /topicexplorer with no ?topic — lets the user browse and
// pick a topic without having to detour through the Learn Genetics page.
function TopicBrowser({ navigate, levelConfig }) {
  const [categories, setCategories] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let active = true;
    apiClient.getTopics()
      .then((cats) => { if (active) setCategories(Array.isArray(cats) ? cats : []); })
      .catch((err) => { if (active) setError(err.message || 'Could not load topics'); });
    return () => { active = false; };
  }, []);

  const q = query.trim().toLowerCase();
  const filtered = (categories || [])
    .map((cat) => ({
      ...cat,
      topics: (cat.topics || []).filter((t) => !q || (t.title || '').toLowerCase().includes(q)),
    }))
    .filter((cat) => cat.topics.length > 0);

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6 dna-bg min-h-screen">
      <div className="flex items-center gap-3 animate-slide-up">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <BookOpen className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">Topic Explorer</h1>
          <p className="text-sm text-slate-500">Pick a topic to explore{levelConfig?.label ? ` at ${levelConfig.label} level` : ''}.</p>
        </div>
      </div>

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search topics..."
        className="h-11 bg-white/80 animate-slide-up delay-100"
      />

      {error && <p className="text-sm text-red-500 py-4">{error}</p>}
      {!categories && !error && <p className="text-sm text-slate-400 py-4">Loading topics…</p>}
      {categories && filtered.length === 0 && !error && (
        <p className="text-sm text-slate-400 py-4">No topics match "{query}".</p>
      )}

      <div className="space-y-6">
        {filtered.map((cat) => (
          <div key={cat.category} className="animate-slide-up">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">{cat.category}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {cat.topics.map((topic) => (
                <button
                  key={topic.id}
                  onClick={() => navigate(`/topicexplorer?topic=${encodeURIComponent(topic.id)}&title=${encodeURIComponent(topic.title)}`)}
                  className="text-left p-3 rounded-lg border border-slate-200 bg-white/70 hover:border-blue-300 hover:bg-blue-50/50 transition-all text-sm font-medium text-slate-700"
                >
                  {topic.title}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TopicExplorer() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { level, levelConfig } = useEducationLevel();

  const topicId = searchParams.get('topic') || '';
  const topicTitle = searchParams.get('title') || topicId;

  const [explanation, setExplanation] = useState('');
  const [sources, setSources] = useState([]);
  const [imageData, setImageData] = useState(null);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [loading, setLoading] = useState({ explanation: false, image: false, chat: false });

  // Reset per-topic state whenever the topic changes. Without this, switching
  // topics (or returning to /topicexplorer with no topic) left the previous
  // topic's explanation, generated image, and chat transcript on screen because
  // the component never unmounts across query-param changes.
  useEffect(() => {
    setImageData(null);
    setChatMessages([]);
    setChatInput('');
    setExplanation('');
    setSources([]);
  }, [topicId]);

  useEffect(() => {
    // Load as soon as we have a topic. The level only tunes the prompt persona
    // and defaults server-side, so we no longer block the explanation on the
    // user having explicitly picked a level (which left the tab blank).
    if (topicTitle) {
      loadExplanation();
    }

  }, [topicTitle, level]);

  // No topic selected (e.g. the sidebar "Topic Explorer" link) → show a clean
  // topic browser instead of whatever topic was last open.
  if (!topicId) {
    return <TopicBrowser navigate={navigate} levelConfig={levelConfig} />;
  }

  const loadExplanation = async () => {
    if (!topicTitle) {
      setExplanation('Pick a topic from Learn Genetics to see an explanation.');
      return;
    }
    setLoading(prev => ({ ...prev, explanation: true }));
    try {
      const res = await apiClient.getExplanation({ topic: topicTitle, level: level || 'undergraduate' });
      setExplanation(res.explanation || '');
      setSources(Array.isArray(res.sources) ? res.sources : []);
    } catch (err) {
      setExplanation(`Unable to load explanation: ${err.message}`);
      setSources([]);
    } finally {
      setLoading(prev => ({ ...prev, explanation: false }));
    }
  };

  const loadImage = async () => {
    // The API rejects an empty topic with a 400 ("Validation failed"). Guard it
    // here so the user gets actionable guidance instead of a cryptic error.
    if (!topicTitle) {
      setImageData({ error: 'Pick a topic from Learn Genetics first, then generate an illustration.' });
      return;
    }
    setLoading(prev => ({ ...prev, image: true }));
    try {
      const res = await apiClient.generateImage({ topic: topicTitle, level: level || 'undergraduate' });
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
      // The backend only accepts user/assistant turns (it injects its own
      // safety/system prompt). Fold the topic context into the FIRST user turn
      // so the tutor still knows what's being studied, without sending a
      // client-supplied system message that the API rejects as invalid.
      const outgoing = updatedMessages.map((m, i) =>
        i === 0 && m.role === 'user'
          ? { ...m, content: `(I'm learning about "${topicTitle}".) ${m.content}` }
          : m
      );
      const res = await apiClient.chat({
        messages: outgoing,
        level: level || 'undergraduate',
        publicationTask: 'genetics_education',
        topic: topicTitle,
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

      <div className="mb-4">
        <MedicalDisclaimer variant="education" compact />
      </div>

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
              {!loading.explanation && explanation && <SourceList sources={sources} />}
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
                  <ChatBubble key={i} msg={msg} />
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
              <SourceList sources={sources} title="References for this topic" />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quiz" className="mt-4">
          <Card>
            <CardContent className="p-6 text-center">
              <HelpCircle className="w-12 h-12 text-purple-500 mx-auto mb-3" />
              <h3 className="text-lg font-semibold mb-2">Ready to test your knowledge?</h3>
              <p className="text-slate-600 mb-4">Test your knowledge of {topicTitle || 'this topic'} at your learning level.</p>
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
