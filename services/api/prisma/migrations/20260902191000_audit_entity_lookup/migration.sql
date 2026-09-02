-- Checkout deduplication resolves the current organization-scoped receipt
-- while holding a transaction advisory lock. Index that exact lookup so the
-- lock is held only for the small Stripe verification window.
CREATE INDEX "audit_log_entity_type_entity_id_created_at_idx"
  ON "audit_log"("entity_type", "entity_id", "created_at");
