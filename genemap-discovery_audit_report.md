# FlexFactor audit — genemap-discovery

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 5
- **Defects found:** 2
- **Files fixed:** 0
- **No-ops:** 1 (none are successes) — **0 rejected finding(s)** (author found nothing to fix — a REVIEW-precision defect, not a fix failure), **0 no fix found** (a real defect the loop could not land), 1 unclassified (the note did not say)
- **Baseline build:** passed
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:canopylabs/orpheus-arabic-saudi
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**940 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 61 |
| configuration-documentation-or-data | 252 |
| first-party-source | 616 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-discovery-20260820-033749-153823-45116`
- **Exact final commit:** `c0ba47ee15ad1f7855a8263c459d1b37bc290675`
- **Code map:** 534 file(s), 1214 function(s), 24 route(s), 538 material control(s)
- **Function execution:** 0/1048 with invocation evidence
- **Route execution:** 0/24
- **Control execution:** 0/538
- **Changed-file rescan:** 0/0 (complete)
- **Blast radius:** 0 affected file(s); analysis ran
- **Normalized gates:** 4 pass, 3 fail, 2 blocked

- **Blast Radius:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\blast-radius.json`
- **Changed File Rescan:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\changed-file-rescan.json`
- **Code Index:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\code-index.json`
- **Coverage Ledger:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\coverage-ledger.json`
- **Manifest:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\manifest.json`
- **Purpose Graph:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\purpose-graph.json`
- **Quality Gates:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\quality-gates.json`
- **Sarif:** `C:\Users\firer\.flexfactor\evidence\e29c9d26f8adcf57\genemap-discovery-20260820-033749-153823-45116\results.sarif`

## Competitor research

**Coverage:** ONLY 4 of the target 5 competitors could be corroborated from a reachable source. This is a coverage SHORTFALL, not evidence that fewer competitors exist.

- **Sources used:** web:duckduckgo, repo-rewards
- **Repo Rewards endpoint:** `https://web-production-d7db7.up.railway.app`
- **Sources SKIPPED (named, not silent):**
  - `model-discovery` - NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function 'cd89bd68-13e3-47a9-861e-9a62e6e14b05': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 4 (rejected 0 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 4 candidate(s)
  - NOT bridged (1): jrderuiter/genemap - accepted idea did not map to a valid acceptance criterion
  - NOT bridged (3): DNAdigestOrg/datadiscovery, alternatives, match - not bridgeable (evidence=verified, reuse_mode=reference-only)

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [DNAdigestOrg/datadiscovery](https://github.com/DNAdigestOrg/datadiscovery) | oss | `UNKNOWN` | `reference-only` | acceptance #1, 2, 3 | ACCEPT | NOT entered - not bridgeable (evidence=verified, reuse_mode=reference-only) | Federated genomic repository search with harmonized metadata |
| [jrderuiter/genemap](https://github.com/jrderuiter/genemap) | oss | `MIT` | `direct-code-reuse` | acceptance #1. lessons-to-research path works, 2. human/model-organism evidence separated, 4. deterministic benchmarks | ACCEPT | NOT entered - accepted idea did not map to a valid acceptance criterion | Gene Mapping Functionality |
| [alternatives](https://sourceforge.nethttps://sourceforge.net/p/alternatives/) | oss | `UNKNOWN` | `reference-only` | acceptance #1. lessons-to-research path works | ACCEPT | NOT entered - not bridgeable (evidence=verified, reuse_mode=reference-only) | Community-driven alternatives discovery |
| [match](https://sourceforge.nethttps://sourceforge.net/p/match/) | oss | `UNKNOWN` | `reference-only` | acceptance #1. lessons-to-research path works | ACCEPT | NOT entered - not bridgeable (evidence=verified, reuse_mode=reference-only) | Gene Comparison Visualization |

### DNAdigestOrg/datadiscovery

- **Evidence:** <https://github.com/DNAdigestOrg/datadiscovery>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Federated genomic repository search with harmonized metadata - Enables searching across multiple public genomic data repositories (e.g., EGA, dbGaP, GEO, ArrayExpress) through a unified query interface with standardized metadata fields and dataset-level provenance.
- **Value here:** Would extend the program's early-research path (acceptance criterion 1) by letting learners and researchers discover real datasets behind gene–phenotype associations, reinforcing claim-level provenance (criterion 3) and human/model-organism evidence separation (criterion 2) with concrete repository records.
- **Purpose / criterion mapping:** acceptance #1, 2, 3 - Directly serves the program's stated purpose of 'provenance-aware candidate-gene exploration' and 'early-research platform' by grounding educational topics in discoverable, citable datasets without enabling clinical use (criterion 6).
- **Purpose verdict:** ACCEPTED - Directly serves the program's stated purpose of 'provenance-aware candidate-gene exploration' and 'early-research platform' by grounding educational topics in discoverable, citable datasets without enabling clinical use (criterion 6).
- **Fix-stream decision:** DID NOT enter the fix stream - not bridgeable (evidence=verified, reuse_mode=reference-only)
- **Evidence basis:** Supplied evidence only states the competitor is 'The DNAdigest platform for genomics data discovery' (GitHub description). No feature list, API docs, or UI evidence was provided to confirm federated search, metadata harmonization, or repository coverage. (confidence low)

### jrderuiter/genemap

- **Evidence:** <https://github.com/jrderuiter/genemap>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** Gene Mapping Functionality - Maps gene IDs between different types and species using a command line tool and Python library.
- **Value here:** Integrating gene mapping functionality would enhance the program's capacity to explore genetics in an educational context, aiding users in understanding genetic variations across species, which is in line with providing approachable genetics education.
- **Purpose / criterion mapping:** acceptance #1. lessons-to-research path works, 2. human/model-organism evidence separated, 4. deterministic benchmarks - This directly supports the program's goal of being an educational platform by providing users with tools to better understand genetics.
- **Purpose verdict:** ACCEPTED - This directly supports the program's goal of being an educational platform by providing users with tools to better understand genetics.
- **Fix-stream decision:** DID NOT enter the fix stream - accepted idea did not map to a valid acceptance criterion
- **Evidence basis:** The competitor provides a Python library and command line tool specifically designed for mapping gene IDs across types and species. (confidence high)

### alternatives

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/alternatives/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Community-driven alternatives discovery - Allows users to search for and compare alternative genomics tools or resources, presumably with community contributions and ratings, providing a curated list of options.
- **Value here:** Adopting this would add a feature where learners and researchers can discover and compare different genetics education or research tools, enhancing the platform's role as an approachable education and early-research hub and supporting the lessons-to-research path.
- **Purpose / criterion mapping:** acceptance #1. lessons-to-research path works - Adding a community-driven alternatives discovery feature would strengthen the platform's educational and research navigation by helping users find appropriate genetics tools, aligning with the purpose of 'an approachable genetics education and early-research platform' and supporting the acceptance criterion of a 'lessons-to-research path works'.
- **Purpose verdict:** ACCEPTED - Adding a community-driven alternatives discovery feature would strengthen the platform's educational and research navigation by helping users find appropriate genetics tools, aligning with the purpose of 'an approachable genetics education and early-research platform' and supporting the acceptance criterion of a 'lessons-to-research path works'.
- **Fix-stream decision:** DID NOT enter the fix stream - not bridgeable (evidence=verified, reuse_mode=reference-only)
- **Evidence basis:** The competitor evidence lists the URL 'https://sourceforge.net/p/alternatives/' and the name 'alternatives', suggesting a directory or list of alternative software, which implies a capability for users to find and compare alternatives. (confidence medium)

### match

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/match/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Gene Comparison Visualization - Provides a visual representation of genetic comparisons between different genes or species, facilitating easier understanding of genetic relationships and differences.
- **Value here:** Adopting this feature would enhance the educational aspect of gene exploration in the audited program, making it more interactive and engaging for users who are learning about genetics.
- **Purpose / criterion mapping:** acceptance #1. lessons-to-research path works - This feature directly supports the program's purpose of being an approachable genetics education platform by providing tools that enhance learning and understanding.
- **Purpose verdict:** ACCEPTED - This feature directly supports the program's purpose of being an approachable genetics education platform by providing tools that enhance learning and understanding.
- **Fix-stream decision:** DID NOT enter the fix stream - not bridgeable (evidence=verified, reuse_mode=reference-only)
- **Evidence basis:** Noted in the competitor's repository as 'apps/web/components/search/GeneComparison.jsx', indicating they have developed a component specifically for gene comparison visualization. (confidence high)

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

### high (2)
- `apps/web/pages/SuperAdminSetup.jsx` line 142 (security) - **Search fallback grants privileges to arbitrary first result user**: In handleGrantSuperAdmin, handleGrantFreePeriod, and handleRevokeFreePeriod, the target user lookup uses .find() for an exact email match but then falls back to (searchResult.users || [])[0]. When the API returns results without an exact match, the first arbitrary user in the array is selected and receives admin/premium/free-period actions intended for someone else. _Suggested fix:_ Remove the || (searchResult.users || [])[0] fallback; if .find() returns nothing, keep the error state set to 'User not found' and do not call any grant/revoke API.
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment incomplete: 2/3 sample(s) usable; BadRequestError: Error code: 400 - {'error': {'message': '`max_tokens` must be less than or equal to `4096`, the maximum value for `max_tokens` is less than the `context_window` for this model', 'type': 'invalid_request_error', 'param': 'max_tokens'}}; final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

## Defects by file

### `apps/web/pages/SuperAdminSetup.jsx` ⚠️ reported
- **[high]** line 142 (security) — **Search fallback grants privileges to arbitrary first result user**: In handleGrantSuperAdmin, handleGrantFreePeriod, and handleRevokeFreePeriod, the target user lookup uses .find() for an exact email match but then falls back to (searchResult.users || [])[0]. When the API returns results without an exact match, the first arbitrary user in the array is selected and receives admin/premium/free-period actions intended for someone else. _Fix:_ Remove the || (searchResult.users || [])[0] fallback; if .find() returns nothing, keep the error state set to 'User not found' and do not call any grant/revoke API.

## Fix notes / left unfixed

- apps/web/pages/SuperAdminSetup.jsx: NO-OP - author model returned no change for 1 finding(s): [{'issue': 'Search fallback grants privileges to arbitrary first result user', 'cross_file': True}]
- provider outage: three consecutive semantic review batches completed zero files - stopped fail-closed for resumable retry
- provider-outage rollback failed; working tree requires inspection
