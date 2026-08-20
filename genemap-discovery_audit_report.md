# FlexFactor audit — genemap-discovery

- **Project:** `C:\Users\firer\genemap-discovery`
- **Branch:** `main`
- **Toolchains:** java, node
- **Files reviewed:** 2
- **Defects found:** 1
- **Files fixed:** 0
- **Baseline build:** passed
- **Unit tests added:** 0 (suite not run)
- **Button/UI (Playwright):** skipped
- **Cycles run:** 1
- **Providers:** rotation:ibm/granite-3.0-3b-a800m-instruct
- **Git:** PROVIDER-OUTAGE ABORT on main: checkpoint preserved; no unverified commit created

## System inventory

**934 entries accounted for.**

| Category | Count |
|---|---:|
| artifact-subtree | 11 |
| binary-asset | 61 |
| configuration-documentation-or-data | 250 |
| first-party-source | 612 |

The immutable run manifest contains the complete path-level inventory. Artifact, binary, and reparse entries are named and classified; they are not represented as line-reviewed source.

## Executable evidence

- **Evidence run:** `genemap-discovery-20260820-033749-153823-45116`
- **Exact final commit:** `39648c62aa125520f02a688756f37534cb66fcfc`
- **Code map:** 532 file(s), 1214 function(s), 24 route(s), 538 material control(s)
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

**Coverage:** 5 competitor(s) covered with corroborating sources (target 5).

- **Sources used:** web:duckduckgo, repo-rewards
- **Repo Rewards endpoint:** `https://web-production-d7db7.up.railway.app`
- **Sources SKIPPED (named, not silent):**
  - `model-discovery` - NotFoundError: Error code: 404 - {'status': 404, 'title': 'Not Found', 'detail': "Function '20f2537e-8593-4eb9-ad40-60eee3bbaa55': Not found for account 'hvux_0rjHS6OiBfWXcZvKgoOaUBy_3UsQqq6I6IAz7I'"}
  - `web:searxng` - RuntimeError: FLEXFACTOR_SEARXNG_URL is not set

- **Ideas accepted as serving this program's purpose:** 1 (rejected 4 - the purpose contract, not the competitor, decides)

- **Bridged into the fix stream:** 0 of 5 candidate(s)
  - NOT bridged (1): jrderuiter/genemap - accepted idea did not map to a valid acceptance criterion
  - NOT bridged (4): DNAdigestOrg/datadiscovery, Top 20 Gene map companies - Discovery|PatSnap, alternatives, match - idea rejected by the purpose contract

| Competitor | Kind | Licence | Reuse mode | Purpose mapping | Verdict | Fix stream | Adoptable idea |
|---|---|---|---|---|---|---|---|
| [DNAdigestOrg/datadiscovery](https://github.com/DNAdigestOrg/datadiscovery) | oss | `UNKNOWN` | `reference-only` | acceptance #3 | reject | NOT entered - idea rejected by the purpose contract | Cross-repository genomic dataset discovery |
| [jrderuiter/genemap](https://github.com/jrderuiter/genemap) | oss | `MIT` | `direct-code-reuse` | acceptance #2. human/model-organism evidence separated | ACCEPT | NOT entered - accepted idea did not map to a valid acceptance criterion | Gene ID Mapping Across Species and Types |
| [Top 20 Gene map companies - Discovery|PatSnap](https://discovery.patsnap.com/topic/gene-map/) | market | `UNKNOWN` | `clean-room-from-documented-behavior` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | Patent-landscape gene mapping |
| [alternatives](https://sourceforge.nethttps://sourceforge.net/p/alternatives/) | oss | `UNKNOWN` | `reference-only` | purpose-only | reject | NOT entered - idea rejected by the purpose contract | Alternative tool comparison catalog |
| [match](https://sourceforge.nethttps://sourceforge.net/p/match/) | oss | `UNKNOWN` | `reference-only` | acceptance #acceptance criterion 6: no diagnosis, personal risk, PGx, dosing, drug avoidance, screening urgency, or trial matching | reject | NOT entered - idea rejected by the purpose contract | Statistical Gene Matching Against Reference Panels |

### DNAdigestOrg/datadiscovery

- **Evidence:** <https://github.com/DNAdigestOrg/datadiscovery>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Cross-repository genomic dataset discovery - Enables users to search and discover genomic datasets across multiple public repositories (e.g., GEO, ArrayExpress, EGA, dbGaP) with unified metadata, rather than searching within a single curated knowledge base.
- **Value here:** Would expand the 'research navigation' acceptance criterion by letting learners and early researchers find relevant public datasets for a gene/phenotype of interest, then trace evidence back to source repositories with provenance.
- **Purpose / criterion mapping:** acceptance #3 - Without verified evidence of what the competitor actually does, adopting a speculative 'dataset discovery' feature risks adding clinical/research-tool complexity (dataset access, access-control, data-use agreements) that blurs the program's education-first, no-diagnosis boundary. The program's stated purpose is approachable education and provenance-aware candidate-gene exploration—not a data portal.
- **Purpose verdict:** REJECTED - Without verified evidence of what the competitor actually does, adopting a speculative 'dataset discovery' feature risks adding clinical/research-tool complexity (dataset access, access-control, data-use agreements) that blurs the program's education-first, no-diagnosis boundary. The program's stated purpose is approachable education and provenance-aware candidate-gene exploration—not a data portal.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** Competitor evidence only provides repo URL and one-line description 'The DNAdigest platform for genomics data discovery'. No feature list, screenshots, API docs, or code were supplied to confirm this capability exists. (confidence low)

### jrderuiter/genemap

- **Evidence:** <https://github.com/jrderuiter/genemap>
- **Licence:** `MIT` (via repo-rewards)
- **Reuse mode:** `direct-code-reuse` - licence MIT is permissive and compatible; source may be read and adapted with attribution
- **Idea:** Gene ID Mapping Across Species and Types - A Python library and CLI that translates gene identifiers between different types (e.g., Ensembl, Entrez, symbols) and across species, enabling consistent gene referencing and cross-species comparisons.
- **Value here:** Adopting this would let the platform normalize and map gene identifiers across human and model organisms, directly supporting the acceptance criterion 'human/model-organism evidence separated' by linking the same gene across species and ensuring accurate provenance display (source, species, version). It would also enhance research navigation and candidate-gene exploration with reliable cross-species mapping.
- **Purpose / criterion mapping:** acceptance #2. human/model-organism evidence separated - This directly advances the program's purpose of separating human and model-organism evidence and providing provenance-aware candidate-gene exploration. Mapping gene IDs across species is essential for accurate species-specific evidence separation and for educational/research navigation without crossing into clinical diagnosis.
- **Purpose verdict:** ACCEPTED - This directly advances the program's purpose of separating human and model-organism evidence and providing provenance-aware candidate-gene exploration. Mapping gene IDs across species is essential for accurate species-specific evidence separation and for educational/research navigation without crossing into clinical diagnosis.
- **Fix-stream decision:** DID NOT enter the fix stream - accepted idea did not map to a valid acceptance criterion
- **Evidence basis:** The competitor description states: 'Python library + command line tool for mapping gene ids between different types and species.' (confidence high)

### Top 20 Gene map companies - Discovery|PatSnap

- **Evidence:** <https://discovery.patsnap.com/topic/gene-map/>, <https://www.f6s.com/companies/genomics/united-states/co>, <https://compworth.com/company/discovery-genomics/alternatives>
- **Licence:** `UNKNOWN` (via none (no repository could be attributed to this competitor))
- **Reuse mode:** `clean-room-from-documented-behavior` - no inspectable source (licence UNKNOWN); only publicly documented behaviour may inform our own independent design
- **Idea:** Patent-landscape gene mapping - Maps genes to patent landscapes, competitor portfolios, and innovation timelines for commercial R&D scouting.
- **Value here:** Would add commercial intelligence (patent assignees, filing trends, freedom-to-operate signals) to gene records, which the current program does not surface.
- **Purpose / criterion mapping:** purpose-only - The program's purpose is approachable genetics education and early-research with provenance-aware candidate-gene exploration, explicitly not commercial IP scouting. Adding patent landscapes would divert from the stated educational/research provenance focus and introduce commercial intelligence outside the contract.
- **Purpose verdict:** REJECTED - The program's purpose is approachable genetics education and early-research with provenance-aware candidate-gene exploration, explicitly not commercial IP scouting. Adding patent landscapes would divert from the stated educational/research provenance focus and introduce commercial intelligence outside the contract.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** Only URLs provided (PatSnap Discovery gene-map topic page, F6S genomics list, CompWorth alternatives). No documented behaviour or feature list is supplied, so the capability is inferred from PatSnap's public positioning, not from evidence in the packet. (confidence low)

### alternatives

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/alternatives/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Alternative tool comparison catalog - Provides a catalog of alternative software tools and projects, allowing users to discover and compare different options in a domain.
- **Value here:** The audited program lacks a discovery mechanism for alternative genetics education and research tools, which could help users find complementary resources and contextualize the platform's offerings.
- **Purpose / criterion mapping:** purpose-only - The program's purpose is to provide genetics education with provenance-aware exploration, not to serve as a directory of competing tools. Adding an alternative comparison feature would dilute focus and not advance the stated acceptance criteria.
- **Purpose verdict:** REJECTED - The program's purpose is to provide genetics education with provenance-aware exploration, not to serve as a directory of competing tools. Adding an alternative comparison feature would dilute focus and not advance the stated acceptance criteria.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** The competitor's URL and name suggest a catalog of alternatives, but the evidence provided is minimal and does not detail specific capabilities beyond listing alternatives. (confidence low)

### match

- **Evidence:** <https://sourceforge.nethttps://sourceforge.net/p/match/>
- **Licence:** `UNKNOWN` (via repo-rewards)
- **Reuse mode:** `reference-only` - licence UNKNOWN could not be verified; record the capability as a reference and copy nothing
- **Idea:** Statistical Gene Matching Against Reference Panels - The competitor (match) is a bioinformatics tool that performs statistical matching of user-provided genetic data against reference populations or panels, often used for ancestry or relatedness inference. It outputs quantitative similarity scores or matches between input variants and reference datasets.
- **Value here:** Adopting an explicit statistical-matching capability would let GeneMap Discovery give users a concrete, reproducible measure of how their candidate gene or variant matches known model-organism or human reference panels. This directly supports the 'deterministic benchmarks' acceptance criterion by replacing subjective curation with a numeric, reproducible comparison, and it strengthens the lessons-to-research path by turning a research question into a quantitative exercise.
- **Purpose / criterion mapping:** acceptance #acceptance criterion 6: no diagnosis, personal risk, PGx, dosing, drug avoidance, screening urgency, or trial matching - The program's stated purpose is education and early research with AI leads kept separate from verified evidence; it explicitly forbids anything resembling personal genetic analysis or clinical interpretation. Introducing statistical matching of user genetic data would create a pathway toward personal-risk interpretation and would blur the line between education and clinical decision support, violating acceptance criterion 6 (no personal risk or diagnosis). The platform has no VCF upload capability by design, so this feature would not fit the existing architecture or safety boundary.
- **Purpose verdict:** REJECTED - The program's stated purpose is education and early research with AI leads kept separate from verified evidence; it explicitly forbids anything resembling personal genetic analysis or clinical interpretation. Introducing statistical matching of user genetic data would create a pathway toward personal-risk interpretation and would blur the line between education and clinical decision support, violating acceptance criterion 6 (no personal risk or diagnosis). The platform has no VCF upload capability by design, so this feature would not fit the existing architecture or safety boundary.
- **Fix-stream decision:** DID NOT enter the fix stream - idea rejected by the purpose contract
- **Evidence basis:** The only provided evidence is the SourceForge URL 'match' with licence 'UNKNOWN' and reuse mode 'reference-only'. No functional details, documentation, or demo are supplied, so the capability is inferred from the tool's name and domain rather than confirmed by evidence. (confidence low)

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
- `(purpose)` line 0 (quality-gate) - **Purpose assessment evidence is incomplete**: baseline purpose assessment failed: RuntimeError: all 3 purpose assessment samples failed: BadRequestError: Error code: 400 - {'object': 'error', 'message': 'Conversation roles must alternate user/assistant/user/assistant/...', 'type': 'BadRequestError', 'param': None, 'code': 400}; BadRequestError: Error code: 400 - {'error': {'message': '`max_tokens` must be less than or equal to `4096`, the maximum value for `max_tokens` is less than the `context_window` for this model', 'type': 'invalid_request_error', 'param': 'max_tokens'}}; BadRequestError: Error code: 400 - {'error': {'message': 'The model `canopylabs/orpheus-arabic-saudi` requires terms acceptance. Please have the org admin accept the terms at https://console.groq.com/playground?model=canopylabs%2Forpheus-arabic-saudi', 'type': 'invalid_request_error', 'code': 'model_terms_required'}}; final purpose assessment returned no usable result _Suggested fix:_ Retry the resumable run after restoring a responsive provider.

## Defects by file

_No defects found in the reviewed files._

## Fix notes / left unfixed

- provider outage: three consecutive semantic review batches completed zero files - stopped fail-closed for resumable retry
- provider-outage rollback failed; working tree requires inspection
