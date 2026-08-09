# ChatGPT Production Readiness Lane

**Executor:** ChatGPT  
**Execution mode:** one program at a time  
**Current ACTIVE_APP:** Axiom GeneMap Discovery  
**Queue override:** GeneMap was explicitly resumed before this board was created; no other program may become active until GeneMap is terminally checkpointed.  
**Updated:** 2026-08-09

| Program | Queue position | Purpose | Repository | Deployment or package | Current phase | Tests | Review | Merge | Deploy | Live verification | Blockers | Status |
|---|---:|---|---|---|---|---|---|---|---|---|---|---|
| GrantFlow | 1 | Whole-profile funding discovery and application workflow with current official sources and honest portal handoffs | `buckeye7066/GrantFlow` | Vercel/Railway, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| **Axiom GeneMap Discovery** | **2, ACTIVE_APP** | Genetics education and early-research platform separating AI candidate leads from verified evidence | `buckeye7066/genemap-discovery` | Vercel web and Railway API | MERGING | Exact-head gates running after final evidence update | Fresh exact-head review required | PR #123 pending | Exact-SHA production deployment pending | Owner-authorized authenticated journey pending | Processor/privacy, operations, payment, qualified review, authenticated production evidence | BLOCKED |
| SermonSmith AI | 3 | Pastor-led sermon workspace preserving exact Scripture, denominational context, and human review | `buckeye7066/sermonsmith` | Web/API/desktop/mobile, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| PromoPilot | 4 | Approval-first, brand-isolated marketing control plane with official analytics and attribution | `buckeye7066/promopilot` | Railway target, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| LiveHealth | 5 | Modular healthcare records and operations platform with scoped clinical boundaries | `buckeye7066/livehealth` | Launcher/deployment, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| DirectShift Health | 6 | Healthcare staffing marketplace for assignments and individual shifts | `buckeye7066/directshift-health` | `start-directshift.cmd` and deployment, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| Mind Over Math | 7 | Invite-controlled precalculus/calculus learning platform with deterministic verification | `buckeye7066/mind-over-math` | Vercel/Railway, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |
| FutureU | 8 | Complete K-12 homeschool and classroom platform with 120 reviewed courses and 51 jurisdiction configurations | `buckeye7066/FutureU` | Local launcher and production host, to reverify when active | INVENTORY | Not active | Not active | Not active | Not active | Not active | Not evaluated in this GeneMap execution | INVENTORY |

## ACTIVE_APP release rule

GeneMap remains locked until one of these truthful terminal checkpoints is reached:

- `PRODUCTION READY`, supported by exact-SHA implementation, review, deployment, live journeys, output inspection, and external evidence; or
- `SOFTWARE COMPLETE, EXTERNAL RELEASE BLOCKER`, after every connector-accessible task is merged, deployed, and verified and only owner-controlled evidence remains.

A plan, report, pull request, green build, preview deployment, or healthy endpoint does not release the lock.