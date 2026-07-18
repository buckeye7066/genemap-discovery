# Changelog — Portfolio Hardening (2026-07-18)

Branch: `claude/portfolio-hardening-2026-07-18`. Local commits only — not pushed, merged, or deployed.

## Security / privacy (user-visible)

- **Raw genomic content is now blocked from the AI tutor, not just the raw LLM proxy.**
  The "no raw VCF to cloud AI by default" rule previously covered only `POST /llm/invoke`
  and `POST /llm/chat`. It now also covers `POST /education/explain` (the optional
  `context` field) and `POST /education/chat`. Pasting a VCF or a block of variant rows
  into any of these returns HTTP 400 and **nothing is sent to OpenAI/Anthropic** unless
  the operator has enabled `ALLOW_GENOMIC_LLM_UPLOAD=true` **and** the user has a granted
  `genomic_llm_upload` v1.0 consent record (in which case only the content *length* is
  audit-logged — never the genomic payload).

## Build / bundle

- Removed the empty `vendor-3d` Rollup chunk and the unused `three` dependency from the
  web app. Smaller install and no more empty-chunk build warning. No runtime behavior
  change (nothing imported `three`).

## Release gate

- The production launch verifier now runs a real `--self-test` (environment-aware:
  loads config, validates env + evidence, confirms it still fails closed on a non-live
  Stripe key) in the `typecheck` and `release:check` gates, replacing a bare
  `node --check` syntax check. New script: `pnpm launch:verify:selftest`.

## Reliability

- The shared genomic-database fetch helper now retries **only idempotent requests**
  (GET/HEAD, or a read explicitly marked `idempotent:true`). Writes are never retried.
  Existing MyGene.info batch lookups (a POST that is really a read) are unaffected.

## Docs

- README: PostgreSQL **18** (was "16+"), pnpm-9-via-corepack note, production deployment
  marked live (Railway API auto-deploy on `main` + Vercel web), and explicit
  web/desktop/API/database responsibilities.

---

## Security / privacy — follow-up (durable chokepoint)

- **Every** cloud-AI call now passes through a single guard inside
  `services/llm.js`, so raw genomic content is blocked on all surfaces, not just
  the two education routes. Four additional bypasses were closed:
  - `/llm/chat` no longer accepts array-form message content that could hide a
    VCF past a string-only check (now rejected with 400).
  - `/education/quiz` now guards the user-supplied `topic`.
  - `/llm/image` and `/education/image` now guard their prompt/topic.
  - `/report-client-error` (unauthenticated) no longer forwards VCF-shaped error
    text to the cloud LLM — it falls back to a deterministic heuristic.
- User-visible effect: pasting raw VCF/variant-table text into any AI feature
  returns a clean rejection and nothing is sent to OpenAI/Anthropic (unless the
  operator opt-in + user consent flow is satisfied, unchanged).

## Security / privacy — follow-up 2 (leak vectors closed)

- **Tool/function arguments** can no longer smuggle raw genomic text to the
  cloud: `/llm/chat` rejects client-supplied `tool_calls`/`function_call` and the
  provider-text extraction now inspects every provider-visible field (including
  tool/function arguments), not just `content`.
- **Revoked consent is honored**: the genomic-LLM consent check now reads the
  newest consent record and requires it to be granted, so a later revocation
  immediately blocks uploads (and a missing user fails closed).
- **The raw-genomic detector fails closed on more shapes**: single VCF/variant
  rows, compact identifiers (`1-12345-A-G`), HGVS (`c.20A>T`), JSON/CSV variant
  records, and base64/gzip/data-URI encoded VCFs (decoded and re-checked). A
  single incidental coordinate/HGVS mention inside a sentence is still allowed so
  genetics education keeps working; docs note a heuristic can't catch everything
  and the real guarantee is that raw VCF is parsed locally, never sent to cloud
  by default.

## Security / privacy — follow-up 3 (encoded-payload detector hardening)

- **Gzip decode is now bounded** (fixes a decompression-bomb DoS): the guard caps
  decompression output and treats a cap-hit/corrupt gzip blob as blocked, so a
  tiny base64 gzip cannot expand to a huge allocation on the AI routes.
- **Chunked / MIME- or whitespace-wrapped base64 is reconstructed** and decoded,
  closing the "wrap the base64 every few characters" evasion (incl. gzip+base64).
- **CSV/TSV variant detection scans a bounded block, not just the first line**, so
  a prefaced or blank-line-led CSV variant table no longer slips through.

No behavior change for ordinary users; these only broaden what the raw-genomic
guardrail catches. The guarantee remains architectural: raw VCF is parsed locally
and never sent to a cloud LLM by default.

## Compatibility / migration

- **No API contract changes.** All routes, request/response shapes, and stored data are
  unchanged. The education routes simply add the same input-validation rejection the LLM
  proxy already had.
- **No database migration.** No schema change; the guard reads the existing
  `ConsentRecord` model.
- **Dependency change:** `three` removed from `apps/web`. `pnpm-lock.yaml` regenerated;
  re-verified with `pnpm install --frozen-lockfile` (pnpm 9.15.9). Run `pnpm install` after pulling.
- **Env:** no new required variables. `ALLOW_GENOMIC_LLM_UPLOAD` (pre-existing, default
  off) continues to gate the opt-in genomic-to-AI path.

## Rollback

- Pure `git revert` of the hardening commit restores prior behavior. Specifically:
  - Re-add `three` to `apps/web/package.json` and the `vendor-3d` chunk to
    `vite.config.js`, then `pnpm install` to restore the lockfile entry, **only** if a
    future feature actually imports `three`.
  - Reverting `routes/education.js` + deleting `services/genomicGuard.js` (and restoring
    the inline copy in `routes/llm.js`) removes the education-surface guard.
  - Reverting `package.json` restores the `node --check` gate.
- No data written or migrated, so rollback carries no data risk.
