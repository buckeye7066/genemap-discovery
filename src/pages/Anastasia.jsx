import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { 
  MessageSquare, 
  Send, 
  Loader2, 
  Sparkles,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle,
  Heart,
  Brain,
  TrendingUp,
  Activity,
  Stethoscope,
  FlaskConical,
  Shield
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

export default function AnastasiaPage() {
  const [user, setUser] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [symptoms, setSymptoms] = useState([]);
  const [currentSymptom, setCurrentSymptom] = useState("");
  const messagesEndRef = useRef(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
      
      const records = await base44.entities.MedicalData.filter(
        { created_by: currentUser.email },
        '-created_date'
      );
      setMedicalRecords(records);

      // Welcome message
      const welcomeMessage = getWelcomeMessage(currentUser);
      setMessages([{
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date()
      }]);

    } catch (err) {
      console.error("Error loading data:", err);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const getWelcomeMessage = (user) => {
    const name = user?.full_name?.split(' ')[0] || 'there';
    
    if (!user?.education_level || user.education_level === 'high_school') {
      return `Hi ${name}! 👋 I'm **Anastasia**, your personal genetic counseling assistant. I'm here to help you understand your genetic information in a simple, clear way. Think of me as your friendly guide through the world of genetics!

**I can help you with:**
- 🧬 Understanding genetic test results
- 📊 Analyzing medical reports and lab results
- 💡 Assessing health risks based on your genetic profile
- 🏥 Finding relevant clinical trials and research studies
- 🩺 Connecting your symptoms to genetic factors
- 📋 Providing personalized health guidance

Feel free to ask me anything, upload a medical file, or tell me about your symptoms!`;
    }

    if (user.education_level === 'undergraduate') {
      return `Hello ${name}! I'm **Anastasia**, your AI genetic counseling assistant. I'm here to help you interpret genetic data and medical reports with scientific accuracy while keeping explanations accessible.

**My capabilities:**
- 🧬 Genetic variant analysis and interpretation
- 📊 Medical report and lab result analysis
- 🔬 Personalized risk assessment and stratification
- 🏥 Clinical trial and research study recommendations
- 🩺 Symptom-genetics correlation analysis
- 📋 Evidence-based healthcare pathway guidance

How can I assist you today?`;
    }

    return `Hello ${name}! I'm **Anastasia**, your AI-powered genetic counseling assistant with expertise in clinical genetics, genomics, and personalized medicine.

**My services include:**
- 🧬 Comprehensive variant interpretation (pathogenicity, penetrance, expressivity)
- 📊 Advanced medical data and laboratory analysis
- 🔬 Evidence-based risk stratification and personalized assessments
- 🏥 Clinical trial matching and research study identification
- 🩺 Genotype-phenotype correlation and symptom analysis
- 📚 Current research, guidelines, and treatment recommendations

What would you like to discuss?`;
  };

  const handleSendMessage = async (e) => {
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
      
      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setSelectedRecord(null);

    } catch (err) {
      console.error("Error getting response:", err);
      const errorMessage = {
        role: 'assistant',
        content: "I apologize, but I'm having trouble processing that request right now. Please try again or rephrase your question.",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const getAnastasiaResponse = async (userMessage, medicalRecord, symptoms, user) => {
    const educationContext = getEducationContext(user);
    
    let prompt = `You are Anastasia, a compassionate and knowledgeable AI genetic counseling assistant. You provide personalized genetic counseling with empathy and scientific accuracy.

**User Context:**
- Education Level: ${user?.education_level || 'general'}
- Age: ${user?.age || 'not specified'}
- Field of Study: ${user?.field_of_study || 'not specified'}

**Communication Style:**
${educationContext}

**Core Responsibilities:**
1. Explain genetic test results with appropriate technical depth
2. Analyze medical documents and lab reports
3. Assess risks and clinical significance
4. Provide personalized risk assessments for specific conditions
5. Recommend relevant clinical trials and research studies
6. Correlate symptoms with genetic predispositions
7. Provide actionable next steps
8. Recommend healthcare professional consultations when appropriate
9. Maintain a supportive, non-alarming tone while being honest

`;

    if (medicalRecord) {
      prompt += `\n**Medical Record Being Discussed:**
Type: ${medicalRecord.file_type}
Summary: ${medicalRecord.summary || 'Not available'}
Extracted Data: ${JSON.stringify(medicalRecord.extracted_data, null, 2)}
Relevant Genes: ${medicalRecord.relevant_genes?.join(', ') || 'None identified'}
Phenotypes: ${medicalRecord.phenotypes_identified?.join(', ') || 'None identified'}

**Additional Analysis Required:**
- Extract and interpret any genetic variants mentioned
- Assess risk levels for identified conditions
- Identify potential hereditary patterns
- Suggest relevant clinical trials based on findings
`;
    }

    if (symptoms && symptoms.length > 0) {
      prompt += `\n**User-Reported Symptoms:**
${symptoms.join(', ')}

**Symptom Analysis Required:**
- Correlate symptoms with any genetic predispositions from medical data
- Identify possible genetic connections
- Assess urgency and recommend appropriate medical consultation
- Consider differential diagnoses based on genetic context
`;
    }

    prompt += `\n**User Question/Request:**
${userMessage}

**Your Response Should:**
- Be warm, supportive, and clear
- Match the user's educational background
- Provide detailed medical document analysis if applicable
- Include personalized risk assessments with percentage estimates when possible
- Recommend specific clinical trials or research studies with eligibility criteria
- Correlate symptoms with genetic data if symptoms are provided
- Highlight key findings with appropriate emphasis
- Provide context and explanations
- Suggest practical next steps
- Include relevant disclaimers about medical advice
- Use bullet points and formatting for clarity
- Reference databases like ClinicalTrials.gov, ClinVar, OMIM when relevant

Please provide a comprehensive, personalized response:`;

    const response = await base44.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: true
    });

    return response;
  };

  const getEducationContext = (user) => {
    if (!user?.education_level || user.education_level === 'high_school') {
      return `Use simple, everyday language. Avoid jargon. Use analogies and examples. Focus on what matters most in practical terms. Be especially clear about what actions to take.`;
    }

    if (user.education_level === 'undergraduate') {
      return `Use clear scientific language with explanations. Include basic genetics concepts. Balance technical accuracy with accessibility. Define any advanced terms used.`;
    }

    if (user.education_level === 'graduate' || user.education_level === 'phd') {
      return `Use technical language appropriate for graduate-level understanding. Include molecular mechanisms, inheritance patterns, and research context. Cite evidence levels.`;
    }

    if (user.education_level === 'medical_professional') {
      return `Use clinical terminology. Focus on diagnostic and therapeutic implications. Include differential diagnoses, management options, and guideline references. Be precise about clinical significance.`;
    }

    if (user.education_level === 'researcher') {
      return `Use scientific/technical language. Include methodological considerations, latest research findings, functional studies, and molecular mechanisms. Reference databases and literature.`;
    }

    return `Use clear, accessible language while maintaining accuracy.`;
  };

  const handleAnalyzeRecord = async (record) => {
    setSelectedRecord(record);
    
    const analysisMessage = {
      role: 'user',
      content: `Please analyze my ${record.file_type} data comprehensively. Include: 1) Key genetic findings, 2) Personalized risk assessment for any identified conditions, 3) Relevant clinical trials I might be eligible for, 4) How this connects to any symptoms I've reported.`,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, analysisMessage]);
    setIsLoading(true);

    try {
      const response = await getAnastasiaResponse(
        "Please provide a comprehensive analysis of this medical data, including: detailed interpretation of genetic findings, personalized risk assessments with specific percentages where possible, relevant clinical trials with eligibility criteria, correlation with reported symptoms, and recommended next steps.",
        record,
        symptoms,
        user
      );
      
      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);
      setSelectedRecord(null);

    } catch (err) {
      console.error("Error analyzing record:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddSymptom = () => {
    if (currentSymptom.trim() && !symptoms.includes(currentSymptom.trim())) {
      setSymptoms([...symptoms, currentSymptom.trim()]);
      setCurrentSymptom("");
    }
  };

  const handleRemoveSymptom = (symptom) => {
    setSymptoms(symptoms.filter(s => s !== symptom));
  };

  const handleSymptomAnalysis = async () => {
    if (symptoms.length === 0) return;

    const symptomMessage = {
      role: 'user',
      content: `I'm experiencing these symptoms: ${symptoms.join(', ')}. Can you analyze if these might be related to any genetic factors based on my medical data?`,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, symptomMessage]);
    setIsLoading(true);

    try {
      const response = await getAnastasiaResponse(
        `Analyze these symptoms in the context of my genetic profile: ${symptoms.join(', ')}. Please provide: 1) Possible genetic connections, 2) Risk assessment, 3) When I should seek medical attention, 4) What tests might be helpful.`,
        null,
        symptoms,
        user
      );
      
      const assistantMessage = {
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };

      setMessages(prev => [...prev, assistantMessage]);

    } catch (err) {
      console.error("Error analyzing symptoms:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const quickPrompts = [
    "What do my genetic results mean?",
    "Assess my health risks",
    "Find relevant clinical trials",
    "Analyze my symptoms",
    "What should I do next?"
  ];

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
            Your AI Genetic Counseling Assistant
            <Sparkles className="w-5 h-5 text-purple-600" />
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Chat Interface */}
          <Card className="lg:col-span-2 shadow-lg">
            <CardHeader className="border-b bg-gradient-to-r from-purple-50 to-pink-50">
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                Conversation
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
                      className={`max-w-[80%] rounded-2xl p-4 ${
                        message.role === 'user'
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-purple-200 shadow-sm'
                      }`}
                    >
                      {message.role === 'assistant' ? (
                        <div className="prose prose-sm max-w-none">
                          <ReactMarkdown
                            components={{
                              p: ({ children }) => <p className="mb-2 last:mb-0 text-slate-800">{children}</p>,
                              strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                              ul: ({ children }) => <ul className="ml-4 mb-2 space-y-1">{children}</ul>,
                              ol: ({ children }) => <ol className="ml-4 mb-2 space-y-1">{children}</ol>,
                              li: ({ children }) => <li className="text-slate-700">{children}</li>,
                              h3: ({ children }) => <h3 className="text-base font-semibold text-purple-900 mt-3 mb-2">{children}</h3>,
                              h4: ({ children }) => <h4 className="text-sm font-semibold text-purple-800 mt-2 mb-1">{children}</h4>,
                            }}
                          >
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <p className="text-sm">{message.content}</p>
                      )}
                      <p className={`text-xs mt-2 ${message.role === 'user' ? 'text-blue-100' : 'text-slate-400'}`}>
                        {message.timestamp.toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-white border border-purple-200 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-2 text-purple-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-sm">Anastasia is analyzing...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Prompts */}
              {messages.length <= 1 && !isLoading && (
                <div className="p-4 border-t bg-slate-50">
                  <p className="text-xs text-slate-600 mb-2">Quick questions:</p>
                  <div className="flex flex-wrap gap-2">
                    {quickPrompts.map((prompt, idx) => (
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

              {/* Input */}
              <form onSubmit={handleSendMessage} className="p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    placeholder="Ask Anastasia anything about your genetic data..."
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
            {/* Capabilities */}
            <Card className="shadow-lg border-purple-200">
              <CardHeader className="bg-gradient-to-br from-purple-50 to-pink-50">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-600" />
                  Enhanced Capabilities
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <FileText className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Analyzes medical documents & lab reports</span>
                </div>
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Personalized risk assessments</span>
                </div>
                <div className="flex items-start gap-2">
                  <FlaskConical className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Clinical trial recommendations</span>
                </div>
                <div className="flex items-start gap-2">
                  <Stethoscope className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Symptom-genetics correlation</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" />
                  <span className="text-slate-700">Personalized to your background</span>
                </div>
              </CardContent>
            </Card>

            {/* Symptom Tracker */}
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

            {/* Medical Records */}
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

            {/* Important Notice */}
            <Alert className="border-amber-200 bg-amber-50">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs text-amber-800">
                <strong>Medical Disclaimer:</strong> Anastasia provides educational information only. Always consult qualified healthcare professionals for medical decisions.
              </AlertDescription>
            </Alert>
          </div>
        </div>
      </div>
    </div>
  );
}