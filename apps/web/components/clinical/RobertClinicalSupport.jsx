
import React, { useState, useEffect, useMemo } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from '../../lib/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  Loader2,
  Brain,
  AlertTriangle,
  TrendingUp,
  Stethoscope,
  FileText,
  Target,
  CheckCircle2,
  Info,
  Pill,
  AlertTriangle as AlertTriangleIcon
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

const MARKDOWN_COMPONENTS = {
  p: ({ children }) => <p className="mb-4 text-slate-800 leading-relaxed">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
  em: ({ children }) => <em className="text-purple-800">{children}</em>,
  ul: ({ children }) => <ul className="ml-6 mb-4 space-y-2 list-disc">{children}</ul>,
  ol: ({ children }) => <ol className="ml-6 mb-4 space-y-2 list-decimal">{children}</ol>,
  li: ({ children }) => <li className="text-slate-700">{children}</li>,
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold text-purple-900 mt-6 mb-4 pb-2 border-b-2 border-purple-200 flex items-center gap-2">
      <TrendingUp className="w-6 h-6" />
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold text-indigo-900 mt-5 mb-3 flex items-center gap-2">
      <CheckCircle2 className="w-5 h-5" />
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">
      {children}
    </h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="border-l-4 border-red-500 pl-4 my-4 bg-red-50 py-3 rounded-r">
      <div className="flex items-start gap-2">
        <AlertTriangleIcon className="w-5 h-5 text-red-600 mt-1 flex-shrink-0" />
        <div className="text-red-900 font-medium">{children}</div>
      </div>
    </blockquote>
  ),
  code: ({ inline, children }) =>
    inline ? (
      <code className="bg-slate-100 text-purple-800 px-1.5 py-0.5 rounded text-sm font-mono">
        {children}
      </code>
    ) : (
      <code className="block bg-slate-900 text-slate-100 p-4 rounded-lg my-4 overflow-x-auto">
        {children}
      </code>
    ),
  table: ({ children }) => (
    <div className="overflow-x-auto my-4">
      <table className="min-w-full divide-y divide-slate-200 border border-slate-200">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="px-4 py-2 bg-purple-50 text-left text-sm font-semibold text-purple-900">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2 border-t border-slate-200 text-sm text-slate-700">
      {children}
    </td>
  ),
};

export default function RobertClinicalSupport({ gene, disease, targets, userEducationLevel, currentUser: externalUser, onClose, includeDrugAnalysis = false }) {
  const [analysis, setAnalysis] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [medicalData, setMedicalData] = useState(null);
  const { user: authUser } = useAuth();
  const user = externalUser || authUser;

  useEffect(() => {
    loadMedicalData();
  }, [user?.email]);

  const loadMedicalData = async () => {
    setIsLoading(true);
    try {
      const records = await apiClient.getMedicalData('clinical_records');

      if (records && records.length > 0) {
        setMedicalData(records);
        await performClinicalAnalysis(user, records);
      } else {
        setAnalysis({
          no_data: true,
          message: "No medical data uploaded yet. Upload your medical records to receive personalized clinical insights."
        });
        setIsLoading(false);
      }
    } catch (err) {
      console.error("Error loading data:", err);
      setIsLoading(false);
    }
  };

  const performClinicalAnalysis = async (user, records) => {
    try {
      const educationContext = getEducationContext(userEducationLevel || user?.education_level);

      // Aggregate medical data
      const allRelevantGenes = [...new Set(records.flatMap(r => r.relevant_genes || []))];
      const allPhenotypes = [...new Set(records.flatMap(r => r.phenotypes_identified || []))];
      const recordSummaries = records.map(r => r.summary).filter(Boolean);

      // Handle both single target (legacy) and multiple targets (new)
      const analysisTargets = targets || (gene ? [{ type: 'gene', value: gene.symbol }] : disease ? [{ type: 'disease', value: disease }] : []);

      const isBatchAnalysis = analysisTargets.length > 1;

      const targetDescriptions = analysisTargets.map(t =>
        t.type === 'gene' ? `gene ${t.value}` : `disease ${t.value}`
      ).join(', ');

      const prompt = `You are Robert, an AI clinical decision support assistant. Provide comprehensive analysis of this patient's medical data in relation to ${isBatchAnalysis ? 'multiple targets' : 'the following target'}: ${targetDescriptions}.

**Patient Context:**
- Age: ${user?.age || 'Not specified'}
- Education Level: ${educationContext}
- Medical Records: ${records.length} uploaded

**Medical Data Summary:**
${recordSummaries.map((s, i) => `Record ${i + 1}: ${s}`).join('\n')}

**Identified Genes from Medical Data:**
${allRelevantGenes.length > 0 ? allRelevantGenes.join(', ') : 'None identified'}

**Identified Phenotypes/Conditions:**
${allPhenotypes.length > 0 ? allPhenotypes.join(', ') : 'None identified'}

${isBatchAnalysis ? `**Multi-Target Analysis Required:**
You are analyzing ${analysisTargets.length} different ${analysisTargets.length === analysisTargets.filter(t => t.type === 'gene').length ? 'genes' : analysisTargets.length === analysisTargets.filter(t => t.type === 'disease').length ? 'diseases' : 'genes/diseases'} simultaneously.

**Targets:**
${analysisTargets.map((t, i) => `${i + 1}. ${t.value} (${t.type})`).join('\n')}

**Cross-Reference Analysis Required:**
- How do these targets interact with each other?
- Are there overlapping phenotypes or pathways?
- Combined risk assessments
- Synergistic or conflicting implications` : ''}

${gene ? `**Gene Under Analysis:** ${gene.symbol} (${gene.name})
**Gene Information:**
- Location: ${gene.chromosome}:${gene.start}-${gene.end}
- Associated Phenotypes: ${gene.phenotypes?.map(p => p.name).join(', ') || 'Unknown'}
- AI Summary: ${gene.aiSummary}` : ''}

${disease ? `**Disease Under Analysis:** ${disease}` : ''}

${includeDrugAnalysis ? `
**PHARMACOGENOMICS & DRUG INTERACTION ANALYSIS REQUIRED:**

This is CRITICAL. You must include comprehensive drug-related analysis:

1. **Pharmacogenetic Profile:**
   - Based on identified genes (especially CYP450 enzymes, transporters), what is the patient's likely drug metabolism profile?
   - List specific genes affecting drug metabolism (CYP2D6, CYP2C19, CYP3A4, etc.) if present in data
   - Metabolizer status (poor, intermediate, normal, rapid, ultra-rapid) for relevant genes

2. **Drug Interactions & Contraindications:**
   - Which medications should be AVOIDED based on genetic profile?
   - Which medications require DOSE ADJUSTMENTS?
   - List specific drug names and their interactions
   - Severity levels: CRITICAL (avoid), HIGH (major concern), MODERATE (monitor), LOW (minor)

3. **Current Lab Results Integration:**
   - Based on blood tests/lab results, are there metabolic issues that affect drug processing?
   - Liver function, kidney function implications for drug clearance
   - Other lab abnormalities that contraindicate specific medications

4. **Medication Recommendations:**
   - Which drugs are SAFER alternatives based on genetic profile?
   - Personalized dosing recommendations
   - Medications that are well-tolerated given this genetic profile

5. **Warnings & Alerts:**
   - Highlight any CRITICAL drug-gene interactions
   - FDA-boxed warnings relevant to this patient
   - Drugs that require genetic testing before use

Use databases: PharmGKB, FDA pharmacogenomic biomarkers, CPIC guidelines, clinical pharmacogenetics literature.
` : ''}

**Your Task as Clinical Decision Support:**

1. **Medical Data Correlation Analysis**
   ${isBatchAnalysis ? '- Analyze correlations for EACH target individually' : '- Does the patient\'s medical data show connections to this target?'}
   ${isBatchAnalysis ? '- Identify overlaps and interactions between targets' : ''}
   - Are there genetic variants or phenotypes that align?
   - What's the strength of evidence for connections?

2. **Potential Diagnoses & Risk Assessment**
   ${isBatchAnalysis ? '- Combined risk assessment across all targets' : '- Based on medical data + target, what are potential diagnoses?'}
   - Risk level assessment (low/moderate/high)
   - Confidence level in assessments
   - Important caveats and limitations

3. **Gene-Phenotype Correlations**
   - Which patient phenotypes correlate with the target(s)?
   - Are there unexplained phenotypes?
   - Genotype-phenotype consistency analysis

4. **Diagnostic Recommendations**
   - What additional tests would be valuable?
   - Specific genetic tests or panels
   - Lab work or imaging studies
   - Timeline for testing (urgent/routine)

5. **Clinical Consultation Guidance**
   - Which specialists should be consulted?
   - Urgency level for consultation
   - Key questions to ask specialists
   - What to prepare for appointments

6. **Actionable Next Steps**
   - Immediate actions (if any)
   - Short-term recommendations (1-3 months)
   - Long-term monitoring plan
   - Lifestyle or preventive measures

7. **Patient Education & Resources**
   - Key concepts the patient should understand
   - Reliable resources for learning more
   - Support groups or advocacy organizations

**Critical Guidelines:**
- Be evidence-based and cite confidence levels
- Clearly distinguish between established/probable/speculative
- Use appropriate urgency markers (⚠️ for concerning findings)
- Balance thoroughness with clarity
- Tailor complexity to: ${educationContext}
- Always emphasize this is decision support, not diagnosis
- Recommend professional consultation for any concerns
${includeDrugAnalysis ? '- Use clear WARNING boxes for critical drug interactions' : ''}
${isBatchAnalysis ? '- Organize analysis by target, then provide cross-reference section' : ''}

Provide a comprehensive but accessible clinical analysis formatted in clear sections with markdown.`;

      const { result: response } = await apiClient.invokeLLM(prompt);

      // Check for concerning findings or drug warnings
      const hasConcerningFindings = response.toLowerCase().includes('urgent') ||
                                  response.toLowerCase().includes('immediate') ||
                                  response.toLowerCase().includes('critical');

      const hasDrugWarnings = includeDrugAnalysis && (
        response.toLowerCase().includes('contraindicated') ||
        response.toLowerCase().includes('avoid') ||
        response.toLowerCase().includes('warning')
      );

      // For single gene analysis
      const geneMatch = gene && allRelevantGenes.includes(gene.symbol);
      const phenotypeMatches = gene ?
        gene.phenotypes?.filter(p =>
          allPhenotypes.some(up =>
            up.toLowerCase().includes(p.name.toLowerCase()) ||
            p.name.toLowerCase().includes(up.toLowerCase())
          )
        ).map(p => p.name) || [] : [];

      setAnalysis({
        clinical_analysis: response,
        has_concerning_findings: hasConcerningFindings,
        has_drug_warnings: hasDrugWarnings,
        gene_match: geneMatch,
        phenotype_matches: phenotypeMatches,
        is_batch: isBatchAnalysis,
        target_count: analysisTargets.length,
        includes_pharmacogenomics: includeDrugAnalysis
      });

    } catch (err) {
      console.error("Error performing clinical analysis:", err);
      setAnalysis({
        error: true,
        message: "Failed to complete clinical analysis. Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "a patient with general education - use simple, clear language avoiding medical jargon";
    }
    if (level === 'undergraduate') {
      return "a patient with undergraduate education - use accessible scientific language with brief explanations";
    }
    if (level === 'graduate' || level === 'phd') {
      return "a patient with advanced education - use scientific terminology appropriately";
    }
    if (level === 'medical_professional') {
      return "a healthcare professional - use clinical terminology and focus on differential diagnoses";
    }
    return "a patient seeking medical information - be clear and supportive";
  };

  if (isLoading) {
    return (
      <Card className="shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center gap-4">
            <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
            <div className="text-center">
              <h3 className="text-xl font-semibold text-purple-900 mb-2">
                Robert is Analyzing Your Medical Data...
              </h3>
              <p className="text-purple-700">
                Correlating with {gene ? `gene ${gene.symbol}` : `disease ${disease}`}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analysis?.no_data) {
    return (
      <Card className="shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-amber-600" />
            No Medical Data Available
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert className="bg-white border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              {analysis.message}
            </AlertDescription>
          </Alert>
          <div className="mt-4 space-y-2">
            <p className="text-sm text-slate-700">
              To receive personalized clinical insights from Robert, please upload:
            </p>
            <ul className="text-sm text-slate-600 ml-4 space-y-1">
              <li>• Genetic test results (23andMe, AncestryDNA, clinical tests)</li>
              <li>• Lab reports (blood work, biomarkers)</li>
              <li>• Medical records or diagnoses</li>
              <li>• Symptom descriptions</li>
            </ul>
            <Button className="mt-4 w-full" onClick={onClose}>
              Go to Medical Data Upload
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (analysis?.error) {
    return (
      <Card className="shadow-lg border-red-200">
        <CardContent className="py-8">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{analysis.message}</AlertDescription>
          </Alert>
          {onClose && (
            <Button variant="outline" onClick={onClose} className="mt-4 w-full">
              Close
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card className="shadow-lg bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-purple-200">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
                <Brain className="w-6 h-6 text-white" />
              </div>
              <div>
                <CardTitle className="text-2xl">Robert's Clinical Analysis</CardTitle>
                <p className="text-slate-600 mt-1">
                  {analysis?.is_batch
                    ? `Multi-target analysis (${analysis.target_count} targets)`
                    : gene
                      ? `Decision support for gene ${gene.symbol}`
                      : `Decision support for disease ${disease}`}
                </p>
              </div>
            </div>
            {onClose && (
              <Button variant="outline" onClick={onClose}>
                Close
              </Button>
            )}
          </div>
          {analysis?.includes_pharmacogenomics && (
            <div className="mt-3 flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
              <Pill className="w-5 h-5 text-amber-600" />
              <span className="text-sm font-medium text-amber-900">
                Pharmacogenomics & drug interaction analysis included
              </span>
            </div>
          )}
        </CardHeader>
      </Card>

      {/* Alerts */}
      {analysis?.has_drug_warnings && (
        <Alert className="bg-red-50 border-red-300 border-2">
          <AlertTriangleIcon className="h-5 w-5 text-red-600" />
          <AlertDescription className="text-red-900">
            <strong className="text-lg">⚠️ DRUG WARNINGS DETECTED</strong>
            <p className="mt-1">Robert has identified potential drug interactions or contraindications. Review the analysis below carefully and consult your healthcare provider immediately.</p>
          </AlertDescription>
        </Alert>
      )}

      {analysis?.has_concerning_findings && !analysis?.has_drug_warnings && (
        <Alert className="bg-red-50 border-red-200">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            <strong>Important:</strong> Robert has identified findings that may require prompt medical attention. Please review the recommendations below and consult with healthcare professionals.
          </AlertDescription>
        </Alert>
      )}

      {/* Match Indicators */}
      <div className="grid md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-5 h-5 text-blue-600" />
              <span className="font-semibold text-slate-900">Medical Records</span>
            </div>
            <p className="text-2xl font-bold text-blue-600">{medicalData?.length || 0}</p>
            <p className="text-xs text-slate-600">Analyzed</p>
          </CardContent>
        </Card>

        {analysis?.is_batch && (
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-purple-600" />
                <span className="font-semibold text-slate-900">Analysis Targets</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">{analysis.target_count}</p>
              <p className="text-xs text-purple-700">Genes & Diseases</p>
            </CardContent>
          </Card>
        )}

        {gene && analysis?.gene_match !== undefined && (
          <Card className={analysis.gene_match ? "bg-green-50 border-green-200" : "bg-slate-50"}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                {analysis.gene_match ? (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                ) : (
                  <Info className="w-5 h-5 text-slate-600" />
                )}
                <span className="font-semibold text-slate-900">Gene Match</span>
              </div>
              <p className={`text-sm ${analysis.gene_match ? 'text-green-700' : 'text-slate-600'}`}>
                {analysis.gene_match
                  ? `${gene.symbol} found in your data`
                  : `${gene.symbol} not in uploaded data`}
              </p>
            </CardContent>
          </Card>
        )}

        {analysis?.phenotype_matches && analysis.phenotype_matches.length > 0 && (
          <Card className="bg-purple-50 border-purple-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <Target className="w-5 h-5 text-purple-600" />
                <span className="font-semibold text-slate-900">Phenotype Matches</span>
              </div>
              <p className="text-2xl font-bold text-purple-600">
                {analysis.phenotype_matches.length}
              </p>
              <p className="text-xs text-purple-700">
                {analysis.phenotype_matches.slice(0, 2).join(', ')}
                {analysis.phenotype_matches.length > 2 && '...'}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Clinical Analysis */}
      <Card className="shadow-lg">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-purple-600" />
            Comprehensive Clinical Analysis
            {analysis?.includes_pharmacogenomics && (
              <Badge className="bg-amber-600 text-white ml-2">
                <Pill className="w-3 h-3 mr-1" />
                + Drug Screening
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown components={MARKDOWN_COMPONENTS}>
              {analysis.clinical_analysis}
            </ReactMarkdown>
          </div>
        </CardContent>
      </Card>

      {/* Disclaimer */}
      <Alert className="bg-amber-50 border-amber-200">
        <AlertTriangle className="h-4 w-4 text-amber-600" />
        <AlertDescription className="text-amber-900">
          <strong>Medical Disclaimer:</strong> Robert provides clinical decision support and educational information only. This analysis is not a medical diagnosis. Always consult qualified healthcare professionals for medical advice, diagnosis, and treatment decisions. {analysis?.has_drug_warnings && 'Drug interaction warnings require immediate professional consultation.'} In case of medical emergency, call emergency services immediately.
        </AlertDescription>
      </Alert>
    </div>
  );
}
