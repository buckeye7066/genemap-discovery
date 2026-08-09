import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import {
  Search,
  Upload,
  BookOpen,
  Dna,
  TrendingUp,
  Clock,
  Award,
  ArrowRight,
  BarChart3,
  Target,
  Activity,
  FileText,
  Bookmark,
  Users,
  Microscope,
  Shield,
  Zap
} from "lucide-react";
import ReactMarkdown from 'react-markdown';
import { safeModelMarkdownComponents } from '../components/shared/safeModelMarkdown';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [recentActivity, setRecentActivity] = useState([]);
  const [bookmarks, setBookmarks] = useState([]);
  const [studies, setStudies] = useState([]);
  const [learningProgress, setLearningProgress] = useState([]);
  const [stats, setStats] = useState({
    genesExplored: 0,
    variantsAnalyzed: 0,
    studiesCreated: 0,
    modulesCompleted: 0
  });
  const [loading, setLoading] = useState(true);
  const [aiInsights, setAiInsights] = useState(null);
  const [aiInsightsError, setAiInsightsError] = useState(null);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(false);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const currentUser = await apiClient.getCurrentUser();
      setUser(currentUser);

      // Load user-specific data
      const [activities, userBookmarks, userStudies, progress] = await Promise.all([
        apiClient.getActivities({ limit: 10 }),
        apiClient.getBookmarks(),
        apiClient.getStudies(),
        apiClient.getLearningProgress()
      ]);

      setRecentActivity(activities);
      setBookmarks(userBookmarks);
      setStudies(userStudies);
      setLearningProgress(progress);

      // Calculate stats
      const genesExplored = activities.filter(a => a.activity_type === 'gene_view').length;
      const variantsAnalyzed = activities.filter(a => a.activity_type === 'variant_analysis').length;
      const modulesCompleted = progress.filter(p => p.completed).length;

      setStats({
        genesExplored,
        variantsAnalyzed,
        studiesCreated: userStudies.length,
        modulesCompleted
      });

      // Load AI insights
      loadAIInsights(currentUser, activities, userStudies, progress);
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadAIInsights = async (currentUser, activities, userStudies, progress) => {
    if (!activities.length && !userStudies.length && !progress.length) {
      return;
    }

    setAiInsightsLoading(true);
    setAiInsightsError(null);
    try {
      const insights = await apiClient.invokeLlm(
        {
          operation: 'learning_activity_summary',
          user: {
            fullName: currentUser.full_name,
            role: currentUser.role,
          },
          activity: {
            recentActivities: activities.slice(0, 5).map((activity) => ({
              activityType: activity.activity_type,
              geneSymbol: activity.gene_symbol || null,
              createdDate: activity.created_date,
            })),
            studiesCreated: userStudies.length,
            learningModulesCompleted: progress.filter((item) => item.completed).length,
          },
        },
        'learning_activity_summary',
      );
      setAiInsights(insights);
    } catch (error) {
      console.error('Failed to load AI insights:', error);
      setAiInsights(null);
      setAiInsightsError('AI learning insights are unavailable right now.');
    } finally {
      setAiInsightsLoading(false);
    }
  };

  const getActivityIcon = (type) => {
    switch (type) {
      case 'gene_view': return Dna;
      case 'variant_analysis': return BarChart3;
      case 'study_created': return Microscope;
      case 'module_completed': return Award;
      case 'bookmark_added': return Bookmark;
      default: return Activity;
    }
  };

  const getActivityColor = (type) => {
    switch (type) {
      case 'gene_view': return 'bg-blue-100 text-blue-600';
      case 'variant_analysis': return 'bg-purple-100 text-purple-600';
      case 'study_created': return 'bg-green-100 text-green-600';
      case 'module_completed': return 'bg-yellow-100 text-yellow-600';
      case 'bookmark_added': return 'bg-red-100 text-red-600';
      default: return 'bg-gray-100 text-gray-600';
    }
  };

  const calculateOverallProgress = () => {
    if (!learningProgress.length) return 0;
    const totalProgress = learningProgress.reduce((sum, p) => sum + (p.progress_percentage || 0), 0);
    return Math.round(totalProgress / learningProgress.length);
  };

  const quickActions = [
    {
      title: "Search Genes",
      description: "Explore gene functions and relationships",
      icon: Search,
      color: "bg-blue-500",
      url: createPageUrl("GeneSearch")
    },
    {
      title: "Analyze VCF",
      description: "Upload and analyze genetic variants",
      icon: Upload,
      color: "bg-purple-500",
      url: createPageUrl("VCFUpload")
    },
    {
      title: "Start Learning",
      description: "Continue your genetics education",
      icon: BookOpen,
      color: "bg-green-500",
      url: createPageUrl("Learning")
    },
    {
      title: "Research Mode",
      description: "Create and manage research studies",
      icon: Microscope,
      color: "bg-orange-500",
      url: createPageUrl("ResearchMode")
    }
  ];

  if (loading) {
    return (
      <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-20 w-full" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Skeleton className="h-96 lg:col-span-2" />
            <Skeleton className="h-96" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gradient-to-br from-slate-50 to-blue-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Welcome Header */}
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between">
              <div>
                <h1 className="text-3xl font-bold mb-2">
                  Welcome back, {user?.full_name?.split(' ')[0] || 'Researcher'}!
                </h1>
                <p className="text-blue-100 text-lg">
                  Continue your journey into the fascinating world of genetics
                </p>
              </div>
              <div className="mt-4 md:mt-0 flex items-center gap-3">
                <div className="text-right">
                  <div className="text-2xl font-bold">{calculateOverallProgress()}%</div>
                  <div className="text-blue-200 text-sm">Learning Progress</div>
                </div>
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                  <TrendingUp className="w-8 h-8" />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Genes Explored</p>
                  <p className="text-3xl font-bold text-slate-900">{stats.genesExplored}</p>
                </div>
                <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Dna className="w-6 h-6 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Variants Analyzed</p>
                  <p className="text-3xl font-bold text-slate-900">{stats.variantsAnalyzed}</p>
                </div>
                <div className="w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <BarChart3 className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Research Studies</p>
                  <p className="text-3xl font-bold text-slate-900">{stats.studiesCreated}</p>
                </div>
                <div className="w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <Microscope className="w-6 h-6 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-slate-500 text-sm font-medium">Modules Completed</p>
                  <p className="text-3xl font-bold text-slate-900">{stats.modulesCompleted}</p>
                </div>
                <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Award className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Quick Actions */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-yellow-500" />
                Quick Actions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {quickActions.map((action, index) => (
                  <Link key={index} to={action.url}>
                    <div className="group p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-md transition-all cursor-pointer">
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 ${action.color} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                          <action.icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-slate-900 mb-1 group-hover:text-blue-600 transition-colors">
                            {action.title}
                          </h3>
                          <p className="text-sm text-slate-600 mb-2">
                            {action.description}
                          </p>
                          <div className="flex items-center text-blue-600 text-sm font-medium">
                            Get Started
                            <ArrowRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* AI Insights */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Target className="w-5 h-5 text-purple-500" />
                AI Insights
              </CardTitle>
            </CardHeader>
            <CardContent>
              {aiInsightsLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              ) : aiInsights ? (
                <div className="prose prose-sm max-w-none text-slate-700">
                  <ReactMarkdown
                    components={{
                      ...safeModelMarkdownComponents,
                      p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
                      ul: ({ children }) => <ul className="list-disc pl-4 space-y-1">{children}</ul>,
                      li: ({ children }) => <li>{children}</li>,
                    }}
                  >
                    {aiInsights}
                  </ReactMarkdown>
                </div>
              ) : aiInsightsError ? (
                <p className="text-sm text-slate-500">{aiInsightsError}</p>
              ) : (
                <div className="text-center py-4">
                  <Target className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm text-slate-500">
                    Start exploring genes and completing modules to receive personalized insights.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity and Progress Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-blue-500" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {recentActivity.length > 0 ? (
                <div className="space-y-4">
                  {recentActivity.slice(0, 6).map((activity, index) => {
                    const ActivityIcon = getActivityIcon(activity.activity_type);
                    return (
                      <div key={index} className="flex items-center gap-3 p-3 rounded-lg hover:bg-slate-50 transition-colors">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getActivityColor(activity.activity_type)}`}>
                          <ActivityIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-slate-900">
                            {activity.description || activity.activity_type.replace('_', ' ')}
                          </p>
                          <p className="text-sm text-slate-500">
                            {new Date(activity.created_date).toLocaleDateString()}
                          </p>
                        </div>
                        {activity.gene_symbol && (
                          <Badge variant="outline">{activity.gene_symbol}</Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500">No recent activity</p>
                  <p className="text-sm text-slate-400">Start exploring to see your activity here</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Learning Progress */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-green-500" />
                Learning Progress
              </CardTitle>
            </CardHeader>
            <CardContent>
              {learningProgress.length > 0 ? (
                <div className="space-y-4">
                  {learningProgress.slice(0, 5).map((progress, index) => (
                    <div key={index} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-slate-900">{progress.module_name}</p>
                          <p className="text-sm text-slate-500">
                            {progress.completed ? 'Completed' : 'In Progress'}
                          </p>
                        </div>
                        <Badge variant={progress.completed ? "default" : "secondary"}>
                          {progress.progress_percentage || 0}%
                        </Badge>
                      </div>
                      <Progress value={progress.progress_percentage || 0} className="h-2" />
                    </div>
                  ))}
                  <Link to={createPageUrl("Learning")}>
                    <Button variant="outline" className="w-full mt-4">
                      Continue Learning
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-8">
                  <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-500 mb-3">Ready to start learning?</p>
                  <Link to={createPageUrl("Learning")}>
                    <Button>
                      Browse Modules
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Bookmarks and Studies */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Bookmarks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bookmark className="w-5 h-5 text-red-500" />
                  Recent Bookmarks
                </div>
                <Badge variant="secondary">{bookmarks.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {bookmarks.length > 0 ? (
                <div className="space-y-3">
                  {bookmarks.slice(0, 4).map((bookmark, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                      <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                        <Bookmark className="w-5 h-5 text-red-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{bookmark.title}</p>
                        <p className="text-sm text-slate-500">{bookmark.bookmark_type}</p>
                      </div>
                    </div>
                  ))}
                  <Link to={createPageUrl("Bookmarks")}>
                    <Button variant="ghost" className="w-full">
                      View All Bookmarks
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Bookmark className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No bookmarks yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Research Studies */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Microscope className="w-5 h-5 text-green-500" />
                  Research Studies
                </div>
                <Badge variant="secondary">{studies.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {studies.length > 0 ? (
                <div className="space-y-3">
                  {studies.slice(0, 4).map((study, index) => (
                    <div key={index} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <FileText className="w-5 h-5 text-green-600" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-900">{study.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">{study.study_type}</Badge>
                          <span className="text-xs text-slate-500">{study.status}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link to={createPageUrl("ResearchMode")}>
                    <Button variant="ghost" className="w-full">
                      View All Studies
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </Link>
                </div>
              ) : (
                <div className="text-center py-6">
                  <Microscope className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500 mb-3">No research studies yet</p>
                  <Link to={createPageUrl("ResearchMode")}>
                    <Button size="sm">Create Study</Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Privacy Notice */}
        <Card className="border-green-200 bg-green-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-800">Your Privacy Matters</p>
                <p className="text-xs text-green-700">
                  Your data is encrypted and never shared. You have full control over your genetic information.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}