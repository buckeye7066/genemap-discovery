/**
 * Client-side VCF cohort parsing.
 *
 * The bulk cohort tool used to send only the *file names* to the LLM and ask it
 * for "expected" statistics — the uploaded genomic data was never read. This
 * module parses the real file contents in the browser and computes genuine
 * cohort-level statistics, so the analysis reflects the actual data.
 *
 * Parsing happens entirely client-side on purpose: real whole-genome VCFs are
 * hundreds of megabytes, and keeping the raw variants on the device (only
 * aggregate counts are ever sent to the server) avoids uploading potentially
 * sensitive genomic data. The per-variant classification mirrors the backend
 * VCF parser (services/api/src/services/vcf.js) so single-file and cohort views
 * agree on variant types.
 */

// Cap distinct variant keys retained per file for shared-variant detection.
// A key is ~20-40 bytes; 100k keys per file bounds memory while covering the
// exome/targeted-panel range fully and giving an honest (labeled) sample for
// larger whole-genome files.
export const MAX_KEYS_PER_FILE = 100_000;

/**
 * Classify a variant by its ref/alt alleles. Mirrors `inferVariantType` in
 * services/api/src/services/vcf.js.
 * @returns {'SNV'|'MNV'|'Insertion'|'Deletion'|'Unknown'}
 */
export function classifyVariant(ref, alt) {
  if (!ref || !alt) return 'Unknown';
  if (ref.length === 1 && alt.length === 1) return 'SNV';
  if (ref.length === alt.length) return 'MNV';
  if (ref.length < alt.length) return 'Insertion';
  return 'Deletion';
}

/**
 * Pull a gene symbol out of a VCF INFO field. Mirrors `extractGene` in
 * services/api/src/services/vcf.js (GENE/SYMBOL keys, then snpEff ANN / VEP CSQ
 * pipe-delimited annotations). Kept intentionally cheap: cohort files can be
 * hundreds of megabytes, so this only runs for the bounded set of variant keys
 * we actually retain for annotation, never for every parsed line.
 * @returns {string|null}
 */
export function extractGeneFromInfo(infoText) {
  if (!infoText || infoText === '.') return null;
  for (const key of ['GENE', 'Gene', 'SYMBOL', 'HGNC']) {
    const match = infoText.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
    if (match && match[1].trim()) return match[1].split(',')[0].trim();
  }
  for (const key of ['ANN', 'CSQ']) {
    const match = infoText.match(new RegExp(`(?:^|;)${key}=([^;]+)`));
    if (match) {
      const gene = match[1].split(',')[0]?.split('|')[3];
      if (gene && gene.trim()) return gene.trim();
    }
  }
  return null;
}

/**
 * Accumulate statistics from an array of VCF text lines for a single sample.
 * Pure and incremental so it can be fed streamed chunks and unit-tested without
 * a File object.
 *
 * @param {string[]} lines raw lines (data or header; headers are skipped)
 * @param {{maxKeys?: number, state?: object}} [opts]
 * @returns updated accumulator state
 */
export function accumulateVcfLines(lines, { maxKeys = MAX_KEYS_PER_FILE, state } = {}) {
  const acc = state || {
    variantCount: 0,
    variantTypes: {},
    keys: new Set(),
    // Per-retained-key annotation hints (rsid from the ID column, gene from
    // INFO). Only populated for keys we keep, so it never outgrows `keys`.
    keyMeta: new Map(),
    keysTruncated: false,
  };
  if (!acc.keyMeta) acc.keyMeta = new Map(); // tolerate pre-existing state objects

  for (const line of lines) {
    if (!line || line[0] === '#') continue;
    const cols = line.split('\t');
    if (cols.length < 5) continue;

    const chrom = cols[0];
    const pos = cols[1];
    const id = cols[2];
    const ref = cols[3];
    const altText = cols[4];
    const infoText = cols[7];
    if (!chrom || !pos || !ref || !altText || altText === '.') continue;

    for (const alt of altText.split(',')) {
      if (!alt || alt === '.') continue;
      acc.variantCount += 1;
      const type = classifyVariant(ref, alt);
      acc.variantTypes[type] = (acc.variantTypes[type] || 0) + 1;
      if (acc.keys.size < maxKeys) {
        const key = `${chrom}:${pos}:${ref}>${alt}`;
        acc.keys.add(key);
        if (!acc.keyMeta.has(key)) {
          acc.keyMeta.set(key, {
            rsid: typeof id === 'string' && id.startsWith('rs') ? id : null,
            gene: extractGeneFromInfo(infoText),
          });
        }
      } else {
        acc.keysTruncated = true;
      }
    }
  }

  return acc;
}

/**
 * Stream and parse a single VCF (or gzipped VCF) File entirely in the browser.
 * @param {File} file
 * @param {{onProgress?: (fraction:number)=>void, maxKeys?: number}} [opts]
 * @returns {Promise<{name, variantCount, variantTypes, keys:Set<string>, keyMeta:Map<string,{rsid:string|null,gene:string|null}>, keysTruncated, bytes}>}
 */
export async function parseVcfFile(file, { onProgress, maxKeys = MAX_KEYS_PER_FILE } = {}) {
  const isGzip = /\.gz$/i.test(file.name);
  if (isGzip && typeof DecompressionStream === 'undefined') {
    throw new Error(`${file.name}: gzip is not supported in this browser — decompress the file first`);
  }
  if (typeof file.stream !== 'function') {
    throw new Error(`${file.name}: streaming file reads are not supported in this browser`);
  }

  let stream = file.stream();
  if (isGzip) stream = stream.pipeThrough(new DecompressionStream('gzip'));
  const reader = stream.pipeThrough(new TextDecoderStream()).getReader();

  const state = { variantCount: 0, variantTypes: {}, keys: new Set(), keyMeta: new Map(), keysTruncated: false };
  let buffer = '';
  let bytesRead = 0;

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytesRead += value.length;
      buffer += value;
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      accumulateVcfLines(lines, { maxKeys, state });
      if (onProgress && file.size) {
        // For gzip, bytesRead is decompressed length; clamp to <=1 so the bar
        // never exceeds 100% when compressed content expands.
        onProgress(Math.min(1, bytesRead / file.size));
      }
    }
    if (buffer) accumulateVcfLines([buffer], { maxKeys, state });
  } finally {
    reader.releaseLock?.();
  }

  return {
    name: file.name,
    variantCount: state.variantCount,
    variantTypes: state.variantTypes,
    keys: state.keys,
    keyMeta: state.keyMeta,
    keysTruncated: state.keysTruncated,
    bytes: file.size ?? bytesRead,
  };
}

/**
 * Parse a `chr:pos:ref>alt` variant key back into its components. Chromosome
 * and alleles never contain ':' or '>' in a well-formed VCF, so positional
 * slicing is unambiguous and cheaper than a regex over thousands of keys.
 * @returns {{chromosome:string, position:number, ref:string, alt:string}|null}
 */
export function parseVariantKey(key) {
  const firstColon = key.indexOf(':');
  const secondColon = key.indexOf(':', firstColon + 1);
  if (firstColon < 0 || secondColon < 0) return null;
  const alleles = key.slice(secondColon + 1);
  const gt = alleles.indexOf('>');
  if (gt < 0) return null;
  const position = Number(key.slice(firstColon + 1, secondColon));
  if (!Number.isInteger(position)) return null;
  return {
    chromosome: key.slice(0, firstColon),
    position,
    ref: alleles.slice(0, gt),
    alt: alleles.slice(gt + 1),
  };
}

/**
 * Build the deduplicated union of distinct variants across the cohort, ranked
 * by prevalence (how many samples carry each one). This is the input to cohort
 * annotation: rather than annotating every sample's variants (240× redundant
 * work against rate-limited public databases), we annotate each DISTINCT
 * variant once and carry its cohort prevalence alongside.
 *
 * Prevalence is bounded by the retained key set per file (see MAX_KEYS_PER_FILE);
 * when any file was truncated, `truncated` is true and prevalence is a floor.
 *
 * @param {Array} perFile results from parseVcfFile
 * @param {{limit?: number}} [opts] cap on distinct variants returned (top-by-prevalence)
 * @returns {{variants: Array, distinctTotal: number, sampleCount: number, truncated: boolean}}
 */
export function collectCohortVariants(perFile, { limit = 300 } = {}) {
  const files = perFile.filter(Boolean);
  const sampleCount = files.length;
  const byKey = new Map();

  for (const f of files) {
    for (const key of f.keys || []) {
      let entry = byKey.get(key);
      if (!entry) {
        entry = { sampleCount: 0, rsid: null, gene: null };
        byKey.set(key, entry);
      }
      entry.sampleCount += 1;
      const meta = f.keyMeta?.get(key);
      if (meta) {
        if (!entry.rsid && meta.rsid) entry.rsid = meta.rsid;
        if (!entry.gene && meta.gene) entry.gene = meta.gene;
      }
    }
  }

  const ranked = [...byKey.entries()]
    .map(([key, entry]) => {
      const parsed = parseVariantKey(key);
      if (!parsed) return null;
      return {
        stableVariantKey: key,
        ...parsed,
        rsid: entry.rsid,
        gene: entry.gene,
        sampleCount: entry.sampleCount,
        cohortFraction: sampleCount > 0 ? entry.sampleCount / sampleCount : 0,
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.sampleCount - a.sampleCount || a.stableVariantKey.localeCompare(b.stableVariantKey));

  return {
    variants: ranked.slice(0, limit),
    distinctTotal: byKey.size,
    sampleCount,
    truncated: files.some((f) => f.keysTruncated),
  };
}

/**
 * Combine per-file results into cohort-level statistics, including a
 * shared-variant tally (how many samples carry each variant key).
 *
 * Shared-variant detection is limited to the keys retained per file
 * (see MAX_KEYS_PER_FILE); when any file was truncated the shared figures are
 * a floor, not an exact count, and callers should label them as such.
 *
 * @param {Array} perFile results from parseVcfFile
 * @returns cohort summary with real aggregate numbers only
 */
export function summarizeCohort(perFile) {
  const files = perFile.filter(Boolean);
  const sampleCount = files.length;
  const totalVariants = files.reduce((sum, f) => sum + (f.variantCount || 0), 0);

  const variantTypes = {};
  for (const f of files) {
    for (const [type, count] of Object.entries(f.variantTypes || {})) {
      variantTypes[type] = (variantTypes[type] || 0) + count;
    }
  }

  // Count how many samples carry each variant key.
  const sampleCountByKey = new Map();
  for (const f of files) {
    for (const key of f.keys || []) {
      sampleCountByKey.set(key, (sampleCountByKey.get(key) || 0) + 1);
    }
  }

  let sharedAcrossAll = 0;
  let sharedByTwoOrMore = 0;
  for (const count of sampleCountByKey.values()) {
    if (count >= 2) sharedByTwoOrMore += 1;
    if (count === sampleCount && sampleCount > 1) sharedAcrossAll += 1;
  }

  const sharedApproximate = files.some((f) => f.keysTruncated);
  const meanVariantsPerSample = sampleCount > 0 ? Math.round(totalVariants / sampleCount) : 0;

  return {
    sampleCount,
    totalVariants,
    meanVariantsPerSample,
    variantTypes,
    distinctVariants: sampleCountByKey.size,
    sharedByTwoOrMore,
    sharedAcrossAll,
    sharedApproximate,
    perSample: files.map((f) => ({
      name: f.name,
      variantCount: f.variantCount,
      keysTruncated: !!f.keysTruncated,
    })),
  };
}
