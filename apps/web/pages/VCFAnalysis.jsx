import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { createPageUrl } from "@/utils";
import { log } from "../components/shared/logger";
import { VCF_BATCH_SIZE } from "../components/shared/constants";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileUp,
  Upload,
  Loader2,
  Database,
  TrendingUp,
  Search,
  Download,
  Info,
  Sparkles,
  BarChart3,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import VCFParser from "../components/medical/VCFParser";

export default function VCFAnalysisPage() {
  const { user } = useAuth();
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFileUrl, setUploadedFileUrl] = useState(null);
  const [variants, setVariants] = useState([]);
  const [enrichedVariants, setEnrichedVariants] = useState([]);
  const [relatedGenes, setRelatedGenes] = useState([]);
  const [isAnalyzingGenes, setIsAnalyzingGenes] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (!selectedFile.name.endsWith('.vcf') && !selectedFile.name.endsWith('.vcf.gz')) {
        alert("Please select a valid VCF file (.vcf or .vcf.gz)");
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    try {
      // BACKEND_NEEDED: UploadFile integration needs API implementation
      // const result = await apiClient.uploadFile({ file });
      // setUploadedFileUrl(result.file_url);
      alert("File upload is not yet implemented");
    } catch (err) {
      log.error("Upload error:", err);
      alert("Failed to upload file. Please try again.");
    } finally {
      setIsUploading(false);
    }
  };

  const handleVariantsParsed = async (parsedVariants) => {
    setVariants(parsedVariants);
    
    // Automatically trigger gene analysis
    analyzeRelatedGenes(parsedVariants);
  };

  const handleEnrichmentComplete = (enriched) => {
    setEnrichedVariants(enriched);
    setAnalysisReady(true);
  };

  const analyzeRelatedGenes = async (variantData) => {
    setIsAnalyzingGenes(true);
    try {
      // Extract unique genes from variants
      const geneSymbols = [...new Set(
        variantData
          .map(v => v.gene)
          .filter(g => g && g !== "." && g.length > 0)
      )];

      if (geneSymbols.length === 0) {
        setRelatedGenes([]);
        return;
      }

      const genesToAnalyze = geneSymbols.slice(0, 20);
      const batchSize = VCF_BATCH_SIZE;
      const allGeneInfo = [];

      // Process genes in batches for better performance
      for (let i = 0; i < genesToAnalyze.length; i += batchSize) {
        const batch = genesToAnalyze.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async (symbol) => {
            try {
              // BACKEND_NEEDED: InvokeLLM integration needs API implementation
              // const summary = await apiClient.invokeLLM({
              //   prompt: `Provide a brief summary for gene ${symbol} that was found in a VCF analysis...`,
              //   add_context_from_internet: true
              // });
              // return { symbol, summary };
              return { symbol, summary: `Gene ${symbol} identified in VCF analysis.` };
            } catch (err) {
              return { symbol, summary: `Gene ${symbol} identified in VCF analysis.` };
            }
          })
        );
        
        allGeneInfo.push(...batchResults);
      }

      setRelatedGenes(allGeneInfo);
    } catch (err) {
      log.error("Gene analysis error:", err);
    } finally {
      setIsAnalyzingGenes(false);
    }
  };

  const exportResults = () => {
    const exportData = {
      file_name: file?.name,
      upload_date: new Date().toISOString(),
      user_email: user?.email,
      variants_summary: {
        total_parsed: variants.length,
        enriched_count: enrichedVariants.length
      },
      variants: variants,
      enriched_variants: enrichedVariants,
      related_genes: relatedGenes
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vcf-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-cyan-600 to-blue-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Database className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            VCF Analysis & Variant Enrichment
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Upload your VCF file for comprehensive variant analysis with dbSNP, gnomAD, and gene integration
          </p>
        </div>

        {/* Info Alert */}
        <Alert className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
          <Info className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Comprehensive Analysis:</strong> We'll parse your VCF, enrich variants with population databases, 
            predict clinical significance, and link to gene data from your searches!
          </AlertDescription>
        </Alert>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Upload Section */}
          <div className="lg:col-span-2 space-y-6">
            {/* File Upload */}
            {!uploadedFileUrl && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileUp className="w-5 h-5 text-cyan-600" />
                    Upload VCF File
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="vcf-file" className="text-base font-medium">
                      Select VCF File
                    </Label>
                    <div className="mt-2 border-2 border-dashed border-slate-300 rounded-lg p-6 text-center hover:border-cyan-400 transition-colors">
                      <Input
                        id="vcf-file"
                        type="file"
                        accept=".vcf,.vcf.gz"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                      <label htmlFor="vcf-file" className="cursor-pointer">
                        <div className="flex flex-col items-center gap-3">
                          <div className="w-12 h-12 bg-cyan-100 rounded-full flex items-center justify-center">
                            <Upload className="w-6 h-6 text-cyan-600" />
                          </div>
                          <div>
                            <p className="font-medium text-slate-900">
                              {file ? file.name : "Click to select VCF file"}
                            </p>
                            <p className="text-sm text-slate-500 mt-1">
                              Accepts .vcf or .vcf.gz files
                            </p>
                          </div>
                        </div>
                      </label>
                    </div>
                  </div>

                  <Button
                    onClick={handleUpload}
                    disabled={!file || isUploading}
                    className="w-full bg-cyan-600 hover:bg-cyan-700 py-6"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        Upload & Start Analysis
                      </>
                    )}
                  </Button>

                  <div className="bg-cyan-50 p-4 rounded-lg border border-cyan-200">
                    <h4 className="font-medium text-cyan-900 mb-2 text-sm">What happens next:</h4>
                    <ul className="text-sm text-cyan-800 space-y-1">
                      <li>✓ Parse VCF and extract all variants</li>
                      <li>✓ Enrich with dbSNP rsIDs and annotations</li>
                      <li>✓ Add gnomAD population frequencies</li>
                      <li>✓ Predict pathogenicity (SIFT, PolyPhen, CADD)</li>
                      <li>✓ Link variants to gene information</li>
                      <li>✓ Generate clinical recommendations</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* VCF Parser & Enrichment */}
            {uploadedFileUrl && (
              <VCFParser
                fileUrl={uploadedFileUrl}
                onVariantsParsed={handleVariantsParsed}
                onEnrichmentComplete={handleEnrichmentComplete}
              />
            )}

            {/* Gene Analysis Results */}
            {variants.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      Related Genes ({relatedGenes.length})
                    </CardTitle>
                    <Link to={createPageUrl("Search")}>
                      <Button variant="outline" size="sm" className="gap-2">
                        <Search className="w-4 h-4" />
                        Explore in Gene Search
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {isAnalyzingGenes ? (
                    <div className="flex items-center justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin text-blue-600 mr-3" />
                      <span className="text-slate-600">Analyzing genes from variants...</span>
                    </div>
                  ) : relatedGenes.length === 0 ? (
                    <Alert className="bg-amber-50 border-amber-200">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-amber-900">
                        No gene annotations found in parsed variants. The VCF may not include gene symbols in the INFO field.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {relatedGenes.map((gene, idx) => (
                        <Card key={idx} className="border border-slate-200 hover:shadow-md transition-shadow">
                          <CardContent className="pt-4">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold text-slate-900">{gene.symbol}</h4>
                              <Link to={`${createPageUrl("Search")}?query=${gene.symbol}`}>
                                <Button variant="ghost" size="sm">
                                  <Search className="w-4 h-4" />
                                </Button>
                              </Link>
                            </div>
                            <p className="text-sm text-slate-700 leading-relaxed">{gene.summary}</p>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Progress Tracker */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-lg">Analysis Progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-3">
                  {uploadedFileUrl ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                  <span className={uploadedFileUrl ? "text-green-900 font-medium" : "text-slate-600"}>
                    Upload VCF
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {variants.length > 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                  <span className={variants.length > 0 ? "text-green-900 font-medium" : "text-slate-600"}>
                    Parse Variants
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {enrichedVariants.length > 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                  <span className={enrichedVariants.length > 0 ? "text-green-900 font-medium" : "text-slate-600"}>
                    Enrich with Databases
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {relatedGenes.length > 0 ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-slate-300" />
                  )}
                  <span className={relatedGenes.length > 0 ? "text-green-900 font-medium" : "text-slate-600"}>
                    Gene Analysis
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Statistics */}
            {variants.length > 0 && (
              <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                <CardHeader>
                  <CardTitle className="text-lg">Analysis Stats</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-xs text-slate-600">Total Variants</p>
                    <p className="text-2xl font-bold text-slate-900">{variants.length}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-xs text-slate-600">Enriched</p>
                    <p className="text-2xl font-bold text-slate-900">{enrichedVariants.length}</p>
                  </div>
                  <div className="bg-white p-3 rounded border border-blue-200">
                    <p className="text-xs text-slate-600">Genes Identified</p>
                    <p className="text-2xl font-bold text-slate-900">{relatedGenes.length}</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Actions */}
            {analysisReady && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle className="text-lg">Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button
                    onClick={exportResults}
                    variant="outline"
                    className="w-full gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export Results (JSON)
                  </Button>
                  <Link to={createPageUrl("VisualizationHub")}>
                    <Button variant="outline" className="w-full gap-2">
                      <BarChart3 className="w-4 h-4" />
                      Visualize Genes
                    </Button>
                  </Link>
                  <Link to={createPageUrl("RobertClinical")}>
                    <Button variant="outline" className="w-full gap-2">
                      <Sparkles className="w-4 h-4" />
                      Clinical Analysis
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}

            {/* Info */}
            <Card className="shadow-lg border-purple-200 bg-gradient-to-br from-purple-50 to-pink-50">
              <CardHeader>
                <CardTitle className="text-lg">Database Sources</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span className="text-slate-700">dbSNP - Variant validation</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span className="text-slate-700">gnomAD - Population frequencies</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span className="text-slate-700">ClinVar - Clinical significance</span>
                </div>
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-purple-600" />
                  <span className="text-slate-700">CADD - Pathogenicity scores</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}