# FlexFactor audit — genemap-discovery

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 0 of 368 candidate(s)
- **FILE ACCOUNTING: 368 candidate(s) = 0 reviewed + 339 never_attempted + 24 review_incomplete + 5 skipped_known_clean**
- **ZERO WORK: not one of 368 candidate file(s) was reviewed. This run did nothing; treat it as a FAILURE, not a clean repo.**
- **Defects found:** 1
- **Files fixed:** 0
- **Errors recorded:** 54 (see the Errors section below; ledger at `C:\Users\firer\.flexfactor\runs\genemap-discovery-20260824-005059-902569-21424\errors.md`)
- **Baseline build:** FAILED
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:groq/compound-mini
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**949 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 62 |
| configuration-documentation-or-data | 259 |
| first-party-source | 617 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-discovery-20260824-005059-902569-21424`
- **Exact final commit:** `93385bf4bc609f0672514e2051e7833236d4554f`
- **Code map:** 538 file(s), 1216 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1049 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 1/1 (complete)
- **Blast radius:** 1 affected file(s); analysis ran
- **Normalized gates:** 3 pass, 4 fail, 2 blocked

- **Blast Radius:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\blast-radius.json`
- **Changed File Rescan:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\changed-file-rescan.json`
- **Code Index:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\code-index.json`
- **Coverage Ledger:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\coverage-ledger.json`
- **Manifest:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\manifest.json`
- **Purpose Graph:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\purpose-graph.json`
- **Quality Gates:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\quality-gates.json`
- **Sarif:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260824-005059-902569-21424\results.sarif`

## Competitor research

**Coverage:** ONLY 4 of the target 5 competitors could be corroborated from a reachable source. This is a coverage SHORTFALL, not evidence that fewer competitors exist.

- **Sources used:** web:duckduckgo, repo-rewards
- **Repo Rewards endpoint:** `https://web-production-d7db7.up.railway.app`
- **Sources SKIPPED (named, not silent):**
  - `idea:DNAdigestOrg/datadiscovery` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for DNAdigestOrg/datadiscovery
  - `idea:alternatives` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for alternatives
  - `idea:jrderuiter/genemap` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for jrderuiter/genemap
  - `idea:match` - model returned an incomplete idea (missing why_valuable) - forced to accept=False for match
  - `model-discovery` - BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 0 (rejected 4 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 4 candidate(s)
  - NOT bridged (4): DNAdigestOrg/datadiscovery, alternatives, jrderuiter/genemap, match - idea rejected by the purpose contract

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [DNAdigestOrg/datadiscovery](https://github.com/DNAdigestOrg/datadiscovery) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [jrderuiter/genemap](https://github.com/jrderuiter/genemap) | oss | `MIT` | `direct-code-reuse` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [alternatives](https://sourceforge.nethttps://sourceforge.net/p/alternatives/) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |
| [match](https://sourceforge.nethttps://sourceforge.net/p/match/) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | (idea extraction failed) |

### DNAdigestOrg/datadiscovery

- **Evidence:** <https://github.com/DNAdigestOrg/datadiscovery>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\AppData\Roaming\npm\codex.CMD: exited 1: hook: UserPromptSubmit
hook: UserPromptSubmit Completed
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}

- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\AppData\Roaming\npm\codex.CMD: exited 1: hook: UserPromptSubmit
hook: UserPromptSubmit Completed
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}

- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### jrderuiter/genemap

- **Evidence:** <https://github.com/jrderuiter/genemap>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\AppData\Roaming\npm\codex.CMD: exited 1: hook: UserPromptSubmit
hook: UserPromptSubmit Completed
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}

- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\AppData\Roaming\npm\codex.CMD: exited 1: hook: UserPromptSubmit
hook: UserPromptSubmit Completed
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-5.6-sol' model is not supported when using Codex with a ChatGPT account."}}

- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### alternatives

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/alternatives/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\.local\bin\claude.EXE: exceeded 600s and was killed
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\.local\bin\claude.EXE: exceeded 600s and was killed
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:**  (confidence ?)

### match

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/match/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** (idea extraction failed) - 
- **Value here:** 
- **Purpose / criterion mapping:** purpose-only - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\.local\bin\claude.EXE: exceeded 600s and was killed
- **Purpose verdict:** REJECTED - NOT ACTED ON: model returned an incomplete idea (missing why_valuable) - forced to accept=False. not judged: C:\Users\firer\.local\bin\claude.EXE: exceeded 600s and was killed
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

## Remaining defects NOT auto-fixed (fix floor = high)

_These were found but left as-is - review and decide. Critical/high here means a file that could not be safely auto-fixed (see manual-review list)._

### high (1)
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment incomplete: 1/3 sample(s) usable; RotationError: every light pool failed this call; last error was RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}; BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}; final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

## Defects by file

_No defects found in the reviewed files._

## Fix notes / left unfixed

- publication failure made no progress and did not name another repairable source file
- baseline publication suite is red and bounded repair did not fix it; review continued, publication stays blocked
- review made no progress: three consecutive semantic review batches completed ZERO files (0 of 368 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
- tree NOT rolled back: --allow-dirty means uncommitted content here may be the owner's, not this run's


## Errors (54)

| # | phase | kind | error | responsible |
|---|---|---|---|---|
| 1 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one me | flexfactor.py:2411 |
| 2 | rotation | provider | APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type' | flexfactor.py:2411 |
| 3 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-s | flexfactor.py:2411 |
| 4 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:f | flexfactor.py:2411 |
| 5 | rotation | provider | TimeoutError: timed out | flexfactor.py:2701 |
| 6 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-s | flexfactor.py:2411 |
| 7 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:f | flexfactor.py:2411 |
| 8 | rotation | provider | BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the  | flexfactor.py:2411 |
| 9 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 10 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 11 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 12 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 13 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 14 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 15 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 16 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 17 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 18 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 19 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 20 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one me | flexfactor.py:2411 |
| 21 | rotation | provider | APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type' | flexfactor.py:2411 |
| 22 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 23 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 24 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 25 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 26 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 27 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 28 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 29 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 30 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 31 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 32 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-s | flexfactor.py:2411 |
| 33 | rotation | provider | RateLimitError: Error code: 429 - [{'error': {'code': 429, 'message': 'You exceeded your c | flexfactor.py:2411 |
| 34 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 35 | rotation | provider | PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:f | flexfactor.py:2411 |
| 36 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `met | flexfactor.py:2411 |
| 37 | rotation | provider | BadRequestError: Error code: 400 - {'error': "This model's maximum context length is 4096  | flexfactor.py:2411 |
| 38 | rotation | provider | RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expect | flexfactor.py:2987 |
| 39 | rotation | environment | NotFoundError: Error code: 404 - {'error': {'message': 'Model not found', 'type': 'Not Fou | flexfactor.py:2411 |
| 40 | rotation | provider | BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one me | flexfactor.py:2411 |
| 41 | rotation | provider | NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function | flexfactor.py:2411 |
| 42 | rotation | provider | RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expect | flexfactor.py:2987 |
| 43 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 44 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 45 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 46 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 47 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 48 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 49 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 50 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 51 | rotation | provider | RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models- | flexfactor.py:2411 |
| 52 | rotation | provider | TimeoutError: timed out | flexfactor.py:2701 |
| 53 | rotation | provider | TimeoutError: timed out | flexfactor.py:2701 |
| 54 | baseline-gate | program-defect | review made no progress: three consecutive semantic review batches completed ZERO files (0 | - |

Counts by kind: environment 1, program-defect 1, provider 52

### 1. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemoretriever-parse`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 2. rotation — provider

**Error**

```
APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type': 'invalid_request_error', 'code': 'request_too_large'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound-mini`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 3. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-small:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling-small:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 4. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 5. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2701` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/qwen2.5-coder:7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 6. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-small:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling-small:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 7. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 8. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'error': {'message': 'Please reduce the length of the messages or completion.', 'type': 'invalid_request_error', 'param': 'messages'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/allam-2-7b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 9. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/cohere/north-mini-code:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 10. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/poolside/laguna-s-2.1:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 11. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3.5-lightning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 12. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/dots-studio/dots-3-note-preview:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 13. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-30b-a3b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 14. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 15. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-12b-v2-vl:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 16. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 17. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-9b-v2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 18. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/poolside/laguna-xs-2.1:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 19. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/z-ai/glm-5.2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 20. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemoretriever-parse`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 21. rotation — provider

**Error**

```
APIStatusError: Error code: 413 - {'error': {'message': 'Request Entity Too Large', 'type': 'invalid_request_error', 'code': 'request_too_large'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 22. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/poolside/laguna-s-2.1:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 23. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3.5-lightning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 24. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/dots-studio/dots-3-note-preview:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 25. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-30b-a3b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 26. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 27. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-12b-v2-vl:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 28. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 29. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-9b-v2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 30. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/poolside/laguna-xs-2.1:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 31. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/z-ai/glm-5.2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 32. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling-small:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling-small:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 33. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - [{'error': {'code': 429, 'message': 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro\n* Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_input_token_count, limit: 0, model: gemini-3.1-pro\nPlease retry in 57.265388155s.', 'status': 'RESOURCE_EXHAUSTED', 'details': [{'@type': 'type.googleapis.com/google.rpc.Help', 'links': [{'description': 'Learn more about Gemini API quotas', 'url': 'https://ai.google.dev/gemini-api/docs/rate-limits'}]}, {'@type': 'type.googleapis.com/google.rpc.QuotaFailure', 'violations': [{'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_requests', 'quotaId': 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', 'quotaDimensions': {'model': 'gemini-3.1-pro', 'location': 'global'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_requests', 'quotaId': 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier', 'quotaDimensions': {'model': 'gemini-3.1-pro', 'location': 'global'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count', 'quotaId': 'GenerateContentInputTokensPerModelPerMinute-FreeTier', 'quotaDimensions': {'location': 'global', 'model': 'gemini-3.1-pro'}}, {'quotaMetric': 'generativelanguage.googleapis.com/generate_content_free_tier_input_token_count', 'quotaId': 'GenerateContent
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `gemini/gemini-3.1-pro-preview-customtools`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 34. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/cohere/north-mini-code:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 35. rotation — provider

**Error**

```
PermissionDeniedError: Error code: 403 - {'error': {'message': 'thinkingmachines/inkling:free is only available on agentic harnesses. Try plugging it into a coding agent or productivity app listed on https://openrouter.ai/apps', 'code': 403}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/thinkingmachines/inkling:free`

**Suggested fix** (signature)

This route is gated or not permitted for the key in use. Rotation skips it after strikes; to stop retrying it, exclude it (FLEXFACTOR_ROTATION_EXCLUDE=<fragment>) or have AI Time's catalog mark it disabled.

### 36. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit reached for model `meta-llama/llama-4-scout-17b-16e-instruct` in organization `org_01kxhxdkh3e7nasshjpfbkzh11` service tier `on_demand` on tokens per minute (TPM): Limit 30000, Used 14339, Requested 18006. Please try again in 4.689999999s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing', 'type': 'compound', 'code': 'rate_limit_exceeded'}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `groq/groq/compound`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 37. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'error': "This model's maximum context length is 4096 tokens. However, you requested 34628 tokens (18628 in the messages, 16000 in the completion). Please reduce the length of the messages or completion."}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-mini-4b-instruct`

**Suggested fix** (signature)

The route's output/context ceiling is below what was requested. FlexFactor learns the ceiling from this 400 and retries once; if it recurs, the prompt unit must shrink (fewer findings per call) or the route should be excluded for large files.

### 38. rotation — provider

**Error**

```
RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expected one of ['reviews']); len=2902 head='{"findings": [\n    {\n        "line": 142,\n        "severity": "medium",\n        "category": "correctness",\n        "title": "Incomplete error handling in publication artifact validation",\n        "pro'
```

**Responsible code**

- FlexFactor `flexfactor.py:2987` in `_check_structured_type()`

```python
raise RuntimeError(
```
- Route: `nvidia_nim/nvidia/nemotron-nano-12b-v2-vl`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 39. rotation — environment

**Error**

```
NotFoundError: Error code: 404 - {'error': {'message': 'Model not found', 'type': 'Not Found', 'code': 404}}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-nano-3-30b-a3b`

**Suggested fix** (signature)

The route names a model Ollama does not have. `ollama pull <tag>`, then refresh the catalog with `python -m aitime.catalog`.

### 40. rotation — provider

**Error**

```
BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Expected exactly one message. Expected exactly one message.', 'type': 'BadRequestError', 'param': None, 'code': 400}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/nemotron-parse`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 41. rotation — provider

**Error**

```
NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'f35337fa-b4dd-4996-bcba-5476ee01171d': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `nvidia_nim/nvidia/riva-translate-4b-instruct`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 42. rotation — provider

**Error**

```
RuntimeError: Structured output matched no schema key (decoy/unrelated JSON object; expected one of ['reviews']); len=1087 head='\n\n{"findings": [{"line": 302, "severity": "high", "category": "security", "title": "Insecure LLM Output Handling", "problem": "The sanitizePublicationArtifact function may not properly sanitize LLM-ge'
```

**Responsible code**

- FlexFactor `flexfactor.py:2987` in `_check_structured_type()`

```python
raise RuntimeError(
```
- Route: `nvidia_nim/nvidia/nvidia-nemotron-nano-9b-v2`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 43. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3.5-lightning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 44. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/dots-studio/dots-3-note-preview:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 45. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-30b-a3b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 46. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 47. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-12b-v2-vl:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 48. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/liquid/lfm-2.5-2.6b:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 49. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/nvidia/nemotron-nano-9b-v2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 50. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/poolside/laguna-xs-2.1:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 51. rotation — provider

**Error**

```
RateLimitError: Error code: 429 - {'error': {'message': 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day', 'code': 429, 'metadata': {'headers': {'X-RateLimit-Limit': '50', 'X-RateLimit-Remaining': '0', 'X-RateLimit-Reset': '1787616000000'}, 'limit_source': 'openrouter_free_tier_daily', 'remedy_hint': 'Wait for the daily reset (see X-RateLimit-Reset), or purchase credits to raise your free-model daily limit.', 'provider_name': None}}, 'user_id': 'user_3GWU0JMa1TcZebCavX9qtXxTXSU'}
```

**Responsible code**

- FlexFactor `flexfactor.py:2411` in `_chat_create()`

```python
return client.chat.completions.create(**kwargs)
```
- Route: `openrouter/z-ai/glm-5.2:free`

**Suggested fix** (signature)

Rate-limited. The rotator cools the pool down and moves on; nothing to fix unless it recurs on every pool, which means the free tiers are exhausted for now.

### 52. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2701` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/deepseek-r1:8b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 53. rotation — provider

**Error**

```
TimeoutError: timed out
```

**Responsible code**

- FlexFactor `flexfactor.py:2701` in `_chat()`

```python
with self._opener.open(req, timeout=_ollama_http_timeout()) as resp:
```
- Route: `ollama/gemma4:26b`

**Suggested fix** (none)

no known fix; start from the responsible code above

### 54. baseline-gate — program-defect

**Error**

```
review made no progress: three consecutive semantic review batches completed ZERO files (0 of 368 candidate file(s) reviewed all run). This is a provider/route fault, NOT evidence the repo is clean - stopped fail-closed for resumable retry
```

**Responsible code**

- Not attributable to a specific line from the evidence recorded.

**Suggested fix** (model)

model suggestion, unverified: The error message does not include any file name, line number, or stack trace indicating where the failure occurred. To propose a concrete code fix, we need the relevant logs or the portion of the review orchestration code that handles batch processing (e.g., the function that fetches candidate files and iterates over them). Please provide the offending module/file and any surrounding error context so a targeted correction can be suggested.