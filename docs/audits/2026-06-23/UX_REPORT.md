# UX_REPORT — GeneMap Discovery

## Problems identified
1. **Crowded, undifferentiated nav.** Five groups (Education / Research Tools /
   Personal / Admin / Account) with ~27 links, mixing learner, researcher, and
   admin tools at the same visual weight.
2. **Admin tools shown to everyone.** The 9-item Admin group rendered for all
   users regardless of role — confusing and a (cosmetic) information leak.
3. **Orphaned page.** `TopicExplorer` existed as a route but appeared in no menu.
4. **Bare search empty-state.** New users saw "Search by phenotype or input
   genes" with no examples, no jargon help, and no medical-advice framing.
5. **Missing PWA icons.** `apple-touch-icon` / manifest referenced
   `/icons/icon-192.png`, which did not exist (404 on mobile add-to-home).

## Changes made

### Navigation redesigned around intent (Layout.jsx)
| Old | New |
|-----|-----|
| Education | **Learn** — Learn Genetics, Topic Explorer (newly surfaced), Learning Path, Take a Quiz |
| Research Tools (8) | **Discover** — Home, Gene Search, AI Assistants, Study Tutor · **Research** — Dashboard, GSEA, VCF Analysis, Visualization Hub, Research Mode, Clinical Support |
| Personal | **My Data** — Medical Data, Search History |
| Account | **Account** — Profile, Premium, Contact Support |
| Admin (always shown) | **Admin** — role-gated; Admin Setup restricted to super_admin |

### Role-based gating
`useAuth()` drives `isAdmin` (`role==='admin' | 'super_admin' |
entitlements.isAdmin`). The Admin group renders only for admins; `Admin Setup`
only for `super_admin`. **Backend authorization is unchanged and remains the real
boundary** — this is purely decluttering.

### Beginner-friendly search entry point (Search.jsx)
- **Example searches** (clickable, run a real query): short stature, hearing
  loss, cystic fibrosis, intellectual disability, BRCA1, rheumatoid arthritis.
- **Plain-English glossary**: Phenotype, Gene set, VCF, HPO.
- **Prominent notice**: "Educational and research support only … not medical
  advice or a diagnosis — consult a qualified clinician or genetic counselor."

### Existing strengths confirmed (not changed)
- History, gene cards, and clinical components already carry educational
  disclaimers (12 files). `GeneCard.jsx` shows evidence framing.
- History page already had loading skeleton, error alert, empty state, and
  confirm-dialogs for delete/clear — its only defect was the field-name drift
  (fixed, B-103).

## Accessibility
- Example-search buttons use real `<button>` elements with visible
  `focus:ring-2` outlines and adequate touch targets.
- Glossary uses semantic `<dl>/<dt>/<dd>`.
- Sidebar links already use ≥40px min-height touch targets and active-state
  contrast.
- **Remaining a11y work (not completed this session):** a full WCAG 2.1 AA pass
  (color-contrast audit of slate-400 helper text, aria-labels on icon-only
  buttons across all pages, reduced-motion handling for spinners, form-error
  `aria-describedby`). Documented as recommended next PR.

## Remaining UX opportunities (not done)
- Result confidence legend (strong/moderate/exploratory) + per-source labels on
  gene cards (data exists; presentation pass needed).
- Staged loading copy ("Understanding your search → Finding candidate genes →
  Checking databases → Preparing explanation").
- Richer empty states for projects / saved gene sets / medical data / messages.
- A first-run home/onboarding panel ("What can I do here? Where do I start?").
