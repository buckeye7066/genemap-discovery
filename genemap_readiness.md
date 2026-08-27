# Production readiness — GeneMap

**Verdict: NOT PRODUCTION READY**

- Gates passed: 11/14 evaluated (18 total)
- Blocking failures: 3 (severity >= high)

## Blockers

- **Project builds** [critical] — build command failed
  - Fix: Fix the compile/build errors.
- **Test suite passes** [high] — tests were not run
  - Fix: Run the suite and fix failures.
- **Dependencies are lock-pinned** [high] — no lockfile: java:apps/web/android
  - Fix: Commit the lockfile so builds are reproducible.

## Detected toolchains

| Component | Ecosystem | Manager | Build | Test | Deps |
|---|---|---|---|---|---|
| `.` | node | pnpm | yes | yes | installed |
| `apps/desktop` | node | npm | yes | none | installed |
| `apps/web` | node | pnpm | yes | yes | installed |
| `packages/shared` | node | pnpm | yes | yes | installed |
| `services/api` | node | pnpm | NONE | yes | installed |
| `apps/web/android` | java | gradle | yes | yes | installed |

## All gates

| Gate | Status | Severity | Evidence |
|---|---|---|---|
| Project builds | FAIL | critical | build command failed |
| Changes can be build-verified | PASS | critical | build verification available |
| No secret material committed | PASS | critical | no secret-shaped files tracked |
| Dependencies are lock-pinned | FAIL | high | no lockfile: java:apps/web/android |
| .gitignore covers secrets and artifacts | PASS | high | .env ignored |
| Unique counters are minted on the server | PASS | high | no frontend unique-counter increment |
| No leftover factory overlay files at repo root | PASS | high | no tracked _gh_* / _restore_* at repo root |
| User-facing entities persist beyond in-memory stubs | PASS | high | no createStubEntityClient / populated KNOWN_STUB_ENTITIES |
| Fresh-DB schema bootstrap covers migrated tables | n/a | high | no dual schema.sql + numbered-migration layout |
| Host spine modules are not collapsed stubs | n/a | high | no host spine paths |
| Test suite passes | ???? | high | tests were not run |
| Automated tests exist | PASS | high | test files found |
| Continuous integration is configured | PASS | medium | CI config found |
| Required configuration is documented | PASS | medium | .env.example present |
| Deployable artifact defined | PASS | medium | Dockerfile/Procfile present |
| README explains how to install and run | PASS | medium | README contains setup commands |
| License declared | FAIL | low | no license file |
| JSON-LD structured data is valid | n/a | low | no JSON-LD blocks found |
