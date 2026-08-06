import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Search, Sparkles, Stethoscope } from "lucide-react";
import AutocompleteSearch from "./AutocompleteSearch";
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
  
  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);
  
  const exampleQueries = {
    phenotypes: [
      "polydactyly",
      "intellectual disability",
      "short stature",
      "seizures"
    ],
    diseases: [
      "Rheumatoid Arthritis",
      "Trisomy 21",
      "Cystic Fibrosis",
      "Type 2 Diabetes",
      "Alzheimer's Disease",
      "Breast Cancer"
    ],
    hpo: [
      "HP:0001166",
      "HP:0001250",
      "HP:0004322"
    ]
  };

  const handleSubmit = (e, isPremium = false) => {
    e.preventDefault();
    if (query.trim()) {
      onSearch(query.trim(), isPremium, searchMode);
    }
  };

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="phenotype-query" className="text-base font-medium">
          Reviewed research concept or exact HPO identifier
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <AutocompleteSearch
            value={query}
            onChange={setQuery}
            inputId="phenotype-query"
            searchMode={searchMode}
            onSelect={(suggestion) => {
              if (suggestion.type === "disease") {
                setSearchMode("disease");
              } else if (suggestion.type === "phenotype") {
                setSearchMode("free_text");
              } else if (suggestion.type === "hpo") {
                setSearchMode("hpo_term");
              }
              // Picking a suggestion should run the search, not just refill the box.
              if (suggestion.text?.trim()) {
                onSearch(
                  suggestion.text.trim(),
                  false,
                  suggestion.type === 'disease' ? 'disease' : suggestion.type === 'hpo' ? 'hpo_term' : 'free_text',
                  suggestion.publicationReference || null,
                );
              }
            }}
            placeholder="e.g., Rheumatoid Arthritis, polydactyly, HP:0001166"
            disabled={isLoading}
          />
          <Select value={searchMode} onValueChange={setSearchMode}>
            <SelectTrigger className="w-full sm:w-40 min-h-[48px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="free_text">Reviewed Phenotype</SelectItem>
              <SelectItem value="disease">Reviewed Disease</SelectItem>
              <SelectItem value="hpo_term">Exact HPO ID</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Disease Examples */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Stethoscope className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-medium text-slate-700">Disease Examples:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.diseases.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                // Search the clicked example directly. Passing `example`
                // explicitly avoids relying on the async `query` state (which
                // the autocomplete's suggestion fetch could overwrite — the bug
                // where clicking "Cystic Fibrosis" ended up searching a
                // suggested term like "Bronchiectasis").
                setQuery(example);
                setSearchMode("disease");
                onSearch(example, false, 'disease');
              }}
              disabled={isLoading}
              className="text-xs hover:bg-emerald-50 border-emerald-200 touch-manipulation min-h-[36px]"
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      {/* Phenotype Examples */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-blue-600" />
          <span className="text-sm font-medium text-slate-700">Phenotype Examples:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {exampleQueries.phenotypes.map((example) => (
            <Button
              key={example}
              variant="outline"
              size="sm"
              type="button"
              onClick={() => {
                setQuery(example);
                setSearchMode("free_text");
                onSearch(example, false, 'free_text');
              }}
              disabled={isLoading}
              className="text-xs hover:bg-blue-50 touch-manipulation min-h-[36px]"
            >
              {example}
            </Button>
          ))}
        </div>
      </div>

      {/* HPO Examples */}
      {searchMode === "hpo_term" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-700">HPO Term Examples:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.hpo.map((example) => (
              <Button
                key={example}
                variant="outline"
                size="sm"
                type="button"
                onClick={() => {
                  setQuery(example);
                  onSearch(example, false, 'hpo_term');
                }}
                disabled={isLoading}
                className="text-xs hover:bg-slate-50 touch-manipulation min-h-[36px]"
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div>
        <Button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-700 w-full min-h-[48px] touch-manipulation"
        >
          <Search className="w-4 h-4 mr-2" />
          {isLoading ? "Searching..." : searchMode === "disease" ? "Generate Candidate Genes" : "Search (Free)"}
        </Button>
      </div>

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
