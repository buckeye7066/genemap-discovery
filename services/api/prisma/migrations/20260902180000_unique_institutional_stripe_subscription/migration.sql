-- One Stripe subscription must never control more than one institutional
-- entitlement. PostgreSQL permits multiple NULL values under this constraint,
-- so licenses without Stripe billing remain unaffected.
ALTER TABLE "institutional_licenses"
ADD CONSTRAINT "institutional_licenses_stripe_subscription_id_key"
UNIQUE ("stripe_subscription_id");
