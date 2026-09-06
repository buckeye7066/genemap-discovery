import React, { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search } from "lucide-react";
import { apiClient } from "@genemap/shared";
import { SAFE_SUGGESTIONS, lookupPublicationConceptSuggestions } from "@/lib/publicationConceptSearch";

export default function AutocompleteSearch({
  value,
  onChange,
  onSelect,
  searchMode = 'free_text',
  inputId,
  placeholder = "Search for diseases or phenotypes...",
  disabled = false,
  suppressSuggestions = false,
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [lookupMessage, setLookupMessage] = useState('');
  const wrapperRef = useRef(null);
  const inputRef = useRef(null);
  const selectedValueRef = useRef(null);
  const requestRef = useRef(0);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
        requestRef.current += 1;
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const request = ++requestRef.current;
    setHighlightedIndex(-1);
    setSuggestions([]);
    setShowSuggestions(false);
    setLookupMessage('');
    const filterSuggestions = async () => {
      if (disabled || suppressSuggestions) return;
      if (selectedValueRef.current === value) {
        selectedValueRef.current = null;
        return;
      }
      if (selectedValueRef.current) selectedValueRef.current = null;
      if (!value || value.trim().length < 2) return;
      const result = await lookupPublicationConceptSuggestions(
        value,
        searchMode,
        (text, kind) => apiClient.searchPublicationConcepts(text, kind),
        SAFE_SUGGESTIONS,
      );
      if (cancelled) return;
      if (request !== requestRef.current) return;
      setSuggestions(result.suggestions);
      setShowSuggestions(result.suggestions.length > 0);
      setLookupMessage(result.message || (result.suggestions.length ? ''
        : 'No concepts found. Try a synonym or an exact HPO or MONDO identifier.'));
    };
    const timeoutId = setTimeout(() => { void filterSuggestions(); }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [disabled, suppressSuggestions, searchMode, value]);

  const handleSelectSuggestion = (suggestion) => {
    if (disabled || suppressSuggestions) return;
    requestRef.current += 1;
    selectedValueRef.current = suggestion.text;
    setSuggestions([]);
    setShowSuggestions(false);
    setLookupMessage('');
    setHighlightedIndex(-1);
    onChange(suggestion.text);
    // The structured suggestion.publicationReference is retained by SearchForm.
    onSelect?.(suggestion);
    inputRef.current?.blur();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      requestRef.current += 1;
      setShowSuggestions(false);
      setHighlightedIndex(-1);
      return;
    }
    if (!showSuggestions || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlightedIndex((previous) => Math.min(previous + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex((previous) => Math.max(previous - 1, -1));
    } else if (event.key === 'Enter' && highlightedIndex >= 0 && highlightedIndex < suggestions.length) {
      event.preventDefault();
      handleSelectSuggestion(suggestions[highlightedIndex]);
    }
  };

  const getTypeColor = (type) => type === 'disease' ? 'bg-emerald-100 text-emerald-700'
    : type === 'phenotype' ? 'bg-purple-100 text-purple-700' : 'bg-slate-100 text-slate-700';
  const getTypeIcon = (type) => type === 'disease' ? '🩺' : type === 'phenotype' ? '🔬' : '📋';

  return (
    <div ref={wrapperRef} className="relative w-full">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-slate-400" />
        <Input id={inputId} ref={inputRef} value={value}
          onChange={(event) => onChange(event.target.value)} onKeyDown={handleKeyDown}
          onFocus={() => !disabled && !suppressSuggestions && suggestions.length > 0 && setShowSuggestions(true)}
          placeholder={placeholder} disabled={disabled}
          className="pl-10 pr-10 text-lg py-3 min-h-[48px]" />
      </div>
      {lookupMessage && !suppressSuggestions && !disabled && (
        <p className="mt-2 text-xs text-slate-600" role="status">{lookupMessage}</p>
      )}
      {showSuggestions && suggestions.length > 0 && !disabled && !suppressSuggestions && (
        <div className="absolute z-50 w-full mt-2 bg-white rounded-lg shadow-xl border-2 border-blue-200 max-h-96 overflow-y-auto">
          {suggestions.map((suggestion, index) => (
            <button key={`${suggestion.publicationReference.kind}:${suggestion.publicationReference.identifier || suggestion.publicationReference.conceptId}`}
              type="button" onClick={() => handleSelectSuggestion(suggestion)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full text-left px-4 py-3 border-b border-slate-100 last:border-b-0 hover:bg-blue-50 transition-colors ${highlightedIndex === index ? 'bg-blue-50' : ''}`}>
              <div className="flex items-start gap-3">
                <span className="text-2xl mt-0.5">{getTypeIcon(suggestion.type)}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-slate-900 truncate">{suggestion.text}</span>
                    <Badge className={`text-xs ${getTypeColor(suggestion.type)}`}>{suggestion.type}</Badge>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-2">{suggestion.description}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
