# FlexFactor audit — genemap-discovery

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 2 of 375 candidate(s)
- **FILE ACCOUNTING: 375 candidate(s) = 2 reviewed + 341 never_attempted + 24 review_incomplete + 8 skipped_known_clean**
- **MOSTLY SKIPPED: only 2 of 375 candidate file(s) (0%) were reviewed.**
- **Defects found:** 7
- **Files fixed:** 0
- **Errors recorded:** 16 (see the Errors section below; ledger at `C:\Users\firer\.flexfactor\runs\genemap-discovery-20260824-050548-082562-16164\errors.md`)
- **Baseline build:** FAILED
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:groq/compound
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**973 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 62 |
| configuration-documentation-or-data | 273 |
| first-party-source | 627 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-discovery-20260824-050548-082562-16164`
- **Exact final commit:** `63b5f364ba7c26d09621e49292c562725711711f`
- **Code map:** 553 file(s), 1258 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1069 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 0/0 (complete)
- **Blast radius:** 0 affected file(s); analysis ran
- **Normalized gates:** 3 pass, 4 fail, 2 blocked

- **Blast Radius:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\blast-radius.json`
- **Changed File Rescan:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\changed-file-rescan.json`
- **Code Index:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\code-index.json`
- **Coverage Ledger:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\coverage-ledger.json`
- **Manifest:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\manifest.json`
- **Purpose Graph:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\purpose-graph.json`
- **Quality Gates:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\quality-gates.json`
- **Sarif:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-050548-082562-16164\results.sarif`

## Production readiness

**NOT PRODUCTION READY** — 11/14 evaluated gates passed, 3 blocker(s).

Full scorecard: `C:\Users\firer\genemap-discovery\genemap-discovery_readiness.md`

- **Project builds** [critical] — build command failed
  - Fix: Fix the compile/build errors.
- **Test suite passes** [high] — tests were not run
  - Fix: Run the suite and fix failures.
- **Dependencies are lock-pinned** [high] — no lockfile: java:apps/web/android
  - Fix: Commit the lockfile so builds are reproducible.

## Competitor research

**Coverage:** ONLY 4 of the target 5 competitors could be corroborated from a reachable source. This is a coverage SHORTFALL, not evidence that fewer competitors exist.

- **Sources used:** web:duckduckgo, repo-rewards
- **Repo Rewards endpoint:** `https://web-production-d7db7.up.railway.app`
- **Sources SKIPPED (named, not silent):**
  - `idea:andreaswallberg/GenomeLens` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for andreaswallberg/GenomeLens
  - `idea:cmdcolin/awesome-genome-visualization` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for cmdcolin/awesome-genome-visualization
  - `idea:jrderuiter/genemap` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for jrderuiter/genemap
  - `idea:wjwei-handsome/ZeaGeneMap` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for wjwei-handsome/ZeaGeneMap
  - `model-discovery` - RotationError: no light route available (102 enabled routes in catalog). Pools skipped: groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide))
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 0 (rejected 4 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 4 candidate(s)
  - NOT bridged (4): andreaswallberg/GenomeLens, cmdcolin/awesome-genome-visualization, jrderuiter/genemap, wjwei-handsome/ZeaGeneMap - idea rejected by the purpose contract

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [cmdcolin/awesome-genome-visualization](https://github.com/cmdcolin/awesome-genome-visualization) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [wjwei-handsome/ZeaGeneMap](https://github.com/wjwei-handsome/ZeaGeneMap) | oss | `GPL-3.0` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [andreaswallberg/GenomeLens](https://github.com/andreaswallberg/GenomeLens) | oss | `AGPL-3.0` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [jrderuiter/genemap](https://github.com/jrderuiter/genemap) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |

### cmdcolin/awesome-genome-visualization

- **Evidence:** <https://github.com/cmdcolin/awesome-genome-visualization>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### wjwei-handsome/ZeaGeneMap

- **Evidence:** <https://github.com/wjwei-handsome/ZeaGeneMap>
- **Licence:** `GPL-3.0` (via repo-rewards)
- **Reuse mode:** `clean-room-from-documented-behavior` - licence GPL-3.0 is copyleft/restricted; source must NOT be copied - work from documented behaviour only
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### andreaswallberg/GenomeLens

- **Evidence:** <https://github.com/andreaswallberg/GenomeLens>
- **Licence:** `AGPL-3.0` (via repo-rewards)
- **Reuse mode:** `clean-room-from-documented-behavior` - licence AGPL-3.0 is copyleft/restricted; source must NOT be copied - work from documented behaviour only
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### jrderuiter/genemap

- **Evidence:** <https://github.com/jrderuiter/genemap>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

## Release status

**BLOCKED**

Status vocabulary is the owner's (master prompt section 4). `DONE` is not a release status, and none of these are equivalent to PRODUCTION READY: tests pass, build passes, merged, deployed, health endpoint returns 200, works locally, PR opened.

Standing between this program and PRODUCTION READY (20 condition(s) without passing evidence):

- `purpose_fulfilled` — The core purpose is fully implemented and the purpose-defining journey produces the outcome the program exists to produce.
- `journeys_end_to_end` — Primary user journeys work end to end.
- `modes_behave` — Major roles, modes, controls and configuration choices materially change behavior as intended.
- `data_paths` — Production data paths are functional and protected.
- `authz` — Authentication and authorization are correct.
- `privacy_security` — Privacy and security controls are appropriate.
- `defects_resolved` — Critical and high-severity defects are resolved.
- `tests_pass` — Applicable tests pass, on full rather than selectively narrowed gates.
- `reviewed` — The complete release candidate received substantive review.
- `merged` — Required changes are merged to the verified default branch.
- `ci_on_sha` — CI passes on the exact final default-branch SHA.
- `sha_deployed` — The exact merge SHA is deployed, packaged, or installed.
- `release_identity` — Live or installed release identity is independently verified.
- `output_inspected` — The actual purpose-defining production journey was executed and its final output inspected.
- `observability` — Monitoring, logging and error reporting are operational and do not expose secrets.
- `recovery_docs` — Backup, rollback, upgrade, uninstall and recovery documentation exists and was tested where applicable.
- `claims_match` — Product claims match verified capabilities.
- `no_abandoned_work` — No production-required work is abandoned in another PR, branch, worktree, or local artifact.
- `user_understandable` — The application is understandable to its intended users without developer assistance.
- `no_external_gap` — No required credential, certificate, legal review, payment validation, or external production proof remains incomplete.

## Runtime-data evidence (read-only production)

**UNAVAILABLE** - FLEXFACTOR_READONLY_DATABASE_URL is not set - FlexFactor has NO read path to production data, so NO data-shaped or environment-shaped root cause could be looked for (this is not evidence that none exists)

_This is NOT a clean data bill of health: no data-shaped or environment-shaped root cause could be looked for._

## Remaining defects NOT auto-fixed (fix floor = medium)

_These were found but left as-is - review and decide. Critical/high here means a file that could not be safely auto-fixed (see manual-review list)._

### high (2)
- `apps/web/components/research/ProjectManager.jsx` line 164 (correctness) - **Annotation resolve button never renders due to missing userId field**: Line 164 checks `annotation.userId === user?.id` to gate the 'resolve' button, but the `Annotation` interface (types.ts:615-625) defines no `userId` field. This expression always evaluates to `undefined === user?.id`, which is always falsy. The resolve button is therefore never rendered for any annotation regardless of ownership. _Suggested fix:_ Either add `userId?: string` to the `Annotation` interface in types.ts, or verify the API response includes `userId` and update the type accordingly.
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment failed: RuntimeError: all 3 purpose assessment samples failed: RotationError: no light route available (102 enabled routes in catalog). Pools skipped: groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide)); RotationError: no light route available (102 enabled routes in catalog). Pools skipped: groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide)); RotationError: no light route available (102 enabled routes in catalog). Pools skipped: groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide)); final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

### medium (1)
- `apps/web/components/research/ProjectManager.jsx` line 152 (correctness) - **Annotation user display shows 'Unknown' for all annotations due to missing user field in type**: Line 152 accesses `annotation.user?.displayName || annotation.user?.email` to show who created an annotation, but the `Annotation` interface (types.ts:615-625) defines no `user` field. The API may include user info in the response, but the TypeScript type does not reflect this, so every annotation unconditionally falls through to the final `'Unknown'` fallback. _Suggested fix:_ Add `user?: { displayName?: string | null; email?: string }` (or the full `User` shape) to the `Annotation` interface in types.ts to match what the API actually returns.

### low (1)
- `apps/web/pages/LearningPath.jsx` line 49 (dead-code) - **Unreachable guard clause on Promise.allSettled result**: The condition `!Array.isArray(settled) || settled.length !== 2` can never be true. Promise.allSettled always resolves to an array whose length equals the number of input promises (here, exactly 2). Both branches of the guard are therefore dead code — the `return` on line 50 is never executed. The subsequent code already safely handles non-fulfilled statuses via `.status === 'fulfilled'` checks, making this defensive check redundant. _Suggested fix:_ Remove lines 49-51 (the if-guard and early return) since they are unreachable and add no safety value.

## Defects by file

### `apps/web/components/research/ProjectManager.jsx` ⚠️ reported
- **[high]** line 164 (correctness) — **Annotation resolve button never renders due to missing userId field**: Line 164 checks `annotation.userId === user?.id` to gate the 'resolve' button, but the `Annotation` interface (types.ts:615-625) defines no `userId` field. This expression always evaluates to `undefined === user?.id`, which is always falsy. The resolve button is therefore never rendered for any annotation regardless of ownership. _Fix:_ Either add `userId?: string` to the `Annotation` interface in types.ts, or verify the API response includes `userId` and update the type accordingly.
- **[medium]** line 152 (correctness) — **Annotation user display shows 'Unknown' for all annotations due to missing user field in type**: Line 152 accesses `annotation.user?.displayName || annotation.user?.email` to show who created an annotation, but the `Annotation` interface (types.ts:615-625) defines no `user` field. The API may include user info in the response, but the TypeScript type does not reflect this, so every annotation unconditionally falls through to the final `'Unknown'` fallback. _Fix:_ Add `user?: { displayName?: string | null; email?: string }` (or the full `User` shape) to the `Annotation` interface in types.ts to match what the API actually returns.

### `apps/web/pages/LearningPath.jsx` ⚠️ reported
- **[low]** line 49 (dead-code) — **Unreachable guard clause on Promise.allSettled result**: The condition `!Array.isArray(settled) || settled.length !== 2` can never be true. Promise.allSettled always resolves to an array whose length equals the number of input promises (here, exactly 2). Both branches of the guard are therefore dead code — the `return` on line 50 is never executed. The subsequent code already safely handles non-fulfilled statuses via `.status === 'fulfilled'` checks, making this defensive check redundant. _Fix:_ Remove lines 49-51 (the if-guard and early return) since they are unreachable and add no safety value.

## Fix notes / left unfixed

- scripts/verify-production-launch.mjs: no verified candidate was produced
- scripts/verify-production-launch.mjs: TIMED OUT after 15m of fix attempts - rolled back and re-queued (raise FLEXFACTOR_FIX_FILE_MAX_SECONDS to allow longer)
- scripts/verify-production-launch.mjs: no verified candidate was produced
- publication failure made no progress and did not name another repairable source file
- baseline publication suite is red and bounded repair did not fix it; review continued, publication stays blocked
- review made no progress: three consecutive semantic review batches completed ZERO files (2 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
- rollback failed; working tree requires inspection


## Errors (16)

| # | phase | kind | error | responsible |
|---|---|---|---|---|
| 1 | rotation | program-defect | EgressBlockedError: flexfactor_egress_blocked: payload contains ['cloud_token', 'password_ | flexfactor.py:1294 |
| 2 | rotation | program-defect | EgressBlockedError: flexfactor_egress_blocked: payload contains ['cloud_token', 'password_ | flexfactor.py:1294 |
| 3 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 4 | baseline | program-defect | baseline publication suite is RED and bounded targeted repair did not fix it | - |
| 5 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 6 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the  | flexfactor.py:2412 |
| 7 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 8 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 9 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 10 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 11 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 12 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 13 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the  | flexfactor.py:2412 |
| 14 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 15 | fix | budget | no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-ti | apps/web/components/research/ProjectManager.jsx |
| 16 | baseline-gate | program-defect | review made no progress: three consecutive semantic review batches completed ZERO files (2 | - |

Counts by kind: budget 1, program-defect 5, provider 10

### 1. rotation — program-defect

**Error**

```
EgressBlockedError: flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- FlexFactor `flexfactor.py:1294` in `_egress_gate()`

```python
raise EgressBlockedError(
```
- Route: `cerebras/gemma-4-31b`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 2. rotation — program-defect

**Error**

```
EgressBlockedError: flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- FlexFactor `flexfactor.py:1294` in `_egress_gate()`

```python
raise EgressBlockedError(
```
- Route: `cerebras/gpt-oss-120b`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 3. fix — program-defect

**Error**

```
flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- Program file: `scripts/verify-production-launch.mjs`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 4. baseline — program-defect

**Error**

```
baseline publication suite is RED and bounded targeted repair did not fix it
```

**Detail**

```
> tsc --noEmit


> @genemap/api@1.0.0 typecheck C:\Users\firer\genemap-discovery\services\api
> node --check src/index.js && node --check src/config/env.js


> genemap-discovery@1.0.0 launch:verify:selftest C:\Users\firer\genemap-discovery
> node scripts/verify-production-launch.mjs --self-test

Launch verifier self-test passed (env + evidence validation executed, fail-closed confirmed).

npm warn Unknown project config "node-linker". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.

$ npm run build
apps/desktop build$ node scripts/generate-icons.mjs && node scripts/electron-build.mjs
apps/desktop build: Generated desktop icons (png/ico/icns) and web PWA icons (192/512).
packages/shared build: Done
apps/desktop build:   • electron-builder  version=26.15.3 os=10.0.26200
apps/desktop build:   • loaded configuration  file=package.json ("build" field)
apps/desktop build:   • executing @electron/rebuild  electronVersion=39.8.10 arch=x64 buildFromSource=false workspaceRoot=C:\Users\firer\genemap-discovery\apps\desktop projectDir=./ appDir=./
apps/desktop build:   • installing native dependencies  arch=x64
apps/desktop build:   • completed installing native dependencies
apps/desktop build:   • packaging       platform=win32 arch=x64 electron=39.8.10 appOutDir=dist-electron\win-unpacked
apps/desktop build:   ⨯ connect ECONNREFUSED 127.0.0.1:9  failedTask=build stackTrace=RequestError: connect ECONNREFUSED 127.0.0.1:9
apps/des
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (signature)

Read the full log at C:\Users\firer\.flexfactor\runs\genemap-discovery-20260824-050548-082562-16164\baseline-publication-failure.log. Publication (push/merge) stays refused while the baseline is red; the review still runs.

### 5. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/mistral:latest`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 6. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the messages or completion.', 'type': 'invalid_request_error', 'param': 'messages'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/allam-2-7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 7. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/gpt-oss:20b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 8. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '7dfc10a8-3cc4-448e-97c1-2213308dc222': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/google/codegemma-7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 9. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19900, Requested 23796. Please try again in 27.392s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 10. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/qwen2.5-coder:7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 11. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/qwen2.5-coder:7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 12. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'c322f327-55a3-4af3-a91f-c757e2b8b135': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/google/gemma-3-4b-it`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 13. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the messages or completion.', 'type': 'invalid_request_error', 'param': 'messages'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/allam-2-7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 14. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19958, Requested 23796. Please try again in 27.508s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 15. fix — budget

**Error**

```
no strong route available (102 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
```

**Responsible code**

- Program file: `apps/web/components/research/ProjectManager.jsx`

**Suggested fix** (signature)

The pool's allowance is spent. The rotator benches it until reset; check AI Time for the reset time. Do not add paid keys to compensate.

### 16. baseline-gate — program-defect

**Error**

```
review made no progress: three consecutive semantic review batches completed ZERO files (2 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (none)

no known fix; start from the responsible code above (model suggester failed: no light route available (102 enabled routes in catalog). Pools skipped: groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide)))