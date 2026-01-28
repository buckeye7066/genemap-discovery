import React, { useState } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Loader2, 
  Stethoscope, 
  MapPin, 
  Calendar,
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Users,
  Sparkles,
  Info,
  Filter
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function ClinicalTrialMatcher({ 
  genes = [], 
  variants = [], 
  conditions = [],
  pathways = []
}) {
  const [trials, setTrials] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [filters, setFilters] = useState({
    status: "all",
    phase: "all",
    distance: "all"
  });

  const findMatchingTrials = async () => {
    if (genes.length === 0 && variants.length === 0 && conditions.length === 0) {
      setError("Please provide genes, variants, or conditions to search for trials");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const geneList = genes.map(g => typeof g === 'string' ? g : g.symbol).join(', ');
      const variantList = variants.slice(0, 10).map(v => 
        `${v.chromosome}:${v.position} ${v.ref}>${v.alt} (${v.gene || 'unknown'})`
      ).join(', ');

      const prompt = `You are an AI clinical research assistant specializing in matching patients with relevant clinical trials based on genetic profiles.

**Patient Genetic Profile:**
${geneList ? `- Genes: ${geneList}` : ''}
${variantList ? `- Variants: ${variantList}` : ''}
${conditions.length > 0 ? `- Conditions: ${conditions.join(', ')}` : ''}
${pathways.length > 0 ? `- Affected Pathways: ${pathways.join(', ')}` : ''}

**Your Task:**
Search ClinicalTrials.gov and your knowledge base to find 8-15 relevant clinical trials that match this genetic profile.

For EACH trial, provide:

1. **Trial Information:**
   - NCT ID (e.g., NCT12345678)
   - Official title
   - Brief summary (2-3 sentences)
   - Phase (I, II, III, IV)
   - Status (Recruiting, Active, Completed, etc.)
   - Start date

2. **Genetic Relevance:**
   - Which specific genes/variants make this trial relevant
   - Targeted mutations or biomarkers
   - Mechanism of action related to the genetic profile
   - Match confidence (High/Medium/Low)

3. **Eligibility Criteria:**
   - Key inclusion criteria
   - Key exclusion criteria
   - Age requirements
   - Required biomarker/mutation status
   - Previous treatment requirements

4. **Logistics:**
   - Primary location(s) - city, state, country
   - Number of study sites
   - Estimated enrollment
   - Contact information (if available)
   - Trial website URL

5. **Treatment Details:**
   - Intervention type (Drug, Gene therapy, etc.)
   - Drug/treatment names
   - Treatment approach
   - Expected duration

6. **Why It Matches:**
   - Explain specifically why this trial is relevant
   - What makes the patient potentially eligible
   - Key benefits of this trial for this profile

**Search Strategy:**
- Focus on trials targeting the specific genes/pathways mentioned
- Include trials for conditions associated with these genes
- Consider both targeted therapies and broader trials
- Include early phase trials if mutations are rare
- Prioritize actively recruiting trials
- Include completed trials if results are informative

**Important:**
- Only include real, verifiable clinical trials
- Provide actual NCT IDs when available
- Be honest about match confidence
- Note if certain trials are especially relevant
- Indicate if patient should discuss with physician

Return comprehensive trial matches with all details.`;

      // BACKEND_NEEDED: InvokeLLM needs API implementation
      const response = { trials: [] };

      setTrials(response.trials || []);
    } catch (err) {
      console.error("Error finding trials:", err);
      setError("Failed to find matching clinical trials. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = (status) => {
    const lower = status?.toLowerCase() || '';
    if (lower.includes('recruiting')) return 'bg-green-100 text-green-800';
    if (lower.includes('active')) return 'bg-blue-100 text-blue-800';
    if (lower.includes('completed')) return 'bg-slate-100 text-slate-800';
    if (lower.includes('withdrawn') || lower.includes('terminated')) return 'bg-red-100 text-red-800';
    return 'bg-yellow-100 text-yellow-800';
  };

  const getConfidenceColor = (confidence) => {
    const lower = confidence?.toLowerCase() || '';
    if (lower.includes('high')) return 'bg-green-600 text-white';
    if (lower.includes('medium')) return 'bg-yellow-600 text-white';
    return 'bg-slate-600 text-white';
  };

  const filteredTrials = trials.filter(trial => {
    if (filters.status !== 'all' && !trial.status?.toLowerCase().includes(filters.status)) {
      return false;
    }
    if (filters.phase !== 'all' && trial.phase !== filters.phase) {
      return false;
    }
    return true;
  });

  return (
    <Card className="shadow-lg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-blue-600" />
            Clinical Trial Matcher
          </CardTitle>
          <Badge className="bg-blue-600 text-white">
            <Sparkles className="w-3 h-3 mr-1" />
            AI-Powered
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {genes.length === 0 && variants.length === 0 && conditions.length === 0 ? (
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Provide genes, variants, or conditions to find matching clinical trials
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="mb-4 space-y-3">
              <p className="text-sm text-slate-600">
                Searching trials for:
              </p>
              {genes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Genes:</p>
                  <div className="flex flex-wrap gap-1">
                    {genes.slice(0, 10).map((gene, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs">
                        {typeof gene === 'string' ? gene : gene.symbol}
                      </Badge>
                    ))}
                    {genes.length > 10 && (
                      <Badge variant="outline" className="text-xs">+{genes.length - 10}</Badge>
                    )}
                  </div>
                </div>
              )}
              {variants.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Variants:</p>
                  <p className="text-xs text-slate-600">{variants.length} variants uploaded</p>
                </div>
              )}
            </div>

            <Alert className="mb-4 bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-900 text-xs">
                <strong>Medical Disclaimer:</strong> Trial matches are AI-generated suggestions. Always consult with your physician or genetic counselor before pursuing any clinical trial.
              </AlertDescription>
            </Alert>

            <Button
              onClick={findMatchingTrials}
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching Clinical Trials...
                </>
              ) : (
                <>
                  <Stethoscope className="w-4 h-4 mr-2" />
                  Find Matching Clinical Trials
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {trials.length > 0 && (
              <div className="mt-6 space-y-4">
                {/* Filters */}
                <div className="flex items-center gap-2 flex-wrap p-3 bg-slate-50 rounded-lg">
                  <Filter className="w-4 h-4 text-slate-600" />
                  <Select value={filters.status} onValueChange={(v) => setFilters({...filters, status: v})}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="recruiting">Recruiting</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filters.phase} onValueChange={(v) => setFilters({...filters, phase: v})}>
                    <SelectTrigger className="w-32 h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Phases</SelectItem>
                      <SelectItem value="Phase 1">Phase I</SelectItem>
                      <SelectItem value="Phase 2">Phase II</SelectItem>
                      <SelectItem value="Phase 3">Phase III</SelectItem>
                      <SelectItem value="Phase 4">Phase IV</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="ml-auto">
                    {filteredTrials.length} trial{filteredTrials.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                {/* Trial Cards */}
                <div className="space-y-4">
                  {filteredTrials.map((trial, idx) => (
                    <Card key={idx} className="border-2 hover:shadow-lg transition-shadow">
                      <CardContent className="pt-4">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                {trial.nct_id}
                              </Badge>
                              <Badge className={getStatusColor(trial.status)}>
                                {trial.status}
                              </Badge>
                              {trial.phase && (
                                <Badge variant="outline">{trial.phase}</Badge>
                              )}
                              {trial.genetic_relevance?.confidence && (
                                <Badge className={getConfidenceColor(trial.genetic_relevance.confidence)}>
                                  {trial.genetic_relevance.confidence} Match
                                </Badge>
                              )}
                            </div>
                            <h4 className="font-semibold text-slate-900 mb-2">
                              {trial.title}
                            </h4>
                            <p className="text-sm text-slate-600 leading-relaxed mb-3">
                              {trial.summary}
                            </p>
                          </div>
                        </div>

                        {/* Why It Matches */}
                        <Alert className="mb-3 bg-blue-50 border-blue-200">
                          <Sparkles className="h-4 w-4 text-blue-600" />
                          <AlertDescription className="text-blue-900 text-sm">
                            <strong>Match Reason:</strong> {trial.match_explanation}
                          </AlertDescription>
                        </Alert>

                        {/* Genetic Relevance */}
                        {trial.genetic_relevance && (
                          <div className="mb-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-xs font-semibold text-purple-900 mb-2">
                              🧬 Genetic Targeting:
                            </p>
                            {trial.genetic_relevance.matched_genes?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-2">
                                {trial.genetic_relevance.matched_genes.map((gene, i) => (
                                  <Badge key={i} className="bg-purple-600 text-white text-xs">
                                    {gene}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {trial.genetic_relevance.mechanism && (
                              <p className="text-xs text-purple-800">
                                <strong>Mechanism:</strong> {trial.genetic_relevance.mechanism}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Treatment */}
                        {trial.treatment && (
                          <div className="mb-3 grid grid-cols-2 gap-3 text-xs">
                            {trial.treatment.intervention_type && (
                              <div>
                                <p className="text-slate-500">Type</p>
                                <p className="font-medium">{trial.treatment.intervention_type}</p>
                              </div>
                            )}
                            {trial.treatment.drug_names?.length > 0 && (
                              <div>
                                <p className="text-slate-500">Drugs</p>
                                <p className="font-medium">{trial.treatment.drug_names.join(', ')}</p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Logistics */}
                        {trial.logistics && (
                          <div className="mb-3 space-y-2">
                            {trial.logistics.locations?.length > 0 && (
                              <div className="flex items-start gap-2">
                                <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                                <div className="flex-1">
                                  <p className="text-xs text-slate-600">
                                    {trial.logistics.locations.slice(0, 3).join(' • ')}
                                    {trial.logistics.locations.length > 3 && 
                                      ` • +${trial.logistics.locations.length - 3} more`}
                                  </p>
                                </div>
                              </div>
                            )}
                            {trial.logistics.enrollment && (
                              <div className="flex items-center gap-2">
                                <Users className="w-4 h-4 text-slate-500" />
                                <p className="text-xs text-slate-600">
                                  Enrollment: {trial.logistics.enrollment} participants
                                </p>
                              </div>
                            )}
                          </div>
                        )}

                        {/* Eligibility Preview */}
                        {trial.eligibility && (
                          <div className="mb-3 p-3 bg-slate-50 rounded-lg">
                            <p className="text-xs font-semibold text-slate-900 mb-2">
                              Key Eligibility:
                            </p>
                            <div className="space-y-1">
                              {trial.eligibility.inclusion?.slice(0, 2).map((item, i) => (
                                <div key={i} className="flex items-start gap-2">
                                  <CheckCircle className="w-3 h-3 text-green-600 mt-0.5" />
                                  <p className="text-xs text-slate-700">{item}</p>
                                </div>
                              ))}
                              {trial.eligibility.age_range && (
                                <div className="flex items-start gap-2">
                                  <Calendar className="w-3 h-3 text-blue-600 mt-0.5" />
                                  <p className="text-xs text-slate-700">Age: {trial.eligibility.age_range}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          {trial.logistics?.url && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => window.open(trial.logistics.url, '_blank')}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View on ClinicalTrials.gov
                            </Button>
                          )}
                          {trial.nct_id && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => window.open(`https://clinicaltrials.gov/study/${trial.nct_id}`, '_blank')}
                            >
                              <Info className="w-3 h-3 mr-1" />
                              Full Details
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}