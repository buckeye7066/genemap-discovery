import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Network,
  Loader2,
  ExternalLink,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Filter,
  Info,
  TrendingUp
} from "lucide-react";

export default function ProteinInteractions({ gene, userEducationLevel }) {
  const [interactionData, setInteractionData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedPartner, setSelectedPartner] = useState(null);
  const [confidenceFilter, setConfidenceFilter] = useState(['high', 'medium', 'low']);
  const [typeFilter, setTypeFilter] = useState(['physical', 'regulatory', 'pathway']);

  useEffect(() => {
    loadInteractionData();
  }, [gene.symbol]);

  const loadInteractionData = async () => {
    setIsLoading(true);
    try {
      const educationContext = getEducationContext(userEducationLevel);
      
      const prompt = `Provide protein-protein interaction information for gene ${gene.symbol} (${gene.name}).

**Your Task:**
1. List key interacting proteins/genes (up to 10 most important), identifying the partner gene symbol.
2. Describe the type of interaction (physical, regulatory, or pathway involvement).
3. Explain the biological significance of each interaction.
4. Mention confidence scores if available (e.g., "high", "medium", "low", or a numerical score like 0.75).
5. Identify major pathways or complexes involved.

Tailor explanation for ${educationContext}.

Source: STRING DB, BioGRID, IntAct, or literature evidence.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            total_interactions: { type: "number" },
            interactions: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  partner: { type: "string" },
                  type: { type: "string" },
                  confidence: { anyOf: [{ type: "string" }, { type: "number" }] },
                  significance: { type: "string" }
                },
                required: ["partner", "type", "confidence", "significance"]
              }
            },
            pathways: {
              type: "array",
              items: { type: "string" }
            },
            summary: { type: "string" }
          }
        }
      });

      setInteractionData(response);
    } catch (err) {
      console.error("Error loading interaction data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "a high school student - explain protein interactions as 'partnerships' or 'working together'";
    }
    if (level === 'undergraduate') {
      return "an undergraduate student - use terms like 'molecular interactions' with context";
    }
    return "an advanced student/researcher - use technical molecular biology terminology";
  };

  const getConfidenceLevel = (confidence) => {
    if (typeof confidence === 'string') {
      return confidence.toLowerCase();
    }
    if (typeof confidence === 'number') {
      if (confidence >= 0.7) return 'high';
      if (confidence >= 0.4) return 'medium';
      return 'low';
    }
    return 'unknown';
  };

  const getConfidenceColor = (confidence) => {
    let level = getConfidenceLevel(confidence);

    if (level.includes('high')) return "bg-green-100 text-green-800";
    if (level.includes('medium')) return "bg-yellow-100 text-yellow-800";
    if (level.includes('low')) return "bg-orange-100 text-orange-800";
    return "bg-slate-100 text-slate-700";
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.2, 2));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.2, 0.6));
  const handleResetZoom = () => setZoomLevel(1);

  const toggleConfidenceFilter = (level) => {
    setConfidenceFilter(prev =>
      prev.includes(level) ? prev.filter(l => l !== level) : [...prev, level]
    );
  };

  const toggleTypeFilter = (type) => {
    setTypeFilter(prev =>
      prev.includes(type) ? prev.filter(t => t !== type) : [...prev, type]
    );
  };

  if (isLoading) {
    return (
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-600 mr-2" />
            <span className="text-emerald-700">Loading interaction network...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!interactionData || !interactionData.interactions || interactionData.interactions.length === 0) {
    return (
      <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Network className="w-5 h-5 text-emerald-600" />
            Protein-Protein Interactions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-600">
            Interaction data not available for this gene.
          </p>
        </CardContent>
      </Card>
    );
  }

  const displayedInteractions = showAll 
    ? interactionData.interactions 
    : interactionData.interactions.slice(0, 10);

  const filteredInteractions = displayedInteractions.filter(interaction => {
    const confidenceMatch = confidenceFilter.includes(getConfidenceLevel(interaction.confidence));
    const typeMatch = typeFilter.some(t => interaction.type && interaction.type.toLowerCase().includes(t));
    return confidenceMatch && typeMatch;
  });

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Network className="w-5 h-5 text-emerald-600" />
            <CardTitle className="text-lg">Protein-Protein Interactions</CardTitle>
            <Badge variant="outline" className="text-xs">
              {filteredInteractions.length} interactions
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Confidence
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48">
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Filter by Confidence</h4>
                  <div className="space-y-2">
                    {['high', 'medium', 'low'].map(level => (
                      <div key={level} className="flex items-center space-x-2">
                        <Checkbox
                          id={`conf-${level}`}
                          checked={confidenceFilter.includes(level)}
                          onCheckedChange={() => toggleConfidenceFilter(level)}
                        />
                        <label htmlFor={`conf-${level}`} className="text-sm capitalize cursor-pointer">
                          {level}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Type
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-48">
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm">Filter by Type</h4>
                  <div className="space-y-2">
                    {['physical', 'regulatory', 'pathway'].map(type => (
                      <div key={type} className="flex items-center space-x-2">
                        <Checkbox
                          id={`type-${type}`}
                          checked={typeFilter.includes(type)}
                          onCheckedChange={() => toggleTypeFilter(type)}
                        />
                        <label htmlFor={`type-${type}`} className="text-sm capitalize cursor-pointer">
                          {type}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="flex gap-1 border rounded-md p-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomOut}
                disabled={zoomLevel <= 0.6}
                className="h-7 w-7 p-0"
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetZoom}
                className="h-7 w-7 p-0"
              >
                <RotateCcw className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleZoomIn}
                disabled={zoomLevel >= 2}
                className="h-7 w-7 p-0"
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
            </div>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                  <Info className="w-4 h-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-80">
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm">Interactive Network</h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    <li>• Hover over partners for details</li>
                    <li>• Click partner to pin information</li>
                    <li>• Filter by confidence and type</li>
                    <li>• Use zoom controls to adjust view</li>
                    <li>• Lines show interaction connections</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
        {interactionData.summary && (
          <div className="mt-2 bg-white/60 p-3 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-slate-700">{interactionData.summary}</p>
            </div>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-gradient-to-br from-slate-50 to-emerald-50 p-8 rounded-lg overflow-hidden flex justify-center items-center">
          <div
            className="relative mx-auto transition-transform duration-300"
            style={{
              width: `${Math.min(400, 300 * zoomLevel)}px`,
              height: `${Math.min(400, 300 * zoomLevel)}px`,
              maxWidth: '100%',
              maxHeight: '100%',
            }}
          >
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
              style={{
                width: `${80 * zoomLevel}px`,
                height: `${80 * zoomLevel}px`
              }}
            >
              <div className="w-full h-full bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full shadow-lg flex items-center justify-center border-4 border-white">
                <span className="text-white font-bold text-center" style={{ fontSize: `${14 * zoomLevel}px` }}>
                  {gene.symbol}
                </span>
              </div>
            </div>

            {filteredInteractions.map((interaction, index) => {
              const effectiveCount = filteredInteractions.length > 0 ? filteredInteractions.length : 1;
              const angle = (index * 360) / effectiveCount;
              const radius = 120 * zoomLevel;
              const x = Math.cos((angle * Math.PI) / 180) * radius;
              const y = Math.sin((angle * Math.PI) / 180) * radius;
              const isSelected = selectedPartner?.partner === interaction.partner;
              const nodeSize = isSelected ? 60 * zoomLevel : 50 * zoomLevel;

              return (
                <React.Fragment key={interaction.partner + "-" + index}>
                  <svg
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
                    style={{
                      width: '100%',
                      height: '100%',
                      zIndex: 1
                    }}
                  >
                    <line
                      x1="50%"
                      y1="50%"
                      x2={`calc(50% + ${x}px)`}
                      y2={`calc(50% + ${y}px)`}
                      stroke={isSelected ? '#10b981' : '#cbd5e1'}
                      strokeWidth={isSelected ? 2 : 1}
                      strokeDasharray={interaction.type && interaction.type.toLowerCase().includes('regulatory') ? '5,5' : 'none'}
                      opacity={isSelected ? 1 : 0.5}
                      className="transition-all duration-300"
                    />
                  </svg>

                  <div
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 cursor-pointer transition-all duration-300 z-20"
                    style={{
                      transform: `translate(-50%, -50%) translate(${x}px, ${y}px)`,
                      width: `${nodeSize}px`,
                      height: `${nodeSize}px`
                    }}
                    onMouseEnter={() => setSelectedPartner(interaction)}
                    onMouseLeave={() => !isSelected && setSelectedPartner(null)}
                    onClick={() => setSelectedPartner(isSelected ? null : interaction)}
                    title={interaction.partner}
                  >
                    <div
                      className={`w-full h-full bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full shadow-md flex items-center justify-center border-2 ${
                        isSelected ? 'border-emerald-600 ring-2 ring-emerald-200' : 'border-white'
                      }`}
                    >
                      <span
                        className="text-white font-semibold text-center px-1 truncate"
                        style={{ fontSize: `${10 * zoomLevel}px` }}
                      >
                        {interaction.partner}
                      </span>
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
          </div>
        </div>

        {selectedPartner && (
          <div className="p-4 bg-white rounded-lg border-2 border-emerald-200 shadow-sm">
            <div className="flex items-start justify-between mb-2">
              <h4 className="font-semibold text-emerald-900">{selectedPartner.partner}</h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPartner(null)}
                className="h-6 w-6 p-0"
              >
                ×
              </Button>
            </div>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Badge className={getConfidenceColor(selectedPartner.confidence)}>
                  {typeof selectedPartner.confidence === 'string'
                    ? selectedPartner.confidence
                    : `${Math.round(selectedPartner.confidence * 100)}%`} confidence
                </Badge>
                <Badge variant="outline" className="text-xs">
                  {selectedPartner.type}
                </Badge>
              </div>
              <p className="text-slate-700">{selectedPartner.significance}</p>
            </div>
          </div>
        )}

        <div>
          <h4 className="font-semibold text-sm text-slate-900 mb-3">
            Interaction Partners ({filteredInteractions.length})
          </h4>
          <div className="space-y-2">
            {filteredInteractions.map((interaction, index) => {
              const isSelected = selectedPartner?.partner === interaction.partner;
              return (
                <div
                  key={interaction.partner + "-list-" + index}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-emerald-300 bg-emerald-50'
                      : 'border-slate-200 hover:border-emerald-100 hover:bg-emerald-25'
                  }`}
                  onClick={() => setSelectedPartner(isSelected ? null : interaction)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h5 className="font-medium text-slate-900">{interaction.partner}</h5>
                        <Badge className={getConfidenceColor(interaction.confidence)}>
                          {typeof interaction.confidence === 'string'
                            ? interaction.confidence
                            : `${Math.round(interaction.confidence * 100)}%`}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mb-1">{interaction.type}</p>
                      <p className="text-xs text-slate-500">{interaction.significance}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {interactionData.interactions.length > 10 && (
          <Button
            variant="outline"
            onClick={() => setShowAll(!showAll)}
            className="w-full"
          >
            {showAll ? 'Show Less' : `Show ${interactionData.interactions.length - 10} More`}
          </Button>
        )}

        {interactionData.pathways && interactionData.pathways.length > 0 && (
          <div className="bg-gradient-to-r from-emerald-100 to-teal-100 p-4 rounded-lg">
            <h4 className="font-semibold text-emerald-900 mb-2 text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Associated Pathways
            </h4>
            <div className="flex flex-wrap gap-2">
              {interactionData.pathways.map((pathway, idx) => (
                <Badge key={idx} variant="secondary" className="bg-white">
                  {pathway}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <a
            href={`https://string-db.org/network/${gene.symbol}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-3 h-3" />
              STRING DB
            </Button>
          </a>
          <a
            href={`https://thebiogrid.org/search.php?search=${gene.symbol}&organism=9606`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="outline" size="sm" className="gap-2">
              <ExternalLink className="w-3 h-3" />
              BioGRID
            </Button>
          </a>
        </div>

        {/* AI Assistant Explanation Buttons */}
        <div className="flex gap-2 mt-4">
          <Button
            variant="outline"
            className="flex-1 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-300 hover:bg-blue-100 min-h-[44px]"
            onClick={() => {
              const url = createPageUrl("AIAssistants") + `?context=protein_interactions&gene=${gene.symbol}`;
              window.location.href = url;
            }}
          >
            <span className="text-lg mr-2">🧠</span>
            Ask Robert
          </Button>
          <Button
            variant="outline"
            className="flex-1 bg-gradient-to-r from-purple-50 to-pink-50 border-purple-300 hover:bg-purple-100 min-h-[44px]"
            onClick={() => {
              const url = createPageUrl("AIAssistants") + `?context=protein_interactions&gene=${gene.symbol}`;
              window.location.href = url;
            }}
          >
            <span className="text-lg mr-2">💜</span>
            Ask Anastasia
          </Button>
        </div>

        <div className="text-xs text-slate-500 text-center pt-2 border-t">
          Zoom: {Math.round(zoomLevel * 100)}% | {filteredInteractions.length} of {interactionData.interactions.length} interactions shown
        </div>
      </CardContent>
    </Card>
  );
}