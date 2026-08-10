import React, { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { apiClient } from "@genemap/shared";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { createPageUrl } from "@/utils";
import { normalizeSearchHistoryEntry } from "../lib/searchHistory";
import {
  publicationHistoryReplay,
  publicationReferenceFromHistory,
} from "../lib/publicationConceptCatalog";
import { log } from "../components/shared/logger";
import { DASHBOARD_REFRESH_INTERVAL_MS } from "../components/shared/constants";
import { safeModelMarkdownComponents } from "../components/shared/safeModelMarkdown";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Beaker,
  BookmarkPlus,
  ChevronRight,
  Clock,
  Dna,
  Eye,
  LayoutDashboard,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  BookOpen,
} from "lucide-react";
import OnboardingTour from "../components/dashboard/OnboardingTour";
import PublicationState, {
  enforcePublicationContentType,
  publicationContent,
} from "../components/shared/PublicationState";

const insightMarkdownComponents = Object.freeze({
  p: ({ children }) => <p className="mb-3">{children}</p>,
  strong: ({ children }) => <strong className="font-semibold text-indigo-900">{children}</strong>,
  ul: ({ children }) => <ul className="ml-5 mb-3 list-disc space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="ml-5 mb-3 list-decimal space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  ...safeModelMarkdownComponents,
});

function dashboardUserIdentity(user) {
  if (user?.id !== null && user?.id !== undefined) return `id:${String(user.id)}`;
  if (typeof user?.email !== 'string' || !user.email.trim()) return null;
  return `email:${user.email.trim().toLocaleLowerCase('en-US')}`;
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const summaryUserIdentity = dashboardUserIdentity(user);
  const researchSummaryRequestRef = useRef({
    identity: summaryUserIdentity,
    sequence: 0,
  });
  const dashboardLoadRequestRef = useRef({
    identity: summaryUserIdentity,
    sequence: 0,
  });
  if (researchSummaryRequestRef.current.identity !== summaryUserIdentity) {
    researchSummaryRequestRef.current = {
      identity: summaryUserIdentity,
      sequence: researchSummaryRequestRef.current.sequence + 1,
    };
  }
  if (dashboardLoadRequestRef.current.identity !== summaryUserIdentity) {
    dashboardLoadRequestRef.current = {
      identity: summaryUserIdentity,
      sequence: dashboardLoadRequestRef.current.sequence + 1,
    };
  }
  const [activities, setActivities] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [projects, setProjects] = useState([]);
  const [geneSets, setGeneSets] = useState([]);
  const [researchSummary, setResearchSummary] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  const generateResearchSummary = async (currentUser, activityRows, searchRows, isCurrentLoad) => {
    const requestIdentity = dashboardUserIdentity(currentUser);
    if (
      !requestIdentity
      || !isCurrentLoad()
      || researchSummaryRequestRef.current.identity !== requestIdentity
    ) return;
    const requestSequence = researchSummaryRequestRef.current.sequence + 1;
    researchSummaryRequestRef.current.sequence = requestSequence;
    const isCurrentRequest = () => (
      isCurrentLoad()
      && researchSummaryRequestRef.current.identity === requestIdentity
      && researchSummaryRequestRef.current.sequence === requestSequence
    );

    try {
      const recentGenes = [...new Set(
        activityRows
          .filter((row) => row.activityType === 'gene_view')
          .map((row) => row.entityId || row.metadata?.gene_symbol)
          .filter(Boolean),
      )].slice(0, 5);
      const recentConcepts = searchRows
        .map(normalizeSearchHistoryEntry)
        .map(publicationReferenceFromHistory)
        .filter(Boolean)
        .slice(0, 3);
      if (recentGenes.length === 0 && recentConcepts.length === 0) {
        if (isCurrentRequest()) setResearchSummary(null);
        return;
      }

      const allowedLevels = new Set([
        'elementary',
        'middle_school',
        'high_school',
        'undergraduate',
        'graduate',
        'postgraduate',
      ]);
      const educationLevel = allowedLevels.has(currentUser?.education_level)
        ? currentUser.education_level
        : 'undergraduate';
      const response = await apiClient.invokePublicationTask(
        'learning_activity_summary',
        {
          version: 1,
          educationLevel,
          recentGenes,
          recentConcepts,
        },
      );
      if (!isCurrentRequest()) return;
      setResearchSummary({
        identity: requestIdentity,
        artifact: enforcePublicationContentType(
          response?.publication,
          (content) => typeof content === 'string' && Boolean(content.trim()),
        ),
      });
    } catch (error) {
      log.debug('Research activity summary unavailable:', error);
      if (isCurrentRequest()) setResearchSummary(null);
    }
  };

  const loadDashboardData = async (autoRefresh = false, signal = null) => {
    const requestIdentity = dashboardUserIdentity(user);
    const requestSequence = dashboardLoadRequestRef.current.sequence + 1;
    dashboardLoadRequestRef.current = {
      identity: requestIdentity,
      sequence: requestSequence,
    };
    const isCurrentLoad = () => (
      dashboardLoadRequestRef.current.identity === requestIdentity
      && dashboardLoadRequestRef.current.sequence === requestSequence
    );

    if (!autoRefresh && isCurrentLoad()) setIsLoading(true);
    try {
      if (signal?.aborted || !user?.email || !isCurrentLoad()) return;
      const [activityRows, searchRows, projectRows, setRows] = await Promise.all([
        apiClient.getUserActivity().catch(() => []),
        apiClient.getSearchHistory().catch(() => []),
        apiClient.getProjects ? apiClient.getProjects().catch(() => []) : Promise.resolve([]),
        apiClient.getGeneSets().catch(() => []),
      ]);
      if (signal?.aborted || !isCurrentLoad()) return;

      setActivities(activityRows);
      setRecentSearches(searchRows);
      setProjects(projectRows);
      setGeneSets(setRows);

      const onboardingComplete = Boolean(
        user.demographicsCollected ?? user.demographics_collected,
      );
      if (
        !onboardingComplete
        && activityRows.length === 0
        && searchRows.length === 0
        && setRows.length === 0
      ) {
        setShowOnboarding(true);
      }
      await generateResearchSummary(user, activityRows, searchRows, isCurrentLoad);
    } catch (error) {
      log.error('Error loading dashboard:', error);
    } finally {
      if (!signal?.aborted && isCurrentLoad()) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  };

  useEffect(() => {
    setResearchSummary(null);
    if (!user?.email) {
      setIsLoading(false);
      return undefined;
    }
    const controller = new AbortController();
    void loadDashboardData(false, controller.signal);
    const interval = setInterval(() => {
      void loadDashboardData(true, controller.signal);
    }, DASHBOARD_REFRESH_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      controller.abort();
    };
  }, [summaryUserIdentity]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadDashboardData();
  };

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const displayName = (
    user?.fullName
    || user?.full_name
    || user?.displayName
    || user?.display_name
    || 'there'
  ).split(' ')[0];
  const geneViews = activities.filter((row) => row.activityType === 'gene_view');
  const normalizedSearches = recentSearches
    .map(normalizeSearchHistoryEntry)
    .map((search) => ({ ...search, replay: publicationHistoryReplay(search) }))
    .filter((search, index, rows) => (
      index === 0
      || (search.query || '').toLowerCase() !== (rows[index - 1].query || '').toLowerCase()
    ));
  const visibleResearchSummary = researchSummary?.identity === summaryUserIdentity
    ? researchSummary.artifact
    : null;
  const researchSummaryContent = publicationContent(visibleResearchSummary);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="mx-auto max-w-7xl animate-pulse space-y-4">
          <div className="h-32 rounded-lg bg-slate-200" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="h-64 rounded-lg bg-slate-200" />
            <div className="h-64 rounded-lg bg-slate-200" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <OnboardingTour onComplete={() => setShowOnboarding(false)} forceShow={showOnboarding} />
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-3xl font-bold text-slate-900 md:text-4xl">
                <LayoutDashboard className="h-8 w-8 text-blue-600" />
                {greeting}, {displayName}
              </h1>
              <p className="mt-1 text-slate-600">Your genetics learning and early-research workspace</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button variant="outline" onClick={() => setShowOnboarding(true)}>
                <Sparkles className="mr-2 h-4 w-4" />
                Tour
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              [Eye, geneViews.length, 'Genes Viewed', 'text-blue-600', 'bg-blue-100'],
              [Search, recentSearches.length, 'Searches', 'text-purple-600', 'bg-purple-100'],
              [Beaker, projects.length, 'Projects', 'text-green-600', 'bg-green-100'],
              [BookmarkPlus, geneSets.length, 'Gene Sets', 'text-amber-600', 'bg-amber-100'],
            ].map(([Icon, count, label, textClass, backgroundClass]) => (
              <Card key={label}>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${backgroundClass}`}>
                      <Icon className={`h-5 w-5 ${textClass}`} />
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-slate-900">{count}</p>
                      <p className="text-xs text-slate-600">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-blue-600" />
                    Recently Viewed Genes
                  </CardTitle>
                  <Badge variant="outline">{geneViews.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {geneViews.length === 0 ? (
                  <div className="py-8 text-center">
                    <Eye className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="text-sm text-slate-500">No genes viewed yet</p>
                    <Link to={createPageUrl('Search')}>
                      <Button variant="outline" size="sm" className="mt-3">Start Searching</Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {geneViews.slice(0, 5).map((activity, index) => {
                      const symbol = activity.entityId || activity.metadata?.gene_symbol || 'Unknown';
                      return (
                        <Link
                          key={activity.id || `${symbol}-${index}`}
                          to={`${createPageUrl('Search')}?query=${encodeURIComponent(symbol)}`}
                          className="block rounded-lg p-3 transition-colors hover:bg-slate-50"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{symbol}</p>
                              <p className="text-xs text-slate-500">
                                <Clock className="mr-1 inline h-3 w-3" />
                                {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : 'Date unavailable'}
                              </p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-slate-400" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Search className="h-5 w-5 text-purple-600" />
                    Recent Searches
                  </CardTitle>
                  <Link to={createPageUrl('History')}>
                    <Button variant="ghost" size="sm">View All</Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {normalizedSearches.length === 0 ? (
                  <div className="py-8 text-center">
                    <Search className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="text-sm text-slate-500">No searches yet</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {normalizedSearches.slice(0, 8).map((search, index) => (
                      <Link
                        key={search.id || `${search.query}-${index}`}
                        to={`${createPageUrl('Search')}?query=${encodeURIComponent(search.replay?.query || search.query)}`}
                        title={search.replay?.autoRun
                          ? 'Replay from the stored structured reference; external IDs are revalidated by the server.'
                          : 'Open this legacy query for review. It will not run automatically.'}
                        className="block rounded-lg p-3 transition-colors hover:bg-slate-50"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-slate-900">{search.query}</p>
                            <div className="mt-1 flex flex-wrap items-center gap-2">
                              <Badge variant="outline" className="text-xs">{search.count || 0} genes</Badge>
                              <Badge variant="outline" className="text-xs">
                                {search.replay?.autoRun ? 'Structured replay' : 'Prefill only'}
                              </Badge>
                              {search.createdAt && (
                                <span className="text-xs text-slate-500">
                                  {new Date(search.createdAt).toLocaleDateString()}
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {geneSets.length > 0 && (
              <Card className="shadow-lg">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <BookmarkPlus className="h-5 w-5 text-amber-600" />
                      Saved Gene Sets
                    </CardTitle>
                    <Badge variant="outline">{geneSets.length}</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {geneSets.slice(0, 6).map((set, index) => (
                    <Link
                      key={set.id || `${set.name}-${index}`}
                      to={createPageUrl('Search')}
                      className="block rounded-lg border border-slate-200 p-3 transition-colors hover:bg-slate-50"
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{set.name}</p>
                        <Badge variant="secondary" className="text-xs">{set.genes?.length || 0} genes</Badge>
                      </div>
                      {set.description && <p className="text-xs text-slate-600">{set.description}</p>}
                    </Link>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-6">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <Beaker className="h-5 w-5 text-green-600" />
                    Research Projects
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => navigate(createPageUrl('ResearchMode'))}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {projects.length === 0 ? (
                  <div className="py-8 text-center">
                    <Beaker className="mx-auto mb-3 h-12 w-12 text-slate-300" />
                    <p className="mb-3 text-sm text-slate-500">No projects yet</p>
                    <Button size="sm" variant="outline" onClick={() => navigate(createPageUrl('ResearchMode'))}>
                      <Plus className="mr-2 h-4 w-4" />
                      Open Research Mode
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {projects.slice(0, 5).map((project, index) => (
                      <div key={project.id || `${project.name}-${index}`} className="rounded-lg border border-slate-200 p-3">
                        <p className="font-semibold text-slate-900">{project.name || project.title}</p>
                        {project.status && <Badge variant="outline" className="mt-2 text-xs">{project.status}</Badge>}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {visibleResearchSummary && (
              <Card className="border-indigo-200 bg-gradient-to-br from-indigo-50 to-purple-50 shadow-lg">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Dna className="h-5 w-5 text-indigo-600" />
                    Research Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm leading-relaxed text-slate-800">
                  <PublicationState artifact={visibleResearchSummary} />
                  {typeof researchSummaryContent === 'string' && (
                    <ReactMarkdown components={insightMarkdownComponents}>
                      {researchSummaryContent}
                    </ReactMarkdown>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Sparkles className="h-4 w-4 text-blue-600" />
                  Continue
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link to={createPageUrl('TopicExplorer')}>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                    <BookOpen className="h-3 w-3" />
                    Continue Learning
                  </Button>
                </Link>
                <Link to={createPageUrl('Search')}>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                    <Search className="h-3 w-3" />
                    Search Candidate Genes
                  </Button>
                </Link>
                <Link to={createPageUrl('ResearchMode')}>
                  <Button variant="outline" size="sm" className="w-full justify-start gap-2">
                    <Beaker className="h-3 w-3" />
                    Guided Research Mode
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
