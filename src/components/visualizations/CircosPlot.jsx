import React, { useState, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, Info } from "lucide-react";
import html2canvas from 'html2canvas';

export default function CircosPlot({ genes, userEducationLevel }) {
  const circosRef = useRef(null);
  const [hoveredGene, setHoveredGene] = useState(null);

  // Chromosome lengths (approximate, in Mb)
  const chromosomeLengths = {
    'chr1': 249, 'chr2': 243, 'chr3': 198, 'chr4': 191, 'chr5': 181,
    'chr6': 171, 'chr7': 159, 'chr8': 146, 'chr9': 141, 'chr10': 136,
    'chr11': 135, 'chr12': 134, 'chr13': 115, 'chr14': 107, 'chr15': 102,
    'chr16': 90, 'chr17': 83, 'chr18': 80, 'chr19': 59, 'chr20': 63,
    'chr21': 48, 'chr22': 51, 'chrX': 155, 'chrY': 59
  };

  const chromosomes = Object.keys(chromosomeLengths);
  const totalLength = Object.values(chromosomeLengths).reduce((a, b) => a + b, 0);

  // Calculate positions
  const getArcPosition = (chr, position) => {
    const chrIndex = chromosomes.indexOf(chr);
    const startAngle = chromosomes
      .slice(0, chrIndex)
      .reduce((sum, c) => sum + (chromosomeLengths[c] / totalLength) * 360, 0);
    const chrAngle = (chromosomeLengths[chr] / totalLength) * 360;
    const positionAngle = (position / chromosomeLengths[chr]) * chrAngle;
    return startAngle + positionAngle;
  };

  const polarToCartesian = (angle, radius, centerX = 300, centerY = 300) => {
    const radians = (angle - 90) * (Math.PI / 180);
    return {
      x: centerX + radius * Math.cos(radians),
      y: centerY + radius * Math.sin(radians)
    };
  };

  const handleExport = async () => {
    if (!circosRef.current) return;
    
    const canvas = await html2canvas(circosRef.current, {
      scale: 2,
      backgroundColor: '#ffffff'
    });
    
    const link = document.createElement('a');
    link.download = `circos-plot-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const outerRadius = 280;
  const innerRadius = 220;
  const centerX = 300;
  const centerY = 300;

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Circos Plot - Genomic Overview</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Circular visualization of {genes.length} genes across chromosomes
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" />
            Export
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-blue-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900 text-sm">
            <strong>Circos Plot:</strong> Circular genome visualization showing gene locations 
            across chromosomes. Lines connect related genes. Hover for details.
          </AlertDescription>
        </Alert>

        <div ref={circosRef} className="flex justify-center bg-white p-4 rounded border">
          <svg width="600" height="600" viewBox="0 0 600 600">
            {/* Chromosome arcs */}
            {chromosomes.map((chr, idx) => {
              const startAngle = chromosomes
                .slice(0, idx)
                .reduce((sum, c) => sum + (chromosomeLengths[c] / totalLength) * 360, 0);
              const endAngle = startAngle + (chromosomeLengths[chr] / totalLength) * 360;
              
              const start = polarToCartesian(startAngle, outerRadius, centerX, centerY);
              const end = polarToCartesian(endAngle, outerRadius, centerX, centerY);
              const innerStart = polarToCartesian(startAngle, innerRadius, centerX, centerY);
              const innerEnd = polarToCartesian(endAngle, innerRadius, centerX, centerY);
              
              const largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
              
              return (
                <g key={chr}>
                  {/* Chromosome arc */}
                  <path
                    d={`M ${start.x} ${start.y} 
                        A ${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${end.x} ${end.y}
                        L ${innerEnd.x} ${innerEnd.y}
                        A ${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}
                        Z`}
                    fill={idx % 2 === 0 ? "#e2e8f0" : "#cbd5e1"}
                    stroke="#94a3b8"
                    strokeWidth="1"
                  />
                  
                  {/* Chromosome label */}
                  <text
                    x={polarToCartesian((startAngle + endAngle) / 2, outerRadius + 20, centerX, centerY).x}
                    y={polarToCartesian((startAngle + endAngle) / 2, outerRadius + 20, centerX, centerY).y}
                    textAnchor="middle"
                    fontSize="10"
                    fill="#475569"
                  >
                    {chr.replace('chr', '')}
                  </text>
                </g>
              );
            })}

            {/* Gene markers */}
            {genes.map((gene, idx) => {
              if (!gene.chromosome || !gene.start) return null;
              
              const angle = getArcPosition(gene.chromosome, gene.start / 1000000);
              const pos = polarToCartesian(angle, (outerRadius + innerRadius) / 2, centerX, centerY);
              
              return (
                <circle
                  key={idx}
                  cx={pos.x}
                  cy={pos.y}
                  r="4"
                  fill="#3b82f6"
                  stroke="#1e40af"
                  strokeWidth="1"
                  className="cursor-pointer hover:r-6 transition-all"
                  onMouseEnter={() => setHoveredGene(gene)}
                  onMouseLeave={() => setHoveredGene(null)}
                >
                  <title>{gene.symbol} - {gene.chromosome}:{gene.start}</title>
                </circle>
              );
            })}

            {/* Gene connections (if multiple genes) */}
            {genes.length > 1 && genes.map((gene1, i) => 
              genes.slice(i + 1).map((gene2, j) => {
                if (!gene1.chromosome || !gene2.chromosome) return null;
                
                const angle1 = getArcPosition(gene1.chromosome, gene1.start / 1000000);
                const angle2 = getArcPosition(gene2.chromosome, gene2.start / 1000000);
                
                const pos1 = polarToCartesian(angle1, innerRadius - 20, centerX, centerY);
                const pos2 = polarToCartesian(angle2, innerRadius - 20, centerX, centerY);
                
                return (
                  <path
                    key={`${i}-${j}`}
                    d={`M ${pos1.x} ${pos1.y} Q ${centerX} ${centerY} ${pos2.x} ${pos2.y}`}
                    stroke="#3b82f6"
                    strokeWidth="1"
                    fill="none"
                    opacity="0.3"
                  />
                );
              })
            )}

            {/* Center label */}
            <text
              x={centerX}
              y={centerY}
              textAnchor="middle"
              fontSize="16"
              fontWeight="bold"
              fill="#1e293b"
            >
              Genome
            </text>
            <text
              x={centerX}
              y={centerY + 20}
              textAnchor="middle"
              fontSize="12"
              fill="#64748b"
            >
              {genes.length} genes
            </text>
          </svg>
        </div>

        {hoveredGene && (
          <div className="bg-blue-50 p-3 rounded border border-blue-200">
            <p className="font-semibold text-blue-900">{hoveredGene.symbol}</p>
            <p className="text-sm text-blue-800">
              {hoveredGene.chromosome}:{hoveredGene.start?.toLocaleString()}-{hoveredGene.end?.toLocaleString()}
            </p>
            {hoveredGene.name && (
              <p className="text-xs text-slate-600 mt-1">{hoveredGene.name}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}