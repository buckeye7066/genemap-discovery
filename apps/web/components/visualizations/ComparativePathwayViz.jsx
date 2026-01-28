import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@genemap/shared";
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
import { GitCompare, Loader2, TrendingUp, TrendingDown, Minus as MinusIcon, Info, Plus, Filter } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function ComparativePathwayViz({ geneSet1 = [], geneSet2 = [], labels = ["Set 1", "Set 2"] }) {
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [viewMode, setViewMode] = useState("venn");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [hoveredSection, setHoveredSection] = useState(null);
  const [colorScheme, setColorScheme] = useState("default");
  const [filters, setFilters] = useState({
    minEnrichment: 0,
    showOnlySignificant: false
  });
  const canvasRef = useRef(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });

  const colorSchemes = {
    default: { set1: '#3b82f6', set2: '#ef4444', overlap: '#8b5cf6' },
    pastel: { set1: '#93c5fd', set2: '#fca5a5', overlap: '#c4b5fd' },
    vibrant: { set1: '#0ea5e9', set2: '#dc2626', overlap: '#7c3aed' },
    earth: { set1: '#84cc16', set2: '#ea580c', overlap: '#ca8a04' }
  };

  useEffect(() => {
    if (geneSet1.length > 0 && geneSet2.length > 0) {
      performComparison();
    }
  }, [geneSet1, geneSet2]);

  useEffect(() => {
    if (comparisonData) {
      drawVisualization(comparisonData);
    }
  }, [viewMode, comparisonData, zoom, pan, hoveredSection, colorScheme]);

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

      // BACKEND_NEEDED: LLM integration with internet context needs API implementation
      // const response = await apiClient.invokeLLM({
      //   prompt,
      //   add_context_from_internet: true,
      //   response_json_schema: {
      const response = { uniqueToSet1: [], uniqueToSet2: [], shared: [], summary: {}, geneOverlap: {} }; // Placeholder
      /*
      response = await apiClient.invokeLLM({
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
      */

      setComparisonData(response);
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
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const scheme = colorSchemes[colorScheme];

    if (viewMode === "venn") {
      const centerX = width / (2 * zoom);
      const centerY = height / (2 * zoom);
      const radius = 150 / zoom;
      const offset = 80 / zoom;

      // Circle 1
      ctx.fillStyle = hoveredSection === 'set1' 
        ? `${scheme.set1}99` 
        : `${scheme.set1}4D`;
      ctx.beginPath();
      ctx.arc(centerX - offset, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = scheme.set1;
      ctx.lineWidth = hoveredSection === 'set1' ? 4 : 3;
      ctx.stroke();

      // Circle 2
      ctx.fillStyle = hoveredSection === 'set2' 
        ? `${scheme.set2}99` 
        : `${scheme.set2}4D`;
      ctx.beginPath();
      ctx.arc(centerX + offset, centerY, radius, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = scheme.set2;
      ctx.lineWidth = hoveredSection === 'set2' ? 4 : 3;
      ctx.stroke();

      // Labels
      ctx.fillStyle = hoveredSection === 'set1' ? scheme.set1 : '#1e293b';
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[0], centerX - offset - 100 / zoom, centerY - radius - 20 / zoom);
      
      ctx.fillStyle = hoveredSection === 'set2' ? scheme.set2 : '#1e293b';
      ctx.fillText(labels[1], centerX + offset + 100 / zoom, centerY - radius - 20 / zoom);

      // Counts
      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = hoveredSection === 'set1' ? scheme.set1 : '#3b82f6';
      ctx.fillText(data.uniqueToSet1?.length || 0, centerX - offset - 60 / zoom, centerY);
      
      ctx.fillStyle = hoveredSection === 'set2' ? scheme.set2 : '#ef4444';
      ctx.fillText(data.uniqueToSet2?.length || 0, centerX + offset + 60 / zoom, centerY);
      
      ctx.fillStyle = hoveredSection === 'overlap' ? scheme.overlap : '#7c3aed';
      ctx.fillText(data.shared?.length || 0, centerX, centerY);

      // Sub-labels
      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#64748b';
      ctx.fillText('Unique', centerX - offset - 60 / zoom, centerY + 20 / zoom);
      ctx.fillText('Unique', centerX + offset + 60 / zoom, centerY + 20 / zoom);
      ctx.fillText('Shared', centerX, centerY + 20 / zoom);
    } else if (viewMode === "heatmap") {
      drawHeatmap(ctx, width, height, data);
    }

    ctx.restore();
  };

  const drawHeatmap = (ctx, width, height, data) => {
    if (!data.shared || data.shared.length === 0) return;

    const filteredShared = data.shared.filter(p => 
      Math.max(p.enrichmentSet1, p.enrichmentSet2) >= filters.minEnrichment
    );

    const cellHeight = 40 / zoom;
    const labelWidth = 200 / zoom;
    const barWidth = (width - labelWidth - 100) / zoom;

    filteredShared.slice(0, 10).forEach((pathway, idx) => {
      const y = idx * cellHeight + 20 / zoom;

      ctx.fillStyle = '#1e293b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(
        pathway.pathway.length > 30 ? pathway.pathway.substring(0, 30) + '...' : pathway.pathway,
        10 / zoom,
        y + 15 / zoom
      );

      const maxEnrichment = Math.max(pathway.enrichmentSet1, pathway.enrichmentSet2);
      const bar1Width = (pathway.enrichmentSet1 / maxEnrichment) * (barWidth / 2);
      const bar2Width = (pathway.enrichmentSet2 / maxEnrichment) * (barWidth / 2);

      const isHovered = hoveredSection === idx;
      const scheme = colorSchemes[colorScheme];

      ctx.fillStyle = isHovered ? scheme.set1 : `${scheme.set1}B3`;
      ctx.fillRect(labelWidth, y, bar1Width, (cellHeight - 5) / 2);
      
      ctx.fillStyle = isHovered ? scheme.set2 : `${scheme.set2}B3`;
      ctx.fillRect(labelWidth, y + (cellHeight - 5) / 2, bar2Width, (cellHeight - 5) / 2);

      ctx.fillStyle = '#1e293b';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(pathway.enrichmentSet1.toFixed(2), labelWidth + bar1Width - 5 / zoom, y + 12 / zoom);
      ctx.fillText(pathway.enrichmentSet2.toFixed(2), labelWidth + bar2Width - 5 / zoom, y + cellHeight - 8 / zoom);
    });
  };

  const handleMouseMove = (e) => {
    if (!canvasRef.current || !comparisonData) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (isDragging.current) {
      const dx = x - lastPos.current.x;
      const dy = y - lastPos.current.y;
      setPan(prev => ({ x: prev.x + dx, y: prev.y + dy }));
      lastPos.current = { x, y };
      return;
    }

    if (viewMode === "venn") {
      const centerY = canvasRef.current.height / 2;
      const centerX = canvasRef.current.width / 2;
      const offset = 80;
      const radius = 150;

      const distLeft = Math.sqrt((x - (centerX - offset)) ** 2 + (y - centerY) ** 2);
      const distRight = Math.sqrt((x - (centerX + offset)) ** 2 + (y - centerY) ** 2);

      if (distLeft < radius && distRight < radius) {
        setHoveredSection('overlap');
      } else if (distLeft < radius) {
        setHoveredSection('set1');
      } else if (distRight < radius) {
        setHoveredSection('set2');
      } else {
        setHoveredSection(null);
      }
    }
  };

  const handleMouseDown = (e) => {
    isDragging.current = true;
    const rect = canvasRef.current.getBoundingClientRect();
    lastPos.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.max(0.5, Math.min(3, prev * delta)));
  };

  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

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

  const getTooltipContent = () => {
    if (!hoveredSection || !comparisonData) return null;
    
    if (hoveredSection === 'set1') {
      return {
        title: `${labels[0]} Only`,
        count: comparisonData.uniqueToSet1?.length || 0,
        description: 'Pathways uniquely enriched in this gene set'
      };
    } else if (hoveredSection === 'set2') {
      return {
        title: `${labels[1]} Only`,
        count: comparisonData.uniqueToSet2?.length || 0,
        description: 'Pathways uniquely enriched in this gene set'
      };
    } else if (hoveredSection === 'overlap') {
      return {
        title: 'Shared Pathways',
        count: comparisonData.shared?.length || 0,
        description: 'Pathways enriched in both gene sets'
      };
    }
    return null;
  };

  const tooltipContent = getTooltipContent();

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-indigo-600" />
            Comparative Pathway Analysis
          </CardTitle>
          <div className="flex gap-2">
            <Select value={colorScheme} onValueChange={setColorScheme}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="pastel">Pastel</SelectItem>
                <SelectItem value="vibrant">Vibrant</SelectItem>
                <SelectItem value="earth">Earth</SelectItem>
              </SelectContent>
            </Select>
            <Tabs value={viewMode} onValueChange={setViewMode}>
              <TabsList>
                <TabsTrigger value="venn">Venn</TabsTrigger>
                <TabsTrigger value="heatmap">Heatmap</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
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
            {/* Filters */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filters
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    Min Enrichment Score: {filters.minEnrichment.toFixed(1)}
                  </label>
                  <Slider
                    value={[filters.minEnrichment]}
                    onValueChange={([v]) => setFilters(prev => ({ ...prev, minEnrichment: v }))}
                    min={0}
                    max={10}
                    step={0.5}
                    className="w-full"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Visualization */}
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={viewMode === "venn" ? 400 : 500}
                className="w-full border border-slate-200 rounded-lg bg-white cursor-move"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setHoveredSection(null); }}
                onWheel={handleWheel}
              />

              {/* Tooltip */}
              {tooltipContent && (
                <div className="absolute top-2 right-2 bg-white p-3 rounded-lg shadow-xl border-2 border-indigo-300 max-w-xs z-10">
                  <p className="font-semibold text-sm text-slate-900">{tooltipContent.title}</p>
                  <p className="text-xs text-slate-600 mt-1">
                    {tooltipContent.count} pathway{tooltipContent.count !== 1 ? 's' : ''}
                  </p>
                  <p className="text-xs text-slate-500 mt-2">{tooltipContent.description}</p>
                </div>
              )}

              {/* Controls */}
              <div className="absolute bottom-2 left-2 flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom(prev => Math.min(3, prev * 1.2))}
                  className="bg-white shadow-md"
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setZoom(prev => Math.max(0.5, prev * 0.8))}
                  className="bg-white shadow-md"
                >
                  <MinusIcon className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetView}
                  className="bg-white shadow-md"
                >
                  Reset
                </Button>
                <Badge variant="outline" className="bg-white text-xs">
                  Zoom: {(zoom * 100).toFixed(0)}%
                </Badge>
              </div>
            </div>

            {/* Gene Overlap Summary */}
            {comparisonData.geneOverlap && (
              <div className="grid grid-cols-3 gap-4">
                <Card className={`border-2 ${hoveredSection === 'set1' ? 'border-blue-400 shadow-lg' : 'bg-blue-50 border-blue-200'}`}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-blue-700 mb-1">Unique to {labels[0]}</p>
                    <p className="text-2xl font-bold text-blue-900">
                      {comparisonData.geneOverlap.uniqueToSet1?.length || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`border-2 ${hoveredSection === 'overlap' ? 'border-purple-400 shadow-lg' : 'bg-purple-50 border-purple-200'}`}>
                  <CardContent className="pt-4">
                    <p className="text-xs text-purple-700 mb-1">Shared Genes</p>
                    <p className="text-2xl font-bold text-purple-900">
                      {comparisonData.geneOverlap.sharedGenes?.length || 0}
                    </p>
                  </CardContent>
                </Card>
                <Card className={`border-2 ${hoveredSection === 'set2' ? 'border-red-400 shadow-lg' : 'bg-red-50 border-red-200'}`}>
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
                  <MinusIcon className="w-4 h-4" />
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