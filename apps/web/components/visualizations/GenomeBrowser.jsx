import React, { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ZoomIn, ZoomOut, RotateCcw, Info } from "lucide-react";
import { apiClient } from "@genemap/shared";

export default function GenomeBrowser({ genes = [], onGeneClick }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const [hoveredGene, setHoveredGene] = useState(null);
  const [nearbyGenes, setNearbyGenes] = useState([]);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const canvasRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(0);

  const mainGene = genes[0];
  const chromosome = mainGene?.genomic_pos?.chr || mainGene?.chromosome || "1";
  const geneStart = mainGene?.genomic_pos?.start || 0;
  const geneEnd = mainGene?.genomic_pos?.end || geneStart + 50000;

  // Calculate view window
  const windowSize = Math.max(1000000, (geneEnd - geneStart) * 50 / zoomLevel);
  const viewStart = Math.max(0, geneStart - windowSize / 2 + panOffset);
  const viewEnd = viewStart + windowSize;

  useEffect(() => {
    if (mainGene) {
      fetchNearbyGenes();
    }
  }, [mainGene, viewStart, viewEnd]);

  const fetchNearbyGenes = async () => {
    if (!mainGene?.symbol) return;
    
    setIsLoadingNearby(true);
    try {
      // BACKEND_NEEDED: LLM integration needs API implementation
      // const response = await apiClient.invokeLLM({
      //   prompt: `List 8-12 real genes that are located near ${mainGene.symbol}...
      const response = { genes: [] }; // Placeholder
      /*
      response = await apiClient.invokeLLM({
        prompt: `List 8-12 real genes that are located near ${mainGene.symbol} on chromosome ${chromosome}. 
Include genes within ~1-5 Mb of position ${geneStart}.

Return as JSON array with:
- symbol: gene symbol
- start: approximate genomic start position (number)
- end: approximate genomic end position (number)
- name: full gene name
- strand: "+" or "-"

Make positions realistic for chromosome ${chromosome}. Focus on well-known genes.`,
        response_json_schema: {
          type: "object",
          properties: {
            genes: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  symbol: { type: "string" },
                  start: { type: "number" },
                  end: { type: "number" },
                  name: { type: "string" },
                  strand: { type: "string" }
                }
              }
            }
          }
        }
      });
      */

      if (response.genes) {
        setNearbyGenes(response.genes);
      }
    } catch (err) {
      console.error("Error fetching nearby genes:", err);
    } finally {
      setIsLoadingNearby(false);
    }
  };

  const handleZoomIn = () => {
    setZoomLevel(prev => Math.min(prev * 1.5, 20));
  };

  const handleZoomOut = () => {
    setZoomLevel(prev => Math.max(prev / 1.5, 0.5));
  };

  const handleReset = () => {
    setZoomLevel(1);
    setPanOffset(0);
  };

  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart(e.clientX);
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    const delta = e.clientX - dragStart;
    setPanOffset(prev => prev - (delta * windowSize / 800));
    setDragStart(e.clientX);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const positionToPixel = (position) => {
    return ((position - viewStart) / windowSize) * 800;
  };

  const handleCanvasClick = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    
    // Check if clicked on a gene
    const allGenes = [...genes, ...nearbyGenes];
    for (const gene of allGenes) {
      const start = positionToPixel(gene.genomic_pos?.start || gene.start);
      const end = positionToPixel(gene.genomic_pos?.end || gene.end);
      
      if (x >= start && x <= end) {
        onGeneClick?.(gene);
        break;
      }
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, 800, 400);

    // Draw chromosome backbone
    ctx.fillStyle = "#e2e8f0";
    ctx.fillRect(0, 180, 800, 40);

    // Draw scale
    ctx.fillStyle = "#64748b";
    ctx.font = "11px sans-serif";
    const step = windowSize / 5;
    for (let i = 0; i <= 5; i++) {
      const pos = viewStart + i * step;
      const x = i * 160;
      ctx.fillText(`${(pos / 1000000).toFixed(2)} Mb`, x, 170);
      ctx.fillRect(x, 180, 1, 10);
    }

    // Draw user-selected genes (highlighted)
    genes.forEach((gene, index) => {
      const start = positionToPixel(gene.genomic_pos?.start || gene.start || geneStart);
      const end = positionToPixel(gene.genomic_pos?.end || gene.end || geneStart + 50000);
      const width = Math.max(end - start, 3);

      const colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b"];
      const color = colors[index % colors.length];

      // Gene box
      ctx.fillStyle = color;
      ctx.fillRect(start, 240, width, 30);

      // Gene label
      ctx.fillStyle = "#1e293b";
      ctx.font = "bold 12px sans-serif";
      ctx.fillText(gene.symbol, start, 235);

      // Strand indicator
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px sans-serif";
      const strand = gene.genomic_pos?.strand || "+";
      ctx.fillText(strand, start + width / 2 - 3, 258);
    });

    // Draw nearby genes
    nearbyGenes.forEach((gene) => {
      const start = positionToPixel(gene.start);
      const end = positionToPixel(gene.end);
      
      if (start > -50 && start < 850) {
        const width = Math.max(end - start, 2);

        // Gene box
        ctx.fillStyle = hoveredGene === gene.symbol ? "#94a3b8" : "#cbd5e1";
        ctx.fillRect(start, 290, width, 20);

        // Gene label (smaller)
        if (width > 20) {
          ctx.fillStyle = "#475569";
          ctx.font = "10px sans-serif";
          ctx.fillText(gene.symbol, start + 2, 304);
        }
      }
    });

    // Draw centromere indicator
    ctx.fillStyle = "#ef4444";
    ctx.fillRect(390, 180, 20, 40);
    ctx.fillStyle = "#1e293b";
    ctx.font = "10px sans-serif";
    ctx.fillText("centromere", 360, 175);

  }, [genes, nearbyGenes, zoomLevel, panOffset, viewStart, viewEnd, hoveredGene]);

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              🧬 Interactive Genome Browser
              <Badge variant="outline">Chr {chromosome}</Badge>
            </CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Viewing {(viewStart / 1000000).toFixed(2)} - {(viewEnd / 1000000).toFixed(2)} Mb
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={handleZoomIn}>
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomOut}>
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div
            className="relative bg-white border-2 border-slate-200 rounded-lg overflow-hidden cursor-move"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <canvas
              ref={canvasRef}
              width={800}
              height={400}
              onClick={handleCanvasClick}
              onMouseMove={(e) => {
                const rect = canvasRef.current.getBoundingClientRect();
                const x = e.clientX - rect.left;
                
                // Check hover
                let found = null;
                for (const gene of nearbyGenes) {
                  const start = positionToPixel(gene.start);
                  const end = positionToPixel(gene.end);
                  if (x >= start && x <= end) {
                    found = gene.symbol;
                    break;
                  }
                }
                setHoveredGene(found);
              }}
              className="w-full"
            />
            
            {hoveredGene && (
              <div className="absolute top-2 right-2 bg-white/95 border border-slate-300 rounded-lg p-2 shadow-lg">
                <div className="flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <div>
                    <p className="font-semibold text-sm">{hoveredGene}</p>
                    <p className="text-xs text-slate-600">Click for details</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-600 rounded"></div>
              <span className="text-sm text-slate-700">Selected Genes</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-slate-300 rounded"></div>
              <span className="text-sm text-slate-700">Nearby Genes</span>
            </div>
          </div>

          <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-900">
            <p className="font-medium mb-1">💡 Interaction Tips:</p>
            <ul className="text-xs space-y-1 text-blue-800">
              <li>• Drag horizontally to pan along the chromosome</li>
              <li>• Use zoom buttons to adjust view scale</li>
              <li>• Click on any gene to view its details</li>
              <li>• Hover over genes to see their names</li>
            </ul>
          </div>

          {isLoadingNearby && (
            <div className="text-center py-2">
              <p className="text-sm text-slate-500">Loading nearby genes...</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}