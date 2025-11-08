import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Download, ZoomIn, ZoomOut, RotateCcw, Info } from "lucide-react";
import html2canvas from 'html2canvas';

export default function ManhattanPlot({ gwasData, userEducationLevel }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedChromosome, setSelectedChromosome] = useState("all");
  const plotRef = useRef(null);

  // Prepare chromosome colors
  const chromosomeColors = [
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#1f77b4", "#ff7f0e", "#2ca02c", "#d62728", "#9467bd",
    "#8c564b", "#e377c2", "#7f7f7f", "#bcbd22", "#17becf",
    "#1f77b4", "#ff7f0e"
  ];

  const getChromosomeColor = (chr) => {
    const chrNum = chr.replace('chr', '');
    const index = chrNum === 'X' ? 22 : chrNum === 'Y' ? 23 : parseInt(chrNum) - 1;
    return chromosomeColors[index] || "#000000";
  };

  const filteredData = selectedChromosome === "all" 
    ? gwasData 
    : gwasData.filter(d => d.chromosome === selectedChromosome);

  const significanceThreshold = 5e-8; // Genome-wide significance
  const suggestiveThreshold = 1e-5;

  const handleExportPNG = async () => {
    if (!plotRef.current) return;
    
    const canvas = await html2canvas(plotRef.current, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    const link = document.createElement('a');
    link.download = `manhattan-plot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleExportSVG = () => {
    // SVG export functionality
    const svgElement = plotRef.current?.querySelector('svg');
    if (!svgElement) return;

    const serializer = new XMLSerializer();
    const svgString = serializer.serializeToString(svgElement);
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.download = `manhattan-plot-${Date.now()}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  };

  const chromosomes = [...new Set(gwasData.map(d => d.chromosome))].sort((a, b) => {
    const aNum = a.replace('chr', '');
    const bNum = b.replace('chr', '');
    if (aNum === 'X') return 1;
    if (bNum === 'X') return -1;
    if (aNum === 'Y') return 1;
    if (bNum === 'Y') return -1;
    return parseInt(aNum) - parseInt(bNum);
  });

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Manhattan Plot - GWAS Results
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Genome-wide association study visualization
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleExportPNG}>
              <Download className="w-4 h-4 mr-1" />
              PNG
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportSVG}>
              <Download className="w-4 h-4 mr-1" />
              SVG
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900 text-sm">
            <strong>Manhattan Plot:</strong> Each point represents a genetic variant. Y-axis shows 
            statistical significance (-log10 p-value). Red line = genome-wide significance (p &lt; 5×10⁻⁸).
          </AlertDescription>
        </Alert>

        {/* Controls */}
        <div className="flex flex-wrap gap-2 items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setZoomLevel(1);
                setSelectedChromosome("all");
              }}
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge
              className={`cursor-pointer ${selectedChromosome === "all" ? "bg-blue-600" : "bg-slate-300"}`}
              onClick={() => setSelectedChromosome("all")}
            >
              All
            </Badge>
            {chromosomes.slice(0, 10).map((chr) => (
              <Badge
                key={chr}
                className={`cursor-pointer ${selectedChromosome === chr ? "bg-blue-600" : "bg-slate-300"}`}
                onClick={() => setSelectedChromosome(chr)}
              >
                {chr.replace('chr', '')}
              </Badge>
            ))}
          </div>
        </div>

        {/* Plot */}
        <div ref={plotRef} className="bg-white p-4 rounded border">
          <ResponsiveContainer width="100%" height={400 * zoomLevel}>
            <ScatterChart margin={{ top: 20, right: 20, bottom: 60, left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis 
                dataKey="position" 
                name="Position"
                label={{ value: 'Chromosomal Position', position: 'insideBottom', offset: -10 }}
              />
              <YAxis 
                dataKey="negLogP" 
                name="-log10(p-value)"
                label={{ value: '-log10(p-value)', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip 
                content={({ payload }) => {
                  if (payload && payload.length > 0) {
                    const data = payload[0].payload;
                    return (
                      <div className="bg-white p-3 border border-slate-200 rounded shadow-lg">
                        <p className="font-semibold text-sm">{data.snp}</p>
                        <p className="text-xs text-slate-600">Chr: {data.chromosome}</p>
                        <p className="text-xs text-slate-600">Position: {data.position.toLocaleString()}</p>
                        <p className="text-xs text-slate-600">P-value: {data.pvalue.toExponential(2)}</p>
                        {data.gene && <p className="text-xs text-blue-600">Nearest: {data.gene}</p>}
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <ReferenceLine 
                y={-Math.log10(significanceThreshold)} 
                stroke="red" 
                strokeDasharray="3 3"
                label={{ value: 'Genome-wide sig.', position: 'right' }}
              />
              <ReferenceLine 
                y={-Math.log10(suggestiveThreshold)} 
                stroke="blue" 
                strokeDasharray="3 3"
                label={{ value: 'Suggestive', position: 'right' }}
              />
              {chromosomes.map((chr) => (
                <Scatter
                  key={chr}
                  data={filteredData.filter(d => d.chromosome === chr)}
                  fill={getChromosomeColor(chr)}
                  opacity={0.7}
                />
              ))}
            </ScatterChart>
          </ResponsiveContainer>
        </div>

        {/* Significant Hits */}
        {filteredData.filter(d => d.pvalue < significanceThreshold).length > 0 && (
          <div className="bg-red-50 p-4 rounded border border-red-200">
            <h4 className="font-semibold text-red-900 mb-2">
              Genome-wide Significant Hits ({filteredData.filter(d => d.pvalue < significanceThreshold).length})
            </h4>
            <div className="space-y-2">
              {filteredData
                .filter(d => d.pvalue < significanceThreshold)
                .sort((a, b) => a.pvalue - b.pvalue)
                .slice(0, 5)
                .map((hit, idx) => (
                  <div key={idx} className="text-sm text-red-800">
                    <span className="font-mono">{hit.snp}</span> - {hit.chromosome}:{hit.position.toLocaleString()}
                    {hit.gene && <span className="ml-2 text-blue-600">({hit.gene})</span>}
                    <span className="ml-2 text-xs">p={hit.pvalue.toExponential(2)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}