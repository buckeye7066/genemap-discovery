# genemap-discovery — low / info findings (1)

_Generated 2026-08-26T15:20:18. These are below the auto-fix bar and were left unchanged on purpose. Review and decide per item._

**Files with low/info issues:** 1

## `apps/web/pages/LearningPath.jsx` (1)
- [ ] line 49 **[low]** (dead-code) — **Unreachable guard clause on Promise.allSettled result**: The condition `!Array.isArray(settled) || settled.length !== 2` can never be true. Promise.allSettled always resolves to an array whose length equals the number of input promises (here, exactly 2). Both branches of the guard are therefore dead code — the `return` on line 50 is never executed. The subsequent code already safely handles non-fulfilled statuses via `.status === 'fulfilled'` checks, making this defensive check redundant. _Suggested fix:_ Remove lines 49-51 (the if-guard and early return) since they are unreachable and add no safety value.
