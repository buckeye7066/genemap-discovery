import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Microscope,
  Database,
  GitBranch,
  Lightbulb,
  Shield,
  TrendingUp,
  FileStack,
  Lock
} from "lucide-react";
import BulkVCFAnalysis from "../components/research/BulkVCFAnalysis";
import ExternalDatabaseIntegration from "../components/research/ExternalDatabaseIntegration";
import PathwayEnrichment from "../components/research/PathwayEnrichment";
import HypothesisGenerator from "../components/research/HypothesisGenerator";

export default function ResearchMode() {
  const [user, setUser] = useState(null);
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    checkAccess();
  }, []);

  const checkAccess = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Check if user has research access (for now, admin backdoor or future premium feature)
      const isAdmin = currentUser?.email === "buckeye7066@gmail.com";
      const isResearcher = currentUser?.education_level === 'researcher' || 
                          currentUser?.education_level === 'phd' ||
                          currentUser?.education_level === 'medical_professional';
      
      // Grant access to admin or researchers/clinicians
      setHasAccess(isAdmin || isResearcher);
    } catch (err) {
      console.error("Error checking access:", err);
      setHasAccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-slate-200 rounded-lg"></div>
            <div className="h-64 bg-slate-200 rounded-lg"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4 sm:p-6">
        <div className="max-w-4xl mx-auto">
          <Card className="shadow-lg border-2 border-amber-200">
            <CardHeader>
              <div className="flex items-center gap-3 mb-4">
                <div className="w-16 h-16 bg-gradient-to-r from-amber-600 to-orange-600 rounded-2xl flex items-center justify-center">
                  <Lock className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl">Research Mode Access Required</CardTitle>
                  <p className="text-slate-600">Advanced features for researchers and clinicians</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-900">
                  Research Mode is designed for researchers, clinicians, and PhD students conducting 
                  genomic research. Update your profile to indicate your research or clinical background.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Research Mode Includes:</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <FileStack className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Bulk VCF Analysis</p>
                      <p className="text-xs text-slate-600">Process multiple VCF files for cohort studies</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Database className="w-5 h-5 text-green-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">External Database Integration</p>
                      <p className="text-xs text-slate-600">Access ClinGen, dbGaP, and research databases</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <GitBranch className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Pathway Enrichment</p>
                      <p className="text-xs text-slate-600">Advanced network and pathway analysis</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Hypothesis Generation</p>
                      <p className="text-xs text-slate-600">AI-powered multi-omic insights</p>
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => window.location.href = '/Profile'}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                Update Profile to Enable Research Mode
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg">
              <Microscope className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Research Mode
          </h1>
          <p className="text-lg text-slate-600 max-w-3xl mx-auto">
            Advanced genomic research tools for cohort studies, pathway analysis, and hypothesis generation
          </p>
          <div className="flex justify-center gap-2 mt-4">
            <Badge className="bg-indigo-600 text-white">
              <Shield className="w-3 h-3 mr-1" />
              Researcher Access
            </Badge>
            <Badge variant="outline" className="border-green-500 text-green-700">
              <TrendingUp className="w-3 h-3 mr-1" />
              Advanced Features
            </Badge>
          </div>
        </div>

        {/* Feature Tabs */}
        <Tabs defaultValue="bulk-vcf" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 lg:grid-cols-4 h-auto">
            <TabsTrigger value="bulk-vcf" className="flex-col gap-1 py-3">
              <FileStack className="w-5 h-5" />
              <span className="text-xs">Bulk VCF</span>
            </TabsTrigger>
            <TabsTrigger value="databases" className="flex-col gap-1 py-3">
              <Database className="w-5 h-5" />
              <span className="text-xs">Databases</span>
            </TabsTrigger>
            <TabsTrigger value="pathways" className="flex-col gap-1 py-3">
              <GitBranch className="w-5 h-5" />
              <span className="text-xs">Pathways</span>
            </TabsTrigger>
            <TabsTrigger value="hypothesis" className="flex-col gap-1 py-3">
              <Lightbulb className="w-5 h-5" />
              <span className="text-xs">Hypothesis</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="bulk-vcf">
            <BulkVCFAnalysis userEducationLevel={user?.education_level} />
          </TabsContent>

          <TabsContent value="databases">
            <ExternalDatabaseIntegration userEducationLevel={user?.education_level} />
          </TabsContent>

          <TabsContent value="pathways">
            <PathwayEnrichment userEducationLevel={user?.education_level} />
          </TabsContent>

          <TabsContent value="hypothesis">
            <HypothesisGenerator userEducationLevel={user?.education_level} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}