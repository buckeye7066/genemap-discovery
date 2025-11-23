import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitCompare, Loader2, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function ComparativePathwayViz({ geneSet1 = [], geneSet2 = [], labels = ["Set 1", "Set 2"] }) {
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState("venn"); // venn, heatmap, network
  const canvasRef = useRef(null);

  useEffect(() => {
    if (geneSet1.length > 0 && geneSet2.length > 0) {
      performComparison();
    }
  }, [geneSet1, geneSet2]);

  const performComparison = async () => {
    setIsLoading(true);
    try {
      const genes1 = geneSet1.map(g => g.symbol || g).join(', ');
      const genes2 = geneSet2.map(g => g.symbol || g).join(', ');

      const prompt = `Compare pathway enrichment between two gene sets:

**${labels[0]}:** ${genes1}
**${labels[1]}:** ${genes2}

**Analysis Requirements:**
1. Identify pathways unique to each set
2. Find overlapping pathways
3. Calculate differential enrichment
4. Determine biological divergence/convergence
5. Predict functional consequences

**Output Format (JSON):**
{
  "uniqueToSet1": [
    {
      "pathway": "Pathway Name",
      "enrichmentScore": 3.5,
      "pValue": 0.001,
      "genes": ["GENE1", "GENE2"],
      "biologicalSignificance": "explanation"
    }
  ],
  "uniqueToSet2": [...],
  "shared": [
    {
      "pathway": "Pathway Name",
      "enrichmentSet1": 3.5,
      "enrichmentSet2": 2.8,
      "difference": 0.7,
      "differentialSignificance": "Set1 more enriched",
      "genes": ["GENE1", "GENE2"]
    }
  ],
  "summary": {
    "biologicalDivergence": "High/Medium/Low",
    "keyDifferences": ["difference1", "difference2"],
    "sharedFunctions": ["function1", "function2"],
    "clinicalImplications": "interpretation"
  },
  "geneOverlap": {
    "sharedGenes": ["GENE1"],
    "uniqueToSet1": ["GENE2"],
    "uniqueToSet2": ["GENE3"],
    "overlapPercentage": 20
  }
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            uniqueToSet1: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pathway: { type: "string" },
                  enrichmentScore: { type: "number" },
                  pValue: { type: "number" },
                  genes: { type: "array", items: { type: "string" } },
                  biologicalSignificance: { type: "string" }
                }
              }
            },
            uniqueToSet2: { type: "array" },
            shared: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pathway: { type: "string" },
                  enrichmentSet1: { type: "number" },
                  enrichmentSet2: { type: "number" },
                  difference: { type: "number" },
                  differentialSignificance: { type: "string" },
                  genes: { type: "array", items: { type: "string" } }
                }
              }
            },
            summary: {
              type: "object",
              properties: {
                biologicalDivergence: { type: "string" },
                keyDifferences: { type: "array", items: { type: "string" } },
                sharedFunctions: { type: "array", items: { type: "string" } },
                clinicalImplications: { type: "string" }
              }
            },
            geneOverlap: {
              type: "object",
              properties: {
                sharedGenes: { type: "array", items: { type: "string" } },
                uniqueToSet1: { type: "array", items: { type: "string" } },
                uniqueToSet2: { type: "array", items: { type: "string" } },
                overlapPercentage: { type: "number" }
              }
            }
          }
        }
      });

      setComparisonData(response);
      drawVisualization(response);
    } catch (err) {
      console.error("Error comparing pathways:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const drawVisualization = (data) => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (viewMode === "venn") {
      drawVennDiagram(ctx, width, height, data);
    } else if (viewMode === "heatmap") {
      drawHeatmap(ctx, width, height, data);
    }
  };

  const drawVennDiagram = (ctx, width, height, data) => {
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = 150;
    const offset = 80;

    // Circle 1
    ctx.fillStyle = 'rgba(59, 130, 246, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX - offset, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Circle 2
    ctx.fillStyle = 'rgba(239, 68, 68, 0.3)';
    ctx.beginPath();
    ctx.arc(centerX + offset, centerY, radius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Labels
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(labels[0], centerX - offset - 100, centerY - radius - 20);
    ctx.fillText(labels[1], centerX + offset + 100, centerY - radius - 20);

    // Counts
    ctx.font = 'bold 24px sans-serif';
    ctx.fillStyle = '#3b82f6';
    ctx.fillText(data.uniqueToSet1?.length || 0, centerX - offset - 60, centerY);
    ctx.fillStyle = '#ef4444';
    ctx.fillText(data.uniqueToSet2?.length || 0, centerX + offset + 60, centerY);
    ctx.fillStyle = '#7c3aed';
    ctx.fillText(data.shared?.length || 0, centerX, centerY);

    // Sub-labels
    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText('Unique', centerX - offset - 60, centerY + 20);
    ctx.fillText('Unique', centerX + offset + 60, centerY + 20);
    ctx.fillText('Shared', centerX, centerY + 20);
  };

  const drawHeatmap = (ctx, width, height, data) => {
    if (!data.shared || data.shared.length === 0) return;

    const cellHeight = 40;
    const labelWidth = 200;
    const barWidth = width - labelWidth - 100;

    data.shared.slice(0, 10).forEach((pathway, idx) => {
      const y = idx * cellHeight + 20;

      // Pathway name
      ctx.fillStyle = '#1e293b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        pathway.pathway.length > 30 ? pathway.pathway.substring(0, 30) + '...' : pathway.pathway,
        10,
        y + 15
      );

      // Bars
      const maxEnrichment = Math.max(pathway.enrichmentSet1, pathway.enrichmentSet2);
      const bar1Width = (pathway.enrichmentSet1 / maxEnrichment) * (barWidth / 2);
      const bar2Width = (pathway.enrichmentSet2 / maxEnrichment) * (barWidth / 2);

      ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
      ctx.fillRect(labelWidth, y, bar1Width, cellHeight - 5);
      
      ctx.fillStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.fillRect(labelWidth, y + (cellHeight - 5) / 2, bar2Width, (cellHeight - 5) / 2);

      // Values
      ctx.fillStyle = '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(pathway.enrichmentSet1.toFixed(2), labelWidth + bar1Width - 5, y + 12);
      ctx.fillText(pathway.enrichmentSet2.toFixed(2), labelWidth + bar2Width - 5, y + cellHeight - 8);
    });
  };

  useEffect(() => {
    if (comparisonData) {
      drawVisualization(comparisonData);
    }
  }, [viewMode, comparisonData]);

  if (geneSet1.length === 0 || geneSet2.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Select two gene sets to perform comparative pathway analysis
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-600" />
            Comparative Pathway Analysis
          </CardTitle>
          <Tabs value={viewMode} onValueChange={setViewMode}>
            <TabsList>
              <TabsTrigger value="venn">Venn</TabsTrigger>
              <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
            <span className="ml-3 text-slate-600">Comparing pathways...</span>
          </div>
        ) : comparisonData ? (
          <div className="space-y-6">
            {/* Visualization */}
            <canvas
              ref={canvasRef}
              width={800}
              height={viewMode === "venn" ? 400 : 500}
              className="w-full border border-slate-200 rounded-lg bg-white"
            />

            {/* Gene Overlap Summary */}
            {comparisonData.geneOverlap && (
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-blue-50 border-blue-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-blue-700 mb-1">Unique to {labels[0]}</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {comparisonData.geneOverlap.uniqueToSet1?.length || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-purple-700 mb-1">Shared Genes</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {comparisonData.geneOverlap.sharedGenes?.length || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-4">
                    <p className="text-xs text-red-700 mb-1">Unique to {labels[1]}</p>
                    <p className="text-2xl font-bold text-red-900">
                      {comparisonData.geneOverlap.uniqueToSet2?.length || 0}
                    </p>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Summary */}
            {comparisonData.summary && (
              <Alert className="bg-indigo-50 border-indigo-200">
                <GitCompare className="h-4 w-4 text-indigo-600" />
                <AlertDescription>
                  <div className="space-y-2 text-indigo-900">
                    <p className="font-semibold">
                      Biological Divergence: {comparisonData.summary.biologicalDivergence}
                    </p>
                    {comparisonData.summary.keyDifferences && (
                      <div>
                        <p className="text-sm font-medium">Key Differences:</p>
                        <ul className="list-disc ml-4 text-sm">
                          {comparisonData.summary.keyDifferences.map((diff, idx) => (
                            <li key={idx}>{diff}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {comparisonData.summary.clinicalImplications && (
                      <ReactMarkdown className="prose prose-sm max-w-none">
                        {comparisonData.summary.clinicalImplications}
                      </ReactMarkdown>
                    )}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Differential Pathways */}
            <div className="space-y-4">
              <div>
                <h4 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Unique to {labels[0]} ({comparisonData.uniqueToSet1?.length || 0})
                </h4>
                <div className="space-y-2">
                  {comparisonData.uniqueToSet1?.slice(0, 5).map((pathway, idx) => (
                    <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-blue-900">{pathway.pathway}</p>
                        <Badge variant="outline" className="bg-blue-100 text-blue-800">
                          Score: {pathway.enrichmentScore?.toFixed(2)}
                        </Badge>
                      </div>
                      <p className="text-xs text-blue-700">{pathway.biologicalSignificance}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-red-900 mb-2 flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" />
                  Unique to {labels[1]} ({comparisonData.uniqueToSet2?.length || 0})
                </h4>
                <div className="space-y-2">
                  {comparisonData.uniqueToSet2?.slice(0, 5).map((pathway, idx) => (
                    <div key={idx} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-red-900">{pathway.pathway}</p>
                        <Badge variant="outline" className="bg-red-100 text-red-800">
                          Score: {pathway.enrichmentScore?.toFixed(2)}
                        </Badge>
                      </div>
                      <p className="text-xs text-red-700">{pathway.biologicalSignificance}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-purple-900 mb-2 flex items-center gap-2">
                  <Minus className="w-4 h-4" />
                  Shared Pathways (Differential) ({comparisonData.shared?.length || 0})
                </h4>
                <div className="space-y-2">
                  {comparisonData.shared?.slice(0, 5).map((pathway, idx) => (
                    <div key={idx} className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-medium text-purple-900">{pathway.pathway}</p>
                        <div className="flex gap-2">
                          <Badge variant="outline" className="bg-blue-100 text-blue-800 text-xs">
                            {labels[0]}: {pathway.enrichmentSet1?.toFixed(2)}
                          </Badge>
                          <Badge variant="outline" className="bg-red-100 text-red-800 text-xs">
                            {labels[1]}: {pathway.enrichmentSet2?.toFixed(2)}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-xs text-purple-700">{pathway.differentialSignificance}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}