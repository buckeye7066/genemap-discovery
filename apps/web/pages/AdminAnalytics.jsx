import React, { useEffect, useMemo, useState } from "react";
import { apiClient } from "@genemap/shared";
import { useAuth } from "../lib/AuthContext";
import { isAdminUser } from "../lib/roles";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from "recharts";
import {
  Activity,
  AlertCircle,
  BarChart3,
  FileText,
  Search,
  ShieldCheck,
  Users
} from "lucide-react";

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#84cc16'];

const ACTIVITY_LABELS = {
  gene_view: 'Gene views',
  search: 'Searches',
  search_view: 'Search views',
  project_create: 'Projects created',
  project_update: 'Projects updated',
  learning_activity: 'Learning activities',
  login: 'Sign-ins',
  page_view: 'Page views',
  other: 'Other'
};

const SEARCH_LABELS = {
  disease: 'Disease concepts',
  hpo_term: 'HPO terms',
  mondo_term: 'MONDO terms',
  gene: 'Genes',
  phenotype: 'Phenotypes',
  free_text: 'Reviewed text searches',
  other: 'Other'
};

function countValue(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function aggregateBreakdown(rows, key, labels) {
  const counts = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const rawKey = typeof row?.[key] === 'string' ? row[key] : 'other';
    const name = labels[rawKey] || labels.other;
    counts.set(name, (counts.get(name) || 0) + countValue(row?.count));
  }

  return Array.from(counts, ([name, value]) => ({ name, value }))
    .filter(({ value }) => value > 0)
    .sort((a, b) => b.value - a.value);
}

function ChartEmpty({ label }) {
  return (
    <div className="h-[300px] flex flex-col items-center justify-center text-slate-400">
      <BarChart3 className="w-10 h-10 mb-2 text-slate-300" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, colorClass }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${colorClass}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900">{countValue(value).toLocaleString()}</p>
            <p className="text-xs text-slate-600">{label}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function AdminAnalytics() {
  const { user, isLoadingAuth } = useAuth();
  const [analytics, setAnalytics] = useState({
    stats: {},
    activityTypeBreakdown: [],
    searchTypeBreakdown: [],
    dailyActivity: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (isLoadingAuth) return;

    let isCurrent = true;

    async function loadAnalytics() {
      if (!isAdminUser(user)) {
        if (isCurrent) {
          setError('Admin access required');
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const response = await apiClient.getAdminAnalytics();
        if (!isCurrent) return;

        setAnalytics({
          stats: response?.stats || {},
          activityTypeBreakdown: Array.isArray(response?.activityTypeBreakdown)
            ? response.activityTypeBreakdown
            : [],
          searchTypeBreakdown: Array.isArray(response?.searchTypeBreakdown)
            ? response.searchTypeBreakdown
            : [],
          dailyActivity: Array.isArray(response?.dailyActivity) ? response.dailyActivity : []
        });
      } catch (requestError) {
        if (isCurrent) {
          console.error('Error loading aggregate analytics:', requestError);
          setError(requestError?.message || 'Failed to load analytics');
        }
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    loadAnalytics();
    return () => {
      isCurrent = false;
    };
  }, [isLoadingAuth, user]);

  const activityTypes = useMemo(
    () => aggregateBreakdown(analytics.activityTypeBreakdown, 'activityType', ACTIVITY_LABELS),
    [analytics.activityTypeBreakdown]
  );

  const searchTypes = useMemo(
    () => aggregateBreakdown(analytics.searchTypeBreakdown, 'queryType', SEARCH_LABELS),
    [analytics.searchTypeBreakdown]
  );

  const dailyActivity = useMemo(
    () => analytics.dailyActivity.map((row) => ({
      date: typeof row?.date === 'string' ? row.date : '',
      activities: countValue(row?.activities),
      searches: countValue(row?.searches)
    })).filter(({ date }) => date),
    [analytics.dailyActivity]
  );

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-7xl mx-auto animate-pulse space-y-4">
          <div className="h-28 bg-slate-200 rounded-lg" />
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-72 bg-slate-200 rounded-lg" />
            <div className="h-72 bg-slate-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !isAdminUser(user)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error || 'Admin access required to view analytics'}</AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  const { stats } = analytics;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <BarChart3 className="w-10 h-10 text-blue-600" />
            Aggregate Platform Analytics
          </h1>
          <p className="text-slate-600">
            Category-level operational metrics for the education and early-research service.
          </p>
        </div>

        <Alert className="border-blue-200 bg-blue-50">
          <ShieldCheck className="h-4 w-4 text-blue-700" />
          <AlertDescription className="text-blue-900">
            This dashboard contains aggregate counts only. Individual search text, record contents,
            activity metadata, and user identities are excluded.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            icon={Users}
            label="Users"
            value={stats.totalUsers}
            colorClass="bg-blue-100 text-blue-600"
          />
          <StatCard
            icon={ShieldCheck}
            label="Active subscriptions"
            value={stats.activeSubscriptions}
            colorClass="bg-amber-100 text-amber-600"
          />
          <StatCard
            icon={Search}
            label="Searches"
            value={stats.totalSearches}
            colorClass="bg-purple-100 text-purple-600"
          />
          <StatCard
            icon={FileText}
            label="Research projects"
            value={stats.totalGeneSets}
            colorClass="bg-green-100 text-green-600"
          />
          <StatCard
            icon={Activity}
            label="Activities"
            value={stats.totalActivities}
            colorClass="bg-cyan-100 text-cyan-600"
          />
        </div>

        <div className="grid lg:grid-cols-2 gap-6">
          <Card className="shadow-lg lg:col-span-2">
            <CardHeader>
              <CardTitle>Aggregate activity (7 days)</CardTitle>
            </CardHeader>
            <CardContent>
              {dailyActivity.some((row) => row.activities > 0 || row.searches > 0) ? (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="activities" stroke="#3b82f6" strokeWidth={2} />
                    <Line type="monotone" dataKey="searches" stroke="#8b5cf6" strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No aggregate activity recorded yet" />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Activity categories</CardTitle>
            </CardHeader>
            <CardContent>
              {activityTypes.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={activityTypes}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={90}
                      dataKey="value"
                    >
                      {activityTypes.map((entry, index) => (
                        <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No activity categories recorded yet" />
              )}
            </CardContent>
          </Card>

          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Search categories</CardTitle>
            </CardHeader>
            <CardContent>
              {searchTypes.length ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={searchTypes} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis type="number" allowDecimals={false} />
                    <YAxis dataKey="name" type="category" width={150} />
                    <Tooltip />
                    <Bar dataKey="value" fill="#8b5cf6" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <ChartEmpty label="No search categories recorded yet" />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
