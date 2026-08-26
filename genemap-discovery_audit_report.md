# FlexFactor audit — genemap-discovery

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 4 of 377 candidate(s)
- **FILE ACCOUNTING: 377 candidate(s) = 4 reviewed + 323 never_attempted + 44 review_incomplete + 6 skipped_known_clean**
- **MOSTLY SKIPPED: only 4 of 377 candidate file(s) (1%) were reviewed.**
- **Defects found:** 9
- **Files fixed:** 1
- **No-ops:** 1 (none are successes) — **0 rejected finding(s)** (author found nothing to fix — a REVIEW-precision defect, not a fix failure), **0 no fix found** (a real defect the loop could not land), 1 unclassified (the note did not say)
- **Errors recorded:** 27 (see the Errors section below; ledger at `C:\Users\firer\.flexfactor\runs\genemap-discovery-20260824-050548-082562-16164\errors.md`)
- **Baseline build:** FAILED
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:groq/compound
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**962 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 62 |
| configuration-documentation-or-data | 262 |
| first-party-source | 627 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-discovery-20260824-050548-082562-16164`
- **Exact final commit:** `027ed0fbd4509ab8e4be57ee5877d22a90f85ae5`
- **Code map:** 550 file(s), 1258 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1069 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 8/8 (complete)
- **Blast radius:** 8 affected file(s); analysis ran
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

**Coverage:** 5 competitor(s) covered with corroborating sources (target 5).

- **Sources used:** web:duckduckgo, github, repo-rewards
- **Repo Rewards endpoint:** `https://web-production-d7db7.up.railway.app`
- **Sources SKIPPED (named, not silent):**
  - `idea:UCSC Genome Browser` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for UCSC Genome Browser
  - `idea:UK-Biobank/UKB-RAP-Notebooks-Genomics` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for UK-Biobank/UKB-RAP-Notebooks-Genomics
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 3 (rejected 2 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 2 of 5 candidate(s)
  - NOT bridged (2): UCSC Genome Browser, UK-Biobank/UKB-RAP-Notebooks-Genomics - idea rejected by the purpose contract
  - NOT bridged (1): BioPython - not bridgeable (evidence=verified, reuse_mode=reference-only)

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [BioPython](https://github.com/biopython/biopython) | oss | `NOASSERTION` | `reference-only` | acceptance #3 | ACCEPT | NOT entered - not bridgeable (evidence=verified, reuse_mode=reference-only) | Standardized sequence file parsers (FASTA/GenBank) |
| [UCSC Genome Browser](https://github.com/ucscGenomeBrowser/kent) | oss | `NOASSERTION` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [DNAnexus](https://github.com/dnanexus-archive/UKB_RAP) | oss | `MIT` | `direct-code-reuse` | acceptance #1 | ACCEPT | ENTERED | Interactive Jupyter Notebook Tutorials |
| [Base44](https://github.com/base44/cli) | oss | `MIT` | `direct-code-reuse` | acceptance #7 | ACCEPT | ENTERED | Unified build CLI with version SHA output |
| [UK-Biobank/UKB-RAP-Notebooks-Genomics](https://github.com/UK-Biobank/UKB-RAP-Notebooks-Genomics) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |

### BioPython

- **Evidence:** <https://github.com/biopython/biopython>
- **Licence:** `NOASSERTION` (via github-api)
- **Reuse mode:** `reference-only` - licence NOASSERTION could not be verified; record the capability as a reference and copy nothing
- **Idea:** Standardized sequence file parsers (FASTA/GenBank) - Parses common bioinformatics file formats to extract sequence, annotations, source, species, and version for display and exploration.
- **Value here:** Enables hands‑on early‑research by letting users load and inspect gene sequences with provenance, strengthening the education‑to‑research loop.
- **Purpose / criterion mapping:** acceptance #3 - Adds provenance‑aware gene sequence exploration, directly supporting early‑research and education while keeping the platform non‑diagnostic.
- **Purpose verdict:** ACCEPTED - Adds provenance‑aware gene sequence exploration, directly supporting early‑research and education while keeping the platform non‑diagnostic.
- **Fix-stream decision:** DID NOT enter the fix stream - not bridgeable (evidence=verified, reuse_mode=reference-only)
- **Evidence basis:** Competitor description identifies BioPython as a bioinformatics library providing parsers for FASTA, GenBank, and similar formats. (confidence high)

### UCSC Genome Browser

- **Evidence:** <https://github.com/ucscGenomeBrowser/kent>
- **Licence:** `NOASSERTION` (via github-api)
- **Reuse mode:** `reference-only` - licence NOASSERTION could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: Expecting value: line 1 column 1 (char 0)
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: Expecting value: line 1 column 1 (char 0)
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### DNAnexus

- **Evidence:** <https://github.com/dnanexus-archive/UKB_RAP>, <https://github.com/dnanexus/dx-toolkit>
- **Licence:** `MIT` (via github-api)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** Interactive Jupyter Notebook Tutorials - Provides runnable, annotated Jupyter notebooks that guide users through genetic analysis workflows with live code, visualizations, and provenance tracking.
- **Value here:** Adds hands‑on, reproducible research capability to the education platform, closing the gap between passive lessons and active early‑research exploration.
- **Purpose / criterion mapping:** acceptance #1 - Enhances the platform's early‑research and education mission by offering interactive, provenance‑aware analysis tutorials without providing clinical advice.
- **Purpose verdict:** ACCEPTED - Enhances the platform's early‑research and education mission by offering interactive, provenance‑aware analysis tutorials without providing clinical advice.
- **Fix-stream decision:** ENTERED the gated fix stream - entered the gated fix stream
- **Evidence basis:** Competitor description: 'Access share reviewed code & Jupyter Notebooks for use on the UK Biobank (UKBB) Research Application Platform.' (confidence high)

### Base44

- **Evidence:** <https://github.com/base44/cli>, <https://github.com/Ai-Automators/base44-to-supabase-sdk>
- **Licence:** `MIT` (via github-api)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** Unified build CLI with version SHA output - Provides a single command that builds the application and outputs the exact Git SHA of the deployed bundle, logging the build steps for traceability.
- **Value here:** Would give Genemap Discovery an automated way to expose the exact deployed SHA and real research journey, satisfying acceptance criterion 7 and supporting deterministic benchmarks.
- **Purpose / criterion mapping:** acceptance #7 - Directly supports acceptance criterion 7 (exact deployed SHA and real research journey), which is part of the program's purpose to be transparent about provenance and avoid being mistaken for a clinical tool.
- **Purpose verdict:** ACCEPTED - Directly supports acceptance criterion 7 (exact deployed SHA and real research journey), which is part of the program's purpose to be transparent about provenance and avoid being mistaken for a clinical tool.
- **Fix-stream decision:** ENTERED the gated fix stream - entered the gated fix stream
- **Evidence basis:** Competitor description: 'Command-line interface for building applications with Base44's backend service.' indicates a CLI that builds applications; no explicit evidence it outputs SHA, so evidence is weak. (confidence low)

### UK-Biobank/UKB-RAP-Notebooks-Genomics

- **Evidence:** <https://github.com/UK-Biobank/UKB-RAP-Notebooks-Genomics>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: Expecting value: line 1 column 1 (char 0)
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: Expecting value: line 1 column 1 (char 0)
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
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment incomplete: 2/3 sample(s) usable; JSONDecodeError: Expecting value: line 1 column 1 (char 0); final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

### medium (2)
- `apps/web/components/research/ProjectManager.jsx` line 152 (correctness) - **Annotation user display shows 'Unknown' for all annotations due to missing user field in type**: Line 152 accesses `annotation.user?.displayName || annotation.user?.email` to show who created an annotation, but the `Annotation` interface (types.ts:615-625) defines no `user` field. The API may include user info in the response, but the TypeScript type does not reflect this, so every annotation unconditionally falls through to the final `'Unknown'` fallback. _Suggested fix:_ Add `user?: { displayName?: string | null; email?: string }` (or the full `User` shape) to the `Annotation` interface in types.ts to match what the API actually returns.
- `apps/web/pages/LearningPath.jsx` line 0 (competitive-gap) - **[competitor: DNAnexus] Interactive Jupyter Notebook Tutorials**: Provides runnable, annotated Jupyter notebooks that guide users through genetic analysis workflows with live code, visualizations, and provenance tracking.

Why it matters here: Adds hands‑on, reproducible research capability to the education platform, closing the gap between passive lessons and active early‑research exploration.

Purpose justification: Enhances the platform's early‑research and education mission by offering interactive, provenance‑aware analysis tutorials without providing clinical advice.

REUSE MODE: direct-code-reuse (licence MIT is permissive and compatible; source may be read and adapted with attribution). You MAY consult the competitor's source.

Evidence: https://github.com/dnanexus-archive/UKB_RAP, https://github.com/dnanexus/dx-toolkit _Suggested fix:_ Adds hands‑on, reproducible research capability to the education platform, closing the gap between passive lessons and active early‑research exploration.

### low (1)
- `apps/web/pages/LearningPath.jsx` line 49 (dead-code) - **Unreachable guard clause on Promise.allSettled result**: The condition `!Array.isArray(settled) || settled.length !== 2` can never be true. Promise.allSettled always resolves to an array whose length equals the number of input promises (here, exactly 2). Both branches of the guard are therefore dead code — the `return` on line 50 is never executed. The subsequent code already safely handles non-fulfilled statuses via `.status === 'fulfilled'` checks, making this defensive check redundant. _Suggested fix:_ Remove lines 49-51 (the if-guard and early return) since they are unreachable and add no safety value.

## Defects by file

### `apps/web/pages/LearningPath.jsx` ⚠️ reported
- **[low]** line 49 (dead-code) — **Unreachable guard clause on Promise.allSettled result**: The condition `!Array.isArray(settled) || settled.length !== 2` can never be true. Promise.allSettled always resolves to an array whose length equals the number of input promises (here, exactly 2). Both branches of the guard are therefore dead code — the `return` on line 50 is never executed. The subsequent code already safely handles non-fulfilled statuses via `.status === 'fulfilled'` checks, making this defensive check redundant. _Fix:_ Remove lines 49-51 (the if-guard and early return) since they are unreachable and add no safety value.

### `apps/web/components/research/ProjectManager.jsx` ⚠️ reported
- **[high]** line 164 (correctness) — **Annotation resolve button never renders due to missing userId field**: Line 164 checks `annotation.userId === user?.id` to gate the 'resolve' button, but the `Annotation` interface (types.ts:615-625) defines no `userId` field. This expression always evaluates to `undefined === user?.id`, which is always falsy. The resolve button is therefore never rendered for any annotation regardless of ownership. _Fix:_ Either add `userId?: string` to the `Annotation` interface in types.ts, or verify the API response includes `userId` and update the type accordingly.
- **[medium]** line 152 (correctness) — **Annotation user display shows 'Unknown' for all annotations due to missing user field in type**: Line 152 accesses `annotation.user?.displayName || annotation.user?.email` to show who created an annotation, but the `Annotation` interface (types.ts:615-625) defines no `user` field. The API may include user info in the response, but the TypeScript type does not reflect this, so every annotation unconditionally falls through to the final `'Unknown'` fallback. _Fix:_ Add `user?: { displayName?: string | null; email?: string }` (or the full `User` shape) to the `Annotation` interface in types.ts to match what the API actually returns.

## Fix notes / left unfixed

- scripts/verify-production-launch.mjs: no verified candidate was produced
- scripts/verify-production-launch.mjs: no verified candidate was produced
- publication failure made no progress and did not name another repairable source file
- baseline publication suite is red and bounded repair did not fix it; review continued, publication stays blocked
- apps/web/lib/maintenance.js: NO-OP - author model returned no change for 1 finding(s): THE DEFECT IS REAL but cannot be fixed in this file alone — the missing SHA and research journey display require changes to the main UI layout or footer components, not just this maintenance state object. This file correctly implements the fallback maintenance mode as described, so no in-file fix is needed for the listed defect.
- apps/web/pages/LearningPath.jsx: TIMED OUT after 15m of fix attempts - rolled back and re-queued (raise FLEXFACTOR_FIX_FILE_MAX_SECONDS to allow longer)
- review made no progress: three consecutive semantic review batches completed ZERO files (4 of 377 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
- rollback failed; working tree requires inspection


## Errors (27)

| # | phase | kind | error | responsible |
|---|---|---|---|---|
| 1 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 2 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 3 | baseline | program-defect | baseline publication suite is RED and bounded targeted repair did not fix it | - |
| 4 | rotation | provider | InternalServerError: Error code: 503 - {'error': {'message': 'Provider returned error', 'c | flexfactor.py:2412 |
| 5 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': | flexfactor.py:2412 |
| 6 | rotation | provider | JSONDecodeError: Expecting value: line 1 column 1 (char 0) | flexfactor.py:2563 |
| 7 | rotation | provider | InternalServerError: Error code: 503 - {'error': {'message': 'Provider returned error', 'c | flexfactor.py:2412 |
| 8 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': | flexfactor.py:2412 |
| 9 | rotation | provider | JSONDecodeError: Expecting value: line 1 column 134 (char 133) | flexfactor.py:2563 |
| 10 | rotation | provider | InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is  | flexfactor.py:2412 |
| 11 | rotation | flexfactor-defect | OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate i | flexfactor.py:2559 |
| 12 | rotation | flexfactor-defect | OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate i | flexfactor.py:2559 |
| 13 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 14 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:f | flexfactor.py:2412 |
| 15 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-s | flexfactor.py:2412 |
| 16 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': | flexfactor.py:2412 |
| 17 | rotation | flexfactor-defect | OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate i | flexfactor.py:2559 |
| 18 | rotation | flexfactor-defect | OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate i | flexfactor.py:2559 |
| 19 | rotation | provider | RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expect | flexfactor.py:3048 |
| 20 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 21 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 22 | rotation | provider | InternalServerError: Error code: 500 - {'error': {'message': 'EngineCore encountered an is | flexfactor.py:2412 |
| 23 | rotation | provider | APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type' | flexfactor.py:2412 |
| 24 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the  | flexfactor.py:2412 |
| 25 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 26 | fix | budget | no strong route available (131 enabled routes in catalog). Pools skipped: cerebras:free-ti | apps/web/components/research/ProjectManager.jsx |
| 27 | baseline-gate | program-defect | review made no progress: three consecutive semantic review batches completed ZERO files (4 | - |

Counts by kind: budget 1, flexfactor-defect 4, program-defect 4, provider 18

### 1. fix — program-defect

**Error**

```
flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- Program file: `scripts/verify-production-launch.mjs`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 2. fix — program-defect

**Error**

```
flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- Program file: `scripts/verify-production-launch.mjs`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 3. baseline — program-defect

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
packages/shared build$ tsc
apps/desktop build: Generated desktop icons (png/ico/icns) and web PWA icons (192/512).
apps/desktop build:   • electron-builder  version=26.15.3 os=10.0.26200
apps/desktop build:   • loaded configuration  file=package.json ("build" field)
packages/shared build: Done
apps/desktop build:   • executing @electron/rebuild  electronVersion=39.8.10 arch=x64 buildFromSource=false workspaceRoot=C:\Users\firer\genemap-discovery\apps\desktop projectDir=./ appDir=./
apps/desktop build:   • installing native dependencies  arch=x64
apps/desktop build:   • completed installing native dependencies
apps/desktop build:   • packaging       platform=win32 arch=x64 electron=39.8.10 appOutDir=dist-electron\win-unpacked
apps/desktop build:   ⨯ connect ECONNREFUSED 127.0.0.1:9  failedTask=build stackTrace=RequestError: connect ECONNREFUSED 127.0.0.1:9
apps/desktop build:     at ClientRequest.<anonymous> (C:\Users\firer
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (signature)

Read the full log at C:\Users\firer\.flexfactor\runs\genemap-discovery-20260824-050548-082562-16164\baseline-publication-failure.log. Publication (push/merge) stays refused while the baseline is red; the review still runs.

### 4. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - {'error': {'message': 'Provider returned error', 'code': 503, 'metadata': {'raw': '{"error":{"message":"The model `openrouter:LiquidAI/LFM2.5-2.6B:free` is currently unavailable for real-time inference.","type":"api_error","param":null,"code":null}}', 'provider_name': 'Liquid', 'is_byok': False}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 5. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': 429, 'metadata': {'raw': 'z-ai/glm-5.2:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations', 'provider_name': 'Decart', 'is_byok': False, 'provider_error_code': 'upstream_429', 'limit_source': 'upstream_provider_shared_pool', 'remedy_hint': 'Retry shortly, add your own provider key (https://openrouter.ai/settings/integrations), or route to another provider with provider routing: https://openrouter.ai/docs/features/provider-routing', 'retry_after_seconds': 5, 'retry_after_seconds_raw': 5, 'headers': {'Retry-After': '5'}}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/z-ai/glm-5.2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 6. rotation — provider

**Error**

```
JSONDecodeError: Expecting value: line 1 column 1 (char 0)
```

**Responsible code**

- FlexFactor `flexfactor.py:2563` in `structured()`

```python
data = json.loads(text)
```
- Route: `openrouter/poolside/laguna-s-2.1:free`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 7. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - {'error': {'message': 'Provider returned error', 'code': 503, 'metadata': {'raw': '{"error":{"message":"The model `openrouter:LiquidAI/LFM2.5-2.6B:free` is currently unavailable for real-time inference.","type":"api_error","param":null,"code":null}}', 'provider_name': 'Liquid', 'is_byok': False}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 8. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': 429, 'metadata': {'raw': 'z-ai/glm-5.2:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations', 'provider_name': 'Decart', 'is_byok': False, 'provider_error_code': 'upstream_429', 'limit_source': 'upstream_provider_shared_pool', 'remedy_hint': 'Retry shortly, add your own provider key (https://openrouter.ai/settings/integrations), or route to another provider with provider routing: https://openrouter.ai/docs/features/provider-routing', 'retry_after_seconds': 5, 'retry_after_seconds_raw': 5, 'headers': {'Retry-After': '5'}}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/z-ai/glm-5.2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 9. rotation — provider

**Error**

```
JSONDecodeError: Expecting value: line 1 column 134 (char 133)
```

**Responsible code**

- FlexFactor `flexfactor.py:2563` in `structured()`

```python
data = json.loads(text)
```
- Route: `openrouter/poolside/laguna-s-2.1:free`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 10. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', 'status': 'UNAVAILABLE'}}]
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `gemini/gemma-4-26b-a4b-it`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 11. rotation — flexfactor-defect

**Error**

```
OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate in one response); raise max_tokens for this call.
```

**Responsible code**

- FlexFactor `flexfactor.py:2559` in `structured()`

```python
raise OutputBudgetError(
```
- Route: `openrouter/cohere/north-mini-code:free`

**Suggested fix** (signature)

The model's output was cut off by the budget. FlexFactor shrinks the unit of work and retries; if the file still cannot be regenerated, it is recorded as oversized for that model.

### 12. rotation — flexfactor-defect

**Error**

```
OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate in one response); raise max_tokens for this call.
```

**Responsible code**

- FlexFactor `flexfactor.py:2559` in `structured()`

```python
raise OutputBudgetError(
```
- Route: `openrouter/nvidia/nemotron-3.5-lightning:free`

**Suggested fix** (signature)

The model's output was cut off by the budget. FlexFactor shrinks the unit of work and retries; if the file still cannot be regenerated, it is recorded as oversized for that model.

### 13. rotation — provider

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

### 14. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 15. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-small:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling-small:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 16. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Provider returned error', 'code': 429, 'metadata': {'raw': 'minimax/minimax-m3:free is temporarily rate-limited upstream. Please retry shortly, or add your own key to accumulate your rate limits: https://openrouter.ai/settings/integrations', 'provider_name': 'GMICloud', 'is_byok': False, 'provider_error_code': 'rate_limit_exceeded', 'limit_source': 'upstream_provider_shared_pool', 'remedy_hint': 'Retry shortly, add your own provider key (https://openrouter.ai/settings/integrations), or route to another provider with provider routing: https://openrouter.ai/docs/features/provider-routing', 'retry_after_seconds': 60, 'retry_after_seconds_raw': 60, 'headers': {'Retry-After': '60'}}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/minimax/minimax-m3:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 17. rotation — flexfactor-defect

**Error**

```
OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate in one response); raise max_tokens for this call.
```

**Responsible code**

- FlexFactor `flexfactor.py:2559` in `structured()`

```python
raise OutputBudgetError(
```
- Route: `openrouter/cohere/north-mini-code:free`

**Suggested fix** (signature)

The model's output was cut off by the budget. FlexFactor shrinks the unit of work and retries; if the file still cannot be regenerated, it is recorded as oversized for that model.

### 18. rotation — flexfactor-defect

**Error**

```
OutputBudgetError: Model output hit the 16000-token budget (file too large to regenerate in one response); raise max_tokens for this call.
```

**Responsible code**

- FlexFactor `flexfactor.py:2559` in `structured()`

```python
raise OutputBudgetError(
```
- Route: `openrouter/nvidia/nemotron-3.5-lightning:free`

**Suggested fix** (signature)

The model's output was cut off by the budget. FlexFactor shrinks the unit of work and retries; if the file still cannot be regenerated, it is recorded as oversized for that model.

### 19. rotation — provider

**Error**

```
RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expected one of ['reviews']); len=351 head='{"findings": [], "summary": "Both files (apps/web/pages/SuperAdminSetup.jsx and ops/closure-ledger/server.mjs) are clean with no reproducible defects. The SuperAdminSetup page follows proper validatio'
```

**Responsible code**

- FlexFactor `flexfactor.py:3048` in `_check_structured_type()`

```python
raise RuntimeError(
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 20. rotation — provider

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

### 21. rotation — provider

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

### 22. rotation — provider

**Error**

```
InternalServerError: Error code: 500 - {'error': {'message': 'EngineCore encountered an issue. See stack trace (above) for the root cause.', 'type': 'Internal Server Error', 'param': None, 'code': 500}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-nano-12b-v2-vl`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 23. rotation — provider

**Error**

```
APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type': 'invalid_request_error', 'code': 'request_too_large'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound-mini`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 24. rotation — provider

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

### 25. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 13385, Requested 17079. Please try again in 928ms. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 26. fix — budget

**Error**

```
no strong route available (131 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide))
```

**Responsible code**

- Program file: `apps/web/components/research/ProjectManager.jsx`

**Suggested fix** (signature)

The pool's allowance is spent. The rotator benches it until reset; check AI Time for the reset time. Do not add paid keys to compensate.

### 27. baseline-gate — program-defect

**Error**

```
review made no progress: three consecutive semantic review batches completed ZERO files (4 of 377 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (none)

no known fix; start from the responsible code above (model suggester failed: no light route available (131 enabled routes in catalog). Pools skipped: gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)))