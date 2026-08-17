import React, { lazy, Suspense } from "react";
import { useAuth } from "../lib/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Microscope,
  Lightbulb,
  Shield,
  TrendingUp,
  Beaker,
  Dna
} from "lucide-react";
const HypothesisGenerator = lazy(() => import("../components/research/HypothesisGenerator"));
const ProjectManager = lazy(() => import("../components/research/ProjectManager"));
const SequenceWorkbench = lazy(() => import("../components/research/SequenceWorkbench"));

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
  const { user } = useAuth();

  // Research Mode is an educational workspace, not a clinical or diagnostic
  // feature. It must therefore be available to every authenticated learner.
  // The former gate checked legacy profile values (researcher/phd/
  // medical_professional) that are not used consistently by the current
  // education-level picker, locking valid users out with no path forward.
  // Scientific-claim and data-safety boundaries remain enforced by the tools
  // themselves; this is only a navigation/accessibility decision.

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
              Educational Research
            </Badge>
            <Badge variant="outline" className="border-green-500 text-green-700">
              <TrendingUp className="w-3 h-3 mr-1" />
              Available to learners
            </Badge>
          </div>
        </div>

        {/* Feature Tabs */}
        <Tabs defaultValue="hypothesis" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="hypothesis" className="flex-col gap-1 py-3">
              <Lightbulb className="w-5 h-5" />
              <span className="text-xs">Hypothesis</span>
            </TabsTrigger>
            <TabsTrigger value="projects" className="flex-col gap-1 py-3">
              <Beaker className="w-5 h-5" />
              <span className="text-xs">Projects</span>
              <Badge className="bg-green-600 text-white text-[10px] px-1">New</Badge>
            </TabsTrigger>
            <TabsTrigger value="sequence" className="flex-col gap-1 py-3">
              <Dna className="w-5 h-5" />
              <span className="text-xs">Sequence lab</span>
              <Badge className="bg-indigo-600 text-white text-[10px] px-1">Local</Badge>
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

          <TabsContent value="sequence">
            <Suspense fallback={<TabLoading />}>
              <SequenceWorkbench />
            </Suspense>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
