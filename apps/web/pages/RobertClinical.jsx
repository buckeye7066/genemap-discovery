import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Brain,
  Search,
  FileText,
  TrendingUp,
  Stethoscope,
  Info,
  Sparkles,
  Plus,
  X,
  Pill
} from "lucide-react";
import RobertClinicalSupport from "../components/clinical/RobertClinicalSupport";

export default function RobertClinicalPage() {
  const [user, setUser] = useState(null);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [searchInput, setSearchInput] = useState("");
  const [analysisTargets, setAnalysisTargets] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showBatchAnalysis, setShowBatchAnalysis] = useState(false);
  const [includeDrugAnalysis, setIncludeDrugAnalysis] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);

      // BACKEND_NEEDED: MedicalData entity needs API implementation
      // const records = await base44.entities.MedicalData.filter(
      //   { created_by: currentUser.email },
      //   '-created_date'
      // );
      // setMedicalRecords(records);
      setMedicalRecords([]);
    } catch (err) {
      console.error("Error loading data:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTarget = (type) => {
    if (!searchInput.trim()) return;
    
    const newTarget = {
      type, // 'gene' or 'disease'
      value: searchInput.trim(),
      id: Date.now() // unique ID
    };

    setAnalysisTargets([...analysisTargets, newTarget]);
    setSearchInput("");
  };

  const handleRemoveTarget = (id) => {
    setAnalysisTargets(analysisTargets.filter(t => t.id !== id));
  };

  const handleStartAnalysis = () => {
    if (analysisTargets.length > 0) {
      setShowBatchAnalysis(true);
    }
  };

  const handleClearAnalysis = () => {
    setShowBatchAnalysis(false);
    setAnalysisTargets([]);
  };

  const quickGenes = ["BRCA1", "BRCA2", "TP53", "APOE", "CFTR", "CYP2D6", "CYP2C19"];
  const quickDiseases = [
    "Rheumatoid Arthritis",
    "Type 2 Diabetes",
    "Alzheimer's Disease",
    "Breast Cancer",
    "Cystic Fibrosis"
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-slate-200 rounded-lg"></div>
            <div className="h-64 bg-slate-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-purple-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Brain className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Robert Clinical Decision Support
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Comprehensive AI-powered analysis of medical data with drug interaction screening
          </p>
        </div>

        {!showBatchAnalysis ? (
          <>
            {/* Info Cards */}
            <div className="grid md:grid-cols-4 gap-4 mb-8">
              <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-5 h-5 text-purple-600" />
                    <span className="font-semibold text-slate-900">Records</span>
                  </div>
                  <p className="text-3xl font-bold text-purple-600">{medicalRecords.length}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Stethoscope className="w-5 h-5 text-blue-600" />
                    <span className="font-semibold text-slate-900">Targets</span>
                  </div>
                  <p className="text-3xl font-bold text-blue-600">{analysisTargets.length}</p>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-emerald-50 to-teal-50 border-emerald-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-emerald-600" />
                    <span className="font-semibold text-slate-900">AI Status</span>
                  </div>
                  <Badge className="bg-emerald-600 text-white">Active</Badge>
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-200">
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2 mb-2">
                    <Pill className="w-5 h-5 text-amber-600" />
                    <span className="font-semibold text-slate-900">Drug Screen</span>
                  </div>
                  <Badge className={includeDrugAnalysis ? "bg-amber-600 text-white" : "bg-slate-300"}>
                    {includeDrugAnalysis ? "Enabled" : "Disabled"}
                  </Badge>
                </CardContent>
              </Card>
            </div>

            {/* Enhanced Capabilities */}
            <Card className="shadow-lg mb-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                  Enhanced Multi-Target Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">Batch Gene/Disease Analysis</p>
                    <p className="text-sm text-slate-600">
                      Analyze multiple genes or diseases simultaneously against your medical data
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">Pharmacogenomics Screening</p>
                    <p className="text-sm text-slate-600">
                      Identify drug interactions and contraindications based on your genetic profile
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">Cross-Reference Analysis</p>
                    <p className="text-sm text-slate-600">
                      Understand how multiple genes/conditions interact with each other
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <div className="w-2 h-2 bg-indigo-600 rounded-full mt-2"></div>
                  <div>
                    <p className="font-medium text-slate-900">Lab Result Integration</p>
                    <p className="text-sm text-slate-600">
                      Correlate genetic findings with lab results for comprehensive insights
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Analysis Builder */}
            <Card className="shadow-lg mb-6">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Build Your Analysis
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <Label htmlFor="search-input" className="text-base font-medium mb-2 block">
                    Add Genes or Diseases to Analyze
                  </Label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      id="search-input"
                      placeholder="e.g., BRCA1, Type 2 Diabetes, CYP2D6"
                      value={searchInput}
                      onChange={(e) => setSearchInput(e.target.value)}
                      className="text-lg py-3 min-h-[48px]"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddTarget('gene');
                        }
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => handleAddTarget('gene')}
                        disabled={!searchInput.trim()}
                        className="bg-blue-600 hover:bg-blue-700 min-h-[48px]"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Gene
                      </Button>
                      <Button
                        onClick={() => handleAddTarget('disease')}
                        disabled={!searchInput.trim()}
                        className="bg-emerald-600 hover:bg-emerald-700 min-h-[48px]"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        Disease
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Selected Targets */}
                {analysisTargets.length > 0 && (
                  <div className="bg-slate-50 p-4 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-slate-900">
                        Selected for Analysis ({analysisTargets.length})
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setAnalysisTargets([])}
                        className="text-red-600 hover:text-red-700"
                      >
                        Clear All
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {analysisTargets.map((target) => (
                        <Badge
                          key={target.id}
                          className={`${
                            target.type === 'gene' 
                              ? 'bg-blue-100 text-blue-800 border-blue-200' 
                              : 'bg-emerald-100 text-emerald-800 border-emerald-200'
                          } pr-1 gap-2`}
                          variant="outline"
                        >
                          <span>{target.value}</span>
                          <span className="text-xs opacity-60">({target.type})</span>
                          <button
                            onClick={() => handleRemoveTarget(target.id)}
                            className="ml-1 hover:bg-slate-200 rounded-full p-0.5"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Drug Interaction Checkbox */}
                <div className="flex items-center space-x-2 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <Checkbox
                    id="drug-analysis"
                    checked={includeDrugAnalysis}
                    onCheckedChange={setIncludeDrugAnalysis}
                  />
                  <label
                    htmlFor="drug-analysis"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex items-center gap-2"
                  >
                    <Pill className="w-4 h-4 text-amber-600" />
                    Include pharmacogenomics and drug interaction analysis
                  </label>
                </div>

                {/* Start Analysis Button */}
                <Button
                  onClick={handleStartAnalysis}
                  disabled={analysisTargets.length === 0}
                  className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 min-h-[56px] text-lg"
                >
                  <Brain className="w-5 h-5 mr-2" />
                  Start Comprehensive Analysis
                  {analysisTargets.length > 0 && ` (${analysisTargets.length} target${analysisTargets.length > 1 ? 's' : ''})`}
                </Button>

                {/* Quick Access */}
                <div className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Quick Gene Selection:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickGenes.map((gene) => (
                        <Button
                          key={gene}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAnalysisTargets([...analysisTargets, {
                              type: 'gene',
                              value: gene,
                              id: Date.now() + Math.random()
                            }]);
                          }}
                          className="hover:bg-blue-50"
                        >
                          {gene}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-sm font-medium text-slate-700 mb-2">Quick Disease Selection:</p>
                    <div className="flex flex-wrap gap-2">
                      {quickDiseases.map((disease) => (
                        <Button
                          key={disease}
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setAnalysisTargets([...analysisTargets, {
                              type: 'disease',
                              value: disease,
                              id: Date.now() + Math.random()
                            }]);
                          }}
                          className="hover:bg-emerald-50 text-xs"
                        >
                          {disease}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Requirements Alert */}
            {medicalRecords.length === 0 && (
              <Alert className="bg-amber-50 border-amber-200">
                <Info className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-amber-900">
                  <strong>Note:</strong> You haven't uploaded any medical data yet. Robert can still provide analysis, but for personalized insights including drug interactions, please upload your medical records, genetic tests, or lab results.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <RobertClinicalSupport
            targets={analysisTargets}
            userEducationLevel={user?.education_level}
            onClose={handleClearAnalysis}
            includeDrugAnalysis={includeDrugAnalysis}
          />
        )}
      </div>
    </div>
  );
}