// ─── No-cloud-genomic default guard ──────────────────────────────────────────
//
// GeneMap's core privacy promise is that RAW genomic file content (a VCF, or a
// dump of variant rows) never leaves the platform for a cloud LLM unless the
// user has explicitly opted in AND consented. The reference-database enrichment
// path (genomicDatabases.js / vcf.js) is deterministic and never touches an LLM,
// but the free-text AI surfaces (the /llm proxy AND the /education explain+chat
// prompts, which prepend user-supplied context) are a place raw VCF text could
// be smuggled to OpenAI/Anthropic.
//
// This module centralizes the detector + the enforcement so EVERY cloud-AI
// entry point applies the SAME policy. Previously the guard lived only inside
// routes/llm.js, so /education/explain's `context` field and /education/chat
// messages were an unguarded path to cloud AI for raw genomic content.
//
// HONESTY ABOUT THE HEURISTIC: `looksLikeRawGenomicContent` is a backstop, not a
// perfect classifier. It fails CLOSED on the concrete, known evasions (VCF
// headers, bare/tab-delimited/compact/HGVS variant rows — even a single one —
// JSON/CSV variant records, and base64/gzip/data-URI encoded VCFs, which it
// decodes and re-checks). A sufficiently novel encoding could still slip past a
// text heuristic; the load-bearing privacy guarantee is architectural — raw VCF
// is parsed locally (services/vcf.js) and never sent to a cloud LLM by default,
// and this guard blocks the free-text AI surfaces unless opt-in + consent.

import { gunzipSync } from 'node:zlib';
import { ValidationError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

export const GENOMIC_LLM_CONSENT_TYPE = 'genomic_llm_upload';
export const GENOMIC_LLM_CONSENT_VERSION = '1.0';

// Number of loosely variant-shaped lines that, together, look like a pasted
// dump even when no single line is a clean VCF record.
const MIN_VARIANT_LINES = 3;
const CHROM = '(chr)?([0-9]{1,2}|X|Y|MT|M)';

// A loose "CHROM POS ID REF ALT ..." line (may be embedded in prose). Only
// meaningful in aggregate (>= MIN_VARIANT_LINES), so a single prose mention of
// a coordinate does not trip the guard.
const LOOSE_VARIANT_LINE = new RegExp(`^${CHROM}\\s+\\d+\\s+(\\S+|\\.)\\s+[ACGTN]+\\s+[ACGTN,]+`, 'i');
// Compact single-variant identifiers, only when a line is ESSENTIALLY just that
// token (an upload/paste), so "what does chr1:12345:A>G mean?" (a question) is
// not blocked but a pasted "1-12345-A-G" is.
const BARE_COMPACT_VARIANT = new RegExp(`^${CHROM}[:_-]\\d+[:_-][ACGTN]+[>:_-]+[ACGTN]+$`, 'i');
const BARE_HGVS = /^([A-Za-z0-9_.()-]+:)?[gcmnpr]\.\d+[ACGTN]+>[ACGTN]+$/i;

/**
 * Is this line a bare VCF variant record (5-col CHROM POS ID REF ALT, or a full
 * >=8-col VCF data line with a numeric/`.` QUAL)? Distinguishes a real data row
 * from an English sentence that happens to start with a coordinate.
 */
function isBareVariantRecord(line) {
  const cols = line.trim().split(/[ \t]+/);
  const shaped =
    new RegExp(`^${CHROM}$`, 'i').test(cols[0] || '') &&
    /^\d+$/.test(cols[1] || '') &&
    /^[ACGTN]+$/i.test(cols[3] || '') &&
    /^[ACGTN,]+$/i.test(cols[4] || '');
  if (!shaped) return false;
  if (cols.length === 5) return true; // CHROM POS ID REF ALT
  if (cols.length >= 8 && (/^\d+(\.\d+)?$/.test(cols[5]) || cols[5] === '.')) return true; // + QUAL...
  return false;
}

/**
 * JSON/JS text carrying variant records: co-occurring ref + alt plus a position
 * or chromosome key is the unmistakable signature of a variant object/array.
 */
function looksLikeVariantJson(text) {
  if (!/[[{]/.test(text)) return false;
  const has = (re) => re.test(text);
  const ref = has(/"(ref|reference|referenceAllele)"\s*:/i);
  const alt = has(/"(alt|alternate|alternateAllele)"\s*:/i);
  const pos = has(/"(pos|position)"\s*:/i);
  const chrom = has(/"(chr|chrom|chromosome)"\s*:/i);
  return ref && alt && (pos || chrom);
}

// Bounds that keep the encoded-payload path cheap and DoS-resistant.
const MAX_B64_INPUT = 2_000_000; // cap the base64/compressed input we will decode
const MAX_DECODE_BYTES = 100_000; // cap the decoded/decompressed output we inspect
const MAX_CSV_SCAN_LINES = 25; // how far to look for a CSV/TSV variant header
// Sentinel: an encoded blob that is provably file-like (a gzip stream we cannot
// safely fully decompress, e.g. a decompression bomb) is BLOCKED outright.
const BLOCKED = Symbol('blocked-genomic-blob');

/** Does a delimited row carry variant-shaped values (a numeric pos + ACGTN alleles)? */
function isVariantDelimitedRow(vals) {
  const hasPos = vals.some((v) => /^\d+$/.test(v));
  const alleles = vals.filter((v) => /^[ACGTN]+$/i.test(v) && v.length <= 60);
  return hasPos && alleles.length >= 2;
}

/**
 * CSV/TSV carrying variant records. Scans the first bounded set of non-empty
 * lines for a header declaring ref/alt + a position/chromosome column (so a
 * prefaced block or leading blank lines cannot hide it), then confirms at least
 * one following line is an actual variant-shaped row.
 */
function looksLikeVariantCsv(text) {
  const lines = text.split(/\r?\n/);
  let scanned = 0;
  for (let i = 0; i < lines.length && scanned < MAX_CSV_SCAN_LINES; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    scanned++;
    const cols = line.toLowerCase().split(/[,\t]/).map((s) => s.trim());
    const has = (names) => names.some((n) => cols.includes(n));
    const isHeader =
      has(['ref', 'reference', 'referenceallele']) &&
      has(['alt', 'alternate', 'alternateallele']) &&
      has(['pos', 'position', 'chr', 'chrom', 'chromosome']);
    if (!isHeader) continue;
    for (let j = i + 1; j < lines.length && j <= i + 6; j++) {
      const row = lines[j].trim();
      if (!row) continue;
      if (isVariantDelimitedRow(row.split(/[,\t]/).map((s) => s.trim()))) return true;
    }
  }
  return false;
}

/**
 * Pull out base64-ish blobs — data: URIs and long standalone runs — INCLUDING
 * MIME/RFC whitespace-wrapped or chunked base64 (we also scan a whitespace-
 * stripped copy so newline- or space-broken payloads are reconstructed). This
 * closes the "wrap the base64 every few chars" evasion. Bounded for DoS safety.
 */
function extractBase64Blobs(text) {
  const blobs = new Set();
  // data: URIs — allow whitespace inside the payload, then strip it out.
  for (const m of text.match(/data:[^;,]*;base64,[A-Za-z0-9+/=\s]+/gi) || []) {
    const payload = m.replace(/^[\s\S]*?base64,/i, '').replace(/\s+/g, '');
    if (payload.length >= 24) blobs.add(payload.slice(0, MAX_B64_INPUT));
  }
  // Contiguous runs, as-is.
  for (const s of text.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || []) blobs.add(s.slice(0, MAX_B64_INPUT));
  // Whitespace-stripped copy reconstructs chunked / MIME-wrapped base64.
  const stripped = text.replace(/\s+/g, '').slice(0, MAX_B64_INPUT * 2);
  for (const s of stripped.match(/[A-Za-z0-9+/]{40,}={0,2}/g) || []) blobs.add(s.slice(0, MAX_B64_INPUT));
  return [...blobs].slice(0, 8);
}

function tryDecodeBase64(b64) {
  try {
    const buf = Buffer.from(b64, 'base64');
    if (buf.length < 8) return null;
    if (buf[0] === 0x1f && buf[1] === 0x8b) {
      // gzip magic.
      // BOUNDED decompression: cap output so a small blob that expands to
      // gigabytes (a decompression bomb) can neither exhaust memory nor block
      // the event loop. A cap-hit or corrupt stream throws -> treat the gzip
      // blob as a file-like upload and BLOCK (fail closed), never continue.
      try {
        return gunzipSync(buf, { maxOutputLength: MAX_DECODE_BYTES }).toString('utf8');
      } catch {
        return BLOCKED;
      }
    }
    return buf.toString('utf8').slice(0, MAX_DECODE_BYTES);
  } catch {
    return null;
  }
}

/**
 * Fail-CLOSED heuristic: does this text look like raw genomic upload content?
 *
 * Catches the canonical VCF header, bare VCF/variant data rows (even ONE),
 * compact single-variant identifiers pasted on their own line, HGVS, JSON/CSV
 * variant records, and base64/gzip/data-URI encoded variants (decoded and
 * re-checked). It deliberately does NOT flag an incidental single coordinate or
 * HGVS mention inside a sentence, so genetics education still works.
 *
 * A heuristic cannot catch every possible encoding of genomic data; this closes
 * the concrete, known evasions. The authoritative privacy guarantee is that raw
 * VCF is parsed locally (services/vcf.js) and never sent to a cloud LLM by
 * default — this detector is the backstop for the free-text AI surfaces.
 */
export function looksLikeRawGenomicContent(text, _depth = 0) {
  if (typeof text !== 'string' || !text) return false;

  if (/#CHROM\s+POS\s+ID\s+REF\s+ALT/i.test(text)) return true;

  let looseLines = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (isBareVariantRecord(line)) return true;      // a real VCF data row (even one)
    if (BARE_COMPACT_VARIANT.test(line)) return true; // a pasted "1-12345-A-G"
    if (BARE_HGVS.test(line)) return true;            // a pasted "c.20A>T"
    if (LOOSE_VARIANT_LINE.test(line)) looseLines++;
  }
  if (looseLines >= MIN_VARIANT_LINES) return true;

  if (looksLikeVariantJson(text)) return true;
  if (looksLikeVariantCsv(text)) return true;

  // Encoded/compressed payloads: decode and re-check (bounded recursion).
  if (_depth < 2) {
    for (const blob of extractBase64Blobs(text)) {
      const decoded = tryDecodeBase64(blob);
      if (decoded === BLOCKED) return true; // gzip bomb / undecodable file-like blob
      if (typeof decoded === 'string' && looksLikeRawGenomicContent(decoded, _depth + 1)) return true;
    }
  }

  return false;
}

/**
 * Enforce the no-cloud-genomic default before any text reaches a cloud LLM.
 *
 * Fails CLOSED: if the text looks like raw genomic content, it is rejected
 * unless BOTH (a) the operator has explicitly enabled genomic LLM upload via
 * `ALLOW_GENOMIC_LLM_UPLOAD=true` and (b) the user has a current, granted
 * consent record. When allowed, the upload is audit-logged (minimised: only the
 * content length is recorded, never the genomic payload itself).
 *
 * @returns {Promise<boolean>} `true` when the text WAS raw genomic content and
 *   was explicitly consented (caller must forward it to the provider with the
 *   `allowGenomic` marker); `false` when the text is not genomic.
 * @throws {ValidationError} when raw genomic content is present without opt-in + consent.
 */
export async function assertNoRawGenomicLLM(prisma, userId, text) {
  if (!looksLikeRawGenomicContent(text)) return false;

  if (process.env.ALLOW_GENOMIC_LLM_UPLOAD !== 'true') {
    // Log a warning and throw an error if the configuration is incorrect.
    console.warn('Warning: ALLOW_GENOMIC_LLM_UPLOAD is not set to true. This may prevent genomic uploads.')
    throw new ValidationError('Raw VCF/genomic file content is not allowed in LLM requests by default');
  }

  // Check if user is authenticated
  if (!userId) {
    throw new ValidationError('Unauthenticated request: Consent required but no user is logged in.');
  }

  // Fetch the LATEST consent record regardless of its `granted` value, then
  // require the newest one to be granted. Filtering to `granted: true` inside
  // the query would let a stale older grant keep authorizing uploads after the
  // user recorded a newer `granted: false` revocation.
  const latest = await prisma.consentRecord.findFirst({
    where: {
      userId,
      consentType: GENOMIC_LLM_CONSENT_TYPE,
      version: GENOMIC_LLM_CONSENT_VERSION,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!latest || latest.granted !== true) {
    throw new ValidationError(`Consent required: ${GENOMIC_LLM_CONSENT_TYPE} v${GENOMIC_LLM_CONSENT_VERSION}`);
  }

  await createAuditLog(
    prisma,
    {
      userId,
      action: 'llm.genomic_upload',
      entityType: 'llm',
      // Minimisation: record only that an upload happened and its size, never
      // the genomic content itself.
      metadata: { contentLength: text.length },
    },
    { required: true }
  );

  return true;
}
