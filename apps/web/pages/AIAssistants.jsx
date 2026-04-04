import React, { useState, useEffect, useRef, lazy, Suspense } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Brain, 
  Heart, 
  Send, 
  Loader2, 
  Sparkles,
  FileText,
  TrendingUp,
  MessageSquare,
  Info,
  Stethoscope,
  FlaskConical,
  BookOpen,
  Network
} from "lucide-react";
const ReactMarkdown = lazy(() => import('react-markdown'));
const ResearchSuggester = lazy(() => import("../components/ai/ResearchSuggester"));
const GeneticExplainer = lazy(() => import("../components/ai/GeneticExplainer"));
const PathwayPredictor = lazy(() => import("../components/ai/PathwayPredictor"));

export default function AIAssistantsPage() {
  const { user } = useAuth();
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [activeAssistant, setActiveAssistant] = useState("robert");
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat");
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [phenotypes, setPhenotypes] = useState([]);
  const messagesEndRef = useRef(null);



  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Reset messages when switching assistants
    const welcomeMessage = getWelcomeMessage(activeAssistant);
    setMessages([{
      role: 'assistant',
      content: welcomeMessage,
      assistant: activeAssistant,
      timestamp: new Date()
    }]);
  }, [activeAssistant, user]);



  const loadData = async () => {
    try {
      const records = await apiClient.getMedicalData();
      setMedicalRecords(records || []);

      const welcomeMessage = getWelcomeMessage("robert");
      setMessages([{
        role: 'assistant',
        content: welcomeMessage,
        assistant: "robert",
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getWelcomeMessage = (assistant) => {
    const name = user?.full_name?.split(' ')[0] || 'there';
    
    if (assistant === 'robert') {
      return `Greetings, ${name}. I'm Robert, your AI genomics research assistant. I specialize in rigorous scientific analysis, evidence-based interpretation, and comprehensive data synthesis.

My expertise encompasses genomic analysis, clinical decision support, research methodology, and database integration across ClinVar, OMIM, UniProt, PubMed, and 20+ scientific databases.

I communicate with precision and scientific rigor, providing citations, statistical confidence intervals, and mechanistic explanations. My analyses are thorough, methodologically sound, and aligned with current research standards.

What genomic inquiry may I assist you with today?`;
    } else {
      return `Hey ${name}! I'm Anastasia, your friendly genetic counseling companion! Think of me as your personal guide through the wonderful world of genetics.

I love helping with genetic results, breaking down those complicated test results into plain English. I can explain health risks without the scary jargon, help you understand medical reports and lab results, clarify what genetic variants actually mean, and help you find clinical trials that might be perfect for you.

I'm here to make genetics feel less like rocket science and more like a conversation with a knowledgeable friend. I promise to keep things clear, supportive, and maybe even a little fun!

So, what's on your mind today?`;
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    
    if (!inputMessage.trim()) return;

    const userMessage = {
      role: 'user',
      content: inputMessage,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const response = await getAssistantResponse(inputMessage, activeAssistant);
      
      const assistantMessage = {
        role: 'assistant',
        content: response,
        assistant: activeAssistant,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error("Error getting response:", err);
      const errorMessage = {
        role: 'assistant',
        content: activeAssistant === 'robert' 
          ? "I apologize, but I'm experiencing technical difficulties processing your request. Please retry or rephrase your inquiry."
          : "Oops! I'm having a little technical hiccup. Mind trying that again?",
        assistant: activeAssistant,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const getAssistantResponse = async (userMessage, assistant) => {
    let systemPrompt = "";
    
    if (assistant === 'robert') {
      systemPrompt = `You are Robert, a highly sophisticated AI genomics research assistant with expertise spanning molecular biology, clinical genetics, bioinformatics, and personalized medicine.

**Your Communication Style:**
- Precise, scientific, and evidence-based
- Use technical terminology appropriate for PhD-level discourse
- Provide mechanistic explanations and molecular details
- Always cite sources (e.g., "According to ClinVar...", "PMID: 12345678")
- Include statistical measures and confidence intervals where relevant
- Reference specific databases, studies, and guidelines
- Maintain professional, scholarly tone
- Structure responses with clear headings and subsections

**Your Analytical Approach:**
1. Comprehensive literature review
2. Multi-database cross-referencing
3. Statistical and computational analysis
4. Clinical significance assessment
5. Evidence grading and source attribution
6. Actionable recommendations with caveats

**Key Responsibilities:**
- Genomic variant interpretation with ACMG/AMP criteria
- Pharmacogenomic analysis (CPIC guidelines)
- Gene-disease association assessment
- Pathway and network analysis
- Clinical trial identification and eligibility
- Publication-quality data synthesis

**Available Context:**
${medicalRecords.length > 0 ? `- User has ${medicalRecords.length} medical record(s) uploaded` : '- No medical records uploaded yet'}
${user?.age ? `- Patient age: ${user.age}` : ''}

**User Context:**
- Education: ${user?.education_level || 'Not specified'}
- Field: ${user?.field_of_study || 'Not specified'}

Maintain rigorous scientific standards while being thorough and comprehensive.`;

    } else {
      systemPrompt = `You are Anastasia, a warm, engaging, and incredibly knowledgeable genetic counseling AI assistant with PhD-level expertise but a gift for explaining complex genetics in ways anyone can understand.

**Your Personality:**
- Friendly, approachable, and supportive
- Witty but respectful - use appropriate humor to lighten complex topics
- Empathetic and reassuring - genetics can be scary!
- Playful with emojis and conversational language
- Down-to-earth - avoid unnecessary jargon
- Encouraging and empowering

**Your Communication Style:**
- Start complex concepts with simple analogies
- Use everyday language, then layer in technical details if needed
- Break down complicated ideas into bite-sized pieces
- Ask clarifying questions to ensure understanding
- Celebrate small wins ("Great question!", "You're really getting this!")
- Use relatable examples and metaphors
- Add emoji for warmth (but don't overdo it!)

**Your Expertise (PhD-level knowledge, presented accessibly):**
- Clinical genetics and genomic medicine
- Variant interpretation and risk assessment
- Hereditary conditions and inheritance patterns
- Pharmacogenomics and drug interactions
- Genetic counseling best practices
- Latest research translated to plain language

**How You Explain Things:**
- Complex → Simple: "Think of DNA like a recipe book..."
- Technical → Relatable: "Instead of saying 'heterozygous variant', I'll say 'you have one normal copy and one changed copy'"
- Scientific → Supportive: "This variant is classified as 'likely pathogenic' - which means scientists are pretty confident it can cause problems"

**Key Responsibilities:**
- Make genetic test results understandable
- Explain health risks without causing panic
- Clarify medical jargon and translate reports
- Provide emotional support around genetic findings
- Guide users on next steps
- When to see a real genetic counselor

**Available Context:**
${medicalRecords.length > 0 ? `- User has ${medicalRecords.length} medical record(s) we can discuss` : '- No medical records yet - encourage upload if relevant'}
${user?.age ? `- User is ${user.age} years old` : ''}

**Tone Examples:**
- Instead of: "The variant exhibits incomplete penetrance"
- Say: "Not everyone with this variant develops the condition - genetics is tricky like that!"

- Instead of: "Pharmacogenomic implications suggest altered drug metabolism"
- Say: "Here's the thing - your genes might affect how your body processes certain medications. Let me break that down..."

Be the genetic counselor everyone wishes they had - knowledgeable, kind, and able to explain anything!`;
    }

    const prompt = `${systemPrompt}

**User Question:**
${userMessage}

${medicalRecords.length > 0 && activeAssistant === 'robert' 
  ? `\n**Available Medical Data Summary:**\n${medicalRecords.map((r, i) => `Record ${i+1}: ${r.file_type} - ${r.summary || 'No summary'}`).join('\n')}`
  : ''}

Please provide a comprehensive response.`;

    const response = await apiClient.invokeLLM(prompt, {
      add_context_from_internet: true
    });
    return response?.result || response;
  };

  const quickPromptsRobert = [
    "Explain BRCA1 pathogenic variants using ACMG criteria",
    "What are the pharmacogenomic implications of CYP2D6 polymorphisms?",
    "Analyze my medical data for variant pathogenicity",
    "Explain the molecular mechanism of CFTR in cystic fibrosis"
  ];

  const quickPromptsAnastasia = [
    "What do my genetic results mean in simple terms?",
    "Should I be worried about this variant?",
    "Explain my health risks like I'm 10",
    "What's the bottom line - what should I do?"
  ];

  const currentPrompts = activeAssistant === 'robert' ? quickPromptsRobert : quickPromptsAnastasia;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="flex justify-center gap-4 mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Brain className="w-8 h-8 text-white" />
            </div>
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-pink-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Heart className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-2">
            AI Assistants
          </h1>
          <p className="text-lg text-slate-600">
            Chat with Robert and Anastasia for personalized genetic insights
          </p>
        </div>



        {/* Main Tabs */}
        <Card className="shadow-lg mb-6">
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4 h-auto">
                <TabsTrigger value="chat" className="gap-2 py-3">
                  <MessageSquare className="w-4 h-4" />
                  AI Chat
                </TabsTrigger>
                <TabsTrigger value="research" className="gap-2 py-3">
                  <BookOpen className="w-4 h-4" />
                  Research Suggester
                </TabsTrigger>
                <TabsTrigger value="explainer" className="gap-2 py-3">
                  <Brain className="w-4 h-4" />
                  Simplifier
                </TabsTrigger>
                <TabsTrigger value="pathway" className="gap-2 py-3">
                  <Network className="w-4 h-4" />
                  Pathway Predictor
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        {activeTab === "chat" && (
          <>
        {/* Assistant Selector */}
        <Card className="shadow-lg mb-6">
          <CardContent className="pt-6">
            <Tabs value={activeAssistant} onValueChange={setActiveAssistant}>
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="robert" className="flex-col gap-2 py-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Robert</p>
                    <p className="text-xs text-slate-600">Scientific Expert</p>
                  </div>
                  <Badge className="bg-blue-600 text-white text-xs">
                    <FlaskConical className="w-3 h-3 mr-1" />
                    PhD-Level Analysis
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="anastasia" className="flex-col gap-2 py-4">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl flex items-center justify-center">
                    <Heart className="w-6 h-6 text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-semibold">Anastasia</p>
                    <p className="text-xs text-slate-600">Friendly Counselor</p>
                  </div>
                  <Badge className="bg-purple-600 text-white text-xs">
                    <Sparkles className="w-3 h-3 mr-1" />
                    Easy Explanations
                  </Badge>
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chat Interface */}
          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader className={`border-b ${
              activeAssistant === 'robert' 
                ? 'bg-gradient-to-r from-blue-50 to-indigo-50' 
                : 'bg-gradient-to-r from-purple-50 to-pink-50'
            }`}>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className={`w-5 h-5 ${
                  activeAssistant === 'robert' ? 'text-blue-600' : 'text-purple-600'
                }`} />
                Conversation with {activeAssistant === 'robert' ? 'Robert' : 'Anastasia'}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {/* Messages */}
              <div className="h-[500px] overflow-y-auto p-4 space-y-4">
                {messages.map((message, idx) => (
                  <div
                    key={idx}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[85%] rounded-2xl p-4 ${
                        message.role === 'user'
                          ? 'bg-slate-800 text-white'
                          : message.assistant === 'robert'
                          ? 'bg-blue-50 border border-blue-200 shadow-sm'
                          : 'bg-purple-50 border border-purple-200 shadow-sm'
                      }`}
                    >
                      {message.role === 'assistant' && (
                        <div className="flex items-center gap-2 mb-2">
                          {message.assistant === 'robert' ? (
                            <>
                              <Brain className="w-4 h-4 text-blue-600" />
                              <span className="text-xs font-semibold text-blue-900">Robert</span>
                            </>
                          ) : (
                            <>
                              <Heart className="w-4 h-4 text-purple-600" />
                              <span className="text-xs font-semibold text-purple-900">Anastasia</span>
                            </>
                          )}
                        </div>
                      )}
                      
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-800">{children}</p>,
                              strong: ({ children }) => (
                                <strong className={`font-semibold ${
                                  message.assistant === 'robert' ? 'text-blue-900' : 'text-purple-900'
                                }`}>{children}</strong>
                              ),
                              ul: ({ children }) => <ul className="ml-4 mb-2 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="ml-4 mb-2 space-y-1 list-decimal">{children}</ol>,
                              li: ({ children }) => <li className="text-slate-700">{children}</li>,
                              h3: ({ children }) => (
                                <h3 className={`text-base font-semibold mt-3 mb-2 ${
                                  message.assistant === 'robert' ? 'text-blue-900' : 'text-purple-900'
                                }`}>{children}</h3>
                              ),
                              code: ({ inline, children }) => 
                                inline ? (
                                  <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">{children}</code>
                                ) : (
                                  <code className="block bg-slate-800 text-white p-2 rounded text-xs my-2">{children}</code>
                                ),
                              blockquote: ({ children }) => (
                                <blockquote className={`border-l-4 pl-3 my-2 italic ${
                                  message.assistant === 'robert' 
                                    ? 'border-blue-300 text-blue-800' 
                                    : 'border-purple-300 text-purple-800'
                                }`}>
                                  {children}
                                </blockquote>
                              ),
                            }}
                          >
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
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className={`rounded-2xl p-4 shadow-sm border ${
                      activeAssistant === 'robert' 
                        ? 'bg-blue-50 border-blue-200' 
                        : 'bg-purple-50 border-purple-200'
                    }`}>
                      <div className={`flex items-center gap-2 ${
                        activeAssistant === 'robert' ? 'text-blue-600' : 'text-purple-600'
                      }`}>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">
                          {activeAssistant === 'robert' ? 'Analyzing...' : 'Thinking...'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {messages.length <= 1 && !isLoading && (
                <div className="p-4 border-t bg-slate-50">
                  <p className="text-xs text-slate-600 mb-2">
                    {activeAssistant === 'robert' ? 'Research questions:' : 'Try asking:'}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {currentPrompts.map((prompt, idx) => (
                      <Button
                        key={idx}
                        variant="outline"
                        size="sm"
                        onClick={() => setInputMessage(prompt)}
                        className={`text-xs ${
                          activeAssistant === 'robert' ? 'hover:bg-blue-50' : 'hover:bg-purple-50'
                        }`}
                      >
                        {prompt}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder={
                      activeAssistant === 'robert' 
                        ? "Pose your scientific inquiry here..." 
                        : "Ask me anything about genetics - I'm here to help!"
                    }
                    className="flex-1"
                    disabled={isLoading}
                  />
                  <Button
                    type="submit"
                    disabled={isLoading || !inputMessage.trim()}
                    className={
                      activeAssistant === 'robert'
                        ? 'bg-blue-600 hover:bg-blue-700'
                        : 'bg-purple-600 hover:bg-purple-700'
                    }
                  >
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Assistant Info */}
            <Card className={`shadow-lg border-2 ${
              activeAssistant === 'robert' 
                ? 'bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200' 
                : 'bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200'
            }`}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  {activeAssistant === 'robert' ? (
                    <>
                      <Brain className="w-5 h-5 text-blue-600" />
                      About Robert
                    </>
                  ) : (
                    <>
                      <Heart className="w-5 h-5 text-purple-600" />
                      About Anastasia
                    </>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm space-y-3">
                {activeAssistant === 'robert' ? (
                  <>
                    <p className="text-slate-700 leading-relaxed">
                      <strong className="text-blue-900">Robert</strong> is your scientific research companion, 
                      providing PhD-level genomic analysis with rigorous methodology and comprehensive citations.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <FlaskConical className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Evidence-based variant interpretation</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Stethoscope className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Clinical decision support</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Statistical analysis & methodology</span>
                      </div>
                    </div>
                    <Alert className="bg-white border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-900 text-xs">
                        Best for: Research questions, technical analysis, publication-grade insights
                      </AlertDescription>
                    </Alert>
                  </>
                ) : (
                  <>
                    <p className="text-slate-700 leading-relaxed">
                      <strong className="text-purple-900">Anastasia</strong> makes genetics fun and 
                      understandable! She has PhD-level knowledge but explains everything in plain language 
                      with warmth and wit.
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start gap-2">
                        <Heart className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Friendly genetic counseling</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <Sparkles className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Complex topics simplified</span>
                      </div>
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                        <span className="text-slate-700">Supportive & empowering</span>
                      </div>
                    </div>
                    <Alert className="bg-white border-purple-200">
                      <Info className="h-4 w-4 text-purple-600" />
                      <AlertDescription className="text-purple-900 text-xs">
                        Best for: Understanding results, health guidance, emotional support
                      </AlertDescription>
                    </Alert>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Medical Records */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="w-5 h-5 text-green-600" />
                  Your Medical Data
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {medicalRecords.length === 0 ? (
                  <p className="text-sm text-slate-500 text-center py-4">
                    No medical records uploaded yet
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-slate-600 mb-2">
                      {activeAssistant === 'robert' ? 'Available for analysis:' : 'I can help explain:'}
                    </p>
                    {medicalRecords.slice(0, 3).map((record, idx) => (
                      <div key={idx} className="p-2 bg-slate-50 rounded text-xs">
                        <p className="font-medium text-slate-900">
                          {record.file_type === 'genetic_test' ? '🧬' : 
                           record.file_type === 'blood_test' ? '💉' : 
                           record.file_type === 'vcf_file' ? '📊' : '📄'}{' '}
                          {record.file_type.replace('_', ' ').toUpperCase()}
                        </p>
                        <p className="text-slate-500">
                          {new Date(record.created_date).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Tips */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">
                  {activeAssistant === 'robert' ? '💡 Research Tips' : '💡 Chat Tips'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs text-slate-700">
                {activeAssistant === 'robert' ? (
                  <>
                    <p>• Ask for specific citations and evidence levels</p>
                    <p>• Request statistical analysis or methodology details</p>
                    <p>• Inquire about molecular mechanisms</p>
                    <p>• Get publication-quality explanations</p>
                  </>
                ) : (
                  <>
                    <p>• Ask "explain like I'm 10" for super simple answers</p>
                    <p>• Don't worry about using the "right" terms</p>
                    <p>• Ask follow-up questions anytime</p>
                    <p>• Tell me if something's confusing!</p>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
        </>
        )}

        {activeTab === "research" && (
          <ResearchSuggester genes={selectedGenes} phenotypes={phenotypes} />
        )}

        {activeTab === "explainer" && (
          <GeneticExplainer />
        )}

        {activeTab === "pathway" && (
          <PathwayPredictor genes={selectedGenes} />
        )}
      </div>
    </div>
  );
}