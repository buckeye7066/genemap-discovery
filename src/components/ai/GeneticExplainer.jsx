import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Brain, Loader2, MessageSquare, Sparkles, Volume2, Dna, FileText, Network } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import ReactMarkdown from "react-markdown";

export default function GeneticExplainer() {
  React.useEffect(() => {
    // Load available voices
    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
      if (voices.length > 0 && !selectedVoice) {
        setSelectedVoice(voices[0]);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
  }, []);
  const [inputText, setInputText] = useState("");
  const [geneList, setGeneList] = useState("");
  const [variantList, setVariantList] = useState("");
  const [inputMode, setInputMode] = useState("text"); // text, genes, variants, combined
  const [audienceLevel, setAudienceLevel] = useState("general");
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState(null);
  const [availableVoices, setAvailableVoices] = useState([]);

  const audienceLevels = {
    child: "5-year-old child",
    teen: "Teenager (high school level)",
    general: "General adult audience",
    undergrad: "Undergraduate student",
    professional: "Medical professional",
    expert: "Genetics researcher"
  };

  const explainText = async () => {
    // Validate input based on mode
    let hasInput = false;
    if (inputMode === "text" && inputText.trim()) hasInput = true;
    if (inputMode === "genes" && geneList.trim()) hasInput = true;
    if (inputMode === "variants" && variantList.trim()) hasInput = true;
    if (inputMode === "combined" && (geneList.trim() || variantList.trim())) hasInput = true;

    if (!hasInput) {
      setError("Please enter genetic information to explain");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Build context based on input mode
      let inputContext = "";
      if (inputMode === "text") {
        inputContext = `**Complex Input:**\n${inputText.trim()}`;
      } else if (inputMode === "genes") {
        const genes = geneList.split(/[,\s\n]+/).filter(g => g.trim());
        inputContext = `**Gene List (${genes.length} genes):**\n${genes.join(', ')}`;
      } else if (inputMode === "variants") {
        inputContext = `**Genetic Variants:**\n${variantList.trim()}`;
      } else if (inputMode === "combined") {
        const genes = geneList.split(/[,\s\n]+/).filter(g => g.trim());
        inputContext = `**Combined Analysis:**\n\nGenes (${genes.length}): ${genes.join(', ')}\n\nVariants:\n${variantList.trim()}`;
      }
      
      const prompt = `You are an AI genetic information translator. Your job is to take complex genetic and genomic information and explain it in simple, accessible terms.

${inputContext}

**Target Audience:** ${audienceLevels[audienceLevel]}

${inputMode === "genes" || inputMode === "combined" ? `
**For Multiple Genes - Include:**
1. What each gene does (function)
2. How they might work together (interactions)
3. What pathways they're involved in
4. Combined health implications
5. Why this combination matters
` : ''}

${inputMode === "variants" || inputMode === "combined" ? `
**For Variants - Include:**
1. What each variant means
2. Combined effect analysis
3. Interaction between variants
4. Compound heterozygosity if applicable
5. Overall risk assessment
` : ''}

${inputMode === "combined" ? `
**CRITICAL - Combined Analysis:**
- Explain how the variants relate to the genes
- Gene-variant correlations and implications
- Pathway-level impact analysis
- Combined phenotypic predictions
- Synergistic or antagonistic effects
` : ''}

**Your Task:**
Transform this complex genetic information into an explanation that the target audience can understand and relate to.

**Guidelines based on audience:**

${audienceLevel === 'child' ? `
- Use simple, everyday words (no scientific terms)
- Use fun analogies (like LEGO blocks, instruction manuals, recipe books)
- Keep sentences very short
- Make it engaging and not scary
- Use emojis to make it friendly
- Break it into very small chunks
` : ''}

${audienceLevel === 'teen' ? `
- Use relatable analogies (apps, games, social media)
- Explain scientific terms in parentheses
- Keep it engaging and relevant to their lives
- Use examples they can connect with
- Don't oversimplify - they can handle some complexity
` : ''}

${audienceLevel === 'general' ? `
- Balance accessibility with accuracy
- Use everyday analogies (recipes, blueprints, instruction manuals)
- Define scientific terms in plain language
- Focus on practical implications
- Use clear structure with headers
` : ''}

${audienceLevel === 'undergrad' ? `
- Use proper scientific terminology with explanations
- Include molecular details but keep them digestible
- Connect to concepts they'd learn in biology courses
- Use diagrams descriptions where helpful
- Maintain scientific accuracy
` : ''}

${audienceLevel === 'professional' ? `
- Use medical and clinical terminology
- Focus on clinical significance and implications
- Include diagnostic and therapeutic relevance
- Reference guidelines and evidence levels
- Be concise and actionable
` : ''}

${audienceLevel === 'expert' ? `
- Use full technical nomenclature
- Include molecular mechanisms and pathways
- Reference current research and databases
- Discuss methodological considerations
- Provide comprehensive scientific detail
` : ''}

**Structure your explanation:**
1. **The Big Picture** - What is this about in one sentence?
2. **Breaking It Down** - Core concepts explained clearly
3. **Why It Matters** - Real-world implications
4. **What To Remember** - Key takeaways (3-4 bullet points)

Make the explanation warm, clear, and empowering. Avoid unnecessary medical jargon unless appropriate for the audience.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      setExplanation(response);
    } catch (err) {
      console.error("Error generating explanation:", err);
      setError("Failed to generate explanation. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const speakExplanation = () => {
    if (!explanation || !window.speechSynthesis) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    // Remove markdown formatting for better speech
    const textToSpeak = explanation
      .replace(/[#*_`]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/\*\*/g, '');

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    // Use selected voice if available
    if (selectedVoice) {
      utterance.voice = selectedVoice;
    }
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const getVoicesByLanguage = () => {
    const grouped = {};
    availableVoices.forEach(voice => {
      const lang = voice.lang.split('-')[0];
      if (!grouped[lang]) grouped[lang] = [];
      grouped[lang].push(voice);
    });
    return grouped;
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-600" />
            AI Genetic Information Simplifier
          </CardTitle>
          <Badge className="bg-blue-600 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={inputMode} onValueChange={setInputMode} className="mb-4">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="text" className="gap-2">
              <FileText className="w-3 h-3" />
              Text
            </TabsTrigger>
            <TabsTrigger value="genes" className="gap-2">
              <Dna className="w-3 h-3" />
              Genes
            </TabsTrigger>
            <TabsTrigger value="variants" className="gap-2">
              <Brain className="w-3 h-3" />
              Variants
            </TabsTrigger>
            <TabsTrigger value="combined" className="gap-2">
              <Network className="w-3 h-3" />
              Combined
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="space-y-4">
          {inputMode === "text" && (
            <div>
              <Label htmlFor="genetic-text" className="text-base font-medium mb-2 block">
                Paste Complex Genetic Information
              </Label>
              <Textarea
                id="genetic-text"
                placeholder="Paste technical genetic information, research findings, medical reports, gene descriptions, or any complex genomic text you want simplified..."
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                className="min-h-[150px] text-sm"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500 mt-1">
                Examples: Gene variant reports, research abstracts, clinical notes, pathway descriptions
              </p>
            </div>
          )}

          {inputMode === "genes" && (
            <div>
              <Label htmlFor="gene-list" className="text-base font-medium mb-2 block">
                Enter Gene List
              </Label>
              <Textarea
                id="gene-list"
                placeholder="Enter gene symbols (one per line or comma-separated)&#10;Examples:&#10;BRCA1, TP53, EGFR&#10;or&#10;BRCA1&#10;TP53&#10;EGFR"
                value={geneList}
                onChange={(e) => setGeneList(e.target.value)}
                className="min-h-[150px] text-sm font-mono"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500 mt-1">
                AI will explain how these genes work together, their interactions, and combined implications
              </p>
            </div>
          )}

          {inputMode === "variants" && (
            <div>
              <Label htmlFor="variant-list" className="text-base font-medium mb-2 block">
                Enter Genetic Variants
              </Label>
              <Textarea
                id="variant-list"
                placeholder="Enter variants from VCF or genetic test results&#10;Examples:&#10;rs1801133 (MTHFR)&#10;c.677C>T&#10;p.Ala222Val&#10;&#10;Or paste VCF lines directly"
                value={variantList}
                onChange={(e) => setVariantList(e.target.value)}
                className="min-h-[150px] text-sm font-mono"
                disabled={isLoading}
              />
              <p className="text-xs text-slate-500 mt-1">
                AI will analyze combined effects, interactions, and compound implications
              </p>
            </div>
          )}

          {inputMode === "combined" && (
            <div className="space-y-3">
              <div>
                <Label htmlFor="combined-genes" className="text-base font-medium mb-2 block">
                  Gene List
                </Label>
                <Textarea
                  id="combined-genes"
                  placeholder="BRCA1, TP53, EGFR"
                  value={geneList}
                  onChange={(e) => setGeneList(e.target.value)}
                  className="min-h-[100px] text-sm font-mono"
                  disabled={isLoading}
                />
              </div>
              <div>
                <Label htmlFor="combined-variants" className="text-base font-medium mb-2 block">
                  Variant List
                </Label>
                <Textarea
                  id="combined-variants"
                  placeholder="rs1801133, c.677C>T, p.Ala222Val"
                  value={variantList}
                  onChange={(e) => setVariantList(e.target.value)}
                  className="min-h-[100px] text-sm font-mono"
                  disabled={isLoading}
                />
              </div>
              <Alert className="bg-indigo-50 border-indigo-200">
                <Network className="h-4 w-4 text-indigo-600" />
                <AlertDescription className="text-indigo-900 text-xs">
                  <strong>Combined Analysis:</strong> AI will explain gene-variant relationships, pathway impacts, and synergistic effects
                </AlertDescription>
              </Alert>
            </div>
          )}

          <div>
            <Label htmlFor="audience-level" className="text-base font-medium mb-2 block">
              Who is this for?
            </Label>
            <Select value={audienceLevel} onValueChange={setAudienceLevel}>
              <SelectTrigger id="audience-level">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(audienceLevels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={explainText}
            disabled={isLoading}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {inputMode === "combined" ? "Analyzing Combined Effects..." : "Simplifying..."}
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4 mr-2" />
                {inputMode === "combined" ? "Analyze Combined Implications" : `Simplify for ${audienceLevels[audienceLevel]}`}
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {explanation && (
            <div className="mt-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-900">
                  {inputMode === "combined" ? "Combined Analysis" : "Simplified Explanation"}
                </h3>
                {window.speechSynthesis && (
                  <div className="flex gap-2">
                    {availableVoices.length > 0 && (
                      <Select value={selectedVoice?.name} onValueChange={(voiceName) => {
                        const voice = availableVoices.find(v => v.name === voiceName);
                        setSelectedVoice(voice);
                      }}>
                        <SelectTrigger className="w-[180px] h-8 text-xs">
                          <SelectValue placeholder="Select voice" />
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(getVoicesByLanguage()).map(([lang, voices]) => (
                            <div key={lang}>
                              <div className="px-2 py-1 text-xs font-semibold text-slate-500 uppercase">
                                {lang === 'en' ? '🇺🇸 English' : 
                                 lang === 'es' ? '🇪🇸 Spanish' :
                                 lang === 'fr' ? '🇫🇷 French' :
                                 lang === 'de' ? '🇩🇪 German' :
                                 lang === 'it' ? '🇮🇹 Italian' :
                                 lang === 'pt' ? '🇵🇹 Portuguese' :
                                 lang === 'zh' ? '🇨🇳 Chinese' :
                                 lang === 'ja' ? '🇯🇵 Japanese' :
                                 lang === 'ko' ? '🇰🇷 Korean' :
                                 lang === 'ar' ? '🇸🇦 Arabic' :
                                 lang === 'hi' ? '🇮🇳 Hindi' :
                                 `${lang.toUpperCase()}`}
                              </div>
                              {voices.map((voice) => (
                                <SelectItem key={voice.name} value={voice.name} className="text-xs">
                                  {voice.name.replace(/^.*\s/, '')} {voice.localService ? '(Local)' : ''}
                                </SelectItem>
                              ))}
                            </div>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={speakExplanation}
                      className="gap-2"
                    >
                      <Volume2 className="w-4 h-4" />
                      {isSpeaking ? "Stop" : "Read Aloud"}
                    </Button>
                  </div>
                )}
              </div>
              
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-lg border-2 border-blue-200">
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h1: ({ children }) => (
                        <h1 className="text-2xl font-bold text-blue-900 mb-3">{children}</h1>
                      ),
                      h2: ({ children }) => (
                        <h2 className="text-xl font-bold text-blue-800 mt-5 mb-2">{children}</h2>
                      ),
                      h3: ({ children }) => (
                        <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>
                      ),
                      p: ({ children }) => (
                        <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>
                      ),
                      ul: ({ children }) => (
                        <ul className="space-y-2 my-3 ml-6 list-disc">{children}</ul>
                      ),
                      ol: ({ children }) => (
                        <ol className="space-y-2 my-3 ml-6 list-decimal">{children}</ol>
                      ),
                      li: ({ children }) => (
                        <li className="text-slate-700">{children}</li>
                      ),
                      strong: ({ children }) => (
                        <strong className="font-semibold text-blue-900">{children}</strong>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="border-l-4 border-blue-400 pl-4 my-3 italic text-blue-900">
                          {children}
                        </blockquote>
                      ),
                    }}
                  >
                    {explanation}
                  </ReactMarkdown>
                </div>
              </div>

              <div className="mt-4 p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">
                    💡 Tailored for: <strong>{audienceLevels[audienceLevel]}</strong>
                  </span>
                  {(inputMode === "genes" || inputMode === "combined") && geneList.split(/[,\s\n]+/).filter(g => g.trim()).length > 0 && (
                    <Badge variant="secondary">
                      {geneList.split(/[,\s\n]+/).filter(g => g.trim()).length} genes analyzed
                    </Badge>
                  )}
                  {inputMode === "combined" && (
                    <Badge variant="outline" className="bg-indigo-50 text-indigo-700 border-indigo-200">
                      Combined Analysis
                    </Badge>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}