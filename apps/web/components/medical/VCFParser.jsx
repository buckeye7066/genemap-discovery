import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { 
  FileText, 
  Loader2, 
  CheckCircle, 
  AlertCircle,
  Database,
  TrendingUp,
  Info
} from "lucide-react";

export default function VCFParser({ fileUrl, vcfText, onVariantsParsed, onEnrichmentComplete }) {
  const [isParsing, setIsParsing] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [parseSuccess, setParseSuccess] = useState(false);
  const [enrichmentSuccess, setEnrichmentSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [variants, setVariants] = useState([]);
  const [enrichedVariants, setEnrichedVariants] = useState([]);
  const [parseProgress, setParseProgress] = useState(0);
  const [enrichProgress, setEnrichProgress] = useState(0);
  const [stats, setStats] = useState(null);

  const parseVCF = async () => {
    setIsParsing(true);
    setError(null);
    setParseProgress(10);

    try {
      let text = vcfText;
      if (!text && fileUrl) {
        const response = await fetch(fileUrl);
        text = await response.text();
      }
      if (!text) {
        throw new Error("No VCF content is available to parse");
      }
      setParseProgress(30);

      setParseProgress(50);
      const result = await apiClient.parseVcf(text, 1000);

      setParseProgress(100);
      setVariants(result.variants || []);
      setStats(result.summary);
      setParseSuccess(true);

      if (onVariantsParsed) {
        onVariantsParsed(result.variants || []);
      }

    } catch (err) {
      console.error("Parse error:", err);
      setError(`Failed to parse VCF: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  const enrichVariants = async () => {
    if (!variants || variants.length === 0) {
      setError("No variants to enrich. Parse VCF first.");
      return;
    }

    setIsEnriching(true);
    setError(null);
    setEnrichProgress(10);

    try {
      const variantsToEnrich = variants.slice(0, 50);
      setEnrichProgress(40);

      const enriched = await apiClient.enrichVcfVariants(variantsToEnrich);
      const enrichedList = enriched.enrichedVariants || enriched.enriched_variants || [];

      setEnrichProgress(100);
      setEnrichedVariants(enrichedList);
      setEnrichmentSuccess(true);

      if (onEnrichmentComplete) {
        onEnrichmentComplete(enrichedList);
      }

    } catch (err) {
      console.error("Enrichment error:", err);
      setError(`Failed to enrich variants: ${err.message}`);
    } finally {
      setIsEnriching(false);
    }
  };

  const getClinicalSignificanceColor = (sig) => {
    if (!sig) return "bg-slate-100 text-slate-800";
    const lower = sig.toLowerCase();
    if (lower.includes("pathogenic") && !lower.includes("likely")) return "bg-red-100 text-red-800";
    if (lower.includes("likely pathogenic")) return "bg-orange-100 text-orange-800";
    if (lower.includes("vus") || lower.includes("uncertain")) return "bg-yellow-100 text-yellow-800";
    if (lower.includes("likely benign")) return "bg-blue-100 text-blue-800";
    if (lower.includes("benign")) return "bg-green-100 text-green-800";
    return "bg-slate-100 text-slate-800";
  };

  return (
    <div className="space-y-4">
      {/* Parse Button */}
      {!parseSuccess && (
        <Card className="bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold text-slate-900 mb-1">Step 1: Parse VCF File</h4>
                <p className="text-sm text-slate-600">Extract variants from your VCF file</p>
              </div>
              <FileText className="w-8 h-8 text-cyan-600" />
            </div>
            
            {isParsing ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-cyan-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Parsing VCF file...</span>
                </div>
                <Progress value={parseProgress} className="h-2" />
                <p className="text-xs text-slate-500">{parseProgress}% complete</p>
              </div>
            ) : (
              <Button
                onClick={parseVCF}
                className="w-full bg-cyan-600 hover:bg-cyan-700"
              >
                <FileText className="w-4 h-4 mr-2" />
                Parse VCF File
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Parse Results */}
      {parseSuccess && (
        <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <h4 className="font-semibold text-green-900">VCF Parsed Successfully!</h4>
            </div>
            
            {stats && (
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div className="bg-white p-3 rounded border border-green-200">
                  <p className="text-xs text-slate-600">Total Variants</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.total_variants?.toLocaleString()}</p>
                </div>
                <div className="bg-white p-3 rounded border border-green-200">
                  <p className="text-xs text-slate-600">Parsed</p>
                  <p className="text-2xl font-bold text-slate-900">{stats.parsed_variants}</p>
                </div>
              </div>
            )}
            
            <div className="bg-white p-3 rounded border border-green-200 mb-4">
              <p className="text-xs font-semibold text-slate-700 mb-2">Variant Types:</p>
              <div className="flex flex-wrap gap-2">
                {stats?.variant_types && Object.entries(stats.variant_types).map(([type, count]) => (
                  <Badge key={type} variant="outline">
                    {type}: {count}
                  </Badge>
                ))}
              </div>
            </div>

            <Alert className="bg-white border-green-200">
              <Info className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-900 text-sm">
                Next: enrich these variants with source-grounded public database annotations.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Enrichment Button */}
      {parseSuccess && !enrichmentSuccess && (
        <Card className="bg-gradient-to-r from-purple-50 to-indigo-50 border-purple-200">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h4 className="font-semibold text-slate-900 mb-1">Step 2: Enrich with Database Annotations</h4>
                <p className="text-sm text-slate-600">Add source-grounded public database annotations</p>
              </div>
              <Database className="w-8 h-8 text-purple-600" />
            </div>
            
            {isEnriching ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-purple-700">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Querying databases...</span>
                </div>
                <Progress value={enrichProgress} className="h-2" />
                <p className="text-xs text-slate-500">
                  Querying public genomic databases...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-white p-3 rounded border border-purple-200 text-sm">
                  <p className="font-medium text-purple-900 mb-2">Will enrich with:</p>
                  <ul className="space-y-1 text-slate-700">
                    <li>MyVariant.info annotations when an rsID is available</li>
                    <li>Ensembl gene lookup when the VCF includes gene symbols</li>
                    <li>ClinVar search results with source metadata</li>
                    <li>Not found responses instead of inferred claims</li>
                    <li>Clinical confirmation required for significant findings</li>
                  </ul>
                </div>
                <Button
                  onClick={enrichVariants}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Database className="w-4 h-4 mr-2" />
                  Enrich Variants (Top 50)
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Enrichment Results */}
      {enrichmentSuccess && enrichedVariants.length > 0 && (
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-600" />
                Enriched Variants ({enrichedVariants.length})
              </CardTitle>
              <Badge className="bg-green-600 text-white">
                <CheckCircle className="w-3 h-3 mr-1" />
                Complete
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {enrichedVariants.map((ev, idx) => {
                const v = ev.original_variant || ev.originalVariant || {};
                const annotations = ev.annotations || {};
                const clinVarResultId = annotations.clinVar?.search?.esearchresult?.idlist?.[0];
                const clinVarSummary = clinVarResultId
                  ? annotations.clinVar?.data?.result?.[clinVarResultId]
                  : null;
                const classification = clinVarSummary?.clinical_significance?.description || null;
                return (
                  <Card key={idx} className="border border-slate-200 hover:shadow-md transition-shadow">
                    <CardContent className="pt-4">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <p className="font-mono text-sm font-semibold text-slate-900">
                            {v.chromosome}:{v.position} {v.ref}→{v.alt}
                          </p>
                          {v.gene && (
                            <Badge variant="outline" className="text-xs mt-1">
                              {v.gene}
                            </Badge>
                          )}
                        </div>
                        {classification && (
                          <Badge className={getClinicalSignificanceColor(classification)}>
                            {classification}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                        {(annotations.myVariant?.data?.dbsnp?.rsid || v.rsid) && (
                          <div>
                            <p className="text-slate-500">Variant ID</p>
                            <p className="font-medium">{annotations.myVariant?.data?.dbsnp?.rsid || v.rsid}</p>
                          </div>
                        )}
                        {annotations.myVariant?.status && (
                          <div>
                            <p className="text-slate-500">MyVariant.info</p>
                            <p className="font-medium">{annotations.myVariant.status}</p>
                          </div>
                        )}
                        {annotations.ensemblGene?.data?.display_name && (
                          <div>
                            <p className="text-slate-500">Ensembl Gene</p>
                            <p className="font-medium">{annotations.ensemblGene.data.display_name}</p>
                          </div>
                        )}
                        {annotations.clinVar?.status && (
                          <div>
                            <p className="text-slate-500">ClinVar</p>
                            <p className="font-medium">{annotations.clinVar.status}</p>
                          </div>
                        )}
                      </div>

                      {ev.evidenceSummary && (
                        <Alert className="mt-3 bg-blue-50 border-blue-200">
                          <Info className="h-3 w-3 text-blue-600" />
                          <AlertDescription className="text-blue-900 text-xs">
                            {ev.evidenceSummary} Confirm clinically significant variants with a qualified professional or certified lab.
                          </AlertDescription>
                        </Alert>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </div>
  );
}
