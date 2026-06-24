/**
 * Normalize a raw search-history record from the API into the shape the
 * History page renders.
 *
 * The backend (`GET /entities/search-history`) returns records shaped
 * `{ id, query, queryType, results, createdAt }`, where `results` is a free-form
 * JSON blob holding the discovered-gene details. Older/legacy rows (and the
 * pre-migration Base44 export) used snake_case top-level fields instead. This
 * helper reads the current contract first and falls back to the legacy names,
 * so both render correctly and nothing shows up blank.
 *
 * @param {object} s raw record
 * @returns {{id, query, queryType, createdAt, hpoTerm, candidateGenes, count}}
 */
export function normalizeSearchHistoryEntry(s) {
  const record = s || {};
  const results = record.results || {};
  const candidateGenes = results.candidateGenes ?? record.candidate_genes ?? [];
  return {
    id: record.id,
    query: record.query ?? record.phenotype_query ?? '(unknown search)',
    queryType: record.queryType ?? record.search_type ?? 'free',
    createdAt: record.createdAt ?? record.created_date ?? null,
    hpoTerm: results.hpoTerm ?? record.hpo_term ?? null,
    candidateGenes,
    count: results.count ?? record.results_count ?? candidateGenes.length ?? 0,
  };
}
