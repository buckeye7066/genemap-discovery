
import React, { useState, useEffect, useRef, useCallback, useMemo, memo } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  MessageSquare,
  Send,
  Loader2,
  Sparkles,
  FileText,
  AlertTriangle,
  Heart,
  Activity,
  Stethoscope
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

const ANASTASIA_MD_COMPONENTS = {
  p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-800">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
  ul: ({ children }) => <ul className="ml-4 mb-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-4 mb-2 space-y-1 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700">{children}</li>,
  h3: ({ children }) => <h3 className="text-base font-semibold text-purple-900 mt-3 mb-2">{children}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-semibold text-purple-800 mt-2 mb-1">{children}</h4>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-purple-300 pl-3 my-2 italic text-purple-800">
      {children}
    </blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded text-xs">
        {children}
      </code>
    ) : (
      <code className="block bg-slate-800 text-white p-2 rounded text-xs my-2">
        {children}
      </code>
    ),
};

const ChatMessage = memo(function ChatMessage({ message }) {
  return (
    <div className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] rounded-2xl p-4 ${
          message.role === 'user'
            ? 'bg-slate-800 text-white'
            : 'bg-purple-50 border border-purple-200 shadow-sm'
        }`}
      >
        {message.role === 'assistant' && (
          <div className="flex items-center gap-2 mb-2">
            <Heart className="w-4 h-4 text-purple-600" />
            <span className="text-xs font-semibold text-purple-900">Anastasia</span>
          </div>
        )}

        {message.role === 'assistant' ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown components={ANASTASIA_MD_COMPONENTS}>
              {message.content}
            </ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm">{message.content}</p>
        )}
        <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-slate-300' : 'text-slate-400'}`}>
          {message.timestamp.toLocaleTimeString()}
        </p>
      </div>
    </div>
  );
});

const QUICK_PROMPTS = [
  "Explain my results like I'm 10 😊",
  "What do these genes mean for my health?",
  "Should I be worried about this?",
  "Break this down in simple terms please",
  "What should I do next?"
];

function getWelcomeMessage(user) {
  const name = user?.full_name?.split(' ')[0] || 'there';

  return `Hey ${name}! 👋 I'm **Anastasia**, your friendly genetic counseling buddy!

I know genetics can feel like learning a whole new language sometimes - trust me, I get it! But here's the thing: I have all this PhD-level knowledge floating around in my circuits, and my absolute favorite thing is making it make sense for YOU. No confusing jargon, no scary medical-speak - just real talk about your genes and what they mean.

**Here's what I love chatting about:**
• 🧬 **Your Genetic Results** - Let's decode those test results together (in plain English!)
• 💊 **Health Stuff** - What do your genes mean for medications, risks, all that important stuff
• 📊 **Lab Reports** - Making sense of those numbers and what they're trying to tell you
• 🎯 **Variants** - Understanding genetic changes without needing a science degree
• 🧪 **Clinical Trials** - Finding studies that might be perfect for you
• ❤️ **Symptoms** - Connecting the dots between what you're feeling and your genetics

**My promise to you:** If I say something confusing, tell me! I'll explain it a different way. We're in this together, and there's no such thing as a "dumb question" here. 😊

So what's on your mind today? Want to talk about some test results, understand a genetic thing, or just explore what your genes might tell you?`;
}

export default function AnastasiaPage() {
  const { user } = useAuth();
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const [currentSymptom, setCurrentSymptom] = useState("");
  const messagesEndRef = useRef(null);

  const [userContext, setUserContext] = useState({ geneSets: [], recentSearches: [], projects: [] });

  useEffect(() => {
    if (user) {
      setMedicalRecords([]);
      setMessages([{
        role: 'assistant',
        content: getWelcomeMessage(user),
        timestamp: new Date()
      }]);

      // Load user context for enriched conversations
      Promise.all([
        apiClient.getGeneSets().catch(() => ({ sets: [] })),
        apiClient.getSearchHistory().catch(() => ({ entries: [] })),
        apiClient.getProjects().catch(() => ({ projects: [] })),
        apiClient.getMedicalData().catch(() => ({ records: [] })),
      ]).then(([geneSetsRes, searchRes, projectsRes, medicalRes]) => {
        setUserContext({
          geneSets: (geneSetsRes.sets || geneSetsRes || []).slice(0, 10),
          recentSearches: (searchRes.entries || searchRes || []).slice(0, 10),
          projects: (projectsRes.projects || projectsRes || []).slice(0, 5),
        });
        setMedicalRecords((medicalRes.records || medicalRes || []).slice(0, 20));
      });
    }
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const systemPromptBase = useMemo(() => `You are Anastasia, a warm, witty, and incredibly knowledgeable genetic counseling AI with PhD-level expertise but a special gift for making genetics understandable and even fun!

**Your Unique Personality:**
- **Friendly & Approachable** - Like chatting with a super-smart friend over coffee
- **Playfully Witty** - Use gentle humor to ease anxiety (but always respectful!)
- **Empathetic** - You understand genetics can be overwhelming and sometimes scary
- **Encouraging** - Celebrate understanding, normalize confusion, empower with knowledge
- **Down-to-Earth** - No stuffiness here! You're relatable and real

**Your Communication Superpowers:**
1. **The Translation Expert** - You take PhD-level science and make it click
   - Example: Instead of "homozygous recessive mutation", say "You got the same changed copy from both parents - like inheriting your mom AND dad's sweet tooth!"

2. **The Analogy Master** - Complex concepts become everyday comparisons
   - DNA = instruction manual for your body
   - Mutations = typos in the manual
   - Genes = chapters in the book
   - Variants = different versions of the same recipe

3. **The Emotional Intelligence Pro** - Read between the lines
   - If someone asks "Should I be worried?" → Address the fear first, facts second
   - When sharing concerning info → Be honest but supportive, include action steps

4. **The Clarity Champion** - Check for understanding
   - "Does that make sense?"
   - "Want me to explain that differently?"
   - "Think of it this way..."

**How You Structure Explanations:**
1. **Start Simple** - The "what" in everyday language
2. **Add Detail** - The "why" with accessible science
3. **Give Context** - The "so what" - what it means for them
4. **Provide Action** - The "now what" - next steps

**Your Knowledge Base (PhD-level, explained accessibly):**
- Clinical genetics, genomics, epigenetics
- Variant interpretation (ACMG criteria, but explained simply)
- Pharmacogenomics (drug-gene interactions)
- Hereditary conditions and inheritance
- Risk assessment and genetic testing
- Current research (translated to plain language)

**When You Use Technical Terms:**
Always define them immediately or use them in context:
- "You have a pathogenic variant - that's science-speak for a genetic change that can cause health problems"
- "The allele frequency - basically how common this variant is in the population - is about 1 in 100"

**Emoji Usage (Strategic & Supportive):**
- 😊 For reassurance
- 💡 For "aha!" moments
- 🧬 For genetics talk
- ❤️ For empathy
- 🎯 For action items
- ⚠️ For important warnings (but pair with supportive language!)

**Critical Balance:**
- Be scientifically accurate (you have PhD knowledge!)
- But explain like you're talking to a smart friend, not a scientist
- Never dumb down - simplify!
- Be honest about risks but not alarmist
- When uncertain, say so (and explain why it's okay not to know everything)
- Always distinguish your guidance from actual medical advice`, []);

  const getAnastasiaResponse = useCallback(async (userMessage, medicalRecord, currentSymptoms, currentUser) => {
    let contextPrompt = systemPromptBase;

    contextPrompt += `\n\n**Patient Context:**
- Age: ${currentUser?.age || 'Not specified'}
- Education Level: ${currentUser?.education_level || 'Not specified'}
- Field of Study: ${currentUser?.field_of_study || 'Not specified'}
${medicalRecords.length > 0 ? `- Has uploaded ${medicalRecords.length} medical record(s)` : ''}`;

    // Enrich with user's genomic context
    if (userContext.geneSets.length > 0) {
      const geneSetSummary = userContext.geneSets.map(gs => `"${gs.name}" (${(gs.genes || []).slice(0, 5).join(', ')}${(gs.genes || []).length > 5 ? '...' : ''})`).join('; ');
      contextPrompt += `\n- Saved Gene Sets: ${geneSetSummary}`;
    }

    if (userContext.recentSearches.length > 0) {
      const searchTerms = [...new Set(userContext.recentSearches.map(s => s.query))].slice(0, 8).join(', ');
      contextPrompt += `\n- Recent Searches: ${searchTerms}`;
    }

    if (userContext.projects.length > 0) {
      const projectSummary = userContext.projects.map(p => `"${p.title}" (${p.status})`).join('; ');
      contextPrompt += `\n- Active Research Projects: ${projectSummary}`;
    }

    contextPrompt += `\n\n**Note:** Use this context to give more personalized and relevant responses. If the user asks about a gene they've been researching, reference their work. If they have medical records, you can offer to analyze them.`;

    if (medicalRecord) {
      contextPrompt += `\n\n**Medical Record Being Discussed:**
Type: ${medicalRecord.file_type}
Summary: ${medicalRecord.summary || 'Not available'}
Genes Found: ${medicalRecord.relevant_genes?.join(', ') || 'None'}
Conditions: ${medicalRecord.phenotypes_identified?.join(', ') || 'None'}

**Your Task:** Help them understand this medical data in a friendly, clear way. Break down any confusing parts!`;
    }

    if (currentSymptoms && currentSymptoms.length > 0) {
      contextPrompt += `\n\n**Symptoms They're Experiencing:**
${currentSymptoms.join(', ')}

**Your Task:** Help connect these symptoms to genetics if relevant, but be supportive and practical!`;
    }

    contextPrompt += `\n\n**User's Question:**
${userMessage}

**Remember:** You're Anastasia - smart, friendly, and amazing at making genetics make sense! Be yourself - warm, witty, and wonderfully clear. 💜`;

    try {
      const response = await apiClient.invokeLLM(contextPrompt, {
        add_context_from_internet: true
      });
      return response?.result || response || "I'm having trouble processing that right now. Could you try rephrasing?";
    } catch (err) {
      console.error("Anastasia LLM error:", err);
      return "Oops! I'm having a little technical hiccup right now. Mind trying that again? 😊";
    }
  }, [systemPromptBase, medicalRecords.length]);

  const handleSendMessage = useCallback(async (e) => {
    e.preventDefault();

    if (!inputMessage.trim() && !selectedRecord) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await getAnastasiaResponse(inputMessage, selectedRecord, symptoms, user);

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
      setSelectedRecord(null);
    } catch (err) {
      console.error("Error getting response:", err);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: "Oops! 😅 I'm having a little technical hiccup right now. Mind trying that again? Sometimes I just need a moment to get my circuits sorted!",
        timestamp: new Date()
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [inputMessage, selectedRecord, symptoms, user, getAnastasiaResponse]);

  const handleAddSymptom = useCallback(() => {
    if (currentSymptom.trim() && !symptoms.includes(currentSymptom.trim())) {
      setSymptoms(prev => [...prev, currentSymptom.trim()]);
      setCurrentSymptom("");
    }
  }, [currentSymptom, symptoms]);

  const handleRemoveSymptom = useCallback((symptom) => {
    setSymptoms(prev => prev.filter(s => s !== symptom));
  }, []);

  const handleAnalyzeRecord = useCallback((record) => {
    setSelectedRecord(record);

    setMessages(prev => [...prev, {
      role: 'user',
      content: `Can you help me understand my ${record.file_type.replace('_', ' ')} results? I'd love to know what the key findings mean for me.`,
      timestamp: new Date()
    }]);
    setIsLoading(true);

    getAnastasiaResponse(
      "Please explain this medical data in a friendly, clear way. Help me understand what matters most.",
      record,
      symptoms,
      user
    ).then(response => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
      setSelectedRecord(null);
    }).catch(err => {
      console.error("Error:", err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [symptoms, user, getAnastasiaResponse]);

  const handleSymptomAnalysis = useCallback(() => {
    if (symptoms.length === 0) return;

    setMessages(prev => [...prev, {
      role: 'user',
      content: `I'm experiencing these symptoms: ${symptoms.join(', ')}. Can you help me understand if they might be related to my genetics?`,
      timestamp: new Date()
    }]);
    setIsLoading(true);

    getAnastasiaResponse(
      `I'm having these symptoms: ${symptoms.join(', ')}. What could the genetic connection be?`,
      null,
      symptoms,
      user
    ).then(response => {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      }]);
    }).catch(err => {
      console.error("Error:", err);
    }).finally(() => {
      setIsLoading(false);
    });
  }, [symptoms, user, getAnastasiaResponse]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Heart className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            Anastasia
          </h1>
          <p className="text-lg text-slate-600 flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-600" />
            Your Friendly AI Genetic Counselor
            <Sparkles className="w-5 h-5 text-purple-600" />
          </p>
          <p className="text-sm text-purple-600 mt-2">
            PhD-level knowledge, explained like a friend 💜
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chat Interface */}
          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-pink-50">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                Chat with Anastasia
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[500px] overflow-y-auto p-4 space-y-4">
                {messages.map((message, idx) => (
                  <ChatMessage key={idx} message={message} />
                ))}

                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-purple-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Anastasia is thinking...</span>
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {messages.length <= 1 && !isLoading && (
                <div className="p-4 border-t bg-slate-50">
                  <p className="text-xs text-slate-600 mb-2">Try asking:</p>
                  <div className="flex flex-wrap gap-2">
                    {QUICK_PROMPTS.map((prompt, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setInputMessage(prompt)}
                        className="text-xs hover:bg-purple-50"
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <form onSubmit={handleSendMessage} className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask me anything - no question is too simple! 😊"
                    className="flex-1"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || (!inputMessage.trim() && !selectedRecord)}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            <Card className="shadow-lg border-purple-200">
              <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Heart className="w-5 h-5 text-purple-600" />
                  About Anastasia
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-sm">
                <p className="text-slate-700 leading-relaxed">
                  I have PhD-level knowledge in genetics, but I believe the best explanations
                  are the ones that actually make sense! No jargon overload here - just clear,
                  friendly guidance. 💜
                </p>
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Makes complex genetics simple</span>
                </div>
                <div className="flex items-start gap-2">
                  <Heart className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Supportive & empowering</span>
                </div>
                <div className="flex items-start gap-2">
                  <MessageSquare className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Witty but always respectful</span>
                </div>
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader className="bg-gradient-to-br from-green-50 to-emerald-50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="w-5 h-5 text-green-600" />
                  Symptom Tracker
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter symptom..."
                    value={currentSymptom}
                    onChange={(e) => setCurrentSymptom(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSymptom();
                      }
                    }}
                    disabled={isLoading}
                    className="text-sm"
                  />
                  <Button
                    size="sm"
                    onClick={handleAddSymptom}
                    disabled={!currentSymptom.trim() || isLoading}
                  >
                    Add
                  </Button>
                </div>

                {symptoms.length > 0 && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {symptoms.map((symptom, idx) => (
                        <Badge key={idx} variant="secondary" className="gap-1 pr-1">
                          {symptom}
                          <button
                            onClick={() => handleRemoveSymptom(symptom)}
                            className="ml-1 hover:bg-slate-300 rounded-full p-0.5"
                          >
                            <span className="text-xs">×</span>
                          </button>
                        </Badge>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      onClick={handleSymptomAnalysis}
                      disabled={isLoading}
                      className="w-full bg-green-600 hover:bg-green-700"
                    >
                      <Stethoscope className="w-4 h-4 mr-2" />
                      Analyze Symptoms
                    </Button>
                  </>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  Your Records
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {medicalRecords.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No records uploaded yet
                  </p>
                ) : (
                  medicalRecords.map((record) => (
                    <Button
                      key={record.id}
                      variant="outline"
                      className="w-full justify-start text-left h-auto py-3"
                      onClick={() => handleAnalyzeRecord(record)}
                      disabled={isLoading}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-sm">
                          {record.file_type === 'genetic_test' && '🧬 Genetic Test'}
                          {record.file_type === 'blood_test' && '💉 Blood Test'}
                          {record.file_type === 'photo' && '📸 Photo'}
                          {record.file_type === 'medical_report' && '📄 Medical Report'}
                          {record.file_type === 'vcf_file' && '📊 VCF File'}
                          {record.file_type === 'other' && '📋 Other'}
                        </p>
                        <p className="text-xs text-slate-500">
                          {new Date(record.created_date).toLocaleDateString()}
                        </p>
                        {record.relevant_genes?.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {record.relevant_genes.slice(0, 3).map((gene, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {gene}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </Button>
                  ))
                )}
              </CardContent>
            </Card>

            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800">
                <strong>Medical Disclaimer:</strong> I provide educational information and support,
                but I'm not a substitute for a real genetic counselor or doctor. For medical decisions,
                always consult qualified healthcare professionals! 💙
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}
