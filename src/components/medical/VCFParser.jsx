import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, FileText, AlertTriangle, CheckCircle2, Download } from "lucide-react";

export default function VCFParser({ fileUrl, onVariantsParsed }) {
  const [isParsing, setIsParsing] = useState(false);
  const [variants, setVariants] = useState(null);
  const [error, setError] = useState(null);

  const parseVCF = async () => {
    setIsParsing(true);
    setError(null);

    try {
      // Fetch the VCF file content
      const response = await fetch(fileUrl);
      const vcfContent = await response.text();

      // Parse VCF using AI
      const prompt = `Parse this VCF (Variant Call Format) file and extract variant information.

**VCF Content:**
${vcfContent.substring(0, 50000)} ${vcfContent.length > 50000 ? '... (truncated for processing)' : ''}

**Your Task:**
Extract and structure variant information from this VCF file.

For each variant, extract:
1. Chromosome (CHROM)
2. Position (POS)
3. Reference allele (REF)
4. Alternate allele (ALT)
5. Gene symbol (from INFO field or annotation)
6. Variant type (SNV, insertion, deletion, etc.)
7. Quality score (QUAL)
8. Filter status (FILTER)
9. Any clinical significance annotation (CLNSIG, if present)
10. dbSNP ID (if present in ID column)

Return up to 100 most clinically relevant variants.
Prioritize:
- Variants in coding regions
- Known pathogenic/likely pathogenic variants
- Variants with rsIDs
- High quality variants (QUAL > 30)

Return as structured array of variant objects.`;

      const parsed = await base44.integrations.Core.InvokeLLM({
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
                  ref: { type: "string" },
                  alt: { type: "string" },
                  gene: { type: "string" },
                  variant_type: { type: "string" },
                  quality: { type: "number" },
                  filter: { type: "string" },
                  clinical_significance: { type: "string" },
                  rsid: { type: "string" }
                }
              }
            },
            total_variants: { type: "number" },
            vcf_version: { type: "string" },
            reference_genome: { type: "string" }
          }
        }
      });

      setVariants(parsed);
      if (onVariantsParsed) {
        onVariantsParsed(parsed.variants);
      }
    } catch (err) {
      console.error("Error parsing VCF:", err);
      setError("Failed to parse VCF file. Please ensure it's a valid VCF format.");
    } finally {
      setIsParsing(false);
    }
  };

  const getClinicalSigBadge = (sig) => {
    if (!sig) return null;
    
    const lower = sig.toLowerCase();
    if (lower.includes('pathogenic') && !lower.includes('likely')) {
      return <Badge className="bg-red-600 text-white">Pathogenic</Badge>;
    }
    if (lower.includes('likely pathogenic')) {
      return <Badge className="bg-orange-600 text-white">Likely Pathogenic</Badge>;
    }
    if (lower.includes('benign') && !lower.includes('likely')) {
      return <Badge className="bg-green-600 text-white">Benign</Badge>;
    }
    if (lower.includes('likely benign')) {
      return <Badge className="bg-green-500 text-white">Likely Benign</Badge>;
    }
    if (lower.includes('uncertain') || lower.includes('vus')) {
      return <Badge className="bg-amber-600 text-white">VUS</Badge>;
    }
    return <Badge variant="outline">{sig}</Badge>;
  };

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-blue-600" />
          VCF Variant Parser
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!variants && !isParsing && (
          <div>
            <Alert className="bg-blue-50 border-blue-200 mb-4">
              <AlertDescription className="text-blue-900 text-sm">
                Click below to parse your VCF file and extract variant information for analysis with Robert.
              </AlertDescription>
            </Alert>
            <Button onClick={parseVCF} className="w-full bg-blue-600 hover:bg-blue-700">
              <FileText className="w-4 h-4 mr-2" />
              Parse VCF File
            </Button>
          </div>
        )}

        {isParsing && (
          <div className="text-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-slate-600">Parsing VCF file and extracting variants...</p>
            <p className="text-xs text-slate-500 mt-2">This may take 30-60 seconds</p>
          </div>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {variants && (
          <div className="space-y-4">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 p-4 rounded-lg border border-green-200">
              <div className="flex items-start gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-green-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-green-900">VCF Successfully Parsed</h4>
                  <p className="text-sm text-green-800 mt-1">
                    Total variants: {variants.total_variants || variants.variants.length}
                  </p>
                  {variants.reference_genome && (
                    <p className="text-xs text-green-700">
                      Reference: {variants.reference_genome}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="font-semibold text-slate-900 mb-3">
                Extracted Variants ({variants.variants.length})
              </h4>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {variants.variants.map((variant, idx) => (
                  <div key={idx} className="bg-white p-3 rounded border border-slate-200">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="outline" className="text-xs">
                            {variant.chromosome}:{variant.position}
                          </Badge>
                          {variant.gene && (
                            <Badge className="bg-blue-100 text-blue-800 text-xs">
                              {variant.gene}
                            </Badge>
                          )}
                          {variant.rsid && (
                            <Badge variant="outline" className="text-xs">
                              {variant.rsid}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-slate-700">
                          {variant.ref} → {variant.alt}
                          {variant.variant_type && ` (${variant.variant_type})`}
                        </p>
                        {variant.quality && (
                          <p className="text-xs text-slate-500">
                            Quality: {variant.quality}
                          </p>
                        )}
                      </div>
                      {variant.clinical_significance && (
                        <div>
                          {getClinicalSigBadge(variant.clinical_significance)}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Alert className="bg-purple-50 border-purple-200">
              <AlertDescription className="text-purple-900 text-sm">
                <strong>Next Step:</strong> These variants can now be analyzed individually with Robert's variant interpretation feature in the Gene Search section.
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}