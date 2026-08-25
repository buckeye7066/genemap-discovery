# Production Readiness Table — GeneMap Discovery

Audit date: 2026-08-19  
Audited from: HEAD of `copilot/genemap-discovery-full-production-readiness-pass`  
Node: v24.19.0 · pnpm 9.15.9

---

## Summary

| Gate | Result | Detail |
|------|--------|--------|
| Build | ✅ PASS | Web bundle builds clean in 23 s |
| Tests | ✅ PASS | 1 756 passed · 3 skipped · 0 failed (106 files) |
| Lint | ✅ PASS | 0 errors · 0 warnings (3 warnings fixed in this PR) |
| Typecheck | ✅ PASS | tsc + node --check pass; launch-verifier self-test passes |
| Dependabot alerts | ✅ 0 open | 2 advisories present, both documented with expiry + real-fix plan |
| User journey | ⚠️ PARTIAL | Static bundle verified; live E2E requires Railway backend (see §5) |
| versionCode / versionName | ✅ PASS | Auto-incremented from `github.run_number` in CI |
| Signing config | ✅ PASS | Env-var keystore; conditionally applied only when secrets present |
| Permissions declared vs used | ✅ PASS | `INTERNET` only — matches Capacitor WebView usage |
| Privacy policy | ✅ PASS | `PrivacyPolicy.jsx` page in-app; linked from Login + Account Settings |
| Target SDK level | ✅ PASS | `targetSdkVersion 36` (Android 16); Play minimum is 34 |

---

## 1. Build

```
pnpm --filter @genemap/shared build   # required first; dist/ is gitignored
pnpm build:web
```

**Result: PASS.** `vite build` completes in ~23 s with no errors or warnings.
Largest chunks (gzipped): vendor-charts 113 kB · vendor-react 57 kB · vendor-markdown 36 kB.

The shared package (`packages/shared`) must be built before running tests or
typechecks because its `dist/` is gitignored. The CI `test` and
`lint-and-typecheck` jobs already include a "Build shared package" step.

---

## 2. Tests

```
pnpm test   # runs api + web in parallel
```

| Package | Files | Tests | Skipped | Failed |
|---------|-------|-------|---------|--------|
| `@genemap/api` | 67 (1 skipped) | 1 449 | 3 | 0 |
| `@genemap/web` | 40 | 310 | 0 | 0 |
| **Total** | **107** | **1 759** | **3** | **0** |

Pass rate: **100 %** (skipped tests are Postgres integration tests that require
`TEST_DB=postgres`; they are skipped in the default CI run by design).

---

## 3. Dependabot / Security Alerts

`pnpm audit` exits 0. Two advisories exist; both are documented exceptions in
`package.json#pnpm.auditConfig.ignoreGhsas` **and** in
`scripts/verify-security-exceptions.mjs` with:

| GHSA | Package | Severity | Reason | Reviewed by |
|------|---------|----------|--------|-------------|
| GHSA-jmr9-qjv8-65gv | `extract-zip` (Electron tooling) | High | Not shipped in production runtime; only reachable through desktop build tooling | 2026-09-15 |
| GHSA-qwww-vcr4-c8h2 | `react-router` (RSC CSRF) | High | App is a Vite client-side SPA; RSC/server actions not used | 2026-10-01 |

**Open (unmitigated) alerts: 0.**

All `pnpm.overrides` in `package.json` pin transitive dependencies to patched
versions for every other known advisory.

---

## 4. User Journey

### Static / bundled path — PASS

The full React app builds and runs locally via `pnpm dev:web`. The primary
candidate-gene flow is exercised by the Playwright E2E suite
(`apps/web/tests/e2e`) and the unit/integration suite covering search, genomic
enrichment, education, and results rendering.

> **Correction, 2026-08-25.** This paragraph previously listed "VCF upload" among
> the covered flows and quoted a fixed test count. VCF upload is **not** a
> capability of the publishable build — `/genomics/vcf/*` is a hidden path prefix
> that returns `404 FEATURE_NOT_AVAILABLE` before authentication. See
> [PROJECT-BRIEF.md §5](PROJECT-BRIEF.md#5-gated-capabilities-present-in-code-off-in-the-published-build).
> The test count is dropped rather than restated, because a number in a document
> goes stale silently.

### Live end-to-end path — not verified in this audit

A full install → first-launch → gene-mapping → result journey requires the
Railway Fastify API (`genemap-api-production.up.railway.app`) and a live
PostgreSQL database. This environment is external to the CI sandbox.

**Where it would break if backend is down:**
- Login / registration (POST `/auth/login`, `/auth/register`) — would return 503
- Concept autocomplete (GET `/genomics/publication-concepts/search`) — would return 503
- Candidate-gene search (POST `/llm/invoke`) and gene enrichment (POST `/genomics/enrich`) — would return 503
- Education explain / quiz / tutor (POST `/education/explain`, `/quiz`, `/chat`) — would return 503

> **Correction, 2026-08-25.** This list previously named `GET /genomics/search`
> (no such route exists) and `POST /genomics/vcf`. `/genomics/vcf/*` is a hidden
> path prefix: it returns `404 FEATURE_NOT_AVAILABLE` whether the backend is up
> or down, so it is not a backend-availability failure mode at all.

The app renders a graceful error boundary for API failures; no crash or blank
screen occurs.

---

## 5. Play Listing Essentials

### versionCode / versionName — PASS

Managed in `apps/web/android/app/build.gradle`:

```groovy
def resolvedVersionCode = (System.getenv("ANDROID_VERSION_CODE") ?: "1") as Integer
def resolvedVersionName = System.getenv("ANDROID_VERSION_NAME") ?: "1.0"
```

The `android-build.yml` CI workflow sets:

```yaml
ANDROID_VERSION_CODE: ${{ github.run_number }}
ANDROID_VERSION_NAME: 1.0.${{ github.run_number }}
```

Every merge to `main` that triggers the workflow produces a monotonically
increasing `versionCode`.  Local builds fall back to `versionCode 1 / 1.0`.

### Signing config — PASS

```groovy
signingConfigs {
  release {
    if (System.getenv("ANDROID_KEYSTORE_PATH")) {
      storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
      storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
      keyAlias System.getenv("ANDROID_KEY_ALIAS")
      keyPassword System.getenv("ANDROID_KEY_PASSWORD")
    }
  }
}
```

The keystore is read entirely from environment variables. The `release`
`buildType` only applies `signingConfig signingConfigs.release` when
`ANDROID_KEYSTORE_PATH` is set, so local/unsigned builds do not fail.

### Permissions declared vs used — PASS

`apps/web/android/app/src/main/AndroidManifest.xml` declares one permission:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

The app is a Capacitor WebView SPA that communicates with the Railway API over
HTTPS. `INTERNET` is the only Android permission required.  No camera,
microphone, storage, location, or contacts permissions are declared or used.

### Privacy policy — PASS

- In-app page: `apps/web/pages/PrivacyPolicy.jsx` (last updated 2026-08-10)
- Linked from the Login page and Account Settings
- Describes data flows, genomic data boundaries, and contact information
- A Play Store listing URL should point to this page (or a hosted copy) in the
  Data Safety / Privacy Policy field.

### Target SDK level — PASS

```
targetSdkVersion = 36   (Android 16)
compileSdkVersion = 36
minSdkVersion    = 24   (Android 7.0)
```

Google Play requires `targetSdkVersion ≥ 34` for new apps and updates
(as of August 2024). `targetSdkVersion 36` satisfies that requirement with
headroom.

---

## 6. Fixes Applied in This PR

| File | Change |
|------|--------|
| `apps/web/pages/Search.jsx` | Removed stale `// eslint-disable-line no-use-before-define` directive (rule no longer triggers) |
| `services/api/src/__tests__/client-error-boundary.test.js` | Removed unused `vi` import |
| `services/api/src/services/vcf.js` | Removed dead `normalizeChromosome` function (duplicate of the one in `variantNormalize.js` which already normalises chromosomes via `normalizeVcfAlleleRows`) |

All three were lint warnings that prevented a clean `pnpm lint` exit.

---

## 7. Remaining Recommendations

These items are **not blockers** for the current internal/closed testing phase
but should be addressed before a public Play launch:

1. **Live E2E smoke test in CI** — add a `production-smoke` job (workflow
   already exists: `.github/workflows/production-smoke.yml`) that pings the
   Railway health endpoint and logs in with a test account.
2. **Security exception review dates** — both exceptions expire before
   2026-10-01. Schedule a dependency upgrade sprint to remove them.
3. **Privacy policy hosting** — ensure the in-app `PrivacyPolicy` page URL is
   reachable without authentication for the Play Store Data Safety form.
