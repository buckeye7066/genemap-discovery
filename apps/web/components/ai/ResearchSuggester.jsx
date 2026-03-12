import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BookOpen, ExternalLink, Loader2, Sparkles, FileText, Beaker } from "lucide-react";
import ReactMarkdown from "react-markdown";

const SUGGESTER_MD_COMPONENTS = {
  h2: ({ children }) => (
    <h2 className="text-xl font-bold text-slate-900 mt-6 mb-3 flex items-center gap-2">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">
      {children}
    </h3>
  ),
  ul: ({ children }) => (
    <ul className="space-y-3 my-4">{children}</ul>
  ),
  li: ({ children }) => (
    <li className="bg-slate-50 p-3 rounded-lg border border-slate-200">
      {children}
    </li>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-slate-900">{children}</strong>
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-purple-600 hover:text-purple-700 inline-flex items-center gap-1"
    >
      {children}
      <ExternalLink className="w-3 h-3" />
    </a>
  ),
};

export default function ResearchSuggester({ genes = [], phenotypes = [] }) {
  const [suggestions, setSuggestions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const generateSuggestions = async () => {
    if (genes.length === 0 && phenotypes.length === 0) {
      setError("Please provide genes or phenotypes to get suggestions");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const geneList = Array.isArray(genes) ? genes.map(g => typeof g === 'string' ? g : g.symbol).join(', ') : '';
      const phenotypeList = phenotypes.join(', ');

      const prompt = `You are an AI research assistant specializing in genomic research. Suggest relevant research papers and clinical trials.

**Context:**
${geneList ? `- Genes: ${geneList}` : ''}
${phenotypeList ? `- Phenotypes/Conditions: ${phenotypeList}` : ''}

**Your Task:**
Provide comprehensive research suggestions in the following format:

## 🔬 Key Research Papers
For each paper (suggest 5-7 highly relevant papers):
- **Title**: [Paper title]
- **Authors**: [Lead authors]
- **Journal**: [Journal name, Year]
- **Key Findings**: [2-3 sentence summary]
- **Relevance Score**: [High/Medium] - [Why it's relevant]
- **PubMed Link**: https://pubmed.ncbi.nlm.nih.gov/?term=[search terms]

## 🧪 Active Clinical Trials
For each trial (suggest 3-5 relevant trials):
- **Trial Title**: [Official title]
- **Trial ID**: [NCT number if known]
- **Phase**: [Phase I/II/III/IV]
- **Status**: [Recruiting/Active/Completed]
- **Condition**: [Target condition]
- **Intervention**: [Treatment type]
- **Key Eligibility**: [Brief criteria]
- **Why Relevant**: [Connection to your genes/phenotypes]
- **Link**: https://clinicaltrials.gov/search?term=[search terms]

## 📊 Research Trends
- Current hot topics in this area
- Emerging therapeutic approaches
- Recent breakthroughs (last 2-3 years)

## 🎯 Recommended Search Strategies
- PubMed search terms for deeper research
- Clinical trial search keywords
- Relevant databases to explore (OMIM, ClinVar, etc.)

**Guidelines:**
- Prioritize recent research (last 5 years) but include landmark studies
- Focus on high-impact journals and well-designed trials
- Be specific about relevance to the provided genes/phenotypes
- Provide actionable search terms and links
- Highlight translational research connecting bench to bedside`;

      // BACKEND_NEEDED: InvokeLLM needs API implementation
      const response = "Research suggestions feature is currently unavailable. API implementation needed.";

      setSuggestions(response);
    } catch (err) {
      console.error("Error generating suggestions:", err);
      setError("Failed to generate research suggestions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-purple-600" />
            AI Research Suggester
          </CardTitle>
          <Badge className="bg-purple-600 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {genes.length === 0 && phenotypes.length === 0 ? (
          <Alert>
            <AlertDescription>
              Select genes from search results or enter phenotypes to get AI-powered research suggestions
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">Research context:</p>
              {genes.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-2">
                  <span className="text-xs font-medium text-slate-700">Genes:</span>
                  {genes.slice(0, 10).map((gene, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {typeof gene === 'string' ? gene : gene.symbol}
                    </Badge>
                  ))}
                  {genes.length > 10 && (
                    <Badge variant="outline" className="text-xs">
                      +{genes.length - 10} more
                    </Badge>
                  )}
                </div>
              )}
              {phenotypes.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs font-medium text-slate-700">Phenotypes:</span>
                  {phenotypes.map((pheno, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {pheno}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <Button
              onClick={generateSuggestions}
              disabled={isLoading}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Research Landscape...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Generate Research Suggestions
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {suggestions && (
              <div className="mt-6 prose prose-sm max-w-none">
                <ReactMarkdown components={SUGGESTER_MD_COMPONENTS}>
                  {suggestions}
                </ReactMarkdown>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}