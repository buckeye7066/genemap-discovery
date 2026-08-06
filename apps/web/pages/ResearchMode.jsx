import React, { useState, useEffect, lazy, Suspense } from "react";
import { useAuth } from "../lib/AuthContext";
import { isAdminUser } from "../lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Microscope,
  Lightbulb,
  Shield,
  TrendingUp,
  Lock,
  Beaker
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
const HypothesisGenerator = lazy(() => import("../components/research/HypothesisGenerator"));
const ProjectManager = lazy(() => import("../components/research/ProjectManager"));

// Contained fallback for the lazy tab panels. Without a local Suspense
// boundary these lazy imports suspended up to App.jsx's top-level Suspense,
// which blanked the WHOLE page with a full-screen spinner while the chunk
// loaded. Keeping the fallback here confines the loader to the tab content.
const TabLoading = () => (
  <div className="flex flex-col items-center justify-center py-16 text-slate-500">
    <div className="w-10 h-10 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-3" />
    <p className="text-sm">Loading research tools…</p>
  </div>
);

export default function ResearchMode() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [hasAccess, setHasAccess] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const isAdmin = isAdminUser(user);
    const isResearcher = user?.education_level === 'researcher' || 
                        user?.education_level === 'phd' ||
                        user?.education_level === 'medical_professional';
    setHasAccess(isAdmin || isResearcher);
    setIsLoading(false);
  }, [user]);

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
                  <p className="text-slate-600">Exploratory tools for advanced learners and researchers</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Alert className="bg-amber-50 border-amber-200">
                <AlertDescription className="text-amber-900">
                  Research Mode is designed for researchers and advanced students organizing
                  exploratory genetics questions. Update your profile to indicate your research background.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <h3 className="font-semibold text-slate-900">Research Mode Includes:</h3>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Hypothesis Generation</p>
                      <p className="text-xs text-slate-600">AI brainstorming for testable research questions</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <Beaker className="w-5 h-5 text-blue-600 mt-0.5" />
                    <div>
                      <p className="font-medium text-slate-900 text-sm">Research Projects</p>
                      <p className="text-xs text-slate-600">Organize source-checked gene lists and notes</p>
                    </div>
                  </div>
                </div>
              </div>

              <Button 
                onClick={() => navigate(createPageUrl("Profile"))}
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
            Exploratory hypothesis brainstorming and project organization; verify every scientific claim independently
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
        <Tabs defaultValue="hypothesis" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-auto">
            <TabsTrigger value="hypothesis" className="flex-col gap-1 py-3">
              <Lightbulb className="w-5 h-5" />
              <span className="text-xs">Hypothesis</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex-col gap-1 py-3">
              <Beaker className="w-5 h-5" />
              <span className="text-xs">Projects</span>
              <Badge className="bg-green-600 text-white text-[10px] px-1">New</Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="hypothesis">
            <Suspense fallback={<TabLoading />}>
              <HypothesisGenerator userEducationLevel={user?.education_level} />
            </Suspense>
          </TabsContent>

          <TabsContent value="projects">
            <Suspense fallback={<TabLoading />}>
              <ProjectManager />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
