
import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import DnaIcon from "../icons/DnaIcon";
import { 
  X, 
  MapPin, 
  Tag, 
  ExternalLink,
  Lightbulb,
  CheckCircle,
  ArrowLeft,
  GitCompare,
  BarChart3
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

export default function GeneComparison({ genes, onClose, isPremium }) {
  // Prepare data for comparative expression chart
  const prepareExpressionComparison = () => {
    if (!genes.some(g => g.expressionData && g.expressionData.length > 0)) {
      return null;
    }

    // Get all unique tissues
    const allTissues = new Set();
    genes.forEach(gene => {
      if (gene.expressionData) {
        gene.expressionData.forEach(exp => allTissues.add(exp.tissue));
      }
    });

    // Build comparison data
    const comparisonData = Array.from(allTissues).slice(0, 8).map(tissue => {
      const dataPoint = { tissue };
      genes.forEach(gene => {
        const tissueExp = gene.expressionData?.find(e => e.tissue === tissue);
        dataPoint[gene.symbol] = tissueExp ? tissueExp.expression : 0;
      });
      return dataPoint;
    });

    return comparisonData;
  };

  const expressionComparisonData = prepareExpressionComparison();

  const GENE_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-white shadow-lg">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={onClose}
                className="hover:bg-slate-100"
              >
                <ArrowLeft className="w-5 h-5" />
              </Button>
              <div>
                <CardTitle className="text-2xl text-slate-900 flex items-center gap-2">
                  <GitCompare className="w-6 h-6 text-blue-600" />
                  Gene Comparison
                </CardTitle>
                <p className="text-slate-600 mt-1">
                  Comparing {genes.length} candidate genes
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              onClick={onClose}
              className="gap-2"
            >
              <X className="w-4 h-4" />
              Close
            </Button>
          </div>
        </CardHeader>
      </Card>

      {/* Expression Comparison Chart */}
      {expressionComparisonData && (
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="w-6 h-6 text-green-600" />
              Expression Level Comparison
            </CardTitle>
            <p className="text-sm text-slate-600">Compare gene expression across tissues</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={expressionComparisonData} margin={{ top: 10, right: 30, left: 0, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis 
                  dataKey="tissue" 
                  angle={-45} 
                  textAnchor="end" 
                  height={100}
                  tick={{ fontSize: 11 }}
                />
                <YAxis 
                  label={{ 
                    value: 'Expression (TPM)', 
                    angle: -90, 
                    position: 'insideLeft',
                    style: { fontSize: 12 }
                  }}
                  tick={{ fontSize: 11 }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'white', 
                    border: '1px solid #e2e8f0',
                    borderRadius: '8px'
                  }}
                />
                <Legend wrapperStyle={{ paddingTop: '20px' }} />
                {genes.map((gene, idx) => (
                  <Bar 
                    key={gene.symbol} 
                    dataKey={gene.symbol} 
                    fill={GENE_COLORS[idx % GENE_COLORS.length]}
                    radius={[4, 4, 0, 0]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-4 text-xs text-slate-600 bg-white/50 rounded p-3">
              <p><strong>💡 Interpretation:</strong> Higher bars indicate stronger gene activity in that tissue. 
              Compare patterns to see if genes have similar or different expression profiles.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Comparison Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {genes.map((gene, index) => (
          <Card key={gene.symbol} className="shadow-lg hover:shadow-xl transition-shadow">
            <CardHeader className="bg-gradient-to-br from-blue-50 to-indigo-50">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center text-xl font-bold text-white">
                    {index + 1}
                  </div>
                  <div>
                    <CardTitle className="text-xl text-slate-900 flex items-center gap-2">
                      <DnaIcon className="w-5 h-5 text-blue-600" />
                      {gene.symbol}
                    </CardTitle>
                    <Badge className="mt-2">
                      {Math.round(gene.score * 100)}% confidence
                    </Badge>
                  </div>
                </div>
              </div>
              <p className="text-slate-700 text-sm mt-3">{gene.name}</p>
            </CardHeader>

            <CardContent className="pt-6 space-y-4">
              {/* Location */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <MapPin className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-900 text-sm">Genomic Location</h4>
                </div>
                <p className="text-sm text-slate-700 ml-6">
                  Chr {gene.chromosome}: {gene.start?.toLocaleString()}-{gene.end?.toLocaleString()}
                </p>
                <Badge variant="outline" className="text-xs ml-6 mt-1">
                  {gene.genomeBuild}
                </Badge>
              </div>

              <Separator />

              {/* Associated Phenotypes */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Tag className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-900 text-sm">Associated Phenotypes</h4>
                </div>
                <div className="flex flex-wrap gap-1 ml-6">
                  {gene.phenotypes?.slice(0, 3).map((phenotype, idx) => (
                    <Badge key={idx} variant="secondary" className="text-xs">
                      {phenotype.name}
                    </Badge>
                  ))}
                  {gene.phenotypes?.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{gene.phenotypes.length - 3} more
                    </Badge>
                  )}
                </div>
              </div>

              <Separator />

              {/* IDs */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ExternalLink className="w-4 h-4 text-slate-500" />
                  <h4 className="font-semibold text-slate-900 text-sm">Database IDs</h4>
                </div>
                <div className="text-xs text-slate-600 ml-6 space-y-1">
                  {gene.entrezId && <p>Entrez: {gene.entrezId}</p>}
                  {gene.ensemblId && <p>Ensembl: {gene.ensemblId}</p>}
                </div>
              </div>

              <Separator />

              {/* Key Takeaways */}
              {gene.keyTakeaways && gene.keyTakeaways.length > 0 && (
                <>
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Lightbulb className="w-4 h-4 text-blue-600" />
                      <h4 className="font-semibold text-blue-900 text-sm">Key Takeaways</h4>
                    </div>
                    <ul className="space-y-2 ml-6">
                      {gene.keyTakeaways.slice(0, 3).map((takeaway, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-xs text-slate-700">
                          <CheckCircle className="w-3 h-3 text-blue-600 mt-0.5 flex-shrink-0" />
                          <span>{takeaway}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <Separator />
                </>
              )}

              {/* Sources */}
              <div>
                <h4 className="font-semibold text-slate-900 text-sm mb-2">Data Sources</h4>
                <div className="flex flex-wrap gap-1">
                  {gene.sources.map((source, idx) => (
                    <Badge key={idx} variant="outline" className="text-xs">
                      {source}
                    </Badge>
                  ))}
                </div>
              </div>

              {/* Premium Badge */}
              {isPremium && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-xs text-amber-800 text-center">
                    Premium data available in detailed view
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tips */}
      <Card className="bg-slate-50">
        <CardContent className="pt-6">
          <h4 className="font-medium text-slate-900 mb-2">Comparison Tips</h4>
          <ul className="text-sm text-slate-600 space-y-1">
            <li>• Compare confidence scores to see which genes have strongest evidence</li>
            <li>• Look for overlapping phenotypes between genes</li>
            <li>• Check genomic locations to identify potential gene clusters</li>
            <li>• Review key takeaways for quick insights on each gene</li>
            <li>• Return to detailed view for premium data and further reading</li>
          </ul>
        </CardContent>
      </Card>

      {/* Back Button */}
      <div className="flex justify-center">
        <Button
          onClick={onClose}
          variant="outline"
          size="lg"
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Search Results
        </Button>
      </div>
    </div>
  );
}
