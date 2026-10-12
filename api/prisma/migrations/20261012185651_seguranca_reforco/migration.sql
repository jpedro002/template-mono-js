-- AlterTable
ALTER TABLE "cards" ADD COLUMN     "created_by_id" TEXT;

-- AlterTable
ALTER TABLE "seguranca"."users" ADD COLUMN     "token_version" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "seguranca"."authz_audit" (
    "id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" VARCHAR(64) NOT NULL,
    "target_user_id" TEXT,
    "role_id" TEXT,
    "permission_id" TEXT,
    "before" JSONB,
    "after" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "authz_audit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "authz_audit_target_user_id_idx" ON "seguranca"."authz_audit"("target_user_id");

-- CreateIndex
CREATE INDEX "authz_audit_actor_id_idx" ON "seguranca"."authz_audit"("actor_id");

-- CreateIndex
CREATE INDEX "authz_audit_created_at_idx" ON "seguranca"."authz_audit"("created_at");

-- CreateIndex
CREATE INDEX "cards_created_by_id_idx" ON "cards"("created_by_id");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "seguranca"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
