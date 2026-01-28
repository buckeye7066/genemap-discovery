import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import AskAIButtons from "../shared/AskAIButtons";

export default function ChromosomeView({ gene, userEducationLevel }) {
  const [zoomLevel, setZoomLevel] = useState(1);

  // Chromosome lengths (approximate, in base pairs)
  const chromosomeLengths = {
    '1': 248956422, '2': 242193529, '3': 198295559, '4': 190214555,
    '5': 181538259, '6': 170805979, '7': 159345973, '8': 145138636,
    '9': 138394717, '10': 133797422, '11': 135086622, '12': 133275309,
    '13': 114364328, '14': 107043718, '15': 101991189, '16': 90338345,
    '17': 83257441, '18': 80373285, '19': 58617616, '20': 64444167,
    '21': 46709983, '22': 50818468, 'X': 156040895, 'Y': 57227415
  };

  const chrLength = chromosomeLengths[gene.chromosome] || 150000000;
  const geneStart = gene.start;
  const geneEnd = gene.end;
  const geneLength = geneEnd - geneStart;
  
  // Calculate position as percentage
  const startPercent = (geneStart / chrLength) * 100;
  const widthPercent = Math.max((geneLength / chrLength) * 100, 0.5); // Minimum 0.5% visibility

  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev * 2, 8));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev / 2, 1));
  const handleReset = () => setZoomLevel(1);

  const getExplanation = () => {
    if (!userEducationLevel || userEducationLevel === 'high_school') {
      return "This shows where the gene sits on the chromosome. Think of chromosomes as long instruction books in your cells.";
    }
    if (userEducationLevel === 'undergraduate') {
      return "Chromosomal location helps identify gene neighborhoods and potential regulatory regions.";
    }
    return "Precise cytogenetic location enables identification of syntenic regions and comparative genomic analysis.";
  };

  const formatPosition = (pos) => {
    if (!userEducationLevel || userEducationLevel === 'high_school') {
      return `${(pos / 1000000).toFixed(1)}M`;
    }
    return pos.toLocaleString();
  };

  return (
    <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <MapPin className="w-5 h-5 text-purple-600" />
              Chromosome Location
            </CardTitle>
            <p className="text-xs text-slate-600 mt-1">
              {getExplanation()}
            </p>
          </div>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomOut}
              disabled={zoomLevel === 1}
              className="h-8 w-8"
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleZoomIn}
              disabled={zoomLevel === 8}
              className="h-8 w-8"
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={handleReset}
              className="h-8 w-8"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Chromosome Info */}
        <div className="flex items-center justify-between text-sm">
          <div>
            <Badge variant="outline" className="bg-purple-100 border-purple-300">
              Chr {gene.chromosome}
            </Badge>
            <span className="ml-2 text-slate-700">
              {formatPosition(geneStart)} - {formatPosition(geneEnd)}
            </span>
          </div>
          <span className="text-xs text-slate-500">
            {gene.genomeBuild}
          </span>
        </div>

        {/* Chromosome Visualization */}
        <div className="relative bg-white rounded-lg p-4 border border-purple-200">
          {/* Chromosome bar */}
          <div className="relative h-8 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full overflow-hidden">
            {/* Centromere approximation (usually around 40-50% for most chromosomes) */}
            <div 
              className="absolute h-full bg-purple-400 opacity-30"
              style={{ left: '45%', width: '10%' }}
            />
            
            {/* Gene position */}
            <div
              className="absolute h-full bg-red-500 flex items-center justify-center"
              style={{
                left: `${startPercent}%`,
                width: `${widthPercent * zoomLevel}%`,
                minWidth: '2px',
                transition: 'all 0.3s ease'
              }}
            >
              {zoomLevel > 2 && (
                <span className="text-[10px] text-white font-bold truncate px-1">
                  {gene.symbol}
                </span>
              )}
            </div>
          </div>

          {/* Scale markers */}
          <div className="flex justify-between mt-2 text-xs text-slate-500">
            <span>0</span>
            <span>{formatPosition(chrLength / 4)}</span>
            <span>{formatPosition(chrLength / 2)}</span>
            <span>{formatPosition(3 * chrLength / 4)}</span>
            <span>{formatPosition(chrLength)}</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-3 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-red-500 rounded"></div>
            <span className="text-slate-700">{gene.symbol} location</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 bg-purple-400 opacity-30 rounded"></div>
            <span className="text-slate-700">Centromere (approx)</span>
          </div>
        </div>

        {zoomLevel > 1 && (
          <div className="bg-white/50 rounded p-2 text-xs text-slate-600">
            <strong>Zoom: {zoomLevel}x</strong> - Gene region magnified for better visibility
          </div>
        )}

        {/* AI Explanation Buttons */}
        <AskAIButtons 
          context="chromosome_location" 
          gene={gene.symbol}
          topic={`${gene.symbol} chromosomal location on Chr ${gene.chromosome}`}
          className="mt-4 pt-4 border-t border-purple-200"
        />
      </CardContent>
    </Card>
  );
}