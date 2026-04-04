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
      // TODO: UploadFile needs API implementation - using file names for now
      setProgress(20);
      const uploadedFiles = [];
      for (let i = 0; i < files.length; i++) {
        uploadedFiles.push({
          name: files[i].name,
          url: "pending-upload"
        });
        setProgress(20 + (30 * (i + 1) / files.length));
      }

      // Analyze cohort
      setProgress(50);
      const educationContext = getEducationContext(userEducationLevel);
      
      const prompt = `You are a genomic researcher analyzing a cohort of ${files.length} VCF files for study "${cohortName}".

**Files Uploaded:**
${uploadedFiles.map((f, i) => `${i + 1}. ${f.name}`).join('\n')}

**Your Task - Cohort-Level Variant Analysis:**

Provide a comprehensive research-grade analysis adapted for ${educationContext}.

1. **Cohort Overview**
   - Number of samples: ${files.length}
   - Study name: ${cohortName}
   - Recommended quality control steps
   - Sample size power analysis

2. **Variant Statistics Across Cohort**
   - Expected total variants per sample
   - Common vs. rare variant distribution
   - Variant types (SNV, indel, CNV)
   - Quality metrics to check

3. **Population Genetics Analysis**
   - Expected allele frequency distribution
   - Hardy-Weinberg equilibrium considerations
   - Population stratification concerns
   - Ancestry analysis recommendations

4. **Shared Variants Analysis**
   - How to identify variants present in multiple samples
   - Criteria for pathogenic variant screening
   - Filtering strategies for cohort analysis
   - Recommended annotation tools (VEP, ANNOVAR)

5. **Recommended Analytical Pipeline**
   Step-by-step workflow:
   - Quality control (GATK best practices)
   - Variant calling standardization
   - Annotation and filtering
   - Statistical association testing
   - Pathway enrichment analysis
   - Data visualization

6. **Statistical Considerations**
   - Multiple testing correction (Bonferroni, FDR)
   - Case-control analysis strategies
   - Family-based analysis if applicable
   - Power calculations

7. **Research Database Integration**
   - ClinVar for clinical significance
   - gnomAD for population frequencies
   - ClinGen for gene-disease validity
   - COSMIC for cancer variants
   - dbGaP for research data

8. **Hypothesis Generation from Cohort**
   - What patterns to look for
   - Gene-level association testing
   - Pathway-level enrichment
   - Genotype-phenotype correlations

9. **Publication & Reporting**
   - Key figures to generate
   - Statistical tests to report
   - Supplementary data organization
   - Repository submission (dbGaP, EGA)

10. **Next Steps & Tools**
    - Recommended bioinformatics tools
    - Cloud computing resources
    - Collaboration opportunities
    - Data sharing guidelines

Provide practical, actionable research guidance.`;

      const { result: analysis } = await apiClient.invokeLLM(prompt);

      setProgress(100);
      setResults({
        cohort_name: cohortName,
        file_count: files.length,
        analysis: analysis,
        files: uploadedFiles
      });

    } catch (err) {
      console.error("Error analyzing cohort:", err);
      setError("Failed to analyze cohort. Please try again.");
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
      analysis: results.analysis,
      files: results.files.map(f => f.name)
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