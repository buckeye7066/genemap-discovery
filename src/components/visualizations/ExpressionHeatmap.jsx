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
import html2canvas from 'html2canvas';

export default function ExpressionHeatmap({ genes, samples, expressionData, userEducationLevel }) {
  const [colorScheme, setColorScheme] = useState("blue-red");
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

  const allValues = expressionData.flat();
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);

  const handleExport = async () => {
    if (!heatmapRef.current) return;
    
    const canvas = await html2canvas(heatmapRef.current, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    const link = document.createElement('a');
    link.download = `expression-heatmap-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Gene Expression Heatmap</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Expression across {genes.length} genes and {samples.length} samples
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
            <strong>Expression Heatmap:</strong> Color intensity represents gene expression levels. 
            Blue = low expression, Red = high expression. Hover over cells for exact values.
          </AlertDescription>
        </Alert>

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
            {genes.map((gene, geneIdx) => (
              <div key={geneIdx} className="flex items-center">
                <div className="w-32 text-sm font-mono font-semibold pr-2 text-right">
                  {gene}
                </div>
                {samples.map((_, sampleIdx) => {
                  const value = expressionData[geneIdx][sampleIdx];
                  const color = getColor(value, minValue, maxValue);
                  
                  return (
                    <div
                      key={sampleIdx}
                      className="w-16 h-8 border border-slate-200 cursor-pointer hover:ring-2 hover:ring-blue-500 transition-all"
                      style={{ backgroundColor: color }}
                      title={`${gene} - ${samples[sampleIdx]}: ${value.toFixed(2)}`}
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
                Range: {minValue.toFixed(2)} - {maxValue.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}