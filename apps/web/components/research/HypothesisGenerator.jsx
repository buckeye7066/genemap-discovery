import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Lightbulb, Loader2, Sparkles, Info } from "lucide-react";
import ReactMarkdown from 'react-markdown';

const dataTypeOptions = [
  { key: 'genomics', label: 'Genomics (DNA variants, CNVs)', icon: '🧬' },
  { key: 'transcriptomics', label: 'Transcriptomics (RNA-seq, expression)', icon: '📊' },
  { key: 'proteomics', label: 'Proteomics (protein abundance)', icon: '🔬' },
  { key: 'metabolomics', label: 'Metabolomics (metabolite profiles)', icon: '⚗️' },
  { key: 'epigenomics', label: 'Epigenomics (methylation, ChIP-seq)', icon: '🎯' }
];

function getEducationContext(level) {
  if (level === 'medical_professional') {
    return "clinical researchers - emphasize translational applications";
  }
  return "research scientists - provide comprehensive technical details";
}

export default function HypothesisGenerator({ userEducationLevel }) {
  const [researchContext, setResearchContext] = useState("");
  const [dataTypes, setDataTypes] = useState({
    genomics: true,
    transcriptomics: false,
    proteomics: false,
    metabolomics: false,
    epigenomics: false
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [hypotheses, setHypotheses] = useState(null);

  const handleGenerate = async () => {
    if (!researchContext.trim()) return;

    setIsGenerating(true);
    try {
      const selectedDataTypes = Object.entries(dataTypes)
        .filter(([_, selected]) => selected)
        .map(([type]) => type);

      const educationContext = getEducationContext(userEducationLevel);

      const prompt = `You are an AI-powered scientific hypothesis generator for genomics research. Generate novel, testable hypotheses.

**Research Context:**
${researchContext}

**Available Data Types:**
${selectedDataTypes.join(', ')}

**Audience:** ${educationContext}

**Your Task - Generate Research Hypotheses:**

1. **Primary Hypothesis (H1)**
   - Clear, testable statement
   - Scientific rationale
   - Expected outcome
   - Significance if confirmed

2. **Alternative Hypotheses (H2-H4)**
   - At least 3 alternative hypotheses
   - Each with rationale
   - Competing or complementary to H1

3. **Multi-Omic Integration Strategy**
   For each available data type:
   ${selectedDataTypes.includes('genomics') ? `
   - **Genomics:** Variant calling, GWAS, rare variant analysis
   ` : ''}
   ${selectedDataTypes.includes('transcriptomics') ? `
   - **Transcriptomics:** Differential expression, co-expression networks, isoform analysis
   ` : ''}
   ${selectedDataTypes.includes('proteomics') ? `
   - **Proteomics:** Protein abundance, post-translational modifications, protein-protein interactions
   ` : ''}
   ${selectedDataTypes.includes('metabolomics') ? `
   - **Metabolomics:** Metabolite profiling, pathway flux, metabolic networks
   ` : ''}
   ${selectedDataTypes.includes('epigenomics') ? `
   - **Epigenomics:** DNA methylation, histone modifications, chromatin accessibility
   ` : ''}

4. **Experimental Design**
   - Sample size requirements
   - Control groups needed
   - Statistical power considerations
   - Potential confounders

5. **Data Analysis Pipeline**
   Step-by-step analysis workflow:
   - Quality control steps
   - Integration methods
   - Statistical tests
   - Visualization approaches

6. **Expected Results Scenarios**
   - Scenario 1: Hypothesis confirmed
   - Scenario 2: Hypothesis rejected
   - Scenario 3: Mixed/partial results
   - Interpretation for each

7. **Novel Insights & Predictions**
   - What would be discovered if true?
   - Clinical implications
   - Therapeutic targets
   - Future research directions

8. **Resource Requirements**
   - Computational resources
   - Laboratory resources
   - Estimated timeline
   - Collaboration needs

9. **Potential Challenges**
   - Technical limitations
   - Biological confounders
   - Statistical concerns
   - Mitigation strategies

10. **Grant Application Relevance**
    - Alignment with funding priorities
    - Innovation aspects
    - Translational potential
    - Broader impacts

Generate creative, scientifically rigorous hypotheses that integrate multi-omic data.`;

      // BACKEND_NEEDED: InvokeLLM integration needs API implementation
      // const response = await base44.integrations.Core.InvokeLLM({
      //   prompt,
      //   add_context_from_internet: true
      // });
      const response = "Hypothesis generation feature requires backend integration";

      setHypotheses({
        context: researchContext,
        data_types: selectedDataTypes,
        analysis: response
      });

    } catch (err) {
      console.error("Error generating hypotheses:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-600" />
            AI-Powered Hypothesis Generation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm">
              <strong>Hypothesis Generator:</strong> Describe your research context, select available 
              data types, and receive AI-generated testable hypotheses with experimental design recommendations.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="research-context">Research Context</Label>
            <Textarea
              id="research-context"
              placeholder="Describe your research project, preliminary findings, and questions...&#10;&#10;Example: We have WES data from 50 patients with early-onset Alzheimer's disease and age-matched controls. We observed elevated expression of inflammatory markers in patients. We want to identify genetic variants that may contribute to neuroinflammation."
              value={researchContext}
              onChange={(e) => setResearchContext(e.target.value)}
              className="mt-1 h-40"
              disabled={isGenerating}
            />
          </div>

          <div>
            <Label className="mb-3 block">Available Data Types</Label>
            <div className="grid md:grid-cols-2 gap-3">
              {dataTypeOptions.map((dataType) => (
                <div key={dataType.key} className="flex items-center space-x-2">
                  <Checkbox
                    id={dataType.key}
                    checked={dataTypes[dataType.key]}
                    onCheckedChange={(checked) => setDataTypes({ ...dataTypes, [dataType.key]: checked })}
                  />
                  <label htmlFor={dataType.key} className="text-sm cursor-pointer">
                    {dataType.icon} {dataType.label}
                  </label>
                </div>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={isGenerating || !researchContext.trim()}
            className="w-full bg-amber-600 hover:bg-amber-700"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating Hypotheses...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Generate Research Hypotheses
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {hypotheses && (
        <Card className="shadow-lg border-2 border-amber-300">
          <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-6 h-6 text-amber-600" />
              <div>
                <CardTitle>Generated Research Hypotheses</CardTitle>
                <div className="flex gap-2 mt-2">
                  {hypotheses.data_types.map((type) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold text-amber-900 mt-6 mb-3 flex items-center gap-2">
                      <Sparkles className="w-5 h-5" />
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-amber-900 mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-700 mb-3 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="ml-4 mb-3 space-y-2 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-amber-500 pl-4 my-4 bg-amber-50 py-3 rounded-r">
                      {children}
                    </blockquote>
                  ),
                  strong: ({ children }) => <strong className="font-semibold text-amber-900">{children}</strong>,
                }}
              >
                {hypotheses.analysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}