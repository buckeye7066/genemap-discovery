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
import { Network, Loader2, Download, Maximize2, Info, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function PathwayEnrichmentViz({ genes = [], userEducationLevel = "general" }) {
  const [enrichmentData, setEnrichmentData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState("kegg");
  const [hoveredPathway, setHoveredPathway] = useState(null);
  const canvasRef = useRef(null);

  useEffect(() => {
    if (genes.length > 0) {
      fetchEnrichmentData();
    }
  }, [genes, selectedDatabase]);

  const fetchEnrichmentData = async () => {
    setIsLoading(true);
    try {
      const geneSymbols = genes.map(g => g.symbol || g).join(', ');
      
      const prompt = `Perform pathway enrichment analysis for these genes: ${geneSymbols}

**Analysis Requirements:**
1. Identify enriched ${selectedDatabase.toUpperCase()} pathways
2. Calculate statistical significance (p-values)
3. Determine gene overlap for each pathway
4. Provide biological interpretation

**Output Format (JSON):**
{
  "pathways": [
    {
      "id": "pathway_id",
      "name": "Pathway Name",
      "database": "${selectedDatabase}",
      "pValue": 0.001,
      "adjustedPValue": 0.01,
      "geneCount": 5,
      "totalGenes": 150,
      "enrichmentScore": 3.5,
      "genes": ["GENE1", "GENE2"],
      "description": "Brief pathway description",
      "category": "Metabolism/Signaling/etc",
      "url": "https://..."
    }
  ],
  "summary": "Overall interpretation of enriched pathways",
  "interactions": [
    {
      "pathway1": "Pathway A",
      "pathway2": "Pathway B", 
      "relationship": "upstream/downstream/parallel",
      "sharedGenes": ["GENE1"]
    }
  ]
}`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            pathways: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  database: { type: "string" },
                  pValue: { type: "number" },
                  adjustedPValue: { type: "number" },
                  geneCount: { type: "number" },
                  totalGenes: { type: "number" },
                  enrichmentScore: { type: "number" },
                  genes: { type: "array", items: { type: "string" } },
                  description: { type: "string" },
                  category: { type: "string" },
                  url: { type: "string" }
                }
              }
            },
            summary: { type: "string" },
            interactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  pathway1: { type: "string" },
                  pathway2: { type: "string" },
                  relationship: { type: "string" },
                  sharedGenes: { type: "array", items: { type: "string" } }
                }
              }
            }
          }
        }
      });

      setEnrichmentData(response);
      drawPathwayNetwork(response);
    } catch (err) {
      console.error("Error fetching enrichment:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const drawPathwayNetwork = (data) => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.pathways) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    // Sort pathways by enrichment score
    const pathways = [...data.pathways].sort((a, b) => b.enrichmentScore - a.enrichmentScore).slice(0, 15);

    // Position pathways in a circular layout
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;

    pathways.forEach((pathway, i) => {
      const angle = (i / pathways.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);

      // Node size based on gene count
      const nodeRadius = Math.min(30, 10 + pathway.geneCount * 2);

      // Color based on p-value significance
      const alpha = Math.max(0.3, 1 - pathway.adjustedPValue);
      const hue = pathway.adjustedPValue < 0.01 ? 0 : pathway.adjustedPValue < 0.05 ? 30 : 120;
      
      ctx.fillStyle = `hsla(${hue}, 70%, 50%, ${alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw pathway name
      ctx.fillStyle = '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      const name = pathway.name.length > 20 ? pathway.name.substring(0, 20) + '...' : pathway.name;
      ctx.fillText(name, x, y - nodeRadius - 5);
    });

    // Draw interactions
    if (data.interactions) {
      data.interactions.forEach(interaction => {
        const idx1 = pathways.findIndex(p => p.name === interaction.pathway1);
        const idx2 = pathways.findIndex(p => p.name === interaction.pathway2);
        
        if (idx1 !== -1 && idx2 !== -1) {
          const angle1 = (idx1 / pathways.length) * 2 * Math.PI;
          const angle2 = (idx2 / pathways.length) * 2 * Math.PI;
          const x1 = centerX + radius * Math.cos(angle1);
          const y1 = centerY + radius * Math.sin(angle1);
          const x2 = centerX + radius * Math.cos(angle2);
          const y2 = centerY + radius * Math.sin(angle2);

          ctx.strokeStyle = 'rgba(100, 116, 139, 0.3)';
          ctx.lineWidth = 1;
          ctx.setLineDash([5, 5]);
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y2);
          ctx.stroke();
          ctx.setLineDash([]);
        }
      });
    }
  };

  const exportData = () => {
    if (!enrichmentData) return;
    
    const dataStr = JSON.stringify(enrichmentData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pathway_enrichment_${selectedDatabase}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (genes.length === 0) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          Select genes to perform pathway enrichment analysis
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-purple-600" />
            Pathway Enrichment Analysis
          </CardTitle>
          <div className="flex gap-2">
            <Tabs value={selectedDatabase} onValueChange={setSelectedDatabase}>
              <TabsList>
                <TabsTrigger value="kegg">KEGG</TabsTrigger>
                <TabsTrigger value="reactome">Reactome</TabsTrigger>
                <TabsTrigger value="go">GO Terms</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
            <span className="ml-3 text-slate-600">Analyzing pathways...</span>
          </div>
        ) : enrichmentData ? (
          <div className="space-y-6">
            {/* Network Visualization */}
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className="w-full border border-slate-200 rounded-lg bg-white"
              />
              <div className="absolute top-2 right-2 flex gap-2">
                <Button size="sm" variant="outline" onClick={exportData}>
                  <Download className="w-3 h-3 mr-1" />
                  Export
                </Button>
              </div>
            </div>

            {/* Summary */}
            {enrichmentData.summary && (
              <Alert className="bg-purple-50 border-purple-200">
                <Network className="h-4 w-4 text-purple-600" />
                <AlertDescription className="text-purple-900">
                  <ReactMarkdown className="prose prose-sm max-w-none">
                    {enrichmentData.summary}
                  </ReactMarkdown>
                </AlertDescription>
              </Alert>
            )}

            {/* Pathway Table */}
            <div className="space-y-2">
              <h4 className="font-semibold text-slate-900">Enriched Pathways</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {enrichmentData.pathways.slice(0, 20).map((pathway, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                    onMouseEnter={() => setHoveredPathway(pathway)}
                    onMouseLeave={() => setHoveredPathway(null)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h5 className="font-medium text-slate-900">{pathway.name}</h5>
                          {pathway.url && (
                            <a
                              href={pathway.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mb-2">{pathway.description}</p>
                        <div className="flex flex-wrap gap-2">
                          <Badge variant="outline" className="text-xs">
                            {pathway.geneCount}/{pathway.totalGenes} genes
                          </Badge>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              pathway.adjustedPValue < 0.01
                                ? 'bg-red-50 text-red-700 border-red-200'
                                : pathway.adjustedPValue < 0.05
                                ? 'bg-orange-50 text-orange-700 border-orange-200'
                                : 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            }`}
                          >
                            p = {pathway.adjustedPValue.toExponential(2)}
                          </Badge>
                          <Badge variant="secondary" className="text-xs">
                            Score: {pathway.enrichmentScore.toFixed(2)}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {pathway.category}
                          </Badge>
                        </div>
                        {hoveredPathway === pathway && (
                          <div className="mt-2 text-xs text-slate-700 font-mono">
                            Genes: {pathway.genes.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Legend */}
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
              <h5 className="text-xs font-semibold text-slate-700 mb-2">Legend</h5>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-red-500"></div>
                  <span>p &lt; 0.01 (Highly significant)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                  <span>p &lt; 0.05 (Significant)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                  <span>p ≥ 0.05 (Trend)</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400">━━━</span>
                  <span>Pathway interactions</span>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}