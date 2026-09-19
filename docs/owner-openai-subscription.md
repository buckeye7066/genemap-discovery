# GeneMap Discovery: owner OpenAI subscription routing

The hosted API separates its authenticated owner from customers using the database-verified user ID, email and administrative role. OWNER_AI_USER_ID and OWNER_AI_EMAIL must identify the same owner account. Customer-supplied body flags, email strings and role claims cannot enroll a request.

Owner text requests use a private outward-polling worker on the owner's computer. The official Codex CLI must be signed in with ChatGPT. Its isolated configuration contains the account credential; that credential is not copied to the API server, browser, repository or distribution. The API holds only a per-application worker token, validates job leases and complete responses, and returns actual model/usage provenance.

Server configuration: OWNER_AI_BRIDGE_ENABLED=true, OWNER_AI_USER_ID, OWNER_AI_EMAIL, and a distinct random OWNER_AI_BRIDGE_TOKEN of at least 32 characters. Default configuration is disabled. A missing/offline subscription fails explicitly for an identified owner; it never silently charges the API key. Ordinary users retain existing provider routing and entitlements.

On Windows, tools/owner-ai/manage.ps1 enrolls a private HTTPS app origin, an absolute dedicated Codex home and a bridge token entered through a secure prompt. It stores the bridge token with user-bound DPAPI, protects the local directory, and runs a limited-user task at logon. The task polls only its enrolled app and cancels native inference when its lease or request disappears. No arbitrary user can submit prompts to a worker endpoint; only authenticated owner app workflows enqueue work.

This is a text/JSON transport, not a conversion of a ChatGPT plan into an API credit balance. Hosted provider tools, images and audio are not simulated. Existing publication, content validation, scientific/Scripture rules and consent controls are unchanged. Buffered streaming preserves the existing completion-validation path; it does not claim upstream token-by-token streaming.

Verification: the isolated broker plus official CLI returned a completed genemap-discovery subscription response with provider subscription:codex, billing_mode subscription, model gpt-6-astra and actual usage. This was a local integration proof, not an authenticated production-HTTP receipt. Deployment, exact owner-account enrollment and production verification remain separate release requirements. No test used real user content, published anything or charged a metered API.

Deployment contract: this broker is for one API instance, pinned in the existing Railway deployment file and verified against the current us-west2 deployment. Production enablement additionally requires OWNER_AI_API_REPLICAS=1. Multi-replica scaling requires a shared broker and is not supported by this in-process transport. Leases expire and can be retried once within the original request deadline; stale leases cannot publish a result. Completed result delivery is idempotent. The official app-server reports the actual configured model and preserves server instructions as developer instructions; output token requests are advisory, with hard byte and wall-clock bounds.


## Verified boundary repairs

Owner text explanations and quizzes now send canonical scientific-honesty rules as developer instructions, separately from task text. Customer provider calls keep their existing prompt protection. A failed owner transport retains `OWNER_SUBSCRIPTION_UNAVAILABLE` through sanitized retry handling and cannot become a customer-provider receipt. Successful native customer responses record the configured provider and model even when the provider wrapper omits optional metadata.

Result-delivery retries stop the lease monitor after inference, preserving the original caller/deadline signal instead of treating a completed lease as cancellation. POSIX authentication probes capture official login-status stderr without exposing inference stderr as output. The app-server rejects missing, free, unknown, and explicitly usage-based account plans before starting a turn; only explicitly allowed subscription plan metadata can produce a subscription-labeled response.

The local regression suite covers lost HTTP acknowledgments, exact body retry, scientific instruction priority, safe error identity, customer and owner audit records, lease recovery, and the explicit one-replica production requirement. These tests use synthetic inputs and do not activate accounts, access customer information, or prove a production worker has been enrolled.
