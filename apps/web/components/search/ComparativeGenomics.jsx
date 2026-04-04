import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Loader2,
  Sparkles,
  Dna,
  Box,
  Network,
  Activity,
  Target,
  TrendingUp,
  AlertCircle
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

export default function ComparativeGenomics({ genes, onClose, userEducationLevel }) {
  const [comparisonData, setComparisonData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    loadComparativeAnalysis();
  }, [genes]);

  const loadComparativeAnalysis = async () => {
    setIsLoading(true);
    try {
      const educationContext = getEducationContext(userEducationLevel);
      
      const prompt = `You are Robert, an expert comparative genomics analyst. Provide a comprehensive comparison of these genes:

**Genes to Compare:**
${genes.map((g, i) => `${i + 1}. ${g.symbol} (${g.name})`).join('\n')}

**User Education Level:** ${educationContext}

**Your Task:**
Provide a detailed comparative analysis covering:

1. **Overview Comparison**
   - Basic gene information side-by-side
   - Chromosomal locations and proximity
   - Gene sizes and structure
   - Evolutionary relationships

2. **Phenotype Differences**
   - Unique phenotypes for each gene
   - Overlapping phenotypes
   - Disease associations contrast
   - Clinical significance differences

3. **Functional Domain Comparison**
   - Domain architecture differences
   - Shared vs unique domains
   - Functional implications of domain differences

4. **Protein Structure Insights**
   - Structure type comparison (if available)
   - Key structural differences
   - Structure-function relationships

5. **Interaction Network Analysis**
   - Unique protein partners for each gene
   - Shared interaction partners
   - Pathway involvement differences
   - Network hub status

6. **Expression Pattern Comparison**
   - Tissue-specific expression differences
   - Co-expression patterns
   - Expression level contrasts

7. **Functional Divergence/Convergence**
   - Are these genes functionally similar or different?
   - Evolutionary relationship (paralogs, homologs?)
   - Functional redundancy or specialization
   - Key functional distinctions

8. **Clinical & Research Implications**
   - Therapeutic targeting differences
   - Research opportunities
   - Personalized medicine considerations

Tailor complexity to user's education level. Be comprehensive but clear.`;

      const { result: raw } = await apiClient.invokeLLM(prompt);
      const response = typeof raw === 'string' ? JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}') : raw;

      setComparisonData(response);
    } catch (err) {
      console.error("Error loading comparative analysis:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "high school student - use simple, clear language with everyday analogies";
    }
    if (level === 'undergraduate') {
      return "undergraduate student - use scientific terminology with explanations";
    }
    if (level === 'graduate' || level === 'phd') {
      return "graduate/PhD student - use advanced technical language";
    }
    if (level === 'medical_professional') {
      return "medical professional - focus on clinical significance";
    }
    return "researcher - use comprehensive scientific terminology";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg">
            <CardContent className="py-20">
              <div className="flex flex-col items-center justify-center gap-4">
                <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
                <div className="text-center">
                  <h3 className="text-xl font-semibold text-slate-900 mb-2">
                    Robert is Analyzing Comparative Genomics...
                  </h3>
                  <p className="text-slate-600">
                    Comparing {genes.length} genes across multiple dimensions
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!comparisonData) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
        <div className="max-w-6xl mx-auto">
          <Card className="shadow-lg">
            <CardContent className="py-20 text-center">
              <AlertCircle className="w-12 h-12 text-amber-600 mx-auto mb-4" />
              <p className="text-slate-600">Failed to load comparative analysis</p>
              <Button onClick={onClose} className="mt-4">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Search
              </Button>
            </CardContent>
          </Card>
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
            className="mb-4 min-h-[44px] touch-manipulation"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Search
          </Button>

          <Card className="bg-gradient-to-r from-purple-50 via-indigo-50 to-blue-50 border-purple-200 shadow-lg">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Comparative Genomics Analysis</CardTitle>
                  <p className="text-slate-600 mt-1">
                    Comparing {genes.length} genes: {genes.map(g => g.symbol).join(', ')}
                  </p>
                </div>
              </div>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 mb-6">
            <TabsTrigger value="overview" className="min-h-[44px]">
              <Target className="w-4 h-4 mr-2" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="phenotypes" className="min-h-[44px]">
              <Dna className="w-4 h-4 mr-2" />
              Phenotypes
            </TabsTrigger>
            <TabsTrigger value="structure" className="min-h-[44px]">
              <Box className="w-4 h-4 mr-2" />
              Structure/Domains
            </TabsTrigger>
            <TabsTrigger value="networks" className="min-h-[44px]">
              <Network className="w-4 h-4 mr-2" />
              Networks/Expression
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Summary Card */}
            <Card className="shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-600" />
                  Robert's Comparative Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-3 text-slate-800 leading-relaxed">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                      ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2">{children}</ul>,
                      li: ({ children }) => <li className="text-slate-700">{children}</li>,
                      h3: ({ children }) => <h3 className="text-lg font-semibold text-purple-900 mt-4 mb-2">{children}</h3>,
                    }}
                  >
                    {comparisonData.summary}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>

            {/* Overview Comparison */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Gene Overview Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{comparisonData.overview_comparison}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>

            {/* Functional Divergence */}
            {comparisonData.functional_divergence && (
              <Card className="shadow-lg bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-amber-600" />
                    Functional Divergence/Convergence
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Badge className="bg-amber-600 mb-2">
                      {comparisonData.functional_divergence.relationship}
                    </Badge>
                    {comparisonData.functional_divergence.similarity_score && (
                      <Badge variant="outline" className="ml-2">
                        {comparisonData.functional_divergence.similarity_score}
                      </Badge>
                    )}
                  </div>

                  {comparisonData.functional_divergence.key_distinctions?.length > 0 && (
                    <div>
                      <h4 className="font-semibold text-amber-900 mb-2">Key Distinctions:</h4>
                      <ul className="space-y-1">
                        {comparisonData.functional_divergence.key_distinctions.map((distinction, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-amber-800">
                            <span className="text-amber-600 mt-1">•</span>
                            <span>{distinction}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {comparisonData.functional_divergence.clinical_implications && (
                    <div className="mt-4 p-4 bg-white rounded-lg">
                      <h4 className="font-semibold text-slate-900 mb-2">Clinical Implications:</h4>
                      <p className="text-sm text-slate-700">
                        {comparisonData.functional_divergence.clinical_implications}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Phenotypes Tab */}
          <TabsContent value="phenotypes" className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Phenotype Comparison</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Shared Phenotypes */}
                {comparisonData.phenotype_analysis?.shared_phenotypes?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                      <div className="w-2 h-2 bg-green-600 rounded-full"></div>
                      Shared Phenotypes ({comparisonData.phenotype_analysis.shared_phenotypes.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {comparisonData.phenotype_analysis.shared_phenotypes.map((phenotype, idx) => (
                        <Badge key={idx} className="bg-green-100 text-green-800">
                          {phenotype}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Unique Phenotypes */}
                {comparisonData.phenotype_analysis?.unique_phenotypes && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {Object.entries(comparisonData.phenotype_analysis.unique_phenotypes).map(([gene, phenotypes]) => (
                      <div key={gene} className="bg-slate-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
                          <div className="w-2 h-2 bg-blue-600 rounded-full"></div>
                          {gene} Unique Phenotypes
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {phenotypes.map((phenotype, idx) => (
                            <Badge key={idx} variant="secondary">
                              {phenotype}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Disease Associations */}
                {comparisonData.phenotype_analysis?.disease_associations && (
                  <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <h4 className="font-semibold text-blue-900 mb-2">Disease Associations:</h4>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{comparisonData.phenotype_analysis.disease_associations}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Structure/Domains Tab */}
          <TabsContent value="structure" className="space-y-6">
            {/* Domain Comparison */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Box className="w-5 h-5 text-indigo-600" />
                  Functional Domain Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Shared Domains */}
                {comparisonData.domain_comparison?.shared_domains?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">
                      Shared Domains ({comparisonData.domain_comparison.shared_domains.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {comparisonData.domain_comparison.shared_domains.map((domain, idx) => (
                        <Badge key={idx} className="bg-indigo-100 text-indigo-800">
                          {domain}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Gene-Specific Domains */}
                {comparisonData.domain_comparison?.gene_domains && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {Object.entries(comparisonData.domain_comparison.gene_domains).map(([gene, domains]) => (
                      <div key={gene} className="bg-slate-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-slate-900 mb-3">
                          {gene} Domains
                        </h3>
                        <div className="space-y-1">
                          {domains.map((domain, idx) => (
                            <div key={idx} className="text-sm text-slate-700 flex items-start gap-2">
                              <span className="text-indigo-600">•</span>
                              <span>{domain}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Functional Implications */}
                {comparisonData.domain_comparison?.functional_implications && (
                  <div className="mt-6 p-4 bg-indigo-50 rounded-lg border border-indigo-200">
                    <h4 className="font-semibold text-indigo-900 mb-2">Functional Implications:</h4>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{comparisonData.domain_comparison.functional_implications}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Structure Comparison */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Protein Structure Comparison</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown>{comparisonData.structure_comparison}</ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Networks/Expression Tab */}
          <TabsContent value="networks" className="space-y-6">
            {/* Interaction Networks */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Network className="w-5 h-5 text-emerald-600" />
                  Interaction Network Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Shared Partners */}
                {comparisonData.interaction_comparison?.shared_partners?.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-slate-900 mb-3">
                      Shared Interaction Partners ({comparisonData.interaction_comparison.shared_partners.length})
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {comparisonData.interaction_comparison.shared_partners.map((partner, idx) => (
                        <Badge key={idx} className="bg-emerald-100 text-emerald-800">
                          {partner}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Unique Partners */}
                {comparisonData.interaction_comparison?.unique_partners && (
                  <div className="grid md:grid-cols-2 gap-6">
                    {Object.entries(comparisonData.interaction_comparison.unique_partners).map(([gene, partners]) => (
                      <div key={gene} className="bg-slate-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-slate-900 mb-3">
                          {gene} Unique Partners
                        </h3>
                        <div className="flex flex-wrap gap-2">
                          {partners.map((partner, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {partner}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Pathway Differences */}
                {comparisonData.interaction_comparison?.pathway_differences && (
                  <div className="mt-6 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                    <h4 className="font-semibold text-emerald-900 mb-2">Pathway Differences:</h4>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{comparisonData.interaction_comparison.pathway_differences}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Expression Comparison */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-cyan-600" />
                  Expression Pattern Comparison
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {comparisonData.expression_comparison?.tissue_specificity && (
                  <div className="p-4 bg-cyan-50 rounded-lg border border-cyan-200">
                    <h4 className="font-semibold text-cyan-900 mb-2">Tissue Specificity:</h4>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{comparisonData.expression_comparison.tissue_specificity}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {comparisonData.expression_comparison?.expression_patterns && (
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <h4 className="font-semibold text-slate-900 mb-2">Expression Patterns:</h4>
                    <div className="prose prose-sm max-w-none">
                      <ReactMarkdown>{comparisonData.expression_comparison.expression_patterns}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}