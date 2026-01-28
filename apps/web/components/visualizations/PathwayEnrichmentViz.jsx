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
import { Network, Loader2, Download, Info, ExternalLink, Plus, Minus, Filter, ZoomIn, ZoomOut } from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function PathwayEnrichmentViz({ genes = [], userEducationLevel = "general" }) {
  const [enrichmentData, setEnrichmentData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDatabase, setSelectedDatabase] = useState("kegg");
  const [hoveredPathway, setHoveredPathway] = useState(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [filters, setFilters] = useState({
    minPValue: 0.05,
    minGeneCount: 0,
    category: "all"
  });
  const [colorScheme, setColorScheme] = useState("default");
  const canvasRef = useRef(null);
  const isDragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const nodePositions = useRef([]);

  const colorSchemes = {
    default: { high: '#ef4444', medium: '#f59e0b', low: '#3b82f6' },
    viridis: { high: '#fde724', medium: '#21908c', low: '#440154' },
    cool: { high: '#06b6d4', medium: '#3b82f6', low: '#8b5cf6' },
    warm: { high: '#dc2626', medium: '#f59e0b', low: '#fbbf24' }
  };

  useEffect(() => {
    if (genes.length > 0) {
      fetchEnrichmentData();
    }
  }, [genes, selectedDatabase]);

  useEffect(() => {
    if (enrichmentData) {
      drawPathwayNetwork(enrichmentData);
    }
  }, [enrichmentData, zoom, pan, hoveredPathway, filters, colorScheme]);

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

      // BACKEND_NEEDED: LLM integration with internet context needs API implementation
      // const response = await apiClient.invokeLLM({
      //   prompt,
      //   add_context_from_internet: true,
      //   response_json_schema: {
      const response = { pathways: [], summary: '', interactions: [] }; // Placeholder
      /*
      response = await apiClient.invokeLLM({
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
      */

      setEnrichmentData(response);
    } catch (err) {
      console.error("Error fetching enrichment:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getFilteredPathways = () => {
    if (!enrichmentData?.pathways) return [];
    return enrichmentData.pathways.filter(p => {
      if (p.adjustedPValue > filters.minPValue) return false;
      if (p.geneCount < filters.minGeneCount) return false;
      if (filters.category !== "all" && p.category !== filters.category) return false;
      return true;
    });
  };

  const drawPathwayNetwork = (data) => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.pathways) return;

    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);

    const pathways = getFilteredPathways().sort((a, b) => b.enrichmentScore - a.enrichmentScore).slice(0, 15);
    const centerX = width / (2 * zoom);
    const centerY = height / (2 * zoom);
    const radius = Math.min(width, height) / (3 * zoom);
    
    nodePositions.current = [];
    const scheme = colorSchemes[colorScheme];

    // Draw interactions first
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

    // Draw pathways
    pathways.forEach((pathway, i) => {
      const angle = (i / pathways.length) * 2 * Math.PI;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      const nodeRadius = Math.min(30, 10 + pathway.geneCount * 2);

      nodePositions.current.push({ 
        x: x * zoom + pan.x, 
        y: y * zoom + pan.y, 
        radius: nodeRadius * zoom, 
        pathway,
        index: i 
      });

      const isHovered = hoveredPathway === i;
      const alpha = Math.max(0.3, 1 - pathway.adjustedPValue);
      
      let color = scheme.low;
      if (pathway.adjustedPValue < 0.01) color = scheme.high;
      else if (pathway.adjustedPValue < 0.05) color = scheme.medium;
      
      ctx.fillStyle = isHovered ? '#ffffff' : `${color}${Math.floor(alpha * 255).toString(16).padStart(2, '0')}`;
      ctx.beginPath();
      ctx.arc(x, y, nodeRadius, 0, 2 * Math.PI);
      ctx.fill();
      
      ctx.strokeStyle = isHovered ? color : '#1e293b';
      ctx.lineWidth = isHovered ? 3 : 2;
      ctx.stroke();

      // Draw pathway name
      if (!isHovered) {
        ctx.fillStyle = '#1e293b';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        const name = pathway.name.length > 20 ? pathway.name.substring(0, 20) + '...' : pathway.name;
        ctx.fillText(name, x, y - nodeRadius - 5);
      }
    });

    ctx.restore();
  };

  const handleMouseMove = (e) => {
    if (!canvasRef.current) return;
    
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

    // Check hover
    let foundHover = null;
    nodePositions.current.forEach(node => {
      const dx = x - node.x;
      const dy = y - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < node.radius) {
        foundHover = node.index;
      }
    });
    setHoveredPathway(foundHover);
    canvasRef.current.style.cursor = foundHover !== null ? 'pointer' : 'move';
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

  const filteredPathways = getFilteredPathways();
  const hoveredData = hoveredPathway !== null ? filteredPathways[hoveredPathway] : null;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network className="w-5 h-5 text-purple-600" />
            Pathway Enrichment Analysis
          </CardTitle>
          <div className="flex gap-2">
            <Select value={colorScheme} onValueChange={setColorScheme}>
              <SelectTrigger className="w-28 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="viridis">Viridis</SelectItem>
                <SelectItem value="cool">Cool</SelectItem>
                <SelectItem value="warm">Warm</SelectItem>
              </SelectContent>
            </Select>
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
            {/* Filters */}
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filters ({filteredPathways.length} pathways)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 mt-4 p-4 bg-slate-50 rounded-lg">
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    Max P-Value: {filters.minPValue.toFixed(3)}
                  </label>
                  <Slider
                    value={[filters.minPValue]}
                    onValueChange={([v]) => setFilters(prev => ({ ...prev, minPValue: v }))}
                    min={0.001}
                    max={0.1}
                    step={0.001}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-700 mb-2 block">
                    Min Gene Count: {filters.minGeneCount}
                  </label>
                  <Slider
                    value={[filters.minGeneCount]}
                    onValueChange={([v]) => setFilters(prev => ({ ...prev, minGeneCount: v }))}
                    min={0}
                    max={10}
                    step={1}
                    className="w-full"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Network Visualization */}
            <div className="relative">
              <canvas
                ref={canvasRef}
                width={800}
                height={500}
                className="w-full border border-slate-200 rounded-lg bg-white cursor-move"
                onMouseMove={handleMouseMove}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={() => { handleMouseUp(); setHoveredPathway(null); }}
                onWheel={handleWheel}
              />
              
              {/* Tooltip */}
              {hoveredData && (
                <div className="absolute top-2 right-2 bg-white p-3 rounded-lg shadow-xl border-2 border-purple-300 max-w-sm z-10">
                  <p className="font-semibold text-sm text-slate-900 mb-2">{hoveredData.name}</p>
                  <div className="space-y-1 text-xs">
                    <p className="text-slate-700">
                      <strong>P-value:</strong> {hoveredData.adjustedPValue?.toExponential(2)}
                    </p>
                    <p className="text-slate-700">
                      <strong>Genes:</strong> {hoveredData.geneCount}/{hoveredData.totalGenes}
                    </p>
                    <p className="text-slate-700">
                      <strong>Score:</strong> {hoveredData.enrichmentScore?.toFixed(2)}
                    </p>
                    {hoveredData.description && (
                      <p className="text-slate-600 mt-2 text-xs leading-relaxed">
                        {hoveredData.description}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {hoveredData.genes?.map((gene, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {gene}
                        </Badge>
                      ))}
                    </div>
                  </div>
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
                  <Minus className="w-4 h-4" />
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetView}
                  className="bg-white shadow-md"
                >
                  Reset View
                </Button>
                <Badge variant="outline" className="bg-white text-xs">
                  Zoom: {(zoom * 100).toFixed(0)}%
                </Badge>
              </div>

              <div className="absolute top-2 left-2">
                <Button size="sm" variant="outline" onClick={exportData} className="bg-white shadow-md">
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
              <h4 className="font-semibold text-slate-900">Enriched Pathways ({filteredPathways.length})</h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {filteredPathways.map((pathway, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    onMouseEnter={() => setHoveredPathway(idx)}
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
                        {hoveredPathway === idx && (
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
              <h5 className="text-xs font-semibold text-slate-700 mb-2">Interactive Controls</h5>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div>• Scroll to zoom in/out</div>
                <div>• Drag to pan</div>
                <div>• Hover for details</div>
                <div>• Node size = gene count</div>
              </div>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}