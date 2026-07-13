# Google Play store listing — GeneMap Discovery (`com.genemap.discovery`)

Prepared 2026-07-13. Ready-to-paste copy plus final graphics for the Play
Console store listing. Publisher one-command script:
`app-store-publisher/scripts/genemap-play-listing.mjs` (runs once the app
record exists in Play Console and the service account has app access +
"Manage store presence").

## App details

| Field | Value |
|---|---|
| App name | GeneMap Discovery |
| Default language | en-US |
| Contact email | dr.johnwhite@axiombiolabs.org |
| Contact website | https://genemap-discovery.vercel.app |
| Privacy policy URL | https://genemap-discovery.vercel.app/PrivacyPolicy |
| Category | Education (or Medical) |

## Short description (80 chars max)

```
Learn genetics at your level with AI — quizzes, phenotype-to-gene discovery
```

## Full description (4000 chars max)

```
GeneMap Discovery makes genetics understandable — whatever your level. Choose how you want to learn, from elementary school to postdoc, and every explanation, visual, and activity is tailored to you.

LEARN AT YOUR LEVEL
• Pick a learning level (Elementary → Post-Graduate) and GeneMap adapts the depth of every topic
• Guided learning paths through DNA basics, how genes work, inheritance, mutations, and more
• Topic Explorer: jump into any concept — DNA structure, transcription, Punnett squares, gene regulation
• AI explanations written for the level you chose

TEST YOURSELF
• Generate a 5-question quiz on any topic, or a mixed "surprise me" quiz
• Immediate, level-appropriate feedback

DISCOVER GENES AND PHENOTYPES
• Phenotype → Gene Discovery: search a disease or trait (e.g. "Cystic Fibrosis", "polydactyly") and find associated genes with plain-language explanations
• Data Visualization Hub: add genes (BRCA1, TP53, CFTR…) and compare expression, interactions, and more side by side
• VCF analysis and research tools for advanced users

BUILT FOR HONEST SCIENCE
GeneMap's AI is guided to stay scientifically careful — it explains what is known, flags uncertainty, and does not fabricate clinical claims. GeneMap is an educational and research tool, not a medical diagnosis or treatment service.

Subscriptions for premium features are available on the web.
```

## Graphics (in this folder)

| File | Use | Size |
|---|---|---|
| `icon-512.png` | App icon | 512×512 |
| `feature-graphic.png` | Feature graphic | 1024×500 |
| `06-search.png` … `01-login.png` | Phone screenshots (upload in this order: 06, 02, 05, 04, 07, 01) | 1080×2160 |

Screenshots captured 2026-07-13 from the live production web app (identical UI
to the Capacitor build) at a Pixel-class viewport.

## Data safety form — answers consistent with /PrivacyPolicy

- Collects: email address + name (account management); optional demographic
  info the user chooses to enter; user-generated learning content. Medical/
  genomic data a user chooses to analyze is encrypted at rest
  (MEDICAL_DATA_ENCRYPTION_KEY) and in transit.
- Shares with processors only: OpenAI / Anthropic (AI explanations & quizzes),
  Stripe (web payments only — no in-app purchases), Vercel/Railway (hosting),
  Sentry (error monitoring).
- No ads, no third-party advertising/tracking SDKs, no data sold.
- Payments happen only on the website; the app has no purchase flow (native
  billing gate, PR #82).

## Content rating questionnaire hints

Educational/reference science app. No ads, no gambling, no violence/sexual
content. Health/medical education context — answer the medical/health section
truthfully: it provides genetics education and research tooling, NOT diagnosis
or treatment. Target audience: because learning levels start at "Elementary
School", the app is suitable for a general/teen audience, but do NOT enroll it
in the "Designed for Families" / Teacher-Approved program unless you complete
those extra requirements; simplest path is a 13+ target audience.
