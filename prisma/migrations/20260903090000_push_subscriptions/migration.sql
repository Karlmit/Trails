-- spec-push-notifications: Web Push opt-in ("notify me when a new Blog
-- Post is published") and the once-ever per-post fan-out stamp.
--
-- Grain note: one row per Push Service endpoint (per browser), not per
-- User -- `user_id` is nullable because a Guest reading a PUBLIC Trip's
-- Blog with no account at all may subscribe too. `endpoint` is UNIQUE so a
-- re-subscribing browser upserts its own row instead of accumulating
-- duplicates. See prisma/schema.prisma's PushSubscription comment.

-- CreateTable
CREATE TABLE "push_subscriptions" (
    "id" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "user_id" UUID,
    "locale" "locale" NOT NULL DEFAULT 'sv',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "push_subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "push_subscriptions_endpoint_key" ON "push_subscriptions"("endpoint");

-- CreateIndex
CREATE INDEX "push_subscriptions_user_id_idx" ON "push_subscriptions"("user_id");

-- AddForeignKey
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- Blog-Post-only in practice, exactly like published_at: NULL means
-- "subscribers have never been told about this post". Never cleared once
-- set, so unpublish + re-publish does not re-notify everyone.
ALTER TABLE "timeline_entries" ADD COLUMN "notified_at" TIMESTAMPTZ(6);
