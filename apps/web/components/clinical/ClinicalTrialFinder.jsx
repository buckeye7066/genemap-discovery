import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2,
  Search,
  ExternalLink,
  MapPin,
  Users,
  Calendar,
  CheckCircle2,
  Info,
  Brain,
  Filter
} from "lucide-react";
import ReactMarkdown from 'react-markdown';

export default function ClinicalTrialFinder({ 
  geneticData = null, 
  medicalContext = null,
  userEducationLevel = null 
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [trials, setTrials] = useState(null);
  const [robertAnalysis, setRobertAnalysis] = useState(null);

  const handleSearch = async (autoQuery = null) => {
    const query = autoQuery || searchQuery;
    if (!query.trim() && !geneticData && !medicalContext) return;

    setIsSearching(true);
    try {
      // Build search context
      let searchContext = query.trim();
      if (geneticData) {
        searchContext = `Gene: ${geneticData.gene}, Variant: ${geneticData.variant}`;
      } else if (medicalContext) {
        searchContext = `Conditions: ${medicalContext.conditions?.join(', ')}, Genes: ${medicalContext.genes?.join(', ')}`;
      }

      const educationContext = getEducationContext(userEducationLevel);

      const prompt = `You are a clinical trial matching specialist. Search ClinicalTrials.gov for relevant trials and provide personalized recommendations.

**Search Context:**
${searchContext}

${geneticData ? `
**Genetic Information:**
- Gene: ${geneticData.gene}
- Variant: ${geneticData.variant}
- Clinical Significance: ${geneticData.clinical_significance || 'Unknown'}
` : ''}

${medicalContext ? `
**Medical Context:**
- Patient Age: ${medicalContext.age || 'Not specified'}
- Conditions: ${medicalContext.conditions?.join(', ') || 'None specified'}
- Relevant Genes: ${medicalContext.genes?.join(', ') || 'None specified'}
- Current Treatments: ${medicalContext.treatments?.join(', ') || 'None specified'}
` : ''}

**Audience:** ${educationContext}

**Your Task - Clinical Trial Matching:**

1. **Relevant Clinical Trials (5-10 trials)**
   For each trial provide:
   - NCT ID (e.g., NCT12345678)
   - Official Title
   - Brief Summary (2-3 sentences)
   - Phase (I, II, III, IV)
   - Status (Recruiting, Active, Completed)
   - Study Type (Interventional, Observational)
   - Primary Outcome Measures
   - Locations (countries/major cities)
   - Estimated Enrollment
   - Direct ClinicalTrials.gov URL

2. **Eligibility Screening**
   For each trial, assess:
   - Likely eligible? (Yes/Maybe/No/Unknown)
   - Key inclusion criteria match
   - Key exclusion criteria concerns
   - Additional testing needed for eligibility

3. **Personalized Ranking**
   Rank trials 1-10 by relevance based on:
   - Genetic match (if genetic data provided)
   - Condition match
   - Geographic feasibility (if location data available)
   - Phase and status
   - Novelty of intervention

4. **Robert's Personalized Recommendations**
   For top 3 trials, provide:
   - Why this trial is particularly relevant
   - Potential benefits specific to patient profile
   - Considerations or concerns
   - Questions to ask the research team

5. **Trial Participation Guidance**
   - How to contact trial coordinators
   - Questions to ask before enrolling
   - Understanding informed consent
   - Patient rights in clinical trials
   - Resources for support

6. **Alternative Options**
   - Expanded access programs
   - Compassionate use
   - Off-label treatment options
   - Support groups and advocacy

**Critical Guidelines:**
- Use ClinicalTrials.gov as reference
- Be realistic about eligibility
- Emphasize patient autonomy
- Explain risks and benefits clearly
- Adapt complexity to ${educationContext}
- Include proper disclaimers

Search comprehensively and provide actionable information.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: true,
        response_json_schema: {
          type: "object",
          properties: {
            trials: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  nct_id: { type: "string" },
                  title: { type: "string" },
                  summary: { type: "string" },
                  phase: { type: "string" },
                  status: { type: "string" },
                  study_type: { type: "string" },
                  locations: { type: "string" },
                  enrollment: { type: "string" },
                  url: { type: "string" },
                  eligibility_likely: { type: "string" },
                  relevance_rank: { type: "number" }
                }
              }
            },
            personalized_analysis: { type: "string" }
          }
        }
      });

      setTrials(response.trials || []);
      setRobertAnalysis(response.personalized_analysis);

    } catch (err) {
      console.error("Error searching trials:", err);
      setTrials([]);
      setRobertAnalysis("Failed to search clinical trials. Please try again.");
    } finally {
      setIsSearching(false);
    }
  };

  const getEducationContext = (level) => {
    if (!level || level === 'high_school') {
      return "patient with general education - use simple, clear language";
    }
    if (level === 'undergraduate') {
      return "patient with some scientific background - use accessible medical terms";
    }
    if (level === 'graduate' || level === 'phd') {
      return "patient with advanced education - use technical language appropriately";
    }
    if (level === 'medical_professional') {
      return "healthcare professional - use clinical terminology";
    }
    return "patient seeking clinical trial information - be clear and supportive";
  };

  const getStatusColor = (status) => {
    const lower = status?.toLowerCase() || '';
    if (lower.includes('recruiting')) return 'bg-green-100 text-green-800';
    if (lower.includes('active')) return 'bg-blue-100 text-blue-800';
    if (lower.includes('completed')) return 'bg-slate-100 text-slate-800';
    if (lower.includes('suspended') || lower.includes('terminated')) return 'bg-red-100 text-red-800';
    return 'bg-slate-100 text-slate-800';
  };

  const getEligibilityColor = (eligibility) => {
    const lower = eligibility?.toLowerCase() || '';
    if (lower === 'yes') return 'bg-green-600 text-white';
    if (lower === 'maybe') return 'bg-amber-600 text-white';
    if (lower === 'no') return 'bg-red-600 text-white';
    return 'bg-slate-600 text-white';
  };

  // Auto-search if genetic or medical context provided
  React.useEffect(() => {
    if ((geneticData || medicalContext) && !trials) {
      handleSearch('auto');
    }
  }, [geneticData, medicalContext]);

  return (
    <div className="space-y-6">
      <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            Clinical Trial Finder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-blue-50 border-blue-200">
            <Info className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-900 text-sm">
              <strong>ClinicalTrials.gov Integration:</strong> Search for relevant clinical trials 
              based on your genetic data, medical conditions, or research interests. Robert provides 
              personalized recommendations and eligibility guidance.
            </AlertDescription>
          </Alert>

          {!geneticData && !medicalContext && (
            <div className="flex gap-2">
              <Input
                placeholder="Search trials (e.g., BRCA1, breast cancer, Alzheimer's)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
                className="flex-1"
              />
              <Button
                onClick={() => handleSearch()}
                disabled={isSearching || !searchQuery.trim()}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
              </Button>
            </div>
          )}

          {(geneticData || medicalContext) && (
            <div className="bg-white p-4 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-900 mb-2 text-sm">
                Searching trials based on:
              </h4>
              {geneticData && (
                <div className="text-sm text-blue-800">
                  <p>Gene: <Badge className="bg-blue-600 text-white">{geneticData.gene}</Badge></p>
                  {geneticData.variant && (
                    <p className="mt-1">Variant: <code className="bg-blue-100 px-2 py-1 rounded">{geneticData.variant}</code></p>
                  )}
                </div>
              )}
              {medicalContext && (
                <div className="text-sm text-blue-800 space-y-1">
                  {medicalContext.conditions && medicalContext.conditions.length > 0 && (
                    <p>Conditions: {medicalContext.conditions.map((c, i) => (
                      <Badge key={i} variant="outline" className="mr-1">{c}</Badge>
                    ))}</p>
                  )}
                  {medicalContext.genes && medicalContext.genes.length > 0 && (
                    <p>Genes: {medicalContext.genes.map((g, i) => (
                      <Badge key={i} className="bg-green-600 text-white mr-1">{g}</Badge>
                    ))}</p>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {isSearching && (
        <Card className="shadow-lg">
          <CardContent className="py-12">
            <div className="flex flex-col items-center gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-blue-600" />
              <div className="text-center">
                <h3 className="text-xl font-semibold text-slate-900 mb-2">
                  Searching ClinicalTrials.gov...
                </h3>
                <p className="text-slate-600">
                  Finding relevant trials and analyzing eligibility
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {trials && trials.length > 0 && (
        <>
          {/* Robert's Analysis */}
          {robertAnalysis && (
            <Card className="shadow-lg bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Brain className="w-5 h-5 text-purple-600" />
                  Robert's Personalized Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose prose-sm max-w-none">
                  <ReactMarkdown
                    components={{
                      h2: ({ children }) => <h2 className="text-xl font-semibold text-purple-900 mt-4 mb-2">{children}</h2>,
                      h3: ({ children }) => <h3 className="text-lg font-semibold text-slate-900 mt-3 mb-2">{children}</h3>,
                      p: ({ children }) => <p className="text-slate-700 mb-3 leading-relaxed">{children}</p>,
                      ul: ({ children }) => <ul className="ml-4 mb-3 space-y-2 list-disc">{children}</ul>,
                      strong: ({ children }) => <strong className="font-semibold text-purple-900">{children}</strong>,
                    }}
                  >
                    {robertAnalysis}
                  </ReactMarkdown>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Clinical Trials List */}
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Relevant Clinical Trials</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Found {trials.length} trials - Ranked by relevance
                  </p>
                </div>
                <Badge className="bg-blue-600 text-white">
                  ClinicalTrials.gov
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {trials.sort((a, b) => (a.relevance_rank || 999) - (b.relevance_rank || 999)).map((trial, idx) => (
                <Card key={idx} className="border-2 hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {trial.nct_id}
                            </Badge>
                            {trial.relevance_rank && trial.relevance_rank <= 3 && (
                              <Badge className="bg-amber-600 text-white text-xs">
                                Top {trial.relevance_rank}
                              </Badge>
                            )}
                          </div>
                          <h3 className="font-semibold text-slate-900 mb-2">
                            {trial.title}
                          </h3>
                        </div>
                        {trial.url && (
                          <a
                            href={trial.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-shrink-0"
                          >
                            <Button variant="outline" size="sm" className="gap-1">
                              View <ExternalLink className="w-3 h-3" />
                            </Button>
                          </a>
                        )}
                      </div>

                      {/* Summary */}
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {trial.summary}
                      </p>

                      {/* Badges */}
                      <div className="flex flex-wrap gap-2">
                        {trial.phase && (
                          <Badge variant="outline" className="text-xs">
                            Phase {trial.phase}
                          </Badge>
                        )}
                        {trial.status && (
                          <Badge className={`text-xs ${getStatusColor(trial.status)}`}>
                            {trial.status}
                          </Badge>
                        )}
                        {trial.study_type && (
                          <Badge variant="outline" className="text-xs">
                            {trial.study_type}
                          </Badge>
                        )}
                        {trial.eligibility_likely && (
                          <Badge className={`text-xs ${getEligibilityColor(trial.eligibility_likely)}`}>
                            Eligibility: {trial.eligibility_likely}
                          </Badge>
                        )}
                      </div>

                      {/* Details */}
                      <div className="grid md:grid-cols-2 gap-3 text-xs text-slate-600">
                        {trial.locations && (
                          <div className="flex items-start gap-2">
                            <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <span>{trial.locations}</span>
                          </div>
                        )}
                        {trial.enrollment && (
                          <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 flex-shrink-0" />
                            <span>{trial.enrollment}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
          </Card>

          {/* Disclaimer */}
          <Alert className="bg-amber-50 border-amber-200">
            <Info className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-900 text-sm">
              <strong>Important:</strong> This is an AI-assisted trial search for informational purposes only. 
              Always consult with your healthcare provider before enrolling in any clinical trial. Eligibility 
              assessments are preliminary and require official screening. Contact trial coordinators directly 
              for accurate, up-to-date information.
            </AlertDescription>
          </Alert>
        </>
      )}

      {trials && trials.length === 0 && !isSearching && (
        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Trials Found
            </h3>
            <p className="text-slate-500 mb-4">
              No matching clinical trials found. Try different search terms or check back later.
            </p>
            <Button
              variant="outline"
              onClick={() => window.open('https://clinicaltrials.gov', '_blank')}
              className="gap-2"
            >
              Browse ClinicalTrials.gov <ExternalLink className="w-4 h-4" />
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}