
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BarChart3,
  Plus,
  X,
  Loader2,
  Info,
  Layers,
  TrendingUp,
  Network as NetworkIcon,
  Dna,
  Target
} from "lucide-react";
import GeneExpressionChart from "../components/visualizations/GeneExpressionChart";
import ProteinDomains from "../components/visualizations/ProteinDomains";
import ProteinInteractions from "../components/visualizations/ProteinInteractions";
import ChromosomeView from "../components/visualizations/ChromosomeView";
import PhenotypeNetwork from "../components/visualizations/PhenotypeNetwork";
import ManhattanPlot from "../components/visualizations/ManhattanPlot";
import ExpressionHeatmap from "../components/visualizations/ExpressionHeatmap";
import CircosPlot from "../components/visualizations/CircosPlot";
import { PhenotypeSearchService } from "../components/search/PhenotypeSearchService";

export default function VisualizationHub() {
  const [user, setUser] = useState(null);
  const [geneInput, setGeneInput] = useState("");
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [geneData, setGeneData] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeVisualizations, setActiveVisualizations] = useState([
    'expression',
    'domains',
    'interactions',
    'chromosome',
    'phenotype',
    'manhattan',
    'heatmap',
    'circos'
  ]);
  const [overlayMode, setOverlayMode] = useState(false);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (err) {
      console.log("Not logged in");
    }
  };

  const handleAddGene = async () => {
    const gene = geneInput.trim().toUpperCase();
    if (!gene || selectedGenes.some(g => g.symbol === gene)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Fetch gene data using our search service
      const results = await PhenotypeSearchService.searchGenes(gene, false);
      
      if (results.candidateGenes && results.candidateGenes.length > 0) {
        const geneInfo = results.candidateGenes[0];
        
        setSelectedGenes(prev => [...prev, { symbol: gene, ...geneInfo }]);
        setGeneData(prev => ({
          ...prev,
          [gene]: geneInfo
        }));
        setGeneInput("");
      } else {
        setError(`Gene "${gene}" not found. Please check the symbol and try again.`);
      }
    } catch (err) {
      console.error("Error loading gene:", err);
      setError(`Failed to load gene "${gene}". Please try again.`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRemoveGene = (geneSymbol) => {
    setSelectedGenes(prev => prev.filter(g => g.symbol !== geneSymbol));
    const newGeneData = { ...geneData };
    delete newGeneData[geneSymbol];
    setGeneData(newGeneData);
  };

  const toggleVisualization = (vizType) => {
    setActiveVisualizations(prev => {
      if (prev.includes(vizType)) {
        return prev.filter(v => v !== vizType);
      } else {
        return [...prev, vizType];
      }
    });
  };

  // Generate mock GWAS data for Manhattan plot
  const generateMockGWASData = () => {
    const data = [];
    const chromosomes = ['chr1', 'chr2', 'chr3', 'chr4', 'chr5', 'chr6', 'chr7', 'chr8', 'chr9', 'chr10'];
    
    selectedGenes.forEach((gene, geneIdx) => {
      // Generate some significant hits near this gene
      for (let i = 0; i < 50; i++) {
        const position = (gene.start || 1000000) + (Math.random() - 0.5) * 10000000;
        const pvalue = Math.random() < 0.1 ? Math.random() * 1e-8 : Math.random() * 0.01;
        
        data.push({
          snp: `rs${Math.floor(Math.random() * 10000000)}`,
          chromosome: gene.chromosome || 'chr1',
          position: Math.max(0, Math.floor(position)),
          pvalue: pvalue,
          negLogP: -Math.log10(pvalue),
          gene: gene.symbol
        });
      }
    });
    
    return data.sort((a, b) => a.chromosome.localeCompare(b.chromosome) || a.position - b.position);
  };

  // Generate expression data for heatmap
  const generateExpressionMatrix = () => {
    const samples = ['Sample 1', 'Sample 2', 'Sample 3', 'Sample 4', 'Sample 5', 'Sample 6'];
    const matrix = selectedGenes.map(gene => 
      samples.map(() => Math.random() * 100)
    );
    return { samples, matrix };
  };

  const quickGenes = ["BRCA1", "BRCA2", "TP53", "CFTR", "APOE"];

  // Combine expression data for overlay comparison
  const getCombinedExpressionData = () => {
    if (selectedGenes.length === 0) return [];
    
    const tissues = new Set();
    selectedGenes.forEach(gene => {
      gene.expressionData?.forEach(e => tissues.add(e.tissue));
    });

    return Array.from(tissues).map(tissue => {
      const dataPoint = { tissue };
      selectedGenes.forEach(gene => {
        const expr = gene.expressionData?.find(e => e.tissue === tissue);
        dataPoint[gene.symbol] = expr?.expression || 0;
      });
      return dataPoint;
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <BarChart3 className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Data Visualization Hub
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Interactive dashboard for comprehensive genomic data visualization and comparison
          </p>
        </div>

        {/* Gene Selection */}
        <Card className="shadow-lg mb-8">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Dna className="w-5 h-5 text-blue-600" />
              Select Genes for Visualization
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Enter gene symbol (e.g., BRCA1, TP53)"
                value={geneInput}
                onChange={(e) => setGeneInput(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleAddGene();
                  }
                }}
                className="flex-1 min-h-[48px]"
                disabled={isLoading}
              />
              <Button
                onClick={handleAddGene}
                disabled={!geneInput.trim() || isLoading}
                className="bg-blue-600 hover:bg-blue-700 min-h-[48px]"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4 mr-2" />
                )}
                Add Gene
              </Button>
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Quick Gene Selection */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Quick Add:</p>
              <div className="flex flex-wrap gap-2">
                {quickGenes.map((gene) => (
                  <Button
                    key={gene}
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setGeneInput(gene);
                      setTimeout(() => handleAddGene(), 100);
                    }}
                    disabled={selectedGenes.some(g => g.symbol === gene) || isLoading}
                    className="min-h-[36px]"
                  >
                    {gene}
                  </Button>
                ))}
              </div>
            </div>

            {/* Selected Genes */}
            {selectedGenes.length > 0 && (
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-semibold text-blue-900">
                    Selected Genes ({selectedGenes.length})
                  </h4>
                  {selectedGenes.length > 1 && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="overlay-mode"
                        checked={overlayMode}
                        onCheckedChange={setOverlayMode}
                      />
                      <label
                        htmlFor="overlay-mode"
                        className="text-sm font-medium cursor-pointer"
                      >
                        Overlay mode
                      </label>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {selectedGenes.map((gene) => (
                    <Badge
                      key={gene.symbol}
                      className="bg-blue-600 text-white pr-1 gap-2"
                    >
                      <span>{gene.symbol}</span>
                      <button
                        onClick={() => handleRemoveGene(gene.symbol)}
                        className="ml-1 hover:bg-blue-700 rounded-full p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Visualization Controls */}
        {selectedGenes.length > 0 && (
          <Card className="shadow-lg mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-600" />
                Active Visualizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-expression"
                    checked={activeVisualizations.includes('expression')}
                    onCheckedChange={() => toggleVisualization('expression')}
                  />
                  <label htmlFor="viz-expression" className="text-sm cursor-pointer">
                    Expression
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-domains"
                    checked={activeVisualizations.includes('domains')}
                    onCheckedChange={() => toggleVisualization('domains')}
                  />
                  <label htmlFor="viz-domains" className="text-sm cursor-pointer">
                    Domains
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-interactions"
                    checked={activeVisualizations.includes('interactions')}
                    onCheckedChange={() => toggleVisualization('interactions')}
                  />
                  <label htmlFor="viz-interactions" className="text-sm cursor-pointer">
                    Interactions
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-chromosome"
                    checked={activeVisualizations.includes('chromosome')}
                    onCheckedChange={() => toggleVisualization('chromosome')}
                  />
                  <label htmlFor="viz-chromosome" className="text-sm cursor-pointer">
                    Chromosome
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-phenotype"
                    checked={activeVisualizations.includes('phenotype')}
                    onCheckedChange={() => toggleVisualization('phenotype')}
                  />
                  <label htmlFor="viz-phenotype" className="text-sm cursor-pointer">
                    Phenotype
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-manhattan"
                    checked={activeVisualizations.includes('manhattan')}
                    onCheckedChange={() => toggleVisualization('manhattan')}
                  />
                  <label htmlFor="viz-manhattan" className="text-sm cursor-pointer">
                    Manhattan
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-heatmap"
                    checked={activeVisualizations.includes('heatmap')}
                    onCheckedChange={() => toggleVisualization('heatmap')}
                  />
                  <label htmlFor="viz-heatmap" className="text-sm cursor-pointer">
                    Heatmap
                  </label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="viz-circos"
                    checked={activeVisualizations.includes('circos')}
                    onCheckedChange={() => toggleVisualization('circos')}
                  />
                  <label htmlFor="viz-circos" className="text-sm cursor-pointer">
                    Circos
                  </label>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Visualizations */}
        {selectedGenes.length === 0 ? (
          <Card className="border-2 border-dashed border-slate-200">
            <CardContent className="text-center py-16">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                No Genes Selected
              </h3>
              <p className="text-slate-500 mb-4">
                Add genes above to start visualizing and comparing genomic data
              </p>
              <Alert className="max-w-2xl mx-auto bg-blue-50 border-blue-200">
                <Info className="h-4 w-4 text-blue-600" />
                <AlertDescription className="text-blue-900 text-sm text-left">
                  <strong>Tip:</strong> Add multiple genes and enable "Overlay mode" to compare 
                  expression patterns, interaction networks, and more side-by-side!
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-8">
            {/* Gene Expression Comparison */}
            {activeVisualizations.includes('expression') && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-cyan-600" />
                  Gene Expression Comparison
                </h2>
                {overlayMode && selectedGenes.length > 1 ? (
                  <Card className="shadow-lg">
                    <CardHeader>
                      <CardTitle>Combined Expression Overlay</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Alert className="mb-4 bg-cyan-50 border-cyan-200">
                        <Info className="h-4 w-4 text-cyan-600" />
                        <AlertDescription className="text-cyan-900 text-sm">
                          Comparing expression levels across {selectedGenes.length} genes. 
                          Each color represents a different gene.
                        </AlertDescription>
                      </Alert>
                      <div className="overflow-x-auto">
                        {/* This would need a custom multi-gene expression chart */}
                        <p className="text-sm text-slate-600 py-8 text-center">
                          Overlay visualization showing {selectedGenes.map(g => g.symbol).join(', ')} 
                          expression patterns across tissues
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="grid gap-6">
                    {selectedGenes.map((gene) => (
                      gene.expressionData && gene.expressionData.length > 0 && (
                        <div key={gene.symbol}>
                          <h3 className="text-lg font-semibold text-slate-800 mb-3">
                            {gene.symbol} Expression
                          </h3>
                          <GeneExpressionChart
                            expressionData={gene.expressionData}
                            userEducationLevel={user?.education_level}
                          />
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Protein Domains */}
            {activeVisualizations.includes('domains') && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="w-6 h-6 text-indigo-600" />
                  Protein Domain Architecture
                </h2>
                <div className="grid gap-6">
                  {selectedGenes.map((gene) => (
                    <div key={gene.symbol}>
                      <h3 className="text-lg font-semibold text-slate-800 mb-3">
                        {gene.symbol} Domains
                      </h3>
                      <ProteinDomains
                        gene={gene}
                        userEducationLevel={user?.education_level}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Protein Interactions */}
            {activeVisualizations.includes('interactions') && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <NetworkIcon className="w-6 h-6 text-emerald-600" />
                  Protein Interaction Networks
                </h2>
                <div className="grid gap-6">
                  {selectedGenes.map((gene) => (
                    <div key={gene.symbol}>
                      <h3 className="text-lg font-semibold text-slate-800 mb-3">
                        {gene.symbol} Interactions
                      </h3>
                      <ProteinInteractions
                        gene={gene}
                        userEducationLevel={user?.education_level}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Chromosome View */}
            {activeVisualizations.includes('chromosome') && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Dna className="w-6 h-6 text-blue-600" />
                  Chromosomal Locations
                </h2>
                <div className="grid gap-6">
                  {selectedGenes.map((gene) => (
                    <div key={gene.symbol}>
                      <h3 className="text-lg font-semibold text-slate-800 mb-3">
                        {gene.symbol} Location
                      </h3>
                      <ChromosomeView
                        gene={gene}
                        userEducationLevel={user?.education_level}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Phenotype Networks */}
            {activeVisualizations.includes('phenotype') && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="w-6 h-6 text-purple-600" />
                  Associated Phenotypes
                </h2>
                <div className="grid gap-6">
                  {selectedGenes.map((gene) => (
                    gene.phenotypes && gene.phenotypes.length > 3 && (
                      <div key={gene.symbol}>
                        <h3 className="text-lg font-semibold text-slate-800 mb-3">
                          {gene.symbol} Phenotypes
                        </h3>
                        <PhenotypeNetwork
                          phenotypes={gene.phenotypes}
                          userEducationLevel={user?.education_level}
                        />
                      </div>
                    )
                  ))}
                </div>
              </div>
            )}

            {/* Manhattan Plot */}
            {activeVisualizations.includes('manhattan') && selectedGenes.length > 0 && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <TrendingUp className="w-6 h-6 text-red-600" />
                  Manhattan Plot - GWAS Visualization
                </h2>
                <ManhattanPlot
                  gwasData={generateMockGWASData()}
                  userEducationLevel={user?.education_level}
                />
              </div>
            )}

            {/* Expression Heatmap */}
            {activeVisualizations.includes('heatmap') && selectedGenes.length >= 2 && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <BarChart3 className="w-6 h-6 text-purple-600" />
                  Expression Heatmap - Multi-Sample Analysis
                </h2>
                {(() => {
                  const { samples, matrix } = generateExpressionMatrix();
                  return (
                    <ExpressionHeatmap
                      genes={selectedGenes.map(g => g.symbol)}
                      samples={samples}
                      expressionData={matrix}
                      userEducationLevel={user?.education_level}
                    />
                  );
                })()}
              </div>
            )}

            {/* Circos Plot */}
            {activeVisualizations.includes('circos') && selectedGenes.length >= 2 && (
              <div>
                <h2 className="text-2xl font-bold text-slate-900 mb-4 flex items-center gap-2">
                  <Target className="w-6 h-6 text-pink-600" />
                  Circos Plot - Genomic Overview
                </h2>
                <CircosPlot
                  genes={selectedGenes}
                  userEducationLevel={user?.education_level}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
