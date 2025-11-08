import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
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
  Info,
  Download,
  Sparkles
} from "lucide-react";

export default function VCFParser({ fileUrl, onVariantsParsed, onEnrichmentComplete }) {
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
      // Fetch VCF content
      const response = await fetch(fileUrl);
      const vcfText = await response.text();
      setParseProgress(30);

      // Parse with LLM for structured extraction
      const prompt = `Parse this VCF (Variant Call Format) file and extract ALL variants with comprehensive details.

VCF Content (first 50KB):
${vcfText.substring(0, 50000)}

**Parse the following for EACH variant:**
1. **Basic Info:**
   - Chromosome (CHROM)
   - Position (POS)
   - rsID (ID) - if available, otherwise "."
   - Reference allele (REF)
   - Alternate allele (ALT)
   
2. **Quality Metrics:**
   - Quality score (QUAL)
   - Filter status (FILTER)
   - Depth (DP from INFO or FORMAT)
   
3. **Variant Type:**
   - Determine type: SNV, Insertion, Deletion, MNV, Complex
   - Based on REF and ALT lengths
   
4. **Genomic Context:**
   - Gene symbol (if in INFO field or can be inferred)
   - Transcript impact (if available)
   - Coding/non-coding
   
5. **Clinical Significance (if in INFO):**
   - CLNSIG, CLNDN, CLNREVSTAT fields
   - Any pathogenicity predictions

**Return JSON array with ALL variants found. Include:**
- At least the top 100 most significant variants (by QUAL or clinical significance)
- All variants with clinical annotations
- Representative samples of different variant types

**JSON Schema:**
{
  "variants": [
    {
      "chromosome": "chr1",
      "position": 12345,
      "rsid": "rs12345",
      "ref": "A",
      "alt": "G",
      "quality": 100,
      "filter": "PASS",
      "depth": 50,
      "variant_type": "SNV",
      "gene": "BRCA1",
      "clinical_significance": "Pathogenic",
      "zygosity": "heterozygous"
    }
  ],
  "summary": {
    "total_variants": 1500,
    "parsed_variants": 100,
    "variant_types": {
      "SNV": 80,
      "Insertion": 10,
      "Deletion": 8,
      "Other": 2
    }
  }
}`;

      setParseProgress(50);

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  chromosome: { type: "string" },
                  position: { type: "number" },
                  rsid: { type: "string" },
                  ref: { type: "string" },
                  alt: { type: "string" },
                  quality: { type: "number" },
                  filter: { type: "string" },
                  depth: { type: "number" },
                  variant_type: { type: "string" },
                  gene: { type: "string" },
                  clinical_significance: { type: "string" },
                  zygosity: { type: "string" }
                }
              }
            },
            summary: {
              type: "object",
              properties: {
                total_variants: { type: "number" },
                parsed_variants: { type: "number" },
                variant_types: { type: "object" }
              }
            }
          }
        }
      });

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
      // Enrich variants with dbSNP and gnomAD data
      const variantsToEnrich = variants.slice(0, 50); // Top 50 for detailed enrichment
      
      const prompt = `Enrich these genetic variants with data from dbSNP and gnomAD databases.

**Variants to Enrich:**
${JSON.stringify(variantsToEnrich, null, 2)}

**For EACH variant, fetch from dbSNP and gnomAD:**

1. **dbSNP Data:**
   - Validated rsID
   - Global MAF (Minor Allele Frequency)
   - Clinical significance
   - Molecular consequence
   - Gene annotation
   - Protein change (if coding)
   
2. **gnomAD Data:**
   - Population allele frequencies:
     * Overall (gnomAD v3.1.2)
     * African/African American
     * Latino/Admixed American
     * Ashkenazi Jewish
     * East Asian
     * European (non-Finnish)
     * South Asian
   - Homozygote count
   - Filtering status
   
3. **Functional Predictions:**
   - SIFT score and prediction
   - PolyPhen-2 score and prediction
   - CADD score (if available)
   - REVEL score (if available)
   
4. **Clinical Annotations:**
   - ClinVar classification
   - Disease associations
   - Review status
   - Submitter information
   
5. **Interpretation:**
   - Likely pathogenicity (Pathogenic, Likely Pathogenic, VUS, Likely Benign, Benign)
   - Evidence level
   - Recommendation for clinical action

**Use your knowledge of these databases to provide comprehensive annotations.**

Return enriched variant data with all available information.`;

      setEnrichProgress(40);

      const enriched = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            enriched_variants: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  original_variant: { type: "object" },
                  dbsnp: {
                    type: "object",
                    properties: {
                      validated_rsid: { type: "string" },
                      global_maf: { type: "number" },
                      clinical_significance: { type: "string" },
                      molecular_consequence: { type: "string" },
                      protein_change: { type: "string" }
                    }
                  },
                  gnomad: {
                    type: "object",
                    properties: {
                      overall_af: { type: "number" },
                      population_frequencies: { type: "object" },
                      homozygote_count: { type: "number" },
                      filter_status: { type: "string" }
                    }
                  },
                  predictions: {
                    type: "object",
                    properties: {
                      sift: { type: "string" },
                      polyphen: { type: "string" },
                      cadd: { type: "number" },
                      revel: { type: "number" }
                    }
                  },
                  interpretation: {
                    type: "object",
                    properties: {
                      classification: { type: "string" },
                      evidence_level: { type: "string" },
                      recommendation: { type: "string" }
                    }
                  }
                }
              }
            }
          }
        }
      });

      setEnrichProgress(100);
      setEnrichedVariants(enriched.enriched_variants || []);
      setEnrichmentSuccess(true);

      if (onEnrichmentComplete) {
        onEnrichmentComplete(enriched.enriched_variants || []);
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
                Next: Enrich these variants with dbSNP and gnomAD data for comprehensive annotations!
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
                <p className="text-sm text-slate-600">Add dbSNP, gnomAD, and clinical data</p>
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
                  Fetching data from dbSNP, gnomAD, ClinVar...
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="bg-white p-3 rounded border border-purple-200 text-sm">
                  <p className="font-medium text-purple-900 mb-2">Will enrich with:</p>
                  <ul className="space-y-1 text-slate-700">
                    <li>✓ dbSNP validation & annotations</li>
                    <li>✓ gnomAD population frequencies</li>
                    <li>✓ ClinVar clinical significance</li>
                    <li>✓ Pathogenicity predictions (SIFT, PolyPhen, CADD)</li>
                    <li>✓ Clinical recommendations</li>
                  </ul>
                </div>
                <Button
                  onClick={enrichVariants}
                  className="w-full bg-purple-600 hover:bg-purple-700"
                >
                  <Sparkles className="w-4 h-4 mr-2" />
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
                const v = ev.original_variant;
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
                        {ev.interpretation?.classification && (
                          <Badge className={getClinicalSignificanceColor(ev.interpretation.classification)}>
                            {ev.interpretation.classification}
                          </Badge>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs mt-3">
                        {ev.dbsnp?.validated_rsid && (
                          <div>
                            <p className="text-slate-500">dbSNP</p>
                            <p className="font-medium">{ev.dbsnp.validated_rsid}</p>
                          </div>
                        )}
                        {ev.gnomad?.overall_af !== undefined && (
                          <div>
                            <p className="text-slate-500">gnomAD AF</p>
                            <p className="font-medium">{(ev.gnomad.overall_af * 100).toFixed(4)}%</p>
                          </div>
                        )}
                        {ev.predictions?.cadd && (
                          <div>
                            <p className="text-slate-500">CADD Score</p>
                            <p className="font-medium">{ev.predictions.cadd}</p>
                          </div>
                        )}
                        {ev.dbsnp?.molecular_consequence && (
                          <div>
                            <p className="text-slate-500">Consequence</p>
                            <p className="font-medium">{ev.dbsnp.molecular_consequence}</p>
                          </div>
                        )}
                      </div>

                      {ev.interpretation?.recommendation && (
                        <Alert className="mt-3 bg-blue-50 border-blue-200">
                          <Info className="h-3 w-3 text-blue-600" />
                          <AlertDescription className="text-blue-900 text-xs">
                            {ev.interpretation.recommendation}
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