import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Activity, ZoomIn, ZoomOut, RotateCcw, Filter, Info } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  Legend
} from "recharts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#ef4444'];

export default function GeneExpressionChart({ expressionData, userEducationLevel }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedTissues, setSelectedTissues] = useState(
    expressionData.map(d => d.tissue)
  );
  const [sortOrder, setSortOrder] = useState('default'); // 'default', 'asc', 'desc'
  const [highlightedTissue, setHighlightedTissue] = useState(null);

  const isSimplified = userEducationLevel === 'high_school';

  const simplifyTissueName = (tissue) => {
    const simplifications = {
      'brain': 'Brain',
      'heart': 'Heart',
      'liver': 'Liver',
      'kidney': 'Kidney',
      'muscle': 'Muscle',
      'lung': 'Lung',
      'blood': 'Blood',
      'skin': 'Skin'
    };
    const lower = tissue.toLowerCase();
    for (const [key, value] of Object.entries(simplifications)) {
      if (lower.includes(key)) return value;
    }
    return tissue;
  };

  const getExplanationText = () => {
    if (isSimplified) {
      return "This chart shows how active this gene is in different parts of your body. Taller bars mean more activity.";
    }
    return "Gene expression levels (TPM - Transcripts Per Million) across human tissues. Higher values indicate greater transcriptional activity.";
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev + 0.2, 2));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev - 0.2, 0.5));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
  };

  const handleSortChange = (order) => {
    setSortOrder(order);
  };

  const toggleTissue = (tissue) => {
    setSelectedTissues(prev => {
      if (prev.includes(tissue)) {
        return prev.filter(t => t !== tissue);
      } else {
        return [...prev, tissue];
      }
    });
  };

  const selectAllTissues = () => {
    setSelectedTissues(expressionData.map(d => d.tissue));
  };

  const clearAllTissues = () => {
    setSelectedTissues([]);
  };

  // Process and sort data
  let processedData = expressionData
    .filter(d => selectedTissues.includes(d.tissue))
    .map(d => ({
      ...d,
      displayName: isSimplified ? simplifyTissueName(d.tissue) : d.tissue
    }));

  if (sortOrder === 'asc') {
    processedData = [...processedData].sort((a, b) => a.expression - b.expression);
  } else if (sortOrder === 'desc') {
    processedData = [...processedData].sort((a, b) => b.expression - a.expression);
  }

  const CustomTooltip = ({ active, payload }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border-2 border-blue-200 rounded-lg shadow-lg p-3">
          <p className="font-semibold text-slate-900 mb-1">{data.displayName}</p>
          <p className="text-sm text-blue-600 font-medium">
            Expression: {data.expression.toFixed(2)} TPM
          </p>
          {!isSimplified && (
            <p className="text-xs text-slate-500 mt-1">
              Transcripts Per Million
            </p>
          )}
        </div>
      );
    }
    return null;
  };

  const CustomYAxisTick = ({ x, y, payload }) => {
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={4}
          textAnchor="end"
          fill="#475569"
          fontSize={11 * zoomLevel}
          className="select-none"
        >
          {isSimplified ? Math.round(payload.value) : payload.value}
        </text>
      </g>
    );
  };

  const CustomXAxisTick = ({ x, y, payload }) => {
    const isHighlighted = highlightedTissue === payload.value;
    return (
      <g transform={`translate(${x},${y})`}>
        <text
          x={0}
          y={0}
          dy={16}
          textAnchor="end"
          fill={isHighlighted ? "#3b82f6" : "#475569"}
          fontSize={10 * zoomLevel}
          fontWeight={isHighlighted ? 600 : 400}
          transform="rotate(-45)"
          className="cursor-pointer select-none"
          onMouseEnter={() => setHighlightedTissue(payload.value)}
          onMouseLeave={() => setHighlightedTissue(null)}
        >
          {payload.value}
        </text>
      </g>
    );
  };

  return (
    <Card className="shadow-md hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-600" />
            <CardTitle className="text-lg">Gene Expression Levels</CardTitle>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Filter Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Filter className="w-4 h-4" />
                  Filter ({selectedTissues.length}/{expressionData.length})
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm">Select Tissues</h4>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllTissues}
                        className="text-xs h-7 px-2"
                      >
                        All
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={clearAllTissues}
                        className="text-xs h-7 px-2"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {expressionData.map((d) => (
                      <div key={d.tissue} className="flex items-center space-x-2">
                        <Checkbox
                          id={d.tissue}
                          checked={selectedTissues.includes(d.tissue)}
                          onCheckedChange={() => toggleTissue(d.tissue)}
                        />
                        <label
                          htmlFor={d.tissue}
                          className="text-sm cursor-pointer flex-1"
                        >
                          {isSimplified ? simplifyTissueName(d.tissue) : d.tissue}
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            {/* Sort Options */}
            <div className="flex gap-1 border rounded-md p-1">
              <Button
                variant={sortOrder === 'default' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleSortChange('default')}
                className="text-xs h-7 px-2"
              >
                Default
              </Button>
              <Button
                variant={sortOrder === 'desc' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleSortChange('desc')}
                className="text-xs h-7 px-2"
              >
                High→Low
              </Button>
              <Button
                variant={sortOrder === 'asc' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleSortChange('asc')}
                className="text-xs h-7 px-2"
              >
                Low→High
              </Button>
            </div>

            {/* Zoom Controls */}
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
                  <h4 className="font-semibold text-sm">How to Use</h4>
                  <ul className="text-xs space-y-1 text-slate-600">
                    <li>• Hover over bars for detailed values</li>
                    <li>• Use zoom controls to adjust view</li>
                    <li>• Filter tissues to focus on specific organs</li>
                    <li>• Sort data by expression level</li>
                    <li>• Colors indicate different tissues</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">
            {getExplanationText()}
          </Badge>
        </div>

        {selectedTissues.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Filter className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No tissues selected. Use the filter to select tissues.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={Math.max(300, 300 * zoomLevel)}>
              <BarChart
                data={processedData}
                margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="displayName"
                  tick={<CustomXAxisTick />}
                  interval={0}
                  height={80}
                />
                <YAxis
                  label={{
                    value: isSimplified ? 'Activity Level' : 'TPM (Expression)',
                    angle: -90,
                    position: 'insideLeft',
                    style: { fontSize: 11 * zoomLevel, fill: '#475569' }
                  }}
                  tick={<CustomYAxisTick />}
                />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
                <Bar
                  dataKey="expression"
                  radius={[8, 8, 0, 0]}
                  animationDuration={800}
                  animationBegin={0}
                >
                  {processedData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                      opacity={highlightedTissue === entry.displayName ? 1 : 0.8}
                      className="transition-opacity duration-200"
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="mt-4 text-xs text-slate-500 text-center">
          Zoom: {Math.round(zoomLevel * 100)}% | Showing {processedData.length} of {expressionData.length} tissues
        </div>
      </CardContent>
    </Card>
  );
}