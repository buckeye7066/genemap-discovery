
import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  LayoutDashboard,
  TrendingUp,
  Search,
  Beaker,
  Bell,
  Settings,
  Eye,
  Clock,
  Sparkles,
  Users,
  FileText,
  ChevronRight,
  Plus,
  Info
} from "lucide-react";
import OnboardingTour from "../components/onboarding/OnboardingTour";

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [recentGenes, setRecentGenes] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [widgetVisibility, setWidgetVisibility] = useState({
    recentGenes: true,
    recentSearches: true,
    projects: true,
    medicalRecords: true,
    recommendations: true
  });
  const [showOnboarding, setShowOnboarding] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      // Check if user needs onboarding
      if (!currentUser.onboarding_completed) {
        setShowOnboarding(true);
      }

      // Load recent gene views
      const activities = await base44.entities.UserActivity.filter(
        {
          created_by: currentUser.email,
          activity_type: "gene_view"
        },
        '-created_date',
        10
      );
      setRecentGenes(activities);

      // Load recent searches
      const searches = await base44.entities.SearchHistory.filter(
        { created_by: currentUser.email },
        '-created_date',
        5
      );
      setRecentSearches(searches);

      // Load research projects
      const userProjects = await base44.entities.ResearchProject.filter(
        { created_by: currentUser.email },
        '-updated_date',
        10
      );
      setProjects(userProjects);

      // Load medical records
      const records = await base44.entities.MedicalData.filter(
        { created_by: currentUser.email },
        '-created_date',
        3
      );
      setMedicalRecords(records);

    } catch (err) {
      console.error("Error loading dashboard:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleWidget = (widgetName) => {
    setWidgetVisibility({
      ...widgetVisibility,
      [widgetName]: !widgetVisibility[widgetName]
    });
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse space-y-4">
            <div className="h-32 bg-slate-200 rounded-lg"></div>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="h-64 bg-slate-200 rounded-lg"></div>
              <div className="h-64 bg-slate-200 rounded-lg"></div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      {/* Onboarding Tour */}
      {showOnboarding && <OnboardingTour onComplete={() => setShowOnboarding(false)} />}

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-bold text-slate-900 flex items-center gap-2">
                <LayoutDashboard className="w-8 h-8 text-blue-600" />
                {getGreeting()}, {user?.full_name?.split(' ')[0] || 'there'}
              </h1>
              <p className="text-slate-600 mt-1">
                Welcome to your personalized genomics dashboard
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => setShowOnboarding(true)}
              >
                <Sparkles className="w-4 h-4" />
                Tour
              </Button>
              <Button variant="outline" className="gap-2">
                <Settings className="w-4 h-4" />
                Customize
              </Button>
            </div>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Eye className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{recentGenes.length}</p>
                    <p className="text-xs text-slate-600">Genes Viewed</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Search className="w-5 h-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{recentSearches.length}</p>
                    <p className="text-xs text-slate-600">Searches</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <Beaker className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{projects.length}</p>
                    <p className="text-xs text-slate-600">Projects</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-amber-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{medicalRecords.length}</p>
                    <p className="text-xs text-slate-600">Records</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Recent Genes */}
            {widgetVisibility.recentGenes && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-blue-600" />
                      Recently Viewed Genes
                    </CardTitle>
                    <Badge variant="outline">{recentGenes.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {recentGenes.length === 0 ? (
                    <div className="text-center py-8">
                      <Eye className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-slate-500 text-sm">No genes viewed yet</p>
                      <Link to={createPageUrl("Search")}>
                        <Button variant="outline" size="sm" className="mt-3">
                          Start Searching
                        </Button>
                      </Link>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentGenes.slice(0, 5).map((activity, idx) => (
                        <Link
                          key={idx}
                          to={`${createPageUrl("Search")}?query=${activity.gene_symbol}`}
                          className="block p-3 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{activity.gene_symbol}</p>
                              <p className="text-xs text-slate-500">
                                <Clock className="w-3 h-3 inline mr-1" />
                                {new Date(activity.created_date).toLocaleString()}
                              </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recent Searches */}
            {widgetVisibility.recentSearches && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Search className="w-5 h-5 text-purple-600" />
                      Recent Searches
                    </CardTitle>
                    <Link to={createPageUrl("History")}>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  {recentSearches.length === 0 ? (
                    <div className="text-center py-8">
                      <Search className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-slate-500 text-sm">No searches yet</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {recentSearches.map((search, idx) => (
                        <Link
                          key={idx}
                          to={`${createPageUrl("Search")}?query=${encodeURIComponent(search.phenotype_query)}`}
                          className="block p-3 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{search.phenotype_query}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {search.results_count || 0} genes
                                </Badge>
                                <Badge variant={search.search_type === 'premium' ? 'default' : 'secondary'} className="text-xs">
                                  {search.search_type}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  {new Date(search.created_date).toLocaleDateString()}
                                </span>
                              </div>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-400" />
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Medical Records */}
            {widgetVisibility.medicalRecords && medicalRecords.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="w-5 h-5 text-green-600" />
                      Recent Medical Records
                    </CardTitle>
                    <Link to={createPageUrl("MedicalData")}>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {medicalRecords.map((record, idx) => (
                      <Link
                        key={idx}
                        to={createPageUrl("MedicalData")}
                        className="block p-3 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">
                            {record.file_type === 'genetic_test' ? '🧬' :
                              record.file_type === 'blood_test' ? '💉' :
                                record.file_type === 'vcf_file' ? '📊' : '📄'}
                          </div>
                          <div className="flex-1">
                            <p className="font-medium text-slate-900 text-sm">
                              {record.file_type.replace('_', ' ').toUpperCase()}
                            </p>
                            <p className="text-xs text-slate-500">
                              {new Date(record.created_date).toLocaleDateString()}
                            </p>
                            {record.relevant_genes && record.relevant_genes.length > 0 && (
                              <div className="flex gap-1 mt-1">
                                {record.relevant_genes.slice(0, 3).map((gene, i) => (
                                  <Badge key={i} variant="secondary" className="text-xs">
                                    {gene}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Research Projects */}
            {widgetVisibility.projects && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Beaker className="w-5 h-5 text-green-600" />
                      Research Projects
                    </CardTitle>
                    <Button variant="ghost" size="sm">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <div className="text-center py-8">
                      <Beaker className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-slate-500 text-sm mb-3">No projects yet</p>
                      <Button size="sm" variant="outline">
                        <Plus className="w-4 h-4 mr-2" />
                        Create Project
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {projects.slice(0, 5).map((project, idx) => (
                        <div key={idx} className="p-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                          <div className="flex items-start justify-between mb-2">
                            <p className="font-semibold text-slate-900 text-sm">{project.name}</p>
                            <Badge className={
                              project.status === 'active' ? 'bg-green-100 text-green-800' :
                                project.status === 'planning' ? 'bg-blue-100 text-blue-800' :
                                  project.status === 'paused' ? 'bg-amber-100 text-amber-800' :
                                    'bg-slate-100 text-slate-800'
                            }>
                              {project.status}
                            </Badge>
                          </div>
                          {project.genes && project.genes.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {project.genes.slice(0, 4).map((gene, i) => (
                                <Badge key={i} variant="outline" className="text-xs">
                                  {gene}
                                </Badge>
                              ))}
                              {project.genes.length > 4 && (
                                <Badge variant="outline" className="text-xs">
                                  +{project.genes.length - 4}
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {widgetVisibility.recommendations && (
              <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                    Personalized Recommendations
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {recentSearches.length > 0 && (
                    <Alert className="bg-white border-blue-200">
                      <Info className="h-4 w-4 text-blue-600" />
                      <AlertDescription className="text-blue-900 text-sm">
                        <strong>Continue your research:</strong> Try comparing your recently viewed genes in the Visualization Hub
                      </AlertDescription>
                    </Alert>
                  )}

                  {medicalRecords.length > 0 && (
                    <Alert className="bg-white border-purple-200">
                      <Users className="h-4 w-4 text-purple-600" />
                      <AlertDescription className="text-purple-900 text-sm">
                        <strong>Clinical Trials:</strong> Based on your medical data, we found relevant trials.
                        <Link to={createPageUrl("MedicalData")} className="underline ml-1">
                          View matches
                        </Link>
                      </AlertDescription>
                    </Alert>
                  )}

                  <Alert className="bg-white border-amber-200">
                    <Sparkles className="h-4 w-4 text-amber-600" />
                    <AlertDescription className="text-amber-900 text-sm">
                      <strong>New Feature:</strong> Research Mode now available with bulk VCF analysis.
                      <Link to={createPageUrl("ResearchMode")} className="underline ml-1">
                        Explore
                      </Link>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            )}

            {/* Quick Actions */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link to={createPageUrl("Search")}>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Search className="w-4 h-4" />
                    New Gene Search
                  </Button>
                </Link>
                <Link to={createPageUrl("MedicalData")}>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <FileText className="w-4 h-4" />
                    Upload Medical Data
                  </Button>
                </Link>
                <Link to={createPageUrl("VisualizationHub")}>
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <TrendingUp className="w-4 h-4" />
                    Visualization Hub
                  </Button>
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
