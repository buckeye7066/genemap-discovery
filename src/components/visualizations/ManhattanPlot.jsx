
import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Label } from "@/components/ui/label"; // New import
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"; // New import
import { ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { Download, ZoomIn, ZoomOut, RotateCcw, Info } from "lucide-react";
import html2canvas from 'html2canvas';

export default function ManhattanPlot({ gwasData, userEducationLevel, highlightedGene, onGeneClick, allGenes = [] }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedChromosome, setSelectedChromosome] = useState("all");
  const [pValueThreshold, setPValueThreshold] = useState(1e-5); // New state for p-value threshold
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
    // Assign 'X' and 'Y' to specific indices, otherwise parse integer
    const index = chrNum === 'X' ? 22 : chrNum === 'Y' ? 23 : parseInt(chrNum) - 1;
    return chromosomeColors[index % chromosomeColors.length] || "#000000"; // Use modulo for wrap-around
  };

  // Modified filteredData to include pValueThreshold
  const filteredData = selectedChromosome === "all"
    ? gwasData.filter(d => d.pvalue <= pValueThreshold)
    : gwasData.filter(d => d.chromosome === selectedChromosome && d.pvalue <= pValueThreshold);

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

    // Custom sort for 'X' and 'Y' chromosomes
    if (aNum === 'X') return 1;
    if (bNum === 'X') return -1;
    if (aNum === 'Y') return 1;
    if (bNum === 'Y') return -1;

    return parseInt(aNum) - parseInt(bNum);
  });

  // New function for dynamic explanation based on education level
  const getExplanation = () => {
    if (!userEducationLevel || userEducationLevel === 'high_school') {
      return "Each dot is a spot on your DNA. Higher dots mean stronger connections to the trait we're studying.";
    }
    if (userEducationLevel === 'undergraduate') {
      return "Each point represents a genetic variant tested for association. Y-axis shows statistical significance.";
    }
    return "Genome-wide association study results. -log10(p-value) on Y-axis. Red line = genome-wide significance.";
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Manhattan Plot - GWAS Results
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {getExplanation()} {/* Using the new getExplanation function */}
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
            <strong>Interactive:</strong> Click any point to highlight that gene across all visualizations.
            {highlightedGene && ` Currently highlighting: ${highlightedGene}`}
          </AlertDescription>
        </Alert>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.max(0.5, zoomLevel - 0.25))}
              title="Zoom Out" // Added title
            >
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoomLevel(Math.min(3, zoomLevel + 0.25))}
              title="Zoom In" // Added title
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setZoomLevel(1);
                setSelectedChromosome("all");
                setPValueThreshold(1e-5); // Reset p-value threshold
              }}
              title="Reset View" // Added title
            >
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>

          {/* New P-Value Threshold Select */}
          <div className="flex gap-2 items-center">
            <Label className="text-xs">Show p-value &lt;</Label>
            <Select value={pValueThreshold.toString()} onValueChange={(v) => setPValueThreshold(parseFloat(v))}>
              <SelectTrigger className="w-24 h-8">
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">All</SelectItem>
                <SelectItem value="0.01">0.01</SelectItem>
                <SelectItem value="0.001">0.001</SelectItem>
                <SelectItem value="1e-5">10⁻⁵</SelectItem>
                <SelectItem value="5e-8">5×10⁻⁸</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Badge
              className={`cursor-pointer ${selectedChromosome === "all" ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-800 hover:bg-slate-400"}`}
              onClick={() => setSelectedChromosome("all")}
            >
              All
            </Badge>
            {chromosomes.slice(0, 10).map((chr) => (
              <Badge
                key={chr}
                className={`cursor-pointer ${selectedChromosome === chr ? "bg-blue-600 text-white" : "bg-slate-300 text-slate-800 hover:bg-slate-400"}`}
                onClick={() => setSelectedChromosome(chr)}
              >
                {chr.replace('chr', '')}
              </Badge>
            ))}
            {/* If there are more than 10 chromosomes, add an ellipsis or "More" button */}
            {chromosomes.length > 10 && (
              <Badge className="bg-slate-200 text-slate-600 cursor-not-allowed">...</Badge>
            )}
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
                        {data.gene && (
                          <p className="text-xs text-blue-600 font-medium cursor-pointer">
                            Nearest: {data.gene} (click to highlight)
                          </p>
                        )}
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
                label={{ value: 'Genome-wide sig.', position: 'right', fill: 'red' }} {/* Added fill */}
              />
              <ReferenceLine
                y={-Math.log10(suggestiveThreshold)}
                stroke="blue"
                strokeDasharray="3 3"
                label={{ value: 'Suggestive', position: 'right', fill: 'blue' }} {/* Added fill */}
              />
              {chromosomes.map((chr) => (
                <Scatter
                  key={chr}
                  data={filteredData.filter(d => d.chromosome === chr)}
                  fill={getChromosomeColor(chr)}
                  opacity={0.7}
                  onClick={(data) => { // Added onClick handler
                    if (data && data.gene && onGeneClick) {
                      onGeneClick(data.gene);
                    }
                  }}
                  shape={(props) => { // Custom shape for highlighting
                    const { cx, cy, payload } = props;
                    const isHighlighted = payload.gene && payload.gene === highlightedGene;
                    return (
                      <circle
                        cx={cx}
                        cy={cy}
                        r={isHighlighted ? 6 : 4} // Larger radius for highlighted points
                        fill={isHighlighted ? "#fbbf24" : props.fill} // Yellow fill for highlighted
                        stroke={isHighlighted ? "#f59e0b" : "none"} // Orange stroke for highlighted
                        strokeWidth={isHighlighted ? 2 : 0}
                        className="cursor-pointer"
                      />
                    );
                  }}
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
                .slice(0, 5) // Display top 5 hits
                .map((hit, idx) => (
                  <div
                    key={idx}
                    className={`text-sm p-2 rounded cursor-pointer transition-colors ${
                      hit.gene && hit.gene === highlightedGene ? 'bg-amber-200 border-amber-400' : 'hover:bg-red-100'
                    }`}
                    onClick={() => hit.gene && onGeneClick && onGeneClick(hit.gene)}
                  >
                    <span className="font-mono">{hit.snp}</span> - {hit.chromosome}:{hit.position.toLocaleString()}
                    {hit.gene && (
                      <span className={`ml-2 ${hit.gene === highlightedGene ? 'text-amber-900 font-bold' : 'text-blue-600'}`}>
                        ({hit.gene})
                      </span>
                    )}
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
