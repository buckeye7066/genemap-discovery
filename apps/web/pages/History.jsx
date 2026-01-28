import React, { useState, useEffect } from "react";
import { apiClient } from "@genemap/shared";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  History as HistoryIcon, 
  Search, 
  Crown, 
  Calendar,
  TrendingUp,
  AlertCircle,
  FileText,
  Trash2,
  X
} from "lucide-react";
import { format } from "date-fns";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function HistoryPage() {
  const [searchHistory, setSearchHistory] = useState([]);
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [successMessage, setSuccessMessage] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const currentUser = await apiClient.getMe();
      setUser(currentUser);
      
      // BACKEND_NEEDED: SearchHistory entity needs API implementation
      // const history = await base44.entities.SearchHistory.filter(
      //   { created_by: currentUser.email },
      //   '-created_date',
      //   50
      // );
      // setSearchHistory(history);
      setSearchHistory([]);
    } catch (err) {
      console.error("Error loading history:", err);
      setError("Unable to load search history");
    } finally {
      setIsLoading(false);
    }
  };

  const getSearchTypeIcon = (type) => {
    return type === "premium" ? 
      <Crown className="w-4 h-4 text-amber-600" /> : 
      <Search className="w-4 h-4 text-blue-600" />;
  };

  const getSearchTypeBadge = (type) => {
    return type === "premium" ? (
      <Badge className="bg-amber-100 text-amber-800 border-amber-200">
        <Crown className="w-3 h-3 mr-1" />
        Premium
      </Badge>
    ) : (
      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
        Free
      </Badge>
    );
  };

  const handleDeleteSearch = async (searchId) => {
    if (!confirm("Are you sure you want to delete this search from your history?")) {
      return;
    }

    setDeletingId(searchId);
    setError(null);

    try {
      // BACKEND_NEEDED: SearchHistory entity needs API implementation
      // await base44.entities.SearchHistory.delete(searchId);
      setSearchHistory(prev => prev.filter(s => s.id !== searchId));
      setSuccessMessage("Search deleted successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error deleting search:", err);
      setError("Failed to delete search. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAllHistory = async () => {
    if (!confirm(`Are you sure you want to delete all ${searchHistory.length} searches from your history? This action cannot be undone.`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // BACKEND_NEEDED: SearchHistory entity needs API implementation
      // Delete all searches
      // await Promise.all(
      //   searchHistory.map(search => base44.entities.SearchHistory.delete(search.id))
      // );
      setSearchHistory([]);
      setSuccessMessage("All search history cleared successfully");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err) {
      console.error("Error clearing history:", err);
      setError("Failed to clear all history. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-4">
            {Array(5).fill(0).map((_, i) => (
              <div key={i} className="h-24 bg-slate-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-slate-600 to-slate-700 rounded-2xl flex items-center justify-center shadow-lg">
              <HistoryIcon className="w-8 h-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Search History
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            Review your previous phenotype searches and results
          </p>
          {searchHistory.length > 0 && (
            <div className="mt-4">
              <Button
                variant="outline"
                onClick={handleClearAllHistory}
                className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All History
              </Button>
            </div>
          )}
        </div>

        {error && (
          <Alert variant="destructive" className="mb-8">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {successMessage && (
          <Alert className="mb-8 bg-green-50 border-green-200">
            <AlertCircle className="h-4 w-4 text-green-600" />
            <AlertDescription className="text-green-800">{successMessage}</AlertDescription>
          </Alert>
        )}

        {searchHistory.length > 0 && (
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-blue-100 rounded-xl flex items-center justify-center">
                  <Search className="w-6 h-6 text-blue-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {searchHistory.length}
                </div>
                <p className="text-sm text-slate-600">Total Searches</p>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-green-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {searchHistory.reduce((sum, search) => sum + (search.results_count || 0), 0)}
                </div>
                <p className="text-sm text-slate-600">Genes Discovered</p>
              </CardContent>
            </Card>

            <Card className="bg-white/80 backdrop-blur-sm">
              <CardContent className="pt-6 text-center">
                <div className="w-12 h-12 mx-auto mb-3 bg-amber-100 rounded-xl flex items-center justify-center">
                  <Crown className="w-6 h-6 text-amber-600" />
                </div>
                <div className="text-2xl font-bold text-slate-900">
                  {searchHistory.filter(s => s.search_type === "premium").length}
                </div>
                <p className="text-sm text-slate-600">Premium Searches</p>
              </CardContent>
            </Card>
          </div>
        )}

        {searchHistory.length > 0 ? (
          <div className="space-y-4">
            {searchHistory.map((search) => (
              <Card key={search.id} className="hover:shadow-md transition-shadow duration-200">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        {getSearchTypeIcon(search.search_type)}
                        <h3 className="font-semibold text-slate-900">
                          "{search.phenotype_query}"
                        </h3>
                        {getSearchTypeBadge(search.search_type)}
                      </div>
                      
                      <div className="flex items-center gap-4 text-sm text-slate-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          {format(new Date(search.created_date), "MMM d, yyyy 'at' h:mm a")}
                        </div>
                        
                        {search.results_count && (
                          <div className="flex items-center gap-1">
                            <TrendingUp className="w-4 h-4" />
                            {search.results_count} genes found
                          </div>
                        )}

                        {search.hpo_term && (
                          <Badge variant="outline" className="text-xs">
                            HPO: {search.hpo_term}
                          </Badge>
                        )}
                      </div>

                      {search.candidate_genes && search.candidate_genes.length > 0 && (
                        <div className="mt-3">
                          <div className="flex flex-wrap gap-2">
                            <span className="text-sm text-slate-500">Genes:</span>
                            {search.candidate_genes.slice(0, 5).map((gene, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {gene}
                              </Badge>
                            ))}
                            {search.candidate_genes.length > 5 && (
                              <Badge variant="outline" className="text-xs">
                                +{search.candidate_genes.length - 5} more
                              </Badge>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        asChild
                      >
                        <Link to={createPageUrl(`Search?query=${encodeURIComponent(search.phenotype_query)}`)}>
                          Search Again
                        </Link>
                      </Button>
                      
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDeleteSearch(search.id)}
                        disabled={deletingId === search.id}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700 border-red-200"
                      >
                        {deletingId === search.id ? (
                          <div className="w-4 h-4 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <X className="w-4 h-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
            <CardContent className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto mb-4 text-slate-400" />
              <h3 className="text-xl font-semibold text-slate-700 mb-2">
                No Search History
              </h3>
              <p className="text-slate-500 mb-6">
                Your phenotype searches will appear here
              </p>
              <Link to={createPageUrl("Search")}>
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Search className="w-4 h-4 mr-2" />
                  Start Your First Search
                </Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}