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
    keysTruncated: false,
  };

  for (const line of lines) {
    if (!line || line[0] === '#') continue;
    const cols = line.split('\t');
    if (cols.length < 5) continue;

    const chrom = cols[0];
    const pos = cols[1];
    const ref = cols[3];
    const altText = cols[4];
    if (!chrom || !pos || !ref || !altText || altText === '.') continue;

    for (const alt of altText.split(',')) {
      if (!alt || alt === '.') continue;
      acc.variantCount += 1;
      const type = classifyVariant(ref, alt);
      acc.variantTypes[type] = (acc.variantTypes[type] || 0) + 1;
      if (acc.keys.size < maxKeys) {
        acc.keys.add(`${chrom}:${pos}:${ref}>${alt}`);
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
 * @returns {Promise<{name, variantCount, variantTypes, keys:Set<string>, keysTruncated, bytes}>}
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

  const state = { variantCount: 0, variantTypes: {}, keys: new Set(), keysTruncated: false };
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
    keysTruncated: state.keysTruncated,
    bytes: file.size ?? bytesRead,
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
