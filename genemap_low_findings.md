# Genemap — low / info findings (13)

_Generated 2026-08-29T10:33:26. These are below the auto-fix bar and were left unchanged on purpose. Review and decide per item._

**Files with low/info issues:** 13

## `apps/web/android/app/capacitor.build.gradle` (1)
- [ ] line 10 **[low]** (dead-code) — **Unused Import of Variables Gradle File**: The import of the `cordova.variables.gradle` file may not be necessary if no variables are actually utilized in the current build. _Suggested fix:_ Remove the line if the variables imported are not used, or confirm their necessity and document their use.

## `apps/web/components/GenerateAppIcon.jsx` (1)
- [ ] line 3 **[low]** (dead-code) — **Unused Import**: The import statement for `Button` from `@/components/ui/button` might not be necessary as it is only used conditionally inside the JSX but is not required for rendering the component in a basic state without the icon. _Suggested fix:_ Evaluate the necessity of importing `Button`; if not used in certain conditions, consider removing it to clean up the code.

## `apps/web/components/education/UsageBanner.jsx` (1)
- [ ] line 21 **[low]** (error-handling) — **Empty catch block in async operation**: Using an empty catch block without any error handling may lead to unnoticeable failures in fetching the entitlements, making debugging harder. _Suggested fix:_ At minimum, log the error caught in the catch block to provide visibility into issues occurring during the async request.

## `apps/web/components/search/GeneComparison.jsx` (1)
- [ ] line 263 **[low]** (edge-case) — **No Metadata Handling When No Records Found**: The component does not handle the case when 'row.metadataClaims.length' is zero appropriately, potentially confusing users about the absence of metadata. _Suggested fix:_ Add a message indicating there are no metadata claims when 'row.metadataClaims.length' is zero.

## `apps/web/components/search/LoadingSpinner.jsx` (1)
- [ ] line 6 **[low]** (correctness) — **Pass-Through Component Without Props Validation**: The `LoadingSpinner` component directly passes its `props` to `SharedLoadingSpinner` without any validation or restriction. If `SharedLoadingSpinner` expects certain props and they are not provided or are in an unexpected format, this may lead to runtime errors. Additionally, since it's a pass-through, any unintended props can also be passed through, potentially leading to unexpected behaviors. _Suggested fix:_ Implement prop validation using PropTypes or TypeScript to ensure that the correct props are provided to the `SharedLoadingSpinner` component.

## `apps/web/components/search/SavedGeneSets.jsx` (1)
- [ ] line 39 **[low]** (edge-case) — **Confirmation dialog could be bypassed**: The confirmation dialog can be bypassed if the user interacts with the component through another means (like a keyboard shortcut). This can lead to unintended deletions. _Suggested fix:_ Ensure deletion is only processed through the confirmation dialog by wrapping the delete action in the confirmation logic.

## `apps/web/lib/researchTaskFixtures.js` (1)
- [ ] line 12 **[low]** (edge-case) — **Sample count validation edge case**: The isValidAggregateSampleCount function accepts sample counts over 1,000,000, which may not be realistic in a research context. It does not account for how large sample sizes may impact performance or memory consumption. _Suggested fix:_ Consider applying a more realistic upper limit for sampleCount based on practical use cases or document the expected behavior when large values are passed.

## `apps/web/pages/Home.jsx` (1)
- [ ] line 10 **[info]** (correctness) — **Unconditional Redirect**: The Home component always redirects to /dashboard without any conditions, which might not be the intended behavior if /home is accessed for other purposes in the future. _Suggested fix:_ Consider adding a condition to determine whether to redirect or render specific content for /home.

## `scripts/backup-snapshot.sh` (1)
- [ ] line 109 **[low]** (edge-case) — **Date format handling in metadata**: The use of date in the ISO 8601 format is generally robust, but no checks are added to ensure the date is formatted correctly on all systems, which could lead to inconsistent backup metadata display on different locales or systems. _Suggested fix:_ Ensure appropriate date formatting and locale handling or provide guidelines for expected environments when running the script.

## `services/api/src/__tests__/projectApiContract.test.js` (1)
- [ ] line 198 **[low]** (dead-code) — **Unused Variables in Entity Variables Mapping**: The ENTITY_VARIABLES object maps variable names to potential UI elements, but not all mappings are used in assertions or functionality within the tests, suggesting redundancy. _Suggested fix:_ Review the ENTITY_VARIABLES mapping and remove any unused variables or ensure they are utilized in the test cases to avoid confusion.

## `services/api/src/config/publishingBoundary.js` (1)
- [ ] line 30 **[low]** (edge-case) — **Potentially Unhandled Edge Case in HIDDEN_PATH_PREFIXES**: The path '/genomics/variant' may not be properly handled in edge cases where the expected format of the path is violated or malformed, leading to unexpected application responses. _Suggested fix:_ Ensure normalization and validation is applied to paths against the expected patterns, possibly returning a controlled error for unhandled cases.

## `services/api/src/config/sentry.js` (1)
- [ ] line 14 **[low]** (bug) — **captureException Method Does Not Function**: The captureException function is defined but intentionally does nothing, meaning any call to it results in lost error information, which could hinder debugging. _Suggested fix:_ Implement logging functionality to capture and log exceptions appropriately when Sentry is enabled.

## `services/api/src/services/clinicalTrials.js` (1)
- [ ] line 106 **[low]** (bug) — **Caching pageSize greater than 50 is allowed but limited**: The 'pageSize' parameter can be set to values greater than 50, which is acceptable in terms of request setup, but ultimately ignored when fetching data due to the hardcoded cap in the request parameters. _Suggested fix:_ Ensure that the logic accounts for this limitation and makes it clear to users what the maximum allowable page size is for requests.
