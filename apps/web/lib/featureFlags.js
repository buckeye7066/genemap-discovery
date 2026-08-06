/**
 * Hard publication boundary for the public education/research build.
 *
 * These flags are intentionally compile-time constants, not environment
 * variables. A missing or mistyped deployment variable must never turn
 * personalized clinical, medical-record, VCF, pharmacogenomic, dosing, or
 * diagnostic functionality back on.
 */
export const PUBLICATION_MODE = "education_research";
export const HIGH_RISK_CLINICAL_AI_ENABLED = false;
export const PERSONAL_GENOMICS_ENABLED = false;

