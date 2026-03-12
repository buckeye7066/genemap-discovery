import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Activity, ZoomIn, ZoomOut, RotateCcw, Filter, Info, SortAsc, SortDesc } from "lucide-react";
import AskAIButtons from "../shared/AskAIButtons";
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
import { Alert, AlertDescription } from "@/components/ui/alert"; // Added Alert imports

const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#6366f1', '#ef4444'];

const TISSUE_SIMPLIFICATIONS = {
  'brain': 'Brain',
  'heart': 'Heart',
  'liver': 'Liver',
  'kidney': 'Kidney',
  'muscle': 'Muscle',
  'lung': 'Lung',
  'blood': 'Blood',
  'skin': 'Skin'
};

function ExpressionTooltip({ active, payload, isSimplified }) {
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
}

function ExpressionXAxisTick({ x, y, payload, highlightedTissue, onHighlight, zoomLevel }) {
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
        onMouseEnter={() => onHighlight(payload.value)}
        onMouseLeave={() => onHighlight(null)}
      >
        {payload.value}
      </text>
    </g>
  );
}

export default function GeneExpressionChart({ expressionData, userEducationLevel, highlightedGene, onGeneClick, geneSymbol }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [selectedTissues, setSelectedTissues] = useState([]); // Initialized as empty as per outline
  const [sortBy, setSortBy] = useState("value"); // Changed from sortOrder to sortBy, default to "value"
  const [highlightedTissue, setHighlightedTissue] = useState(null); // Added missing state

  // useEffect to initialize selectedTissues with all tissues when expressionData is available
  // This ensures that when the component first mounts or expressionData changes, all tissues are selected by default.
  useEffect(() => {
    if (expressionData && expressionData.length > 0 && selectedTissues.length === 0) {
      setSelectedTissues(expressionData.map(d => d.tissue));
    }
  }, [expressionData]); // Removed selectedTissues.length from dependency array to avoid infinite loop

  const isSimplified = userEducationLevel === 'high_school';

  const simplifyTissueName = (tissue) => {
    const lower = tissue.toLowerCase();
    for (const [key, value] of Object.entries(TISSUE_SIMPLIFICATIONS)) {
      if (lower.includes(key)) return value;
    }
    return tissue;
  };

  const getExplanationText = () => { // Renamed from getExplanation() to match existing function
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

  // Modified handler for new sortBy state
  const handleSortChange = (order) => {
    setSortBy(order);
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

  const sortedData = useMemo(() => {
    let data = expressionData
      .filter(d => selectedTissues.length === 0 || selectedTissues.includes(d.tissue))
      .map(d => ({
        ...d,
        displayName: isSimplified ? simplifyTissueName(d.tissue) : d.tissue
      }));

    if (sortBy === 'value') {
      data = [...data].sort((a, b) => b.expression - a.expression);
    } else if (sortBy === 'alphabetical') {
      data = [...data].sort((a, b) => a.tissue.localeCompare(b.tissue));
    }

    return data;
  }, [expressionData, selectedTissues, sortBy, isSimplified]);

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

  const isHighlighted = geneSymbol === highlightedGene;

  return (
    <Card className={`shadow-md hover:shadow-lg transition-shadow ${isHighlighted ? 'ring-2 ring-amber-500 bg-amber-50/30' : ''}`}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div
            className={`flex items-center gap-2 cursor-pointer ${isHighlighted ? 'text-amber-900' : ''}`}
            onClick={() => onGeneClick && onGeneClick(geneSymbol)}
          >
            <Activity className="w-5 h-5 text-cyan-600" />
            <CardTitle className="text-lg flex items-center gap-2">
              {geneSymbol && <span className="text-blue-600">{geneSymbol}</span>} Gene Expression
              {isHighlighted && (
                <Badge className="bg-amber-600 text-white text-xs">Highlighted</Badge>
              )}
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              {getExplanationText()}
            </p>
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

            {/* Sort Options (updated for new sortBy states) */}
            <div className="flex gap-1 border rounded-md p-1">
              <Button
                variant={sortBy === 'value' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleSortChange('value')}
                className="text-xs h-7 px-2"
              >
                High→Low
              </Button>
              <Button
                variant={sortBy === 'alphabetical' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => handleSortChange('alphabetical')}
                className="text-xs h-7 px-2"
              >
                A→Z
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
                    <li>• Sort data by expression level or alphabetically</li>
                    <li>• Colors indicate different tissues</li>
                    <li>• Click on a gene symbol to highlight it across all charts</li>
                  </ul>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isHighlighted && (
          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm">
              This gene is highlighted across all visualizations. Click another gene to change selection.
            </AlertDescription>
          </Alert>
        )}

        <div className="mb-4">
          <Badge variant="outline" className="text-xs bg-cyan-50 text-cyan-700 border-cyan-200">
            {getExplanationText()}
          </Badge>
        </div>

        {selectedTissues.length === 0 ? (
          <div className="text-center py-12 text-slate-500">
            <Filter className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p className="text-sm">No tissues selected. Use the filter to select tissues.</p>
            <Button
              variant="link"
              onClick={selectAllTissues}
              className="mt-2"
            >
              Select All Tissues
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <ResponsiveContainer width="100%" height={Math.max(300, 300 * zoomLevel)}>
              <BarChart
                data={sortedData} // Changed to sortedData
                margin={{ top: 20, right: 30, left: 20, bottom: 80 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="displayName"
                  tick={<ExpressionXAxisTick highlightedTissue={highlightedTissue} onHighlight={setHighlightedTissue} zoomLevel={zoomLevel} />}
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
                <Tooltip content={<ExpressionTooltip isSimplified={isSimplified} />} cursor={{ fill: 'rgba(59, 130, 246, 0.1)' }} />
                <Bar
                  dataKey="expression"
                  radius={[8, 8, 0, 0]}
                  animationDuration={800}
                  animationBegin={0}
                >
                  {sortedData.map((entry, index) => ( // Changed to sortedData
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
          Zoom: {Math.round(zoomLevel * 100)}% | Showing {sortedData.length} of {expressionData.length} tissues
        </div>

        {/* AI Explanation Buttons */}
        <AskAIButtons 
          context="gene_expression" 
          gene={geneSymbol}
          topic={`${geneSymbol} tissue expression patterns`}
          className="mt-4 pt-4 border-t border-slate-200"
        />
      </CardContent>
    </Card>
  );
}