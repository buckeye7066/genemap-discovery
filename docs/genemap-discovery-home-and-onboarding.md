# GeneMap Discovery home and onboarding

The web app now opens with a plain-language home page at `/`.

## Public routes

- `/` — Home page with the Start here action, four destination cards, and the no-upload state.
- `/learn` — Learn genetics placeholder.
- `/explore` — Explore genes & diseases placeholder.
- `/upload` — Upload & interpret preparation placeholder. This page does not upload or process files.
- `/trials` — Research study information placeholder.
- `*` — Friendly page-not-found screen with a clear route home.

## Onboarding preference

The first-visit onboarding overlay stores dismissal in browser localStorage with this key:

`genemap-discovery:onboarding-dismissed`

The stored value records that onboarding was seen, when it was dismissed, and the dismissal method. It stays on the same device and browser only.

## Safety boundary

This build is educational and exploratory only. The new home and placeholder routes do not upload genetic data, process genetic files, provide diagnosis, estimate personal risk, recommend treatment, give medicine guidance, or provide research-study guidance.
