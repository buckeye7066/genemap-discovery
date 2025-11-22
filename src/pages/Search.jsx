import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DnaIcon from "../components/icons/DnaIcon";
import { Search, AlertCircle, GitCompare, BookmarkPlus, Library, Sparkles, BarChart3 } from "lucide-react"; // Added BarChart3
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

import SearchForm from "../components/search/SearchForm";
import GeneResults from "../components/search/GeneResults";
import LoadingSpinner from "../components/search/LoadingSpinner";
import GeneComparison from "../components/search/GeneComparison";
import GeneInputForm from "../components/search/GeneInputForm";
import GeneSetComparison from "../components/search/GeneSetComparison";
import SavedGeneSets from "../components/search/SavedGeneSets";
import GenomeBrowser from "../components/visualizations/GenomeBrowser";
import ComparativeGenomics from "../components/search/ComparativeGenomics"; // Added new component import
import { PhenotypeSearchService } from "../components/search/PhenotypeSearchService";

export default function SearchPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchType, setSearchType] = useState("free");
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [showComparativeGenomics, setShowComparativeGenomics] = useState(false); // New state variable
  const [userInputGenes, setUserInputGenes] = useState([]);
  const [geneSetComparison, setGeneSetComparison] = useState(null);
  const [showSavedSets, setShowSavedSets] = useState(false);
  const [user, setUser] = useState(null); // New state variable for user data

  React.useEffect(() => {
    loadUser(); // Load user on component mount
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('query');
    if (queryParam) {
      setSearchQuery(queryParam);
      handleSearch(queryParam, false);
    }
  }, []);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (err) {
      console.log("Not logged in or user fetch failed:", err);
    }
  };

  const handleSearch = async (query, isPremium = false) => {
    if (!query.trim()) {
      setError("Please enter a phenotype to search for");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSearchQuery(query);
    setSearchType(isPremium ? "premium" : "free");
    setSelectedGenes([]); // Clear selection on new search
    setShowComparison(false);
    setShowComparativeGenomics(false); // Clear comparative genomics on new search
    setGeneSetComparison(null); // Clear gene set comparison on new phenotype search

    try {
      const results = await PhenotypeSearchService.searchGenes(query, isPremium);
      setSearchResults(results);

      // If user has input genes, compare them
      if (userInputGenes.length > 0) {
        const comparison = await PhenotypeSearchService.compareGeneSets(
          userInputGenes,
          results.candidateGenes.map(g => g.symbol),
          query,
          isPremium
        );
        setGeneSetComparison(comparison);
      }

      try {
        await base44.entities.SearchHistory.create({
          phenotype_query: query,
          hpo_term: results.hpoTerms?.[0] || null,
          candidate_genes: results.candidateGenes.map(g => g.symbol),
          search_type: isPremium ? "premium" : "free",
          results_count: results.candidateGenes.length
        });
      } catch (historyError) {
        console.log("Could not save search history:", historyError);
      }

    } catch (err) {
      setError(err.message || "Search failed. Please try again.");
      console.error("Search error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGeneInput = (genes) => {
    setUserInputGenes(genes);
    setGeneSetComparison(null);

    // If there are existing search results, trigger comparison
    if (searchResults && genes.length > 0) {
      handleCompareWithPhenotype(genes);
    }
  };

  const handleCompareWithPhenotype = async (genes) => {
    if (!searchResults) return; // Only compare if there are phenotype search results

    setIsLoading(true);
    setError(null);
    try {
      const comparison = await PhenotypeSearchService.compareGeneSets(
        genes,
        searchResults.candidateGenes.map(g => g.symbol),
        searchQuery,
        searchResults.isPremium
      );
      setGeneSetComparison(comparison);
    } catch (err) {
      setError(err.message || "Failed to compare gene sets");
      console.error("Gene set comparison error:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveGeneSet = async (name, description, tags) => {
    try {
      const genesToSave = userInputGenes.length > 0
        ? userInputGenes
        : selectedGenes.map(g => g.symbol);

      if (genesToSave.length === 0) {
        setError("No genes to save. Either input genes or select from results.");
        return;
      }

      await base44.entities.GeneSet.create({
        name,
        description,
        genes: genesToSave,
        phenotype_context: searchQuery || null,
        tags: tags || []
      });

      setError(null);
      alert("Gene set saved successfully!");
    } catch (err) {
      setError(err.message || "Failed to save gene set");
      console.error("Save gene set error:", err);
    }
  };

  const handleLoadGeneSet = (geneSet) => {
    setUserInputGenes(geneSet.genes);
    setShowSavedSets(false);

    if (searchResults) {
      handleCompareWithPhenotype(geneSet.genes);
    }
  };

  const handleGeneSelect = (gene) => {
    setSelectedGenes(prev => {
      const isSelected = prev.some(g => g.symbol === gene.symbol);
      if (isSelected) {
        return prev.filter(g => g.symbol !== gene.symbol);
      } else {
        return [...prev, gene];
      }
    });
  };

  const handleCompareGenes = () => {
    setShowComparison(true);
  };

  const handleCloseComparison = () => {
    setShowComparison(false);
  };

  const handleClearSelection = () => {
    setSelectedGenes([]);
    setShowComparison(false);
    setShowComparativeGenomics(false); // Also clear comparative genomics when selection is cleared
  };

  const handleCompareGenomics = () => {
    setShowComparativeGenomics(true);
  };

  const handleCloseComparativeGenomics = () => {
    setShowComparativeGenomics(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-6 sm:mb-8">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
              <DnaIcon className="w-6 h-6 sm:w-8 sm:h-8 text-white" />
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-slate-900 mb-4">
            Phenotype → Gene Discovery
          </h1>
          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto px-4">
            Search phenotypes or input genes of interest for comprehensive analysis
          </p>
          
          {/* Visualization Hub Link */}
          {selectedGenes.length > 0 && (
            <div className="mt-4">
              <Link to={createPageUrl("VisualizationHub")}>
                <Button variant="outline" className="gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Open in Visualization Hub
                </Button>
              </Link>
            </div>
          )}
        </div>

        {!showComparison && !showSavedSets && !showComparativeGenomics && (
          <>
            <div className="grid lg:grid-cols-2 gap-6 mb-6">
              {/* Phenotype Search */}
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <Search className="w-5 h-5" />
                    Search by Phenotype
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <SearchForm
                    onSearch={handleSearch}
                    isLoading={isLoading}
                    initialQuery={searchQuery}
                  />
                </CardContent>
              </Card>

              {/* Gene Input */}
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                      <DnaIcon className="w-5 h-5" />
                      Input Genes of Interest
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSavedSets(true)}
                      className="gap-2 min-h-[40px] touch-manipulation"
                    >
                      <Library className="w-4 h-4" />
                      <span className="hidden sm:inline">Saved Sets</span>
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <GeneInputForm
                    onGenesSubmit={handleGeneInput}
                    isLoading={isLoading}
                    initialGenes={userInputGenes}
                  />
                </CardContent>
              </Card>
            </div>

            {error && (
              <Alert variant="destructive" className="mb-6 sm:mb-8">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {isLoading && <LoadingSpinner query={searchQuery || "your genes"} />}

            {/* Gene Set Comparison Results */}
            {geneSetComparison && !isLoading && (
              <GeneSetComparison
                comparison={geneSetComparison}
                onSaveGeneSet={handleSaveGeneSet}
              />
            )}

            {/* Standard Search Results */}
            {searchResults && !isLoading && !geneSetComparison && (
              <>
                <GeneResults
                  results={searchResults}
                  selectedGenes={selectedGenes}
                  onGeneSelect={handleGeneSelect}
                />
                
                {selectedGenes.length > 0 && (
                  <div className="mt-6">
                    <GenomeBrowser 
                      genes={selectedGenes}
                      onGeneClick={(gene) => {
                        const element = document.getElementById(`gene-${gene.symbol}`);
                        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {!searchResults && !isLoading && !geneSetComparison && (
              <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
                <CardContent className="text-center py-8 sm:py-12">
                  <DnaIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-slate-400" />
                  <h3 className="text-lg sm:text-xl font-semibold text-slate-700 mb-2">
                    Start Your Discovery
                  </h3>
                  <p className="text-slate-500">
                    Search by phenotype or input genes to begin analysis
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        {showComparison && (
          <GeneComparison
            genes={selectedGenes}
            onClose={handleCloseComparison}
            isPremium={searchResults?.isPremium}
          />
        )}

        {showComparativeGenomics && ( // New conditional rendering for ComparativeGenomics
          <ComparativeGenomics
            genes={selectedGenes}
            onClose={handleCloseComparativeGenomics}
            userEducationLevel={user?.education_level}
          />
        )}

        {showSavedSets && (
          <SavedGeneSets
            onLoad={handleLoadGeneSet}
            onClose={() => setShowSavedSets(false)}
          />
        )}

        {/* Floating Compare Button - Enhanced with Comparative Genomics */}
        {selectedGenes.length > 0 && !showComparison && !showSavedSets && !showComparativeGenomics && ( // Updated condition
          <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 left-4 sm:left-auto z-50">
            <div className="bg-white rounded-2xl shadow-2xl border-2 border-blue-200 p-3 sm:p-4 max-w-sm mx-auto sm:mx-0">
              <div className="flex flex-col gap-3">
                <div className="text-sm">
                  <p className="font-semibold text-slate-900 truncate">
                    {selectedGenes.length} gene{selectedGenes.length !== 1 ? 's' : ''} selected
                  </p>
                  <p className="text-xs text-slate-500 truncate">
                    {selectedGenes.map(g => g.symbol).join(', ')}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleClearSelection}
                      className="flex-1 min-h-[44px] touch-manipulation"
                    >
                      Clear
                    </Button>
                    <Button
                      onClick={handleCompareGenes}
                      disabled={selectedGenes.length < 2}
                      className="flex-1 bg-blue-600 hover:bg-blue-700 min-h-[44px] touch-manipulation"
                    >
                      <GitCompare className="w-4 h-4 mr-2" />
                      Compare
                    </Button>
                  </div>
                  <Button // New button for Comparative Genomics
                    onClick={handleCompareGenomics}
                    disabled={selectedGenes.length < 2}
                    className="w-full bg-purple-600 hover:bg-purple-700 min-h-[44px] touch-manipulation"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    Comparative Genomics
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}