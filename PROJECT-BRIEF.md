# GeneMap Discovery — Project Brief

## Overview

GeneMap Discovery is a genomics research platform that enables scientists, clinicians, and bioinformaticians to explore genetic variants, map genes to phenotypes, and perform sequence-level discovery within a web-based application. The platform integrates curated public genomic databases (ClinVar, gnomAD, OMIM, Ensembl, HPO, MONDO) with AI-assisted interpretation, educational content, and a GSEA (Gene Set Enrichment Analysis) workflow.

---

## Genomics Methodology

### Gene Mapping

Gene mapping associates genetic variants or symbols with known biological functions, disease phenotypes, and population-level allele frequencies.

- **Symbol resolution**: HGNC gene symbols are normalized and validated against Ensembl REST and NCBI Gene databases.
- **Variant lookup**: SNVs, MNVs, insertions, and deletions are resolved to ClinVar accessions and gnomAD population records using chromosome-position-allele keys.
- **Phenotype enrichment**: HPO (Human Phenotype Ontology) and MONDO disease identifiers are validated and used to map genes to human diseases via association evidence contracts.
- **Publication concepts**: Gene–disease and gene–phenotype associations are surfaced through a curated publication-concept layer that enforces scientific-honesty guard rails on every AI-assisted interpretation path.

### Sequence Analysis

- VCF files (Variant Call Format, spec ≥ v4.1) are parsed server-side.
- Each variant row is normalized: chromosome names are canonicalized (prefixed `chr`), multi-allelic sites are split into individual allele rows, and HGVS nomenclature is derived for each allele.
- Reference builds GRCh37/hg19 and GRCh38/hg38 are supported; build is inferred from variant coordinates or explicit `referenceBuild` input.
- Annotation fields (`INFO` column keys: `GENE`, `SYMBOL`, `HGNC`, `CSQ` consequence blocks) are extracted and merged with database-retrieved annotations.
- Zygosity is inferred from the `GT` FORMAT field: homozygous reference, homozygous alternate, heterozygous, or compound alternate.

### Genetic Variant Discovery

- Variants are classified by type: SNV (single-nucleotide variant), MNV (multi-nucleotide variant), Insertion, Deletion, or Complex.
- ClinVar clinical significance, review status, and associated conditions are retrieved per variant.
- gnomAD allele frequency and population stratification are attached where available.
- A genomic-guard layer enforces that retrieved data is attributed to its source version (ClinVar release, gnomAD version, Ensembl API version) so results are reproducible across queries.

### Gene Set Enrichment Analysis (GSEA)

- Users may submit a ranked or unranked gene list.
- The platform maps each symbol to Entrez IDs and retrieves pathway associations (KEGG, Reactome, GO Biological Process terms).
- Enrichment is scored by over-representation relative to a configurable background gene universe.
- Results are annotated with adjusted p-values and displayed as ranked pathway tables.

---

## Input Data Formats

| Format | Description | Size Limits |
|--------|-------------|-------------|
| VCF (v4.1+) | Standard variant call format; tab-delimited with `##` meta-lines and `#CHROM` column header | 15 MB default (`VCF_MAX_TEXT_BYTES`); up to 5,000 variants per parse; cohort enrichment up to 250 variants |
| Gene symbol list | Newline- or comma-separated HGNC symbols | Up to 50 symbols per enrichment request |
| HPO identifiers | `HP:XXXXXXX` formatted terms | Up to 100 per enrichment request |
| MONDO identifiers | `MONDO:XXXXXXX` formatted terms | Validated via regex before dispatch |
| Free-text phenotype | Natural-language phenotype descriptions | Up to 256 characters per term |

---

## Output and Visualization

### Variant Explorer

- Paginated variant table with columns: chromosome, position, rsID, ref/alt alleles, variant type, zygosity, gene symbol, ClinVar significance, and gnomAD allele frequency.
- Each row expands to show full ClinVar conditions, review evidence, and population-level frequency breakdown.

### Gene Cards

- Per-gene panel showing: HGNC symbol, Ensembl gene ID, associated HPO phenotypes, linked MONDO diseases, and publication-concept associations with confidence scores.

### GSEA Results Panel

- Ranked pathway list with enrichment score, nominal p-value, FDR q-value, and leading-edge gene count.
- Interactive filtering by database source (KEGG / Reactome / GO).

### AI-Assisted Interpretation (Learn Genetics / Research Mode)

- Every AI response is prefixed with a scientific-honesty directive that requires the model to distinguish established findings from hypotheses and to cite its sources.
- Explanations, quizzes, and research summaries are generated via the `education.js` and `llm.js` proxy routes and are never presented as diagnostic conclusions.

### Data Visualization (DiscoveryStudio)

- Chromosome ideogram with variant density heat map.
- Gene–phenotype network graph rendered in the browser using the shared `gsea` component library.
- Export: TSV download for variant tables; JSON export for gene-set results.

---

## Architecture Summary

```
apps/web          React 18 + Vite + Tailwind — genomics UI, GSEA studio, variant explorer
services/api      Fastify 5 + Prisma 6 + PostgreSQL — variant lookup, VCF parse, gene enrichment
packages/shared   TypeScript — ApiClient, schemas, publication-status contracts
```

Key API surface:

| Route | Purpose |
|-------|---------|
| `POST /genomics/vcf/parse` | Parse raw VCF text; returns normalized variant array |
| `POST /genomics/vcf/enrich` | Annotate up to 50 variants with ClinVar + gnomAD data |
| `POST /genomics/vcf/cohort-enrich` | Cohort-scale enrichment (up to 250 variants) |
| `GET  /genomics/variant/:chrom/:pos/:ref/:alt` | Single-variant lookup |
| `GET  /genomics/gene/:symbol` | Gene metadata and associated phenotypes |
| `POST /genomics/enrich` | Gene-set enrichment (symbols + phenotypes) |
| `POST /genomics/hpo-terms/validate` | Validate HPO/MONDO term identifiers |

---

## Testing

- Unit tests cover: VCF parsing, chromosome normalization, HGVS derivation, variant-type inference, zygosity classification, enrichment logic, and all API route contracts.
- Integration tests run against a live PostgreSQL 18 instance (see `.github/workflows/ci.yml`).
- Scientific-honesty guard-rail tests verify that every AI path injects the required system directive.
- All 1 552 tests (1 446 API + 106 shared) pass on `main`.
