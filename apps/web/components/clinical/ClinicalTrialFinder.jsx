import React, { useState, useCallback } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  ExternalLink,
  MapPin,
  Users,
  CheckCircle2,
  Info,
  Filter
} from "lucide-react";

function getStatusColor(status) {
  const lower = status?.toLowerCase() || '';
  if (lower.includes('recruiting')) return 'bg-green-100 text-green-800';
  if (lower.includes('active')) return 'bg-blue-100 text-blue-800';
  if (lower.includes('completed')) return 'bg-slate-100 text-slate-800';
  if (lower.includes('suspended') || lower.includes('terminated')) return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-800';
}

const STATUS_OPTIONS = [
  { value: '', label: 'Any Status' },
  { value: 'RECRUITING', label: 'Recruiting' },
  { value: 'ACTIVE_NOT_RECRUITING', label: 'Active, Not Recruiting' },
  { value: 'COMPLETED', label: 'Completed' },
  { value: 'ENROLLING_BY_INVITATION', label: 'Enrolling by Invitation' },
  { value: 'NOT_YET_RECRUITING', label: 'Not Yet Recruiting' },
];

export default function ClinicalTrialFinder({
  geneticData = null,
  medicalContext = null,
}) {
  const [condition, setCondition] = useState(
    medicalContext?.conditions?.[0] || geneticData?.gene || ""
  );
  const [gene, setGene] = useState(
    geneticData?.gene || medicalContext?.genes?.[0] || ""
  );
  const [statusFilter, setStatusFilter] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const handleSearch = useCallback(async () => {
    if (!condition.trim() && !gene.trim()) return;

    setIsSearching(true);
    setError(null);
    setSelectedTrial(null);

    try {
      const data = await apiClient.searchClinicalTrials({
        condition: condition.trim() || undefined,
        gene: gene.trim() || undefined,
        status: statusFilter || undefined,
        pageSize: 20,
      });
      setResults(data);
    } catch (err) {
      console.error("Error searching trials:", err);
      setError(err.message || "Failed to search clinical trials. Please try again.");
      setResults(null);
    } finally {
      setIsSearching(false);
    }
  }, [condition, gene, statusFilter]);

  const handleViewDetails = useCallback(async (nctId) => {
    setDetailLoading(true);
    try {
      const { study } = await apiClient.getClinicalTrial(nctId);
      setSelectedTrial(study);
    } catch (err) {
      console.error("Error fetching trial details:", err);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Auto-search when genetic/medical context is provided
  React.useEffect(() => {
    if ((geneticData || medicalContext) && !results) {
      handleSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const studies = results?.studies || [];

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
              based on your genetic data, medical conditions, or research interests. Results come
              directly from the ClinicalTrials.gov public API.
            </AlertDescription>
          </Alert>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Condition / Disease
              </label>
              <Input
                placeholder="e.g., breast cancer, Alzheimer's"
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
              />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Gene (optional)
              </label>
              <Input
                placeholder="e.g., BRCA1, TP53, EGFR"
                value={gene}
                onChange={(e) => setGene(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                disabled={isSearching}
              />
            </div>
          </div>

          <div className="flex items-end gap-3">
            <div className="w-48">
              <label className="text-sm font-medium text-slate-700 mb-1 block">
                Trial Status
              </label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 text-sm">
                  <SelectValue placeholder="Any Status" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              onClick={handleSearch}
              disabled={isSearching || (!condition.trim() && !gene.trim())}
              className="bg-blue-600 hover:bg-blue-700 gap-2"
            >
              {isSearching ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
              Search Trials
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Loading */}
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
                  Querying the national clinical trials database
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Selected Trial Detail */}
      {selectedTrial && (
        <Card className="shadow-lg border-2 border-blue-300">
          <CardHeader>
            <div className="flex items-start justify-between">
              <div>
                <Badge variant="outline" className="font-mono text-xs mb-2">
                  {selectedTrial.nctId}
                </Badge>
                <CardTitle className="text-lg">{selectedTrial.title || selectedTrial.briefTitle}</CardTitle>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedTrial(null)}>
                Close
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {selectedTrial.briefSummary && (
              <p className="text-sm text-slate-700 leading-relaxed">{selectedTrial.briefSummary}</p>
            )}

            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-semibold text-slate-900 mb-1">Status & Phase</p>
                <div className="flex flex-wrap gap-2">
                  {selectedTrial.status && <Badge className={getStatusColor(selectedTrial.status)}>{selectedTrial.status}</Badge>}
                  {selectedTrial.phase && <Badge variant="outline">Phase {selectedTrial.phase}</Badge>}
                  {selectedTrial.studyType && <Badge variant="outline">{selectedTrial.studyType}</Badge>}
                </div>
              </div>
              {selectedTrial.enrollment && (
                <div>
                  <p className="font-semibold text-slate-900 mb-1">Enrollment</p>
                  <p className="text-slate-600">{selectedTrial.enrollment} participants</p>
                </div>
              )}
            </div>

            {selectedTrial.conditions?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-900 mb-1 text-sm">Conditions</p>
                <div className="flex flex-wrap gap-1">
                  {selectedTrial.conditions.map((c, i) => (
                    <Badge key={i} variant="outline" className="text-xs">{c}</Badge>
                  ))}
                </div>
              </div>
            )}

            {selectedTrial.interventions?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-900 mb-1 text-sm">Interventions</p>
                <div className="space-y-1">
                  {selectedTrial.interventions.map((iv, i) => (
                    <p key={i} className="text-sm text-slate-700">
                      <Badge variant="outline" className="text-xs mr-2">{iv.type}</Badge>
                      {iv.name}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {selectedTrial.eligibility?.criteria && (
              <div>
                <p className="font-semibold text-slate-900 mb-1 text-sm">Eligibility Criteria</p>
                <div className="text-xs text-slate-700 max-h-40 overflow-y-auto bg-slate-50 p-3 rounded-lg whitespace-pre-wrap">
                  {selectedTrial.eligibility.criteria}
                </div>
                <div className="flex gap-4 mt-2 text-xs text-slate-600">
                  {selectedTrial.eligibility.minAge && <span>Min Age: {selectedTrial.eligibility.minAge}</span>}
                  {selectedTrial.eligibility.maxAge && <span>Max Age: {selectedTrial.eligibility.maxAge}</span>}
                  {selectedTrial.eligibility.sex && <span>Sex: {selectedTrial.eligibility.sex}</span>}
                </div>
              </div>
            )}

            {selectedTrial.contacts?.length > 0 && (
              <div>
                <p className="font-semibold text-slate-900 mb-1 text-sm">Contacts</p>
                {selectedTrial.contacts.map((c, i) => (
                  <p key={i} className="text-sm text-slate-700">
                    {c.name}{c.role ? ` (${c.role})` : ''}{c.email ? ` - ${c.email}` : ''}{c.phone ? ` - ${c.phone}` : ''}
                  </p>
                ))}
              </div>
            )}

            {selectedTrial.url && (
              <a href={selectedTrial.url} target="_blank" rel="noopener noreferrer">
                <Button className="w-full bg-blue-600 hover:bg-blue-700 gap-2 mt-2">
                  View Full Details on ClinicalTrials.gov
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </a>
            )}
          </CardContent>
        </Card>
      )}

      {/* Results List */}
      {studies.length > 0 && (
        <>
          <Card className="shadow-lg">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Search Results</CardTitle>
                  <p className="text-sm text-slate-600 mt-1">
                    Showing {studies.length} of {results.totalCount} trials
                  </p>
                </div>
                <Badge className="bg-blue-600 text-white">
                  ClinicalTrials.gov
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {studies.map((trial, idx) => (
                <Card key={trial.nctId || idx} className="border-2 hover:shadow-md transition-shadow">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      {/* Header */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <Badge variant="outline" className="font-mono text-xs">
                              {trial.nctId}
                            </Badge>
                          </div>
                          <h3 className="font-semibold text-slate-900 mb-2">
                            {trial.briefTitle || trial.title}
                          </h3>
                        </div>
                        <div className="flex gap-2 flex-shrink-0">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleViewDetails(trial.nctId)}
                            disabled={detailLoading}
                          >
                            {detailLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Details'}
                          </Button>
                          {trial.url && (
                            <a href={trial.url} target="_blank" rel="noopener noreferrer">
                              <Button variant="outline" size="sm" className="gap-1">
                                <ExternalLink className="w-3 h-3" />
                              </Button>
                            </a>
                          )}
                        </div>
                      </div>

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
                        {trial.studyType && (
                          <Badge variant="outline" className="text-xs">
                            {trial.studyType}
                          </Badge>
                        )}
                        {trial.enrollment && (
                          <Badge variant="outline" className="text-xs">
                            <Users className="w-3 h-3 mr-1" />
                            {trial.enrollment} enrolled
                          </Badge>
                        )}
                      </div>

                      {/* Conditions */}
                      {trial.conditions?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {trial.conditions.slice(0, 5).map((c, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">{c}</Badge>
                          ))}
                          {trial.conditions.length > 5 && (
                            <Badge variant="secondary" className="text-xs">+{trial.conditions.length - 5}</Badge>
                          )}
                        </div>
                      )}

                      {/* Location */}
                      {trial.locationSummary && (
                        <div className="flex items-start gap-2 text-xs text-slate-600">
                          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                          <span>{trial.locationSummary}</span>
                        </div>
                      )}
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
              <strong>Important:</strong> This data comes directly from ClinicalTrials.gov. Always
              consult with your healthcare provider before enrolling in any clinical trial. Contact
              trial coordinators directly for the most accurate, up-to-date information.
            </AlertDescription>
          </Alert>
        </>
      )}

      {/* No Results */}
      {results && studies.length === 0 && !isSearching && (
        <Card className="shadow-lg">
          <CardContent className="py-12 text-center">
            <Search className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <h3 className="text-xl font-semibold text-slate-700 mb-2">
              No Trials Found
            </h3>
            <p className="text-slate-500 mb-4">
              No matching clinical trials found. Try different search terms or broaden your filters.
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
