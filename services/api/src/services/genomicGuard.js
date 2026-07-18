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

import { ValidationError } from '../utils/errors.js';
import { createAuditLog } from '../utils/audit.js';

export const GENOMIC_LLM_CONSENT_TYPE = 'genomic_llm_upload';
export const GENOMIC_LLM_CONSENT_VERSION = '1.0';

// Minimum number of variant-shaped lines before we treat a blob as "raw
// genomic content". A stray "chr1 12345 ..." mention in prose should not trip
// the guard; three or more consecutive-looking variant rows (or an explicit
// VCF #CHROM header) is unmistakably a pasted file.
const MIN_VARIANT_LINES = 3;

/**
 * Heuristic: does this text look like a raw VCF / variant-table dump?
 * Matches either the canonical VCF column header or several tab/space-delimited
 * `CHROM POS ID REF ALT`-shaped rows. Deliberately conservative to avoid
 * blocking legitimate curated genomic *context* (gene names, annotations).
 */
export function looksLikeRawGenomicContent(text) {
  if (typeof text !== 'string') return false;
  if (/#CHROM\s+POS\s+ID\s+REF\s+ALT/i.test(text)) return true;
  const variantLines = text.split(/\r?\n/).filter((line) =>
    /^(chr)?([0-9]{1,2}|X|Y|MT|M)\s+\d+\s+(\S+|\.)\s+[ACGTN]+\s+[ACGTN,]+/i.test(line.trim())
  );
  return variantLines.length >= MIN_VARIANT_LINES;
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
 * @throws {ValidationError} when raw genomic content is present without opt-in + consent.
 */
export async function assertNoRawGenomicLLM(prisma, userId, text) {
  if (!looksLikeRawGenomicContent(text)) return;

  if (process.env.ALLOW_GENOMIC_LLM_UPLOAD !== 'true') {
    throw new ValidationError('Raw VCF/genomic file content is not allowed in LLM requests by default');
  }

  const consent = await prisma.consentRecord.findFirst({
    where: {
      userId,
      consentType: GENOMIC_LLM_CONSENT_TYPE,
      version: GENOMIC_LLM_CONSENT_VERSION,
      granted: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  if (!consent) {
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
}
