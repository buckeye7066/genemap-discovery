import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { GitBranch, Loader2, TrendingUp, Info } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import ReactMarkdown from 'react-markdown';

export default function PathwayEnrichment({ userEducationLevel }) {
  const [geneList, setGeneList] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState(null);

  const handleAnalyze = async () => {
    if (!geneList.trim()) return;

    setIsAnalyzing(true);
    try {
      const genes = geneList.split(/[\s,\n]+/).map(g => g.trim().toUpperCase()).filter(Boolean);
      const educationContext = getEducationContext(userEducationLevel);

      const prompt = `You are a pathway enrichment analysis expert. Analyze these ${genes.length} genes for pathway enrichment.

**Gene List:**
${genes.join(', ')}

**Audience:** ${educationContext}

**Your Task - Comprehensive Pathway Enrichment Analysis:**

1. **Enriched Biological Pathways**
   Using knowledge from KEGG, Reactome, WikiPathways:
   - Top 10 most significantly enriched pathways
   - For each pathway provide:
     * Pathway name
     * Number of genes from list in pathway
     * Total genes in pathway
     * P-value (simulated if needed)
     * FDR-adjusted p-value
   - Biological interpretation

2. **Gene Ontology Enrichment**
   - Biological Process (BP) terms
   - Molecular Function (MF) terms
   - Cellular Component (CC) terms
   - Top 5 for each category with significance

3. **Protein-Protein Interaction Networks**
   - Known interactions between these genes
   - Network hub genes
   - Modular structure
   - Functional clusters

4. **Disease Association Analysis**
   - Disease pathways enriched
   - Clinical relevance
   - Therapeutic targets
   - Drug-gene interactions

5. **Transcription Factor Analysis**
   - Common transcription factors regulating these genes
   - Regulatory networks
   - Co-expression patterns

6. **Pathway Cross-Talk**
   - Interactions between enriched pathways
   - Signaling cascades
   - Metabolic connections

7. **Functional Coherence**
   - Do these genes work together?
   - Evidence for functional relationship
   - Biological theme

8. **Research Applications**
   - Hypothesis generation
   - Experimental validation strategies
   - Further analyses recommended

9. **Visualization Recommendations**
   - Network diagrams to create
   - Heatmaps for expression
   - Pathway diagrams

10. **Statistical Data for Charts**
    Provide pathway enrichment scores in format:
    [
      {"pathway": "name", "genes": count, "pvalue": value, "fdr": value},
      ...
    ]

Return comprehensive analysis with specific pathways and statistical measures.`;

      // BACKEND_NEEDED: InvokeLLM integration needs API implementation
      // const response = await base44.integrations.Core.InvokeLLM({
      //   prompt,
      //   add_context_from_internet: true,
      //   response_json_schema: {
      //     type: "object",
      //     properties: {
      //       analysis: { type: "string" },
      //       enriched_pathways: {
      //         type: "array",
      //         items: {
      //           type: "object",
      //           properties: {
      //             pathway: { type: "string" },
      //             genes_in_pathway: { type: "number" },
      //             total_genes: { type: "number" },
      //             pvalue: { type: "number" },
      //             fdr: { type: "number" }
      //           }
      //         }
      //       }
      //     }
      //   }
      // });
      const response = {
        analysis: "Pathway enrichment analysis feature requires backend integration",
        enriched_pathways: []
      };

      setResults({
        genes: genes,
        analysis: response.analysis,
        pathways: response.enriched_pathways || []
      });

    } catch (err) {
      console.error("Error analyzing pathways:", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getEducationContext = (level) => {
    if (level === 'medical_professional') {
      return "clinical researchers - focus on disease mechanisms and therapeutic implications";
    }
    return "research scientists - provide comprehensive molecular biology details";
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-purple-600" />
            Pathway Enrichment Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-purple-50 border-purple-200">
            <Info className="h-4 w-4 text-purple-600" />
            <AlertDescription className="text-purple-900 text-sm">
              <strong>Pathway Analysis:</strong> Identify biological pathways, GO terms, and protein 
              networks enriched in your gene list. Supports KEGG, Reactome, and WikiPathways.
            </AlertDescription>
          </Alert>

          <div>
            <Label htmlFor="gene-list">Gene List</Label>
            <Textarea
              id="gene-list"
              placeholder="Enter gene symbols separated by spaces, commas, or new lines&#10;e.g., BRCA1 TP53 EGFR KRAS MYC"
              value={geneList}
              onChange={(e) => setGeneList(e.target.value)}
              className="mt-1 h-32 font-mono"
              disabled={isAnalyzing}
            />
            <p className="text-xs text-slate-500 mt-1">
              Minimum 5 genes recommended. Optimal: 20-200 genes.
            </p>
          </div>

          <Button
            onClick={handleAnalyze}
            disabled={isAnalyzing || !geneList.trim()}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Pathways...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" />
                Analyze Pathway Enrichment
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {results && (
        <>
          {/* Pathway Chart */}
          {results.pathways.length > 0 && (
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Top Enriched Pathways</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart data={results.pathways.slice(0, 10)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis 
                      dataKey="pathway" 
                      angle={-45} 
                      textAnchor="end" 
                      height={150}
                      interval={0}
                      tick={{ fontSize: 12 }}
                    />
                    <YAxis label={{ value: '-log10(FDR)', angle: -90, position: 'insideLeft' }} />
                    <Tooltip 
                      content={({ payload }) => {
                        if (payload && payload.length > 0) {
                          const data = payload[0].payload;
                          return (
                            <div className="bg-white p-3 border border-slate-200 rounded shadow-lg">
                              <p className="font-semibold text-sm">{data.pathway}</p>
                              <p className="text-xs text-slate-600">Genes: {data.genes_in_pathway}/{data.total_genes}</p>
                              <p className="text-xs text-slate-600">P-value: {data.pvalue.toExponential(2)}</p>
                              <p className="text-xs text-slate-600">FDR: {data.fdr.toExponential(2)}</p>
                            </div>
                          );
                        }
                        return null;
                      }}
                    />
                    <Legend />
                    <Bar 
                      dataKey={(data) => -Math.log10(data.fdr)} 
                      fill="#9333ea" 
                      name="-log10(FDR)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Analysis Results */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Pathway Analysis Report</CardTitle>
              <p className="text-sm text-slate-600">
                Analyzed {results.genes.length} genes
              </p>
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none">
                <ReactMarkdown
                  components={{
                    h2: ({ children }) => <h2 className="text-xl font-semibold text-purple-900 mt-5 mb-2">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">{children}</h3>,
                    p: ({ children }) => <p className="text-slate-700 mb-3">{children}</p>,
                    ul: ({ children }) => <ul className="ml-4 mb-3 space-y-1 list-disc">{children}</ul>,
                    table: ({ children }) => (
                      <div className="overflow-x-auto my-4">
                        <table className="min-w-full border-collapse border border-slate-300">
                          {children}
                        </table>
                      </div>
                    ),
                    th: ({ children }) => <th className="border border-slate-300 bg-purple-50 px-4 py-2 text-left font-semibold">{children}</th>,
                    td: ({ children }) => <td className="border border-slate-300 px-4 py-2">{children}</td>,
                  }}
                >
                  {results.analysis}
                </ReactMarkdown>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}