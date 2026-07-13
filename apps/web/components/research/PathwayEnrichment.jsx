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

function getEducationContext(level) {
  if (level === 'medical_professional') {
    return "clinical researchers - focus on disease mechanisms and therapeutic implications";
  }
  return "research scientists - provide comprehensive molecular biology details";
}

// Strip the model's "let me / we will delve into / we'll simulate…" preamble and
// any capability disclaimers that leaked into the user-facing report when the
// response wasn't valid JSON. Belt-and-suspenders to the prompt constraints.
function stripLLMPreamble(text) {
  if (typeof text !== 'string') return '';
  return text
    .replace(/^\s*(?:in this|as an? ai|let me|i'?ll|i will|here'?s|to (?:provide|analyze|begin)|we(?:'| wi)ll|first,|note:|disclaimer:).*?(?:\n\n|\n(?=[#*-])|$)/gis, '')
    .replace(/^[\s\S]*?\bsimulat\w+\b[^\n]*\n+/i, '') // drop a leading "we'll simulate…" line entirely
    .replace(/^\s*#+\s*$/gm, '')
    .trim();
}

function PathwayTooltipContent({ payload }) {
  if (payload && payload.length > 0) {
    const data = payload[0].payload;
    return (
      <div className="bg-white p-3 border border-slate-200 rounded shadow-lg">
        <p className="font-semibold text-sm">{data.pathway}</p>
        <p className="text-xs text-slate-600">Genes: {data.genes_in_pathway ?? data.genes ?? '—'}/{data.total_genes ?? '—'}</p>
        {/* The prompt permits a qualitative confidence ("high"/"moderate") in
            place of a numeric p-value; a string has no .toExponential, so render
            numbers formatted and anything else verbatim instead of crashing. */}
        <p className="text-xs text-slate-600">P-value: {typeof data.pvalue === 'number' ? data.pvalue.toExponential(2) : (data.pvalue ?? '—')}</p>
        <p className="text-xs text-slate-600">FDR: {typeof data.fdr === 'number' ? data.fdr.toExponential(2) : (data.fdr ?? '—')}</p>
      </div>
    );
  }
  return null;
}

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

**Critical constraints (read first):**
- Ground everything in established, curated knowledge (KEGG, Reactome, GO, STRING, etc.). Do NOT invent, simulate, or fabricate statistics.
- If you cannot ground a precise p-value in known data, give a qualitative confidence (high / moderate / low) instead of a made-up number. Never present a guessed number as a computed result.
- Output ONLY the analysis itself. Do NOT include any preamble, meta-commentary, or disclaimers about your capabilities — never write phrases like "we will delve into", "let me", or "we'll simulate some statistical data". Start directly with the findings.

**Your Task - Comprehensive Pathway Enrichment Analysis:**

1. **Enriched Biological Pathways**
   Using knowledge from KEGG, Reactome, WikiPathways:
   - Top 10 most significantly enriched pathways
   - For each pathway provide:
     * Pathway name
     * Number of genes from list in pathway
     * Total genes in pathway
     * P-value — only if grounded in curated knowledge; otherwise state confidence (high/moderate/low). Do not fabricate.
     * FDR-adjusted p-value (same rule)
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

Return the analysis directly, with no preamble or meta-commentary.`;

      const { result: raw } = await apiClient.invokeLLM(prompt);
      const response = typeof raw === 'string' ? (() => { try { return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}'); } catch { return { analysis: stripLLMPreamble(raw), enriched_pathways: [] }; } })() : raw;
      if (!response.analysis && typeof raw === 'string') { response.analysis = stripLLMPreamble(raw); }
      if (!response.enriched_pathways) { response.enriched_pathways = []; }

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
          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm">
              <strong>AI-generated, knowledge-based estimates.</strong> Pathways and any
              significance values come from the model's curated knowledge — they are
              <strong> not computed</strong> from a live enrichment test over your gene list.
              Use them to guide hypotheses, and validate with a dedicated tool
              (KEGG, Reactome, g:Profiler, Enrichr) before reporting.
            </AlertDescription>
          </Alert>
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
                    <Tooltip content={<PathwayTooltipContent />} />
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