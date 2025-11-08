import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Box, Loader2, ZoomIn, ZoomOut, RotateCcw, Info, Eye, EyeOff } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const DOMAIN_COLORS = [
  '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', 
  '#06b6d4', '#6366f1', '#ef4444', '#f97316', '#84cc16'
];

export default function ProteinDomains({ gene, userEducationLevel }) {
  const [isLoading, setIsLoading] = useState(true);
  const [domainData, setDomainData] = useState(null);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [hoveredDomain, setHoveredDomain] = useState(null);
  const [selectedDomain, setSelectedDomain] = useState(null);
  const [hiddenDomains, setHiddenDomains] = useState(new Set());

  useEffect(() => {
    fetchDomainData();
  }, [gene.symbol]);

  const fetchDomainData = async () => {
    setIsLoading(true);
    try {
      const educationContext = getEducationContext(userEducationLevel);
      
      const prompt = `For gene ${gene.symbol}, provide protein domain information from Pfam, SMART, and InterPro databases.

Return detailed domain architecture including:
- Domain names and types
- Start and end positions (amino acid numbers)
- Domain functions
- Database sources (Pfam, SMART, InterPro)
- Total protein length

Explain domains as "${educationContext}".`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            protein_length: { type: "number" },
            domains: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  start: { type: "number" },
                  end: { type: "number" },
                  function: { type: "string" },
                  source: { type: "string" }
                }
              }
            }
          }
        }
      });

      setDomainData(response);
    } catch (err) {
      console.error("Error fetching domain data:", err);
      setDomainData({ protein_length: 0, domains: [] });
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "specialized parts or functional sections";
    }
    if (level === 'undergraduate') {
      return "functional modules with specific biological roles";
    }
    return "structural and functional protein domains";
  };

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 0.3, 3));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 0.3, 0.5));
  const handleResetZoom = () => setZoomLevel(1);

  const toggleDomainVisibility = (domainName) => {
    setHiddenDomains(prev => {
      const newSet = new Set(prev);
      if (newSet.has(domainName)) {
        newSet.delete(domainName);
      } else {
        newSet.add(domainName);
      }
      return newSet;
    });
  };

  const showAllDomains = () => setHiddenDomains(new Set());

  if (isLoading) {
    return (
      <Card className="shadow-md">
        <CardContent className="py-12 text-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
          <p className="text-sm text-slate-600">Loading protein domains...</p>
        </CardContent>
      </Card>
    );
  }

  if (!domainData || domainData.domains.length === 0) {
    return (
      <Card className="shadow-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Box className="w-5 h-5 text-indigo-600" />
            Protein Domains
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-slate-500 text-center py-6">
            No domain information available for this gene.
          </p>
        </CardContent>
      </Card>
    );
  }

  const visibleDomains = domainData.domains.filter(d => !hiddenDomains.has(d.name));
  const proteinLength = domainData.protein_length || 1000;

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Box className="w-5 h-5 text-indigo-600" />
            <CardTitle className="text-lg">Protein Domains</CardTitle>
            <Badge variant="outline" className="text-xs">
              {visibleDomains.length} of {domainData.domains.length}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Eye className="w-4 h-4" />
                  Visibility
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Toggle Domains</h4>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={showAllDomains}
                      className="text-xs h-7 px-2"
                    >
                      Show All
                    </Button>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {domainData.domains.map((domain, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between p-2 rounded hover:bg-slate-50 cursor-pointer"
                        onClick={() => toggleDomainVisibility(domain.name)}
                      >
                        <span className="text-sm truncate flex-1">{domain.name}</span>
                        {hiddenDomains.has(domain.name) ? (
                          <EyeOff className="w-4 h-4 text-slate-400" />
                        ) : (
                          <Eye className="w-4 h-4 text-blue-600" />
                        )}
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
                disabled={zoomLevel <= 0.5}
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
                disabled={zoomLevel >= 3}
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
                  <h4 className="font-semibold text-sm">Interactive Features</h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    <li>• Hover over domains for details</li>
                    <li>• Click domain to pin information</li>
                    <li>• Use zoom controls to adjust scale</li>
                    <li>• Toggle domain visibility individually</li>
                    <li>• Colors distinguish different domains</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Protein Length Info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Protein Length:</span>
            <Badge variant="outline">{proteinLength} amino acids</Badge>
          </div>

          {/* Domain Visualization */}
          <div className="overflow-x-auto bg-slate-50 p-6 rounded-lg">
            <div
              className="relative bg-white rounded-lg shadow-inner p-4"
              style={{
                width: `${Math.max(400, 800 * zoomLevel)}px`,
                minWidth: '100%'
              }}
            >
              {/* Protein backbone */}
              <div className="relative h-16 bg-gradient-to-r from-slate-200 to-slate-300 rounded-full shadow-sm">
                {/* Position markers */}
                <div className="absolute inset-x-0 -bottom-6 flex justify-between text-xs text-slate-500">
                  <span>0</span>
                  <span>{Math.round(proteinLength / 4)}</span>
                  <span>{Math.round(proteinLength / 2)}</span>
                  <span>{Math.round(3 * proteinLength / 4)}</span>
                  <span>{proteinLength}</span>
                </div>

                {/* Domains */}
                {visibleDomains.map((domain, index) => {
                  const left = (domain.start / proteinLength) * 100;
                  const width = ((domain.end - domain.start) / proteinLength) * 100;
                  const color = DOMAIN_COLORS[index % DOMAIN_COLORS.length];
                  const isHovered = hoveredDomain?.name === domain.name;
                  const isSelected = selectedDomain?.name === domain.name;

                  return (
                    <TooltipProvider key={index}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            className="absolute top-1/2 -translate-y-1/2 rounded-lg cursor-pointer transition-all duration-200 border-2 border-white"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              height: isHovered || isSelected ? '90%' : '75%',
                              backgroundColor: color,
                              boxShadow: isHovered || isSelected ? '0 4px 12px rgba(0,0,0,0.2)' : '0 2px 4px rgba(0,0,0,0.1)',
                              zIndex: isHovered || isSelected ? 20 : 10,
                              opacity: isHovered || isSelected ? 1 : 0.85
                            }}
                            onMouseEnter={() => setHoveredDomain(domain)}
                            onMouseLeave={() => setHoveredDomain(null)}
                            onClick={() => setSelectedDomain(selectedDomain?.name === domain.name ? null : domain)}
                          >
                            {width > 8 && (
                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-white text-xs font-medium truncate px-1">
                                  {domain.name}
                                </span>
                              </div>
                            )}
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-semibold">{domain.name}</p>
                            <p className="text-xs">Position: {domain.start}-{domain.end}</p>
                            <p className="text-xs text-slate-500">{domain.function}</p>
                          </div>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  );
                })}
              </div>
            </div>

            {/* Selected Domain Details */}
            {selectedDomain && (
              <div className="mt-4 p-4 bg-white rounded-lg border-2 border-indigo-200 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <h4 className="font-semibold text-indigo-900">{selectedDomain.name}</h4>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDomain(null)}
                    className="h-6 w-6 p-0"
                  >
                    ×
                  </Button>
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">
                      {selectedDomain.start}-{selectedDomain.end}
                    </Badge>
                    <span className="text-slate-500 text-xs">
                      ({selectedDomain.end - selectedDomain.start} amino acids)
                    </span>
                  </div>
                  <p className="text-slate-700">{selectedDomain.function}</p>
                  <p className="text-xs text-slate-500">Source: {selectedDomain.source}</p>
                </div>
              </div>
            )}
          </div>

          {/* Domain List */}
          <div className="space-y-2">
            <h4 className="font-semibold text-sm text-slate-900">Domain Details</h4>
            <div className="space-y-2">
              {visibleDomains.map((domain, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg border transition-all cursor-pointer ${
                    selectedDomain?.name === domain.name
                      ? 'border-indigo-300 bg-indigo-50'
                      : hoveredDomain?.name === domain.name
                      ? 'border-indigo-200 bg-indigo-25'
                      : 'border-slate-200 hover:border-indigo-100'
                  }`}
                  onMouseEnter={() => setHoveredDomain(domain)}
                  onMouseLeave={() => setHoveredDomain(null)}
                  onClick={() => setSelectedDomain(selectedDomain?.name === domain.name ? null : domain)}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-4 h-4 rounded mt-1 flex-shrink-0"
                      style={{ backgroundColor: DOMAIN_COLORS[index % DOMAIN_COLORS.length] }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <h5 className="font-medium text-slate-900 truncate">{domain.name}</h5>
                        <Badge variant="outline" className="text-xs flex-shrink-0">
                          {domain.start}-{domain.end}
                        </Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{domain.function}</p>
                      <p className="text-xs text-slate-400 mt-1">Source: {domain.source}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-slate-500 text-center pt-2 border-t">
            Zoom: {Math.round(zoomLevel * 100)}% | Click domains for details | Use visibility toggle to hide/show
          </div>
        </div>
      </CardContent>
    </Card>
  );
}