// Centralised UI/runtime constants. Pulled out of individual page modules so
// timings/limits are easy to audit and adjust in one place.
export const VCF_BATCH_SIZE = 500;
export const SAVE_SUCCESS_DELAY_MS = 1500;
export const DASHBOARD_REFRESH_INTERVAL_MS = 30_000;
export const SEARCH_DEBOUNCE_MS = 250;
export const TOAST_DEFAULT_MS = 4_000;

// Cap concurrent fan-out to phenotype/gene enrichment endpoints so a single
// search cannot stampede the upstream APIs. The original codebase did not
// export this constant; restored here so the import in
// components/search/PhenotypeSearchService.jsx resolves.
export const GENE_ENRICHMENT_CONCURRENCY = 4;
