import React, { useState, useRef, lazy, Suspense } from "react";
import { apiClient } from "@genemap/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../lib/AuthContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { log } from "../components/shared/logger";
import { SAVE_SUCCESS_DELAY_MS } from "../components/shared/constants";
import { getErrorMessage } from "../components/shared/errorUtils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import DnaIcon from "../components/icons/DnaIcon";
import { Search, AlertCircle, GitCompare, BookmarkPlus, Library, Brain } from "lucide-react";

import SearchForm from "../components/search/SearchForm";
import GeneResults from "../components/search/GeneResults";
import AiThinkingIndicator from "@/components/AiThinkingIndicator";
const GeneComparison = lazy(() => import("../components/search/GeneComparison"));
const GeneInputForm = lazy(() => import("../components/search/GeneInputForm"));
const GeneSetComparison = lazy(() => import("../components/search/GeneSetComparison"));
const SavedGeneSets = lazy(() => import("../components/search/SavedGeneSets"));
import { PhenotypeSearchService } from "../components/search/PhenotypeSearchService";
import {
  resolvePublicationSearchReference,
  resolvePublicationUrlReference,
} from "../lib/publicationConceptCatalog";

export default function SearchPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnriching, setIsEnriching] = useState(false);
  const [error, setError] = useState(null);
  // Monotonic token so an older, slower search can never overwrite the results
  // of a newer one (the user clicked a second example before the first
  // finished). Only the latest search applies state.
  const searchTokenRef = useRef(0);
  const [searchType, setSearchType] = useState("free");
  const [selectedGenes, setSelectedGenes] = useState([]);
  const [showComparison, setShowComparison] = useState(false);
  const [userInputGenes, setUserInputGenes] = useState([]);
  const [geneSetComparison, setGeneSetComparison] = useState(null);
  const [showSavedSets, setShowSavedSets] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const queryParam = urlParams.get('query');
    if (queryParam) {
      setSearchQuery(queryParam);
      const resolved = resolvePublicationUrlReference(queryParam);
      // Arbitrary URL text may prefill the guided form, but it cannot silently
      // invoke generation. Dynamic labels must be selected through the
      // deterministic resolver; exact HPO/MONDO ids are revalidated server-side.
      if (resolved) {
        handleSearch(queryParam, false, resolved.searchMode, resolved.reference);
      }
    }
  }, []);

  const handleSearch = async (
    query,
    isPremium = false,
    searchMode = 'free_text',
    selectedReference = null,
  ) => {
    if (!query.trim()) {
      setError("Please enter a phenotype to search for");
      return;
    }

    const token = ++searchTokenRef.current;
    const isCurrent = () => token === searchTokenRef.current;

    setIsLoading(true);
    setIsEnriching(false);
    setError(null);
    setSearchResults(null);
    setSearchQuery(query);
    setSearchType(isPremium ? "premium" : "free");
    setSelectedGenes([]); // Clear selection on new search
    setShowComparison(false);
    setGeneSetComparison(null); // Clear gene set comparison on new phenotype search

    try {
      // Normalize every invocation again at the page boundary. A prior
      // autocomplete identifier is never retained when the user types, pastes,
      // switches mode, clicks an example, or follows a different URL.
      const publicationReference = resolvePublicationSearchReference(
        query,
        searchMode,
        selectedReference,
      );
      // FAST: render candidate genes (with authoritative coordinates) as soon as
      // they're found, then drop the blocking spinner. The slow per-gene LLM
      // enrichment happens after this, in the background.
      const base = await PhenotypeSearchService.findCandidates(
        query,
        isPremium,
        searchMode,
        publicationReference,
      );
      if (!isCurrent()) return;
      setSearchResults(base);
      setIsLoading(false);
      setIsEnriching(true);

      // BACKGROUND: fill in summaries, phenotypes, takeaways. Failure here keeps
      // the candidates on screen (enrichCandidates returns them unchanged).
      const enriched = await PhenotypeSearchService.enrichCandidates(base);
      if (!isCurrent()) return;
      setSearchResults(enriched);
      setIsEnriching(false);

      if (userInputGenes.length > 0) {
        const comparison = await PhenotypeSearchService.compareGeneSets(
          userInputGenes,
          enriched.candidateGenes.map(g => g.symbol),
          query,
          isPremium
        );
        if (!isCurrent()) return;
        setGeneSetComparison(comparison);
      }

      try {
        // Backend (POST /entities/search-history) expects { query, queryType,
        // results }. The extra display fields (HPO term, candidate genes, count)
        // have no dedicated columns, so they live in the free-form `results` JSON.
        await apiClient.saveSearchHistory({
          query,
          queryType: isPremium ? "premium" : "free",
          results: {
            hpoTerm: enriched.hpoTerms?.[0] || null,
            candidateGenes: enriched.candidateGenes.map(g => g.symbol),
            count: enriched.candidateGenes.length,
            publicationReference,
          },
        });
      } catch (historyError) {
        log.debug("Could not save search history:", historyError);
      }

    } catch (err) {
      if (isCurrent()) {
        setError(getErrorMessage(err) || "Search failed. Please try again.");
        log.error("Search error:", err);
      }
    } finally {
      if (isCurrent()) {
        setIsLoading(false);
        setIsEnriching(false);
      }
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
      setError(getErrorMessage(err) || "Failed to compare gene sets");
      log.error("Gene set comparison error:", err);
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

      // Gene sets use the dedicated research-project contract:
      // { name, description, genes, metadata }.
      await apiClient.saveGeneSet({
        name,
        description,
        genes: genesToSave,
        metadata: {
          phenotypeContext: searchQuery || null,
          tags: tags || [],
        },
      });

      // Invalidate and refetch gene sets cache with user context
      await queryClient.invalidateQueries({ queryKey: ['geneSets', user?.email] });
      
      setError(null);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), SAVE_SUCCESS_DELAY_MS);
    } catch (err) {
      setError(getErrorMessage(err) || "Failed to save gene set");
      log.error("Save gene set error:", err);
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
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-4 sm:p-6 overflow-x-hidden">
      <div className="max-w-7xl mx-auto min-w-0">
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
            Generate exploratory candidate-gene leads and verify them in primary sources
          </p>
        </div>

        {!showComparison && !showSavedSets && (
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

            {isLoading && (
              <AiThinkingIndicator
                label={`Finding genes for "${searchQuery || 'your query'}"…`}
                hint="Identifying candidate genes and verifying their coordinates. Results appear in ~15 seconds, then details fill in."
              />
            )}

            {/* Results are on screen; details are still streaming in. */}
            {isEnriching && !isLoading && (
              <Alert className="mb-4 bg-blue-50 border-blue-200">
                <Brain className="h-4 w-4 text-blue-600 animate-pulse" />
                <AlertDescription className="text-blue-900">
                  Genes found — adding exploratory summaries and candidate phenotype terms…
                </AlertDescription>
              </Alert>
            )}

            {/* Gene Set Comparison Results */}
            {geneSetComparison && !isLoading && (
              <GeneSetComparison
                comparison={geneSetComparison}
                onSaveGeneSet={handleSaveGeneSet}
              />
            )}

            {/* Standard Search Results — isolated in its own ErrorBoundary so a
                render error in one gene card surfaces a visible, retryable
                message in the results area instead of silently blanking the
                panel (the reported "search completes but nothing appears"). */}
            {searchResults && !isLoading && !geneSetComparison && (
              <ErrorBoundary name="Search results">
                <GeneResults
                  results={searchResults}
                  selectedGenes={selectedGenes}
                  onGeneSelect={handleGeneSelect}
                />

              </ErrorBoundary>
            )}

            {!searchResults && !isLoading && !geneSetComparison && (
              <Card className="border-2 border-dashed border-slate-200 bg-slate-50/50">
                <CardContent className="py-8 sm:py-12">
                  <div className="text-center">
                    <DnaIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4 text-slate-400" />
                    <h3 className="text-lg sm:text-xl font-semibold text-slate-700 mb-2">
                      Start Your Discovery
                    </h3>
                    <p className="text-slate-500 mb-1">
                      Type a trait or symptom above (a &ldquo;phenotype&rdquo;), or enter a gene
                      name. Not sure where to begin? Try one of these:
                    </p>
                  </div>

                  {/* Example searches — one click runs a real search. */}
                  <div className="flex flex-wrap justify-center gap-2 mt-4 max-w-2xl mx-auto">
                    {[
                      "short stature",
                      "hearing loss",
                      "cystic fibrosis",
                      "intellectual disability",
                      "BRCA1",
                      "rheumatoid arthritis",
                    ].map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => { setSearchQuery(example); handleSearch(example, false); }}
                        className="px-3 py-1.5 rounded-full text-sm bg-white border border-slate-200 text-slate-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
                      >
                        {example}
                      </button>
                    ))}
                  </div>

                  {/* Plain-English glossary so beginners aren't blocked by jargon. */}
                  <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-2 mt-8 max-w-2xl mx-auto text-sm">
                    <div className="flex gap-2">
                      <dt className="font-semibold text-slate-700 shrink-0">Phenotype</dt>
                      <dd className="text-slate-500">an observable trait or symptom</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-slate-700 shrink-0">Gene set</dt>
                      <dd className="text-slate-500">a saved list of genes</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-slate-700 shrink-0">VCF</dt>
                      <dd className="text-slate-500">a genetic variant file</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="font-semibold text-slate-700 shrink-0">HPO</dt>
                      <dd className="text-slate-500">Human Phenotype Ontology term</dd>
                    </div>
                  </dl>

                  <p className="text-xs text-center text-slate-400 mt-8 max-w-xl mx-auto">
                    Educational and research support only. Results are not medical advice or a
                    diagnosis &mdash; consult a qualified clinician or genetic counselor for
                    interpretation of any health concern.
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

        {showSavedSets && (
          <SavedGeneSets
            onLoad={handleLoadGeneSet}
            onClose={() => setShowSavedSets(false)}
          />
        )}

        {/* Floating gene comparison button */}
        {selectedGenes.length > 0 && !showComparison && !showSavedSets && (
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
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
