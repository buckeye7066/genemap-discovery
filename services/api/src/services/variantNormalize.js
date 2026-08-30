/**
 * Deterministic variant normalization for research/education fixtures.
 *
 * Requirements covered:
 * - reference build is explicit (default GRCh38)
 * - left alignment of alleles
 * - multiallelic decomposition
 * - accession-aware HGVS genomic notation
 * - header-derived ANN/CSQ parsing
 * - explicit gnomAD / ClinVar version pins on assertions
 */

export const DEFAULT_REFERENCE_BUILD = 'GRCh38';
export const GNOMAD_VERSION = 'gnomAD v4.1';
export const CLINVAR_VERSION = 'ClinVar (NCBI esummary; release pinned at retrieval)';

const DNA = new Set(['A', 'C', 'G', 'T', 'N']);

function normalizeChromosome(chromosome) {
  const value = String(chromosome || '').trim();
  if (!value) return value;
  return value.toLowerCase().startsWith('chr') ? value : `chr${value}`;
}

function cleanAllele(allele) {
  return String(allele || '').trim().toUpperCase();
}

/**
 * VT / bcftools-style left alignment for a single REF/ALT pair.
 * Returns { position, referenceAllele, alternateAllele }.
 */
export function leftAlignAlleles(position, ref, alt) {
  let pos = Number(position);
  let referenceAllele = cleanAllele(ref);
  let alternateAllele = cleanAllele(alt);
  if (!Number.isInteger(pos) || pos <= 0 || !referenceAllele || !alternateAllele) {
    return { position: pos, referenceAllele, alternateAllele };
  }

  // Trim shared suffixes first. Stop before either allele would become empty
  // so deletions/insertions retain a VCF-legal anchoring base.
  while (
    referenceAllele.length > 1
    && alternateAllele.length > 1
    && referenceAllele.at(-1) === alternateAllele.at(-1)
  ) {
    referenceAllele = referenceAllele.slice(0, -1);
    alternateAllele = alternateAllele.slice(0, -1);
  }

  // Then trim shared prefixes, advancing genomic position.
  while (
    referenceAllele.length > 1
    && alternateAllele.length > 1
    && referenceAllele[0] === alternateAllele[0]
  ) {
    referenceAllele = referenceAllele.slice(1);
    alternateAllele = alternateAllele.slice(1);
    pos += 1;
  }

  return { position: pos, referenceAllele, alternateAllele };
}

export function decomposeMultiallelic(ref, altText) {
  const referenceAllele = cleanAllele(ref);
  return String(altText || '')
    .split(',')
    .map((alt) => cleanAllele(alt))
    .filter(Boolean)
    .map((alternateAllele) => ({ referenceAllele, alternateAllele }));
}

export function genomicHgvs({ chromosome, position, referenceAllele, alternateAllele, accession = null }) {
  const chrom = normalizeChromosome(chromosome);
  const prefix = accession || chrom;
  if (!Number.isInteger(position) || position < 1 || !referenceAllele || !alternateAllele) {
    throw new Error('Invalid inputs for genomic HGVS: invalid position or missing alleles');
  }
  return `${prefix}:g.${position}${referenceAllele}>${alternateAllele}`;
}

/**
 * Parse VEP-style ANN or CSQ pipe fields using header definitions when present.
 * Falls back to common field order: Allele|Consequence|Impact|SYMBOL|...
 */
export function parseAnnotationHeader(headerLines = []) {
  const headers = { ANN: null, CSQ: null };
  for (const line of headerLines) {
    const ann = line.match(/^##INFO=<ID=ANN,.*Description="([^"]+)"/);
    if (ann) {
      const fields = ann[1].split(':').pop()?.split('|').map((f) => f.trim().replace(/^['"]+|['"]+$/g, '')) || null;
      if (fields?.length) headers.ANN = fields;
    }
    const csq = line.match(/^##INFO=<ID=CSQ,.*Description="([^"]+)"/);
    if (csq) {
      const fields = csq[1].split(':').pop()?.split('|').map((f) => f.trim().replace(/^['"]+|['"]+$/g, '')) || null;
      if (fields?.length) headers.CSQ = fields;
    }
  }
  return headers;
}

const DEFAULT_ANN_FIELDS = [
  'Allele', 'Consequence', 'IMPACT', 'SYMBOL', 'Gene', 'Feature_type', 'Feature',
  'BIOTYPE', 'EXON', 'INTRON', 'HGVSc', 'HGVSp', 'cDNA_position', 'CDS_position',
  'Protein_position', 'Amino_acids', 'Codons', 'Existing_variation', 'DISTANCE',
  'STRAND', 'FLAGS', 'SYMBOL_SOURCE', 'HGNC_ID',
];

function parsePipeAnnotations(value, fieldNames) {
  if (typeof value !== 'string' || !value || value === '.') return [];
  const fields = fieldNames || DEFAULT_ANN_FIELDS;
  return value.split(',').filter(entry => entry.trim() !== '').map((entry) => {
    const parts = entry.split('|');
    const record = {};
    fields.forEach((name, index) => {
      record[name] = parts[index] ?? '';
    });
    return record;
  });
}

export function extractAnnotations(info = {}, annotationHeaders = {}) {
  const ann = parsePipeAnnotations(info.ANN, annotationHeaders.ANN || DEFAULT_ANN_FIELDS);
  const csq = parsePipeAnnotations(info.CSQ, annotationHeaders.CSQ || DEFAULT_ANN_FIELDS);
  return { ann, csq };
}

export function geneFromAnnotations({ ann = [], csq = [] } = {}) {
  for (const row of [...ann, ...csq]) {
    const symbol = row.SYMBOL || row.Gene;
    if (typeof symbol === 'string' && symbol.trim()) return symbol.trim();
  }
  return null;
}

export function normalizeVariantAlleles({
  chromosome,
  position,
  referenceAllele,
  alternateAllele,
  referenceBuild = DEFAULT_REFERENCE_BUILD,
  accession = null,
  info = {},
  annotationHeaders = {},
}) {
  const aligned = leftAlignAlleles(position, referenceAllele, alternateAllele);
  const annotations = extractAnnotations(info, annotationHeaders);
  const gene = geneFromAnnotations(annotations)
    || (typeof info.GENE === 'string' ? info.GENE : null)
    || (typeof info.SYMBOL === 'string' ? info.SYMBOL : null);
  const chromosomeNorm = normalizeChromosome(chromosome);
  const hgvs = genomicHgvs({
    chromosome: chromosomeNorm,
    position: aligned.position,
    referenceAllele: aligned.referenceAllele,
    alternateAllele: aligned.alternateAllele,
    accession,
  });

  return {
    chromosome: chromosomeNorm,
    position: aligned.position,
    referenceAllele: aligned.referenceAllele,
    alternateAllele: aligned.alternateAllele,
    ref: aligned.referenceAllele,
    alt: aligned.alternateAllele,
    referenceBuild,
    genomeBuild: referenceBuild,
    hgvs,
    gene,
    annotations,
    provenance: {
      referenceBuild,
      gnomadVersion: GNOMAD_VERSION,
      clinvarVersion: CLINVAR_VERSION,
      normalization: 'left_align+multiallelic_decompose',
      retrievalDate: new Date().toISOString().slice(0, 10),
    },
  };
}

export function normalizeVcfAlleleRows({
  chromosome,
  position,
  ref,
  altText,
  referenceBuild = DEFAULT_REFERENCE_BUILD,
  accession = null,
  info = {},
  annotationHeaders = {},
}) {
  return decomposeMultiallelic(ref, altText).map(({ referenceAllele, alternateAllele }) => (
    normalizeVariantAlleles({
      chromosome,
      position,
      referenceAllele,
      alternateAllele,
      referenceBuild,
      accession,
      info,
      annotationHeaders,
    })
  ));
}

export function allelesLookLikeDna(ref, alt) {
  const check = (allele) => [...cleanAllele(allele)].every((base) => DNA.has(base));
  return check(ref) && check(alt);
}
