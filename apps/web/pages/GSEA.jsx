import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sparkles, Info } from "lucide-react";
import GeneSetInput from "../components/gsea/GeneSetInput";
import EnrichmentResults from "../components/gsea/EnrichmentResults";
import { parseLLMJson } from "../components/shared/llmJson";

export default function GSEAPage() {
  const { user } = useAuth();
  const [geneList, setGeneList] = useState([]);
  const [enrichmentData, setEnrichmentData] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState(null);

  const handleGenesSubmit = async (genes) => {
    if (genes.length === 0) {
      setError("Please provide at least one gene for analysis");
      return;
    }

    setGeneList(genes);
    setIsAnalyzing(true);
    setError(null);

    try {
      const geneSymbols = genes.join(', ');
      
      const prompt = `Perform comprehensive Gene Set Enrichment Analysis (GSEA) for the following genes:

${geneSymbols}

**Analysis Requirements:**

1. **Pathway Enrichment**: Identify enriched biological pathways from KEGG, Reactome, and WikiPathways
2. **Gene Ontology (GO) Terms**: 
   - Biological Process (BP)
   - Molecular Function (MF)
   - Cellular Component (CC)
3. **Disease Associations**: Link to known diseases and phenotypes
4. **Functional Interpretation**: Explain the biological significance

**Output Format (JSON):**
{
  "pathways": [
    {
      "database": "KEGG/Reactome/WikiPathways",
      "id": "pathway_id",
      "name": "Pathway Name",
      "pValue": 0.001,
      "adjustedPValue": 0.01,
      "geneCount": 5,
      "totalGenes": 150,
      "enrichmentScore": 3.5,
      "genes": ["GENE1", "GENE2"],
      "description": "Brief description"
    }
  ],
  "goTerms": {
    "biologicalProcess": [
      {
        "id": "GO:0008150",
        "term": "biological process",
        "pValue": 0.001,
        "genes": ["GENE1"],
        "description": "Any process specifically pertinent to..."
      }
    ],
    "molecularFunction": [...],
    "cellularComponent": [...]
  },
  "diseases": [
    {
      "name": "Disease Name",
      "association": "Strong/Moderate/Weak",
      "evidence": "Description of evidence",
      "genes": ["GENE1", "GENE2"],
      "databases": ["OMIM", "DisGeNET"]
    }
  ],
  "summary": {
    "mainFunctions": ["function1", "function2"],
    "biologicalContext": "Overall interpretation",
    "clinicalRelevance": "Potential clinical implications",
    "novelInsights": "Unexpected or interesting findings"
  },
  "geneInteractions": [
    {
      "gene1": "GENE1",
      "gene2": "GENE2",
      "interactionType": "physical/genetic/regulatory",
      "confidence": "high/medium/low"
    }
  ]
}

Keep the JSON compact and within budget: return at most the top 8 pathways, the top 5 GO terms per category, and the top 6 disease associations. Ground every pathway/term in established curated knowledge (KEGG, Reactome, GO); do NOT fabricate or simulate statistics, and do NOT put preamble, meta-commentary, or capability disclaimers inside any field. Return ONLY the JSON object, no prose or markdown fences.`;

      // GSEA returns a large structured object; request the full token budget so
      // the JSON isn't truncated mid-object (which parsed to nothing → "No
      // enrichment results to display").
      const response = await apiClient.invokeLLM(prompt, { maxTokens: 4096 });
      const parsed = parseLLMJson(response, null);
      if (!parsed || typeof parsed !== 'object') {
        setError("Couldn't parse the enrichment results. Please try again.");
        return;
      }
      setEnrichmentData(parsed);

      // Save to activity log. The backend expects `activityType` (camelCase) and
      // an optional `entityType`; sending `activity_type`/`search_query` (the old
      // Base44 shape) triggered "activityType is required".
      try {
        await apiClient.logActivity({
          activityType: "gsea_analysis",
          entityType: "gene_set",
          metadata: {
            geneCount: genes.length,
            genes: genes.slice(0, 10)
          }
        });
      } catch (err) {
        console.log("Could not save activity:", err);
      }

    } catch (err) {
      console.error("Error performing GSEA:", err);
      setError(err.message || "Failed to analyze gene set. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReset = () => {
    setGeneList([]);
    setEnrichmentData(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Gene Set Enrichment Analysis
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Discover enriched pathways, Gene Ontology terms, and disease associations in your gene sets
          </p>
        </div>

        {/* Info Alert */}
        <Alert className="mb-6 bg-indigo-50 border-indigo-200">
          <Info className="h-4 w-4 text-indigo-600" />
          <AlertDescription className="text-indigo-900">
            <strong>What is GSEA?</strong> Gene Set Enrichment Analysis identifies biological pathways and functions 
            that are over-represented in a list of genes. This helps understand the collective biological meaning 
            of your gene set beyond individual gene functions.
          </AlertDescription>
        </Alert>

        {error && (
          <Alert variant="destructive" className="mb-6">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Input Section */}
        {!enrichmentData && (
          <GeneSetInput
            onSubmit={handleGenesSubmit}
            isLoading={isAnalyzing}
          />
        )}

        {/* Results Section */}
        {enrichmentData && (
          <>
            <Alert className="mb-6 bg-amber-50 border-amber-200">
              <Info className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 text-sm">
                <strong>AI-generated, knowledge-based estimates.</strong> Pathways, GO terms and any
                p-values come from the model's curated knowledge — they are <strong>not computed</strong> from
                a live enrichment test over your gene set. Validate with a dedicated tool
                (g:Profiler, Enrichr, GSEA/MSigDB) before reporting.
              </AlertDescription>
            </Alert>
            <EnrichmentResults
              data={enrichmentData}
              geneList={geneList}
              onReset={handleReset}
              userEducationLevel={user?.education_level}
            />
          </>
        )}

        {/* Loading State */}
        {isAnalyzing && (
          <Card className="shadow-lg">
            <CardContent className="py-12">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
                <div className="text-center">
                  <p className="text-lg font-medium text-slate-900">
                    Analyzing {geneList.length} genes...
                  </p>
                  <p className="text-sm text-slate-600 mt-2">
                    Identifying enriched pathways, GO terms, and disease associations
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}