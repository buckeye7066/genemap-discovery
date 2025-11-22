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
import { Brain, Loader2, MessageSquare, Sparkles, Volume2 } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function GeneticExplainer() {
  const [inputText, setInputText] = useState("");
  const [audienceLevel, setAudienceLevel] = useState("general");
  const [explanation, setExplanation] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audienceLevels = {
    child: "5-year-old child",
    teen: "Teenager (high school level)",
    general: "General adult audience",
    undergrad: "Undergraduate student",
    professional: "Medical professional",
    expert: "Genetics researcher"
  };

  const explainText = async () => {
    if (!inputText.trim()) {
      setError("Please enter some genetic information to explain");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const prompt = `You are an AI genetic information translator. Your job is to take complex genetic and genomic information and explain it in simple, accessible terms.

**Complex Input:**
${inputText.trim()}

**Target Audience:** ${audienceLevels[audienceLevel]}

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
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');

    const utterance = new SpeechSynthesisUtterance(textToSpeak);
    utterance.rate = 0.9;
    utterance.pitch = 1;
    
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
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
        <div className="space-y-4">
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
            disabled={isLoading || !inputText.trim()}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Simplifying...
              </>
            ) : (
              <>
                <MessageSquare className="w-4 h-4 mr-2" />
                Simplify for {audienceLevels[audienceLevel]}
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
                <h3 className="text-lg font-semibold text-slate-900">Simplified Explanation</h3>
                {window.speechSynthesis && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={speakExplanation}
                    className="gap-2"
                  >
                    <Volume2 className="w-4 h-4" />
                    {isSpeaking ? "Stop" : "Read Aloud"}
                  </Button>
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

              <div className="mt-4 text-xs text-slate-500 text-center">
                💡 This explanation is tailored for: {audienceLevels[audienceLevel]}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}