import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, Crown, Sparkles, HelpCircle, Stethoscope } from "lucide-react";
import AutocompleteSearch from "./AutocompleteSearch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function SearchForm({ onSearch, isLoading, initialQuery = "" }) {
  const [query, setQuery] = useState(initialQuery);
  const [searchMode, setSearchMode] = useState("free_text");
  const [user, setUser] = useState(null);
  
  React.useEffect(() => {
    setQuery(initialQuery);
    loadUser();
  }, [initialQuery]);

  const loadUser = async () => {
    try {
      const currentUser = await base44.auth.me();
      setUser(currentUser);
    } catch (err) {
      console.log("Not logged in");
    }
  };
  
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
      onSearch(query.trim(), isPremium);
    }
  };

  // Admin backdoor check
  const isAdmin = user?.email === "buckeye7066@gmail.com";

  return (
    <form onSubmit={(e) => handleSubmit(e, false)} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="phenotype-query" className="text-base font-medium">
          Search Query
        </Label>
        <div className="flex flex-col sm:flex-row gap-2">
          <AutocompleteSearch
            value={query}
            onChange={setQuery}
            onSelect={(suggestion) => {
              if (suggestion.type === "disease") {
                setSearchMode("disease");
              } else if (suggestion.type === "phenotype") {
                setSearchMode("free_text");
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
              <SelectItem value="free_text">Free Text</SelectItem>
              <SelectItem value="disease">Disease Name</SelectItem>
              <SelectItem value="hpo_term">HPO Term</SelectItem>
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
                setQuery(example);
                setSearchMode("disease");
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
                onClick={() => setQuery(example)}
                disabled={isLoading}
                className="text-xs hover:bg-slate-50 touch-manipulation min-h-[36px]"
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-4">
        <Button
          type="submit"
          disabled={!query.trim() || isLoading}
          className="bg-blue-600 hover:bg-blue-700 w-full min-h-[48px] touch-manipulation"
        >
          <Search className="w-4 h-4 mr-2" />
          {isLoading ? "Searching..." : searchMode === "disease" ? "Find Disease Genes" : "Search (Free)"}
        </Button>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                disabled={!query.trim() || isLoading}
                onClick={(e) => handleSubmit(e, true)}
                className="border-amber-200 hover:bg-amber-50 text-amber-700 w-full min-h-[48px] touch-manipulation"
              >
                <Crown className="w-4 h-4 mr-2" />
                Premium Search
                {isAdmin && <Badge className="ml-2 bg-amber-600 text-white text-xs">Admin</Badge>}
                {!isAdmin && <HelpCircle className="w-3 h-3 ml-1" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p className="max-w-xs">
                {isAdmin ? "You have admin access to all premium features" :
                 "Get additional data: population prevalence, gene history, mutations, and treatment information"}
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-start gap-2">
          <Sparkles className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <h4 className="font-medium text-blue-900">Robert-Powered Insights</h4>
            <p className="text-sm text-blue-700">
              Search by disease name (e.g., "Rheumatoid Arthritis", "Trisomy 21") to discover all associated genes with personalized explanations
            </p>
          </div>
        </div>
      </div>
    </form>
  );
}