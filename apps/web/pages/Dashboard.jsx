import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  normalizeSearchHistoryEntry,
  publicationReferenceFromSearchHistoryEntry,
} from "../lib/searchHistory";
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
  ChevronRight,
  Plus,
  Info,
  BookmarkPlus,
  RefreshCw,
  Dna,
  BookOpen
} from "lucide-react";
import OnboardingTour from "../components/dashboard/OnboardingTour";


export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [recentGenes, setRecentGenes] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [geneSets, setGeneSets] = useState([]);
  const [personalizedInsights, setPersonalizedInsights] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [widgetVisibility, setWidgetVisibility] = useState({
    recentGenes: true,
    recentSearches: true,
    projects: true,
    geneSets: true,
    insights: true,
    recommendations: true
  });

  useEffect(() => {
    if (!user?.email) return;

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
  }, [user]);

  const loadDashboardData = async (isAutoRefresh = false, signal = null) => {
    if (!isAutoRefresh) {
      setIsLoading(true);
    }
    
    try {
      if (signal?.aborted) return;
      
      if (!user?.email) {
        setIsLoading(false);
        return;
      }

      const [activities, searches, userProjects, sets] = await Promise.all([
        apiClient.getUserActivity().catch(() => []),
        apiClient.getSearchHistory().catch(() => []),
        apiClient.getProjects ? apiClient.getProjects().catch(() => []) : Promise.resolve([]),
        apiClient.getGeneSets().catch(() => []),
      ]);

      setRecentGenes(activities);
      setRecentSearches(searches);
      setProjects(userProjects);
      setGeneSets(sets);

      // Onboarding completion is persisted as `demographicsCollected`. Only show
      // the first-run tour to genuinely new accounts: an established user (e.g. a
      // seeded/promoted super-admin who never ran onboarding but has plenty of
      // activity) shouldn't be greeted with a "welcome, get started" tour.
      if (
        !user.demographicsCollected &&
        activities.length === 0 &&
        searches.length === 0 &&
        sets.length === 0
      ) {
        setShowOnboarding(true);
      }

      // Generate personalized insights
      if (activities.length > 0 || searches.length > 0) {
        generatePersonalizedInsights(user, activities, searches);
      }

    } catch (err) {
      log.error("Error loading dashboard:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const generatePersonalizedInsights = async (user, activities, searches) => {
    try {
      const uniqueGenes = [...new Set(
        activities
          .filter(a => a.activityType === 'gene_view')
          .map(a => a.entityId || a.metadata?.gene_symbol)
          .filter(Boolean)
      )];
      const recentConcepts = searches
        .map(publicationReferenceFromSearchHistoryEntry)
        .filter(Boolean)
        .slice(0, 3);
      const allowedLevels = new Set([
        'elementary', 'middle_school', 'high_school', 'undergraduate',
        'graduate', 'postgraduate',
      ]);
      const educationLevel = allowedLevels.has(user.education_level)
        ? user.education_level
        : 'undergraduate';
      if (uniqueGenes.length === 0 && recentConcepts.length === 0) return;
      const response = await apiClient.invokePublicationTask(
        'learning_activity_summary',
        {
          version: 1,
          educationLevel,
          recentGenes: uniqueGenes.slice(0, 5),
          recentConcepts,
        },
      );
      const insightText = typeof response === 'string' ? response : response?.result;
      if (insightText) setPersonalizedInsights(insightText);
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

  const handleCreateProject = () => navigate(createPageUrl("ResearchMode"));

  // The activity feed holds many activity types; "Recently Viewed Genes" should
  // only show gene_view rows, with the symbol read from entityId.
  const geneViews = recentGenes.filter((a) => a.activityType === "gene_view");
  // Collapse consecutive identical queries so the recent-searches list doesn't
  // show the same term repeated back-to-back (e.g. several "Cystic Fibrosis").
  const normalizedSearches = recentSearches
    .map(normalizeSearchHistoryEntry)
    .filter((s, i, arr) => i === 0 || (s.query || '').toLowerCase() !== (arr[i - 1].query || '').toLowerCase());

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
                {getGreeting()}, {(user?.fullName || user?.full_name || user?.displayName)?.split(' ')[0] || 'there'}
              </h1>
              <p className="text-slate-600 mt-1">
                Welcome to your genetics learning and research dashboard
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
                    <p className="text-2xl font-bold text-slate-900">{geneViews.length}</p>
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
                    <Badge variant="outline">{geneViews.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  {geneViews.length === 0 ? (
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
                      {geneViews.slice(0, 5).map((activity, idx) => {
                        const symbol = activity.entityId || activity.metadata?.gene_symbol || 'Unknown';
                        return (
                          <Link
                            key={activity.id || idx}
                            to={`${createPageUrl("Search")}?query=${encodeURIComponent(symbol)}`}
                            className="block p-3 hover:bg-slate-50 rounded-lg transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{symbol}</p>
                                <p className="text-xs text-slate-500">
                                  <Clock className="w-3 h-3 inline mr-1" />
                                  {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : '—'}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-slate-400" />
                            </div>
                          </Link>
                        );
                      })}
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
                      {normalizedSearches.map((search, idx) => (
                        <Link
                          key={search.id || idx}
                          to={`${createPageUrl("Search")}?query=${encodeURIComponent(search.query)}`}
                          className="block p-3 hover:bg-slate-50 rounded-lg transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <p className="font-medium text-slate-900">{search.query}</p>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge variant="outline" className="text-xs">
                                  {search.count || 0} genes
                                </Badge>
                                <Badge variant={search.queryType === 'premium' ? 'default' : 'secondary'} className="text-xs">
                                  {search.queryType}
                                </Badge>
                                {search.createdAt && (
                                  <span className="text-xs text-slate-500">
                                    {new Date(search.createdAt).toLocaleDateString()}
                                  </span>
                                )}
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
                    <Button variant="ghost" size="sm" onClick={handleCreateProject}>
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {projects.length === 0 ? (
                    <div className="text-center py-8">
                      <Beaker className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                      <p className="text-slate-500 text-sm mb-3">No projects yet</p>
                      <Button size="sm" variant="outline" onClick={handleCreateProject}>
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
                    Research Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-slate-800 leading-relaxed">
                  {/* Render markdown so bold and lists in the AI text are
                      formatted instead of showing literal asterisks. */}
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="mb-3">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-indigo-900">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc ml-5 mb-3 space-y-1">{children}</ul>,
                      ol: ({ children }) => <ol className="list-decimal ml-5 mb-3 space-y-1">{children}</ol>,
                      li: ({ children }) => <li>{children}</li>,
                    }}
                  >
                    {personalizedInsights}
                  </ReactMarkdown>
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
                  <Link to={createPageUrl("TopicExplorer")}>
                    <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                      <BookOpen className="w-3 h-3" />
                      Continue Learning
                    </Button>
                  </Link>
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
