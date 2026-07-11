import {
  lookupVariant,
  lookupGene,
  searchClinVar,
  getClinVarVariant,
} from './genomicDatabases.js';
import { ValidationError } from '../utils/errors.js';

const DEFAULT_MAX_VARIANTS = 1000;
const HARD_MAX_VARIANTS = 5000;
const MAX_INFO_LENGTH = 8000;
const MAX_TEXT_BYTES = 1_000_000;

function parseInfo(infoText) {
  if (!infoText || infoText === '.') return {};
  if (infoText.length > MAX_INFO_LENGTH) {
    throw new ValidationError(`VCF INFO field exceeds ${MAX_INFO_LENGTH} characters`);
  }

  return Object.fromEntries(
    infoText.split(';')
      .filter(Boolean)
      .map((entry) => {
        const [key, ...rest] = entry.split('=');
        return [key, rest.length > 0 ? rest.join('=') : true];
      })
  );
}

function parseSample(formatText, sampleText) {
  if (!formatText || !sampleText) return null;
  const keys = formatText.split(':');
  const values = sampleText.split(':');
  return Object.fromEntries(keys.map((key, index) => [key, values[index] ?? null]));
}

function normalizeChromosome(chromosome) {
  const value = String(chromosome || '').trim();
  if (!value) return value;
  return value.toLowerCase().startsWith('chr') ? value : `chr${value}`;
}

function inferVariantType(ref, alt) {
  if (ref.length === 1 && alt.length === 1) return 'SNV';
  if (ref.length === alt.length) return 'MNV';
  if (ref.length < alt.length) return 'Insertion';
  if (ref.length > alt.length) return 'Deletion';
  return 'Complex';
}

function inferZygosity(sample) {
  const genotype = sample?.GT;
  if (!genotype || genotype === '.') return null;
  const alleles = genotype.split(/[/|]/).filter((allele) => allele !== '.');
  if (alleles.length === 0) return null;
  const unique = new Set(alleles);
  if (unique.size === 1 && unique.has('0')) return 'homozygous_reference';
  if (unique.size === 1) return 'homozygous_alternate';
  if (alleles.includes('0')) return 'heterozygous';
  return 'compound_alternate';
}

function extractGene(info) {
  for (const key of ['GENE', 'Gene', 'SYMBOL', 'HGNC']) {
    if (typeof info[key] === 'string' && info[key].trim()) return info[key].split(',')[0].trim();
  }

  if (typeof info.ANN === 'string') {
    const firstAnnotation = info.ANN.split(',')[0]?.split('|') || [];
    if (firstAnnotation[3]) return firstAnnotation[3].trim();
  }

  if (typeof info.CSQ === 'string') {
    const firstConsequence = info.CSQ.split(',')[0]?.split('|') || [];
    if (firstConsequence[3]) return firstConsequence[3].trim();
  }

  return null;
}

function stableVariantKey({ chromosome, position, referenceAllele, alternateAllele }) {
  return `${chromosome}:${position}:${referenceAllele}>${alternateAllele}`;
}

export function parseVcfText(text, { maxVariants = DEFAULT_MAX_VARIANTS } = {}) {
  if (typeof text !== 'string' || !text.trim()) {
    throw new ValidationError('VCF text is required');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_TEXT_BYTES) {
    throw new ValidationError(`VCF text must be ${MAX_TEXT_BYTES} bytes or smaller`);
  }

  const limit = Math.min(Math.max(Number(maxVariants) || DEFAULT_MAX_VARIANTS, 1), HARD_MAX_VARIANTS);
  const lines = text.split(/\r?\n/);
  const headerLine = lines.find((line) => line.startsWith('#CHROM'));
  if (!headerLine) {
    throw new ValidationError('VCF header line (#CHROM) is required');
  }

  const headerColumns = headerLine.replace(/^#/, '').split('\t');
  const sampleNames = headerColumns.slice(9);
  const variants = [];
  let totalVariants = 0;
  const variantTypes = {};

  for (const line of lines) {
    if (!line || line.startsWith('#')) continue;
    const columns = line.split('\t');
    if (columns.length < 8) continue;

    totalVariants++;
    if (variants.length >= limit) continue;

    const [chrom, pos, id, ref, altText, qual, filter, infoText, formatText, ...sampleColumns] = columns;
    const position = Number(pos);
    if (!chrom || !Number.isInteger(position) || position <= 0 || !ref || !altText) continue;

    const info = parseInfo(infoText);
    const samples = sampleNames.map((name, index) => ({
      name,
      fields: parseSample(formatText, sampleColumns[index]),
    }));
    const primarySample = samples.find((sample) => sample.fields?.GT) || samples[0] || null;
    const gene = extractGene(info);

    for (const alternateAllele of altText.split(',').filter(Boolean)) {
      if (variants.length >= limit) break;
      const chromosome = normalizeChromosome(chrom);
      const variantType = inferVariantType(ref, alternateAllele);
      variantTypes[variantType] = (variantTypes[variantType] || 0) + 1;

      const variant = {
        chromosome,
        position,
        id: id && id !== '.' ? id : null,
        rsid: id?.startsWith('rs') ? id : null,
        referenceAllele: ref,
        alternateAllele,
        ref,
        alt: alternateAllele,
        quality: qual === '.' ? null : Number(qual),
        filter,
        info,
        gene,
        variantType,
        variant_type: variantType,
        genotype: primarySample?.fields?.GT || null,
        zygosity: inferZygosity(primarySample?.fields),
        samples,
      };
      variant.stableVariantKey = stableVariantKey(variant);
      variant.hgvs = `${chromosome}:g.${position}${ref}>${alternateAllele}`;
      variants.push(variant);
    }
  }

  return {
    variants,
    summary: {
      totalVariants,
      total_variants: totalVariants,
      parsedVariants: variants.length,
      parsed_variants: variants.length,
      variantTypes,
      variant_types: variantTypes,
      truncated: variants.length < totalVariants,
    },
  };
}

function source(name, url, extra = {}) {
  return {
    name,
    url,
    retrievedAt: new Date().toISOString(),
    ...extra,
  };
}

function sourceResult(name, url, data) {
  return {
    status: data ? 'found' : 'not_found',
    source: source(name, url),
    data: data || null,
  };
}

async function enrichOneVariant(variant) {
  const rsid = variant.rsid || (typeof variant.id === 'string' && variant.id.startsWith('rs') ? variant.id : null);
  const gene = variant.gene || null;
  const clinVarQuery = rsid || variant.stableVariantKey ||
    `${variant.chromosome}:${variant.position} ${variant.ref || variant.referenceAllele}>${variant.alt || variant.alternateAllele}`;

  const [variantData, geneData, clinVarSearch] = await Promise.all([
    rsid ? lookupVariant(rsid) : Promise.resolve(null),
    gene ? lookupGene(gene) : Promise.resolve(null),
    clinVarQuery ? searchClinVar(clinVarQuery) : Promise.resolve(null),
  ]);

  const clinVarIds = clinVarSearch?.esearchresult?.idlist || [];
  const clinVarDetails = clinVarIds.length > 0 ? await getClinVarVariant(clinVarIds[0]) : null;

  return {
    originalVariant: variant,
    original_variant: variant,
    annotations: {
      myVariant: sourceResult(
        'MyVariant.info',
        rsid ? `https://myvariant.info/v1/variant/${encodeURIComponent(rsid)}` : 'https://myvariant.info/',
        variantData
      ),
      ensemblGene: sourceResult(
        'Ensembl REST',
        gene ? `https://rest.ensembl.org/lookup/symbol/homo_sapiens/${encodeURIComponent(gene)}` : 'https://rest.ensembl.org/',
        geneData
      ),
      clinVar: {
        status: clinVarDetails ? 'found' : 'not_found',
        source: source(
          'ClinVar E-utilities',
          `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=clinvar&term=${encodeURIComponent(clinVarQuery || '')}`,
          { reviewStatus: clinVarDetails?.result?.[clinVarIds[0]]?.review_status || null }
        ),
        search: clinVarSearch || null,
        data: clinVarDetails,
      },
    },
    evidenceSummary: clinVarDetails
      ? 'ClinVar source data returned for this query. Interpret only according to the cited source review status.'
      : 'No ClinVar source data found for this query.',
    clinicalConfirmationRequired: true,
    questionsForClinician: [
      'Does this variant match the same genome assembly and transcript used by the source annotation?',
      'Is confirmatory testing from a certified clinical lab appropriate for this context?',
    ],
  };
}

/**
 * Map `items` through async `worker` with at most `concurrency` in flight at
 * once, preserving input order in the result. Cohort annotation fans out over
 * many distinct variants, each of which makes several external-database calls;
 * an unbounded Promise.all would burst past NCBI/Ensembl politeness limits and
 * trigger 429s. A fixed worker pool keeps us under those limits while still
 * overlapping I/O. `concurrency <= 0` falls back to unbounded (single-file path).
 */
async function mapWithConcurrency(items, concurrency, worker) {
  if (!concurrency || concurrency <= 0) {
    return Promise.all(items.map(worker));
  }
  const results = new Array(items.length);
  let cursor = 0;
  async function runner() {
    for (;;) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }
  const pool = Array.from({ length: Math.min(concurrency, items.length) }, runner);
  await Promise.all(pool);
  return results;
}

/**
 * Enrich VCF variants with source-grounded public-database annotations.
 *
 * Deduplicates by stable variant key BEFORE hitting the network so a variant
 * shared across many cohort samples is looked up once and fanned back out to
 * every occurrence. `hardMax` bounds the network fan-out (the single-file route
 * keeps the historical 50 cap; the cohort route raises it) and `concurrency`
 * bounds simultaneous external calls (0 = unbounded, used for tiny batches).
 */
export async function enrichVcfVariants(
  variants,
  { maxVariants = 50, hardMax = 50, concurrency = 0 } = {}
) {
  if (!Array.isArray(variants)) {
    throw new ValidationError('variants must be an array');
  }

  const limit = Math.min(Math.max(Number(maxVariants) || 0, 0), hardMax);
  const limited = variants.slice(0, limit);

  // Collapse duplicate variants (same coordinates across samples) to a single
  // network lookup, then re-expand so each caller variant gets its annotation.
  const keyFor = (v) => v.stableVariantKey ||
    `${v.chromosome}:${v.position}:${v.ref || v.referenceAllele}>${v.alt || v.alternateAllele}`;
  const uniqueByKey = new Map();
  for (const variant of limited) {
    const key = keyFor(variant);
    if (!uniqueByKey.has(key)) uniqueByKey.set(key, variant);
  }

  const uniqueVariants = [...uniqueByKey.values()];
  const enrichedUnique = await mapWithConcurrency(uniqueVariants, concurrency, enrichOneVariant);
  const enrichedByKey = new Map(uniqueVariants.map((v, i) => [keyFor(v), enrichedUnique[i]]));

  return limited.map((variant) => {
    const enriched = enrichedByKey.get(keyFor(variant));
    // Re-anchor to the caller's own variant object so per-sample metadata
    // (e.g. cohort prevalence) rides along even when the lookup was shared.
    return { ...enriched, originalVariant: variant, original_variant: variant };
  });
}

export const VCF_LIMITS = {
  DEFAULT_MAX_VARIANTS,
  HARD_MAX_VARIANTS,
  MAX_INFO_LENGTH,
  MAX_TEXT_BYTES,
  // Cohort annotation: one request annotates the deduplicated union of distinct
  // variants across the cohort. Higher network cap than the single-file route,
  // with bounded concurrency to respect public-database rate limits.
  COHORT_MAX_VARIANTS: 150,
  COHORT_CONCURRENCY: 3,
};
