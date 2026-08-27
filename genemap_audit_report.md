# FlexFactor audit — GeneMap

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 0 of 375 candidate(s)
- **FILE ACCOUNTING: 375 candidate(s) = 0 reviewed + 343 never_attempted + 24 review_incomplete + 8 skipped_known_clean**
- **ZERO WORK: not one of 375 candidate file(s) was reviewed. This run did nothing; treat it as a FAILURE, not a clean repo.**
- **Defects found:** 4
- **Files fixed:** 0
- **Errors recorded:** 16 (see the Errors section below; ledger at `C:\Users\firer\.flexfactor\runs\genemap-20260827-063117-197878-19256\errors.md`)
- **Baseline build:** FAILED
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:openai/gpt-oss-120b
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

- **Evidence run:** `genemap-20260827-063117-197878-19256`
- **Exact final commit:** `ce86cd8577e98f6f125fa89c2e3f50edbabe597e`
- **Code map:** 558 file(s), 1258 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1069 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 0/0 (complete)
- **Blast radius:** 0 affected file(s); analysis ran
- **Normalized gates:** 3 pass, 4 fail, 2 blocked

- **Blast Radius:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\blast-radius.json`
- **Changed File Rescan:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\changed-file-rescan.json`
- **Code Index:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\code-index.json`
- **Coverage Ledger:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\coverage-ledger.json`
- **Manifest:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\manifest.json`
- **Purpose Graph:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\purpose-graph.json`
- **Quality Gates:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\quality-gates.json`
- **Sarif:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-063117-197878-19256\results.sarif`

## Production readiness

**NOT PRODUCTION READY** — 11/14 evaluated gates passed, 3 blocker(s).

Full scorecard: `C:\Users\firer\genemap-discovery\genemap_readiness.md`

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
  - `idea:OSGA-OPAR/quant-genetics-webinars` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for OSGA-OPAR/quant-genetics-webinars
  - `idea:Zoe-Hou/OMIM-Spider` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for Zoe-Hou/OMIM-Spider
  - `idea:cBioPortal` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for cBioPortal
  - `idea:davetang/romim` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for davetang/romim
  - `idea:rat-genome-database/omim-annotation-pipeline` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for rat-genome-database/omim-annotation-pipeline
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 0 (rejected 5 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 5 candidate(s)
  - NOT bridged (5): OSGA-OPAR/quant-genetics-webinars, Zoe-Hou/OMIM-Spider, cBioPortal, davetang/romim, rat-genome-database/omim-annotation-pipeline - idea rejected by the purpose contract

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [cBioPortal](https://github.com/cBioPortal/cbioportal) | oss | `AGPL-3.0` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [OSGA-OPAR/quant-genetics-webinars](https://github.com/OSGA-OPAR/quant-genetics-webinars) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [davetang/romim](https://github.com/davetang/romim) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [Zoe-Hou/OMIM-Spider](https://github.com/Zoe-Hou/OMIM-Spider) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [rat-genome-database/omim-annotation-pipeline](https://github.com/rat-genome-database/omim-annotation-pipeline) | oss | `GPL-3.0` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |

### cBioPortal

- **Evidence:** <https://github.com/cBioPortal/cbioportal>, <https://github.com/cBioPortal/datahub>
- **Licence:** `AGPL-3.0` (via github-api)
- **Reuse mode:** `clean-room-from-documented-behavior` - licence AGPL-3.0 is copyleft/restricted; source must NOT be copied - work from documented behaviour only
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### OSGA-OPAR/quant-genetics-webinars

- **Evidence:** <https://github.com/OSGA-OPAR/quant-genetics-webinars>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### davetang/romim

- **Evidence:** <https://github.com/davetang/romim>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### Zoe-Hou/OMIM-Spider

- **Evidence:** <https://github.com/Zoe-Hou/OMIM-Spider>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### rat-genome-database/omim-annotation-pipeline

- **Evidence:** <https://github.com/rat-genome-database/omim-annotation-pipeline>
- **Licence:** `GPL-3.0` (via repo-rewards)
- **Reuse mode:** `clean-room-from-documented-behavior` - licence GPL-3.0 is copyleft/restricted; source must NOT be copied - work from documented behaviour only
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: no strong route available (110 enabled routes in catalog). Pools skipped: cerebras:free-tier (pool cooling down); gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide))
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

### high (1)
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment incomplete: 1/3 sample(s) usable; BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message. Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}; RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expected one of ['purpose', 'fulfillment_pct', 'gaps']); len=1155 head='{"type": "object", "properties": {"purpose": {"type": "string", "description": "One-paragraph statement of what the program exists to do."}, "fulfillment_pct": {"type": "integer", "description": "0-10'; final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

## Defects by file

_No defects found in the reviewed files._

## Fix notes / left unfixed

- scripts/verify-production-launch.mjs: no verified candidate was produced
- scripts/verify-production-launch.mjs: no verified candidate was produced
- publication failure made no progress and did not name another repairable source file
- baseline publication suite is red and bounded repair did not fix it; review continued, publication stays blocked
- review made no progress: three consecutive semantic review batches completed ZERO files (0 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
- rollback failed; working tree requires inspection


## Errors (16)

| # | phase | kind | error | responsible |
|---|---|---|---|---|
| 1 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 2 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 3 | baseline | program-defect | baseline publication suite is RED and bounded targeted repair did not fix it | - |
| 4 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 5 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 6 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 7 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 8 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 9 | rotation | provider | InternalServerError: Error code: 503 - {'error': {'message': 'ResourceExhausted: Worker lo | flexfactor.py:2412 |
| 10 | rotation | environment | NotFoundError: Error code: 404 - {'error': {'message': 'Model not found', 'type': 'Not Fou | flexfactor.py:2412 |
| 11 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 12 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one me | flexfactor.py:2412 |
| 13 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': "This model's maximum co | flexfactor.py:2412 |
| 14 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': "This model's maximum context len | flexfactor.py:2412 |
| 15 | rotation | provider | RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expect | flexfactor.py:3048 |
| 16 | baseline-gate | program-defect | review made no progress: three consecutive semantic review batches completed ZERO files (0 | - |

Counts by kind: environment 1, program-defect 4, provider 11

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

Read the full log at C:\Users\firer\.flexfactor\runs\genemap-20260827-063117-197878-19256\baseline-publication-failure.log. Publication (push/merge) stays refused while the baseline is red; the review still runs.

### 4. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '39655fc1-9ebc-4b24-963e-6915ea6680de': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/mistralai/mixtral-8x22b-v0.1`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 5. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'f8c05193-d2e2-4f0f-bb4d-7ad70070002b': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nv-mistralai/mistral-nemo-12b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 6. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '23d4f03a-b8a6-4adb-a183-7daa083a09cc': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/moonshotai/kimi-k2.6`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 7. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'e199b43b-6c62-4a63-9379-f60e1a953236': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/cosmos-reason2-8b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 8. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '5aa06dd2-0a02-4a5d-be4c-bf88e956965d': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/mistral-nemo-minitron-8b-8k-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 9. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - {'error': {'message': 'ResourceExhausted: Worker local total request limit reached (16/16)', 'type': 'Service Unavailable', 'code': 503}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 10. rotation — environment

**Error**

```
NotFoundError: Error code: 404 - {'error': {'message': 'Model not found', 'type': 'Not Found', 'code': 404}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-nano-3-30b-a3b`

**Suggested fix** (signature)

The route names a model Ollama does not have. `ollama pull <tag>`, then refresh the catalog with `python -m aitime.catalog`.

### 11. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'f35337fa-b4dd-4996-bcba-5476ee01171d': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/riva-translate-4b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 12. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message. Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-parse`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 13. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'object': 'error', 'message': "This model's maximum context length is 8192 tokens. However, you requested 29374 tokens (21374 in the messages, 8000 in the completion). Please reduce the length of the messages or completion.", 'type': 'BadRequestError', 'param': None, 'code': 400}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/riva-translate-4b-instruct-v1.1`

**Suggested fix** (signature)

The route's output/context ceiling is below what was requested. FlexFactor learns the ceiling from this 400 and retries once; if it recurs, the prompt unit must shrink (fewer findings per call) or the route should be excluded for large files.

### 14. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'error': {'message': "This model's maximum context length is 8192 tokens. However, you requested 8000 output tokens and your prompt contains 78627 characters (more than 14592 characters, which is the upper bound for 192 input tokens). Please reduce the length of the input prompt or the number of requested output tokens. (parameter=input_text, value=78627)", 'type': 'BadRequestError', 'param': 'input_text', 'code': 400}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/riva-translate-4b-instruct-v2`

**Suggested fix** (signature)

The route's output/context ceiling is below what was requested. FlexFactor learns the ceiling from this 400 and retries once; if it recurs, the prompt unit must shrink (fewer findings per call) or the route should be excluded for large files.

### 15. rotation — provider

**Error**

```
RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expected one of ['purpose', 'fulfillment_pct', 'gaps']); len=1155 head='{"type": "object", "properties": {"purpose": {"type": "string", "description": "One-paragraph statement of what the program exists to do."}, "fulfillment_pct": {"type": "integer", "description": "0-10'
```

**Responsible code**

- FlexFactor `flexfactor.py:3048` in `_check_structured_type()`

```python
raise RuntimeError(
```
- Route: `nvidia_nim/poolside/laguna-xs-2.1`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 16. baseline-gate — program-defect

**Error**

```
review made no progress: three consecutive semantic review batches completed ZERO files (0 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (none)

no known fix; start from the responsible code above (model suggester failed: no light route available (110 enabled routes in catalog). Pools skipped: gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:dots-studio/dots-3-note-preview:free (openrouter:free-tier allowance exhausted (account-wide)))