import React, { useRef, useState } from "react";
import { apiClient } from "@genemap/shared";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Sparkles, Stethoscope } from "lucide-react";
import AutocompleteSearch from "./AutocompleteSearch";
import { resolveConceptSubmission, suggestionSearchMode } from "@/lib/publicationConceptSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SearchForm({ onSearch, isLoading, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState("free_text");
  const [selected, setSelected] = useState(null);
  const [resolution, setResolution] = useState(null);
  const [isResolving, setIsResolving] = useState(false);
  const requestRef = useRef(0);
  const busy = isLoading || isResolving;

  React.useEffect(() => {
    requestRef.current += 1;
    setQuery(initialQuery);
    setSelected((previous) => previous?.text === initialQuery ? previous : null);
    setResolution(null);
    setIsResolving(false);
  }, [initialQuery]);
  React.useEffect(() => () => { requestRef.current += 1; }, []);

  const resetLookup = () => {
    requestRef.current += 1;
    setSelected(null);
    setResolution(null);
    setIsResolving(false);
  };
  const changeQuery = (value) => {
    resetLookup();
    setQuery(value);
  };
  const changeMode = (value) => {
    resetLookup();
    setSearchMode(value);
  };

  const exampleQueries = {
    phenotypes: ["polydactyly", "intellectual disability", "short stature", "seizures"],
    diseases: ["Rheumatoid Arthritis", "Trisomy 21", "Cystic Fibrosis", "Type 2 Diabetes", "Alzheimer's Disease", "Breast Cancer"],
    hpo: ["HP:0001166", "HP:0001250", "HP:0004322"],
  };

  const chooseSuggestion = (suggestion) => {
    if (busy || !suggestion.text?.trim()) return;
    resetLookup();
    const text = suggestion.text.trim();
    const reference = suggestion.publicationReference || null;
    const mode = suggestionSearchMode(suggestion);
    setQuery(text);
    setSearchMode(mode);
    // Keep the identifier for a second Search click; discard it on any edit.
    setSelected({ text, reference });
    onSearch(text, false, mode, reference);
  };

  const runExample = (example, mode) => {
    if (busy) return;
    resetLookup();
    setQuery(example);
    setSearchMode(mode);
    onSearch(example, false, mode);
  };

  const handleSubmit = async (event, isPremium = false) => {
    event.preventDefault();
    if (!query.trim() || busy) return;
    const request = ++requestRef.current;
    setIsResolving(true);
    setResolution(null);
    try {
      const result = await resolveConceptSubmission(
        query,
        searchMode,
        selected?.text === query.trim() ? selected.reference : null,
        (text, kind) => apiClient.searchPublicationConcepts(text, kind),
      );
      if (request !== requestRef.current) return;
      setIsResolving(false);
      if (result.status !== 'resolved') {
        setResolution(result);
        return;
      }
      setQuery(result.query);
      setSelected({ text: result.query, reference: result.reference });
      // Free text has now become a reviewed reference. Raw labels never reach
      // the generation gate, and history retains the exact selected identity.
      await onSearch(result.query, isPremium, searchMode, result.reference);
    } catch {
      if (request === requestRef.current) {
        setResolution({ message: 'Search could not start. Your text has been kept. Please retry.', suggestions: [] });
      }
    } finally {
      if (request === requestRef.current) setIsResolving(false);
    }
  };

  return (
    <form onSubmit={(event) => { void handleSubmit(event, false); }} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="phenotype-query" className="text-base font-medium">
          Reviewed research concept — type a disease, phenotype, or exact identifier
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <AutocompleteSearch
            value={query}
            onChange={changeQuery}
            inputId="phenotype-query"
            searchMode={searchMode}
            onSelect={chooseSuggestion}
            placeholder="e.g., polychondritis, polydactyly, HP:0001166"
            disabled={isLoading}
            suppressSuggestions={isResolving || Boolean(resolution)}
          />
          <Select value={searchMode} onValueChange={changeMode} disabled={isLoading}>
            <SelectTrigger className="w-full sm:w-48 min-h-[48px]" aria-label="Concept search mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_text">Disease or phenotype</SelectItem>
              <SelectItem value="disease">Disease only</SelectItem>
              <SelectItem value="hpo_term">HPO / phenotype</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <p className="text-sm text-slate-600">
          Type a name and press Search. Exact matches can continue automatically; other matches are shown for you to choose. Only the resolved identifier is sent for AI research.
        </p>
        {resolution && (
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3" role="status" aria-live="polite">
            <p className="text-sm text-slate-700">{resolution.message}</p>
            {resolution.suggestions?.length > 0 && (
              <div className="mt-2 flex flex-col gap-2">
                {resolution.suggestions.map((suggestion) => (
                  <Button
                    key={`${suggestion.publicationReference.kind}:${suggestion.publicationReference.identifier || suggestion.publicationReference.conceptId}`}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    className="h-auto justify-start whitespace-normal text-left"
                    onClick={() => chooseSuggestion(suggestion)}
                  >
                    {suggestion.text} — {suggestion.description}
                  </Button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-slate-700">Disease Examples:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.diseases.map((example) => (
            <Button key={example} variant="outline" size="sm" type="button"
              onClick={() => runExample(example, 'disease')} disabled={busy}
              className="text-xs hover:bg-emerald-50 border-emerald-200 touch-manipulation min-h-[36px]">
              {example}
            </Button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-slate-700">Phenotype Examples:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.phenotypes.map((example) => (
            <Button key={example} variant="outline" size="sm" type="button"
              onClick={() => runExample(example, 'free_text')} disabled={busy}
              className="text-xs hover:bg-blue-50 touch-manipulation min-h-[36px]">
              {example}
            </Button>
          ))}
        </div>
      </div>

      {searchMode === "hpo_term" && (
        <div className="space-y-3">
          <span className="text-sm font-medium text-slate-700">HPO Term Examples:</span>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.hpo.map((example) => (
              <Button key={example} variant="outline" size="sm" type="button"
                onClick={() => runExample(example, 'hpo_term')} disabled={busy}
                className="text-xs hover:bg-slate-50 touch-manipulation min-h-[36px]">
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}

      <Button type="submit" disabled={!query.trim() || busy}
        className="bg-blue-600 hover:bg-blue-700 w-full min-h-[48px] touch-manipulation">
        <Search className="w-4 h-4 mr-2" />
        {isResolving ? "Looking up concepts..." : isLoading ? "Searching..." : searchMode === "disease" ? "Generate Candidate Genes" : "Search (Free)"}
      </Button>

      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-start gap-2">
          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">AI-Generated Research Leads</h4>
            <p className="text-sm text-blue-700">
              Search by disease or phenotype to generate candidate genes for follow-up. Rankings and explanations are AI-generated, are not exhaustive, and are not clinical evidence.
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}
