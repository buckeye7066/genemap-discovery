import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Network,
  Activity,
  Boxes,
  HeartPulse,
  Download,
  RotateCcw,
  ExternalLink,
  TrendingUp,
  Sparkles
} from "lucide-react";
import ReactMarkdown from "react-markdown";

export default function EnrichmentResults({ data, geneList, onReset, userEducationLevel = "general" }) {
  const [activeTab, setActiveTab] = useState("summary");

  const exportResults = () => {
    const exportData = {
      inputGenes: geneList,
      analysisDate: new Date().toISOString(),
      results: data
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gsea_results_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getSignificanceColor = (pValue) => {
    if (pValue < 0.001) return "bg-red-50 text-red-700 border-red-200";
    if (pValue < 0.01) return "bg-orange-50 text-orange-700 border-orange-200";
    if (pValue < 0.05) return "bg-yellow-50 text-yellow-700 border-yellow-200";
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Analysis Results</h2>
          <p className="text-sm text-slate-600">
            {geneList.length} genes analyzed
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={exportResults}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="outline" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4 mr-2" />
            New Analysis
          </Button>
        </div>
      </div>

      {/* Summary Card */}
      {data.summary && (
        <Card className="shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-600" />
              Key Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {data.summary.mainFunctions && data.summary.mainFunctions.length > 0 && (
              <div>
                <h4 className="font-semibold text-indigo-900 mb-2">Main Functions:</h4>
                <div className="flex flex-wrap gap-2">
                  {data.summary.mainFunctions.map((func, idx) => (
                    <Badge key={idx} className="bg-indigo-600 text-white">
                      {func}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            
            {data.summary.biologicalContext && (
              <div>
                <h4 className="font-semibold text-indigo-900 mb-2">Biological Context:</h4>
                <p className="text-indigo-800 text-sm leading-relaxed">
                  {data.summary.biologicalContext}
                </p>
              </div>
            )}

            {data.summary.clinicalRelevance && (
              <div>
                <h4 className="font-semibold text-indigo-900 mb-2">Clinical Relevance:</h4>
                <p className="text-indigo-800 text-sm leading-relaxed">
                  {data.summary.clinicalRelevance}
                </p>
              </div>
            )}

            {data.summary.novelInsights && (
              <Alert className="bg-purple-100 border-purple-300">
                <TrendingUp className="h-4 w-4 text-purple-700" />
                <AlertDescription className="text-purple-900">
                  <strong>Novel Insights:</strong> {data.summary.novelInsights}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabbed Results */}
      <Card className="shadow-lg">
        <CardContent className="pt-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="pathways">
                <Network className="w-4 h-4 mr-2" />
                Pathways
              </TabsTrigger>
              <TabsTrigger value="go">
                <Boxes className="w-4 h-4 mr-2" />
                GO Terms
              </TabsTrigger>
              <TabsTrigger value="diseases">
                <HeartPulse className="w-4 h-4 mr-2" />
                Diseases
              </TabsTrigger>
              <TabsTrigger value="interactions">
                <Activity className="w-4 h-4 mr-2" />
                Interactions
              </TabsTrigger>
            </TabsList>

            {/* Pathways Tab */}
            <TabsContent value="pathways" className="space-y-4 mt-6">
              <h3 className="font-semibold text-slate-900 text-lg">
                Enriched Pathways ({data.pathways?.length || 0})
              </h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {data.pathways?.map((pathway, idx) => (
                  <div
                    key={idx}
                    className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-semibold text-slate-900">{pathway.name}</h4>
                          <Badge variant="outline" className="text-xs">
                            {pathway.database}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600">{pathway.description}</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                      <Badge variant="outline" className="text-xs">
                        {pathway.geneCount}/{pathway.totalGenes} genes
                      </Badge>
                      <Badge 
                        variant="outline" 
                        className={`text-xs ${getSignificanceColor(pathway.adjustedPValue)}`}
                      >
                        p = {pathway.adjustedPValue?.toExponential(2)}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        Score: {pathway.enrichmentScore?.toFixed(2)}
                      </Badge>
                    </div>
                    
                    {pathway.genes && pathway.genes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-medium text-slate-700 mb-2">Genes:</p>
                        <div className="flex flex-wrap gap-1">
                          {pathway.genes.map((gene, i) => (
                            <Badge key={i} variant="outline" className="text-xs font-mono">
                              {gene}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {(!data.pathways || data.pathways.length === 0) && (
                  <Alert>
                    <AlertDescription>No significant pathway enrichment found</AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            {/* GO Terms Tab */}
            <TabsContent value="go" className="space-y-6 mt-6">
              {/* Biological Process */}
              {data.goTerms?.biologicalProcess && data.goTerms.biologicalProcess.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                    Biological Process ({data.goTerms.biologicalProcess.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.goTerms.biologicalProcess.slice(0, 10).map((term, idx) => (
                      <div key={idx} className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-blue-900 text-sm">{term.term}</p>
                            <p className="text-xs text-blue-700 mt-1">{term.description}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${getSignificanceColor(term.pValue)}`}>
                            p = {term.pValue?.toExponential(2)}
                          </Badge>
                        </div>
                        {term.genes && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {term.genes.map((gene, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-white">
                                {gene}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Molecular Function */}
              {data.goTerms?.molecularFunction && data.goTerms.molecularFunction.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-green-500"></div>
                    Molecular Function ({data.goTerms.molecularFunction.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.goTerms.molecularFunction.slice(0, 10).map((term, idx) => (
                      <div key={idx} className="p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-green-900 text-sm">{term.term}</p>
                            <p className="text-xs text-green-700 mt-1">{term.description}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${getSignificanceColor(term.pValue)}`}>
                            p = {term.pValue?.toExponential(2)}
                          </Badge>
                        </div>
                        {term.genes && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {term.genes.map((gene, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-white">
                                {gene}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Cellular Component */}
              {data.goTerms?.cellularComponent && data.goTerms.cellularComponent.length > 0 && (
                <div>
                  <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                    Cellular Component ({data.goTerms.cellularComponent.length})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.goTerms.cellularComponent.slice(0, 10).map((term, idx) => (
                      <div key={idx} className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-purple-900 text-sm">{term.term}</p>
                            <p className="text-xs text-purple-700 mt-1">{term.description}</p>
                          </div>
                          <Badge variant="outline" className={`text-xs ${getSignificanceColor(term.pValue)}`}>
                            p = {term.pValue?.toExponential(2)}
                          </Badge>
                        </div>
                        {term.genes && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {term.genes.map((gene, i) => (
                              <Badge key={i} variant="outline" className="text-xs bg-white">
                                {gene}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Diseases Tab */}
            <TabsContent value="diseases" className="space-y-4 mt-6">
              <h3 className="font-semibold text-slate-900 text-lg">
                Associated Diseases ({data.diseases?.length || 0})
              </h3>
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {data.diseases?.map((disease, idx) => (
                  <div
                    key={idx}
                    className="p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <h4 className="font-semibold text-slate-900">{disease.name}</h4>
                      <Badge
                        className={
                          disease.association === "Strong"
                            ? "bg-red-100 text-red-800"
                            : disease.association === "Moderate"
                            ? "bg-orange-100 text-orange-800"
                            : "bg-yellow-100 text-yellow-800"
                        }
                      >
                        {disease.association}
                      </Badge>
                    </div>
                    
                    <p className="text-sm text-slate-700 mb-3">{disease.evidence}</p>
                    
                    <div className="flex flex-wrap gap-2">
                      {disease.databases?.map((db, i) => (
                        <Badge key={i} variant="outline" className="text-xs">
                          {db}
                        </Badge>
                      ))}
                    </div>
                    
                    {disease.genes && disease.genes.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-200">
                        <p className="text-xs font-medium text-slate-700 mb-2">
                          Associated Genes ({disease.genes.length}):
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {disease.genes.map((gene, i) => (
                            <Badge key={i} variant="secondary" className="text-xs font-mono">
                              {gene}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
                
                {(!data.diseases || data.diseases.length === 0) && (
                  <Alert>
                    <AlertDescription>No significant disease associations found</AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>

            {/* Interactions Tab */}
            <TabsContent value="interactions" className="space-y-4 mt-6">
              <h3 className="font-semibold text-slate-900 text-lg">
                Gene Interactions ({data.geneInteractions?.length || 0})
              </h3>
              <div className="space-y-2 max-h-[600px] overflow-y-auto">
                {data.geneInteractions?.map((interaction, idx) => (
                  <div
                    key={idx}
                    className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="font-mono">
                          {interaction.gene1}
                        </Badge>
                        <span className="text-slate-400">↔</span>
                        <Badge variant="secondary" className="font-mono">
                          {interaction.gene2}
                        </Badge>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="text-xs capitalize">
                          {interaction.interactionType}
                        </Badge>
                        <Badge
                          className={
                            interaction.confidence === "high"
                              ? "bg-green-100 text-green-800"
                              : interaction.confidence === "medium"
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-slate-100 text-slate-800"
                          }
                        >
                          {interaction.confidence}
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
                
                {(!data.geneInteractions || data.geneInteractions.length === 0) && (
                  <Alert>
                    <AlertDescription>No gene interactions identified</AlertDescription>
                  </Alert>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}