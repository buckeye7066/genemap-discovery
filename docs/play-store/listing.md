# Google Play store listing — GeneMap Discovery (`com.genemap.discovery`)

Prepared 2026-08-06. Draft only. Do not submit this listing or run a publisher
until the processor-register release checklist is complete, the exact production
configuration has been reviewed, current screenshots have been recaptured, and
privacy/security counsel has approved the final copy.

## App details

| Field | Value |
|---|---|
| App name | GeneMap Discovery |
| Default language | en-US |
| Contact email | dr.johnwhite@axiombiolabs.org |
| Contact website | https://genemap-discovery.vercel.app |
| Privacy policy URL | https://genemap-discovery.vercel.app/PrivacyPolicy |
| Category | Education |

## Short description (80 chars max)

```
Learn genetics with level-based AI lessons, quizzes, and research leads
```

## Full description (4000 chars max)

```
GeneMap Discovery is a genetics education and exploratory early-research app. Choose an explanation level—from elementary-language foundations through postgraduate detail—and explore reviewed genetics topics with clearly labeled AI assistance.

LEARN AT YOUR LEVEL
• Select a learning level and adjust the depth of explanations
• Follow guided paths through DNA, genes, inheritance, mutation, transcription, and gene regulation
• Explore a finite catalog of reviewed genetics topics
• Read AI-generated explanations with authoritative educational source links

TEST YOURSELF
• Create a five-question quiz on a reviewed genetics topic
• Receive immediate, level-appropriate feedback and track learning progress

EXPLORE CANDIDATE RESEARCH LEADS
• Search reviewed disease or phenotype concepts, or select exact HPO or MONDO identifiers
• Generate clearly labeled AI candidate-gene leads for exploratory follow-up
• Review resolver-backed identifiers from NLM Clinical Tables, Monarch Initiative, and MyGene.info
• Follow links to NCBI Gene, ClinVar, UniProt, and PubMed as starting points for checking underlying records and literature
• Save candidate gene sets and organize exploratory research projects

BUILT FOR HONEST SCIENCE
AI candidate leads are not verified associations. AI relevance scores are not calibrated probabilities, evidence grades, diagnoses, or measures of personal risk. External database links do not automatically support each generated claim; check the underlying record and applicable literature.

PUBLICATION BOUNDARY
The public build does not provide personal medical-record upload, personal VCF analysis, diagnosis, individualized health-risk interpretation, pharmacogenomic recommendations, medication selection, dosing, or treatment advice. GeneMap is not intended for clinical decision-making and is not represented as HIPAA-compliant. Do not submit protected health information, personal medical records, personal genomic files, or patient-identifying information.

Subscriptions for premium features are available on the web.
```

## Graphics (in this folder)

| File | Use | Size |
|---|---|---|
| `icon-512.png` | App icon | 512×512 |
| `feature-graphic.png` | Feature graphic | 1024×500 |
| `06-search.png` … `01-login.png` | Phone screenshots (upload in this order: 06, 02, 05, 04, 07, 01) | 1080×2160 |

The screenshots were captured on 2026-07-13 and predate the current
education/research publication boundary. They have not been verified as identical
to the current Capacitor build. Re-capture and review every screenshot from the
exact release commit before uploading it to Play Console.

## Data safety form — draft; validate before submission

The following is the repository-supported data-flow inventory, not a completed
Play Console declaration. The release owner and counsel must determine how each
flow is classified as “collected” or “shared” under the current Google Play
definitions and exemptions.

- Account/profile data: email, password hash, session data, education level, and
  optional name, phone, age, study/research profile, profile image, and mailing
  preference.
- App activity and user content: searches and selected identifiers, learning and
  quiz progress, activity records, bounded AI task inputs and outputs, gene sets,
  research projects, annotations, and support messages.
- Technical data: IP/device/request metadata, routes or assets requested, audit
  and consent records, exceptions, performance telemetry, and operational logs.
- Vercel is the active web host/CDN and receives web request metadata and logs.
- Railway is the active API/PostgreSQL host and processes application data,
  authentication/session data, research content, search history, projects,
  billing identifiers, logs, and encrypted legacy medical/conversation columns.
- OpenAI API is the default text provider unless Anthropic API is selected by
  deployment configuration. The selected provider receives versioned structured
  education or aggregate early-research inputs, resolved identifiers, generated
  output, and potentially sanitized error-triage details.
- NLM Clinical Tables receives phenotype search text or exact HPO identifiers;
  Monarch Initiative receives disease search text or exact MONDO identifiers;
  MyGene.info receives human-gene symbols and fixed requested fields. These are
  external scientific lookup services, not automatically contracted processors.
- Stripe processes web checkout and subscription identifiers, supplied contact
  fields, subscription status, and webhook identifiers. Full card details remain
  on Stripe-hosted payment surfaces; the native app has no purchase flow.
- Resend may process addresses and service-email content when configured,
  including first-login identity and error-report messages.
- Sentry may process exceptions, application context, routes, and performance
  telemetry when configured.
- A Redis-compatible rate-limit service may process rate-limit keys and counters
  when configured. Its operator is currently unidentified and must be named, or
  `REDIS_URL` removed, before release.
- No advertising or third-party advertising SDK is intended, and personal data
  is not sold. Verify the exact release bundle before submitting these answers.
- The public route graph does not provide medical-record or personal-VCF upload
  or analysis. Free-text project, profile, annotation, and support fields remain,
  so users must be told not to submit medical, genomic, PHI, or patient-identifying
  information.

## Content rating questionnaire hints

Educational/reference science app. No ads, gambling, violence, or sexual
content. Genetics education may discuss diseases in a general academic context,
but the app does not provide diagnosis, personal variant interpretation,
pharmacogenomics, dosing, treatment, or clinical decision support. Treat
“Elementary” as an explanation-complexity setting, not a declaration that the
app targets children. The stated audience is 13+; do not enroll in “Designed for
Families” or Teacher Approved without completing the additional policy,
content, advertising, and privacy requirements.
