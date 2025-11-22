import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Network, Sparkles, TrendingUp, AlertCircle, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function PathwayPredictor({ genes = [] }) {
  const [predictions, setPredictions] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const predictInteractions = async () => {
    if (genes.length < 2) {
      setError("Please select at least 2 genes to predict interactions");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const geneList = genes.map(g => typeof g === 'string' ? g : g.symbol).join(', ');

      const prompt = `You are an AI systems biology expert specializing in gene-gene interactions and pathway analysis. Analyze the following genes and predict their interactions.

**Input Genes:** ${geneList}

**Your Task:**
Provide comprehensive interaction and pathway predictions in this structure:

## 🔗 Predicted Gene-Gene Interactions

For each likely interaction pair, provide:
- **Gene Pair**: [GENE1 ↔ GENE2]
- **Interaction Type**: [Direct/Indirect | Physical/Regulatory/Co-expression]
- **Confidence Score**: [High/Medium/Low]
- **Evidence**: [Known databases, literature, or predicted based on shared pathways]
- **Functional Consequence**: [What happens when these genes interact]
- **Disease Relevance**: [Associated conditions or phenotypes]

## 🧬 Shared Biological Pathways

Identify pathways involving multiple input genes:
- **Pathway Name**: [e.g., p53 signaling, DNA repair, etc.]
- **Involved Genes**: [Which input genes participate]
- **Pathway Role**: [What each gene does in this pathway]
- **Clinical Significance**: [Disease associations, therapeutic targets]
- **Database Links**: KEGG, Reactome, WikiPathways

## 🎯 Hub Genes & Key Players

Identify which genes are likely to be:
- **Central Hubs**: Genes that interact with many others
- **Bottlenecks**: Critical connection points
- **Peripheral Players**: Less connected but still relevant
- Explain why each gene plays its role

## 🔮 Novel Interaction Predictions

Based on shared functions, pathways, or expression patterns:
- Predict previously unstudied interactions
- Explain the reasoning (shared pathways, protein domains, expression correlation)
- Assign confidence levels with justification
- Suggest validation experiments

## 📊 Functional Enrichment

What biological processes are over-represented:
- **GO Terms**: Biological processes, molecular functions, cellular components
- **Disease Associations**: Common disease connections
- **Drug Targets**: Are any genes druggable? Existing medications?

## 🧪 Experimental Validation Suggestions

Recommend experiments to validate predictions:
- Co-immunoprecipitation for physical interactions
- Yeast two-hybrid assays
- CRISPR screens
- RNA-seq co-expression analysis
- ChIP-seq for regulatory interactions

## ⚠️ Important Caveats

- Tissue/cell-type specificity
- Context-dependent interactions
- Confidence limitations
- Areas needing more research

**Analysis Guidelines:**
- Use known interaction databases (STRING, BioGRID, IntAct, HPRD)
- Consider pathway databases (KEGG, Reactome, WikiPathways)
- Leverage protein-protein interaction networks
- Consider expression correlation data (GTEx, HPA)
- Be transparent about prediction confidence
- Distinguish between known and predicted interactions
- Provide specific evidence and references
- Focus on functionally relevant interactions

Provide evidence-based predictions with clear confidence levels. Be honest about uncertainties.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true
      });

      setPredictions(response);
    } catch (err) {
      console.error("Error predicting interactions:", err);
      setError("Failed to predict interactions. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-green-600" />
            AI Pathway & Interaction Predictor
          </CardTitle>
          <Badge className="bg-green-600 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {genes.length < 2 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Select at least 2 genes from search results to predict gene-gene interactions and pathway involvement
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-4">
              <p className="text-sm text-slate-600 mb-2">
                Analyzing interactions for {genes.length} genes:
              </p>
              <div className="flex flex-wrap gap-2">
                {genes.map((gene, idx) => (
                  <Badge key={idx} variant="outline" className="text-sm">
                    {typeof gene === 'string' ? gene : gene.symbol}
                  </Badge>
                ))}
              </div>
            </div>

            <Alert className="mb-4 bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 text-sm">
                <strong>Note:</strong> Predictions are based on known databases and AI inference. Always validate computationally predicted interactions experimentally.
              </AlertDescription>
            </Alert>

            <Button
              onClick={predictInteractions}
              disabled={isLoading}
              className="w-full bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Interaction Networks...
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 mr-2" />
                  Predict Interactions & Pathways
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {predictions && (
              <div className="mt-6 prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => (
                      <h2 className="text-xl font-bold text-green-900 mt-6 mb-3 flex items-center gap-2">
                        {children}
                      </h2>
                    ),
                    h3: ({ children }) => (
                      <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">
                        {children}
                      </h3>
                    ),
                    ul: ({ children }) => (
                      <ul className="space-y-2 my-3 ml-6">{children}</ul>
                    ),
                    li: ({ children }) => (
                      <li className="text-slate-700 leading-relaxed">{children}</li>
                    ),
                    strong: ({ children }) => (
                      <strong className="font-semibold text-slate-900">{children}</strong>
                    ),
                    p: ({ children }) => (
                      <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>
                    ),
                    blockquote: ({ children }) => (
                      <blockquote className="border-l-4 border-green-400 bg-green-50 pl-4 py-2 my-3 rounded-r">
                        <div className="text-green-900">{children}</div>
                      </blockquote>
                    ),
                    code: ({ inline, children }) =>
                      inline ? (
                        <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-xs font-mono">
                          {children}
                        </code>
                      ) : (
                        <code className="block bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-sm my-3">
                          {children}
                        </code>
                      ),
                  }}
                >
                  {predictions}
                </ReactMarkdown>

                <div className="mt-6 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <h4 className="text-sm font-semibold text-slate-900 mb-2">
                    📚 Recommended Validation Resources
                  </h4>
                  <div className="space-y-1 text-xs text-slate-600">
                    <p>• <strong>STRING</strong>: https://string-db.org</p>
                    <p>• <strong>BioGRID</strong>: https://thebiogrid.org</p>
                    <p>• <strong>KEGG Pathways</strong>: https://www.genome.jp/kegg/pathway.html</p>
                    <p>• <strong>Reactome</strong>: https://reactome.org</p>
                    <p>• <strong>GeneMANIA</strong>: https://genemania.org</p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}