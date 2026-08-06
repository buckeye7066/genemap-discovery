# Processor and external-service register

Last code-flow review: **2026-08-06**  
Scope: public education/early-research build plus legacy data that may still be
stored from earlier releases.

This register records what the repository can prove. A vendor policy or DPA URL
does not prove that Axiom Biolabs has executed the agreement, selected a region,
configured retention, disabled training/logging, or completed a security review.
Items marked **not evidenced** are release blockers for any claim that the review
is complete.

## Contracted infrastructure and processors

| Service | Runtime status and role | Data and triggering flow | Region | Retention, deletion, and export | Contract, security, and subprocessor evidence | Account owner / review status |
|---|---|---|---|---|---|---|
| Vercel | Active web host/CDN for the React application | Request IP/device metadata, requested page/static assets, deployment logs. The API session is served from the API origin, not intentionally submitted to Vercel as application content. | Configured project region not evidenced in repo | Project/log retention and deletion settings not evidenced | [DPA](https://vercel.com/legal/dpa); current subprocessor list is referenced from Vercel's security portal. Executed DPA/plan eligibility and BAA status are not evidenced. | Named Axiom owner required; contract/config review pending |
| Railway | Active API and PostgreSQL host | Account/profile data, authentication/session data, research content, search history, projects, billing identifiers, operational logs, and encrypted legacy medical/conversation columns that remain in the database | Configured service/database region not evidenced in repo | Live-data, log, backup, export, and deletion settings not evidenced. Do not rely on an assumed provider backup schedule. | [DPA](https://railway.com/legal/dpa); subprocessors at Railway trust portal. Execution, plan applicability, backup settings, and BAA status not evidenced. | Named Axiom owner required; contract/config/backup review pending |
| OpenAI API | Active default text-generation provider unless deployment selects another provider | Versioned structured education and aggregate early-research task inputs; resolved gene/ontology identifiers; generated output. Error-triage code may also send sanitized error name/message/stack unless removed or disabled. Personal medical/genomic input is forbidden by the publication boundary. | Project processing/residency configuration not evidenced | Project retention controls, abuse-monitoring retention, deletion/export workflow, and opt-in state not evidenced | [DPA](https://openai.com/policies/data-processing-addendum/), [subprocessors](https://openai.com/policies/sub-processor-list/), [API data controls](https://developers.openai.com/api/docs/guides/your-data). Executed DPA and project settings not evidenced. No BAA/clinical authorization evidenced. | Named Axiom owner required; contract and project-setting review pending |
| Anthropic API | Conditional alternate text-generation provider | Same bounded task categories when selected by deployment configuration; error-triage path may use the configured text provider | Routing/residency configuration not evidenced | Account retention, deletion/export support, and training/logging settings not evidenced | Anthropic [commercial data-handling information](https://privacy.anthropic.com/en/articles/7996890-where-are-your-servers-located-do-you-host-your-models-on-eu-servers). Executed DPA, current subprocessor review, and BAA status not evidenced. | Named Axiom owner required; contract and account-setting review pending |
| Stripe | Active billing processor when subscriptions are enabled | Customer/billing identifiers, email/contact fields supplied to checkout or portal, subscription status, webhook event identifiers; full card details are handled by Stripe-hosted payment surfaces | Account and processing regions not evidenced | Stripe-side customer/subscription deletion, export, tax/legal retention, and webhook replay policy not evidenced | Stripe privacy/DPA and subprocessor review must be attached by the owner. PCI status does not establish GeneMap privacy or clinical readiness. | Named billing/privacy owner required; review pending |
| Resend | Conditional transactional/service email processor | Recipient and sender addresses, subject, HTML/text email content. Current code can send first-login identity and error reports to an operator; those flows require minimization and documented purpose. | Primary processing described by vendor as US; actual account choices not evidenced | Email/log retention, suppression lists, deletion/export, and log redaction settings not evidenced | [DPA](https://resend.com/legal/dpa), [subprocessors](https://resend.com/legal/subprocessors). Executed DPA and account settings not evidenced. | Named Axiom owner required; flow minimization and contract review pending |
| Sentry | Conditional error/trace processor when a DSN is configured | Exceptions, stack/context, routes and performance telemetry. `sendDefaultPii: false` reduces automatic PII but does not prove application-supplied messages/context are PII-free. | Selected Sentry data location not evidenced | Event retention, deletion/export, replay, attachment, trace, and AI features not evidenced | [DPA](https://sentry.io/legal/dpa/), [subprocessors](https://sentry.io/legal/subprocessors/). Executed DPA, project scrubbing rules, and BAA status not evidenced. | Named Axiom owner required; project-setting review pending |
| Redis operator | Conditional rate-limit store when `REDIS_URL` is configured | Rate-limit keys/counters and connection/health metadata; exact key fields and TTLs must be verified | Vendor and region unknown | TTL, persistence, backup, deletion, and export unknown | Repository proves only an `ioredis` connection URL. Vendor, DPA, subprocessor list, and security evidence are missing. | Deployment owner must identify the operator before release |

## External scientific lookup services

These endpoints are used as follow-up scientific sources, not as proof that a
material claim is verified. They are not assumed to be contracted processors.
Requests originate from the API, but the query text or identifier can still be
user-linked inside GeneMap and must be disclosed and minimized.

| Service | Active public flow | Data sent | Repository evidence | Review status |
|---|---|---|---|---|
| NLM Clinical Tables (HPO) | Phenotype autocomplete and exact HPO revalidation | Two-to-80-character search text or exact HPO identifier, fixed response fields/count | `services/api/src/services/publicationResolvers.js` | Terms, privacy, logging, retention, rate limit, and attribution review pending |
| Monarch Initiative API | Disease autocomplete and exact MONDO revalidation | Two-to-80-character search text or exact MONDO identifier | `services/api/src/services/publicationResolvers.js` | Terms, privacy, logging, retention, versioning, and attribution review pending |
| MyGene.info | Exact human-gene symbol resolution before bounded generation | Gene symbols and fixed requested record fields | `services/api/src/services/publicationResolvers.js`, `services/api/src/services/genomicDatabases.js` | Terms, privacy, logging, retention, versioning, and attribution review pending |

Google Fonts connection hints were removed from `apps/web/index.html`; the
published web shell should not contact Google Fonts.

## Disabled legacy integrations

`services/api/src/services/genomicDatabases.js` still contains adapters for
MyVariant.info, Ensembl, NCBI/ClinVar, and JAX HPO. The publishable build blocks
the VCF/clinical routes and removes their UI reachability. They must remain
disabled until scientific identity/provenance gates and a privacy/terms review
are complete. Their mere presence in source is not authorization to call them.

## Operator and support access

The admin API contains user/support-management routes, so the public policy must
not say that account data is accessible only to the signed-in user. Authorized
operators may access limited data for support, security, deletion, billing, and
legal obligations. Access must be role-restricted, logged, purpose-limited, and
reviewed. The aggregate analytics endpoint is separately constrained to counts
and allowlisted categories; it does not return raw query text, identities,
medical/conversation records, activity metadata, or retired agent content.

## Release checklist

- [ ] Name an accountable owner for every active/conditional service.
- [ ] Identify the Redis vendor or remove `REDIS_URL` from production.
- [ ] Record exact account/project IDs, selected regions, and data locations.
- [ ] Execute or verify applicable DPAs and document plan eligibility.
- [ ] Review each current subprocessor list and subscribe to change notices.
- [ ] Record retention, deletion, export, logging, training, and support-access settings.
- [ ] Verify processor deletion propagation with test evidence.
- [ ] Verify backups, logs, email, error telemetry, and billing exceptions in the deletion manifest.
- [ ] Obtain counsel/security-owner approval for the public policy and data map.
- [ ] Keep HIPAA, BAA, medical-device, clinical-readiness, and similar claims out of public copy unless independently evidenced for the exact production configuration.

Until every applicable item is evidenced, report the processor/subprocessor
review as **incomplete** and do not mark the bridge-plan privacy gate complete.
