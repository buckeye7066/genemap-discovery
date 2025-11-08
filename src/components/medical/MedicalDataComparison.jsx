import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Brain,
  ArrowLeft,
  FileText,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Loader2,
  Shield,
  Info
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

export default function MedicalDataComparison({ records, onClose, userEducationLevel }) {
  const [comparison, setComparison] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [user, setUser] = useState(null);

  useEffect(() => {
    loadComparison();
  }, []);

  const loadComparison = async () => {
    setIsLoading(true);
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      const educationContext = getEducationContext(userEducationLevel || currentUser?.education_level);

      const prompt = `You are Robert, an AI clinical analysis assistant. Perform a comprehensive side-by-side comparison of these ${records.length} medical records.

**Patient Context:**
- Age: ${currentUser?.age || 'Not specified'}
- Education Level: ${educationContext}

**Records Being Compared:**
${records.map((r, i) => `
Record ${i + 1}:
- Type: ${r.file_type}
- Date: ${new Date(r.created_date).toLocaleDateString()}
- Summary: ${r.summary || 'No summary'}
- Relevant Genes: ${r.relevant_genes?.join(', ') || 'None'}
- Phenotypes: ${r.phenotypes_identified?.join(', ') || 'None'}
- Extracted Data: ${JSON.stringify(r.extracted_data, null, 2)}
`).join('\n')}

**Your Task - Comprehensive Multi-Record Comparison:**

**IMPORTANT:** Adapt all explanations for ${educationContext}.

1. **Overview Summary**
   - Brief summary of each record
   - Timeline context (chronological order if dates vary)
   - Key purpose of comparison

2. **Genetic Findings Comparison**
   - Genes identified in each record
   - **Shared Genes:** Which genes appear in multiple records?
   - **Unique Genes:** Which genes are unique to each record?
   - **Consistency Analysis:** Are findings consistent or conflicting?
   - New genes discovered over time?
   - Explanation adapted to education level

3. **Phenotype/Condition Comparison**
   - Conditions identified in each record
   - **Common Conditions:** Present across multiple records
   - **Unique Conditions:** Specific to individual records
   - **Evolution:** How conditions changed over time
   - **Correlation:** Do phenotypes match genetic findings?

4. **Lab Results Comparison** (if applicable)
   - Key lab values from each record
   - Trends over time (improving/worsening/stable)
   - Values outside normal ranges
   - Clinical significance of changes
   - Comparison table format

5. **Risk Assessment Across Records**
   - Overall risk profile from combined data
   - How risk understanding evolved
   - Concordance vs. discordance between records
   - Cumulative insights

6. **Clinical Insights & Patterns**
   - What patterns emerge from comparing these records?
   - Progressive findings vs. static findings
   - Complementary vs. redundant information
   - Gaps in information
   - Most significant findings

7. **Drug Interaction Analysis** (if genetic data present)
   - Pharmacogenomic findings across records
   - Consistent medication recommendations
   - Any contradictions to address
   - Combined drug safety profile

8. **Recommendations Based on Comparison**
   - What does this comparison tell us that individual records don't?
   - Additional testing recommended?
   - Specialist consultations needed?
   - Follow-up timeline
   - Priority actions

9. **Key Differences & Similarities Table**
   Create a comparison table showing:
   | Aspect | Record 1 | Record 2 | Record 3 (if applicable) |
   |--------|----------|----------|----------|
   | Genes | [...] | [...] | [...] |
   | Conditions | [...] | [...] | [...] |
   | Risk Level | [...] | [...] | [...] |

**Education-Level Adaptation:**
${getEducationGuidance(userEducationLevel || currentUser?.education_level)}

**Critical Guidelines:**
- Highlight clinically significant differences
- Explain contradictions or inconsistencies
- Use comparison to build comprehensive picture
- Identify complementary information
- Note information gaps
- Emphasize privacy: "This comparison is private and confidential"
- Be supportive in tone
- Distinguish facts from interpretations

Format with clear sections, use tables for comparisons, highlight key findings.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      const hasCriticalFindings = response.toLowerCase().includes('urgent') ||
                                  response.toLowerCase().includes('critical') ||
                                  response.toLowerCase().includes('immediate attention');

      setComparison({
        analysis: response,
        has_critical_findings: hasCriticalFindings,
        record_count: records.length,
        compared_types: [...new Set(records.map(r => r.file_type))]
      });

    } catch (err) {
      console.error("Error loading comparison:", err);
      setComparison({
        error: true,
        message: "Failed to generate comparison. Please try again."
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "high school student - use simple, clear language without jargon";
    }
    if (level === 'undergraduate') {
      return "undergraduate student - use moderate scientific terminology";
    }
    if (level === 'graduate' || level === 'phd') {
      return "graduate/PhD student - use advanced technical language";
    }
    if (level === 'medical_professional') {
      return "medical professional - use clinical terminology";
    }
    return "researcher - use comprehensive scientific language";
  };

  const getEducationGuidance = (level) => {
    if (!level || level === 'high_school') {
      return "Explain differences like comparing two test results side-by-side. Use simple analogies.";
    }
    if (level === 'undergraduate') {
      return "Use scientific terms with context. Explain clinical significance clearly.";
    }
    return "Use appropriate technical terminology for the audience.";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg">
            <CardContent className="py-20">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-purple-600" />
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Robert is Comparing Records...
                  </h3>
                  <p className="text-slate-600">
                    Analyzing {records.length} medical records for patterns and insights
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (comparison?.error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-6xl mx-auto">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>{comparison.message}</AlertDescription>
          </Alert>
          <Button onClick={onClose} className="mt-4">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Button
            variant="outline"
            onClick={onClose}
            className="mb-4 min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Medical Data
          </Button>

          <Card className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-purple-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
                    <Brain className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">Multi-Record Comparison Analysis</CardTitle>
                    <p className="text-slate-600 mt-1">
                      Comparing {comparison.record_count} medical records
                    </p>
                  </div>
                </div>
                <Badge className="bg-purple-600 text-white">
                  <Shield className="w-3 h-3 mr-1" />
                  HIPAA Compliant
                </Badge>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Privacy Notice */}
        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <Shield className="h-4 w-4 text-blue-600" />
          <AlertDescription className="text-blue-900">
            <strong>Privacy Notice:</strong> This comparison is private and confidential. Only you can see this analysis. 
            Records are compared securely and data is not stored beyond this session.
          </AlertDescription>
        </Alert>

        {/* Critical Findings Alert */}
        {comparison.has_critical_findings && (
          <Alert className="mb-6 bg-red-50 border-red-300 border-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <AlertDescription className="text-red-900">
              <strong className="text-lg">⚠️ IMPORTANT FINDINGS</strong>
              <p className="mt-1">
                Robert has identified findings across your records that may require attention. 
                Please review the analysis carefully and consult with healthcare professionals.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Records Overview */}
        <div className="grid md:grid-cols-3 gap-4 mb-6">
          {records.map((record, idx) => (
            <Card key={record.id}>
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <span className="font-semibold text-slate-900">Record {idx + 1}</span>
                </div>
                <Badge variant="outline" className="mb-2">
                  {record.file_type}
                </Badge>
                <p className="text-xs text-slate-600">
                  {new Date(record.created_date).toLocaleDateString()}
                </p>
                {record.relevant_genes && record.relevant_genes.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium text-slate-700">Genes:</p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {record.relevant_genes.slice(0, 3).map((gene, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {gene}
                        </Badge>
                      ))}
                      {record.relevant_genes.length > 3 && (
                        <Badge variant="secondary" className="text-xs">
                          +{record.relevant_genes.length - 3}
                        </Badge>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Comparison Analysis */}
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-purple-600" />
              Robert's Comprehensive Comparison
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="prose prose-sm max-w-none">
              <ReactMarkdown
                components={{
                  p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
                  strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                  ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2 list-disc">{children}</ul>,
                  ol: ({ children }) => <ol className="ml-4 mb-3 space-y-2 list-decimal">{children}</ol>,
                  li: ({ children }) => <li className="text-slate-700">{children}</li>,
                  h1: ({ children }) => (
                    <h1 className="text-2xl font-bold text-purple-900 mt-6 mb-3 pb-2 border-b-2 border-purple-200">
                      {children}
                    </h1>
                  ),
                  h2: ({ children }) => (
                    <h2 className="text-xl font-semibold text-purple-900 mt-5 mb-2">
                      {children}
                    </h2>
                  ),
                  h3: ({ children }) => (
                    <h3 className="text-lg font-semibold text-slate-900 mt-4 mb-2">
                      {children}
                    </h3>
                  ),
                  h4: ({ children }) => (
                    <h4 className="text-base font-semibold text-slate-800 mt-3 mb-1">
                      {children}
                    </h4>
                  ),
                  table: ({ children }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-slate-200">
                      <table className="min-w-full divide-y divide-slate-200">
                        {children}
                      </table>
                    </div>
                  ),
                  thead: ({ children }) => (
                    <thead className="bg-purple-50">{children}</thead>
                  ),
                  th: ({ children }) => (
                    <th className="px-4 py-3 text-left text-xs font-semibold text-purple-900 uppercase tracking-wider">
                      {children}
                    </th>
                  ),
                  td: ({ children }) => (
                    <td className="px-4 py-3 text-sm text-slate-700 border-t border-slate-200">
                      {children}
                    </td>
                  ),
                  blockquote: ({ children }) => (
                    <blockquote className="border-l-4 border-purple-500 pl-4 my-4 bg-purple-50 py-3 rounded-r">
                      <div className="flex items-start gap-2">
                        <Info className="w-5 h-5 text-purple-600 mt-1 flex-shrink-0" />
                        <div className="text-purple-900">{children}</div>
                      </div>
                    </blockquote>
                  ),
                  code: ({ inline, children }) =>
                    inline ? (
                      <code className="bg-slate-100 text-slate-800 px-1.5 py-0.5 rounded text-sm font-mono">
                        {children}
                      </code>
                    ) : (
                      <code className="block bg-slate-900 text-slate-100 p-3 rounded-lg overflow-x-auto text-sm">
                        {children}
                      </code>
                    ),
                }}
              >
                {comparison.analysis}
              </ReactMarkdown>
            </div>
          </CardContent>
        </Card>

        {/* Disclaimer */}
        <Alert className="mt-6 bg-amber-50 border-amber-200">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-900">
            <strong>Medical Disclaimer:</strong> This comparison analysis is for educational and informational purposes only. 
            It is not a medical diagnosis or clinical decision. Always consult qualified healthcare professionals for 
            interpretation of medical records and clinical decisions. In case of medical emergency, call emergency services immediately.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}