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
  });

  const findMatchingTrials = async () => {
    if (genes.length === 0 && variants.length === 0 && conditions.length === 0) {
      setError("Please provide genes, variants, or conditions to search for trials");
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const geneList = genes.map(g => typeof g === 'string' ? g : g.symbol);
      const conditionList = conditions.length > 0 ? conditions : [];

      // Run parallel searches: one per gene and one per condition
      const searchPromises = [];

      // Search by each gene (top 5)
      for (const gene of geneList.slice(0, 5)) {
        searchPromises.push(
          apiClient.searchClinicalTrials({
            gene,
            condition: conditionList[0] || undefined,
            status: 'RECRUITING',
            pageSize: 10,
          }).catch(() => ({ studies: [] }))
        );
      }

      // Search by each condition (top 3) if no gene overlap
      for (const cond of conditionList.slice(0, 3)) {
        searchPromises.push(
          apiClient.searchClinicalTrials({
            condition: cond,
            gene: geneList[0] || undefined,
            status: 'RECRUITING',
            pageSize: 10,
          }).catch(() => ({ studies: [] }))
        );
      }

      const results = await Promise.all(searchPromises);

      // Merge and deduplicate by NCT ID
      const seen = new Set();
      const merged = [];
      for (const result of results) {
        for (const study of (result.studies || [])) {
          if (study.nctId && !seen.has(study.nctId)) {
            seen.add(study.nctId);

            // Compute match info: which of the user's genes/conditions appear in the study
            const matchedGenes = geneList.filter(g => {
              const text = [
                study.title,
                study.briefTitle,
                study.briefSummary,
                ...(study.conditions || []),
                ...(study.keywords || []),
                ...(study.interventions || []).map(iv => iv.name),
              ].filter(Boolean).join(' ').toLowerCase();
              return text.includes(g.toLowerCase());
            });

            const matchedConditions = conditionList.filter(c => {
              const studyConds = (study.conditions || []).join(' ').toLowerCase();
              return studyConds.includes(c.toLowerCase());
            });

            merged.push({
              ...study,
              matchedGenes,
              matchedConditions,
              matchScore: matchedGenes.length * 2 + matchedConditions.length,
            });
          }
        }
      }

      // Sort by match score descending
      merged.sort((a, b) => b.matchScore - a.matchScore);

      setTrials(merged);
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
            ClinicalTrials.gov
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
              {conditions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-700 mb-1">Conditions:</p>
                  <div className="flex flex-wrap gap-1">
                    {conditions.map((c, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">{c}</Badge>
                    ))}
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
                <strong>Medical Disclaimer:</strong> Trial matches are based on keyword matching against
                ClinicalTrials.gov data. Always consult with your physician or genetic counselor before
                pursuing any clinical trial.
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
                  Searching ClinicalTrials.gov...
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
                      <SelectItem value="PHASE1">Phase I</SelectItem>
                      <SelectItem value="PHASE2">Phase II</SelectItem>
                      <SelectItem value="PHASE3">Phase III</SelectItem>
                      <SelectItem value="PHASE4">Phase IV</SelectItem>
                    </SelectContent>
                  </Select>
                  <Badge variant="outline" className="ml-auto">
                    {filteredTrials.length} trial{filteredTrials.length !== 1 ? 's' : ''}
                  </Badge>
                </div>

                {/* Trial Cards */}
                <div className="space-y-4">
                  {filteredTrials.map((trial, idx) => (
                    <Card key={trial.nctId || idx} className="border-2 hover:shadow-lg transition-shadow">
                      <CardContent className="pt-4">
                        {/* Header */}
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline" className="font-mono text-xs">
                                {trial.nctId}
                              </Badge>
                              <Badge className={getStatusColor(trial.status)}>
                                {trial.status}
                              </Badge>
                              {trial.phase && (
                                <Badge variant="outline">{trial.phase}</Badge>
                              )}
                            </div>
                            <h4 className="font-semibold text-slate-900 mb-2">
                              {trial.briefTitle || trial.title}
                            </h4>
                            {trial.briefSummary && (
                              <p className="text-sm text-slate-600 leading-relaxed mb-3 line-clamp-3">
                                {trial.briefSummary}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Gene Match Info */}
                        {(trial.matchedGenes?.length > 0 || trial.matchedConditions?.length > 0) && (
                          <div className="mb-3 p-3 bg-purple-50 rounded-lg border border-purple-200">
                            <p className="text-xs font-semibold text-purple-900 mb-2">
                              Match Details:
                            </p>
                            {trial.matchedGenes?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                <span className="text-xs text-purple-700 mr-1">Genes:</span>
                                {trial.matchedGenes.map((gene, i) => (
                                  <Badge key={i} className="bg-purple-600 text-white text-xs">
                                    {gene}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            {trial.matchedConditions?.length > 0 && (
                              <div className="flex flex-wrap gap-1">
                                <span className="text-xs text-purple-700 mr-1">Conditions:</span>
                                {trial.matchedConditions.map((cond, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {cond}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Conditions */}
                        {trial.conditions?.length > 0 && (
                          <div className="mb-3">
                            <div className="flex flex-wrap gap-1">
                              {trial.conditions.slice(0, 4).map((c, i) => (
                                <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                              ))}
                              {trial.conditions.length > 4 && (
                                <Badge variant="secondary" className="text-xs">+{trial.conditions.length - 4}</Badge>
                              )}
                            </div>
                          </div>
                        )}

                        {/* Interventions */}
                        {trial.interventions?.length > 0 && (
                          <div className="mb-3 text-xs text-slate-700">
                            <span className="font-medium">Interventions: </span>
                            {trial.interventions.slice(0, 3).map(iv => iv.name).filter(Boolean).join(', ')}
                            {trial.interventions.length > 3 && ` +${trial.interventions.length - 3} more`}
                          </div>
                        )}

                        {/* Location & Enrollment */}
                        <div className="mb-3 space-y-2">
                          {trial.locationSummary && (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                              <p className="text-xs text-slate-600">{trial.locationSummary}</p>
                            </div>
                          )}
                          {trial.enrollment && (
                            <div className="flex items-center gap-2">
                              <Users className="w-4 h-4 text-slate-500" />
                              <p className="text-xs text-slate-600">
                                Enrollment: {trial.enrollment} participants
                              </p>
                            </div>
                          )}
                        </div>

                        {/* Eligibility preview */}
                        {trial.eligibility?.minAge && (
                          <div className="mb-3 p-3 bg-slate-50 rounded-lg">
                            <p className="text-xs font-semibold text-slate-900 mb-1">Eligibility:</p>
                            <div className="flex flex-wrap gap-3 text-xs text-slate-700">
                              {trial.eligibility.minAge && <span>Min Age: {trial.eligibility.minAge}</span>}
                              {trial.eligibility.maxAge && <span>Max Age: {trial.eligibility.maxAge}</span>}
                              {trial.eligibility.sex && trial.eligibility.sex !== 'ALL' && <span>Sex: {trial.eligibility.sex}</span>}
                              {trial.eligibility.healthyVolunteers && <span>Healthy Volunteers: {trial.eligibility.healthyVolunteers}</span>}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2">
                          {trial.nctId && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="flex-1"
                              onClick={() => window.open(`https://clinicaltrials.gov/study/${trial.nctId}`, '_blank')}
                            >
                              <ExternalLink className="w-3 h-3 mr-1" />
                              View on ClinicalTrials.gov
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
