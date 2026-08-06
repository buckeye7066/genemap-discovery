import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Dna } from "lucide-react";
import { apiClient } from "@genemap/shared";
import {
  CURATED_PUBLICATION_CONCEPTS,
  publicationConceptById,
} from "@/lib/publicationConceptCatalog";

// Publication mode keeps autocomplete deterministic. These labels are UI
// examples, not model output and not claims that an external database was
// queried. Arbitrary prefixes never reach a generation provider.
const SAFE_SUGGESTIONS = Object.freeze([
  ...CURATED_PUBLICATION_CONCEPTS.map((concept) => ({
    text: concept.canonicalLabel,
    type: concept.conceptKind,
    description: 'Reviewed GeneMap publication concept',
    publicationReference: publicationConceptById(concept.conceptId),
  })),
  { text: 'HP:0001166', type: 'hpo', description: 'Exact HPO identifier example', publicationReference: { kind: 'hpo', identifier: 'HP:0001166' } },
  { text: 'HP:0001250', type: 'hpo', description: 'Exact HPO identifier example', publicationReference: { kind: 'hpo', identifier: 'HP:0001250' } },
  { text: 'HP:0004322', type: 'hpo', description: 'Exact HPO identifier example', publicationReference: { kind: 'hpo', identifier: 'HP:0004322' } },
]);

export default function AutocompleteSearch({ 
  value, 
  onChange, 
  onSelect, 
  searchMode = 'free_text',
  inputId,
  placeholder = "Search for genes, diseases, or phenotypes...",
  disabled = false 
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  // Set when the user picks a suggestion. The selection programmatically
  // updates `value`, which would otherwise re-trigger the fetch effect and
  // immediately re-open the dropdown ("won't dismiss / re-fills the box").
  const selectedValueRef = useRef(null);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Once a search is actually running (parent sets `disabled`), collapse the
  // dropdown so it can't overlap the results area or get mis-clicked.
  useEffect(() => {
    if (disabled) {
      setShowSuggestions(false);
      setHighlightedIndex(-1);
    }
  }, [disabled]);

  // Filter the bounded local catalog when the user types.
  useEffect(() => {
    let cancelled = false;
    setHighlightedIndex(-1);
    const filterSuggestions = async () => {
      // Don't fetch (or surface) suggestions while a search is in flight.
      if (disabled) {
        setShowSuggestions(false);
        return;
      }
      // A selection just set `value`; consume the flag and skip the refetch so
      // the dropdown stays dismissed instead of re-populating.
      if (selectedValueRef.current === value) {
        selectedValueRef.current = null;
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }
      // If the selected text was already identical to the input, React did not
      // emit a value-state change. Clear that old marker on the user's next edit
      // without swallowing the edit or suppressing its resolver lookup.
      if (selectedValueRef.current) selectedValueRef.current = null;
      if (!value || value.length < 2) {
        setSuggestions([]);
        return;
      }

      const wantedType = searchMode === 'disease'
        ? 'disease'
        : searchMode === 'hpo_term'
          ? 'hpo'
          : 'phenotype';
      const normalized = value.trim().toLowerCase();
      const localMatches = SAFE_SUGGESTIONS.filter((suggestion) => (
        suggestion.type === wantedType
        && suggestion.text.toLowerCase().includes(normalized)
      ));
      let remoteMatches = [];
      try {
        const kind = searchMode === 'disease' ? 'disease' : 'phenotype';
        const response = await apiClient.searchPublicationConcepts(value.trim(), kind);
        remoteMatches = (response?.suggestions || []).map((item) => ({
          text: item.canonicalLabel,
          type: item.kind === 'mondo' ? 'disease' : searchMode === 'hpo_term' ? 'hpo' : 'phenotype',
          description: `${item.identifier} · ${item.source} API ${item.apiVersion}`,
          publicationReference: { kind: item.kind, identifier: item.identifier },
        }));
      } catch {
        // Deterministic local examples remain available during resolver outage.
      }
      if (cancelled) return;
      const seen = new Set();
      const matches = [...localMatches, ...remoteMatches].filter((suggestion) => {
        const key = `${suggestion.publicationReference?.kind}:${suggestion.publicationReference?.identifier || suggestion.text.toLowerCase()}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }).slice(0, 8);
      setSuggestions(matches);
      setShowSuggestions(matches.length > 0);
    };

    const timeoutId = setTimeout(() => {
      void filterSuggestions();
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [disabled, searchMode, value]);

  const handleKeyDown = (e) => {
    if (!showSuggestions || suggestions.length === 0) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightedIndex((prev) =>
          prev < suggestions.length - 1 ? prev + 1 : prev
        );
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : -1));
        break;
      case "Enter":
        if (highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
          e.preventDefault();
          handleSelectSuggestion(suggestions[highlightedIndex]);
        }
        break;
      case "Escape":
        setShowSuggestions(false);
        setHighlightedIndex(-1);
        break;
    }
  };

  const handleSelectSuggestion = (suggestion) => {
    selectedValueRef.current = suggestion.text;
    setSuggestions([]);
    setShowSuggestions(false);
    setHighlightedIndex(-1);
    onChange(suggestion.text);
    onSelect?.(suggestion);
    inputRef.current?.blur();
  };

  const getTypeColor = (type) => {
    switch (type) {
      case "gene":
        return "bg-blue-100 text-blue-700";
      case "disease":
        return "bg-emerald-100 text-emerald-700";
      case "phenotype":
        return "bg-purple-100 text-purple-700";
      default:
        return "bg-slate-100 text-slate-700";
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "gene":
        return "🧬";
      case "disease":
        return "🩺";
      case "phenotype":
        return "🔬";
      default:
        return "📋";
    }
  };

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input
          id={inputId}
          ref={inputRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder}
          disabled={disabled}
          className="pl-10 pr-10 text-lg py-3 min-h-[48px]"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-xl border-2 border-blue-200 max-h-96 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button
              key={index}
              type="button"
              onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-blue-50 transition-colors ${
                highlightedIndex === index ? "bg-blue-50" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{getTypeIcon(suggestion.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900 truncate">
                      {suggestion.text}
                    </span>
                    <Badge className={`text-xs ${getTypeColor(suggestion.type)}`}>
                      {suggestion.type}
                    </Badge>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">
                    {suggestion.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
