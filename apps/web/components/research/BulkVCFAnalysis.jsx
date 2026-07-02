import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Loader2, Upload, FileStack, Download, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { parseVcfFile, summarizeCohort } from "@/lib/vcfCohort";

export default function BulkVCFAnalysis({ userEducationLevel }) {
  const [files, setFiles] = useState([]);
  const [cohortName, setCohortName] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFiles = Array.from(e.target.files);
    setFiles(selectedFiles);
  };

  const handleAnalyzeCohort = async () => {
    if (files.length === 0 || !cohortName.trim()) {
      setError("Please select VCF files and enter a cohort name");
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setProgress(0);

    try {
      // Parse each VCF's real contents in the browser. Raw variants never leave
      // the device — only the aggregate counts below are sent to the LLM.
      const perFile = [];
      for (let i = 0; i < files.length; i++) {
        const base = (i / files.length) * 80;
        const span = (1 / files.length) * 80;
        const parsed = await parseVcfFile(files[i], {
          onProgress: (frac) => setProgress(Math.round(base + span * frac)),
        });
        perFile.push(parsed);
        setProgress(Math.round(base + span));
      }

      const stats = summarizeCohort(perFile);
      if (stats.totalVariants === 0) {
        setError(
          "No variants were found in the selected files. Confirm these are valid VCF files (a header line beginning with #CHROM followed by variant rows)."
        );
        return;
      }

      setProgress(85);
      const educationContext = getEducationContext(userEducationLevel);
      const typeLines = Object.entries(stats.variantTypes)
        .sort((a, b) => b[1] - a[1])
        .map(([type, count]) => `- ${type}: ${count.toLocaleString()}`)
        .join('\n');
      const perSampleLines = stats.perSample
        .map((s, i) => `${i + 1}. ${s.name}: ${s.variantCount.toLocaleString()} variants${s.keysTruncated ? ' (large file — shared-variant sampling truncated)' : ''}`)
        .join('\n');
      const sharedNote = stats.sharedApproximate ? ' (approximate — at least this many; some large files were sampled)' : '';

      // The model interprets ONLY these measured numbers; it is explicitly told
      // not to invent per-variant or per-gene findings it cannot see.
      const prompt = `You are a genomics research advisor interpreting REAL, measured cohort statistics for study "${cohortName}". These numbers were computed by parsing the actual uploaded VCF files in the researcher's browser. Do not invent additional per-variant, per-gene, or per-sample findings — you only have the aggregate statistics below.

**Measured cohort statistics:**
- Samples analyzed: ${stats.sampleCount}
- Total variant calls across cohort: ${stats.totalVariants.toLocaleString()}
- Mean variants per sample: ${stats.meanVariantsPerSample.toLocaleString()}
- Distinct variants observed (within sampled set): ${stats.distinctVariants.toLocaleString()}
- Variants shared by 2+ samples: ${stats.sharedByTwoOrMore.toLocaleString()}${sharedNote}
- Variants present in all ${stats.sampleCount} samples: ${stats.sharedAcrossAll.toLocaleString()}${sharedNote}

**Variant type distribution:**
${typeLines}

**Per-sample variant counts:**
${perSampleLines}

Write a research-grade interpretation adapted for ${educationContext}. Cover:
1. What these specific numbers suggest about cohort quality and composition (flag any samples whose counts are outliers relative to the cohort mean).
2. Quality-control steps warranted given the observed variant-type distribution and per-sample counts.
3. How to follow up on the shared-variant signal (recommended annotation with VEP/ANNOVAR, filtering against gnomAD, ClinVar/ClinGen review) — describe the workflow; do not claim clinical significance you cannot see.
4. Appropriate statistical approach for this sample size (power considerations, multiple-testing correction, case-control vs. family-based design).
5. Concrete next steps and tools.

Ground every statement in the measured numbers above. Where deeper analysis is needed, say what tool or step would produce it rather than estimating a result.`;

      const { result: analysis } = await apiClient.invokeLLM(prompt);

      setProgress(100);
      setResults({
        cohort_name: cohortName,
        file_count: files.length,
        stats,
        analysis,
      });

    } catch (err) {
      console.error("Error analyzing cohort:", err);
      setError(err?.message ? `Failed to analyze cohort: ${err.message}` : "Failed to analyze cohort. Please try again.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getEducationContext = (level) => {
    if (level === 'medical_professional') {
      return "clinical researchers - focus on translational applications";
    }
    if (level === 'phd' || level === 'researcher') {
      return "research scientists - provide comprehensive technical details";
    }
    return "advanced researchers - use full technical terminology";
  };

  const exportResults = () => {
    if (!results) return;
    
    const exportData = {
      cohort_name: results.cohort_name,
      file_count: results.file_count,
      analysis_date: new Date().toISOString(),
      statistics: results.stats,
      analysis: results.analysis,
      files: results.stats?.perSample?.map(s => s.name) ?? []
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${results.cohort_name}-analysis-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  return (
    <div className="space-y-6">
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileStack className="w-5 h-5 text-blue-600" />
            Bulk VCF Cohort Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 text-sm">
              <strong>Cohort Analysis:</strong> Upload multiple VCF files to analyze variant patterns 
              across your study cohort. Ideal for case-control studies, family analyses, and population genetics.
            </AlertDescription>
          </Alert>

          <div className="space-y-4">
            <div>
              <Label htmlFor="cohort-name">Cohort/Study Name *</Label>
              <Input
                id="cohort-name"
                placeholder="e.g., Alzheimer's Disease Case-Control Study"
                value={cohortName}
                onChange={(e) => setCohortName(e.target.value)}
                disabled={isAnalyzing}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="vcf-files">VCF Files *</Label>
              <input
                id="vcf-files"
                type="file"
                multiple
                accept=".vcf,.vcf.gz"
                onChange={handleFileSelect}
                disabled={isAnalyzing}
                className="w-full p-3 border border-slate-300 rounded-lg mt-1"
              />
              <p className="text-xs text-slate-500 mt-1">
                Select multiple VCF files (.vcf or .vcf.gz). Recommended: 10-1000 samples.
              </p>
            </div>

            {files.length > 0 && (
              <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                <h4 className="font-semibold text-slate-900 mb-2 text-sm">
                  Selected Files ({files.length})
                </h4>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {files.map((file, idx) => (
                    <div key={idx} className="text-xs text-slate-700 flex items-center gap-2">
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                    </div>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isAnalyzing && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-600">Analyzing cohort...</span>
                  <span className="font-semibold text-slate-900">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>
            )}

            <Button
              onClick={handleAnalyzeCohort}
              disabled={isAnalyzing || files.length === 0 || !cohortName.trim()}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing Cohort...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Analyze Cohort ({files.length} files)
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Cohort Analysis Results</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  {results.cohort_name} - {results.file_count} samples
                </p>
              </div>
              <Button variant="outline" onClick={exportResults} className="gap-2">
                <Download className="w-4 h-4" />
                Export
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {results.stats && (
              <div className="mb-6 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500">Samples</p>
                    <p className="text-2xl font-bold text-slate-900">{results.stats.sampleCount}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500">Total variants</p>
                    <p className="text-2xl font-bold text-slate-900">{results.stats.totalVariants.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500">Mean / sample</p>
                    <p className="text-2xl font-bold text-slate-900">{results.stats.meanVariantsPerSample.toLocaleString()}</p>
                  </div>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <p className="text-xs text-slate-500">Shared by 2+{results.stats.sharedApproximate ? '*' : ''}</p>
                    <p className="text-2xl font-bold text-slate-900">{results.stats.sharedByTwoOrMore.toLocaleString()}</p>
                  </div>
                </div>

                <div className="bg-white p-3 rounded-lg border border-slate-200">
                  <p className="text-xs font-semibold text-slate-700 mb-2">Variant types (measured across cohort):</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(results.stats.variantTypes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([type, count]) => (
                        <Badge key={type} variant="outline">{type}: {count.toLocaleString()}</Badge>
                      ))}
                  </div>
                </div>

                <Alert className="bg-slate-50 border-slate-200">
                  <Info className="h-4 w-4 text-slate-600" />
                  <AlertDescription className="text-slate-700 text-xs">
                    These figures were computed by parsing your actual VCF file contents in your browser — the raw genomic data was not uploaded. The narrative below is an AI interpretation of these measured numbers, not an independent analysis of individual variants.
                    {results.stats.sharedApproximate && ' *Shared-variant counts are a floor: some files were large enough that shared-variant sampling was truncated.'}
                  </AlertDescription>
                </Alert>
              </div>
            )}
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  h1: ({ children }) => <h1 className="text-2xl font-bold text-slate-900 mt-6 mb-3">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-xl font-semibold text-slate-900 mt-5 mb-2">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-800 mt-4 mb-2">{children}</h3>,
                  p: ({ children }) => <p className="text-slate-700 mb-3 leading-relaxed">{children}</p>,
                  ul: ({ children }) => <ul className="ml-4 mb-3 space-y-1 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="ml-4 mb-3 space-y-1 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  code: ({ inline, children }) => 
                    inline ? (
                      <code className="bg-slate-100 px-1 py-0.5 rounded text-sm">{children}</code>
                    ) : (
                      <code className="block bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto">{children}</code>
                    ),
                }}
              >
                {results.analysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}