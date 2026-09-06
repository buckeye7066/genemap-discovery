import {
  CURATED_PUBLICATION_CONCEPTS,
  publicationConceptById,
  publicationConceptByLabel,
  publicationHpoReference,
  publicationMondoReference,
  resolvePublicationSearchReference,
} from './publicationConceptCatalog.js';

// Labels are for display/lookup only. Generation still receives a catalog
// reference or an identifier that the server independently revalidates.
export const SAFE_SUGGESTIONS = Object.freeze([
  ...CURATED_PUBLICATION_CONCEPTS.map((concept) => ({
    text: concept.canonicalLabel,
    type: concept.conceptKind,
    description: 'Reviewed GeneMap publication concept',
    publicationReference: publicationConceptById(concept.conceptId),
  })),
  ...['HP:0001166', 'HP:0001250', 'HP:0004322'].map((identifier) => ({
    text: identifier,
    type: 'hpo',
    description: 'Exact HPO identifier example',
    publicationReference: publicationHpoReference(identifier),
  })),
]);

export const CONCEPT_LOOKUP_UNAVAILABLE = 'Concept lookup is temporarily unavailable. Your text has been kept. Please retry, choose a listed concept, or enter an exact HPO or MONDO identifier.';

export function conceptSearchKinds(mode) {
  if (mode === 'disease') return ['disease'];
  if (mode === 'hpo_term' || mode === 'phenotype') return ['phenotype'];
  // The default free-text box must find diseases as well as phenotypes.
  return ['phenotype', 'disease'];
}

export function suggestionSearchMode(suggestion) {
  return suggestion.type === 'disease' ? 'disease'
    : suggestion.type === 'hpo' ? 'hpo_term' : 'free_text';
}

function validQuery(value) {
  return typeof value === 'string' && value.trim().length >= 2
    && value.trim().length <= 80 && !/[\r\n]/u.test(value);
}

function remoteSuggestion(item, mode) {
  if (!item || typeof item.canonicalLabel !== 'string'
    || !item.canonicalLabel.trim() || item.canonicalLabel.length > 256) return null;
  const reference = item.kind === 'hpo' ? publicationHpoReference(item.identifier)
    : item.kind === 'mondo' ? publicationMondoReference(item.identifier) : null;
  if (!reference) return null;
  return {
    text: item.canonicalLabel.trim(),
    type: item.kind === 'mondo' ? 'disease' : mode === 'hpo_term' ? 'hpo' : 'phenotype',
    description: `${reference.identifier} · ${item.source || 'Ontology lookup'} API ${item.apiVersion || 'unspecified'}`,
    publicationReference: reference,
  };
}

/** Bounded, non-generative lookup shared by typeahead and explicit submission. */
export async function lookupPublicationConceptSuggestions(value, mode, lookup, local = SAFE_SUGGESTIONS) {
  if (!validQuery(value)) return { suggestions: [], unavailable: false };
  const query = value.trim();
  const kinds = conceptSearchKinds(mode);
  const normalized = query.toLowerCase();
  const localMatches = local.filter((suggestion) => (
    (suggestion.type === 'hpo' ? kinds.includes('phenotype') : kinds.includes(suggestion.type))
    && suggestion.text.toLowerCase().includes(normalized)
  ));
  const responses = await Promise.allSettled(kinds.map((kind) => (
    Promise.resolve().then(() => lookup(query, kind))
  )));
  let unavailable = false;
  let accessMessage = '';
  const remoteMatches = [];
  for (const response of responses) {
    if (response.status === 'rejected') {
      unavailable = true;
      if (response.reason?.status === 401) accessMessage = 'Please sign in again to look up research concepts.';
      if (response.reason?.status === 403 && !accessMessage) accessMessage = 'Concept lookup is not available for your current account access.';
      continue;
    }
    if (!Array.isArray(response.value?.suggestions)) {
      unavailable = true;
      continue;
    }
    for (const item of response.value.suggestions.slice(0, 10)) {
      const suggestion = remoteSuggestion(item, mode);
      if (suggestion) remoteMatches.push(suggestion);
    }
  }
  const seen = new Set();
  const suggestions = [...localMatches, ...remoteMatches].filter((suggestion) => {
    const ref = suggestion.publicationReference;
    const key = `${ref.kind}:${ref.identifier || ref.conceptId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 20);
  return { suggestions, unavailable, message: accessMessage || (unavailable ? CONCEPT_LOOKUP_UNAVAILABLE : '') };
}

/** Resolve explicit user submission, never URL/history prefill or raw model input. */
export async function resolveConceptSubmission(value, mode, selectedReference, lookup) {
  const query = typeof value === 'string' ? value.trim() : '';
  const reference = resolvePublicationSearchReference(query, mode, selectedReference)
    || (mode === 'free_text' ? publicationConceptByLabel(query) : null);
  if (reference) return { status: 'resolved', query, reference, suggestions: [] };
  if (!validQuery(value)) return {
    status: 'invalid', suggestions: [],
    message: 'Enter a disease or phenotype name of 2–80 characters, or an exact HPO or MONDO identifier. Do not paste a medical record.',
  };
  if (/^(?:HP|MONDO):/iu.test(query)) return {
    status: 'invalid', suggestions: [],
    message: 'Use an exact identifier such as HP:0001250 or MONDO:0009061.',
  };
  const result = await lookupPublicationConceptSuggestions(query, mode, lookup);
  const exact = result.suggestions.filter((item) => item.text.toLowerCase() === query.toLowerCase());
  // A fuzzy hit is a choice, not permission to silently change the question.
  // Partial outages cannot establish uniqueness across both ontologies.
  if (exact.length === 1 && !result.unavailable) return {
    status: 'resolved', query: exact[0].text,
    reference: exact[0].publicationReference, suggestions: [],
  };
  return {
    ...result,
    status: result.suggestions.length ? 'choose' : result.unavailable ? 'unavailable' : 'no_matches',
    message: result.message || (result.suggestions.length
      ? 'Choose the disease or phenotype you intended. No AI search has run yet.'
      : 'No matching concept was found. Check the spelling, try a synonym, or enter an exact HPO or MONDO identifier.'),
  };
}
