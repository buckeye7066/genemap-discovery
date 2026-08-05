-- Agent mesh: peer awareness / communication / learning between the two LLM
-- personas registered in packages/shared/src/agentRegistry.ts (Robert,
-- Anastasia).
--
-- `agent_messages` is a bounded peer inbox (retention is enforced in
-- services/api/src/services/agentMesh.js: 30 days OR the newest 200 rows,
-- whichever is tighter). `agent_lessons` is the durable teaching store; rows
-- are deduplicated on (author_agent, topic, claim) and re-touched rather than
-- duplicated, so `times_seen` is the frequency signal.
--
-- Deliberately NOT related to "users": both tables carry OPERATIONAL metadata
-- only (agent ids, model names, failure kinds, counts). No user or medical
-- content is ever written here, so there is nothing to cascade on user delete
-- and no backfill to perform — both tables start empty.

-- CreateTable
CREATE TABLE "agent_messages" (
    "id" TEXT NOT NULL,
    "from_agent" TEXT NOT NULL,
    "to_agent" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'note',
    "body" TEXT NOT NULL,
    "metadata" JSONB,
    "read_by" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_lessons" (
    "id" TEXT NOT NULL,
    "author_agent" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "claim" TEXT NOT NULL,
    "evidence" JSONB,
    "times_seen" INTEGER NOT NULL DEFAULT 1,
    "confirmations" JSONB,
    "refutations" JSONB,
    "consumed_by" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_lessons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "agent_messages_to_agent_created_at_idx" ON "agent_messages"("to_agent", "created_at");

-- CreateIndex
CREATE INDEX "agent_lessons_author_agent_topic_idx" ON "agent_lessons"("author_agent", "topic");

-- CreateIndex
CREATE INDEX "agent_lessons_topic_updated_at_idx" ON "agent_lessons"("topic", "updated_at");
