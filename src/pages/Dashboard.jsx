import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { log } from "../components/shared/logger";
import { DASHBOARD_REFRESH_INTERVAL_MS } from "../components/shared/constants";
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
  Info,
  BookmarkPlus,
  Brain,
  Heart,
  RefreshCw,
  Dna
} from "lucide-react";
import OnboardingTour from "../components/dashboard/OnboardingTour";


export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [recentGenes, setRecentGenes] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [geneSets, setGeneSets] = useState([]);
  const [aiConversations, setAiConversations] = useState([]);
  const [personalizedInsights, setPersonalizedInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState({
    recentGenes: true,
    recentSearches: true,
    projects: true,
    medicalRecords: true,
    geneSets: true,
    aiChats: true,
    insights: true,
    recommendations: true
  });

  useEffect(() => {
    const controller = new AbortController();
    
    loadDashboardData(false, controller.signal);
    
    // Auto-refresh for real-time updates
    const interval = setInterval(() => {
      loadDashboardData(true, controller.signal);
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, []);

  const loadDashboardData = async (isAutoRefresh = false, signal = null) => {
    if (!isAutoRefresh) {
      setIsLoading(true);
    }
    
    try {
      // Check if aborted
      if (signal?.aborted) return;
      
      const currentUser = await base44.auth.me();
      setUser(currentUser);

      if (!currentUser?.email) {
        setIsLoading(false);
        return;
      }

      if (!currentUser.onboarding_completed) {
        setShowOnboarding(true);
      }

      const userEmail = currentUser.email;

      // Load all data in parallel with RLS fallback
      const [activities, searches, userProjects, records, sets, conversations] = await Promise.all([
        base44.entities.UserActivity.filter(
          { 
            created_by: userEmail,
            activity_type: "gene_view"
          },
          '-created_date',
          10
        ),
        base44.entities.SearchHistory.filter(
          { created_by: userEmail },
          '-created_date',
          5
        ),
        base44.entities.ResearchProject.filter(
          { created_by: userEmail },
          '-updated_date',
          10
        ),
        base44.entities.MedicalData.filter(
          { created_by: userEmail },
          '-created_date',
          3
        ),
        base44.entities.GeneSet.filter(
          { created_by: userEmail },
          '-created_date',
          5
        ),
        // TODO: For large datasets, switch to server-side filtering + pagination.
        base44.entities.AIConversation.filter(
          { created_by: userEmail },
          '-updated_date',
          5
        ).catch(err => {
          log.error("AIConversation fetch error:", err);
          return [];
        })
      ]);

      setRecentGenes(activities);
      setRecentSearches(searches);
      setProjects(userProjects);
      setMedicalRecords(records);
      setGeneSets(sets);
      setAiConversations(conversations);

      // Generate personalized insights
      if (activities.length > 0 || records.length > 0 || searches.length > 0) {
        generatePersonalizedInsights(currentUser, activities, records, searches);
      }

    } catch (err) {
      log.error("Error loading dashboard:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const generatePersonalizedInsights = async (user, activities, records, searches) => {
    try {
      const uniqueGenes = [...new Set(activities.map(a => a.gene_symbol))];
      const allPhenotypes = searches.flatMap(s => s.hpo_term || s.phenotype_query);
      const relevantGenes = records.flatMap(r => r.relevant_genes || []);

      const prompt = `As an AI genomics advisor, provide 3 personalized insights for this user:

**User Profile:**
- Education: ${user.education_level || 'General'}
- Recently viewed genes: ${uniqueGenes.slice(0, 5).join(', ')}
- Recent phenotype searches: ${allPhenotypes.slice(0, 3).join(', ')}
- Medical data genes: ${relevantGenes.slice(0, 5).join(', ')}

**Task:** Generate 3 brief, actionable insights (2-3 sentences each):
1. A pattern or trend in their research
2. A connection they might have missed
3. A next step recommendation

Keep each insight under 50 words, practical, and personalized.`;

      const response = await base44.integrations.Core.InvokeLLM({
        prompt,
        add_context_from_internet: false
      });

      setPersonalizedInsights(response);
    } catch (err) {
      log.error("Error generating insights:", err);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
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
      <OnboardingTour onComplete={() => setShowOnboarding(false)} forceShow={showOnboarding} />

      <div className="max-w-7xl mx-auto">
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
                onClick={handleRefresh}
                disabled={isRefreshing}
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button 
                variant="outline" 
                className="gap-2"
                onClick={() => setShowOnboarding(true)}
              >
                <Sparkles className="w-4 h-4" />
                Tour
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
                    <BookmarkPlus className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">{geneSets.length}</p>
                    <p className="text-xs text-slate-600">Gene Sets</p>
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

            {/* Saved Gene Sets */}
            {widgetVisibility.geneSets && geneSets.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <BookmarkPlus className="w-5 h-5 text-amber-600" />
                      Saved Gene Sets
                    </CardTitle>
                    <Badge variant="outline">{geneSets.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {geneSets.map((set, idx) => (
                      <Link
                        key={idx}
                        to={createPageUrl("Search")}
                        className="block p-3 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="font-semibold text-slate-900 text-sm">{set.name}</p>
                          <Badge variant="secondary" className="text-xs">
                            {set.genes?.length || 0} genes
                          </Badge>
                        </div>
                        {set.description && (
                          <p className="text-xs text-slate-600 mb-2">{set.description}</p>
                        )}
                        {set.genes && set.genes.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {set.genes.slice(0, 5).map((gene, i) => (
                              <Badge key={i} variant="outline" className="text-xs">
                                {gene}
                              </Badge>
                            ))}
                            {set.genes.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{set.genes.length - 5}
                              </Badge>
                            )}
                          </div>
                        )}
                      </Link>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* AI Chat Sessions */}
            {widgetVisibility.aiChats && aiConversations.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <Brain className="w-5 h-5 text-indigo-600" />
                      Recent AI Conversations
                    </CardTitle>
                    <Link to={createPageUrl("AIAssistants")}>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {aiConversations.map((conv, idx) => (
                      <Link
                        key={idx}
                        to={createPageUrl("AIAssistants")}
                        className="block p-3 hover:bg-slate-50 rounded-lg transition-colors border border-slate-200"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                            conv.assistant_type === 'robert' 
                              ? 'bg-blue-100' 
                              : 'bg-purple-100'
                          }`}>
                            {conv.assistant_type === 'robert' ? (
                              <Brain className="w-4 h-4 text-blue-600" />
                            ) : (
                              <Heart className="w-4 h-4 text-purple-600" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs font-semibold text-slate-900 capitalize">
                                {conv.assistant_type}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {conv.messages?.length || 0} msgs
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600 truncate">
                              {conv.last_message_preview || 'No preview'}
                            </p>
                            <p className="text-xs text-slate-400 mt-1">
                              {new Date(conv.updated_date).toLocaleString()}
                            </p>
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

            {/* AI-Generated Personalized Insights */}
            {widgetVisibility.insights && personalizedInsights && (
              <Card className="shadow-lg bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Dna className="w-5 h-5 text-indigo-600" />
                    Personalized Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-800 leading-relaxed whitespace-pre-line">
                  {personalizedInsights}
                </CardContent>
              </Card>
            )}

            {/* Medical Records */}
            {widgetVisibility.medicalRecords && medicalRecords.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <FileText className="w-4 h-4 text-green-600" />
                      Medical Records
                    </CardTitle>
                    <Link to={createPageUrl("MedicalData")}>
                      <Button variant="ghost" size="sm">
                        <Plus className="w-3 h-3" />
                      </Button>
                    </Link>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {medicalRecords.map((record, idx) => (
                      <div
                        key={idx}
                        className="p-2 border border-slate-200 rounded text-xs"
                      >
                        <p className="font-medium text-slate-900">
                          {record.file_type === 'genetic_test' ? '🧬' : 
                           record.file_type === 'blood_test' ? '💉' : 
                           record.file_type === 'vcf_file' ? '📊' : '📄'}{' '}
                          {record.file_type.replace('_', ' ').toUpperCase()}
                        </p>
                        <p className="text-slate-500 mt-1">
                          {new Date(record.created_date).toLocaleDateString()}
                        </p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Recommendations */}
            {widgetVisibility.recommendations && (
              <Card className="shadow-lg bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Sparkles className="w-4 h-4 text-blue-600" />
                    Quick Actions
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Link to={createPageUrl("AIAssistants")}>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                      <Brain className="w-3 h-3" />
                      New AI Chat
                    </Button>
                  </Link>
                  {recentGenes.length >= 2 && (
                    <Link to={createPageUrl("VisualizationHub")}>
                      <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                        <TrendingUp className="w-3 h-3" />
                        Compare Genes
                      </Button>
                    </Link>
                  )}
                  <Link to={createPageUrl("Search")}>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                      <Search className="w-3 h-3" />
                      New Search
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}


          </div>
        </div>
      </div>
    </div>
  );
}