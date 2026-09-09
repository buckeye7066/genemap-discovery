CREATE TABLE "ad_creatives" (
 "id" TEXT NOT NULL PRIMARY KEY, "advertiser" TEXT NOT NULL, "headline" TEXT NOT NULL,
 "body" TEXT NOT NULL, "target_url" TEXT NOT NULL, "seconds" INTEGER NOT NULL,
 "starts_at" TIMESTAMP(3) NOT NULL, "ends_at" TIMESTAMP(3) NOT NULL,
 "paused" BOOLEAN NOT NULL DEFAULT true, "revision" INTEGER NOT NULL DEFAULT 1,
 "image" BYTEA NOT NULL, "deleted_at" TIMESTAMP(3),
 "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "ad_schedule" CHECK (ends_at > starts_at AND seconds BETWEEN 5 AND 300)
);
CREATE INDEX "ad_creatives_paused_starts_at_ends_at_idx" ON "ad_creatives"("paused", "starts_at", "ends_at");
CREATE TABLE "ad_events" (
 "id" TEXT NOT NULL PRIMARY KEY, "creative_id" TEXT NOT NULL REFERENCES "ad_creatives"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "viewer" TEXT NOT NULL, "display_key" TEXT NOT NULL, "kind" TEXT NOT NULL CHECK (kind IN ('impression', 'click')),
 "day" TEXT NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ad_events_display_key_kind_key" ON "ad_events"("display_key", "kind");
CREATE INDEX "ad_events_creative_id_day_idx" ON "ad_events"("creative_id", "day");
CREATE INDEX "ad_events_created_at_idx" ON "ad_events"("created_at");
