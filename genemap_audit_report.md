# FlexFactor audit — GeneMap

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 0 of 375 candidate(s)
- **FILE ACCOUNTING: 375 candidate(s) = 0 reviewed + 343 never_attempted + 24 review_incomplete + 8 skipped_known_clean**
- **ZERO WORK: not one of 375 candidate file(s) was reviewed. This run did nothing; treat it as a FAILURE, not a clean repo.**
- **Defects found:** 4
- **Files fixed:** 0
- **Errors recorded:** 28 (see the Errors section below; ledger at `C:\Users\firer\.flexfactor\runs\genemap-20260827-011439-176807-19352\errors.md`)
- **Baseline build:** FAILED
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:writer/palmyra-creative-122b
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**975 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 62 |
| configuration-documentation-or-data | 275 |
| first-party-source | 627 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-20260827-011439-176807-19352`
- **Exact final commit:** `aa6e0ddb306726678d70879fd6ad728fd77009b8`
- **Code map:** 556 file(s), 1258 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1069 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 1/1 (complete)
- **Blast radius:** 1 affected file(s); analysis ran
- **Normalized gates:** 3 pass, 4 fail, 2 blocked

- **Blast Radius:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\blast-radius.json`
- **Changed File Rescan:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\changed-file-rescan.json`
- **Code Index:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\code-index.json`
- **Coverage Ledger:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\coverage-ledger.json`
- **Manifest:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\manifest.json`
- **Purpose Graph:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\purpose-graph.json`
- **Quality Gates:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\quality-gates.json`
- **Sarif:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-20260827-011439-176807-19352\results.sarif`

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
  - `idea:Genepool` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for Genepool
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 1 (rejected 4 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 5 candidate(s)
  - NOT bridged (4): DNA.Land Compass, Geneious-Prime-molecular/.github, Genepool, OpenSNP - idea rejected by the purpose contract
  - NOT bridged (1): Biopython - not bridgeable (evidence=verified, reuse_mode=reference-only)

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [Biopython](https://github.com/biopython/biopython) | oss | `NOASSERTION` | `reference-only` | acceptance #deterministic benchmarks | ACCEPT | NOT entered - not bridgeable (evidence=verified, reuse_mode=reference-only) | Benchmarking workflow for genomic data reproducibility |
| [OpenSNP](https://github.com/openSNP/snpr) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | Integrated variant browser and annotation viewer |
| [Geneious-Prime-molecular/.github](https://github.com/Geneious-Prime-molecular/.github) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | Interactive Phylogenetic Tree Builder |
| [Genepool](https://www.genepool.app/) | market | `UNKNOWN` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [DNA.Land Compass](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5870659/) | market | `UNKNOWN` | `clean-room-from-documented-behavior` | acceptance #6 | reject | NOT entered - idea rejected by the purpose contract | Client-side secure navigation of personal genetic data |

### Biopython

- **Evidence:** <https://github.com/biopython/biopython>
- **Licence:** `NOASSERTION` (via github-api)
- **Reuse mode:** `reference-only` - licence NOASSERTION could not be verified; record the capability as a reference and copy nothing
- **Idea:** Benchmarking workflow for genomic data reproducibility - Provides deterministic benchmarking pipelines with versioned reference datasets, reproducible output hashes, and automated reporting to verify analytical consistency across runs.
- **Value here:** Enables the program to satisfy acceptance criterion 4 (deterministic benchmarks) and criterion 7 (exact deployed SHA and real research journey) by proving analytical output is reproducible and traceable to a specific commit and dataset version.
- **Purpose / criterion mapping:** acceptance #deterministic benchmarks - Directly advances the program's authored purpose of being an education and early-research platform where provenance and reproducibility are essential for lessons and candidate-gene exploration. It does not enable diagnosis, clinical decision support, or any prohibited function.
- **Purpose verdict:** ACCEPTED - Directly advances the program's authored purpose of being an education and early-research platform where provenance and reproducibility are essential for lessons and candidate-gene exploration. It does not enable diagnosis, clinical decision support, or any prohibited function.
- **Fix-stream decision:** DID NOT enter the fix stream - not bridgeable (evidence=verified, reuse_mode=reference-only)
- **Evidence basis:** Competitor repository contains benchmarking scripts and versioned test data; Biopython's CI includes reproducible genomic analysis pipelines that produce consistent output across environments. (confidence medium)

### OpenSNP

- **Evidence:** <https://github.com/openSNP/snpr>
- **Licence:** `MIT` (via github-api)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** Integrated variant browser and annotation viewer - OpenSNP's snpr interface allows users to upload VCF files, visualize genomic variants in a browser, and view detailed annotations. This includes filtering options (e.g., by allele frequency, quality, and population-specific databases) and the ability to click on variants to see detailed information such as clinical significance and source publications.
- **Value here:** The audited program (GeneMap) currently lacks a direct interface for uploading and analyzing personal genomic data (VCF files). Adopting a similar variant browser would bridge the gap between theoretical genetic education and practical data analysis, allowing users to see how the concepts they are learning apply to their own genetic makeup.
- **Purpose / criterion mapping:** purpose-only - While a variant browser is a useful tool for many bioinformaticians, it does not align with GeneMap's current purpose contract. GeneMap is explicitly defined as an 'educational platform' that does 'not accept personal medical records or VCF uploads' and provides 'no diagnosis or personal risk guidance'. Adding this feature would fundamentally change the nature of the product from an educational resource to a data analysis service, which contradicts the stated acceptance criteria and project brief.
- **Purpose verdict:** REJECTED - While a variant browser is a useful tool for many bioinformaticians, it does not align with GeneMap's current purpose contract. GeneMap is explicitly defined as an 'educational platform' that does 'not accept personal medical records or VCF uploads' and provides 'no diagnosis or personal risk guidance'. Adding this feature would fundamentally change the nature of the product from an educational resource to a data analysis service, which contradicts the stated acceptance criteria and project brief.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** The description from OpenSNP's GitHub repository clearly states that the project allows for 'VCF file upload' and provides an 'annotation viewer' with 'filtering options' and 'detailed information' on variants. The screenshot in the repository also visually demonstrates a data table specific to genomic variants. (confidence high)

### Geneious-Prime-molecular/.github

- **Evidence:** <https://github.com/Geneious-Prime-molecular/.github>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Interactive Phylogenetic Tree Builder - Constructs and visualizes evolutionary trees from DNA/protein sequence data
- **Value here:** Would let users view evolutionary relationships in lessons or research explorations, enhancing biology education
- **Purpose / criterion mapping:** purpose-only - Adding phylogenetic tree generation does not move GeneMap toward its core purpose of separating AI candidate leads from verified evidence, providing provenance-aware gene exploration, and serving as an educational platform without clinical or diagnostic functionality. It merely adds a generic lab-analysis feature not required for the stated acceptance criteria.
- **Purpose verdict:** REJECTED - Adding phylogenetic tree generation does not move GeneMap toward its core purpose of separating AI candidate leads from verified evidence, providing provenance-aware gene exploration, and serving as an educational platform without clinical or diagnostic functionality. It merely adds a generic lab-analysis feature not required for the stated acceptance criteria.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** Competitor description lists "Phylogenetic tree building" as a feature (confidence medium)

### Genepool

- **Evidence:** <https://www.genepool.app/>, <https://www.genome.gov/genetics-glossary/Gene-Pool>, <https://perspectives.nsgc.org/Article/genepool-a-discord-channel-for-genetic-counselors-across-career-stages>, <https://github.com/iskandr/genepool>
- **Licence:** `UNKNOWN` (via none (no repository could be attributed to this competitor))
- **Reuse mode:** `clean-room-from-documented-behavior` - no inspectable source (licence UNKNOWN); only publicly documented behaviour may inform our own independent design
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: every strong pool failed this call; last error was NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '00bdd0a7-e38f-4423-9007-c4d8730a3f78': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: every strong pool failed this call; last error was NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '00bdd0a7-e38f-4423-9007-c4d8730a3f78': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### DNA.Land Compass

- **Evidence:** <https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5870659/>, <https://www.ngsgenealogy.org/genealogy-courses/>, <https://isogg.org/wiki/DNA.Land>, <https://github.com/TeamErlich/dna-land-compass>
- **Licence:** `UNKNOWN` (via none (no repository could be attributed to this competitor))
- **Reuse mode:** `clean-room-from-documented-behavior` - no inspectable source (licence UNKNOWN); only publicly documented behaviour may inform our own independent design
- **Idea:** Client-side secure navigation of personal genetic data - Enables users to upload and explore their own genetic data locally in the browser without transmitting it to a server, preserving privacy while allowing personalized exploration.
- **Value here:** Would allow GeneMap to offer personalized, hands-on exploration of genetic variants in an educational context, increasing engagement and learning efficacy by connecting abstract concepts to users' own data.
- **Purpose / criterion mapping:** acceptance #6 - Adopting this would violate acceptance criterion #6: the program must not provide personal risk, diagnosis, or any form of personal genetic guidance. Even educational use of personal data risks conflating learning with self-diagnosis or risk assessment, which is explicitly prohibited.
- **Purpose verdict:** REJECTED - Adopting this would violate acceptance criterion #6: the program must not provide personal risk, diagnosis, or any form of personal genetic guidance. Even educational use of personal data risks conflating learning with self-diagnosis or risk assessment, which is explicitly prohibited.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** Competitor evidence from NCBI PMC article describing DNA.Land Compass as a 'secure, client-side site for navigating personal genetic data'. (confidence medium)

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
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment incomplete: 1/3 sample(s) usable; BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message. Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}; RotationError: every light pool failed this call; last error was NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'ee47df99-c92b-4dc9-b3a7-f3fb0f087b73': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}; final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

## Defects by file

_No defects found in the reviewed files._

## Fix notes / left unfixed

- scripts/verify-production-launch.mjs: no verified candidate was produced
- scripts/verify-production-launch.mjs: TIMED OUT after 15m of fix attempts - rolled back and re-queued (raise FLEXFACTOR_FIX_FILE_MAX_SECONDS to allow longer)
- scripts/verify-production-launch.mjs: no verified candidate was produced
- publication failure made no progress and did not name another repairable source file
- baseline publication suite is red and bounded repair did not fix it; review continued, publication stays blocked
- review made no progress: three consecutive semantic review batches completed ZERO files (0 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
- rollback failed; working tree requires inspection


## Errors (28)

| # | phase | kind | error | responsible |
|---|---|---|---|---|
| 1 | fix | program-defect | flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near l | scripts/verify-production-launch.mjs |
| 2 | baseline | program-defect | baseline publication suite is RED and bounded targeted repair did not fix it | - |
| 3 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 4 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one me | flexfactor.py:2412 |
| 5 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 6 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': "This model's maximum context len | flexfactor.py:2412 |
| 7 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 8 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 9 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 10 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 11 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 12 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 13 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 14 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 15 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 16 | rotation | provider | TimeoutError: timed out | flexfactor.py:2755 |
| 17 | rotation | provider | APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type' | flexfactor.py:2412 |
| 18 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 19 | rotation | provider | InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is  | flexfactor.py:2412 |
| 20 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the  | flexfactor.py:2412 |
| 21 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 22 | rotation | provider | InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is  | flexfactor.py:2412 |
| 23 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2412 |
| 24 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 25 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 26 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 27 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2412 |
| 28 | baseline-gate | program-defect | review made no progress: three consecutive semantic review batches completed ZERO files (0 | - |

Counts by kind: program-defect 3, provider 25

### 1. fix — program-defect

**Error**

```
flexfactor_egress_blocked: payload contains ['cloud_token', 'password_assignment'] (near line(s) [434, 435]); refusing to send to a cloud model. Re-run with --redact to mask and send, --allow-sensitive to send anyway, or allow categories via FLEXFACTOR_ALLOW_EGRESS / ~/.flexfactor/policy.json {"allow_egress": [...]}.
```

**Responsible code**

- Program file: `scripts/verify-production-launch.mjs`

**Suggested fix** (signature)

The egress gate found a secret/PII pattern in repo-derived text and refused to send it to a cloud model. Remove the secret from the repo (or use --redact / FLEXFACTOR_ALLOW_EGRESS for a known-safe fixture).

### 2. baseline — program-defect

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

Read the full log at C:\Users\firer\.flexfactor\runs\genemap-20260827-011439-176807-19352\baseline-publication-failure.log. Publication (push/merge) stays refused while the baseline is red; the review still runs.

### 3. rotation — provider

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

### 4. rotation — provider

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
- Route: `ollama/qwen2.5-coder:7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 6. rotation — provider

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

### 7. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19966, Requested 23798. Please try again in 27.528s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 8. rotation — provider

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

### 9. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/phi4-mini:latest`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 10. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '8378ffb2-51b0-4140-9684-dda1889373e6': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/zyphra/zamba2-7b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 11. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19961, Requested 23798. Please try again in 27.518s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 12. rotation — provider

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
- Route: `ollama/gemma4:26b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 14. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19791, Requested 23798. Please try again in 27.178s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 15. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '02f84bf4-c1a1-489b-a9de-ac3e8dcdec14': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/aisingapore/sea-lion-7b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 16. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2755` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/gemma4:e4b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 17. rotation — provider

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

### 18. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '3d6c2ff8-8bfc-4d10-8fd0-b7337288e869': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/databricks/dbrx-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 19. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', 'status': 'UNAVAILABLE'}}]
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `gemini/gemini-3.1-flash-lite`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 20. rotation — provider

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

### 21. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'e503b15c-62b0-4d69-b532-a88f0bfa2656': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/deepseek-ai/deepseek-coder-6.7b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 22. rotation — provider

**Error**

```
InternalServerError: Error code: 503 - [{'error': {'code': 503, 'message': 'This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.', 'status': 'UNAVAILABLE'}}]
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `gemini/gemini-3.1-flash-lite-preview`

**Suggested fix** (signature)

Provider overloaded. Rotation already moves to the next pool; no change needed.

### 23. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 19966, Requested 23798. Please try again in 27.528s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 24. rotation — provider

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

### 25. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '04174188-f742-4069-9e72-d77c2b77d3cb': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/google/gemma-2b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 26. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'ee47df99-c92b-4dc9-b3a7-f3fb0f087b73': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2412` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/google/gemma-3-12b-it`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 27. rotation — provider

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

### 28. baseline-gate — program-defect

**Error**

```
review made no progress: three consecutive semantic review batches completed ZERO files (0 of 375 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (none)

no known fix; start from the responsible code above (model suggester failed: no light route available (120 enabled routes in catalog). Pools skipped: gemini:free-tier (gemini:free-tier allowance exhausted (account-wide)); groq:free-tier (pool cooling down); local:ollama (pool cooling down); nvidia_nim:free-tier (pool cooling down); openrouter:credits (openrouter:free-tier allowance exhausted (account-wide)); openrouter:free:cohere/north-mini-code:free (openrouter:free-tier allowance exhausted (account-wide)))