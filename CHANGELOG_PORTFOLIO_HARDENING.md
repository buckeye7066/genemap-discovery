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
