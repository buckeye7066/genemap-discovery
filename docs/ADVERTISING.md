# Owner-managed advertisements

The signed-in app shell displays published advertisements inline. Each uploaded
image is an independent creative with advertiser, headline, description, HTTPS
link, rotation duration (15/30/custom 5–300 seconds), and start/end dates
(week/two weeks/calendar month/custom). New uploads default to paused. Owner
management supports batches of up to ten images, editing, pausing, resuming, and
removal. Removed images are erased; historical aggregate performance remains.

Only an authenticated, currently unbanned `super_admin` whose immutable user ID
matches the server's `ADVERTISING_OWNER_USER_ID` can manage ads or read statistics.
That value must be pinned to Dr. John White's verified existing account by an
operator. Missing configuration fails closed. Email text, signup order, a
generic admin/super-admin role, client state, and shared-link parameters cannot
grant this capability. The browser receives a boolean capability, never the
configured owner identity. Normal account cookies and CSRF protection apply.

Campaign metadata, re-encoded WebP bytes, and measurements persist in the
application's PostgreSQL database through an additive Prisma migration.
Uploads accept still PNG/JPEG/WebP, at most 2 MB and 4096 × 4096 pixels, with a
16-megapixel decoder limit. The server decodes/re-encodes and strips metadata;
it never fetches a user-provided remote image URL. There are no production
seed advertisements.

An impression is measured only after the image loads and remains at least half
visible in a visible browser tab for one second. Rotation pauses out of view,
in a hidden tab, while the link has focus, or when the reader pauses it. The
server issues expiring signed display tickets, checks the current published
revision and run window, and deduplicates each creative/browser/15-second
window in PostgreSQL. Clicks require a recorded impression and are deduplicated
per display. Owner previews do not count. Periodic advertising requests have
a separate bounded rate-limit budget, including the Redis-outage fallback, so
rotation cannot exhaust education/account access limits. These are application measurements,
not independently verified advertising billing or bot-proof audience estimates.

Unique viewers mean randomly identified browser installations, not people.
Only an application-secret HMAC of that random identifier is stored; clearing
browser storage resets it. No account IDs, emails, IPs, referrers, search terms,
health, genetic, or profile information enters ad selection or measurements.
Reports show lifetime totals, creative totals, and the last 90 UTC days.
Ad links suppress referrers. Ads are hidden when printing and are outside all
research/health export data and report generators.

Sharing the application URL or installer grants no session. Registration
explicitly creates an ordinary `user`, authentication re-reads the current
database account, and installers package assets/code rather than a local
browser profile. Account transitions synchronously clear/cancel the shared
query cache and remount routed pages. Service-worker exclusions include
advertising, account, and administration API paths.

Validation includes owner/guest/ordinary/admin/other-super-admin and malicious
JWT-role API tests, CSRF, raster/link/date validation, foreground rotation,
account-cache cancellation, ticket replay/expiry, and a real PostgreSQL test
for reconnect persistence and concurrent event deduplication. The PostgreSQL
test is included in `test:api:integration`; it runs only with `TEST_DB=postgres`.

Desktop advertiser clicks use a first-party published-creative redirect; no
session token or identity is placed in that URL or passed to the system browser.
The desktop external-host allowlist gains only the existing GeneMap API host.

The existing deployment/update pipelines remain authoritative: Vercel web and
mobile feed, Railway API/migrations, and CI-triggered Windows installer release.
The pre-existing desktop file-origin sign-in limitation remains a separate
transport issue; this feature does not broaden CORS or alter signing.
