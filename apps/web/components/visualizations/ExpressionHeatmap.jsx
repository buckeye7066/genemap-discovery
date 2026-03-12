import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Download, Palette, Info } from "lucide-react";
// html2canvas loaded dynamically on export
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import AskAIButtons from "../shared/AskAIButtons";

export default function ExpressionHeatmap({ genes, samples, expressionData, userEducationLevel, highlightedGene, onGeneClick }) {
  const [colorScheme, setColorScheme] = useState("blue-red");
  const [minThreshold, setMinThreshold] = useState(0); // 0-100 percentage
  const [maxThreshold, setMaxThreshold] = useState(100); // 0-100 percentage
  const heatmapRef = useRef(null);

  const colorSchemes = {
    "blue-red": {
      low: "#2563eb",
      mid: "#ffffff",
      high: "#dc2626"
    },
    "green-red": {
      low: "#16a34a",
      mid: "#ffffff",
      high: "#dc2626"
    },
    "viridis": {
      low: "#440154",
      mid: "#21918c",
      high: "#fde725"
    },
    "plasma": {
      low: "#0d0887",
      mid: "#cc4778",
      high: "#f0f921"
    }
  };

  const getColor = (value, min, max) => {
    // Handle cases where min equals max to avoid division by zero or NaN
    if (min === max) {
      return colorSchemes[colorScheme].mid; // Or any neutral color
    }
    const normalized = (value - min) / (max - min);
    const scheme = colorSchemes[colorScheme];
    
    if (normalized < 0.5) {
      return interpolateColor(scheme.low, scheme.mid, normalized * 2);
    } else {
      return interpolateColor(scheme.mid, scheme.high, (normalized - 0.5) * 2);
    }
  };

  const interpolateColor = (color1, color2, factor) => {
    const c1 = parseInt(color1.slice(1), 16);
    const c2 = parseInt(color2.slice(1), 16);
    
    const r1 = (c1 >> 16) & 0xff;
    const g1 = (c1 >> 8) & 0xff;
    const b1 = c1 & 0xff;
    
    const r2 = (c2 >> 16) & 0xff;
    const g2 = (c2 >> 8) & 0xff;
    const b2 = c2 & 0xff;
    
    const r = Math.round(r1 + (r2 - r1) * factor);
    const g = Math.round(g1 + (g2 - g1) * factor);
    const b = Math.round(b1 + (b2 - b1) * factor);
    
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  };

  // Calculate min/max across all data for consistent color scaling and legend
  const allValues = expressionData.flat();
  const minValueRaw = allValues.length > 0 ? Math.min(...allValues) : 0;
  const maxValueRaw = allValues.length > 0 ? Math.max(...allValues) : 0;

  // Convert percentage thresholds from sliders to actual expression value thresholds
  const minThresholdActual = minValueRaw + (maxValueRaw - minValueRaw) * (minThreshold / 100);
  const maxThresholdActual = minValueRaw + (maxValueRaw - minValueRaw) * (maxThreshold / 100);

  // Filter genes based on average expression within the actual thresholds
  const filteredRows = genes.map((gene, idx) => {
    const data = expressionData[idx];
    const avgExpression = data && data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;
    return {
      geneIdx: idx,
      gene: gene,
      data: data,
      avgExpression: avgExpression
    };
  }).filter(row =>
    row.avgExpression >= minThresholdActual && row.avgExpression <= maxThresholdActual
  );

  const handleExport = async () => {
    if (!heatmapRef.current) return;
    
    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(heatmapRef.current, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    const link = document.createElement('a');
    link.download = `expression-heatmap-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const getExplanation = () => {
    if (!userEducationLevel || userEducationLevel === 'high_school') {
      return "Colors show how active each gene is. Red = very active, Blue = less active.";
    }
    if (userEducationLevel === 'undergraduate') {
      return "Heatmap showing gene expression levels. Color intensity represents expression strength.";
    }
    return "Expression matrix visualization. Rows = genes, Columns = samples, Color = expression level.";
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gene Expression Heatmap</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {getExplanation()}
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={colorScheme} onValueChange={setColorScheme}>
              <SelectTrigger className="w-32">
                <Palette className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="blue-red">Blue-Red</SelectItem>
                <SelectItem value="green-red">Green-Red</SelectItem>
                <SelectItem value="viridis">Viridis</SelectItem>
                <SelectItem value="plasma">Plasma</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="w-4 h-4 mr-1" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900 text-sm">
            <strong>Interactive Heatmap:</strong> Click any gene name to highlight it across all visualizations.
            Use filters to focus on specific expression ranges.
          </AlertDescription>
        </Alert>

        {/* Filter Controls */}
        <div className="bg-slate-50 p-4 rounded border border-slate-200 space-y-3">
          <div>
            <Label className="text-sm">Expression Range Filter</Label>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Min Avg: {minThresholdActual.toFixed(2)}</Label>
                <Slider
                  value={[minThreshold]}
                  onValueChange={(v) => setMinThreshold(v[0])}
                  min={0}
                  max={100}
                  step={1}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Max Avg: {maxThresholdActual.toFixed(2)}</Label>
                <Slider
                  value={[maxThreshold]}
                  onValueChange={(v) => setMaxThreshold(v[0])}
                  min={0}
                  max={100}
                  step={1}
                  className="mt-1"
                />
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Showing {filteredRows.length} of {genes.length} genes with average expression between {minThresholdActual.toFixed(2)} and {maxThresholdActual.toFixed(2)}
          </p>
        </div>

        <div ref={heatmapRef} className="overflow-x-auto bg-white p-4 rounded border">
          <div className="min-w-max">
            {/* Header - Sample names */}
            <div className="flex">
              <div className="w-32"></div>
              {samples.map((sample, idx) => (
                <div
                  key={idx}
                  className="w-16 text-xs text-center transform -rotate-45 origin-bottom-left"
                  style={{ height: '80px' }}
                >
                  {sample}
                </div>
              ))}
            </div>

            {/* Heatmap rows */}
            {filteredRows.map(({ geneIdx, gene, data }) => (
              <div key={geneIdx} className="flex items-center">
                <div 
                  className={`w-32 text-sm font-mono font-semibold pr-2 text-right cursor-pointer transition-colors ${
                    gene === highlightedGene 
                      ? 'text-amber-600 bg-amber-100 px-2 py-1 rounded' 
                      : 'hover:text-blue-600'
                  }`}
                  onClick={() => onGeneClick && onGeneClick(gene)}
                >
                  {gene}
                </div>
                {samples.map((_, sampleIdx) => {
                  const value = data[sampleIdx];
                  const color = getColor(value, minValueRaw, maxValueRaw);
                  const isHighlighted = gene === highlightedGene;
                  
                  return (
                    <div
                      key={sampleIdx}
                      className={`w-16 h-8 border cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all ${
                        isHighlighted ? 'ring-2 ring-amber-500 border-amber-500' : 'border-slate-200'
                      }`}
                      style={{ backgroundColor: color }}
                      title={`${gene} - ${samples[sampleIdx]}: ${value.toFixed(2)}`}
                      onClick={() => onGeneClick && onGeneClick(gene)}
                    >
                      <div className="w-full h-full flex items-center justify-center text-xs text-white drop-shadow">
                        {value.toFixed(1)}
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Color scale legend */}
            <div className="mt-4 flex items-center gap-4">
              <span className="text-sm text-slate-600">Low</span>
              <div className="flex-1 h-6 rounded" style={{
                background: `linear-gradient(to right, ${colorSchemes[colorScheme].low}, ${colorSchemes[colorScheme].mid}, ${colorSchemes[colorScheme].high})`
              }}></div>
              <span className="text-sm text-slate-600">High</span>
              <div className="text-xs text-slate-500 ml-4">
                Range: {minValueRaw.toFixed(2)} - {maxValueRaw.toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* AI Explanation Buttons */}
        <AskAIButtons 
          context="expression_heatmap" 
          gene={highlightedGene}
          topic="gene expression heatmap and sample comparison"
          className="mt-4 pt-4 border-t border-slate-200"
        />
      </CardContent>
    </Card>
  );
}