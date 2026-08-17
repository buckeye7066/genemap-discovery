# Genemap — low / info findings (6)

_Generated 2026-08-16T22:46:18. These are below the auto-fix bar and were left unchanged on purpose. Review and decide per item._

**Files with low/info issues:** 6

## `apps/web/components/research/ProjectVersionControl.jsx` (1)
- [ ] line 63 **[low]** (error-handling) — **Silent failure on version restoration**: While the error is logged to the console, there is no notification to the user other than an alert. If the error occurs due to a non-recoverable state or an unexpected error type, the user remains uninformed about what specifically went wrong, which can lead to confusion. _Suggested fix:_ Enhance the error handling to provide more specific feedback to the user regarding the nature of the failure.

## `apps/web/components/search/AutocompleteSearch.jsx` (1)
- [ ] line 55 **[low]** (concurrency) — **Potential Memory Leak with Event Listener**: The component adds an event listener but handles cleanup incorrectly. While the cleanup does occur when the component unmounts, it could lead to performance issues if the component is rapidly mounted and unmounted repeatedly without proper tracking of listener instances. _Suggested fix:_ Ensure that the listener is only added if the component is mounted and cleaned up correctly on unmounting.

## `apps/web/lib/EducationLevelContext.jsx` (1)
- [ ] line 81 **[low]** (correctness) — **Inconsistent Analogy Style Key**: The analogyStyle key for the postgraduate level is set to 'publication', which may not be coherent with other levels that refer more explicitly to education styles. This inconsistency could affect user expectations when interpreting content for postgraduate education. _Suggested fix:_ Consider renaming analogyStyle to something that reflects graduate studies more clearly, such as 'advanced_research'.

## `apps/web/pages/AdminMessages.jsx` (1)
- [ ] line 90 **[low]** (error-handling) — **Silent failure on message closing**: If there is an error when closing a message, the error is caught, but no specific error details are recorded, only a generic 'Failed to close message' message is set. _Suggested fix:_ Log the actual error in addition to the user-facing message for better diagnosing of issues.

## `apps/web/pages/Premium.jsx` (1)
- [ ] line 53 **[low]** (error-handling) — **Silent failure in loadEntitlements function**: The catch block in loadEntitlements does not handle the error nor provide any feedback, leading to undetected loading errors. _Suggested fix:_ Log the error or set an error state to inform the user.

## `services/api/src/config/rateLimitStore.js` (1)
- [ ] line 144 **[low]** (security) — **Error details may expose sensitive information**: When logging Redis errors, the error message is included without sanitization, which may accidentally expose sensitive application internals or implementation details. _Suggested fix:_ Sanitize the error message or log only necessary information without exposing sensitive details.
