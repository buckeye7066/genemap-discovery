export const PUBLICATION_CONCEPT_CATALOG_VERSION = 1;
export const PUBLICATION_CONCEPT_SOURCE = 'genemap_curated';

export const CURATED_PUBLICATION_CONCEPTS = Object.freeze([
  { conceptId: 'disease:rheumatoid-arthritis', canonicalLabel: 'Rheumatoid Arthritis', conceptKind: 'disease' },
  { conceptId: 'disease:trisomy-21', canonicalLabel: 'Trisomy 21', conceptKind: 'disease' },
  { conceptId: 'disease:cystic-fibrosis', canonicalLabel: 'Cystic Fibrosis', conceptKind: 'disease' },
  { conceptId: 'disease:type-2-diabetes', canonicalLabel: 'Type 2 Diabetes', conceptKind: 'disease' },
  { conceptId: 'disease:alzheimers-disease', canonicalLabel: "Alzheimer's Disease", conceptKind: 'disease' },
  { conceptId: 'disease:breast-cancer', canonicalLabel: 'Breast Cancer', conceptKind: 'disease' },
  { conceptId: 'phenotype:polydactyly', canonicalLabel: 'polydactyly', conceptKind: 'phenotype' },
  { conceptId: 'phenotype:intellectual-disability', canonicalLabel: 'intellectual disability', conceptKind: 'phenotype' },
  { conceptId: 'phenotype:short-stature', canonicalLabel: 'short stature', conceptKind: 'phenotype' },
  { conceptId: 'phenotype:seizures', canonicalLabel: 'seizures', conceptKind: 'phenotype' },
  { conceptId: 'phenotype:early-onset-symptoms', canonicalLabel: 'early-onset symptoms', conceptKind: 'phenotype' },
]);

function toReference(concept) {
  return concept ? {
    kind: 'curated_concept',
    conceptId: concept.conceptId,
    canonicalLabel: concept.canonicalLabel,
    conceptKind: concept.conceptKind,
    source: PUBLICATION_CONCEPT_SOURCE,
    version: PUBLICATION_CONCEPT_CATALOG_VERSION,
  } : null;
}

export function publicationConceptById(conceptId) {
  return toReference(CURATED_PUBLICATION_CONCEPTS.find((item) => item.conceptId === conceptId));
}

export function publicationConceptByLabel(label, expectedKind) {
  const normalized = String(label || '').trim().toLowerCase();
  return toReference(CURATED_PUBLICATION_CONCEPTS.find((item) => (
    item.canonicalLabel.toLowerCase() === normalized
    && (!expectedKind || item.conceptKind === expectedKind)
  )));
}

export function publicationHpoReference(value) {
  const identifier = String(value || '').trim().toUpperCase();
  return /^HP:\d{7}$/.test(identifier) ? { kind: 'hpo', identifier } : null;
}

export function publicationMondoReference(value) {
  const identifier = String(value || '').trim().toUpperCase();
  return /^MONDO:\d{7}$/.test(identifier) ? { kind: 'mondo', identifier } : null;
}

export function resolvePublicationSearchReference(value, searchMode = 'free_text', selectedReference = null) {
  if (selectedReference?.kind === 'hpo') return publicationHpoReference(selectedReference.identifier);
  if (selectedReference?.kind === 'mondo') return publicationMondoReference(selectedReference.identifier);
  if (selectedReference?.kind === 'curated_concept') {
    return publicationConceptById(selectedReference.conceptId);
  }
  if (searchMode === 'hpo_term' || /^HP:/i.test(String(value || '').trim())) {
    return publicationHpoReference(value);
  }
  if (/^MONDO:/i.test(String(value || '').trim())) return publicationMondoReference(value);
  return publicationConceptByLabel(value, searchMode === 'disease' ? 'disease' : 'phenotype');
}

/**
 * A URL query may prefill the search box, but it may auto-run only when it is
 * already an immutable reviewed concept or an exact ontology identifier. The
 * HPO/MONDO identifier is still revalidated by the API before any model call.
 */
export function resolvePublicationUrlReference(value) {
  const hpo = publicationHpoReference(value);
  if (hpo) return { reference: hpo, searchMode: 'hpo_term' };
  const mondo = publicationMondoReference(value);
  if (mondo) return { reference: mondo, searchMode: 'disease' };
  const curated = publicationConceptByLabel(value);
  if (!curated) return null;
  return {
    reference: curated,
    searchMode: curated.conceptKind === 'disease' ? 'disease' : 'free_text',
  };
}
